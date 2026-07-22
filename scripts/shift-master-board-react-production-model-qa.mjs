import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-shift-master-board-model-"));
try {
  const output = join(temporaryRoot, "adapter.mjs");
  const adapterPath = new URL("../experiments/react-migration/src/modules/shift-master-board/adapter.ts", import.meta.url);
  const productionModelPath = new URL("../experiments/react-migration/src/modules/shift-master-board/production-model.ts", import.meta.url);
  await build({
    entryPoints: [adapterPath.pathname],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    logLevel: "silent",
  });
  const { adaptShiftMasterBoardPayload } = await import(`${pathToFileURL(output).href}?qa=${Date.now()}`);

  const dateKey = "2026-07-22";
  const nextDateKey = "2026-07-23";
  const systemDomains = {
    registries: {
      workCenters: [
        { id: "WC-MOUNT", code: "MNT", name: "Монтаж", isActive: true },
        { id: "WC-MOUNT-1", code: "M1", name: "Линия монтажа 1", parentWorkCenterId: "WC-MOUNT", isActive: true },
        { id: "WC-QA", code: "QA", name: "ОТК", isActive: true },
      ],
      orgUnits: [{ id: "OU-MOUNT", name: "Отдел монтажа", isActive: true }, { id: "OU-QA", name: "ОТК", isActive: true }],
      positions: [
        { id: "POS-MASTER", name: "Мастер", kind: "manager", capabilities: { canDistribute: true, canExecute: false }, isActive: true },
        { id: "POS-EXECUTOR", name: "Монтажник", capabilities: { canExecute: true, canReceiveShiftSheet: true }, isActive: true },
        { id: "POS-QA-MASTER", name: "Мастер ОТК", kind: "manager", capabilities: { canDistribute: true }, isActive: true },
      ],
      employees: [
        { id: "MASTER-MOUNT", displayName: "Смирнов Алексей Петрович", isActive: true },
        { id: "EMP-MOUNT", displayName: "Иванов Иван Иванович", isActive: true },
        { id: "MASTER-QA", displayName: "Волкова Дарья Максимовна", isActive: true },
      ],
      employmentAssignments: [
        { id: "EA-MASTER", employeeId: "MASTER-MOUNT", positionId: "POS-MASTER", orgUnitId: "OU-MOUNT", workCenterId: "WC-MOUNT", isPrimary: true },
        { id: "EA-EXECUTOR", employeeId: "EMP-MOUNT", positionId: "POS-EXECUTOR", orgUnitId: "OU-MOUNT", workCenterId: "WC-MOUNT-1", isPrimary: true },
        { id: "EA-QA", employeeId: "MASTER-QA", positionId: "POS-QA-MASTER", orgUnitId: "OU-QA", workCenterId: "WC-QA", isPrimary: true },
      ],
      responsibilityPolicies: [
        { id: "POLICY-MOUNT", subjectEmployeeId: "MASTER-MOUNT", mode: "manual", targetEmployeeIds: ["EMP-MOUNT"], isActive: true },
      ],
      scheduleTemplates: [{ id: "SCHEDULE-DAY", code: "5/2", startTime: "08:00", endTime: "17:00", isActive: true }],
      scheduleAssignments: [{ id: "SA-EXECUTOR", employeeId: "EMP-MOUNT", scheduleTemplateId: "SCHEDULE-DAY", validFrom: "2026-01-01" }],
      attendanceEvents: [],
      equipment: [{ id: "LINE-1", name: "Монтажная линия 1", workCenterId: "WC-MOUNT-1", isActive: true }],
    },
  };
  const planning = {
    routes: [{ id: "WO-1042", name: "Маршрут КТ-7", specificationName: "Контроллер КТ-7", planningQuantity: 100, unit: "шт." }],
    routeSteps: [
      { id: "STEP-MOUNT", routeId: "WO-1042", operationName: "Монтаж", stepOrder: 1, planningWorkCenterId: "WC-MOUNT-1", specTaskName: "Основной маршрут" },
      { id: "STEP-QA", routeId: "WO-1042", operationName: "Контроль", stepOrder: 2, planningWorkCenterId: "WC-QA", specTaskName: "Основной маршрут" },
    ],
    slots: [{ id: "SLOT-MOUNT", routeId: "WO-1042", routeStepId: "STEP-MOUNT", workCenterId: "WC-MOUNT-1", resourceId: "LINE-1", operationName: "Монтаж", plannedStart: `${dateKey}T08:00:00+03:00`, plannedEnd: `${dateKey}T12:00:00+03:00`, quantity: 100, unit: "шт." }],
  };
  const shiftExecution = {
    items: [{
      id: "ASSIGNMENT-1",
      sourceRowId: `SLOT-MOUNT::${dateKey}`,
      sourceSlotId: "SLOT-MOUNT",
      workOrderId: "WO-1042",
      operationId: "STEP-MOUNT",
      workCenterId: "WC-MOUNT-1",
      resourceId: "LINE-1",
      masterId: "MASTER-MOUNT",
      plannedQuantity: 100,
      assignedQuantity: 80,
      unit: "шт.",
      status: "issued",
      issuedAt: `${dateKey}T05:05:00.000Z`,
      executors: [{ employeeId: "EMP-MOUNT", quantity: 80, note: "дневная смена" }],
      facts: [{ id: "FACT-1", assignmentId: "ASSIGNMENT-1", actualQuantity: 60, defectQuantity: 5, laborMinutes: 240, executorCount: 1, comment: "частичный факт", deviationComment: "ожидание материала", reportedAt: `${dateKey}T11:00:00.000Z` }],
    }],
    carryovers: [{ id: "CARRYOVER-1", sourceAssignmentId: "ASSIGNMENT-1", sourceRowId: `SLOT-MOUNT::${dateKey}`, sourceSlotId: "SLOT-MOUNT", workOrderId: "WO-1042", operationId: "STEP-MOUNT", workCenterId: "WC-MOUNT-1", dateKey: nextDateKey, remainingQuantity: 45, reason: "остаток после частичного факта" }],
  };
  const productionInput = {
    planning,
    shiftExecution,
    systemDomains,
    timesheet: {
      availability: {
        [`EMP-MOUNT::${dateKey}`]: { dateKey, value: "work", availabilityStatus: "available", hours: 8, label: "дневная смена · 8 ч" },
        [`EMP-MOUNT::${nextDateKey}`]: { dateKey: nextDateKey, value: "work", availabilityStatus: "available", hours: 8, label: "дневная смена · 8 ч" },
      },
    },
    session: { role: { id: "admin" }, authenticatedPerson: { id: "MASTER-MOUNT" }, canSelectMaster: true },
    ui: { dateKey, focus: "all", selectedRowId: `SLOT-MOUNT::${dateKey}`, activeMasterId: "MASTER-MOUNT" },
    window: { start: `${dateKey}T00:00:00.000Z`, end: `${nextDateKey}T00:00:00.000Z`, label: "22.07.2026 · дневная смена" },
  };
  const model = adaptShiftMasterBoardPayload({
    productionModel: productionInput,
    capabilities: { assignmentSave: true, factSave: true, laneMove: true },
  });
  assert.equal(model.rows.length, 1);
  assert.equal(model.rows[0]?.id, `SLOT-MOUNT::${dateKey}`);
  assert.equal(model.selectedRow?.id, `SLOT-MOUNT::${dateKey}`);
  assert.equal(model.rows[0]?.documentNumber.startsWith("СЗН-20260722-M1-"), true);
  assert.equal(model.rows[0]?.orderLabel, "Контроллер КТ-7");
  assert.equal(model.rows[0]?.operationName, "Монтаж");
  assert.equal(model.rows[0]?.workCenterLabel, "Линия монтажа 1");
  assert.equal(model.rows[0]?.resourceLabel, "Монтажная линия 1");
  assert.equal(model.rows[0]?.assignedQuantity, 80);
  assert.equal(model.rows[0]?.actualQuantity, 60);
  assert.equal(model.rows[0]?.defectQuantity, 5);
  assert.equal(model.rows[0]?.factQuantity, 55);
  assert.equal(model.rows[0]?.remainingQuantity, 45);
  assert.equal(model.rows[0]?.laneId, "fact");
  assert.equal(model.rows[0]?.signal.label, "есть отклонение");
  assert.equal(model.rows[0]?.transferStatus, "partial_carryover_required");
  assert.equal(model.rows[0]?.carryoverId, "CARRYOVER-1");
  assert.equal(model.rows[0]?.carryoverDateKey, nextDateKey);
  assert.equal(model.rows[0]?.transfer.targetLabel, "Остаток в следующую смену");
  assert.equal(model.rows[0]?.executors[0]?.name, "Иванов Иван");
  assert.deepEqual(model.rows[0]?.assignableEmployees.map((employee) => employee.id), ["EMP-MOUNT"]);
  assert.equal(model.rows[0]?.assignableEmployees[0]?.available, true);
  assert.equal(model.rows[0]?.assignableEmployees[0]?.availabilityLabel, "дневная смена · 8 ч");
  assert.equal(model.plannedQuantity, 100);
  assert.equal(model.assignedQuantity, 80);
  assert.equal(model.factQuantity, 55);
  assert.equal(model.openQuantity, 45);
  assert.equal(model.lanes.find((lane) => lane.id === "fact")?.rows.length, 1);
  assert.deepEqual([model.canAssign, model.canRecordFact, model.canMoveLane], [true, true, true]);
  assert.deepEqual(model.masters.map((master) => master.id), ["MASTER-MOUNT", "MASTER-QA"]);
  assert.equal(model.readModelCoverage?.contract, "postgres-shift-master-board-read-v1");
  assert.equal(model.readModelCoverage?.deferred.length, 5);

  const openModel = adaptShiftMasterBoardPayload({ productionModel: { ...productionInput, ui: { ...productionInput.ui, focus: "open" } } });
  assert.equal(openModel.rows.length, 0, "open focus must hide a fact lane row");
  assert.equal(openModel.selectedRow, null);

  const nextShiftModel = adaptShiftMasterBoardPayload({
    productionModel: {
      ...productionInput,
      planning: { ...planning, slots: [] },
      ui: { ...productionInput.ui, dateKey: nextDateKey, selectedRowId: "CARRYOVER-1" },
      window: { start: `${nextDateKey}T00:00:00.000Z`, end: "2026-07-24T00:00:00.000Z" },
    },
  });
  assert.equal(nextShiftModel.rows.length, 1);
  assert.equal(nextShiftModel.rows[0]?.id, "CARRYOVER-1");
  assert.equal(nextShiftModel.rows[0]?.isCarryover, true);
  assert.equal(nextShiftModel.rows[0]?.sourceRowId, `SLOT-MOUNT::${dateKey}`);
  assert.equal(nextShiftModel.rows[0]?.plannedQuantity, 45);
  assert.equal(nextShiftModel.rows[0]?.laneId, "intake");

  const scopedModel = adaptShiftMasterBoardPayload({
    productionModel: {
      ...productionInput,
      session: { role: { id: "master" }, authenticatedPerson: { id: "MASTER-QA" } },
      ui: { ...productionInput.ui, activeMasterId: "MASTER-MOUNT" },
    },
  });
  assert.equal(scopedModel.rows.length, 0, "an authenticated master must fail closed outside owned work centers");
  assert.equal(scopedModel.masterId, "MASTER-QA");
  assert.equal(scopedModel.masters.length, 0);

  const directModel = adaptShiftMasterBoardPayload({
    planning,
    shiftExecution,
    ...systemDomains.registries,
    timesheet: productionInput.timesheet,
    session: productionInput.session,
    ui: productionInput.ui,
    window: productionInput.window,
    capabilities: { assignmentSave: true },
  });
  assert.equal(directModel.rows.length, 1, "direct raw owner payload must be detected without a productionModel wrapper");
  assert.equal(directModel.rows[0]?.assignableEmployees[0]?.id, "EMP-MOUNT");
  assert.equal(directModel.canAssign, true);

  const fixtureModel = adaptShiftMasterBoardPayload({
    model: {
      window: { label: "Fixture shift" },
      dateKey,
      rows: [{ id: "fixture-row", plannedQuantity: 7, boardAssignedQuantity: 3, boardGoodQuantity: 1, operationName: "Fixture", boardLaneId: "assigned", boardSignal: { label: "fixture", tone: "warning" } }],
      lanes: [{ id: "assigned", label: "Fixture lane", rows: [{ id: "fixture-row" }] }],
      selectedRow: { id: "fixture-row" },
      activeProfile: { id: "fixture-master", name: "Fixture Master", department: "Fixture" },
      masterOptions: [],
      plannedQuantity: 7,
      assignedQuantity: 3,
      factQuantity: 1,
      openQuantity: 6,
    },
    capabilities: { assignmentSave: true },
  });
  assert.equal(fixtureModel.rows[0]?.operationName, "Fixture");
  assert.equal(fixtureModel.selectedRow?.id, "fixture-row");
  assert.equal(fixtureModel.canAssign, true);
  assert.equal(fixtureModel.canRecordFact, false);

  const [adapterSource, productionSource] = await Promise.all([
    readFile(adapterPath, "utf8"),
    readFile(productionModelPath, "utf8"),
  ]);
  assert.doesNotMatch(`${adapterSource}\n${productionSource}`, /src\/modules\/shift_master_board|render\.js|getShiftMasterBoardModel/, "typed production model must not import or call the legacy board model");
  assert.match(productionSource, /SHIFT_MASTER_BOARD_DEFERRED_READ_FIELDS/);
  assert.match(productionSource, /historic assignments and carryovers outside the bounded current-shift PostgreSQL projection/);

  console.log("Shift Master Board React production model QA: OK");
  console.log("- planning + PostgreSQL Shift Execution + System Domains + Timesheet projection: pass");
  console.log("- focus, master scope, current/next-shift carryover and fixture compatibility: pass");
  console.log("- legacy model isolation and explicit deferred coverage: pass");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
