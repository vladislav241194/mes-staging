import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { HARD_UI_RUNTIME_MODULE_IDS, PARTIAL_UI_RUNTIME_MODULE_IDS, SPECIAL_UI_RUNTIME_MODULE_IDS } from "../src/ui_runtime_contracts.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultUrl = new URL("/", process.env.MES_QA_URL || "http://localhost:4174/").toString();
const defaultOutDir = join(projectRoot, "tmp", `design-qa-snapshots-${Date.now()}`);
const authStorageKey = "mes-planning-prototype-auth-session-v1";
const uiStorageKey = "mes-planning-prototype-ui-v1";
const viewports = [
  { name: "macbook-air-15", width: 1710, height: 1112, mobile: false },
];
const moduleIds = ["visualSystem", "gantt", "planning", "weeklyProductionControl", "planningTable", "shiftMasterBoard", "shiftWorkOrders", "authSessionPrototype", "dispatch", "routes", "products", "nomenclature", "employees", "productionStructureMatrix", "timesheet", "roles", "supply", "shopMap", "directories"];
const focusModuleIds = ["gantt", "planning", "weeklyProductionControl", "planningTable", "shiftMasterBoard", "shiftWorkOrders", "authSessionPrototype", "dispatch", "routes", "products", "nomenclature", "employees", "productionStructureMatrix", "timesheet", "roles", "supply", "shopMap", "directories"];
const authVisualModuleIds = ["authPrototype"];
const visualRuntimeModuleIds = [...moduleIds, ...authVisualModuleIds];
const expectedVisualRuntimeModuleIds = [...SPECIAL_UI_RUNTIME_MODULE_IDS, ...HARD_UI_RUNTIME_MODULE_IDS, ...PARTIAL_UI_RUNTIME_MODULE_IDS];
const missingVisualRuntimeModuleIds = expectedVisualRuntimeModuleIds.filter((moduleId) => !visualRuntimeModuleIds.includes(moduleId));
if (missingVisualRuntimeModuleIds.length) {
  throw new Error(`design-qa-snapshots is missing runtime modules: ${missingVisualRuntimeModuleIds.join(", ")}`);
}
const missingFocusRuntimeModuleIds = expectedVisualRuntimeModuleIds
  .filter((moduleId) => !["authPrototype", "visualSystem"].includes(moduleId))
  .filter((moduleId) => !focusModuleIds.includes(moduleId));
if (missingFocusRuntimeModuleIds.length) {
  throw new Error(`design-qa-snapshots focus mode is missing runtime modules: ${missingFocusRuntimeModuleIds.join(", ")}`);
}
const authVisualStates = [
  {
    id: "authPrototype-departments",
    description: "Авторизация: выбор отдела",
    step: "departments",
  },
  {
    id: "authPrototype-units",
    description: "Авторизация: выбор участка",
    step: "units",
  },
  {
    id: "authPrototype-people",
    description: "Авторизация: выбор сотрудника",
    step: "people",
  },
  {
    id: "authPrototype-pin",
    description: "Авторизация: ввод PIN",
    step: "pin",
  },
];
const interactionStates = [
  {
    id: "gantt-slot-editor-open",
    moduleId: "gantt",
    description: "Планирование: открыта карточка операции по двойному нажатию на слот",
  },
  {
    id: "directories-filter-open",
    moduleId: "directories",
    description: "Справочники: открыт Excel-like фильтр колонки",
  },
  {
    id: "routes-labor-open",
    moduleId: "routes",
    description: "Маршрутная карта: раскрыта трудоемкость операции",
  },
  {
    id: "routes-print-preview-open",
    moduleId: "routes",
    description: "Маршрутная карта: открыта печатная форма",
  },
  {
    id: "timesheet-editor-open",
    moduleId: "timesheet",
    description: "Табель: открыта модалка редактирования дня",
  },
  {
    id: "shift-master-sheet-open",
    moduleId: "shiftMasterBoard",
    description: "Мастерская: открыт предпросмотр сменного листа",
  },
  {
    id: "production-structure-master-manual-open",
    moduleId: "productionStructureMatrix",
    description: "Права: матрица мастера раскрыта в ручном режиме",
  },
];
const modulePageAliases = {};
const hardUiRuntimeModules = new Set(HARD_UI_RUNTIME_MODULE_IDS);

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

function isExpectedModulePage(moduleId, activeModule) {
  return (modulePageAliases[moduleId] || [moduleId]).includes(activeModule);
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

async function waitForJson(url, timeoutMs = 10000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await delay(120);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
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
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result || {});
      return;
    }
    if (message.method && this.listeners.has(message.method)) {
      for (const listener of this.listeners.get(message.method)) listener(message.params || {});
    }
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  waitForEvent(method, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        const listeners = this.listeners.get(method) || [];
        this.listeners.set(method, listeners.filter((listener) => listener !== onEvent));
      };
      const onEvent = (params) => {
        cleanup();
        resolve(params);
      };
      const listeners = this.listeners.get(method) || [];
      listeners.push(onEvent);
      this.listeners.set(method, listeners);
    });
  }

  close() {
    this.socket.close();
  }
}

async function launchChrome() {
  const chromePath = await findChrome();
  const port = await getFreePort();
  const profileDir = await mkdtemp(join(tmpdir(), "mes-design-qa-"));
  const args = [
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
  ];
  const child = spawn(chromePath, args, { stdio: "ignore" });
  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const target = await requestJson(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    const client = new CdpClient(target.webSocketDebuggerUrl || version.webSocketDebuggerUrl);
    return { child, client, profileDir };
  } catch (error) {
    child.kill("SIGTERM");
    await rm(profileDir, { recursive: true, force: true });
    throw error;
  }
}

async function evaluate(client, pageFunction, arg) {
  const source = typeof pageFunction === "function" ? pageFunction.toString() : pageFunction;
  const expression = arg === undefined ? `(${source})()` : `(${source})(${JSON.stringify(arg)})`;
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

async function setViewport(client, viewport) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
}

async function navigate(client, url) {
  const targetUrl = new URL(url);
  targetUrl.searchParams.set("qa-auth-bypass", "1");
  const loaded = client.waitForEvent("Page.loadEventFired", 15000).catch(() => null);
  await client.send("Page.navigate", { url: targetUrl.toString() });
  await loaded;
  await waitForApp(client);
}

async function navigateAuthPrototype(client, url) {
  const targetUrl = new URL(url);
  targetUrl.searchParams.delete("qa-auth-bypass");
  targetUrl.searchParams.set("module", "gantt");
  targetUrl.searchParams.set("qa", "auth-visual");
  const loaded = client.waitForEvent("Page.loadEventFired", 15000).catch(() => null);
  await client.send("Page.navigate", { url: targetUrl.toString() });
  await loaded;
  await waitForApp(client);
  await evaluate(client, (payload) => {
    const { authKey, uiKey } = payload;
    localStorage.removeItem(authKey);
    sessionStorage.clear();
    const state = JSON.parse(localStorage.getItem(uiKey) || "{}");
    state.authGateUnlocked = false;
    state.authCurrentUserId = "";
    state.authPrototypeDepartment = "";
    state.authPrototypeUnit = "";
    state.authPrototypePersonId = "";
    state.authPrototypeSearch = "";
    state.authPrototypeResult = "";
    state.authPrototypeAttemptsLeft = 5;
    state.activeModule = "authPrototype";
    localStorage.setItem(uiKey, JSON.stringify(state));
  }, { authKey: authStorageKey, uiKey: uiStorageKey });
  const reloaded = client.waitForEvent("Page.loadEventFired", 15000).catch(() => null);
  await client.send("Page.reload");
  await reloaded;
  await waitForApp(client);
}

async function waitForApp(client) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12000) {
    const ok = await evaluate(client, () => Boolean(document.querySelector("main.app-shell")));
    if (ok) return;
    await delay(120);
  }
  throw new Error("App shell did not render.");
}

async function switchModule(client, moduleId) {
  const runtimeResult = await evaluate(client, (id) => {
    if (!window.__mesRuntime?.navigateToModule) return "";
    return window.__mesRuntime.navigateToModule(id);
  }, moduleId);
  if (runtimeResult) {
    await delay(520);
    await waitForApp(client);
    const activeAfterRuntime = await evaluate(client, () => document.querySelector("main.app-shell")?.dataset.layoutPage || "");
    if (activeAfterRuntime === moduleId) return;
  }

  const clickTarget = await evaluate(client, (id) => {
    const current = document.querySelector("main.app-shell")?.dataset.layoutPage || "";
    if (current === id) return { current: true };
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0;
    };
    const button = Array.from(document.querySelectorAll(`button[data-module="${id}"]`)).find(visible);
    if (!button) return null;
    button.scrollIntoView({ block: "center", inline: "center" });
    const rect = button.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  }, moduleId);
  if (clickTarget?.current) return;
  if (clickTarget) {
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: clickTarget.x, y: clickTarget.y });
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: clickTarget.x, y: clickTarget.y, button: "left", clickCount: 1 });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: clickTarget.x, y: clickTarget.y, button: "left", clickCount: 1 });
    await delay(520);
    const activeAfterClick = await evaluate(client, () => document.querySelector("main.app-shell")?.dataset.layoutPage || "");
    if (isExpectedModulePage(moduleId, activeAfterClick)) return;
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const ok = await evaluate(client, (payload) => {
      const { id, storageKey } = payload;
      const current = document.querySelector("main.app-shell")?.dataset.layoutPage || "";
      if ((payload.aliases || [id]).includes(current)) return true;
      const state = JSON.parse(localStorage.getItem(storageKey) || "{}");
      state.activeRole = "admin";
      state.activeModule = id;
      localStorage.setItem(storageKey, JSON.stringify(state));
      window.location.reload();
      return true;
    }, { id: moduleId, storageKey: uiStorageKey, aliases: modulePageAliases[moduleId] || [moduleId] });
    if (!ok) throw new Error(`Cannot switch to module ${moduleId}`);
    await delay(650 + attempt * 250);
    await waitForApp(client);
    const activeModule = await evaluate(client, () => document.querySelector("main.app-shell")?.dataset.layoutPage || "");
    if (isExpectedModulePage(moduleId, activeModule)) return;
  }
  const activeModule = await evaluate(client, () => document.querySelector("main.app-shell")?.dataset.layoutPage || "");
  throw new Error(`Expected module ${moduleId}, got ${activeModule || "unknown"}`);
}

async function setFocusMode(client, enabled) {
  const runtimeResult = await evaluate(client, (value) => {
    if (!window.__mesRuntime?.setFocusMode) return null;
    return window.__mesRuntime.setFocusMode(Boolean(value));
  }, enabled);
  await delay(520);
  await waitForApp(client);
  const runtimeOk = await evaluate(client, () => ({
    classActive: Boolean(document.querySelector("main.app-shell")?.classList.contains("is-focus-mode")),
    runtimeActive: Boolean(window.__mesRuntime?.getFocusMode?.()),
  }));
  if (runtimeResult !== null && runtimeOk.classActive === Boolean(enabled) && runtimeOk.runtimeActive === Boolean(enabled)) return;

  await evaluate(client, (payload) => {
    const { storageKey, value } = payload;
    const state = JSON.parse(localStorage.getItem(storageKey) || "{}");
    state.focusMode = Boolean(value);
    localStorage.setItem(storageKey, JSON.stringify(state));
    window.location.reload();
    return true;
  }, { storageKey: uiStorageKey, value: enabled });
  await delay(650);
  await waitForApp(client);
}

async function auditVisualLayout(client, moduleId) {
  return evaluate(client, (id) => {
    const ignoredScrollRootSelector = [
      ".gantt-shell",
      ".supply-gantt-shell",
      ".supply-table-wrap",
      ".directory-table-wrap",
      ".nomenclature-table-wrap",
      ".route-object-table-wrap",
      ".speki-structure-table-wrap",
      ".visual-table-wrap",
      ".toolbar-actions",
      ".mobile-module-sheet",
      ".dense-inline-options",
      ".supply-detail-popover",
      ".production-flow-lane",
      "[data-layout='table']",
    ].join(",");
    const visible = (el) => {
      if (el.closest("details:not([open])")) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0.5 || rect.height <= 0.5) return false;
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0;
    };
    const selectorOf = (el) => {
      const cls = String(el.className || "").split(/\s+/).filter(Boolean).slice(0, 3).map((item) => `.${item}`).join("");
      const data = el.dataset?.layout ? `[data-layout="${el.dataset.layout}"]` : el.dataset?.module ? `[data-module="${el.dataset.module}"]` : "";
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls}${data}`;
    };
    const chainOf = (el) => {
      const chain = [];
      let current = el;
      while (current && current.nodeType === 1 && chain.length < 6) {
        chain.push(selectorOf(current));
        current = current.parentElement;
      }
      return chain.join(" > ");
    };
    const isAllowedScroll = (el) => {
      const root = el.closest(ignoredScrollRootSelector);
      return Boolean(root && (root.scrollWidth > root.clientWidth + 2 || root.scrollHeight > root.clientHeight + 2));
    };
    const outside = [];
    const tiny = [];
    const floating = [];
    const textOverflow = [];
    const insetIssues = [];
    const overlapIssues = [];
    const typographyWarnings = [];
    const legacySidebarItems = [];
    const unmarkedComponents = [];
    const root = document.querySelector("main.app-shell");
    const viewport = { width: innerWidth, height: innerHeight };

    for (const el of document.querySelectorAll("main.app-shell *")) {
      if (!visible(el) || isAllowedScroll(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.left < -1 || rect.right > viewport.width + 1 || rect.width > viewport.width + 1) {
        outside.push({
          selector: selectorOf(el),
          text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 90),
          rect: { x: Math.round(rect.x), right: Math.round(rect.right), width: Math.round(rect.width) },
        });
      }
      if (el.matches(".modal, .slot-drawer, .dense-inline-options, .supply-detail-popover, [popover]")
        && (rect.top < -1 || rect.bottom > viewport.height + 1 || rect.left < -1 || rect.right > viewport.width + 1)) {
        floating.push({ selector: selectorOf(el), rect: { x: Math.round(rect.x), y: Math.round(rect.y), right: Math.round(rect.right), bottom: Math.round(rect.bottom) } });
      }
    }

    for (const el of document.querySelectorAll('main.app-shell :is(button, input, select, textarea, summary, a[href], [role="button"])')) {
      if (!visible(el) || isAllowedScroll(el)) continue;
      const rect = el.getBoundingClientRect();
      const type = String(el.type || el.getAttribute("type") || "").toLowerCase();
      const min = viewport.width <= 768 ? 36 : 28;
      if (type === "hidden") continue;
      if ((type === "checkbox" || type === "radio") && rect.width >= 16 && rect.height >= 24) continue;
      if (el.closest("label") && el.closest("label").getBoundingClientRect().height >= min) continue;
      if (!el.disabled && (rect.width < min || rect.height < min)) {
        tiny.push({ selector: selectorOf(el), text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 70), width: Math.round(rect.width), height: Math.round(rect.height), min });
      }
    }

    for (const el of document.querySelectorAll("main.app-shell :is(h1,h2,h3,h4,p,small,strong,span,label,button,summary,th,td)")) {
      if (!visible(el) || isAllowedScroll(el)) continue;
      const text = el.textContent.trim().replace(/\s+/g, " ");
      if (text.length < 2) continue;
      if (el.closest(".is-loading")) continue;
      const style = getComputedStyle(el);
      if (style.textOverflow === "ellipsis" && !el.matches("button, summary, th")) continue;
      const overflows = el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2;
      const clips = ["hidden", "clip", "auto", "scroll"].includes(style.overflowX)
        || ["hidden", "clip", "auto", "scroll"].includes(style.overflowY)
        || style.whiteSpace === "nowrap";
      if (overflows && clips) {
        textOverflow.push({ selector: selectorOf(el), text: text.slice(0, 90), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
      }
    }

    const textProbeSelector = ":scope > :is(h1,h2,h3,h4,p,small,strong,span,label,button,summary,em,b), :scope > header :is(h1,h2,h3,h4,p,small,strong,span,label,button,summary,em,b), :scope > div > :is(h1,h2,h3,h4,p,small,strong,span,label,button,summary,em,b)";
    const insetContainerSelector = [
      ".module-panel",
      ".report-card",
      ".ui-panel-head",
      ".directory-header",
      ".module-preview-empty",
      ".ui-sidebar-item",
      ".directory-nav-item",
      ".planning-order-route-item",
      ".shift-master-board-card",
      ".shift-master-board-section",
      ".planning-table-block",
      ".planning-table-summary-card",
      ".visual-system-panel",
      ".employee-hierarchy-node",
      ".supply-status-card",
      ".dispatch-section-card",
    ].join(",");
    for (const el of document.querySelectorAll(`main.app-shell :is(${insetContainerSelector})`)) {
      if (!visible(el) || isAllowedScroll(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 34 || rect.height < 22) continue;
      const style = getComputedStyle(el);
      if (style.display === "contents") continue;
      const textEl = Array.from(el.querySelectorAll(textProbeSelector)).find((candidate) => visible(candidate) && candidate.textContent.trim().length > 1);
      if (!textEl) continue;
      const textRect = textEl.getBoundingClientRect();
      const minInset = el.matches(".ui-sidebar-item, .directory-nav-item, .planning-order-route-item, .employee-hierarchy-node, button") ? 4 : 6;
      const topInset = textRect.top - rect.top;
      const leftInset = textRect.left - rect.left;
      const rightInset = rect.right - textRect.right;
      const bottomInset = rect.bottom - textRect.bottom;
      if (topInset < minInset || leftInset < minInset || rightInset < 2 || bottomInset < 2) {
        insetIssues.push({
          selector: selectorOf(el),
          text: textEl.textContent.trim().replace(/\s+/g, " ").slice(0, 90),
          inset: {
            top: Math.round(topInset),
            left: Math.round(leftInset),
            right: Math.round(rightInset),
            bottom: Math.round(bottomInset),
          },
        });
      }
    }

    const overlapSelector = [
      ".module-panel",
      ".report-card",
      ".module-preview-empty",
      ".ui-sidebar-item",
      ".directory-nav-item",
      ".planning-order-route-item",
      ".shift-master-board-card",
      ".planning-table-block",
      ".planning-table-summary-card",
      ".visual-system-panel",
      ".employee-hierarchy-node",
      ".supply-status-card",
      ".dispatch-section-card",
      ".ui-status-token",
      ".primary-button",
      ".secondary-button",
      ".icon-button",
    ].join(",");
    const overlapParents = new Map();
    for (const el of document.querySelectorAll(`main.app-shell :is(${overlapSelector})`)) {
      if (!visible(el) || isAllowedScroll(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      const parent = el.parentElement;
      if (!parent || !visible(parent)) continue;
      if (!overlapParents.has(parent)) overlapParents.set(parent, []);
      overlapParents.get(parent).push({ el, rect });
    }
    for (const siblings of overlapParents.values()) {
      for (let leftIndex = 0; leftIndex < siblings.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < siblings.length; rightIndex += 1) {
          const left = siblings[leftIndex];
          const right = siblings[rightIndex];
          const xOverlap = Math.max(0, Math.min(left.rect.right, right.rect.right) - Math.max(left.rect.left, right.rect.left));
          const yOverlap = Math.max(0, Math.min(left.rect.bottom, right.rect.bottom) - Math.max(left.rect.top, right.rect.top));
          const area = xOverlap * yOverlap;
          if (area < 24) continue;
          const leftArea = left.rect.width * left.rect.height;
          const rightArea = right.rect.width * right.rect.height;
          const ratio = area / Math.min(leftArea, rightArea);
          if (ratio < 0.08) continue;
          const leftStyle = getComputedStyle(left.el);
          const rightStyle = getComputedStyle(right.el);
          if (["fixed", "sticky"].includes(leftStyle.position) || ["fixed", "sticky"].includes(rightStyle.position)) continue;
          overlapIssues.push({
            left: selectorOf(left.el),
            right: selectorOf(right.el),
            text: `${left.el.textContent.trim().replace(/\s+/g, " ").slice(0, 44)} / ${right.el.textContent.trim().replace(/\s+/g, " ").slice(0, 44)}`,
            overlap: { x: Math.round(xOverlap), y: Math.round(yOverlap), ratio: Number(ratio.toFixed(2)) },
          });
        }
      }
    }

    const skipTypographyAudit = root?.dataset.layoutPage === "visualSystem";
    for (const el of document.querySelectorAll("main.app-shell [data-layout='main-content'] :is(p,small,span,label,button,td,th,em,strong)")) {
      if (skipTypographyAudit) continue;
      if (!visible(el) || isAllowedScroll(el)) continue;
      if (el.closest("h1,h2,h3,h4,.ui-panel-head,.directory-header,.app-topbar,.module-data-sidebar,.directory-sidebar")) continue;
      const text = el.textContent.trim().replace(/\s+/g, " ");
      if (text.length < 3) continue;
      if (el.closest(".ui-status-token,.mes-signal,.speki-row-number,.ui-sidebar-item-badge,.ui-demo-corner-marker,.ui-demo-inline-marker")) continue;
      const style = getComputedStyle(el);
      const fontSize = Number.parseFloat(style.fontSize || "0");
      const fontWeight = Number.parseInt(style.fontWeight || "400", 10);
      if (fontSize > 16 || fontWeight >= 800) {
        typographyWarnings.push({
          selector: selectorOf(el),
          text: text.slice(0, 90),
          font: `${style.fontWeight} ${style.fontSize}/${style.lineHeight}`,
          chain: chainOf(el),
        });
      }
    }

    for (const el of document.querySelectorAll("main.app-shell :is(.module-data-sidebar, .directory-sidebar) .ui-sidebar-item")) {
      if (!visible(el)) continue;
      const hasDirectLegacyText = Boolean(el.querySelector(":scope > strong, :scope > small"));
      const hasTextContainer = Boolean(el.querySelector(":scope > .ui-sidebar-item-body, :scope > span, :scope > .ui-sidebar-title"));
      if (hasDirectLegacyText || !hasTextContainer) {
        legacySidebarItems.push({
          selector: selectorOf(el),
          text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 90),
          reason: hasDirectLegacyText ? "direct strong/small" : "missing text container",
        });
      }
    }

    const uiComponentSelector = [
      ".form-field",
      ".ui-form-field",
      "label:has(input)",
      "label:has(select)",
      "label:has(textarea)",
      "button",
      ".primary-button",
      ".secondary-button",
      ".icon-button",
      ".table-icon-button",
      "[data-layout='table']",
      ".module-panel",
      ".modal",
      ".ui-modal",
      ".slot-drawer",
      ".detail-drawer",
      ".dense-inline-select",
      ".directory-column-filter",
      ".mobile-module-switcher",
      ".operation-slot",
      ".ui-gantt-bar",
    ].join(",");
    for (const el of document.querySelectorAll(`main.app-shell :is(${uiComponentSelector})`)) {
      if (!visible(el) || isAllowedScroll(el)) continue;
      if (el.dataset.uiComponent) continue;
      unmarkedComponents.push({
        selector: selectorOf(el),
        text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 90),
        chain: chainOf(el),
      });
    }

    return {
      id,
      module: root?.dataset.layoutPage || "",
      focusModeActive: Boolean(root?.classList.contains("is-focus-mode")),
      viewport,
      docWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      pageOverflowX: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - viewport.width,
      outside: outside.slice(0, 12),
      tiny: tiny.slice(0, 12),
      floating: floating.slice(0, 12),
      textOverflow: textOverflow.slice(0, 12),
      insetIssues: insetIssues.slice(0, 12),
      overlapIssues: overlapIssues.slice(0, 12),
      typographyWarnings: typographyWarnings.slice(0, 12),
      legacySidebarItems: legacySidebarItems.slice(0, 12),
      unmarkedComponents: unmarkedComponents.slice(0, 12),
      counts: {
        outside: outside.length,
        tiny: tiny.length,
        floating: floating.length,
        textOverflow: textOverflow.length,
        insetIssues: insetIssues.length,
        overlapIssues: overlapIssues.length,
        typographyWarnings: typographyWarnings.length,
        legacySidebarItems: legacySidebarItems.length,
        unmarkedComponents: unmarkedComponents.length,
      },
    };
  }, moduleId);
}

async function saveScreenshot(client, outDir, viewportName, moduleId) {
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const filePath = join(outDir, viewportName, `${moduleId}.png`);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(result.data, "base64"));
  return filePath;
}

async function triggerFirstVisibleElement(client, selector, label, options = {}) {
  const ok = await evaluate(client, (payload) => {
    const elements = Array.from(document.querySelectorAll(payload.selector));
    const element = elements.find((item) => {
      const rect = item.getBoundingClientRect();
      const style = getComputedStyle(item);
      const disabled = item.disabled || item.getAttribute("aria-disabled") === "true";
      return !disabled
        && rect.width > 0
        && rect.height > 0
        && style.visibility !== "hidden"
        && style.display !== "none";
    });
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    if (payload.dblClick) {
      element.dispatchEvent(new MouseEvent("dblclick", eventInit));
    } else {
      element.dispatchEvent(new MouseEvent("click", eventInit));
      if (typeof element.click === "function") element.click();
    }
    return true;
  }, { selector, dblClick: Boolean(options.dblClick) });
  if (!ok) {
    if (options.optional) return false;
    throw new Error(`Cannot open interaction state: ${label}`);
  }
  await delay(options.delayMs || 420);
  await waitForApp(client);
  return true;
}

async function hasVisibleElement(client, selector) {
  return evaluate(client, (targetSelector) => {
    return Array.from(document.querySelectorAll(targetSelector)).some((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const disabled = element.disabled || element.getAttribute("aria-disabled") === "true";
      return !disabled
        && rect.width > 0
        && rect.height > 0
        && style.visibility !== "hidden"
        && style.display !== "none";
    });
  }, selector);
}

async function setupInteractionState(client, state) {
  if (state.id === "gantt-slot-editor-open") {
    await evaluate(client, () => {
      const expandButton = document.querySelector("[data-toggle-all-projects]");
      if (expandButton && expandButton.getAttribute("aria-pressed") !== "true") expandButton.click();
      return true;
    });
    await delay(520);
    await waitForApp(client);
    await triggerFirstVisibleElement(client, ".operation-slot:not(.aggregate-slot)", state.id, { dblClick: true, delayMs: 520 });
    return;
  }
  if (state.id === "directories-filter-open") {
    await triggerFirstVisibleElement(client, ".directory-column-filter > summary", state.id, { delayMs: 360 });
    return;
  }
  if (state.id === "routes-labor-open") {
    const ok = await evaluate(client, () => {
      const button = document.querySelector(".route-step-labor-toggle");
      if (!button) return false;
      button.scrollIntoView({ block: "center", inline: "nearest" });
      if (button.getAttribute("aria-expanded") !== "true") button.click();
      return true;
    });
    if (!ok) throw new Error("Cannot open route labor panel for visual QA.");
    await delay(360);
    await waitForApp(client);
    return;
  }
  if (state.id === "routes-print-preview-open") {
    await triggerFirstVisibleElement(client, "[data-route-print-preview]:not(:disabled)", state.id, { delayMs: 520 });
    return;
  }
  if (state.id === "timesheet-editor-open") {
    await triggerFirstVisibleElement(client, "[data-timesheet-day-button]", state.id, { delayMs: 520 });
    return;
  }
  if (state.id === "shift-master-sheet-open") {
    await triggerFirstVisibleElement(client, "[data-shift-board-print]", state.id, { delayMs: 560 });
    return;
  }
  if (state.id === "production-structure-master-manual-open") {
    const ok = await evaluate(client, () => {
      const field = document.querySelector("[data-shift-master-assignment-mode]");
      if (!field) return false;
      field.scrollIntoView({ block: "center", inline: "nearest" });
      field.value = "manual";
      field.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    });
    if (!ok) throw new Error("Cannot open shift master assignment matrix manual mode for visual QA.");
    await delay(620);
    await waitForApp(client);
    return;
  }
  throw new Error(`Unknown interaction state: ${state.id}`);
}

async function setupAuthVisualState(client, state) {
  if (state.step === "departments") return;
  await triggerFirstVisibleElement(client, "[data-auth-department]", state.id, { delayMs: 360 });
  if (state.step === "units") return;
  const hasDirectPeople = await hasVisibleElement(client, "[data-auth-person]");
  if (!hasDirectPeople) {
    await triggerFirstVisibleElement(client, "[data-auth-unit]", state.id, { delayMs: 360 });
  }
  if (state.step === "people") return;
  await triggerFirstVisibleElement(client, "[data-auth-person]", state.id, { delayMs: 360 });
  if (state.step === "pin") return;
  throw new Error(`Unknown auth visual state: ${state.id}`);
}

function renderMarkdownReport(report) {
  const lines = [
    "# MES Design QA Snapshots",
    "",
    `URL: ${report.url}`,
    `Generated: ${report.generatedAt}`,
    `Output: ${report.outDir}`,
    "",
  ];
  for (const viewport of report.viewports) {
    const failures = viewport.modules.filter((moduleItem) => moduleItem.failed);
    lines.push(`## ${viewport.viewport.name} (${viewport.viewport.width}x${viewport.viewport.height})`);
    lines.push("");
    lines.push(`Passed: ${viewport.modules.length - failures.length}/${viewport.modules.length}`);
    lines.push("");
    for (const moduleItem of viewport.modules) {
      lines.push(`- ${moduleItem.failed ? "FAIL" : "OK"} ${moduleItem.id}: overflowX=${moduleItem.pageOverflowX}, outside=${moduleItem.counts.outside}, tiny=${moduleItem.counts.tiny}, floating=${moduleItem.counts.floating}, text=${moduleItem.counts.textOverflow}, inset=${moduleItem.counts.insetIssues || 0}, overlap=${moduleItem.counts.overlapIssues || 0}, typography=${moduleItem.counts.typographyWarnings || 0}, legacySidebar=${moduleItem.counts.legacySidebarItems}, unmarked=${moduleItem.counts.unmarkedComponents || 0}`);
      if (moduleItem.screenshot) lines.push(`  - screenshot: ${moduleItem.screenshot}`);
      for (const issue of [...moduleItem.outside, ...moduleItem.tiny, ...moduleItem.floating, ...moduleItem.textOverflow, ...(moduleItem.insetIssues || []), ...(moduleItem.overlapIssues || []), ...moduleItem.legacySidebarItems, ...(moduleItem.unmarkedComponents || [])].slice(0, 3)) {
        lines.push(`  - ${issue.selector}: ${issue.text || JSON.stringify(issue.rect || {})}`);
      }
      if (moduleItem.typographyWarnings?.length) {
        moduleItem.typographyWarnings.slice(0, 3).forEach((issue) => {
          lines.push(`  - typography ${issue.selector}: ${issue.text} (${issue.font})`);
          lines.push(`    chain: ${issue.chain}`);
        });
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function hasBlockingVisualFailure(audit) {
  return audit.pageOverflowX > 1
    || audit.counts.outside > 0
    || audit.counts.tiny > 0
    || audit.counts.floating > 0
    || audit.counts.textOverflow > 0
    || audit.counts.insetIssues > 0
    || audit.counts.overlapIssues > 0
    || audit.counts.legacySidebarItems > 0
    || audit.counts.unmarkedComponents > 0
    || (hardUiRuntimeModules.has(audit.module) && audit.counts.typographyWarnings > 0);
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

async function main() {
  const url = getArg("--url", defaultUrl);
  const outDir = getArg("--out", defaultOutDir);
  const report = { url, outDir, generatedAt: new Date().toISOString(), viewports: [] };
  let hasFailure = false;
  await mkdir(outDir, { recursive: true });
  const chrome = await launchChrome();

  try {
    const { client } = chrome;
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    for (const viewport of viewports) {
      await setViewport(client, viewport);
      await navigate(client, url);
      const viewportReport = { viewport, modules: [] };
      for (const state of authVisualStates) {
        await navigateAuthPrototype(client, url);
        await setupAuthVisualState(client, state);
        const audit = await auditVisualLayout(client, state.id);
        audit.interactionState = state.description;
        audit.screenshot = await saveScreenshot(client, outDir, viewport.name, state.id).catch((error) => {
          audit.screenshotError = error.message;
          return "";
        });
        audit.failed = hasBlockingVisualFailure(audit);
        if (audit.failed) hasFailure = true;
        viewportReport.modules.push(audit);
      }
      await navigate(client, url);
      for (const moduleId of moduleIds) {
        await switchModule(client, moduleId);
        const audit = await auditVisualLayout(client, moduleId);
        audit.screenshot = await saveScreenshot(client, outDir, viewport.name, moduleId).catch((error) => {
          audit.screenshotError = error.message;
          return "";
        });
        audit.failed = hasBlockingVisualFailure(audit);
        if (audit.failed) hasFailure = true;
        viewportReport.modules.push(audit);
      }
      for (const state of interactionStates) {
        await switchModule(client, state.moduleId);
        await setupInteractionState(client, state);
        const audit = await auditVisualLayout(client, state.id);
        audit.interactionState = state.description;
        audit.screenshot = await saveScreenshot(client, outDir, viewport.name, state.id).catch((error) => {
          audit.screenshotError = error.message;
          return "";
        });
        audit.failed = hasBlockingVisualFailure(audit);
        if (audit.failed) hasFailure = true;
        viewportReport.modules.push(audit);
      }
      await setFocusMode(client, true);
      for (const moduleId of focusModuleIds) {
        await switchModule(client, moduleId);
        await setFocusMode(client, true);
        const auditId = `${moduleId}-focus`;
        const audit = await auditVisualLayout(client, auditId);
        audit.focusMode = true;
        audit.screenshot = await saveScreenshot(client, outDir, viewport.name, auditId).catch((error) => {
          audit.screenshotError = error.message;
          return "";
        });
        audit.failed = !audit.focusModeActive || hasBlockingVisualFailure(audit);
        if (audit.failed) hasFailure = true;
        viewportReport.modules.push(audit);
      }
      await setFocusMode(client, false);
      report.viewports.push(viewportReport);
    }
  } finally {
    await cleanupChrome(chrome);
  }

  const jsonPath = join(outDir, "report.json");
  const markdownPath = join(outDir, "report.md");
  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  await writeFile(markdownPath, renderMarkdownReport(report));
  console.log(`Design QA report: ${markdownPath}`);
  for (const viewport of report.viewports) {
    const failures = viewport.modules.filter((moduleItem) => moduleItem.failed);
    console.log(`${viewport.viewport.name}: ${viewport.modules.length - failures.length}/${viewport.modules.length} modules passed`);
    for (const failure of failures) {
      console.log(`  FAIL ${failure.id}: overflowX=${failure.pageOverflowX}, outside=${failure.counts.outside}, tiny=${failure.counts.tiny}, floating=${failure.counts.floating}, text=${failure.counts.textOverflow}, inset=${failure.counts.insetIssues || 0}, overlap=${failure.counts.overlapIssues || 0}, typography=${failure.counts.typographyWarnings || 0}, legacySidebar=${failure.counts.legacySidebarItems}, unmarked=${failure.counts.unmarkedComponents || 0}`);
    }
  }
  if (hasFailure) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
