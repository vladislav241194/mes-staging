import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const defaultUrl = new URL("/?module=planning&qa=planning-labor-functional", process.env.MES_QA_URL || "http://localhost:4174/").toString();

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

function withQuery(url, params = {}) {
  const next = new URL(url);
  Object.entries(params).forEach(([key, value]) => {
    next.searchParams.set(key, String(value));
  });
  return next.toString();
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
      if (message.error) reject(new Error(message.error.message || "CDP error"));
      else resolve(message.result);
      return;
    }
    if (message.method && this.listeners.has(message.method)) {
      this.listeners.get(message.method).forEach((listener) => listener(message.params || {}));
    }
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
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

function logStep(label) {
  if (process.env.MES_QA_VERBOSE === "1") console.log(`- ${label}`);
}

async function waitForPlanning(client) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20000) {
    const ok = await evaluate(client, () => document.querySelector("main.app-shell")?.dataset.layoutPage === "planning");
    if (ok) return;
    await delay(120);
  }
  throw new Error("Planning app shell did not render.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function launchChrome() {
  const chromePath = await findChrome();
  const port = await getFreePort();
  const profileDir = await mkdtemp(join(tmpdir(), "mes-planning-labor-qa-"));
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
    const client = new CdpClient(target.webSocketDebuggerUrl);
    return { child, client, profileDir };
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

async function setLaborMode(client, key, mode) {
  const ok = await evaluate(client, ({ key: laborKey, mode: nextMode }) => {
    const field = document.querySelector(`[data-planning-order-labor="${CSS.escape(laborKey)}"][data-planning-order-labor-field="mode"]`);
    if (!field) return false;
    field.value = nextMode;
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, { key, mode });
  assert(ok, `Не найден режим трудозатрат ${key}`);
  await delay(250);
}

async function setLaborField(client, key, fieldName, value) {
  const ok = await evaluate(client, ({ key: laborKey, fieldName: dataField, value: nextValue }) => {
    const field = document.querySelector(`[data-planning-order-labor="${CSS.escape(laborKey)}"][data-planning-order-labor-field="${CSS.escape(dataField)}"]`);
    if (!field) return false;
    field.value = String(nextValue);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, { key, fieldName, value });
  assert(ok, `Не найдено поле ${fieldName} для ${key}`);
  await delay(300);
}

async function main() {
  const url = withQuery(getArg("--url", defaultUrl), {
    module: "planning",
    qa: "planning-labor-functional",
    "qa-auth-bypass": "1",
  });
  const chrome = await launchChrome();
  const consoleProblems = [];
  const dialogs = [];
  try {
    const { client } = chrome;
    client.on("Runtime.consoleAPICalled", (params) => {
      if (!["error", "warning", "assert"].includes(params.type)) return;
      consoleProblems.push({
        type: params.type,
        args: (params.args || []).map((arg) => arg.value || arg.description || "").join(" "),
      });
    });
    client.on("Runtime.exceptionThrown", (params) => {
      consoleProblems.push({
        type: "exception",
        args: params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || "",
      });
    });
    client.on("Page.javascriptDialogOpening", (params) => {
      dialogs.push(params.message || params.type || "dialog");
      client.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    });
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: "sessionStorage.setItem('mes-planning-prototype-shared-disabled-until-v1', String(Date.now() + 60 * 60 * 1000));",
    });
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1556,
      height: 1006,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send("Page.navigate", { url });
    await delay(900);
    await waitForPlanning(client);
    logStep("planning rendered");

    const slotCandidates = await evaluate(client, () => {
      const state = JSON.parse(localStorage.getItem("mes-planning-prototype-state-v2") || "{}");
      const getSlotPlanningOrderId = (slot) => slot.planningOrderId || slot.routeId || slot.batchId || "";
      return (state.slots || [])
        .filter((item) => getSlotPlanningOrderId(item) && item.routeStepId && !item.locked)
        .map((slot) => ({
          routeId: getSlotPlanningOrderId(slot),
          stepId: slot.routeStepId,
          quantity: Number(slot.quantity || 0),
          plannedEnd: slot.plannedEnd || "",
        }));
    });
    assert(slotCandidates.length, "В состоянии нет планового слота для проверки трудозатрат.");
    await evaluate(client, ({ routeId, stepId }) => {
      const state = JSON.parse(localStorage.getItem("mes-planning-prototype-state-v2") || "{}");
      state.routeSteps = (state.routeSteps || []).map((step) => (
        step.id === stepId
          ? {
              ...step,
              workCenterId: "D5",
              calculationType: "manual",
              comment: [step.comment, "выводной монтаж"].filter(Boolean).join(" · "),
            }
          : step
      ));
      localStorage.setItem("mes-planning-prototype-state-v2", JSON.stringify(state));
      return true;
    }, slotCandidates[0]);
    logStep("prepared local manual-labor fixture");

    const applyLaborSettingsAndReload = async (target, settings, marker) => {
      await evaluate(client, ({ routeId, stepId, settings: nextSettings }) => {
        const state = JSON.parse(localStorage.getItem("mes-planning-prototype-state-v2") || "{}");
        state.routes = (state.routes || []).map((route) => (
          route.id === routeId
            ? {
                ...route,
                planningLaborByStepId: {
                  ...(route.planningLaborByStepId || {}),
                  [stepId]: nextSettings,
                },
              }
            : route
        ));
        state.slots = (state.slots || []).map((slot) => {
          const slotPlanningOrderId = slot.planningOrderId || slot.routeId || slot.batchId || "";
          if (slotPlanningOrderId !== routeId || slot.routeStepId !== stepId) return slot;
          const {
            planningLaborSource,
            planningLaborMode,
            planningLaborSourceLabel,
            planningLaborDurationMs,
            planningLaborDurationLabel,
            planningLaborMinutesPerUnit,
            planningLaborMinutesPerPanel,
            planningLaborFixedMinutes,
            planningLaborShiftQuantity,
            planningLaborBoardsPerPanel,
            planningLaborShiftCapacity,
            planningLaborShiftCount,
            planningLaborShiftMs,
            planningLaborUpdatedAt,
            planningLaborRevision,
            ...legacySlot
          } = slot;
          return legacySlot;
        });
        localStorage.setItem("mes-planning-prototype-state-v2", JSON.stringify(state));
        return true;
      }, { routeId: target.routeId, stepId: target.stepId, settings });
      await client.send("Page.navigate", { url: withQuery(url, { [marker]: "1" }) });
      await delay(900);
      await waitForPlanning(client);
    };

    const readSlot = (target) => evaluate(client, ({ routeId, stepId }) => {
      const state = JSON.parse(localStorage.getItem("mes-planning-prototype-state-v2") || "{}");
      const slot = (state.slots || []).find((item) => item.routeId === routeId && item.routeStepId === stepId && !item.locked) || null;
      const step = (state.routeSteps || []).find((item) => item.id === stepId && item.routeId === routeId) || null;
      return {
        quantity: Number(slot?.quantity || 0),
        slotStatus: slot?.status || "",
        stepWorkCenterId: step?.workCenterId || "",
        stepCalculationType: step?.calculationType || "",
        stepComment: step?.comment || "",
        laborMode: slot?.planningLaborMode || "",
        laborSource: slot?.planningLaborSource || "",
        laborDurationMs: Number(slot?.planningLaborDurationMs || 0),
        minutesPerUnit: Number(slot?.planningLaborMinutesPerUnit || 0),
        minutesPerPanel: Number(slot?.planningLaborMinutesPerPanel || 0),
        fixedMinutes: Number(slot?.planningLaborFixedMinutes || 0),
        shiftQuantity: Number(slot?.planningLaborShiftQuantity || 0),
        shiftCount: Number(slot?.planningLaborShiftCount || 0),
        shiftMs: Number(slot?.planningLaborShiftMs || 0),
        boardsPerPanel: Number(slot?.planningLaborBoardsPerPanel || 0),
        plannedEnd: slot?.plannedEnd || "",
        routeLabor: (state.routes || []).find((route) => route.id === routeId)?.planningLaborByStepId?.[stepId] || null,
      };
    }, { routeId: target.routeId, stepId: target.stepId });

    let selected = null;
    let afterSchedule = null;
    const candidateDiagnostics = [];
    for (let index = 0; index < slotCandidates.length; index += 1) {
      const candidate = slotCandidates[index];
      await applyLaborSettingsAndReload(candidate, { mode: "fixed", fixedMinutes: 30 }, `fixed-labor-candidate-${index + 1}`);
      const probe = await readSlot(candidate);
      candidateDiagnostics.push({
        key: `${candidate.routeId}::${candidate.stepId}`,
        slotStatus: probe.slotStatus,
        stepWorkCenterId: probe.stepWorkCenterId,
        stepCalculationType: probe.stepCalculationType,
        stepComment: probe.stepComment,
        laborSource: probe.laborSource,
        laborMode: probe.laborMode,
        routeLabor: probe.routeLabor,
      });
      if (probe.laborSource === "work_order" && probe.laborMode === "fixed") {
        selected = candidate;
        afterSchedule = probe;
        break;
      }
    }
    assert(selected && afterSchedule, `Не найден слот, который принимает трудозатраты заказ-наряда: ${JSON.stringify(candidateDiagnostics.slice(0, 6))}`);
    logStep(`selected slot ${selected.routeId}::${selected.stepId}`);
    logStep("fixed labor prepared");

    assert(afterSchedule.laborSource === "work_order", "Слот Ганта не получил источник трудозатрат из заказ-наряда.");
    assert(afterSchedule.laborMode === "fixed", `Ожидался режим fixed, получен ${afterSchedule.laborMode || "пусто"}.`);
    assert(afterSchedule.laborDurationMs === 30 * 60 * 1000, "Фиксированные трудозатраты 30 минут не записались в слот Ганта.");
    assert(afterSchedule.fixedMinutes === 30, "Фиксированная трудоемкость не записалась в слот.");
    logStep("slot synced fixed work-order labor");

    await applyLaborSettingsAndReload(selected, { mode: "fixed", fixedMinutes: 90 }, "fixed-labor-update");
    logStep("fixed labor updated");

    const afterFixedUpdate = await readSlot(selected);
    assert(afterFixedUpdate.laborMode === "fixed", "После изменения фиксированной трудоемкости слот потерял режим fixed.");
    assert(afterFixedUpdate.laborDurationMs === 90 * 60 * 1000, "Изменение фиксированной трудоемкости не синхронизировалось в Гант.");
    assert(afterFixedUpdate.plannedEnd && afterFixedUpdate.plannedEnd !== afterSchedule.plannedEnd, "Изменение трудозатрат не пересчитало окончание слота.");
    logStep("fixed update synced to slot");

    await applyLaborSettingsAndReload(selected, { mode: "unit", minutesPerUnit: 0.5 }, "unit-labor");
    logStep("unit labor updated");

    const afterUnit = await readSlot(selected);
    assert(afterUnit.laborMode === "unit", "Слот не перешел в режим мин/ед.");
    assert(afterUnit.minutesPerUnit === 0.5, "Трудоемкость мин/ед не записалась в слот.");
    assert(afterUnit.laborDurationMs === afterUnit.quantity * 0.5 * 60 * 1000, "Мин/ед не пересчитали длительность по количеству слота.");
    logStep("unit update synced to slot");

    await applyLaborSettingsAndReload(selected, { mode: "panel", minutesPerPanel: 2 }, "panel-labor");
    logStep("panel labor updated");

    const afterPanel = await readSlot(selected);
    const expectedPanelCount = Math.max(1, Math.ceil(afterPanel.quantity / Math.max(1, afterPanel.boardsPerPanel || 1)));
    assert(afterPanel.laborMode === "panel", "Слот не перешел в режим мин/мультипликацию.");
    assert(afterPanel.minutesPerPanel === 2, "Трудоемкость мин/мультипликацию не записалась в слот.");
    assert(afterPanel.routeLabor?.mode === "panel", `Маршрут не сохранил режим мин/мультипликацию: ${JSON.stringify(afterPanel.routeLabor)}`);
    assert(afterPanel.routeLabor?.minutesPerPanel === 2, `Маршрут не сохранил трудоемкость мин/мультипликацию: ${JSON.stringify(afterPanel.routeLabor)}`);
    assert(afterPanel.laborDurationMs === expectedPanelCount * 2 * 60 * 1000, "Мин/мультипликацию не пересчитали длительность по количеству мультипликаций.");
    logStep("panel update synced to slot");

    await applyLaborSettingsAndReload(selected, { mode: "shift", shiftQuantity: 250 }, "shift-labor");
    logStep("shift labor updated");

    const afterShift = await readSlot(selected);
    const expectedShiftCount = Math.max(1, Math.ceil(afterShift.quantity / 250));
    assert(afterShift.laborMode === "shift", "Слот не перешел в режим сменной нормы.");
    assert(afterShift.shiftQuantity === 250, "Плановое количество за смену не записалось в слот.");
    assert(afterShift.routeLabor?.mode === "shift", `Маршрут не сохранил режим планового количества за смену: ${JSON.stringify(afterShift.routeLabor)}`);
    assert(afterShift.routeLabor?.shiftQuantity === 250, `Маршрут не сохранил плановое количество за смену: ${JSON.stringify(afterShift.routeLabor)}`);
    assert(afterShift.shiftCount === expectedShiftCount, "Количество смен в слоте рассчитано неверно.");
    assert(afterShift.shiftMs > 0, "Слот не сохранил длительность смены из матрицы/календаря.");
    assert(afterShift.laborDurationMs === expectedShiftCount * afterShift.shiftMs, "Плановое количество за смену не пересчитало длительность слота по длительности смены.");

    await evaluate(client, ({ routeId, stepId }) => {
      const state = JSON.parse(localStorage.getItem("mes-planning-prototype-state-v2") || "{}");
      state.slots = (state.slots || []).map((slot) => {
        const slotPlanningOrderId = slot.planningOrderId || slot.routeId || slot.batchId || "";
        if (slotPlanningOrderId !== routeId || slot.routeStepId !== stepId) return slot;
        const {
          planningLaborSource,
          planningLaborMode,
          planningLaborSourceLabel,
          planningLaborDurationMs,
          planningLaborDurationLabel,
          planningLaborMinutesPerUnit,
          planningLaborMinutesPerPanel,
          planningLaborFixedMinutes,
          planningLaborShiftQuantity,
          planningLaborBoardsPerPanel,
          planningLaborShiftCapacity,
          planningLaborShiftCount,
          planningLaborShiftMs,
          planningLaborUpdatedAt,
          planningLaborRevision,
          ...legacySlot
        } = slot;
        return legacySlot;
      });
      localStorage.setItem("mes-planning-prototype-state-v2", JSON.stringify(state));
      return true;
    }, { routeId: selected.routeId, stepId: selected.stepId });
    await client.send("Page.navigate", { url: withQuery(url, { "legacy-slot-reload": "1" }) });
    await delay(900);
    await waitForPlanning(client);

    const afterReload = await readSlot(selected);
    assert(afterReload.laborSource === "work_order", "Normalizer did not restore work-order labor source on reload.");
    assert(afterReload.laborMode === "shift", `Normalizer did not restore shift labor mode on reload: ${JSON.stringify(afterReload)}`);
    assert(afterReload.shiftQuantity === 250, `Normalizer did not restore shift labor quantity on reload: ${JSON.stringify(afterReload)}`);
    assert(afterReload.shiftMs > 0, `Normalizer did not restore shift duration on reload: ${JSON.stringify(afterReload)}`);
    assert(afterReload.laborDurationMs === expectedShiftCount * afterReload.shiftMs, `Normalizer did not restore labor duration on reload: ${JSON.stringify(afterReload)}`);
    logStep("legacy slot reload restored work-order labor");

    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1556,
      height: 560,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(240);
    const scrollProbe = await evaluate(client, async ({ routeId, stepId }) => {
      const key = `${routeId}::${stepId}`;
      const selector = `[data-planning-order-labor="${CSS.escape(key)}"][data-planning-order-labor-field="mode"]`;
      const select = document.querySelector(selector)
        || document.querySelector('[data-visual-qa-target="planning-manual-labor-mode-control"]');
      const candidates = [
        select?.closest(".planning-order-page[data-layout='main-content'], .planning-page[data-layout='main-content'], [data-layout='main-content']"),
        document.querySelector(".planning-order-page[data-layout='main-content'], .planning-page[data-layout='main-content'], [data-layout='main-content']"),
        document.scrollingElement,
      ].filter(Boolean);
      let workspace = candidates.find((item) => item.scrollHeight - item.clientHeight > 24) || candidates[0];
      if (!select || !workspace) return { found: Boolean(select), hasWorkspace: Boolean(workspace) };
      if (workspace.scrollHeight - workspace.clientHeight <= 24) {
        document.documentElement.style.minHeight = "2200px";
        document.body.style.minHeight = "2200px";
        workspace = document.scrollingElement || workspace;
      }
      select.scrollIntoView({ block: "center", inline: "nearest" });
      const max = Math.max(0, workspace.scrollHeight - workspace.clientHeight);
      workspace.scrollTop = Math.min(Math.max(workspace.scrollTop + 160, 180), max);
      const before = workspace.scrollTop;
      select.value = select.value === "unit" ? "fixed" : "unit";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 360));
      const nextCandidates = [
        document.querySelector(".planning-order-page[data-layout='main-content'], .planning-page[data-layout='main-content'], [data-layout='main-content']"),
        document.scrollingElement,
      ].filter(Boolean);
      const nextWorkspace = nextCandidates.find((item) => item.scrollHeight - item.clientHeight > 24) || nextCandidates[0];
      return {
        found: true,
        hasWorkspace: Boolean(nextWorkspace),
        before,
        after: nextWorkspace?.scrollTop || 0,
        max: Math.max(0, (nextWorkspace?.scrollHeight || 0) - (nextWorkspace?.clientHeight || 0)),
      };
    }, selected);
    assert(scrollProbe.found, "UI mode select for planning labor was not found.");
    assert(scrollProbe.hasWorkspace, "Planning workspace was not found for scroll preservation check.");
    assert(scrollProbe.before > 0, `Planning workspace did not become scrollable for labor mode check: ${JSON.stringify(scrollProbe)}`);
    assert(scrollProbe.after >= Math.max(0, scrollProbe.before - 90), `Changing labor mode reset planning scroll: ${JSON.stringify(scrollProbe)}`);
    logStep("labor mode change preserved planning scroll");

    await setLaborMode(client, `${selected.routeId}::${selected.stepId}`, "unit");
    const manualInputProbe = await evaluate(client, async ({ routeId, stepId }) => {
      const key = `${routeId}::${stepId}`;
      const selector = `[data-planning-order-labor="${CSS.escape(key)}"][data-planning-order-labor-field="minutesPerUnit"]`;
      const field = document.querySelector(selector);
      const workspace = document.querySelector(".planning-order-page[data-layout='main-content'], .planning-page[data-layout='main-content'], [data-layout='main-content']")
        || document.scrollingElement;
      if (!field || !workspace) {
        return { found: Boolean(field), hasWorkspace: Boolean(workspace) };
      }
      field.scrollIntoView({ block: "center", inline: "nearest" });
      const max = Math.max(0, workspace.scrollHeight - workspace.clientHeight);
      workspace.scrollTop = Math.min(Math.max(workspace.scrollTop + 160, 180), max);
      const before = workspace.scrollTop;
      field.focus();
      field.value = "";
      field.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 120));
      const fieldConnectedAfterEmpty = field.isConnected;
      const activeAfterEmpty = document.activeElement === field;
      field.value = "0.777";
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      field.blur();
      await new Promise((resolve) => setTimeout(resolve, 380));
      const nextField = document.querySelector(selector);
      const state = JSON.parse(localStorage.getItem("mes-planning-prototype-state-v2") || "{}");
      const routeLabor = (state.routes || []).find((route) => route.id === routeId)?.planningLaborByStepId?.[stepId] || null;
      const nextWorkspace = document.querySelector(".planning-order-page[data-layout='main-content'], .planning-page[data-layout='main-content'], [data-layout='main-content']")
        || document.scrollingElement;
      return {
        found: true,
        hasWorkspace: true,
        fieldConnectedAfterEmpty,
        activeAfterEmpty,
        afterValue: nextField?.value ?? null,
        routeLabor,
        before,
        after: nextWorkspace?.scrollTop || 0,
      };
    }, selected);
    assert(manualInputProbe.found, "UI minutesPerUnit input for planning labor was not found.");
    assert(manualInputProbe.hasWorkspace, "Planning workspace was not found for manual input check.");
    assert(manualInputProbe.fieldConnectedAfterEmpty, `Empty intermediate input rerendered the labor row: ${JSON.stringify(manualInputProbe)}`);
    assert(manualInputProbe.activeAfterEmpty, `Empty intermediate input lost focus before typing finished: ${JSON.stringify(manualInputProbe)}`);
    assert(manualInputProbe.afterValue === "0.777", `Manual labor value was not preserved after typing: ${JSON.stringify(manualInputProbe)}`);
    assert(Math.abs(Number(manualInputProbe.routeLabor?.minutesPerUnit || 0) - 0.777) < 0.0001, `Manual labor value was not saved to route settings: ${JSON.stringify(manualInputProbe)}`);
    assert(manualInputProbe.after >= Math.max(0, manualInputProbe.before - 90), `Manual labor input reset planning scroll: ${JSON.stringify(manualInputProbe)}`);
    logStep("manual labor input tolerated temporary empty value");

    const blockingDialogs = dialogs.filter((message) => !/Все операции .*уже находятся в Ганте/i.test(message));
    assert(!blockingDialogs.length, `Browser dialogs blocked the flow:\n${blockingDialogs.join("\n")}`);
    assert(!consoleProblems.length, `Console problems:\n${consoleProblems.map((item) => `${item.type}: ${item.args}`).join("\n")}`);

    console.log("Planning Labor Functional QA");
    console.log("- render: pass");
    console.log("- schedule from work-order labor: pass");
    console.log("- fixed labor sync: pass");
    console.log("- unit labor sync: pass");
    console.log("- panel labor sync: pass");
    console.log("- shift labor sync: pass");
    console.log("- reload normalization: pass");
    console.log("- UI mode change scroll preservation: pass");
    console.log("- manual labor input empty-state preservation: pass");
    console.log("OK: planning labor updates drive Gantt slot calculations.");
  } finally {
    await cleanupChrome(chrome);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
