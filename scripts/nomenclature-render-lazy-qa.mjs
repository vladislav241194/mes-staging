import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const assert = (value, message) => { if (!value) throw new Error(message); };
const appPath = fileURLToPath(new URL("../src/app.js", import.meta.url));
const productsRenderPath = fileURLToPath(new URL("../src/modules/products/render.js", import.meta.url));
const nomenclatureRenderPath = fileURLToPath(new URL("../src/modules/nomenclature/render.js", import.meta.url));
const app = await readFile(appPath, "utf-8");
const productsRender = await readFile(productsRenderPath, "utf-8");
const nomenclatureRender = await readFile(nomenclatureRenderPath, "utf-8");

assert(!app.includes('import { renderNomenclatureModulePage } from "./modules/nomenclature/render.js";'), "Nomenclature render must not remain in the initial static import graph");
assert(app.includes('import("./modules/nomenclature/render.js")'), "Nomenclature render must load through a dedicated dynamic import");
assert(app.includes("function ensureNomenclatureRenderModule()"), "Nomenclature module must use a single-flight lazy loader");
assert(app.includes('title: "Загружаем номенклатуру"'), "Nomenclature navigation must render a safe loading state while its chunk loads");
assert(app.includes('if (ui.activeModule === "nomenclature") render();'), "Nomenclature module must re-render only after its chunk is ready on the active route");
assert(!productsRender.includes("function renderBomListsPage"), "BOM renderer must not remain in the initial Products render module");
assert(!productsRender.includes("function renderNomenclatureSectionFilter"), "Nomenclature filter renderer must not remain in the initial Products render module");
assert(nomenclatureRender.includes("function renderBomListsPage"), "Lazy nomenclature chunk must render the BOM view");
assert(nomenclatureRender.includes("function renderNomenclatureSectionFilter"), "Lazy nomenclature chunk must render the nomenclature filter view");
assert(app.includes("renderNomenclatureModulePage({\n      ...moduleDeps,\n      renderMesModulePatternPage,\n      renderUiFormActions,\n      renderUiFormGrid,"), "Application lazy wrapper must provide the nomenclature renderer's UI helpers after the chunk loads");

const { renderNomenclatureModulePage } = await import(new URL("../src/modules/nomenclature/render.js", import.meta.url));
const escape = (value = "") => String(value);
const passthrough = ({ body = "", content = "", sidebar = "", header = "", actions = "", control = "" } = {}) => `${sidebar}${header}${body}${content}${actions}${control}`;
const renderUiActionButton = ({ label = "", attributes = "" } = {}) => `<button ${attributes}>${label}</button>`;
const renderUiActionFileLabel = ({ label = "", inputAttributes = "" } = {}) => `<label>${label}<input ${inputAttributes} /></label>`;
const renderUiSidebarItem = ({ title = "", meta = "", attributes = "" } = {}) => `<button ${attributes}>${title}${meta}</button>`;
const makeRenderDeps = ({ activePane = "items" } = {}) => {
  const ui = { activeNomenclaturePane: activePane, activeBomId: "bom-test", activeNomenclatureId: "" };
  const bom = { id: "bom-test", name: "Тестовая плата", boardCode: "АБВГ.001", resultItem: "Смонтированная плата" };
  return {
    BOARD_BOM_TERM: "BOM",
    BOARD_SPEC_LIST_TERM: "Печатные платы",
    BOM_COMPONENT_FIELDS: [{ key: "resistors", label: "Резисторы" }],
    BOM_IMPORT_COLUMN_COUNT: 2,
    BOM_IMPORT_FALLBACK_HEADERS: ["Поз.", "Наименование"],
    NOMENCLATURE_REA_COMPONENT_TYPE: "РЭА компоненты",
    directoryState: { nomenclature: [], bomLists: [bom] },
    escapeAttribute: escape,
    escapeHtml: escape,
    getActiveBomForModule: () => bom,
    getActiveNomenclatureItem: () => null,
    getActiveNomenclaturePane: () => activePane,
    getBomComponentCounts: () => ({ resistors: 1 }),
    getBomComponentFieldCounts: () => ({ resistors: 1 }),
    getBomImportHeaders: () => ["Поз.", "Наименование"],
    getBomImportRows: () => [{ values: ["R1", "Резистор 10 кОм"] }],
    getFilteredNomenclatureItems: () => [],
    getNomenclatureTypeCounts: () => ({}),
    getNomenclatureTypeFilterValue: () => "all",
    getNomenclatureTypeOptions: () => [{ value: "РЭА компоненты", label: "РЭА компоненты" }],
    getReaNomenclatureItems: () => [],
    icon: (name) => `<svg data-icon="${name}"></svg>`,
    normalizeNomenclatureType: (value) => value,
    renderDenseInlineSelect: () => "<select></select>",
    renderMesModulePatternPage: ({ sidebar = {}, header = {}, content = "" } = {}) => `${sidebar.actions || ""}${sidebar.body || ""}${header.title || ""}${content}`,
    renderUiActionButton,
    renderUiActionFileLabel,
    renderUiEmptyState: ({ title = "", text = "" } = {}) => `${title}${text}`,
    renderUiFilterBar: passthrough,
    renderUiFormActions: passthrough,
    renderUiFormField: passthrough,
    renderUiFormGrid: passthrough,
    renderUiModuleHeader: ({ title = "", description = "" } = {}) => `${title}${description}`,
    renderUiModulePage: passthrough,
    renderUiModuleSidebar: passthrough,
    renderUiPanel: passthrough,
    renderUiPanelBody: passthrough,
    renderUiSidebarItem,
    renderUiStatusToken: (value) => value,
    renderUiTableWrap: passthrough,
    ui,
  };
};

const boardMarkup = renderNomenclatureModulePage(makeRenderDeps({ activePane: "boards" }));
assert(boardMarkup.includes("Тестовая плата"), "Lazy nomenclature chunk must render the active BOM board");
assert(boardMarkup.includes("data-bom-create"), "Lazy nomenclature chunk must retain the BOM create action");
assert(boardMarkup.includes("data-bom-import-cell"), "Lazy nomenclature chunk must retain editable BOM cells");
assert(boardMarkup.includes("data-bom-import-delete"), "Lazy nomenclature chunk must retain BOM row deletion actions");
const itemsMarkup = renderNomenclatureModulePage(makeRenderDeps());
assert(itemsMarkup.includes("Вся номенклатура"), "Lazy nomenclature chunk must retain the nomenclature filter view");
console.log("Nomenclature render lazy-load QA passed");
