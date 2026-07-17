import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const defaultModuleId = "shiftMasterBoard";
const defaultBaseUrl = process.env.MES_QA_URL || "http://localhost:4174/";
const defaultReportPath = "reports/visual-fast-check-last-run.json";

function getArg(name, fallback = "") {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pathExists(path) {
  try {
    const stats = await stat(path);
    return stats.isFile();
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
  const startedAt = performance.now();
  let lastError;
  while (performance.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await delay(80);
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
      const { resolve, reject, timer } = this.pending.get(message.id);
      clearTimeout(timer);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result || {});
      return;
    }
    if (message.method && this.listeners.has(message.method)) {
      for (const listener of this.listeners.get(message.method)) listener(message.params || {});
    }
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
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
      this.pending.set(id, { resolve, reject, timer });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  close() {
    this.socket.close();
  }
}

async function startChrome() {
  const port = await getFreePort();
  const profileDir = await mkdtemp(join(tmpdir(), "mes-visual-fast-"));
  const chromePath = await findChrome();
  const child = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--hide-scrollbars",
    "about:blank",
  ], {
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`, 10000);
    const target = await requestJson(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    if (!target.webSocketDebuggerUrl) throw new Error("Chrome did not expose a page debugger socket.");
    const client = new CdpClient(target.webSocketDebuggerUrl);
    await client.ready;
    return { child, client, profileDir, stderr };
  } catch (error) {
    child.kill("SIGTERM");
    await rm(profileDir, { recursive: true, force: true });
    throw error;
  }
}

async function stopChrome(chrome) {
  chrome.client?.close();
  if (chrome.child && !chrome.child.killed) chrome.child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (!chrome.child || chrome.child.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, 1000);
    chrome.child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await rm(chrome.profileDir, { recursive: true, force: true }).catch(() => {});
}

async function evaluate(client, pageFunction, arg) {
  const source = typeof pageFunction === "function" ? pageFunction.toString() : pageFunction;
  const expression = arg === undefined ? `(${source})()` : `(${source})(${JSON.stringify(arg)})`;
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, 30000);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

function buildModuleUrl(baseUrl, moduleId) {
  const url = new URL(baseUrl);
  url.searchParams.set("module", moduleId);
  url.searchParams.set("qa-auth-bypass", "1");
  url.searchParams.set("qa", "visual-fast-check");
  url.searchParams.set("__mes_cache_refresh", `visual-fast-${Date.now()}`);
  return url.toString();
}

async function waitForApp(client, moduleId, timeoutMs = 12000) {
  const startedAt = performance.now();
  let lastReport = null;
  while (performance.now() - startedAt < timeoutMs) {
    const report = await evaluate(client, (expectedModuleId) => {
      const shell = document.querySelector("main.app-shell");
      const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
      return {
        hasShell: Boolean(shell),
        layoutPage: shell?.dataset.layoutPage || "",
        bodyTextLength: bodyText.length,
        startupError: /Ошибка запуска интерфейса|ReferenceError|TypeError|SyntaxError/.test(bodyText),
        ready: Boolean(shell) && shell.dataset.layoutPage === expectedModuleId && bodyText.length > 40,
      };
    }, moduleId);
    lastReport = report;
    if (report.ready && !report.startupError) return report;
    await delay(100);
  }
  throw new Error(`${moduleId}: page did not become ready. Last report: ${JSON.stringify(lastReport)}`);
}

async function collectVisualReport(client, moduleId) {
  return evaluate(client, (id) => {
    const shell = document.querySelector("main.app-shell");
    const selectorFor = (element) => {
      if (!element) return "";
      if (element.id) return `#${element.id}`;
      const className = String(element.className || "").trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".");
      return `${element.tagName.toLowerCase()}${className ? `.${className}` : ""}`;
    };
    const metricFor = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        selector,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
        display: style.display,
        gap: style.gap,
        padding: style.padding,
        background: style.backgroundColor,
        border: style.borderTopColor,
      };
    };
    const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    const overflowX = Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const tinyTargets = Array.from(document.querySelectorAll("button, input, select, textarea, summary, a[href]"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && (rect.width < 24 || rect.height < 24);
      })
      .slice(0, 8)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          selector: selectorFor(element),
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
          text: (element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 80),
        };
      });

    return {
      moduleId: id,
      layoutPage: shell?.dataset.layoutPage || "",
      appVersion: document.querySelector(".app-version, [data-app-version]")?.textContent?.trim() || "",
      bodyTextLength: bodyText.length,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      overflowX,
      tinyTargets,
      startupError: /Ошибка запуска интерфейса|ReferenceError|TypeError|SyntaxError/.test(bodyText),
      keyMetrics: {
        moduleContent: metricFor(".module-data-content"),
        shiftContent: metricFor(".shift-master-board-content"),
        shiftTopControls: metricFor(".shift-master-board-top-controls"),
        shiftTopRow: metricFor(".shift-master-board-top-row"),
        shiftMainGrid: metricFor(".shift-master-board-main-grid"),
      },
    };
  }, moduleId);
}

async function main() {
  const startedAt = performance.now();
  const moduleId = getArg("--module", defaultModuleId);
  const baseUrl = getArg("--url", defaultBaseUrl);
  const reportPath = getArg("--report", defaultReportPath);
  const writeReport = !hasFlag("--no-report");
  const targetUrl = buildModuleUrl(baseUrl, moduleId);
  const chromeStartedAt = performance.now();
  const chrome = await startChrome();
  const timings = {
    chromeStartMs: Math.round(performance.now() - chromeStartedAt),
  };
  const consoleErrors = [];
  try {
    await chrome.client.send("Page.enable");
    await chrome.client.send("Runtime.enable");
    await chrome.client.send("Emulation.setDeviceMetricsOverride", {
      width: Number(getArg("--width", "1710")),
      height: Number(getArg("--height", "1112")),
      deviceScaleFactor: 1,
      mobile: false,
    });
    chrome.client.on("Runtime.consoleAPICalled", (event) => {
      if (event.type !== "error") return;
      consoleErrors.push((event.args || []).map((arg) => arg.value || arg.description || "").join(" ").slice(0, 240));
    });
    chrome.client.on("Runtime.exceptionThrown", (event) => {
      consoleErrors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || "Runtime exception");
    });

    const navigateStartedAt = performance.now();
    const loaded = new Promise((resolve) => {
      const timer = setTimeout(resolve, 12000);
      chrome.client.on("Page.loadEventFired", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    await chrome.client.send("Page.navigate", { url: targetUrl });
    await loaded;
    timings.navigateMs = Math.round(performance.now() - navigateStartedAt);

    const readyStartedAt = performance.now();
    const readyReport = await waitForApp(chrome.client, moduleId);
    timings.readyMs = Math.round(performance.now() - readyStartedAt);

    const report = await collectVisualReport(chrome.client, moduleId);
    report.readyReport = readyReport;
    report.consoleErrors = consoleErrors;
    report.targetUrl = targetUrl;
    report.timings = {
      ...timings,
      totalMs: Math.round(performance.now() - startedAt),
    };
    report.status = report.startupError || consoleErrors.length || report.overflowX > 0 ? "warn" : "ok";

    if (writeReport) {
      await mkdir("reports", { recursive: true });
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }

    console.log(`Visual fast check ${report.status.toUpperCase()} ${moduleId}`);
    console.log(JSON.stringify({
      moduleId,
      status: report.status,
      totalMs: report.timings.totalMs,
      navigateMs: report.timings.navigateMs,
      readyMs: report.timings.readyMs,
      overflowX: report.overflowX,
      tinyTargets: report.tinyTargets.length,
      consoleErrors: report.consoleErrors.length,
      reportPath: writeReport ? reportPath : "",
    }, null, 2));

    if (report.startupError || consoleErrors.length || report.overflowX > 0) process.exitCode = 1;
  } finally {
    await stopChrome(chrome);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
