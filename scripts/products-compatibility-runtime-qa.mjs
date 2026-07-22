import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const retiredRendererPath = join(root, "src/modules/products/render.js");
const runtimePath = join(root, "src/modules/products/compatibility_runtime.js");

await assert.rejects(
  access(retiredRendererPath),
  (error) => error?.code === "ENOENT",
  "the retired Products renderer path must be physically absent",
);

const [appSource, runtimeSource] = await Promise.all([
  readFile(join(root, "src/app.js"), "utf8"),
  readFile(runtimePath, "utf8"),
]);

assert.match(
  appSource,
  /import \{ createProductsCompatibilityRuntime \} from "\.\/modules\/products\/compatibility_runtime\.js";/,
  "the application must import the pruned compatibility runtime",
);
assert.doesNotMatch(
  appSource,
  /modules\/products\/render\.js|createProductsRenderModule|initializeProductsRenderModule/,
  "the active application must not retain the retired Products renderer contract",
);
assert.doesNotMatch(
  runtimeSource,
  /\brenderUi[A-Za-z0-9_]*\b|\brenderDenseInlineSelect\b|\bescapeHtml\b|\bescapeAttribute\b|\bicon\b|\bselected\b/,
  "the compatibility runtime must not retain legacy UI-render dependencies",
);

for (const internalHelper of [
  "ensureRouteModuleProjectForSpecification",
  "findSmtLineByNumber",
  "findImportedNomenclatureIndex",
  "getRouteScopeSourceItemId",
  "makeBomImportNomenclaturePayload",
  "mergeBomSourceIds",
  "summarizeBomComponentFields",
]) {
  assert.match(runtimeSource, new RegExp(`function ${internalHelper}\\b`), `${internalHelper} must remain available to live runtime functions`);
}

const expectedBindings = [
  "cancelAuthPrototypePinFeedback",
  "createSpekiSpecification",
  "ensureNomenclatureTypeExists",
  "getActiveSpecificationForModule",
  "getAuthPrototypePeople",
  "getBomImportRows",
  "getBomList",
  "getBomResultNomenclatureItem",
  "getDefaultSmtLineConfigurations",
  "getDirectoryRows",
  "getFallbackNomenclatureType",
  "getNomenclatureDeleteUsage",
  "getNomenclatureItem",
  "getResourceBaseCph",
  "getResourcesForWorkCenter",
  "getRouteBindingContext",
  "getRouteBindingModeForSelection",
  "getRouteBomList",
  "getRouteDocumentKind",
  "getRouteDocumentKindLabel",
  "getRouteDocumentKindShortLabel",
  "getRouteLineageSubjectName",
  "getRouteModuleSelectionName",
  "getRouteModuleSelectionValue",
  "getRouteRootRoute",
  "getRouteScopeRootTask",
  "getRouteSpecification",
  "getRoutesForModule",
  "getSlotGanttResourceId",
  "getSlotGanttWorkCenterId",
  "getSmtLineConfigurations",
  "getSmtLineNumberFromText",
  "getSpecificationBomEntries",
  "getSpecificationById",
  "getSpecificationItemBomId",
  "getSpekiStructureItemDisplayName",
  "getSpekiStructureItemLabel",
  "getSpekiStructureTableRows",
  "importBomFromXlsxFile",
  "isAuthPrototypePinFeedbackLocked",
  "migrateSpecificationBomRowsToNomenclature",
  "normalizeBomImportRow",
  "normalizeLookupText",
  "normalizeNomenclatureType",
  "normalizeRouteBindingValue",
  "resolveRouteModuleProjectId",
  "syncNomenclatureTypesFromItems",
  "syncSpecificationDerivedFields",
  "upsertBomResultToNomenclature",
];

const { createProductsCompatibilityRuntime } = await import(`${pathToFileURL(runtimePath).href}?qa=${Date.now()}`);
const runtime = createProductsCompatibilityRuntime();
assert.deepEqual(
  Object.keys(runtime),
  expectedBindings,
  "the Products compatibility runtime must expose only the 49 audited live bindings",
);

const initializationStart = appSource.indexOf("function initializeProductsCompatibilityRuntime()");
const factoryCall = appSource.indexOf("} = createProductsCompatibilityRuntime({", initializationStart);
assert(initializationStart >= 0 && factoryCall > initializationStart, "the Products compatibility initialization boundary must remain inspectable");
const initializedBindings = [...appSource.slice(initializationStart, factoryCall).matchAll(/^    ([A-Za-z_$][\w$]*),$/gm)]
  .map((match) => match[1]);
assert.deepEqual(initializedBindings, expectedBindings, "the application must bind the exact audited compatibility-runtime contract");

const directoryState = {
  bomLists: [],
  nomenclature: [
    { id: "nom-board", name: "Старая плата", article: "PCB-1", type: "Печатные платы", sourceBomIds: ["bom-old"] },
    { id: "nom-component", name: "Резистор", article: "R-1", type: "РЭА", package: "0603", manufacturer: "ACME", sourceBomIds: ["bom-old"] },
  ],
  nomenclatureTypes: [],
  specifications: [],
};
const behaviorRuntime = createProductsCompatibilityRuntime({
  BOARD_SPEC_TERM: "Плата",
  BOM_COMPONENT_FIELDS: [{ key: "c0603", label: "0603", componentId: "ct-0603" }],
  BOM_IMPORT_COLUMN_COUNT: 9,
  BOM_IMPORT_FALLBACK_HEADERS: Array.from({ length: 9 }, (_, index) => `Поле ${index + 1}`),
  DEFAULT_COMPONENT_TYPES: [],
  DEFAULT_NOMENCLATURE_TYPES: [],
  NOMENCLATURE_REA_COMPONENT_TYPE: "РЭА",
  PRODUCT_COMPOSITION_TERM: "Состав",
  ROUTE_DOCUMENT_KIND_LABELS: { main: "Основной", child: "Дочерний", shift: "Сменный" },
  ROUTE_DOCUMENT_KIND_ORDER: { main: 0, child: 1, shift: 2 },
  ROUTE_DOCUMENT_KIND_SHORT_LABELS: { main: "осн.", child: "доч.", shift: "см." },
  getDirectoryState: () => directoryState,
  getPlanningState: () => ({ routes: [] }),
  getUi: () => ({}),
  makeId: (prefix) => `${prefix}-qa`,
  normalizeDirectoryRow: (_section, row) => ({ ...row }),
  normalizeDirectoryState: (state) => state,
  persistDirectoryState: () => true,
  persistUiState: () => {},
  notifySaveSuccess: () => {},
  loadBoardsXlsxImportAction: async () => ({
    importLegacyBoardsXlsxFile: async (_file, _productionId, dependencies) => dependencies.upsertBomImportRowsToNomenclature({
      id: "bom-import",
      name: "Импорт",
      importRows: [["1", "Резистор", "R1", "R-1", "ACME", "0603", 2, "", ""]],
    }, "2026-07-22T12:00:00.000Z"),
  }),
});

const updatedBoard = behaviorRuntime.upsertBomResultToNomenclature({
  id: "bom-new",
  name: "Плата",
  boardCode: "PCB-1",
  resultItem: "Новая плата",
}, "2026-07-22T12:00:00.000Z");
assert.deepEqual(updatedBoard.sourceBomIds, ["bom-old", "bom-new"], "existing BOM result updates must merge source identities");

const importResult = await behaviorRuntime.importBomFromXlsxFile({ name: "qa.xlsx" }, "production-qa");
assert.deepEqual(importResult, { created: 0, updated: 1 }, "BOM import wiring must execute the retained internal upsert helpers");
assert.deepEqual(
  directoryState.nomenclature.find((item) => item.id === "nom-component")?.sourceBomIds,
  ["bom-old", "bom-import"],
  "BOM component updates must merge source identities without replacing existing links",
);

const scopedTask = behaviorRuntime.getRouteScopeRootTask({
  routeTaskSourceItemId: "item-qa",
  routeTaskSourceSpecificationId: "spec-qa",
}, [{ id: "task-qa", sourceItemId: "item-qa", sourceSpecificationId: "spec-qa" }]);
assert.equal(scopedTask?.id, "task-qa", "scoped routes must resolve their retained source-item helper");

console.log("Products compatibility runtime QA passed");
console.log(`- live bindings: ${expectedBindings.length}`);
console.log("- retired renderer path: absent");
console.log("- legacy UI-render dependencies: absent");
console.log("- BOM update/import and scoped-route behavior: pass");
