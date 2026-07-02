import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const defaultUrl = new URL("/?module=gantt&qa-auth-bypass=1&qa=boot-performance", process.env.MES_QA_URL || "http://localhost:4174/").toString();
const bootStorageKey = "mes-boot-performance-last";
const sharedDisabledKey = "mes-planning-prototype-shared-disabled-until-v1";
const startupTotalBudgetMs = 15000;
const loadStateBudgetMs = 5000;
const firstRenderBudgetMs = 6000;

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

function getStep(report, stepName) {
  return (report.entries || []).find((entry) => entry.step === stepName) || null;
}

function getStepMs(step = null) {
  const value = Number(step?.ms);
  return Number.isFinite(value) ? value : null;
}

async function main() {
  const url = getArg("--url", defaultUrl);
  const chrome = await launchChrome();
  try {
    const { client } = chrome;
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `sessionStorage.setItem(${JSON.stringify(sharedDisabledKey)}, String(Date.now() + 60 * 60 * 1000));`,
    });
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1556,
      height: 1006,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send("Page.navigate", { url });
    const report = await waitForBootReport(client);
    const loadState = getStep(report, "loadState");
    const firstRender = getStep(report, "first render");
    const loadStateMs = getStepMs(loadState);
    const firstRenderMs = getStepMs(firstRender);
    const stepNames = (report.entries || []).map((entry) => entry.step).join(", ");

    assert(report.totalMs <= startupTotalBudgetMs, `Startup took ${report.totalMs} ms, budget is ${startupTotalBudgetMs} ms.`);
    assert(loadStateMs !== null && loadStateMs <= loadStateBudgetMs, `loadState took ${loadStateMs ?? "unknown"} ms, budget is ${loadStateBudgetMs} ms. Steps: ${stepNames}`);
    assert(firstRenderMs !== null && firstRenderMs <= firstRenderBudgetMs, `first render took ${firstRenderMs ?? "unknown"} ms, budget is ${firstRenderBudgetMs} ms. Steps: ${stepNames}`);

    console.log("MES Boot Performance QA");
    console.log(`- total: ${report.totalMs} ms`);
    console.log(`- loadState: ${loadStateMs ?? "n/a"} ms`);
    console.log(`- first render: ${firstRenderMs ?? "n/a"} ms`);
    console.log(`- entries: ${(report.entries || []).length}`);
    console.log("OK: boot performance is within guard budgets.");
  } finally {
    await cleanupChrome(chrome);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
