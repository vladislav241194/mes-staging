import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cleanupChrome, delay, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";
import { createAppEventsServiceModule } from "../src/modules/app_events/service.js";

const DIRECTORY_STORAGE_KEY = "mes-planning-prototype-directories-v2";
const STATE_STORAGE_KEY = "mes-planning-prototype-state-v2";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function waitForPreview(origin) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    try {
      const response = await fetch(`${origin}/?module=directories&qa-auth-bypass=1`, { cache: "no-store" });
      if (response.ok && (await response.text()).includes('id="app"')) return;
    } catch {
      // Preview is still starting.
    }
    await delay(120);
  }
  throw new Error(`Directory Operations QA preview did not become ready at ${origin}`);
}

async function stopProcess(child) {
  if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(resolve, 1200);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function verifyPlanningPropagationOwner(planningFixture) {
  let planningState = structuredClone(planningFixture);
  const baseline = structuredClone(planningFixture);
  const service = createAppEventsServiceModule({
    applyPlanningOrderLaborToSlot: (slot) => slot,
    createAppInteractionsModule: () => ({}),
    fromDateInput: () => "2026-07-19T08:00:00.000Z",
    getDefaultOperationCalculationType: () => "units-per-hour",
    getDefaultSecondsPerPanel: () => 0,
    getManualPlanningAssignmentForRouteStep: (step) => ({ workCenterId: step.workCenterId }),
    getOperationRouteWorkCenterId: (operation) => operation.workCenterId,
    getPlanningResourceForRouteStep: () => "",
    getRouteForStep: (step) => planningState.routes.find((route) => route.id === step.routeId),
    getUi: () => ({ windowStart: "2026-07-19" }),
    getPlanningState: () => planningState,
    setPlanningState: (nextState) => { planningState = nextState; },
    getDirectoryState: () => ({}),
    setDirectoryState: () => {},
    getWorkCenterUnitsPerHour: () => 55,
    isGanttSlotCompleted: (slot) => slot.status === "completed" || slot.completed === true,
    isPlanningWorkCenterCompatibleWithRouteStep: (step, workCenterId) => step.workCenterId === workCenterId,
    recalculateSlotEndByQuantity: (slot) => ({ ...slot, qaRecalculated: true }),
  });
  service.applyOperationMapChangesToRoutes({
    id: "QA_OP_SMT",
    name: "QA SMT-монтаж изменён",
    workCenterId: "D3_UW",
    unitsPerHour: 55,
    requiresBatch: true,
    isWarehouse: false,
  });
  const stepById = new Map(planningState.routeSteps.map((step) => [step.id, step]));
  assert(stepById.get("QA_STEP_OPEN").operationName === "QA SMT-монтаж изменён" && stepById.get("QA_STEP_OPEN").workCenterId === "D3_UW", "ordinary linked route step must follow operation name and work center");
  assert(stepById.get("QA_STEP_OVERRIDE").operationName === "QA SMT-монтаж изменён" && stepById.get("QA_STEP_OVERRIDE").workCenterId === "D3_AOI", "work-center override step must keep its own center while following operation name");
  assert(JSON.stringify(stepById.get("QA_STEP_OTHER")) === JSON.stringify(baseline.routeSteps.find((step) => step.id === "QA_STEP_OTHER")), "unrelated route step must remain unchanged");
  const slotById = new Map(planningState.slots.map((slot) => [slot.id, slot]));
  assert(slotById.get("QA_SLOT_OPEN").operationName === "QA SMT-монтаж изменён" && slotById.get("QA_SLOT_OPEN").routeWorkCenterId === "D3_UW" && slotById.get("QA_SLOT_OPEN").qaRecalculated === true, "unfinished unlocked slot must follow and recalculate from the linked step");
  for (const slotId of ["QA_SLOT_LOCKED", "QA_SLOT_COMPLETED", "QA_SLOT_OTHER"]) {
    assert(JSON.stringify(slotById.get(slotId)) === JSON.stringify(baseline.slots.find((slot) => slot.id === slotId)), `${slotId} must remain unchanged`);
  }
}

function verifyOperationDeleteOwner(planningFixture, directoryFixture) {
  let planningState = structuredClone(planningFixture);
  let directoryState = structuredClone(directoryFixture);
  let ui = { activeOperationId: "QA_OP_SMT" };
  const service = createAppEventsServiceModule({
    createAppInteractionsModule: () => ({}),
    getDirectoryState: () => directoryState,
    setDirectoryState: (nextState) => { directoryState = nextState; },
    getOperationMapItem: (operationId) => directoryState.operationMap.find((item) => item.id === operationId),
    getPlanningState: () => planningState,
    setPlanningState: (nextState) => { planningState = nextState; },
    getSpecificationStructureItems: (specification) => specification.structureItems || [],
    getUi: () => ui,
    setUi: (nextUi) => { ui = nextUi; },
    notifySaveSuccess: () => {},
    persistDirectoryState: () => {},
    persistState: () => {},
    persistUiState: () => {},
    render: () => {},
  });
  const usage = service.getOperationDeleteUsage("QA_OP_SMT");
  assert(usage.routeStepsCount === 2 && usage.slotsCount === 3 && usage.specificationRowsCount === 1, `operation owner must report exact loaded references: ${JSON.stringify({ routeStepsCount: usage.routeStepsCount, slotsCount: usage.slotsCount, specificationRowsCount: usage.specificationRowsCount })}`);
  assert(service.deleteOperationMapItem("QA_OP_SMT") === true, "operation owner must delete an existing operation");
  assert(!directoryState.operationMap.some((item) => item.id === "QA_OP_SMT"), "operation owner must remove the selected row");
  for (const stepId of ["QA_STEP_OPEN", "QA_STEP_OVERRIDE"]) {
    const step = planningState.routeSteps.find((item) => item.id === stepId);
    assert(step.operationId === "" && step.operationName === "", `${stepId} must clear the deleted operation reference`);
  }
  for (const slotId of ["QA_SLOT_OPEN", "QA_SLOT_LOCKED", "QA_SLOT_COMPLETED"]) {
    const slot = planningState.slots.find((item) => item.id === slotId);
    assert(slot.operationId === "" && slot.operationName === "", `${slotId} must clear the deleted operation reference`);
  }
  const specification = directoryState.specifications.find((item) => item.id === "QA_SPEC");
  assert(specification.structureItems.find((item) => item.id === "QA_SPEC_LINKED").operationId === "", "operation owner must clear the linked Specifications row");
  assert(specification.structureItems.find((item) => item.id === "QA_SPEC_OTHER").operationId === "QA_OP_WASH", "operation owner must preserve the unrelated Specifications row");
  assert(service.deleteOperationMapItem("missing") === false, "operation owner must fail closed for an absent operation");
}

async function main() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-directory-operations-react-"));
  const sharedStateFile = join(temporaryRoot, "shared-state.json");
  const writeSharedStateFile = join(temporaryRoot, "write-shared-state.json");
  const directoryFixture = {
    operationMap: [
      { id: "QA_OP_SMT", name: "QA SMT-монтаж", code: "QA-SMT", workCenterId: "D3", unitsPerHour: 55, status: "Активен" },
      { id: "QA_OP_WASH", name: "QA Отмывка", code: "QA-UW", workCenterId: "D3_UW", unitsPerHour: 150, status: "Активен" },
      { id: "QA_OP_DISABLED", name: "QA Архивная операция", code: "QA-OFF", workCenterId: "D3", unitsPerHour: 10, status: "Отключен" },
    ],
    specifications: [{
      id: "QA_SPEC",
      name: "QA спецификация",
      structureManaged: true,
      structureItems: [
        { id: "QA_SPEC_LINKED", parentId: "root", type: "part", fulfillmentMode: "produce", operationId: "QA_OP_SMT", operationName: "QA SMT-монтаж", departmentName: "SMT-монтаж", name: "Связанная строка", quantity: 1, position: 1 },
        { id: "QA_SPEC_OTHER", parentId: "root", type: "part", fulfillmentMode: "produce", operationId: "QA_OP_WASH", operationName: "QA Отмывка", departmentName: "Участок отмывки", name: "Несвязанная строка", quantity: 2, position: 2 },
      ],
    }],
    componentTypes: [], nomenclatureTypes: [], nomenclature: [], bomLists: [], statuses: [],
  };
  const snapshot = {
    version: 1,
    updatedAt: "2026-07-19T00:00:00.000Z",
    updatedBy: { actor: "directory-operations-react-functional-qa" },
    values: {
      [STATE_STORAGE_KEY]: JSON.stringify({
        routes: [{ id: "QA_ROUTE", name: "QA маршрут", quantity: 10, boardsPerPanel: 1 }],
        routeSteps: [
          { id: "QA_STEP_OPEN", routeId: "QA_ROUTE", operationId: "QA_OP_SMT", operationName: "QA SMT-монтаж", workCenterId: "D3", unitsPerHour: 55, order: 1 },
          { id: "QA_STEP_OVERRIDE", routeId: "QA_ROUTE", operationId: "QA_OP_SMT", operationName: "QA SMT-монтаж", workCenterId: "D3_AOI", workCenterOverride: true, unitsPerHour: 55, order: 2 },
          { id: "QA_STEP_OTHER", routeId: "QA_ROUTE", operationId: "QA_OP_WASH", operationName: "QA Отмывка", workCenterId: "D3_UW", unitsPerHour: 150, order: 3 },
        ],
        slots: [
          { id: "QA_SLOT_OPEN", routeId: "QA_ROUTE", routeStepId: "QA_STEP_OPEN", operationId: "QA_OP_SMT", operationName: "QA SMT-монтаж", routeWorkCenterId: "D3", workCenterId: "D3", unitsPerHour: 55, quantity: 10, plannedStart: "2026-07-19T08:00:00.000Z", plannedEnd: "2026-07-19T09:00:00.000Z", status: "planned", locked: false },
          { id: "QA_SLOT_LOCKED", routeId: "QA_ROUTE", routeStepId: "QA_STEP_OPEN", operationId: "QA_OP_SMT", operationName: "QA SMT-монтаж", routeWorkCenterId: "D3", workCenterId: "D3", unitsPerHour: 55, quantity: 10, plannedStart: "2026-07-19T09:00:00.000Z", plannedEnd: "2026-07-19T10:00:00.000Z", status: "planned", locked: true },
          { id: "QA_SLOT_COMPLETED", routeId: "QA_ROUTE", routeStepId: "QA_STEP_OVERRIDE", operationId: "QA_OP_SMT", operationName: "QA SMT-монтаж", routeWorkCenterId: "D3_AOI", workCenterId: "D3_AOI", unitsPerHour: 55, quantity: 10, plannedStart: "2026-07-19T10:00:00.000Z", plannedEnd: "2026-07-19T11:00:00.000Z", status: "completed", locked: false },
          { id: "QA_SLOT_OTHER", routeId: "QA_ROUTE", routeStepId: "QA_STEP_OTHER", operationId: "QA_OP_WASH", operationName: "QA Отмывка", routeWorkCenterId: "D3_UW", workCenterId: "D3_UW", unitsPerHour: 150, quantity: 10, plannedStart: "2026-07-19T11:00:00.000Z", plannedEnd: "2026-07-19T12:00:00.000Z", status: "planned", locked: false },
        ],
      }),
      [DIRECTORY_STORAGE_KEY]: JSON.stringify(directoryFixture),
    },
    sharedUi: {}, events: [],
  };
  verifyPlanningPropagationOwner(JSON.parse(snapshot.values[STATE_STORAGE_KEY]));
  verifyOperationDeleteOwner(JSON.parse(snapshot.values[STATE_STORAGE_KEY]), directoryFixture);
  await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
  await writeFile(writeSharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
  assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary state must be owner-readable only");
  assert(((await stat(writeSharedStateFile)).mode & 0o777) === 0o600, "temporary write state must be owner-readable only");
  const originalSnapshot = await readFile(sharedStateFile, "utf8");
  const previewPort = await getFreePort();
  const legacyPort = await getFreePort();
  const writePort = await getFreePort();
  const origin = `http://127.0.0.1:${previewPort}`;
  const legacyOrigin = `http://127.0.0.1:${legacyPort}`;
  const writeOrigin = `http://127.0.0.1:${writePort}`;
  const spawnPreview = (port, enabled, stateFile = sharedStateFile) => spawn(process.execPath, ["scripts/preview-dist.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru", MES_SHARED_STATE_FILE: stateFile,
      ...(enabled ? { MES_REACT_DIRECTORY_OPERATIONS: "1", MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION: "1" } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const preview = spawnPreview(previewPort, true);
  const legacyPreview = spawnPreview(legacyPort, false);
  const writePreview = spawnPreview(writePort, false, writeSharedStateFile);
  let previewOutput = "";
  let legacyOutput = "";
  let writeOutput = "";
  preview.stdout.on("data", (chunk) => { previewOutput += chunk.toString(); });
  preview.stderr.on("data", (chunk) => { previewOutput += chunk.toString(); });
  legacyPreview.stdout.on("data", (chunk) => { legacyOutput += chunk.toString(); });
  legacyPreview.stderr.on("data", (chunk) => { legacyOutput += chunk.toString(); });
  writePreview.stdout.on("data", (chunk) => { writeOutput += chunk.toString(); });
  writePreview.stderr.on("data", (chunk) => { writeOutput += chunk.toString(); });
  let chrome = null;
  const consoleProblems = [];
  try {
    await Promise.all([waitForPreview(origin), waitForPreview(legacyOrigin), waitForPreview(writeOrigin)]);
    chrome = await launchChrome("mes-directory-operations-react-qa-");
    const { client } = chrome;
    client.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method !== "Runtime.consoleAPICalled" || !["error", "warning", "assert"].includes(message.params?.type)) return;
      consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    });
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    await client.send("Page.navigate", { url: `${legacyOrigin}/?module=directories&qa-auth-bypass=1` });
    await waitForCondition(client, () => document.querySelectorAll('[data-directory-row]').length >= 3, { message: "legacy Operations did not render runtime rows" });
    const legacyRows = await evaluate(client, () => [...document.querySelectorAll('[data-directory-row]')].map((row) => (
      [...row.querySelectorAll("td")].slice(0, 3).map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ")
    )));
    assert(legacyRows.some((row) => row.includes("QA SMT-монтаж")), "legacy Operations must contain the QA runtime row");

    await client.send("Page.navigate", { url: `${origin}/?module=directories&qa-auth-bypass=1` });
    await waitForCondition(client, (expectedRows) => document.querySelectorAll('[data-directory-row]').length === expectedRows, { arg: legacyRows.length, message: "server permission without session request did not retain legacy Operations" });
    const defaultState = await evaluate(client, () => ({
      reactTargets: document.querySelectorAll("[data-react-directory-operations-island]").length,
      hasAdd: Boolean(document.querySelector("[data-add-directory]")),
    }));
    assert(defaultState.reactTargets === 0 && defaultState.hasAdd, "default Operations path must retain editable legacy commands");

    await client.send("Page.navigate", { url: `${origin}/?module=directories&qa-auth-bypass=1&react-directory-operations-evaluation=1` });
    await waitForCondition(client, (expectedRows) => Boolean(
      document.querySelector('[data-react-directory-operations-island][data-react-island-state="ready"]')
      && document.querySelectorAll('[data-ui-component="SelectableRow"]').length === expectedRows
    ), { arg: legacyRows.length, message: "Operations React island did not render the runtime rows", timeoutMs: 15_000 });
    const initial = await evaluate(client, () => {
      const target = document.querySelector("[data-react-directory-operations-island]");
      return {
        rows: [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].map((row) => (
          [...row.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ")
        )),
        filters: document.querySelectorAll('[data-ui-component="SidebarItem"]').length,
        selectedCount: document.querySelectorAll('[data-ui-component="SelectableRow"].is-selected').length,
        detailTitle: document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || "",
        writeDisabled: [...document.querySelectorAll('[data-ui-component="ActionButton"]')].every((button) => button.disabled),
        revision: target?.getAttribute("data-react-island-revision"),
        commitMs: Number(target?.getAttribute("data-react-island-commit-ms")),
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    assert(JSON.stringify(initial.rows) === JSON.stringify(legacyRows), `React and legacy Operations must expose the same three cells and order\nlegacy=${JSON.stringify(legacyRows)}\nreact=${JSON.stringify(initial.rows)}`);
    assert(initial.filters > 2 && initial.selectedCount === 1 && initial.detailTitle, "operation filters, selection and detail must render");
    assert(initial.writeDisabled && initial.revision === "1", "Operations React commands must stay disabled and report first revision");
    assert(Number.isFinite(initial.commitMs) && initial.commitMs >= 0 && initial.commitMs < 2000, `first Operations commit must stay below 2000 ms, got ${initial.commitMs}`);
    assert(!initial.pageOverflow, "Operations island must not create page-level overflow");

    const filtered = await evaluate(client, async () => {
      const filter = [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => {
        const label = item.querySelector(".filter-copy > span")?.textContent?.trim() || "";
        return !["Все справочники", "Все операции"].includes(label) && Number(item.querySelector("b")?.textContent || 0) > 1;
      });
      filter?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        chosen: filter?.querySelector(".filter-copy > span")?.textContent?.trim() || "",
        rows: document.querySelectorAll('[data-ui-component="SelectableRow"]').length,
        selected: document.querySelectorAll('[data-ui-component="SelectableRow"].is-selected').length,
      };
    });
    assert(filtered.chosen && filtered.rows > 1 && filtered.selected === 1, "work-center filter must preserve its rows and one selection");
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Все справочники"))?.click());
    await waitForCondition(client, () => Boolean(!document.querySelector("[data-react-directory-operations-island]") && document.querySelector('[data-directory-id="operations"].is-active')), { message: "Operations legacy return did not restore the current full directory navigation" });
    assert(consoleProblems.length === 0, `browser console must stay clean:\n${consoleProblems.join("\n")}`);
    assert(await readFile(sharedStateFile, "utf8") === originalSnapshot, "read-only Operations scenario must not modify state");

    await client.send("Page.navigate", { url: `${writeOrigin}/?module=directories&qa-auth-bypass=1&react-directory-operations=1&react-directory-operations-write=1` });
    await waitForCondition(client, () => Boolean(
      document.querySelector('[data-react-directory-operations-island][data-react-island-state="ready"]')
      && document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 3
    ), { message: "Operations write evaluation did not mount", timeoutMs: 15_000 });
    const writeActivation = await evaluate(client, () => ({
      badge: document.querySelector(".lab-badge")?.textContent?.trim() || "",
      addDisabled: [...document.querySelectorAll('[data-ui-component="ActionButton"]')]
        .find((button) => button.textContent.includes("Добавить операцию"))?.disabled,
      hasDelete: [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Удалить"),
    }));
    assert(writeActivation.badge.includes("create/edit/delete") && writeActivation.addDisabled === false && !writeActivation.hasDelete, `Operations write capability did not expose create/edit/delete while keeping delete contextual: ${JSON.stringify(writeActivation)}`);

    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')]
      .find((button) => button.textContent.includes("Добавить операцию"))?.click());
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-editor")), { message: "Operations create editor did not open" });
    await evaluate(client, () => {
      const form = document.querySelector(".react-nomenclature-editor");
      const setInput = (name, value) => {
        const control = form?.elements.namedItem(name);
        if (!control) throw new Error(`Missing Operations editor field: ${name}`);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(control, value);
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const center = form?.elements.namedItem("workCenterId");
      setInput("name", "React QA новая операция");
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(center, "D3_UW");
      center.dispatchEvent(new Event("change", { bubbles: true }));
      setInput("status", "Активен");
      form.requestSubmit();
    });
    await waitForCondition(client, () => (
      document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 4
      && [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].some((row) => row.textContent.includes("React QA новая операция"))
    ), { message: "Operations create did not return the four-row projection" });

    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SelectableRow"]')]
      .find((row) => row.textContent.includes("QA SMT-монтаж"))?.click());
    await waitForCondition(client, () => document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent === "QA SMT-монтаж", { message: "linked operation did not become selected" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')]
      .find((button) => button.textContent.trim() === "Редактировать")?.click());
    await waitForCondition(client, () => document.querySelector('.react-nomenclature-editor input[name="name"]')?.value === "QA SMT-монтаж", { message: "Operations edit form did not open" });
    await evaluate(client, () => {
      const form = document.querySelector(".react-nomenclature-editor");
      const name = form?.elements.namedItem("name");
      const center = form?.elements.namedItem("workCenterId");
      const status = form?.elements.namedItem("status");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(name, "QA SMT-монтаж изменён");
      name.dispatchEvent(new Event("input", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(center, "D3_UW");
      center.dispatchEvent(new Event("change", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(status, "Отключен");
      status.dispatchEvent(new Event("input", { bubbles: true }));
      form.requestSubmit();
    });
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="SelectableRow"]')]
      .some((row) => row.textContent.includes("QA SMT-монтаж изменён")), { message: "Operations edit did not return the renamed projection" });
    const editedProjection = await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SelectableRow"]')]
      .find((row) => row.textContent.includes("QA SMT-монтаж изменён"))?.textContent.replace(/\s+/g, " ").trim() || "");
    assert(editedProjection.includes("Участок отмывки") && editedProjection.includes("Отключен"), `Operations edited projection must expose work center and status: ${editedProjection}`);
    const persistedAfterEdit = await evaluate(client, ({ directoryKey }) => ({
      directory: JSON.parse(localStorage.getItem(directoryKey) || "{}"),
    }), { directoryKey: DIRECTORY_STORAGE_KEY });
    const editedOperation = persistedAfterEdit.directory.operationMap.find((item) => item.id === "QA_OP_SMT");
    assert(editedOperation.code === "QA-SMT" && editedOperation.unitsPerHour === 55, "Operations edit must preserve hidden code and normative fields");
    assert(editedOperation.workCenterId === "D3_UW" && editedOperation.status === "Отключен", "Operations edit must persist the exact editable fields");
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SelectableRow"]')]
      .find((row) => row.textContent.includes("QA SMT-монтаж изменён"))?.click());
    await waitForCondition(client, () => document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent === "QA SMT-монтаж изменён", { message: "edited operation did not reselect for restore" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')]
      .find((button) => button.textContent.trim() === "Редактировать")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-editor")), { message: "Operations restore editor did not open" });
    await evaluate(client, () => {
      const form = document.querySelector(".react-nomenclature-editor");
      const name = form?.elements.namedItem("name");
      const center = form?.elements.namedItem("workCenterId");
      const status = form?.elements.namedItem("status");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(name, "QA SMT-монтаж");
      name.dispatchEvent(new Event("input", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(center, "D3");
      center.dispatchEvent(new Event("change", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(status, "Активен");
      status.dispatchEvent(new Event("input", { bubbles: true }));
      form.requestSubmit();
    });
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="SelectableRow"]')]
      .some((row) => row.textContent.includes("QA SMT-монтаж") && row.textContent.includes("SMT-монтаж") && row.textContent.includes("Активен")), { message: "Operations semantic restore did not return the original projection" });

    const finalRuntime = await evaluate(client, ({ directoryKey }) => ({
      directory: JSON.parse(localStorage.getItem(directoryKey) || "{}"),
    }), { directoryKey: DIRECTORY_STORAGE_KEY });
    const finalWriteDirectory = finalRuntime.directory;
    const restoredOperation = finalWriteDirectory.operationMap.find((item) => item.id === "QA_OP_SMT");
    assert(restoredOperation.name === "QA SMT-монтаж" && restoredOperation.code === "QA-SMT" && restoredOperation.workCenterId === "D3" && restoredOperation.unitsPerHour === 55 && restoredOperation.status === "Активен", "React edit restore must preserve the original operation semantics");
    assert(finalWriteDirectory.operationMap.length === 4 && finalWriteDirectory.operationMap.some((item) => item.name === "React QA новая операция"), "create command must persist exactly one disposable operation in the isolated fixture");

    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SelectableRow"]')]
      .find((row) => row.textContent.includes("QA SMT-монтаж"))?.click());
    await waitForCondition(client, () => document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent === "QA SMT-монтаж", { message: "restored operation did not become selected for delete" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')]
      .find((button) => button.textContent.trim() === "Редактировать")?.click());
    await waitForCondition(client, () => document.querySelector('.react-nomenclature-editor input[name="name"]')?.value === "QA SMT-монтаж", { message: "Operations editor did not reopen for delete" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')]
      .find((button) => button.textContent.trim() === "Удалить")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('[role="alertdialog"]')), { message: "Operations delete confirmation did not open" });
    const deleteConfirmation = await evaluate(client, () => document.querySelector('[role="alertdialog"]')?.textContent?.replace(/\s+/g, " ").trim() || "");
    assert(deleteConfirmation.includes("1 строк составов; загружено 0 этапов и 0 слотов"), `Operations delete impact must disclose Specifications references and bound Planning counts to the loaded runtime: ${deleteConfirmation}`);
    const beforeDeleteCancel = await readFile(writeSharedStateFile, "utf8");
    await evaluate(client, () => [...document.querySelectorAll('[role="alertdialog"] [data-ui-component="ActionButton"]')]
      .find((button) => button.textContent.trim() === "Не удалять")?.click());
    await waitForCondition(client, () => !document.querySelector('[role="alertdialog"]') && Boolean(document.querySelector('.react-nomenclature-editor')), { message: "Operations delete cancel did not return to editor" });
    await delay(200);
    assert(await readFile(writeSharedStateFile, "utf8") === beforeDeleteCancel, "Operations delete cancel mutated state");

    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')]
      .find((button) => button.textContent.trim() === "Удалить")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('[role="alertdialog"]')), { message: "Operations delete confirmation did not reopen" });
    await evaluate(client, () => [...document.querySelectorAll('[role="alertdialog"] [data-ui-component="ActionButton"]')]
      .find((button) => button.textContent.trim() === "Удалить")?.click());
    await waitForCondition(client, () => (
      document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 3
      && ![...document.querySelectorAll('[data-ui-component="SelectableRow"]')].some((row) => row.textContent.includes("QA SMT-монтаж"))
      && !document.querySelector('[role="alertdialog"]')
    ), { message: "Operations delete did not return the exact three-row projection" });

    let persistedAfterDeleteSnapshot = null;
    let persistedAfterDeleteDirectory = null;
    let persistedAfterDeletePlanning = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      persistedAfterDeleteSnapshot = JSON.parse(await readFile(writeSharedStateFile, "utf8"));
      persistedAfterDeleteDirectory = JSON.parse(persistedAfterDeleteSnapshot.values[DIRECTORY_STORAGE_KEY]);
      persistedAfterDeletePlanning = JSON.parse(persistedAfterDeleteSnapshot.values[STATE_STORAGE_KEY]);
      if (!persistedAfterDeleteDirectory.operationMap.some((item) => item.id === "QA_OP_SMT")) break;
      await delay(120);
    }
    assert(!persistedAfterDeleteDirectory.operationMap.some((item) => item.id === "QA_OP_SMT"), "delete must persist removal of the selected operation");
    assert(persistedAfterDeleteDirectory.operationMap.some((item) => item.name === "React QA новая операция"), "delete changed the unrelated React-created operation");
    assert(JSON.stringify(persistedAfterDeletePlanning) === snapshot.values[STATE_STORAGE_KEY], "Directories metadata-only write must preserve the unloaded Planning snapshot byte-for-byte");
    const persistedSpecification = persistedAfterDeleteDirectory.specifications.find((item) => item.id === "QA_SPEC");
    const linkedStructureItem = persistedSpecification.structureItems.find((item) => item.id === "QA_SPEC_LINKED");
    const unrelatedStructureItem = persistedSpecification.structureItems.find((item) => item.id === "QA_SPEC_OTHER");
    assert(linkedStructureItem.operationId === "" && linkedStructureItem.operationName === "" && linkedStructureItem.departmentName === "", "delete must clear the linked Specifications operation fields");
    assert(unrelatedStructureItem.operationId === "QA_OP_WASH" && unrelatedStructureItem.operationName === "QA Отмывка", "delete changed the unrelated Specifications row");

    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')]
      .find((item) => item.textContent?.includes("Все справочники"))?.click());
    await waitForCondition(client, () => document.querySelectorAll('[data-directory-row]').length === 3, { message: "legacy Operations did not expose the exact post-delete operation set" });
    const legacyWriteRows = await evaluate(client, () => [...document.querySelectorAll('[data-directory-row]')].map((row) => row.textContent.replace(/\s+/g, " ").trim()));
    assert(legacyWriteRows.some((row) => row.includes("React QA новая операция")) && !legacyWriteRows.some((row) => row.includes("QA SMT-монтаж")), "same-runtime legacy read-back must expose React create and confirmed delete results");
    assert(consoleProblems.length === 0, `write-evaluation browser console must stay clean:\n${consoleProblems.join("\n")}`);
    console.log("Directory Operations React production-shell functional QA: OK");
    console.log(`- same payload: ${legacyRows.length} legacy rows = ${initial.rows.length} React rows, three cells and order match`);
    console.log("- resolved work-center labels, filtering, selection/detail and legacy return: pass");
    console.log(`- first React commit: ${initial.commitMs.toFixed(2)} ms (< 2000 ms local gate)`);
    console.log("- editable legacy default, disabled React writes, unchanged state and clean console: pass");
    console.log("- local RBAC-gated create/edit/delete, usage disclosure, cancel safety, legacy read-back and hidden-field preservation: pass");
    console.log("- linked route-step propagation, override preservation and unlocked/locked/completed slot boundaries: pass");
    console.log("- delete clears linked route steps, all linked slots and the exact Specifications row while preserving unrelated references: pass");
  } catch (error) {
    if (previewOutput.trim()) console.error(previewOutput.trim());
    if (legacyOutput.trim()) console.error(legacyOutput.trim());
    if (writeOutput.trim()) console.error(writeOutput.trim());
    throw error;
  } finally {
    if (chrome) await cleanupChrome(chrome);
    await Promise.all([stopProcess(preview), stopProcess(legacyPreview), stopProcess(writePreview)]);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
