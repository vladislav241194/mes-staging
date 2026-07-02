import { readFileSync } from "node:fs";
import {
  PRODUCTION_STRUCTURE_MATRIX_COLUMNS,
  PRODUCTION_STRUCTURE_MATRIX_ROWS,
} from "../src/production_structure_matrix_data.js";
import {
  getProductionStructureEmployees,
  getProductionStructureExecutorRows,
  getProductionStructureMasterProfiles,
  getProductionStructureResources,
  getProductionStructureSummary,
  getProductionStructureWorkCenters,
} from "../src/production_structure_service.js";
import { MES_OPERATION_MAP } from "../src/mes_org_model.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const summary = getProductionStructureSummary();
const employees = getProductionStructureEmployees();
const executors = getProductionStructureExecutorRows();
const masters = getProductionStructureMasterProfiles();
const resources = getProductionStructureResources();
const workCenters = getProductionStructureWorkCenters();
const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const dataSource = readFileSync(new URL("../src/data.js", import.meta.url), "utf8");
const workflowPresetSource = readFileSync(new URL("../workflow-preset.json", import.meta.url), "utf8");
const shiftMasterBoardQaSource = readFileSync(new URL("./shift-master-board-functional-qa.mjs", import.meta.url), "utf8");
const legacyDirectorySectionIds = ["departments", "resources", "equipment", "productionResources", "norms", "employees"];
const directorySectionsStart = appSource.indexOf("const directorySections = [");
const directorySectionsEnd = appSource.indexOf("const LEGACY_PRODUCTION_DIRECTORY_SECTION_IDS", directorySectionsStart);
const directorySectionsSource = directorySectionsStart >= 0 && directorySectionsEnd > directorySectionsStart
  ? appSource.slice(directorySectionsStart, directorySectionsEnd)
  : "";
const defaultDirectoryStart = appSource.indexOf("function createDefaultDirectoryState()");
const defaultDirectoryEnd = appSource.indexOf("function loadState()", defaultDirectoryStart);
const defaultDirectorySource = defaultDirectoryStart >= 0 && defaultDirectoryEnd > defaultDirectoryStart
  ? appSource.slice(defaultDirectoryStart, defaultDirectoryEnd)
  : "";
const matrixEventStart = appSource.indexOf("function bindProductionStructureMatrixEvents()");
const matrixEventEnd = appSource.indexOf("function bindAccessRolesEvents()", matrixEventStart);
const matrixEventSource = matrixEventStart >= 0 && matrixEventEnd > matrixEventStart
  ? appSource.slice(matrixEventStart, matrixEventEnd)
  : "";
const sharedSnapshotStart = appSource.indexOf("function getSharedUiSnapshot()");
const sharedSnapshotEnd = appSource.indexOf("function getSharedUiSignature()", sharedSnapshotStart);
const sharedSnapshotSource = sharedSnapshotStart >= 0 && sharedSnapshotEnd > sharedSnapshotStart
  ? appSource.slice(sharedSnapshotStart, sharedSnapshotEnd)
  : "";
const sharedApplyStart = appSource.indexOf("function applySharedStateSnapshot(");
const sharedApplyEnd = appSource.indexOf("function syncExternalStorageState", sharedApplyStart);
const sharedApplySource = sharedApplyStart >= 0 && sharedApplyEnd > sharedApplyStart
  ? appSource.slice(sharedApplyStart, sharedApplyEnd)
  : "";
const operationalSharedUiKeys = [
  "productionStructureMatrixOverrides",
  "timesheetCellOverrides",
  "timesheetScheduleOverrides",
  "shiftMasterBoardLaneBySlot",
  "shiftMasterBoardAssignments",
  "shiftMasterBoardFacts",
  "shiftMasterBoardCarryovers",
  "shiftMasterAssignmentMatrix",
];
const workflowPreset = JSON.parse(workflowPresetSource);
const workflowDirectoryState = JSON.parse(workflowPreset.values?.["mes-planning-prototype-directories-v2"] || "{}");
const workflowPlanningState = JSON.parse(workflowPreset.values?.["mes-planning-prototype-state-v2"] || "{}");

assert(PRODUCTION_STRUCTURE_MATRIX_COLUMNS.length >= 45, "Права потеряли значительную часть колонок.");
assert(PRODUCTION_STRUCTURE_MATRIX_ROWS.length >= 120, "Права потеряли значительную часть строк.");
assert(summary.departments >= 6, "В матрице структуры слишком мало отделов.");
assert(summary.sections >= 8, "В матрице структуры слишком мало участков/линий.");
assert(summary.roles >= 35, "В матрице структуры слишком мало ролей.");
assert(employees.length >= 70, "Сервис матрицы вернул слишком мало сотрудников.");
assert(executors.length >= 50, "Сервис матрицы вернул слишком мало исполнителей.");
assert(masters.length >= 5, "Сервис матрицы вернул слишком мало мастеров.");
assert(resources.length >= 20, "Сервис матрицы вернул слишком мало ресурсов.");
assert(workCenters.length >= 15, "Сервис матрицы вернул слишком мало рабочих центров.");

const employeeIds = new Set(employees.map((employee) => employee.id));
assert(employeeIds.size === employees.length, "В сотрудниках матрицы есть дубли id.");
const productionDirector = employees.find((employee) => employee.id === "MGMT-PROD-DIRECTOR-EMP-01");
assert(productionDirector, "Матрица должна содержать демо-директора производства для авторизации.");
assert(
  productionDirector.role === "Директор производства" && productionDirector.department === "Административный отдел",
  "Директор производства должен отображаться как роль внутри виртуального Административного отдела.",
);
const workCenterById = new Map(workCenters.map((center) => [center.id, center]));
const getDescendantWorkCenterIds = (ids = []) => {
  const result = new Set(ids.filter(Boolean));
  let changed = true;
  while (changed) {
    changed = false;
    workCenters.forEach((center) => {
      if (!center.id || result.has(center.id)) return;
      if (center.parentWorkCenterId && result.has(center.parentWorkCenterId)) {
        result.add(center.id);
        changed = true;
      }
    });
  }
  return result;
};
const kuzmina = masters.find((master) => /Кузьмина/.test(master.name || ""));
assert(kuzmina, "В матрице должен быть мастер Кузьмина для проверки распределения отдела ручного монтажа.");
const kuzminaExactEmployeeCount = executors.filter((employee) => (employee.workCenterIds || [])
  .some((id) => (kuzmina.workCenterIds || []).includes(id))).length;
const kuzminaBranchIds = getDescendantWorkCenterIds(kuzmina.workCenterIds || []);
const kuzminaBranchEmployeeCount = executors.filter((employee) => (employee.workCenterIds || [])
  .some((id) => kuzminaBranchIds.has(id))).length;
assert(kuzminaBranchEmployeeCount > kuzminaExactEmployeeCount, "Кузьмина должна получать исполнителей дочерних участков, а не только точного отдела.");
assert(kuzminaBranchEmployeeCount >= 20, `У Кузьминой слишком маленькая ветка исполнителей: ${kuzminaBranchEmployeeCount}.`);
assert([...kuzminaBranchIds].some((id) => (workCenterById.get(id)?.parentWorkCenterId || "") === "D5"), "Ветка Кузьминой должна включать дочерние участки отдела D5.");
const masterAccessSummaries = masters.map((master) => {
  const branchIds = getDescendantWorkCenterIds(master.workCenterIds || []);
  const branchEmployeeCount = executors.filter((employee) => (employee.workCenterIds || [])
    .some((id) => branchIds.has(id))).length;
  return {
    master,
    branchIds,
    branchEmployeeCount,
  };
});
const emptyMasterScopes = masterAccessSummaries.filter((item) => item.branchEmployeeCount <= 0);
assert(!emptyMasterScopes.length, `Мастера без доступных исполнителей по матрице распределения: ${emptyMasterScopes.map((item) => item.master.name).join(", ")}`);
assert(masterAccessSummaries.every((item) => item.branchIds.size >= 1), "Каждый мастер должен иметь хотя бы один рабочий центр в области распределения.");

const workCenterIds = new Set(workCenters.map((center) => center.id));
assert(workCenterIds.size === workCenters.length, "В рабочих центрах матрицы есть дубли id.");
assert(!workCenterIds.has("D3_MANUAL_CC"), "D3_MANUAL_CC не должен порождаться как отдельный рабочий центр; это только legacy alias к D3_CC.");
const resourceIds = new Set(resources.map((resource) => resource.id));
const roleIds = new Set(
  PRODUCTION_STRUCTURE_MATRIX_ROWS
    .filter((row) => ["Роль", "Руководитель производства"].includes(row.cells?.["Тип строки"]))
    .map((row) => row.cells?.["ID / код"])
    .filter(Boolean),
);

const orphanResources = resources.filter((resource) => resource.workCenterId && !workCenterIds.has(resource.workCenterId));
assert(!orphanResources.length, `Ресурсы без рабочего центра в матрице: ${orphanResources.map((item) => item.id).join(", ")}`);

const orphanEmployees = employees.filter((employee) => {
  const ids = Array.isArray(employee.workCenterIds) ? employee.workCenterIds : [];
  return ids.some((id) => id && !workCenterIds.has(id));
});
assert(!orphanEmployees.length, `Сотрудники с несуществующим рабочим центром: ${orphanEmployees.map((item) => item.id).join(", ")}`);

const normativeResources = resources.filter((resource) => resource.type === "normative" || /норматив/i.test(resource.name || ""));
assert(!normativeResources.length, `Матрица не должна порождать нормативные ресурсы: ${normativeResources.map((item) => item.id).join(", ")}`);

const employeesWithoutSchedule = employees.filter((employee) => !employee.workSchedule || !employee.workMode);
assert(!employeesWithoutSchedule.length, `Сотрудники без графика/времени смены: ${employeesWithoutSchedule.map((item) => item.id).join(", ")}`);
const employeesWithoutHours = employees.filter((employee) => employee.canExecute !== false && Number(employee.humanHoursPerShift || 0) <= 0);
assert(!employeesWithoutHours.length, `Исполнители без расчетных часов из матрицы: ${employeesWithoutHours.map((item) => item.id).join(", ")}`);
const planningCentersWithoutAvailability = workCenters.filter((center) => (
  center.isPlanningUnit !== false
  && center.showInGantt !== false
  && Number(center.shiftHours || center.humanHoursPerShift || center.equipmentHoursPerShift || 0) <= 0
));
assert(!planningCentersWithoutAvailability.length, `Рабочие центры без доступности из матрицы: ${planningCentersWithoutAvailability.map((item) => item.id).join(", ")}`);
const manualCenter = workCenters.find((center) => center.id === "D5");
const smtLineCenter = workCenters.find((center) => center.id === "D3_L1");
assert(Number(manualCenter?.shiftHours || 0) > 0 && Number(manualCenter?.shiftHours || 0) < Number(manualCenter?.humanHoursPerShift || 0), "Смена отдела ручного монтажа не должна равняться суммарным человеко-часам отдела.");
assert(Number(smtLineCenter?.equipmentHoursPerShift || 0) > 0 && Number(smtLineCenter?.shiftHours || 0) === Number(smtLineCenter?.equipmentHoursPerShift || 0), "SMT-линия должна брать длительность смены из часов оборудования.");

const masterExecutors = executors.filter((employee) => employee.personKind === "master");
assert(masterExecutors.length >= 1, "Мастера с правом получения сменного листа должны быть доступны как опциональные исполнители.");
const invalidMasterExecutors = masterExecutors.filter((employee) => employee.canExecute === false && employee.canReceiveSheet !== true);
assert(!invalidMasterExecutors.length, `Мастер попал в исполнители без права выполнения или сменного листа: ${invalidMasterExecutors.map((item) => item.id).join(", ")}`);

const manualDepartmentRow = PRODUCTION_STRUCTURE_MATRIX_ROWS.find((row) => row.cells?.["ID / код"] === "D-MANUAL");
const sampleEmployeeRow = PRODUCTION_STRUCTURE_MATRIX_ROWS.find((row) => row.cells?.["Тип строки"] === "Сотрудник" && row.cells?.["График работы"] === "5/2");
assert(manualDepartmentRow?.id, "QA не нашла строку отдела ручного монтажа для проверки override.");
assert(sampleEmployeeRow?.id, "QA не нашла сотрудника для проверки override.");
const overrideProbe = {
  [manualDepartmentRow.id]: {
    Структура: "1. Отдел ручного монтажа QA",
  },
  [sampleEmployeeRow.id]: {
    "График работы": "2/2",
    "Время смены": "07:00-20:00",
  },
};
const overriddenWorkCenter = getProductionStructureWorkCenters(overrideProbe).find((center) => center.id === "D5");
assert(overriddenWorkCenter?.name === "Отдел ручного монтажа QA", "Override матрицы не обновил рабочий центр D5.");
const overriddenEmployee = getProductionStructureEmployees(overrideProbe).find((employee) => employee.id === sampleEmployeeRow.cells?.["ID / код"]);
assert(overriddenEmployee?.workSchedule === "2/2" && overriddenEmployee?.workMode === "07:00-20:00", "Override матрицы не обновил график сотрудника.");
assert(Number(overriddenEmployee?.humanHoursPerShift || 0) > 0, "Override матрицы должен сохранять расчетные часы сотрудника.");

const brokenOperationRefs = [];
MES_OPERATION_MAP.forEach((operation) => {
  if (operation.workCenterId && !workCenterIds.has(operation.workCenterId)) {
    brokenOperationRefs.push(`${operation.id}:workCenterId:${operation.workCenterId}`);
  }
  (operation.planningWorkCenterIds || []).forEach((id) => {
    if (id && !workCenterIds.has(id)) brokenOperationRefs.push(`${operation.id}:planningWorkCenterIds:${id}`);
  });
  (operation.equipmentIds || []).forEach((id) => {
    if (id && !resourceIds.has(id)) brokenOperationRefs.push(`${operation.id}:equipmentIds:${id}`);
  });
  if (operation.sharedResourceId && !resourceIds.has(operation.sharedResourceId)) {
    brokenOperationRefs.push(`${operation.id}:sharedResourceId:${operation.sharedResourceId}`);
  }
  (operation.executorPersonIds || []).forEach((id) => {
    if (id && !employeeIds.has(id)) brokenOperationRefs.push(`${operation.id}:executorPersonIds:${id}`);
  });
  (operation.executorRoleIds || []).forEach((id) => {
    if (id && !roleIds.has(id)) brokenOperationRefs.push(`${operation.id}:executorRoleIds:${id}`);
  });
});
assert(!brokenOperationRefs.length, `Операции ссылаются на отсутствующие строки матрицы: ${brokenOperationRefs.join(", ")}`);

[
  "DEFAULT_EMPLOYEES",
  "SHIFT_MASTER_PROFILES",
  "SHIFT_MASTER_EMPLOYEES",
  "getDirectoryEmployeeRows",
  "MES_PRODUCTION_RESOURCES",
  "WORK_CENTER_RATES",
  "planningState.workCenters.push",
  "applyCalculatorRateToWorkCenter",
  "Норматив отдела обновлен",
].forEach((forbiddenToken) => {
  assert(!appSource.includes(forbiddenToken), `Runtime не должен использовать старый источник производственной структуры: ${forbiddenToken}`);
});
assert(!dataSource.includes("MES_WORK_CENTERS"), "createDefaultPlanningState() должен стартовать от модуля сотрудники, а не от старого MES_WORK_CENTERS.");
assert(dataSource.includes("getProductionStructureWorkCenters"), "createDefaultPlanningState() должен получать рабочие центры через production_structure_service.");
assert(directorySectionsSource, "QA не нашла блок directorySections.");
assert(defaultDirectorySource, "QA не нашла блок createDefaultDirectoryState().");
assert(matrixEventSource, "QA не нашла bindProductionStructureMatrixEvents().");
assert(sharedSnapshotSource, "QA не нашла getSharedUiSnapshot().");
assert(sharedApplySource, "QA не нашла applySharedStateSnapshot().");
legacyDirectorySectionIds.forEach((sectionId) => {
  assert(!directorySectionsSource.includes(`id: "${sectionId}"`), `Старый производственный справочник вернулся в UI: ${sectionId}`);
  assert(!defaultDirectorySource.includes(`${sectionId}:`), `Старый производственный справочник вернулся в default directoryState: ${sectionId}`);
  assert(
    !Array.isArray(workflowDirectoryState[sectionId]) || workflowDirectoryState[sectionId].length === 0,
    `Старый производственный справочник вернулся в workflow-preset: ${sectionId}`,
  );
});
const workflowCombinedSource = JSON.stringify({
  state: workflowPlanningState,
  directory: workflowDirectoryState,
});
const workflowRouteById = new Map((workflowPlanningState.routes || []).map((route) => [route.id, route]));
const workflowStepById = new Map((workflowPlanningState.routeSteps || []).map((step) => [step.id, step]));
const workflowSlotsWithoutOrderLabor = (workflowPlanningState.slots || []).filter((slot) => {
  if (slot?.planningLaborSource !== "work_order" || !slot.routeStepId) return false;
  const step = workflowStepById.get(slot.routeStepId);
  const route = workflowRouteById.get(slot.planningOrderId || slot.routeId || step?.routeId || "");
  return route && !route.planningLaborByStepId?.[slot.routeStepId];
});
assert(!workflowSlotsWithoutOrderLabor.length, `workflow-preset содержит work_order слоты без трудозатрат заказ-наряда: ${workflowSlotsWithoutOrderLabor.map((slot) => slot.id).join(", ")}`);
const workflowSlotsUsingLegacyLabor = (workflowPlanningState.slots || []).filter((slot) => (
  slot?.routeStepId
  && (slot.status || "planned") !== "completed"
  && slot.planningLaborSource !== "work_order"
));
assert(!workflowSlotsUsingLegacyLabor.length, `workflow-preset содержит плановые слоты без трудозатрат заказ-наряда: ${workflowSlotsUsingLegacyLabor.map((slot) => slot.id).join(", ")}`);
[
  "\"id\":\"D3_MANUAL_CC\"",
  "\"workCenterId\":\"D3_MANUAL_CC\"",
  "D3_MANUAL_CC_STAFF",
  "resource-normative",
  "\"norms\":[{",
].forEach((forbiddenToken) => {
  assert(!workflowCombinedSource.includes(forbiddenToken), `workflow-preset не должен возвращать старую производственную структуру: ${forbiddenToken}`);
});
operationalSharedUiKeys.forEach((key) => {
  assert(sharedSnapshotSource.includes(key), `getSharedUiSnapshot() не отправляет рабочий ключ: ${key}`);
  assert(sharedApplySource.includes(key), `applySharedStateSnapshot() не принимает рабочий ключ: ${key}`);
});
assert(
  matrixEventSource.includes("syncProductionStructureMatrixToPlanningState({ persist: true })"),
  "Редактирование матрицы должно синхронизировать planningState.workCenters.",
);
assert(
  appSource.includes("syncProductionStructureMatrixToPlanningState({ persist: true });"),
  "Сброс/remote-apply матрицы должен синхронизировать planningState.workCenters.",
);
assert(
  appSource.includes("employee.humanHoursPerShift") && appSource.includes("hoursSource"),
  "Табель должен использовать расчетные часы сотрудника из модуля сотрудники.",
);
assert(
  appSource.includes("planningLaborShiftMs"),
  "Сменный режим трудозатрат должен сохранять длительность смены из матрицы/календаря.",
);
[
  "SHIFT_MASTER_ASSIGNMENT_SCOPE_MODES",
  'id: "department"',
  'id: "workCenter"',
  'id: "manual"',
  'id: "all"',
  "getShiftMasterAssignmentConfig",
  "getShiftMasterAssignableEmployees",
  "requestedMasterProfile",
  "matrixEmployees",
  "allowedEmployeeIds",
].forEach((requiredToken) => {
  assert(appSource.includes(requiredToken), `Runtime потерял настройку матрицы распределения мастеров: ${requiredToken}`);
});
assert(
  appSource.includes("getShiftMasterAssignableEmployees(requestedMasterProfile, workCenterId)"),
  "Сохранение распределения должно пересчитывать исполнителей по матрице выбранного мастера.",
);
assert(
  shiftMasterBoardQaSource.includes("Shift board saved an executor outside the master's assignment matrix.")
    || shiftMasterBoardQaSource.includes("Shift board did not keep assignment limited to available employee cards."),
  "Functional QA должен проверять фильтрацию исполнителей вне матрицы мастера.",
);

console.log("Production Structure Matrix QA");
console.log(`- columns: ${PRODUCTION_STRUCTURE_MATRIX_COLUMNS.length}`);
console.log(`- rows: ${PRODUCTION_STRUCTURE_MATRIX_ROWS.length}`);
console.log(`- departments: ${summary.departments}`);
console.log(`- sections: ${summary.sections}`);
console.log(`- roles: ${summary.roles}`);
console.log(`- employees: ${employees.length}`);
console.log(`- executors: ${executors.length}`);
console.log(`- masters: ${masters.length}`);
console.log(`- resources: ${resources.length}`);
console.log(`- workCenters: ${workCenters.length}`);
console.log(`- master access: ${masterAccessSummaries.map((item) => `${item.master.name}: ${item.branchEmployeeCount}`).join("; ")}`);
console.log("- legacy production directories removed from visible/default directories");
console.log("- matrix edits sync planning work centers");
console.log("- operational shared UI keys are synced by client");
console.log("OK: production structure matrix is the active organization source.");
