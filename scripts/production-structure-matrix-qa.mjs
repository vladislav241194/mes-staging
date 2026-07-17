import { readFile } from "node:fs/promises";

import {
  PRODUCTION_STRUCTURE_MATRIX_COLUMNS,
  PRODUCTION_STRUCTURE_MATRIX_ROWS,
} from "../src/production_structure_matrix_data.js";
import { createProductionStructureMatrixModule } from "../src/modules/production_structure_matrix/render.js";
import { migrateLegacySystemDomains } from "../src/modules/system_domains/service.js";
import { createUiRenderers } from "../src/ui/components.js";
import { escapeAttribute, escapeHtml } from "../src/ui/html.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createEventTarget(dataset = {}) {
  const listeners = new Map();
  return {
    dataset,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    fire(type) {
      const listener = listeners.get(type);
      if (!listener) throw new Error(`Listener ${type} is not bound.`);
      return listener({
        currentTarget: this,
        preventDefault() {},
      });
    },
  };
}

function createPage(selectors = {}, selectorLists = {}) {
  return {
    querySelector(selector) {
      return selectors[selector] || null;
    },
    querySelectorAll(selector) {
      return selectorLists[selector] || [];
    },
  };
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

const renderSource = await readFile(new URL("../src/modules/production_structure_matrix/render.js", import.meta.url), "utf8");
const uiRenderers = createUiRenderers({ icon: () => "" });
const baseline = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS });
const supervisorPosition = baseline.domains.registries.positions.find((position) => position.kind === "supervisor");
const masterAssignment = baseline.domains.registries.employmentAssignments.find((assignment) => assignment.positionId === supervisorPosition?.id);
const masterId = masterAssignment?.employeeId || "";
const executorId = baseline.domains.registries.employmentAssignments.find((assignment) => assignment.employeeId !== masterId && assignment.orgUnitId)?.employeeId || "";
assert(masterId && executorId, "Domain fixture must contain a master and an executor.");

const migration = migrateLegacySystemDomains({
  matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS,
  legacyUi: {
    shiftMasterAssignmentMatrix: {
      [masterId]: {
        mode: "manual",
        employeeIds: [executorId],
        updatedAt: "2026-07-10T12:00:00.000Z",
      },
    },
  },
  migratedAt: "2026-07-10T12:30:00.000Z",
});
assert(migration.report.validation.valid, `System Domains fixture must be valid: ${JSON.stringify(migration.report.validation.errors)}`);
assert(migration.report.orphans.length === 0, `System Domains fixture must have no orphans: ${JSON.stringify(migration.report.orphans)}`);
assert(migration.domains.registries.orgUnits.length === 19, "Canonical store must contain 19 organization units.");
assert(migration.domains.registries.workCenters.length === 19, "Canonical store must contain 19 work centers.");
assert(migration.domains.registries.positions.length === 49, "Canonical store must contain 49 positions.");
assert(migration.domains.registries.employees.length === 76, "Canonical store must contain 76 employees.");
assert(migration.domains.registries.equipment.length === 6, "Canonical store must contain 6 equipment records.");
assert(migration.domains.registries.responsibilityPolicies.length === 1, "Legacy master matrix must become one responsibility policy.");

let domains = structuredClone(migration.domains);
let currentPage = null;
let renderCount = 0;
const upsertCalls = [];
const archiveCalls = [];

function upsertEntity(registryId, entity, context) {
  upsertCalls.push({ registryId, entity: structuredClone(entity), context: structuredClone(context) });
  const registry = domains.registries[registryId];
  const existingIndex = registry.findIndex((item) => item.id === entity.id);
  if (existingIndex >= 0) registry[existingIndex] = structuredClone(entity);
  else registry.push(structuredClone(entity));
}

function archiveEntity(registryId, entityId, context) {
  archiveCalls.push({ registryId, entityId, context: structuredClone(context) });
  const entity = domains.registries[registryId].find((item) => item.id === entityId);
  if (entity) entity.isActive = false;
}

const module = createProductionStructureMatrixModule({
  PRODUCTION_STRUCTURE_MATRIX_COLUMNS,
  PRODUCTION_STRUCTURE_MATRIX_ROWS,
  archiveSystemDomainEntity: archiveEntity,
  canEditSystemDomainRegistry: () => true,
  escapeAttribute,
  escapeHtml,
  getApp: () => ({ querySelector: () => currentPage }),
  getSystemDomainsMigrationReport: () => migration.report,
  getSystemDomainsState: () => domains,
  notifySaveSuccess: () => {},
  render: () => { renderCount += 1; },
  upsertSystemDomainEntity: upsertEntity,
  ...uiRenderers,
});

const initialHtml = module.renderProductionStructureMatrixPage();
[
  "Структура и сотрудники",
  "Подразделения",
  "Рабочие центры",
  "Должности",
  "Сотрудники",
  "Оборудование",
  "Зоны ответственности",
  "Диагностика миграции",
].forEach((label) => assert(initialHtml.includes(label), `Module is missing canonical label: ${label}`));
assert(initialHtml.includes('data-system-domain-table="orgUnits"'), "Initial registry must read orgUnits from System Domains.");
assert(initialHtml.includes("stable ID"), "Registry UI must explain stable identity.");
assert(!initialHtml.includes("51 поле"), "Canonical module must not advertise the 51-column matrix.");
assert(!initialHtml.includes("полная редактируемая матрица"), "Legacy matrix must not remain an editable primary surface.");
assert(!initialHtml.includes("Сбросить правки"), "Canonical module must not reset legacy matrix overrides.");
assert(JSON.stringify(module.getProductionStructureMatrixRuntimeOverrides()) === "{}", "Compatibility getter must not expose mutable legacy overrides.");

const readOnlyModule = createProductionStructureMatrixModule({
  PRODUCTION_STRUCTURE_MATRIX_COLUMNS,
  PRODUCTION_STRUCTURE_MATRIX_ROWS,
  canEditSystemDomainRegistry: () => false,
  escapeAttribute,
  escapeHtml,
  getSystemDomainsMigrationReport: () => migration.report,
  getSystemDomainsState: () => domains,
  ...uiRenderers,
});
const readOnlyHtml = readOnlyModule.renderProductionStructureMatrixPage();
assert(!readOnlyHtml.includes("Новая запись"), "Create action must be hidden without registry edit permission.");
assert(readOnlyHtml.includes("Просмотр"), "Read-only registry must retain explicit view actions.");

const responsibilityButton = createEventTarget({ systemDomainRegistry: "responsibilityPolicies" });
currentPage = createPage({}, {
  "[data-system-domain-registry]": [responsibilityButton],
  "[data-system-domain-open]": [],
});
module.bindProductionStructureMatrixEvents();
responsibilityButton.fire("click");
const responsibilityHtml = module.renderProductionStructureMatrixPage();
assert(responsibilityHtml.includes("Представление распределения мастеров"), "Responsibility policies must replace the old master assignment matrix surface.");
assert(responsibilityHtml.includes('data-system-domain-table="responsibilityPolicies"'), "Responsibility table must read the canonical registry.");
assert(responsibilityHtml.includes(masterId) && responsibilityHtml.includes(executorId), "Responsibility view must retain canonical subject and target ids.");
assert(!responsibilityHtml.includes("data-shift-master-assignment"), "Responsibility UI must not bind legacy sharedUi handlers.");

const diagnosticsButton = createEventTarget({ systemDomainRegistry: "migrationDiagnostics" });
currentPage = createPage({}, {
  "[data-system-domain-registry]": [diagnosticsButton],
  "[data-system-domain-open]": [],
});
module.bindProductionStructureMatrixEvents();
diagnosticsButton.fire("click");
const diagnosticsHtml = module.renderProductionStructureMatrixPage();
assert(diagnosticsHtml.includes('data-system-domain-legacy-diagnostics="read-only"'), "Legacy matrix must be explicitly marked read-only.");
assert(diagnosticsHtml.includes("Legacy Excel-матрица"), "Migration diagnostics must retain source traceability.");
assert(diagnosticsHtml.includes(`${PRODUCTION_STRUCTURE_MATRIX_ROWS.length} строк`), "Diagnostics must show the complete source row count.");
assert(diagnosticsHtml.includes(`${PRODUCTION_STRUCTURE_MATRIX_COLUMNS.length} исходных полей`), "Diagnostics must show the source field count without rendering all columns.");
assert(!diagnosticsHtml.includes("data-system-domain-form"), "Migration diagnostics must not render a domain editor.");
assert(!diagnosticsHtml.includes("data-production-structure-field"), "Migration diagnostics must not render the old matrix editor.");
const legacyTableSource = diagnosticsHtml.slice(diagnosticsHtml.indexOf('class="directory-table ui-table migration-legacy-table"'));
assert(countMatches(legacyTableSource, /<th>/g) === 5, "Legacy diagnostics must use a compact five-column read-only table.");

const editableModule = createProductionStructureMatrixModule({
  PRODUCTION_STRUCTURE_MATRIX_COLUMNS,
  PRODUCTION_STRUCTURE_MATRIX_ROWS,
  archiveSystemDomainEntity: archiveEntity,
  canEditSystemDomainRegistry: (registryId) => registryId === "orgUnits",
  escapeAttribute,
  escapeHtml,
  getApp: () => ({ querySelector: () => currentPage }),
  getSystemDomainsMigrationReport: () => migration.report,
  getSystemDomainsState: () => domains,
  notifySaveSuccess: () => {},
  render: () => { renderCount += 1; },
  upsertSystemDomainEntity: upsertEntity,
  ...uiRenderers,
});

const createButton = createEventTarget({ systemDomainCreate: "orgUnits" });
currentPage = createPage({ "[data-system-domain-create]": createButton }, {
  "[data-system-domain-registry]": [],
  "[data-system-domain-open]": [],
});
editableModule.bindProductionStructureMatrixEvents();
createButton.fire("click");
const createHtml = editableModule.renderProductionStructureMatrixPage();
assert(createHtml.includes("Новая запись: Подразделения"), "Create action must open the canonical entity editor.");
assert(createHtml.includes('name="id"'), "Canonical editor must require a stable id.");

const form = createEventTarget({ systemDomainFormRegistry: "orgUnits", systemDomainFormEntity: "" });
form.formValues = new Map([
  ["id", "D-QA"],
  ["name", "QA подразделение"],
  ["code", "D-QA"],
  ["kind", "department"],
  ["parentOrgUnitId", ""],
  ["isActive", "true"],
]);
const NativeFormData = globalThis.FormData;
globalThis.FormData = class QaFormData {
  constructor(sourceForm) {
    this.values = sourceForm.formValues;
  }

  get(key) {
    return this.values.get(key) ?? null;
  }
};
try {
  currentPage = createPage({ "[data-system-domain-form]": form }, {
    "[data-system-domain-registry]": [],
    "[data-system-domain-open]": [],
  });
  editableModule.bindProductionStructureMatrixEvents();
  form.fire("submit");
} finally {
  globalThis.FormData = NativeFormData;
}
assert(upsertCalls.some((call) => call.registryId === "orgUnits" && call.entity.id === "D-QA" && call.entity.name === "QA подразделение"), "Editor must write only through upsertSystemDomainEntity.");
assert(upsertCalls.at(-1)?.context?.operation === "create", "Upsert context must distinguish creation from update.");

const archiveButton = createEventTarget({ systemDomainArchive: "D-QA", systemDomainArchiveRegistry: "orgUnits" });
currentPage = createPage({ "[data-system-domain-archive]": archiveButton }, {
  "[data-system-domain-registry]": [],
  "[data-system-domain-open]": [],
});
editableModule.bindProductionStructureMatrixEvents();
archiveButton.fire("click");
assert(archiveCalls.some((call) => call.registryId === "orgUnits" && call.entityId === "D-QA"), "Archive action must use archiveSystemDomainEntity.");
assert(domains.registries.orgUnits.some((entity) => entity.id === "D-QA" && entity.isActive === false), "Archive must preserve the entity instead of hard deleting it.");

[
  "getSystemDomainsState",
  "getSystemDomainsMigrationReport",
  "upsertSystemDomainEntity",
  "archiveSystemDomainEntity",
  "canEditSystemDomainRegistry",
  'id: "orgUnits"',
  'id: "workCenters"',
  'id: "positions"',
  'id: "employees"',
  'id: "equipment"',
  'id: "responsibilityPolicies"',
  'id: "migrationDiagnostics"',
].forEach((token) => assert(renderSource.includes(token), `Canonical module contract is missing: ${token}`));

[
  "setProductionStructureMatrixOverride",
  "resetProductionStructureMatrixOverrides",
  "data-production-structure-field",
  "productionStructureMatrixOverrides",
  "syncProductionStructureMatrixToPlanningState",
  "setShiftMasterAssignmentMatrixConfig",
  "setShiftMasterAssignmentMatrixEmployee",
  "resetShiftMasterAssignmentMatrixConfig",
  "data-shift-master-assignment",
].forEach((token) => assert(!renderSource.includes(token), `Legacy editor/write path must be absent: ${token}`));

assert(!/\bdelete\s+/.test(renderSource), "Canonical module must not hard delete domain entities.");
assert(!renderSource.includes("localStorage"), "Structure module must not own browser persistence.");
assert(!renderSource.includes("persistUiState"), "Structure module must not write legacy sharedUi state.");
assert(renderSource.includes("archiveSystemDomainEntity(registryId, entityId"), "Archiving must be the only removal path.");
assert(renderCount >= 4, "Registry navigation and mutations must request rerendering.");

console.log("Structure and Employees Domain QA");
console.log(`- canonical org units: ${migration.domains.registries.orgUnits.length}`);
console.log(`- canonical work centers: ${migration.domains.registries.workCenters.length}`);
console.log(`- canonical positions: ${migration.domains.registries.positions.length}`);
console.log(`- canonical employees: ${migration.domains.registries.employees.length}`);
console.log(`- canonical equipment: ${migration.domains.registries.equipment.length}`);
console.log(`- responsibility policies: ${migration.domains.registries.responsibilityPolicies.length}`);
console.log("- seven registry sidebar entries: pass");
console.log("- canonical upsert and archive callbacks: pass");
console.log("- legacy matrix read-only diagnostics: pass");
console.log("- legacy editor and sharedUi writes absent: pass");
console.log("OK: productionStructureMatrix route now renders Structure and Employees over System Domains.");
