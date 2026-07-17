import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  MOBILE_LIMITED_SUPPORT_MODULES,
  UI_REGRESSION_EXCEPTIONS,
  UI_REGRESSION_VIEWPORTS,
  getUiRegressionException,
  getUiRegressionProfile,
} from "../src/ui_regression_exceptions.js";
import {
  GANTT_UI_REQUIRED_SELECTORS,
} from "../src/gantt_ui_contracts.js";
import {
  MES_MODULE_BLUEPRINT_REGISTRY,
  getMesModuleNavigationDefinitions,
} from "../src/module_registry.js";

const baseUrl = process.env.MES_QA_URL || "http://localhost:4174/";
const sharedDisabledKey = "mes-planning-prototype-shared-disabled-until-v1";
const overflowThreshold = 16;
const GANTT_GENERIC_REQUIRED_SELECTORS = GANTT_UI_REQUIRED_SELECTORS.filter((selector) => (
  !selector.includes("GanttResizeHandle")
  && !selector.includes("GanttDependencyPath")
  && !selector.includes("GanttDependencyArrow")
));

const smokeModules = getMesModuleNavigationDefinitions({ adminHost: false, includeStandalone: true })
  .map((moduleItem) => moduleItem.id);
const adminOnlyModules = getMesModuleNavigationDefinitions({ adminHost: true, includeStandalone: false })
  .map((moduleItem) => moduleItem.id);

const reportPaths = {
  summaryJson: "reports/ui-regression-summary.json",
  moduleCoverageJson: "reports/ui-module-coverage.json",
  overflowJson: "reports/ui-overflow-report.json",
  tableJson: "reports/ui-table-regression.json",
  overlayJson: "reports/ui-overlay-regression.json",
  ganttJson: "reports/gantt-ui-regression.json",
  consoleJson: "reports/ui-console-errors.json",
  exceptionsJson: "reports/ui-regression-exceptions.json",
  summaryMd: "docs/ui-module-regression-smoke-report.md",
  tableMd: "docs/ui-table-regression-report.md",
  overlayMd: "docs/ui-overlay-regression-report.md",
  ganttMd: "docs/gantt-ui-regression-report.md",
};

const overlayProbeSelectors = Object.freeze(Object.fromEntries(MES_MODULE_BLUEPRINT_REGISTRY
  .filter((blueprint) => blueprint.qa.overlayProbeSelector)
  .map((blueprint) => [blueprint.id, blueprint.qa.overlayProbeSelector])));

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
    this.eventHandlers = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.onMessage(event));
  }

  on(method, handler) {
    const handlers = this.eventHandlers.get(method) || [];
    handlers.push(handler);
    this.eventHandlers.set(method, handlers);
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
    if (!message.method) return;
    (this.eventHandlers.get(message.method) || []).forEach((handler) => handler(message.params || {}));
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
  const profileDir = await mkdtemp(join(tmpdir(), "mes-ui-phase-4-regression-"));
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

function moduleUrl(moduleId) {
  const url = new URL(baseUrl);
  url.searchParams.set("module", moduleId);
  url.searchParams.set("qa-auth-bypass", "1");
  url.searchParams.set("qa", "ui-phase-4-regression");
  return url.toString();
}

async function getBootstrapSnapshotStorageSeed() {
  const raw = await readFile("bootstrap-snapshot.json", "utf8");
  const snapshot = JSON.parse(raw);
  return snapshot.values && typeof snapshot.values === "object" ? snapshot.values : {};
}

async function waitForSmokeReady(client, moduleId) {
  const startedAt = Date.now();
  let lastReport = null;
  while (Date.now() - startedAt < 25000) {
    const report = await evaluate(client, () => {
      const bodyText = (document.body?.innerText || "").trim().replace(/\s+/g, " ");
      const shell = document.querySelector("main.app-shell");
      return {
        ready: Boolean(shell) && shell.dataset.layoutPage,
        layoutPage: shell?.dataset.layoutPage || "",
        textLength: bodyText.length,
        runtimeErrors: /Ошибка запуска интерфейса|Cannot initialize|ReferenceError|TypeError|SyntaxError/.test(bodyText),
      };
    });
    lastReport = report;
    if (report.ready && report.layoutPage === moduleId && report.textLength > 40 && !report.runtimeErrors) return;
    await delay(140);
  }
  throw new Error(`${moduleId}: page did not become smoke-ready. Last report: ${JSON.stringify(lastReport)}`);
}

function isLimitedSupport(moduleId, viewport) {
  return viewport.category === "narrow" && Boolean(MOBILE_LIMITED_SUPPORT_MODULES[moduleId]);
}

function getStatus(failures, warnings) {
  if (failures.length) return "fail";
  if (warnings.length) return "warn";
  return "ok";
}

function normalizeEventText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 240);
}

async function collectPageReport(client, moduleId, viewport, eventWindow) {
  const profile = getUiRegressionProfile(moduleId);
  const exception = getUiRegressionException(moduleId);
  const pageReport = await evaluate(client, ({ moduleId, profile, viewport, overflowThreshold, ganttRequiredSelectors }) => {
    const selectorFor = (element) => {
      if (!element) return "";
      if (element.id) return `#${element.id}`;
      const className = String(element.className || "").trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".");
      return `${element.tagName.toLowerCase()}${className ? `.${className}` : ""}`;
    };
    const isVisible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const shell = document.querySelector("main.app-shell");
    const header = moduleId === "gantt"
      ? document.querySelector('[data-ui-component="GanttToolbar"], .topbar')
      : document.querySelector('[data-layout="header"], .app-topbar, .topbar, [data-visual-qa-target="auth-prototype-header"]');
    const main = document.querySelector('[data-layout="main-content"], [data-layout="planning-page"]');
    const bodyText = (document.body?.innerText || "").trim().replace(/\s+/g, " ");
    const headerRect = header?.getBoundingClientRect();
    const mainRect = main?.getBoundingClientRect();
    const shellRect = shell?.getBoundingClientRect();
    const bodyOverflowX = Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const components = {};
    [
      "AppShell",
      "ModulePage",
      "ModuleHeader",
      "Panel",
      "TableWrap",
      "ActionButton",
      "StatusToken",
      "ActionBar",
      "Toolbar",
      "FilterBar",
      "EmptyState",
      "Modal",
      "Drawer",
      "Dropdown",
      "GanttRuntime",
      "GanttDependencyLayer",
      "VisualSystemRuntime",
    ].forEach((component) => {
      components[component] = document.querySelectorAll(`[data-ui-component="${component}"]`).length;
    });

    const visibleOverflowElements = [...document.body.querySelectorAll("*")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const overflowRight = Math.round(rect.right - document.documentElement.clientWidth);
        const scrollDelta = Math.round(element.scrollWidth - element.clientWidth);
        return {
          selector: selectorFor(element),
          text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          overflowRight,
          scrollDelta,
          visible: isVisible(element),
          isAllowedContainer: Boolean(element.closest(".gantt-shell, .planner-workspace, .ui-table-wrap, [data-layout='table'], .timesheet-table-wrap, .production-structure-table-wrap")),
        };
      })
      .filter((item) => item.visible && (item.overflowRight > overflowThreshold || item.scrollDelta > overflowThreshold))
      .sort((left, right) => Math.max(right.overflowRight, right.scrollDelta) - Math.max(left.overflowRight, left.scrollDelta))
      .slice(0, 6);

    const tableWraps = [...document.querySelectorAll('[data-ui-component="TableWrap"], .ui-table-wrap[data-layout="table"]')];
    const tables = [...document.querySelectorAll("table")];
    const tableReports = tables.map((table) => {
      const rect = table.getBoundingClientRect();
      const headers = [...table.querySelectorAll("th")].map((cell) => cell.textContent.trim()).filter(Boolean);
      const rows = [...table.querySelectorAll("tbody tr")];
      const wrapper = table.closest('[data-ui-component="TableWrap"], .ui-table-wrap[data-layout="table"]');
      const actionButtons = [...table.querySelectorAll(".ui-action-button, [data-ui-component='ActionButton'], .table-icon-button")]
        .filter((button) => !button.matches("[data-timesheet-day-button]"));
      const iconButtonSizes = actionButtons.slice(0, 8).map((button) => {
        const buttonRect = button.getBoundingClientRect();
        return { width: Math.round(buttonRect.width), height: Math.round(buttonRect.height) };
      });
      return {
        selector: selectorFor(table),
        wrapper: selectorFor(wrapper),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        headers,
        rowCount: rows.length,
        actionButtonCount: actionButtons.length,
        iconButtonSizes,
        treeToggleCount: table.querySelectorAll("[data-shift-work-order-tree-toggle], .ui-tree-toggle, [style*='--speki-level']").length,
        levelMarkerCount: table.querySelectorAll("[style*='--speki-level']").length,
        selectedRowCount: table.querySelectorAll(".is-active, .is-selected").length,
      };
    });

    const overlayRoots = [...document.querySelectorAll(".modal-backdrop, .ui-modal, .ui-drawer, [data-modal-backdrop]")];
    const overlayReports = overlayRoots.map((overlay) => {
      const rect = overlay.getBoundingClientRect();
      return {
        selector: selectorFor(overlay),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visible: isVisible(overlay),
        closeActions: overlay.querySelectorAll("[data-close-modal], [data-close-drawer], [data-confirm-cancel], [aria-label*='Закрыть']").length,
        bodyCount: overlay.querySelectorAll(".ui-modal-body, .ui-drawer-body, .modal-body, form, section").length,
        footerActions: overlay.querySelectorAll(".ui-modal-footer, .ui-panel-footer, .modal-footer, button").length,
        overflowX: Math.max(0, Math.round(rect.right - document.documentElement.clientWidth)),
        overflowY: Math.max(0, Math.round(rect.bottom - document.documentElement.clientHeight)),
      };
    });

    const actionZones = [...document.querySelectorAll('[data-ui-component="ActionBar"], [data-ui-component="Toolbar"], [data-ui-component="FilterBar"], .ui-action-bar, .ui-toolbar, .ui-filter-bar')].map((zone) => {
      const rect = zone.getBoundingClientRect();
      return {
        selector: selectorFor(zone),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        actionButtons: zone.querySelectorAll('[data-ui-component="ActionButton"], .ui-action-button').length,
        overflowX: Math.max(0, Math.round(zone.scrollWidth - zone.clientWidth)),
      };
    });

    const gantt = moduleId === "gantt" ? {
      shell: Boolean(document.querySelector(".gantt-shell[data-gantt-shell]")),
      timeline: document.querySelectorAll(".timeline-row, .timeline-cell").length,
      rows: document.querySelectorAll(".gantt-row, .resource-row, .production-row").length,
      rowLabels: document.querySelectorAll(".row-label").length,
      slots: document.querySelectorAll(".operation-slot[data-slot-id], .operation-slot").length,
      dependencyLayer: Boolean(document.querySelector(".dependencies-layer[data-ui-component='GanttDependencyLayer']")),
      dependencyPaths: document.querySelectorAll(".dependency-path").length,
      slotIds: document.querySelectorAll(".operation-slot[data-slot-id]").length,
      slotBounds: [...document.querySelectorAll(".operation-slot")].slice(0, 8).map((slot) => {
        const rect = slot.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      }),
    } : null;

    const requiredSelectorList = moduleId === "gantt"
      ? [...new Set([...(profile.requiredSelectors || []), ...(ganttRequiredSelectors || [])])]
      : (profile.requiredSelectors || []);
    const requiredSelectors = requiredSelectorList.map((selector) => ({
      selector,
      count: document.querySelectorAll(selector).length,
    }));
    const operationalEmpty = moduleId === "planning"
      ? Boolean(document.querySelector(".planning-empty-page"))
      : moduleId === "gantt"
        ? Boolean(document.querySelector(".gantt-shell[data-gantt-shell]")) && !document.querySelector(".gantt-row")
        : false;

    return {
      moduleId,
      viewport,
      profileType: profile.type,
      layoutPage: shell?.dataset.layoutPage || "",
      textLength: bodyText.length,
      bodyOverflowX,
      shell: {
        present: Boolean(shell),
        width: Math.round(shellRect?.width || 0),
        height: Math.round(shellRect?.height || 0),
      },
      header: {
        present: Boolean(header),
        width: Math.round(headerRect?.width || 0),
        height: Math.round(headerRect?.height || 0),
      },
      main: {
        present: Boolean(main),
        width: Math.round(mainRect?.width || 0),
        height: Math.round(mainRect?.height || 0),
      },
      components,
      tableWrapCount: tableWraps.length,
      tableCount: tables.length,
      emptyStateCount: document.querySelectorAll('[data-ui-component="EmptyState"], .ui-empty-state').length,
      tableReports,
      overlayCount: overlayRoots.length,
      overlayReports,
      actionButtonCount: document.querySelectorAll('[data-ui-component="ActionButton"], .ui-action-button').length,
      actionZones,
      requiredSelectors,
      operationalEmpty,
      overflowElements: visibleOverflowElements,
      bodyRuntimeErrorText: /Ошибка запуска интерфейса|Cannot initialize|ReferenceError|TypeError|SyntaxError/.test(bodyText),
      gantt,
    };
  }, { moduleId, profile, viewport, overflowThreshold, ganttRequiredSelectors: GANTT_GENERIC_REQUIRED_SELECTORS });

  const failures = [];
  const warnings = [];
  if (!pageReport.shell.present || pageReport.layoutPage !== moduleId) failures.push("app shell/layoutPage missing");
  if (!pageReport.header.present || pageReport.header.height < 24 || pageReport.header.width < 120) {
    if (isLimitedSupport(moduleId, viewport)) warnings.push("header bounds limited on narrow viewport");
    else failures.push("header bounds invalid");
  }
  if (!pageReport.main.present || pageReport.main.height < 80 || pageReport.main.width < 120) failures.push("content bounds invalid");
  if (pageReport.textLength <= 40) failures.push("blank or nearly blank screen");
  if (pageReport.bodyRuntimeErrorText) failures.push("runtime error text detected");
  pageReport.requiredSelectors
    .filter((item) => item.count === 0)
    .filter((item) => !pageReport.operationalEmpty || ![
      ".planning-order-page",
      ".operation-slot",
      ".gantt-row[data-row-id]",
      ".row-label",
      ".lane[data-lane-row-id]",
      ".operation-slot[data-ui-component='GanttSlot'][data-slot-id]",
    ].includes(item.selector))
    .forEach((item) => failures.push(`missing required selector ${item.selector}`));

  if (pageReport.bodyOverflowX > overflowThreshold) {
    if (isLimitedSupport(moduleId, viewport)) warnings.push(`body overflow ${pageReport.bodyOverflowX}px allowed in narrow limited support`);
    else failures.push(`body overflow ${pageReport.bodyOverflowX}px`);
  }
  if (pageReport.overlayCount > 2) failures.push(`double overlay risk ${pageReport.overlayCount}`);

  if (profile.hasTable && pageReport.tableWrapCount === 0 && pageReport.emptyStateCount === 0 && !pageReport.operationalEmpty) {
    if (profile.type === "placeholder") warnings.push("placeholder without TableWrap");
    else failures.push("table module without TableWrap or EmptyState");
  }
  if (pageReport.tableReports.some((table) => !table.headers.length)) failures.push("table with empty header");
  if (pageReport.tableReports.some((table) => table.actionButtonCount && table.iconButtonSizes.filter((size) => size.width > 0 && size.height > 0).some((size) => size.width < 24 || size.height < 24))) {
    failures.push("table action button below minimum size");
  }
  if (profile.hasTree && pageReport.tableReports.some((table) => table.treeToggleCount === 0 && table.levelMarkerCount === 0)) {
    warnings.push("tree table without visible toggle/level markers");
  }

  if (profile.hasActions && pageReport.actionButtonCount === 0 && !pageReport.operationalEmpty) {
    if (profile.type === "placeholder") warnings.push("placeholder without action buttons");
    else failures.push("action buttons missing");
  }
  pageReport.actionZones.filter((zone) => zone.overflowX > overflowThreshold).forEach((zone) => {
    if (isLimitedSupport(moduleId, viewport)) warnings.push(`action zone overflow ${zone.selector}`);
    else failures.push(`action zone overflow ${zone.selector}`);
  });

  if (pageReport.gantt) {
    if (!pageReport.gantt.shell) failures.push("Gantt shell missing");
    if (!pageReport.gantt.timeline) failures.push("Gantt timeline missing");
    if (!pageReport.gantt.rows && !pageReport.operationalEmpty) failures.push("Gantt rows missing");
    if (!pageReport.gantt.slots && !pageReport.operationalEmpty) failures.push("Gantt operation slots missing");
    if (!pageReport.gantt.dependencyLayer) failures.push("Gantt dependency layer missing");
    if (!pageReport.gantt.slotIds && !pageReport.operationalEmpty) failures.push("Gantt slot ids missing");
    if (pageReport.gantt.slotBounds.some((slot) => slot.width <= 0 || slot.height <= 0)) failures.push("Gantt slot has empty bounds");
  }

  const consoleErrors = eventWindow.filter((event) => event.kind === "console-error" || event.kind === "exception" || event.kind === "log-error");
  if (consoleErrors.length) failures.push(`console/runtime errors ${consoleErrors.length}`);

  if (exception && ["special-runtime", "data-dense-limited-mobile", "placeholder"].includes(exception.type)) {
    pageReport.exceptionReason = exception.reason;
  }

  return {
    ...pageReport,
    exception: exception || null,
    limitedSupport: isLimitedSupport(moduleId, viewport) ? MOBILE_LIMITED_SUPPORT_MODULES[moduleId] : "",
    consoleErrors,
    failures,
    warnings,
    status: getStatus(failures, warnings),
  };
}

async function runOverlayProbe(client, moduleId, viewport) {
  const selector = overlayProbeSelectors[moduleId];
  if (!selector) return null;
  const clicked = await evaluate(client, (selector) => {
    const target = document.querySelector(selector);
    if (!target) return false;
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }, selector);
  if (!clicked) {
    return {
      moduleId,
      viewport,
      selector,
      status: "warn",
      warnings: ["overlay probe target not present in current state"],
      failures: [],
    };
  }
  await delay(350);
  const report = await evaluate(client, ({ selector, overflowThreshold }) => {
    const roots = [...document.querySelectorAll(".modal-backdrop, .ui-modal, .ui-drawer, [data-modal-backdrop]")];
    const overlays = roots.map((overlay) => {
      const rect = overlay.getBoundingClientRect();
      const style = window.getComputedStyle(overlay);
      return {
        selector: overlay.id ? `#${overlay.id}` : `${overlay.tagName.toLowerCase()}.${String(overlay.className || "").trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".")}`,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        display: style.display,
        visibility: style.visibility,
        bodyCount: overlay.querySelectorAll(".ui-modal-body, .ui-drawer-body, form, section").length,
        closeCount: overlay.querySelectorAll("[data-close-modal], [data-close-drawer], [data-confirm-cancel], [aria-label*='Закрыть']").length,
        actionCount: overlay.querySelectorAll("button, [data-ui-component='ActionButton'], .ui-action-button").length,
        overflowX: Math.max(0, Math.round(rect.right - document.documentElement.clientWidth)),
        overflowY: Math.max(0, Math.round(rect.bottom - document.documentElement.clientHeight)),
      };
    });
    return {
      selector,
      overlayCount: overlays.length,
      overlays,
      bodyOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      overflowThreshold,
    };
  }, { selector, overflowThreshold });

  const failures = [];
  const warnings = [];
  if (!report.overlayCount) failures.push("overlay did not open");
  if (report.overlayCount > 2) failures.push(`double overlay risk ${report.overlayCount}`);
  report.overlays.forEach((overlay) => {
    if (overlay.width <= 0 || overlay.height <= 0 || overlay.display === "none" || overlay.visibility === "hidden") failures.push(`overlay invisible ${overlay.selector}`);
    if (!overlay.bodyCount) failures.push(`overlay body missing ${overlay.selector}`);
    if (!overlay.closeCount) warnings.push(`overlay close action missing ${overlay.selector}`);
    if (overlay.overflowX > overflowThreshold) failures.push(`overlay horizontal overflow ${overlay.selector}`);
    if (overlay.overflowY > overflowThreshold && viewport.category !== "narrow") failures.push(`overlay vertical overflow ${overlay.selector}`);
  });

  await evaluate(client, () => {
    const close = document.querySelector("[data-close-modal], [data-close-drawer], [data-confirm-cancel]");
    if (close) close.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });
  await delay(120);

  return {
    moduleId,
    viewport,
    selector,
    status: getStatus(failures, warnings),
    failures,
    warnings,
    ...report,
  };
}

function buildMarkdownTable(headers, rows) {
  return `${headers.join(" | ")}\n${headers.map(() => "---").join(" | ")}\n${rows.map((row) => row.join(" | ").trimEnd()).join("\n")}`;
}

function buildSummaryMarkdown(result) {
  const rows = result.checks.map((item) => [
    item.viewport.id,
    item.moduleId,
    item.status,
    item.profileType,
    String(item.bodyOverflowX),
    item.tableWrapCount ? "TableWrap" : item.emptyStateCount ? "EmptyState" : "-",
    String(item.overlayCount),
    [...item.failures, ...item.warnings].join("; "),
  ]);
  return `# UI Module Regression Smoke Report

Generated: ${result.generatedAt}

## Summary

- modules: ${result.modules.length}
- viewports: ${result.viewports.map((item) => `${item.id} ${item.width}x${item.height}`).join(", ")}
- checks: ${result.summary.checks}
- failed: ${result.summary.failed}
- warnings: ${result.summary.warnings}

## Checks

${buildMarkdownTable(["viewport", "module", "status", "type", "body overflow X", "table", "overlays", "notes"], rows)}
`;
}

function buildTableMarkdown(result) {
  const rows = result.tables.map((item) => [
    item.viewport.id,
    item.moduleId,
    item.status,
    String(item.tableCount),
    String(item.tableWrapCount),
    String(item.emptyStateCount),
    String(item.treeToggleCount),
    [...item.failures, ...item.warnings].join("; "),
  ]);
  return `# UI Table Regression Report

Generated: ${result.generatedAt}

${buildMarkdownTable(["viewport", "module", "status", "tables", "TableWrap", "EmptyState", "tree markers", "notes"], rows)}
`;
}

function buildOverlayMarkdown(result) {
  const rows = result.overlays.map((item) => [
    item.viewport.id,
    item.moduleId,
    item.status,
    item.selector || "-",
    String(item.overlayCount || 0),
    [...(item.failures || []), ...(item.warnings || [])].join("; "),
  ]);
  return `# UI Overlay Regression Report

Generated: ${result.generatedAt}

${buildMarkdownTable(["viewport", "module", "status", "probe", "overlays", "notes"], rows)}
`;
}

function buildGanttMarkdown(result) {
  const rows = result.gantt.map((item) => [
    item.viewport.id,
    item.status,
    String(item.gantt?.timeline || 0),
    String(item.gantt?.rows || 0),
    String(item.gantt?.slots || 0),
    String(item.gantt?.dependencyPaths || 0),
    [...item.failures, ...item.warnings].join("; "),
  ]);
  return `# Gantt UI Regression Report

Generated: ${result.generatedAt}

Protected selectors: \`.gantt-shell[data-gantt-shell]\`, \`.timeline-row\`, \`.rows-layer\`, \`.operation-slot[data-slot-id]\`, \`.dependencies-layer[data-ui-component="GanttDependencyLayer"]\`.

${buildMarkdownTable(["viewport", "status", "timeline", "rows", "slots", "dependency paths", "notes"], rows)}
`;
}

async function writeReports(result) {
  const tableReport = {
    generatedAt: result.generatedAt,
    tables: result.checks
      .filter((item) => getUiRegressionProfile(item.moduleId).hasTable)
      .map((item) => ({
        viewport: item.viewport,
        moduleId: item.moduleId,
        status: item.status,
        tableCount: item.tableCount,
        tableWrapCount: item.tableWrapCount,
        emptyStateCount: item.emptyStateCount,
        treeToggleCount: item.tableReports.reduce((sum, table) => sum + table.treeToggleCount + table.levelMarkerCount, 0),
        failures: item.failures.filter((text) => /table|Tree|tree|TableWrap|header|button/.test(text)),
        warnings: item.warnings.filter((text) => /table|Tree|tree|TableWrap|header|button|placeholder/.test(text)),
      })),
  };
  const overlayReport = {
    generatedAt: result.generatedAt,
    overlays: result.overlayProbes,
  };
  const ganttReport = {
    generatedAt: result.generatedAt,
    gantt: result.checks.filter((item) => item.moduleId === "gantt"),
  };
  const overflowReport = {
    generatedAt: result.generatedAt,
    threshold: overflowThreshold,
    checks: result.checks.map((item) => ({
      viewport: item.viewport,
      moduleId: item.moduleId,
      status: item.bodyOverflowX > overflowThreshold ? item.status : "ok",
      bodyOverflowX: item.bodyOverflowX,
      limitedSupport: item.limitedSupport,
      candidates: item.overflowElements,
    })),
  };
  const moduleCoverage = {
    generatedAt: result.generatedAt,
    modules: smokeModules.map((moduleId) => ({
      moduleId,
      profile: getUiRegressionProfile(moduleId),
      exception: getUiRegressionException(moduleId),
      checks: result.checks.filter((item) => item.moduleId === moduleId).map((item) => ({
        viewport: item.viewport.id,
        status: item.status,
      })),
    })),
  };
  const consoleReport = {
    generatedAt: result.generatedAt,
    errors: result.checks.flatMap((item) => item.consoleErrors.map((error) => ({
      viewport: item.viewport,
      moduleId: item.moduleId,
      ...error,
    }))),
  };
  const writes = [
    [reportPaths.summaryJson, result],
    [reportPaths.moduleCoverageJson, moduleCoverage],
    [reportPaths.overflowJson, overflowReport],
    [reportPaths.tableJson, tableReport],
    [reportPaths.overlayJson, overlayReport],
    [reportPaths.ganttJson, ganttReport],
    [reportPaths.consoleJson, consoleReport],
    [reportPaths.exceptionsJson, UI_REGRESSION_EXCEPTIONS],
    [reportPaths.summaryMd, buildSummaryMarkdown(result)],
    [reportPaths.tableMd, buildTableMarkdown(tableReport)],
    [reportPaths.overlayMd, buildOverlayMarkdown(overlayReport)],
    [reportPaths.ganttMd, buildGanttMarkdown(ganttReport)],
  ];
  await Promise.all(writes.map(async ([filePath, content]) => {
    await mkdir(dirname(filePath), { recursive: true });
    const body = typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`;
    await writeFile(filePath, body, "utf8");
  }));
}

async function run() {
  const bootstrapSnapshotStorageSeed = await getBootstrapSnapshotStorageSeed();
  const chrome = await launchChrome();
  const checks = [];
  const overlayProbes = [];
  const eventLog = [];
  try {
    const { client } = chrome;
    client.on("Runtime.consoleAPICalled", (params) => {
      if (params.type !== "error") return;
      eventLog.push({
        kind: "console-error",
        text: normalizeEventText((params.args || []).map((arg) => arg.value || arg.description || "").join(" ")),
        timestamp: Date.now(),
      });
    });
    client.on("Runtime.exceptionThrown", (params) => {
      eventLog.push({
        kind: "exception",
        text: normalizeEventText(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || "Runtime exception"),
        timestamp: Date.now(),
      });
    });
    client.on("Log.entryAdded", (params) => {
      if (params.entry?.level !== "error") return;
      eventLog.push({
        kind: "log-error",
        text: normalizeEventText(params.entry.text || params.entry.url || "Log error"),
        timestamp: Date.now(),
      });
    });

    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Page.navigate", { url: moduleUrl("planning") });
    await delay(400);
    await evaluate(client, ({ bootstrapSnapshotStorageSeed, sharedDisabledKey }) => {
      sessionStorage.setItem(sharedDisabledKey, String(Date.now() + 5 * 60 * 1000));
      Object.entries(bootstrapSnapshotStorageSeed || {}).forEach(([key, value]) => {
        if (typeof value === "string") localStorage.setItem(key, value);
      });
    }, { bootstrapSnapshotStorageSeed, sharedDisabledKey });

    for (const viewport of UI_REGRESSION_VIEWPORTS) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.category === "narrow",
      });
      for (const moduleId of smokeModules) {
        const eventStart = eventLog.length;
        await client.send("Page.navigate", { url: moduleUrl(moduleId) });
        await waitForSmokeReady(client, moduleId);
        const eventWindow = eventLog.slice(eventStart);
        const pageReport = await collectPageReport(client, moduleId, viewport, eventWindow);
        checks.push(pageReport);
        const overlayProbe = await runOverlayProbe(client, moduleId, viewport);
        if (overlayProbe) overlayProbes.push(overlayProbe);
      }
    }
  } finally {
    await cleanupChrome(chrome);
  }

  const failures = checks.filter((item) => item.status === "fail");
  const warnings = checks.filter((item) => item.status === "warn");
  const overlayFailures = overlayProbes.filter((item) => item.status === "fail");
  const result = {
    generatedAt: new Date().toISOString(),
    modules: smokeModules,
    adminOnlyModules,
    viewports: UI_REGRESSION_VIEWPORTS,
    threshold: { bodyOverflowX: overflowThreshold },
    summary: {
      checks: checks.length,
      failed: failures.length + overlayFailures.length,
      warnings: warnings.length + overlayProbes.filter((item) => item.status === "warn").length,
      overlayProbes: overlayProbes.length,
    },
    checks,
    overlayProbes,
  };
  await writeReports(result);
  console.log("MES UI Phase 4 Regression Smoke");
  console.log(`- modules: ${smokeModules.length}`);
  console.log(`- admin-only modules excluded from public regression: ${adminOnlyModules.join(", ") || "none"}`);
  console.log(`- viewports: ${UI_REGRESSION_VIEWPORTS.map((item) => `${item.id} ${item.width}x${item.height}`).join(", ")}`);
  console.log(`- checks: ${checks.length}`);
  console.log(`- overlay probes: ${overlayProbes.length}`);
  console.log(`- failed: ${result.summary.failed}`);
  console.log(`- warnings: ${result.summary.warnings}`);
  console.log(`- report: ${reportPaths.summaryMd}`);
  console.log(`- json: ${reportPaths.summaryJson}`);
  if (result.summary.failed) {
    const failureText = [
      ...failures.map((item) => `${item.viewport.id}/${item.moduleId}: ${item.failures.join("; ")}`),
      ...overlayFailures.map((item) => `${item.viewport.id}/${item.moduleId}/overlay: ${item.failures.join("; ")}`),
    ].join("\n- ");
    throw new Error(`UI Phase 4 regression smoke failed:\n- ${failureText}`);
  }
  console.log("OK: UI Phase 4 regression smoke passed.");
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
