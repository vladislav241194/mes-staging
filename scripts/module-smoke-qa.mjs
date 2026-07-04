import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MES_MODULE_FLOW_CONTRACTS, MES_MODULE_FLOW_SEQUENCE } from "../src/mes_contracts.js";
import {
  HARD_UI_RUNTIME_MODULE_IDS,
  SPECIAL_UI_RUNTIME_CONTRACTS,
  SPECIAL_UI_RUNTIME_MODULE_IDS,
} from "../src/ui_runtime_contracts.js";

const defaultUrl = new URL("/?qa=module-smoke", process.env.MES_QA_URL || "http://localhost:4174/").toString();
const EXTRA_SMOKE_MODULES = ["shiftMasterBoard", "authPrototype"];
const SMOKE_MODULE_IDS = [...new Set([...MES_MODULE_FLOW_SEQUENCE, ...EXTRA_SMOKE_MODULES])];
const STANDALONE_CHROMELESS_MODULES = new Set(["authPrototype"]);
const HARD_UI_RUNTIME_MODULES = new Set(HARD_UI_RUNTIME_MODULE_IDS);
const SPECIAL_UI_RUNTIME_MODULES = new Set(SPECIAL_UI_RUNTIME_MODULE_IDS);
const SMOKE_VIEWPORT = { name: "macbook-air-15", width: 1710, height: 1112 };
const AUTH_SESSION_TABLET_VIEWPORT = { name: "auth-session-tablet-2880x1920", width: 2880, height: 1920 };
const STANDARD_MODULE_SIDEBAR_WIDTH = 260;
const verbose = process.env.MES_QA_VERBOSE === "1";
const LEGACY_MODULE_ALIASES = [
  { source: "bomLists", target: "nomenclature", expectedUi: { activeNomenclaturePane: "boards" } },
  { source: "speki", target: "products" },
  { source: "specifications", target: "products" },
  { source: "planning2", target: "planning" },
  { source: "planningWorkbench", target: "planning" },
  { source: "calculator", target: "planning" },
  { source: "warehouse", target: "gantt" },
  { source: "shiftMaster", target: "shiftMasterBoard" },
  { source: "shiftMasterContext", target: "shiftMasterBoard" },
  { source: "shiftMasterV2", target: "shiftMasterBoard" },
];
const expectedLayoutPageByModule = {
  ...Object.fromEntries(SMOKE_MODULE_IDS.map((moduleId) => [moduleId, moduleId])),
};
const missingHardRuntimeSmokeModules = HARD_UI_RUNTIME_MODULE_IDS.filter((moduleId) => !SMOKE_MODULE_IDS.includes(moduleId));
if (missingHardRuntimeSmokeModules.length) {
  throw new Error(`Hard UI runtime modules are missing from module smoke QA: ${missingHardRuntimeSmokeModules.join(", ")}`);
}
const missingSpecialRuntimeSmokeModules = SPECIAL_UI_RUNTIME_MODULE_IDS.filter((moduleId) => !SMOKE_MODULE_IDS.includes(moduleId));
if (missingSpecialRuntimeSmokeModules.length) {
  throw new Error(`Special UI runtime modules are missing from module smoke QA: ${missingSpecialRuntimeSmokeModules.join(", ")}`);
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
	        annotationGroup: (document.querySelector(".app-module-annotation strong")?.textContent || "").trim(),
	        annotation: (document.querySelector(".app-module-annotation span")?.textContent || "").trim(),
	        qaAction: rectFor("[data-toggle-visual-qa]"),
	        refreshAction: rectFor("[data-refresh-app]"),
	        authSummary: rectFor("[data-visual-qa-target='app-auth-session-summary']"),
	        mainTextLength: (shell?.innerText || "").trim().length,
	        hasStartupError: /Ошибка запуска интерфейса|Cannot initialize|TypeError|ReferenceError/.test(document.body?.innerText || ""),
	      };
	    }, expectedLayout);
    lastReport = report;
    if (report.hasShell && report.layoutPage === expectedLayout) {
      if (!isChromelessModule) {
        assert(report.title === expectedLabel, `${moduleId}: topbar title is out of sync with MES_MODULE_FLOW_CONTRACTS.label. Expected "${expectedLabel}", got "${report.title}".`);
        assert(report.annotation, `${moduleId}: no module annotation in topbar`);
        assert(
          report.annotation === expectedAnnotation,
          `${moduleId}: topbar annotation is out of sync with MES_MODULE_FLOW_CONTRACTS.role. Expected "${expectedAnnotation}", got "${report.annotation}".`
        );
        if (expectedGroup && moduleId !== "directories") {
          assert(
            report.annotationGroup === expectedGroup,
	            `${moduleId}: topbar annotation group is out of sync with MES_MODULE_FLOW_CONTRACTS.group. Expected "${expectedGroup}", got "${report.annotationGroup}".`
	          );
	        }
	        assert(report.qaAction?.width > 0, `${moduleId}: topbar QA action is missing`);
	        assert(report.refreshAction?.width > 0, `${moduleId}: topbar refresh action is missing`);
	        assert(report.authSummary?.width > 0, `${moduleId}: topbar auth summary is missing`);
	        assert(
	          report.qaAction.right <= report.refreshAction.left && report.refreshAction.right <= report.authSummary.left,
	          `${moduleId}: topbar action order must be QA -> refresh -> auth summary: ${JSON.stringify({ qa: report.qaAction, refresh: report.refreshAction, auth: report.authSummary })}`
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
      "button:not(.shop-map-widget)",
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
      ".operation-slot",
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

  const visualQaReport = await evaluate(client, () => ({
    bodyQa: document.body.classList.contains("is-mes-visual-qa-enabled"),
    shellQa: Boolean(document.querySelector("main.app-shell")?.classList.contains("is-visual-qa-enabled")),
    markerLayer: Boolean(document.querySelector(".visual-debug-marker-layer")),
  }));
  assert(!visualQaReport.bodyQa && !visualQaReport.shellQa && !visualQaReport.markerLayer, `${moduleId}: Visual QA restored as a persistent mode and can consume the first click: ${JSON.stringify(visualQaReport)}`);

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
    const rect = topbar.getBoundingClientRect();
    const style = getComputedStyle(topbar);
    const titleMetaStyle = titleMeta ? getComputedStyle(titleMeta) : null;
    return {
      canCheck: true,
      isFocusMode: shell.classList.contains("is-focus-mode"),
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

async function waitForVisualQaState(client, expectedEnabled, moduleId) {
  const startedAt = Date.now();
  let lastReport = null;
  while (Date.now() - startedAt < 6000) {
    lastReport = await evaluate(client, () => ({
      bodyQa: document.body.classList.contains("is-mes-visual-qa-enabled"),
      bodyInspecting: document.body.classList.contains("is-mes-visual-qa-inspecting"),
      shellQa: Boolean(document.querySelector("main.app-shell")?.classList.contains("is-visual-qa-enabled")),
      markerLayer: Boolean(document.querySelector(".visual-debug-marker-layer")),
      debug: sessionStorage.getItem("mes-visual-qa-last-debug") || "",
    }));
    if (Boolean(lastReport.bodyQa) === expectedEnabled && Boolean(lastReport.shellQa) === expectedEnabled) return lastReport;
    await delay(80);
  }
  throw new Error(`${moduleId}: Visual QA ${expectedEnabled ? "did not turn on" : "did not turn off"}: ${JSON.stringify(lastReport)}`);
}

async function runVisualQaPickerSmoke(client, moduleId) {
  await evaluate(client, () => {
    window.__mesVisualQaInspectorReport = null;
    window.__mesVisualQaSmartReport = null;
    sessionStorage.removeItem("mes-visual-qa-last-report");
    sessionStorage.removeItem("mes-visual-qa-last-debug");
  });
  const toggleRect = await clickVisibleCenter(client, "[data-toggle-visual-qa]", `${moduleId}: Visual QA toggle`);
  await waitForVisualQaState(client, true, moduleId);

  const targetReport = await evaluate(client, () => {
    const selector = [
      "[data-visual-qa-target]:not([data-toggle-visual-qa])",
      "[data-ui-component='Panel']",
      "[data-ui-component='ModuleHeader']",
      "[data-layout='main-content']",
      ".module-data-page",
      ".planner-workspace",
      ".gantt-shell",
      ".operation-slot",
      ".row-label",
      ".module-panel",
      "main.app-shell",
    ].join(",");
    const blocked = ".module-menu, .app-topbar, .mobile-module-switcher, .mes-visual-mode-tray, .visual-debug-marker-layer";
    const element = [...document.querySelectorAll(selector)].find((candidate) => {
      if (candidate.closest(blocked)) return false;
      const rect = candidate.getBoundingClientRect();
      const style = getComputedStyle(candidate);
      return rect.width >= 16
        && rect.height >= 16
        && rect.bottom > 0
        && rect.right > 0
        && rect.top < innerHeight
        && rect.left < innerWidth
        && style.display !== "none"
        && style.visibility !== "hidden"
        && style.pointerEvents !== "none";
    });
    if (!element) return null;
    element.dataset.smokeVisualQaTarget = "yes";
    const rect = element.getBoundingClientRect();
    return {
      selector: "[data-smoke-visual-qa-target='yes']",
      visualQaTarget: element.dataset.visualQaTarget || "",
      className: element.className || "",
      text: (element.textContent || element.getAttribute("aria-label") || element.tagName)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120),
      rect: {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  });
  assert(targetReport?.selector, `${moduleId}: no visible content target for Visual QA picker after toggle ${JSON.stringify({ toggleRect })}`);

  await clickVisibleCenter(client, targetReport.selector, `${moduleId}: Visual QA content target`);
  await delay(260);
  const result = await evaluate(client, () => {
    const smartText = window.__mesVisualQaSmartReport?.text || "";
    const smartReport = window.__mesVisualQaSmartReport?.report || null;
    return {
      bodyQa: document.body.classList.contains("is-mes-visual-qa-enabled"),
      shellQa: Boolean(document.querySelector("main.app-shell")?.classList.contains("is-visual-qa-enabled")),
      smartText,
      detailLevel: smartReport?.detailLevel || "",
      reportTextLength: String(smartReport?.text || "").length,
      module: smartReport?.module || "",
      signature: smartReport?.signature || "",
      selector: smartReport?.selector || "",
      debug: sessionStorage.getItem("mes-visual-qa-last-debug") || "",
    };
  });
  assert(!result.bodyQa && !result.shellQa, `${moduleId}: Visual QA did not turn off after inspected click: ${JSON.stringify(result)}`);
  assert(result.smartText.startsWith("Visual QA Inspector report"), `${moduleId}: Visual QA did not produce a copyable report: ${JSON.stringify({ result, targetReport })}`);
  assert(result.detailLevel === "compact", `${moduleId}: Visual QA default report must be compact: ${JSON.stringify({ result, targetReport })}`);
  assert(result.reportTextLength <= 120, `${moduleId}: Visual QA compact text is too long: ${JSON.stringify({ result, targetReport })}`);
  assert(!result.smartText.includes("Что проверить"), `${moduleId}: Visual QA compact report still contains full checklist: ${JSON.stringify({ result, targetReport })}`);
  assert(result.module === moduleId, `${moduleId}: Visual QA report has wrong module: ${JSON.stringify({ result, targetReport })}`);
  assert(result.signature || result.selector, `${moduleId}: Visual QA report has no selected element signature: ${JSON.stringify({ result, targetReport })}`);
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
    };
  });
  const hardRuntimeRoots = pageRuntimeStatus.runtimeRoots.filter((root) => root.runtime === "hard-v1");
  const specialRuntimeRoots = pageRuntimeStatus.runtimeRoots.filter((root) => root.runtime && root.runtime !== "hard-v1");
  assert(
    HARD_UI_RUNTIME_MODULES.has(moduleId) || hardRuntimeRoots.length === 0,
    `${moduleId}: page renders hard-v1 runtime but module is not listed in HARD_UI_RUNTIME_MODULE_IDS`
  );
  assert(
    SPECIAL_UI_RUNTIME_MODULES.has(moduleId) || specialRuntimeRoots.length === 0,
    `${moduleId}: page renders special runtime but module is not listed in SPECIAL_UI_RUNTIME_MODULE_IDS: ${JSON.stringify(specialRuntimeRoots)}`
  );
  if (SPECIAL_UI_RUNTIME_MODULES.has(moduleId)) {
    const expectedSpecialRuntime = SPECIAL_UI_RUNTIME_CONTRACTS[moduleId];
    assert(expectedSpecialRuntime, `${moduleId}: missing SPECIAL_UI_RUNTIME_CONTRACTS entry`);
    assert(
      specialRuntimeRoots.some((root) => (
        root.runtime === expectedSpecialRuntime.runtime
        && root.component === expectedSpecialRuntime.component
      )),
      `${moduleId}: expected special runtime ${JSON.stringify(expectedSpecialRuntime)}, got ${JSON.stringify(specialRuntimeRoots)}`
    );
  }

  if (HARD_UI_RUNTIME_MODULES.has(moduleId)) {
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
          const flowDescendants = [...body.querySelectorAll("*")].filter(isFlowBox);
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
        .filter((panel) => panel.dataset?.uiComponent !== "Panel")
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
        .filter((field) => field.dataset?.uiComponent !== "FormField")
        .map((field) => ({
          className: field.className || "",
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
        '.planning-order-page.is-heroui :is(.planning-order-queue, .planning-order-header, .planning-order-route-map, .planning-order-record, .planning-order-record-section, .planning-order-route-item, .planning-order-phase, .planning-order-lane-head, .planning-order-step-pill, .planning-order-register-row, .route-smt-step-card, .route-smt-grid, .planning-detail-disclosure, .planning-detail-body, .route-smt-balance-block, .route-smt-input-block, .route-smt-result-block, .route-smt-balance-disclosure, .smt-result-kpi-row article, .smt-machine-balance-summary article)',
        '.directories-page :is(.directory-sidebar, .directory-header, .directory-table-card, .directory-nav-item, .directory-health div, .directory-detail-list div)',
        '.shift-master-board-page :is(.shift-master-board-panel, .shift-master-board-task-context, .shift-master-board-section, .shift-master-board-card, .shift-master-board-available-person, .shift-master-board-document, .shift-master-board-summary-cell, .shift-master-board-route-chain-card)',
      ].join(",");
      const radiusProblems = [...(page?.querySelectorAll(radiusContractSelector) || [])]
        .filter(isVisibleBox)
        .map((element, index) => {
          const style = window.getComputedStyle(element);
          const rect = toRect(element);
          const radius = Number.parseFloat(style.borderTopLeftRadius || style.borderRadius || "0") || 0;
          const isPill = radius >= 99;
          if (isPill || radius <= 8.01) return null;
          return {
            index,
            className: element.className || "",
            component: element.dataset?.uiComponent || "",
            radius,
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
        probe.className = "module-data-page ui-module-page";
        probe.dataset.uiComponent = "ModulePage";
        probe.dataset.uiRuntime = "hard-v1";
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
        radiusProblems,
        contentOverlaps: contentOverlaps.slice(0, 6),
        panelBodyOverlaps,
      };
    }, { moduleId, standardModuleSidebarWidth: STANDARD_MODULE_SIDEBAR_WIDTH });
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
    assert(runtimeReport.unmarkedFormFields.length === 0, `${moduleId}: visible form field without FormField marker: ${JSON.stringify(runtimeReport.unmarkedFormFields)}`);
    assert(runtimeReport.unmarkedTableWraps.length === 0, `${moduleId}: visible table wrapper without TableWrap marker: ${JSON.stringify(runtimeReport.unmarkedTableWraps)}`);
    assert(runtimeReport.tableWrapProblems.length === 0, `${moduleId}: horizontal-only TableWrap has vertical scroll contract drift: ${JSON.stringify(runtimeReport.tableWrapProblems)}`);
    assert(runtimeReport.radiusProblems.length === 0, `${moduleId}: standard UI radius exceeds 8px contract: ${JSON.stringify(runtimeReport.radiusProblems)}`);
    assert(runtimeReport.panelEscapes.length === 0, `${moduleId}: panel content escapes panel bounds: ${JSON.stringify(runtimeReport.panelEscapes)}`);
    assert(runtimeReport.contentOverlaps.length === 0, `${moduleId}: module content direct blocks overlap: ${JSON.stringify(runtimeReport.contentOverlaps)}`);
    assert(runtimeReport.panelBodyOverlaps.length === 0, `${moduleId}: PanelBody direct blocks overlap: ${JSON.stringify(runtimeReport.panelBodyOverlaps)}`);
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
            centerDelta: Math.round(Math.abs((rect.top + rect.height / 2) - inputCenterY) * 10) / 10,
            svgCenterDelta: svgRect ? Math.round(Math.abs((svgRect.top + svgRect.height / 2) - (rect.top + rect.height / 2)) * 10) / 10 : 0,
            svgWidth: svgRect ? Math.round(svgRect.width) : 0,
            svgHeight: svgRect ? Math.round(svgRect.height) : 0,
          };
        });
      return {
        hasControl: Boolean(control),
        inputHeight: inputRect ? Math.round(inputRect.height) : 0,
        items,
      };
    });
    assert(calendarReport.hasControl, `shiftMasterBoard: top calendar control is missing: ${JSON.stringify(calendarReport)}`);
    assert(calendarReport.inputHeight === 30, `shiftMasterBoard: top calendar date input must be 30px high: ${JSON.stringify(calendarReport)}`);
    assert(
      calendarReport.items.length >= 5
        && calendarReport.items.every((item) => item.height === 30 && item.centerDelta <= 1),
      `shiftMasterBoard: calendar controls must align with the date input: ${JSON.stringify(calendarReport)}`
    );
    assert(
      calendarReport.items
        .filter((item) => /shift-calendar-step|shift-calendar-open/.test(item.className))
        .every((item) => item.width === 28 && item.svgWidth === 14 && item.svgHeight === 14 && item.svgCenterDelta <= 1),
      `shiftMasterBoard: calendar icon buttons must have centered 14px icons: ${JSON.stringify(calendarReport)}`
    );
    const kuzmMasterScopeReport = await evaluate(client, async () => {
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const masterButton = [...document.querySelectorAll("[data-shift-board-master]")]
        .find((button) => /Кузьмина Ирина Романович/i.test(button.getAttribute("title") || button.textContent || ""));
      if (!masterButton) return { checked: false, reason: "master switch is not visible" };
      masterButton.click();
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
    if (kuzmMasterScopeReport.checked) {
      assert(kuzmMasterScopeReport.panelCount > 0, `shiftMasterBoard: Kuzmina has no assignment panels: ${JSON.stringify(kuzmMasterScopeReport)}`);
      assert(kuzmMasterScopeReport.maxScopeCount > 0, `shiftMasterBoard: Kuzmina scope is empty: ${JSON.stringify(kuzmMasterScopeReport)}`);
      assert(kuzmMasterScopeReport.maxEmployeeCardCount > 0, `shiftMasterBoard: Kuzmina employee cards disappeared: ${JSON.stringify(kuzmMasterScopeReport)}`);
    }
  }
  if (moduleId === "planning") {
    const workOrderUxReport = await evaluate(client, () => {
      const strip = document.querySelector(".planning-order-decision-strip");
      const metrics = [...document.querySelectorAll(".planning-order-decision-metric[data-planning-work-item]")];
      const tableWrap = document.querySelector(".planning-order-table-wrap");
      const stripRect = strip?.getBoundingClientRect();
      const tableRect = tableWrap?.getBoundingClientRect();
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
          hasQaTarget: Boolean(metric.dataset.visualQaTarget),
        };
      }).filter((item) => (
        item.radius > 2
        || item.borderTop > 0
        || item.borderBottom > 0
        || item.background === "rgb(255, 255, 255)"
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
        hasManualLaborMetric: labels.some((item) => item.id === "manualLabor" && item.text.includes("Трудозатраты")),
        hasScheduleMetric: labels.some((item) => item.id === "schedule" && item.text.includes("Гант")),
        tableBelowStrip: Boolean(stripRect && tableRect && tableRect.top >= stripRect.bottom),
      };
    });
    assert(workOrderUxReport.hasStrip, "planning: work-order decision strip is missing");
    assert(workOrderUxReport.stripText.includes("Решение"), `planning: work-order decision strip has no decision label: ${workOrderUxReport.stripText}`);
    assert(workOrderUxReport.stripWidth > 320 && workOrderUxReport.stripHeight > 30, `planning: work-order decision strip geometry is broken: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.stripOverflowX <= 2, `planning: work-order decision strip horizontal overflow ${workOrderUxReport.stripOverflowX}px`);
    assert(workOrderUxReport.stripQaTarget === "planning-order-decision-strip", `planning: work-order decision strip has no visual QA target: ${JSON.stringify(workOrderUxReport)}`);
    assert(workOrderUxReport.metricCount >= 5, `planning: expected at least 5 decision metrics, got ${workOrderUxReport.metricCount}`);
    assert(workOrderUxReport.metricStyleProblems.length === 0, `planning: decision metrics returned card-like/QA-broken styling: ${JSON.stringify(workOrderUxReport.metricStyleProblems)}`);
    assert(workOrderUxReport.qaTargets.length >= 18, `planning: decision strip has too few QA targets: ${JSON.stringify(workOrderUxReport.qaTargets)}`);
    assert(workOrderUxReport.hasManualLaborMetric, `planning: manual labor decision metric is missing: ${JSON.stringify(workOrderUxReport.metricIds)}`);
    assert(workOrderUxReport.hasScheduleMetric, `planning: schedule decision metric is missing: ${JSON.stringify(workOrderUxReport.metricIds)}`);
    assert(workOrderUxReport.tableBelowStrip, "planning: work-order table overlaps decision strip");
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
        const detail = document.querySelector(".planning-work-detail");
        const stripRect = strip?.getBoundingClientRect();
        const tableRect = tableWrap?.getBoundingClientRect();
        results.push({
          id,
          active: Boolean(currentMetric?.classList.contains("is-active")),
          detailText: (detail?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
          stripOverflowX: strip ? Math.max(0, strip.scrollWidth - strip.clientWidth) : 0,
          tableOverflowX: tableWrap ? Math.max(0, tableWrap.scrollWidth - tableWrap.clientWidth) : 0,
          tableBelowStrip: Boolean(stripRect && tableRect && tableRect.top >= stripRect.bottom),
        });
      }
      return results;
    });
    const inactiveDecisionMetrics = workOrderMetricClickReport.filter((item) => !item.active);
    const emptyDecisionDetails = workOrderMetricClickReport.filter((item) => !item.detailText);
    const overflowingDecisionMetrics = workOrderMetricClickReport.filter((item) => item.stripOverflowX > 2 || item.tableOverflowX > 2 || !item.tableBelowStrip);
    assert(inactiveDecisionMetrics.length === 0, `planning: decision metrics do not become active after click: ${JSON.stringify(inactiveDecisionMetrics)}`);
    assert(emptyDecisionDetails.length === 0, `planning: decision metrics open empty details: ${JSON.stringify(emptyDecisionDetails)}`);
    assert(overflowingDecisionMetrics.length === 0, `planning: decision metric click causes layout drift: ${JSON.stringify(overflowingDecisionMetrics)}`);
  }
  if (moduleId === "gantt") {
    const ganttReport = await evaluate(client, () => {
      const runtime = document.querySelector("[data-gantt-shell]");
      const canvas = runtime?.querySelector(".gantt-canvas");
      const timeline = runtime?.querySelector("[data-ui-component='GanttTimeline']");
      const rowsLayer = runtime?.querySelector(".rows-layer");
      const dependencyLayer = runtime?.querySelector("[data-ui-component='GanttDependencyLayer']");
      const dependencyPaths = [...(runtime?.querySelectorAll("[data-ui-component='GanttDependencyPath']") || [])];
      const dependencyArrows = [...(runtime?.querySelectorAll("[data-ui-component='GanttDependencyArrow']") || [])];
      const dependencyMasks = [...(runtime?.querySelectorAll("[data-ui-component='GanttDependencySlotMask']") || [])];
      const dependencyMaskRects = [...(runtime?.querySelectorAll("[data-ui-component='GanttDependencySlotMaskRect']") || [])];
      const nonWorkingLayers = [...(runtime?.querySelectorAll("[data-ui-component='GanttNonWorkingLayer']") || [])];
      const nonWorkingZones = [...(runtime?.querySelectorAll("[data-ui-component='GanttNonWorkingZone']") || [])];
      const slots = [...(runtime?.querySelectorAll(".operation-slot") || [])];
      const slotComponents = [...(runtime?.querySelectorAll("[data-ui-component='GanttSlot']") || [])];
      const resizeHandles = [...(runtime?.querySelectorAll("[data-ui-component='GanttResizeHandle']") || [])];
      const workingSegments = [...(runtime?.querySelectorAll("[data-ui-component='GanttWorkingSegment']") || [])];
      const nonWorkingSegments = [...(runtime?.querySelectorAll("[data-ui-component='GanttNonWorkingSegment']") || [])];
      const operationalSlots = slots.filter((slot) => slot.classList.contains("is-master-validated") || slot.classList.contains("has-master-fact"));
      const operationalLayers = [...(runtime?.querySelectorAll("[data-ui-component='GanttOperationalLayer']") || [])];
      const operationalSegments = [...(runtime?.querySelectorAll("[data-ui-component='GanttOperationalSegment']") || [])];
      const transferBatches = [...(runtime?.querySelectorAll("[data-ui-component='GanttTransferBatch']") || [])];
      const runtimeRect = runtime?.getBoundingClientRect();
      const canvasRect = canvas?.getBoundingClientRect();
      const badSlotComponents = slots
        .filter((slot) => slot.dataset.uiComponent !== "GanttSlot")
        .map((slot) => slot.dataset.slotId || slot.className)
        .slice(0, 8);
      const firstSlotRect = slots[0]?.getBoundingClientRect();
      return {
        hasRuntime: Boolean(runtime),
        runtime: runtime?.dataset.uiRuntime || "",
        component: runtime?.dataset.uiComponent || "",
        hasCanvas: Boolean(canvas),
        canvasComponent: canvas?.dataset.uiComponent || "",
        hasTimeline: Boolean(timeline),
        timelineComponent: timeline?.dataset.uiComponent || "",
        hasRowsLayer: Boolean(rowsLayer),
        rowsLayerComponent: rowsLayer?.dataset.uiComponent || "",
        hasDependencyLayer: Boolean(dependencyLayer),
        dependencyLayerComponent: dependencyLayer?.dataset.uiComponent || "",
        dependencyPathCount: dependencyPaths.length,
        dependencyArrowCount: dependencyArrows.length,
        dependencyMaskCount: dependencyMasks.length,
        dependencyMaskRectCount: dependencyMaskRects.length,
        dependencyPathWithoutD: dependencyPaths.filter((path) => !path.getAttribute("d")).length,
        dependencyPathWithoutMarker: dependencyPaths.filter((path) => !path.getAttribute("marker-end")).length,
        dependencyPathWithoutMask: dependencyMaskRects.length
          ? dependencyPaths.filter((path) => !path.getAttribute("mask")).length
          : 0,
        nonWorkingLayerCount: nonWorkingLayers.length,
        nonWorkingZoneCount: nonWorkingZones.length,
        nonWorkingZeroGeometry: nonWorkingZones
          .filter((zone) => {
            const rect = zone.getBoundingClientRect();
            return rect.width <= 0 || rect.height <= 0;
          })
          .slice(0, 8)
          .map((zone) => zone.className || zone.title || "zone"),
        slotCount: slots.length,
        slotComponentCount: slotComponents.length,
        resizeHandleCount: resizeHandles.length,
        badSlotComponents,
        workingSegmentCount: workingSegments.length,
        nonWorkingSegmentCount: nonWorkingSegments.length,
        operationalSlotCount: operationalSlots.length,
        operationalLayerCount: operationalLayers.length,
        operationalSegmentCount: operationalSegments.length,
        transferBatchCount: transferBatches.length,
        runtimeWidth: Math.round(runtimeRect?.width || 0),
        runtimeHeight: Math.round(runtimeRect?.height || 0),
        canvasWidth: Math.round(canvasRect?.width || 0),
        canvasHeight: Math.round(canvasRect?.height || 0),
        firstSlotWidth: Math.round(firstSlotRect?.width || 0),
        firstSlotHeight: Math.round(firstSlotRect?.height || 0),
        pageOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      };
    });
    assert(ganttReport.hasRuntime, "gantt: GanttRuntime shell is missing");
    assert(ganttReport.runtime === "gantt-v1", `gantt: expected data-ui-runtime=gantt-v1, got "${ganttReport.runtime}"`);
    assert(ganttReport.component === "GanttRuntime", `gantt: expected GanttRuntime component, got "${ganttReport.component}"`);
    assert(ganttReport.hasCanvas && ganttReport.canvasComponent === "GanttCanvas", "gantt: GanttCanvas contract is missing");
    assert(ganttReport.hasTimeline && ganttReport.timelineComponent === "GanttTimeline", "gantt: GanttTimeline contract is missing");
    assert(ganttReport.hasRowsLayer && ganttReport.rowsLayerComponent === "GanttRowsLayer", "gantt: GanttRowsLayer contract is missing");
    assert(ganttReport.hasDependencyLayer && ganttReport.dependencyLayerComponent === "GanttDependencyLayer", "gantt: GanttDependencyLayer contract is missing");
    assert(ganttReport.dependencyArrowCount >= 6, `gantt: dependency arrow marker contract is missing (${ganttReport.dependencyArrowCount})`);
    assert(ganttReport.dependencyMaskCount > 0, "gantt: GanttDependencySlotMask contract is missing");
    assert(ganttReport.dependencyMaskRectCount >= ganttReport.slotCount, `gantt: dependency slot mask rects look incomplete ${ganttReport.dependencyMaskRectCount}/${ganttReport.slotCount}`);
    assert(ganttReport.dependencyPathWithoutD === 0, `gantt: dependency paths without d attribute: ${ganttReport.dependencyPathWithoutD}`);
    assert(ganttReport.dependencyPathWithoutMarker === 0, `gantt: dependency paths without marker-end: ${ganttReport.dependencyPathWithoutMarker}`);
    assert(ganttReport.dependencyPathWithoutMask === 0, `gantt: dependency paths without slot readability mask: ${ganttReport.dependencyPathWithoutMask}`);
    assert(ganttReport.nonWorkingLayerCount > 0, "gantt: GanttNonWorkingLayer contract is missing");
    assert(ganttReport.nonWorkingZoneCount > 0, "gantt: GanttNonWorkingZone contract is missing");
    assert(ganttReport.nonWorkingZeroGeometry.length === 0, `gantt: non-working zones with zero geometry: ${JSON.stringify(ganttReport.nonWorkingZeroGeometry)}`);
    assert(ganttReport.slotCount > 0, "gantt: no operation slots rendered");
    assert(ganttReport.slotComponentCount === ganttReport.slotCount, `gantt: GanttSlot marker drift ${ganttReport.slotComponentCount}/${ganttReport.slotCount}`);
    assert(ganttReport.resizeHandleCount > 0, "gantt: GanttResizeHandle contract is missing");
    assert(ganttReport.badSlotComponents.length === 0, `gantt: operation slots without GanttSlot component: ${JSON.stringify(ganttReport.badSlotComponents)}`);
    if (ganttReport.operationalSlotCount > 0) {
      assert(ganttReport.operationalLayerCount > 0, `gantt: operational slots rendered without GanttOperationalLayer (${ganttReport.operationalSlotCount})`);
      assert(ganttReport.operationalSegmentCount > 0, `gantt: operational slots rendered without GanttOperationalSegment (${ganttReport.operationalSlotCount})`);
    }
    assert(ganttReport.firstSlotWidth > 0 && ganttReport.firstSlotHeight > 0, `gantt: first slot geometry looks broken ${ganttReport.firstSlotWidth}x${ganttReport.firstSlotHeight}`);
    assert(ganttReport.runtimeWidth > 320 && ganttReport.runtimeHeight > 240, `gantt: runtime dimensions look broken ${ganttReport.runtimeWidth}x${ganttReport.runtimeHeight}`);
    assert(ganttReport.canvasWidth >= ganttReport.runtimeWidth, `gantt: canvas width ${ganttReport.canvasWidth}px is smaller than runtime ${ganttReport.runtimeWidth}px`);
    assert(ganttReport.pageOverflowX <= 2, `gantt: page horizontal overflow ${ganttReport.pageOverflowX}px`);

    const dragReport = await evaluate(client, () => new Promise((resolve) => {
      const slot = [...document.querySelectorAll("[data-ui-component='GanttSlot']")]
        .find((item) => (
          !item.classList.contains("aggregate-slot")
          && !item.classList.contains("week-slot")
          && !item.classList.contains("is-locked")
        ))
        || document.querySelector("[data-ui-component='GanttSlot']");
      if (!slot || typeof PointerEvent !== "function") {
        resolve({ hasSlot: Boolean(slot), pointerEventSupported: typeof PointerEvent === "function" });
        return;
      }
      slot.scrollIntoView({ block: "center", inline: "center" });
      const rect = slot.getBoundingClientRect();
      const startX = rect.left + Math.min(Math.max(12, rect.width / 2), Math.max(12, rect.width - 8));
      const startY = rect.top + Math.min(Math.max(8, rect.height / 2), Math.max(8, rect.height - 4));
      slot.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: startX,
        clientY: startY,
      }));
      document.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: startX + 80,
        clientY: startY + 2,
      }));
      setTimeout(() => {
        const overlay = document.querySelector("[data-ui-component='GanttSnapOverlay']");
        const ghost = document.querySelector("[data-ui-component='GanttDragGhost']");
        const guide = document.querySelector("[data-ui-component='GanttSnapGuide']");
        const ghostRect = ghost?.getBoundingClientRect();
        const overlayRect = overlay?.getBoundingClientRect();
        const report = {
          hasSlot: true,
          pointerEventSupported: true,
          hasOverlay: Boolean(overlay),
          hasGhost: Boolean(ghost),
          hasGuide: Boolean(guide),
          overlayWidth: Math.round(overlayRect?.width || 0),
          overlayHeight: Math.round(overlayRect?.height || 0),
          ghostWidth: Math.round(ghostRect?.width || 0),
          ghostHeight: Math.round(ghostRect?.height || 0),
        };
        document.dispatchEvent(new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 0,
          clientX: startX + 80,
          clientY: startY + 2,
        }));
        resolve(report);
      }, 80);
    }));
    assert(dragReport.hasSlot, "gantt: cannot test drag overlay because no GanttSlot was found");
    assert(dragReport.pointerEventSupported, "gantt: PointerEvent is not supported in smoke browser");
    assert(dragReport.hasOverlay && dragReport.hasGhost && dragReport.hasGuide, `gantt: drag overlay contract is missing ${JSON.stringify(dragReport)}`);
    assert(dragReport.overlayWidth > 320 && dragReport.overlayHeight > 120, `gantt: drag overlay geometry looks broken ${JSON.stringify(dragReport)}`);
    assert(dragReport.ghostWidth > 0 && dragReport.ghostHeight > 0, `gantt: drag ghost geometry looks broken ${JSON.stringify(dragReport)}`);

    const resizeReport = await evaluate(client, () => new Promise((resolve) => {
      const handle = document.querySelector("[data-ui-component='GanttResizeHandle']");
      if (!handle || typeof PointerEvent !== "function") {
        resolve({ hasHandle: Boolean(handle), pointerEventSupported: typeof PointerEvent === "function" });
        return;
      }
      handle.scrollIntoView({ block: "center", inline: "center" });
      const rect = handle.getBoundingClientRect();
      const startX = rect.left + rect.width / 2;
      const startY = rect.top + rect.height / 2;
      handle.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: startX,
        clientY: startY,
      }));
      document.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: startX + 80,
        clientY: startY,
      }));
      setTimeout(() => {
        const overlay = document.querySelector("[data-ui-component='GanttSnapOverlay']");
        const ghost = document.querySelector("[data-ui-component='GanttDragGhost']");
        const guide = document.querySelector("[data-ui-component='GanttSnapGuide']");
        const ghostRect = ghost?.getBoundingClientRect();
        const report = {
          hasHandle: true,
          pointerEventSupported: true,
          hasOverlay: Boolean(overlay),
          hasGhost: Boolean(ghost),
          hasGuide: Boolean(guide),
          guideMode: guide?.classList.contains("is-resize") ? "resize" : guide?.className || "",
          ghostWidth: Math.round(ghostRect?.width || 0),
          ghostHeight: Math.round(ghostRect?.height || 0),
        };
        document.dispatchEvent(new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 0,
          clientX: startX + 80,
          clientY: startY,
        }));
        resolve(report);
      }, 80);
    }));
    assert(resizeReport.hasHandle, "gantt: cannot test resize overlay because no GanttResizeHandle was found");
    assert(resizeReport.pointerEventSupported, "gantt: PointerEvent is not supported in smoke browser for resize");
    assert(resizeReport.hasOverlay && resizeReport.hasGhost && resizeReport.hasGuide, `gantt: resize overlay contract is missing ${JSON.stringify(resizeReport)}`);
    assert(resizeReport.guideMode === "resize", `gantt: resize snap guide mode is wrong ${JSON.stringify(resizeReport)}`);
    assert(resizeReport.ghostWidth > 0 && resizeReport.ghostHeight > 0, `gantt: resize ghost geometry looks broken ${JSON.stringify(resizeReport)}`);

    const openedSlotId = await evaluate(client, () => {
      const slot = document.querySelector("[data-ui-component='GanttSlot']");
      slot?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      return slot?.dataset.slotId || "";
    });
    assert(openedSlotId, "gantt: cannot open selected slot state because no GanttSlot was found");
    await delay(120);
    const editSurfaceReport = await evaluate(client, () => {
      const drawer = document.querySelector(".slot-drawer[data-ui-component='Drawer'], .detail-drawer[data-ui-component='Drawer']");
      const modal = document.querySelector(".slot-form-modal[data-ui-component='Modal'], .modal[data-ui-component='Modal'], [role='dialog'][data-ui-component='Modal']");
      const drawerRect = drawer?.getBoundingClientRect();
      const modalRect = modal?.getBoundingClientRect();
      const surface = drawer || modal;
      const surfaceRect = surface?.getBoundingClientRect();
      return {
        hasDrawer: Boolean(drawer),
        drawerComponent: drawer?.dataset.uiComponent || "",
        drawerWidth: Math.round(drawerRect?.width || 0),
        drawerHeight: Math.round(drawerRect?.height || 0),
        hasModal: Boolean(modal),
        modalComponent: modal?.dataset.uiComponent || "",
        modalWidth: Math.round(modalRect?.width || 0),
        modalHeight: Math.round(modalRect?.height || 0),
        surfaceComponent: surface?.dataset.uiComponent || "",
        surfaceWidth: Math.round(surfaceRect?.width || 0),
        surfaceHeight: Math.round(surfaceRect?.height || 0),
      };
    });
    assert(
      (editSurfaceReport.hasDrawer && editSurfaceReport.drawerComponent === "Drawer")
        || (editSurfaceReport.hasModal && editSurfaceReport.modalComponent === "Modal"),
      "gantt: selected slot edit surface contract is missing after opening slot",
    );
    assert(editSurfaceReport.surfaceWidth > 240 && editSurfaceReport.surfaceHeight > 240, `gantt: selected slot edit surface geometry looks broken ${editSurfaceReport.surfaceWidth}x${editSurfaceReport.surfaceHeight}`);

    const slotEditorQaReport = await evaluate(client, () => {
      const context = document.querySelector('[data-visual-qa-target="gantt-slot-editor-context"]');
      const requiredTargets = [
        "gantt-slot-editor-summary",
        "gantt-slot-editor-working-duration",
        "gantt-slot-editor-calendar-duration",
        "gantt-slot-editor-resource-code",
        "gantt-slot-editor-signal-count",
        "gantt-slot-editor-detail-product",
        "gantt-slot-editor-detail-route-step",
        "gantt-slot-editor-detail-labor",
        "gantt-slot-editor-flow-input",
        "gantt-slot-editor-flow-output",
        "gantt-slot-editor-route-sequence-step",
        "gantt-slot-editor-actions",
      ];
      const presentTargets = [...(context?.querySelectorAll("[data-visual-qa-target]") || [])]
        .map((element) => element.dataset.visualQaTarget || "")
        .filter(Boolean);
      const missingTargets = requiredTargets.filter((target) => !presentTargets.includes(target));
      const hitTestProblems = requiredTargets
        .map((target) => {
          const element = context?.querySelector(`[data-visual-qa-target="${CSS.escape(target)}"]`);
          if (!element) return null;
          element.scrollIntoView({ block: "center", inline: "nearest" });
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return { target, reason: "zero-geometry" };
          const point = document.elementFromPoint(
            Math.min(window.innerWidth - 1, Math.max(1, rect.left + rect.width / 2)),
            Math.min(window.innerHeight - 1, Math.max(1, rect.top + rect.height / 2)),
          );
          const selected = point?.closest?.("[data-visual-qa-target]")?.dataset?.visualQaTarget || "";
          return selected === target ? null : { target, selected, reason: "parent-or-neighbor-selected" };
        })
        .filter(Boolean);
      return {
        hasContext: Boolean(context),
        contextTarget: context?.dataset.visualQaTarget || "",
        presentTargets,
        missingTargets,
        hitTestProblems,
      };
    });
    assert(slotEditorQaReport.hasContext, "gantt: slot editor context Visual QA root is missing");
    assert(slotEditorQaReport.missingTargets.length === 0, `gantt: slot editor context lacks nested Visual QA targets: ${JSON.stringify(slotEditorQaReport)}`);
    assert(slotEditorQaReport.hitTestProblems.length === 0, `gantt: slot editor nested QA hit-test falls back to parent block: ${JSON.stringify(slotEditorQaReport.hitTestProblems)}`);
  }
  if (moduleId === "visualSystem") {
    const visualSystemReport = await evaluate(client, () => {
      const page = document.querySelector(".visual-system-page");
      const panels = [...document.querySelectorAll(".visual-system-panel")];
      const ganttPanel = document.querySelector(".visual-gantt-system-panel");
      const ganttModeColumns = [...document.querySelectorAll(".visual-gantt-mode-column")];
      const ganttBars = [...document.querySelectorAll(".visual-gantt-bar, .visual-gantt-transfer-stack, .visual-gantt-segmented")];
      const factScenarios = [...document.querySelectorAll(".visual-gantt-bar.is-fact-scenario")];
      const transferFlows = [...document.querySelectorAll(".visual-gantt-transfer-stack, .visual-gantt-transfer-flow")];
      const selectedRowOptions = [...document.querySelectorAll("[data-visual-qa-target='visual-selected-row-option']")];
      const selectedRowActiveSamples = selectedRowOptions
        .map((option) => option.querySelector("tr.is-active"))
        .filter(Boolean);
      const ganttSampleEscapes = ganttModeColumns.flatMap((column, columnIndex) => {
        const columnRect = column.getBoundingClientRect();
        const samples = [...column.querySelectorAll([
          ".visual-gantt-bar",
          ".visual-gantt-transfer-stack",
          ".visual-gantt-segmented",
          ".visual-gantt-dependency",
          ".visual-gantt-transfer-flow",
        ].join(","))];
        return samples.map((sample) => {
          const rect = sample.getBoundingClientRect();
          const escapes = rect.left < columnRect.left - 1 || rect.right > columnRect.right + 1 || rect.width <= 0 || rect.height <= 0;
          return escapes
            ? {
              columnIndex,
              className: sample.className || sample.tagName,
              left: Math.round(rect.left - columnRect.left),
              right: Math.round(rect.right - columnRect.left),
              width: Math.round(rect.width),
              columnWidth: Math.round(columnRect.width),
            }
            : null;
        }).filter(Boolean);
      }).slice(0, 8);
      return {
        hasPage: Boolean(page),
        runtime: page?.dataset.uiRuntime || "",
        component: page?.dataset.uiComponent || "",
        panelCount: panels.length,
        hasGanttPanel: Boolean(ganttPanel),
        ganttModeColumnCount: ganttModeColumns.length,
        ganttBarCount: ganttBars.length,
        factScenarioCount: factScenarios.length,
        transferFlowCount: transferFlows.length,
        selectedRowOptionCount: selectedRowOptions.length,
        selectedRowActiveSampleCount: selectedRowActiveSamples.length,
        ganttSampleEscapes,
        ganttPanelText: (ganttPanel?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240),
        text: (page?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240),
        pageOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      };
    });
    assert(visualSystemReport.hasPage, "visualSystem: VisualSystemRuntime page is missing");
    assert(visualSystemReport.runtime === "visual-system-v1", `visualSystem: expected data-ui-runtime=visual-system-v1, got "${visualSystemReport.runtime}"`);
    assert(visualSystemReport.component === "VisualSystemRuntime", `visualSystem: expected VisualSystemRuntime component, got "${visualSystemReport.component}"`);
    assert(visualSystemReport.panelCount >= 8, `visualSystem: expected visual system panels, got ${visualSystemReport.panelCount}`);
    assert(visualSystemReport.hasGanttPanel, "visualSystem: Gantt Design System panel is missing");
    assert(visualSystemReport.ganttPanelText.includes("Gantt Design System"), "visualSystem: Gantt Design System text is missing");
    assert(visualSystemReport.ganttModeColumnCount === 3, `visualSystem: expected three Gantt scale columns, got ${visualSystemReport.ganttModeColumnCount}`);
    assert(visualSystemReport.ganttBarCount >= 12, `visualSystem: expected Gantt visual samples, got ${visualSystemReport.ganttBarCount}`);
    assert(visualSystemReport.factScenarioCount >= 12, `visualSystem: expected fact scenarios, got ${visualSystemReport.factScenarioCount}`);
    assert(visualSystemReport.transferFlowCount >= 2, `visualSystem: expected transfer flow samples, got ${visualSystemReport.transferFlowCount}`);
    assert(visualSystemReport.selectedRowOptionCount === 12, `visualSystem: expected twelve selected row variants, got ${visualSystemReport.selectedRowOptionCount}`);
    assert(visualSystemReport.selectedRowActiveSampleCount === 12, `visualSystem: every selected row variant must have an active row sample: ${JSON.stringify(visualSystemReport)}`);
    assert(visualSystemReport.ganttSampleEscapes.length === 0, `visualSystem: Gantt samples escape their mode columns: ${JSON.stringify(visualSystemReport.ganttSampleEscapes)}`);
    assert(visualSystemReport.pageOverflowX <= 2, `visualSystem: page horizontal overflow ${visualSystemReport.pageOverflowX}px`);
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
      const qaButton = document.querySelector("[data-toggle-visual-qa]");
      const roleLine = document.querySelector("[data-visual-qa-target='app-auth-session-role']");
      const departmentLine = document.querySelector("[data-visual-qa-target='app-auth-session-department']");
      const authSummaryRect = authSummary?.getBoundingClientRect();
      const qaButtonRect = qaButton?.getBoundingClientRect();
      const authSummaryTopbar = authSummary && qaButton && authSummaryRect && qaButtonRect
        ? {
          summaryLeft: Math.round(authSummaryRect.left),
          summaryRight: Math.round(authSummaryRect.right),
          qaRight: Math.round(qaButtonRect.right),
          viewportRight: Math.round(window.innerWidth),
          roleWeight: Number.parseFloat(getComputedStyle(roleLine).fontWeight || "0"),
          departmentWeight: Number.parseFloat(getComputedStyle(departmentLine).fontWeight || "0"),
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
    assert(authSessionReport.missingTargets.length === 0, `authSessionPrototype: missing nested Visual QA targets: ${JSON.stringify(authSessionReport.missingTargets)}`);
    if (authSessionReport.hasTaskUi) {
      assert(authSessionReport.nestedCoverageCount >= 45, `authSessionPrototype: expected broad nested Visual QA coverage, got ${authSessionReport.nestedCoverageCount}`);
      assert(authSessionReport.factGridOverflowX <= 2, `authSessionPrototype: fact input grid overflows horizontally by ${authSessionReport.factGridOverflowX}px`);
      assert(
        authSessionReport.factCardRects.length === 3 && authSessionReport.factCardRects.every((card) => card.width >= 140 && !card.nestedOverflow),
        `authSessionPrototype: fact cards are too narrow or overflowing: ${JSON.stringify(authSessionReport.factCardRects)}`,
      );
      assert(
        authSessionReport.authSummaryTopbar
          && authSessionReport.authSummaryTopbar.summaryLeft > authSessionReport.authSummaryTopbar.qaRight
          && authSessionReport.authSummaryTopbar.viewportRight - authSessionReport.authSummaryTopbar.summaryRight <= 180
          && authSessionReport.authSummaryTopbar.roleWeight <= 450
          && authSessionReport.authSummaryTopbar.departmentWeight <= 450,
        `authSessionPrototype: topbar auth summary must sit at the right and use regular metadata text: ${JSON.stringify(authSessionReport.authSummaryTopbar)}`,
      );
    }
    if (authSessionReport.taskCardCount > 0) {
      assert(authSessionReport.cardRouteProblems.length === 0, `authSessionPrototype: task cards must contain compact route transfer text: ${JSON.stringify(authSessionReport.cardRouteProblems)}`);
    }
  }
  if (moduleId !== "shiftWorkOrders") return;
  const journalSeedReport = await evaluate(client, () => (
    window.__mesVisualQaRuntime?.seedShiftWorkOrderJournalAssignmentForQa?.()
    || { seeded: false, reason: "runtime api missing" }
  ));
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
    const visibleStartDots = [...operationStartDots, ...childStartDots]
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
	    const detailSznButtons = detailPanel ? [...detailPanel.querySelectorAll("[data-shift-work-order-print-preview]")] : [];
	    const detailPackageButtons = detailPanel ? [...detailPanel.querySelectorAll("[data-work-order-print-preview]")] : [];
	    const detailState = detailPanel?.querySelector("[data-visual-qa-target='shift-work-orders-detail-state']");
	    const detailSummary = detailPanel?.querySelector("[data-visual-qa-target='shift-work-orders-detail-summary']");
	    const detailVolume = detailPanel?.querySelector("[data-visual-qa-target='shift-work-orders-detail-volume']");
	    const detailTransfer = detailPanel?.querySelector("[data-visual-qa-target='shift-work-orders-transfer']");
	    const detailExecutors = detailPanel?.querySelector("[data-visual-qa-target='shift-work-orders-executors']");
	    const legacyDetailStrips = detailPanel ? [...detailPanel.querySelectorAll("[data-visual-qa-target='shift-work-orders-quantity-strip'], [data-visual-qa-target='shift-work-orders-fact-strip']")] : [];
	    const neutralDetailSurfaces = detailPanel ? [
	      detailState,
	      detailVolume,
	      ...[...(detailSummary?.querySelectorAll("article") || [])],
	      ...[...(detailTransfer?.querySelectorAll("article") || [])],
	      ...[...(detailExecutors?.querySelectorAll("article") || [])],
	    ].filter(Boolean) : [];
	    const neutralDetailBackgrounds = neutralDetailSurfaces.map((element) => window.getComputedStyle(element).backgroundColor || "");
	    const currentRouteCard = detailTransfer?.querySelector("article.is-current") || null;
	    const tableTitle = [...document.querySelectorAll(".shift-work-orders-table-panel [data-ui-component='PanelHead'] strong, .shift-work-orders-table-panel .ui-panel-title, .shift-work-orders-table-panel h2")]
	      .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
	      .find(Boolean) || "";
	    const pageStyle = page ? window.getComputedStyle(page) : null;
    return {
      hasPage: Boolean(page),
      internalSidebarCount: page?.querySelectorAll(".module-data-sidebar, .directory-sidebar").length || 0,
      gridTemplateColumns: pageStyle?.gridTemplateColumns || "",
      panelCount: panels.length,
      panelWithoutBodyCount: panelWithoutBody.length,
      tableScrollContract: tableWrap?.dataset.scrollContract || "",
      contentOverflowY: content ? window.getComputedStyle(content).overflowY : "",
      pageOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      treeParentCount: treeParents.length,
      treeOperationCount: treeOperations.length,
      treeChildCount: treeChildren.length,
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
	      detailStateCount: detailState ? 1 : 0,
	      detailStateText: (detailState?.textContent || "").replace(/\s+/g, " ").trim(),
	      detailSummaryCardCount: detailSummary?.querySelectorAll("article").length || 0,
	      detailVolumeCount: detailVolume ? 1 : 0,
	      detailVolumeMetricCount: detailVolume?.querySelectorAll(".shift-work-orders-detail-volume-grid article").length || 0,
	      detailVolumeHasProgress: Boolean(detailVolume?.querySelector(".shift-work-orders-detail-progress")),
	      legacyDetailStripCount: legacyDetailStrips.length,
	      detailTransferCardCount: detailTransfer?.querySelectorAll("article").length || 0,
	      neutralDetailBackgroundCount: new Set(neutralDetailBackgrounds).size,
	      neutralDetailBackgrounds: [...new Set(neutralDetailBackgrounds)].slice(0, 6),
	      currentRouteCardText: (currentRouteCard?.textContent || "").replace(/\s+/g, " ").trim(),
	      detailExecutorSectionCount: detailExecutors ? 1 : 0,
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
  assert(!/\s/.test(report.gridTemplateColumns.trim()), `shiftWorkOrders: page must use one workspace column, got "${report.gridTemplateColumns}"`);
  assert(report.panelCount >= 2, `shiftWorkOrders: expected table and detail panels, got ${report.panelCount}`);
  assert(report.panelWithoutBodyCount === 0, `shiftWorkOrders: panels without direct PanelBody: ${report.panelWithoutBodyCount}`);
  assert(report.tableScrollContract === "horizontal-only", `shiftWorkOrders: table wrap must use horizontal-only contract, got "${report.tableScrollContract}"`);
  assert(["auto", "visible"].includes(report.contentOverflowY), `shiftWorkOrders: unexpected content overflow-y "${report.contentOverflowY}"`);
  assert(report.pageOverflowX <= 2, `shiftWorkOrders: page horizontal overflow ${report.pageOverflowX}px`);
  assert(report.treeParentCount > 0, `shiftWorkOrders: document tree parent rows are missing: ${JSON.stringify(report)}`);
  assert(report.treeOperationCount > 0, `shiftWorkOrders: document tree operation aggregation rows are missing: ${JSON.stringify(report)}`);
  assert(report.treeChildCount > 0, `shiftWorkOrders: document tree child rows are missing: ${JSON.stringify(report)}`);
  assert(!/rgba?\(238, 242, 246/.test(report.parentRowBackground), `shiftWorkOrders: parent grouping rows must not use hierarchy darkening backgrounds: ${JSON.stringify(report)}`);
  assert(!/rgba?\(248, 250, 252/.test(report.operationRowBackground), `shiftWorkOrders: operation grouping rows must not use hierarchy darkening backgrounds: ${JSON.stringify(report)}`);
  assert(report.parentRowCursor === "default", `shiftWorkOrders: parent grouping rows must not look clickable: ${JSON.stringify(report)}`);
  assert(report.operationRowCursor === "default", `shiftWorkOrders: operation grouping rows must not look clickable: ${JSON.stringify(report)}`);
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
  assert(report.treeObjectLevelGapParentToOperation >= 32, `shiftWorkOrders: operation level must be strongly indented from parent level: ${JSON.stringify(report)}`);
  assert(report.treeObjectLevelGapOperationToChild >= 32, `shiftWorkOrders: child SZN level must be strongly indented from operation level: ${JSON.stringify(report)}`);
  assert(report.plannedChildStatusCount === 0, `shiftWorkOrders: pure planned shift rows must stay out of the journal tree: ${JSON.stringify(report)}`);
  assert(report.assignedChildStatusCount > 0, `shiftWorkOrders: distributed shift tasks must be visible in the journal tree: ${JSON.stringify(report)}`);
  assert(report.assignedStageLabelCount > 0, `shiftWorkOrders: distributed rows must be labeled as shift tasks before issued SZN: ${JSON.stringify(report)}`);
  assert(report.parentStartDotVisibleCount === 0, `shiftWorkOrders: top-level package rows must not render tree start dots: ${JSON.stringify(report)}`);
  assert(report.operationStartDotVisibleCount === report.treeOperationCount, `shiftWorkOrders: operation tree rows must render start dots at branch joins: ${JSON.stringify(report)}`);
  assert(report.childStartDotVisibleCount === report.treeChildCount, `shiftWorkOrders: child SZN tree rows must render start dots at branch joins: ${JSON.stringify(report)}`);
  assert(report.startDotDimensionCount === 1, `shiftWorkOrders: tree start dots must use one normalized size: ${JSON.stringify(report)}`);
  assert(report.startDotNeutralColorCount === report.operationStartDotVisibleCount + report.childStartDotVisibleCount, `shiftWorkOrders: tree start dots must use neutral gray, with black only for the active row: ${JSON.stringify(report)}`);
  assert(report.startDotHaloCount === 0, `shiftWorkOrders: tree start dots must not mask connector lines with a white halo: ${JSON.stringify(report)}`);
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
  assert(/Дерево документов/.test(report.tableTitle), `shiftWorkOrders: table panel must be the document tree, got "${report.tableTitle}"`);
  assert(report.detailStateCount === 1, `shiftWorkOrders: selected document card must expose one unified document state block: ${JSON.stringify(report)}`);
  assert(/Состояние документа/.test(report.detailStateText), `shiftWorkOrders: document state block must be explicit: ${JSON.stringify(report)}`);
  assert(report.detailSummaryCardCount === 3, `shiftWorkOrders: selected document card passport must expose order, operation and master cards: ${JSON.stringify(report)}`);
  assert(report.legacyDetailStripCount === 0, `shiftWorkOrders: selected document card must not keep old separate quantity/fact strips: ${JSON.stringify(report)}`);
  assert(report.detailVolumeCount === 1, `shiftWorkOrders: selected document card must expose one unified volume block: ${JSON.stringify(report)}`);
  assert(report.detailVolumeMetricCount === 5, `shiftWorkOrders: selected document volume block must expose assigned, fact, remaining, defect and report metrics: ${JSON.stringify(report)}`);
  assert(report.detailVolumeHasProgress, `shiftWorkOrders: selected document volume block must show assigned/fact progress: ${JSON.stringify(report)}`);
  assert(report.detailTransferCardCount === 3, `shiftWorkOrders: selected document card must expose transfer route cards: ${JSON.stringify(report)}`);
  assert(report.neutralDetailBackgroundCount === 1, `shiftWorkOrders: neutral document cards must share one background; color should only encode explicit status tokens/problems: ${JSON.stringify(report)}`);
  assert(/текущий шаг/.test(report.currentRouteCardText), `shiftWorkOrders: current route step must be labeled by text, not by a unique background color: ${JSON.stringify(report)}`);
  assert(report.detailExecutorSectionCount === 1, `shiftWorkOrders: selected document card must expose executors section: ${JSON.stringify(report)}`);
  assert(report.reportHeaderCount === 0, `shiftWorkOrders: Report must not be a separate tree-table column: ${JSON.stringify(report)}`);
  assert(report.reportCellCount === 0, `shiftWorkOrders: tree rows must not render separate Report cells: ${JSON.stringify(report)}`);
  assert(report.reportBadgeCount === 0, `shiftWorkOrders: Report badges must live in the selected document card/photos, not in the tree table: ${JSON.stringify(report)}`);
  assert(report.issuePanelCount === 1, `shiftWorkOrders: selected SZN detail must expose issue reports panel: ${JSON.stringify(report)}`);

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
    const workflowPresetKey = "mes-planning-prototype-workflow-preset-v1";
    const preset = JSON.parse(localStorage.getItem(workflowPresetKey) || "{}");
    if (!localStorage.getItem(planningStorageKey) && preset?.values?.[planningStorageKey]) {
      localStorage.setItem(planningStorageKey, preset.values[planningStorageKey]);
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
    return window.__mesVisualQaRuntime?.setShiftWorkOrderIssueReportsForQa?.(ui.shiftWorkOrderIssueReports || {}) || { applied: false, reason: "runtime api missing" };
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
      report.factCards.every((card) => card.rect?.width >= 260 && card.rect?.height >= 100 && !card.nestedOverflow),
      `authSessionPrototype: ${AUTH_SESSION_TABLET_VIEWPORT.name} fact cards are not tablet-ready: ${JSON.stringify(report.factCards)}`
    );
    assert(
      report.keypadButtons.length >= 11 && report.keypadButtons.every((button) => button.width >= 84 && button.height >= 84),
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
      source: `
        sessionStorage.setItem('mes-planning-prototype-shared-disabled-until-v1', String(Date.now() + 60 * 60 * 1000));
        try {
          const key = 'mes-planning-prototype-ui-v1';
          const ui = JSON.parse(localStorage.getItem(key) || '{}');
          ui.visualQaEnabled = true;
          localStorage.setItem(key, JSON.stringify(ui));
        } catch {}
      `,
    });
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: SMOKE_VIEWPORT.width,
      height: SMOKE_VIEWPORT.height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    for (const moduleId of SMOKE_MODULE_IDS) {
      if (verbose) console.log(`[module-smoke] opening ${moduleId}`);
      const loaded = waitForCdpEvent(client, "Page.loadEventFired", 10000);
      await client.send("Page.navigate", { url: makeModuleUrl(baseUrl, moduleId) });
      await loaded;
      await delay(250);
      await waitForModule(client, moduleId);
      await runVisualQaPickerSmoke(client, moduleId);
      await runInteractionStabilityChecks(client, moduleId);
      await runFocusModeTopbarStabilityCheck(client, moduleId);
      await runModuleSpecificSmokeChecks(client, moduleId);
      if (moduleId === "authSessionPrototype") {
        await runAuthSessionTabletLayoutCheck(client, baseUrl);
      }
      passed.push(moduleId);
    }

    for (const alias of LEGACY_MODULE_ALIASES) {
      if (verbose) console.log(`[module-smoke] opening alias ${alias.source}->${alias.target}`);
      const loaded = waitForCdpEvent(client, "Page.loadEventFired", 10000);
      await client.send("Page.navigate", { url: makeModuleUrl(baseUrl, alias.source) });
      await loaded;
      await delay(250);
      await waitForModule(client, alias.target);
      await runVisualQaPickerSmoke(client, alias.target);
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
    assert(!consoleProblems.length, `Console problems during module smoke:\n${consoleProblems.map((item) => `${item.type}: ${item.args}`).join("\n")}`);

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
