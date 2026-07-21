export const SYSTEM_DOMAINS_SCHEMA_ID = "mes.system-domains";
export const SYSTEM_DOMAINS_SCHEMA_VERSION = 1;

export const SYSTEM_DOMAIN_REGISTRY_NAMES = Object.freeze([
  "orgUnits",
  "workCenters",
  "positions",
  "employees",
  "employmentAssignments",
  "equipment",
  "scheduleTemplates",
  "scheduleAssignments",
  "attendanceEvents",
  "accessRoles",
  "grants",
  "roleAssignments",
  "responsibilityPolicies",
]);

const MATRIX_SOURCE = "production-structure-matrix";
const LEGACY_UI_SOURCE = "legacy-shared-ui";
const ORG_ROW_TYPES = new Set(["Отдел", "Участок"]);
const POSITION_ROW_TYPES = new Set(["Роль", "Руководитель производства"]);
const VALID_RESPONSIBILITY_MODES = new Set(["department", "workCenter", "manual", "all"]);
const OPTIONAL_ARCHIVED_AT_REGISTRIES = new Set(["orgUnits", "workCenters", "positions", "employees", "equipment"]);
const NO_UPDATED_AT_CONTRACT_REGISTRIES = new Set(["orgUnits", "workCenters", "positions", "employees", "employmentAssignments", "equipment"]);

const LEGACY_ACCESS_ROLE_SEEDS = [
  ["admin", "Администратор", "factory", "gantt"],
  ["productionHead", "Начальник производства", "factory", "gantt"],
  ["planner", "Планировщик", "factory", "planning"],
  ["technologist", "Технолог", "factory", "routes"],
  ["master", "Мастер", "workCenter", "shiftMasterBoard"],
  ["dispatcher", "Диспетчер", "factory", "weeklyProductionControl"],
  ["executor", "Исполнитель", "self", "authSessionPrototype"],
].map(([id, label, scope, defaultModuleId]) => ({ id, label, scope, defaultModuleId }));

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value) {
  return isPlainRecord(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeLookupText(value) {
  return cleanText(value)
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

function stripStructureNumber(value) {
  return cleanText(value)
    .replace(/^\d+(?:\.\d+)*\.\s*/, "")
    .replace(/^Оборудование:\s*/i, "")
    .replace(/:+\s*$/, "")
    .trim();
}

function normalizeId(value) {
  return cleanText(value);
}

function normalizeDate(value) {
  const candidate = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : "";
}

function normalizeTime(value, fallback = "") {
  const candidate = cleanText(value);
  const match = candidate.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return fallback;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function normalizeInteger(value, fallback = 0) {
  return Math.round(normalizeNumber(value, fallback));
}

function parseBoolean(value, fallback = false) {
  const candidate = normalizeLookupText(value);
  if (["да", "yes", "true", "1"].includes(candidate)) return true;
  if (["нет", "no", "false", "0", "-"].includes(candidate)) return false;
  return fallback;
}

function stableClone(value) {
  if (Array.isArray(value)) return value.map(stableClone);
  if (!isPlainRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableClone(value[key])]));
}

function stableCompare(left, right) {
  return cleanText(left?.id).localeCompare(cleanText(right?.id), "en");
}

function dedupeRegistry(value) {
  const byId = new Map();
  asArray(value).forEach((entity) => {
    if (!isPlainRecord(entity)) return;
    const id = normalizeId(entity.id);
    if (!id) return;
    byId.set(id, stableClone({ ...entity, id }));
  });
  return [...byId.values()].sort(stableCompare);
}

function normalizeRegistry(name, value) {
  const entities = dedupeRegistry(value).map((entity) => {
    const canonical = { ...entity };
    // These fields are not columns in the System Domains projection. Removing
    // them before hashing makes browser candidates identical to replace->get
    // hydration instead of creating nondurable fingerprints and revisions.
    if (NO_UPDATED_AT_CONTRACT_REGISTRIES.has(name)) delete canonical.updatedAt;
    if (OPTIONAL_ARCHIVED_AT_REGISTRIES.has(name) && !cleanText(canonical.archivedAt)) delete canonical.archivedAt;
    return stableClone(canonical);
  });
  // Older compatibility snapshots did not persist the template-level shift
  // offset. PostgreSQL has always stored it, so materializing the zero
  // default here makes an omitted legacy property semantically equivalent to
  // its stored representation rather than creating a false parity conflict.
  if (name !== "scheduleTemplates") return entities;
  return entities.map((entity) => ({
    ...entity,
    patternOffset: Math.max(0, normalizeInteger(entity.patternOffset, 0)),
  }));
}

function getCell(row, key) {
  return cleanText(asRecord(row?.cells)[key]);
}

function getRowSourceId(row) {
  return normalizeId(getCell(row, "ID / код") || row?.id);
}

function getRowType(row) {
  return getCell(row, "Тип строки");
}

function getRowName(row) {
  return stripStructureNumber(getCell(row, "Структура"));
}

function getSourceRef(row, extra = {}) {
  return {
    system: MATRIX_SOURCE,
    rowId: normalizeId(row?.id),
    sourceId: getRowSourceId(row),
    ...extra,
  };
}

function isRowActive(row) {
  const activity = normalizeLookupText(getCell(row, "Активность строки"));
  const status = normalizeLookupText(getCell(row, "Статус активности"));
  return activity !== "архив" && !["неактивен", "архив", "inactive"].includes(status);
}

function getEffectiveMatrixRows(matrixRows, matrixOverrides) {
  const overrides = asRecord(matrixOverrides);
  const matchedOverrideKeys = new Set();
  const rows = asArray(matrixRows).map((sourceRow) => {
    const row = stableClone(asRecord(sourceRow));
    const baseCells = { ...asRecord(row.cells) };
    const sourceId = getRowSourceId(row);
    const rowId = normalizeId(row.id);
    const patches = [];
    if (sourceId && isPlainRecord(overrides[sourceId])) {
      patches.push(overrides[sourceId]);
      matchedOverrideKeys.add(sourceId);
    }
    if (rowId && isPlainRecord(overrides[rowId])) {
      patches.push(overrides[rowId]);
      matchedOverrideKeys.add(rowId);
    }
    const cells = { ...asRecord(row.cells) };
    patches.forEach((patch) => {
      Object.entries(patch).forEach(([key, value]) => {
        if (key !== "updatedAt") cells[key] = value;
      });
    });
    return {
      ...row,
      cells,
      __legacyBaseCells: baseCells,
      __legacyUpdatedAt: cleanText(patches.at(-1)?.updatedAt),
    };
  });
  return {
    rows,
    matchedOverrideKeys,
    unmatchedOverrideKeys: Object.keys(overrides).filter((key) => !matchedOverrideKeys.has(key)).sort(),
  };
}

function buildRowIndexes(rows, report) {
  const bySourceId = new Map();
  const byName = new Map();
  rows.forEach((row) => {
    const sourceId = getRowSourceId(row);
    if (sourceId) {
      if (bySourceId.has(sourceId)) {
        report.duplicates.push({ registry: "matrixRows", id: sourceId, rowIds: [bySourceId.get(sourceId)?.id, row.id].filter(Boolean) });
      } else {
        bySourceId.set(sourceId, row);
      }
    }
    const names = new Set([
      normalizeLookupText(getRowName(row)),
      normalizeLookupText(stripStructureNumber(asRecord(row.__legacyBaseCells)["Структура"])),
    ].filter(Boolean));
    names.forEach((name) => {
      if (!byName.has(name)) byName.set(name, []);
      if (!byName.get(name).includes(row)) byName.get(name).push(row);
    });
  });
  return { bySourceId, byName };
}

function expectedParentTypes(rowType) {
  if (rowType === "Сотрудник") return POSITION_ROW_TYPES;
  if (rowType === "Оборудование" || rowType === "Роль" || rowType === "Участок") return ORG_ROW_TYPES;
  return null;
}

function resolveParentRow(row, indexes, report, relation) {
  const parentName = stripStructureNumber(getCell(row, "Родитель"));
  if (!parentName) return null;
  let candidates = [...(indexes.byName.get(normalizeLookupText(parentName)) || [])];
  const expected = expectedParentTypes(getRowType(row));
  if (expected) {
    const typed = candidates.filter((candidate) => expected.has(getRowType(candidate)));
    if (typed.length) candidates = typed;
  }
  if (!candidates.length) {
    report.orphans.push({
      registry: "matrixRows",
      entityId: getRowSourceId(row),
      relation,
      missingId: parentName,
      sourceRowId: normalizeId(row.id),
    });
    return null;
  }
  candidates.sort((left, right) => getRowSourceId(left).localeCompare(getRowSourceId(right), "en"));
  if (candidates.length > 1) {
    report.warnings.push({
      code: "ambiguous-parent-name",
      entityId: getRowSourceId(row),
      parentName,
      selectedId: getRowSourceId(candidates[0]),
      candidateIds: candidates.map(getRowSourceId),
    });
  }
  return candidates[0];
}

function resolveEmployeePositionRow(row, indexes, report) {
  const employeeId = getRowSourceId(row);
  const derivedPositionId = employeeId.replace(/-EMP-\d+$/i, "");
  if (derivedPositionId && derivedPositionId !== employeeId && indexes.bySourceId.has(derivedPositionId)) {
    return indexes.bySourceId.get(derivedPositionId);
  }
  return resolveParentRow(row, indexes, report, "positionId");
}

function splitShiftWindow(value, scheduleCode = "5/2") {
  const match = cleanText(value).match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/);
  const defaultEnd = scheduleCode === "2/2" ? "20:00" : "17:00";
  return {
    start: normalizeTime(match?.[1], "08:00"),
    end: normalizeTime(match?.[2], defaultEnd),
  };
}

function scheduleDescriptorFromRows(primaryRow, fallbackRow = null, override = {}) {
  const source = asRecord(override);
  const code = cleanText(source.code || getCell(primaryRow, "График работы") || getCell(fallbackRow, "График работы") || "5/2");
  const rawWindow = getCell(primaryRow, "Время смены")
    || getCell(primaryRow, "Календарное окно смены")
    || getCell(fallbackRow, "Время смены")
    || getCell(fallbackRow, "Календарное окно смены");
  const window = splitShiftWindow(rawWindow, code);
  return {
    code,
    start: normalizeTime(source.start, window.start),
    end: normalizeTime(source.end, window.end),
    subtractLunch: "subtractLunch" in source
      ? Boolean(source.subtractLunch)
      : parseBoolean(getCell(primaryRow, "Обед вычитается") || getCell(fallbackRow, "Обед вычитается"), code === "5/2"),
    patternOffset: Math.max(0, normalizeInteger(source.patternOffset, 0)),
  };
}

function slug(value) {
  return normalizeLookupText(value)
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-|-$/g, "") || "default";
}

function getScheduleTemplateId(descriptor) {
  return `schedule:${slug(descriptor.code)}:${descriptor.start}-${descriptor.end}:${descriptor.subtractLunch ? "lunch" : "continuous"}`;
}

function addScheduleTemplate(templateMap, descriptor, source = MATRIX_SOURCE) {
  const id = getScheduleTemplateId(descriptor);
  if (!templateMap.has(id)) {
    templateMap.set(id, {
      id,
      code: descriptor.code,
      label: `${descriptor.code} · ${descriptor.start}–${descriptor.end}`,
      start: descriptor.start,
      end: descriptor.end,
      subtractLunch: descriptor.subtractLunch,
      patternOffset: descriptor.patternOffset,
      source,
    });
  }
  return id;
}

function classifyPosition(row) {
  const text = normalizeLookupText(`${getRowName(row)} ${getCell(row, "Тип ресурса")}`);
  if (getRowType(row) === "Руководитель производства" || /директор|начальник|руководител/.test(text)) return "manager";
  if (/мастер/.test(text) || parseBoolean(getCell(row, "Имеет право распределять"))) return "supervisor";
  return "worker";
}

function combineAccessProfiles(defaults, overrides) {
  const byId = new Map();
  [...LEGACY_ACCESS_ROLE_SEEDS, ...asArray(defaults), ...asArray(overrides)].forEach((profile) => {
    if (!isPlainRecord(profile)) return;
    const id = normalizeId(profile.id);
    if (!id) return;
    const previous = byId.get(id) || {};
    const previousPermissions = asRecord(previous.modulePermissions);
    const nextPermissions = asRecord(profile.modulePermissions);
    const modulePermissions = { ...previousPermissions };
    Object.entries(nextPermissions).forEach(([moduleId, permissions]) => {
      modulePermissions[moduleId] = Array.isArray(permissions)
        ? [...permissions]
        : { ...asRecord(previousPermissions[moduleId]), ...asRecord(permissions) };
    });
    byId.set(id, { ...previous, ...stableClone(profile), id, modulePermissions });
  });
  return [...byId.values()].sort(stableCompare);
}

function createMigrationReport(matrixRows, overrides, legacyUi) {
  const typeCounts = {};
  asArray(matrixRows).forEach((row) => {
    const type = getRowType(row) || "Без типа";
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });
  return {
    schemaId: SYSTEM_DOMAINS_SCHEMA_ID,
    schemaVersion: SYSTEM_DOMAINS_SCHEMA_VERSION,
    sourceCounts: {
      matrixRows: asArray(matrixRows).length,
      matrixRowsByType: stableClone(typeCounts),
      matrixOverrides: Object.keys(asRecord(overrides)).length,
      timesheetScheduleOverrides: Object.keys(asRecord(legacyUi.timesheetScheduleOverrides)).length,
      timesheetCellOverrides: Object.keys(asRecord(legacyUi.timesheetCellOverrides)).length,
      accessRoleProfiles: asArray(legacyUi.accessRoleProfiles).length,
      accessRoleAssignments: Object.keys(asRecord(legacyUi.accessRoleAssignments)).length,
      responsibilityPolicies: Object.keys(asRecord(legacyUi.shiftMasterAssignmentMatrix)).length,
    },
    targetCounts: {},
    matchedMatrixOverrideKeys: [],
    unmatchedMatrixOverrideKeys: [],
    ignoredRows: [],
    duplicates: [],
    orphans: [],
    warnings: [],
    validation: null,
    canActivate: false,
  };
}

export function createEmptySystemDomains(metadata = {}) {
  return {
    schemaId: SYSTEM_DOMAINS_SCHEMA_ID,
    schemaVersion: SYSTEM_DOMAINS_SCHEMA_VERSION,
    metadata: stableClone(asRecord(metadata)),
    registries: Object.fromEntries(SYSTEM_DOMAIN_REGISTRY_NAMES.map((name) => [name, []])),
  };
}

export function normalizeSystemDomains(value = {}) {
  const source = asRecord(value);
  const sourceRegistries = isPlainRecord(source.registries) ? source.registries : source;
  return {
    schemaId: SYSTEM_DOMAINS_SCHEMA_ID,
    schemaVersion: SYSTEM_DOMAINS_SCHEMA_VERSION,
    metadata: stableClone(asRecord(source.metadata)),
    registries: Object.fromEntries(SYSTEM_DOMAIN_REGISTRY_NAMES.map((name) => [name, normalizeRegistry(name, sourceRegistries[name])])),
  };
}

function registryIndex(registries, name) {
  return new Set(asArray(registries[name]).map((entity) => normalizeId(entity.id)).filter(Boolean));
}

function pushMissingReference(orphans, registry, entityId, relation, missingId) {
  if (!missingId) return;
  orphans.push({ registry, entityId, relation, missingId });
}

function findDuplicateIds(registry) {
  const seen = new Set();
  const duplicates = [];
  asArray(registry).forEach((entity) => {
    const id = normalizeId(entity?.id);
    if (!id) return;
    if (seen.has(id) && !duplicates.includes(id)) duplicates.push(id);
    seen.add(id);
  });
  return duplicates.sort();
}

function findHierarchyCycles(registry, parentField) {
  const parentById = new Map(asArray(registry).map((entity) => [normalizeId(entity?.id), normalizeId(entity?.[parentField])]).filter(([id]) => id));
  const cycles = new Set();
  parentById.forEach((unused, startId) => {
    const path = [];
    const indexById = new Map();
    let currentId = startId;
    while (currentId && parentById.has(currentId)) {
      if (indexById.has(currentId)) {
        const cycle = path.slice(indexById.get(currentId));
        const canonical = [...cycle].sort()[0];
        while (cycle[0] !== canonical) cycle.push(cycle.shift());
        cycles.add(cycle.join(" -> "));
        break;
      }
      indexById.set(currentId, path.length);
      path.push(currentId);
      currentId = parentById.get(currentId);
    }
  });
  return [...cycles].sort();
}

export function validateSystemDomains(value = {}) {
  const source = asRecord(value);
  const registries = isPlainRecord(source.registries) ? source.registries : source;
  const errors = [];
  const warnings = [];
  const orphans = [];
  const counts = Object.fromEntries(SYSTEM_DOMAIN_REGISTRY_NAMES.map((name) => [name, asArray(registries[name]).length]));

  if (source.schemaId !== SYSTEM_DOMAINS_SCHEMA_ID) {
    errors.push({ code: "schema-id-mismatch", expected: SYSTEM_DOMAINS_SCHEMA_ID, actual: source.schemaId });
  }
  if (Number(source.schemaVersion) !== SYSTEM_DOMAINS_SCHEMA_VERSION) {
    errors.push({ code: "schema-version-unsupported", expected: SYSTEM_DOMAINS_SCHEMA_VERSION, actual: source.schemaVersion });
  }

  SYSTEM_DOMAIN_REGISTRY_NAMES.forEach((name) => {
    if (!Array.isArray(registries[name])) errors.push({ code: "missing-registry", registry: name });
    findDuplicateIds(registries[name]).forEach((id) => errors.push({ code: "duplicate-id", registry: name, id }));
  });
  findHierarchyCycles(registries.orgUnits, "parentOrgUnitId").forEach((cycle) => {
    errors.push({ code: "hierarchy-cycle", registry: "orgUnits", cycle });
  });
  findHierarchyCycles(registries.workCenters, "parentWorkCenterId").forEach((cycle) => {
    errors.push({ code: "hierarchy-cycle", registry: "workCenters", cycle });
  });

  const ids = Object.fromEntries(SYSTEM_DOMAIN_REGISTRY_NAMES.map((name) => [name, registryIndex(registries, name)]));
  asArray(registries.orgUnits).forEach((entity) => {
    if (entity.parentOrgUnitId && !ids.orgUnits.has(entity.parentOrgUnitId)) pushMissingReference(orphans, "orgUnits", entity.id, "parentOrgUnitId", entity.parentOrgUnitId);
  });
  asArray(registries.workCenters).forEach((entity) => {
    if (entity.orgUnitId && !ids.orgUnits.has(entity.orgUnitId)) pushMissingReference(orphans, "workCenters", entity.id, "orgUnitId", entity.orgUnitId);
    if (entity.parentWorkCenterId && !ids.workCenters.has(entity.parentWorkCenterId)) pushMissingReference(orphans, "workCenters", entity.id, "parentWorkCenterId", entity.parentWorkCenterId);
  });
  asArray(registries.positions).forEach((entity) => {
    if (entity.orgUnitId && !ids.orgUnits.has(entity.orgUnitId)) pushMissingReference(orphans, "positions", entity.id, "orgUnitId", entity.orgUnitId);
    if (entity.workCenterId && !ids.workCenters.has(entity.workCenterId)) pushMissingReference(orphans, "positions", entity.id, "workCenterId", entity.workCenterId);
    if (entity.defaultScheduleTemplateId && !ids.scheduleTemplates.has(entity.defaultScheduleTemplateId)) pushMissingReference(orphans, "positions", entity.id, "defaultScheduleTemplateId", entity.defaultScheduleTemplateId);
  });
  asArray(registries.employmentAssignments).forEach((entity) => {
    if (!ids.employees.has(entity.employeeId)) pushMissingReference(orphans, "employmentAssignments", entity.id, "employeeId", entity.employeeId);
    if (entity.positionId && !ids.positions.has(entity.positionId)) pushMissingReference(orphans, "employmentAssignments", entity.id, "positionId", entity.positionId);
    if (entity.orgUnitId && !ids.orgUnits.has(entity.orgUnitId)) pushMissingReference(orphans, "employmentAssignments", entity.id, "orgUnitId", entity.orgUnitId);
    if (entity.workCenterId && !ids.workCenters.has(entity.workCenterId)) pushMissingReference(orphans, "employmentAssignments", entity.id, "workCenterId", entity.workCenterId);
  });
  asArray(registries.equipment).forEach((entity) => {
    if (entity.orgUnitId && !ids.orgUnits.has(entity.orgUnitId)) pushMissingReference(orphans, "equipment", entity.id, "orgUnitId", entity.orgUnitId);
    if (entity.workCenterId && !ids.workCenters.has(entity.workCenterId)) pushMissingReference(orphans, "equipment", entity.id, "workCenterId", entity.workCenterId);
    if (entity.scheduleTemplateId && !ids.scheduleTemplates.has(entity.scheduleTemplateId)) pushMissingReference(orphans, "equipment", entity.id, "scheduleTemplateId", entity.scheduleTemplateId);
  });
  asArray(registries.scheduleAssignments).forEach((entity) => {
    if (!ids.employees.has(entity.employeeId)) pushMissingReference(orphans, "scheduleAssignments", entity.id, "employeeId", entity.employeeId);
    if (!ids.scheduleTemplates.has(entity.scheduleTemplateId)) pushMissingReference(orphans, "scheduleAssignments", entity.id, "scheduleTemplateId", entity.scheduleTemplateId);
  });
  asArray(registries.attendanceEvents).forEach((entity) => {
    if (!ids.employees.has(entity.employeeId)) pushMissingReference(orphans, "attendanceEvents", entity.id, "employeeId", entity.employeeId);
  });
  asArray(registries.grants).forEach((entity) => {
    if (!ids.accessRoles.has(entity.roleId)) pushMissingReference(orphans, "grants", entity.id, "roleId", entity.roleId);
  });
  asArray(registries.roleAssignments).forEach((entity) => {
    if (!ids.employees.has(entity.employeeId)) pushMissingReference(orphans, "roleAssignments", entity.id, "employeeId", entity.employeeId);
    if (!ids.accessRoles.has(entity.roleId)) pushMissingReference(orphans, "roleAssignments", entity.id, "roleId", entity.roleId);
  });
  asArray(registries.responsibilityPolicies).forEach((entity) => {
    if (!ids.employees.has(entity.subjectEmployeeId)) pushMissingReference(orphans, "responsibilityPolicies", entity.id, "subjectEmployeeId", entity.subjectEmployeeId);
    asArray(entity.targetEmployeeIds).forEach((employeeId) => {
      if (!ids.employees.has(employeeId)) pushMissingReference(orphans, "responsibilityPolicies", entity.id, "targetEmployeeIds", employeeId);
    });
  });

  orphans.forEach((orphan) => errors.push({ code: "orphan-reference", ...orphan }));
  return { valid: errors.length === 0, counts, errors, warnings, orphans };
}

export function migrateLegacySystemDomains(options = {}) {
  const sourceOptions = asRecord(options);
  const matrixRows = asArray(sourceOptions.matrixRows);
  const legacyUi = asRecord(sourceOptions.legacyUi || sourceOptions.sharedUi);
  const matrixOverrides = {
    ...asRecord(legacyUi.productionStructureMatrixOverrides),
    ...asRecord(sourceOptions.matrixOverrides),
  };
  const report = createMigrationReport(matrixRows, matrixOverrides, legacyUi);
  const effective = getEffectiveMatrixRows(matrixRows, matrixOverrides);
  report.matchedMatrixOverrideKeys = [...effective.matchedOverrideKeys].sort();
  report.unmatchedMatrixOverrideKeys = effective.unmatchedOverrideKeys;
  effective.unmatchedOverrideKeys.forEach((key) => report.orphans.push({
    registry: "matrixOverrides",
    entityId: key,
    relation: "rowId",
    missingId: key,
  }));

  const rows = effective.rows;
  const indexes = buildRowIndexes(rows, report);
  const registries = createEmptySystemDomains().registries;
  const scheduleTemplates = new Map();
  const orgRows = rows.filter((row) => ORG_ROW_TYPES.has(getRowType(row)));
  const positionRows = rows.filter((row) => POSITION_ROW_TYPES.has(getRowType(row)));
  const employeeRows = rows.filter((row) => getRowType(row) === "Сотрудник");
  const equipmentRows = rows.filter((row) => getRowType(row) === "Оборудование");

  orgRows.forEach((row) => {
    const id = getRowSourceId(row);
    if (!id) return;
    const parentRow = getRowType(row) === "Участок" ? resolveParentRow(row, indexes, report, "parentOrgUnitId") : null;
    const parentId = parentRow && ORG_ROW_TYPES.has(getRowType(parentRow)) ? getRowSourceId(parentRow) : "";
    const entity = {
      id,
      code: id,
      name: getRowName(row) || id,
      kind: getRowType(row) === "Отдел" ? "department" : "section",
      parentOrgUnitId: parentId,
      isActive: isRowActive(row),
      validFrom: normalizeDate(getCell(row, "Дата начала действия")),
      validTo: normalizeDate(getCell(row, "Дата окончания действия")),
      sourceRef: getSourceRef(row, { lastLegacyUpdateAt: cleanText(row.__legacyUpdatedAt) }),
    };
    registries.orgUnits.push(entity);
    registries.workCenters.push({
      id,
      code: id,
      name: entity.name,
      orgUnitId: id,
      parentWorkCenterId: parentId,
      participatesInPlanning: parseBoolean(getCell(row, "Участвует в планировании как объект")),
      canPlanDirectly: parseBoolean(getCell(row, "Можно планировать напрямую")),
      showInGantt: !["нет", "скрыть"].includes(normalizeLookupText(getCell(row, "Показывать в Ганте"))),
      availabilitySource: getCell(row, "Источник доступности"),
      isActive: entity.isActive,
      sourceRef: entity.sourceRef,
    });
  });

  positionRows.forEach((row) => {
    const id = getRowSourceId(row);
    if (!id) return;
    const parentRow = resolveParentRow(row, indexes, report, "orgUnitId");
    const orgUnitId = parentRow && ORG_ROW_TYPES.has(getRowType(parentRow)) ? getRowSourceId(parentRow) : "";
    const descriptor = scheduleDescriptorFromRows(row);
    const defaultScheduleTemplateId = addScheduleTemplate(scheduleTemplates, descriptor);
    registries.positions.push({
      id,
      code: id,
      name: getRowName(row) || id,
      kind: classifyPosition(row),
      orgUnitId,
      workCenterId: orgUnitId,
      defaultScheduleTemplateId,
      capabilities: {
        canDistribute: parseBoolean(getCell(row, "Имеет право распределять") || getCell(row, "Распределяет работу")),
        canExecute: !["нет", "-"].includes(normalizeLookupText(getCell(row, "Исполнитель (производит операции в маршрутной карте)"))),
        canReceiveShiftSheet: !["нет", "-"].includes(normalizeLookupText(getCell(row, "Может получать сменный лист"))),
        canCloseFact: parseBoolean(getCell(row, "Может закрывать факт")),
      },
      operationClasses: getCell(row, "Классы операций"),
      isActive: isRowActive(row),
      sourceRef: getSourceRef(row, { lastLegacyUpdateAt: cleanText(row.__legacyUpdatedAt) }),
    });
  });

  equipmentRows.forEach((row) => {
    const id = getRowSourceId(row);
    if (!id) return;
    const parentRow = resolveParentRow(row, indexes, report, "orgUnitId");
    const orgUnitId = parentRow && ORG_ROW_TYPES.has(getRowType(parentRow)) ? getRowSourceId(parentRow) : "";
    const descriptor = scheduleDescriptorFromRows(row, parentRow);
    const scheduleTemplateId = addScheduleTemplate(scheduleTemplates, descriptor);
    registries.equipment.push({
      id,
      code: id,
      name: getRowName(row) || id,
      orgUnitId,
      workCenterId: orgUnitId,
      quantity: Math.max(1, normalizeInteger(getCell(row, "Кол-во"), 1)),
      scheduleTemplateId,
      participatesInPlanning: !["нет", "-"].includes(normalizeLookupText(getCell(row, "Участвует в планировании как объект"))),
      availabilitySource: getCell(row, "Источник доступности"),
      isActive: isRowActive(row),
      sourceRef: getSourceRef(row, { lastLegacyUpdateAt: cleanText(row.__legacyUpdatedAt) }),
    });
  });

  const scheduleOverrides = asRecord(legacyUi.timesheetScheduleOverrides);
  employeeRows.forEach((row, index) => {
    const id = getRowSourceId(row) || `matrix-employee-${index + 1}`;
    const positionRow = resolveEmployeePositionRow(row, indexes, report);
    const positionId = positionRow && POSITION_ROW_TYPES.has(getRowType(positionRow)) ? getRowSourceId(positionRow) : "";
    const orgParentRow = positionRow ? resolveParentRow(positionRow, indexes, report, "orgUnitId") : null;
    const orgUnitId = orgParentRow && ORG_ROW_TYPES.has(getRowType(orgParentRow)) ? getRowSourceId(orgParentRow) : "";
    const descriptor = scheduleDescriptorFromRows(row, positionRow, asRecord(scheduleOverrides[id]));
    const scheduleTemplateId = addScheduleTemplate(
      scheduleTemplates,
      descriptor,
      isPlainRecord(scheduleOverrides[id]) ? LEGACY_UI_SOURCE : MATRIX_SOURCE,
    );
    registries.employees.push({
      id,
      personnelNumber: id,
      displayName: getRowName(row) || `Сотрудник ${index + 1}`,
      isActive: isRowActive(row),
      sourceRef: getSourceRef(row, { lastLegacyUpdateAt: cleanText(row.__legacyUpdatedAt) }),
    });
    registries.employmentAssignments.push({
      id: `employment:${id}`,
      employeeId: id,
      positionId,
      orgUnitId,
      workCenterId: orgUnitId,
      isPrimary: true,
      validFrom: normalizeDate(getCell(row, "Дата начала действия") || getCell(positionRow, "Дата начала действия")),
      validTo: normalizeDate(getCell(row, "Дата окончания действия") || getCell(positionRow, "Дата окончания действия")),
      sourceRef: getSourceRef(row),
    });
    registries.scheduleAssignments.push({
      id: `schedule-assignment:${id}`,
      employeeId: id,
      scheduleTemplateId,
      patternOffset: descriptor.patternOffset,
      validFrom: normalizeDate(getCell(row, "Дата начала действия")),
      validTo: normalizeDate(getCell(row, "Дата окончания действия")),
      source: isPlainRecord(scheduleOverrides[id]) ? LEGACY_UI_SOURCE : MATRIX_SOURCE,
    });
  });

  Object.keys(scheduleOverrides).sort().forEach((employeeId) => {
    if (!registries.employees.some((employee) => employee.id === employeeId)) {
      report.orphans.push({ registry: "timesheetScheduleOverrides", entityId: employeeId, relation: "employeeId", missingId: employeeId });
    }
  });

  Object.entries(asRecord(legacyUi.timesheetCellOverrides)).sort(([left], [right]) => left.localeCompare(right, "en")).forEach(([key, rawEvent]) => {
    const separator = key.lastIndexOf("::");
    const employeeId = separator >= 0 ? key.slice(0, separator) : "";
    const date = separator >= 0 ? normalizeDate(key.slice(separator + 2)) : "";
    const event = asRecord(rawEvent);
    if (!employeeId || !date) {
      report.warnings.push({ code: "invalid-attendance-key", key });
      return;
    }
    registries.attendanceEvents.push({
      id: `attendance:${employeeId}:${date}`,
      employeeId,
      date,
      type: cleanText(event.value || "work"),
      start: normalizeTime(event.start),
      end: normalizeTime(event.end),
      overtimeHours: Math.max(0, normalizeNumber(event.overtime, 0)),
      comment: cleanText(event.comment),
      sourceRef: { system: LEGACY_UI_SOURCE, key },
    });
  });

  const profiles = combineAccessProfiles(sourceOptions.defaultAccessRoleProfiles, legacyUi.accessRoleProfiles);
  profiles.forEach((profile) => {
    registries.accessRoles.push({
      id: profile.id,
      label: cleanText(profile.label || profile.id),
      description: cleanText(profile.caption || profile.description),
      scope: cleanText(profile.scope || "factory"),
      defaultModuleId: cleanText(profile.defaultModuleId || profile.defaultModule),
      icon: cleanText(profile.icon),
      isActive: profile.isActive !== false,
      readOnly: Boolean(profile.readOnly ?? profile.readonly),
      sourceRef: { system: asArray(legacyUi.accessRoleProfiles).some((item) => item?.id === profile.id) ? LEGACY_UI_SOURCE : "runtime-default" },
    });
    Object.entries(asRecord(profile.modulePermissions)).sort(([left], [right]) => left.localeCompare(right, "en")).forEach(([moduleId, rawPermissions]) => {
      const permissionEntries = Array.isArray(rawPermissions)
        ? rawPermissions.map((actionId) => [actionId, true])
        : Object.entries(asRecord(rawPermissions));
      permissionEntries.sort(([left], [right]) => cleanText(left).localeCompare(cleanText(right), "en")).forEach(([actionId, allowed]) => {
        const normalizedActionId = cleanText(actionId);
        if (!normalizedActionId) return;
        registries.grants.push({
          id: `access-grant:${profile.id}:${moduleId}:${normalizedActionId}`,
          roleId: profile.id,
          resourceType: "module",
          resourceId: moduleId,
          actionId: normalizedActionId,
          effect: allowed ? "allow" : "deny",
          sourceRef: { system: LEGACY_UI_SOURCE },
        });
      });
    });
  });

  Object.entries(asRecord(legacyUi.accessRoleAssignments)).sort(([left], [right]) => left.localeCompare(right, "en")).forEach(([employeeId, roleId]) => {
    const normalizedRoleId = normalizeId(roleId);
    if (!employeeId || !normalizedRoleId) return;
    registries.roleAssignments.push({
      id: `access-role-assignment:${employeeId}`,
      employeeId,
      roleId: normalizedRoleId,
      sourceRef: { system: LEGACY_UI_SOURCE, key: employeeId },
    });
  });

  Object.entries(asRecord(legacyUi.shiftMasterAssignmentMatrix)).sort(([left], [right]) => left.localeCompare(right, "en")).forEach(([masterId, rawPolicy]) => {
    const policy = asRecord(rawPolicy);
    const rawMode = cleanText(policy.mode);
    const mode = VALID_RESPONSIBILITY_MODES.has(rawMode) ? rawMode : "department";
    if (rawMode && rawMode !== mode) report.warnings.push({ code: "invalid-responsibility-mode", masterId, value: rawMode, fallback: mode });
    registries.responsibilityPolicies.push({
      id: `responsibility:${masterId}`,
      subjectEmployeeId: masterId,
      mode,
      targetEmployeeIds: [...new Set(asArray(policy.employeeIds).map(normalizeId).filter(Boolean))].sort(),
      updatedAt: cleanText(policy.updatedAt),
      sourceRef: { system: LEGACY_UI_SOURCE, key: masterId },
    });
  });

  rows.filter((row) => !ORG_ROW_TYPES.has(getRowType(row))
    && !POSITION_ROW_TYPES.has(getRowType(row))
    && getRowType(row) !== "Сотрудник"
    && getRowType(row) !== "Оборудование")
    .forEach((row) => report.ignoredRows.push({
      rowId: normalizeId(row.id),
      sourceId: getRowSourceId(row),
      type: getRowType(row),
      reason: getRowType(row) === "Примечание" ? "migration-note" : "unsupported-row-type",
    }));

  registries.scheduleTemplates = [...scheduleTemplates.values()];
  const domains = normalizeSystemDomains({
    metadata: {
      source: "legacy-system-domains-migration",
      migratedAt: cleanText(sourceOptions.migratedAt),
    },
    registries,
  });
  report.targetCounts = Object.fromEntries(SYSTEM_DOMAIN_REGISTRY_NAMES.map((name) => [name, domains.registries[name].length]));
  report.validation = validateSystemDomains(domains);
  report.validation.orphans.forEach((orphan) => {
    if (!report.orphans.some((item) => item.registry === orphan.registry
      && item.entityId === orphan.entityId
      && item.relation === orphan.relation
      && item.missingId === orphan.missingId)) {
      report.orphans.push(orphan);
    }
  });
  report.canActivate = report.validation.valid && report.orphans.length === 0 && report.duplicates.length === 0;
  return { domains, report: stableClone(report) };
}

export function loadSystemDomains(value, options = {}) {
  let source = value;
  const loadErrors = [];
  if (typeof value === "string") {
    try {
      source = JSON.parse(value);
    } catch (error) {
      source = {};
      loadErrors.push({ code: "invalid-json", message: cleanText(error?.message) });
    }
  }
  if (!isPlainRecord(source)) {
    source = {};
    loadErrors.push({ code: "invalid-root", message: "System Domains payload must be an object." });
  }
  const validation = validateSystemDomains(source);
  const domains = normalizeSystemDomains(source);
  const report = {
    ...validation,
    errors: [...loadErrors, ...validation.errors],
    valid: loadErrors.length === 0 && validation.valid,
  };
  if (options.strict && !report.valid) {
    const error = new Error(`Invalid System Domains payload: ${report.errors.map((item) => item.code).join(", ")}`);
    error.report = report;
    throw error;
  }
  return { domains, report: stableClone(report) };
}

export function serializeSystemDomains(value, options = {}) {
  const space = Number.isInteger(options.space) ? Math.max(0, Math.min(10, options.space)) : 2;
  return JSON.stringify(stableClone(normalizeSystemDomains(value)), null, space);
}
