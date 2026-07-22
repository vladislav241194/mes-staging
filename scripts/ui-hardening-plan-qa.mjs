import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HARD_UI_RUNTIME_MODULE_IDS,
  LEGACY_UI_RUNTIME_MODULE_IDS,
  PARTIAL_UI_RUNTIME_CONTRACTS,
  PARTIAL_UI_RUNTIME_MODULE_IDS,
  SPECIAL_UI_RUNTIME_MODULE_IDS,
  UI_HARDENING_KEY_RUNTIME_MODULE_IDS,
  UI_HARDENING_PLAN_STAGES,
  UI_RUNTIME_COMPONENT_CONTRACTS,
  UI_RUNTIME_DOM_NORMALIZER_CONTRACTS,
  UI_RUNTIME_STYLE_TOKENS,
} from "../src/ui_runtime_contracts.js";
import { MES_MODULE_FLOW_SEQUENCE } from "../src/mes_contracts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

async function read(relativePath) {
  return fs.readFile(path.join(rootDir, relativePath), "utf8");
}

const [
  appSource,
  coreCssSource,
  moduleSmokeSource,
  contractQaSource,
  coverageQaSource,
  classAuditSource,
  cssAuditSource,
  designQaSource,
  packageSource,
  buildSource,
  uiHtmlSource,
  uiComponentsSource,
  uiActionsCssSource,
  uiStatusCssSource,
] = await Promise.all([
  read("src/app.js"),
  read("styles/mes-ui-core.css"),
  read("scripts/module-smoke-qa.mjs"),
  read("scripts/ui-contract-qa.mjs"),
  read("scripts/ui-runtime-coverage-qa.mjs"),
  read("scripts/ui-runtime-class-audit.mjs"),
  read("scripts/css-layer-audit.mjs"),
  read("scripts/design-qa-snapshots.mjs"),
  read("package.json"),
  read("scripts/build.mjs"),
  read("src/ui/html.ts"),
  read("src/ui/components.ts"),
  read("styles/ui/actions.css"),
  read("styles/ui/status.css"),
]);

const packageJson = JSON.parse(packageSource);
const failures = [];
const uiRuntimeJsSource = [appSource, uiHtmlSource, uiComponentsSource].join("\n");
const uiCssContractSource = [coreCssSource, uiActionsCssSource, uiStatusCssSource].join("\n");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(source, value, label = value) {
  assert(source.includes(value), `missing ${label}`);
}

function hasComponent(componentName) {
  return UI_RUNTIME_COMPONENT_CONTRACTS.some((contract) => contract.component === componentName);
}

function hasNormalizer(componentName) {
  return UI_RUNTIME_DOM_NORMALIZER_CONTRACTS.some((contract) => contract.component === componentName);
}

function hasToken(tokenName) {
  return UI_RUNTIME_STYLE_TOKENS.includes(tokenName) && coreCssSource.includes(tokenName);
}

function hasHardModule(moduleId) {
  return HARD_UI_RUNTIME_MODULE_IDS.includes(moduleId);
}

function hasExplicitRuntimeModule(moduleId) {
  return (
    HARD_UI_RUNTIME_MODULE_IDS.includes(moduleId)
    || SPECIAL_UI_RUNTIME_MODULE_IDS.includes(moduleId)
    || PARTIAL_UI_RUNTIME_MODULE_IDS.includes(moduleId)
  );
}

const evidenceLabels = {
  "component-registry": "реестр UI-компонентов содержит базовые компоненты",
  "runtime-coverage-registry": "модули разнесены по hard/special/partial/legacy runtime",
  "runtime-class-audit": "CSS-классы hard-runtime сверяются с runtime-источником",
  "component-contracts": "каждый компонент имеет helper, CSS-селектор и назначение",
  "style-token-contracts": "глобальные UI-токены существуют в UI Core CSS",
  "dom-normalizer-contracts": "DOM-normalizer маркирует live-элементы через общий контракт",
  "action-button-helper": "кнопки собираются через renderUiActionButton",
  "action-button-css": "кнопки имеют общий CSS и высоту через token",
  "action-button-smoke-gate": "browser smoke ловит видимые кнопки без UI marker",
  "sidebar-helper": "внутренний sidebar собирается через renderUiModuleSidebar",
  "module-header-helper": "заголовок модуля собирается через renderUiModuleHeader",
  "sidebar-width-smoke-gate": "browser smoke ловит drift ширины sidebar",
  "module-background-smoke-gate": "browser smoke ловит drift фона ModulePage",
  "panel-helper": "панели собираются через renderUiPanel",
  "panel-body-helper": "тело панели собирается через renderUiPanelBody",
  "panel-padding-tokens": "отступы панелей вынесены в tokens",
  "panel-overlap-smoke-gate": "browser smoke ловит выход и наложения внутри панелей",
  "table-helper": "таблицы оборачиваются через renderUiTableWrap",
  "table-horizontal-scroll-contract": "TableWrap имеет horizontal-only и viewport scroll contracts",
  "table-vertical-scroll-smoke-gate": "browser smoke ловит вертикальный scroll внутри horizontal-only TableWrap",
  "form-field-helper": "поля собираются через renderUiFormField",
  "form-control-height-token": "высота input/select/textarea вынесена в token",
  "form-field-smoke-gate": "browser smoke требует явный FormField или DomainField contract",
  "modal-helper": "модалки собираются через renderUiModalFrame/renderUiModalShell",
  "drawer-helper": "drawer собирается через renderUiDrawerFrame/renderUiDrawerShell",
  "dropdown-helper": "dropdown собирается через renderUiDropdownFrame",
  "opened-overlay-smoke-gates": "открытые состояния modal/drawer/dropdown попали в QA",
  "key-modules-explicit-runtime": "ключевые модули имеют явный runtime coverage",
  "legacy-module-alias-smoke-coverage": "устаревшие deep links проверяются как aliases канонических runtime-модулей",
  "partial-runtime-modules-documented": "partial runtime modules имеют причину и следующий шаг",
  "no-legacy-runtime-modules": "legacy runtime modules отсутствуют",
  "qa-ui-script": "qa:ui запускает все UI gates, включая план",
  "qa-syntax-script": "qa:syntax проверяет новый плановый gate",
  "module-smoke-script": "module-smoke запускается через npm scripts",
  "css-layer-audit-script": "CSS layer audit подключен и контролирует дубли",
  "qa-stabilize-script": "qa:stabilize запускает syntax и architecture",
  "build-script": "build собирает UI Core CSS",
  "git-diff-check-script": "qa:stabilize включает git diff --check",
};

const evidenceChecks = {
  "component-registry": () => {
    assert(UI_RUNTIME_COMPONENT_CONTRACTS.length >= 20, `expected at least 20 UI component contracts, got ${UI_RUNTIME_COMPONENT_CONTRACTS.length}`);
    ["ModulePage", "ModuleSidebar", "Panel", "ActionButton", "TableWrap", "FormField", "Modal", "Drawer", "Dropdown"].forEach((component) => {
      assert(hasComponent(component), `missing ${component} component contract`);
    });
  },
  "runtime-coverage-registry": () => {
    assert(HARD_UI_RUNTIME_MODULE_IDS.length >= 14, `expected hard runtime coverage for live modules, got ${HARD_UI_RUNTIME_MODULE_IDS.length}`);
    const partialModulesAreClosed = PARTIAL_UI_RUNTIME_MODULE_IDS.length === 0;
    const partialModulesAreDocumented = PARTIAL_UI_RUNTIME_MODULE_IDS.length >= 4;
    assert(partialModulesAreClosed || partialModulesAreDocumented, `expected partial runtime modules to be closed or documented, got ${PARTIAL_UI_RUNTIME_MODULE_IDS.length}`);
    assert(SPECIAL_UI_RUNTIME_MODULE_IDS.includes("gantt"), "missing specialized gantt runtime coverage");
    assert(!SPECIAL_UI_RUNTIME_MODULE_IDS.includes("visualSystem"), "removed visualSystem must not remain in specialized runtime coverage");
  },
  "runtime-class-audit": () => {
    includes(packageJson.scripts?.["qa:ui"] || "", "ui-runtime-class-audit.mjs", "qa:ui class audit");
    includes(classAuditSource, "UI_RUNTIME_CONTROLLED_CLASS_PREFIXES", "class audit controlled prefixes");
  },
  "component-contracts": () => {
    UI_RUNTIME_COMPONENT_CONTRACTS.forEach((contract) => {
      assert(contract.component && Array.isArray(contract.helperNames) && contract.helperNames.length, `bad helper contract for ${contract.component}`);
      assert(Array.isArray(contract.cssSelectors) && contract.cssSelectors.length, `bad CSS contract for ${contract.component}`);
      assert(contract.purpose, `missing purpose for ${contract.component}`);
      contract.helperNames.forEach((helperName) => includes(uiRuntimeJsSource, `function ${helperName}`, `${contract.component}.${helperName}`));
    });
  },
  "style-token-contracts": () => {
    [
      "--mes-ui-module-page-background",
      "--mes-ui-module-page-background-size",
      "--mes-ui-module-page-background-repeat",
      "--mes-ui-module-sidebar-width",
      "--mes-ui-panel-gap",
      "--mes-ui-panel-head-padding",
      "--mes-ui-panel-body-padding",
      "--mes-ui-form-control-height",
      "--mes-ui-control-height",
    ].forEach((token) => assert(hasToken(token), `missing style token ${token}`));
  },
  "dom-normalizer-contracts": () => {
    ["FormField", "ActionButton", "TableWrap", "ModulePage", "ModuleSidebar", "Panel", "Modal", "Drawer", "Dropdown"].forEach((component) => {
      assert(hasNormalizer(component), `missing DOM normalizer for ${component}`);
    });
    includes(appSource, "UI_RUNTIME_DOM_NORMALIZER_CONTRACTS.forEach", "runtime normalizer execution");
  },
  "action-button-helper": () => includes(uiRuntimeJsSource, "function renderUiActionButton", "renderUiActionButton"),
  "action-button-css": () => {
    includes(uiCssContractSource, ".ui-action-button", "ActionButton CSS");
    includes(uiCssContractSource, "var(--mes-ui-control-height)", "ActionButton control height token");
  },
  "action-button-smoke-gate": () => includes(moduleSmokeSource, "visible button without UI component marker", "ActionButton smoke gate"),
  "sidebar-helper": () => {
    includes(uiRuntimeJsSource, "function renderUiModuleSidebar", "renderUiModuleSidebar");
    includes(coreCssSource, "--mes-ui-module-sidebar-width", "ModuleSidebar width token");
  },
  "module-header-helper": () => {
    includes(uiRuntimeJsSource, "function renderUiModuleHeader", "renderUiModuleHeader");
    includes(coreCssSource, ".ui-module-header", "ModuleHeader CSS");
  },
  "sidebar-width-smoke-gate": () => {
    includes(moduleSmokeSource, "STANDARD_MODULE_SIDEBAR_WIDTH", "standard sidebar width constant");
    includes(moduleSmokeSource, "ModuleSidebar width contract drift", "ModuleSidebar width smoke gate");
  },
  "module-background-smoke-gate": () => {
    includes(coreCssSource, "--mes-ui-module-page-background", "ModulePage background token");
    includes(moduleSmokeSource, "ModulePage background contract drift", "ModulePage background smoke gate");
  },
  "panel-helper": () => includes(uiRuntimeJsSource, "function renderUiPanel(", "renderUiPanel"),
  "panel-body-helper": () => includes(uiRuntimeJsSource, "function renderUiPanelBody", "renderUiPanelBody"),
  "panel-padding-tokens": () => {
    ["--mes-ui-panel-gap", "--mes-ui-panel-head-padding", "--mes-ui-panel-body-padding", "--mes-ui-panel-footer-padding"].forEach((token) => {
      assert(hasToken(token), `missing panel spacing token ${token}`);
    });
  },
  "panel-overlap-smoke-gate": () => {
    includes(moduleSmokeSource, "panel content escapes panel bounds", "Panel bounds gate");
    includes(moduleSmokeSource, "PanelBody direct blocks overlap", "PanelBody overlap gate");
  },
  "table-helper": () => includes(uiRuntimeJsSource, "function renderUiTableWrap", "renderUiTableWrap"),
  "table-horizontal-scroll-contract": () => {
    includes(uiRuntimeJsSource, "scrollContract = \"horizontal-only\"", "TableWrap horizontal-only default contract");
    includes(uiRuntimeJsSource, "data-scroll-contract=\"${escapeAttribute(normalizedScrollContract)}\"", "TableWrap dynamic scroll contract marker");
    includes(coreCssSource, ".ui-table-wrap[data-scroll-contract=\"horizontal-only\"]", "TableWrap horizontal-only CSS");
    includes(coreCssSource, ".ui-table-wrap[data-scroll-contract=\"viewport\"]", "TableWrap viewport CSS");
  },
  "table-vertical-scroll-smoke-gate": () => includes(moduleSmokeSource, "TableWrap horizontal-only has vertical scroll contract drift", "TableWrap vertical scroll smoke gate"),
  "form-field-helper": () => includes(uiRuntimeJsSource, "function renderUiFormField", "renderUiFormField"),
  "form-control-height-token": () => assert(hasToken("--mes-ui-form-control-height"), "missing form control height token"),
  "form-field-smoke-gate": () => includes(moduleSmokeSource, "visible form field without explicit FormField/DomainField contract", "FormField/DomainField smoke gate"),
  "modal-helper": () => {
    includes(uiRuntimeJsSource, "function renderUiModalFrame", "renderUiModalFrame");
    includes(uiRuntimeJsSource, "function renderUiModalShell", "renderUiModalShell");
  },
  "drawer-helper": () => {
    includes(uiRuntimeJsSource, "function renderUiDrawerFrame", "renderUiDrawerFrame");
    includes(uiRuntimeJsSource, "function renderUiDrawerShell", "renderUiDrawerShell");
  },
  "dropdown-helper": () => includes(uiRuntimeJsSource, "function renderUiDropdownFrame", "renderUiDropdownFrame"),
  "opened-overlay-smoke-gates": () => {
    includes(moduleSmokeSource, "selected slot edit surface contract is missing after opening slot", "opened Gantt modal gate");
    ["routes-labor-open", "timesheet-editor-open", "shift-master-sheet-open", "authPrototype-pin"].forEach((stateId) => {
      includes(designQaSource, stateId, `opened-state visual QA ${stateId}`);
    });
  },
  "key-modules-explicit-runtime": () => {
    const duplicateKeyModuleIds = UI_HARDENING_KEY_RUNTIME_MODULE_IDS.filter((moduleId, index, ids) => ids.indexOf(moduleId) !== index);
    assert(!duplicateKeyModuleIds.length, `duplicate key runtime modules: ${[...new Set(duplicateKeyModuleIds)].join(", ")}`);
    UI_HARDENING_KEY_RUNTIME_MODULE_IDS.forEach((moduleId) => {
      assert(MES_MODULE_FLOW_SEQUENCE.includes(moduleId), `key runtime module is not an active Blueprint module ${moduleId}`);
      assert(hasExplicitRuntimeModule(moduleId), `missing explicit runtime module ${moduleId}`);
    });
    ["nomenclature", "specifications2", "directories"].forEach((moduleId) => {
      assert(UI_HARDENING_KEY_RUNTIME_MODULE_IDS.includes(moduleId), `technology/reference runtime coverage is missing ${moduleId}`);
    });
  },
  "legacy-module-alias-smoke-coverage": () => {
    [
      { source: "products", target: "specifications2" },
      { source: "routes", target: "specifications2" },
    ].forEach(({ source, target }) => {
      assert(!MES_MODULE_FLOW_SEQUENCE.includes(source), `legacy deep link must not return as an active Blueprint module ${source}`);
      assert(!UI_HARDENING_KEY_RUNTIME_MODULE_IDS.includes(source), `legacy deep link must not be treated as a runtime module ${source}`);
      includes(moduleSmokeSource, `{ source: "${source}", target: "${target}" }`, `${source} -> ${target} legacy alias smoke coverage`);
      assert(hasExplicitRuntimeModule(target), `legacy alias target lacks explicit runtime coverage ${source} -> ${target}`);
    });
  },
  "partial-runtime-modules-documented": () => {
    assert(PARTIAL_UI_RUNTIME_MODULE_IDS.length === 0 || Object.keys(PARTIAL_UI_RUNTIME_CONTRACTS).length >= PARTIAL_UI_RUNTIME_MODULE_IDS.length, "partial runtime contracts do not cover listed modules");
    PARTIAL_UI_RUNTIME_MODULE_IDS.forEach((moduleId) => {
      const contract = PARTIAL_UI_RUNTIME_CONTRACTS[moduleId];
      assert(contract?.status && contract?.reason && contract?.nextMigration, `partial runtime contract is incomplete for ${moduleId}`);
    });
    includes(coverageQaSource, "Partial UI runtime modules require explicit contracts", "partial runtime coverage gate");
  },
  "no-legacy-runtime-modules": () => {
    assert(LEGACY_UI_RUNTIME_MODULE_IDS.length === 0, `legacy runtime modules remain: ${LEGACY_UI_RUNTIME_MODULE_IDS.join(", ")}`);
    includes(coverageQaSource, "LEGACY_UI_RUNTIME_MODULE_IDS.length === 0", "legacy runtime coverage gate");
  },
  "qa-ui-script": () => {
    includes(packageJson.scripts?.["qa:ui"] || "", "ui-contract-qa.mjs", "qa:ui contract gate");
    includes(packageJson.scripts?.["qa:ui"] || "", "ui-runtime-coverage-qa.mjs", "qa:ui runtime coverage gate");
    includes(packageJson.scripts?.["qa:ui"] || "", "ui-hardening-plan-qa.mjs", "qa:ui hardening plan gate");
  },
  "qa-syntax-script": () => {
    const syntaxScript = packageJson.scripts?.["qa:syntax"] || "";
    if (syntaxScript.includes("scripts/syntax-qa.mjs")) return;
    includes(syntaxScript, "scripts/ui-hardening-plan-qa.mjs", "qa:syntax hardening plan check");
  },
  "module-smoke-script": () => includes(packageJson.scripts?.["qa:module-smoke:inner"] || "", "scripts/module-smoke-qa.mjs", "module smoke script"),
  "css-layer-audit-script": () => {
    includes(packageJson.scripts?.["qa:css"] || "", "scripts/css-layer-audit.mjs", "css audit script");
    includes(cssAuditSource, "Duplicate selector", "css duplicate selector audit");
  },
  "qa-stabilize-script": () => {
    const script = packageJson.scripts?.["qa:stabilize"] || "";
    includes(script, "npm run qa:syntax", "qa:stabilize syntax");
    includes(script, "npm run qa:architecture", "qa:stabilize architecture");
  },
  "build-script": () => {
    includes(packageJson.scripts?.build || "", "scripts/build.mjs", "build command");
    includes(buildSource, "mes-ui-core.css", "build copies UI core CSS");
  },
  "git-diff-check-script": () => includes(packageJson.scripts?.["qa:stabilize"] || "", "git diff --check", "qa:stabilize git diff check"),
};

function validatePlanShape() {
  assert(UI_HARDENING_PLAN_STAGES.length === 11, `expected 11 UI hardening plan stages, got ${UI_HARDENING_PLAN_STAGES.length}`);
  const seenIds = new Set();
  UI_HARDENING_PLAN_STAGES.forEach((stage, index) => {
    assert(stage.order === index + 1, `stage ${stage.id} has order ${stage.order}, expected ${index + 1}`);
    assert(stage.id && !seenIds.has(stage.id), `duplicate or empty stage id ${stage.id}`);
    seenIds.add(stage.id);
    assert(stage.title, `stage ${stage.id} has no title`);
    assert(stage.status === "closed", `stage ${stage.id} must be status=closed, got ${stage.status || "empty"}`);
    assert(Array.isArray(stage.requiredEvidence) && stage.requiredEvidence.length >= 3, `stage ${stage.id} needs at least 3 evidence checks`);
  });
}

validatePlanShape();

const rows = [];
for (const stage of UI_HARDENING_PLAN_STAGES) {
  const stageFailures = [];
  const stageEvidence = [];
  for (const evidenceId of stage.requiredEvidence) {
    const check = evidenceChecks[evidenceId];
    if (!check) {
      stageFailures.push(`${evidenceId}: missing checker`);
      continue;
    }
    try {
      check();
      stageEvidence.push({ id: evidenceId, label: evidenceLabels[evidenceId] || evidenceId });
    } catch (error) {
      stageFailures.push(`${evidenceId}: ${error.message}`);
    }
  }
  rows.push({ stage, stageEvidence, stageFailures });
  if (stageFailures.length) {
    failures.push(`${String(stage.order).padStart(2, "0")} ${stage.title}: ${stageFailures.join("; ")}`);
  }
}

const usedEvidence = new Set(UI_HARDENING_PLAN_STAGES.flatMap((stage) => stage.requiredEvidence));
Object.keys(evidenceChecks).forEach((evidenceId) => {
  if (!usedEvidence.has(evidenceId)) {
    failures.push(`Unused evidence checker: ${evidenceId}`);
  }
});

console.log("MES UI Hardening Plan QA");
rows.forEach(({ stage, stageEvidence, stageFailures }) => {
  const status = stageFailures.length ? "FAIL" : "ЗАКРЫТО";
  console.log(`${String(stage.order).padStart(2, "0")}. ${stage.title}: ${status} (${stage.requiredEvidence.length} checks)`);
  stageEvidence.forEach((evidence) => {
    console.log(`    - ${evidence.id}: OK - ${evidence.label}`);
  });
});

if (failures.length) {
  console.error("\nFailures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("\nOK: all 11 UI hardening plan stages have executable coverage.");
