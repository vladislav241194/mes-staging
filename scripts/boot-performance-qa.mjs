import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const defaultModule = getArg("--module", "gantt");
const defaultUrlObject = new URL("/", process.env.MES_QA_URL || "http://localhost:4174/");
defaultUrlObject.searchParams.set("module", defaultModule);
defaultUrlObject.searchParams.set("qa-auth-bypass", "1");
defaultUrlObject.searchParams.set("qa", "boot-performance");
const defaultUrl = defaultUrlObject.toString();
const bootStorageKey = "mes-boot-performance-last";
const sharedSyncStorageKey = "mes-shared-state-sync-last";
const bootErrorStorageKey = "mes-boot-performance-error";
const sharedDisabledKey = "mes-planning-prototype-shared-disabled-until-v1";
const systemDomainsStorageKey = "mes-planning-prototype-system-domains-v1";
const systemDomainsPrimaryTombstoneKey = "mes-planning-prototype-system-domains-primary-tombstone-v1";
const startupTotalBudgetMs = 15000;
const loadStateBudgetMs = 5000;
const firstRenderBudgetMs = 6000;
const navigationDirectModules = ["planning", "weeklyProductionControl", "gantt"];
const navigationSequence = ["planning", "shiftWorkOrders", "weeklyProductionControl", "gantt"];
const navigationDirectReadyBudgetMs = Number(process.env.MES_QA_NAV_DIRECT_READY_BUDGET_MS || 12000);
const navigationTransitionReadyBudgetMs = Number(process.env.MES_QA_NAV_TRANSITION_READY_BUDGET_MS || 6000);
const navigationExpectedProjectionSource = String(process.env.MES_QA_NAV_EXPECT_PLANNING_SOURCE || "").trim();
const navigationRequiresServerProjection = process.argv.includes("--require-server-projection");
const navigationRouteContracts = {
  planning: {
    selectors: [".planning-order-page", ".planning-empty-page"],
    endpoint: "/api/v1/planning/work-orders/bootstrap",
    projection: {
      selector: "[data-planning-projection-source]",
      attribute: "data-planning-projection-source",
    },
  },
  shiftWorkOrders: {
    selectors: [".shift-work-orders-page"],
  },
  weeklyProductionControl: {
    selectors: [".weekly-production-control-panel"],
    endpoint: "/api/v1/planning/period",
  },
  gantt: {
    selectors: [
      "[data-react-gantt-island][data-react-island-state='ready']",
      ".gantt-react-scroll[data-ui-component='GanttRuntime']",
    ],
    endpoint: "/api/v1/planning/work-orders/projection",
    projection: {
      selector: "[data-gantt-planning-projection-source]",
      attribute: "data-gantt-planning-projection-source",
    },
  },
};
const defaultReportPath = join(process.cwd(), "reports", "performance", "boot-performance-latest.json");
const repeatedStartupMigrationSteps = new Set([
  "applyMesOrgStructureDefaults",
  "ensureStatusDirectoryDefaults",
  "migrateDepartmentsToUnifiedWorkCenters",
  "migrateProjectEntityToSpecifications",
  "migrateSpecificationBomRowsToNomenclature",
  "syncNomenclatureTypesFromItems",
  "migratePlanningManualLaborUiToRoutes",
  "recoverPlanningStateFromStorageIfRuntimeEmpty",
  "migrateLegacyOperationsToDirectory",
  "ensureWorkCenterOperations",
]);

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
    await stat(path);
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
    this.listeners = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.onMessage(event));
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    if (!message.id) {
      (this.listeners.get(message.method) || []).forEach((listener) => listener(message.params || {}));
      return;
    }
    if (!this.pending.has(message.id)) return;
    const { resolve, reject } = this.pending.get(message.id);
    this.pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
    else resolve(message.result || {});
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
    return () => {
      this.listeners.set(method, (this.listeners.get(method) || []).filter((item) => item !== listener));
    };
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function launchChrome() {
  const chromePath = await findChrome();
  const port = await getFreePort();
  const profileDir = await mkdtemp(join(tmpdir(), "mes-boot-performance-qa-"));
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

async function waitForBootReport(client) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < startupTotalBudgetMs + 5000) {
    const report = await evaluate(client, (storageKey) => {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }, bootStorageKey);
    if (report?.totalMs) return report;
    await delay(120);
  }
  throw new Error("Boot performance report was not written to sessionStorage.");
}

async function waitForSharedSyncReport(client) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < startupTotalBudgetMs + 10000) {
    const report = await evaluate(client, (storageKey) => {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }, sharedSyncStorageKey);
    if (report?.status && report.status !== "started") return report;
    await delay(120);
  }
  throw new Error("Shared-state sync performance report was not written to sessionStorage.");
}

async function waitForFontIndependentFirstFrame(client) {
  const startedAt = Date.now();
  let lastState = null;
  while (Date.now() - startedAt < 3000) {
    lastState = await evaluate(client, () => {
      const firstFrame = window.__MES_QA_FONT_FIRST_FRAME__ || null;
      if (firstFrame) return firstFrame;
      return null;
    });
    if (lastState) return lastState;
    await delay(30);
  }
  throw new Error("App did not produce a first frame while the web font was unavailable.");
}

async function waitForFontIndependentVisibleApp(client) {
  const startedAt = Date.now();
  let lastState = null;
  while (Date.now() - startedAt < 3000) {
    lastState = await evaluate(client, () => {
      const app = document.querySelector("#app");
      const overlay = document.querySelector("[data-mes-boot-overlay]");
      return {
        appHasContent: Boolean(app?.children.length),
        appVisibility: app ? getComputedStyle(app).visibility : "missing",
        appDisplay: app ? getComputedStyle(app).display : "missing",
        bootOverlayPresent: Boolean(overlay),
      };
    });
    if (lastState.appHasContent
      && lastState.appVisibility !== "hidden"
      && lastState.appDisplay !== "none"
      && !lastState.bootOverlayPresent) return lastState;
    await delay(30);
  }
  throw new Error(`App did not become fully visible without the web font: ${JSON.stringify(lastState)}`);
}

async function waitForDeferredSystemDomains(client) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    const summary = await evaluate(client, ({ storageKey, primaryTombstoneKey, sharedDisabledKey }) => {
      try {
        const raw = localStorage.getItem(storageKey) || "";
        const domains = JSON.parse(raw || "{}");
        const registries = domains?.registries || {};
        const primaryTombstone = sessionStorage.getItem(primaryTombstoneKey) === "1";
        const sharedHandshakeDeferred = !raw && Number(sessionStorage.getItem(sharedDisabledKey) || 0) > Date.now();
        return {
          authority: primaryTombstone
            ? "postgres-primary-tombstone"
            : sharedHandshakeDeferred
              ? "compatibility-discovery-deferred"
              : "compatibility-migration",
          employees: Array.isArray(registries.employees) ? registries.employees.length : 0,
          workCenters: Array.isArray(registries.workCenters) ? registries.workCenters.length : 0,
        };
      } catch {
        return null;
      }
    }, {
      storageKey: systemDomainsStorageKey,
      primaryTombstoneKey: systemDomainsPrimaryTombstoneKey,
      sharedDisabledKey,
    });
    if (["postgres-primary-tombstone", "compatibility-discovery-deferred"].includes(summary?.authority)
      || (summary?.employees > 0 && summary?.workCenters > 0)) return summary;
    await delay(120);
  }
  throw new Error("Deferred System Domains migration did not finish for a blank browser profile.");
}

async function waitForWeeklyRuntime(client) {
  const startedAt = Date.now();
  let lastState = null;
  while (Date.now() - startedAt < 10000) {
    lastState = await evaluate(client, () => ({
      loaded: Boolean(document.querySelector(".weekly-production-control-panel")),
      startupError: document.body?.innerText?.includes("Интерфейс не удалось запустить") || false,
      loadingText: document.body?.innerText?.includes("Загружаем модуль") || false,
    }));
    if (lastState.startupError) {
      throw new Error("Weekly control entered the startup-error boundary while its lazy runtime was loading.");
    }
    if (lastState.loaded) return lastState;
    await delay(80);
  }
  throw new Error(`Weekly control runtime did not render after lazy load: ${JSON.stringify(lastState)}`);
}

function makeNavigationQaUrl(moduleId, phase) {
  const url = new URL("/", process.env.MES_QA_URL || "http://localhost:4174/");
  url.searchParams.set("module", moduleId);
  url.searchParams.set("qa-auth-bypass", "1");
  url.searchParams.set("qa", "navigation-contract");
  url.searchParams.set("qa_phase", phase);
  return url.toString();
}

function countRequestPath(requests, pathname) {
  return requests.filter((request) => request.pathname === pathname).length;
}

function assertSuccessfulApiRequests(requests, pathname, expectedCount, scope) {
  const matches = requests.filter((request) => request.pathname === pathname);
  assert(matches.length === expectedCount,
    `${scope} must request ${pathname} ${expectedCount} time(s): ${JSON.stringify(matches)}`);
  const unsuccessful = matches.filter((request) => request.failed || !Number.isFinite(request.status) || request.status < 200 || request.status >= 300);
  assert(unsuccessful.length === 0,
    `${scope} must receive successful ${pathname} response(s): ${JSON.stringify(unsuccessful)}`);
}

async function waitForApiResponses(events, pathname, expectedCount, scope) {
  const startedAt = Date.now();
  let matches = [];
  while (Date.now() - startedAt < navigationTransitionReadyBudgetMs) {
    matches = events.requests.filter((request) => request.pathname === pathname);
    if (matches.length === expectedCount && matches.every((request) => request.failed || Number.isFinite(request.status))) return;
    await delay(40);
  }
  throw new Error(`${scope} did not complete ${pathname} request(s): ${JSON.stringify(matches)}`);
}

function getExpectedNavigationProjectionSource() {
  if (navigationRequiresServerProjection) return "server";
  return navigationExpectedProjectionSource;
}

function assertKnownNavigationProjectionSource(source, scope) {
  assert(["server", "snapshot-fallback"].includes(source),
    `${scope} must expose an applied Planning projection source, received ${JSON.stringify(source)}.`);
  const expected = getExpectedNavigationProjectionSource();
  if (expected) {
    assert(source === expected,
      `${scope} must apply ${expected} Planning projection, received ${source}.`);
  }
}

function getNavigationProjectionSource(probe, moduleId) {
  if (moduleId === "planning") return probe.planningProjectionSource || "";
  if (moduleId === "gantt") return probe.ganttProjectionSource || "";
  return "";
}

async function setupNavigationContractPage(client, events) {
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Network.enable");
  client.on("Network.requestWillBeSent", (params) => {
    const url = String(params.request?.url || "");
    try {
      const request = {
        requestId: String(params.requestId || ""),
        pathname: new URL(url).pathname,
        url,
        status: null,
        failed: "",
      };
      events.requests.push(request);
      events.requestsById.set(request.requestId, request);
    } catch {
      // Ignore opaque browser-internal URLs.
    }
  });
  client.on("Network.responseReceived", (params) => {
    const request = events.requestsById.get(String(params.requestId || ""));
    if (request) request.status = Number(params.response?.status || 0);
  });
  client.on("Network.loadingFailed", (params) => {
    const request = events.requestsById.get(String(params.requestId || ""));
    if (request) request.failed = String(params.errorText || "Network request failed");
  });
  client.on("Runtime.exceptionThrown", (params) => {
    events.runtimeExceptions.push(String(params.exceptionDetails?.text || "Runtime exception"));
  });
  client.on("Runtime.consoleAPICalled", (params) => {
    if (!["error", "assert"].includes(String(params.type || ""))) return;
    events.consoleErrors.push((params.args || []).map((arg) => arg.value ?? arg.description ?? "").join(" "));
  });
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      (() => {
        window.__MES_NAVIGATION_QA__ = {
          documentId: globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random(),
          errors: [],
        };
        window.addEventListener("error", (event) => {
          window.__MES_NAVIGATION_QA__.errors.push(String(event.error?.stack || event.message || "window error"));
        });
        window.addEventListener("unhandledrejection", (event) => {
          window.__MES_NAVIGATION_QA__.errors.push(String(event.reason?.stack || event.reason || "unhandled rejection"));
        });
      })();
    `,
  });
}

async function setNavigationContractViewport(client) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1556,
    height: 1006,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function readNavigationProbe(client) {
  return evaluate(client, () => {
    const shell = document.querySelector("main.app-shell[data-layout-page]");
    const qa = window.__MES_NAVIGATION_QA__ || {};
    const navigation = performance.getEntriesByType("navigation");
    return {
      documentId: qa.documentId || "",
      errors: Array.isArray(qa.errors) ? qa.errors : [],
      module: new URL(window.location.href).searchParams.get("module") || "",
      layoutPage: shell?.dataset?.layoutPage || "",
      timeOrigin: Number(performance.timeOrigin || 0),
      navigationCount: navigation.length,
      planningProjectionSource: document.querySelector("[data-planning-projection-source]")?.getAttribute("data-planning-projection-source") || "",
      ganttProjectionSource: document.querySelector("[data-gantt-planning-projection-source]")?.getAttribute("data-gantt-planning-projection-source") || "",
      bodyText: String(document.body?.innerText || "").slice(0, 1200),
      render: window.__MES_RENDER_PERFORMANCE__ || null,
    };
  });
}

async function waitForNavigationRoute(client, moduleId, budgetMs) {
  const contract = navigationRouteContracts[moduleId];
  assert(contract, `Missing navigation contract for ${moduleId}.`);
  const startedAt = Date.now();
  let lastProbe = null;
  while (Date.now() - startedAt < budgetMs) {
    lastProbe = await evaluate(client, ({ selectors, projection }) => {
      const shell = document.querySelector("main.app-shell[data-layout-page]");
      const isVisible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const readySelector = selectors.find((selector) => isVisible(document.querySelector(selector))) || "";
      const projectionSource = projection
        ? (document.querySelector(projection.selector)?.getAttribute(projection.attribute) || "")
        : "";
      const bodyText = String(document.body?.innerText || "");
      return {
        module: new URL(window.location.href).searchParams.get("module") || "",
        layoutPage: shell?.dataset?.layoutPage || "",
        readySelector,
        projectionSource,
        startupError: bodyText.includes("Интерфейс не удалось запустить")
          || bodyText.includes("Не удалось загрузить график")
          || bodyText.includes("Модуль недоступен"),
        bodyLength: bodyText.length,
      };
    }, { selectors: contract.selectors, projection: contract.projection || null });
    if (lastProbe.startupError) {
      throw new Error(`Route ${moduleId} entered a startup-error boundary: ${JSON.stringify(lastProbe)}`);
    }
    if (lastProbe.module === moduleId
      && lastProbe.layoutPage === moduleId
      && lastProbe.readySelector
      && (!contract.projection
        || !getExpectedNavigationProjectionSource()
        || lastProbe.projectionSource === getExpectedNavigationProjectionSource())
      && lastProbe.bodyLength > 40) {
      return { ...lastProbe, readyMs: Date.now() - startedAt };
    }
    await delay(80);
  }
  throw new Error(`Route ${moduleId} did not become ready in ${budgetMs} ms: ${JSON.stringify(lastProbe)}`);
}

async function clickNavigationModuleTab(client, moduleId) {
  const target = await evaluate(client, (targetModule) => {
    const isVisible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const candidates = [...document.querySelectorAll(`.module-tabs .module-tab[data-module="${targetModule}"]`)];
    const button = candidates.find(isVisible);
    if (!button) {
      return {
        availableModules: [...document.querySelectorAll(".module-tabs .module-tab[data-module]")]
          .map((element) => ({
            module: element.dataset.module || "",
            visible: isVisible(element),
          })),
      };
    }
    button.scrollIntoView({ block: "nearest", inline: "nearest" });
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, moduleId);
  assert(target && Number.isFinite(target.x) && Number.isFinite(target.y),
    `Visible module tab is missing for ${moduleId}: ${JSON.stringify(target?.availableModules || [])}`);
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: target.x, y: target.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1 });
}

async function ensureNavigationMenuVisible(client) {
  const inspect = () => evaluate(client, () => {
    const isVisible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const visibleModuleTabs = [...document.querySelectorAll(".module-tabs .module-tab[data-module]")]
      .filter(isVisible)
      .map((element) => element.dataset.module || "");
    const focusToggle = [...document.querySelectorAll("[data-toggle-focus-mode]")]
      .find(isVisible);
    if (visibleModuleTabs.length) return { visibleModuleTabs, focusToggle: null };
    if (!focusToggle) return { visibleModuleTabs, focusToggle: null };
    const rect = focusToggle.getBoundingClientRect();
    return {
      visibleModuleTabs,
      focusToggle: {
        pressed: focusToggle.getAttribute("aria-pressed") || "",
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      },
    };
  });
  const initial = await inspect();
  if (initial.visibleModuleTabs.length) return;
  assert(initial.focusToggle?.pressed === "true", `Module navigation is not visible and focus mode cannot be exited: ${JSON.stringify(initial)}`);
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: initial.focusToggle.x,
    y: initial.focusToggle.y,
    button: "left",
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: initial.focusToggle.x,
    y: initial.focusToggle.y,
    button: "left",
    clickCount: 1,
  });
  const startedAt = Date.now();
  let final = initial;
  while (Date.now() - startedAt < navigationTransitionReadyBudgetMs) {
    final = await inspect();
    if (final.visibleModuleTabs.length) return;
    await delay(80);
  }
  throw new Error(`Module navigation stayed hidden after exiting focus mode: ${JSON.stringify(final)}`);
}

function assertNavigationNoErrors(events, probe, scope) {
  assert(events.runtimeExceptions.length === 0, `${scope} raised runtime exceptions: ${JSON.stringify(events.runtimeExceptions)}`);
  assert(events.consoleErrors.length === 0, `${scope} logged console errors: ${JSON.stringify(events.consoleErrors)}`);
  assert((probe.errors || []).length === 0, `${scope} raised window errors: ${JSON.stringify(probe.errors)}`);
}

async function runNavigationContract() {
  const reportPath = getArg("--report", join(process.cwd(), "reports", "performance", "navigation-latest.json"));
  if (navigationRequiresServerProjection) {
    assert(String(process.env.MES_QA_URL || "").trim(),
      "Server navigation QA requires MES_QA_URL to point at the running server environment.");
  }
  const direct = [];
  for (const moduleId of navigationDirectModules) {
    const chrome = await launchChrome();
    try {
      const events = { requests: [], requestsById: new Map(), runtimeExceptions: [], consoleErrors: [] };
      await setupNavigationContractPage(chrome.client, events);
      await setNavigationContractViewport(chrome.client);
      const startedAt = Date.now();
      await chrome.client.send("Page.navigate", { url: makeNavigationQaUrl(moduleId, `direct-${moduleId}`) });
      const ready = await waitForNavigationRoute(chrome.client, moduleId, navigationDirectReadyBudgetMs);
      const expectedEndpoint = navigationRouteContracts[moduleId].endpoint;
      if (expectedEndpoint) await waitForApiResponses(events, expectedEndpoint, 1, `Direct ${moduleId}`);
      await delay(180);
      const probe = await readNavigationProbe(chrome.client);
      assertNavigationNoErrors(events, probe, `Direct ${moduleId}`);
      if (navigationRouteContracts[moduleId].projection) {
        assertKnownNavigationProjectionSource(getNavigationProjectionSource(probe, moduleId), `Direct ${moduleId}`);
      }
      assert(ready.readyMs <= navigationDirectReadyBudgetMs, `Direct ${moduleId} took ${ready.readyMs} ms, budget is ${navigationDirectReadyBudgetMs} ms.`);
      if (expectedEndpoint) {
        assertSuccessfulApiRequests(events.requests, expectedEndpoint, 1, `Direct ${moduleId}`);
      }
      if (moduleId === "gantt") {
        assert(countRequestPath(events.requests, "/api/v1/planning/work-orders/bootstrap") === 0,
          `Direct Gantt must not request the Planning workbench bootstrap: ${JSON.stringify(events.requests)}`);
      }
      direct.push({
        module: moduleId,
        readyMs: Date.now() - startedAt,
        route: ready,
        requests: events.requests,
        render: probe.render,
      });
    } finally {
      await cleanupChrome(chrome);
    }
  }

  const chrome = await launchChrome();
  let sequence;
  try {
    const events = { requests: [], requestsById: new Map(), runtimeExceptions: [], consoleErrors: [] };
    await setupNavigationContractPage(chrome.client, events);
    await setNavigationContractViewport(chrome.client);
    await chrome.client.send("Page.navigate", { url: makeNavigationQaUrl("planning", "sequence") });
    const firstReady = await waitForNavigationRoute(chrome.client, "planning", navigationDirectReadyBudgetMs);
    await waitForApiResponses(events, "/api/v1/planning/work-orders/bootstrap", 1, "Sequence initial Planning");
    await ensureNavigationMenuVisible(chrome.client);
    const firstProbe = await readNavigationProbe(chrome.client);
    assertNavigationNoErrors(events, firstProbe, "Sequence initial Planning");
    assertSuccessfulApiRequests(events.requests, "/api/v1/planning/work-orders/bootstrap", 1, "Sequence initial Planning");
    assertKnownNavigationProjectionSource(getNavigationProjectionSource(firstProbe, "planning"), "Sequence initial Planning");
    const stableDocument = {
      documentId: firstProbe.documentId,
      timeOrigin: firstProbe.timeOrigin,
      navigationCount: firstProbe.navigationCount,
    };
    const transitions = [{
      module: "planning",
      readyMs: firstReady.readyMs,
      route: firstReady,
      requests: events.requests.slice(),
      render: firstProbe.render,
    }];
    for (const moduleId of navigationSequence.slice(1)) {
      const requestStart = events.requests.length;
      await clickNavigationModuleTab(chrome.client, moduleId);
      const ready = await waitForNavigationRoute(chrome.client, moduleId, navigationTransitionReadyBudgetMs);
      const requestDelta = events.requests.slice(requestStart);
      if (moduleId === "weeklyProductionControl") {
        await waitForApiResponses({ requests: requestDelta }, "/api/v1/planning/period", 1, "Weekly transition");
      }
      if (moduleId === "gantt") {
        await waitForApiResponses({ requests: requestDelta }, "/api/v1/planning/work-orders/projection", 1, "Gantt transition");
      }
      const probe = await readNavigationProbe(chrome.client);
      assertNavigationNoErrors(events, probe, `Sequence transition to ${moduleId}`);
      if (navigationRouteContracts[moduleId].projection) {
        assertKnownNavigationProjectionSource(getNavigationProjectionSource(probe, moduleId), `Sequence transition to ${moduleId}`);
      }
      assert(probe.documentId === stableDocument.documentId, `Navigation to ${moduleId} reloaded the document.`);
      assert(probe.timeOrigin === stableDocument.timeOrigin, `Navigation to ${moduleId} changed performance.timeOrigin.`);
      assert(probe.navigationCount === stableDocument.navigationCount, `Navigation to ${moduleId} created a document navigation.`);
      assert(ready.readyMs <= navigationTransitionReadyBudgetMs,
        `Transition to ${moduleId} took ${ready.readyMs} ms, budget is ${navigationTransitionReadyBudgetMs} ms.`);
      if (moduleId === "weeklyProductionControl") {
        assertSuccessfulApiRequests(requestDelta, "/api/v1/planning/period", 1, "Weekly transition");
      }
      if (moduleId === "gantt") {
        assertSuccessfulApiRequests(requestDelta, "/api/v1/planning/work-orders/projection", 1, "Gantt transition");
        assert(countRequestPath(requestDelta, "/api/v1/planning/work-orders/bootstrap") === 0,
          `Gantt transition must not request another workbench bootstrap: ${JSON.stringify(requestDelta)}`);
      }
      transitions.push({ module: moduleId, readyMs: ready.readyMs, route: ready, requests: requestDelta, render: probe.render });
    }
    sequence = { stableDocument, transitions, requests: events.requests };
  } finally {
    await cleanupChrome(chrome);
  }

  const audit = {
    checkedAt: new Date().toISOString(),
    expectedProjectionSource: getExpectedNavigationProjectionSource() || "any-applied-source",
    directReadyBudgetMs: navigationDirectReadyBudgetMs,
    transitionReadyBudgetMs: navigationTransitionReadyBudgetMs,
    direct,
    sequence,
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(audit, null, 2)}\n`);
  console.log("MES navigation performance QA");
  direct.forEach((entry) => console.log(`- direct ${entry.module}: ${entry.route.readyMs} ms`));
  sequence.transitions.forEach((entry) => console.log(`- SPA ${entry.module}: ${entry.readyMs} ms`));
  console.log(`- report: ${reportPath}`);
  console.log("OK: direct and SPA navigation contracts are within guard budgets.");
}

function getStep(report, stepName) {
  return (report.entries || []).find((entry) => entry.step === stepName) || null;
}

function getStepMs(step = null) {
  const value = Number(step?.ms);
  return Number.isFinite(value) ? value : null;
}

async function main() {
  if (process.argv.includes("--navigation-contract")) {
    await runNavigationContract();
    return;
  }
  const expectQaInspector = process.argv.includes("--expect-qa-inspector");
  const inspectorUrl = new URL(defaultUrl);
  if (expectQaInspector) inspectorUrl.searchParams.set("qa_inspector", "1");
  const url = getArg("--url", inspectorUrl.toString());
  const reportPath = getArg("--report", defaultReportPath);
  const withSharedState = process.argv.includes("--with-shared-state");
  const blockFont = process.argv.includes("--block-font");
  const trackWeeklyPeriodRequests = defaultModule === "weeklyProductionControl";
  const verifyWarmStart = !process.argv.includes("--skip-warm-start-check");
  const chrome = await launchChrome();
  try {
    const { client } = chrome;
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    const fontRequests = new Map();
    const blockedFontRequests = [];
    const weeklyPeriodRequests = [];
    if (blockFont || trackWeeklyPeriodRequests) {
      await client.send("Network.enable");
    }
    if (trackWeeklyPeriodRequests) {
      client.on("Network.requestWillBeSent", (params) => {
        const url = String(params.request?.url || "");
        if (new URL(url).pathname === "/api/v1/planning/period") {
          weeklyPeriodRequests.push(url);
        }
      });
    }
    if (blockFont) {
      client.on("Network.requestWillBeSent", (params) => {
        const url = String(params.request?.url || "");
        if (url.includes("Onest-Variable.woff2")) fontRequests.set(params.requestId, url);
      });
      client.on("Network.loadingFailed", (params) => {
        const url = fontRequests.get(params.requestId);
        if (url) blockedFontRequests.push({ url, errorText: String(params.errorText || "") });
      });
      await client.send("Network.setBlockedURLs", { urls: ["*Onest-Variable.woff2*"] });
      await client.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `
          (() => {
            let appObserver = null;
            const captureFirstFrame = (app) => {
              if (!app || window.__MES_QA_FONT_FIRST_FRAME__ || !app.children.length) return;
              const style = getComputedStyle(app);
              window.__MES_QA_FONT_FIRST_FRAME__ = {
                appHasContent: true,
                appVisibility: style.visibility,
                appDisplay: style.display,
                bootOverlayPresent: Boolean(document.querySelector("[data-mes-boot-overlay]")),
                atMs: Number(performance.now().toFixed(2)),
              };
              appObserver?.disconnect();
            };
            const attach = () => {
              const app = document.querySelector("#app");
              if (!app || app.__mesQaFontObserverAttached) return;
              app.__mesQaFontObserverAttached = true;
              appObserver = new MutationObserver(() => captureFirstFrame(app));
              appObserver.observe(app, { childList: true });
              captureFirstFrame(app);
            };
            const observeRoot = () => {
              const root = document.documentElement;
              if (!root) {
                document.addEventListener("DOMContentLoaded", observeRoot, { once: true });
                return;
              }
              new MutationObserver(attach).observe(root, { childList: true, subtree: true });
              attach();
            };
            observeRoot();
          })();
        `,
      });
    }
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        window.addEventListener("error", (event) => {
          sessionStorage.setItem(${JSON.stringify(bootErrorStorageKey)}, String(event.error?.stack || event.message || "window error"));
        });
        window.addEventListener("unhandledrejection", (event) => {
          sessionStorage.setItem(${JSON.stringify(bootErrorStorageKey)}, String(event.reason?.stack || event.reason || "unhandled rejection"));
        });
      `,
    });
    if (!withSharedState) {
      await client.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `sessionStorage.setItem(${JSON.stringify(sharedDisabledKey)}, String(Date.now() + 60 * 60 * 1000));`,
      });
    }
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1556,
      height: 1006,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send("Page.navigate", { url });
    const fontFirstFrame = blockFont ? await waitForFontIndependentFirstFrame(client) : null;
    let report;
    try {
      report = await waitForBootReport(client);
    } catch (error) {
      const diagnostics = await evaluate(client, (errorStorageKey) => ({
        error: sessionStorage.getItem(errorStorageKey),
        title: document.title,
        body: document.body?.innerText?.slice(0, 1800) || "",
      }), bootErrorStorageKey).catch(() => null);
      if (diagnostics) console.error(`Boot diagnostics: ${JSON.stringify(diagnostics)}`);
      throw error;
    }
    const sharedSync = withSharedState ? await waitForSharedSyncReport(client) : null;
    const deferredSystemDomains = withSharedState ? null : await waitForDeferredSystemDomains(client);
    const weeklyRuntime = defaultModule === "weeklyProductionControl" ? await waitForWeeklyRuntime(client) : null;
    if (trackWeeklyPeriodRequests) await delay(1200);
    const fontVisibility = blockFont ? await waitForFontIndependentVisibleApp(client) : null;
    if (expectQaInspector) {
      const inspectorLoaded = await evaluate(client, () => Boolean(document.querySelector('[data-mes-qa-ui="launcher"]')));
      assert(inspectorLoaded, "QA-инспектор не загрузился по требованию.");
    }
    let warmBoot = null;
    if (verifyWarmStart) {
      await evaluate(client, (storageKey) => sessionStorage.removeItem(storageKey), bootStorageKey);
      await client.send("Page.reload", { ignoreCache: false });
      warmBoot = await waitForBootReport(client);
      const repeatedMigrations = (warmBoot.entries || [])
        .map((entry) => entry.step)
        .filter((step) => repeatedStartupMigrationSteps.has(step));
      assert(repeatedMigrations.length === 0,
        `One-time startup migrations ran again after reload: ${repeatedMigrations.join(", ")}`);
    }
    const loadState = getStep(report, "loadState");
    const firstRender = getStep(report, "first render");
    const staticImports = getStep(report, "static imports before app timer");
    const loadStateMs = getStepMs(loadState);
    const firstRenderMs = getStepMs(firstRender);
    const staticImportsMs = getStepMs(staticImports);
    const stepNames = (report.entries || []).map((entry) => entry.step).join(", ");
    const navigation = await evaluate(client, () => {
      const entry = performance.getEntriesByType("navigation")[0];
      return entry ? {
        domContentLoadedMs: Number(entry.domContentLoadedEventEnd?.toFixed?.(2) || 0),
        loadEventMs: Number(entry.loadEventEnd?.toFixed?.(2) || 0),
        transferBytes: Number(entry.transferSize || 0),
        encodedBodyBytes: Number(entry.encodedBodySize || 0),
        decodedBodyBytes: Number(entry.decodedBodySize || 0),
      } : null;
    });
    const resourceSummary = await evaluate(client, () => performance.getEntriesByType("resource")
      .reduce((summary, entry) => {
        const initiator = entry.initiatorType || "other";
        summary.count += 1;
        summary.transferBytes += Number(entry.transferSize || 0);
        summary.encodedBodyBytes += Number(entry.encodedBodySize || 0);
        summary.byInitiator[initiator] = (summary.byInitiator[initiator] || 0) + 1;
        try {
          const url = new URL(entry.name);
          summary.entries.push({
            path: url.pathname,
            initiator,
            transferBytes: Number(entry.transferSize || 0),
          });
        } catch {
          // Ignore malformed third-party resource entries in diagnostics.
        }
        return summary;
      }, { count: 0, transferBytes: 0, encodedBodyBytes: 0, byInitiator: {}, entries: [] }));

    assert(report.totalMs <= startupTotalBudgetMs, `Startup took ${report.totalMs} ms, budget is ${startupTotalBudgetMs} ms.`);
    assert(loadStateMs !== null && loadStateMs <= loadStateBudgetMs, `loadState took ${loadStateMs ?? "unknown"} ms, budget is ${loadStateBudgetMs} ms. Steps: ${stepNames}`);
    assert(firstRenderMs !== null && firstRenderMs <= firstRenderBudgetMs, `first render took ${firstRenderMs ?? "unknown"} ms, budget is ${firstRenderBudgetMs} ms. Steps: ${stepNames}`);
    if (blockFont) {
      assert(fontFirstFrame?.appHasContent, "App did not render while the web font was unavailable.");
      assert(fontFirstFrame?.appVisibility !== "hidden" && fontFirstFrame?.appDisplay !== "none",
        `App first frame remained hidden while the web font was unavailable: ${JSON.stringify(fontFirstFrame)}`);
      assert(!fontVisibility?.bootOverlayPresent, "Boot overlay remained visible after the first render while the web font was unavailable.");
      assert(blockedFontRequests.length > 0,
        `The expected web-font request was not blocked: ${JSON.stringify([...fontRequests.values()])}`);
    }
    if (trackWeeklyPeriodRequests) {
      assert(weeklyPeriodRequests.length === 1,
        `Weekly control must request its period once during a cold boot, got ${weeklyPeriodRequests.length}: ${JSON.stringify({ weeklyPeriodRequests })}`);
    }

    const audit = {
      checkedAt: new Date().toISOString(),
      url,
      module: defaultModule,
      coldProfile: true,
      withSharedState,
      fontBlocked: blockFont,
      budgets: {
        startupTotalMs: startupTotalBudgetMs,
        loadStateMs: loadStateBudgetMs,
        firstRenderMs: firstRenderBudgetMs,
      },
      boot: report,
      navigation,
      resources: resourceSummary,
      deferredSystemDomains,
      weeklyRuntime,
      weeklyPeriodRequests,
      fontFirstFrame,
      fontVisibility,
      blockedFontRequests,
      sharedStateSync: sharedSync,
      warmBoot: warmBoot ? {
        totalMs: warmBoot.totalMs,
        staticImportsMs: warmBoot.staticImportsMs,
        entries: warmBoot.entries,
      } : null,
    };
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(audit, null, 2)}\n`);

    console.log("MES Boot Performance QA");
    console.log(`- total: ${report.totalMs} ms`);
    console.log(`- static imports: ${staticImportsMs ?? "n/a"} ms`);
    console.log(`- loadState: ${loadStateMs ?? "n/a"} ms`);
    console.log(`- first render: ${firstRenderMs ?? "n/a"} ms`);
    console.log(`- entries: ${(report.entries || []).length}`);
    console.log(`- resources: ${resourceSummary.count}, ${resourceSummary.transferBytes} B transferred`);
    if (deferredSystemDomains) {
      console.log(deferredSystemDomains.authority === "postgres-primary-tombstone"
        ? "- deferred System Domains: PostgreSQL-primary tombstone preserved; compatibility snapshot not recreated"
        : deferredSystemDomains.authority === "compatibility-discovery-deferred"
          ? "- deferred System Domains: shared handshake intentionally disabled; compatibility snapshot not guessed or recreated"
          : `- deferred System Domains: ${deferredSystemDomains.workCenters} work centers, ${deferredSystemDomains.employees} employees`);
    }
    if (warmBoot) {
      console.log(`- warm reload: ${warmBoot.totalMs} ms; one-time migrations skipped`);
    }
    if (fontVisibility) {
      console.log(`- font-blocked first frame: ${fontFirstFrame.appVisibility} at ${fontFirstFrame.atMs} ms; overlay ${fontVisibility.bootOverlayPresent ? "visible" : "removed"}`);
    }
    console.log(`- report: ${reportPath}`);
    if (sharedSync) {
      assert(sharedSync.status === "synchronized" || sharedSync.status === "initialized" || sharedSync.status === "bootstrapped",
        `Shared-state sync did not complete: ${sharedSync.status}${sharedSync.message ? ` (${sharedSync.message})` : ""}.`);
      console.log(`- shared-state sync: ${sharedSync.durationMs} ms (${sharedSync.status}, apply ${sharedSync.applyMs ?? "n/a"} ms, version ${sharedSync.version ?? "n/a"})`);
      const renderProfile = await evaluate(client, () => window.__MES_RENDER_PERFORMANCE__ || null);
      if (renderProfile?.totalMs) {
        const phases = (renderProfile.entries || []).map((entry) => `${entry.name} ${entry.ms}ms`).join(", ");
        console.log(`- synchronized ${renderProfile.module} render: ${renderProfile.totalMs} ms (${phases})`);
      }
    }
    console.log("OK: boot performance is within guard budgets.");
  } finally {
    await cleanupChrome(chrome);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
