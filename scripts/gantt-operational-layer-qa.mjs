import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const defaultUrl = new URL("/?module=gantt&qa-auth-bypass=1&qa=gantt-operational-layer", process.env.MES_QA_URL || "http://localhost:4174/").toString();
const uiStorageKey = "mes-planning-prototype-ui-v1";
const sharedDisabledKey = "mes-planning-prototype-shared-disabled-until-v1";

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

async function launchChrome() {
  const chromePath = await findChrome();
  const port = await getFreePort();
  const profileDir = await mkdtemp(join(tmpdir(), "mes-gantt-operational-qa-"));
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

async function waitForGantt(client, slotId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45000) {
    const ok = await evaluate(client, (id) => (
      document.querySelector("main.app-shell")?.dataset.layoutPage === "gantt"
      && Boolean(document.querySelector(`.operation-slot[data-slot-id="${CSS.escape(id)}"]:not(.aggregate-slot)`))
    ), slotId);
    if (ok) return;
    await delay(120);
  }
  throw new Error(`Gantt did not render target slot ${slotId}.`);
}

async function waitForAnyGanttSlot(client) {
  const startedAt = Date.now();
  let expandClicked = false;
  while (Date.now() - startedAt < 45000) {
    let state;
    try {
      state = await evaluate(client, (clicked) => {
      const shellReady = document.querySelector("main.app-shell")?.dataset.layoutPage === "gantt";
      const nonAggregate = document.querySelectorAll(".operation-slot:not(.aggregate-slot)").length;
      const aggregate = document.querySelectorAll(".operation-slot.aggregate-slot").length;
      const toggle = document.querySelector("[data-toggle-all-projects]");
      const toggleText = toggle?.textContent?.trim().replace(/\s+/g, " ") || "";
      if (shellReady && !nonAggregate && aggregate && toggle && !clicked && /Развернуть/.test(toggleText)) {
        toggle.click();
        return { shellReady, nonAggregate, aggregate, expandClicked: true, toggleText };
      }
      return { shellReady, nonAggregate, aggregate, expandClicked: false, toggleText };
      }, expandClicked);
    } catch (error) {
      if (/navigated|Execution context|Cannot find context/i.test(String(error?.message || error))) {
        await delay(250);
        continue;
      }
      throw error;
    }
    if (state.expandClicked) expandClicked = true;
    if (state.shellReady && state.nonAggregate > 0) return;
    await delay(120);
  }
  const diagnostic = await evaluate(client, () => {
    const state = JSON.parse(localStorage.getItem("mes-planning-prototype-state-v2") || "{}");
    const ui = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
    return {
      href: location.href,
      title: document.title,
      shellPage: document.querySelector("main.app-shell")?.dataset.layoutPage || "",
      shellClass: document.querySelector("main.app-shell")?.className || "",
      bodyText: document.body.innerText.trim().replace(/\s+/g, " ").slice(0, 300),
      operationSlots: document.querySelectorAll(".operation-slot").length,
      appError: document.querySelector(".app-error, .startup-error")?.textContent?.trim().replace(/\s+/g, " ") || "",
      activeModule: ui.activeModule || "",
      stateSlots: Array.isArray(state.slots) ? state.slots.length : -1,
      stateRoutes: Array.isArray(state.routes) ? state.routes.length : -1,
    };
  });
  throw new Error(`Gantt did not render any operation slot. ${JSON.stringify(diagnostic)}`);
}

function buildUiSeed(scenario, expandedProjects = []) {
  const now = new Date().toISOString();
  return {
    activeModule: "gantt",
    scale: "hours",
    ganttZoom: 8,
    ganttShowQuantity: true,
    expandedProjects,
    shiftMasterBoardAssignments: {
      [scenario.slotId]: {
        slotId: scenario.slotId,
        status: "issued",
        issued: true,
        issuedAt: now,
        updatedAt: now,
        plannedQuantity: scenario.plannedQuantity,
        assignedQuantity: scenario.assignedQuantity,
        executors: [
          {
            id: "qa-executor-1",
            employeeId: "",
            quantity: scenario.assignedQuantity,
            note: "QA operational layer",
          },
        ],
      },
    },
    shiftMasterBoardFacts: {
      [scenario.slotId]: {
        slotId: scenario.slotId,
        actualQuantity: scenario.factQuantity,
        defectQuantity: 0,
        laborMinutes: 240,
        executorCount: 1,
        comment: "QA operational layer fact",
        updatedAt: now,
      },
    },
  };
}

async function main() {
  const url = getArg("--url", defaultUrl);
  const presetStorageSeed = await getPresetStorageSeed();
  const expandedProjects = getExpandedRouteIdsFromStorageSeed(presetStorageSeed);
  const chrome = await launchChrome();
  try {
    const { client } = chrome;
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1710,
      height: 910,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send("Page.navigate", { url });
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
    await client.send("Page.reload", { ignoreCache: true });
    await waitForAnyGanttSlot(client);
    const scenario = await evaluate(client, () => {
      const slots = [...document.querySelectorAll(".operation-slot:not(.aggregate-slot)")];
      const candidates = slots
        .filter((slot) => (
          !slot.className.includes("is-master-validated")
          && !slot.className.includes("has-master-fact")
          && !slot.className.includes("material-transfer-slot")
          && !slot.className.includes("is-segmented")
        ))
        .map((slot) => {
          const rect = slot.getBoundingClientRect();
          const title = slot.getAttribute("title") || "";
          const quantityMatch = title.match(/·\s*([0-9\s]+)\s*шт\./);
          const plannedQuantity = Number((quantityMatch?.[1] || "1000").replace(/\s+/g, "")) || 1000;
          return {
            slotId: slot.getAttribute("data-slot-id") || "",
            plannedQuantity,
            width: rect.width,
            isSegmented: slot.className.includes("is-segmented"),
            title,
          };
        })
        .filter((slot) => slot.slotId && slot.plannedQuantity > 0)
        .sort((left, right) => right.width - left.width);
      const picked = candidates[0] || null;
      if (!picked) return null;
      return {
        slotId: picked.slotId,
        plannedQuantity: picked.plannedQuantity,
        assignedQuantity: Math.max(1, Math.round(picked.plannedQuantity * 0.7)),
        factQuantity: Math.max(1, Math.round(picked.plannedQuantity * 0.4)),
        pickedWidth: picked.width,
        pickedTitle: picked.title,
      };
    });
    assert(scenario?.slotId, "Could not pick a visible Gantt slot for operational layer QA.");
    const seed = buildUiSeed(scenario, expandedProjects);
    await evaluate(client, (payload) => {
      sessionStorage.setItem(payload.sharedDisabledKey, String(Date.now() + 5 * 60 * 1000));
      localStorage.setItem(payload.uiStorageKey, JSON.stringify(payload.seed));
    }, { sharedDisabledKey, uiStorageKey, seed });
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        (() => {
          try {
            sessionStorage.setItem(${JSON.stringify(sharedDisabledKey)}, String(Date.now() + 5 * 60 * 1000));
            localStorage.setItem(${JSON.stringify(uiStorageKey)}, JSON.stringify(${JSON.stringify(seed)}));
          } catch {
            // Storage can be unavailable in the initial about:blank context.
          }
        })();
      `,
    });
    await client.send("Page.reload", { ignoreCache: true });
    await delay(500);
    await waitForGantt(client, scenario.slotId);

    const result = await evaluate(client, (testScenario) => {
      const slot = document.querySelector(`.operation-slot[data-slot-id="${CSS.escape(testScenario.slotId)}"]:not(.aggregate-slot)`);
      const layer = slot?.querySelector(".slot-operational-layer");
      const track = layer?.querySelector(".slot-operational-track");
      const storedUi = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
      const segments = [...(track?.querySelectorAll(".slot-operational-segment") || [])].map((segment) => {
        const style = segment.getAttribute("style") || "";
        const left = Number((style.match(/--segment-left:([\d.]+)%/) || [])[1] || 0);
        const width = Number((style.match(/--segment-width:([\d.]+)%/) || [])[1] || 0);
        return {
          className: segment.className,
          text: segment.textContent.trim().replace(/\s+/g, " "),
          left,
          width,
          right: left + width,
          title: segment.getAttribute("title") || "",
        };
      });
      const overlaps = segments.filter((segment, index) => {
        if (index === 0) return false;
        return segment.left < segments[index - 1].right - 0.01;
      });
      return {
        slotFound: Boolean(slot),
        slotClassName: slot?.className || "",
        slotTitle: slot?.getAttribute("title") || "",
        layerCount: slot?.querySelectorAll(".slot-operational-layer").length || 0,
        layerClassName: layer?.className || "",
        layerTitle: layer?.getAttribute("title") || "",
        metaText: layer?.querySelector(".slot-operational-meta")?.textContent.trim().replace(/\s+/g, " ") || "",
        segments,
        overlaps,
        trackWidth: track?.getBoundingClientRect().width || 0,
        storedAssignmentKeys: Object.keys(storedUi.shiftMasterBoardAssignments || {}),
        storedFactKeys: Object.keys(storedUi.shiftMasterBoardFacts || {}),
        storedAssignment: storedUi.shiftMasterBoardAssignments?.[testScenario.slotId] || null,
        storedFact: storedUi.shiftMasterBoardFacts?.[testScenario.slotId] || null,
        viewportOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth, document.body.scrollWidth - document.body.clientWidth),
      };
    }, scenario);

    assert(result.slotFound, `Target Gantt slot was not found: ${scenario.slotId}`);
    assert(result.layerCount === 1, `Expected one operational layer, got ${result.layerCount}. Slot ${scenario.slotId}. Slot classes: ${result.slotClassName}. Stored assignments: ${result.storedAssignmentKeys.join(", ") || "none"} ${JSON.stringify(result.storedAssignment)}. Stored facts: ${result.storedFactKeys.join(", ") || "none"} ${JSON.stringify(result.storedFact)}`);
    assert(result.layerClassName.includes("is-master-validated"), `Operational layer is missing validation class: ${result.layerClassName}`);
    assert(result.layerClassName.includes("has-master-fact"), `Operational layer is missing fact class: ${result.layerClassName}`);
    assert(result.layerClassName.includes("has-validation-mismatch"), `Operational layer is missing validation mismatch class: ${result.layerClassName}`);
    assert(result.layerClassName.includes("has-fact-mismatch"), `Operational layer is missing fact mismatch class: ${result.layerClassName}`);
    assert(result.metaText.includes("План 1 000 шт."), `Operational meta does not include planned quantity: ${result.metaText}. Layer: ${result.layerClassName}. Track width: ${result.trackWidth}. Segments: ${JSON.stringify(result.segments)}`);
    assert(result.metaText.includes("Распределено 700 шт."), `Operational meta does not include assigned quantity: ${result.metaText}`);
    assert(result.metaText.includes("Факт 400 шт."), `Operational meta does not include fact quantity: ${result.metaText}`);
    assert(result.metaText.includes("-300 к плану"), `Operational meta does not include assignment deficit: ${result.metaText}`);
    assert(result.metaText.includes("-300 к распределению"), `Operational meta does not include fact deficit: ${result.metaText}`);
    assert(result.segments.length === 3, `Expected 3 operational segments, got ${result.segments.length}: ${JSON.stringify(result.segments)}`);
    assert(result.segments.some((segment) => segment.className.includes("is-fact-done") && segment.text === "400"), `Fact segment is missing: ${JSON.stringify(result.segments)}`);
    assert(result.segments.some((segment) => segment.className.includes("is-fact-negative") && segment.text === "-300"), `Fact deficit segment is missing: ${JSON.stringify(result.segments)}`);
    assert(result.segments.some((segment) => segment.className.includes("is-assignment-rest") && segment.text === "-300"), `Plan assignment remainder segment is missing: ${JSON.stringify(result.segments)}`);
    assert(result.segments.every((segment) => segment.width > 0), `Operational segment width was not parsed or rendered: ${JSON.stringify(result.segments)}`);
    assert(result.overlaps.length === 0, `Operational segments overlap horizontally: overlaps=${JSON.stringify(result.overlaps)} all=${JSON.stringify(result.segments)}`);
    assert(result.trackWidth > 0, "Operational segment track has no visible width.");
    assert(result.viewportOverflowX === 0, `Gantt page has root horizontal overflow: ${result.viewportOverflowX}`);

    const zeroScenario = {
      ...scenario,
      assignedQuantity: 0,
      factQuantity: 0,
    };
    const zeroSeed = buildUiSeed(zeroScenario, expandedProjects);
    await evaluate(client, (payload) => {
      sessionStorage.setItem(payload.sharedDisabledKey, String(Date.now() + 5 * 60 * 1000));
      localStorage.setItem(payload.uiStorageKey, JSON.stringify(payload.seed));
    }, { sharedDisabledKey, uiStorageKey, seed: zeroSeed });
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        (() => {
          try {
            sessionStorage.setItem(${JSON.stringify(sharedDisabledKey)}, String(Date.now() + 5 * 60 * 1000));
            localStorage.setItem(${JSON.stringify(uiStorageKey)}, JSON.stringify(${JSON.stringify(zeroSeed)}));
          } catch {
            // Storage can be unavailable in the initial about:blank context.
          }
        })();
      `,
    });
    await client.send("Page.reload", { ignoreCache: true });
    await delay(500);
    await waitForGantt(client, zeroScenario.slotId);
	    const zeroResult = await evaluate(client, (testScenario) => {
	      const slot = document.querySelector(`.operation-slot[data-slot-id="${CSS.escape(testScenario.slotId)}"]:not(.aggregate-slot)`);
	      const layer = slot?.querySelector(".slot-operational-layer");
	      const track = layer?.querySelector(".slot-operational-track");
	      const row = slot?.closest(".gantt-row");
	      const factMetricText = row?.querySelector(".gantt-row-metric.is-fact")?.textContent.trim().replace(/\s+/g, " ") || "";
	      const segments = [...(track?.querySelectorAll(".slot-operational-segment") || [])].map((segment) => {
	        const style = segment.getAttribute("style") || "";
	        const left = Number((style.match(/--segment-left:([\d.]+)%/) || [])[1] || 0);
        const width = Number((style.match(/--segment-width:([\d.]+)%/) || [])[1] || 0);
        return {
          className: segment.className,
          text: segment.textContent.trim().replace(/\s+/g, " "),
          left,
          width,
          right: left + width,
          title: segment.getAttribute("title") || "",
        };
      });
      return {
        slotFound: Boolean(slot),
	        layerClassName: layer?.className || "",
	        metaText: layer?.querySelector(".slot-operational-meta")?.textContent.trim().replace(/\s+/g, " ") || "",
	        factMetricText,
	        segments,
	        trackWidth: track?.getBoundingClientRect().width || 0,
	      };
	    }, zeroScenario);
    assert(zeroResult.slotFound, `Zero assignment target Gantt slot was not found: ${zeroScenario.slotId}`);
    assert(zeroResult.layerClassName.includes("is-master-validated"), `Zero assignment layer is missing validation class: ${zeroResult.layerClassName}`);
    assert(zeroResult.metaText.includes("План 1 000 шт."), `Zero assignment meta does not include plan: ${zeroResult.metaText}`);
    assert(zeroResult.metaText.includes("Распределено 0 шт."), `Zero assignment meta does not keep explicit zero: ${zeroResult.metaText}`);
    assert(zeroResult.metaText.includes("-1 000 к плану"), `Zero assignment meta does not show full deficit: ${zeroResult.metaText}`);
    assert(!zeroResult.metaText.includes("+1"), `Zero assignment meta contains false +1 fallback: ${zeroResult.metaText}`);
	    assert(zeroResult.segments.length === 1, `Zero assignment should render one full deficit segment: ${JSON.stringify(zeroResult.segments)}`);
	    assert(zeroResult.segments[0]?.className.includes("is-assignment-rest"), `Zero assignment segment has wrong tone: ${JSON.stringify(zeroResult.segments)}`);
	    assert(zeroResult.segments[0]?.text === "-1 000", `Zero assignment segment has wrong text: ${JSON.stringify(zeroResult.segments)}`);
	    assert(zeroResult.segments[0]?.left === 0 && zeroResult.segments[0]?.width === 100, `Zero assignment segment should cover full bar: ${JSON.stringify(zeroResult.segments)}`);
	    assert(zeroResult.factMetricText !== "1", `Zero fact row metric regressed to normalizeQuantity fallback: ${zeroResult.factMetricText}`);
	    assert(zeroResult.trackWidth > 0, "Zero assignment segment track has no visible width.");

    console.log("Gantt Operational Layer QA OK");
    console.log(JSON.stringify({
      slotId: scenario.slotId,
      planned: scenario.plannedQuantity,
      assigned: scenario.assignedQuantity,
      fact: scenario.factQuantity,
      metaText: result.metaText,
      zeroMetaText: zeroResult.metaText,
      segments: result.segments.map((segment) => ({
        className: segment.className,
        text: segment.text,
        left: segment.left,
        width: segment.width,
      })),
    }, null, 2));
  } finally {
    await cleanupChrome(chrome);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
