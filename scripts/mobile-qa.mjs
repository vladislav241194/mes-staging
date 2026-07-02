import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultUrl = new URL("/", process.env.MES_QA_URL || "http://localhost:4174/").toString();
const defaultOutDir = join(projectRoot, "tmp", `mobile-qa-${Date.now()}`);
const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "768", width: 768, height: 1024 },
];
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
  const profileDir = await mkdtemp(join(tmpdir(), "mes-mobile-qa-"));
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

async function navigate(client, url) {
  const loaded = client.waitForEvent("Page.loadEventFired", 15000).catch(() => null);
  await client.send("Page.navigate", { url });
  await loaded;
  await waitForApp(client);
}

async function waitForApp(client) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12000) {
    const result = await evaluate(client, "() => Boolean(document.querySelector('main.app-shell'))");
    if (result) return;
    await delay(120);
  }
  throw new Error("App shell did not render.");
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
    mobile: true,
  });
}

async function getModules(client) {
  return evaluate(client, () => Array.from(document.querySelectorAll(".mobile-module-tab[data-module]"))
    .map((el) => ({ id: el.dataset.module, label: el.textContent.trim().replace(/\s+/g, " ") }))
    .filter((item, index, list) => item.id && list.findIndex((next) => next.id === item.id) === index));
}

async function switchModule(client, moduleId) {
  const ok = await evaluate(client, (id) => {
    const current = document.querySelector("main.app-shell")?.dataset.layoutPage || "";
    if (current === id) return true;
    document.querySelector(".mobile-module-switcher > summary")?.click();
    const button = document.querySelector(`.mobile-module-sheet .mobile-module-tab[data-module="${id}"]`)
      || document.querySelector(`.module-tab[data-module="${id}"]`);
    if (!button) return false;
    button.click();
    return true;
  }, moduleId);
  if (!ok) throw new Error(`Cannot switch to module ${moduleId}`);
  await delay(250);
}

async function auditLayout(client, moduleId) {
  const expression = (id) => {
    const ignoredRootSelector = [
      ".gantt-shell",
      ".supply-gantt-shell",
      ".supply-table-wrap",
      ".planning-table-matrix-wrap",
      ".planning-table-register-wrap",
      ".planning-table-compact-wrap",
      ".directory-table-wrap",
      ".nomenclature-table-wrap",
      ".shop-map-resource-table",
      ".production-flow-lane",
      ".route-table-scroll",
      ".speki-structure-table-wrap",
      ".visual-table-wrap",
      ".data-table-wrap",
      ".toolbar-actions",
      ".mobile-module-sheet",
      ".dense-inline-options",
    ].join(",");
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0.5 || rect.height <= 0.5) return false;
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
    };
    const scrollIsland = (el) => {
      let node = el;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if ((style.overflowX === "auto" || style.overflowX === "scroll") && node.scrollWidth > node.clientWidth + 2) {
          const rect = node.getBoundingClientRect();
          return {
            cls: String(node.className || node.tagName).slice(0, 80),
            x: Math.round(rect.x),
            w: Math.round(rect.width),
            scrollWidth: node.scrollWidth,
            clientWidth: node.clientWidth,
          };
        }
        node = node.parentElement;
      }
      return null;
    };
    const outsides = [];
    const tiny = [];
    const scrollIslands = new Map();

    for (const el of document.querySelectorAll("main.app-shell *")) {
      if (!visible(el)) continue;
      const rect = el.getBoundingClientRect();
      const island = el.closest(ignoredRootSelector) ? scrollIsland(el) : null;
      if (island) scrollIslands.set(`${island.cls}:${island.x}:${island.scrollWidth}`, island);
      if (!island && (rect.left < -1 || rect.right > innerWidth + 1 || rect.width > innerWidth + 1)) {
        outsides.push({
          cls: String(el.className || el.tagName).slice(0, 80),
          text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 80),
          x: Math.round(rect.x),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }
    }

    for (const el of document.querySelectorAll('main.app-shell :is(button, input, select, textarea, summary, a, [role="button"])')) {
      if (!visible(el)) continue;
      if (el.closest(ignoredRootSelector) && scrollIsland(el)) continue;
      const rect = el.getBoundingClientRect();
      const type = String(el.type || el.getAttribute("type") || "").toLowerCase();
      if ((type === "checkbox" || type === "radio") && rect.width >= 16 && rect.height >= 16 && el.closest("label")?.getBoundingClientRect().height >= 36) continue;
      if (el.closest("label") && el.closest("label").getBoundingClientRect().height >= 36) continue;
      if (rect.width < 28 || rect.height < 28) {
        const style = getComputedStyle(el);
        const chain = [];
        let node = el;
        while (node && node !== document.body && chain.length < 6) {
          chain.push({
            tag: node.tagName,
            cls: String(node.className || node.tagName).slice(0, 80),
          });
          node = node.parentElement;
        }
        tiny.push({
          cls: String(el.className || el.tagName).slice(0, 80),
          text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 70),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          cssHeight: style.height,
          cssMinHeight: style.minHeight,
          chain,
        });
      }
    }

    return {
      id,
      page: document.querySelector("main.app-shell")?.dataset.layoutPage || "",
      viewport: { width: innerWidth, height: innerHeight },
      docWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      outsideCount: outsides.length,
      tinyCount: tiny.length,
      hasTechnicalModText: document.body.innerText.includes("MOD ·"),
      outsides: outsides.slice(0, 12),
      tiny: tiny.slice(0, 12),
      scrollIslands: Array.from(scrollIslands.values()).slice(0, 12),
    };
  };
  return evaluate(client, expression, moduleId);
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
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(chrome.profileDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) {
        console.warn(`Could not remove temporary Chrome profile: ${error.message}`);
        return;
      }
      await delay(200);
    }
  }
}

async function main() {
  const url = getArg("--url", defaultUrl);
  const outDir = getArg("--out", defaultOutDir);
  await mkdir(outDir, { recursive: true });
  const chrome = await launchChrome();
  const report = { url, outDir, viewports: [] };
  let hasFailure = false;

  try {
    const { client } = chrome;
    await client.send("Page.enable");
    await client.send("Runtime.enable");

    for (const viewport of viewports) {
      await setViewport(client, viewport);
      await navigate(client, url);
      const modules = await getModules(client);
      const viewportReport = { viewport, modules: [] };

      for (const moduleItem of modules) {
        await switchModule(client, moduleItem.id);
        const audit = await auditLayout(client, moduleItem.id);
        try {
          audit.screenshot = await saveScreenshot(client, outDir, viewport.name, moduleItem.id);
        } catch (error) {
          audit.screenshotError = error.message;
        }
        audit.failed = audit.docWidth > viewport.width + 1
          || audit.bodyWidth > viewport.width + 1
          || audit.outsideCount > 0
          || audit.tinyCount > 0
          || audit.hasTechnicalModText;
        if (audit.failed) hasFailure = true;
        viewportReport.modules.push(audit);
      }

      report.viewports.push(viewportReport);
    }
  } finally {
    await cleanupChrome(chrome);
  }

  const reportPath = join(outDir, "report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`Mobile QA report: ${reportPath}`);
  for (const viewport of report.viewports) {
    const failures = viewport.modules.filter((moduleItem) => moduleItem.failed);
    console.log(`${viewport.viewport.name}: ${viewport.modules.length - failures.length}/${viewport.modules.length} modules passed`);
    for (const failure of failures) {
      console.log(`  FAIL ${failure.id}: doc=${failure.docWidth}, outside=${failure.outsideCount}, tiny=${failure.tinyCount}, mod=${failure.hasTechnicalModText}`);
    }
  }
  if (hasFailure) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
