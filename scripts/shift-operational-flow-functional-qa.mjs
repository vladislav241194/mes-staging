import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const defaultUrl = new URL("/?module=shiftMasterBoard&qa-auth-bypass=1&qa=shift-operational-flow", process.env.MES_QA_URL || "http://localhost:4174/").toString();
const uiStorageKey = "mes-planning-prototype-ui-v1";
const stateStorageKey = "mes-planning-prototype-state-v2";
const sharedDisabledKey = "mes-planning-prototype-shared-disabled-until-v1";
const authSessionStorageKey = "mes-planning-prototype-auth-session-v1";
const specifications2StorageKey = "mes-specifications-2-registry-v1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatRu(value) {
  return Number(value || 0).toLocaleString("ru-RU").replace(/\s+/g, " ");
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
  let result;
  try {
    result = await client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }, timeoutMs);
  } catch (error) {
    error.message = `${error.message}\nEvaluation probe: ${source.replace(/\s+/g, " ").slice(0, 220)}`;
    throw error;
  }
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

async function seedSpecifications2OperationalFixture(client) {
  // Seed and reopen directly on the workshop board. The Planning screen has
  // its own draft-normalization pass; this flow verifies the released chain
  // (Specs 2.0 → work order → planned slot → workshop), not draft repair.
  await navigateModule(client, "shiftMasterBoard", "shift-operational-flow-fixture");
  const fixture = await evaluate(client, ({ stateKey, uiKey }) => {
    // This fixture lives only in the temporary browser profile used by this QA.
    // It models the minimum already-published Specs 2.0 chain: specification →
    // work order → route step → planned slot. It must not depend on pilot data.
    const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
    const ui = JSON.parse(localStorage.getItem(uiKey) || "{}");
    const now = new Date();
    now.setDate(now.getDate() + 1);
    // Keep the generated production slot on a normal 5/2 workday so the
    // assignment scenario has a real available employee on every CI date.
    while ([0, 6].includes(now.getDay())) now.setDate(now.getDate() + 1);
    now.setHours(9, 0, 0, 0);
    const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    // Keep this chain separate from the Specs 2.0 import QA fixture. Published
    // entries are reconciled at boot, so shared IDs would legitimately replace
    // this flow's planned slot with the other fixture's current revision.
    const routeId = "qa-shift-flow-specifications2-route";
    const stepId = "qa-shift-flow-specifications2-step";
    const slotId = "qa-shift-flow-specifications2-slot";
    const specificationId = "qa-shift-flow-specifications2-specification";
    const workCenterId = (state.workCenters || []).some((item) => item?.id === "D1")
      ? "D1"
      : state.workCenters?.[0]?.id || "D1";
    const quantity = 12;
    const route = {
      id: routeId,
      name: "Маршрутная карта · QA: опубликованная Спецификация 2.0",
      designation: "QA.SPEC2.001",
      specificationId,
      specificationName: "QA: опубликованная Спецификация 2.0",
      projectId: specificationId,
      routeDocumentKind: "main",
      rootRouteId: routeId,
      parentRouteId: "",
      isDefault: true,
      sourceSpecifications2EntryId: specificationId,
      sourceSpecifications2RouteDraftId: "qa-shift-flow-specifications2-route-draft",
      revision: 1,
      planningQuantity: quantity,
      planningStatus: "scheduled",
      lifecycleStatus: "released",
      documentRevisionSnapshot: {
        source: "specifications2",
        specificationEntryId: specificationId,
        specificationId,
        specificationRevision: 1,
        routeDraftId: "qa-shift-flow-specifications2-route-draft",
        routeRevision: 1,
        releasedAt: now.toISOString(),
        product: { designation: "QA.SPEC2.001", name: "QA: опубликованная Спецификация 2.0" },
        operations: [],
      },
      workOrderSnapshot: {
        id: "qa-shift-flow-specifications2-work-order-r1",
        source: "specifications2",
        specificationId,
        specificationRevision: 1,
        routeId,
        routeRevision: 1,
        quantity,
        operationRevisions: [],
      },
      unit: "шт.",
      planningLaborByStepId: {},
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const step = {
      id: stepId,
      routeId,
      stepOrder: 1,
      operationId: "D1_OP3",
      operationName: "Выдача комплектующих",
      workCenterId,
      departmentId: workCenterId,
      nextWorkCenterId: workCenterId,
      nextOperationId: "",
      statusBefore: "К выдаче",
      statusAfter: "Выдано",
      isRequired: true,
      quantityMultiplier: 1,
      calculationType: "normative",
      setupMin: 0,
      unitsPerHour: 0,
      fulfillmentMode: "produce",
      operationInputs: [{ label: "К выдаче" }],
      operationOutputs: [{ label: "Выдано" }],
      sourceSpecifications2OperationId: "qa-shift-flow-specifications2-operation",
      normRevisionId: "",
      unit: "шт.",
    };
    const slot = {
      id: slotId,
      routeId,
      routeStepId: stepId,
      planningOrderId: routeId,
      specificationId,
      routeWorkCenterId: workCenterId,
      workCenterId,
      operationId: step.operationId,
      operationName: step.operationName,
      quantity,
      unit: "шт.",
      plannedStart: now.toISOString(),
      plannedEnd: end.toISOString(),
      status: "planned",
      sourceSpecifications2EntryId: specificationId,
      specificationRevision: 1,
      routeRevision: 1,
      workOrderSnapshotId: "qa-shift-flow-specifications2-work-order-r1",
      actualStart: "",
      actualEnd: "",
      };
    route.documentRevisionSnapshot.operations = [{
      routeStepId: stepId,
      operationId: step.operationId,
      operationName: step.operationName,
      workCenterId,
      nextWorkCenterId: workCenterId,
      nextOperationId: "",
      labor: {},
    }];
    route.workOrderSnapshot.operationRevisions = [{ routeStepId: stepId, operationId: step.operationId, labor: {} }];
    state.routes = [route];
    state.routeSteps = [step];
    state.slots = [slot];
    state.shiftMasterAssignments = {};
    state.dispatchFacts = {};
    state.planningCorrections = {};
    const nextUi = {
      ...ui,
      activeModule: "shiftMasterBoard",
      // `windowStart` is a date-input value, not an ISO timestamp.  Keeping
      // this contract in the fixture also exercises the same format that the
      // calendar control writes in production.
      windowStart: now.toISOString().slice(0, 10),
      shiftMasterBoardAssignments: {},
      shiftMasterBoardFacts: {},
      shiftMasterBoardCarryovers: {},
      shiftMasterBoardLaneBySlot: {},
    };
    // Do not write while the current application instance is unloading: its
    // own pending persistence can otherwise overwrite this fixture. The raw
    // snapshots are injected before the next document starts instead.
    return {
      routeId,
      stepId,
      slotId,
      workCenterId,
      quantity,
      plannedStart: now.toISOString(),
      stateRaw: JSON.stringify(state),
      uiRaw: JSON.stringify(nextUi),
    };
  }, { stateKey: stateStorageKey, uiKey: uiStorageKey });
  assert(fixture?.stateRaw && fixture?.uiRaw, `Не удалось подготовить изолированный QA-набор Specs 2.0: ${JSON.stringify(fixture)}`);
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      (() => {
        try {
          const params = new URLSearchParams(window.location.search || "");
          if (params.get("qa") !== "shift-operational-flow-fixture-ready") return;
          window.sessionStorage.setItem(${JSON.stringify(sharedDisabledKey)}, String(Date.now() + 60 * 60 * 1000));
          window.localStorage.setItem(${JSON.stringify(stateStorageKey)}, ${JSON.stringify(fixture.stateRaw)});
          window.localStorage.setItem(${JSON.stringify(uiStorageKey)}, ${JSON.stringify(fixture.uiRaw)});
          // The fixture owns the released planning chain directly.  Clear a
          // separate import QA registry so its publication reconciliation does
          // not intentionally replace this isolated chain at boot.
          window.localStorage.setItem(${JSON.stringify(specifications2StorageKey)}, '{"entries":[]}');
        } catch {}
      })();
    `,
  });
  await navigateModule(client, "shiftMasterBoard", "shift-operational-flow-fixture-ready");
  const persistedFixture = await evaluate(client, ({ stateKey, slotId, stepId, routeId }) => {
    const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
    return {
      routeCount: (state.routes || []).length,
      stepCount: (state.routeSteps || []).length,
      slotCount: (state.slots || []).length,
      hasFixtureRoute: (state.routes || []).some((route) => route?.id === routeId),
      hasFixtureStep: (state.routeSteps || []).some((step) => step?.id === stepId),
      hasFixtureSlot: (state.slots || []).some((slot) => slot?.id === slotId),
      slots: (state.slots || []).map((slot) => ({ id: slot?.id, routeId: slot?.routeId, planningOrderId: slot?.planningOrderId, routeStepId: slot?.routeStepId })),
    };
  }, { stateKey: stateStorageKey, routeId: fixture?.routeId || "", stepId: fixture?.stepId || "", slotId: fixture?.slotId || "" });
  assert(persistedFixture.hasFixtureSlot, `QA fixture was lost during reload: ${JSON.stringify(persistedFixture)}`);
  assert(fixture?.slotId && fixture?.routeId && fixture?.stepId, `Не удалось создать изолированный QA-набор Specs 2.0: ${JSON.stringify(fixture)}`);
  delete fixture.stateRaw;
  delete fixture.uiRaw;
  return fixture;
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
    const factPanelVisible = Boolean(document.querySelector("[data-shift-board-fact-panel], [data-shift-board-save-fact]"));

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
      factPanelVisible,
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
  assert(!result.factPanelVisible, "Мастерская снова показала удаленную форму закрытия факта. Факт должен вводиться через Рабочий стол.");
  assert(!result.fact?.updatedAt, `Мастерская не должна сохранять факт до Рабочего стола: ${JSON.stringify(result.fact)}`);
  assert(result.sourceSlot?.id, `Не найден исходный слот для назначения: ${JSON.stringify(result)}`);
  assert(!String(result.sourceSlot.id).startsWith("board-fallback-"), `Сценарий выбрал fallback-строку вместо реального слота: ${JSON.stringify({ alignedWindow, sourceSlot: result.sourceSlot })}`);
  return { ...result, alignedWindow };
}

async function closeFactFromWorkDesk(client, scenario) {
  const executor = (scenario.assignment.executors || [])[0] || null;
  const executorId = String(executor?.employeeId || "").trim();
  assert(executorId, `Назначение не содержит исполнителя для входа в Рабочий стол: ${JSON.stringify(scenario.assignment)}`);
  const workDeskSeed = await evaluate(client, ({ uiKey, stateKey, authKey, executorId: personId, rowId, assignment }) => {
    const ui = JSON.parse(localStorage.getItem(uiKey) || "{}");
    const stateRaw = localStorage.getItem(stateKey) || "{}";
    const now = new Date();
    const expiresAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const taskId = `${rowId}::${personId}`;
    const nextUi = {
      ...ui,
      authGateUnlocked: true,
      authCurrentUserId: personId,
      authPrototypePersonId: personId,
      authSessionViewedPersonId: personId,
      authSessionSelectedTaskId: taskId,
      shiftMasterBoardAssignments: {
        ...(ui.shiftMasterBoardAssignments || {}),
        [rowId]: assignment,
      },
    };
    const authSession = {
      unlocked: true,
      userId: personId,
      roleId: "executor",
      dateKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      version: "qa-shift-operational-flow",
    };
    localStorage.setItem(uiKey, JSON.stringify(nextUi));
    localStorage.setItem(authKey, JSON.stringify(authSession));
    return {
      uiRaw: JSON.stringify(nextUi),
      stateRaw,
      authRaw: JSON.stringify(authSession),
      taskId,
    };
  }, {
    uiKey: uiStorageKey,
    stateKey: stateStorageKey,
    authKey: authSessionStorageKey,
    executorId,
    rowId: scenario.assignmentCardId,
    assignment: scenario.assignment,
  });
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      (() => {
        try {
          const params = new URLSearchParams(window.location.search || "");
          if (params.get("qa") !== "shift-operational-flow-workdesk") return;
          window.sessionStorage.setItem(${JSON.stringify(sharedDisabledKey)}, String(Date.now() + 60 * 60 * 1000));
          window.localStorage.setItem(${JSON.stringify(uiStorageKey)}, ${JSON.stringify(workDeskSeed.uiRaw)});
          window.localStorage.setItem(${JSON.stringify(stateStorageKey)}, ${JSON.stringify(workDeskSeed.stateRaw)});
          window.localStorage.setItem(${JSON.stringify(authSessionStorageKey)}, ${JSON.stringify(workDeskSeed.authRaw)});
          const nativeFetch = window.fetch ? window.fetch.bind(window) : null;
          if (nativeFetch) {
            window.fetch = (input, init) => {
              const url = String(input && input.url ? input.url : input || "");
              if (url.includes("/api/shared-state") || url.includes("./api/shared-state")) {
                return Promise.resolve(new Response(JSON.stringify({ configured: false }), {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                }));
              }
              return nativeFetch(input, init);
            };
          }
        } catch {}
      })();
    `,
  });
  await navigateModule(client, "authSessionPrototype", "shift-operational-flow-workdesk");
  await evaluate(client, ({ uiKey, authKey, executorId: personId, rowId, assignment }) => {
    const ui = JSON.parse(localStorage.getItem(uiKey) || "{}");
    const now = new Date();
    const expiresAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const taskId = `${rowId}::${personId}`;
    localStorage.setItem(uiKey, JSON.stringify({
      ...ui,
      authGateUnlocked: true,
      authCurrentUserId: personId,
      authSessionViewedPersonId: personId,
      authSessionSelectedTaskId: taskId,
      shiftMasterBoardAssignments: {
        ...(ui.shiftMasterBoardAssignments || {}),
        [rowId]: assignment,
      },
    }));
    localStorage.setItem(authKey, JSON.stringify({
      unlocked: true,
      userId: personId,
      roleId: "executor",
      dateKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      version: "qa-shift-operational-flow",
    }));
    window.location.reload();
  }, {
    uiKey: uiStorageKey,
    authKey: authSessionStorageKey,
    executorId,
    rowId: scenario.assignmentCardId,
    assignment: scenario.assignment,
  });
  await delay(900);
  await waitForModule(client, "authSessionPrototype");
  const result = await evaluate(client, async ({ uiKey, authKey, rowId, assignment }) => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const click = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      element.click();
      return true;
    };
    const clickByAttribute = (selector, attribute, value) => {
      const element = [...document.querySelectorAll(selector)]
        .find((candidate) => candidate.getAttribute(attribute) === value);
      if (!element) return false;
      element.click();
      return true;
    };
    const typeNumber = async (field, value) => {
      click(`[data-auth-session-field="${field}"]`);
      await wait(60);
      for (let index = 0; index < 8; index += 1) {
        click("[data-auth-session-backspace]");
        await wait(20);
      }
      const digits = String(value || 0).replace(/\D/g, "") || "0";
      for (const digit of digits) {
        click(`[data-auth-session-digit="${digit}"]`);
        await wait(45);
      }
    };
    const executor = (assignment.executors || [])[0] || null;
    const taskId = `${rowId}::${executor?.employeeId || ""}`;
    const assignedQuantity = Number(executor?.quantity || assignment.assignedQuantity || 0);
    const actualQuantity = assignedQuantity > 1 ? Math.max(0, Math.floor(assignedQuantity * 0.6)) : 0;
    const taskSelected = clickByAttribute("[data-auth-session-task]", "data-auth-session-task", taskId);
    await wait(120);
    const startClicked = clickByAttribute("[data-auth-session-start-task]", "data-auth-session-start-task", taskId);
    await wait(120);
	    await typeNumber("actual", actualQuantity);
	    await typeNumber("defect", 0);
	    const deviationComment = actualQuantity < assignedQuantity * 0.95
	      ? "QA: факт ниже плана, проверка переноса остатка."
	      : "";
	    let deviationCommentFilled = false;
	    if (deviationComment) {
	      const commentField = document.querySelector(`[data-auth-session-deviation-comment="${CSS.escape(taskId)}"]`);
	      if (commentField) {
	        commentField.value = deviationComment;
	        commentField.dispatchEvent(new Event("input", { bubbles: true }));
	        deviationCommentFilled = true;
	        await wait(80);
	      }
	    }
	    const saveClicked = clickByAttribute("[data-auth-session-save-fact]", "data-auth-session-save-fact", taskId);
	    await wait(220);
	    const ui = JSON.parse(localStorage.getItem(uiKey) || "{}");
    const authSession = JSON.parse(localStorage.getItem(authKey) || "{}");
    const storedFact = ui.shiftMasterBoardFacts?.[rowId] || null;
    const carryovers = Object.values(ui.shiftMasterBoardCarryovers || {}).filter((item) => item?.sourceRowId === rowId);
    const draft = ui.authSessionFactDrafts?.[taskId] || null;
    return {
      taskId,
      taskSelected,
      startClicked,
	      saveClicked,
	      deviationCommentFilled,
	      assignedQuantity,
	      actualQuantity,
      draft,
      fact: storedFact,
      carryovers,
      auth: {
        uiUser: ui.authCurrentUserId || "",
        uiPerson: ui.authPrototypePersonId || "",
        viewedPerson: ui.authSessionViewedPersonId || "",
        selectedTask: ui.authSessionSelectedTaskId || "",
        sessionUser: authSession.userId || "",
        sessionRole: authSession.roleId || "",
        assignmentKeys: Object.keys(ui.shiftMasterBoardAssignments || {}).slice(0, 12),
        assignmentForRow: ui.shiftMasterBoardAssignments?.[rowId] || null,
        bodyText: document.body?.innerText?.trim().slice(0, 500) || "",
      },
      visibleTaskCount: document.querySelectorAll("[data-auth-session-task]").length,
      factPanelVisible: Boolean(document.querySelector("[data-visual-qa-target=\"auth-session-fact-panel\"]")),
    };
  }, { uiKey: uiStorageKey, authKey: authSessionStorageKey, rowId: scenario.assignmentCardId, assignment: scenario.assignment });

  assert(result.taskSelected, `Рабочий стол не показал назначенное задание исполнителя: ${JSON.stringify(result)}`);
  assert(result.factPanelVisible, `Рабочий стол не показал панель ввода факта: ${JSON.stringify(result)}`);
  assert(result.saveClicked, `Рабочий стол не дал записать факт: ${JSON.stringify(result)}`);
  assert(result.draft?.updatedAt, `Факт исполнителя не сохранился в рабочем столе: ${JSON.stringify(result)}`);
  assert(result.fact?.updatedAt, `Факт операции не попал из Рабочего стола в общий слой: ${JSON.stringify(result)}`);
  assert(result.fact?.transferContract?.remainingQuantity > 0, `Факт не сохранил остаток в контракте передачи: ${JSON.stringify(result.fact?.transferContract)}`);
  assert(Number(result.fact.actualQuantity || 0) < Number(scenario.assignment.assignedQuantity || 0), `Для QA нужен дефицит факта к распределению: assignment=${JSON.stringify(scenario.assignment)} fact=${JSON.stringify(result.fact)}`);
  assert(result.carryovers.length > 0, `Недовыпуск не создал остаток смены: ${JSON.stringify(result.fact)}`);
  assert(result.carryovers.some((item) => item?.transferContract?.status === "partial_carryover_required" && item?.sourceSlotId), `Остаток не сохранил контракт передачи: ${JSON.stringify(result.carryovers)}`);
  return {
    ...scenario,
    fact: result.fact,
    carryovers: result.carryovers,
    workDeskFact: result,
  };
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
  await evaluate(client, ({ slotId, stateKey }) => {
    const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
    const stateSlot = (state.slots || []).find((item) => item?.id === slotId) || null;
    const routeId = stateSlot?.routeId || "";
    if (!routeId) return;
    const hasSlot = () => Boolean(document.querySelector(`.operation-slot[data-slot-id="${CSS.escape(slotId)}"]:not(.aggregate-slot)`));
    if (hasSlot()) return;
    const toggle = document.querySelector(`[data-toggle-project="${CSS.escape(routeId)}"]`);
    toggle?.click();
  }, { slotId: scenario.assignment.slotId, stateKey: stateStorageKey });
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
        routeId: stateSlot.routeId || "",
        routeStepId: stateSlot.routeStepId || "",
        workCenterId: stateSlot.workCenterId || "",
        resourceId: stateSlot.resourceId || "",
        plannedStart: stateSlot.plannedStart || "",
        plannedEnd: stateSlot.plannedEnd || "",
        quantity: Number(stateSlot.quantity || 0),
        planningLaborSource: stateSlot.planningLaborSource || "",
        planningLaborMode: stateSlot.planningLaborMode || "",
        planningLaborDurationMs: Number(stateSlot.planningLaborDurationMs || 0),
      } : null,
      visibleSlots: [...document.querySelectorAll(".operation-slot:not(.aggregate-slot)")].map((item) => ({
        slotId: item.getAttribute("data-slot-id") || "",
        className: item.className || "",
      })).slice(0, 12),
      visibleRows: [...document.querySelectorAll("[data-lane-row-id]")].map((item) => item.getAttribute("data-lane-row-id") || "").slice(0, 12),
      ui: {
        activeModule: ui.activeModule || "",
        windowStart: ui.windowStart || "",
        scale: ui.scale || "",
        ganttZoom: ui.ganttZoom || "",
        workCenterFilter: ui.workCenterFilter || "",
        activeProjectId: ui.activeProjectId || "",
        expandedProjects: Array.isArray(ui.expandedProjects) ? ui.expandedProjects.slice(0, 20) : [],
      },
      routeProbe: (state.routes || []).filter((route) => route?.id === stateSlot?.routeId).map((route) => ({
        id: route.id || "",
        productionId: route.productionId || "",
        projectId: route.projectId || "",
        specificationId: route.specificationId || "",
        name: route.name || "",
        status: route.status || "",
      })),
      viewportOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth, document.body.scrollWidth - document.body.clientWidth),
    };
  }, { slotId: scenario.assignment.slotId, uiKey: uiStorageKey, stateKey: stateStorageKey });

  const planned = Number(result.stateSlot?.quantity || scenario.assignment.plannedQuantity || 0);
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
    const titleText = String(result.layerTitle || "").replace(/\s+/g, " ");
    assert(titleText.includes(`План ${formatRu(planned)} шт.`), `Сегментированный слой не содержит план в title: ${titleText}`);
    assert(titleText.includes(`Распределено ${formatRu(assigned)} шт.`), `Сегментированный слой не содержит распределение в title: ${titleText}`);
    assert(titleText.includes(`Факт ${formatRu(fact)} шт.`), `Сегментированный слой не содержит факт в title: ${titleText}`);
    assert(titleText.includes(`${formatRu(factDelta)} к распределению`), `Сегментированный слой не содержит дельту факта в title: ${titleText}`);
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

    const fixture = await seedSpecifications2OperationalFixture(client);
    const shiftScenarioDraft = await runShiftMasterScenario(client);
    const shiftScenario = await closeFactFromWorkDesk(client, shiftScenarioDraft);
    const laborProbe = await attachWorkOrderLabor(client, shiftScenario);
    const ganttProbe = await verifyGanttOperationalLayer(client, shiftScenario, laborProbe);

    const actionableConsoleProblems = consoleProblems.filter((problem) => (
      !/favicon|ResizeObserver loop|Download the React DevTools|Prevented critical planning wipe/i.test(problem.args || "")
    ));
    assert(actionableConsoleProblems.length === 0, `Console problems during shift operational flow QA: ${JSON.stringify(actionableConsoleProblems.slice(0, 6))}`);
    console.log("Shift Operational Flow QA OK");
    console.log(JSON.stringify({
      rowId: shiftScenario.assignmentCardId,
      fixture,
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
  } catch (error) {
    const diagnostics = consoleProblems.slice(-8);
    if (diagnostics.length) error.message = `${error.message}\nConsole diagnostics: ${JSON.stringify(diagnostics)}`;
    throw error;
  } finally {
    await cleanupChrome(chrome);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
