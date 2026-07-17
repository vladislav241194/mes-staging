import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const defaultUrl = new URL("/?module=gantt&qa-auth-bypass=1&qa=gantt-operational-layer", process.env.MES_QA_URL || "http://localhost:4174/").toString();
const stateStorageKey = "mes-planning-prototype-state-v2";
const uiStorageKey = "mes-planning-prototype-ui-v1";
const sharedDisabledKey = "mes-planning-prototype-shared-disabled-until-v1";
const qaSeedMarkerKey = "mes-gantt-operational-qa-seed-marker-v1";

function getArg(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pathExists(path) {
  try {
    await import("node:fs/promises").then((fs) => fs.stat(path));
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

function withNavigationNonce(url, key, value) {
  const nextUrl = new URL(url);
  nextUrl.searchParams.set(key, value);
  return nextUrl.toString();
}

async function waitForDocumentNonce(client, key, value, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const state = await evaluate(client, ({ key: nonceKey, value: nonceValue }) => {
        const params = new URLSearchParams(window.location.search || "");
        return {
          readyState: document.readyState,
          nonce: params.get(nonceKey) || "",
        };
      }, { key, value });
      if (state.readyState !== "loading" && state.nonce === value) return;
    } catch (error) {
      if (!/navigated|Execution context|Cannot find context/i.test(String(error?.message || error))) throw error;
    }
    await delay(80);
  }
  throw new Error(`Timed out waiting for document nonce ${key}=${value}`);
}

async function setLocalStorageItemsForUrl(client, url, entries = []) {
  const parsedUrl = new URL(url);
  const storageId = {
    securityOrigin: parsedUrl.origin,
    isLocalStorage: true,
  };
  await client.send("DOMStorage.enable");
  for (const [key, value] of entries) {
    await client.send("DOMStorage.setDOMStorageItem", {
      storageId,
      key,
      value,
    });
  }
}

async function setSessionStorageItemsForUrl(client, url, entries = []) {
  const parsedUrl = new URL(url);
  const storageId = {
    securityOrigin: parsedUrl.origin,
    isLocalStorage: false,
  };
  await client.send("DOMStorage.enable");
  for (const [key, value] of entries) {
    await client.send("DOMStorage.setDOMStorageItem", {
      storageId,
      key,
      value,
    });
  }
}

async function readLocalStorageItem(client, key) {
  return evaluate(client, (storageKey) => localStorage.getItem(storageKey) || "", key);
}

async function navigateToStorageOrigin(client, appUrl) {
  const storageUrl = new URL("/app-version.json", appUrl);
  storageUrl.searchParams.set("qa_gantt_storage_origin", String(Date.now()));
  await client.send("Page.navigate", { url: storageUrl.toString() });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    try {
      const ready = await evaluate(client, (expectedOrigin) => (
        document.readyState !== "loading"
        && location.origin === expectedOrigin
        && location.pathname.endsWith("/app-version.json")
      ), storageUrl.origin);
      if (ready) return;
    } catch (error) {
      if (!/navigated|Execution context|Cannot find context/i.test(String(error?.message || error))) throw error;
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for storage origin ${storageUrl.origin}`);
}

async function navigateAndWait(client, url, nonceKey, nonceValue) {
  const nextUrl = withNavigationNonce(url, nonceKey, nonceValue);
  await client.send("Page.navigate", { url: nextUrl });
  await waitForDocumentNonce(client, nonceKey, nonceValue);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeQaText(value = "") {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
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
    const specificationIds = (state.routes || []).map((route) => route.specificationId || route.projectId).filter(Boolean);
    return [...new Set([...routeIds, ...specificationIds])];
  } catch {
    return [];
  }
}

async function launchChrome() {
  const chromePath = await findChrome();
  const port = await getFreePort();
  const profileDir = await mkdtemp(join(tmpdir(), "mes-gantt-operational-qa-"));
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

async function waitForGantt(client, slotId) {
  const startedAt = Date.now();
  let diagnostic = null;
  let expandClicked = false;
  while (Date.now() - startedAt < 45000) {
    const state = await evaluate(client, ({ id, clicked }) => {
      const ui = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
      const planning = JSON.parse(localStorage.getItem("mes-planning-prototype-state-v2") || "{}");
      const aggregate = document.querySelectorAll(".operation-slot.aggregate-slot").length;
      const toggle = document.querySelector("[data-toggle-all-projects]");
      const toggleText = toggle?.textContent?.trim().replace(/\s+/g, " ") || "";
      if (
        document.querySelector("main.app-shell")?.dataset.layoutPage === "gantt"
        && !document.querySelector(".operation-slot:not(.aggregate-slot)")
        && aggregate
        && toggle
        && !clicked
        && /Развернуть/.test(toggleText)
      ) {
        toggle.click();
        return { expandClicked: true };
      }
      const visibleSlots = [...document.querySelectorAll(".operation-slot:not(.aggregate-slot)")].map((slot) => ({
        id: slot.getAttribute("data-slot-id") || "",
        className: slot.className || "",
        title: slot.getAttribute("title") || "",
      })).slice(0, 12);
      const targetSlot = (planning.slots || []).find((slot) => slot.id === id) || null;
      return {
        layoutPage: document.querySelector("main.app-shell")?.dataset.layoutPage || "",
        targetVisible: Boolean(document.querySelector(`.operation-slot[data-slot-id="${CSS.escape(id)}"]:not(.aggregate-slot)`)),
        aggregate,
        targetExists: Boolean(targetSlot),
        targetSlot: targetSlot ? {
          id: targetSlot.id,
          plannedStart: targetSlot.plannedStart || "",
          plannedEnd: targetSlot.plannedEnd || "",
          routeStepId: targetSlot.routeStepId || "",
          workCenterId: targetSlot.workCenterId || "",
        } : null,
        ui: {
          windowStart: ui.windowStart || "",
          scale: ui.scale || "",
          rowMode: ui.rowMode || "",
          workCenterFilter: ui.workCenterFilter || "",
          expandedProjects: Array.isArray(ui.expandedProjects) ? ui.expandedProjects.slice(0, 8) : [],
        },
        visibleSlots,
      };
    }, { id: slotId, clicked: expandClicked });
    if (state.expandClicked) {
      expandClicked = true;
      await delay(240);
      continue;
    }
    diagnostic = state;
    if (state.layoutPage === "gantt" && state.targetVisible) return;
    await delay(120);
  }
  throw new Error(`Gantt did not render target slot ${slotId}: ${JSON.stringify(diagnostic)}`);
}

async function waitForAnyGanttSlot(client) {
  const startedAt = Date.now();
  let expandClicked = false;
  while (Date.now() - startedAt < 45000) {
    let state;
    try {
      state = await evaluate(client, (clicked) => {
      const shellReady = document.querySelector("main.app-shell")?.dataset.layoutPage === "gantt";
      const nonAggregate = document.querySelectorAll(".operation-slot:not(.aggregate-slot)").length;
      const aggregate = document.querySelectorAll(".operation-slot.aggregate-slot").length;
      const toggle = document.querySelector("[data-toggle-all-projects]");
      const toggleText = toggle?.textContent?.trim().replace(/\s+/g, " ") || "";
      if (shellReady && !nonAggregate && aggregate && toggle && !clicked && /Развернуть/.test(toggleText)) {
        toggle.click();
        return { shellReady, nonAggregate, aggregate, expandClicked: true, toggleText };
      }
      return { shellReady, nonAggregate, aggregate, expandClicked: false, toggleText };
      }, expandClicked);
    } catch (error) {
      if (/navigated|Execution context|Cannot find context/i.test(String(error?.message || error))) {
        await delay(250);
        continue;
      }
      throw error;
    }
    if (state.expandClicked) expandClicked = true;
    if (state.shellReady && state.nonAggregate > 0) return;
    await delay(120);
  }
  const diagnostic = await evaluate(client, () => {
    const state = JSON.parse(localStorage.getItem("mes-planning-prototype-state-v2") || "{}");
    const ui = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
    return {
      href: location.href,
      title: document.title,
      shellPage: document.querySelector("main.app-shell")?.dataset.layoutPage || "",
      shellClass: document.querySelector("main.app-shell")?.className || "",
      bodyText: document.body.innerText.trim().replace(/\s+/g, " ").slice(0, 300),
      operationSlots: document.querySelectorAll(".operation-slot").length,
      appError: document.querySelector(".app-error, .startup-error")?.textContent?.trim().replace(/\s+/g, " ") || "",
      activeModule: ui.activeModule || "",
      stateSlots: Array.isArray(state.slots) ? state.slots.length : -1,
      stateRoutes: Array.isArray(state.routes) ? state.routes.length : -1,
      stateRouteSteps: Array.isArray(state.routeSteps) ? state.routeSteps.length : -1,
      stateStepSample: (state.routeSteps || []).slice(0, 2),
    };
  });
  throw new Error(`Gantt did not render any operation slot. ${JSON.stringify(diagnostic)}`);
}

function buildUiSeed(scenario, expandedProjects = [], baseUi = {}) {
  const now = new Date().toISOString();
  const normalizedBaseUi = baseUi && typeof baseUi === "object" && !Array.isArray(baseUi) ? baseUi : {};
  const nextExpandedProjects = [
    ...new Set([
      ...expandedProjects,
      ...(Array.isArray(normalizedBaseUi.expandedProjects) ? normalizedBaseUi.expandedProjects : []),
      ...(Array.isArray(scenario.expandedProjects) ? scenario.expandedProjects : []),
      scenario.routeId,
      scenario.projectId,
      scenario.specificationId,
    ].filter(Boolean)),
  ];
  return {
    activeRole: normalizedBaseUi.activeRole || "productionDirector",
    authGateUnlocked: true,
    authCurrentUserId: normalizedBaseUi.authCurrentUserId || "qa-gantt-operational",
    activeModule: "gantt",
    scale: "hours",
    windowStart: scenario.windowStart || "2026-06-01",
    rowMode: scenario.rowMode || "route",
    workCenterFilter: scenario.workCenterFilter || "all",
    ganttZoom: 8,
    ganttShowQuantity: true,
    expandedProjects: nextExpandedProjects,
    shiftMasterBoardAssignments: {
      [scenario.slotId]: {
        slotId: scenario.slotId,
        status: "issued",
        issued: true,
        issuedAt: now,
        updatedAt: now,
        plannedQuantity: scenario.plannedQuantity,
        assignedQuantity: scenario.assignedQuantity,
        executors: [
          {
            id: "qa-executor-1",
            employeeId: "",
            quantity: scenario.assignedQuantity,
            note: "QA operational layer",
          },
        ],
      },
    },
    shiftMasterBoardFacts: {
      [scenario.slotId]: {
        slotId: scenario.slotId,
        actualQuantity: scenario.factQuantity,
        defectQuantity: 0,
        laborMinutes: 240,
        executorCount: 1,
        comment: "QA operational layer fact",
        updatedAt: now,
      },
    },
  };
}

function buildStateSeed(scenario, storageSeed = {}) {
  const now = new Date().toISOString();
  const state = JSON.parse(storageSeed[stateStorageKey] || "{}");
  return {
    ...state,
    version: 1,
    shiftMasterAssignments: {
      ...(state.shiftMasterAssignments && typeof state.shiftMasterAssignments === "object" && !Array.isArray(state.shiftMasterAssignments)
        ? state.shiftMasterAssignments
        : {}),
      [scenario.slotId]: {
        slotId: scenario.slotId,
        status: "issued",
        issued: true,
        issuedAt: now,
        updatedAt: now,
        plannedQuantity: scenario.plannedQuantity,
        assignedQuantity: scenario.assignedQuantity,
        hasAssignedQuantity: true,
        actualQuantity: scenario.factQuantity,
        defectQuantity: 0,
        laborMinutes: scenario.factQuantity > 0 ? 240 : 0,
        executorCount: scenario.factQuantity > 0 ? 1 : 0,
        comment: "QA operational layer fact",
        executors: scenario.assignedQuantity > 0
          ? [
              {
                id: "qa-executor-1",
                employeeId: "",
                quantity: scenario.assignedQuantity,
                note: "QA operational layer",
              },
            ]
          : [],
      },
    },
  };
}

function ensureOperationalFixtureStorageSeed(storageSeed = {}) {
  const state = JSON.parse(storageSeed[stateStorageKey] || "{}");
  const workCenterId = state.workCenters?.[0]?.id || "D1";
  const routeId = "qa-gantt-operational-route";
  const stepId = "qa-gantt-operational-step";
  const slotId = "qa-gantt-operational-slot";
  const specificationId = "qa-gantt-operational-specification";
  const operation = {
    routeStepId: stepId,
    operationId: "D1_OP1",
    operationName: "QA-операция Gantt",
    workCenterId,
    nextWorkCenterId: workCenterId,
    labor: { mode: "unit", minutesPerUnit: 1 },
  };
  const fixtureState = {
    ...state,
    routes: [{
      id: routeId,
      specificationId,
      specificationName: "QA: Gantt operational layer",
      projectId: specificationId,
      name: "Маршрутная карта · QA Gantt",
      routeDocumentKind: "main",
      rootRouteId: routeId,
      isDefault: true,
      revision: 1,
      sourceSpecifications2EntryId: specificationId,
      sourceSpecifications2RouteDraftId: "qa-gantt-operational-draft",
      planningQuantity: 1000,
      planningStatus: "scheduled",
      lifecycleStatus: "released",
      planningLaborByStepId: { [stepId]: { mode: "unit", minutesPerUnit: 1 } },
      documentRevisionSnapshot: { source: "specifications2", specificationEntryId: specificationId, specificationId, specificationRevision: 1, routeDraftId: "qa-gantt-operational-draft", routeRevision: 1, product: { designation: "QA.GANTT.001", name: "QA Gantt" }, operations: [operation] },
      workOrderSnapshot: { id: "qa-gantt-operational-work-order-r1", source: "specifications2", specificationId, specificationRevision: 1, routeId, routeRevision: 1, quantity: 1000, operationRevisions: [operation] },
    }],
    routeSteps: [{
      id: stepId, routeId, stepOrder: 1, operationId: operation.operationId, operationName: operation.operationName,
      workCenterId, departmentId: workCenterId, nextWorkCenterId: workCenterId, isRequired: true,
      quantityMultiplier: 1, calculationType: "normative", fulfillmentMode: "produce",
      operationInputs: [{ label: "К сборке" }], operationOutputs: [{ label: "Собрано" }],
      sourceSpecifications2OperationId: "qa-gantt-operational-operation", normRevisionId: "", unit: "шт.",
    }],
    slots: [{
      id: slotId, routeId, routeStepId: stepId, planningOrderId: routeId, specificationId,
      routeWorkCenterId: workCenterId, workCenterId, operationId: operation.operationId, operationName: operation.operationName,
      quantity: 1000, unit: "шт.", plannedStart: "2026-06-01T08:00:00.000Z", plannedEnd: "2026-06-01T12:00:00.000Z", status: "planned",
      sourceSpecifications2EntryId: specificationId, specificationRevision: 1, routeRevision: 1, workOrderSnapshotId: "qa-gantt-operational-work-order-r1",
    }],
    shiftMasterAssignments: {},
    dispatchFacts: {},
    planningCorrections: {},
  };
  return { ...storageSeed, [stateStorageKey]: JSON.stringify(fixtureState) };
}

async function main() {
  const url = getArg("--url", defaultUrl);
  const bootstrapSnapshotStorageSeed = ensureOperationalFixtureStorageSeed(await getBootstrapSnapshotStorageSeed());
  const expandedProjects = getExpandedRouteIdsFromStorageSeed(bootstrapSnapshotStorageSeed);
  const bootstrapUiSeed = {
    ...JSON.parse(bootstrapSnapshotStorageSeed[uiStorageKey] || "{}"),
    activeModule: "gantt",
    scale: "hours",
    ganttZoom: 8,
    ganttShowQuantity: true,
    expandedProjects,
  };
  const chrome = await launchChrome();
  try {
    const { client } = chrome;
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1710,
      height: 910,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigateToStorageOrigin(client, url);
    await setLocalStorageItemsForUrl(client, url, [
      [stateStorageKey, bootstrapSnapshotStorageSeed[stateStorageKey]],
      [uiStorageKey, JSON.stringify(bootstrapUiSeed)],
      ["mes-specifications-2-registry-v1", '{"entries":[]}'],
    ]);
    await setSessionStorageItemsForUrl(client, url, [
      [sharedDisabledKey, String(Date.now() + 5 * 60 * 1000)],
    ]);
    await navigateAndWait(client, url, "qa_gantt_seed", "primary");
    await waitForAnyGanttSlot(client);
    const scenario = await evaluate(client, () => {
      const storedUi = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
      const planning = JSON.parse(localStorage.getItem("mes-planning-prototype-state-v2") || "{}");
      const slots = [...document.querySelectorAll(".operation-slot:not(.aggregate-slot)")];
      const candidates = slots
        .map((slot) => {
          const rect = slot.getBoundingClientRect();
          const title = slot.getAttribute("title") || "";
          const quantityMatch = title.match(/·\s*([0-9\s]+)\s*шт\./);
          const plannedQuantity = Number((quantityMatch?.[1] || "1000").replace(/\s+/g, "")) || 1000;
          return {
            slotId: slot.getAttribute("data-slot-id") || "",
            plannedQuantity,
            width: rect.width,
            isSegmented: slot.className.includes("is-segmented"),
            title,
          };
        })
        .filter((slot) => slot.slotId && slot.plannedQuantity > 0)
        .sort((left, right) => right.width - left.width);
      const picked = candidates[0] || null;
      if (!picked) return null;
      const pickedSlot = (planning.slots || []).find((slot) => slot.id === picked.slotId) || {};
      const pickedStep = (planning.routeSteps || []).find((step) => step.id === pickedSlot.routeStepId) || {};
      const routeId = pickedStep.routeId || pickedSlot.routeId || pickedSlot.projectId || "";
      const pickedRoute = (planning.routes || []).find((route) => route.id === routeId) || {};
      return {
        slotId: picked.slotId,
        uiSnapshot: storedUi,
        routeId,
        projectId: pickedSlot.projectId || pickedRoute.projectId || pickedRoute.specificationId || "",
        specificationId: pickedSlot.specificationId || pickedRoute.specificationId || "",
        expandedProjects: storedUi.expandedProjects || [],
        windowStart: storedUi.windowStart || document.querySelector("#periodStart")?.value || "2026-06-01",
        rowMode: storedUi.rowMode || "route",
        workCenterFilter: storedUi.workCenterFilter || "all",
        plannedQuantity: picked.plannedQuantity,
        assignedQuantity: Math.max(1, Math.round(picked.plannedQuantity * 0.7)),
        factQuantity: Math.max(1, Math.round(picked.plannedQuantity * 0.4)),
        pickedWidth: picked.width,
        pickedTitle: picked.title,
      };
    });
    assert(scenario?.slotId, "Could not pick a visible Gantt slot for operational layer QA.");
    const seed = buildUiSeed(scenario, expandedProjects, scenario.uiSnapshot);
    const stateSeed = buildStateSeed(scenario, bootstrapSnapshotStorageSeed);
    await navigateToStorageOrigin(client, url);
    await setLocalStorageItemsForUrl(client, url, [
      ...Object.entries(bootstrapSnapshotStorageSeed).filter(([, value]) => typeof value === "string"),
      [stateStorageKey, JSON.stringify(stateSeed)],
      [uiStorageKey, JSON.stringify(seed)],
      [qaSeedMarkerKey, "primary-domstorage"],
    ]);
    await setSessionStorageItemsForUrl(client, url, [
      [sharedDisabledKey, String(Date.now() + 5 * 60 * 1000)],
    ]);
    const primaryStoredSeed = await readLocalStorageItem(client, uiStorageKey);
    assert(primaryStoredSeed.includes(scenario.slotId), `Primary seed was not written to localStorage before navigation: ${primaryStoredSeed.slice(0, 240)}`);
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        (() => {
          try {
            sessionStorage.setItem(${JSON.stringify(sharedDisabledKey)}, String(Date.now() + 5 * 60 * 1000));
            localStorage.setItem(${JSON.stringify(qaSeedMarkerKey)}, ${JSON.stringify("primary-preload")});
          } catch {
            // Storage can be unavailable in the initial about:blank context.
          }
        })();
      `,
    });
    await navigateAndWait(client, url, "qa_gantt_seed", "zero");
    await delay(500);
    await waitForGantt(client, scenario.slotId);

    const result = await evaluate(client, (testScenario) => {
      const slot = document.querySelector(`.operation-slot[data-slot-id="${CSS.escape(testScenario.slotId)}"]:not(.aggregate-slot)`);
      const layer = slot?.querySelector(".slot-operational-layer");
      const track = layer?.querySelector(".slot-operational-track");
      const storedUi = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
      const segments = [...(track?.querySelectorAll(".slot-operational-segment") || [])].map((segment) => {
        const style = segment.getAttribute("style") || "";
        const left = Number((style.match(/--segment-left:([\d.]+)%/) || [])[1] || 0);
        const width = Number((style.match(/--segment-width:([\d.]+)%/) || [])[1] || 0);
        return {
          className: segment.className,
          text: segment.textContent.trim().replace(/\s+/g, " "),
          left,
          width,
          right: left + width,
          title: segment.getAttribute("title") || "",
        };
      });
      const overlaps = segments.filter((segment, index) => {
        if (index === 0) return false;
        return segment.left < segments[index - 1].right - 0.01;
      });
      return {
        slotFound: Boolean(slot),
        slotClassName: slot?.className || "",
        slotTitle: slot?.getAttribute("title") || "",
        layerCount: slot?.querySelectorAll(".slot-operational-layer").length || 0,
        layerClassName: layer?.className || "",
        layerTitle: layer?.getAttribute("title") || "",
        metaText: layer?.querySelector(".slot-operational-meta")?.textContent.trim().replace(/\s+/g, " ") || "",
        segments,
        overlaps,
        trackWidth: track?.getBoundingClientRect().width || 0,
        storedAssignmentKeys: Object.keys(storedUi.shiftMasterBoardAssignments || {}),
        storedFactKeys: Object.keys(storedUi.shiftMasterBoardFacts || {}),
        storedAssignment: storedUi.shiftMasterBoardAssignments?.[testScenario.slotId] || null,
        storedFact: storedUi.shiftMasterBoardFacts?.[testScenario.slotId] || null,
        storedUiSummary: {
          activeModule: storedUi.activeModule || "",
          activeRole: storedUi.activeRole || "",
          windowStart: storedUi.windowStart || "",
          scale: storedUi.scale || "",
          rowMode: storedUi.rowMode || "",
          workCenterFilter: storedUi.workCenterFilter || "",
          expandedProjects: Array.isArray(storedUi.expandedProjects) ? storedUi.expandedProjects.slice(0, 8) : [],
        },
        qaSeedMarker: localStorage.getItem(testScenario.qaSeedMarkerKey) || "",
        viewportOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth, document.body.scrollWidth - document.body.clientWidth),
      };
    }, { ...scenario, qaSeedMarkerKey });

    assert(result.slotFound, `Target Gantt slot was not found: ${scenario.slotId}`);
    assert(result.layerCount === 1, `Expected one operational layer, got ${result.layerCount}. Slot ${scenario.slotId}. Slot classes: ${result.slotClassName}. Seed marker: ${result.qaSeedMarker || "none"}. Stored UI: ${JSON.stringify(result.storedUiSummary)}. Stored assignments: ${result.storedAssignmentKeys.join(", ") || "none"} ${JSON.stringify(result.storedAssignment)}. Stored facts: ${result.storedFactKeys.join(", ") || "none"} ${JSON.stringify(result.storedFact)}`);
    assert(result.layerClassName.includes("is-master-validated"), `Operational layer is missing validation class: ${result.layerClassName}`);
    assert(result.layerClassName.includes("has-master-fact"), `Operational layer is missing fact class: ${result.layerClassName}`);
    assert(result.layerClassName.includes("has-validation-mismatch"), `Operational layer is missing validation mismatch class: ${result.layerClassName}`);
    assert(result.layerClassName.includes("has-fact-mismatch"), `Operational layer is missing fact mismatch class: ${result.layerClassName}`);
    const operationalSummaryText = normalizeQaText(result.metaText || result.layerTitle);
    assert(operationalSummaryText.includes("План 1 000 шт."), `Operational summary does not include planned quantity: ${operationalSummaryText}. Layer: ${result.layerClassName}. Track width: ${result.trackWidth}. Segments: ${JSON.stringify(result.segments)}`);
    assert(operationalSummaryText.includes("Распределено 700 шт."), `Operational summary does not include assigned quantity: ${operationalSummaryText}`);
    assert(operationalSummaryText.includes("Факт 400 шт."), `Operational summary does not include fact quantity: ${operationalSummaryText}`);
    assert(operationalSummaryText.includes("-300 к распределению"), `Operational summary does not include fact deficit: ${operationalSummaryText}`);
    assert(result.segments.length === 3, `Expected 3 operational segments, got ${result.segments.length}: ${JSON.stringify(result.segments)}`);
    assert(result.segments.some((segment) => segment.className.includes("is-fact-done") && Math.round(segment.width) === 40), `Fact segment is missing: ${JSON.stringify(result.segments)}`);
    assert(result.segments.some((segment) => segment.className.includes("is-fact-negative") && Math.round(segment.width) === 30), `Fact deficit segment is missing: ${JSON.stringify(result.segments)}`);
    assert(result.segments.some((segment) => segment.className.includes("is-assignment-rest") && Math.round(segment.width) === 30), `Plan assignment remainder segment is missing: ${JSON.stringify(result.segments)}`);
    assert(result.segments.every((segment) => segment.width > 0), `Operational segment width was not parsed or rendered: ${JSON.stringify(result.segments)}`);
    assert(result.overlaps.length === 0, `Operational segments overlap horizontally: overlaps=${JSON.stringify(result.overlaps)} all=${JSON.stringify(result.segments)}`);
    assert(result.trackWidth > 0, "Operational segment track has no visible width.");
    assert(result.viewportOverflowX === 0, `Gantt page has root horizontal overflow: ${result.viewportOverflowX}`);

    const zeroScenario = {
      ...scenario,
      assignedQuantity: 0,
      factQuantity: 0,
    };
    const zeroSeed = buildUiSeed(zeroScenario, expandedProjects);
    const zeroStateSeed = buildStateSeed(zeroScenario, bootstrapSnapshotStorageSeed);
    await navigateToStorageOrigin(client, url);
    await setLocalStorageItemsForUrl(client, url, [
      ...Object.entries(bootstrapSnapshotStorageSeed).filter(([, value]) => typeof value === "string"),
      [stateStorageKey, JSON.stringify(zeroStateSeed)],
      [uiStorageKey, JSON.stringify(zeroSeed)],
      [qaSeedMarkerKey, "zero-domstorage"],
    ]);
    await setSessionStorageItemsForUrl(client, url, [
      [sharedDisabledKey, String(Date.now() + 5 * 60 * 1000)],
    ]);
    const zeroStoredSeed = await readLocalStorageItem(client, uiStorageKey);
    assert(zeroStoredSeed.includes(zeroScenario.slotId), `Zero seed was not written to localStorage before navigation: ${zeroStoredSeed.slice(0, 240)}`);
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        (() => {
          try {
            sessionStorage.setItem(${JSON.stringify(sharedDisabledKey)}, String(Date.now() + 5 * 60 * 1000));
            localStorage.setItem(${JSON.stringify(qaSeedMarkerKey)}, ${JSON.stringify("zero-preload")});
          } catch {
            // Storage can be unavailable in the initial about:blank context.
          }
        })();
      `,
    });
    await client.send("Page.navigate", { url });
    await delay(500);
    await waitForGantt(client, zeroScenario.slotId);
	    const zeroResult = await evaluate(client, (testScenario) => {
	      const slot = document.querySelector(`.operation-slot[data-slot-id="${CSS.escape(testScenario.slotId)}"]:not(.aggregate-slot)`);
	      const layer = slot?.querySelector(".slot-operational-layer");
	      const track = layer?.querySelector(".slot-operational-track");
	      const row = slot?.closest(".gantt-row");
	      const factMetricText = row?.querySelector(".gantt-row-metric.is-fact")?.textContent.trim().replace(/\s+/g, " ") || "";
	      const segments = [...(track?.querySelectorAll(".slot-operational-segment") || [])].map((segment) => {
	        const style = segment.getAttribute("style") || "";
	        const left = Number((style.match(/--segment-left:([\d.]+)%/) || [])[1] || 0);
        const width = Number((style.match(/--segment-width:([\d.]+)%/) || [])[1] || 0);
        return {
          className: segment.className,
          text: segment.textContent.trim().replace(/\s+/g, " "),
          left,
          width,
          right: left + width,
          title: segment.getAttribute("title") || "",
        };
      });
      return {
        slotFound: Boolean(slot),
	        layerClassName: layer?.className || "",
	        layerTitle: layer?.getAttribute("title") || "",
	        metaText: layer?.querySelector(".slot-operational-meta")?.textContent.trim().replace(/\s+/g, " ") || "",
	        factMetricText,
	        segments,
	        trackWidth: track?.getBoundingClientRect().width || 0,
	      };
	    }, zeroScenario);
    assert(zeroResult.slotFound, `Zero assignment target Gantt slot was not found: ${zeroScenario.slotId}`);
    assert(zeroResult.layerClassName.includes("is-master-validated"), `Zero assignment layer is missing validation class: ${zeroResult.layerClassName}`);
    const zeroSummaryText = normalizeQaText(zeroResult.metaText || zeroResult.layerTitle);
    assert(zeroSummaryText.includes("План 1 000 шт."), `Zero assignment summary does not include plan: ${zeroSummaryText}`);
    assert(zeroSummaryText.includes("Распределено 0 шт."), `Zero assignment summary does not keep explicit zero: ${zeroSummaryText}`);
    assert(!zeroSummaryText.includes("+1"), `Zero assignment summary contains false +1 fallback: ${zeroSummaryText}`);
	    assert(zeroResult.segments.length === 1, `Zero assignment should render one full deficit segment: ${JSON.stringify(zeroResult.segments)}`);
	    assert(zeroResult.segments[0]?.className.includes("is-assignment-rest"), `Zero assignment segment has wrong tone: ${JSON.stringify(zeroResult.segments)}`);
	    assert(zeroResult.segments[0]?.left === 0 && zeroResult.segments[0]?.width === 100, `Zero assignment segment should cover full bar: ${JSON.stringify(zeroResult.segments)}`);
	    assert(zeroResult.factMetricText !== "1", `Zero fact row metric regressed to normalizeQuantity fallback: ${zeroResult.factMetricText}`);
	    assert(zeroResult.trackWidth > 0, "Zero assignment segment track has no visible width.");

    console.log("Gantt Operational Layer QA OK");
    console.log(JSON.stringify({
      slotId: scenario.slotId,
      planned: scenario.plannedQuantity,
      assigned: scenario.assignedQuantity,
      fact: scenario.factQuantity,
      metaText: result.metaText,
      zeroMetaText: zeroResult.metaText,
      segments: result.segments.map((segment) => ({
        className: segment.className,
        text: segment.text,
        left: segment.left,
        width: segment.width,
      })),
    }, null, 2));
  } finally {
    await cleanupChrome(chrome);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
