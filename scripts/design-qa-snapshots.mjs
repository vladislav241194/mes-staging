import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultUrl = "http://localhost:4174/";
const defaultOutDir = join(projectRoot, "tmp", `design-qa-snapshots-${Date.now()}`);
const uiStorageKey = "mes-planning-prototype-ui-v1";
const viewports = [
  { name: "desktop-1556", width: 1556, height: 1006, mobile: false },
  { name: "mobile-390", width: 390, height: 844, mobile: true },
  { name: "mobile-430", width: 430, height: 932, mobile: true },
  { name: "tablet-768", width: 768, height: 1024, mobile: true },
];
const moduleIds = ["visualSystem", "gantt", "routes", "products", "supply", "directories"];

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
  const loaded = client.waitForEvent("Page.loadEventFired", 15000).catch(() => null);
  await client.send("Page.navigate", { url });
  await loaded;
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
    if (!window.__mesVisualQaRuntime?.navigateToModule) return "";
    return window.__mesVisualQaRuntime.navigateToModule(id);
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
    if (activeAfterClick === moduleId) return;
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const ok = await evaluate(client, (payload) => {
      const { id, storageKey } = payload;
      const current = document.querySelector("main.app-shell")?.dataset.layoutPage || "";
      if (current === id) return true;
      const state = JSON.parse(localStorage.getItem(storageKey) || "{}");
      state.activeRole = "operator";
      state.activeModule = id;
      localStorage.setItem(storageKey, JSON.stringify(state));
      window.location.reload();
      return true;
    }, { id: moduleId, storageKey: uiStorageKey });
    if (!ok) throw new Error(`Cannot switch to module ${moduleId}`);
    await delay(650 + attempt * 250);
    await waitForApp(client);
    const activeModule = await evaluate(client, () => document.querySelector("main.app-shell")?.dataset.layoutPage || "");
    if (activeModule === moduleId) return;
  }
  const activeModule = await evaluate(client, () => document.querySelector("main.app-shell")?.dataset.layoutPage || "");
  throw new Error(`Expected module ${moduleId}, got ${activeModule || "unknown"}`);
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
    const isAllowedScroll = (el) => {
      const root = el.closest(ignoredScrollRootSelector);
      return Boolean(root && (root.scrollWidth > root.clientWidth + 2 || root.scrollHeight > root.clientHeight + 2));
    };
    const outside = [];
    const tiny = [];
    const floating = [];
    const textOverflow = [];
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
      if ((type === "checkbox" || type === "radio") && rect.width >= 16 && rect.height >= 24) continue;
      if (el.closest("label") && el.closest("label").getBoundingClientRect().height >= 36) continue;
      const min = viewport.width <= 768 ? 36 : 28;
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

    return {
      id,
      module: root?.dataset.layoutPage || "",
      viewport,
      docWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      pageOverflowX: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - viewport.width,
      outside: outside.slice(0, 12),
      tiny: tiny.slice(0, 12),
      floating: floating.slice(0, 12),
      textOverflow: textOverflow.slice(0, 12),
      counts: {
        outside: outside.length,
        tiny: tiny.length,
        floating: floating.length,
        textOverflow: textOverflow.length,
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
      lines.push(`- ${moduleItem.failed ? "FAIL" : "OK"} ${moduleItem.id}: overflowX=${moduleItem.pageOverflowX}, outside=${moduleItem.counts.outside}, tiny=${moduleItem.counts.tiny}, floating=${moduleItem.counts.floating}, text=${moduleItem.counts.textOverflow}`);
      if (moduleItem.screenshot) lines.push(`  - screenshot: ${moduleItem.screenshot}`);
      for (const issue of [...moduleItem.outside, ...moduleItem.tiny, ...moduleItem.floating, ...moduleItem.textOverflow].slice(0, 3)) {
        lines.push(`  - ${issue.selector}: ${issue.text || JSON.stringify(issue.rect || {})}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
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
      for (const moduleId of moduleIds) {
        await switchModule(client, moduleId);
        const audit = await auditVisualLayout(client, moduleId);
        audit.screenshot = await saveScreenshot(client, outDir, viewport.name, moduleId).catch((error) => {
          audit.screenshotError = error.message;
          return "";
        });
        audit.failed = audit.pageOverflowX > 1
          || audit.counts.outside > 0
          || audit.counts.tiny > 0
          || audit.counts.floating > 0
          || audit.counts.textOverflow > 0;
        if (audit.failed) hasFailure = true;
        viewportReport.modules.push(audit);
      }
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
      console.log(`  FAIL ${failure.id}: overflowX=${failure.pageOverflowX}, outside=${failure.counts.outside}, tiny=${failure.counts.tiny}, floating=${failure.counts.floating}, text=${failure.counts.textOverflow}`);
    }
  }
  if (hasFailure) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
