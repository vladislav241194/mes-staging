import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  GANTT_DEPENDENCY_STATE_CLASSES,
  GANTT_SLOT_STATE_CLASSES,
  GANTT_UI_OVERLAY_COMPONENTS,
  GANTT_UI_REQUIRED_DATA_ATTRIBUTES,
  GANTT_UI_REQUIRED_SELECTORS,
  GANTT_UI_REQUIRED_TOKENS,
  GANTT_UI_SCALE_MODES,
  GANTT_UI_SPECIAL_RUNTIME_ZONES,
  GANTT_UI_VIEWPORTS,
} from "../src/gantt_ui_contracts.js";

const baseUrl = process.env.MES_QA_URL || "http://localhost:4174/";
const stateStorageKey = "mes-planning-prototype-state-v2";
const uiStorageKey = "mes-planning-prototype-ui-v1";
const sharedDisabledKey = "mes-planning-prototype-shared-disabled-until-v1";
const overflowThreshold = 16;
const defaultOptionalDataAttributes = new Set([
  "data-gantt-optimize-select",
  "data-dependency-edit-route",
  "data-dependency-segment-index",
  "data-dependency-orientation",
  "data-dependency-start-index",
  "data-dependency-end-index",
  "data-dependency-start-base-x",
  "data-dependency-start-base-y",
  "data-dependency-end-base-x",
  "data-dependency-end-base-y",
  "data-dependency-start-current-x",
  "data-dependency-start-current-y",
  "data-dependency-end-current-x",
  "data-dependency-end-current-y",
  "data-close-drawer",
  "data-close-modal",
]);

const reportPaths = {
  runtimeMapJson: "reports/gantt-runtime-map.json",
  domContractJson: "reports/gantt-dom-contract.json",
  geometryJson: "reports/gantt-geometry-invariants.json",
  tokenUsageJson: "reports/gantt-token-usage.json",
  slotContractJson: "reports/gantt-slot-contract.json",
  dependencyContractJson: "reports/gantt-dependency-contract.json",
  overlayJson: "reports/gantt-overlay-regression.json",
  scaleJson: "reports/gantt-scale-regression.json",
  combinedJson: "reports/gantt-phase-5-regression.json",
  geometryMd: "docs/gantt-geometry-invariants-report.md",
  scaleMd: "docs/gantt-scale-regression-report.md",
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findChrome() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new Error("Chrome/Chromium executable was not found in /Applications.");
}

async function getFreePort() {
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForJson(url, options = {}, timeoutMs = 10000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return await response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await delay(120);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.onMessage(event));
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    if (!message.id || !this.pending.has(message.id)) return;
    const { resolve, reject } = this.pending.get(message.id);
    this.pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
    else resolve(message.result || {});
  }

  async send(method, params = {}, timeoutMs = 15000) {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, pageFunction, arg) {
  const source = typeof pageFunction === "function" ? pageFunction.toString() : pageFunction;
  const expression = arg === undefined ? `(${source})()` : `(${source})(${JSON.stringify(arg)})`;
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, 60000);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

async function launchChrome() {
  const chromePath = await findChrome();
  const port = await getFreePort();
  const profileDir = await mkdtemp(join(tmpdir(), "mes-gantt-phase-5-"));
  const child = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ], { stdio: "ignore" });
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const target = await waitForJson(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    return { child, client: new CdpClient(target.webSocketDebuggerUrl), profileDir };
  } catch (error) {
    child.kill("SIGTERM");
    await rm(profileDir, { recursive: true, force: true });
    throw error;
  }
}

async function cleanupChrome(chrome) {
  try {
    chrome.client.close();
  } catch {
    // Browser may already be closed.
  }
  if (chrome.child.exitCode === null && !chrome.child.killed) chrome.child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (chrome.child.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, 1200);
    chrome.child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await rm(chrome.profileDir, { recursive: true, force: true }).catch(() => {});
}

async function getBootstrapSnapshotStorageSeed() {
  const raw = await readFile("bootstrap-snapshot.json", "utf8");
  const snapshot = JSON.parse(raw);
  return snapshot.values && typeof snapshot.values === "object" ? snapshot.values : {};
}

function getExpandedRouteIdsFromStorageSeed(seed = {}) {
  try {
    const state = JSON.parse(seed["mes-planning-prototype-state-v2"] || "{}");
    const routeIds = (state.routes || []).map((route) => route.id).filter(Boolean);
    const productionIds = (state.routes || []).map((route) => route.productionId || route.projectId || route.specificationId).filter(Boolean);
    return [...new Set([...routeIds, ...productionIds])];
  } catch {
    return [];
  }
}

function moduleUrl() {
  const url = new URL(baseUrl);
  url.searchParams.set("module", "gantt");
  url.searchParams.set("qa-auth-bypass", "1");
  url.searchParams.set("qa", "gantt-phase-5");
  return url.toString();
}

function buildGanttFixtureStorageSeed(storageSeed = {}) {
  const state = JSON.parse(storageSeed[stateStorageKey] || "{}");
  const workCenterId = state.workCenters?.[0]?.id || "D1";
  const routeId = "qa-gantt-regression-route";
  const stepId = "qa-gantt-regression-step";
  const nextStepId = "qa-gantt-regression-step-2";
  const slotId = "qa-gantt-regression-slot";
  const nextSlotId = "qa-gantt-regression-slot-2";
  const specificationId = "qa-gantt-regression-specification";
  const now = new Date();
  now.setHours(8, 0, 0, 0);
  const end = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const nextEnd = new Date(end.getTime() + 4 * 60 * 60 * 1000);
  const operation = { routeStepId: stepId, operationId: "D1_OP3", operationName: "QA-операция Gantt", workCenterId, nextWorkCenterId: workCenterId, labor: { mode: "unit", minutesPerUnit: 1 } };
  const nextOperation = { routeStepId: nextStepId, operationId: "D1_OP3", operationName: "QA-контроль Gantt", workCenterId, nextWorkCenterId: workCenterId, labor: { mode: "unit", minutesPerUnit: 1 } };
  state.routes = [{ id: routeId, name: "Маршрутная карта · QA Gantt", designation: "QA.GANTT.003", specificationId, specificationName: "QA: Gantt regression", projectId: specificationId, routeDocumentKind: "main", rootRouteId: routeId, isDefault: true, sourceSpecifications2EntryId: specificationId, sourceSpecifications2RouteDraftId: "qa-gantt-regression-draft", revision: 1, planningQuantity: 1000, planningStatus: "scheduled", lifecycleStatus: "released", unit: "шт.", planningLaborByStepId: { [stepId]: { mode: "unit", minutesPerUnit: 1 }, [nextStepId]: { mode: "unit", minutesPerUnit: 1 } }, createdAt: now.toISOString(), updatedAt: now.toISOString(), documentRevisionSnapshot: { source: "specifications2", specificationEntryId: specificationId, specificationId, specificationRevision: 1, routeDraftId: "qa-gantt-regression-draft", routeRevision: 1, releasedAt: now.toISOString(), product: { designation: "QA.GANTT.003", name: "QA Gantt" }, operations: [operation, nextOperation] }, workOrderSnapshot: { id: "qa-gantt-regression-work-order-r1", source: "specifications2", specificationId, specificationRevision: 1, routeId, routeRevision: 1, quantity: 1000, operationRevisions: [operation, nextOperation] } }];
  state.routeSteps = [{ id: stepId, routeId, stepOrder: 1, operationId: operation.operationId, operationName: operation.operationName, workCenterId, departmentId: workCenterId, nextWorkCenterId: workCenterId, nextOperationId: nextOperation.operationId, statusBefore: "К сборке", statusAfter: "Собрано", isRequired: true, quantityMultiplier: 1, calculationType: "normative", fulfillmentMode: "produce", operationInputs: [{ label: "К сборке" }], operationOutputs: [{ label: "Собрано" }], sourceSpecifications2OperationId: "qa-gantt-regression-operation", normRevisionId: "", unit: "шт." }, { id: nextStepId, routeId, stepOrder: 2, operationId: nextOperation.operationId, operationName: nextOperation.operationName, workCenterId, departmentId: workCenterId, nextWorkCenterId: workCenterId, nextOperationId: "", statusBefore: "Собрано", statusAfter: "Проверено", isRequired: true, quantityMultiplier: 1, calculationType: "normative", fulfillmentMode: "produce", operationInputs: [{ label: "Собрано" }], operationOutputs: [{ label: "Проверено" }], sourceSpecifications2OperationId: "qa-gantt-regression-operation-2", normRevisionId: "", unit: "шт." }];
  state.slots = [{ id: slotId, routeId, routeStepId: stepId, planningOrderId: routeId, specificationId, routeWorkCenterId: workCenterId, workCenterId, operationId: operation.operationId, operationName: operation.operationName, quantity: 1000, unit: "шт.", plannedStart: now.toISOString(), plannedEnd: end.toISOString(), status: "planned", sourceSpecifications2EntryId: specificationId, specificationRevision: 1, routeRevision: 1, workOrderSnapshotId: "qa-gantt-regression-work-order-r1", actualStart: "", actualEnd: "" }, { id: nextSlotId, routeId, routeStepId: nextStepId, planningOrderId: routeId, specificationId, routeWorkCenterId: workCenterId, workCenterId, operationId: nextOperation.operationId, operationName: nextOperation.operationName, quantity: 1000, unit: "шт.", plannedStart: end.toISOString(), plannedEnd: nextEnd.toISOString(), status: "planned", sourceSpecifications2EntryId: specificationId, specificationRevision: 1, routeRevision: 1, workOrderSnapshotId: "qa-gantt-regression-work-order-r1", actualStart: "", actualEnd: "" }];
  state.shiftMasterAssignments = {};
  state.dispatchFacts = {};
  state.planningCorrections = {};
  return { ...storageSeed, [stateStorageKey]: JSON.stringify(state) };
}

async function seedGanttState(client, bootstrapSnapshotStorageSeed, expandedProjects, scale = "days") {
  const origin = new URL(moduleUrl()).origin;
  const bootstrapSnapshotUi = JSON.parse(bootstrapSnapshotStorageSeed[uiStorageKey] || "{}");
  await client.send("Page.navigate", { url: new URL("/app-version.json", origin).toString() });
  await delay(160);
  await client.send("DOMStorage.enable");
  const storageId = { securityOrigin: origin, isLocalStorage: true };
  const sessionStorageId = { securityOrigin: origin, isLocalStorage: false };
  const values = [
    [stateStorageKey, bootstrapSnapshotStorageSeed[stateStorageKey]],
    [uiStorageKey, JSON.stringify({ ...bootstrapSnapshotUi, activeModule: "gantt", scale, ganttZoom: scale === "hours" ? 8 : 1, ganttShowQuantity: true, expandedProjects, ganttDependencyEditMode: false, ganttOptimizationDialog: null, editor: null, selectedSlotId: null })],
    ["mes-specifications-2-registry-v1", '{"entries":[]}'],
  ];
  for (const [key, value] of values) await client.send("DOMStorage.setDOMStorageItem", { storageId, key, value });
  await client.send("DOMStorage.setDOMStorageItem", { storageId: sessionStorageId, key: sharedDisabledKey, value: String(Date.now() + 5 * 60 * 1000) });
}

async function waitForGantt(client) {
  const startedAt = Date.now();
  let expandClicked = false;
  while (Date.now() - startedAt < 45000) {
    const state = await evaluate(client, (clicked) => {
      const shellReady = document.querySelector("main.app-shell")?.dataset.layoutPage === "gantt"
        && Boolean(document.querySelector("[data-gantt-shell]"));
      const nonAggregate = document.querySelectorAll(".operation-slot[data-slot-id]:not(.aggregate-slot)").length;
      const aggregate = document.querySelectorAll(".operation-slot.aggregate-slot").length;
      const toggle = document.querySelector("[data-toggle-all-projects]");
      const toggleText = toggle?.textContent?.trim().replace(/\s+/g, " ") || "";
      if (shellReady && !nonAggregate && aggregate && toggle && !clicked && /Развернуть/.test(toggleText)) {
        toggle.click();
        return { shellReady, nonAggregate, aggregate, expandClicked: true, toggleText };
      }
      return { shellReady, nonAggregate, aggregate, expandClicked: false, toggleText };
    }, expandClicked);
    if (state.expandClicked) expandClicked = true;
    if (state.shellReady && state.nonAggregate > 0) return;
    await delay(120);
  }
  const diagnostic = await evaluate(client, () => ({
    href: location.href,
    shellPage: document.querySelector("main.app-shell")?.dataset.layoutPage || "",
    bodyText: document.body.innerText.trim().replace(/\s+/g, " ").slice(0, 320),
    operationSlots: document.querySelectorAll(".operation-slot").length,
    nonAggregateSlots: document.querySelectorAll(".operation-slot[data-slot-id]:not(.aggregate-slot)").length,
    appError: document.querySelector(".app-error, .startup-error")?.textContent?.trim().replace(/\s+/g, " ") || "",
  }));
  throw new Error(`Gantt runtime did not render shell and operation slots. ${JSON.stringify(diagnostic)}`);
}

function addFailure(target, condition, message) {
  if (!condition) target.push(message);
}

async function setViewport(client, viewport) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.category === "narrow",
  });
}

async function switchScale(client, scale) {
  await evaluate(client, (nextScale) => {
    const button = document.querySelector(`[data-scale="${CSS.escape(nextScale)}"]`);
    if (button) button.click();
  }, scale);
  await delay(220);
  await waitForGantt(client);
}

async function checkGanttToolbarStability(client, viewport) {
  const report = await evaluate(client, async () => {
    const samples = [];
    let previousButton = null;
    let replacements = 0;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 1800) {
      const button = document.querySelector('button[data-gantt-zoom="reset"]');
      if (button && previousButton && button !== previousButton) replacements += 1;
      previousButton = button;
      samples.push({
        text: button?.textContent?.trim() || "",
        width: Math.round(button?.getBoundingClientRect().width || 0),
      });
      await new Promise((resolve) => setTimeout(resolve, 240));
    }
    return { replacements, samples };
  });
  const failures = [];
  addFailure(failures, report.replacements === 0, `Gantt zoom reset button was replaced ${report.replacements} times during stability window`);
  addFailure(failures, report.samples.every((sample) => /^\d+%$/.test(sample.text) && sample.width > 0), "Gantt zoom reset button lost visible value or bounds during stability window");
  return {
    viewport,
    status: failures.length ? "fail" : "pass",
    failures,
    replacements: report.replacements,
  };
}

async function collectGanttDom(client, viewport, scale) {
  return evaluate(client, (payload) => {
    const round = (value) => Math.round(Number(value || 0) * 10) / 10;
    const rectOf = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect ? {
        x: round(rect.x),
        y: round(rect.y),
        left: round(rect.left),
        top: round(rect.top),
        width: round(rect.width),
        height: round(rect.height),
        right: round(rect.right),
        bottom: round(rect.bottom),
      } : null;
    };
    const styleKeys = (element) => String(element?.getAttribute("style") || "")
      .split(";")
      .map((part) => part.trim().split(":")[0]?.trim())
      .filter(Boolean);
    const numberStyle = (element, name) => {
      const value = String(element?.style?.getPropertyValue(name) || element?.style?.[name] || "").trim();
      const numeric = Number(value.replace("px", ""));
      return Number.isFinite(numeric) ? numeric : null;
    };
    const shell = document.querySelector("[data-gantt-shell]");
    const canvas = document.querySelector(".gantt-canvas[data-ui-component='GanttCanvas']");
    const timeline = document.querySelector(".timeline-row[data-ui-component='GanttTimeline']");
    const rowsLayer = document.querySelector(".rows-layer[data-ui-component='GanttRowsLayer']");
    const dependencyLayer = document.querySelector(".dependencies-layer[data-ui-component='GanttDependencyLayer']");
    const slots = [...document.querySelectorAll(".operation-slot[data-ui-component='GanttSlot']")];
    const rows = [...document.querySelectorAll(".gantt-row[data-row-id]")];
    const rowLabels = [...document.querySelectorAll(".row-label")];
    const nonWorkingZones = [...document.querySelectorAll("[data-ui-component='GanttNonWorkingZone']")];
    const dependencyPaths = [...document.querySelectorAll("[data-ui-component='GanttDependencyPath']")];
    const dependencyArrows = [...document.querySelectorAll("[data-ui-component='GanttDependencyArrow']")];
    const dependencyMasks = [...document.querySelectorAll("[data-ui-component='GanttDependencySlotMask']")];
    const dependencyMaskRects = [...document.querySelectorAll("[data-ui-component='GanttDependencySlotMaskRect']")];
    const toolbarRoot = document.querySelector(".planner-workspace-gantt-only > .topbar[data-ui-component='GanttToolbar']");
    const toolbarActions = toolbarRoot?.querySelector(".toolbar-actions");
    const zoomGroup = toolbarRoot?.querySelector(".toolbar-grid > .gantt-zoom-control");
    const zoomButtons = zoomGroup ? [...zoomGroup.children] : [];
    const zoomRect = rectOf(zoomGroup);
    const zoomButtonReports = zoomButtons.map((button) => {
      const rect = rectOf(button);
      const svgRect = rectOf(button.querySelector("svg"));
      return {
        action: button.getAttribute("data-gantt-zoom") || "",
        text: button.textContent.trim().replace(/\s+/g, " "),
        rect,
        svgRect,
        visible: Boolean(rect?.width && rect?.height) && getComputedStyle(button).display !== "none",
        insideGroup: Boolean(rect && zoomRect)
          && rect.left >= zoomRect.left - 1
          && rect.right <= zoomRect.right + 1
          && rect.top >= zoomRect.top - 1
          && rect.bottom <= zoomRect.bottom + 1,
      };
    });
    const zoomTops = zoomButtonReports.map((item) => item.rect?.top).filter(Number.isFinite);
    const zoomBottoms = zoomButtonReports.map((item) => item.rect?.bottom).filter(Number.isFinite);
    const peerHeights = [
      toolbarRoot?.querySelector(".toolbar-grid > .field.compact"),
      toolbarRoot?.querySelector(".toolbar-grid > .segmented"),
    ].map((element) => rectOf(element)?.height).filter(Number.isFinite);
    const toolbarClock = toolbarRoot?.querySelector("[data-gantt-toolbar-clock]");
    const clockRect = rectOf(toolbarClock);
    const optimizeRect = rectOf(toolbarRoot?.querySelector("#optimizePlanButton"));
    const requiredSelectors = payload.requiredSelectors.map((selector) => ({
      selector,
      count: document.querySelectorAll(selector).length,
    }));
    const requiredDataAttributes = payload.requiredDataAttributes.map((attribute) => ({
      attribute,
      count: document.querySelectorAll(`[${attribute}]`).length,
    }));
    const slotReports = slots.slice(0, 32).map((slot) => ({
      id: slot.getAttribute("data-slot-id") || "",
      component: slot.getAttribute("data-ui-component") || "",
      rowId: slot.closest(".gantt-row")?.getAttribute("data-row-id") || "",
      className: String(slot.className || ""),
      text: slot.textContent.trim().replace(/\s+/g, " ").slice(0, 80),
      rect: rectOf(slot),
      styleKeys: styleKeys(slot),
      styleLeft: numberStyle(slot, "left"),
      styleTop: numberStyle(slot, "top"),
      styleWidth: numberStyle(slot, "width"),
      styleHeight: numberStyle(slot, "height"),
      resizeHandles: slot.querySelectorAll("[data-ui-component='GanttResizeHandle'][data-resize-slot]").length,
      operationalSegments: slot.querySelectorAll("[data-ui-component='GanttOperationalSegment']").length,
      workingSegments: slot.querySelectorAll("[data-ui-component='GanttWorkingSegment']").length,
      nonWorkingSegments: slot.querySelectorAll("[data-ui-component='GanttNonWorkingSegment']").length,
    }));
    const rowReports = rows.slice(0, 32).map((row) => ({
      id: row.getAttribute("data-row-id") || "",
      className: String(row.className || ""),
      rect: rectOf(row),
      styleTop: numberStyle(row, "top"),
      styleHeight: numberStyle(row, "height"),
      label: Boolean(row.querySelector(".row-label")),
      lane: Boolean(row.querySelector(".lane[data-lane-row-id]")),
    }));
    const overlayRoots = [...document.querySelectorAll(".modal-backdrop, .ui-modal, .ui-drawer, [data-modal-backdrop]")].map((overlay) => ({
      selector: overlay.id ? `#${overlay.id}` : `${overlay.tagName.toLowerCase()}.${String(overlay.className || "").trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".")}`,
      component: overlay.getAttribute("data-ui-component") || "",
      ganttOverlay: overlay.getAttribute("data-gantt-overlay") || "",
      rect: rectOf(overlay),
      closeActions: overlay.querySelectorAll("[data-close-modal], [data-close-drawer], [aria-label*='Закрыть']").length,
      bodyCount: overlay.querySelectorAll("form, section, .ui-drawer-body, .ui-modal-body").length,
    }));
    const activeScale = [...document.querySelectorAll("[data-scale]")]
      .find((button) => button.classList.contains("is-active"))
      ?.getAttribute("data-scale") || "";
    return {
      viewport: payload.viewport,
      scale: payload.scale,
      activeScale,
      layoutPage: document.querySelector("main.app-shell")?.dataset.layoutPage || "",
      bodyOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      shell: {
        present: Boolean(shell),
        component: shell?.getAttribute("data-ui-component") || "",
        runtime: shell?.getAttribute("data-ui-runtime") || "",
        rect: rectOf(shell),
        scrollWidth: shell?.scrollWidth || 0,
        scrollHeight: shell?.scrollHeight || 0,
        clientWidth: shell?.clientWidth || 0,
        clientHeight: shell?.clientHeight || 0,
      },
      canvas: {
        present: Boolean(canvas),
        rect: rectOf(canvas),
        styleKeys: styleKeys(canvas),
      },
      toolbar: {
        present: Boolean(toolbarRoot),
        actionButtons: document.querySelectorAll(".topbar .ui-action-button, [data-ui-component='GanttToolbar'] .ui-action-button").length,
        scaleControls: document.querySelectorAll("[data-scale]").length,
        zoomControls: document.querySelectorAll("[data-gantt-zoom]").length,
        optimizeControls: document.querySelectorAll("#optimizePlanButton").length,
        statusStrips: toolbarRoot?.querySelectorAll(".status-strip").length || 0,
        statusTokens: toolbarRoot?.querySelectorAll("[data-ui-component='StatusToken']").length || 0,
        clock: {
          count: toolbarRoot?.querySelectorAll("[data-gantt-toolbar-clock]").length || 0,
          component: toolbarClock?.getAttribute("data-ui-component") || "",
          directActionChild: Boolean(toolbarClock && toolbarClock.parentElement === toolbarActions),
          visible: Boolean(clockRect?.width && clockRect?.height) && getComputedStyle(toolbarClock || document.documentElement).display !== "none",
          rect: clockRect,
          optimizeCenterDelta: clockRect && optimizeRect
            ? round(Math.abs((clockRect.top + clockRect.height / 2) - (optimizeRect.top + optimizeRect.height / 2)))
            : null,
        },
        zoom: {
          count: toolbarRoot?.querySelectorAll(".toolbar-grid > .gantt-zoom-control").length || 0,
          display: zoomGroup ? getComputedStyle(zoomGroup).display : "",
          rect: zoomRect,
          scrollWidth: zoomGroup?.scrollWidth || 0,
          clientWidth: zoomGroup?.clientWidth || 0,
          scrollHeight: zoomGroup?.scrollHeight || 0,
          clientHeight: zoomGroup?.clientHeight || 0,
          actions: zoomButtonReports.map((item) => item.action),
          buttons: zoomButtonReports,
          sameRow: zoomTops.length === 3 && zoomBottoms.length === 3
            && Math.max(...zoomTops) - Math.min(...zoomTops) <= 2
            && Math.max(...zoomBottoms) - Math.min(...zoomBottoms) <= 2,
          orderedWithoutOverlap: zoomButtonReports.length === 3
            && zoomButtonReports.every((item, index) => index === 0 || zoomButtonReports[index - 1].rect.right <= item.rect.left + 1),
          peerHeightDelta: zoomRect && peerHeights.length === 2
            ? Math.max(...peerHeights.map((height) => Math.abs(height - zoomRect.height)))
            : null,
        },
      },
      timeline: {
        present: Boolean(timeline),
        rect: rectOf(timeline),
        cellCount: document.querySelectorAll(".timeline-cell").length,
        weekGroups: document.querySelectorAll(".timeline-week-group").length,
        closestShell: timeline?.closest("[data-gantt-shell]") === shell,
      },
      rowsLayer: {
        present: Boolean(rowsLayer),
        rect: rectOf(rowsLayer),
        styleKeys: styleKeys(rowsLayer),
        closestShell: rowsLayer?.closest("[data-gantt-shell]") === shell,
      },
      rows: rowReports,
      rowLabels: rowLabels.length,
      slots: slotReports,
      slotCount: slots.length,
      nonAggregateSlotCount: document.querySelectorAll(".operation-slot[data-slot-id]:not(.aggregate-slot)").length,
      resizeHandleCount: document.querySelectorAll("[data-ui-component='GanttResizeHandle'][data-resize-slot]").length,
      nonWorking: {
        layerCount: document.querySelectorAll("[data-ui-component='GanttNonWorkingLayer']").length,
        zoneCount: nonWorkingZones.length,
        zoneTotalWidth: Math.round(nonWorkingZones.reduce((sum, zone) => sum + zone.getBoundingClientRect().width, 0)),
      },
      dependency: {
        layerPresent: Boolean(dependencyLayer),
        layerRect: rectOf(dependencyLayer),
        pathCount: dependencyPaths.length,
        pathWithoutD: dependencyPaths.filter((path) => !path.getAttribute("d")).length,
        pathWithoutMarker: dependencyPaths.filter((path) => !path.getAttribute("marker-end")).length,
        pathWithoutMask: dependencyMaskRects.length ? dependencyPaths.filter((path) => !path.getAttribute("mask")).length : 0,
        arrowCount: dependencyArrows.length,
        maskCount: dependencyMasks.length,
        maskRectCount: dependencyMaskRects.length,
        editControls: document.querySelectorAll("[data-dependency-edit-route]").length,
      },
      overlays: overlayRoots,
      requiredSelectors,
      requiredDataAttributes,
    };
  }, {
    viewport,
    scale,
    requiredSelectors: GANTT_UI_REQUIRED_SELECTORS,
    requiredDataAttributes: GANTT_UI_REQUIRED_DATA_ATTRIBUTES,
  });
}

function validateDomReport(report) {
  const failures = [];
  const warnings = [];
  addFailure(failures, report.layoutPage === "gantt", "layout page is not gantt");
  addFailure(failures, report.shell.present && report.shell.component === "GanttRuntime", "GanttRuntime shell missing");
  addFailure(failures, report.canvas.present && report.canvas.rect?.width > 0 && report.canvas.rect?.height > 0, "Gantt canvas has empty bounds");
  addFailure(failures, report.toolbar.present, "GanttToolbar marker missing");
  addFailure(failures, report.toolbar.scaleControls >= 3, "scale controls missing");
  addFailure(failures, report.toolbar.zoomControls >= 3, "zoom controls missing");
  addFailure(failures, report.toolbar.statusStrips === 0, `obsolete Gantt status strip count: ${report.toolbar.statusStrips}`);
  addFailure(failures, report.toolbar.statusTokens === 0, `obsolete Gantt toolbar status token count: ${report.toolbar.statusTokens}`);
  addFailure(failures, report.toolbar.clock.count === 1, `Gantt toolbar clock count: ${report.toolbar.clock.count}`);
  addFailure(failures, report.toolbar.clock.component === "GanttClock", "Gantt toolbar clock lost GanttClock marker");
  addFailure(failures, report.toolbar.clock.directActionChild, "Gantt toolbar clock is not a direct toolbar-actions child");
  if (report.viewport.category !== "narrow") {
    addFailure(failures, report.toolbar.clock.visible, "Gantt toolbar clock is not visible outside narrow layout");
    addFailure(failures, report.toolbar.clock.optimizeCenterDelta !== null && report.toolbar.clock.optimizeCenterDelta <= 2, `Gantt toolbar clock dropped below actions by ${report.toolbar.clock.optimizeCenterDelta}px`);
  }
  addFailure(failures, report.toolbar.zoom.count === 1, `Gantt zoom group count: ${report.toolbar.zoom.count}`);
  addFailure(failures, report.toolbar.zoom.display === "grid", `Gantt zoom group display is ${report.toolbar.zoom.display || "missing"}`);
  addFailure(failures, JSON.stringify(report.toolbar.zoom.actions) === JSON.stringify(["out", "reset", "in"]), `Gantt zoom action order: ${report.toolbar.zoom.actions.join(",")}`);
  addFailure(failures, report.toolbar.zoom.buttons.length === 3 && report.toolbar.zoom.buttons.every((button) => button.visible), "Gantt zoom buttons are not all visible");
  addFailure(failures, report.toolbar.zoom.buttons.length === 3 && report.toolbar.zoom.buttons.every((button) => button.insideGroup), "Gantt zoom buttons escape their group");
  addFailure(failures, report.toolbar.zoom.sameRow, "Gantt zoom buttons are not on one row");
  addFailure(failures, report.toolbar.zoom.orderedWithoutOverlap, "Gantt zoom buttons overlap or are out of order");
  addFailure(failures, report.toolbar.zoom.scrollWidth <= report.toolbar.zoom.clientWidth + 1, `Gantt zoom horizontal overflow ${report.toolbar.zoom.scrollWidth - report.toolbar.zoom.clientWidth}px`);
  addFailure(failures, report.toolbar.zoom.scrollHeight <= report.toolbar.zoom.clientHeight + 1, `Gantt zoom vertical overflow ${report.toolbar.zoom.scrollHeight - report.toolbar.zoom.clientHeight}px`);
  addFailure(failures, report.toolbar.zoom.peerHeightDelta !== null && report.toolbar.zoom.peerHeightDelta <= 2, `Gantt zoom height differs from neighboring controls by ${report.toolbar.zoom.peerHeightDelta}px`);
  const resetZoomButton = report.toolbar.zoom.buttons.find((button) => button.action === "reset");
  const iconZoomButtons = report.toolbar.zoom.buttons.filter((button) => button.action !== "reset");
  addFailure(failures, Boolean(resetZoomButton && /^\d+%$/.test(resetZoomButton.text)), `Gantt zoom reset value is ${resetZoomButton?.text || "missing"}`);
  addFailure(failures, iconZoomButtons.length === 2 && iconZoomButtons.every((button) => button.svgRect?.width > 0 && button.svgRect?.height > 0), "Gantt zoom +/- icons have empty bounds");
  addFailure(failures, report.timeline.present && report.timeline.rect?.width > 0 && report.timeline.rect?.height > 0, "timeline has empty bounds");
  addFailure(failures, report.timeline.closestShell, "timeline is outside Gantt shell");
  addFailure(failures, report.rowsLayer.present && report.rowsLayer.closestShell, "rows layer missing or outside shell");
  addFailure(failures, report.rows.length > 0, "Gantt rows missing");
  addFailure(failures, report.rowLabels > 0, "row labels missing");
  addFailure(failures, report.slotCount > 0, "operation slots missing");
  addFailure(failures, report.nonAggregateSlotCount > 0, "non-aggregate operation slots missing");
  const requiresResizeHandles = report.scale !== "weeks";
  addFailure(failures, !requiresResizeHandles || report.resizeHandleCount > 0, "resize handles missing");
  addFailure(failures, report.dependency.layerPresent, "dependency layer missing");
  addFailure(failures, report.dependency.layerRect?.width > 0 && report.dependency.layerRect?.height > 0, "dependency layer has empty bounds");
  addFailure(failures, report.dependency.pathCount > 0, "dependency paths missing");
  addFailure(failures, report.dependency.pathWithoutD === 0, `dependency paths without d: ${report.dependency.pathWithoutD}`);
  addFailure(failures, report.dependency.pathWithoutMarker === 0, `dependency paths without marker: ${report.dependency.pathWithoutMarker}`);
  addFailure(failures, report.dependency.pathWithoutMask === 0, `dependency paths without slot mask: ${report.dependency.pathWithoutMask}`);
  addFailure(failures, report.dependency.arrowCount >= 6, "dependency marker arrows missing");
  addFailure(failures, report.dependency.maskRectCount >= report.slotCount, "dependency slot masks do not cover slots");
  if (report.bodyOverflowX > overflowThreshold) {
    if (report.viewport.category === "narrow") warnings.push(`body overflow ${report.bodyOverflowX}px allowed as narrow smoke warning`);
    else failures.push(`body overflow ${report.bodyOverflowX}px`);
  }
  report.requiredSelectors
    .filter((item) => item.count === 0)
    .filter((item) => !(report.scale === "weeks" && item.selector.includes("GanttResizeHandle")))
    .forEach((item) => failures.push(`missing selector ${item.selector}`));
  report.requiredDataAttributes
    .filter((item) => item.count === 0)
    .filter((item) => !defaultOptionalDataAttributes.has(item.attribute))
    .filter((item) => !(report.scale === "weeks" && item.attribute === "data-resize-slot"))
    .forEach((item) => failures.push(`missing data attribute ${item.attribute}`));
  report.rows.forEach((row) => {
    if (!row.rect?.height || row.rect.height <= 0) failures.push(`row ${row.id} has empty height`);
    if (row.styleTop !== null && row.styleTop < 0) failures.push(`row ${row.id} has negative top`);
    if (!row.label) failures.push(`row ${row.id} lost label`);
    if (!row.lane) failures.push(`row ${row.id} lost lane`);
  });
  report.slots.forEach((slot) => {
    if (!slot.id) failures.push("slot without data-slot-id");
    if (slot.component !== "GanttSlot") failures.push(`slot ${slot.id} lost GanttSlot marker`);
    if (!slot.rect?.width || slot.rect.width <= 0) failures.push(`slot ${slot.id} has empty width`);
    if (!slot.rect?.height || slot.rect.height <= 0) failures.push(`slot ${slot.id} has empty height`);
    if (slot.styleLeft !== null && slot.styleLeft < -1) failures.push(`slot ${slot.id} has negative left`);
    if (slot.styleTop !== null && slot.styleTop < -1) failures.push(`slot ${slot.id} has negative top`);
    if (slot.styleWidth !== null && slot.styleWidth <= 0) failures.push(`slot ${slot.id} has non-positive inline width`);
    if (slot.styleHeight !== null && slot.styleHeight <= 0) failures.push(`slot ${slot.id} has non-positive inline height`);
    if (!slot.text && !slot.operationalSegments) warnings.push(`slot ${slot.id} has no visible text or operational marker`);
  });
  return { ...report, status: failures.length ? "fail" : warnings.length ? "warn" : "ok", failures, warnings };
}

async function runSafeInteractions(client, viewport) {
  if (viewport.id !== "desktop") return { viewport, status: "skipped", reason: "interaction smoke runs only on desktop" };
  const result = await evaluate(client, async () => {
    const sleepFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const report = {
      editor: { opened: false, closed: false, selector: "" },
      optimization: { opened: false, closed: false, selector: "" },
      dependencyEdit: { enabled: false, controls: 0, disabled: false },
      failures: [],
      warnings: [],
    };
    const closeOpenOverlay = async () => {
      const close = document.querySelector("[data-close-modal], [data-close-drawer], [aria-label*='Закрыть']");
      close?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      await sleepFrame();
    };
    const slot = document.querySelector(".operation-slot[data-ui-component='GanttSlot'][data-slot-id]:not(.aggregate-slot)");
    if (!slot) {
      report.failures.push("no safe slot for editor smoke");
    } else {
      slot.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window }));
      await sleepFrame();
      const modal = document.querySelector(".slot-form-modal, #slotForm")?.closest(".ui-modal, .modal, [role='dialog']");
      report.editor.opened = Boolean(modal && document.querySelector("#slotForm"));
      report.editor.selector = modal ? `${modal.tagName.toLowerCase()}.${String(modal.className || "").split(/\s+/).slice(0, 3).join(".")}` : "";
      if (modal && !modal.getAttribute("data-gantt-overlay")) report.warnings.push("editor modal lacks data-gantt-overlay");
      await closeOpenOverlay();
      report.editor.closed = !document.querySelector("#slotForm");
    }
    const optimize = document.querySelector("#optimizePlanButton");
    if (!optimize) {
      report.failures.push("optimization button missing");
    } else {
      optimize.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      await sleepFrame();
      const modal = document.querySelector(".gantt-optimization-modal");
      report.optimization.opened = Boolean(modal);
      report.optimization.selector = modal ? `${modal.tagName.toLowerCase()}.${String(modal.className || "").split(/\s+/).slice(0, 3).join(".")}` : "";
      if (modal && !modal.getAttribute("data-gantt-overlay")) report.warnings.push("optimization modal lacks data-gantt-overlay");
      if (modal && !modal.querySelector("[data-gantt-optimize-select]")) report.failures.push("optimization modal lacks data-gantt-optimize-select");
      await closeOpenOverlay();
      report.optimization.closed = !document.querySelector(".gantt-optimization-modal");
    }
    const dependencyButton = document.querySelector("#dependencyEditButton");
    if (!dependencyButton) {
      report.failures.push("dependency edit button missing");
    } else {
      dependencyButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      await sleepFrame();
      report.dependencyEdit.enabled = Boolean(document.querySelector("[data-gantt-shell]")?.classList.contains("is-dependency-editing"));
      report.dependencyEdit.controls = document.querySelectorAll("[data-dependency-edit-route]").length;
      if (report.dependencyEdit.enabled && !report.dependencyEdit.controls) {
        report.failures.push("dependency edit controls missing while edit mode is enabled");
      }
      const routeControl = document.querySelector("[data-dependency-edit-route]");
      if (routeControl) {
        [
          "dependencyStartIndex",
          "dependencyEndIndex",
          "dependencyStartBaseX",
          "dependencyStartBaseY",
          "dependencyEndBaseX",
          "dependencyEndBaseY",
          "dependencyStartCurrentX",
          "dependencyStartCurrentY",
          "dependencyEndCurrentX",
          "dependencyEndCurrentY",
        ].forEach((key) => {
          if (!routeControl.dataset[key]) report.failures.push(`dependency edit control missing ${key}`);
        });
      }
      dependencyButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      await sleepFrame();
      report.dependencyEdit.disabled = !document.querySelector("[data-gantt-shell]")?.classList.contains("is-dependency-editing");
    }
    if (!report.editor.opened) report.failures.push("editor did not open on double click");
    if (!report.editor.closed) report.failures.push("editor did not close");
    if (!report.optimization.opened) report.failures.push("optimization modal did not open");
    if (!report.optimization.closed) report.failures.push("optimization modal did not close");
    if (!report.dependencyEdit.enabled) report.failures.push("dependency edit mode did not enable");
    if (!report.dependencyEdit.disabled) report.failures.push("dependency edit mode did not disable");
    return report;
  });
  return {
    viewport,
    ...result,
    status: result.failures.length ? "fail" : result.warnings.length ? "warn" : "ok",
  };
}

async function buildTokenUsageReport() {
  const [coreCss, ganttCss, shellCss] = await Promise.all([
    readFile("styles/mes-ui-core.css", "utf8"),
    readFile("styles/layers/40-gantt-planning-routes.css", "utf8"),
    readFile("styles/layers/10-shell-directory-gantt-base.css", "utf8"),
  ]);
  const css = `${coreCss}\n${ganttCss}\n${shellCss}`;
  const tokens = GANTT_UI_REQUIRED_TOKENS.map((token) => ({
    token,
    defined: new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`).test(coreCss),
    used: css.includes(`var(${token}`),
  }));
  const rawGanttColors = [...new Set(ganttCss.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/g) || [])];
  const report = {
    generatedAt: new Date().toISOString(),
    tokens,
    missingDefinitions: tokens.filter((item) => !item.defined),
    unusedTokens: tokens.filter((item) => item.defined && !item.used),
    rawGanttColorCount: rawGanttColors.length,
    rawGanttColorSamples: rawGanttColors.slice(0, 40),
  };
  return report;
}

function buildRuntimeMapReport() {
  return {
    generatedAt: new Date().toISOString(),
    zones: GANTT_UI_SPECIAL_RUNTIME_ZONES,
  };
}

function buildSlotContractReport() {
  return {
    generatedAt: new Date().toISOString(),
    states: [
      "planned",
      "distributed",
      "in_progress",
      "paused",
      "completed",
      "overdue",
      "problem",
      "transfer",
      "non_working_segment",
      "selected",
      "dragging",
      "resizing",
      "readonly",
    ],
    classes: GANTT_SLOT_STATE_CLASSES,
    requiredComponents: [
      "GanttSlot",
      "GanttWorkingSegment",
      "GanttNonWorkingSegment",
      "GanttOperationalLayer",
      "GanttOperationalSegment",
      "GanttResizeHandle",
      "GanttTransferBatch",
    ],
  };
}

function buildDependencyContractReport() {
  return {
    generatedAt: new Date().toISOString(),
    classes: GANTT_DEPENDENCY_STATE_CLASSES,
    requiredComponents: [
      "GanttDependencyLayer",
      "GanttDependencyPath",
      "GanttDependencyArrow",
      "GanttDependencySlotMask",
      "GanttDependencySlotMaskRect",
    ],
    tokens: [
      "--mes-ui-gantt-dependency-color",
      "--mes-ui-gantt-dependency-active-color",
      "--mes-ui-gantt-dependency-warning-color",
    ],
    protectedBehavior: [
      "SVG path algorithm is not changed.",
      "Markers and mask geometry are not changed.",
      "Dependency edit controls are smoke-tested but not dragged destructively.",
    ],
  };
}

function buildMarkdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function buildGeometryMarkdown(report) {
  const rows = report.geometryChecks.map((item) => [
    item.viewport.id,
    item.scale,
    item.status,
    String(item.slotCount),
    String(item.rows.length),
    String(item.dependency.pathCount),
    [...item.failures, ...item.warnings].join("; "),
  ]);
  return `# Gantt Geometry Invariants Report

Generated: ${report.generatedAt}

## Summary

- checks: ${report.geometryChecks.length}
- failures: ${report.summary.failures}
- warnings: ${report.summary.warnings}
- viewports: ${GANTT_UI_VIEWPORTS.map((viewport) => `${viewport.id} ${viewport.width}x${viewport.height}`).join(", ")}
- scales: ${GANTT_UI_SCALE_MODES.join(", ")}

## Checks

${buildMarkdownTable(["viewport", "scale", "status", "slots", "rows", "dependency paths", "notes"], rows)}
`;
}

function buildScaleMarkdown(report) {
  const rows = report.scaleChecks.map((item) => [
    item.viewport.id,
    item.scale,
    item.status,
    item.activeScale,
    String(item.timeline.cellCount),
    String(item.slotCount),
    [...item.failures, ...item.warnings].join("; "),
  ]);
  return `# Gantt Scale Regression Report

Generated: ${report.generatedAt}

## Summary

- checks: ${report.scaleChecks.length}
- failures: ${report.summary.failures}
- warnings: ${report.summary.warnings}

## Scale Checks

${buildMarkdownTable(["viewport", "requested scale", "status", "active scale", "timeline cells", "slots", "notes"], rows)}
`;
}

async function writeJson(filePath, payload) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function writeReports(result) {
  await writeJson(reportPaths.runtimeMapJson, result.runtimeMap);
  await writeJson(reportPaths.domContractJson, result.domContract);
  await writeJson(reportPaths.geometryJson, result.geometry);
  await writeJson(reportPaths.tokenUsageJson, result.tokenUsage);
  await writeJson(reportPaths.slotContractJson, result.slotContract);
  await writeJson(reportPaths.dependencyContractJson, result.dependencyContract);
  await writeJson(reportPaths.overlayJson, result.overlay);
  await writeJson(reportPaths.scaleJson, result.scale);
  await writeJson(reportPaths.combinedJson, result);
  await writeFile(reportPaths.geometryMd, buildGeometryMarkdown(result.geometry));
  await writeFile(reportPaths.scaleMd, buildScaleMarkdown(result.scale));
}

async function run() {
  const bootstrapSnapshotStorageSeed = buildGanttFixtureStorageSeed(await getBootstrapSnapshotStorageSeed());
  const expandedProjects = getExpandedRouteIdsFromStorageSeed(bootstrapSnapshotStorageSeed);
  const chrome = await launchChrome();
  const geometryChecks = [];
  const scaleChecks = [];
  const overlayChecks = [];
  const stabilityChecks = [];
  try {
    const { client } = chrome;
    await client.send("Page.enable");
    await client.send("Runtime.enable");

    for (const viewport of GANTT_UI_VIEWPORTS) {
      await setViewport(client, viewport);
      await client.send("Page.navigate", { url: moduleUrl() });
      await delay(300);
      await seedGanttState(client, bootstrapSnapshotStorageSeed, expandedProjects, "days");
      await client.send("Page.navigate", { url: moduleUrl() });
      await waitForGantt(client);
      stabilityChecks.push(await checkGanttToolbarStability(client, viewport));

      for (const scale of GANTT_UI_SCALE_MODES) {
        await switchScale(client, scale);
        const report = validateDomReport(await collectGanttDom(client, viewport, scale));
        geometryChecks.push(report);
        scaleChecks.push(report);
      }

      await switchScale(client, "days");
      overlayChecks.push(await runSafeInteractions(client, viewport));
    }
  } finally {
    await cleanupChrome(chrome);
  }

  const tokenUsage = await buildTokenUsageReport();
  const domFailures = geometryChecks.flatMap((item) => item.failures);
  const overlayFailures = overlayChecks.flatMap((item) => item.failures || []);
  const stabilityFailures = stabilityChecks.flatMap((item) => item.failures || []);
  const result = {
    generatedAt: new Date().toISOString(),
    runtimeMap: buildRuntimeMapReport(),
    domContract: {
      generatedAt: new Date().toISOString(),
      requiredSelectors: GANTT_UI_REQUIRED_SELECTORS,
      requiredDataAttributes: GANTT_UI_REQUIRED_DATA_ATTRIBUTES,
      checks: geometryChecks.map((item) => ({
        viewport: item.viewport,
        scale: item.scale,
        status: item.status,
        requiredSelectors: item.requiredSelectors,
        requiredDataAttributes: item.requiredDataAttributes,
      })),
    },
    geometry: {
      generatedAt: new Date().toISOString(),
      viewports: GANTT_UI_VIEWPORTS,
      scales: GANTT_UI_SCALE_MODES,
      summary: {
        checks: geometryChecks.length,
        failures: domFailures.length,
        warnings: geometryChecks.reduce((sum, item) => sum + item.warnings.length, 0),
      },
      geometryChecks,
    },
    tokenUsage,
    slotContract: buildSlotContractReport(),
    dependencyContract: buildDependencyContractReport(),
    overlay: {
      generatedAt: new Date().toISOString(),
      checks: overlayChecks,
      summary: {
        checks: overlayChecks.length,
        failures: overlayFailures.length,
        warnings: overlayChecks.reduce((sum, item) => sum + (item.warnings?.length || 0), 0),
      },
      overlayComponents: GANTT_UI_OVERLAY_COMPONENTS,
    },
    scale: {
      generatedAt: new Date().toISOString(),
      scaleChecks,
      summary: {
        checks: scaleChecks.length,
        failures: domFailures.length,
        warnings: scaleChecks.reduce((sum, item) => sum + item.warnings.length, 0),
      },
    },
    toolbarStability: {
      generatedAt: new Date().toISOString(),
      checks: stabilityChecks,
      summary: {
        checks: stabilityChecks.length,
        failures: stabilityFailures.length,
      },
    },
  };

  await writeReports(result);

  console.log("Gantt Phase 5 Regression Smoke");
  console.log(`- geometry checks: ${geometryChecks.length}`);
  console.log(`- scale checks: ${scaleChecks.length}`);
  console.log(`- overlay checks: ${overlayChecks.length}`);
  console.log(`- toolbar stability checks: ${stabilityChecks.length}`);
  console.log(`- failures: ${domFailures.length + stabilityFailures.length + overlayFailures.length}`);
  console.log(`- warnings: ${result.geometry.summary.warnings + result.overlay.summary.warnings}`);
  console.log(`- report: ${reportPaths.combinedJson}`);

  if (domFailures.length || stabilityFailures.length || overlayFailures.length || tokenUsage.missingDefinitions.length) {
    const messages = [
      ...domFailures,
      ...stabilityFailures,
      ...overlayFailures,
      ...tokenUsage.missingDefinitions.map((item) => `missing Gantt token ${item.token}`),
    ];
    throw new Error(messages.join("; "));
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
