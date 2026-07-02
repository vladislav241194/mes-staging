import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const defaultUrl = new URL("/?module=shiftMasterBoard&qa-auth-bypass=1&qa=shift-operational-flow", process.env.MES_QA_URL || "http://localhost:4174/").toString();
const uiStorageKey = "mes-planning-prototype-ui-v1";
const stateStorageKey = "mes-planning-prototype-state-v2";
const sharedDisabledKey = "mes-planning-prototype-shared-disabled-until-v1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatRu(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

function withQuery(baseUrl, params = {}) {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || typeof value === "undefined") url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  });
  return url.toString();
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

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    if (message.method) {
      (this.listeners.get(message.method) || []).forEach((listener) => listener(message.params || {}));
      return;
    }
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

async function evaluate(client, pageFunction, arg, timeoutMs = 60000) {
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
  const profileDir = await mkdtemp(join(tmpdir(), "mes-shift-flow-qa-"));
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
    // no-op
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

async function waitForModule(client, pageId, timeoutMs = 15000) {
  const startedAt = Date.now();
  let lastProbe = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastProbe = await evaluate(client, () => ({
      pageId: document.querySelector("main.app-shell")?.dataset.layoutPage || "",
      bodyText: document.body?.innerText?.trim().slice(0, 220) || "",
      errorText: document.querySelector(".runtime-error, .app-error, [data-runtime-error]")?.textContent?.trim().slice(0, 220) || "",
    }));
    if (lastProbe.pageId === pageId) return lastProbe;
    await delay(120);
  }
  throw new Error(`Module ${pageId} did not render. Last probe: ${JSON.stringify(lastProbe)}`);
}

async function navigateModule(client, moduleId, qa) {
  const url = withQuery(defaultUrl, {
    module: moduleId,
    "qa-auth-bypass": "1",
    qa,
  });
  await client.send("Page.navigate", { url });
  await delay(700);
  await waitForModule(client, moduleId === "gantt" ? "gantt" : moduleId);
  return url;
}

async function alignShiftWindowToRealSlot(client) {
  const result = await evaluate(client, async ({ uiKey, stateKey }) => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
    const slots = (state.slots || [])
      .filter((item) => item?.id && item.plannedStart && item.plannedEnd)
      .sort((left, right) => new Date(left.plannedStart).getTime() - new Date(right.plannedStart).getTime());
    if (!slots.length) return { ok: false, error: "no real planning slots" };
    const dates = [...new Set(slots.map((slot) => String(slot.plannedStart || "").slice(0, 10)).filter(Boolean))];
    const candidateDates = [...new Set(dates.flatMap((date) => {
      const parsed = new Date(`${date}T00:00:00`);
      const next = new Date(parsed.getTime() + 24 * 60 * 60 * 1000);
      const nextDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
      return [date, nextDate];
    }))];
    const readRealCards = () => [...document.querySelectorAll("[data-shift-board-card]")]
      .map((card) => card.getAttribute("data-shift-board-card") || "")
      .filter((id) => id && !id.startsWith("board-fallback-"));
    const attempts = [];
    for (const dateKey of candidateDates) {
      const field = document.querySelector("[data-shift-calendar-date]");
      if (!field) return { ok: false, error: "shift date field missing", attempts };
      field.value = dateKey;
      field.dispatchEvent(new Event("change", { bubbles: true }));
      await wait(260);
      const ui = JSON.parse(localStorage.getItem(uiKey) || "{}");
      const realCardIds = readRealCards();
      const allCardIds = [...document.querySelectorAll("[data-shift-board-card]")]
        .map((card) => card.getAttribute("data-shift-board-card") || "")
        .slice(0, 8);
      attempts.push({ dateKey, storedWindowStart: ui.windowStart || "", realCardIds: realCardIds.slice(0, 5), allCardIds });
      if (realCardIds.length) {
        const slot = slots.find((item) => realCardIds.some((id) => id.startsWith(`${item.id}::`) || id === item.id)) || slots[0];
        return {
          ok: true,
          dateKey,
          storedWindowStart: ui.windowStart || "",
          realCardIds: realCardIds.slice(0, 5),
          slotId: slot.id,
          routeId: slot.routeId || "",
          stepId: slot.routeStepId || "",
          attempts,
        };
      }
    }
    return { ok: false, error: "no real shift board cards after date attempts", attempts };
  }, { uiKey: uiStorageKey, stateKey: stateStorageKey });
  assert(result.ok, `Не удалось открыть дату реального слота для Мастерской: ${JSON.stringify(result)}`);
  return result;
}

async function runShiftMasterScenario(client) {
  await navigateModule(client, "shiftMasterBoard", "shift-operational-flow-board");
  const alignedWindow = await alignShiftWindowToRealSlot(client);
  const result = await evaluate(client, async ({ uiKey, stateKey }) => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const clickIfExists = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      element.click();
      return true;
    };
    const setValue = (element, value) => {
      if (!element) return false;
      element.value = String(value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    };
    const readCoveragePlanQuantity = () => {
      const coverage = [...document.querySelectorAll(".shift-master-board-coverage article")]
        .find((element) => element.querySelector("span")?.innerText.trim() === "Покрытие плана");
      const raw = coverage?.querySelector("strong")?.innerText || "0 / 0";
      const values = raw.match(/\d[\d\s]*/g) || [];
      const plan = values.length > 1 ? values[1] : values[0] || "0";
      return Number(String(plan).replace(/\s+/g, "")) || 0;
    };
    const activeCardId = () => document.querySelector(".shift-master-board-card.is-active")?.getAttribute("data-shift-board-card") || "";
    const readStores = () => ({
      ui: JSON.parse(localStorage.getItem(uiKey) || "{}"),
      state: JSON.parse(localStorage.getItem(stateKey) || "{}"),
    });

    clickIfExists("[data-shift-board-reset]");
    await wait(100);
    clickIfExists("[data-shift-board-focus=\"all\"]");
    await wait(100);
    clickIfExists("[data-shift-board-swimlane=\"order\"]");
    await wait(100);

    const stateBeforePick = JSON.parse(localStorage.getItem(stateKey) || "{}");
    const slotById = new Map((stateBeforePick.slots || []).map((slot) => [slot.id, slot]));
    const candidates = [];
    const cards = [...document.querySelectorAll("[data-shift-board-card]")];
    for (const card of cards) {
      const cardId = card.getAttribute("data-shift-board-card") || "";
      if (cardId.startsWith("board-fallback-")) continue;
      card.click();
      await wait(80);
      const panel = document.querySelector("[data-shift-board-assignment-panel]");
      const quantityInput = [...(panel?.querySelectorAll("[data-shift-board-available-quantity]") || [])][0] || null;
      const plannedQuantity = readCoveragePlanQuantity();
      const availableCount = Number(panel?.getAttribute("data-shift-board-assignment-available-count") || 0);
      const scopeCount = Number(panel?.getAttribute("data-shift-board-assignment-scope-count") || 0);
      if (quantityInput?.dataset.shiftBoardAvailableEmployee && plannedQuantity > 0 && availableCount > 0) {
        const sourceSlotId = cardId.includes("::") ? cardId.split("::")[0] : cardId;
        const sourceSlot = slotById.get(sourceSlotId) || {};
        const startMs = new Date(sourceSlot.plannedStart || "").getTime();
        const endMs = new Date(sourceSlot.plannedEnd || "").getTime();
        const durationHours = Number.isFinite(startMs) && Number.isFinite(endMs) ? (endMs - startMs) / 3600000 : 999;
        candidates.push({
          cardId,
          sourceSlotId,
          employeeId: quantityInput.dataset.shiftBoardAvailableEmployee,
          minutesPerUnit: Number(quantityInput.dataset.shiftBoardAvailableMinutesPerUnit || 0),
          plannedQuantity,
          availableCount,
          scopeCount,
          quantityInputCount: panel?.querySelectorAll("[data-shift-board-available-quantity]").length || 0,
          durationHours,
          sameDay: String(sourceSlot.plannedStart || "").slice(0, 10) === String(sourceSlot.plannedEnd || "").slice(0, 10),
          operationName: sourceSlot.operationName || "",
        });
      }
    }
    const target = candidates.find((candidate) => candidate.sameDay && candidate.durationHours <= 12)
      || candidates.find((candidate) => candidate.durationHours <= 12)
      || candidates[0]
      || null;
    if (!target) return {
      error: "No real shift board card with plan and available timesheet employees.",
      availableCardIds: cards.map((card) => card.getAttribute("data-shift-board-card") || "").slice(0, 12),
    };
    const targetCard = [...document.querySelectorAll("[data-shift-board-card]")]
      .find((card) => (card.getAttribute("data-shift-board-card") || "") === target.cardId);
    targetCard?.click();
    await wait(120);

    const timesheetButtonVisible = Boolean(document.querySelector("[data-shift-board-fill-timesheet]"));

    const panel = document.querySelector("[data-shift-board-assignment-panel]");
    const targetQuantityInput = [...(panel?.querySelectorAll("[data-shift-board-available-quantity]") || [])]
      .find((input) => input.dataset.shiftBoardAvailableEmployee === target.employeeId)
      || [...(panel?.querySelectorAll("[data-shift-board-available-quantity]") || [])][0]
      || null;
    const minutesPerUnit = Number(targetQuantityInput?.dataset.shiftBoardAvailableMinutesPerUnit || target.minutesPerUnit || 0);
    const oldExecutorRows = [...(panel?.querySelectorAll("[data-shift-board-executor-row], .shift-master-board-executors") || [])];
    const plannedQuantity = Math.max(1, readCoveragePlanQuantity() || target.plannedQuantity || 0);
    const assignedQuantity = plannedQuantity > 1 ? Math.max(1, Math.floor(plannedQuantity * 0.7)) : 0;
    setValue(targetQuantityInput, assignedQuantity);
    const rowDiagnosticsBeforeSave = [{
      value: targetQuantityInput?.dataset.shiftBoardAvailableEmployee || "",
      selectedText: targetQuantityInput?.dataset.shiftBoardAvailableName || "",
      quantity: targetQuantityInput?.value || "",
      optionCount: panel?.querySelectorAll("[data-shift-board-available-quantity]").length || 0,
      oldExecutorRows: oldExecutorRows.length,
    }];
    clickIfExists("[data-shift-board-save-assignment]");
    await wait(150);

    const afterAssignmentStores = readStores();
    const assignmentStore = afterAssignmentStores.ui.shiftMasterBoardAssignments || {};
    const activeAssignmentCardId = activeCardId() || "";
    const assignmentCardId = assignmentStore[activeAssignmentCardId]
      ? activeAssignmentCardId
      : assignmentStore[target.cardId]
        ? target.cardId
        : Object.keys(assignmentStore)[0] || target.cardId;
    const assignment = assignmentStore[assignmentCardId] || null;
    const timesheetAssignedQuantity = Number(assignment?.assignedQuantity || 0);
    const quantityInputDiagnostics = {
      targetQuantityInputFound: Boolean(targetQuantityInput),
      targetQuantityEmployeeId: targetQuantityInput?.dataset.shiftBoardAvailableEmployee || "",
      targetQuantityValue: targetQuantityInput?.value || "",
      minutesPerUnit,
      assignedQuantity,
      assignmentKeys: Object.keys(afterAssignmentStores.ui.shiftMasterBoardAssignments || {}).slice(0, 8),
      storedAssignment: assignment,
    };
    const storedAssignedQuantity = Number(assignment?.assignedQuantity || 0);
    const actualQuantity = storedAssignedQuantity > 1 ? Math.max(0, Math.floor(storedAssignedQuantity * 0.6)) : 0;
    setValue(document.querySelector("[data-shift-board-fact-actual]"), actualQuantity);
    setValue(document.querySelector("[data-shift-board-fact-defect]"), "0");
    setValue(document.querySelector("[data-shift-board-fact-labor]"), "240");
    setValue(document.querySelector("[data-shift-board-fact-executors]"), "1");
    setValue(document.querySelector("[data-shift-board-fact-comment]"), "qa shift operational flow fact");
    clickIfExists("[data-shift-board-save-fact]");
    await wait(180);

    const { ui, state } = readStores();
    const storedAssignment = ui.shiftMasterBoardAssignments?.[assignmentCardId] || null;
    const storedFact = ui.shiftMasterBoardFacts?.[assignmentCardId] || null;
    const sourceSlot = (state.slots || []).find((slot) => slot.id === storedAssignment?.slotId)
      || (state.slots || []).find((slot) => slot.routeId === storedAssignment?.routeId && slot.routeStepId === storedAssignment?.stepId)
      || null;
    const carryovers = Object.values(ui.shiftMasterBoardCarryovers || {}).filter((item) => item?.sourceRowId === assignmentCardId);
    return {
      target,
      assignmentCardId,
      timesheetButtonVisible,
      timesheetAssignedQuantity,
      rowDiagnosticsBeforeSave,
      quantityInputDiagnostics,
      assignment: storedAssignment,
      fact: storedFact,
      carryovers,
      sourceSlot: sourceSlot ? {
        id: sourceSlot.id || "",
        routeId: sourceSlot.routeId || sourceSlot.planningOrderId || sourceSlot.batchId || "",
        routeStepId: sourceSlot.routeStepId || "",
        quantity: Number(sourceSlot.quantity || 0),
        planningLaborSource: sourceSlot.planningLaborSource || "",
        planningLaborMode: sourceSlot.planningLaborMode || "",
      } : null,
      lane: ui.shiftMasterBoardLaneBySlot?.[assignmentCardId] || "",
    };
  }, { uiKey: uiStorageKey, stateKey: stateStorageKey });

  assert(!result.error, `${result.error || "Shift board scenario failed."} ${JSON.stringify(result)}`);
  assert(!result.timesheetButtonVisible, "Мастерская снова показала удаленную кнопку распределения по Табелю.");
  assert(
    (result.rowDiagnosticsBeforeSave || []).every((item) => !item.oldExecutorRows),
    `Мастерская снова показала удаленную таблицу Исполнитель/Кол-во/Комментарий: ${JSON.stringify(result.rowDiagnosticsBeforeSave)}`,
  );
  assert(result.target.availableCount > 0, "Мастерская не увидела доступных сотрудников из Табеля.");
  assert(result.timesheetAssignedQuantity > 0, `Ввод количества в карточке доступного исполнителя не дал распределенный объем: ${JSON.stringify(result.quantityInputDiagnostics)}`);
  assert(result.assignment?.slotId, `Назначение не сохранило ссылку на слот Ганта: ${JSON.stringify(result.assignment)}`);
  assert(result.assignment?.sheetContract?.documentType === "shiftWorkOrderSheet", `Назначение не сохранило контракт сменного листа: ${JSON.stringify(result.assignment?.sheetContract)}`);
  assert(result.assignment?.transferContract?.sourceSlotId === result.assignment.slotId, `Назначение не сохранило контракт передачи от исходного слота: ${JSON.stringify(result.assignment?.transferContract)}`);
  assert(result.assignment.assignedQuantity > 0, `Назначение не сохранило распределенное количество: ${JSON.stringify({ assignment: result.assignment, rowDiagnosticsBeforeSave: result.rowDiagnosticsBeforeSave })}`);
  assert(result.assignment.assignedQuantity < result.assignment.plannedQuantity, `Для QA нужен дефицит распределения: ${JSON.stringify(result.assignment)}`);
  assert((result.assignment.executors || []).length === 1, `Назначение должно сохранить одного исполнителя после нормализации: ${JSON.stringify(result.assignment.executors)}`);
  assert(result.fact?.updatedAt, `Факт смены не сохранился: ${JSON.stringify(result.fact)}`);
  assert(result.fact?.transferContract?.remainingQuantity > 0, `Факт не сохранил остаток в контракте передачи: ${JSON.stringify(result.fact?.transferContract)}`);
  assert(Number(result.fact.actualQuantity || 0) < Number(result.assignment.assignedQuantity || 0), `Для QA нужен дефицит факта к распределению: assignment=${JSON.stringify(result.assignment)} fact=${JSON.stringify(result.fact)}`);
  assert(result.sourceSlot?.id, `Не найден исходный слот для назначения: ${JSON.stringify(result)}`);
  assert(!String(result.sourceSlot.id).startsWith("board-fallback-"), `Сценарий выбрал fallback-строку вместо реального слота: ${JSON.stringify({ alignedWindow, sourceSlot: result.sourceSlot })}`);
  assert(result.carryovers.length > 0, `Недовыпуск не создал остаток смены: ${JSON.stringify(result.fact)}`);
  assert(result.carryovers.some((item) => item?.transferContract?.status === "partial_carryover_required" && item?.sourceSlotId), `Остаток не сохранил контракт передачи: ${JSON.stringify(result.carryovers)}`);
  return { ...result, alignedWindow };
}

async function attachWorkOrderLabor(client, scenario) {
  await navigateModule(client, "planning", "shift-operational-flow-labor");
  const fixture = await evaluate(client, ({ stateKey, sourceSlot, assignment }) => {
    const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
    const slot = (state.slots || []).find((item) => item.id === sourceSlot.id)
      || (state.slots || []).find((item) => item.routeId === sourceSlot.routeId && item.routeStepId === sourceSlot.routeStepId)
      || null;
    if (!slot) return { error: "source slot missing in planning state" };
    const routeId = slot.routeId || assignment.routeId || sourceSlot.routeId || "";
    const stepId = slot.routeStepId || assignment.stepId || sourceSlot.routeStepId || "";
    const quantity = Number(slot.quantity || assignment.plannedQuantity || 0);
    const minutesPerUnit = quantity >= 100 ? 0.42 : 5;
    state.routes = (state.routes || []).map((route) => (
      route.id === routeId
        ? {
            ...route,
            planningLaborByStepId: {
              ...(route.planningLaborByStepId || {}),
              [stepId]: {
                mode: "unit",
                minutesPerUnit,
              },
            },
          }
        : route
    ));
    state.slots = (state.slots || []).map((item) => {
      if (item.id !== slot.id) return item;
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
      } = item;
      return legacySlot;
    });
    localStorage.setItem(stateKey, JSON.stringify(state));
    window.location.reload();
    return { routeId, stepId, slotId: slot.id, quantity, minutesPerUnit };
  }, { stateKey: stateStorageKey, sourceSlot: scenario.sourceSlot, assignment: scenario.assignment });
  assert(!fixture.error, fixture.error || "Could not write work-order labor fixture.");
  await delay(900);
  await waitForModule(client, "planning");

  const probe = await evaluate(client, ({ stateKey, fixture: target }) => {
    const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
    const slot = (state.slots || []).find((item) => item.id === target.slotId)
      || (state.slots || []).find((item) => item.routeId === target.routeId && item.routeStepId === target.stepId)
      || null;
    const routeLabor = (state.routes || []).find((route) => route.id === target.routeId)?.planningLaborByStepId?.[target.stepId] || null;
    return {
      slotFound: Boolean(slot),
      slotId: slot?.id || "",
      routeId: target.routeId,
      stepId: target.stepId,
      quantity: Number(slot?.quantity || 0),
      laborSource: slot?.planningLaborSource || "",
      laborMode: slot?.planningLaborMode || "",
      laborDurationMs: Number(slot?.planningLaborDurationMs || 0),
      minutesPerUnit: Number(slot?.planningLaborMinutesPerUnit || 0),
      routeLabor,
    };
  }, { stateKey: stateStorageKey, fixture });

  const expectedDurationMs = probe.quantity * fixture.minutesPerUnit * 60 * 1000;
  assert(probe.slotFound, `Слот после настройки трудозатрат пропал: ${JSON.stringify(probe)}`);
  assert(probe.laborSource === "work_order", `Слот не получил источник трудозатрат из заказ-наряда: ${JSON.stringify(probe)}`);
  assert(probe.laborMode === "unit", `Слот не получил режим мин/ед.: ${JSON.stringify(probe)}`);
  assert(probe.minutesPerUnit === fixture.minutesPerUnit, `Мин/ед. не совпали: ${JSON.stringify(probe)}`);
  assert(probe.laborDurationMs === expectedDurationMs, `Гант не пересчитал длительность от трудозатрат заказ-наряда: ${JSON.stringify({ probe, expectedDurationMs })}`);
  return probe;
}

async function verifyGanttOperationalLayer(client, scenario, laborProbe) {
  await evaluate(client, ({ uiKey, stateKey }) => {
    const ui = JSON.parse(localStorage.getItem(uiKey) || "{}");
    const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
    localStorage.setItem(uiKey, JSON.stringify({
      ...ui,
      activeModule: "gantt",
      scale: "hours",
      ganttZoom: 8,
      ganttShowQuantity: true,
      expandedProjects: [
        ...new Set((state.routes || []).flatMap((route) => [
          route.id,
          route.specificationId,
          route.projectId,
          route.productionId,
        ]).filter(Boolean)),
      ],
    }));
  }, { uiKey: uiStorageKey, stateKey: stateStorageKey });
  await navigateModule(client, "gantt", "shift-operational-flow-gantt");
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    const found = await evaluate(client, (slotId) => Boolean(document.querySelector(`.operation-slot[data-slot-id="${CSS.escape(slotId)}"]:not(.aggregate-slot)`)), scenario.assignment.slotId);
    if (found) break;
    await delay(120);
  }

  const result = await evaluate(client, ({ slotId, uiKey, stateKey }) => {
    const slot = document.querySelector(`.operation-slot[data-slot-id="${CSS.escape(slotId)}"]:not(.aggregate-slot)`);
    const layer = slot?.querySelector(".slot-operational-layer");
    const track = layer?.querySelector(".slot-operational-track");
    const ui = JSON.parse(localStorage.getItem(uiKey) || "{}");
    const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
    const stateSlot = (state.slots || []).find((item) => item.id === slotId) || null;
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
    const overlaps = segments.filter((segment, index) => index > 0 && segment.left < segments[index - 1].right - 0.01);
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
      storedAssignmentKeys: Object.keys(ui.shiftMasterBoardAssignments || {}),
      storedFactKeys: Object.keys(ui.shiftMasterBoardFacts || {}),
      stateSlot: stateSlot ? {
        id: stateSlot.id || "",
        planningLaborSource: stateSlot.planningLaborSource || "",
        planningLaborMode: stateSlot.planningLaborMode || "",
        planningLaborDurationMs: Number(stateSlot.planningLaborDurationMs || 0),
      } : null,
      viewportOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth, document.body.scrollWidth - document.body.clientWidth),
    };
  }, { slotId: scenario.assignment.slotId, uiKey: uiStorageKey, stateKey: stateStorageKey });

  const planned = Number(scenario.assignment.plannedQuantity || 0);
  const assigned = Number(scenario.assignment.assignedQuantity || 0);
  const fact = Number(scenario.fact.actualQuantity || 0) - Number(scenario.fact.defectQuantity || 0);
  const assignedDelta = assigned - planned;
  const factDelta = fact - assigned;
  assert(result.slotFound, `Слот Ганта не найден: ${scenario.assignment.slotId}. ${JSON.stringify(result)}`);
  assert(result.layerCount >= 1, `У слота должен быть operational layer: ${JSON.stringify(result)}`);
  assert(result.layerClassName.includes("is-master-validated"), `Гант не показал распределение мастерской: ${result.layerClassName}`);
  assert(result.layerClassName.includes("has-master-fact"), `Гант не показал факт мастерской: ${result.layerClassName}`);
  assert(result.layerClassName.includes("has-validation-mismatch"), `Гант не показал дефицит распределения: ${result.layerClassName}`);
  assert(result.layerClassName.includes("has-fact-mismatch"), `Гант не показал дефицит факта: ${result.layerClassName}`);
  if (result.metaText) {
    assert(result.metaText.includes(`План ${formatRu(planned)} шт.`), `Meta не содержит план: ${result.metaText}`);
    assert(result.metaText.includes(`Распределено ${formatRu(assigned)} шт.`), `Meta не содержит распределение: ${result.metaText}`);
    assert(result.metaText.includes(`Факт ${formatRu(fact)} шт.`), `Meta не содержит факт: ${result.metaText}`);
    assert(result.metaText.includes(`${formatRu(assignedDelta)} к плану`), `Meta не содержит дельту распределения: ${result.metaText}`);
    assert(result.metaText.includes(`${formatRu(factDelta)} к распределению`), `Meta не содержит дельту факта: ${result.metaText}`);
  } else {
    const titleText = result.layerTitle || "";
    assert(titleText.includes("Распределено:"), `Сегментированный слой не содержит распределение в title: ${titleText}`);
    assert(titleText.includes("Факт:"), `Сегментированный слой не содержит факт в title: ${titleText}`);
    assert(titleText.includes("Не распределено:"), `Сегментированный слой не содержит остаток распределения в title: ${titleText}`);
  }
  assert(result.segments.length >= 3, `Operational layer должен разделять факт/дефицит/остаток: ${JSON.stringify(result.segments)}`);
  assert(result.segments.some((segment) => segment.className.includes("is-fact-done")), `Нет сегмента факта: ${JSON.stringify(result.segments)}`);
  assert(result.segments.some((segment) => segment.className.includes("is-fact-negative")), `Нет сегмента дефицита факта: ${JSON.stringify(result.segments)}`);
  assert(result.segments.some((segment) => segment.className.includes("is-assignment-rest")), `Нет сегмента остатка распределения: ${JSON.stringify(result.segments)}`);
  assert(result.overlaps.length === 0, `Operational segments overlap horizontally: ${JSON.stringify(result.overlaps)} all=${JSON.stringify(result.segments)}`);
  assert(result.trackWidth > 0, "Operational track has no visible width.");
  assert(result.stateSlot?.planningLaborSource === "work_order", `Гант потерял трудозатраты заказ-наряда: ${JSON.stringify(result.stateSlot)}`);
  assert(result.stateSlot?.planningLaborMode === laborProbe.laborMode, `Гант получил другой режим трудозатрат: ${JSON.stringify({ stateSlot: result.stateSlot, laborProbe })}`);
  assert(result.viewportOverflowX === 0, `Gantt page has root horizontal overflow: ${result.viewportOverflowX}`);
  return result;
}

async function main() {
  const chrome = await launchChrome();
  const consoleProblems = [];
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
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `sessionStorage.setItem(${JSON.stringify(sharedDisabledKey)}, String(Date.now() + 60 * 60 * 1000));`,
    });
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1710,
      height: 910,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const shiftScenario = await runShiftMasterScenario(client);
    const laborProbe = await attachWorkOrderLabor(client, shiftScenario);
    const ganttProbe = await verifyGanttOperationalLayer(client, shiftScenario, laborProbe);

    const actionableConsoleProblems = consoleProblems.filter((problem) => (
      !/favicon|ResizeObserver loop|Download the React DevTools/i.test(problem.args || "")
    ));
    assert(actionableConsoleProblems.length === 0, `Console problems during shift operational flow QA: ${JSON.stringify(actionableConsoleProblems.slice(0, 6))}`);
    console.log("Shift Operational Flow QA OK");
    console.log(JSON.stringify({
      rowId: shiftScenario.assignmentCardId,
      slotId: shiftScenario.assignment.slotId,
      planned: shiftScenario.assignment.plannedQuantity,
      assigned: shiftScenario.assignment.assignedQuantity,
      fact: shiftScenario.fact.actualQuantity,
      carryovers: shiftScenario.carryovers.length,
      labor: {
        mode: laborProbe.laborMode,
        source: laborProbe.laborSource,
        durationMs: laborProbe.laborDurationMs,
      },
      gantt: {
        metaText: ganttProbe.metaText,
        segments: ganttProbe.segments.map((segment) => ({
          className: segment.className,
          text: segment.text,
          left: segment.left,
          width: segment.width,
        })),
      },
    }, null, 2));
  } finally {
    await cleanupChrome(chrome);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
