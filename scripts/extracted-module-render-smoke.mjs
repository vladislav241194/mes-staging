import { renderDispatchModulePage } from "../src/modules/dispatch/render.js";
import { createProductionStructureMatrixModule } from "../src/modules/production_structure_matrix/render.js";
import { createUiRenderers } from "../src/ui/components.js";
import { createMesModulePatternRenderer } from "../src/ui/module_patterns.js";
import { getMesModuleBlueprintDefinition } from "../src/module_registry.js";
import {
  escapeAttribute,
  escapeHtml,
  joinUiClasses,
} from "../src/ui/html.js";

const icon = (name) => `<svg data-smoke-icon="${escapeAttribute(name)}"></svg>`;
const renderers = createUiRenderers({ icon });
const renderMesModulePatternPage = createMesModulePatternRenderer({
  getBlueprint: getMesModuleBlueprintDefinition,
  renderUiModuleHeader: renderers.renderUiModuleHeader,
  renderUiModulePage: renderers.renderUiModulePage,
  renderUiModuleSidebar: renderers.renderUiModuleSidebar,
});
const failures = [];

const dispatchHtml = renderDispatchModulePage({
  renderMesModulePatternPage,
  renderUiPanel: renderers.renderUiPanel,
  renderUiPanelBody: renderers.renderUiPanelBody,
  renderUiSystemState: renderers.renderUiSystemState,
});

check("dispatch module", dispatchHtml, [
  "data-ui-component=\"ModulePage\"",
  "data-ui-runtime=\"hard-v1\"",
  "dispatch-placeholder-page",
  "data-ui-component=\"Panel\"",
  "data-ui-component=\"SystemState\"",
  "Диспетчерская временно отключена",
]);

const productionStructure = createProductionStructureMatrixModule({
  PRODUCTION_STRUCTURE_MATRIX_COLUMNS: ["Структура", "Тип строки", "ID / код"],
  PRODUCTION_STRUCTURE_MATRIX_FIELD_OPTIONS: {},
  PRODUCTION_STRUCTURE_MATRIX_ROWS: [{
    id: "row-1",
    level: 0,
    cells: {
      "Структура": "Отдел теста",
      "Тип строки": "Отдел",
      "ID / код": "D-TEST",
    },
  }],
  SHIFT_MASTER_ASSIGNMENT_SCOPE_MODES: [{ id: "department", shortLabel: "ветка", label: "Ветка", description: "Ветка" }],
  escapeAttribute,
  escapeHtml,
  getApp: () => ({ querySelector: () => null }),
  getShiftMasterAssignableEmployees: () => [],
  getShiftMasterAssignmentConfig: () => ({ mode: "department", employeeIds: [] }),
  getShiftMasterDefaultEmployeeScope: () => [],
  getShiftMasterEmployeeRows: () => [],
  getShiftMasterNormalizedWorkCenterId: (value) => value,
  getShiftMasterProfile: () => null,
  getShiftMasterProfiles: () => [],
  getShiftMasterWorkCenterCatalog: () => [],
  getUi: () => ({ productionStructureMatrixOverrides: {} }),
  getWorkCenter: () => null,
  joinUiClasses,
  normalizePlainRecord: (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {}),
  normalizeShiftMasterAssignmentScopeMode: (value) => value || "department",
  notifySaveSuccess: () => {},
  persistUiState: () => {},
  render: () => {},
  ...renderers,
  resetShiftMasterAssignmentMatrixConfig: () => {},
  selected: (left, right) => (left === right ? "selected" : ""),
  setShiftMasterAssignmentMatrixConfig: () => {},
  setShiftMasterAssignmentMatrixEmployee: () => {},
  sortShiftMasterAssignableEmployees: (employees) => employees,
  syncProductionStructureMatrixToPlanningState: () => {},
});

check("production structure matrix module", productionStructure.renderProductionStructureMatrixPage(), [
  "production-structure-page",
  "Структура и сотрудники",
  "Подразделения",
  "реестр пуст",
]);

if (failures.length) {
  console.error("[extracted-module-render-smoke] Failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("[extracted-module-render-smoke] OK");

function check(label, html, expectedParts) {
  if (!String(html || "").trim()) {
    failures.push(`${label}: empty output`);
  }
  if (html.includes("undefined")) {
    failures.push(`${label}: output contains undefined`);
  }
  if (html.includes("[object Object]")) {
    failures.push(`${label}: output contains [object Object]`);
  }
  for (const part of expectedParts) {
    if (!html.includes(part)) {
      failures.push(`${label}: missing ${part}`);
    }
  }
}
