import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-employee-desktop-model-"));
try {
  const output = join(temporaryRoot, "adapter.mjs");
  const adapterPath = new URL("../experiments/react-migration/src/modules/employee-desktop/adapter.ts", import.meta.url);
  const productionModelPath = new URL("../experiments/react-migration/src/modules/employee-desktop/production-model.ts", import.meta.url);
  await build({ entryPoints: [adapterPath.pathname], outfile: output, bundle: true, platform: "node", format: "esm", target: "node20" });
  const { adaptEmployeeDesktopPayload } = await import(`${pathToFileURL(output).href}?qa=${Date.now()}`);

  const productionModel = {
    boardRows: [
      { id: "row-mount", routeId: "route-a", stepId: "step-1", startsAt: "2026-07-22T06:00:00.000Z", operationName: "Монтаж", workCenterId: "wc-a", routeName: "ЗН-1042", taskLabel: "Основной маршрут", documentNumber: "СЗН-1", plannedQuantity: 20, unit: "шт.", masterMinutesPerUnit: 2 },
      { id: "row-control", routeId: "route-a", stepId: "step-2", startsAt: "2026-07-22T08:00:00.000Z", operationName: "Контроль", workCenterId: "wc-b", routeName: "ЗН-1042", taskLabel: "Основной маршрут", documentNumber: "СЗН-2", plannedQuantity: 10, unit: "шт.", boardAssignment: { issued: true, executors: [{ employeeId: "employee-b", quantity: 10 }] } },
    ],
    storedAssignments: {
      "row-mount": { issued: true, executors: [{ employeeId: "employee-a", quantity: 20 }] },
      "stored-only": { sourceRowId: "row-pack", slotId: "slot-pack", issued: false, executors: [{ employeeId: "employee-a", quantity: 4 }], sheetContract: { routeId: "route-b", stepId: "step-pack", operationName: "Упаковка", documentNumber: "СЗН-3", orderLabel: "ЗН-1043", workCenterId: "wc-a" } },
    },
    factDrafts: {
      "row-mount::employee-a": { actualQuantity: 19, defectQuantity: 1, updatedAt: "2026-07-22T07:00:00.000Z" },
      "row-control::employee-b": { status: "in_progress", actualQuantity: 0, defectQuantity: 0 },
    },
    planning: {
      slots: [{ id: "slot-pack", routeId: "route-b", routeStepId: "step-pack", plannedStart: "2026-07-22T10:00:00.000Z", workCenterId: "wc-a", quantity: 4 }],
      routes: [{ id: "route-b", name: "ЗН-1043" }],
      routeSteps: [{ id: "step-pack", routeId: "route-b", operationName: "Упаковка", workCenterId: "wc-a", specTaskName: "Финиш" }],
    },
    employees: [
      { id: "employee-a", displayName: "Иванов Иван Иванович", department: "Монтаж" },
      { id: "employee-b", name: "Петрова Анна Сергеевна", department: "ОТК" },
    ],
    workCenters: [{ id: "wc-a", name: "Монтаж" }, { id: "wc-b", name: "ОТК" }],
    session: { activeRole: { id: "admin" }, canViewAll: true, viewedPersonId: "__all", selectedTaskId: "row-control::employee-b", authenticatedPerson: { id: "employee-a", displayName: "Иванов Иван Иванович" } },
    reportSummaries: { "row-control": [{ id: "report-1", photo: { id: "photo-1" } }] },
  };
  const model = adaptEmployeeDesktopPayload({
    productionModel,
    capabilities: { taskStart: true, factSave: true, reportSave: true, sessionNavigation: true },
  });
  assert.equal(model.tasks.length, 3, "board and stored-only assignments must project without auth_render");
  assert.equal(model.selectedTask?.id, "row-control::employee-b");
  assert.equal(model.canSwitchPerson, true);
  assert.equal(model.assignedQuantity, 34);
  assert.equal(model.goodQuantity, 18);
  const mounted = model.tasks.find((task) => task.id === "row-mount::employee-a");
  const controlled = model.tasks.find((task) => task.id === "row-control::employee-b");
  const packed = model.tasks.find((task) => task.id === "row-pack::employee-a");
  assert.deepEqual([mounted?.status, mounted?.isDone, mounted?.nextOperation], ["факт записан", true, "Контроль"]);
  assert.deepEqual([controlled?.status, controlled?.isStarted, controlled?.previousOperation], ["в работе", true, "Монтаж"]);
  assert.deepEqual([controlled?.reportCount, controlled?.photoCount], [1, 1]);
  assert.deepEqual([packed?.operationName, packed?.workCenterLabel, packed?.documentNumber], ["Упаковка", "Монтаж", "СЗН-3"]);

  const employeeModel = adaptEmployeeDesktopPayload({
    ...productionModel,
    session: { activeRole: { id: "executor" }, authenticatedPerson: { id: "employee-b", name: "Петрова Анна Сергеевна" }, viewedPersonId: "__all" },
    capabilities: { taskStart: true, factSave: true, reportSave: true, sessionNavigation: true },
  });
  assert.equal(employeeModel.canSwitchPerson, false);
  assert.equal(employeeModel.viewedPersonId, "employee-b");
  assert.deepEqual(employeeModel.tasks.map((task) => task.id), ["row-control::employee-b"]);
  assert.equal(employeeModel.assignedQuantity, 10);

  const legacyModel = adaptEmployeeDesktopPayload({
    model: { tasks: [{ id: "legacy-task", rowId: "legacy-row", employeeId: "employee-a", employeeName: "Иванов Иван Иванович", assignedQuantity: 2, actualQuantity: 1, goodQuantity: 1, chain: {} }], selectedTask: { id: "legacy-task" }, taskPeople: [{ id: "employee-a", name: "Иванов Иван Иванович" }], person: { name: "Иванов Иван Иванович" }, activeTasks: [{}], doneTasks: [], assignedQuantity: 2, goodQuantity: 1, canViewAll: false },
    reportSummaries: {},
    capabilities: { sessionNavigation: true },
  });
  assert.equal(legacyModel.selectedTask?.id, "legacy-task", "old island fixture payload must stay compatible");

  const [adapterSource, productionSource] = await Promise.all([
    readFile(adapterPath, "utf8"),
    readFile(productionModelPath, "utf8"),
  ]);
  assert.doesNotMatch(
    `${adapterSource}\n${productionSource}`,
    /from\s+["'][^"']*auth_render|getAuthSessionPrototypeModel\s*\(/,
    "typed model must not import or call the legacy auth renderer",
  );

  console.log("Employee Desktop React production model QA: OK");
  console.log("- raw board/assignment/fact/session projection and legacy payload compatibility: pass");
  console.log("- route chain, person scope, report summary and synthetic assignment row: pass");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
