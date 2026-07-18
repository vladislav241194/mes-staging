import { copyFile, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { withSharedStateFileLock } from "./shared-state-storage.mjs";
import {
  beginPlanningSnapshotObservation,
  recordPlanningSnapshotObservation,
  resolvePlanningSnapshotObservationEnvironment,
} from "./planning-snapshot-observer.mjs";

const [statePath, routeId = "", employeeId = "demo-user:ROLE-D-WAREHOUSE-KLADOVSCHIK-1-EMP-01"] = process.argv.slice(2);
if (!statePath || !routeId) throw new Error("Usage: node specifications2-pilot-chain-seed.mjs <shared-state.json> <route-id> [employee-id]");

const initialRaw = await readFile(statePath, "utf8");
const root = JSON.parse(initialRaw);
const stateKey = "mes-planning-prototype-state-v2";
const state = JSON.parse(root.values?.[stateKey] || "{}");
const route = (state.routes || []).find((item) => item.id === routeId);
if (!route?.sourceSpecifications2EntryId) throw new Error("The selected route is not published from Specifications 2.0");

const steps = (state.routeSteps || [])
  .filter((step) => step.routeId === routeId)
  .sort((left, right) => Number(left.stepOrder || 0) - Number(right.stepOrder || 0));
if (!steps.length) throw new Error("The route has no operations");

const stamp = new Date().toISOString();
const revision = Number(route.documentRevisionSnapshot?.specificationRevision || route.revision || 1);
const snapshotId = route.workOrderSnapshot?.id || `wo-spec2-${routeId}-r${revision}`;
const laborByStepId = route.planningLaborByStepId || {};
route.documentRevisionSnapshot ||= {
  source: "specifications2",
  specificationEntryId: route.sourceSpecifications2EntryId,
  specificationId: route.specificationId,
  specificationRevision: revision,
  routeDraftId: route.sourceSpecifications2RouteDraftId || "",
  routeRevision: Number(route.revision || revision),
  releasedAt: route.createdAt || stamp,
  product: { designation: "АБВГ.469659.001", name: "Калоша" },
  operations: steps.map((step) => ({
    routeStepId: step.id,
    operationId: step.operationId || "",
    operationName: step.operationName || "Операция",
    workCenterId: step.workCenterId || "",
    nextWorkCenterId: step.nextWorkCenterId || "",
    nextOperationId: step.nextOperationId || "",
    normRevisionId: step.normRevisionId || "",
    labor: { ...(laborByStepId[step.id] || {}) },
  })),
};
route.workOrderSnapshot ||= {
  id: snapshotId,
  createdAt: stamp,
  source: "specifications2",
  specificationId: route.specificationId,
  specificationRevision: revision,
  routeId,
  routeRevision: Number(route.revision || revision),
  quantity: 1,
  operationRevisions: steps.map((step) => ({
    routeStepId: step.id,
    operationId: step.operationId || "",
    normRevisionId: step.normRevisionId || "",
    labor: { ...(laborByStepId[step.id] || {}) },
  })),
};
route.planningStatus = "scheduled";
route.updatedAt = stamp;

let cursor = new Date();
cursor.setMinutes(0, 0, 0);
cursor.setHours(Math.max(8, cursor.getHours() + 1));
const slotIds = [];
steps.forEach((step, index) => {
  const slotId = `slot-spec2-${routeId}-${step.id}`;
  slotIds.push(slotId);
  const existingSlot = (state.slots || []).find((slot) => slot.id === slotId);
  if (existingSlot) {
    existingSlot.planningOrderId = routeId;
    existingSlot.workOrderSnapshotId = snapshotId;
    return;
  }
  const labor = laborByStepId[step.id] || {};
  const durationMinutes = labor.mode === "fixed"
    ? Math.max(1, Number(labor.fixedMinutes || 0))
    : Math.max(1, Number(labor.minutesPerUnit || 0));
  const start = new Date(cursor);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  state.slots ||= [];
  state.slots.push({
    id: slotId,
    routeId,
    specificationId: route.specificationId,
    planningOrderId: routeId,
    routeWorkCenterId: step.workCenterId || "",
    workCenterId: step.planningWorkCenterId || step.workCenterId || "",
    routeStepId: step.id,
    operationId: step.operationId || "",
    operationName: step.operationName || "Операция",
    quantity: 1,
    sourceSpecifications2EntryId: route.sourceSpecifications2EntryId,
    specificationRevision: revision,
    routeRevision: Number(route.revision || revision),
    normRevisionId: step.normRevisionId || "",
    workOrderSnapshotId: snapshotId,
    plannedStart: start.toISOString(),
    plannedEnd: end.toISOString(),
    actualStart: "",
    actualEnd: "",
    status: "planned",
    comment: "Сквозной бизнес-тест Спецификации 2.0",
    createdAt: stamp,
    updatedAt: stamp,
  });
  cursor = new Date(end.getTime() + 5 * 60_000);
});

const firstStep = steps[0];
const firstSlotId = slotIds[0];
const assignmentId = firstSlotId;
root.sharedUi ||= {};
root.sharedUi.shiftMasterBoardAssignments ||= {};
root.sharedUi.shiftMasterBoardLaneBySlot ||= {};
root.sharedUi.shiftMasterBoardAssignments[assignmentId] ||= {
  slotId: firstSlotId,
  sourceRowId: firstSlotId,
  routeId,
  planningOrderId: routeId,
  stepId: firstStep.id,
  workCenterId: firstStep.workCenterId || "",
  plannedQuantity: 1,
  assignedQuantity: 1,
  laborMinutesPerUnit: Number(laborByStepId[firstStep.id]?.fixedMinutes || laborByStepId[firstStep.id]?.minutesPerUnit || 0),
  executors: [{ employeeId, quantity: 1, note: "Сквозной бизнес-тест" }],
  issued: true,
  status: "issued",
  sourceSpecifications2EntryId: route.sourceSpecifications2EntryId,
  specificationRevision: revision,
  routeRevision: Number(route.revision || revision),
  workOrderSnapshotId: snapshotId,
  unit: "шт.",
  documentNumber: `СЗН-SPEC2-R${revision}`,
  createdAt: stamp,
  issuedAt: stamp,
  updatedAt: stamp,
  sheetContract: {
    version: 1,
    documentType: "shiftWorkOrderSheet",
    documentNumber: `СЗН-SPEC2-R${revision}`,
    rowId: firstSlotId,
    sourceSlotId: firstSlotId,
    routeId,
    planningOrderId: routeId,
    stepId: firstStep.id,
    orderLabel: "АБВГ.469659.001 Калоша",
    routePartLabel: "Головная маршрутная карта",
    operationName: firstStep.operationName || "Операция",
    workCenterId: firstStep.workCenterId || "",
    workCenterLabel: "Склад",
    plannedQuantity: 1,
    assignedQuantity: 1,
    unit: "шт.",
    executors: [{ employeeId, employeeName: "Зайцева Мария", quantity: 1, note: "Сквозной бизнес-тест" }],
    status: "issued",
    sourceSpecifications2EntryId: route.sourceSpecifications2EntryId,
    specificationRevision: revision,
    routeRevision: Number(route.revision || revision),
    workOrderSnapshotId: snapshotId,
  },
};
root.sharedUi.shiftMasterBoardAssignments[assignmentId].planningOrderId = routeId;
if (root.sharedUi.shiftMasterBoardAssignments[assignmentId].sheetContract) {
  root.sharedUi.shiftMasterBoardAssignments[assignmentId].sheetContract.planningOrderId = routeId;
}
root.sharedUi.shiftMasterBoardLaneBySlot[firstSlotId] = "assigned";
root.values[stateKey] = JSON.stringify(state);
root.updatedAt = stamp;
root.updatedBy = "specifications2-end-to-end-qa";

const planningObservationEnv = await resolvePlanningSnapshotObservationEnvironment({
  env: process.env,
  targetSharedStateFile: resolve(statePath),
});
let backupPath = "";
let planningObservation = null;

await withSharedStateFileLock(statePath, async () => {
  // This seed is deliberately a one-shot QA utility. It must never overwrite
  // a concurrent Planning change that happened after its test fixture was
  // prepared, because the durable observation must refer to the actual prior
  // snapshot.
  const lockedRaw = await readFile(statePath, "utf8");
  if (lockedRaw !== initialRaw) {
    const error = new Error("Specifications 2.0 pilot-chain seed conflicts with a newer shared-state snapshot");
    error.code = "MES_SHARED_STATE_CONFLICT";
    throw error;
  }
  const currentSnapshot = JSON.parse(lockedRaw);
  const observation = await beginPlanningSnapshotObservation({
    env: planningObservationEnv,
    current: currentSnapshot,
    next: root,
    source: "specifications2-pilot-chain-seed",
  });
  if (!observation.ok) {
    const error = new Error(`Specifications 2.0 pilot-chain seed was blocked before writing Planning data: ${observation.error || "Planning snapshot observation is unavailable"}`);
    error.code = "MES_PLANNING_SNAPSHOT_OBSERVATION_UNAVAILABLE";
    throw error;
  }

  backupPath = join(dirname(statePath), `${new Date().toISOString().replaceAll(":", "-")}__before-specifications2-e2e.json`);
  await copyFile(statePath, backupPath);
  const temporaryPath = `${statePath}.spec2-e2e.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(root, null, 2)}\n`);
  await rename(temporaryPath, statePath);
  planningObservation = await recordPlanningSnapshotObservation({
    observation,
    snapshot: root,
    source: "specifications2-pilot-chain-seed",
  });
});

console.log(JSON.stringify({
  routeId,
  revision,
  snapshotId,
  slotIds,
  assignmentId,
  backupPath,
  planningSnapshotObservation: planningObservation?.attempted
    ? (planningObservation.recorded ? "recorded" : "pending")
    : "not-required",
}));
