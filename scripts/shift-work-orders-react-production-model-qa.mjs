import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-shift-work-orders-model-"));
try {
  const output = join(temporaryRoot, "adapter.mjs");
  const adapterPath = new URL("../experiments/react-migration/src/modules/shift-work-orders/adapter.ts", import.meta.url);
  const productionModelPath = new URL("../experiments/react-migration/src/modules/shift-work-orders/production-model.ts", import.meta.url);
  await build({ entryPoints: [adapterPath.pathname], outfile: output, bundle: true, platform: "node", format: "esm", target: "node20" });
  const { adaptShiftWorkOrders } = await import(`${pathToFileURL(output).href}?qa=${Date.now()}`);

  const productionModel = {
    shiftExecution: {
      items: [
        {
          id: "assignment-mount",
          sourceRowId: "row-mount",
          sourceSlotId: "slot-mount",
          workOrderId: "route-a",
          operationId: "step-mount",
          workCenterId: "wc-mount",
          resourceId: "line-1",
          masterId: "employee-master",
          plannedQuantity: 120,
          assignedQuantity: 80,
          unit: "шт.",
          status: "issued",
          issuedAt: "2026-07-22T05:10:00.000Z",
          updatedAt: "2026-07-22T05:15:00.000Z",
          executors: [{ employeeId: "employee-a", quantity: 80 }],
        },
        {
          id: "assignment-control",
          sourceRowId: "row-control",
          sourceSlotId: "slot-control",
          workOrderId: "route-a",
          operationId: "step-control",
          workCenterId: "wc-control",
          masterId: "employee-master",
          plannedQuantity: 120,
          assignedQuantity: 40,
          unit: "шт.",
          status: "assigned",
          updatedAt: "2026-07-22T06:10:00.000Z",
          executors: [{ employeeId: "employee-b", quantity: 40 }],
        },
        {
          id: "assignment-pack",
          sourceRowId: "row-pack",
          sourceSlotId: "slot-pack",
          workOrderId: "route-b",
          operationId: "step-pack",
          workCenterId: "wc-pack",
          masterId: "employee-master",
          plannedQuantity: 80,
          assignedQuantity: 80,
          unit: "шт.",
          status: "completed",
          updatedAt: "2026-07-22T04:00:00.000Z",
          executors: [{ employeeId: "employee-c", quantity: 80 }],
        },
      ],
      facts: [
        { id: "fact-mount-old", assignmentId: "assignment-mount", actualQuantity: 20, defectQuantity: 0, reportedAt: "2026-07-22T07:00:00.000Z" },
        { id: "fact-mount", assignmentId: "assignment-mount", actualQuantity: 62, defectQuantity: 2, laborMinutes: 180, executorCount: 1, comment: "Смена завершена частично", deviationComment: "Нет компонентов", reportedAt: "2026-07-22T08:00:00.000Z" },
        { id: "fact-pack", assignmentId: "assignment-pack", actualQuantity: 80, defectQuantity: 0, laborMinutes: 60, executorCount: 1, reportedAt: "2026-07-22T05:00:00.000Z" },
      ],
      carryovers: [{ id: "carryover-mount", sourceAssignmentId: "assignment-mount", sourceRowId: "row-mount", sourceSlotId: "slot-mount", workOrderId: "route-a", operationId: "step-mount", workCenterId: "wc-mount", dateKey: "2026-07-22", remainingQuantity: 60, reason: "Остаток после факта", createdAt: "2026-07-22T08:01:00.000Z" }],
      reports: {
        "assignment-mount": [{ id: "report-mount", assignmentId: "assignment-mount", employeeId: "employee-a", employeeName: "Иванов Иван Иванович", description: "Не хватает комплектующих.", createdAt: "2026-07-22T07:45:00.000Z", photo: { id: "photo-mount", name: "defect.jpg", dataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", storageNote: "PostgreSQL report payload" } }],
      },
      scope: { dateKey: "2026-07-22", label: "22.07.2026 · дневная смена" },
    },
    planning: {
      routes: [
        { id: "route-a", number: "ЗН-1042", name: "Контроллер КТ-7", specificationName: "Контроллер КТ-7" },
        { id: "route-b", number: "ЗН-1041", name: "Модуль питания", specificationName: "Модуль питания" },
      ],
      routeSteps: [
        { id: "step-mount", routeId: "route-a", stepOrder: 1, operationName: "Монтаж", specTaskName: "Основной маршрут", planningWorkCenterId: "wc-mount" },
        { id: "step-control", routeId: "route-a", stepOrder: 2, operationName: "Контроль", specTaskName: "Основной маршрут", planningWorkCenterId: "wc-control" },
        { id: "step-pack", routeId: "route-b", stepOrder: 1, operationName: "Упаковка", specTaskName: "Финиш", planningWorkCenterId: "wc-pack" },
      ],
      slots: [
        { id: "slot-mount", routeId: "route-a", routeStepId: "step-mount", workCenterId: "wc-mount", plannedStart: "2026-07-22T05:00:00.000Z", plannedEnd: "2026-07-22T08:00:00.000Z", quantity: 120 },
        { id: "slot-control", routeId: "route-a", routeStepId: "step-control", workCenterId: "wc-control", plannedStart: "2026-07-22T08:00:00.000Z", plannedEnd: "2026-07-22T09:00:00.000Z", quantity: 120 },
        { id: "slot-pack", routeId: "route-b", routeStepId: "step-pack", workCenterId: "wc-pack", plannedStart: "2026-07-22T04:00:00.000Z", plannedEnd: "2026-07-22T05:00:00.000Z", quantity: 80 },
      ],
    },
    employees: [
      { id: "employee-master", displayName: "Смирнов Алексей Петрович" },
      { id: "employee-a", displayName: "Иванов Иван Иванович" },
      { id: "employee-b", name: "Петрова Анна Сергеевна" },
      { id: "employee-c", name: "Сидоров Павел Олегович" },
    ],
    workCenters: [
      { id: "wc-mount", code: "MNT", name: "Ручной монтаж" },
      { id: "wc-control", code: "QA", name: "ОТК" },
      { id: "wc-pack", code: "PACK", name: "Склад" },
    ],
    printMetadata: {
      "row-mount": { documentNumber: "СЗН-1042-01", orderLabel: "ЗН-1042 · Контроллер КТ-7", resourceLabel: "Линия 1" },
      "row-control": { documentNumber: "СЗН-1042-02", orderLabel: "ЗН-1042 · Контроллер КТ-7" },
      "row-pack": { documentNumber: "СЗН-1041-01", orderLabel: "ЗН-1041 · Модуль питания" },
    },
    presentation: { selectedRowId: "row-control" },
  };

  const model = adaptShiftWorkOrders({
    productionModel,
    capabilities: { assignmentSave: true, factSave: true },
  });
  assert.equal(model.rows.length, 4, "three assignments and one active carryover must project without the legacy journal builder");
  assert.equal(model.documents.length, 2);
  assert.equal(model.operationCount, 3);
  assert.equal(model.selectedRow?.id, "row-control");
  assert.equal(model.sourceWindowLabel, "22.07.2026 · дневная смена");
  assert.equal(model.canSaveAssignment, true);
  assert.equal(model.canSaveFact, true);

  const mounted = model.rows.find((row) => row.id === "row-mount");
  assert(mounted, "mounted assignment is missing");
  assert.deepEqual(
    [mounted.assignmentId, mounted.documentNumber, mounted.orderLabel, mounted.operationName, mounted.workCenterLabel, mounted.masterName],
    ["assignment-mount", "СЗН-1042-01", "ЗН-1042 · Контроллер КТ-7", "Монтаж", "Ручной монтаж", "Смирнов Алексей"],
  );
  assert.deepEqual([mounted.actualQuantity, mounted.defectQuantity, mounted.factQuantity, mounted.remainingQuantity], [62, 2, 60, 60]);
  assert.deepEqual([mounted.status.id, mounted.stageLabel, mounted.hasFact, mounted.factEditable], ["carryover", "СЗН с остатком", true, true]);
  assert.deepEqual([mounted.executors[0]?.name, mounted.issueReportCount, mounted.issuePhotoCount], ["Иванов Иван", 1, 1]);
  assert.equal(mounted.issueReports[0]?.photoName, "defect.jpg");
  assert.deepEqual([mounted.transfer.toOperationName, mounted.transfer.targetLabel], ["Монтаж", "Остаток в следующую смену"]);

  const controlled = model.rows.find((row) => row.id === "row-control");
  assert(controlled, "control assignment is missing");
  assert.deepEqual([controlled.status.id, controlled.workCenterLabel, controlled.transfer.toOperationName], ["assigned", "ОТК", "Завершение маршрута"]);

  const packed = model.rows.find((row) => row.id === "row-pack");
  assert(packed, "pack assignment is missing");
  assert.deepEqual([packed.status.id, packed.factQuantity, packed.remainingQuantity], ["closed", 80, 0]);

  const carryover = model.rows.find((row) => row.id === "carryover-mount");
  assert(carryover, "active PostgreSQL carryover is missing");
  assert.deepEqual([carryover.status.id, carryover.plannedQuantity, carryover.shiftDateKey, carryover.factEditable], ["carryover", 60, "2026-07-22", false]);
  assert.match(carryover.documentNumber, /^ОСТ-20260722-MNT$/);

  const routeDocument = model.documents.find((document) => document.id === "route-a");
  assert(routeDocument, "route-a document group is missing");
  assert.equal(routeDocument.operations.length, 2);
  assert.equal(routeDocument.operations.find((operation) => operation.id === "step-mount")?.rows.length, 2);
  assert.equal(model.readModelCoverage?.contract, "postgres-shift-work-orders-read-v1");
  assert(model.readModelCoverage?.deferred.some((item) => item.includes("historical pagination")), "bounded model must explicitly expose deferred historical coverage");
  assert(model.readModelCoverage?.deferred.some((item) => item.includes("print package")), "full print package must stay explicitly deferred");

  const directModel = adaptShiftWorkOrders({
    ...productionModel,
    capabilities: { assignmentSave: false, factSave: false },
  });
  assert.equal(directModel.rows.length, 4, "direct raw production payload must be detected without a wrapper");
  assert.equal(directModel.canSaveFact, false);

  const legacyModel = adaptShiftWorkOrders({
    model: {
      rows: [{ id: "legacy-row", sourceRowId: "legacy-source", documentNumber: "СЗН-LEGACY", orderLabel: "ЗН legacy", operationName: "Операция", workCenterLabel: "Участок", plannedQuantity: 1, assignedQuantity: 1, remainingQuantity: 1, status: { id: "assigned", label: "распределено", tone: "active" }, executors: [], issueReports: [], transfer: {} }],
      documentTree: [{ id: "legacy-document", label: "ЗН legacy", rows: [], operationGroups: [{ id: "legacy-operation", operationName: "Операция", rows: [{ id: "legacy-row", sourceRowId: "legacy-source", documentNumber: "СЗН-LEGACY", orderLabel: "ЗН legacy", operationName: "Операция", workCenterLabel: "Участок", plannedQuantity: 1, assignedQuantity: 1, remainingQuantity: 1, status: { id: "assigned", label: "распределено", tone: "active" }, executors: [], issueReports: [], transfer: {} }] }] }],
      selectedRow: { id: "legacy-row" },
      sourceWindow: { label: "legacy fixture" },
    },
  });
  assert.equal(legacyModel.selectedRow?.id, "legacy-row", "existing {model} fixtures must remain compatible");
  assert.equal(legacyModel.sourceWindowLabel, "legacy fixture");

  const [adapterSource, productionSource] = await Promise.all([
    readFile(adapterPath, "utf8"),
    readFile(productionModelPath, "utf8"),
  ]);
  assert.doesNotMatch(
    `${adapterSource}\n${productionSource}`,
    /getShiftWorkOrderJournalViewModel\s*\(|from\s+["'][^"']*shift_work_orders\/render/,
    "typed production model must not import or call the legacy journal renderer",
  );

  console.log("Shift Work Orders React production model QA: OK");
  console.log("- PostgreSQL assignments/facts/carryovers/reports + planning/System Domains projection: pass");
  console.log("- document tree, selection, source window and legacy {model} fixture compatibility: pass");
  console.log("- bounded read coverage is explicit; historical pagination and full print package remain deferred");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
