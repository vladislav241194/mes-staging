import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const defaultUrl = new URL("/?module=gantt&qa-auth-bypass=1&qa=gantt-runtime-guardrails", process.env.MES_QA_URL || "http://localhost:4174/").toString();
const uiStorageKey = "mes-planning-prototype-ui-v1";
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
  const profileDir = await mkdtemp(join(tmpdir(), "mes-gantt-guardrails-qa-"));
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

async function getPresetStorageSeed() {
  const raw = await readFile("workflow-preset.json", "utf8");
  const preset = JSON.parse(raw);
  return preset.values && typeof preset.values === "object" ? preset.values : {};
}

function getExpandedRouteIdsFromStorageSeed(seed = {}) {
  try {
    const state = JSON.parse(seed["mes-planning-prototype-state-v2"] || "{}");
    const routeIds = (state.routes || []).map((route) => route.id).filter(Boolean);
    const specificationIds = (state.routes || []).map((route) => route.specificationId || route.projectId).filter(Boolean);
    return [...new Set([...routeIds, ...specificationIds])];
  } catch {
    return [];
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

async function waitForGantt(client) {
  const startedAt = Date.now();
  let expandClicked = false;
  while (Date.now() - startedAt < 45000) {
    const state = await evaluate(client, (clicked) => {
      const shellReady = document.querySelector("main.app-shell")?.dataset.layoutPage === "gantt"
        && Boolean(document.querySelector("[data-gantt-shell]"));
      const nonAggregate = document.querySelectorAll(".operation-slot[data-slot-id]:not(.aggregate-slot)").length;
      const aggregate = document.querySelectorAll(".operation-slot.aggregate-slot").length;
      const toggle = document.querySelector("[data-toggle-all-projects]");
      const toggleText = toggle?.textContent?.trim().replace(/\s+/g, " ") || "";
      if (shellReady && !nonAggregate && aggregate && toggle && !clicked && /Развернуть/.test(toggleText)) {
        toggle.click();
        return { shellReady, nonAggregate, aggregate, expandClicked: true, toggleText };
      }
      return { shellReady, nonAggregate, aggregate, expandClicked: false, toggleText };
    }, expandClicked);
    if (state.expandClicked) expandClicked = true;
    if (state.shellReady && state.nonAggregate > 0) return;
    await delay(120);
  }
  const diagnostic = await evaluate(client, () => {
    const state = JSON.parse(localStorage.getItem("mes-planning-prototype-state-v2") || "{}");
    const ui = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
    return {
      href: location.href,
      shellPage: document.querySelector("main.app-shell")?.dataset.layoutPage || "",
      bodyText: document.body.innerText.trim().replace(/\s+/g, " ").slice(0, 300),
      operationSlots: document.querySelectorAll(".operation-slot").length,
      aggregateSlots: document.querySelectorAll(".operation-slot.aggregate-slot").length,
      appError: document.querySelector(".app-error, .startup-error")?.textContent?.trim().replace(/\s+/g, " ") || "",
      activeModule: ui.activeModule || "",
      stateSlots: Array.isArray(state.slots) ? state.slots.length : -1,
      stateRoutes: Array.isArray(state.routes) ? state.routes.length : -1,
    };
  });
  throw new Error(`Gantt runtime did not render shell and operation slots. ${JSON.stringify(diagnostic)}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const presetStorageSeed = await getPresetStorageSeed();
  const expandedProjects = getExpandedRouteIdsFromStorageSeed(presetStorageSeed);
  const chrome = await launchChrome();
  try {
    const { client } = chrome;
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.navigate", { url: defaultUrl });
    await delay(500);
    await evaluate(client, (payload) => {
      sessionStorage.setItem(payload.sharedDisabledKey, String(Date.now() + 5 * 60 * 1000));
      Object.entries(payload.presetStorageSeed || {}).forEach(([key, value]) => {
        if (typeof value === "string") localStorage.setItem(key, value);
      });
      const presetUi = JSON.parse(payload.presetStorageSeed[payload.uiStorageKey] || "{}");
      localStorage.setItem(payload.uiStorageKey, JSON.stringify({
        ...presetUi,
        activeModule: "gantt",
        scale: "hours",
        ganttZoom: 8,
        ganttShowQuantity: true,
        expandedProjects: payload.expandedProjects,
      }));
    }, { sharedDisabledKey, uiStorageKey, presetStorageSeed, expandedProjects });
    await client.send("Page.navigate", { url: defaultUrl });
    await waitForGantt(client);

    const contract = await evaluate(client, async () => {
      const shell = document.querySelector("[data-gantt-shell]");
      const slots = [...document.querySelectorAll(".operation-slot[data-slot-id]:not(.aggregate-slot)")];
      const aggregateSlots = [...document.querySelectorAll(".operation-slot.aggregate-slot")];
      const firstSlot = slots[0];
      firstSlot?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        layoutPage: document.querySelector("main.app-shell")?.dataset.layoutPage || "",
        shell: Boolean(shell),
        shellComponent: shell?.getAttribute("data-ui-component") || "",
        canvas: Boolean(document.querySelector(".gantt-canvas[data-ui-component='GanttCanvas']")),
        timeline: Boolean(document.querySelector(".timeline-row[data-ui-component='GanttTimeline']")),
        rowCount: document.querySelectorAll(".gantt-row").length,
        slotCount: slots.length,
        aggregateSlotCount: aggregateSlots.length,
        slotIdCount: slots.filter((slot) => Boolean(slot.getAttribute("data-slot-id"))).length,
        slotComponentCount: slots.filter((slot) => slot.getAttribute("data-ui-component") === "GanttSlot").length,
        dependencyLayer: Boolean(document.querySelector(".dependencies-layer[data-ui-component='GanttDependencyLayer']")),
        dependencyPathCount: document.querySelectorAll(".dependency-path").length,
        zoomControls: document.querySelectorAll("[data-gantt-zoom]").length,
        modalBackdropCount: document.querySelectorAll(".modal-backdrop").length,
        slotFormCount: document.querySelectorAll("#slotForm").length,
        modalCount: document.querySelectorAll("[data-ui-component='Modal']").length,
      };
    });

    assert(contract.layoutPage === "gantt", "Gantt module did not stay on layout-page=gantt.");
    assert(contract.shell, "Missing [data-gantt-shell].");
    assert(contract.shellComponent === "GanttRuntime", "Gantt shell lost data-ui-component=GanttRuntime.");
    assert(contract.canvas, "Missing GanttCanvas component marker.");
    assert(contract.timeline, "Missing GanttTimeline component marker.");
    assert(contract.rowCount > 0, "Gantt rows are missing.");
    assert(contract.slotCount > 0, "Gantt operation slots are missing.");
    assert(contract.slotIdCount === contract.slotCount, "Some operation slots lost data-slot-id.");
    assert(contract.slotComponentCount === contract.slotCount, "Some operation slots lost data-ui-component=GanttSlot.");
    assert(contract.dependencyLayer, "Missing GanttDependencyLayer component marker.");
    assert(contract.zoomControls >= 3, "Gantt zoom controls lost data-gantt-zoom attributes.");
    assert(contract.slotFormCount <= 1, "Double slot editor form mounted after double click.");
    assert(contract.modalBackdropCount <= 1, "Double modal backdrop mounted after double click.");

    console.log("Gantt Runtime Guardrails QA OK");
    console.log(JSON.stringify(contract, null, 2));
  } finally {
    await cleanupChrome(chrome);
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
