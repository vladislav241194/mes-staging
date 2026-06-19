import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultUrl = "http://localhost:4174/";
const defaultOutDir = join(projectRoot, "tmp", `scroll-dropdown-qa-${Date.now()}`);
const viewports = [
  { name: "desktop-1556", width: 1556, height: 1006, mobile: false },
  { name: "mobile-390", width: 390, height: 844, mobile: true },
  { name: "mobile-430", width: 430, height: 932, mobile: true },
  { name: "tablet-768", width: 768, height: 1024, mobile: true },
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
  const profileDir = await mkdtemp(join(tmpdir(), "mes-scroll-dropdown-qa-"));
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

async function waitForApp(client) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12000) {
    const ready = await evaluate(client, () => Boolean(document.querySelector("main.app-shell")));
    if (ready) return;
    await delay(120);
  }
  throw new Error("App shell did not render.");
}

async function navigate(client, url) {
  const loaded = client.waitForEvent("Page.loadEventFired", 15000).catch(() => null);
  await client.send("Page.navigate", { url });
  await loaded;
  await waitForApp(client);
}

async function getModules(client, viewport) {
  return evaluate(client, (isMobile) => {
    const selector = isMobile ? ".mobile-module-tab[data-module]" : ".module-tab[data-module]";
    return Array.from(document.querySelectorAll(selector))
      .map((el) => ({ id: el.dataset.module, label: el.textContent.trim().replace(/\s+/g, " ") }))
      .filter((item, index, list) => item.id && list.findIndex((next) => next.id === item.id) === index);
  }, viewport.mobile);
}

async function switchModule(client, moduleId, viewport) {
  const ok = await evaluate(client, ({ moduleId, isMobile }) => {
    const current = document.querySelector("main.app-shell")?.dataset.layoutPage || "";
    if (current === moduleId) return true;
    if (isMobile) document.querySelector(".mobile-module-switcher > summary")?.click();
    const button = document.querySelector(`${isMobile ? ".mobile-module-sheet " : ""}.module-tab[data-module="${moduleId}"]`)
      || document.querySelector(`${isMobile ? ".mobile-module-sheet " : ""}.mobile-module-tab[data-module="${moduleId}"]`)
      || document.querySelector(`.module-tab[data-module="${moduleId}"]`);
    if (!button) return false;
    button.click();
    return true;
  }, { moduleId, isMobile: viewport.mobile });
  if (!ok) throw new Error(`Cannot switch to module ${moduleId}`);
  await delay(300);
}

async function auditModule(client, moduleId, viewport) {
  return evaluate(client, async ({ moduleId, isMobile }) => {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden";
    };
    const shellSelectors = [
      'main.app-shell > [data-layout="main-content"]',
      ".module-data-page",
      ".module-data-workspace",
      ".directory-workspace",
      ".module-data-content",
      ".modal",
      ".modal-body",
      ".form-modal",
    ];
    const hiddenClips = [];
    for (const selector of shellSelectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (!visible(el)) continue;
        if (el.closest(".gantt-shell, .supply-gantt-shell")) continue;
        const style = getComputedStyle(el);
        const clippedY = ["hidden", "clip"].includes(style.overflowY) && el.scrollHeight > el.clientHeight + 8;
        if (clippedY) {
          hiddenClips.push({
            selector,
            cls: String(el.className || el.tagName).slice(0, 100),
            overflowY: style.overflowY,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
          });
        }
      }
    }

    const main = document.querySelector('main.app-shell > [data-layout="main-content"]');
    let mainCanScroll = false;
    if (main) {
      const before = main.scrollTop;
      main.scrollTop = 100;
      mainCanScroll = main.scrollTop > before;
      main.scrollTop = before;
    }

    const dropdownFailures = [];
    const dropdowns = Array.from(document.querySelectorAll(".dense-inline-select"))
      .filter((select) => visible(select) && !select.classList.contains("is-disabled") && select.getAttribute("aria-disabled") !== "true")
      .filter((select) => visible(select.querySelector("summary")))
      .slice(0, isMobile ? 14 : 24);
    for (const select of dropdowns) {
      const summary = select.querySelector("summary");
      if (!summary) continue;
      summary.scrollIntoView({ block: "center", inline: "nearest" });
      await delay(40);
      summary.click();
      await delay(110);
      const options = select.querySelector(".dense-inline-options");
      if (!options) continue;
      const rect = options.getBoundingClientRect();
      const style = getComputedStyle(options);
      const hasVisibleOption = Array.from(options.querySelectorAll("button")).some(visible);
      if (!select.open && !hasVisibleOption) continue;
      if (rect.width <= 1 && rect.height <= 1 && !hasVisibleOption) continue;
      const outOfViewport = rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1;
      if (outOfViewport || style.position !== "fixed" || !options.classList.contains("is-viewport-popover")) {
        dropdownFailures.push({
          label: summary.textContent.trim().replace(/\s+/g, " ").slice(0, 80),
          position: style.position,
          hasViewportClass: options.classList.contains("is-viewport-popover"),
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
          },
        });
      }
      select.open = false;
      await delay(15);
    }

    return {
      moduleId,
      page: document.querySelector("main.app-shell")?.dataset.layoutPage || "",
      viewport: { width: innerWidth, height: innerHeight, mobile: isMobile },
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      main: main ? {
        overflowY: getComputedStyle(main).overflowY,
        scrollHeight: main.scrollHeight,
        clientHeight: main.clientHeight,
        canScroll: mainCanScroll,
      } : null,
      hiddenClips: hiddenClips.slice(0, 10),
      hiddenClipCount: hiddenClips.length,
      dropdownCount: dropdowns.length,
      dropdownFailures: dropdownFailures.slice(0, 10),
      dropdownFailureCount: dropdownFailures.length,
    };
  }, { moduleId, isMobile: viewport.mobile });
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
  await rm(chrome.profileDir, { recursive: true, force: true });
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
      const modules = await getModules(client, viewport);
      const viewportReport = { viewport, modules: [] };

      for (const moduleItem of modules) {
        await switchModule(client, moduleItem.id, viewport);
        const audit = await auditModule(client, moduleItem.id, viewport);
        audit.label = moduleItem.label;
        audit.failed = audit.page !== moduleItem.id
          || audit.hiddenClipCount > 0
          || audit.dropdownFailureCount > 0
          || (!viewport.mobile && audit.documentWidth > viewport.width + 1);
        if (audit.failed) {
          hasFailure = true;
          try {
            audit.screenshot = await saveScreenshot(client, outDir, viewport.name, moduleItem.id);
          } catch (error) {
            audit.screenshotError = error.message;
          }
        }
        viewportReport.modules.push(audit);
      }

      report.viewports.push(viewportReport);
    }
  } finally {
    await cleanupChrome(chrome);
  }

  const reportPath = join(outDir, "report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`Scroll/dropdown QA report: ${reportPath}`);
  for (const viewport of report.viewports) {
    const failures = viewport.modules.filter((moduleItem) => moduleItem.failed);
    console.log(`${viewport.viewport.name}: ${viewport.modules.length - failures.length}/${viewport.modules.length} modules passed`);
    for (const failure of failures) {
      console.log(`  FAIL ${failure.moduleId}: clips=${failure.hiddenClipCount}, dropdown=${failure.dropdownFailureCount}, page=${failure.page}`);
    }
  }
  if (hasFailure) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
