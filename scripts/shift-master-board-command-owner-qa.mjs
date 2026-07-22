import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createShiftMasterBoardCommandOwner } from "../src/modules/shift_master_board/command_owner.js";
import {
  buildShiftMasterBoardAssignmentWrite,
  buildShiftMasterBoardCarryoverWrite,
  buildShiftMasterBoardFactWrite,
} from "../src/modules/shift_master_board/server_execution_bridge.js";

const dateKey = "2026-07-22";
const nextDateKey = "2026-07-23";
const rowId = `SLOT-MOUNT::${dateKey}`;
const systemDomains = {
  registries: {
    workCenters: [
      { id: "WC-MOUNT", name: "Монтаж", isActive: true },
      { id: "WC-LINE-1", name: "Линия 1", parentWorkCenterId: "WC-MOUNT", isActive: true },
      { id: "WC-QA", name: "ОТК", isActive: true },
    ],
    positions: [
      { id: "POS-MASTER", capabilities: { canDistribute: true, canExecute: false }, isActive: true },
      { id: "POS-EXECUTOR", capabilities: { canExecute: true, canReceiveShiftSheet: true }, isActive: true },
    ],
    employees: [
      { id: "MASTER-1", displayName: "Смирнов Алексей", isActive: true },
      { id: "EMP-1", displayName: "Иванов Иван", isActive: true },
      { id: "EMP-2", displayName: "Петров Пётр", isActive: true },
      { id: "OUTSIDER", displayName: "Волкова Дарья", isActive: true },
    ],
    employmentAssignments: [
      { id: "EA-MASTER", employeeId: "MASTER-1", positionId: "POS-MASTER", workCenterId: "WC-MOUNT", isPrimary: true },
      { id: "EA-1", employeeId: "EMP-1", positionId: "POS-EXECUTOR", workCenterId: "WC-LINE-1", isPrimary: true },
      { id: "EA-2", employeeId: "EMP-2", positionId: "POS-EXECUTOR", workCenterId: "WC-LINE-1", isPrimary: true },
      { id: "EA-OUT", employeeId: "OUTSIDER", positionId: "POS-EXECUTOR", workCenterId: "WC-QA", isPrimary: true },
    ],
    responsibilityPolicies: [{ id: "POLICY-1", subjectEmployeeId: "MASTER-1", mode: "department", isActive: true }],
    scheduleTemplates: [],
    scheduleAssignments: [],
    attendanceEvents: [],
    equipment: [{ id: "LINE-1", name: "Монтажная линия 1", workCenterId: "WC-LINE-1", isActive: true }],
  },
};
const planning = {
  routes: [{ id: "WO-1", name: "Маршрут КТ-7", specificationName: "Контроллер КТ-7", planningQuantity: 100, unit: "шт." }],
  routeSteps: [
    { id: "STEP-1", routeId: "WO-1", operationName: "Монтаж", stepOrder: 1, planningWorkCenterId: "WC-LINE-1" },
    { id: "STEP-2", routeId: "WO-1", operationName: "Контроль", stepOrder: 2, planningWorkCenterId: "WC-QA" },
  ],
  slots: [{ id: "SLOT-MOUNT", routeId: "WO-1", routeStepId: "STEP-1", workCenterId: "WC-LINE-1", resourceId: "LINE-1", plannedStart: `${dateKey}T08:00:00+03:00`, quantity: 100, unit: "шт." }],
};
const serverAssignment = {
  id: "ASSIGNMENT-1",
  revision: 3,
  sourceRowId: rowId,
  sourceSlotId: "SLOT-MOUNT",
  workOrderId: "WO-1",
  operationId: "STEP-1",
  workCenterId: "WC-LINE-1",
  resourceId: "LINE-1",
  masterId: "MASTER-1",
  plannedQuantity: 100,
  assignedQuantity: 80,
  unit: "шт.",
  status: "issued",
  issued: true,
  issuedAt: `${dateKey}T05:05:00.000Z`,
  executors: [{ employeeId: "EMP-1", quantity: 80 }],
};
const serverCarryover = {
  id: "CARRYOVER-1",
  serverId: "CARRYOVER-1",
  sourceAssignmentId: serverAssignment.id,
  sourceRowId: rowId,
  sourceSlotId: "SLOT-MOUNT",
  workOrderId: "WO-1",
  operationId: "STEP-1",
  workCenterId: "WC-LINE-1",
  dateKey: nextDateKey,
  remainingQuantity: 45,
  createdAt: `${dateKey}T11:00:00.000Z`,
};
const payload = {
  productionModel: {
    planning,
    shiftExecution: { items: [serverAssignment], carryovers: [serverCarryover], scope: { dateKey, sourceRowIds: [rowId] } },
    systemDomains,
    timesheet: {
      availability: {
        [`EMP-1::${dateKey}`]: { isAvailable: true, label: "дневная смена · 8 ч" },
        [`EMP-2::${dateKey}`]: { isAvailable: false, label: "отсутствует" },
      },
    },
    ui: { dateKey, activeMasterId: "MASTER-1", selectedRowId: rowId },
  },
};
const uiState = {
  dateKey,
  activeMasterId: "MASTER-1",
  selectedRowId: rowId,
  shiftMasterBoardAssignments: {},
  shiftMasterBoardFacts: {},
  shiftMasterBoardCarryovers: {},
  shiftMasterBoardLaneBySlot: {},
};
const owner = createShiftMasterBoardCommandOwner({
  payload,
  uiState,
  getPermissions: () => ({ assign: true, edit: true, moveLane: true }),
  now: () => `${dateKey}T12:00:00.000Z`,
});

const row = owner.getRow(rowId);
assert.equal(row?.sourceSlotId, "SLOT-MOUNT");
assert.equal(row?.workOrderId, "WO-1");
assert.equal(row?.operationId, "STEP-1");
assert.equal(row?.serverAssignment?.revision, 3);
assert.equal(owner.getModel().selectedRow?.id, rowId);

const assignmentContext = owner.getAssignmentContext(rowId);
assert.deepEqual(
  assignmentContext?.employees.map((employee) => [employee.id, employee.name, employee.availability.isAvailable]),
  [["EMP-1", "Иванов Иван", true], ["EMP-2", "Петров Пётр", false]],
  "the non-executable master must still own its department scope while outsiders remain excluded",
);
assert.deepEqual(
  [assignmentContext?.rowId, assignmentContext?.operationName, assignmentContext?.plannedQuantity, assignmentContext?.unit],
  [rowId, "Монтаж", 100, "шт."],
);

const unavailable = owner.execute({ type: "save-assignment", rowId, executors: [{ employeeId: "EMP-2", quantity: 10 }] });
assert.equal(unavailable.ok, false);
assert.deepEqual(uiState.shiftMasterBoardAssignments, {}, "a rejected command must not mutate UI state");
const overPlan = owner.execute({ type: "save-assignment", rowId, executors: [{ employeeId: "EMP-1", quantity: 101 }] });
assert.equal(overPlan.ok, false);
const duplicate = owner.execute({ type: "save-assignment", rowId, executors: [{ employeeId: "EMP-1", quantity: 40 }, { employeeId: "EMP-1", quantity: 40 }] });
assert.equal(duplicate.ok, false);

const assignment = owner.execute({ type: "save-assignment", rowId, executors: [{ employeeId: "EMP-1", quantity: 90 }] });
assert.equal(assignment.ok, true);
assert.equal(assignment.assignment.assignedQuantity, 90);
assert.equal(uiState.shiftMasterBoardLaneBySlot[rowId], "assigned");
const assignmentWrite = buildShiftMasterBoardAssignmentWrite(assignment.row, assignment.assignment, assignment.serverAssignment);
assert.equal(assignmentWrite.type, "update");
assert.equal(assignmentWrite.assignmentId, "ASSIGNMENT-1");
assert.equal(assignmentWrite.payload.expectedRevision, 3);
assert.equal(assignmentWrite.payload.sourceSlotId, "SLOT-MOUNT");
assert.match(assignmentWrite.idempotencyKey, /^shift-update:ASSIGNMENT-1:/);

const invalidFact = owner.execute({ type: "save-fact", rowId, actualQuantity: 2, defectQuantity: 3, laborMinutes: 10, executorCount: 1 });
assert.equal(invalidFact.ok, false);
const partialFact = owner.execute({ type: "save-fact", rowId, actualQuantity: 80, defectQuantity: 2, laborMinutes: 360, executorCount: 1, comment: "Частичный выпуск" });
assert.equal(partialFact.ok, true);
assert.equal(partialFact.carryover.remainingQuantity, 22);
assert.equal(partialFact.carryoverChanged, true);
assert.equal(partialFact.replacedCarryover?.serverId, "CARRYOVER-1");
assert.equal(uiState.shiftMasterBoardLaneBySlot[rowId], "fact");
const factWrite = buildShiftMasterBoardFactWrite(partialFact.row, partialFact.fact, partialFact.serverAssignment);
assert.equal(factWrite.type, "fact");
assert.equal(factWrite.payload.actualQuantity, 80);
const carryoverWrite = buildShiftMasterBoardCarryoverWrite(partialFact.carryover, partialFact.serverAssignment);
assert.equal(carryoverWrite.type, "carryover");
assert.equal(carryoverWrite.payload.remainingQuantity, 22);

const repeatedFact = owner.execute({ type: "save-fact", rowId, actualQuantity: 80, defectQuantity: 2, laborMinutes: 360, executorCount: 1 });
assert.equal(repeatedFact.ok, true);
assert.equal(repeatedFact.carryoverChanged, false);
assert.equal(repeatedFact.carryover.id, partialFact.carryover.id);
assert.equal(repeatedFact.carryover.createdAt, partialFact.carryover.createdAt);

const completedFact = owner.execute({ type: "save-fact", rowId, actualQuantity: 100, defectQuantity: 0, laborMinutes: 420, executorCount: 1 });
assert.equal(completedFact.ok, true);
assert.equal(completedFact.carryover, null);
assert.equal(completedFact.removedCarryovers.length, 1);
assert.equal(Object.keys(uiState.shiftMasterBoardCarryovers).length, 0);

const noAssignmentPayload = {
  productionModel: {
    ...payload.productionModel,
    shiftExecution: { items: [], carryovers: [], scope: { dateKey, sourceRowIds: [rowId] } },
  },
};
const noAssignmentOwner = createShiftMasterBoardCommandOwner({ payload: noAssignmentPayload, uiState: { ...uiState, shiftMasterBoardAssignments: {}, shiftMasterBoardFacts: {} }, getPermissions: () => ({ edit: true }) });
assert.equal(noAssignmentOwner.execute({ type: "save-fact", rowId, actualQuantity: 1, defectQuantity: 0, laborMinutes: 1, executorCount: 1 }).ok, false);

const carryoverUiState = {
  ...uiState,
  dateKey: nextDateKey,
  selectedRowId: serverCarryover.id,
  shiftMasterBoardAssignments: {},
  shiftMasterBoardFacts: {},
  shiftMasterBoardCarryovers: {},
  shiftMasterBoardLaneBySlot: {},
};
const carryoverPayload = {
  productionModel: {
    ...payload.productionModel,
    ui: { ...payload.productionModel.ui, dateKey: nextDateKey, selectedRowId: serverCarryover.id },
  },
};
const carryoverOwner = createShiftMasterBoardCommandOwner({ payload: carryoverPayload, uiState: carryoverUiState, getPermissions: () => ({ assign: true, edit: true, moveLane: true }) });
const carryoverRow = carryoverOwner.getModel().allRows.find((candidate) => candidate.isBoardCarryover);
assert.ok(carryoverRow, "the next shift must expose the PostgreSQL carryover row");
assert.equal(carryoverOwner.execute({ type: "save-assignment", rowId: carryoverRow.id, executors: [{ employeeId: "EMP-1", quantity: 10 }] }).ok, false);
assert.equal(carryoverOwner.execute({ type: "save-fact", rowId: carryoverRow.id, actualQuantity: 10, defectQuantity: 0, laborMinutes: 10, executorCount: 1 }).ok, false);
assert.equal(carryoverOwner.execute({ type: "move-lane", rowId: carryoverRow.id, laneId: "assigned" }).ok, false);
assert.deepEqual(carryoverUiState.shiftMasterBoardAssignments, {}, "read-only carryovers must not receive optimistic UI writes");

const laneState = { dateKey, activeMasterId: "MASTER-1", shiftMasterBoardAssignments: {}, shiftMasterBoardFacts: {}, shiftMasterBoardCarryovers: {}, shiftMasterBoardLaneBySlot: {} };
const laneOwner = createShiftMasterBoardCommandOwner({ payload, uiState: laneState, getPermissions: () => ({ moveLane: true }) });
assert.equal(laneOwner.execute({ type: "move-lane", rowId, laneId: "assigned" }).ok, true);
assert.equal(laneState.shiftMasterBoardLaneBySlot[rowId], "assigned");
assert.equal(laneOwner.execute({ type: "move-lane", rowId, laneId: "fact" }).ok, false);

const source = await readFile(new URL("../src/modules/shift_master_board/command_owner.js", import.meta.url), "utf8");
assert.doesNotMatch(source, /\bfetch\s*\(/, "command owner must not duplicate the HTTP mirror");
assert.doesNotMatch(source, /getShiftMasterBoardModel|saveShiftMasterBoardAssignment|saveShiftMasterBoardFact|render\.js/);

console.log("Shift Master Board command owner QA: OK");
console.log("- typed production payload lookup and Journal assignment context: pass");
console.log("- assignment/fact/lane validation and optimistic patches: pass");
console.log("- existing server bridge contract, carryover replacement and idempotent retry: pass");
console.log("- legacy model/save and HTTP isolation: pass");
