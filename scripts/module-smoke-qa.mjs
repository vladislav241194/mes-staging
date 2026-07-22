import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withBundledTypeScriptClient } from "./typescript-client-qa-loader.mjs";

const [
  { MES_MODULE_FLOW_CONTRACTS },
  {
    MES_MODULE_BLUEPRINT_REGISTRY,
    MES_MODULE_NAVIGATION_REGISTRY,
    MES_MODULE_NAVIGATION_SCOPES,
    getMesModuleNavigationDefinitions,
  },
  {
    HARD_UI_RUNTIME_MODULE_IDS,
    PARTIAL_UI_RUNTIME_MODULE_IDS,
    SPECIAL_UI_RUNTIME_CONTRACTS,
    SPECIAL_UI_RUNTIME_MODULE_IDS,
  },
] = await Promise.all([
  withBundledTypeScriptClient(
    new URL("../src/mes_contracts.ts", import.meta.url),
    async (module) => module,
    { prefix: "mes-module-smoke-flow-contracts-qa-" },
  ),
  withBundledTypeScriptClient(
    new URL("../src/module_registry.js", import.meta.url),
    async (module) => module,
    { prefix: "mes-module-smoke-module-registry-qa-" },
  ),
  withBundledTypeScriptClient(
    new URL("../src/ui_runtime_contracts.ts", import.meta.url),
    async (module) => module,
    { prefix: "mes-module-smoke-ui-runtime-qa-" },
  ),
]);

const defaultUrl = new URL("/?qa=module-smoke", process.env.MES_QA_URL || "http://localhost:4174/").toString();
const ADMIN_ONLY_MODULE_IDS = new Set(
  MES_MODULE_NAVIGATION_REGISTRY
    .filter((moduleItem) => moduleItem.scope === MES_MODULE_NAVIGATION_SCOPES.ADMIN_ONLY)
    .map((moduleItem) => moduleItem.id),
);
const SMOKE_MODULE_IDS = getMesModuleNavigationDefinitions({ adminHost: false, includeStandalone: true })
  .map((moduleItem) => moduleItem.id);
const STANDALONE_CHROMELESS_MODULES = new Set(MES_MODULE_BLUEPRINT_REGISTRY
  .filter((blueprint) => blueprint.runtime.chrome === "standalone")
  .map((blueprint) => blueprint.id));
const HARD_UI_RUNTIME_MODULES = new Set(HARD_UI_RUNTIME_MODULE_IDS);
const HARD_LIKE_UI_RUNTIME_MODULES = new Set([...HARD_UI_RUNTIME_MODULE_IDS, ...PARTIAL_UI_RUNTIME_MODULE_IDS]);
const SPECIAL_UI_RUNTIME_MODULES = new Set(SPECIAL_UI_RUNTIME_MODULE_IDS);
const SMOKE_VIEWPORT = { name: "macbook-air-15", width: 1710, height: 1112 };
const AUTH_SESSION_TABLET_VIEWPORT = { name: "auth-session-tablet-2880x1920", width: 2880, height: 1920 };
const STANDARD_MODULE_SIDEBAR_WIDTH = 260;
const verbose = process.env.MES_QA_VERBOSE === "1";
const LEGACY_MODULE_ALIASES = [
  { source: "bomLists", target: "nomenclature", expectedUi: { activeNomenclaturePane: "boards" } },
  { source: "speki", target: "specifications2" },
  { source: "specifications", target: "specifications2" },
  { source: "products", target: "specifications2" },
  { source: "routes", target: "specifications2" },
  { source: "planning2", target: "planning" },
  { source: "planningWorkbench", target: "planning" },
  { source: "warehouse", target: "gantt" },
  { source: "shiftMaster", target: "shiftMasterBoard" },
  { source: "shiftMasterContext", target: "shiftMasterBoard" },
  { source: "shiftMasterV2", target: "shiftMasterBoard" },
];
const expectedLayoutPageByModule = {
  ...Object.fromEntries(SMOKE_MODULE_IDS.map((moduleId) => [moduleId, moduleId])),
};
const missingHardRuntimeSmokeModules = HARD_UI_RUNTIME_MODULE_IDS.filter((moduleId) => !SMOKE_MODULE_IDS.includes(moduleId) && !ADMIN_ONLY_MODULE_IDS.has(moduleId));
if (missingHardRuntimeSmokeModules.length) {
  throw new Error(`Hard UI runtime modules are missing from module smoke QA: ${missingHardRuntimeSmokeModules.join(", ")}`);
}
const missingSpecialRuntimeSmokeModules = SPECIAL_UI_RUNTIME_MODULE_IDS.filter((moduleId) => !SMOKE_MODULE_IDS.includes(moduleId) && !ADMIN_ONLY_MODULE_IDS.has(moduleId));
if (missingSpecialRuntimeSmokeModules.length) {
  throw new Error(`Special UI runtime modules are missing from module smoke QA: ${missingSpecialRuntimeSmokeModules.join(", ")}`);
}
const missingPartialRuntimeSmokeModules = PARTIAL_UI_RUNTIME_MODULE_IDS.filter((moduleId) => !SMOKE_MODULE_IDS.includes(moduleId) && !ADMIN_ONLY_MODULE_IDS.has(moduleId));
if (missingPartialRuntimeSmokeModules.length) {
  throw new Error(`Partial UI runtime modules are missing from module smoke QA: ${missingPartialRuntimeSmokeModules.join(", ")}`);
}

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

const requestedModuleId = getArg("--module", "");
const smokeModuleIdsToRun = requestedModuleId
  ? SMOKE_MODULE_IDS.filter((moduleId) => moduleId === requestedModuleId)
  : SMOKE_MODULE_IDS;

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

async function waitForAppReachable(url, timeoutMs = 5000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await delay(160);
  }
  const message = lastError?.message || `Timed out waiting for ${url}`;
  throw new Error(
    `MES app is not reachable at ${url}: ${message}. ` +
    "Start the app first or run this check through npm run qa:functional."
  );
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
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || "CDP error"));
      else resolve(message.result);
      return;
    }
    if (message.method && this.listeners.has(message.method)) {
      this.listeners.get(message.method).forEach((listener) => listener(message.params || {}));
    }
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }

  async send(method, params = {}, timeoutMs = 15000) {
    await this.ready;
    const id = this.nextId++;
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
  }, 45000);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

async function launchChrome() {
  const chromePath = await findChrome();
  const port = await getFreePort();
  const profileDir = await mkdtemp(join(tmpdir(), "mes-module-smoke-qa-"));
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
    const client = new CdpClient(target.webSocketDebuggerUrl);
    return { child, client, profileDir };
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cssDurationsAreZero(value = "") {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .every((part) => {
      const numeric = Number.parseFloat(part);
      return !Number.isFinite(numeric) || numeric === 0;
    });
}

function makeModuleUrl(baseUrl, moduleId) {
  const url = new URL(baseUrl);
  url.searchParams.set("module", moduleId);
  url.searchParams.set("qa", "module-smoke");
  url.searchParams.set("qa-auth-bypass", "1");
  return url.toString();
}

async function runPublicAdminOnlyNavigationCheck(client, baseUrl) {
  const loaded = waitForCdpEvent(client, "Page.loadEventFired", 10000);
  await client.send("Page.navigate", { url: makeModuleUrl(baseUrl, "contourAdmin") });
  await loaded;
  await delay(250);
  const report = await evaluate(client, () => {
    const shell = document.querySelector("main.app-shell");
    const storedUi = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
    return {
      layoutPage: shell?.dataset.layoutPage || "",
      activeModule: storedUi.activeModule || "",
      desktopMenuEntry: Boolean(document.querySelector('.module-tab[data-module="contourAdmin"]')),
      mobileMenuEntry: Boolean(document.querySelector('.mobile-module-tab[data-module="contourAdmin"]')),
    };
  });
  assert(report.layoutPage !== "contourAdmin", `public deep link must not render contourAdmin: ${JSON.stringify(report)}`);
  assert(report.activeModule !== "contourAdmin", `public deep link must not persist contourAdmin: ${JSON.stringify(report)}`);
  assert(!report.desktopMenuEntry && !report.mobileMenuEntry, `public menus must not expose contourAdmin: ${JSON.stringify(report)}`);
  return report;
}

function waitForCdpEvent(client, method, timeoutMs = 10000) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(false);
    }, timeoutMs);
    client.on(method, () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function waitForModule(client, moduleId) {
  const expectedLayout = expectedLayoutPageByModule[moduleId] || moduleId;
  const expectedContract = MES_MODULE_FLOW_CONTRACTS[moduleId] || {};
  const expectedLabel = expectedContract.label || "";
  const expectedAnnotation = expectedContract.role || "";
  const expectedGroup = expectedContract.group || "";
  const isChromelessModule = STANDALONE_CHROMELESS_MODULES.has(moduleId);
  const startedAt = Date.now();
  let lastReport = null;
  while (Date.now() - startedAt < 20000) {
	    const report = await evaluate(client, (expected) => {
	      const shell = document.querySelector("main.app-shell");
	      const rectFor = (selector) => {
	        const element = document.querySelector(selector);
	        if (!element) return null;
	        const rect = element.getBoundingClientRect();
	        return {
	          top: Math.round(rect.top),
	          bottom: Math.round(rect.bottom),
	          left: Math.round(rect.left),
	          right: Math.round(rect.right),
	          width: Math.round(rect.width),
	          height: Math.round(rect.height),
	        };
	      };
	      return {
	        hasShell: Boolean(shell),
	        layoutPage: shell?.dataset.layoutPage || "",
	        title: (document.querySelector(".app-topbar-title h1")?.textContent || "").trim(),
	        topbar: rectFor("main.app-shell > .app-topbar"),
	        topbarTitle: rectFor(".app-topbar-title"),
	        topbarActions: rectFor(".app-topbar-actions"),
	        refreshAction: rectFor("[data-refresh-app]"),
	        authSummary: rectFor("[data-visual-qa-target='app-auth-session-summary']"),
	        mainTextLength: (shell?.innerText || "").trim().length,
	        hasStartupError: /Ошибка запуска интерфейса|Cannot initialize|TypeError|ReferenceError/.test(document.body?.innerText || ""),
	        ganttReady: Boolean(
	          document.querySelector("[data-react-gantt-island][data-react-island-state='ready']")
	          && document.querySelector(".gantt-react-scroll[data-ui-component='GanttRuntime']")
	        ),
	        rolesReady: Boolean(
	          document.querySelector("[data-react-roles-island][data-react-island-state='ready']")
	          && document.querySelector("[data-react-roles-island] [data-ui-component='ModulePage'][data-ui-runtime='hard-v1']")
	        ),
	        startupText: (document.body?.innerText || "").slice(0, 500),
	      };
	    }, expectedLayout);
    lastReport = report;
    if (report.hasShell
      && report.layoutPage === expectedLayout
      && (moduleId !== "gantt" || report.ganttReady)
      && (moduleId !== "roles" || report.rolesReady)) {
      if (!isChromelessModule) {
        assert(report.title === expectedLabel, `${moduleId}: topbar title is out of sync with MES_MODULE_FLOW_CONTRACTS.label. Expected "${expectedLabel}", got "${report.title}".`);
		        assert(report.refreshAction?.width > 0, `${moduleId}: topbar refresh action is missing`);
		        assert(report.authSummary?.width > 0, `${moduleId}: topbar auth summary is missing`);
		        assert(
		          report.topbar?.height >= 56
		            && report.topbarTitle?.left >= report.topbar.left
            && report.topbarActions.right <= report.topbar.right + 1
		            && report.topbarTitle.top >= report.topbar.top - 1
		            && report.topbarActions.bottom <= report.topbar.bottom + 1,
		          `${moduleId}: app topbar must keep title, annotation, and actions in one ordered row: ${JSON.stringify({
		            topbar: report.topbar,
		            title: report.topbarTitle,
		            actions: report.topbarActions,
		          })}`
		        );
		        assert(
		          report.refreshAction.right <= report.authSummary.left,
		          `${moduleId}: topbar action order must be refresh -> auth summary: ${JSON.stringify({ refresh: report.refreshAction, auth: report.authSummary })}`
		        );
	      }
      assert(report.mainTextLength > 40, `${moduleId}: rendered shell looks empty`);
      assert(!report.hasStartupError, `${moduleId}: startup error text is visible`);
      return report;
    }
    await delay(140);
  }
  throw new Error(`${moduleId}: app shell did not render as ${expectedLayout}. Last report: ${JSON.stringify(lastReport)}`);
}

async function runInteractionStabilityChecks(client, moduleId) {
  const candidates = await evaluate(client, () => {
    const selectors = [
      "button",
      ".module-tabs .module-tab[data-module]",
      ".module-menu-footer button",
      ".app-topbar-action",
      ".module-data-sidebar .ui-sidebar-item",
      ".directory-sidebar .ui-sidebar-item",
      ".directory-nav-item",
      ".planning-order-route-item",
      ".primary-button",
      ".secondary-button",
      ".icon-button",
      ".table-icon-button",
      ".dense-inline-select > summary",
      "[data-ui-component='GanttSlot'][data-slot-id]",
    ];
    const seen = new Set();
    return selectors
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter((element) => {
        if (!element || seen.has(element)) return false;
        seen.add(element);
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width >= 18
          && rect.height >= 18
          && rect.bottom > 0
          && rect.right > 0
          && rect.top < innerHeight
          && rect.left < innerWidth
          && style.display !== "none"
          && style.visibility !== "hidden"
          && style.pointerEvents !== "none"
          && !element.disabled
          && element.getAttribute("aria-disabled") !== "true";
      })
      .slice(0, 18)
      .map((element, index) => {
        const id = `interaction-${index}`;
        element.dataset.smokeInteractionTarget = id;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          id,
          label: (element.textContent || element.getAttribute("aria-label") || element.className || element.tagName)
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80),
          selector: selectors.find((selector) => element.matches(selector)) || element.tagName.toLowerCase(),
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          rect: {
            left: Math.round(rect.left * 10) / 10,
            top: Math.round(rect.top * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
          },
          transform: style.transform || "none",
          transitionDuration: style.transitionDuration || "0s",
          animationDuration: style.animationDuration || "0s",
          animationName: style.animationName || "none",
        };
      });
  });

  const transformedAtRest = candidates.filter((item) => item.transform && item.transform !== "none");
  assert(transformedAtRest.length === 0, `${moduleId}: interactive controls have resting transform: ${JSON.stringify(transformedAtRest.slice(0, 6))}`);
  const animatedAtRest = candidates.filter((item) => (
    !cssDurationsAreZero(item.transitionDuration)
    || (!cssDurationsAreZero(item.animationDuration) && item.animationName && item.animationName !== "none")
  ));
  assert(animatedAtRest.length === 0, `${moduleId}: interactive controls have transition/animation and can flicker: ${JSON.stringify(animatedAtRest.slice(0, 6))}`);

  const driftProblems = [];
  for (const candidate of candidates) {
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: Math.round(candidate.x),
      y: Math.round(candidate.y),
    });
    await delay(45);
    const hoverReport = await evaluate(client, (id) => {
      const element = document.querySelector(`[data-smoke-interaction-target="${CSS.escape(id)}"]`);
      if (!element) return { found: false };
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        found: true,
        hover: element.matches(":hover"),
        transform: style.transform || "none",
        transitionDuration: style.transitionDuration || "0s",
        animationDuration: style.animationDuration || "0s",
        animationName: style.animationName || "none",
        rect: {
          left: Math.round(rect.left * 10) / 10,
          top: Math.round(rect.top * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        },
      };
    }, candidate.id);
    if (!hoverReport.found) continue;
    const delta = Math.max(
      Math.abs((hoverReport.rect.left || 0) - candidate.rect.left),
      Math.abs((hoverReport.rect.top || 0) - candidate.rect.top),
      Math.abs((hoverReport.rect.width || 0) - candidate.rect.width),
      Math.abs((hoverReport.rect.height || 0) - candidate.rect.height)
    );
    if (
      (hoverReport.transform && hoverReport.transform !== "none")
      || !cssDurationsAreZero(hoverReport.transitionDuration)
      || (!cssDurationsAreZero(hoverReport.animationDuration) && hoverReport.animationName && hoverReport.animationName !== "none")
      || delta > 0.6
    ) {
      driftProblems.push({
        label: candidate.label,
        selector: candidate.selector,
        before: candidate.rect,
        after: hoverReport.rect,
        transform: hoverReport.transform,
        transitionDuration: hoverReport.transitionDuration,
        animationDuration: hoverReport.animationDuration,
        delta,
      });
    }
  }
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
  assert(driftProblems.length === 0, `${moduleId}: hover moves interactive hitboxes: ${JSON.stringify(driftProblems.slice(0, 6))}`);
}

async function runFocusModeTopbarStabilityCheck(client, moduleId) {
  const measure = async () => evaluate(client, () => {
    const shell = document.querySelector("main.app-shell");
    const topbar = document.querySelector("main.app-shell > .app-topbar");
    const focusButton = document.querySelector("[data-toggle-focus-mode]");
    const titleMeta = topbar?.querySelector(".app-topbar-title p");
    if (!shell || !topbar || !focusButton) {
      return { canCheck: false };
    }
    const shellRect = shell.getBoundingClientRect();
    const rect = topbar.getBoundingClientRect();
    const actionsRect = topbar.querySelector(".app-topbar-actions")?.getBoundingClientRect();
    const style = getComputedStyle(topbar);
    const titleMetaStyle = titleMeta ? getComputedStyle(titleMeta) : null;
    return {
      canCheck: true,
      isFocusMode: shell.classList.contains("is-focus-mode"),
      shellWidth: Math.round(shellRect.width * 10) / 10,
      width: Math.round(rect.width * 10) / 10,
      rightGap: actionsRect ? Math.round((rect.right - actionsRect.right) * 10) / 10 : null,
      height: Math.round(rect.height * 10) / 10,
      minHeight: style.minHeight,
      paddingBlockStart: style.paddingBlockStart,
      paddingBlockEnd: style.paddingBlockEnd,
      hasTitleMeta: Boolean(titleMeta),
      titleMetaVisible: titleMeta
        ? titleMetaStyle.display !== "none" && titleMetaStyle.visibility !== "hidden" && titleMeta.getBoundingClientRect().height > 0
        : true,
    };
  });

  let before = await measure();
  if (!before.canCheck) return;
  const resetFocusMode = async () => evaluate(client, () => {
    try {
      const key = "mes-planning-prototype-ui-v1";
      const ui = JSON.parse(localStorage.getItem(key) || "{}");
      ui.focusMode = false;
      localStorage.setItem(key, JSON.stringify(ui));
    } catch {}
    document.body.classList.remove("is-mes-focus-mode");
    document.querySelectorAll("main.app-shell").forEach((shell) => {
      shell.classList.remove("is-focus-mode");
    });
  });

  if (before.isFocusMode) {
    await resetFocusMode();
    await delay(80);
    before = await measure();
  }

  await evaluate(client, () => {
    try {
      const key = "mes-planning-prototype-ui-v1";
      const ui = JSON.parse(localStorage.getItem(key) || "{}");
      ui.focusMode = true;
      localStorage.setItem(key, JSON.stringify(ui));
    } catch {}
    document.body.classList.add("is-mes-focus-mode");
    document.querySelectorAll("main.app-shell").forEach((shell) => {
      shell.classList.add("is-focus-mode");
    });
  });
  await delay(80);
  const focused = await measure();
  assert(focused.isFocusMode, `${moduleId}: focus mode did not turn on for topbar stability check: ${JSON.stringify(focused)}`);
  assert(focused.width >= focused.shellWidth - 2, `${moduleId}: focus mode must keep topbar full-width: ${JSON.stringify({ before, focused })}`);
  assert(focused.rightGap !== null && focused.rightGap <= 28, `${moduleId}: focus mode must keep topbar actions near the right edge: ${JSON.stringify({ before, focused })}`);
  assert(Math.abs(focused.height - before.height) <= 2, `${moduleId}: focus mode must not shrink topbar height: ${JSON.stringify({ before, focused })}`);
  assert(focused.minHeight === before.minHeight, `${moduleId}: focus mode changed topbar min-height: ${JSON.stringify({ before, focused })}`);
  assert(
    focused.paddingBlockStart === before.paddingBlockStart && focused.paddingBlockEnd === before.paddingBlockEnd,
    `${moduleId}: focus mode changed topbar vertical padding: ${JSON.stringify({ before, focused })}`
  );
  assert(!before.hasTitleMeta || focused.titleMetaVisible, `${moduleId}: focus mode hides topbar subtitle/meta line: ${JSON.stringify({ before, focused })}`);

  await resetFocusMode();
  await delay(80);
  const restored = await measure();
  assert(!restored.isFocusMode, `${moduleId}: focus mode was not restored after topbar stability check: ${JSON.stringify(restored)}`);
}

async function clickVisibleCenter(client, selector, context = "") {
  const rect = await evaluate(client, (cssSelector) => {
    const element = [...document.querySelectorAll(cssSelector)].find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const style = getComputedStyle(candidate);
      return rect.width > 0
        && rect.height > 0
        && rect.bottom > 0
        && rect.right > 0
        && rect.top < innerHeight
        && rect.left < innerWidth
        && style.display !== "none"
        && style.visibility !== "hidden"
        && style.pointerEvents !== "none"
        && !candidate.disabled
        && candidate.getAttribute("aria-disabled") !== "true";
    });
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return {
      x: Math.round(box.left + box.width / 2),
      y: Math.round(box.top + box.height / 2),
      width: Math.round(box.width),
      height: Math.round(box.height),
      text: (element.textContent || element.getAttribute("aria-label") || element.className || element.tagName)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120),
    };
  }, selector);
  assert(rect && rect.width > 0 && rect.height > 0, `${context || selector}: visible click target was not found`);
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  return rect;
}

async function runModuleSpecificSmokeChecks(client, moduleId) {
  const pageRuntimeStatus = await evaluate(client, () => {
    const page = document.querySelector(".module-data-page");
    const runtimeRoots = [...document.querySelectorAll("[data-ui-runtime]")].map((root) => ({
      runtime: root.dataset.uiRuntime || "",
      component: root.dataset.uiComponent || "",
      className: root.className || "",
    }));
    return {
      hasPage: Boolean(page),
      runtime: page?.dataset.uiRuntime || "",
      component: page?.dataset.uiComponent || "",
      className: page?.className || "",
      runtimeRoots,
      reactGantt: {
        island: Boolean(document.querySelector("[data-react-gantt-island]")),
        runtime: Boolean(document.querySelector(".gantt-react-scroll[data-ui-component='GanttRuntime']")),
      },
    };
  });
  const hardRuntimeRoots = pageRuntimeStatus.runtimeRoots.filter((root) => root.runtime === "hard-v1");
  const specialRuntimeRoots = pageRuntimeStatus.runtimeRoots.filter((root) => root.runtime && root.runtime !== "hard-v1");
  assert(
    HARD_LIKE_UI_RUNTIME_MODULES.has(moduleId) || moduleId === "gantt" || hardRuntimeRoots.length === 0,
    `${moduleId}: page renders hard-v1 runtime but module is not listed in HARD/PARTIAL UI runtime coverage`
  );
  assert(
    SPECIAL_UI_RUNTIME_MODULES.has(moduleId) || specialRuntimeRoots.length === 0,
    `${moduleId}: page renders special runtime but module is not listed in SPECIAL_UI_RUNTIME_MODULE_IDS: ${JSON.stringify(specialRuntimeRoots)}`
  );
  if (SPECIAL_UI_RUNTIME_MODULES.has(moduleId)) {
    const expectedSpecialRuntime = SPECIAL_UI_RUNTIME_CONTRACTS[moduleId];
    assert(expectedSpecialRuntime, `${moduleId}: missing SPECIAL_UI_RUNTIME_CONTRACTS entry`);
    if (moduleId === "gantt") {
      assert(
        pageRuntimeStatus.reactGantt.island && pageRuntimeStatus.reactGantt.runtime,
        `gantt: expected permanent React GanttRuntime, got ${JSON.stringify(pageRuntimeStatus.reactGantt)}`
      );
    } else {
      assert(
        specialRuntimeRoots.some((root) => (
          root.runtime === expectedSpecialRuntime.runtime
          && root.component === expectedSpecialRuntime.component
        )),
        `${moduleId}: expected special runtime ${JSON.stringify(expectedSpecialRuntime)}, got ${JSON.stringify(specialRuntimeRoots)}`
      );
    }
  }

  if (HARD_LIKE_UI_RUNTIME_MODULES.has(moduleId)) {
    const runtimeReport = await evaluate(client, (contract) => {
      const page = document.querySelector(".module-data-page");
      const workspace = page?.querySelector(".module-data-workspace");
      const content = page?.querySelector(".module-data-content");
      const pageRect = page?.getBoundingClientRect();
      const pageStyle = page ? window.getComputedStyle(page) : null;
      const appSidebar = document.querySelector("main.app-shell > .module-menu");
      const appSidebarWidth = Math.round(appSidebar?.getBoundingClientRect().width || 0);
      const isStandaloneAuthModule = contract?.moduleId === "authPrototype";
      const toRect = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
        };
      };
      const isVisibleBox = (element) => {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const isFlowBox = (element) => {
        const style = window.getComputedStyle(element);
        return isVisibleBox(element) && !["absolute", "fixed"].includes(style.position);
      };
      const panelEscapes = [...(page?.querySelectorAll('[data-ui-component="Panel"]') || [])]
        .filter(isVisibleBox)
        .map((panel, index) => {
          const panelRect = panel.getBoundingClientRect();
          const body = [...panel.children].find((child) => child.dataset?.uiComponent === "PanelBody");
          if (!body || !isVisibleBox(body)) return null;
          const flowDescendants = [...body.querySelectorAll("*")]
            .filter(isFlowBox)
            .filter((element) => {
              const viewportWrap = element.closest('[data-ui-component="TableWrap"][data-scroll-contract="viewport"]');
              return !viewportWrap || element === viewportWrap;
            });
          const maxBottom = Math.max(
            body.getBoundingClientRect().bottom,
            ...flowDescendants.map((element) => element.getBoundingClientRect().bottom)
          );
          const overflowBottom = Math.round(maxBottom - panelRect.bottom);
          if (overflowBottom <= 3) return null;
          const panelStyle = window.getComputedStyle(panel);
          const bodyStyle = window.getComputedStyle(body);
          return {
            index,
            className: panel.className || "",
            overflowBottom,
            panelStyle: {
              display: panelStyle.display,
              height: panelStyle.height,
              minHeight: panelStyle.minHeight,
              maxHeight: panelStyle.maxHeight,
              gridTemplateRows: panelStyle.gridTemplateRows,
              alignSelf: panelStyle.alignSelf,
            },
            bodyStyle: {
              display: bodyStyle.display,
              height: bodyStyle.height,
              minHeight: bodyStyle.minHeight,
              maxHeight: bodyStyle.maxHeight,
              gridTemplateRows: bodyStyle.gridTemplateRows,
            },
            panel: toRect(panel),
            body: toRect(body),
          };
        })
        .filter(Boolean)
        .slice(0, 6);
      const panelWithoutBody = [...(page?.querySelectorAll('[data-ui-component="Panel"]') || [])]
        .filter(isVisibleBox)
        .filter((panel) => ![...panel.children].some((child) => child.dataset?.uiComponent === "PanelBody"))
        .map((panel, index) => ({
          index,
          className: panel.className || "",
          text: (panel.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
          rect: toRect(panel),
        }))
        .slice(0, 8);
      const unmarkedPanels = [...(page?.querySelectorAll(".module-panel, .ui-panel") || [])]
        .filter(isVisibleBox)
        .filter((panel) => !["Panel", "Canvas"].includes(panel.dataset?.uiComponent || ""))
        .map((panel) => ({
          className: panel.className || "",
          text: (panel.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
          rect: toRect(panel),
        }))
        .slice(0, 8);
      const unmarkedButtons = [...(page?.querySelectorAll("button, .ui-action-button, .primary-button, .secondary-button") || [])]
        .filter(isVisibleBox)
        .filter((button) => !button.dataset?.uiComponent)
        .map((button) => ({
          className: button.className || "",
          text: (button.textContent || button.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 80),
          rect: toRect(button),
        }))
        .slice(0, 8);
      const unmarkedFormFields = [...(page?.querySelectorAll("label:has(input), label:has(select), label:has(textarea), .form-field, .ui-form-field") || [])]
        .filter(isVisibleBox)
        .filter((field) => {
          if (field.dataset?.uiComponent === "FormField") return false;
          return field.dataset?.uiComponent !== "DomainField"
            || !String(field.dataset?.uiVariant || "").startsWith("domain:");
        })
        .map((field) => ({
          className: field.className || "",
          component: field.dataset?.uiComponent || "",
          variant: field.dataset?.uiVariant || "",
          text: (field.textContent || field.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 80),
          rect: toRect(field),
        }))
        .slice(0, 8);
      const unmarkedTableWraps = [...(page?.querySelectorAll("[data-layout='table'], .ui-table-wrap") || [])]
        .filter(isVisibleBox)
        .filter((wrap) => wrap.dataset?.uiComponent !== "TableWrap")
        .map((wrap) => ({
          className: wrap.className || "",
          rect: toRect(wrap),
        }))
        .slice(0, 8);
      const tableWrapProblems = [...(page?.querySelectorAll('[data-ui-component="TableWrap"][data-scroll-contract="horizontal-only"]') || [])]
        .filter(isVisibleBox)
        .map((wrap, index) => {
          const style = window.getComputedStyle(wrap);
          const hasVerticalScroller = (
            ["auto", "scroll"].includes(style.overflowY) &&
            wrap.scrollHeight > wrap.clientHeight + 2
          );
          if (!hasVerticalScroller) return null;
          const matchedRules = [];
          [...document.styleSheets].forEach((sheet) => {
            let rules = [];
            try {
              rules = [...(sheet.cssRules || [])];
            } catch {
              rules = [];
            }
            rules.forEach((rule) => {
              if (!rule.selectorText || !rule.style) return;
              try {
                if (!wrap.matches(rule.selectorText)) return;
              } catch {
                return;
              }
              const overflowBits = [rule.style.overflow, rule.style.overflowX, rule.style.overflowY]
                .filter(Boolean)
                .join(" / ");
              if (!overflowBits && !rule.style.display) return;
              matchedRules.push({
                selector: rule.selectorText,
                display: rule.style.display || "",
                overflow: rule.style.overflow || "",
                overflowX: rule.style.overflowX || "",
                overflowY: rule.style.overflowY || "",
              });
            });
          });
          return {
            index,
            className: wrap.className || "",
            display: style.display,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            matchesContractSelector: wrap.matches('[data-ui-component="TableWrap"][data-scroll-contract="horizontal-only"]'),
            inlineStyle: wrap.getAttribute("style") || "",
            matchedRules: matchedRules.slice(-8),
            loadedStylesheets: [...document.styleSheets].map((sheet) => sheet.href || "inline").slice(0, 8),
            rect: toRect(wrap),
          };
        })
        .filter(Boolean)
        .slice(0, 8);
      const radiusContractSelector = [
        '[data-ui-component="ModuleWorkspace"]',
        '[data-ui-component="ModuleSidebar"]',
        '[data-ui-component="ModuleHeader"]',
        '[data-ui-component="Panel"]',
        '[data-ui-component="TableWrap"]',
        '[data-ui-component="ActionButton"]',
        '[data-ui-component="FormField"] :is(input, select, textarea)',
        '.planning-order-page.is-heroui :is(.planning-order-queue, .planning-order-header, .planning-order-route-map, .planning-order-record, .planning-order-record-section, .planning-order-route-item, .planning-order-phase, .planning-order-lane-head, .planning-order-step-pill, .planning-order-register-row, .planning-detail-disclosure, .planning-detail-body)',
        '.directories-page :is(.directory-sidebar, .directory-header, .directory-table-card, .directory-nav-item, .directory-health div, .directory-detail-list div)',
        '.shift-master-board-page :is(.shift-master-board-panel, .shift-master-board-task-context, .shift-master-board-section, .shift-master-board-card, .shift-master-board-available-person, .shift-master-board-document, .shift-master-board-summary-cell, .shift-master-board-route-chain-card)',
      ].join(",");
      const visualTheme = document.documentElement.dataset?.visualTheme || "";
      const maxStandardRadius = visualTheme === "base-glass" ? 24.01 : 8.01;
      const radiusProblems = [...(page?.querySelectorAll(radiusContractSelector) || [])]
        .filter(isVisibleBox)
        .map((element, index) => {
          const style = window.getComputedStyle(element);
          const rect = toRect(element);
          const radius = Number.parseFloat(style.borderTopLeftRadius || style.borderRadius || "0") || 0;
          const isPill = radius >= 99;
          if (isPill || radius <= maxStandardRadius) return null;
          return {
            index,
            className: element.className || "",
            component: element.dataset?.uiComponent || "",
            radius,
            maxStandardRadius,
            width: rect.width,
            height: rect.height,
            text: (element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 90),
          };
        })
        .filter(Boolean)
        .slice(0, 8);
      const directModuleSidebars = [...(page?.children || [])]
        .filter((child) => child.dataset?.uiComponent === "ModuleSidebar")
        .filter(isVisibleBox);
      const moduleSidebarProblems = directModuleSidebars
        .map((sidebar, index) => {
          const rect = toRect(sidebar);
          const style = window.getComputedStyle(sidebar);
          const expectedWidth = Number(contract?.standardModuleSidebarWidth || 260);
          const widthDelta = Math.abs(rect.width - expectedWidth);
          const collapsedToAppSidebar = appSidebarWidth > 0
            && appSidebarWidth < 220
            && Math.abs(rect.width - appSidebarWidth) <= 2;
          if (widthDelta <= 1 && !collapsedToAppSidebar) return null;
          return {
            index,
            className: sidebar.className || "",
            width: rect.width,
            expectedWidth,
            widthDelta,
            appSidebarWidth,
            collapsedToAppSidebar,
            computedWidth: style.width,
            minWidth: style.minWidth,
            maxWidth: style.maxWidth,
            gridTemplateColumns: pageStyle?.gridTemplateColumns || "",
            columnGap: pageStyle?.columnGap || "",
            rect,
          };
        })
        .filter(Boolean);
      const getPageBackgroundContract = () => {
        const shell = document.querySelector("main.app-shell");
        if (!shell) return null;
        const probe = document.createElement("section");
        probe.className = `module-data-page ui-module-page${page?.classList?.contains("has-sidebar") ? " has-sidebar" : ""}${page?.classList?.contains("is-full-width") ? " is-full-width" : ""}`;
        probe.dataset.uiComponent = "ModulePage";
        probe.dataset.uiRuntime = "hard-v1";
        if (page?.dataset?.uiContract) probe.dataset.uiContract = page.dataset.uiContract;
        probe.style.position = "fixed";
        probe.style.left = "-10000px";
        probe.style.top = "-10000px";
        probe.style.width = "10px";
        probe.style.height = "10px";
        probe.style.visibility = "hidden";
        probe.style.pointerEvents = "none";
        shell.appendChild(probe);
        const style = window.getComputedStyle(probe);
        const result = {
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          backgroundSize: style.backgroundSize,
          backgroundRepeat: style.backgroundRepeat,
        };
        probe.remove();
        return result;
      };
      const pageBackground = pageStyle ? {
        backgroundColor: pageStyle.backgroundColor,
        backgroundImage: pageStyle.backgroundImage,
        backgroundSize: pageStyle.backgroundSize,
        backgroundRepeat: pageStyle.backgroundRepeat,
      } : null;
      const expectedPageBackground = getPageBackgroundContract();
      const pageBackgroundProblems = (!isStandaloneAuthModule && pageBackground && expectedPageBackground && (
        pageBackground.backgroundColor !== expectedPageBackground.backgroundColor
        || pageBackground.backgroundImage !== expectedPageBackground.backgroundImage
        || pageBackground.backgroundSize !== expectedPageBackground.backgroundSize
        || pageBackground.backgroundRepeat !== expectedPageBackground.backgroundRepeat
      )) ? [{
        actual: pageBackground,
        expected: expectedPageBackground,
        className: page?.className || "",
      }] : [];
      const findFlowOverlaps = (children, context = "") => {
        const overlaps = [];
        for (let firstIndex = 0; firstIndex < children.length; firstIndex += 1) {
          for (let secondIndex = firstIndex + 1; secondIndex < children.length; secondIndex += 1) {
          const first = children[firstIndex];
          const second = children[secondIndex];
          const firstRect = first.getBoundingClientRect();
          const secondRect = second.getBoundingClientRect();
          const overlapX = Math.min(firstRect.right, secondRect.right) - Math.max(firstRect.left, secondRect.left);
          const overlapY = Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top);
          if (overlapX > 3 && overlapY > 3) {
              overlaps.push({
                context,
              firstIndex,
              secondIndex,
              overlapX: Math.round(overlapX),
              overlapY: Math.round(overlapY),
              firstClassName: first.className || "",
              secondClassName: second.className || "",
              first: toRect(first),
              second: toRect(second),
            });
          }
        }
        }
        return overlaps;
      };
      const contentChildren = [...(content?.children || [])].filter(isFlowBox);
      const contentOverlaps = findFlowOverlaps(contentChildren, "ModuleContent");
      const panelBodyOverlaps = [...(page?.querySelectorAll('[data-ui-component="Panel"]') || [])]
        .filter(isVisibleBox)
        .flatMap((panel, panelIndex) => {
          const body = [...panel.children].find((child) => child.dataset?.uiComponent === "PanelBody");
          if (!body || !isVisibleBox(body)) return [];
          return findFlowOverlaps([...body.children].filter(isFlowBox), `PanelBody:${panelIndex}`);
        })
        .slice(0, 6);
      return {
        hasPage: Boolean(page),
        hasPlanningEmptyState: Boolean(document.querySelector(".planning-empty-page")),
        runtime: page?.dataset.uiRuntime || "",
        component: page?.dataset.uiComponent || "",
        hasWorkspace: Boolean(workspace),
        workspaceComponent: workspace?.dataset.uiComponent || "",
        hasContent: Boolean(content),
        contentComponent: content?.dataset.uiComponent || "",
        pageOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        pageWidth: Math.round(pageRect?.width || 0),
        hasSidebarLayout: Boolean(page?.classList.contains("has-sidebar")),
        pageGridTemplateColumns: pageStyle?.gridTemplateColumns || "",
        pageColumnGap: pageStyle?.columnGap || "",
        pageBackground,
        expectedPageBackground,
        pageBackgroundProblems,
        moduleSidebarCount: directModuleSidebars.length,
        moduleSidebarProblems,
        panelEscapes,
        panelWithoutBody,
        unmarkedPanels,
        unmarkedButtons,
        unmarkedFormFields,
        unmarkedTableWraps,
        tableWrapProblems,
        visualTheme,
        radiusProblems,
        contentOverlaps: contentOverlaps.slice(0, 6),
        panelBodyOverlaps,
      };
    }, { moduleId, standardModuleSidebarWidth: STANDARD_MODULE_SIDEBAR_WIDTH });
    if (!runtimeReport.hasPage && moduleId === "planning") {
      assert(runtimeReport.hasPlanningEmptyState, "planning: neither a hard UI root nor an explicit empty state was rendered");
      return;
    }
    assert(runtimeReport.hasPage, `${moduleId}: hard UI page root is missing`);
    assert(runtimeReport.runtime === "hard-v1", `${moduleId}: expected data-ui-runtime=hard-v1, got "${runtimeReport.runtime}"`);
    assert(runtimeReport.component === "ModulePage", `${moduleId}: expected ModulePage component, got "${runtimeReport.component}"`);
    assert(runtimeReport.hasWorkspace && runtimeReport.workspaceComponent === "ModuleWorkspace", `${moduleId}: ModuleWorkspace contract is missing`);
    assert(runtimeReport.hasContent && runtimeReport.contentComponent === "ModuleContent", `${moduleId}: ModuleContent contract is missing`);
    assert(runtimeReport.pageOverflowX <= 2, `${moduleId}: page horizontal overflow ${runtimeReport.pageOverflowX}px`);
    assert(runtimeReport.pageWidth > 320, `${moduleId}: hard UI page width looks broken: ${runtimeReport.pageWidth}px`);
    assert(runtimeReport.pageBackgroundProblems.length === 0, `${moduleId}: ModulePage background contract drift: ${JSON.stringify(runtimeReport.pageBackgroundProblems)}`);
    if (runtimeReport.hasSidebarLayout) {
      assert(runtimeReport.moduleSidebarCount === 1, `${moduleId}: hard UI sidebar layout must have exactly one direct ModuleSidebar, got ${runtimeReport.moduleSidebarCount}`);
      assert(runtimeReport.moduleSidebarProblems.length === 0, `${moduleId}: ModuleSidebar width contract drift: ${JSON.stringify(runtimeReport.moduleSidebarProblems)}`);
    }
    assert(runtimeReport.panelWithoutBody.length === 0, `${moduleId}: hard Panel without direct PanelBody: ${JSON.stringify(runtimeReport.panelWithoutBody)}`);
    assert(runtimeReport.unmarkedPanels.length === 0, `${moduleId}: visible panel without Panel marker: ${JSON.stringify(runtimeReport.unmarkedPanels)}`);
    assert(runtimeReport.unmarkedButtons.length === 0, `${moduleId}: visible button without UI component marker: ${JSON.stringify(runtimeReport.unmarkedButtons)}`);
    assert(runtimeReport.unmarkedFormFields.length === 0, `${moduleId}: visible form field without explicit FormField/DomainField contract: ${JSON.stringify(runtimeReport.unmarkedFormFields)}`);
    assert(runtimeReport.unmarkedTableWraps.length === 0, `${moduleId}: visible table wrapper without TableWrap marker: ${JSON.stringify(runtimeReport.unmarkedTableWraps)}`);
    assert(runtimeReport.tableWrapProblems.length === 0, `${moduleId}: TableWrap horizontal-only has vertical scroll contract drift: ${JSON.stringify(runtimeReport.tableWrapProblems)}`);
    assert(runtimeReport.radiusProblems.length === 0, `${moduleId}: standard UI radius exceeds ${runtimeReport.visualTheme === "base-glass" ? "base-glass" : "8px"} contract: ${JSON.stringify(runtimeReport.radiusProblems)}`);
    assert(runtimeReport.panelEscapes.length === 0, `${moduleId}: panel content escapes panel bounds: ${JSON.stringify(runtimeReport.panelEscapes)}`);
    assert(runtimeReport.contentOverlaps.length === 0, `${moduleId}: module content direct blocks overlap: ${JSON.stringify(runtimeReport.contentOverlaps)}`);
    assert(runtimeReport.panelBodyOverlaps.length === 0, `${moduleId}: PanelBody direct blocks overlap: ${JSON.stringify(runtimeReport.panelBodyOverlaps)}`);
  }
  if (moduleId === "directories") {
    await clickVisibleCenter(client, '[data-directory-id="componentTypes"]', "directories: open component type norms");
    await delay(160);
    const componentTypesReport = await evaluate(client, () => ({
      activeSection: document.querySelector(".directory-nav-item.is-active")?.getAttribute("data-directory-id") || "",
      header: document.querySelector('[data-ui-component="ModuleHeader"] h2')?.textContent?.trim() || "",
      rowCount: document.querySelectorAll("tbody tr").length,
      coefficientValues: [...document.querySelectorAll("tbody td.is-key-coefficient")]
        .map((cell) => cell.textContent?.trim() || "")
        .filter(Boolean),
      hasStartupError: /Ошибка запуска интерфейса|Cannot initialize|TypeError|ReferenceError/.test(document.body?.innerText || ""),
    }));
    assert(componentTypesReport.activeSection === "componentTypes", `directories: component types section did not become active: ${JSON.stringify(componentTypesReport)}`);
    assert(componentTypesReport.header === "Типы компонентов", `directories: component types header did not render: ${JSON.stringify(componentTypesReport)}`);
    assert(componentTypesReport.rowCount > 0, `directories: component types table is empty: ${JSON.stringify(componentTypesReport)}`);
    assert(componentTypesReport.coefficientValues.length > 0, `directories: component coefficients did not render: ${JSON.stringify(componentTypesReport)}`);
    assert(!componentTypesReport.hasStartupError, `directories: component types triggered a startup error: ${JSON.stringify(componentTypesReport)}`);

    await clickVisibleCenter(client, '[data-directory-id="statuses"]', "directories: open read-only status contracts");
    await delay(160);
    const statusDirectoryReport = await evaluate(client, () => ({
      activeSection: document.querySelector(".directory-nav-item.is-active")?.getAttribute("data-directory-id") || "",
      header: document.querySelector('[data-ui-component="ModuleHeader"] h2')?.textContent?.trim() || "",
      readOnlyToken: [...document.querySelectorAll('[data-ui-component="StatusToken"]')]
        .map((item) => item.textContent?.trim() || "")
        .find((text) => /только чтение/i.test(text)) || "",
      addButtonCount: [...document.querySelectorAll("button")].filter((button) => /Добавить запись/.test(button.textContent || "")).length,
      editButtonCount: [...document.querySelectorAll("button")].filter((button) => /Редактировать запись/.test(button.getAttribute("aria-label") || "")).length,
      deleteButtonCount: [...document.querySelectorAll("button")].filter((button) => /Удалить запись/.test(button.getAttribute("aria-label") || "")).length,
      rowCount: document.querySelectorAll("tbody tr").length,
    }));
    assert(statusDirectoryReport.activeSection === "statuses", `directories: status section did not become active: ${JSON.stringify(statusDirectoryReport)}`);
    assert(statusDirectoryReport.header === "Статусы", `directories: status header did not render: ${JSON.stringify(statusDirectoryReport)}`);
    assert(/только чтение/i.test(statusDirectoryReport.readOnlyToken), `directories: read-only status contract token is missing: ${JSON.stringify(statusDirectoryReport)}`);
    assert(statusDirectoryReport.rowCount > 0, `directories: status contract table is empty: ${JSON.stringify(statusDirectoryReport)}`);
    assert(
      statusDirectoryReport.addButtonCount === 0
        && statusDirectoryReport.editButtonCount === 0
        && statusDirectoryReport.deleteButtonCount === 0,
      `directories: read-only status contract exposes mutation actions: ${JSON.stringify(statusDirectoryReport)}`
    );
  }
  if (moduleId === "products") {
    const selectProductsSmokeTarget = () => evaluate(client, () => {
      const candidates = [...document.querySelectorAll("[data-speki-spec-open]")];
      const button = candidates.find((candidate) => !candidate.classList.contains("is-active")) || candidates[0];
      if (!button) return null;
      button.dataset.productsSmokeTarget = "specification";
      return {
        id: button.dataset.spekiSpecOpen || "",
        title: (button.querySelector("strong")?.textContent || "").trim(),
      };
    });
    let target = await selectProductsSmokeTarget();
    if (!target?.id) {
      const createTarget = await evaluate(client, () => {
        const button = document.querySelector("[data-speki-create-specification]");
        if (button) button.dataset.productsSmokeCreateTarget = "specification";
        return Boolean(button);
      });
      assert(createTarget, "products: empty state does not expose New specification action");
      await clickVisibleCenter(client, '[data-products-smoke-create-target="specification"]', "products: create specification from empty state");
      await delay(180);
      const saveTarget = await evaluate(client, () => {
        const button = document.querySelector("[data-speki-save]");
        if (button) button.dataset.productsSmokeInitialSaveTarget = "specification";
        return Boolean(button);
      });
      assert(saveTarget, "products: newly created specification does not expose Save action");
      await clickVisibleCenter(client, '[data-products-smoke-initial-save-target="specification"]', "products: save newly created specification");
      await delay(180);
      target = await selectProductsSmokeTarget();
    }
    assert(target?.id, `products: specification sidebar does not expose a selectable data-speki-spec-open item: ${JSON.stringify(target)}`);

    await clickVisibleCenter(client, '[data-products-smoke-target="specification"]', "products: specification sidebar selection");
    let selectionReport = null;
    const selectionStartedAt = Date.now();
    while (Date.now() - selectionStartedAt < 2500) {
      selectionReport = await evaluate(client, () => {
        const activeButton = document.querySelector("[data-speki-spec-open].is-active");
        let storedUi = {};
        try {
          storedUi = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
        } catch {}
        const editButton = [...document.querySelectorAll("[data-speki-edit]")]
          .find((candidate) => candidate.dataset.spekiEdit === activeButton?.dataset.spekiSpecOpen);
        if (editButton) editButton.dataset.productsSmokeEditTarget = "specification";
        return {
          activeCount: document.querySelectorAll("[data-speki-spec-open].is-active").length,
          activeId: activeButton?.dataset.spekiSpecOpen || "",
          heading: (document.querySelector('[data-ui-component="ModuleHeader"] h2')?.textContent || "").trim(),
          persistedId: String(storedUi.activeSpecificationId || ""),
          persistedProjectId: String(storedUi.activeProjectId || ""),
          persistedEditingId: String(storedUi.spekiEditingId || ""),
          hasStructureTable: Boolean(document.querySelector(".speki-structure-table")),
          hasUnselectedEmptyState: /Изделие не выбрано/.test(document.querySelector(".speki-spec-table-panel")?.textContent || ""),
          hasStaleTarget: Boolean(document.querySelector('[data-products-smoke-target="specification"]')),
          hasEditButton: Boolean(editButton),
        };
      });
      if (
        selectionReport.activeCount === 1
        && selectionReport.activeId === target.id
        && selectionReport.persistedId === target.id
        && selectionReport.persistedProjectId === target.id
        && selectionReport.persistedEditingId === ""
        && selectionReport.heading === target.title
        && selectionReport.hasStructureTable
        && !selectionReport.hasUnselectedEmptyState
        && !selectionReport.hasStaleTarget
        && selectionReport.hasEditButton
      ) break;
      await delay(80);
    }
    assert(selectionReport.activeCount === 1, `products: specification selection must leave exactly one active sidebar item: ${JSON.stringify({ target, selectionReport })}`);
    assert(selectionReport.activeId === target.id, `products: clicked specification did not become active: ${JSON.stringify({ target, selectionReport })}`);
    assert(selectionReport.persistedId === target.id, `products: active specification was not persisted: ${JSON.stringify({ target, selectionReport })}`);
    assert(selectionReport.persistedProjectId === target.id && selectionReport.persistedEditingId === "", `products: specification selection persisted an inconsistent UI state: ${JSON.stringify({ target, selectionReport })}`);
    assert(selectionReport.heading === target.title, `products: module header did not switch to the selected specification: ${JSON.stringify({ target, selectionReport })}`);
    assert(selectionReport.hasStructureTable && !selectionReport.hasUnselectedEmptyState, `products: selected specification did not replace the empty state with its structure table: ${JSON.stringify({ target, selectionReport })}`);
    assert(!selectionReport.hasStaleTarget, `products: selection handler did not rerender the workspace: ${JSON.stringify({ target, selectionReport })}`);
    assert(selectionReport.hasEditButton, `products: selected specification does not expose its edit action: ${JSON.stringify({ target, selectionReport })}`);

    await clickVisibleCenter(client, '[data-products-smoke-edit-target="specification"]', "products: selected specification edit action");
    let editReport = null;
    const editStartedAt = Date.now();
    while (Date.now() - editStartedAt < 2500) {
      editReport = await evaluate(client, (specificationId) => {
        let storedUi = {};
        try {
          storedUi = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
        } catch {}
        const nameInput = [...document.querySelectorAll("[data-speki-spec-name]")]
          .find((candidate) => candidate.dataset.spekiSpecName === specificationId);
        const saveButton = [...document.querySelectorAll("[data-speki-save]")]
          .find((candidate) => candidate.dataset.spekiSave === specificationId);
        return {
          hasEnabledNameInput: Boolean(nameInput && !nameInput.disabled),
          hasSaveButton: Boolean(saveButton && !saveButton.disabled),
          persistedEditingId: String(storedUi.spekiEditingId || ""),
        };
      }, target.id);
      if (editReport.hasEnabledNameInput && editReport.hasSaveButton && editReport.persistedEditingId === target.id) break;
      await delay(80);
    }
    assert(
      editReport.hasEnabledNameInput && editReport.hasSaveButton && editReport.persistedEditingId === target.id,
      `products: event bindings were not restored after selection rerender: ${JSON.stringify({ target, editReport })}`
    );

    const addTarget = await evaluate(client, () => {
      const button = document.querySelector('[data-speki-add-row="nomenclature"]');
      if (button) button.dataset.productsSmokeAddTarget = "position";
      return { before: document.querySelectorAll("[data-speki-structure-row]").length, hasButton: Boolean(button) };
    });
    assert(addTarget.hasButton, `products: edit mode does not expose Add position action: ${JSON.stringify(addTarget)}`);
    await clickVisibleCenter(client, '[data-products-smoke-add-target="position"]', "products: add nomenclature position");
    const addedRow = await evaluate(client, () => {
      const rows = [...document.querySelectorAll("[data-speki-structure-row]")];
      const row = rows[rows.length - 1];
      const summary = row?.querySelector("[data-dense-speki-structure-nomenclature] > summary");
      if (summary) summary.dataset.productsSmokeNomenclatureSummary = "position";
      return { count: rows.length, id: row?.dataset.spekiStructureRow || "", hasSummary: Boolean(summary) };
    });
    assert(addedRow.count === addTarget.before + 1 && addedRow.hasSummary, `products: Add position did not create an editable row: ${JSON.stringify({ addTarget, addedRow })}`);
    await clickVisibleCenter(client, '[data-products-smoke-nomenclature-summary="position"]', "products: open nomenclature dropdown");
    const optionTarget = await evaluate(client, () => {
      const open = document.querySelector("[data-dense-speki-structure-nomenclature][open]");
      const option = [...(open?.querySelectorAll("button[data-dense-value]") || [])]
        .find((candidate) => candidate.dataset.denseValue && !candidate.disabled);
      if (option) option.dataset.productsSmokeNomenclatureOption = "position";
      const rect = option?.getBoundingClientRect();
      return {
        hasOption: Boolean(option),
        insideViewport: Boolean(rect && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight),
      };
    });
    assert(optionTarget.hasOption && optionTarget.insideViewport, `products: nomenclature dropdown is clipped or has no selectable value: ${JSON.stringify(optionTarget)}`);
    await clickVisibleCenter(client, '[data-products-smoke-nomenclature-option="position"]', "products: select nomenclature value");
    const selectionMutationReport = await evaluate(client, (itemId) => ({
      hasStartupError: Boolean(document.querySelector(".startup-error-card")),
      editing: Boolean(document.querySelector("[data-speki-save]")),
      selectedRowExists: Boolean(document.querySelector(`[data-speki-structure-row="${itemId}"]`)),
    }), addedRow.id);
    assert(
      !selectionMutationReport.hasStartupError && selectionMutationReport.editing && selectionMutationReport.selectedRowExists,
      `products: selecting nomenclature crashed or left edit mode: ${JSON.stringify(selectionMutationReport)}`
    );
  }
  if (moduleId === "shiftMasterBoard") {
    const badgeReport = await evaluate(client, () => {
      const intakeCount = document.querySelectorAll('[data-shift-board-lane="intake"] [data-shift-board-card]').length;
      const badge = document.querySelector('.module-tab[data-module="shiftMasterBoard"] .module-menu-badge');
      const badgeText = (badge?.textContent || "").trim();
      const badgeCount = badgeText === "99+" ? 100 : Number.parseInt(badgeText.replace(/\D/g, ""), 10);
      const rect = badge?.getBoundingClientRect();
      const tabRect = badge?.closest(".module-tab")?.getBoundingClientRect();
      const style = badge ? getComputedStyle(badge) : null;
      return {
        intakeCount,
        hasBadge: Boolean(badge),
        badgeText,
        badgeCount: Number.isFinite(badgeCount) ? badgeCount : 0,
        rect: rect ? {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
        } : null,
        tabRect: tabRect ? {
          width: Math.round(tabRect.width),
          height: Math.round(tabRect.height),
          x: Math.round(tabRect.x),
          y: Math.round(tabRect.y),
          right: Math.round(tabRect.right),
          bottom: Math.round(tabRect.bottom),
        } : null,
        background: style?.backgroundColor || "",
        borderColor: style?.borderTopColor || "",
        borderWidth: style?.borderTopWidth || "",
        borderRadius: style?.borderTopLeftRadius || "",
      };
    });
    if (badgeReport.intakeCount > 0) {
      assert(badgeReport.hasBadge, `shiftMasterBoard: sidebar badge is missing for ${badgeReport.intakeCount} unassigned tasks`);
      assert(
        badgeReport.badgeText === "99+" || badgeReport.badgeCount === badgeReport.intakeCount,
        `shiftMasterBoard: sidebar badge count mismatch: ${JSON.stringify(badgeReport)}`
      );
      assert(
        badgeReport.rect?.height >= 17
          && badgeReport.rect?.width >= badgeReport.rect?.height
          && Number.parseFloat(badgeReport.borderRadius || "0") >= Math.floor((badgeReport.rect?.height || 0) / 2),
        `shiftMasterBoard: sidebar badge must use macOS-like pill geometry: ${JSON.stringify(badgeReport)}`
      );
      assert(
        badgeReport.background.includes("255, 59, 48")
          && Number.parseFloat(badgeReport.borderWidth || "0") === 0,
        `shiftMasterBoard: sidebar badge should be a macOS-like red counter without a white outline: ${JSON.stringify(badgeReport)}`
      );
      assert(
        badgeReport.rect
          && badgeReport.tabRect
          && badgeReport.rect.x >= badgeReport.tabRect.x
          && badgeReport.rect.y >= badgeReport.tabRect.y
          && badgeReport.rect.right <= badgeReport.tabRect.right
          && badgeReport.rect.bottom <= badgeReport.tabRect.bottom,
        `shiftMasterBoard: sidebar badge must stay inside the module tab to avoid clipping: ${JSON.stringify(badgeReport)}`
      );
    }
    const calendarReport = await evaluate(client, () => {
      const control = document.querySelector('[data-visual-qa-target="shift-master-board-top-controls"] [data-shift-calendar-control]');
      const dateInput = control?.querySelector("[data-shift-calendar-date]");
      const inputRect = dateInput?.getBoundingClientRect();
      const inputCenterY = inputRect ? inputRect.top + inputRect.height / 2 : 0;
      const items = [...(control?.querySelectorAll(".shift-calendar-step, .shift-calendar-open, .shift-calendar-today, .shift-calendar-range") || [])]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const svg = element.querySelector("svg");
          const svgRect = svg?.getBoundingClientRect();
          return {
            className: String(element.className || ""),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            visible: rect.width > 0 && rect.height > 0,
            centerDelta: Math.round(Math.abs((rect.top + rect.height / 2) - inputCenterY) * 10) / 10,
            svgCenterDelta: svgRect ? Math.round(Math.abs((svgRect.top + svgRect.height / 2) - (rect.top + rect.height / 2)) * 10) / 10 : 0,
            svgWidth: svgRect ? Math.round(svgRect.width) : 0,
            svgHeight: svgRect ? Math.round(svgRect.height) : 0,
          };
        });
      return {
        visualTheme: document.documentElement.dataset?.visualTheme || "",
        hasControl: Boolean(control),
        inputHeight: inputRect ? Math.round(inputRect.height) : 0,
        items,
      };
    });
    assert(calendarReport.hasControl, `shiftMasterBoard: top calendar control is missing: ${JSON.stringify(calendarReport)}`);
    assert(
      calendarReport.inputHeight >= 28 && calendarReport.inputHeight <= 36,
      `shiftMasterBoard: top calendar date input height is outside the compact control range: ${JSON.stringify(calendarReport)}`,
    );
    const visibleCalendarItems = calendarReport.items.filter((item) => item.visible);
    assert(
      visibleCalendarItems.length >= (calendarReport.visualTheme === "base-glass" ? 4 : 5)
        && visibleCalendarItems.every((item) => item.height === calendarReport.inputHeight && item.centerDelta <= 1),
      `shiftMasterBoard: calendar controls must align with the date input: ${JSON.stringify(calendarReport)}`
    );
    assert(
      calendarReport.items
        .filter((item) => /shift-calendar-step|shift-calendar-open/.test(item.className))
        .every((item) => item.width === calendarReport.inputHeight && item.svgWidth === 14 && item.svgHeight === 14 && item.svgCenterDelta <= 1),
      `shiftMasterBoard: calendar icon buttons must have centered 14px icons: ${JSON.stringify(calendarReport)}`
    );
    const kuzmMasterScopeReport = await evaluate(client, async () => {
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const masterSelect = document.querySelector("[data-shift-board-master-select]");
      const masterOption = [...(masterSelect?.querySelectorAll("option[value]") || [])]
        .find((option) => /Кузьмина Ирина Романович/i.test(option.dataset.shiftBoardMasterName || option.textContent || ""));
      if (!masterSelect || !masterOption) return { checked: false, reason: "master select is not visible" };
      masterSelect.value = masterOption.value;
      masterSelect.dispatchEvent(new Event("input", { bubbles: true }));
      masterSelect.dispatchEvent(new Event("change", { bubbles: true }));
      await waitFrame();
      const panels = [...document.querySelectorAll("[data-shift-board-assignment-panel]")].map((panel) => ({
        masterId: panel.getAttribute("data-shift-board-assignment-master-id") || "",
        scopeCount: Number(panel.getAttribute("data-shift-board-assignment-scope-count") || 0),
        availableCount: Number(panel.getAttribute("data-shift-board-assignment-available-count") || 0),
        employeeCardCount: panel.querySelectorAll("[data-visual-qa-target=\"shift-master-board-available-person\"]").length,
        text: (panel.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
      }));
      return {
        checked: true,
        panelCount: panels.length,
        maxScopeCount: Math.max(0, ...panels.map((panel) => panel.scopeCount)),
        maxAvailableCount: Math.max(0, ...panels.map((panel) => panel.availableCount)),
        maxEmployeeCardCount: Math.max(0, ...panels.map((panel) => panel.employeeCardCount)),
        panels: panels.slice(0, 4),
      };
    });
    if (kuzmMasterScopeReport.checked && kuzmMasterScopeReport.panelCount > 0) {
      assert(kuzmMasterScopeReport.maxScopeCount > 0, `shiftMasterBoard: Kuzmina scope is empty: ${JSON.stringify(kuzmMasterScopeReport)}`);
      assert(kuzmMasterScopeReport.maxEmployeeCardCount > 0, `shiftMasterBoard: Kuzmina employee cards disappeared: ${JSON.stringify(kuzmMasterScopeReport)}`);
    }
  }
  if (moduleId === "planning") {
    const operationRowSelectionReport = await evaluate(client, () => {
      const tableBefore = document.querySelector(".planning-order-table");
      const operationRows = [...document.querySelectorAll(".planning-order-table .planning-order-step-row[data-planning-order-row]")];
      const operationRow = operationRows.find((row) => !row.classList.contains("is-selected")) || operationRows[0] || null;
      const operationId = operationRow?.dataset.planningOrderRow || "";
      const clickTarget = operationRow?.querySelector("td:first-child") || operationRow;
      if (operationRows.length > 1) clickTarget?.click();
      const tableAfter = document.querySelector(".planning-order-table");
      const selectedRows = [...document.querySelectorAll(".planning-order-table tr.is-selected[data-planning-order-row]")];
      return {
        operationCount: operationRows.length,
        operationId,
        immediateSelected: Boolean(operationRow?.classList.contains("is-selected")),
        selectedCount: selectedRows.length,
        selectedId: selectedRows[0]?.dataset.planningOrderRow || "",
        tablePreserved: Boolean(tableBefore && tableBefore === tableAfter && tableBefore.isConnected),
      };
    });
    // Module smoke intentionally accepts a newly published route with a single
    // operation. Exclusivity needs two rows; the full planning interaction QA
    // supplies that fixture and checks the selection behaviour there.
    if (operationRowSelectionReport.operationCount > 1) {
      assert(operationRowSelectionReport.tablePreserved, `planning: operation-row click synchronously replaced the table DOM: ${JSON.stringify(operationRowSelectionReport)}`);
      assert(
        operationRowSelectionReport.immediateSelected
          && operationRowSelectionReport.selectedCount === 1
          && operationRowSelectionReport.selectedId === operationRowSelectionReport.operationId,
        `planning: operation-row selection is not immediate and exclusive: ${JSON.stringify(operationRowSelectionReport)}`
      );
    }
    const workOrderUxReport = await evaluate(client, () => {
      const strip = document.querySelector(".planning-order-decision-strip");
      const metrics = [...document.querySelectorAll(".planning-order-decision-metric[data-planning-work-item]")];
      const tableWrap = document.querySelector(".planning-order-table-wrap");
      const mainGrid = document.querySelector("[data-visual-qa-target='planning-order-main-grid']");
      const routePanel = document.querySelector(".planning-order-route-map");
      const routeStrip = document.querySelector("[data-visual-qa-target='planning-work-order-route-strip']");
      const legacySidebar = document.querySelector(".planning-order-queue");
      const planningEmptyState = document.querySelector(".planning-empty-page");
      const detailStack = document.querySelector("[data-visual-qa-target='planning-order-detail-stack']");
      const detailPanel = document.querySelector("[data-visual-qa-target='planning-order-detail-panel']");
      const stripRect = strip?.getBoundingClientRect();
      const tableRect = tableWrap?.getBoundingClientRect();
      const mainGridRect = mainGrid?.getBoundingClientRect();
      const routePanelRect = routePanel?.getBoundingClientRect();
      const routeStripRect = routeStrip?.getBoundingClientRect();
      const detailPanelRect = detailPanel?.getBoundingClientRect();
      const routePanelHeadBg = routePanel ? getComputedStyle(routePanel.querySelector(".ui-panel-head") || routePanel).backgroundColor : "";
      const styleSnapshot = (element) => {
        if (!element) return null;
        const style = window.getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderTopWidth: style.borderTopWidth,
          borderBottomWidth: style.borderBottomWidth,
          boxShadow: style.boxShadow,
          color: style.color,
          display: style.display,
          filter: style.filter,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          outlineStyle: style.outlineStyle,
          overflowX: style.overflowX,
          paddingRight: style.paddingRight,
          textAlign: style.textAlign,
        };
      };
      const table = document.querySelector(".planning-order-table");
      const bodyCells = [...document.querySelectorAll(".planning-order-table tbody td")];
      const numericCells = [...document.querySelectorAll(".planning-order-table tbody td:nth-child(4)")];
      const inlineLaborCells = [...document.querySelectorAll(".planning-order-step-row .planning-manual-inline-labor")];
      const inlineLaborInputs = [...document.querySelectorAll(".planning-order-step-row [data-planning-order-labor]")];
      const inlineLaborModes = [...document.querySelectorAll(".planning-order-step-row [data-planning-order-labor-field='mode']")];
      const sidebarRouteItems = [...document.querySelectorAll(".planning-order-route-list .planning-order-route-item[data-planning-route-open]")];
      const sidebarRouteBadges = sidebarRouteItems
        .map((item) => item.querySelector(".ui-sidebar-item-badge"))
        .filter(Boolean);
      const sidebarRouteBadgeOverflowProblems = sidebarRouteBadges.map((badge) => ({
        text: (badge.textContent || "").trim(),
        clientWidth: badge.clientWidth,
        scrollWidth: badge.scrollWidth,
        overflowX: Math.max(0, badge.scrollWidth - badge.clientWidth),
      })).filter((badge) => badge.overflowX > 1);
      const inlineLaborAlignmentProblems = inlineLaborCells.map((labor, index) => {
        const controls = [
          labor.querySelector(".planning-manual-inline-mode"),
          labor.querySelector(".planning-manual-inline-field"),
          labor.querySelector(".planning-manual-inline-reference"),
          labor.querySelector(".planning-manual-inline-result"),
        ].filter(Boolean);
        const bottoms = controls.map((control) => Math.round(control.getBoundingClientRect().bottom * 10) / 10);
        return {
          index,
          controlCount: controls.length,
          bottoms,
          bottomDelta: bottoms.length ? Math.round((Math.max(...bottoms) - Math.min(...bottoms)) * 10) / 10 : 0,
        };
      }).filter((item) => item.controlCount !== 4 || item.bottomDelta > 1);
      const legacyHeader = document.querySelector(".planning-order-header");
      const decisionActions = document.querySelector(".planning-order-decision-actions");
      const decisionDate = decisionActions?.querySelector("[data-planning-start-date]") || null;
      const decisionCancel = decisionActions?.querySelector("[data-planning-route-cancel]") || null;
      const decisionTransfer = decisionActions?.querySelector("[data-planning-route-to-gantt]") || null;
      const decisionActionNodes = [decisionDate, decisionCancel, decisionTransfer].filter(Boolean);
      const decisionActionBottoms = decisionActionNodes.map((control) => Math.round(control.getBoundingClientRect().bottom * 10) / 10);
      const decisionActionBottomDelta = decisionActionBottoms.length
        ? Math.round((Math.max(...decisionActionBottoms) - Math.min(...decisionActionBottoms)) * 10) / 10
        : 0;
      const selectedRow = table?.querySelector("tr.is-selected") || null;
      const selectedCell = selectedRow?.querySelector("td") || null;
      const firstObjectRow = table?.querySelector(".planning-order-object-row") || null;
      const firstStepRow = table?.querySelector(".planning-order-step-row") || null;
      const firstObjectTitle = firstObjectRow?.querySelector("td:first-child strong") || null;
      const firstStepTitle = firstStepRow?.querySelector("td:first-child strong") || null;
      const firstStepSecondary = firstStepRow?.querySelector("td:nth-child(3) strong") || null;
      const metaNodes = [
        firstObjectRow?.querySelector("td:first-child small"),
        firstStepRow?.querySelector("td:first-child small"),
        firstStepRow?.querySelector("td:nth-child(3) small"),
      ].filter(Boolean);
      const routeTreeCells = [...document.querySelectorAll(".planning-order-table .route-tree-cell")];
      const startDots = routeTreeCells.map((cell) => cell.querySelector(".speki-tree-start-dot")).filter(Boolean);
      const selectedDot = selectedRow?.querySelector(".route-tree-cell > .speki-tree-start-dot") || null;
      const branchNodes = [...document.querySelectorAll(".planning-order-table .route-tree-cell .speki-tree-branch")];
      const terminalTreeCells = routeTreeCells.filter((cell) => cell.classList.contains("is-last"));
      const nonterminalTreeCells = routeTreeCells.filter((cell) => !cell.classList.contains("is-last"));
      const treeBranchMetric = (cell) => {
        const branch = cell?.querySelector(":scope > .speki-tree-branch") || null;
        const branchRect = branch?.getBoundingClientRect();
        const bottom = branch ? window.getComputedStyle(branch, "::before").bottom.trim() : "";
        const numericBottom = Number.parseFloat(bottom);
        return {
          bottom,
          branchHeight: Math.round((branchRect?.height || 0) * 10) / 10,
          guideCount: cell?.querySelectorAll(":scope > .speki-tree-guide").length || 0,
          terminalBottom: bottom === "50%"
            || (Number.isFinite(numericBottom) && Boolean(branchRect) && Math.abs(numericBottom - branchRect.height / 2) <= 1),
          negativeBleed: Number.isFinite(numericBottom) && numericBottom < 0,
        };
      };
      const terminalTreeBranchProblems = terminalTreeCells
        .map((cell, index) => ({ index, ...treeBranchMetric(cell) }))
        .filter((item) => !item.terminalBottom);
      const nonterminalTreeBranchProblems = nonterminalTreeCells
        .map((cell, index) => ({ index, ...treeBranchMetric(cell) }))
        .filter((item) => !item.negativeBleed);
      const objectTreeCells = [...document.querySelectorAll(".planning-order-object-row .route-tree-cell")];
      const operationTreeCells = [...document.querySelectorAll(".planning-order-step-row .route-tree-cell")];
      const lastObjectTreeCell = objectTreeCells.at(-1) || null;
      const lastOperationTreeCell = operationTreeCells.at(-1) || null;
      const lastObjectTreeMetric = lastObjectTreeCell ? {
        isTerminal: lastObjectTreeCell.classList.contains("is-last"),
        ...treeBranchMetric(lastObjectTreeCell),
      } : null;
      const lastOperationTreeMetric = lastOperationTreeCell ? {
        isTerminal: lastOperationTreeCell.classList.contains("is-last"),
        ...treeBranchMetric(lastOperationTreeCell),
      } : null;
      const detailPanelBody = detailPanel?.querySelector(":scope > .ui-panel-body") || detailPanel?.querySelector(".ui-panel-body") || null;
      const detailSummary = detailPanel?.querySelector("[data-visual-qa-target='planning-order-detail-summary']") || null;
      const detailTransfer = detailPanel?.querySelector("[data-visual-qa-target='planning-order-detail-transfer']") || null;
      const detailLabor = detailPanel?.querySelector("[data-visual-qa-target='planning-order-detail-labor']") || null;
      const detailLabelNodes = [
        detailSummary?.querySelector("article:nth-child(2) > span"),
        detailSummary?.querySelector("article:nth-child(2) small"),
        detailTransfer?.querySelector("article:first-child > span"),
        detailTransfer?.querySelector("article:first-child small"),
        detailLabor?.querySelector("header span"),
      ].filter(Boolean);
      const detailValueNodes = [
        detailSummary?.querySelector("article:nth-child(2) strong"),
        detailTransfer?.querySelector("article:first-child strong"),
        detailLabor?.querySelector("header strong"),
      ].filter(Boolean);
      const detailAccentNodes = [
        detailSummary?.querySelector("article:first-child > span"),
        detailTransfer?.querySelector("article.is-current > span"),
      ].filter(Boolean);
      const labels = metrics.map((metric) => ({
        id: metric.dataset.planningWorkItem || "",
        text: (metric.textContent || "").replace(/\s+/g, " ").trim(),
      }));
      const metricStyleProblems = metrics.map((metric) => {
        const style = getComputedStyle(metric);
        const radius = Number.parseFloat(style.borderTopLeftRadius || "0") || 0;
        const borderTop = Number.parseFloat(style.borderTopWidth || "0") || 0;
        const borderBottom = Number.parseFloat(style.borderBottomWidth || "0") || 0;
        return {
          id: metric.dataset.planningWorkItem || "",
          radius,
          borderTop,
          borderBottom,
          background: style.backgroundColor,
          boxShadow: style.boxShadow,
          hasQaTarget: Boolean(metric.dataset.visualQaTarget),
        };
      }).filter((item) => (
        item.radius > 2
        || item.borderTop > 0
        || item.borderBottom > 0
        || (item.boxShadow && item.boxShadow !== "none")
        || !item.hasQaTarget
      ));
      const qaTargets = [...document.querySelectorAll("[data-visual-qa-target^='planning-order-decision']")].map((item) => item.dataset.visualQaTarget || "");
      return {
        hasStrip: Boolean(strip),
        stripText: (strip?.textContent || "").replace(/\s+/g, " ").trim(),
        stripWidth: Math.round(stripRect?.width || 0),
        stripHeight: Math.round(stripRect?.height || 0),
        stripOverflowX: strip ? Math.max(0, strip.scrollWidth - strip.clientWidth) : 0,
        stripQaTarget: strip?.dataset.visualQaTarget || "",
        metricCount: metrics.length,
        metricIds: labels.map((item) => item.id),
        metricStyleProblems,
        qaTargets,
        hasMainGrid: Boolean(mainGrid),
        mainGridTemplateColumns: mainGrid ? getComputedStyle(mainGrid).gridTemplateColumns : "",
        hasRouteStrip: Boolean(routeStrip),
        routeStripChipCount: routeStrip?.querySelectorAll("[data-planning-route-open]").length || 0,
        routeStripOverflowX: routeStrip ? Math.max(0, routeStrip.scrollWidth - routeStrip.clientWidth) : 0,
        hasLegacySidebar: Boolean(legacySidebar),
        sidebarRouteCount: legacySidebar?.querySelectorAll("[data-planning-route-open]").length || 0,
        hasPlanningEmptyState: Boolean(planningEmptyState),
        hasDetailStack: Boolean(detailStack),
        hasDetailPanel: Boolean(detailPanel),
        detailPanelText: (detailPanel?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
        detailIsRightOfTree: Boolean(routePanelRect && detailPanelRect && detailPanelRect.left >= routePanelRect.right - 2),
        routePanelAndDetailInsideGrid: Boolean(
          mainGridRect
          && routePanelRect
          && detailPanelRect
          && Math.abs(routePanelRect.left - mainGridRect.left) <= 2
          && detailPanelRect.right <= mainGridRect.right + 2
        ),
        tableOverflowX: tableWrap ? Math.max(0, tableWrap.scrollWidth - tableWrap.clientWidth) : 0,
        selectedRowCount: document.querySelectorAll(".planning-order-table tr.is-selected").length,
        activeMetricCount: document.querySelectorAll(".planning-order-decision-metric.is-active").length,
        tableHeaderLastPaddingRight: table ? window.getComputedStyle(table.querySelector("th:last-child") || table).paddingRight : "",
        bodyHorizontalBorderCount: bodyCells.filter((cell) => {
          const style = window.getComputedStyle(cell);
          return style.borderTopWidth !== "0px" || style.borderBottomWidth !== "0px";
        }).length,
        numericCellCount: numericCells.length,
        numericRightAlignedCount: numericCells.filter((cell) => window.getComputedStyle(cell).textAlign === "right").length,
        numericTabularCount: numericCells.filter((cell) => /tabular-nums/i.test(window.getComputedStyle(cell).fontVariantNumeric || "")).length,
        inlineLaborCellCount: inlineLaborCells.length,
        inlineLaborInputCount: inlineLaborInputs.length,
        inlineLaborModeCount: inlineLaborModes.length,
        inlineLaborAlignmentProblems,
        sidebarRouteBadgeCount: sidebarRouteBadges.length,
        sidebarRouteBadgeOverflowProblems,
        hasLegacyHeader: Boolean(legacyHeader),
        hasDecisionActions: Boolean(decisionActions),
        decisionActionCount: decisionActionNodes.length,
        decisionActionLabels: decisionActionNodes.map((control) => (control.textContent || control.value || "").replace(/\s+/g, " ").trim()),
        decisionActionBottoms,
        decisionActionBottomDelta,
        selectedCellStyle: styleSnapshot(selectedCell),
        selectedRowStyle: styleSnapshot(selectedRow),
        firstObjectCellStyle: styleSnapshot(firstObjectRow?.querySelector("td")),
        firstStepCellStyle: styleSnapshot(firstStepRow?.querySelector("td")),
        objectTitleStyle: styleSnapshot(firstObjectTitle),
        stepTitleStyle: styleSnapshot(firstStepTitle),
        stepSecondaryTitleStyle: styleSnapshot(firstStepSecondary),
        metaStyles: metaNodes.map(styleSnapshot).filter(Boolean),
        routeTreeCellCount: routeTreeCells.length,
        routeTreeBleedValues: [...new Set(routeTreeCells.map((cell) => [
          window.getComputedStyle(cell).getPropertyValue("--speki-tree-line-bleed-top").trim(),
          window.getComputedStyle(cell).getPropertyValue("--speki-tree-line-bleed-bottom").trim(),
        ].join("/")).filter(Boolean))],
        startDotCount: startDots.length,
        startDotDimensionCount: new Set(startDots.map((dot) => {
          const style = window.getComputedStyle(dot);
          return `${style.width}x${style.height}`;
        })).size,
        startDotNeutralCount: startDots.filter((dot) => /rgb\(148, 163, 184\)/.test(window.getComputedStyle(dot).backgroundColor)).length,
        selectedDotStyle: styleSnapshot(selectedDot),
        branchLineNeutralCount: branchNodes.filter((branch) => /rgb\(148, 163, 184\)/.test(window.getComputedStyle(branch, "::before").borderLeftColor)).length,
        branchLineCount: branchNodes.length,
        terminalTreeCellCount: terminalTreeCells.length,
        terminalTreeBranchProblems,
        nonterminalTreeCellCount: nonterminalTreeCells.length,
        nonterminalTreeBranchProblems,
        lastObjectTreeMetric,
        lastOperationTreeMetric,
        detailPanelStyle: styleSnapshot(detailPanel),
        detailBodyGap: detailPanelBody ? window.getComputedStyle(detailPanelBody).gap : "",
        detailSummaryDisplay: detailSummary ? window.getComputedStyle(detailSummary).display : "",
        detailSummaryGap: detailSummary ? window.getComputedStyle(detailSummary).gap : "",
        detailSummaryCardCount: detailSummary?.querySelectorAll("article").length || 0,
        detailSummaryOuterBorderTop: detailSummary ? window.getComputedStyle(detailSummary).borderTopWidth : "",
        detailSummaryArticleBorderCount: [...(detailSummary?.querySelectorAll("article") || [])]
          .filter((item) => window.getComputedStyle(item).borderTopWidth !== "0px").length,
        detailTransferCardCount: detailTransfer?.querySelectorAll("article").length || 0,
        detailTransferLinkCount: detailTransfer?.querySelectorAll(".planning-order-detail-transfer-link").length || 0,
        detailLabelStyles: detailLabelNodes.map(styleSnapshot).filter(Boolean),
        detailValueStyles: detailValueNodes.map(styleSnapshot).filter(Boolean),
        detailAccentStyles: detailAccentNodes.map(styleSnapshot).filter(Boolean),
        routePanelHeadBg,
        hasDurationMetric: labels.some((item) => item.id === "duration"),
        hasScheduleMetric: labels.some((item) => item.id === "schedule" && item.text.includes("Гант")),
        tableBelowStrip: Boolean(stripRect && tableRect && tableRect.top >= stripRect.bottom),
        routeStripAboveGrid: Boolean(routeStripRect && mainGridRect && routeStripRect.bottom <= mainGridRect.top),
      };
    });
    if (!workOrderUxReport.hasStrip) {
      assert(
        workOrderUxReport.hasPlanningEmptyState && workOrderUxReport.sidebarRouteCount === 0,
        `planning: route-aware work-order UI is missing without the valid empty state: ${JSON.stringify(workOrderUxReport)}`,
      );
      return;
    }
    assert(workOrderUxReport.stripText.includes("Решение"), `planning: work-order decision strip has no decision label: ${workOrderUxReport.stripText}`);
    assert(workOrderUxReport.stripWidth > 320 && workOrderUxReport.stripHeight > 30, `planning: work-order decision strip geometry is broken: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.stripOverflowX <= 2, `planning: work-order decision strip horizontal overflow ${workOrderUxReport.stripOverflowX}px`);
    assert(workOrderUxReport.stripQaTarget === "planning-order-decision-strip", `planning: work-order decision strip has no visual QA target: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.metricCount >= 5, `planning: expected at least 5 decision metrics, got ${workOrderUxReport.metricCount}`);
    assert(workOrderUxReport.metricStyleProblems.length === 0, `planning: decision metrics returned card-like/QA-broken styling: ${JSON.stringify(workOrderUxReport.metricStyleProblems)}`);
    assert(workOrderUxReport.qaTargets.length >= 18, `planning: decision strip has too few QA targets: ${JSON.stringify(workOrderUxReport.qaTargets)}`);
    assert(workOrderUxReport.hasDurationMetric, `planning: duration decision metric is missing: ${JSON.stringify(workOrderUxReport.metricIds)}`);
    assert(workOrderUxReport.hasScheduleMetric, `planning: schedule decision metric is missing: ${JSON.stringify(workOrderUxReport.metricIds)}`);
    assert(workOrderUxReport.tableBelowStrip, "planning: work-order table overlaps decision strip");
    assert(!workOrderUxReport.hasRouteStrip, `planning: work-order route strip must be replaced by the sidebar: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.hasLegacySidebar && workOrderUxReport.sidebarRouteCount > 0, `planning: work-order sidebar is missing or empty: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.hasMainGrid && !workOrderUxReport.hasDetailStack && !workOrderUxReport.hasDetailPanel, `planning: work-order screen must use sidebar plus table layout without the right detail panel: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.tableOverflowX <= 2, `planning: redesigned work-order tree table must fit without horizontal scrolling: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.selectedRowCount + workOrderUxReport.activeMetricCount >= 1, `planning: redesigned work-order screen must keep either active tree row or active decision metric visible: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.inlineLaborCellCount === 0 && workOrderUxReport.inlineLaborInputCount === 0 && workOrderUxReport.inlineLaborModeCount === 0, `planning: work-order table must not expose normalization controls: ${JSON.stringify(workOrderUxReport)}`);
    if (operationRowSelectionReport.operationCount < 2 || workOrderUxReport.sidebarRouteCount < 2) return;
    assert(workOrderUxReport.inlineLaborAlignmentProblems.length === 0, `planning: labor controls do not share one bottom edge: ${JSON.stringify(workOrderUxReport.inlineLaborAlignmentProblems)}`);
    assert(
      workOrderUxReport.sidebarRouteBadgeCount === workOrderUxReport.sidebarRouteCount
        && workOrderUxReport.sidebarRouteBadgeOverflowProblems.length === 0,
      `planning: sidebar route status badge overflows its box: ${JSON.stringify(workOrderUxReport.sidebarRouteBadgeOverflowProblems)}`
    );
    assert(!workOrderUxReport.hasLegacyHeader, `planning: secondary planning-order header must be removed: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.hasDecisionActions, `planning: decision action area is missing: ${JSON.stringify(workOrderUxReport)}`);
    assert(
      workOrderUxReport.decisionActionCount === 3 && workOrderUxReport.decisionActionBottomDelta <= 1,
      `planning: start date and decision actions do not share one bottom edge: ${JSON.stringify({ labels: workOrderUxReport.decisionActionLabels, bottoms: workOrderUxReport.decisionActionBottoms, delta: workOrderUxReport.decisionActionBottomDelta })}`
    );
    assert(workOrderUxReport.routePanelHeadBg !== "rgba(0, 0, 0, 0)", `planning: document tree panel head must keep accent background: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.tableHeaderLastPaddingRight === "10px", `planning: table header must not be visually clipped at the last column: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.bodyHorizontalBorderCount === 0, `planning: work-order tree rows must not return horizontal separators: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.numericCellCount > 0 && workOrderUxReport.numericRightAlignedCount === workOrderUxReport.numericCellCount, `planning: quantity cells must be right-aligned: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.numericTabularCount === workOrderUxReport.numericCellCount, `planning: quantity cells must use tabular numbers: ${JSON.stringify(workOrderUxReport)}`);
    if (workOrderUxReport.selectedRowCount > 0) {
      assert(/rgba?\(255, 255, 255/.test(workOrderUxReport.selectedCellStyle?.backgroundColor || ""), `planning: active row must use the same white lift variant as Shift Work Orders: ${JSON.stringify(workOrderUxReport)}`);
      assert(/drop-shadow/i.test(workOrderUxReport.selectedRowStyle?.filter || ""), `planning: active row must use lift shadow, not the old blue fill: ${JSON.stringify(workOrderUxReport)}`);
      assert(workOrderUxReport.selectedCellStyle?.boxShadow === "none", `planning: active row must not use a first-cell marker shadow: ${JSON.stringify(workOrderUxReport)}`);
    }
    assert(workOrderUxReport.firstObjectCellStyle?.fontSize === "11px", `planning: object row body typography must match compact document tree scale: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.firstStepCellStyle?.fontSize === "11px", `planning: step row body typography must match compact document tree scale: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.objectTitleStyle?.fontSize === "12px" && Number(workOrderUxReport.objectTitleStyle?.fontWeight || 0) >= 660, `planning: object title must be the strongest tree level: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.stepTitleStyle?.fontSize === "11px" && Number(workOrderUxReport.stepTitleStyle?.fontWeight || 0) >= 590, `planning: operation title typography must match the document tree child level: ${JSON.stringify(workOrderUxReport)}`);
    assert(Number(workOrderUxReport.stepSecondaryTitleStyle?.fontWeight || 0) < Number(workOrderUxReport.stepTitleStyle?.fontWeight || 0), `planning: secondary operation/context title must be quieter than the main title: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.metaStyles.length >= 2 && workOrderUxReport.metaStyles.every((style) => style.fontSize === "10px" && Number(style.fontWeight) === 500), `planning: tree meta labels must use one quiet size/weight: ${JSON.stringify(workOrderUxReport.metaStyles)}`);
    assert(workOrderUxReport.routeTreeCellCount > 0 && workOrderUxReport.startDotCount === workOrderUxReport.routeTreeCellCount, `planning: every tree row must expose the shared route tree dot: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.startDotDimensionCount === 1, `planning: tree start dots must use one normalized size: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.startDotNeutralCount >= workOrderUxReport.startDotCount - 1, `planning: inactive tree dots must stay neutral gray: ${JSON.stringify(workOrderUxReport)}`);
    assert(/rgb\(15, 23, 42\)/.test(workOrderUxReport.selectedDotStyle?.backgroundColor || ""), `planning: selected tree dot must be filled black: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.routeTreeBleedValues.every((value) => !/^(4px|8px)\/(4px|8px)$/.test(value)), `planning: old tree line bleed values from legacy layer returned: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.branchLineCount === 0 || workOrderUxReport.branchLineNeutralCount === workOrderUxReport.branchLineCount, `planning: tree connector lines must stay neutral gray: ${JSON.stringify(workOrderUxReport)}`);
    assert(
      workOrderUxReport.terminalTreeCellCount > 0 && workOrderUxReport.terminalTreeBranchProblems.length === 0,
      `planning: terminal tree branch must stop at 50%: ${JSON.stringify(workOrderUxReport.terminalTreeBranchProblems)}`
    );
    assert(
      workOrderUxReport.nonterminalTreeCellCount > 0 && workOrderUxReport.nonterminalTreeBranchProblems.length === 0,
      `planning: nonterminal tree branch must preserve negative line bleed: ${JSON.stringify(workOrderUxReport.nonterminalTreeBranchProblems)}`
    );
    assert(
      workOrderUxReport.lastObjectTreeMetric?.isTerminal
        && workOrderUxReport.lastObjectTreeMetric?.terminalBottom
        && workOrderUxReport.lastObjectTreeMetric?.guideCount === 0,
      `planning: final object tree node keeps a parasitic continuation guide: ${JSON.stringify(workOrderUxReport.lastObjectTreeMetric)}`
    );
    assert(
      workOrderUxReport.lastOperationTreeMetric?.isTerminal
        && workOrderUxReport.lastOperationTreeMetric?.terminalBottom
        && workOrderUxReport.lastOperationTreeMetric?.guideCount === 0,
      `planning: final operation tree node keeps a parasitic continuation guide: ${JSON.stringify(workOrderUxReport.lastOperationTreeMetric)}`
    );
    const workOrderMetricClickReport = await evaluate(client, async () => {
      const delayFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const metricIds = [...document.querySelectorAll(".planning-order-decision-metric[data-planning-work-item]")]
        .map((metric) => metric.dataset.planningWorkItem || "")
        .filter(Boolean);
      const results = [];
      for (const id of metricIds) {
        const metric = document.querySelector(`.planning-order-decision-metric[data-planning-work-item="${CSS.escape(id)}"]`);
        metric?.click();
        await delayFrame();
        const currentMetric = document.querySelector(`.planning-order-decision-metric[data-planning-work-item="${CSS.escape(id)}"]`);
        const strip = document.querySelector(".planning-order-decision-strip");
        const tableWrap = document.querySelector(".planning-order-table-wrap");
        const stripRect = strip?.getBoundingClientRect();
        const tableRect = tableWrap?.getBoundingClientRect();
        results.push({
          id,
          active: Boolean(currentMetric?.classList.contains("is-active")),
          stripOverflowX: strip ? Math.max(0, strip.scrollWidth - strip.clientWidth) : 0,
          tableOverflowX: tableWrap ? Math.max(0, tableWrap.scrollWidth - tableWrap.clientWidth) : 0,
          tableBelowStrip: Boolean(stripRect && tableRect && tableRect.top >= stripRect.bottom),
        });
      }
      return results;
    });
    const inactiveDecisionMetrics = workOrderMetricClickReport.filter((item) => !item.active);
    const overflowingDecisionMetrics = workOrderMetricClickReport.filter((item) => item.stripOverflowX > 2 || item.tableOverflowX > 2 || !item.tableBelowStrip);
    assert(inactiveDecisionMetrics.length === 0, `planning: decision metrics do not become active after click: ${JSON.stringify(inactiveDecisionMetrics)}`);
    assert(overflowingDecisionMetrics.length === 0, `planning: decision metric click causes layout drift: ${JSON.stringify(overflowingDecisionMetrics)}`);
    const sidebarRouteSelectionReport = await evaluate(client, async () => {
      const waitForDeferredRefresh = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const pageBefore = document.querySelector(".planning-order-page[data-planning-active-route-id]");
      const sidebarBefore = pageBefore?.querySelector(":scope > .planning-order-queue") || null;
      const workspaceBefore = pageBefore?.querySelector(':scope > [data-ui-component="ModuleWorkspace"]') || null;
      const routeItems = [...document.querySelectorAll(".planning-order-route-list .planning-order-route-item[data-planning-route-open]")];
      const markerBefore = pageBefore?.dataset.planningActiveRouteId || "";
      const selectedRoute = routeItems.find((item) => item.dataset.planningRouteOpen !== markerBefore) || routeItems[1] || null;
      const selectedRouteId = selectedRoute?.dataset.planningRouteOpen || "";
      selectedRoute?.click();
      const pageAfterImmediateClick = document.querySelector(".planning-order-page[data-planning-active-route-id]");
      const immediateActiveItems = [...document.querySelectorAll(".planning-order-route-list .planning-order-route-item.is-active[data-planning-route-open]")];
      const pagePreserved = Boolean(pageBefore && pageBefore === pageAfterImmediateClick && pageBefore.isConnected);
      await waitForDeferredRefresh();
      const pageAfterRefresh = document.querySelector(".planning-order-page[data-planning-active-route-id]");
      const sidebarAfter = pageAfterRefresh?.querySelector(":scope > .planning-order-queue") || null;
      const workspaceAfter = pageAfterRefresh?.querySelector(':scope > [data-ui-component="ModuleWorkspace"]') || null;
      const currentUrl = new URL(window.location.href);
      return {
        routeCount: routeItems.length,
        selectedRouteId,
        markerBefore,
        markerAfter: pageAfterRefresh?.dataset.planningActiveRouteId || "",
        markerChanged: Boolean(markerBefore && selectedRouteId && markerBefore !== selectedRouteId),
        activeCount: immediateActiveItems.length,
        activeRouteId: immediateActiveItems[0]?.dataset.planningRouteOpen || "",
        pagePreserved,
        sidebarPreserved: Boolean(sidebarBefore && sidebarBefore === sidebarAfter && sidebarBefore.isConnected),
        workspaceRefreshed: Boolean(workspaceBefore && workspaceAfter && workspaceBefore !== workspaceAfter && workspaceAfter.isConnected),
        layoutPage: document.querySelector("main.app-shell")?.dataset.layoutPage || "",
        urlModule: currentUrl.searchParams.get("module") || "",
      };
    });
    assert(sidebarRouteSelectionReport.routeCount > 1, `planning: sidebar route selection needs a second route: ${JSON.stringify(sidebarRouteSelectionReport)}`);
    assert(sidebarRouteSelectionReport.markerChanged, `planning: no inactive sidebar route is available or active-route marker is missing: ${JSON.stringify(sidebarRouteSelectionReport)}`);
    assert(sidebarRouteSelectionReport.pagePreserved, `planning: sidebar route click synchronously replaced the planning page DOM: ${JSON.stringify(sidebarRouteSelectionReport)}`);
    assert(
      sidebarRouteSelectionReport.sidebarPreserved && sidebarRouteSelectionReport.workspaceRefreshed,
      `planning: route selection must preserve the sidebar and refresh only the planning workspace: ${JSON.stringify(sidebarRouteSelectionReport)}`
    );
    assert(
      sidebarRouteSelectionReport.layoutPage === "planning"
        && ["planning", "planning2", "planningWorkbench"].includes(sidebarRouteSelectionReport.urlModule),
      `planning: sidebar route selection navigated away from planning: ${JSON.stringify(sidebarRouteSelectionReport)}`
    );
    assert(
      sidebarRouteSelectionReport.activeCount === 1
        && sidebarRouteSelectionReport.activeRouteId === sidebarRouteSelectionReport.selectedRouteId,
      `planning: another sidebar route selection is not immediate and exclusive: ${JSON.stringify(sidebarRouteSelectionReport)}`
    );
    assert(
      sidebarRouteSelectionReport.markerAfter === sidebarRouteSelectionReport.selectedRouteId,
      `planning: active-route marker did not follow the selected sidebar route: ${JSON.stringify(sidebarRouteSelectionReport)}`
    );
  }
  if (moduleId === "gantt") {
    const startedAt = Date.now();
    let readiness = null;
    while (Date.now() - startedAt < 20000) {
      readiness = await evaluate(client, () => {
        const island = document.querySelector("[data-react-gantt-island]");
        return {
          present: Boolean(island),
          state: island?.getAttribute("data-react-island-state") || "",
          mode: island?.getAttribute("data-react-island-runtime-mode") || "",
          text: (island?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 280),
        };
      });
      if (readiness.state === "ready" || readiness.state === "error") break;
      await delay(120);
    }
    assert(readiness?.present, "gantt: permanent React island is missing");
    assert(readiness.state === "ready", "gantt: React island did not become ready: " + JSON.stringify(readiness));
    assert(readiness.mode === "react", "gantt: permanent runtime mode is not React: " + JSON.stringify(readiness));

    const ganttReport = await evaluate(client, () => {
      const island = document.querySelector("[data-react-gantt-island]");
      const runtime = island?.querySelector(".gantt-react-scroll[data-ui-component='GanttRuntime']");
      const canvas = runtime?.querySelector(".gantt-react-canvas[data-ui-component='GanttCanvas']");
      const timeline = runtime?.querySelector(".gantt-react-timeline[data-ui-component='GanttTimeline']");
      const rowsLayer = runtime?.querySelector(".gantt-react-rows[data-ui-component='GanttRowsLayer']");
      const rows = [...(rowsLayer?.querySelectorAll(".gantt-react-row[data-row-id]") || [])];
      const lanes = [...(rowsLayer?.querySelectorAll(".gantt-react-lane[data-gantt-react-drop-lane]") || [])];
      const slots = [...(rowsLayer?.querySelectorAll("[data-ui-component='GanttSlot'][data-slot-id]") || [])];
      const runtimeRect = runtime?.getBoundingClientRect();
      const canvasRect = canvas?.getBoundingClientRect();
      return {
        islandState: island?.getAttribute("data-react-island-state") || "",
        runtimeMode: island?.getAttribute("data-react-island-runtime-mode") || "",
        hasLegacyShell: Boolean(document.querySelector("[data-gantt-shell]")),
        hasRuntime: Boolean(runtime),
        hasCanvas: Boolean(canvas),
        hasTimeline: Boolean(timeline),
        hasRowsLayer: Boolean(rowsLayer),
        hasToolbar: Boolean(island?.querySelector(".gantt-react-toolbar")),
        hasPeriod: Boolean(island?.querySelector("[data-gantt-react-period] input[type='date']")),
        scaleCount: island?.querySelectorAll("[data-gantt-react-scale]").length || 0,
        zoomCount: island?.querySelectorAll("[data-gantt-react-zoom]").length || 0,
        blockedActionCount: island?.querySelectorAll("[data-gantt-react-blocked-action]").length || 0,
        hasScheduleSurface: Boolean(island?.querySelector("[data-gantt-react-schedule-form], [data-gantt-react-schedule-blocked]")),
        rowCount: rows.length,
        labelCount: rowsLayer?.querySelectorAll(".gantt-react-label").length || 0,
        laneCount: lanes.length,
        laneIdentityProblems: rows
          .filter((row) => row.querySelector(".gantt-react-lane")?.getAttribute("data-gantt-react-drop-lane") !== row.getAttribute("data-row-id"))
          .map((row) => row.getAttribute("data-row-id") || "")
          .slice(0, 8),
        slotCount: slots.length,
        slotIds: slots.map((slot) => slot.getAttribute("data-slot-id") || ""),
        slotBounds: slots.slice(0, 8).map((slot) => {
          const rect = slot.getBoundingClientRect();
          return { width: Math.round(rect.width), height: Math.round(rect.height) };
        }),
        runtimeWidth: Math.round(runtimeRect?.width || 0),
        runtimeHeight: Math.round(runtimeRect?.height || 0),
        canvasWidth: Math.round(canvasRect?.width || 0),
        canvasHeight: Math.round(canvasRect?.height || 0),
        pageOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      };
    });

    assert(!ganttReport.hasLegacyShell, "gantt: retired legacy shell returned");
    assert(ganttReport.hasRuntime, "gantt: React GanttRuntime is missing");
    assert(ganttReport.hasCanvas, "gantt: React GanttCanvas contract is missing");
    assert(ganttReport.hasTimeline, "gantt: React GanttTimeline contract is missing");
    assert(ganttReport.hasRowsLayer, "gantt: React GanttRowsLayer contract is missing");
    assert(ganttReport.hasToolbar && ganttReport.hasPeriod, "gantt: React toolbar or period control is missing");
    assert(ganttReport.scaleCount >= 3 && ganttReport.zoomCount === 3, "gantt: typed scale/zoom controls are incomplete: " + JSON.stringify(ganttReport));
    assert(ganttReport.blockedActionCount >= 4, "gantt: deferred owner actions are not explicitly marked: " + JSON.stringify(ganttReport));
    assert(ganttReport.hasScheduleSurface, "gantt: schedule command must be present or explicitly fail closed");
    assert(ganttReport.labelCount === ganttReport.rowCount, "gantt: React row label count drift: " + JSON.stringify(ganttReport));
    assert(ganttReport.laneCount === ganttReport.rowCount, "gantt: React row lane count drift: " + JSON.stringify(ganttReport));
    assert(ganttReport.laneIdentityProblems.length === 0, "gantt: React row/lane identity drift: " + JSON.stringify(ganttReport.laneIdentityProblems));
    assert(ganttReport.slotIds.every(Boolean) && new Set(ganttReport.slotIds).size === ganttReport.slotIds.length, "gantt: physical slot ids are missing or duplicated");
    assert(ganttReport.slotBounds.every((slot) => slot.width > 0 && slot.height > 0), "gantt: React slot has empty geometry: " + JSON.stringify(ganttReport.slotBounds));
    if (ganttReport.rowCount > 0) {
      assert(ganttReport.runtimeWidth > 320 && ganttReport.runtimeHeight > 240, "gantt: React runtime dimensions look broken: " + JSON.stringify(ganttReport));
      assert(ganttReport.canvasWidth >= ganttReport.runtimeWidth && ganttReport.canvasHeight > 0, "gantt: React canvas dimensions look broken: " + JSON.stringify(ganttReport));
    } else {
      assert(ganttReport.slotCount === 0, "gantt: empty PostgreSQL projection rendered orphan physical slots: " + JSON.stringify(ganttReport));
      assert(ganttReport.runtimeWidth > 320 && ganttReport.runtimeHeight >= 48 && ganttReport.canvasHeight >= 32, "gantt: empty React runtime shell looks broken: " + JSON.stringify(ganttReport));
    }
    assert(ganttReport.pageOverflowX <= 2, "gantt: page horizontal overflow " + ganttReport.pageOverflowX + "px");

    if (ganttReport.slotCount > 0) {
      const selectionReport = await evaluate(client, async () => {
        const slot = document.querySelector("[data-ui-component='GanttSlot'][data-slot-id]");
        const slotId = slot?.getAttribute("data-slot-id") || "";
        slot?.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const selected = document.querySelector("[data-ui-component='GanttSlot'][aria-pressed='true']");
        return {
          slotId,
          selectedId: selected?.getAttribute("data-slot-id") || "",
          detailText: (document.querySelector(".gantt-react-detail")?.textContent || "").replace(/\s+/g, " ").trim(),
        };
      });
      assert(selectionReport.selectedId === selectionReport.slotId, "gantt: React slot selection did not stay on the exact physical slot: " + JSON.stringify(selectionReport));
      assert(selectionReport.detailText.length > 20, "gantt: selected slot detail did not render");
    }
  }
  if (moduleId === "authSessionPrototype") {
    const authSessionReport = await evaluate(client, () => {
      const context = document.querySelector("[data-visual-qa-target='auth-session-task-context']");
      const taskCards = [...document.querySelectorAll("[data-visual-qa-target='auth-session-task-card']")];
      const baseRequiredTargets = [
        "auth-session-header",
        "auth-session-kpis",
        "auth-session-kpi-tasks-value",
      ];
      const taskRequiredTargets = [
        "auth-session-summary-product-value",
        "auth-session-summary-operation-value",
        "auth-session-task-actions-header",
        "auth-session-task-action-start",
        "auth-session-task-action-report",
        "auth-session-fact-header",
        "auth-session-fact-status",
        "auth-session-fact-actual-value",
        "auth-session-fact-defect-value",
        "auth-session-keypad-digit-0",
        "auth-session-keypad-backspace",
        "auth-session-task-card-operation",
        "auth-session-task-card-route-before",
        "auth-session-task-card-route-after",
        "auth-session-task-card-quantity",
        "auth-session-task-card-status",
      ];
      const hasTaskUi = Boolean(context) || taskCards.length > 0;
      const requiredTargets = hasTaskUi ? [...baseRequiredTargets, ...taskRequiredTargets] : baseRequiredTargets;
      const missingTargets = requiredTargets.filter((target) => !document.querySelector(`[data-visual-qa-target='${target}']`));
      const nestedCoverageTargets = [...document.querySelectorAll("[data-visual-qa-target^='auth-session-']")]
        .map((node) => node.getAttribute("data-visual-qa-target"))
        .filter(Boolean);
      const cardRouteProblems = taskCards
        .map((card, index) => {
          const route = card.querySelector("[data-visual-qa-target='auth-session-task-card-route']");
          const before = card.querySelector("[data-visual-qa-target='auth-session-task-card-route-before']");
          const after = card.querySelector("[data-visual-qa-target='auth-session-task-card-route-after']");
          const rect = route?.getBoundingClientRect();
          const overflowX = route ? Math.max(0, route.scrollWidth - route.clientWidth) : 0;
          if (route && before && after && rect?.width > 0 && overflowX <= 2) return null;
          return {
            index,
            hasRoute: Boolean(route),
            hasBefore: Boolean(before),
            hasAfter: Boolean(after),
            overflowX,
            cardText: (card.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
          };
        })
        .filter(Boolean);
      const factGrid = document.querySelector("[data-visual-qa-target='auth-session-fact-grid']");
      const factGridOverflowX = factGrid ? Math.max(0, factGrid.scrollWidth - factGrid.clientWidth) : 0;
      const factCardRects = [
        "auth-session-fact-actual",
        "auth-session-fact-defect",
        "auth-session-fact-assigned",
      ]
        .map((target) => {
          const element = document.querySelector(`[data-visual-qa-target='${target}']`);
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          const nestedOverflow = [...element.querySelectorAll("[data-visual-qa-target]")]
            .some((child) => child.scrollWidth > child.clientWidth + 2 || child.scrollHeight > child.clientHeight + 2);
          return {
            target,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            nestedOverflow,
          };
        })
        .filter(Boolean);
      const authSummary = document.querySelector("[data-visual-qa-target='app-auth-session-summary']");
      const refreshButton = document.querySelector("[data-refresh-app]");
      const departmentLine = document.querySelector("[data-visual-qa-target='app-auth-session-department']");
      const authSummaryRect = authSummary?.getBoundingClientRect();
      const refreshButtonRect = refreshButton?.getBoundingClientRect();
      const authSummaryTopbar = authSummary && refreshButton && authSummaryRect && refreshButtonRect
        ? {
          summaryLeft: Math.round(authSummaryRect.left),
          summaryRight: Math.round(authSummaryRect.right),
          summaryWidth: Math.round(authSummaryRect.width),
          refreshRight: Math.round(refreshButtonRect.right),
          viewportRight: Math.round(window.innerWidth),
          departmentWeight: Number.parseFloat(getComputedStyle(departmentLine).fontWeight || "0"),
          text: (authSummary.textContent || "").replace(/\s+/g, " ").trim(),
        }
        : null;
      return {
        hasContext: Boolean(context),
        routeChainInsideContext: Boolean(context?.querySelector("[data-visual-qa-target='auth-session-route-chain'], .auth-session-route-chain")),
        taskCardCount: taskCards.length,
        hasTaskUi,
        cardRouteProblems,
        factGridOverflowX,
        factCardRects,
        authSummaryTopbar,
        missingTargets,
        nestedCoverageCount: nestedCoverageTargets.length,
      };
    });
    assert(!authSessionReport.routeChainInsideContext, `authSessionPrototype: route chain must be moved out of task context: ${JSON.stringify(authSessionReport)}`);
    assert(authSessionReport.missingTargets.length === 0, `authSessionPrototype: missing nested inspection targets: ${JSON.stringify(authSessionReport.missingTargets)}`);
    if (authSessionReport.hasTaskUi) {
      assert(authSessionReport.nestedCoverageCount >= 45, `authSessionPrototype: expected broad nested inspection coverage, got ${authSessionReport.nestedCoverageCount}`);
      assert(authSessionReport.factGridOverflowX <= 2, `authSessionPrototype: fact input grid overflows horizontally by ${authSessionReport.factGridOverflowX}px`);
      assert(
        authSessionReport.factCardRects.length === 3 && authSessionReport.factCardRects.every((card) => card.width >= 140 && !card.nestedOverflow),
        `authSessionPrototype: fact cards are too narrow or overflowing: ${JSON.stringify(authSessionReport.factCardRects)}`,
      );
      assert(
        authSessionReport.authSummaryTopbar
          && authSessionReport.authSummaryTopbar.summaryLeft > authSessionReport.authSummaryTopbar.refreshRight
          && authSessionReport.authSummaryTopbar.viewportRight - authSessionReport.authSummaryTopbar.summaryRight <= 180
          && authSessionReport.authSummaryTopbar.summaryWidth <= 170
          && authSessionReport.authSummaryTopbar.departmentWeight <= 450,
        `authSessionPrototype: topbar auth summary must be compact, sit at the right, and use regular department text: ${JSON.stringify(authSessionReport.authSummaryTopbar)}`,
      );
    }
    if (authSessionReport.taskCardCount > 0) {
      assert(authSessionReport.cardRouteProblems.length === 0, `authSessionPrototype: task cards must contain compact route transfer text: ${JSON.stringify(authSessionReport.cardRouteProblems)}`);
    }
  }
	  if (moduleId !== "shiftWorkOrders") return;
	  const journalSeedReport = await evaluate(client, () => (
	    window.__mesRuntime?.seedShiftWorkOrderJournalAssignmentForTest?.()
	    || { seeded: false, reason: "runtime api missing" }
	 ));
	  // A cleaned, isolated baseline can legitimately have no released shift
	  // row. Rich journal assertions run in the dedicated seeded flow; here we
	  // still require the module itself to render, but do not treat absence of
	  // retired data as a UI regression.
	  if (!journalSeedReport.seeded && journalSeedReport.reason === "shift row is missing") return;
  assert(journalSeedReport.seeded, `shiftWorkOrders: could not seed a distributed shift task for journal QA: ${JSON.stringify(journalSeedReport)}`);
  await delay(240);
  await waitForModule(client, "shiftWorkOrders");
  const report = await evaluate(client, () => {
    const page = document.querySelector(".shift-work-orders-page");
    const panels = [...document.querySelectorAll(".shift-work-orders-panel")];
    const panelWithoutBody = panels.filter((panel) => (
      ![...panel.children].some((child) => child.classList?.contains("ui-panel-body"))
    ));
    const tableWrap = document.querySelector(".shift-work-orders-table-wrap");
    const content = document.querySelector(".shift-work-orders-content");
    const treeParents = [...document.querySelectorAll("[data-shift-work-order-package-row]")];
    const treeOperations = [...document.querySelectorAll("[data-shift-work-order-operation-row]")];
    const treeChildren = [...document.querySelectorAll("[data-shift-work-order-row]")];
    const sampleTreeChild = treeChildren.find((row) => !row.classList.contains("is-active")) || treeChildren[0] || null;
    const firstParentCellStyle = treeParents[0]?.querySelector("td")
      ? window.getComputedStyle(treeParents[0].querySelector("td"))
      : null;
    const firstOperationCellStyle = treeOperations[0]?.querySelector("td")
      ? window.getComputedStyle(treeOperations[0].querySelector("td"))
      : null;
    const firstChildCellStyle = sampleTreeChild?.querySelector("td")
      ? window.getComputedStyle(sampleTreeChild.querySelector("td"))
      : null;
    const parentStatusStyle = treeParents[0]?.querySelector(".shift-work-orders-group-status")
      ? window.getComputedStyle(treeParents[0].querySelector(".shift-work-orders-group-status"))
      : null;
    const operationStatusStyle = treeOperations[0]?.querySelector(".shift-work-orders-group-status")
      ? window.getComputedStyle(treeOperations[0].querySelector(".shift-work-orders-group-status"))
      : null;
    const activeTreeChild = document.querySelector("[data-shift-work-order-row].is-active");
    const groupLabels = [...document.querySelectorAll(".shift-work-orders-group-label")];
    const activeFirstCellStyle = activeTreeChild?.querySelector("td:first-child")
      ? window.getComputedStyle(activeTreeChild.querySelector("td:first-child"))
      : null;
    const activeSecondCellStyle = activeTreeChild?.querySelector("td:nth-child(2)")
      ? window.getComputedStyle(activeTreeChild.querySelector("td:nth-child(2)"))
      : null;
    const parentTitleStyle = treeParents[0]?.querySelector("td:first-child strong")
      ? window.getComputedStyle(treeParents[0].querySelector("td:first-child strong"))
      : null;
    const operationTitleStyle = treeOperations[0]?.querySelector("td:first-child strong")
      ? window.getComputedStyle(treeOperations[0].querySelector("td:first-child strong"))
      : null;
    const childTitleStyle = sampleTreeChild?.querySelector("td:first-child strong")
      ? window.getComputedStyle(sampleTreeChild.querySelector("td:first-child strong"))
      : null;
    const childSecondTitleStyle = sampleTreeChild?.querySelector("td:nth-child(2) strong")
      ? window.getComputedStyle(sampleTreeChild.querySelector("td:nth-child(2) strong"))
      : null;
    const parentMetaStyle = treeParents[0]?.querySelector("small")
      ? window.getComputedStyle(treeParents[0].querySelector("small"))
      : null;
    const operationMetaStyle = treeOperations[0]?.querySelector("small")
      ? window.getComputedStyle(treeOperations[0].querySelector("small"))
      : null;
    const childMetaStyle = sampleTreeChild?.querySelector("small")
      ? window.getComputedStyle(sampleTreeChild.querySelector("small"))
      : null;
    const activeTitleStyle = activeTreeChild?.querySelector("td:first-child strong")
      ? window.getComputedStyle(activeTreeChild.querySelector("td:first-child strong"))
      : null;
    const parentRouteTreeCells = treeParents
      .map((row) => row.querySelector(".route-tree-cell.is-shift-work-order-parent"))
      .filter(Boolean);
    const operationRouteTreeCells = treeOperations
      .map((row) => row.querySelector(".route-tree-cell.is-shift-work-order-operation"))
      .filter(Boolean);
    const childRouteTreeCells = treeChildren
      .map((row) => row.querySelector(".route-tree-cell.is-shift-work-order-child"))
      .filter(Boolean);
    const childStatusTexts = treeChildren.map((row) => (
      row.querySelector("td:nth-child(7)")?.textContent || ""
    ).replace(/\s+/g, " ").trim());
    const childStageLabels = treeChildren.map((row) => (
      row.querySelector(".route-tree-cell.is-shift-work-order-child small")?.textContent || ""
    ).replace(/\s+/g, " ").trim());
    const getDirectStartDot = (cell) => [...(cell?.children || [])]
      .find((child) => child.classList?.contains("speki-tree-start-dot")) || null;
    const parentStartDots = parentRouteTreeCells.map(getDirectStartDot).filter(Boolean);
    const operationStartDots = operationRouteTreeCells.map(getDirectStartDot).filter(Boolean);
    const childStartDots = childRouteTreeCells.map(getDirectStartDot).filter(Boolean);
    const getTreeObjectLeft = (cell) => {
      const rect = cell?.querySelector(".speki-tree-object")?.getBoundingClientRect();
      return Number.isFinite(rect?.left) ? Math.round(rect.left) : 0;
    };
    const treeObjectLefts = {
      parent: getTreeObjectLeft(parentRouteTreeCells[0]),
      operation: getTreeObjectLeft(operationRouteTreeCells[0]),
      child: getTreeObjectLeft(childRouteTreeCells[0]),
    };
    const visibleStartDots = [...parentStartDots, ...operationStartDots, ...childStartDots]
      .filter((dot) => window.getComputedStyle(dot).display !== "none");
    const visibleStartDotRects = visibleStartDots.map((dot) => {
      const style = window.getComputedStyle(dot);
      const rect = dot.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        borderColor: style.borderTopColor || "",
        backgroundColor: style.backgroundColor || "",
        boxShadow: style.boxShadow || "",
      };
    });
    const parentStartDotStyles = parentStartDots.map((dot) => window.getComputedStyle(dot));
    const operationStartDotStyles = operationStartDots.map((dot) => window.getComputedStyle(dot));
    const childStartDotStyles = childStartDots.map((dot) => window.getComputedStyle(dot));
    const activeChildStartDot = activeTreeChild?.querySelector(".route-tree-cell.is-shift-work-order-child > .speki-tree-start-dot") || null;
    const activeChildStartDotStyle = activeChildStartDot ? window.getComputedStyle(activeChildStartDot) : null;
    const inactiveChildStartDotStyles = treeChildren
      .filter((row) => row !== activeTreeChild)
      .map((row) => row.querySelector(".route-tree-cell.is-shift-work-order-child > .speki-tree-start-dot"))
      .filter(Boolean)
      .map((dot) => window.getComputedStyle(dot));
    const childBranchStyles = treeChildren.map((row) => {
      const treeCell = row.querySelector(".route-tree-cell.is-shift-work-order-child");
      const branch = treeCell?.querySelector(".speki-tree-branch");
      const before = branch ? window.getComputedStyle(branch, "::before") : null;
      const after = branch ? window.getComputedStyle(branch, "::after") : null;
      const guides = [...(treeCell?.querySelectorAll(".speki-tree-guide") || [])]
        .map((guide) => {
          const style = window.getComputedStyle(guide);
          return {
            top: style.top || "",
            bottom: style.bottom || "",
            borderColor: style.borderLeftColor || "",
            borderWidth: style.borderLeftWidth || "",
          };
        });
      return {
        isFirst: row.classList.contains("is-first-in-operation"),
        isLast: row.classList.contains("is-last-in-operation"),
        treeClass: treeCell?.className || "",
        guideCount: guides.length,
        guideBleedCount: guides.filter((item) => Number.parseFloat(item.top) <= -20 && Number.parseFloat(item.bottom) <= -20).length,
        guideNeutralColorCount: guides.filter((item) => item.borderWidth === "1px" && /rgb\(148, 163, 184\)/.test(item.borderColor)).length,
        beforeTop: before?.top || "",
        beforeBottom: before?.bottom || "",
        beforeBorderColor: before?.borderLeftColor || "",
        beforeBorderWidth: before?.borderLeftWidth || "",
        afterBorderColor: after?.borderTopColor || "",
        afterBorderWidth: after?.borderTopWidth || "",
      };
    });
    const operationBranchStyles = treeOperations.map((row) => {
      const treeCell = row.querySelector(".route-tree-cell.is-shift-work-order-operation");
      const branch = treeCell?.querySelector(".speki-tree-branch");
      const before = branch ? window.getComputedStyle(branch, "::before") : null;
      return {
        hasChildren: treeCell?.classList.contains("has-children") || false,
        isLast: treeCell?.classList.contains("is-last") || false,
        beforeBottom: before?.bottom || "",
        beforeBorderColor: before?.borderLeftColor || "",
        beforeBorderWidth: before?.borderLeftWidth || "",
      };
    });
	    const bodyCells = [...document.querySelectorAll(".shift-work-orders-table tbody td")];
    const numericCells = [...document.querySelectorAll(".shift-work-orders-table tbody td:nth-child(3), .shift-work-orders-table tbody td:nth-child(4), .shift-work-orders-table tbody td:nth-child(5), .shift-work-orders-table tbody td:nth-child(6)")];
    const numericCellStyles = numericCells.map((cell) => window.getComputedStyle(cell));
    const groupStatusNodes = [...document.querySelectorAll(".shift-work-orders-tree-parent .shift-work-orders-group-status, .shift-work-orders-tree-operation .shift-work-orders-group-status")];
    const childStatusTokens = [...document.querySelectorAll(".shift-work-orders-tree-child .ui-status-token")];
	    const tablePrintButtons = [...document.querySelectorAll(".shift-work-orders-table [data-work-order-print-preview], .shift-work-orders-table [data-shift-work-order-print-preview]")];
	    const tableActionCells = [...document.querySelectorAll(".shift-work-orders-table .actions-cell")];
	    const detailPanel = document.querySelector(".shift-work-orders-detail-panel");
	    const detailPanelHead = detailPanel?.querySelector(":scope > .ui-panel-head") || detailPanel?.querySelector(".ui-panel-head") || null;
	    const detailSznButtons = detailPanel ? [...detailPanel.querySelectorAll("[data-shift-work-order-print-preview]")] : [];
	    const detailPackageButtons = detailPanel ? [...detailPanel.querySelectorAll("[data-work-order-print-preview]")] : [];
	    const detailPanelBody = detailPanel?.querySelector(":scope > .ui-panel-body") || detailPanel?.querySelector(".ui-panel-body") || null;
	    const detailState = detailPanel?.querySelector("[data-visual-qa-target='shift-work-orders-detail-state']");
	    const detailSummary = detailPanel?.querySelector("[data-visual-qa-target='shift-work-orders-detail-summary']");
	    const detailVolume = detailPanel?.querySelector("[data-visual-qa-target='shift-work-orders-detail-volume']");
	    const detailTransfer = detailPanel?.querySelector("[data-visual-qa-target='shift-work-orders-transfer']");
	    const detailExecutors = detailPanel?.querySelector("[data-visual-qa-target='shift-work-orders-executors']");
	    const legacyDetailStrips = detailPanel ? [...detailPanel.querySelectorAll("[data-visual-qa-target='shift-work-orders-quantity-strip'], [data-visual-qa-target='shift-work-orders-fact-strip']")] : [];
	    const detailVolumeMetricStyles = [...(detailVolume?.querySelectorAll(".shift-work-orders-detail-volume-grid article") || [])]
	      .map((item) => window.getComputedStyle(item));
	    const detailExecutorCards = [...(detailExecutors?.querySelectorAll("article") || [])];
	    const detailExecutorNames = detailExecutorCards.map((item) => (item.querySelector("strong")?.textContent || "").replace(/\s+/g, " ").trim());
	    const detailExecutorTexts = detailExecutorCards.map((item) => (item.textContent || "").replace(/\s+/g, " ").trim());
	    const personFullNamePattern = /^[А-ЯЁ][а-яё-]+(?:-[А-ЯЁ][а-яё-]+)?\s+[А-ЯЁ][а-яё-]+(?:-[А-ЯЁ][а-яё-]+)?\s+[А-ЯЁ][а-яё-]+(?:-[А-ЯЁ][а-яё-]+)?$/;
	    const detailMasterName = (detailPanel?.querySelector("[data-visual-qa-target='shift-work-orders-detail-master'] strong")?.textContent || "").replace(/\s+/g, " ").trim();
	    const treePersonNames = treeChildren.map((row) => (row.querySelector("td:nth-child(2) strong")?.textContent || "").replace(/\s+/g, " ").trim());
	    const neutralDetailSurfaces = detailPanel ? [
	      detailVolume,
	      ...[...(detailSummary?.querySelectorAll("article") || [])],
	      ...[...(detailTransfer?.querySelectorAll("article") || [])],
	      ...[...(detailExecutors?.querySelectorAll("article") || [])],
	    ].filter(Boolean) : [];
	    const neutralDetailBackgrounds = neutralDetailSurfaces.map((element) => window.getComputedStyle(element).backgroundColor || "");
	    const currentRouteCard = detailTransfer?.querySelector("article.is-current") || null;
      const styleSnapshot = (element) => {
        if (!element) return null;
        const style = window.getComputedStyle(element);
        return {
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          color: style.color,
          backgroundColor: style.backgroundColor,
        };
      };
      const detailPanelStyle = detailPanel ? window.getComputedStyle(detailPanel) : null;
      const detailLabelStyles = [
        detailSummary?.querySelector("article:nth-child(2) > span"),
        detailSummary?.querySelector("article:nth-child(2) small"),
        detailVolume?.querySelector(".shift-work-orders-detail-volume-grid article span"),
        detailTransfer?.querySelector("article:first-child > span"),
        detailTransfer?.querySelector("article:first-child small"),
        detailExecutors?.querySelector("header span"),
        document.querySelector(".shift-work-orders-issue-list > header span"),
      ].map(styleSnapshot).filter(Boolean);
      const detailValueStyles = [
        detailSummary?.querySelector("article:nth-child(2) strong"),
        detailVolume?.querySelector(".shift-work-orders-detail-volume-grid article strong"),
        detailTransfer?.querySelector("article:first-child strong"),
        detailExecutors?.querySelector("header strong"),
        document.querySelector(".shift-work-orders-issue-list > header strong"),
      ].map(styleSnapshot).filter(Boolean);
      const detailAccentStyles = [
        detailSummary?.querySelector("article:first-child > span"),
        detailTransfer?.querySelector("article.is-current > span"),
      ].map(styleSnapshot).filter(Boolean);
	    const tableTitle = [...document.querySelectorAll(".shift-work-orders-table-panel [data-ui-component='PanelHead'] strong, .shift-work-orders-table-panel .ui-panel-title, .shift-work-orders-table-panel h2")]
	      .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
	      .find(Boolean) || "";
	    const pageStyle = page ? window.getComputedStyle(page) : null;
    return {
	      hasPage: Boolean(page),
	      internalSidebarCount: page?.querySelectorAll(".module-data-sidebar, .directory-sidebar").length || 0,
	      moduleHeaderCount: page?.querySelectorAll("[data-ui-component='ModuleHeader']").length || 0,
	      gridTemplateColumns: pageStyle?.gridTemplateColumns || "",
      panelCount: panels.length,
      panelWithoutBodyCount: panelWithoutBody.length,
      tableScrollContract: tableWrap?.dataset.scrollContract || "",
      tableWrapHorizontalOverflow: tableWrap ? Math.max(0, tableWrap.scrollWidth - tableWrap.clientWidth) : 0,
      tableWrapOverflowX: tableWrap ? window.getComputedStyle(tableWrap).overflowX : "",
      contentOverflowY: content ? window.getComputedStyle(content).overflowY : "",
      pageOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      treeParentCount: treeParents.length,
      treeOperationCount: treeOperations.length,
      treeChildCount: treeChildren.length,
      treeToggleCount: document.querySelectorAll("[data-shift-work-order-tree-toggle]").length,
      treeToggleAriaExpandedCount: [...document.querySelectorAll("[data-shift-work-order-tree-toggle]")]
        .filter((row) => row.getAttribute("aria-expanded") === "true" || row.getAttribute("aria-expanded") === "false").length,
      treeToggleTabindexCount: [...document.querySelectorAll("[data-shift-work-order-tree-toggle]")]
        .filter((row) => row.getAttribute("tabindex") === "0").length,
      parentRowBackground: firstParentCellStyle?.backgroundColor || "",
      parentRowCursor: firstParentCellStyle?.cursor || "",
      parentRowFirstCellShadow: firstParentCellStyle?.boxShadow || "",
      operationRowBackground: firstOperationCellStyle?.backgroundColor || "",
      operationRowCursor: firstOperationCellStyle?.cursor || "",
      operationRowFirstCellShadow: firstOperationCellStyle?.boxShadow || "",
      bodyHorizontalBorderCount: bodyCells.filter((cell) => {
        const style = window.getComputedStyle(cell);
        return style.borderTopWidth !== "0px" || style.borderBottomWidth !== "0px";
      }).length,
      numericCellCount: numericCells.length,
      numericRightAlignedCount: numericCellStyles.filter((style) => style.textAlign === "right").length,
      numericTabularCount: numericCellStyles.filter((style) => /tabular-nums/i.test(style.fontVariantNumeric || "")).length,
      parentGroupStatusColor: parentStatusStyle?.color || "",
      operationGroupStatusColor: operationStatusStyle?.color || "",
      groupStatusTokenCount: groupStatusNodes.filter((node) => node.classList.contains("ui-status-token")).length,
      childStatusTokenCount: childStatusTokens.length,
      groupLabelCount: groupLabels.length,
      parentCellFontSize: firstParentCellStyle?.fontSize || "",
      parentCellFontWeight: firstParentCellStyle?.fontWeight || "",
      parentCellColor: firstParentCellStyle?.color || "",
      parentTitleFontSize: parentTitleStyle?.fontSize || "",
      parentTitleFontWeight: parentTitleStyle?.fontWeight || "",
      operationCellFontSize: firstOperationCellStyle?.fontSize || "",
      operationCellFontWeight: firstOperationCellStyle?.fontWeight || "",
      operationCellColor: firstOperationCellStyle?.color || "",
      operationTitleFontSize: operationTitleStyle?.fontSize || "",
      operationTitleFontWeight: operationTitleStyle?.fontWeight || "",
      childCellFontSize: firstChildCellStyle?.fontSize || "",
      childCellFontWeight: firstChildCellStyle?.fontWeight || "",
      childCellColor: firstChildCellStyle?.color || "",
      childTitleFontSize: childTitleStyle?.fontSize || "",
      childTitleFontWeight: childTitleStyle?.fontWeight || "",
      childSecondTitleFontWeight: childSecondTitleStyle?.fontWeight || "",
      metaFontSizes: [parentMetaStyle?.fontSize, operationMetaStyle?.fontSize, childMetaStyle?.fontSize].filter(Boolean),
      metaFontWeights: [parentMetaStyle?.fontWeight, operationMetaStyle?.fontWeight, childMetaStyle?.fontWeight].filter(Boolean),
      activeTitleFontSize: activeTitleStyle?.fontSize || "",
      activeTitleFontWeight: activeTitleStyle?.fontWeight || "",
      parentRouteTreeCellCount: parentRouteTreeCells.length,
      operationRouteTreeCellCount: operationRouteTreeCells.length,
      childRouteTreeCellCount: childRouteTreeCells.length,
      treeObjectLevelGapParentToOperation: treeObjectLefts.operation - treeObjectLefts.parent,
      treeObjectLevelGapOperationToChild: treeObjectLefts.child - treeObjectLefts.operation,
      plannedChildStatusCount: childStatusTexts.filter((text) => text === "план").length,
      assignedChildStatusCount: childStatusTexts.filter((text) => /распределено/i.test(text)).length,
      childStageLabels: childStageLabels.slice(0, 8),
      assignedStageLabelCount: childStageLabels.filter((text) => /сменное задание/i.test(text)).length,
      parentStartDotVisibleCount: parentStartDots.filter((dot) => window.getComputedStyle(dot).display !== "none").length,
      operationStartDotVisibleCount: operationStartDots.filter((dot) => window.getComputedStyle(dot).display !== "none").length,
      childStartDotVisibleCount: childStartDots.filter((dot) => window.getComputedStyle(dot).display !== "none").length,
      startDotDimensionCount: new Set(visibleStartDotRects.map((rect) => `${rect.width}x${rect.height}`)).size,
      startDotRects: visibleStartDotRects.slice(0, 8),
      parentStartDotNeutralCount: parentStartDotStyles.filter((style) => /rgb\(148, 163, 184\)/.test(style.backgroundColor || "")).length,
      operationStartDotNeutralCount: operationStartDotStyles.filter((style) => /rgb\(148, 163, 184\)/.test(style.backgroundColor || "")).length,
      childStartDotNeutralCount: childStartDotStyles.filter((style) => /rgb\(148, 163, 184\)/.test(style.backgroundColor || "")).length,
      inactiveChildStartDotNeutralCount: inactiveChildStartDotStyles.filter((style) => /rgb\(148, 163, 184\)/.test(style.backgroundColor || "")).length,
      activeChildStartDotFilled: Boolean(activeChildStartDotStyle && /rgb\(15, 23, 42\)/.test(activeChildStartDotStyle.backgroundColor || "")),
      startDotHaloCount: visibleStartDotRects.filter((rect) => rect.boxShadow && rect.boxShadow !== "none").length,
      childFirstMarkerCount: childBranchStyles.filter((item) => item.isFirst).length,
      childLastMarkerCount: childBranchStyles.filter((item) => item.isLast).length,
      childLevelTwoCount: childBranchStyles.filter((item) => item.treeClass.includes("is-level-2")).length,
      childBranchTopBleedCount: childBranchStyles.filter((item) => Number.parseFloat(item.beforeTop) <= -20).length,
      operationBranchFullBleedCount: operationBranchStyles.filter((item) => item.hasChildren && !item.isLast && item.beforeBorderWidth === "1px" && Number.parseFloat(item.beforeBottom) <= -20).length,
      operationBranchExpectedFullBleedCount: operationBranchStyles.filter((item) => item.hasChildren && !item.isLast).length,
      operationLastBranchFullBleedCount: operationBranchStyles.filter((item) => item.hasChildren && item.isLast && item.beforeBorderWidth === "1px" && Number.parseFloat(item.beforeBottom) <= -20).length,
      operationBranchNeutralColorCount: operationBranchStyles.filter((item) => item.hasChildren && item.beforeBorderWidth === "1px" && /rgb\(148, 163, 184\)/.test(item.beforeBorderColor)).length,
      operationBranchWithChildrenCount: operationBranchStyles.filter((item) => item.hasChildren).length,
      childBranchLineCount: childBranchStyles.filter((item) => item.beforeBorderWidth === "1px" && /rgb\(148, 163, 184\)/.test(item.beforeBorderColor)).length,
      childBranchJoinCount: childBranchStyles.filter((item) => item.afterBorderWidth === "1px" && /rgb\(148, 163, 184\)/.test(item.afterBorderColor)).length,
      startDotNeutralColorCount: visibleStartDotRects.filter((rect) => /rgb\(148, 163, 184\)|rgb\(15, 23, 42\)/.test(rect.borderColor)).length,
      childGuideTotal: childBranchStyles.reduce((sum, item) => sum + item.guideCount, 0),
      childGuideBleedCount: childBranchStyles.reduce((sum, item) => sum + item.guideBleedCount, 0),
      childGuideNeutralColorCount: childBranchStyles.reduce((sum, item) => sum + item.guideNeutralColorCount, 0),
      activeTreeChildCount: document.querySelectorAll("[data-shift-work-order-row].is-active").length,
      activeRowBackground: activeSecondCellStyle?.backgroundColor || "",
      activeRowFilter: activeTreeChild ? window.getComputedStyle(activeTreeChild).filter : "",
      activeRowFirstCellShadow: activeFirstCellStyle?.boxShadow || "",
      parentPackageButtons: treeParents.filter((row) => row.querySelector("[data-work-order-print-preview]")).length,
      operationPrintButtons: treeOperations.filter((row) => row.querySelector("[data-work-order-print-preview], [data-shift-work-order-print-preview]")).length,
      childSznButtons: treeChildren.filter((row) => row.querySelector("[data-shift-work-order-print-preview]")).length,
      childPackageButtons: treeChildren.filter((row) => row.querySelector("[data-work-order-print-preview]")).length,
      tablePrintButtonCount: tablePrintButtons.length,
      tableActionCellCount: tableActionCells.length,
	      detailSznButtonCount: detailSznButtons.length,
	      detailPackageButtonCount: detailPackageButtons.length,
	      detailPackageButtonDisabledCount: detailPackageButtons.filter((button) => button.disabled).length,
	      detailPanelHeadMetaText: (detailPanelHead?.querySelector(".ui-panel-head-copy span")?.textContent || "").replace(/\s+/g, " ").trim(),
	      detailPanelHeadText: (detailPanelHead?.textContent || "").replace(/\s+/g, " ").trim(),
	      detailStateCount: detailState ? 1 : 0,
	      detailStateText: (detailState?.textContent || "").replace(/\s+/g, " ").trim(),
	      detailFirstBlockTarget: detailPanelBody?.firstElementChild?.getAttribute("data-visual-qa-target") || "",
	      detailSummaryCardCount: detailSummary?.querySelectorAll("article").length || 0,
		      detailVolumeCount: detailVolume ? 1 : 0,
		      detailVolumeHeaderCount: detailVolume?.querySelectorAll(":scope > header").length || 0,
		      detailVolumeMetricCount: detailVolume?.querySelectorAll(".shift-work-orders-detail-volume-grid article").length || 0,
		      detailVolumeFirstMetricBorderLeftWidth: detailVolumeMetricStyles[0]?.borderLeftWidth || "",
		      detailVolumeSeparatedMetricCount: detailVolumeMetricStyles.slice(1).filter((style) => style.borderLeftWidth === "1px").length,
		      detailVolumeHasProgress: Boolean(detailVolume?.querySelector(".shift-work-orders-detail-progress")),
		      legacyDetailStripCount: legacyDetailStrips.length,
		      detailTransferCardCount: detailTransfer?.querySelectorAll("article").length || 0,
		      detailTransferLinkCount: detailTransfer?.querySelectorAll("[data-visual-qa-target='shift-work-orders-transfer-link']").length || 0,
		      neutralDetailBackgroundCount: new Set(neutralDetailBackgrounds).size,
	      neutralDetailBackgrounds: [...new Set(neutralDetailBackgrounds)].slice(0, 6),
	      currentRouteCardText: (currentRouteCard?.textContent || "").replace(/\s+/g, " ").trim(),
	      detailExecutorSectionCount: detailExecutors ? 1 : 0,
	      detailExecutorCardCount: detailExecutorCards.length,
	      detailExecutorNoteCount: detailExecutorCards.reduce((sum, item) => sum + item.querySelectorAll("small").length, 0),
	      detailExecutorHourNoiseCount: detailExecutorTexts.filter((text) => /\b\d+(?:[,.]\d+)?\s*ч\b/i.test(text)).length,
	      detailExecutorFullNameCount: detailExecutorNames.filter((name) => personFullNamePattern.test(name)).length,
	      detailMasterFullNameCount: personFullNamePattern.test(detailMasterName) ? 1 : 0,
	      treePersonFullNameCount: treePersonNames.filter((name) => personFullNamePattern.test(name)).length,
        detailPanelFontSize: detailPanelStyle?.fontSize || "",
        detailPanelLineHeight: detailPanelStyle?.lineHeight || "",
        detailLabelStyles,
        detailValueStyles,
        detailAccentStyles,
	      tableTitle,
	      reportHeaderCount: [...document.querySelectorAll(".shift-work-orders-table th")]
	        .filter((cell) => cell.textContent.trim() === "Report").length,
	      formHeaderCount: [...document.querySelectorAll(".shift-work-orders-table th")]
	        .filter((cell) => cell.textContent.trim() === "Форма").length,
	      reportCellCount: document.querySelectorAll(".shift-work-orders-report-cell").length,
	      reportBadgeCount: document.querySelectorAll(".shift-work-orders-table [data-visual-qa-target='shift-work-orders-report-badge'], .shift-work-orders-table .shift-work-orders-report-badge").length,
	      issuePanelCount: document.querySelectorAll("[data-visual-qa-target='shift-work-orders-issue-reports']").length,
    };
  });
  assert(report.hasPage, "shiftWorkOrders: page root is missing");
  assert(report.internalSidebarCount === 0, `shiftWorkOrders: should not render an internal sidebar, got ${report.internalSidebarCount}`);
  assert(report.moduleHeaderCount === 0, `shiftWorkOrders: duplicated module header must not be rendered inside the workspace: ${JSON.stringify(report)}`);
  assert(!/\s/.test(report.gridTemplateColumns.trim()), `shiftWorkOrders: page must use one workspace column, got "${report.gridTemplateColumns}"`);
  assert(report.panelCount >= 2, `shiftWorkOrders: expected table and detail panels, got ${report.panelCount}`);
  assert(report.panelWithoutBodyCount === 0, `shiftWorkOrders: panels without direct PanelBody: ${report.panelWithoutBodyCount}`);
  assert(report.tableScrollContract === "horizontal-only", `shiftWorkOrders: table wrap must use horizontal-only contract, got "${report.tableScrollContract}"`);
  assert(report.tableWrapHorizontalOverflow <= 2, `shiftWorkOrders: document tree table must fit the table panel without horizontal scrolling: ${JSON.stringify(report)}`);
  assert(["auto", "visible"].includes(report.contentOverflowY), `shiftWorkOrders: unexpected content overflow-y "${report.contentOverflowY}"`);
  assert(report.pageOverflowX <= 2, `shiftWorkOrders: page horizontal overflow ${report.pageOverflowX}px`);
  assert(report.treeParentCount > 0, `shiftWorkOrders: document tree parent rows are missing: ${JSON.stringify(report)}`);
  assert(report.treeOperationCount > 0, `shiftWorkOrders: document tree operation aggregation rows are missing: ${JSON.stringify(report)}`);
  assert(report.treeChildCount > 0, `shiftWorkOrders: document tree child rows are missing: ${JSON.stringify(report)}`);
  assert(!/rgba?\(238, 242, 246/.test(report.parentRowBackground), `shiftWorkOrders: parent grouping rows must not use hierarchy darkening backgrounds: ${JSON.stringify(report)}`);
  assert(!/rgba?\(248, 250, 252/.test(report.operationRowBackground), `shiftWorkOrders: operation grouping rows must not use hierarchy darkening backgrounds: ${JSON.stringify(report)}`);
  assert(report.parentRowCursor === "pointer", `shiftWorkOrders: parent grouping rows must expose tree collapse affordance: ${JSON.stringify(report)}`);
  assert(report.operationRowCursor === "pointer", `shiftWorkOrders: operation grouping rows must expose tree collapse affordance: ${JSON.stringify(report)}`);
  assert(report.treeToggleCount === report.treeParentCount + report.treeOperationCount, `shiftWorkOrders: each parent/operation grouping row must be a tree toggle: ${JSON.stringify(report)}`);
  assert(report.treeToggleAriaExpandedCount === report.treeToggleCount, `shiftWorkOrders: tree toggles must expose aria-expanded: ${JSON.stringify(report)}`);
  assert(report.treeToggleTabindexCount === report.treeToggleCount, `shiftWorkOrders: tree toggles must be keyboard focusable: ${JSON.stringify(report)}`);
  assert(report.parentRowFirstCellShadow === "none", `shiftWorkOrders: parent grouping rows must not add separate hierarchy marker rails: ${JSON.stringify(report)}`);
  assert(report.operationRowFirstCellShadow === "none", `shiftWorkOrders: operation grouping rows must not add separate hierarchy marker rails: ${JSON.stringify(report)}`);
  assert(report.bodyHorizontalBorderCount === 0, `shiftWorkOrders: row horizontal separators must be removed: ${JSON.stringify(report)}`);
  assert(report.numericCellCount > 0 && report.numericRightAlignedCount === report.numericCellCount, `shiftWorkOrders: quantity columns must be right-aligned for registry scanning: ${JSON.stringify(report)}`);
  assert(report.numericTabularCount === report.numericCellCount, `shiftWorkOrders: quantity columns must use tabular numbers: ${JSON.stringify(report)}`);
  assert(report.groupLabelCount === 0, `shiftWorkOrders: grouping rows must not use loud explicit group labels: ${JSON.stringify(report)}`);
  assert(/rgb\(100, 116, 139\)/.test(report.parentGroupStatusColor), `shiftWorkOrders: parent grouping status token must be monochrome neutral: ${JSON.stringify(report)}`);
  assert(/rgb\(100, 116, 139\)/.test(report.operationGroupStatusColor), `shiftWorkOrders: operation grouping status token must be monochrome neutral: ${JSON.stringify(report)}`);
  assert(report.groupStatusTokenCount === 0, `shiftWorkOrders: grouping rows must use quiet text statuses, not colored status tokens: ${JSON.stringify(report)}`);
  assert(report.childStatusTokenCount === report.treeChildCount, `shiftWorkOrders: only concrete SZN rows should carry real status tokens: ${JSON.stringify(report)}`);
  assert(report.parentCellFontSize === "11px", `shiftWorkOrders: parent row body typography must be normalized: ${JSON.stringify(report)}`);
  assert(report.operationCellFontSize === "11px", `shiftWorkOrders: operation row body typography must be normalized: ${JSON.stringify(report)}`);
  assert(report.childCellFontSize === "11px", `shiftWorkOrders: child row body typography must be normalized: ${JSON.stringify(report)}`);
  assert(/rgb\(51, 65, 85\)/.test(report.parentCellColor), `shiftWorkOrders: parent row body color must use the shared main token: ${JSON.stringify(report)}`);
  assert(/rgb\(51, 65, 85\)/.test(report.operationCellColor), `shiftWorkOrders: operation row body color must use the shared main token: ${JSON.stringify(report)}`);
  assert(/rgb\(51, 65, 85\)/.test(report.childCellColor), `shiftWorkOrders: child row body color must use the shared main token: ${JSON.stringify(report)}`);
  assert(report.metaFontSizes.length === 3 && report.metaFontSizes.every((size) => size === "10px"), `shiftWorkOrders: all tree meta labels must share one quiet size: ${JSON.stringify(report)}`);
  assert(report.metaFontWeights.length === 3 && report.metaFontWeights.every((weight) => Number(weight) === 500), `shiftWorkOrders: all tree meta labels must share one quiet weight: ${JSON.stringify(report)}`);
  assert(report.parentTitleFontSize === "12px", `shiftWorkOrders: parent grouping title must be the strongest tree level: ${JSON.stringify(report)}`);
  assert(Number(report.parentTitleFontWeight) >= 660, `shiftWorkOrders: parent grouping title must have strongest hierarchy weight: ${JSON.stringify(report)}`);
  assert(report.operationTitleFontSize === "11px", `shiftWorkOrders: operation grouping title must use the normalized body scale: ${JSON.stringify(report)}`);
  assert(Number(report.operationTitleFontWeight) >= 610 && Number(report.operationTitleFontWeight) < Number(report.parentTitleFontWeight), `shiftWorkOrders: operation grouping title weight must sit below parent level: ${JSON.stringify(report)}`);
  assert(report.childTitleFontSize === "11px", `shiftWorkOrders: child SZN rows must use the normalized body scale: ${JSON.stringify(report)}`);
  assert(Number(report.childTitleFontWeight) >= 590 && Number(report.childTitleFontWeight) < Number(report.operationTitleFontWeight), `shiftWorkOrders: child SZN title weight must sit below operation grouping: ${JSON.stringify(report)}`);
  assert(Number(report.childSecondTitleFontWeight) >= 540 && Number(report.childSecondTitleFontWeight) < Number(report.childTitleFontWeight), `shiftWorkOrders: child secondary title must be quieter than the SZN number: ${JSON.stringify(report)}`);
  assert(report.parentRouteTreeCellCount === report.treeParentCount, `shiftWorkOrders: parent rows must use the shared route tree cell pattern: ${JSON.stringify(report)}`);
  assert(report.operationRouteTreeCellCount === report.treeOperationCount, `shiftWorkOrders: operation rows must use the shared route tree cell pattern: ${JSON.stringify(report)}`);
  assert(report.childRouteTreeCellCount === report.treeChildCount, `shiftWorkOrders: SZN rows must use the shared route tree cell pattern: ${JSON.stringify(report)}`);
  assert(report.treeObjectLevelGapParentToOperation >= 28, `shiftWorkOrders: operation level must stay clearly indented from parent level: ${JSON.stringify(report)}`);
  assert(report.treeObjectLevelGapOperationToChild >= 28, `shiftWorkOrders: child SZN level must stay clearly indented from operation level: ${JSON.stringify(report)}`);
  assert(report.plannedChildStatusCount === 0, `shiftWorkOrders: pure planned shift rows must stay out of the journal tree: ${JSON.stringify(report)}`);
  assert(report.assignedChildStatusCount > 0, `shiftWorkOrders: distributed shift tasks must be visible in the journal tree: ${JSON.stringify(report)}`);
  assert(report.assignedStageLabelCount > 0, `shiftWorkOrders: distributed rows must be labeled as shift tasks before issued SZN: ${JSON.stringify(report)}`);
  assert(report.parentStartDotVisibleCount === report.treeParentCount, `shiftWorkOrders: top-level package rows must render tree start dots as collapse toggles: ${JSON.stringify(report)}`);
  assert(report.operationStartDotVisibleCount === report.treeOperationCount, `shiftWorkOrders: operation tree rows must render start dots at branch joins: ${JSON.stringify(report)}`);
  assert(report.childStartDotVisibleCount === report.treeChildCount, `shiftWorkOrders: child SZN tree rows must render start dots at branch joins: ${JSON.stringify(report)}`);
  assert(report.startDotDimensionCount === 1, `shiftWorkOrders: tree start dots must use one normalized size: ${JSON.stringify(report)}`);
  assert(report.startDotNeutralColorCount === report.parentStartDotVisibleCount + report.operationStartDotVisibleCount + report.childStartDotVisibleCount, `shiftWorkOrders: tree start dots must use neutral gray, with black only for the active row: ${JSON.stringify(report)}`);
  assert(report.startDotHaloCount === 0, `shiftWorkOrders: tree start dots must not mask connector lines with a white halo: ${JSON.stringify(report)}`);
  assert(report.parentStartDotNeutralCount === report.parentStartDotVisibleCount, `shiftWorkOrders: parent group dots must be filled neutral gray when expanded: ${JSON.stringify(report)}`);
  assert(report.operationStartDotNeutralCount === report.operationStartDotVisibleCount, `shiftWorkOrders: operation group dots must be filled neutral gray: ${JSON.stringify(report)}`);
  assert(report.activeChildStartDotFilled, `shiftWorkOrders: active child row dot must be filled black: ${JSON.stringify(report)}`);
  assert(report.inactiveChildStartDotNeutralCount === report.childStartDotVisibleCount - report.activeTreeChildCount, `shiftWorkOrders: inactive clickable child row dots must be filled neutral gray: ${JSON.stringify(report)}`);
  assert(report.childLevelTwoCount === report.treeChildCount, `shiftWorkOrders: SZN rows must be rendered as level-2 tree children: ${JSON.stringify(report)}`);
  assert(report.childBranchTopBleedCount === report.treeChildCount, `shiftWorkOrders: SZN tree lines must overlap row seams enough to avoid visual breaks: ${JSON.stringify(report)}`);
  assert(report.operationBranchFullBleedCount === report.operationBranchExpectedFullBleedCount, `shiftWorkOrders: only operation rows with a next same-level sibling may continue connector lines downward: ${JSON.stringify(report)}`);
  assert(report.operationLastBranchFullBleedCount === 0, `shiftWorkOrders: last operation rows must not draw an extra downward connector line: ${JSON.stringify(report)}`);
  assert(report.operationBranchNeutralColorCount === report.operationBranchWithChildrenCount, `shiftWorkOrders: operation tree connector lines must be neutral gray: ${JSON.stringify(report)}`);
  assert(report.childGuideBleedCount === report.childGuideTotal, `shiftWorkOrders: SZN guide lines must overlap row seams enough to avoid visual breaks: ${JSON.stringify(report)}`);
  assert(report.childGuideNeutralColorCount === report.childGuideTotal, `shiftWorkOrders: SZN guide lines must be neutral gray: ${JSON.stringify(report)}`);
  assert(report.childFirstMarkerCount === report.treeOperationCount, `shiftWorkOrders: each operation group must mark its first child row for tree connectors: ${JSON.stringify(report)}`);
  assert(report.childLastMarkerCount === report.treeOperationCount, `shiftWorkOrders: each operation group must mark its last child row for tree connectors: ${JSON.stringify(report)}`);
  assert(report.childBranchLineCount === report.treeChildCount, `shiftWorkOrders: every SZN child row must render speki-tree vertical branch line: ${JSON.stringify(report)}`);
  assert(report.childBranchJoinCount === report.treeChildCount, `shiftWorkOrders: every SZN child row must render speki-tree horizontal branch join: ${JSON.stringify(report)}`);
  assert(report.activeTreeChildCount === 1, `shiftWorkOrders: exactly one child row must be visibly selected: ${JSON.stringify(report)}`);
  assert(/rgba?\(255, 255, 255/.test(report.activeRowBackground), `shiftWorkOrders: active row lift variant must keep a white cell background: ${JSON.stringify(report)}`);
  assert(/drop-shadow/i.test(report.activeRowFilter), `shiftWorkOrders: active row must use the lift variant shadow: ${JSON.stringify(report)}`);
  assert(report.activeRowFirstCellShadow === "none", `shiftWorkOrders: active row must not use a first-cell marker shadow; keep only lift: ${JSON.stringify(report)}`);
  assert(report.activeTitleFontSize === report.childTitleFontSize, `shiftWorkOrders: active SZN row must not get a separate selected font size: ${JSON.stringify(report)}`);
  assert(report.activeTitleFontWeight === report.childTitleFontWeight, `shiftWorkOrders: active SZN row must not get a separate selected font weight: ${JSON.stringify(report)}`);
  assert(report.formHeaderCount === 0, `shiftWorkOrders: table must not keep a row-action Form column: ${JSON.stringify(report)}`);
  assert(report.tableActionCellCount === 0, `shiftWorkOrders: tree table rows must be scan/select only without action cells: ${JSON.stringify(report)}`);
  assert(report.tablePrintButtonCount === 0, `shiftWorkOrders: print actions must live in the selected document card, not rows: ${JSON.stringify(report)}`);
  assert(report.parentPackageButtons === 0, `shiftWorkOrders: work-order package print must not live on parent rows: ${JSON.stringify(report)}`);
  assert(report.operationPrintButtons === 0, `shiftWorkOrders: operation aggregation rows must not duplicate document print actions: ${JSON.stringify(report)}`);
  assert(report.childSznButtons === 0, `shiftWorkOrders: SZN print must not live on child rows: ${JSON.stringify(report)}`);
  assert(report.childPackageButtons === 0, `shiftWorkOrders: child SZN rows must not duplicate package print actions: ${JSON.stringify(report)}`);
  assert(report.detailSznButtonCount === 1, `shiftWorkOrders: selected document card must expose SZN print action: ${JSON.stringify(report)}`);
  assert(report.detailPackageButtonCount === 1 && report.detailPackageButtonDisabledCount === 0, `shiftWorkOrders: selected document card must expose enabled work-order package action: ${JSON.stringify(report)}`);
  assert(report.detailPanelHeadMetaText === "", `shiftWorkOrders: selected document card header must not duplicate operation/work-center meta: ${JSON.stringify(report)}`);
  assert(/Дерево документов/.test(report.tableTitle), `shiftWorkOrders: table panel must be the document tree, got "${report.tableTitle}"`);
  assert(report.detailStateCount === 0 && !/Состояние документа/.test(report.detailStateText), `shiftWorkOrders: selected document card must not render the removed document state block: ${JSON.stringify(report)}`);
  assert(report.detailFirstBlockTarget === "shift-work-orders-issue-reports", `shiftWorkOrders: Report block must replace the removed state block at the top of the selected document card: ${JSON.stringify(report)}`);
  assert(report.detailSummaryCardCount === 3, `shiftWorkOrders: selected document card passport must expose order, operation and master cards: ${JSON.stringify(report)}`);
  assert(report.legacyDetailStripCount === 0, `shiftWorkOrders: selected document card must not keep old separate quantity/fact strips: ${JSON.stringify(report)}`);
  assert(report.detailVolumeCount === 1, `shiftWorkOrders: selected document card must expose one unified volume block: ${JSON.stringify(report)}`);
  assert(report.detailVolumeHeaderCount === 0, `shiftWorkOrders: selected document volume block must not duplicate volume totals in an inner header: ${JSON.stringify(report)}`);
  assert(report.detailVolumeMetricCount === 5, `shiftWorkOrders: selected document volume block must expose assigned, fact, remaining, defect and report metrics: ${JSON.stringify(report)}`);
  assert(report.detailVolumeFirstMetricBorderLeftWidth === "0px", `shiftWorkOrders: first volume metric must not render an external left separator: ${JSON.stringify(report)}`);
  assert(report.detailVolumeSeparatedMetricCount === report.detailVolumeMetricCount - 1, `shiftWorkOrders: volume metrics must only use separators between cells: ${JSON.stringify(report)}`);
  assert(report.detailVolumeHasProgress, `shiftWorkOrders: selected document volume block must show assigned/fact progress: ${JSON.stringify(report)}`);
  assert(report.detailTransferCardCount === 3, `shiftWorkOrders: selected document card must expose transfer route cards: ${JSON.stringify(report)}`);
  assert(report.detailTransferLinkCount === 2, `shiftWorkOrders: transfer route must expose two visual connectors between Before/Current/After cards: ${JSON.stringify(report)}`);
  assert(report.neutralDetailBackgroundCount === 1, `shiftWorkOrders: neutral document cards must share one background; color should only encode explicit status tokens/problems: ${JSON.stringify(report)}`);
  assert(/текущий шаг/.test(report.currentRouteCardText), `shiftWorkOrders: current route step must be labeled by text, not by a unique background color: ${JSON.stringify(report)}`);
  assert(report.detailExecutorSectionCount === 1, `shiftWorkOrders: selected document card must expose executors section: ${JSON.stringify(report)}`);
  assert(report.detailMasterFullNameCount === 0, `shiftWorkOrders: selected document master name must use short format: ${JSON.stringify(report)}`);
  assert(report.treePersonFullNameCount === 0, `shiftWorkOrders: tree person labels must use short names across the module: ${JSON.stringify(report)}`);
  if (report.detailExecutorCardCount > 0) {
    assert(report.detailExecutorNoteCount === 0, `shiftWorkOrders: executor rows must be compact and must not render secondary note lines: ${JSON.stringify(report)}`);
    assert(report.detailExecutorHourNoiseCount === 0, `shiftWorkOrders: executor rows must not show labor-hour notes like 0.2 ч: ${JSON.stringify(report)}`);
    assert(report.detailExecutorFullNameCount === 0, `shiftWorkOrders: executor names must use short format like Степанов Н. В.: ${JSON.stringify(report)}`);
  }
  assert(report.detailPanelFontSize === "11px" && report.detailPanelLineHeight === "15px", `shiftWorkOrders: selected document card must use the same compact body scale as the neighboring tree: ${JSON.stringify(report)}`);
  assert(report.detailLabelStyles.length >= 7 && report.detailLabelStyles.every((style) => style.fontSize === "10px" && Number(style.fontWeight) === 500 && style.lineHeight === "13px"), `shiftWorkOrders: selected document labels/meta must share one quiet typography contract: ${JSON.stringify(report.detailLabelStyles)}`);
  assert(report.detailValueStyles.length >= 5 && report.detailValueStyles.every((style) => style.fontSize === "11px" && Number(style.fontWeight) === 600 && style.lineHeight === "14px"), `shiftWorkOrders: selected document values must share one value typography contract: ${JSON.stringify(report.detailValueStyles)}`);
  assert(report.detailAccentStyles.length === 2 && report.detailAccentStyles.every((style) => style.fontSize === "10px" && Number(style.fontWeight) === 720 && style.lineHeight === "13px"), `shiftWorkOrders: selected document accent pills must be limited and normalized: ${JSON.stringify(report.detailAccentStyles)}`);
  assert(report.reportHeaderCount === 0, `shiftWorkOrders: Report must not be a separate tree-table column: ${JSON.stringify(report)}`);
  assert(report.reportCellCount === 0, `shiftWorkOrders: tree rows must not render separate Report cells: ${JSON.stringify(report)}`);
  assert(report.reportBadgeCount === 0, `shiftWorkOrders: Report badges must live in the selected document card/photos, not in the tree table: ${JSON.stringify(report)}`);
  assert(report.issuePanelCount === 1, `shiftWorkOrders: selected SZN detail must expose issue reports panel: ${JSON.stringify(report)}`);

  const treeCollapseReport = await evaluate(client, async () => {
    const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const waitRender = async () => {
      await waitFrame();
      await new Promise((resolve) => setTimeout(resolve, 80));
    };
    const findToggle = (nodeId) => [...document.querySelectorAll("[data-shift-work-order-tree-toggle]")]
      .find((row) => row.getAttribute("data-shift-work-order-tree-toggle") === nodeId) || null;
    const getCounts = () => ({
      parents: document.querySelectorAll("[data-shift-work-order-package-row]").length,
      operations: document.querySelectorAll("[data-shift-work-order-operation-row]").length,
      children: document.querySelectorAll("[data-shift-work-order-row]").length,
    });
    const before = getCounts();
    const operation = document.querySelector("[data-shift-work-order-operation-row][data-shift-work-order-tree-toggle]");
    const operationNodeId = operation?.getAttribute("data-shift-work-order-tree-toggle") || "";
    if (!operation || !operationNodeId || before.children < 1) return { checked: false, reason: "operation toggle missing", before };
    operation.click();
    await waitRender();
    const afterOperationCollapse = getCounts();
    const operationCollapsed = findToggle(operationNodeId)?.classList.contains("is-collapsed") || false;
    findToggle(operationNodeId)?.click();
    await waitRender();
    const afterOperationRestore = getCounts();
    const parent = document.querySelector("[data-shift-work-order-package-row][data-shift-work-order-tree-toggle]");
    const parentNodeId = parent?.getAttribute("data-shift-work-order-tree-toggle") || "";
    if (!parent || !parentNodeId || afterOperationRestore.operations < 1) {
      return {
        checked: false,
        reason: "parent toggle missing",
        before,
        afterOperationCollapse,
        afterOperationRestore,
      };
    }
    parent.click();
    await waitRender();
    const afterParentCollapse = getCounts();
    const parentCollapsed = findToggle(parentNodeId)?.classList.contains("is-collapsed") || false;
    findToggle(parentNodeId)?.click();
    await waitRender();
    const afterParentRestore = getCounts();
    return {
      checked: true,
      before,
      operationCollapsed,
      afterOperationCollapse,
      afterOperationRestore,
      parentCollapsed,
      afterParentCollapse,
      afterParentRestore,
    };
  });
  assert(treeCollapseReport.checked, `shiftWorkOrders: tree collapse check was not meaningful: ${JSON.stringify(treeCollapseReport)}`);
  assert(treeCollapseReport.operationCollapsed, `shiftWorkOrders: clicking an operation row must switch it to collapsed state: ${JSON.stringify(treeCollapseReport)}`);
  assert(treeCollapseReport.afterOperationCollapse.children < treeCollapseReport.before.children, `shiftWorkOrders: collapsed operation must hide child SZN rows: ${JSON.stringify(treeCollapseReport)}`);
  assert(treeCollapseReport.afterOperationRestore.children === treeCollapseReport.before.children, `shiftWorkOrders: operation restore must bring child SZN rows back: ${JSON.stringify(treeCollapseReport)}`);
  assert(treeCollapseReport.parentCollapsed, `shiftWorkOrders: clicking a package row must switch it to collapsed state: ${JSON.stringify(treeCollapseReport)}`);
  assert(treeCollapseReport.afterParentCollapse.operations < treeCollapseReport.afterOperationRestore.operations, `shiftWorkOrders: collapsed package must hide operation rows: ${JSON.stringify(treeCollapseReport)}`);
  assert(treeCollapseReport.afterParentCollapse.children < treeCollapseReport.afterOperationRestore.children, `shiftWorkOrders: collapsed package must hide nested SZN rows: ${JSON.stringify(treeCollapseReport)}`);
  assert(treeCollapseReport.afterParentRestore.operations === treeCollapseReport.before.operations && treeCollapseReport.afterParentRestore.children === treeCollapseReport.before.children, `shiftWorkOrders: package restore must return the full tree: ${JSON.stringify(treeCollapseReport)}`);

  const rowClickScrollReport = await evaluate(client, async () => {
    const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const styleId = "shift-work-orders-scroll-stability-qa";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = ".shift-work-orders-content{height:360px!important;max-height:360px!important;overflow-y:auto!important;}";
      document.head.appendChild(style);
    }
    await waitFrame();
    const content = document.querySelector(".shift-work-orders-content");
    const rows = [...document.querySelectorAll("[data-shift-work-order-row]")];
    const currentId = rows.find((row) => row.classList.contains("is-active"))?.getAttribute("data-shift-work-order-row") || "";
    const targetRow = rows.find((row) => row.getAttribute("data-shift-work-order-row") !== currentId) || rows[0] || null;
    const beforeOrder = rows.map((row) => row.getAttribute("data-shift-work-order-row") || "");
    const scrollRange = content ? Math.max(0, content.scrollHeight - content.clientHeight) : 0;
    if (!content || !targetRow || scrollRange < 16) {
      return {
        checked: false,
        hasContent: Boolean(content),
        rowCount: rows.length,
        scrollRange,
      };
    }
    content.scrollTop = Math.min(220, scrollRange);
    await waitFrame();
    const before = content.scrollTop;
    targetRow.click();
    await waitFrame();
    await new Promise((resolve) => setTimeout(resolve, 140));
    const nextContent = document.querySelector(".shift-work-orders-content");
    const afterOrder = [...document.querySelectorAll("[data-shift-work-order-row]")]
      .map((row) => row.getAttribute("data-shift-work-order-row") || "");
    return {
      checked: true,
      before,
      after: nextContent?.scrollTop || 0,
      delta: Math.abs((nextContent?.scrollTop || 0) - before),
      selectedId: document.querySelector("[data-shift-work-order-row].is-active")?.getAttribute("data-shift-work-order-row") || "",
      targetId: targetRow.getAttribute("data-shift-work-order-row") || "",
      beforeOrder,
      afterOrder,
      orderStable: beforeOrder.join("\n") === afterOrder.join("\n"),
      scrollRange,
    };
  });
  assert(rowClickScrollReport.checked, `shiftWorkOrders: row click scroll check was not meaningful: ${JSON.stringify(rowClickScrollReport)}`);
  assert(rowClickScrollReport.selectedId === rowClickScrollReport.targetId, `shiftWorkOrders: row click did not select target row: ${JSON.stringify(rowClickScrollReport)}`);
  assert(rowClickScrollReport.delta <= 2, `shiftWorkOrders: row click changes content scroll position: ${JSON.stringify(rowClickScrollReport)}`);
  assert(rowClickScrollReport.orderStable, `shiftWorkOrders: row click reorders journal rows: ${JSON.stringify(rowClickScrollReport)}`);

  const seededReport = await evaluate(client, () => {
    const rows = [...document.querySelectorAll("[data-shift-work-order-row]")];
    const rowIds = rows.map((row) => row.getAttribute("data-shift-work-order-row") || "").filter(Boolean);
    const rowId = rowIds[0] || "";
    if (!rowId) return { seeded: false, reason: "no row" };
    const storageKey = "mes-planning-prototype-ui-v1";
    const planningStorageKey = "mes-planning-prototype-state-v2";
    const bootstrapSnapshotKey = "mes-planning-prototype-bootstrap-snapshot-v1";
    const snapshot = JSON.parse(localStorage.getItem(bootstrapSnapshotKey) || "{}");
    if (!localStorage.getItem(planningStorageKey) && snapshot?.values?.[planningStorageKey]) {
      localStorage.setItem(planningStorageKey, snapshot.values[planningStorageKey]);
    }
    const ui = JSON.parse(localStorage.getItem(storageKey) || "{}");
    const photoDataUrl = (label, color) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260" viewBox="0 0 420 260"><rect width="420" height="260" fill="${color}"/><text x="210" y="136" text-anchor="middle" fill="white" font-family="Arial" font-size="42" font-weight="700">${label}</text></svg>`)}`;
    const makeReports = (targetRowId) => [
      {
        id: `qa-report-1-${targetRowId}`,
        rowId: targetRowId,
        taskId: `${targetRowId}::qa-1`,
        documentNumber: targetRowId,
        employeeName: "QA Исполнитель",
        operationName: "QA операция",
        workCenterLabel: "QA участок",
        text: "Первое фото проблемы",
        status: "new",
        createdAt: "2026-07-03T08:00:00.000Z",
        photo: {
          id: `qa-photo-1-${targetRowId}`,
          name: "qa-photo-1.jpg",
          type: "image/svg+xml",
          size: 128,
          source: "qa",
          dataUrl: photoDataUrl("1", "#2563eb"),
        },
      },
      {
        id: `qa-report-2-${targetRowId}`,
        rowId: targetRowId,
        taskId: `${targetRowId}::qa-2`,
        documentNumber: targetRowId,
        employeeName: "QA Исполнитель",
        operationName: "QA операция",
        workCenterLabel: "QA участок",
        text: "Второе фото проблемы",
        status: "new",
        createdAt: "2026-07-03T08:05:00.000Z",
        photo: {
          id: `qa-photo-2-${targetRowId}`,
          name: "qa-photo-2.jpg",
          type: "image/svg+xml",
          size: 128,
          source: "qa",
          dataUrl: photoDataUrl("2", "#16a34a"),
        },
      },
    ];
    ui.activeModule = "shiftWorkOrders";
    ui.shiftWorkOrderJournalSelectedId = rowId;
    ui.shiftWorkOrderIssueReports = {
      ...(ui.shiftWorkOrderIssueReports || {}),
      ...Object.fromEntries(rowIds.map((targetRowId) => [targetRowId, makeReports(targetRowId)])),
    };
    localStorage.setItem(storageKey, JSON.stringify(ui));
    return {
      seeded: true,
      rowId,
      rowCount: rowIds.length,
      hasPlanningState: Boolean(localStorage.getItem(planningStorageKey)),
    };
  });
  assert(seededReport.seeded, `shiftWorkOrders: could not seed issue report photos: ${JSON.stringify(seededReport)}`);
  const seededImmediateReport = await evaluate(client, () => {
    const ui = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
    const reportStore = ui.shiftWorkOrderIssueReports || {};
    return {
      keyCount: Object.keys(reportStore).length,
      firstCount: Array.isArray(reportStore[Object.keys(reportStore)[0]]) ? reportStore[Object.keys(reportStore)[0]].length : -1,
    };
  });
  assert(seededImmediateReport.keyCount > 0, `shiftWorkOrders: issue report seed was not written to localStorage: ${JSON.stringify({ seededReport, seededImmediateReport })}`);
	  const runtimeApplyReport = await evaluate(client, () => {
	    const ui = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
	    return window.__mesRuntime?.setShiftWorkOrderIssueReportsForTest?.(ui.shiftWorkOrderIssueReports || {}) || { applied: false, reason: "runtime api missing" };
	  });
  assert(runtimeApplyReport.applied && runtimeApplyReport.rowCount > 0, `shiftWorkOrders: could not apply seeded issue reports through QA runtime: ${JSON.stringify({ seededReport, seededImmediateReport, runtimeApplyReport })}`);
  await delay(250);
	  await waitForModule(client, "shiftWorkOrders");
	  const photoReport = await evaluate(client, async () => {
	    const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	    const activeRow = document.querySelector("[data-shift-work-order-row].is-active");
	    const ui = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
	    const reportStore = ui.shiftWorkOrderIssueReports || {};
	    const activeRowId = activeRow?.getAttribute("data-shift-work-order-row") || "";
	    const issueCountText = document.querySelector("[data-visual-qa-target='shift-work-orders-issue-count']")?.textContent.trim() || "";
	    const detailVolumeText = document.querySelector("[data-visual-qa-target='shift-work-orders-detail-volume']")?.textContent.replace(/\s+/g, " ").trim() || "";
	    const photoButtons = [...document.querySelectorAll("[data-shift-work-order-report-photo]")];
	    const photoBadges = [...document.querySelectorAll("[data-visual-qa-target='shift-work-orders-issue-photo-count']")].map((item) => item.textContent.trim());
    photoButtons[0]?.click();
    await waitFrame();
    const openedCounter = document.querySelector("[data-visual-qa-target='shift-work-orders-photo-counter']")?.textContent.trim() || "";
    document.querySelector("[data-shift-work-order-report-photo-nav='1']")?.click();
    await waitFrame();
	    const nextCounter = document.querySelector("[data-visual-qa-target='shift-work-orders-photo-counter']")?.textContent.trim() || "";
	    return {
	      activeRowId,
	      storedReportKeys: Object.keys(reportStore).slice(0, 5),
	      activeStoredReportCount: Array.isArray(reportStore[activeRowId]) ? reportStore[activeRowId].length : -1,
	      issueCountText,
	      detailVolumeText,
	      tableReportCellCount: document.querySelectorAll(".shift-work-orders-table .shift-work-orders-report-cell, .shift-work-orders-table [data-visual-qa-target='shift-work-orders-report-badge']").length,
	      photoButtonCount: photoButtons.length,
	      photoBadges,
      modalOpened: Boolean(document.querySelector("[data-visual-qa-target='shift-work-orders-photo-viewer']")),
      openedCounter,
      nextCounter,
	    };
	  });
	  assert(photoReport.tableReportCellCount === 0, `shiftWorkOrders: seeded reports must not recreate Report cells in the document tree: ${JSON.stringify(photoReport)}`);
	  assert(/Report/.test(photoReport.detailVolumeText) && /2 проблем/.test(photoReport.detailVolumeText), `shiftWorkOrders: detail volume block must show seeded report count: ${JSON.stringify(photoReport)}`);
	  assert(photoReport.issueCountText.includes("2 записей") && photoReport.issueCountText.includes("2 фото"), `shiftWorkOrders: detail issue header must show report/photo counts: ${JSON.stringify(photoReport)}`);
  assert(photoReport.photoButtonCount === 2, `shiftWorkOrders: detail must expose two clickable report photos: ${JSON.stringify(photoReport)}`);
  assert(photoReport.photoBadges.every((badge) => badge === "2"), `shiftWorkOrders: photo thumbnails must show total photo count: ${JSON.stringify(photoReport)}`);
  assert(photoReport.modalOpened, `shiftWorkOrders: clicking report photo must open photo viewer: ${JSON.stringify(photoReport)}`);
  assert(photoReport.openedCounter === "1 из 2" && photoReport.nextCounter === "2 из 2", `shiftWorkOrders: photo viewer must paginate photos: ${JSON.stringify(photoReport)}`);
}

async function runAuthSessionTabletLayoutCheck(client, baseUrl) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: AUTH_SESSION_TABLET_VIEWPORT.width,
    height: AUTH_SESSION_TABLET_VIEWPORT.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const loaded = waitForCdpEvent(client, "Page.loadEventFired", 10000);
  await client.send("Page.navigate", { url: makeModuleUrl(baseUrl, "authSessionPrototype") });
  await loaded;
  await delay(250);
  await waitForModule(client, "authSessionPrototype");
  const report = await evaluate(client, () => {
    const rectFor = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
      };
    };
    const nestedOverflow = (element) => element
      ? [...element.querySelectorAll("[data-visual-qa-target]")]
        .some((child) => child.scrollWidth > child.clientWidth + 2 || child.scrollHeight > child.clientHeight + 2)
      : false;
    const factCards = [
      "auth-session-fact-actual",
      "auth-session-fact-defect",
      "auth-session-fact-assigned",
    ].map((target) => {
      const element = document.querySelector(`[data-visual-qa-target='${target}']`);
      return {
        target,
        rect: rectFor(`[data-visual-qa-target='${target}']`),
        nestedOverflow: nestedOverflow(element),
      };
    });
    const keypadButtons = [...document.querySelectorAll("[data-visual-qa-target^='auth-session-keypad-digit-'], [data-visual-qa-target='auth-session-keypad-backspace']")]
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          target: button.getAttribute("data-visual-qa-target"),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      pageOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      content: rectFor(".auth-session-content"),
      mainGrid: rectFor(".auth-session-main-grid"),
      detailPanel: rectFor("[data-visual-qa-target='auth-session-detail-panel']"),
      workspacePanel: rectFor("[data-visual-qa-target='auth-session-workspace-panel']"),
      factGridOverflowX: (() => {
        const grid = document.querySelector("[data-visual-qa-target='auth-session-fact-grid']");
        return grid ? Math.max(0, grid.scrollWidth - grid.clientWidth) : 0;
      })(),
      factCards,
      keypadButtons,
      taskCardCount: document.querySelectorAll("[data-visual-qa-target='auth-session-task-card']").length,
    };
  });
  assert(report.viewport.width === AUTH_SESSION_TABLET_VIEWPORT.width && report.viewport.height === AUTH_SESSION_TABLET_VIEWPORT.height, `authSessionPrototype: expected ${AUTH_SESSION_TABLET_VIEWPORT.name}, got ${JSON.stringify(report.viewport)}`);
  assert(report.pageOverflowX <= 2, `authSessionPrototype: ${AUTH_SESSION_TABLET_VIEWPORT.name} page horizontal overflow ${report.pageOverflowX}px`);
  assert(report.content?.width >= 2500, `authSessionPrototype: ${AUTH_SESSION_TABLET_VIEWPORT.name} content does not use available width: ${JSON.stringify(report)}`);
  assert(report.mainGrid?.width >= 2500, `authSessionPrototype: ${AUTH_SESSION_TABLET_VIEWPORT.name} main grid is too narrow: ${JSON.stringify(report)}`);
  assert(report.detailPanel?.width >= 1180, `authSessionPrototype: ${AUTH_SESSION_TABLET_VIEWPORT.name} detail panel is too narrow: ${JSON.stringify(report.detailPanel)}`);
  assert(report.workspacePanel?.width >= 820, `authSessionPrototype: ${AUTH_SESSION_TABLET_VIEWPORT.name} task board is too narrow: ${JSON.stringify(report.workspacePanel)}`);
  assert(report.workspacePanel.left > report.detailPanel.right, `authSessionPrototype: ${AUTH_SESSION_TABLET_VIEWPORT.name} panels overlap or collapse: ${JSON.stringify(report)}`);
  assert(report.factGridOverflowX <= 2, `authSessionPrototype: ${AUTH_SESSION_TABLET_VIEWPORT.name} fact grid overflow ${report.factGridOverflowX}px`);
  if (report.taskCardCount > 0) {
    assert(
      report.factCards.every((card) => card.rect?.width >= 160 && card.rect?.width <= 220 && card.rect?.height >= 52 && !card.nestedOverflow),
      `authSessionPrototype: ${AUTH_SESSION_TABLET_VIEWPORT.name} fact cards are not tablet-ready: ${JSON.stringify(report.factCards)}`
    );
    assert(
      report.keypadButtons.length >= 11 && report.keypadButtons.every((button) => button.width >= 52 && button.height >= 52),
      `authSessionPrototype: ${AUTH_SESSION_TABLET_VIEWPORT.name} keypad buttons are too small: ${JSON.stringify(report.keypadButtons)}`
    );
  }
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: SMOKE_VIEWPORT.width,
    height: SMOKE_VIEWPORT.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function main() {
  const baseUrl = getArg("--url", defaultUrl);
  await waitForAppReachable(baseUrl);
  if (verbose) console.log(`[module-smoke] launching Chrome for ${baseUrl}`);
  const chrome = await launchChrome();
  if (verbose) console.log("[module-smoke] Chrome launched");
  const consoleProblems = [];
  const dialogs = [];
  const passed = [];
  try {
    const { client } = chrome;
    client.on("Runtime.consoleAPICalled", (params) => {
      if (!["error", "warning", "assert"].includes(params.type)) return;
      consoleProblems.push({
        type: params.type,
        args: (params.args || []).map((arg) => arg.value || arg.description || "").join(" "),
      });
    });
    client.on("Runtime.exceptionThrown", (params) => {
      consoleProblems.push({
        type: "exception",
        args: params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || "",
      });
    });
    client.on("Page.javascriptDialogOpening", (params) => {
      dialogs.push(params.message || params.type || "dialog");
      client.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    });
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: "sessionStorage.setItem('mes-planning-prototype-shared-disabled-until-v1', String(Date.now() + 60 * 60 * 1000));",
    });
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: SMOKE_VIEWPORT.width,
      height: SMOKE_VIEWPORT.height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await runPublicAdminOnlyNavigationCheck(client, baseUrl);
    passed.push("public-navigation-scope");

    assert(!requestedModuleId || smokeModuleIdsToRun.length === 1, `Unknown smoke module requested: ${requestedModuleId}`);
    for (const moduleId of smokeModuleIdsToRun) {
      if (verbose) console.log(`[module-smoke] opening ${moduleId}`);
      const loaded = waitForCdpEvent(client, "Page.loadEventFired", 10000);
      await client.send("Page.navigate", { url: makeModuleUrl(baseUrl, moduleId) });
      await loaded;
      await delay(250);
      await waitForModule(client, moduleId);
      await runInteractionStabilityChecks(client, moduleId);
      await runFocusModeTopbarStabilityCheck(client, moduleId);
      await runModuleSpecificSmokeChecks(client, moduleId);
      if (moduleId === "authSessionPrototype") {
        await runAuthSessionTabletLayoutCheck(client, baseUrl);
      }
      passed.push(moduleId);
    }

    for (const alias of (requestedModuleId ? [] : LEGACY_MODULE_ALIASES)) {
      if (verbose) console.log(`[module-smoke] opening alias ${alias.source}->${alias.target}`);
      const loaded = waitForCdpEvent(client, "Page.loadEventFired", 10000);
      await client.send("Page.navigate", { url: makeModuleUrl(baseUrl, alias.source) });
      await loaded;
      await delay(250);
      await waitForModule(client, alias.target);
      await runInteractionStabilityChecks(client, alias.target);
      await runFocusModeTopbarStabilityCheck(client, alias.target);
      await runModuleSpecificSmokeChecks(client, alias.target);
      const aliasReport = await evaluate(client, (payload) => {
        const ui = JSON.parse(localStorage.getItem(payload.storageKey) || "{}");
        return {
          layoutPage: document.querySelector("main.app-shell")?.dataset.layoutPage || "",
          activeNomenclaturePane: ui.activeNomenclaturePane || "",
        };
      }, { storageKey: "mes-planning-prototype-ui-v1" });
      if (alias.expectedUi?.activeNomenclaturePane) {
        assert(
          aliasReport.activeNomenclaturePane === alias.expectedUi.activeNomenclaturePane,
          `${alias.source}: expected activeNomenclaturePane=${alias.expectedUi.activeNomenclaturePane}, got ${aliasReport.activeNomenclaturePane || "empty"}`
        );
      }
      passed.push(`${alias.source}->${alias.target}`);
    }

    assert(!dialogs.length, `Browser dialogs blocked module smoke:\n${dialogs.join("\n")}`);
    const actionableConsoleProblems = requestedModuleId
      ? consoleProblems.filter((item) => !(
          item.type === "warning"
          && (/Prevented critical planning wipe before save|Reconciled critical directory entities before save/).test(item.args)
        ))
      : consoleProblems;
    assert(!actionableConsoleProblems.length, `Console problems during module smoke:\n${actionableConsoleProblems.map((item) => `${item.type}: ${item.args}`).join("\n")}`);

    console.log("MES Module Smoke QA");
    console.log(`- viewport: ${SMOKE_VIEWPORT.name} ${SMOKE_VIEWPORT.width}x${SMOKE_VIEWPORT.height}`);
    console.log(`- modules opened: ${passed.length}`);
    passed.forEach((moduleId) => console.log(`- ${moduleId}: pass`));
    console.log("OK: all registered modules render without startup errors.");
  } finally {
    await cleanupChrome(chrome);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
