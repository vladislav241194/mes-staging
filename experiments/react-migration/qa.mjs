import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const labRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(labRoot, "..", "..");
const sourceRoot = join(labRoot, "src");
const baseline = "49d0e1eeecd7b653bdb09d61e73068bb12d22741";
const blockedPaths = [
  "src/app.js",
  "src/modules/runtime_state/service.js",
  "package.json",
  "package-lock.json",
  "index.html",
  "app-version.json",
];

async function collectSources(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...await collectSources(path));
    else if ([".ts", ".tsx"].includes(extname(entry.name))) paths.push(path);
  }
  return paths;
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-react-migration-qa-"));
try {
  const adapterOutput = join(temporaryRoot, "adapter.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/nomenclature/adapter.ts")],
    outfile: adapterOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const { adaptNomenclatureItems, adaptNomenclatureReadModel } = await import(`${pathToFileURL(adapterOutput).href}?qa=${Date.now()}`);

  const adapted = adaptNomenclatureItems([
    { id: "ok", name: "Valid", type: "РЭА компоненты", article: "A-1" },
    { id: "", name: "Missing id", type: "РЭА компоненты" },
    null,
  ]);
  assert.equal(adapted.length, 1, "adapter must discard invalid records");
  assert.deepEqual(adapted[0], {
    id: "ok",
    article: "A-1",
    name: "Valid",
    type: "РЭА компоненты",
    unit: "шт.",
    packageName: "-",
    manufacturer: "-",
    description: "",
    statusLabel: "Активен",
    statusTone: "success",
  });
  assert.deepEqual(adaptNomenclatureItems({}), [], "non-array payload must fail closed");
  const readModel = adaptNomenclatureReadModel({
    nomenclature: [{ id: "ok", name: "Valid", type: "РЭА" }],
    nomenclatureTypes: [
      { id: "rea", name: "РЭА компоненты", status: "Активен" },
      { id: "old", name: "Архив", status: "Архив" },
    ],
  });
  assert.equal(readModel.items[0]?.type, "РЭА компоненты", "legacy REA alias must normalize");
  assert.deepEqual(readModel.types.map((entry) => entry.label), ["РЭА компоненты"], "inactive types must be hidden");

  const viewModelOutput = join(temporaryRoot, "view-model.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/nomenclature/view-model.ts")],
    outfile: viewModelOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const viewModel = await import(`${pathToFileURL(viewModelOutput).href}?qa=${Date.now()}`);
  assert.equal(viewModel.formatRecordCount(1), "1 запись");
  assert.equal(viewModel.formatRecordCount(2), "2 записи");
  assert.equal(viewModel.formatRecordCount(5), "5 записей");
  assert.equal(viewModel.formatRecordCount(11), "11 записей");
  assert.equal(viewModel.formatRecordCount(21), "21 запись");
  assert.equal(viewModel.filterNomenclatureItems(adapted, "Механика").length, 0);
  assert.equal(viewModel.filterNomenclatureItems(adapted, "РЭА компоненты").length, 1);
  assert.equal(viewModel.resolveVisibleSelection(adapted, "missing")?.id, "ok");
  assert.deepEqual(viewModel.buildNomenclatureFilters(readModel).map((entry) => [entry.label, entry.count]), [
    ["Вся номенклатура", 1],
    ["РЭА компоненты", 1],
  ]);
  const boardReadModel = adaptNomenclatureReadModel({
    nomenclature: [{ id: "pcb", name: "Плата", type: "Печатные платы" }],
    nomenclatureTypes: [{ id: "pcb-type", name: "Печатные платы", status: "Активен" }],
    bomLists: [{ id: "board-1" }, { id: "board-2" }],
  });
  const boardFilter = viewModel.buildNomenclatureFilters(boardReadModel).find((entry) => entry.label === "Печатные платы");
  assert.deepEqual(boardFilter, {
    id: "__boards__",
    label: "Печатные платы",
    count: 2,
    description: "",
    action: "legacy",
  }, "Boards sidebar entry must preserve the legacy BOM pane semantics");

  const fixtureOutput = join(temporaryRoot, "nomenclature-fixture.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/nomenclature/fixture.ts")],
    outfile: fixtureOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const { nomenclatureFixture } = await import(`${pathToFileURL(fixtureOutput).href}?qa=${Date.now()}`);
  const { renderNomenclatureModulePage } = await import(`${pathToFileURL(join(repositoryRoot, "src/modules/nomenclature/render.js")).href}?qa=${Date.now()}`);
  const escapeLegacyText = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  const activeTypes = nomenclatureFixture.nomenclatureTypes
    .filter((entry) => !["архив", "отключен", "удален"].includes(String(entry.status || "").toLocaleLowerCase("ru-RU")))
    .map((entry) => ({ value: entry.name, label: entry.name }));
  const firstLegacyItem = nomenclatureFixture.nomenclature[0];
  const legacyHtml = renderNomenclatureModulePage({
    BOARD_BOM_TERM: "BOM платы",
    BOARD_SPEC_LIST_TERM: "Платы",
    BOM_COMPONENT_FIELDS: [],
    BOM_IMPORT_COLUMN_COUNT: 0,
    BOM_IMPORT_FALLBACK_HEADERS: [],
    NOMENCLATURE_REA_COMPONENT_TYPE: "РЭА компоненты",
    directoryState: nomenclatureFixture,
    escapeAttribute: escapeLegacyText,
    escapeHtml: escapeLegacyText,
    getActiveNomenclatureItem: () => firstLegacyItem,
    getActiveNomenclaturePane: () => "items",
    getFilteredNomenclatureItems: (items) => items,
    getNomenclatureTypeCounts: (items) => Object.fromEntries(activeTypes.map((type) => [type.value, items.filter((item) => item.type === type.value).length])),
    getNomenclatureTypeFilterValue: () => "all",
    getNomenclatureTypeOptions: () => activeTypes,
    icon: () => "",
    normalizeNomenclatureType: (value) => String(value || "РЭА компоненты"),
    renderDenseInlineSelect: () => "<select></select>",
    renderMesModulePatternPage: ({ content }) => `<main>${content}</main>`,
    renderUiActionButton: ({ label = "" }) => `<button>${escapeLegacyText(label)}</button>`,
    renderUiEmptyState: ({ title = "", text = "" }) => `<div>${escapeLegacyText(title)}${escapeLegacyText(text)}</div>`,
    renderUiFilterBar: ({ body = "" }) => body,
    renderUiFormActions: ({ actions = "" }) => actions,
    renderUiFormField: ({ control = "" }) => control,
    renderUiFormGrid: ({ body = "" }) => body,
    renderUiPanel: ({ body = "" }) => `<section>${body}</section>`,
    renderUiPanelBody: ({ body = "" }) => body,
    renderUiSidebarItem: ({ title = "", badge = "", attributes = "" }) => `<button ${attributes}>${escapeLegacyText(title)} ${escapeLegacyText(badge)}</button>`,
    renderUiStatusToken: (label) => `<span>${escapeLegacyText(label)}</span>`,
    renderUiTableWrap: ({ body = "" }) => `<div>${body}</div>`,
    ui: { activeNomenclatureId: firstLegacyItem.id },
  });
  const legacyTable = legacyHtml.match(/<table class="directory-table nomenclature-table ui-table">([\s\S]*?)<\/table>/)?.[1] || "";
  assert.ok(legacyTable, "actual legacy Nomenclature table must render");
  const decodeLegacyText = (html) => html
    .replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/\s+/g, " ")
    .trim();
  const legacyHeaders = [...legacyTable.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((match) => decodeLegacyText(match[1]));
  assert.deepEqual(legacyHeaders.slice(0, -1), viewModel.NOMENCLATURE_READ_COLUMNS, "React read columns must match the actual legacy table order");
  assert.equal(legacyHeaders.at(-1), "Действия", "legacy write column must remain explicitly outside the read-only React slice");
  const legacyBody = legacyTable.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || "";
  const legacyRows = [...legacyBody.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)].map((match) => ({
    id: match[1].match(/data-nomenclature-row-open="([^"]+)"/)?.[1] || "",
    selected: /\bis-selected\b/.test(match[1]),
    cells: [...match[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => decodeLegacyText(cell[1])).slice(0, -1),
  }));
  const adaptedFixtureItems = adaptNomenclatureReadModel(nomenclatureFixture).items;
  assert.deepEqual(legacyRows.map((row) => ({ id: row.id, cells: row.cells })), adaptedFixtureItems.map((item) => ({
    id: item.id,
    cells: viewModel.getNomenclatureReadCells(item),
  })), "React adapter rows must preserve actual legacy visible data");
  assert.deepEqual(legacyRows.filter((row) => row.selected).map((row) => row.id), [firstLegacyItem.id], "legacy selected row must match React initial selection");

  const boardsAdapterOutput = join(temporaryRoot, "boards-adapter.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/boards/adapter.ts")],
    outfile: boardsAdapterOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const boardsAdapter = await import(`${pathToFileURL(boardsAdapterOutput).href}?qa=${Date.now()}`);
  const normalizedBomRows = boardsAdapter.adaptBomImportRows([
    { values: [1, "Резистор", "R1", "RC0603", "Yageo", 603, "2,4", "", ""] },
    null,
  ]);
  assert.equal(normalizedBomRows[0].packageName, "0603", "numeric package must preserve the leading zero used by legacy");
  assert.equal(normalizedBomRows[0].quantity, 2, "legacy BOM quantity semantics round to an integer");
  assert.equal(normalizedBomRows.length, 2, "legacy keeps structurally empty imported rows instead of filtering them");
  assert.deepEqual(boardsAdapter.adaptBomImportRows({}), [], "invalid BOM rows payload must fail closed");

  const boardsFixtureOutput = join(temporaryRoot, "boards-fixture.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/boards/fixture.ts")],
    outfile: boardsFixtureOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const { boardsFixture } = await import(`${pathToFileURL(boardsFixtureOutput).href}?qa=${Date.now()}`);
  const adaptedBoards = boardsAdapter.adaptBoards(boardsFixture);
  assert.deepEqual(adaptedBoards.map((board) => [board.id, board.rows.length, board.componentTotal, board.activeComponentTypes]), [
    ["board-control", 4, 16, 4],
    ["board-power", 0, 0, 0],
  ], "Boards adapter must preserve rows and legacy component totals");
  assert.equal(adaptedBoards[0].headers[3], "Артикул производителя", "known legacy BOM header typo must normalize");
  assert.deepEqual(boardsAdapter.adaptBoards({ bomLists: [{ id: "", name: "invalid" }, null] }), [], "invalid Boards records must fail closed");

  const boardsViewModelOutput = join(temporaryRoot, "boards-view-model.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/boards/view-model.ts")],
    outfile: boardsViewModelOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const boardsViewModel = await import(`${pathToFileURL(boardsViewModelOutput).href}?qa=${Date.now()}`);
  assert.equal(boardsViewModel.formatBomCell(0), "0", "zero quantity must remain visible like the legacy input value");
  assert.equal(boardsViewModel.formatBomCell(""), "", "empty BOM cells must remain blank like the legacy input value");
  assert.equal(boardsViewModel.resolveVisibleBoard(adaptedBoards, "missing")?.id, "board-control");
  assert.match(boardsViewModel.getBoardSidebarMeta(adaptedBoards[1]), /Черновик$/);
  const legacyCounterOnlyBoard = boardsAdapter.adaptBoards({ bomLists: [{ id: "legacy-counts", name: "Legacy", c0603: 12 }] })[0];
  assert.equal(legacyCounterOnlyBoard.componentTotal, 12, "adapter must preserve old component counters for downstream compatibility");
  assert.equal(boardsViewModel.getVisibleComponentTotal(legacyCounterOnlyBoard), 0, "Boards UI must keep the legacy zero badge when importRows are absent");

  const { createProductsRenderModule } = await import(`${pathToFileURL(join(repositoryRoot, "src/modules/products/render.js")).href}?qa=${Date.now()}`);
  const legacyProductsModule = createProductsRenderModule({
    BOM_COMPONENT_FIELDS: boardsAdapter.BOM_COMPONENT_FIELDS.map((field) => ({ ...field, componentId: `ct-${field.key}` })),
    BOM_IMPORT_COLUMN_COUNT: boardsAdapter.BOM_IMPORT_HEADERS.length,
    BOM_IMPORT_FALLBACK_HEADERS: boardsAdapter.BOM_IMPORT_HEADERS,
    getDirectoryState: () => boardsFixture,
    getPlanningState: () => ({ routes: [] }),
    getUi: () => ({ activeBomId: "board-control" }),
  });
  const firstLegacyBoard = boardsFixture.bomLists[0];
  const legacyBomRows = legacyProductsModule.getBomImportRows(firstLegacyBoard);
  const classifyLegacyRow = (row) => {
    const combined = `${row.package || ""} ${row.description || ""}`.toLocaleLowerCase("ru-RU").replace(/[.,\s]/g, "").replace(/ё/g, "е");
    if (combined.includes("0402")) return "c0402";
    if (combined.includes("0603")) return "c0603";
    if (combined.includes("0805") || combined.includes("2012")) return "c0805";
    if (["sot23", "sot223", "sod"].some((token) => combined.includes(token))) return "csot23";
    if (["soic", "tssop", "ssop", "so16", "hsop"].some((token) => combined.includes(token))) return "csoic";
    if (["qfn", "dfn", "lga"].some((token) => combined.includes(token))) return "cqfn";
    if (combined.includes("bga")) return "cbga";
    return "cconnector";
  };
  const getLegacyComponentCounts = (board) => {
    const rows = legacyProductsModule.getBomImportRows(board);
    const counts = Object.fromEntries(boardsAdapter.BOM_COMPONENT_FIELDS.map((field) => [field.key, 0]));
    if (rows.length) rows.forEach((row) => { counts[classifyLegacyRow(row)] += Number(row.quantity || 0); });
    else boardsAdapter.BOM_COMPONENT_FIELDS.forEach((field) => { counts[field.key] = Math.max(0, Math.round(Number(board[field.key] || 0))); });
    return counts;
  };
  const getLegacyBomHeaders = (board) => Array.from({ length: boardsAdapter.BOM_IMPORT_HEADERS.length }, (_, index) => {
    const label = String(board.importHeaders?.[index] || boardsAdapter.BOM_IMPORT_HEADERS[index]).trim();
    return label.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ") === "аритикул производителя" ? "Артикул производителя" : label;
  });
  const legacyBoardsHtml = renderNomenclatureModulePage({
    BOARD_BOM_TERM: "BOM платы",
    BOARD_SPEC_LIST_TERM: "Платы",
    BOM_COMPONENT_FIELDS: boardsAdapter.BOM_COMPONENT_FIELDS.map((field) => ({ ...field, componentId: `ct-${field.key}` })),
    BOM_IMPORT_COLUMN_COUNT: boardsAdapter.BOM_IMPORT_HEADERS.length,
    BOM_IMPORT_FALLBACK_HEADERS: boardsAdapter.BOM_IMPORT_HEADERS,
    NOMENCLATURE_REA_COMPONENT_TYPE: "РЭА компоненты",
    directoryState: { ...boardsFixture, nomenclature: [], nomenclatureTypes: [] },
    escapeAttribute: escapeLegacyText,
    escapeHtml: escapeLegacyText,
    getActiveBomForModule: () => firstLegacyBoard,
    getActiveNomenclaturePane: () => "boards",
    getBomComponentCounts: getLegacyComponentCounts,
    getBomComponentFieldCounts: (counts) => Object.fromEntries(boardsAdapter.BOM_COMPONENT_FIELDS.map((field) => [field.key, counts[field.key] ?? counts[`ct-${field.key}`] ?? 0])),
    getBomImportHeaders: getLegacyBomHeaders,
    getBomImportRows: (board) => legacyProductsModule.getBomImportRows(board),
    getNomenclatureTypeCounts: () => ({}),
    getNomenclatureTypeFilterValue: () => "all",
    getNomenclatureTypeOptions: () => [],
    getReaNomenclatureItems: () => [],
    icon: () => "",
    renderDenseInlineSelect: () => "<select></select>",
    renderUiActionButton: ({ label = "", attributes = "" }) => `<button ${attributes}>${escapeLegacyText(label)}</button>`,
    renderUiActionFileLabel: ({ label = "" }) => `<label>${escapeLegacyText(label)}</label>`,
    renderUiEmptyState: ({ title = "", text = "" }) => `<div>${escapeLegacyText(title)}${escapeLegacyText(text)}</div>`,
    renderUiFilterBar: ({ body = "" }) => body,
    renderUiFormActions: ({ actions = "" }) => actions,
    renderUiFormField: ({ control = "" }) => control,
    renderUiFormGrid: ({ body = "" }) => body,
    renderUiModuleHeader: ({ title = "", description = "" }) => `<header><h1>${escapeLegacyText(title)}</h1><p>${escapeLegacyText(description)}</p></header>`,
    renderUiModulePage: ({ sidebar = "", header = "", content = "" }) => `<main>${sidebar}${header}${content}</main>`,
    renderUiModuleSidebar: ({ body = "" }) => `<aside>${body}</aside>`,
    renderUiPanel: ({ body = "" }) => `<section>${body}</section>`,
    renderUiPanelBody: ({ body = "" }) => body,
    renderUiSidebarItem: ({ title = "", meta = "", badge = "", attributes = "" }) => `<button ${attributes}><span>${escapeLegacyText(title)}</span><small>${escapeLegacyText(meta)}</small><b>${escapeLegacyText(badge)}</b></button>`,
    renderUiTableWrap: ({ body = "" }) => `<div>${body}</div>`,
    ui: { activeBomId: firstLegacyBoard.id },
  });
  const legacyBoardTable = legacyBoardsHtml.match(/<table class="directory-table bom-import-table">([\s\S]*?)<\/table>/)?.[1] || "";
  assert.ok(legacyBoardTable, "actual legacy Boards/BOM table must render");
  const legacyBoardHeaders = [...legacyBoardTable.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((match) => decodeLegacyText(match[1]));
  assert.deepEqual(legacyBoardHeaders.slice(0, -1), adaptedBoards[0].headers, "React BOM headers must match the actual legacy order");
  assert.equal(legacyBoardHeaders.at(-1), "Действия", "legacy BOM write column must remain outside the read-only React slice");
  const legacyBoardBody = legacyBoardTable.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || "";
  const legacyBoardRows = [...legacyBoardBody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => (
    [...match[1].matchAll(/<input[\s\S]*?value="([^"]*)"[\s\S]*?\/>/g)].map((cell) => decodeLegacyText(cell[1]))
  ));
  assert.deepEqual(legacyBoardRows, adaptedBoards[0].rows.map((row) => row.values.map(String)), "React BOM rows must preserve actual legacy visible data and order");
  const legacyBoardButtons = [...legacyBoardsHtml.matchAll(/<button data-bom-open="([^"]+)"[^>]*>[\s\S]*?<b>([^<]*)<\/b><\/button>/g)].map((match) => [match[1], decodeLegacyText(match[2])]);
  assert.deepEqual(legacyBoardButtons, adaptedBoards.map((board) => [board.id, String(board.rows.length ? board.componentTotal : 0)]), "React board list must preserve legacy badge totals");
  assert.deepEqual(legacyBomRows.map((row) => row.values.map(String)), adaptedBoards[0].rows.map((row) => row.values.map(String)), "React adapter must match the actual legacy BOM row normalizer");

  const componentTypesAdapterOutput = join(temporaryRoot, "component-types-adapter.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/component-types/adapter.ts")],
    outfile: componentTypesAdapterOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const { adaptComponentTypes } = await import(`${pathToFileURL(componentTypesAdapterOutput).href}?qa=${Date.now()}`);
  const componentTypes = adaptComponentTypes({ componentTypes: [
    { id: "ct-valid", name: "QFN", package: "QFN", family: "Микросхемы", coefficient: 0.06, placementsPerHour: 5500.9, setupSeconds: 34.8, defaultCount: 1.7, status: "Активен" },
    { id: "", name: "Missing id" },
    null,
  ] });
  assert.deepEqual(componentTypes, [{
    id: "ct-valid",
    name: "QFN",
    packageName: "QFN",
    family: "Микросхемы",
    coefficient: 0.06,
    placementsPerHour: 5500,
    setupSeconds: 34,
    defaultCount: 1,
    statusLabel: "Активен",
    statusTone: "success",
  }]);
  assert.deepEqual(adaptComponentTypes({ componentTypes: {} }), [], "invalid component-types payload must fail closed");

  const componentTypesViewModelOutput = join(temporaryRoot, "component-types-view-model.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/component-types/view-model.ts")],
    outfile: componentTypesViewModelOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const componentTypesViewModel = await import(`${pathToFileURL(componentTypesViewModelOutput).href}?qa=${Date.now()}`);
  assert.deepEqual(componentTypesViewModel.buildComponentTypeFilters(componentTypes).map((entry) => [entry.label, entry.count]), [["Все типы", 1], ["Микросхемы", 1]]);
  assert.equal(componentTypesViewModel.filterComponentTypes(componentTypes, "Дискреты").length, 0);
  assert.equal(componentTypesViewModel.resolveVisibleComponentType(componentTypes, "missing")?.id, "ct-valid");
  assert.match(componentTypesViewModel.formatInteger(64400), /64[^\d]?400/);

  const selectionOutput = join(temporaryRoot, "selection.mjs");
  await build({
    entryPoints: [join(sourceRoot, "ui/selection.ts")],
    outfile: selectionOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const { resolveAvailableFilter } = await import(`${pathToFileURL(selectionOutput).href}?qa=${Date.now()}`);
  assert.equal(resolveAvailableFilter(["all", "Микросхемы"], "Микросхемы", "all"), "Микросхемы");
  assert.equal(resolveAvailableFilter(["all", "Крупные"], "Микросхемы", "all"), "all", "removed filter must fall back to all");

  const activationPolicyOutput = join(temporaryRoot, "activation-policy.mjs");
  await build({
    entryPoints: [join(sourceRoot, "activation-policy.ts")],
    outfile: activationPolicyOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const { resolveNomenclatureActivation } = await import(`${pathToFileURL(activationPolicyOutput).href}?qa=${Date.now()}`);
  assert.deepEqual(resolveNomenclatureActivation({ featureFlagEnabled: false, activePane: "items", accessMode: "read-only-evaluation" }), { activateReact: false, reason: "disabled" });
  assert.deepEqual(resolveNomenclatureActivation({ featureFlagEnabled: true, activePane: "boards", accessMode: "read-only-evaluation" }), { activateReact: false, reason: "unsupported-scope" });
  assert.deepEqual(resolveNomenclatureActivation({ featureFlagEnabled: true, activePane: "items", accessMode: "editor" }), { activateReact: false, reason: "write-parity-incomplete" });
  assert.deepEqual(resolveNomenclatureActivation({ featureFlagEnabled: true, activePane: "items", accessMode: "read-only-evaluation" }), { activateReact: true, reason: "eligible" });

  const featureGateOutput = join(temporaryRoot, "feature-gate.mjs");
  await build({
    entryPoints: [join(sourceRoot, "feature-gate.ts")],
    outfile: featureGateOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const { createReactIslandFeatureGate } = await import(`${pathToFileURL(featureGateOutput).href}?qa=${Date.now()}`);
  const scheduledFallbacks = [];
  const featureEvents = [];
  let reportIslandError = null;
  const featureGate = createReactIslandFeatureGate({
    enabled: true,
    target: { id: "target" },
    mount(_target, payload, onError) {
      featureEvents.push(["mount", payload]);
      reportIslandError = onError;
      return {
        update(nextPayload) { featureEvents.push(["update", nextPayload]); },
        unmount() { featureEvents.push(["unmount"]); },
      };
    },
    renderLegacy(context) { featureEvents.push(["legacy", context.reason, context.error?.message]); },
    schedule(task) { scheduledFallbacks.push(task); },
  });
  assert.equal(featureGate.activate("initial"), "react");
  assert.equal(featureGate.update("next"), true);
  reportIslandError(new Error("render failed"));
  reportIslandError(new Error("duplicate render failure"));
  assert.equal(scheduledFallbacks.length, 1, "duplicate render errors must schedule one fallback");
  scheduledFallbacks.shift()();
  assert.equal(featureGate.getState(), "legacy");
  assert.deepEqual(featureEvents, [
    ["mount", "initial"],
    ["update", "next"],
    ["unmount"],
    ["legacy", "render-error", "render failed"],
  ]);
  assert.equal(featureGate.update("ignored"), false, "legacy mode must reject React updates");

  const disabledEvents = [];
  const disabledGate = createReactIslandFeatureGate({
    enabled: false,
    target: {},
    mount() { throw new Error("disabled gate must not mount"); },
    renderLegacy(context) { disabledEvents.push(context.reason); },
  });
  assert.equal(disabledGate.activate("payload"), "legacy");
  assert.deepEqual(disabledEvents, ["disabled"]);

  const editorFallbackEvents = [];
  const editorFallbackGate = createReactIslandFeatureGate({
    enabled: false,
    disabledReason: "write-parity-incomplete",
    target: {},
    mount() { throw new Error("editor gate must not mount read-only React"); },
    renderLegacy(context) { editorFallbackEvents.push(context.reason); },
  });
  assert.equal(editorFallbackGate.activate("payload"), "legacy");
  assert.deepEqual(editorFallbackEvents, ["write-parity-incomplete"]);

  const mountFailureEvents = [];
  const mountFailureGate = createReactIslandFeatureGate({
    enabled: true,
    target: {},
    mount() { throw new Error("mount failed"); },
    renderLegacy(context) { mountFailureEvents.push([context.reason, context.error?.message]); },
  });
  assert.equal(mountFailureGate.activate("payload"), "legacy");
  assert.deepEqual(mountFailureEvents, [["mount-error", "mount failed"]]);

  const unsupportedEvents = [];
  const unsupportedGate = createReactIslandFeatureGate({
    enabled: true,
    target: {},
    mount() {
      return {
        update() {},
        unmount() { unsupportedEvents.push("unmount"); },
      };
    },
    renderLegacy(context) { unsupportedEvents.push(context.reason); },
  });
  assert.equal(unsupportedGate.activate("payload"), "react");
  assert.equal(unsupportedGate.requestLegacy("unsupported-scope"), true);
  assert.equal(unsupportedGate.getState(), "legacy");
  assert.equal(unsupportedGate.requestLegacy("unsupported-scope"), false);
  assert.deepEqual(unsupportedEvents, ["unmount", "unsupported-scope"]);

  const updateFailureScheduled = [];
  const updateFailureEvents = [];
  const updateFailureGate = createReactIslandFeatureGate({
    enabled: true,
    target: {},
    mount() {
      return {
        update() { throw new Error("update failed"); },
        unmount() { updateFailureEvents.push("unmount"); },
      };
    },
    renderLegacy(context) { updateFailureEvents.push(`${context.reason}:${context.error?.message}`); },
    schedule(task) { updateFailureScheduled.push(task); },
  });
  assert.equal(updateFailureGate.activate("payload"), "react");
  assert.equal(updateFailureGate.update("next"), false);
  assert.equal(updateFailureScheduled.length, 1);
  updateFailureScheduled.shift()();
  assert.deepEqual(updateFailureEvents, ["unmount", "render-error:update failed"]);

  const sources = await collectSources(sourceRoot);
  const forbiddenPatterns = [
    ["legacy app import", /src\/app\.js/],
    ["runtime-state coupling", /runtime_state/],
    ["direct network call", /\bfetch\s*\(/],
    ["shared-state coupling", /shared-state|bootstrap_snapshot/],
    ["browser persistence", /\blocalStorage\b|\bsessionStorage\b/],
  ];
  for (const path of sources) {
    const source = await readFile(path, "utf8");
    for (const [label, pattern] of forbiddenPatterns) {
      assert.equal(pattern.test(source), false, `${label} is forbidden in ${path}`);
    }
  }

  const requiredMarkers = ["ModulePage", "ModuleHeader", "ModuleSidebar", "ModuleWorkspace", "Panel", "TableWrap", "ActionButton", "SelectableRow", "DetailPanel", "EmptyState", "SystemState", "StatusToken"];
  const uiSource = await readFile(join(sourceRoot, "ui/components.tsx"), "utf8");
  for (const marker of requiredMarkers) {
    assert.match(uiSource, new RegExp(`data-ui-component=[{]?['\"]${marker}`), `missing ${marker} contract marker`);
  }

  const mountSource = await readFile(join(sourceRoot, "mount.tsx"), "utf8");
  assert.match(mountSource, /export function mountReactMigrationIsland/);
  assert.doesNotMatch(mountSource, /document\.|querySelector|appendChild|replaceWith/, "island mount must not manipulate host DOM");

  const runtimeSource = await readFile(join(sourceRoot, "island-runtime.tsx"), "utf8");
  assert.match(runtimeSource, /update\(payload/);
  assert.match(runtimeSource, /unmount\(\)/);
  assert.match(runtimeSource, /onCaughtError/);
  assert.match(runtimeSource, /onUncaughtError/);
  assert.match(runtimeSource, /class IslandErrorBoundary/);
  assert.match(runtimeSource, /function CommitReporter/);
  assert.match(runtimeSource, /try\s*{\s*render\(initialPayload\)/);
  assert.match(runtimeSource, /root\.unmount\(\)/);
  assert.doesNotMatch(runtimeSource, /document\.|querySelector|appendChild|replaceWith/, "island runtime must not manipulate host DOM");

  const nomenclatureIslandSource = await readFile(join(sourceRoot, "nomenclature-island.tsx"), "utf8");
  assert.match(nomenclatureIslandSource, /export function mountNomenclatureReactIsland/);
  assert.match(nomenclatureIslandSource, /onRequestLegacy/);

  const boardsIslandSource = await readFile(join(sourceRoot, "boards-island.tsx"), "utf8");
  assert.match(boardsIslandSource, /export function mountBoardsReactIsland/);

  const mainSource = await readFile(join(sourceRoot, "main.tsx"), "utf8");
  assert.match(mainSource, /lifecycle_qa/);
  assert.match(mainSource, /scenario.*component-types/);
  assert.match(mainSource, /scenarioParam.*boards/);
  assert.match(mainSource, /createReactIslandFeatureGate/);
  assert.match(mainSource, /featureGate\.update\(updatePayload\)/);
  assert.match(mainSource, /featureGate\.dispose\(\)/);
  assert.match(mainSource, /Legacy-интерфейс восстановлен/);
  assert.match(mainSource, /Lifecycle QA render failure/);
  assert.match(mainSource, /reactIslandCommitMs/);
  assert.match(mainSource, /featureGate\.requestLegacy\("unsupported-scope"\)/);
  assert.match(mainSource, /write-parity-incomplete/);
  assert.match(mainSource, /access.*editor/);

  const { stdout: blockedDiff } = await execFileAsync("git", ["diff", "--name-only", baseline, "--", ...blockedPaths], { cwd: repositoryRoot });
  assert.equal(blockedDiff.trim(), "", `migration branch changed blocked paths:\n${blockedDiff}`);

  const { stdout: performanceBudget } = await execFileAsync(process.execPath, [join(labRoot, "performance-budget.mjs")], { cwd: repositoryRoot });
  assert.match(performanceBudget, /"nomenclature"/);
  assert.match(performanceBudget, /"boards"/);

  await execFileAsync(process.execPath, [join(labRoot, "build.mjs")], { cwd: repositoryRoot });
  console.log(`React migration QA passed: ${sources.length} typed sources, adapter boundary, UI markers, stop-list, build.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
