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
      return {
        hasShell: Boolean(shell),
        layoutPage: shell?.dataset.layoutPage || "",
        title: (document.querySelector(".app-topbar-title h1")?.textContent || "").trim(),
        annotationGroup: (document.querySelector(".app-module-annotation strong")?.textContent || "").trim(),
        annotation: (document.querySelector(".app-module-annotation span")?.textContent || "").trim(),
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
    const runtimeReport = await evaluate(client, () => {
      const page = document.querySelector(".module-data-page");
      const workspace = page?.querySelector(".module-data-workspace");
      const content = page?.querySelector(".module-data-content");
      const pageRect = page?.getBoundingClientRect();
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
        panelEscapes,
        panelWithoutBody,
        unmarkedPanels,
        unmarkedButtons,
        unmarkedFormFields,
        unmarkedTableWraps,
        tableWrapProblems,
        contentOverlaps: contentOverlaps.slice(0, 6),
        panelBodyOverlaps,
      };
    });
    assert(runtimeReport.hasPage, `${moduleId}: hard UI page root is missing`);
    assert(runtimeReport.runtime === "hard-v1", `${moduleId}: expected data-ui-runtime=hard-v1, got "${runtimeReport.runtime}"`);
    assert(runtimeReport.component === "ModulePage", `${moduleId}: expected ModulePage component, got "${runtimeReport.component}"`);
    assert(runtimeReport.hasWorkspace && runtimeReport.workspaceComponent === "ModuleWorkspace", `${moduleId}: ModuleWorkspace contract is missing`);
    assert(runtimeReport.hasContent && runtimeReport.contentComponent === "ModuleContent", `${moduleId}: ModuleContent contract is missing`);
    assert(runtimeReport.pageOverflowX <= 2, `${moduleId}: page horizontal overflow ${runtimeReport.pageOverflowX}px`);
    assert(runtimeReport.pageWidth > 320, `${moduleId}: hard UI page width looks broken: ${runtimeReport.pageWidth}px`);
    assert(runtimeReport.panelWithoutBody.length === 0, `${moduleId}: hard Panel without direct PanelBody: ${JSON.stringify(runtimeReport.panelWithoutBody)}`);
    assert(runtimeReport.unmarkedPanels.length === 0, `${moduleId}: visible panel without Panel marker: ${JSON.stringify(runtimeReport.unmarkedPanels)}`);
    assert(runtimeReport.unmarkedButtons.length === 0, `${moduleId}: visible button without UI component marker: ${JSON.stringify(runtimeReport.unmarkedButtons)}`);
    assert(runtimeReport.unmarkedFormFields.length === 0, `${moduleId}: visible form field without FormField marker: ${JSON.stringify(runtimeReport.unmarkedFormFields)}`);
    assert(runtimeReport.unmarkedTableWraps.length === 0, `${moduleId}: visible table wrapper without TableWrap marker: ${JSON.stringify(runtimeReport.unmarkedTableWraps)}`);
    assert(runtimeReport.tableWrapProblems.length === 0, `${moduleId}: horizontal-only TableWrap has vertical scroll contract drift: ${JSON.stringify(runtimeReport.tableWrapProblems)}`);
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
          && badgeReport.borderColor.includes("255, 255, 255")
          && Number.parseFloat(badgeReport.borderWidth || "0") >= 2,
        `shiftMasterBoard: sidebar badge should look like a macOS notification badge: ${JSON.stringify(badgeReport)}`
      );
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
    const drawerReport = await evaluate(client, () => {
      const drawer = document.querySelector(".slot-drawer[data-ui-component='Drawer'], .detail-drawer[data-ui-component='Drawer']");
      const modal = document.querySelector(".modal, [role='dialog']");
      const drawerRect = drawer?.getBoundingClientRect();
      return {
        hasDrawer: Boolean(drawer),
        drawerComponent: drawer?.dataset.uiComponent || "",
        drawerWidth: Math.round(drawerRect?.width || 0),
        drawerHeight: Math.round(drawerRect?.height || 0),
        hasModal: Boolean(modal),
      };
    });
    assert(drawerReport.hasDrawer && drawerReport.drawerComponent === "Drawer", "gantt: selected slot Drawer contract is missing after opening slot");
    assert(drawerReport.drawerWidth > 240 && drawerReport.drawerHeight > 240, `gantt: selected slot Drawer geometry looks broken ${drawerReport.drawerWidth}x${drawerReport.drawerHeight}`);
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
    assert(visualSystemReport.ganttSampleEscapes.length === 0, `visualSystem: Gantt samples escape their mode columns: ${JSON.stringify(visualSystemReport.ganttSampleEscapes)}`);
    assert(visualSystemReport.pageOverflowX <= 2, `visualSystem: page horizontal overflow ${visualSystemReport.pageOverflowX}px`);
  }
  if (moduleId !== "shiftWorkOrders") return;
  const report = await evaluate(client, () => {
    const page = document.querySelector(".shift-work-orders-page");
    const panels = [...document.querySelectorAll(".shift-work-orders-panel")];
    const panelWithoutBody = panels.filter((panel) => (
      ![...panel.children].some((child) => child.classList?.contains("ui-panel-body"))
    ));
    const tableWrap = document.querySelector(".shift-work-orders-table-wrap");
    const content = document.querySelector(".shift-work-orders-content");
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
    };
  });
  assert(report.hasPage, "shiftWorkOrders: page root is missing");
  assert(report.internalSidebarCount === 0, `shiftWorkOrders: should not render an internal sidebar, got ${report.internalSidebarCount}`);
  assert(!/\s/.test(report.gridTemplateColumns.trim()), `shiftWorkOrders: page must use one workspace column, got "${report.gridTemplateColumns}"`);
  assert(report.panelCount >= 3, `shiftWorkOrders: expected overview, table and detail panels, got ${report.panelCount}`);
  assert(report.panelWithoutBodyCount === 0, `shiftWorkOrders: panels without direct PanelBody: ${report.panelWithoutBodyCount}`);
  assert(report.tableScrollContract === "horizontal-only", `shiftWorkOrders: table wrap must use horizontal-only contract, got "${report.tableScrollContract}"`);
  assert(["auto", "visible"].includes(report.contentOverflowY), `shiftWorkOrders: unexpected content overflow-y "${report.contentOverflowY}"`);
  assert(report.pageOverflowX <= 2, `shiftWorkOrders: page horizontal overflow ${report.pageOverflowX}px`);

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
      await runInteractionStabilityChecks(client, moduleId);
      await runModuleSpecificSmokeChecks(client, moduleId);
      passed.push(moduleId);
    }

    for (const alias of LEGACY_MODULE_ALIASES) {
      if (verbose) console.log(`[module-smoke] opening alias ${alias.source}->${alias.target}`);
      const loaded = waitForCdpEvent(client, "Page.loadEventFired", 10000);
      await client.send("Page.navigate", { url: makeModuleUrl(baseUrl, alias.source) });
      await loaded;
      await delay(250);
      await waitForModule(client, alias.target);
      await runInteractionStabilityChecks(client, alias.target);
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
