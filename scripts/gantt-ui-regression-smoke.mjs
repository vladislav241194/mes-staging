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

async function getPresetStorageSeed() {
  const raw = await readFile("workflow-preset.json", "utf8");
  const preset = JSON.parse(raw);
  return preset.values && typeof preset.values === "object" ? preset.values : {};
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

async function seedGanttState(client, presetStorageSeed, expandedProjects, scale = "days") {
  await evaluate(client, (payload) => {
    sessionStorage.setItem(payload.sharedDisabledKey, String(Date.now() + 5 * 60 * 1000));
    Object.entries(payload.presetStorageSeed || {}).forEach(([key, value]) => {
      if (typeof value === "string") localStorage.setItem(key, value);
    });
    const presetUi = JSON.parse(payload.presetStorageSeed[payload.uiStorageKey] || "{}");
    localStorage.setItem(payload.uiStorageKey, JSON.stringify({
      ...presetUi,
      activeModule: "gantt",
      scale: payload.scale,
      ganttZoom: payload.scale === "hours" ? 8 : 1,
      ganttShowQuantity: true,
      expandedProjects: payload.expandedProjects,
      ganttDependencyEditMode: false,
      ganttOptimizationDialog: null,
      editor: null,
      selectedSlotId: null,
    }));
  }, { sharedDisabledKey, uiStorageKey, presetStorageSeed, expandedProjects, scale });
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

async function collectGanttDom(client, viewport, scale) {
  return evaluate(client, (payload) => {
    const round = (value) => Math.round(Number(value || 0) * 10) / 10;
    const rectOf = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect ? {
        x: round(rect.x),
        y: round(rect.y),
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
        present: Boolean(document.querySelector("[data-ui-component='GanttToolbar']")),
        actionButtons: document.querySelectorAll(".topbar .ui-action-button, [data-ui-component='GanttToolbar'] .ui-action-button").length,
        scaleControls: document.querySelectorAll("[data-scale]").length,
        zoomControls: document.querySelectorAll("[data-gantt-zoom]").length,
        optimizeControls: document.querySelectorAll("#optimizePlanButton").length,
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
  const presetStorageSeed = await getPresetStorageSeed();
  const expandedProjects = getExpandedRouteIdsFromStorageSeed(presetStorageSeed);
  const chrome = await launchChrome();
  const geometryChecks = [];
  const scaleChecks = [];
  const overlayChecks = [];
  try {
    const { client } = chrome;
    await client.send("Page.enable");
    await client.send("Runtime.enable");

    for (const viewport of GANTT_UI_VIEWPORTS) {
      await setViewport(client, viewport);
      await client.send("Page.navigate", { url: moduleUrl() });
      await delay(300);
      await seedGanttState(client, presetStorageSeed, expandedProjects, "days");
      await client.send("Page.navigate", { url: moduleUrl() });
      await waitForGantt(client);

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
  };

  await writeReports(result);

  console.log("Gantt Phase 5 Regression Smoke");
  console.log(`- geometry checks: ${geometryChecks.length}`);
  console.log(`- scale checks: ${scaleChecks.length}`);
  console.log(`- overlay checks: ${overlayChecks.length}`);
  console.log(`- failures: ${domFailures.length + overlayFailures.length}`);
  console.log(`- warnings: ${result.geometry.summary.warnings + result.overlay.summary.warnings}`);
  console.log(`- report: ${reportPaths.combinedJson}`);

  if (domFailures.length || overlayFailures.length || tokenUsage.missingDefinitions.length) {
    const messages = [
      ...domFailures,
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
