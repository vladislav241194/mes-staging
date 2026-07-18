import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MES_MODULE_BLUEPRINT_REGISTRY,
  getMesModuleNavigationDefinitions,
} from "../src/module_registry.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.MES_QA_URL || "http://localhost:4174/";
const strict = process.argv.includes("--strict");
const writeReport = process.argv.includes("--write-report");
const sharedDisabledKey = "mes-planning-prototype-shared-disabled-until-v1";
const reportJsonPath = join(projectRoot, "reports", "ui-module-visual-parity.json");
const reportMarkdownPath = join(projectRoot, "docs", "ui-module-visual-parity-report.md");

const viewports = [
  { id: "desktop", width: 1440, height: 932, category: "desktop" },
  { id: "tablet", width: 1024, height: 768, category: "tablet" },
  { id: "narrow", width: 390, height: 844, category: "narrow" },
];

const moduleProfiles = Object.freeze(Object.fromEntries(MES_MODULE_BLUEPRINT_REGISTRY
  .map((blueprint) => [blueprint.id, blueprint.qa.parity])));

// Public/standalone and admin-only scopes come from one executable registry.
// Admin visibility and deep-link behavior are verified separately without the QA bypass.
const moduleIds = getMesModuleNavigationDefinitions({ adminHost: false, includeStandalone: true })
  .map((moduleItem) => moduleItem.id);
const adminOnlyModuleIds = getMesModuleNavigationDefinitions({ adminHost: true, includeStandalone: false })
  .map((moduleItem) => moduleItem.id);
const registryModuleIds = new Set([...moduleIds, ...adminOnlyModuleIds]);
const missingProfiles = [...registryModuleIds].filter((moduleId) => !moduleProfiles[moduleId]);
const orphanProfiles = Object.keys(moduleProfiles).filter((moduleId) => !registryModuleIds.has(moduleId));
if (missingProfiles.length || orphanProfiles.length) {
  throw new Error(`UI parity profile/registry drift: missing=${missingProfiles.join(",") || "none"}; orphan=${orphanProfiles.join(",") || "none"}`);
}
const structuralButtonStyleProperties = [
  "display",
  "alignItems",
  "justifyContent",
  "minHeight",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "columnGap",
  "rowGap",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
];
const visualButtonStyleProperties = ["borderTopColor", "backgroundColor", "backgroundImage", "color", "boxShadow"];
const tableControlStyleProperties = [
  "minHeight",
  "height",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "backgroundColor",
  "color",
];
const formControlStyleProperties = [
  "minHeight",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
];
const panelPartStyleProperties = [
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "borderTopColor",
  "borderBottomColor",
  "backgroundColor",
  "backgroundImage",
];
const shellStyleProperties = [
  "display",
  "gridTemplateColumns",
  "gridTemplateRows",
  "width",
  "minWidth",
  "maxWidth",
  "height",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "columnGap",
  "rowGap",
  "borderRightWidth",
  "borderBottomWidth",
  "borderRightColor",
  "borderBottomColor",
  "backgroundColor",
  "backgroundImage",
  "boxShadow",
];
const surfaceStyleProperties = [
  "display",
  "minWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "columnGap",
  "rowGap",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
  "backgroundColor",
  "backgroundImage",
  "boxShadow",
];

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

  async send(method, params = {}, timeoutMs = 30000) {
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

async function evaluate(client, pageFunction, arg, timeoutMs = 45000) {
  const source = typeof pageFunction === "function" ? pageFunction.toString() : pageFunction;
  const expression = arg === undefined ? `(${source})()` : `(${source})(${JSON.stringify(arg)})`;
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, timeoutMs);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

async function launchChrome() {
  const chromePath = await findChrome();
  const port = await getFreePort();
  const profileDir = await mkdtemp(join(tmpdir(), "mes-ui-visual-parity-"));
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
    // Chrome may already be closed.
  }
  if (chrome.child.exitCode === null && !chrome.child.killed) chrome.child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (chrome.child.exitCode !== null) return resolve();
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
  url.searchParams.set("qa", "ui-module-visual-parity");
  return url.toString();
}

async function waitForLayout(client, expectedModule = "", timeoutMs = 25000) {
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt < timeoutMs) {
    last = await evaluate(client, () => {
      const shell = document.querySelector("main.app-shell");
      const text = String(document.body?.innerText || "").replace(/\s+/g, " ").trim();
      return {
        layoutPage: shell?.dataset.layoutPage || "",
        textLength: text.length,
        runtimeError: /Ошибка запуска интерфейса|Cannot initialize|ReferenceError|TypeError|SyntaxError/.test(text),
      };
    });
    if (last.layoutPage && (!expectedModule || last.layoutPage === expectedModule) && last.textLength > 40 && !last.runtimeError) return last;
    await delay(140);
  }
  throw new Error(`Page did not become ready for ${expectedModule || "any module"}: ${JSON.stringify(last)}`);
}

async function stabilizeVisualState(client) {
  await evaluate(client, async () => {
    let style = document.getElementById("ui-visual-parity-freeze");
    if (!style) {
      style = document.createElement("style");
      style.id = "ui-visual-parity-freeze";
      style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
      document.head.append(style);
    }
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

function issue(code, message, details = {}, severity = "hard") {
  return { code, severity, message, ...details };
}

function px(value) {
  const parsed = Number.parseFloat(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function near(left, right, tolerance = 1) {
  return Math.abs(Number(left || 0) - Number(right || 0)) <= tolerance;
}

function stableString(value) {
  if (Array.isArray(value)) return `[${value.map(stableString).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableString(value[key])}`).join(",")}}`;
}

function pick(object, keys) {
  return Object.fromEntries(keys.map((key) => [key, object?.[key] ?? ""]));
}

function expandBoxValue(value = "") {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return ["", "", "", ""];
  if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
  return parts.slice(0, 4);
}

async function collectSnapshot(client, moduleId, viewport) {
  return evaluate(client, ({ moduleId, viewport, surfaceStyleProperties, panelPartStyleProperties, shellStyleProperties, structuralButtonStyleProperties, visualButtonStyleProperties, tableControlStyleProperties, formControlStyleProperties }) => {
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const selectorFor = (element) => {
      if (!element) return "";
      if (element.id) return `#${element.id}`;
      const classes = String(element.className || "").trim().split(/\s+/).filter(Boolean).slice(0, 4).join(".");
      return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ""}`;
    };
    const rectFor = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        left: Number(rect.left.toFixed(2)),
        top: Number(rect.top.toFixed(2)),
        right: Number(rect.right.toFixed(2)),
        bottom: Number(rect.bottom.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      };
    };
    const styleFor = (element, properties) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return Object.fromEntries(properties.map((property) => [property, style[property] || ""]));
    };
    const tokenFor = (element, name) => element ? getComputedStyle(element).getPropertyValue(name).trim() : "";
    const inferVariant = (element) => {
      const explicit = String(element.dataset.uiVariant || "").trim();
      if (explicit) return { variant: explicit, explicit: true };
      if (element.matches(".is-touch")) return { variant: "touch", explicit: false };
      if (element.matches(".table-icon-button")) return { variant: "table-icon", explicit: false };
      if (element.matches(".icon-button")) return { variant: "icon", explicit: false };
      if (element.matches(".is-danger, .danger, .danger-primary")) return { variant: "danger", explicit: false };
      if (element.matches(".primary-button")) return { variant: "primary", explicit: false };
      if (element.matches(".secondary-button")) return { variant: "secondary", explicit: false };
      if (element.matches(".is-ghost")) return { variant: "ghost", explicit: false };
      if (element.matches(".is-compact")) return { variant: "compact", explicit: false };
      return { variant: "unclassified", explicit: false };
    };

    const shell = document.querySelector('main.app-shell[data-layout="app-shell"]');
    const menu = shell?.querySelector(":scope > .module-menu") || null;
    const topbar = shell?.querySelector(":scope > .app-topbar") || null;
    const page = document.querySelector('[data-ui-component="ModulePage"][data-layout="main-content"], [data-layout="main-content"]');
    const sidebar = page?.querySelector(':scope > [data-ui-component="ModuleSidebar"]') || null;
    const workspace = page?.querySelector(':scope > [data-ui-component="ModuleWorkspace"]') || null;
    const header = workspace?.querySelector('[data-ui-component="ModuleHeader"]') || page?.querySelector('[data-ui-component="ModuleHeader"]') || null;
    const mobileSwitcher = menu?.querySelector(".mobile-module-switcher") || null;
    const desktopTabs = menu?.querySelector(".module-tabs") || null;
    const activeDesktopTabs = [...document.querySelectorAll(`.module-tab[data-module="${CSS.escape(moduleId)}"].is-active`)];
    const activeMobileTabs = [...document.querySelectorAll(`.mobile-module-tab[data-module="${CSS.escape(moduleId)}"].is-active`)];

    const surfaces = [...document.querySelectorAll('[data-ui-component="ModuleSidebar"], [data-ui-component="ModuleWorkspace"], [data-ui-component="ModuleHeader"], [data-ui-component="Panel"], [data-ui-component="Canvas"], [data-ui-component="FormSection"], [data-ui-component="TableWrap"]')]
      .filter(visible)
      .map((element) => ({
        component: element.dataset.uiComponent || "",
        selector: selectorFor(element),
        rect: rectFor(element),
        style: styleFor(element, surfaceStyleProperties),
      }));

    const panelParts = [...document.querySelectorAll('[data-ui-component="PanelHead"], [data-ui-component="PanelBody"], [data-ui-component="PanelFooter"]')]
      .filter(visible)
      .map((element) => ({
        component: element.dataset.uiComponent || "",
        parentComponent: element.closest('[data-ui-component="Panel"], [data-ui-component="Canvas"]')?.dataset.uiComponent || "",
        selector: selectorFor(element),
        rect: rectFor(element),
        style: styleFor(element, panelPartStyleProperties),
      }));

    const excludedActionRoot = (element) => Boolean(element.closest(".module-menu, .app-topbar, .gantt-shell, .auth-prototype-page, [data-print-root], .route-print-preview, .shift-work-order-print-preview"));
    const actions = [...(page?.querySelectorAll('[data-ui-component="ActionButton"]') || [])]
      .filter((element) => visible(element) && !excludedActionRoot(element))
      .map((element) => {
        const inferred = inferVariant(element);
        return {
          selector: selectorFor(element),
          className: String(element.className || ""),
          label: String(element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
          disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
          variant: inferred.variant,
          explicitVariant: inferred.explicit,
          rect: rectFor(element),
          structuralStyle: styleFor(element, structuralButtonStyleProperties),
          visualStyle: styleFor(element, visualButtonStyleProperties),
        };
      });

    const tableControlNodes = [...(page?.querySelectorAll('[data-ui-component="TableControl"]') || [])]
      .filter((element) => visible(element));
    const tableControls = tableControlNodes.slice(0, 120).map((element) => ({
      selector: selectorFor(element),
      variant: String(element.dataset.uiVariant || "").trim(),
      density: String(element.dataset.uiDensity || "").trim(),
      style: styleFor(element, tableControlStyleProperties),
    }));

    const formControlNodes = [...(page?.querySelectorAll('[data-ui-component="FormField"] > :is(input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), select, textarea)') || [])]
      .filter((element) => visible(element));
    const formControls = formControlNodes.slice(0, 120).map((element) => ({
      selector: selectorFor(element),
      kind: element.tagName.toLowerCase() === "input" ? `input:${String(element.type || "text").toLowerCase()}` : element.tagName.toLowerCase(),
      style: styleFor(element, formControlStyleProperties),
    }));

    return {
      moduleId,
      viewport,
      hostname: location.hostname,
      shellClassName: shell?.className || "",
      layoutPage: shell?.dataset.layoutPage || "",
      counts: {
        shell: document.querySelectorAll('main.app-shell[data-layout="app-shell"]').length,
        menu: document.querySelectorAll("main.app-shell > .module-menu").length,
        topbar: document.querySelectorAll("main.app-shell > .app-topbar").length,
        page: document.querySelectorAll('[data-ui-component="ModulePage"][data-layout="main-content"]').length,
        sidebar: page?.querySelectorAll(':scope > [data-ui-component="ModuleSidebar"]').length || 0,
        workspace: page?.querySelectorAll(':scope > [data-ui-component="ModuleWorkspace"]').length || 0,
        header: page?.querySelectorAll('[data-ui-component="ModuleHeader"]').length || 0,
        activeDesktopTab: activeDesktopTabs.length,
        activeMobileTab: activeMobileTabs.length,
        tableControls: tableControlNodes.length,
        formControls: formControlNodes.length,
      },
      visibility: {
        menu: visible(menu),
        topbar: visible(topbar),
        mobileSwitcher: visible(mobileSwitcher),
        desktopTabs: visible(desktopTabs),
      },
      rects: {
        shell: rectFor(shell),
        menu: rectFor(menu),
        topbar: rectFor(topbar),
        page: rectFor(page),
        sidebar: rectFor(sidebar),
        workspace: rectFor(workspace),
        header: rectFor(header),
      },
      styles: {
        shell: styleFor(shell, shellStyleProperties),
        menu: styleFor(menu, shellStyleProperties),
        topbar: styleFor(topbar, shellStyleProperties),
        page: styleFor(page, surfaceStyleProperties.concat(["gridTemplateColumns", "gridTemplateRows"])),
        sidebar: styleFor(sidebar, surfaceStyleProperties),
        workspace: styleFor(workspace, surfaceStyleProperties),
        header: styleFor(header, surfaceStyleProperties),
      },
      tokens: {
        appSidebarWidth: tokenFor(shell, "--mes-ui-app-sidebar-width"),
        moduleSidebarWidth: tokenFor(page || shell, "--mes-ui-module-sidebar-width"),
        densityPage: tokenFor(page || shell, "--mes-ui-density-page"),
        densityGap: tokenFor(page || shell, "--mes-ui-density-gap"),
        contractSectionGap: tokenFor(page || shell, "--mes-ui-contract-section-gap"),
        sidebarRowGap: tokenFor(page || shell, "--mes-ui-sidebar-row-gap"),
        radiusSm: tokenFor(page || shell, "--mes-ui-radius-sm"),
        radiusMd: tokenFor(page || shell, "--mes-ui-radius-md"),
        radiusXl: tokenFor(page || shell, "--mes-ui-radius-xl"),
        panelHeadPadding: tokenFor(page || shell, "--mes-ui-panel-head-padding"),
        panelBodyPadding: tokenFor(page || shell, "--mes-ui-panel-body-padding"),
        panelFooterPadding: tokenFor(page || shell, "--mes-ui-panel-footer-padding"),
        controlHeightCompact: tokenFor(page || shell, "--mes-ui-control-height-compact"),
        controlHeightDefault: tokenFor(page || shell, "--mes-ui-control-height-default"),
        controlHeightTouch: tokenFor(page || shell, "--mes-ui-control-height-touch"),
      },
      surfaces,
      panelParts,
      actions,
      tableControls,
      formControls,
    };
  }, {
    moduleId,
    viewport,
    surfaceStyleProperties,
    panelPartStyleProperties,
    shellStyleProperties,
    structuralButtonStyleProperties,
    visualButtonStyleProperties,
    tableControlStyleProperties,
    formControlStyleProperties,
  });
}

function validateSnapshot(snapshot, profile) {
  const hard = [];
  const warnings = [];
  const addHard = (code, message, details = {}) => hard.push(issue(code, message, details));
  const addWarning = (code, message, details = {}) => warnings.push(issue(code, message, details, "warning"));
  const { counts, rects, styles, tokens, viewport } = snapshot;

  if (counts.shell !== 1 || snapshot.layoutPage !== snapshot.moduleId) {
    addHard("shell-layout", "AppShell/layoutPage contract mismatch", { actual: { count: counts.shell, layoutPage: snapshot.layoutPage }, expected: snapshot.moduleId });
  }

  if (profile.shell === "standard") {
    if (counts.menu !== 1 || counts.topbar !== 1) addHard("standard-shell-parts", "Standard shell must contain exactly one module menu and topbar", { actual: { menu: counts.menu, topbar: counts.topbar } });
    if (counts.activeDesktopTab !== 1 || counts.activeMobileTab !== 1) addHard("active-navigation", "Module must have one active desktop and mobile navigation item", { actual: { desktop: counts.activeDesktopTab, mobile: counts.activeMobileTab } });
    if (viewport.category !== "narrow") {
      if (!snapshot.visibility.menu || !snapshot.visibility.topbar) addHard("desktop-shell-visibility", "Desktop/tablet shell navigation must be visible");
      if (rects.menu && tokens.appSidebarWidth && !near(rects.menu.width, px(tokens.appSidebarWidth))) addHard("app-sidebar-width", "App sidebar width differs from token", { actual: rects.menu.width, expected: tokens.appSidebarWidth });
      if (rects.menu && rects.topbar && !near(rects.menu.right, rects.topbar.left)) addHard("app-sidebar-topbar-alignment", "App sidebar and topbar columns are not aligned", { actual: { menuRight: rects.menu.right, topbarLeft: rects.topbar.left } });
      if (profile.page !== "gantt" && rects.topbar && rects.page && (!near(rects.topbar.left, rects.page.left) || !near(rects.topbar.right, rects.page.right))) {
        addHard("topbar-main-alignment", "Topbar and main module bounds differ", { actual: { topbar: rects.topbar, page: rects.page } });
      }
      if (rects.topbar && !near(rects.topbar.height, 64)) addHard("topbar-height", "Topbar height differs from 64px shell contract", { actual: rects.topbar.height, expected: 64 });
    } else {
      if (!snapshot.visibility.menu || !snapshot.visibility.mobileSwitcher || snapshot.visibility.desktopTabs) {
        addHard("narrow-navigation", "Narrow shell must show mobile switcher and hide desktop tabs", { actual: snapshot.visibility });
      }
      if (rects.menu && rects.shell && (!near(rects.menu.left, rects.shell.left) || !near(rects.menu.right, rects.shell.right))) {
        addHard("narrow-menu-width", "Narrow module menu must span shell width", { actual: { menu: rects.menu, shell: rects.shell } });
      }
    }
  } else if (profile.shell === "auth-standalone") {
    if (counts.menu || counts.topbar || !snapshot.shellClassName.includes("is-auth-standalone")) addHard("auth-standalone-shell", "Auth prototype must be standalone without app menu/topbar", { actual: { menu: counts.menu, topbar: counts.topbar, className: snapshot.shellClassName } });
  }

  if (profile.page === "gantt") {
    if (counts.page !== 0) addHard("gantt-module-page", "Gantt must remain outside generic ModulePage geometry", { actual: counts.page });
    return { hard, warnings };
  }

  if (counts.page !== 1 || counts.workspace !== 1) addHard("module-page-structure", "ModulePage must contain exactly one ModuleWorkspace", { actual: { page: counts.page, workspace: counts.workspace } });
  if (profile.page === "sidebar") {
    if (counts.sidebar !== 1) addHard("module-sidebar-count", "Sidebar-family module must contain exactly one direct ModuleSidebar", { actual: counts.sidebar });
    if (viewport.category !== "narrow" && rects.sidebar && rects.workspace) {
      if (tokens.moduleSidebarWidth && !near(rects.sidebar.width, px(tokens.moduleSidebarWidth))) addHard("module-sidebar-width", "Module sidebar width differs from shared token", { actual: rects.sidebar.width, expected: tokens.moduleSidebarWidth });
      if (!near(rects.sidebar.top, rects.workspace.top)) addHard("module-sidebar-top", "Module sidebar and workspace top edges differ", { actual: { sidebarTop: rects.sidebar.top, workspaceTop: rects.workspace.top } });
      const columnGap = px(styles.page?.columnGap);
      if (!near(rects.workspace.left - rects.sidebar.right, columnGap)) addHard("module-sidebar-gap", "Sidebar/workspace distance differs from computed column gap", { actual: rects.workspace.left - rects.sidebar.right, expected: columnGap });
    }
    if (viewport.category === "narrow" && rects.sidebar && rects.workspace) {
      if (!near(rects.sidebar.left, rects.workspace.left) || !near(rects.sidebar.right, rects.workspace.right)) addHard("stacked-sidebar-width", "Narrow sidebar and workspace must share horizontal bounds", { actual: { sidebar: rects.sidebar, workspace: rects.workspace } });
      if (rects.workspace.top < rects.sidebar.bottom - 1) addHard("stacked-sidebar-order", "Narrow workspace overlaps or precedes module sidebar", { actual: { sidebarBottom: rects.sidebar.bottom, workspaceTop: rects.workspace.top } });
    }
  } else if (profile.page === "full" && counts.sidebar !== 0) {
    addHard("full-width-sidebar", "Full-width module must not expose an inner ModuleSidebar", { actual: counts.sidebar });
  }

  if (profile.header === "required" && counts.header !== 1) addHard("module-header-required", "Module requires exactly one ModuleHeader", { actual: counts.header });
  if (profile.header === "absent" && counts.header !== 0) addHard("module-header-absent", "Headerless module unexpectedly rendered ModuleHeader", { actual: counts.header });

  const expectedRadius = px(tokens.radiusMd);
  snapshot.surfaces.forEach((surface) => {
    if (profile.family === "admin-preview" && surface.component === "ModuleWorkspace") return;
    if (profile.family === "auth-standalone" && surface.component === "ModuleWorkspace") return;
    const radii = ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"].map((key) => px(surface.style[key]));
    const widths = ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"].map((key) => px(surface.style[key]));
    if (surface.component === "Canvas") {
      if (radii.some((radius) => !near(radius, 0, 0.1))) addHard("canvas-radius", "Canvas must not masquerade as a rounded panel", { selector: surface.selector, actual: radii, expected: 0 });
      if (widths.some((width) => !near(width, 0, 0.1))) addHard("canvas-border", "Canvas must not render a panel border", { selector: surface.selector, actual: widths, expected: 0 });
      return;
    }
    if (expectedRadius && radii.some((radius) => !near(radius, expectedRadius, 0.6))) addHard("surface-radius", `${surface.component} radius differs from shared md token`, { selector: surface.selector, actual: radii, expected: tokens.radiusMd });
    if (radii.some((radius) => radius > 8.6)) addHard("surface-radius-max", `${surface.component} exceeds 8px standard surface radius`, { selector: surface.selector, actual: radii });
    if (surface.component !== "TableWrap" && widths.some((width) => width > 1.1)) addHard("surface-border-width", `${surface.component} uses a border wider than 1px`, { selector: surface.selector, actual: widths });
  });

  const expectedPanelPadding = {
    PanelHead: expandBoxValue(tokens.panelHeadPadding),
    PanelBody: expandBoxValue(tokens.panelBodyPadding),
    PanelFooter: expandBoxValue(tokens.panelFooterPadding),
  };
  for (const component of profile.skipPanelPadding ? [] : ["PanelHead", "PanelBody", "PanelFooter"]) {
    const expected = expectedPanelPadding[component];
    if (!expected.some(Boolean)) continue;
    const outliers = snapshot.panelParts
      .filter((part) => part.component === component && part.parentComponent !== "Canvas")
      .filter((part) => {
        const actual = [part.style.paddingTop, part.style.paddingRight, part.style.paddingBottom, part.style.paddingLeft];
        return actual.some((value, index) => !near(px(value), px(expected[index]), 0.6));
      });
    if (outliers.length) addHard("panel-part-padding", `${component} padding differs from shared token`, {
      component,
      expected,
      outliers: outliers.slice(0, 8).map((part) => ({ selector: part.selector, actual: [part.style.paddingTop, part.style.paddingRight, part.style.paddingBottom, part.style.paddingLeft] })),
    });
  }

  if (!profile.skipActionVariants) {
    const missingExplicit = snapshot.actions.filter((action) => !action.explicitVariant);
    if (missingExplicit.length) addHard("action-explicit-variant", "Visible module ActionButtons require explicit data-ui-variant", {
      actual: missingExplicit.length,
      total: snapshot.actions.length,
      examples: missingExplicit.slice(0, 6).map((action) => ({ selector: action.selector, className: action.className, inferredVariant: action.variant, label: action.label })),
    });
    const unclassified = snapshot.actions.filter((action) => action.variant === "unclassified");
    if (unclassified.length) addWarning("action-unclassified", "ActionButtons without canonical class or data variant remain unclassified", {
      actual: unclassified.length,
      examples: unclassified.slice(0, 6).map((action) => ({ selector: action.selector, className: action.className, label: action.label })),
    });
  }

  snapshot.tableControls.forEach((control) => {
    if (!control.variant || !["compact", "default", "touch"].includes(control.density)) {
      addHard("table-control-contract", "Visible TableControl requires explicit variant and supported density", {
        selector: control.selector,
        actual: { variant: control.variant, density: control.density },
      });
      return;
    }
    const radii = ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"].map((key) => px(control.style[key]));
    if (radii.some((radius) => !near(radius, px(tokens.radiusSm), 0.6))) {
      addHard("table-control-radius", "TableControl radius differs from shared small radius", { selector: control.selector, actual: radii, expected: tokens.radiusSm });
    }
    const widths = ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"].map((key) => px(control.style[key]));
    if (widths.some((width) => !near(width, 1, 0.1))) {
      addHard("table-control-border", "TableControl must use one-pixel shared border", { selector: control.selector, actual: widths });
    }
    const expectedHeight = control.density === "compact"
      ? 28
      : control.density === "touch"
        ? px(tokens.controlHeightTouch)
        : px(tokens.controlHeightDefault);
    if (!near(px(control.style.minHeight), expectedHeight, 0.6)) {
      addHard("table-control-height", "TableControl height differs from its explicit density", { selector: control.selector, density: control.density, actual: control.style.minHeight, expected: expectedHeight });
    }
  });

  return { hard, warnings };
}

function modeFingerprint(entries, styleKey, properties) {
  const buckets = new Map();
  entries.forEach((entry) => {
    const fingerprint = stableString(pick(entry[styleKey], properties));
    const bucket = buckets.get(fingerprint) || [];
    bucket.push(entry);
    buckets.set(fingerprint, bucket);
  });
  return [...buckets.entries()].sort((left, right) => right[1].length - left[1].length)[0] || ["", []];
}

function summarizeActions(actions = []) {
  const fingerprints = new Map();
  actions.forEach((action) => {
    const key = stableString({
      variant: action.variant,
      explicitVariant: action.explicitVariant,
      structuralStyle: action.structuralStyle,
      visualStyle: action.visualStyle,
    });
    const current = fingerprints.get(key) || {
      variant: action.variant,
      explicitVariant: action.explicitVariant,
      count: 0,
      structuralStyle: action.structuralStyle,
      visualStyle: action.visualStyle,
      examples: [],
    };
    current.count += 1;
    if (current.examples.length < 5) current.examples.push({ selector: action.selector, className: action.className, label: action.label });
    fingerprints.set(key, current);
  });
  return {
    total: actions.length,
    explicit: actions.filter((action) => action.explicitVariant).length,
    missingExplicit: actions.filter((action) => !action.explicitVariant).length,
    unclassified: actions.filter((action) => action.variant === "unclassified").length,
    variants: Object.fromEntries([...new Set(actions.map((action) => action.variant))].sort().map((variant) => [variant, actions.filter((action) => action.variant === variant).length])),
    fingerprints: [...fingerprints.values()],
  };
}

function summarizeTableControls(controls = [], total = controls.length) {
  return {
    total,
    sampled: controls.length,
    variants: Object.fromEntries([...new Set(controls.map((control) => `${control.variant}:${control.density}`))].sort().map((variant) => [variant, controls.filter((control) => `${control.variant}:${control.density}` === variant).length])),
  };
}

function summarizeFormControls(controls = [], total = controls.length) {
  return {
    total,
    sampled: controls.length,
    kinds: Object.fromEntries([...new Set(controls.map((control) => control.kind))].sort().map((kind) => [kind, controls.filter((control) => control.kind === kind).length])),
  };
}

function buildCrossModuleIssues(checks) {
  const hard = [];
  const warnings = [];
  const addHard = (code, message, details = {}) => hard.push(issue(code, message, details));
  const addWarning = (code, message, details = {}) => warnings.push(issue(code, message, details, "warning"));

  for (const viewport of viewports) {
    const viewportChecks = checks.filter((check) => check.viewport.id === viewport.id);
    const standardShellChecks = viewportChecks.filter((check) => (
      moduleProfiles[check.moduleId].shell === "standard"
      && check.moduleId !== "contourAdmin"
      && !(viewport.category === "narrow" && check.moduleId === "gantt")
    ));
    if (standardShellChecks.length) {
      const reference = standardShellChecks.find((check) => check.moduleId === "directories") || standardShellChecks[0];
      const shellProperties = ["width", "minWidth", "maxWidth", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "columnGap", "rowGap", "borderRightWidth", "borderBottomWidth", "backgroundColor", "backgroundImage"];
      const referenceMenu = stableString(pick(reference.styles.menu, shellProperties));
      standardShellChecks.forEach((check) => {
        const candidate = stableString(pick(check.styles.menu, shellProperties));
        if (candidate !== referenceMenu) addHard("module-menu-parity", "Desktop/mobile app menu fingerprint differs between modules", { viewport: viewport.id, moduleId: check.moduleId, referenceModule: reference.moduleId, actual: pick(check.styles.menu, shellProperties), expected: pick(reference.styles.menu, shellProperties) });
      });
    }

    const sidebarChecks = viewportChecks.filter((check) => ["sidebar-standard", "sidebar-planning"].includes(moduleProfiles[check.moduleId].family) && check.styles.sidebar);
    if (sidebarChecks.length) {
      const reference = sidebarChecks.find((check) => check.moduleId === "directories") || sidebarChecks[0];
      const properties = ["width", "minWidth", "maxWidth", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "columnGap", "rowGap", "borderTopWidth", "borderTopColor", "borderTopLeftRadius", "backgroundColor", "backgroundImage", "boxShadow"];
      const referenceFingerprint = stableString(pick(reference.styles.sidebar, properties));
      sidebarChecks.forEach((check) => {
        const candidate = stableString(pick(check.styles.sidebar, properties));
        if (candidate !== referenceFingerprint) addHard("module-sidebar-parity", "Module sidebar computed style differs from sidebar reference", { viewport: viewport.id, moduleId: check.moduleId, referenceModule: reference.moduleId, actual: pick(check.styles.sidebar, properties), expected: pick(reference.styles.sidebar, properties) });
      });
    }

    for (const component of ["ModuleWorkspace", "ModuleHeader", "Panel", "FormSection", "TableWrap"]) {
      const entries = viewportChecks.flatMap((check) => check.surfaces
        .filter((surface) => surface.component === component)
        .map((surface) => ({
          ...surface,
          moduleId: check.moduleId,
          family: moduleProfiles[check.moduleId].family,
          workspaceSurface: moduleProfiles[check.moduleId].workspaceSurface || "standard",
        })))
        .filter((entry) => !["auth-standalone", "gantt-protected", "admin-preview"].includes(entry.family));
      const parityEntries = entries.filter((entry) => component !== "ModuleWorkspace" || entry.workspaceSurface === "standard");
      if (parityEntries.length < 2) continue;
      const structuralProperties = [
        "borderTopWidth",
        "borderRightWidth",
        "borderBottomWidth",
        "borderLeftWidth",
        "borderTopStyle",
        "borderRightStyle",
        "borderBottomStyle",
        "borderLeftStyle",
        "borderTopLeftRadius",
        "borderTopRightRadius",
        "borderBottomRightRadius",
        "borderBottomLeftRadius",
      ];
      const visualProperties = ["borderTopColor", "borderRightColor", "backgroundColor", "backgroundImage", "boxShadow"];
      const [structuralMode, structuralModeEntries] = modeFingerprint(parityEntries, "style", structuralProperties);
      const structuralOutliers = parityEntries.filter((entry) => stableString(pick(entry.style, structuralProperties)) !== structuralMode);
      if (structuralOutliers.length) addHard("surface-structural-parity", `${component} border/radius fingerprint differs between modules`, {
        viewport: viewport.id,
        component,
        referenceModules: [...new Set(structuralModeEntries.map((entry) => entry.moduleId))],
        outliers: structuralOutliers.slice(0, 12).map((entry) => ({ moduleId: entry.moduleId, selector: entry.selector, style: pick(entry.style, structuralProperties) })),
      });
      const [visualMode] = modeFingerprint(parityEntries, "style", visualProperties);
      const visualOutliers = parityEntries.filter((entry) => stableString(pick(entry.style, visualProperties)) !== visualMode);
      if (visualOutliers.length) addWarning("surface-visual-parity", `${component} color/background/shadow fingerprint differs between modules`, {
        viewport: viewport.id,
        component,
        outliers: visualOutliers.slice(0, 12).map((entry) => ({ moduleId: entry.moduleId, selector: entry.selector, style: pick(entry.style, visualProperties) })),
      });
    }

    // Domain controls must still declare an explicit stable variant, but their
    // geometry is intentionally owned by the domain component (segmented
    // metrics, calendar controls, table editors). Cross-module parity applies
    // only to reusable ActionButton variants.
    const actionEntries = viewportChecks.flatMap((check) => check.actions.map((action) => ({ ...action, moduleId: check.moduleId }))
      .filter((action) => action.variant !== "unclassified" && !action.variant.startsWith("domain:")));
    const variants = [...new Set(actionEntries.map((entry) => entry.variant))];
    variants.forEach((variant) => {
      const entries = actionEntries.filter((entry) => entry.variant === variant);
      if (entries.length < 2) return;
      const [structuralMode, structuralModeEntries] = modeFingerprint(entries, "structuralStyle", structuralButtonStyleProperties);
      const structuralOutliers = entries.filter((entry) => stableString(pick(entry.structuralStyle, structuralButtonStyleProperties)) !== structuralMode);
      if (structuralOutliers.length) addHard("action-structural-parity", `ActionButton variant ${variant} has structural computed-style outliers`, {
        viewport: viewport.id,
        variant,
        referenceModules: [...new Set(structuralModeEntries.map((entry) => entry.moduleId))],
        outliers: structuralOutliers.slice(0, 12).map((entry) => ({ moduleId: entry.moduleId, selector: entry.selector, label: entry.label, style: pick(entry.structuralStyle, structuralButtonStyleProperties) })),
      });
      const [visualMode] = modeFingerprint(entries, "visualStyle", visualButtonStyleProperties);
      const visualOutliers = entries.filter((entry) => stableString(pick(entry.visualStyle, visualButtonStyleProperties)) !== visualMode);
      if (visualOutliers.length) addWarning("action-visual-parity", `ActionButton variant ${variant} has color/background/shadow outliers`, {
        viewport: viewport.id,
        variant,
        outliers: visualOutliers.slice(0, 12).map((entry) => ({ moduleId: entry.moduleId, selector: entry.selector, label: entry.label, style: pick(entry.visualStyle, visualButtonStyleProperties) })),
      });
    });

    const formEntries = viewportChecks.flatMap((check) => check.formControls.map((control) => ({ ...control, moduleId: check.moduleId })));
    const formKinds = [...new Set(formEntries.map((entry) => entry.kind))];
    formKinds.forEach((kind) => {
      const entries = formEntries.filter((entry) => entry.kind === kind);
      if (entries.length < 2) return;
      const [mode, modeEntries] = modeFingerprint(entries, "style", formControlStyleProperties);
      const outliers = entries.filter((entry) => stableString(pick(entry.style, formControlStyleProperties)) !== mode);
      if (outliers.length) addHard("form-control-structural-parity", `FormField ${kind} has computed-style outliers`, {
        viewport: viewport.id,
        kind,
        referenceModules: [...new Set(modeEntries.map((entry) => entry.moduleId))],
        outliers: outliers.slice(0, 12).map((entry) => ({ moduleId: entry.moduleId, selector: entry.selector, style: pick(entry.style, formControlStyleProperties) })),
      });
    });
  }

  return { hard, warnings };
}

async function getBootstrapSnapshotStorageSeed() {
  const raw = await readFile(join(projectRoot, "bootstrap-snapshot.json"), "utf8").catch((error) => {
    if (error?.code === "ENOENT") return "";
    throw error;
  });
  // A clean commit-derived worktree intentionally has no operational
  // bootstrap snapshot. In that case the visual contract runs against the
  // deterministic application defaults; release staging separately verifies
  // and injects the contour-owned compatibility artifact.
  if (!raw) return {};
  const snapshot = JSON.parse(raw);
  return snapshot.values && typeof snapshot.values === "object" ? snapshot.values : {};
}

async function seedStorage(client, values) {
  await evaluate(client, ({ values, sharedDisabledKey }) => {
    sessionStorage.setItem(sharedDisabledKey, String(Date.now() + 5 * 60 * 1000));
    Object.entries(values || {}).forEach(([key, value]) => {
      if (typeof value === "string") localStorage.setItem(key, value);
    });
  }, { values, sharedDisabledKey });
}

async function checkNormalHostContourVisibility(client) {
  const normalUrl = new URL(moduleUrl("gantt"));
  normalUrl.searchParams.set("qa", "ui-visual-parity-contour-normal-host");
  await client.send("Page.navigate", { url: normalUrl.toString() });
  await waitForLayout(client, "gantt");
  const menu = await evaluate(client, () => ({
    hostname: location.hostname,
    qaAuthBypass: new URLSearchParams(location.search).get("qa-auth-bypass") === "1",
    layoutPage: document.querySelector("main.app-shell")?.dataset.layoutPage || "",
    contourDesktopTabs: document.querySelectorAll('.module-tab[data-module="contourAdmin"]').length,
    contourMobileTabs: document.querySelectorAll('.mobile-module-tab[data-module="contourAdmin"]').length,
    adminStandalone: document.querySelector("main.app-shell")?.classList.contains("is-admin-standalone") || false,
  }));

  const deepLinkUrl = new URL(moduleUrl("contourAdmin"));
  deepLinkUrl.searchParams.set("qa", "ui-visual-parity-contour-deep-link");
  await client.send("Page.navigate", { url: deepLinkUrl.toString() });
  await waitForLayout(client);
  const deepLink = await evaluate(client, () => ({
    hostname: location.hostname,
    layoutPage: document.querySelector("main.app-shell")?.dataset.layoutPage || "",
    adminStandalone: document.querySelector("main.app-shell")?.classList.contains("is-admin-standalone") || false,
  }));

  const hard = [];
  if (menu.hostname === "admin.mes-line.ru") hard.push(issue("contour-normal-host-fixture", "Normal-host contour test unexpectedly runs on admin hostname", { actual: menu.hostname }));
  if (menu.contourDesktopTabs || menu.contourMobileTabs) hard.push(issue("contour-normal-host-visibility", "Contour Admin navigation must not be visible on a normal host", { actual: { desktop: menu.contourDesktopTabs, mobile: menu.contourMobileTabs, hostname: menu.hostname } }));
  if (menu.adminStandalone) hard.push(issue("contour-normal-host-shell", "Normal host unexpectedly entered admin-standalone shell", { actual: menu }));
  if (deepLink.layoutPage === "contourAdmin" || deepLink.adminStandalone) hard.push(issue("contour-normal-host-deep-link", "Normal-host contourAdmin deep link must normalize to an allowed non-admin module", { actual: deepLink }));
  return { menu, deepLink, hard, warnings: [] };
}

function buildMarkdown(report) {
  const checkRows = report.checks.map((check) => [
    check.viewport.id,
    check.moduleId,
    check.profile.family,
    String(check.hardIssues.length),
    String(check.warnings.length),
    check.hardIssues.slice(0, 3).map((entry) => entry.code).join(", "),
  ]);
  const hardRows = report.hardIssues.slice(0, 120).map((entry) => [
    entry.viewport || "-",
    entry.moduleId || "-",
    entry.code,
    String(entry.message || "").replace(/\|/g, "\\|"),
  ]);
  const warningRows = report.warnings.slice(0, 120).map((entry) => [
    entry.viewport || "-",
    entry.moduleId || "-",
    entry.code,
    String(entry.message || "").replace(/\|/g, "\\|"),
  ]);
  const table = (headers, rows) => `${headers.join(" | ")}\n${headers.map(() => "---").join(" | ")}\n${rows.map((row) => row.join(" | ")).join("\n")}`;
  return `# UI Module Visual Parity QA

Generated: ${report.generatedAt}

Mode: ${report.strict ? "strict" : "report-only"}

## Summary

- modules: ${report.modules.length}
- viewports: ${report.viewports.map((viewport) => `${viewport.id} ${viewport.width}x${viewport.height}`).join(", ")}
- checks: ${report.summary.checks}
- hard issues: ${report.summary.hardIssues}
- warnings: ${report.summary.warnings}
- status: ${report.status}
- strict integrated into qa:ui: ${report.qaUiStrictIntegrated ? "yes" : "no"}

## Module checks

${table(["viewport", "module", "profile", "hard", "warnings", "first hard codes"], checkRows)}

## Hard issues (first 120)

${hardRows.length ? table(["viewport", "module", "code", "message"], hardRows) : "No hard issues."}

## Warnings (first 120)

${warningRows.length ? table(["viewport", "module", "code", "message"], warningRows) : "No warnings."}
`;
}

async function writeReports(report) {
  await Promise.all([
    mkdir(dirname(reportJsonPath), { recursive: true }),
    mkdir(dirname(reportMarkdownPath), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(reportMarkdownPath, buildMarkdown(report), "utf8"),
  ]);
}

async function run() {
  const storageSeed = await getBootstrapSnapshotStorageSeed();
  const chrome = await launchChrome();
  const checks = [];
  let contourVisibility = null;
  try {
    const { client } = chrome;
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.navigate", { url: moduleUrl("directories") });
    await waitForLayout(client, "directories");
    await seedStorage(client, storageSeed);

    for (const viewport of viewports) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.category === "narrow",
      });
      for (const moduleId of moduleIds) {
        await client.send("Page.navigate", { url: moduleUrl(moduleId) });
        await waitForLayout(client, moduleId);
        await stabilizeVisualState(client);
        const snapshot = await collectSnapshot(client, moduleId, viewport);
        const validation = validateSnapshot(snapshot, moduleProfiles[moduleId]);
        checks.push({
          ...snapshot,
          profile: moduleProfiles[moduleId],
          hardIssues: validation.hard.map((entry) => ({ ...entry, moduleId, viewport: viewport.id })),
          warnings: validation.warnings.map((entry) => ({ ...entry, moduleId, viewport: viewport.id })),
        });
      }
    }

    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 932,
      deviceScaleFactor: 1,
      mobile: false,
    });
    contourVisibility = await checkNormalHostContourVisibility(client);
  } finally {
    await cleanupChrome(chrome);
  }

  const crossModule = buildCrossModuleIssues(checks);
  const hardIssues = [
    ...checks.flatMap((check) => check.hardIssues),
    ...crossModule.hard,
    ...(contourVisibility?.hard || []).map((entry) => ({ ...entry, moduleId: "contourAdmin", viewport: "desktop" })),
  ];
  const warnings = [
    ...checks.flatMap((check) => check.warnings),
    ...crossModule.warnings,
    ...(contourVisibility?.warnings || []).map((entry) => ({ ...entry, moduleId: "contourAdmin", viewport: "desktop" })),
  ];
  const report = {
    version: 1,
    contract: "ui-module-visual-parity-v1",
    generatedAt: new Date().toISOString(),
    baseUrl,
    strict,
    status: hardIssues.length ? "debt" : "passed",
    qaUiStrictIntegrated: true,
    modules: moduleIds,
    viewports,
    profiles: moduleProfiles,
    tolerances: { geometryPx: 1, radiusPx: 0.6, standardSurfaceRadiusMaxPx: 8.6 },
    summary: {
      checks: checks.length,
      hardIssues: hardIssues.length,
      warnings: warnings.length,
      explicitVariantMissing: checks
        .filter((check) => !moduleProfiles[check.moduleId].skipActionVariants)
        .reduce((sum, check) => sum + check.actions.filter((action) => !action.explicitVariant).length, 0),
      unclassifiedActions: checks
        .filter((check) => !moduleProfiles[check.moduleId].skipActionVariants)
        .reduce((sum, check) => sum + check.actions.filter((action) => action.variant === "unclassified").length, 0),
      tableControlOccurrences: checks.reduce((sum, check) => sum + Number(check.counts.tableControls || 0), 0),
      formControlOccurrences: checks.reduce((sum, check) => sum + Number(check.counts.formControls || 0), 0),
    },
    contourVisibility,
    crossModule,
    hardIssues,
    warnings,
    checks: checks.map(({ actions, tableControls, formControls, ...check }) => ({
      ...check,
      actionSummary: summarizeActions(actions),
      tableControlSummary: summarizeTableControls(tableControls, check.counts.tableControls),
      formControlSummary: summarizeFormControls(formControls, check.counts.formControls),
    })),
  };
  if (writeReport) await writeReports(report);

  console.log("MES UI Module Visual Parity QA");
  console.log(`- mode: ${strict ? "strict" : "report-only"}`);
  console.log(`- modules: ${moduleIds.length}`);
  console.log(`- viewports: ${viewports.map((viewport) => `${viewport.id} ${viewport.width}x${viewport.height}`).join(", ")}`);
  console.log(`- checks: ${checks.length}`);
  console.log(`- hard issues: ${hardIssues.length}`);
  console.log(`- warnings: ${warnings.length}`);
  console.log(`- explicit ActionButton variants missing: ${report.summary.explicitVariantMissing}`);
  if (writeReport) {
    console.log(`- JSON: ${reportJsonPath}`);
    console.log(`- Markdown: ${reportMarkdownPath}`);
  } else {
    console.log("- report: not written (pass --write-report to save JSON and Markdown artifacts)");
  }

  if (strict && hardIssues.length) {
    const preview = hardIssues.slice(0, 20).map((entry) => `${entry.viewport || "-"}/${entry.moduleId || "-"}/${entry.code}: ${entry.message}`).join("\n- ");
    throw new Error(`UI module visual parity strict gate failed (${hardIssues.length} hard issues):\n- ${preview}`);
  }
  if (hardIssues.length) console.log("Report-only mode: visual parity debt recorded without failing the command.");
  else console.log("OK: UI module visual parity hard invariants passed.");
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
