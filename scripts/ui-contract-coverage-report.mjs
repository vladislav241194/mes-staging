import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { MES_MODULE_FLOW_CONTRACTS } from "../src/mes_contracts.js";
import {
  PARTIAL_UI_RUNTIME_CONTRACTS,
  SPECIAL_UI_RUNTIME_CONTRACTS,
  getUiRuntimeCoverageStatus,
} from "../src/ui_runtime_contracts.js";

const baseUrl = process.env.MES_QA_URL || "http://localhost:4174/";
const coverageModules = [
  "gantt",
  "planning",
  "dispatch",
  "shiftMasterBoard",
  "authSessionPrototype",
  "shiftWorkOrders",
  "routes",
  "products",
  "nomenclature",
  "productionStructureMatrix",
  "employees",
  "timesheet",
  "roles",
  "directories",
  "visualSystem",
  "authPrototype",
  "planningTable",
  "supply",
  "shopMap",
];
const trackedComponents = [
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
  "GanttToolbar",
  "GanttCanvas",
  "GanttTimeline",
  "GanttRowsLayer",
  "GanttSlot",
  "GanttResizeHandle",
  "GanttDependencyLayer",
  "GanttDependencyPath",
  "GanttDependencyArrow",
  "VisualSystemRuntime",
];
const viewport = { width: 1710, height: 1112 };
const reportJsonPath = "reports/ui-contract-coverage.json";
const reportMarkdownPath = "docs/ui-contract-coverage-report.md";
const sharedDisabledKey = "mes-planning-prototype-shared-disabled-until-v1";

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
  const profileDir = await mkdtemp(join(tmpdir(), "mes-ui-contract-coverage-"));
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
  url.searchParams.set("qa", "ui-contract-coverage");
  return url.toString();
}

function getRegistryStatus(moduleId) {
  const status = getUiRuntimeCoverageStatus(moduleId);
  if (status === "hard") return "contract";
  if (status === "special") return "special-runtime";
  return status;
}

function resolveDomStatus(moduleId, report) {
  const registryStatus = getRegistryStatus(moduleId);
  if (registryStatus === "special-runtime") return registryStatus;
  if (registryStatus === "partial") return registryStatus;
  if (registryStatus === "unknown") return "unknown";
  if (!report.appShell || !report.components.ModulePage) return "legacy";
  if (!report.components.ModuleHeader || !report.components.Panel) return "partial";
  return "contract";
}

function getExceptionReason(moduleId, status, components) {
  if (status === "special-runtime") {
    const contract = SPECIAL_UI_RUNTIME_CONTRACTS[moduleId];
    return contract?.component ? `${contract.runtime}: ${contract.component}` : "special runtime";
  }
  if (status === "partial") {
    return PARTIAL_UI_RUNTIME_CONTRACTS[moduleId]?.reason || "partial runtime contract";
  }
  if (!components.TableWrap && ["authPrototype", "authSessionPrototype", "shopMap", "timesheet", "productionStructureMatrix"].includes(moduleId)) {
    return "layout/data-dense module: TableWrap may be absent or specialized on some states";
  }
  return "";
}

function getNextMigration(moduleId, components) {
  if (PARTIAL_UI_RUNTIME_CONTRACTS[moduleId]?.nextMigration) {
    return PARTIAL_UI_RUNTIME_CONTRACTS[moduleId].nextMigration;
  }
  const missing = [];
  if (!components.ModulePage) missing.push("ModulePage");
  if (!components.ModuleHeader) missing.push("ModuleHeader");
  if (!components.Panel) missing.push("Panel");
  if (!components.ActionBar) missing.push("ActionBar/Toolbar");
  if (!components.TableWrap && ["planning", "shiftWorkOrders", "routes", "products", "nomenclature", "directories", "planningTable", "roles"].includes(moduleId)) {
    missing.push("TableWrap");
  }
  if (!components.StatusToken && ["planning", "shiftWorkOrders", "routes", "supply", "roles"].includes(moduleId)) {
    missing.push("StatusToken");
  }
  return missing.length ? missing.join(", ") : "covered";
}

async function waitForModuleCoverage(client, moduleId) {
  const expectedLayout = moduleId;
  const expectedContract = MES_MODULE_FLOW_CONTRACTS[moduleId] || {};
  const startedAt = Date.now();
  let lastReport = null;
  while (Date.now() - startedAt < 25000) {
    const report = await evaluate(client, ({ trackedComponents, expectedLayout }) => {
      const componentCounts = {};
      trackedComponents.forEach((component) => {
        componentCounts[component] = document.querySelectorAll(`[data-ui-component="${component}"]`).length;
      });
      const components = Object.fromEntries(
        trackedComponents.map((component) => [component, componentCounts[component] > 0])
      );
      const shell = document.querySelector("main.app-shell");
      const layoutPage = shell?.dataset.layoutPage || "";
      const bodyText = (document.body?.innerText || "").trim().replace(/\s+/g, " ");
      const runtimeErrors = /Ошибка запуска интерфейса|Cannot initialize|ReferenceError|TypeError/.test(bodyText);
      const appShell = Boolean(document.querySelector('main.app-shell[data-layout="app-shell"]'));
      const documentedException = Boolean(document.querySelector("[data-ui-contract-exception]"));
      return {
        ready: Boolean(shell) && layoutPage === expectedLayout,
        layoutPage,
        appShell,
        components,
        componentCounts,
        documentedException,
        runtimeErrors,
        title: (document.querySelector(".app-topbar-title h1")?.textContent || "").trim(),
        mainTextLength: bodyText.length,
      };
    }, { trackedComponents, expectedLayout });
    lastReport = report;
    if (report.ready && report.mainTextLength > 40 && !report.runtimeErrors) {
      return {
        module: moduleId,
        label: expectedContract.label || moduleId,
        ...report,
      };
    }
    await delay(140);
  }
  throw new Error(`${moduleId}: UI contract coverage page did not become ready. Last report: ${JSON.stringify(lastReport)}`);
}

async function getPresetStorageSeed() {
  const raw = await readFile("workflow-preset.json", "utf8");
  const preset = JSON.parse(raw);
  return preset.values && typeof preset.values === "object" ? preset.values : {};
}

function buildMarkdownReport(result) {
  const rows = result.modules.map((item) => {
    const mark = (value) => value ? "yes" : "-";
    return [
      item.module,
      item.status,
      mark(item.appShell),
      mark(item.components.ModulePage),
      mark(item.components.Panel),
      mark(item.components.TableWrap),
      mark(item.components.ActionButton),
      mark(item.components.StatusToken),
      mark(item.hasOverlay),
      item.exceptionReason || "",
      item.nextMigration,
    ].join(" | ");
  });
  return `# UI Contract Coverage Report

Generated: ${result.generatedAt}

Viewport: ${result.viewport.width}x${result.viewport.height}

## Summary

- modules checked: ${result.modules.length}
- contract: ${result.summary.contract}
- special-runtime: ${result.summary["special-runtime"]}
- partial: ${result.summary.partial}
- legacy: ${result.summary.legacy}
- unknown: ${result.summary.unknown}

## Modules

module | status | AppShell | ModulePage | Panel | TableWrap | ActionButton | StatusToken | Overlay | exception | next migration
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
${rows.join("\n")}

## Component Counts

${result.modules.map((item) => {
  const counts = Object.entries(item.componentCounts)
    .filter(([, count]) => count > 0)
    .map(([component, count]) => `${component}:${count}`)
    .join(", ");
  return `- ${item.module}: ${counts || "no tracked components"}`;
}).join("\n")}
`;
}

async function writeReports(result) {
  await mkdir(dirname(reportJsonPath), { recursive: true });
  await mkdir(dirname(reportMarkdownPath), { recursive: true });
  await writeFile(reportJsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(reportMarkdownPath, buildMarkdownReport(result), "utf8");
}

function assertCoverage(result) {
  const failures = [];
  result.modules.forEach((item) => {
    if (item.status === "unknown") failures.push(`${item.module}: unknown UI coverage status`);
    if (item.status === "contract" || item.status === "partial") {
      if (!item.appShell) failures.push(`${item.module}: missing app shell`);
      if (!item.components.ModulePage) failures.push(`${item.module}: missing ModulePage`);
      if (!item.components.Panel) failures.push(`${item.module}: missing Panel`);
    }
    if (item.status === "special-runtime") {
      const expectedComponent = SPECIAL_UI_RUNTIME_CONTRACTS[item.module]?.component;
      if (expectedComponent && item.componentCounts[expectedComponent] === 0) {
        failures.push(`${item.module}: missing special component ${expectedComponent}`);
      }
    }
  });
  if (failures.length) {
    throw new Error(`UI contract coverage failed:\n- ${failures.join("\n- ")}`);
  }
}

async function run() {
  const presetStorageSeed = await getPresetStorageSeed();
  const chrome = await launchChrome();
  try {
    const { client } = chrome;
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send("Page.navigate", { url: moduleUrl("planning") });
    await delay(400);
    await evaluate(client, ({ presetStorageSeed, sharedDisabledKey }) => {
      sessionStorage.setItem(sharedDisabledKey, String(Date.now() + 5 * 60 * 1000));
      Object.entries(presetStorageSeed || {}).forEach(([key, value]) => {
        if (typeof value === "string") localStorage.setItem(key, value);
      });
    }, { presetStorageSeed, sharedDisabledKey });

    const modules = [];
    for (const moduleId of coverageModules) {
      await client.send("Page.navigate", { url: moduleUrl(moduleId) });
      const report = await waitForModuleCoverage(client, moduleId);
      const status = resolveDomStatus(moduleId, report);
      const hasOverlay = Boolean(report.components.Modal || report.components.Drawer || report.components.Dropdown);
      modules.push({
        module: moduleId,
        label: report.label,
        status,
        registryStatus: getRegistryStatus(moduleId),
        appShell: report.appShell,
        layoutPage: report.layoutPage,
        components: report.components,
        componentCounts: report.componentCounts,
        hasOverlay,
        documentedException: report.documentedException,
        exceptionReason: getExceptionReason(moduleId, status, report.components),
        nextMigration: status === "special-runtime" ? "special guardrails only" : getNextMigration(moduleId, report.components),
      });
    }

    const summary = { contract: 0, "special-runtime": 0, partial: 0, legacy: 0, unknown: 0 };
    modules.forEach((item) => {
      summary[item.status] = (summary[item.status] || 0) + 1;
    });
    const result = {
      generatedAt: new Date().toISOString(),
      viewport,
      summary,
      modules,
    };
    assertCoverage(result);
    await writeReports(result);
    console.log("MES UI Contract Coverage Report");
    console.log(`- modules checked: ${modules.length}`);
    console.log(`- contract: ${summary.contract}`);
    console.log(`- special-runtime: ${summary["special-runtime"]}`);
    console.log(`- partial: ${summary.partial}`);
    console.log(`- legacy: ${summary.legacy}`);
    console.log(`- unknown: ${summary.unknown}`);
    console.log(`- report: ${reportMarkdownPath}`);
    console.log(`- json: ${reportJsonPath}`);
    console.log("OK: UI contract coverage is explicit for every checked module.");
  } finally {
    await cleanupChrome(chrome);
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
