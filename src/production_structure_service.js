import {
  PRODUCTION_STRUCTURE_MATRIX_COLUMNS,
  PRODUCTION_STRUCTURE_MATRIX_ROWS,
} from "./production_structure_matrix_data.js";

const MATRIX_ID_TO_RUNTIME_ID = {
  "D-MANUAL": "D5",
  "S-MANUAL-1": "D5_L1",
  "S-MANUAL-2": "D5_L2",
  "S-MANUAL-3": "D5_L3",
  "S-MANUAL-4": "D5_L4",
  "S-LOCKSMITH-1": "D9",
  "D-SMT": "D3",
  "S-SMT-1": "D3_L1",
  "S-SMT-2": "D3_L2",
  "S-AOI": "D3_AOI",
  "S-SMT-REPAIR": "D3_REPAIR",
  "S-WASH": "D3_UW",
  "D-COATING": "D3_CC",
  "D-PROGRAMMING": "D6",
  "D-SERVICE": "D_SERVICE",
  "D-WAREHOUSE": "D1",
  "S-PACKING": "D11",
  "D-QC": "D4",
  "D-TECH": "D2",
};

const RUNTIME_ID_TO_MATRIX_ID = Object.fromEntries(
  Object.entries(MATRIX_ID_TO_RUNTIME_ID).map(([matrixId, runtimeId]) => [runtimeId, matrixId]),
);

const MATRIX_RESOURCE_TYPE_TO_RUNTIME_TYPE = {
  отдел: "department",
  участок: "workplace",
  оборудование: "equipment",
  сотрудник: "staff",
  роль: "staff",
  "руководитель производства": "staff",
};

const derivationCache = new Map();

function getOverridesSignature(overrides = {}) {
  const rows = Object.entries(overrides && typeof overrides === "object" ? overrides : {})
    .sort(([left], [right]) => String(left).localeCompare(String(right), "ru"))
    .map(([rowId, patch]) => [
      rowId,
      Object.entries(patch && typeof patch === "object" ? patch : {})
        .filter(([key]) => key !== "updatedAt")
        .sort(([left], [right]) => String(left).localeCompare(String(right), "ru")),
    ]);
  return JSON.stringify(rows);
}

function getCachedDerivation(overrides = {}, key = "", factory = () => null) {
  const signature = getOverridesSignature(overrides);
  if (!derivationCache.has(signature)) {
    if (derivationCache.size > 20) derivationCache.clear();
    derivationCache.set(signature, {});
  }
  const bucket = derivationCache.get(signature);
  if (!Object.prototype.hasOwnProperty.call(bucket, key)) bucket[key] = factory();
  return bucket[key];
}

function normalizeText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

function stripStructureNumber(value = "") {
  return String(value || "")
    .replace(/^\d+(?:\.\d+)*\.\s*/, "")
    .replace(/^Оборудование:\s*/i, "")
    .replace(/:+\s*$/, "")
    .trim();
}

function toNumber(value = "", fallback = 0) {
  const normalized = String(value ?? "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function toNumberHint(value = "", fallback = 0) {
  const match = String(value ?? "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return fallback;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : fallback;
}

function isYes(value = "") {
  const text = normalizeText(value);
  return text === "да" || text === "yes" || text === "true";
}

function isNo(value = "") {
  const text = normalizeText(value);
  return text === "нет" || text === "no" || text === "false";
}

function getCell(row = {}, key = "") {
  return String(row.cells?.[key] ?? "");
}

function getRowMatrixId(row = {}) {
  return getCell(row, "ID / код") || row.id || "";
}

function getRuntimeIdForMatrixId(matrixId = "") {
  return MATRIX_ID_TO_RUNTIME_ID[matrixId] || matrixId;
}

function getMatrixIdForRuntimeId(runtimeId = "") {
  return RUNTIME_ID_TO_MATRIX_ID[runtimeId] || runtimeId;
}

function withOverrides(row = {}, overrides = {}) {
  const patch = overrides?.[row.id] || {};
  return {
    ...row,
    cells: {
      ...(row.cells || {}),
      ...Object.fromEntries(Object.entries(patch).filter(([key]) => key !== "updatedAt")),
    },
  };
}

function getMatrixRows(overrides = {}) {
  return PRODUCTION_STRUCTURE_MATRIX_ROWS.map((row) => withOverrides(row, overrides));
}

function makeNameIndex(rows = []) {
  const index = new Map();
  rows.forEach((row) => {
    const name = stripStructureNumber(getCell(row, "Структура"));
    if (!name) return;
    if (!index.has(normalizeText(name))) index.set(normalizeText(name), row);
  });
  return index;
}

function makeIdIndex(rows = []) {
  const index = new Map();
  rows.forEach((row) => {
    const id = getRowMatrixId(row);
    if (id) index.set(id, row);
  });
  return index;
}

function getEmployeeRoleRow(row = {}, nameIndex = new Map(), idIndex = new Map()) {
  const matrixId = getRowMatrixId(row);
  const roleId = String(matrixId || "").replace(/-EMP-\d+$/i, "");
  if (roleId && roleId !== matrixId && idIndex.has(roleId)) return idIndex.get(roleId);
  const parentName = stripStructureNumber(getCell(row, "Родитель"));
  return nameIndex.get(normalizeText(parentName)) || null;
}

function getParentRuntimeId(row = {}, nameIndex = new Map()) {
  const parentName = stripStructureNumber(getCell(row, "Родитель"));
  if (!parentName) return "";
  const parentRow = nameIndex.get(normalizeText(parentName));
  if (!parentRow) return "";
  return getRuntimeIdForMatrixId(getRowMatrixId(parentRow));
}

function getUnitType(row = {}) {
  const text = normalizeText(`${getCell(row, "Структура")} ${getCell(row, "Тип строки")} ${getCell(row, "Тип ресурса")}`);
  if (text.includes("склад")) return "warehouse";
  if (text.includes("контрол") || text.includes("инспекц") || text.includes("aoi")) return "quality";
  if (text.includes("технолог") || text.includes("сервис")) return "administrative";
  return "production";
}

function getSchedule(row = {}) {
  return getCell(row, "График работы") || "5/2";
}

function getWorkMode(row = {}) {
  return getCell(row, "Время смены") || getCell(row, "Календарное окно смены") || (getSchedule(row) === "2/2" ? "08:00-20:00" : "08:00-17:00");
}

function getShiftWindow(row = {}) {
  return getCell(row, "Календарное окно смены") || getWorkMode(row);
}

function getShiftWindowHours(value = "") {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  const start = Math.max(0, Math.min(24 * 60, Number(match[1]) * 60 + Number(match[2])));
  const end = Math.max(0, Math.min(24 * 60, Number(match[3]) * 60 + Number(match[4])));
  const minutes = end > start ? end - start : end + 24 * 60 - start;
  return Math.round((minutes / 60) * 100) / 100;
}

function getRowHumanHours(row = {}) {
  const explicit = toNumberHint(getCell(row, "Расчетные часы для людей"), 0);
  if (explicit > 0) return explicit;
  return getRowCalendarHours(row);
}

function getRowCalendarHours(row = {}) {
  const shiftHours = getShiftWindowHours(getShiftWindow(row));
  const subtractLunch = isYes(getCell(row, "Обед вычитается"))
    || (!isNo(getCell(row, "Обед вычитается")) && getSchedule(row) === "5/2");
  const lunchHours = subtractLunch && shiftHours >= 6 ? 1 : 0;
  return Math.max(0, Math.round((shiftHours - lunchHours) * 100) / 100);
}

function getRowEquipmentHours(row = {}) {
  const explicit = toNumberHint(getCell(row, "Расчетные часы оборудования"), 0);
  if (explicit > 0) return explicit;
  return getCell(row, "Тип строки") === "Оборудование" ? getShiftWindowHours(getShiftWindow(row)) : 0;
}

function makeChildrenByParentId(rows = [], nameIndex = new Map()) {
  const childrenByParentId = new Map();
  rows.forEach((row) => {
    const parentName = stripStructureNumber(getCell(row, "Родитель"));
    if (!parentName) return;
    const parentRow = nameIndex.get(normalizeText(parentName));
    const parentId = parentRow ? getRowMatrixId(parentRow) : "";
    if (!parentId) return;
    if (!childrenByParentId.has(parentId)) childrenByParentId.set(parentId, []);
    childrenByParentId.get(parentId).push(row);
  });
  return childrenByParentId;
}

function getDescendantRows(row = {}, childrenByParentId = new Map()) {
  const result = [];
  const queue = [...(childrenByParentId.get(getRowMatrixId(row)) || [])];
  while (queue.length) {
    const child = queue.shift();
    result.push(child);
    queue.push(...(childrenByParentId.get(getRowMatrixId(child)) || []));
  }
  return result;
}

function rowHoursAreCounted(row = {}) {
  if (getCell(row, "Активность строки") === "архив") return false;
  return !isNo(getCell(row, "Учитывать часы в планировании"));
}

function getAggregatedHumanHours(row = {}, descendants = []) {
  const explicit = toNumberHint(getCell(row, "Расчетные часы для людей"), 0);
  if (explicit > 0 && !normalizeText(getCell(row, "Расчетные часы для людей")).includes("сумм")) return explicit;
  const employeeHours = descendants
    .filter((item) => getCell(item, "Тип строки") === "Сотрудник" && rowHoursAreCounted(item))
    .reduce((sum, item) => sum + getRowHumanHours(item), 0);
  if (employeeHours > 0) return Math.round(employeeHours * 100) / 100;
  return getRowHumanHours(row);
}

function getAggregatedEquipmentHours(row = {}, descendants = []) {
  const explicit = toNumberHint(getCell(row, "Расчетные часы оборудования"), 0);
  if (explicit > 0 && !normalizeText(getCell(row, "Расчетные часы оборудования")).includes("сумм")) return explicit;
  const equipmentHours = descendants
    .filter((item) => getCell(item, "Тип строки") === "Оборудование" && rowHoursAreCounted(item))
    .reduce((sum, item) => sum + getRowEquipmentHours(item), 0);
  if (equipmentHours > 0) return Math.round(equipmentHours * 100) / 100;
  return getRowEquipmentHours(row);
}

function formatHoursLabel(value = 0) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "";
  return `${number.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ч/смена`;
}

function getMatrixOperationText(row = {}) {
  return getCell(row, "Операции / группы операций") || getCell(row, "Сводные операции отдела");
}

function estimateUnitsPerHour(row = {}) {
  const laborType = normalizeText(getCell(row, "Базовый тип трудозатрат") || getCell(row, "Единица учета трудозатрат"));
  if (laborType.includes("мин/ед")) return 20;
  if (laborType.includes("мин/мульт")) return 60;
  if (laborType.includes("смен")) return 125;
  if (normalizeText(getCell(row, "Ресурс-ограничение")).includes("оборуд")) return 80;
  return 40;
}

export function getProductionStructureColumns() {
  return [...PRODUCTION_STRUCTURE_MATRIX_COLUMNS];
}

export function getProductionStructureRows(overrides = {}) {
  return getCachedDerivation(overrides, "rows", () => getMatrixRows(overrides));
}

export function getProductionStructureWorkCenters(overrides = {}) {
  return getCachedDerivation(overrides, "workCenters", () => {
  const rows = getMatrixRows(overrides);
  const nameIndex = makeNameIndex(rows);
  const childrenByParentId = makeChildrenByParentId(rows, nameIndex);
  const workCenters = rows
    .filter((row) => ["Отдел", "Участок"].includes(getCell(row, "Тип строки")))
    .map((row) => {
      const matrixId = getRowMatrixId(row);
      const id = getRuntimeIdForMatrixId(matrixId);
      const descendants = getDescendantRows(row, childrenByParentId);
      const calendarShiftHours = getRowCalendarHours(row);
      const humanHoursPerShift = getAggregatedHumanHours(row, descendants);
      const equipmentHoursPerShift = getAggregatedEquipmentHours(row, descendants);
      const shiftHours = equipmentHoursPerShift || calendarShiftHours || humanHoursPerShift;
      const showInGantt = normalizeText(getCell(row, "Показывать в Ганте"));
      const planningObject = getCell(row, "Участвует в планировании как объект");
      const canPlanDirectly = getCell(row, "Можно планировать напрямую");
      return {
        id,
        matrixId,
        code: id,
        name: stripStructureNumber(getCell(row, "Структура")) || id,
        description: getCell(row, "Комментарий для миграции") || "Источник: Матрица структуры",
        parentWorkCenterId: getParentRuntimeId(row, nameIndex),
        unitType: getUnitType(row),
        isActive: getCell(row, "Активность строки") !== "архив",
        isPlanningUnit: isYes(planningObject) || showInGantt === "да" || showInGantt === "сводно",
        showInGantt: showInGantt !== "нет",
        canPlanDirectly: isYes(canPlanDirectly),
        workSchedule: getSchedule(row),
        workMode: getWorkMode(row),
        calendarShiftWindow: getShiftWindow(row),
        calendarShiftHours,
        humanHoursPerShift,
        equipmentHoursPerShift,
        availabilityHoursPerShift: Math.round((humanHoursPerShift + equipmentHoursPerShift) * 100) / 100,
        shiftHours,
        availabilitySource: getCell(row, "Источник доступности") || "Матрица структуры",
        availabilityCalculationType: getCell(row, "Тип расчета доступности"),
        accountingDay: getCell(row, "Учетные сутки смены"),
        subtractLunch: isYes(getCell(row, "Обед вычитается")),
        stretchShiftAllowed: isYes(getCell(row, "Возможна растянутая смена")),
        stretchShiftCondition: getCell(row, "Условие растянутой смены"),
        unitsPerHour: estimateUnitsPerHour(row),
        capacity: Math.max(1, Math.round(toNumberHint(getCell(row, "Кол-во"), 1))),
        operations: getMatrixOperationText(row),
        source: "Матрица структуры",
      };
    });
  return workCenters;
  });
}

export function getProductionStructureResources(overrides = {}) {
  return getCachedDerivation(overrides, "resources", () => {
  const rows = getMatrixRows(overrides);
  const nameIndex = makeNameIndex(rows);
  const workCenters = getProductionStructureWorkCenters(overrides);
  const resources = [];

  workCenters.forEach((center) => {
    if (!center.isPlanningUnit) return;
    resources.push({
      id: `${center.id}_MATRIX`,
      matrixId: center.matrixId,
      name: center.name,
      type: normalizeText(center.operations).includes("smt") || center.id.includes("D3_L") ? "aggregate" : "staff",
      workCenterId: center.id,
      workCenter: center.name,
      capacity: formatHoursLabel(center.availabilityHoursPerShift || center.shiftHours) || "часы заданы в матрице",
      capacityHours: center.availabilityHoursPerShift || center.shiftHours,
      calendarShiftHours: center.calendarShiftHours,
      humanHoursPerShift: center.humanHoursPerShift,
      equipmentHoursPerShift: center.equipmentHoursPerShift,
      availabilityHoursPerShift: center.availabilityHoursPerShift,
      availabilitySource: center.availabilitySource,
      participatesInPlanning: "yes",
      participatesInCalculation: "yes",
      status: "Доступен",
      sourceKind: "matrixWorkCenter",
      unitsPerHour: center.unitsPerHour,
    });
  });

  rows
    .filter((row) => getCell(row, "Тип строки") === "Оборудование")
    .forEach((row) => {
      const matrixId = getRowMatrixId(row);
      const parentId = getParentRuntimeId(row, nameIndex);
      resources.push({
        id: getRuntimeIdForMatrixId(matrixId),
        matrixId,
        name: stripStructureNumber(getCell(row, "Структура")) || matrixId,
        type: "equipment",
        workCenterId: parentId,
        workCenter: stripStructureNumber(getCell(nameIndex.get(normalizeText(getCell(row, "Родитель"))), "Структура")),
        capacity: formatHoursLabel(getRowEquipmentHours(row)) || getCell(row, "Расчетные часы оборудования") || "",
        capacityHours: getRowEquipmentHours(row),
        participatesInPlanning: isNo(getCell(row, "Участвует в планировании как объект")) ? "no" : "yes",
        participatesInCalculation: "yes",
        status: getCell(row, "Статус активности") || "Доступен",
        sourceKind: "matrixEquipment",
        unitsPerHour: estimateUnitsPerHour(row),
      });
    });

  return resources;
  });
}

export function getProductionStructureEmployees(overrides = {}) {
  return getCachedDerivation(overrides, "employees", () => {
  const rows = getMatrixRows(overrides);
  const nameIndex = makeNameIndex(rows);
  const idIndex = makeIdIndex(rows);
  return rows
    .filter((row) => getCell(row, "Тип строки") === "Сотрудник")
    .map((row, index) => {
      const matrixId = getRowMatrixId(row);
      const parentName = stripStructureNumber(getCell(row, "Родитель"));
      const roleRow = getEmployeeRoleRow(row, nameIndex, idIndex);
      const parentWorkCenterId = getParentRuntimeId(roleRow || row, nameIndex);
      const parentWorkCenterName = parentWorkCenterId
        ? stripStructureNumber(getCell(nameIndex.get(normalizeText(getCell(roleRow || row, "Родитель"))), "Структура"))
        : "";
      const canDistribute = isYes(getCell(row, "Имеет право распределять")) || isYes(getCell(row, "Распределяет работу"));
      const role = parentName || getCell(row, "Тип строки") || "Сотрудник";
      const roleLookup = normalizeText(role);
      const rawDepartment = parentWorkCenterName || parentName || "";
      const department = !parentWorkCenterName && /директор|начальник производства|руководител/.test(roleLookup)
        ? "Административный отдел"
        : rawDepartment;
      return {
        id: matrixId || `matrix-employee-${index + 1}`,
        matrixId,
        name: stripStructureNumber(getCell(row, "Структура")) || `Сотрудник ${index + 1}`,
        role,
        department,
        personKind: canDistribute || roleLookup.includes("мастер") || roleLookup.includes("директор") ? "master" : "employee",
        workCenterIds: parentWorkCenterId ? [parentWorkCenterId] : [],
        source: "Матрица структуры",
        schedule: getSchedule(row),
        workSchedule: getSchedule(row),
        workMode: getWorkMode(row),
        calendarShiftWindow: getShiftWindow(row),
        humanHoursPerShift: getRowHumanHours(row),
        availabilitySource: getCell(row, "Источник доступности") || "Матрица структуры",
        subtractLunch: isYes(getCell(row, "Обед вычитается")),
        stretchShiftAllowed: isYes(getCell(row, "Возможна растянутая смена")),
        stretchShiftCondition: getCell(row, "Условие растянутой смены"),
        canDistribute,
        canExecute: !isNo(getCell(row, "Исполнитель (производит операции в маршрутной карте)")),
        canReceiveSheet: !isNo(getCell(row, "Может получать сменный лист")),
        canCloseFact: isYes(getCell(row, "Может закрывать факт")),
      };
    });
  });
}

export function getProductionStructureMasterProfiles(overrides = {}) {
  return getProductionStructureEmployees(overrides)
    .filter((employee) => employee.personKind === "master" && employee.workCenterIds.length);
}

export function getProductionStructureExecutorRows(overrides = {}) {
  return getProductionStructureEmployees(overrides)
    .filter((employee) => employee.workCenterIds.length && (employee.canExecute !== false || employee.canReceiveSheet === true));
}

export function getProductionStructureSummary(overrides = {}) {
  return getCachedDerivation(overrides, "summary", () => {
  const rows = getMatrixRows(overrides);
  return {
    rows: rows.length,
    fields: PRODUCTION_STRUCTURE_MATRIX_COLUMNS.length,
    departments: rows.filter((row) => getCell(row, "Тип строки") === "Отдел").length,
    sections: rows.filter((row) => getCell(row, "Тип строки") === "Участок").length,
    roles: rows.filter((row) => ["Роль", "Руководитель производства"].includes(getCell(row, "Тип строки"))).length,
    employees: rows.filter((row) => getCell(row, "Тип строки") === "Сотрудник").length,
    equipment: rows.filter((row) => getCell(row, "Тип строки") === "Оборудование").length,
  };
  });
}
