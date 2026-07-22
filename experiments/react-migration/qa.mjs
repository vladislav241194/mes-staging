import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
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
const acceptedPostgresBaseline = "fc71e01de31f573a4e1c0a5510e328630932aee9";
const frozenBackendPrefixes = [
  "db/",
  "ops/postgres/",
  "src/domain/",
  "src/modules/domain_api/",
];
const frozenBackendFiles = new Set([
  "server.js",
]);
const frozenBackendScriptPatterns = [
  /^scripts\/domain-/,
  /^scripts\/.*postgres.*\.mjs$/,
  /^scripts\/shift-execution-/,
  /^scripts\/specifications2-(?:attachment|publish|server-first)/,
];

const packageManifest = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
const typeScriptConfig = JSON.parse(await readFile(join(labRoot, "tsconfig.json"), "utf8"));
assert.equal(typeScriptConfig.compilerOptions?.strict, true, "React migration TypeScript must stay in strict mode");
assert.equal(typeScriptConfig.compilerOptions?.noEmit, true, "React migration typecheck must not write build artifacts");
assert.equal(
  packageManifest.scripts?.["typecheck:react"],
  "tsc -p experiments/react-migration/tsconfig.json",
  "React migration must expose the canonical strict typecheck command",
);
assert.match(
  packageManifest.scripts?.["qa:stabilize"] || "",
  /(?:^|&&\s*)npm run typecheck:react(?:\s*&&|$)/,
  "global stabilization must run the strict React TypeScript gate",
);
assert.equal(
  packageManifest.scripts?.["qa:domain-specifications2-command-authorization"],
  "node scripts/specifications2-command-authorization-qa.mjs",
  "Specifications 2.0 employee/RBAC authorization must remain a named executable QA contract",
);
assert.match(
  packageManifest.scripts?.["qa:domain-migration"] || "",
  /(?:^|&&\s*)npm run qa:domain-specifications2-command-authorization(?:\s*&&|$)/,
  "the Specifications 2.0 authorization contract must remain in the stabilization domain profile",
);
assert.ok(packageManifest.devDependencies?.typescript, "TypeScript compiler must be a pinned project dependency");
assert.ok(packageManifest.devDependencies?.["@types/react"], "React type declarations must be a project dependency");
assert.ok(packageManifest.devDependencies?.["@types/react-dom"], "React DOM type declarations must be a project dependency");

function isFrozenBackendPath(path) {
  return frozenBackendFiles.has(path)
    || frozenBackendPrefixes.some((prefix) => path.startsWith(prefix))
    || frozenBackendScriptPatterns.some((pattern) => pattern.test(path));
}

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
    articleValue: "A-1",
    name: "Valid",
    type: "РЭА компоненты",
    unit: "шт.",
    packageName: "-",
    packageValue: "",
    manufacturer: "-",
    manufacturerValue: "",
    description: "",
    statusLabel: "Активен",
    statusTone: "success",
    baseline: { id: "ok", name: "Valid", type: "РЭА компоненты", article: "A-1" },
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
  assert.equal(readModel.canCreate, false, "create capability must fail closed");
  assert.equal(readModel.canEdit, false, "edit capability must fail closed");
  assert.equal(readModel.canDelete, false, "delete capability must fail closed");
  assert.deepEqual(readModel.deleteUsageById.ok, { specificationsCount: 0, bomRowsCount: 0 }, "missing delete usage must fail closed to zero counts");
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
    ["Печатные платы", 0],
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
    action: "boards",
  }, "Boards sidebar entry must navigate to the separately owned BOM surface");

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
  const boardsCommandModel = boardsAdapter.adaptBoardsModel({
    bomLists: [{ id: "board-qa", name: "QA", importRows: [{ values: [1, "R", "R1", "", "", "0603", 1, "", ""] }] }],
    selectedBoardId: "board-qa",
    bomNomenclatureOptions: [{ id: "rea-qa", label: "Резистор QA", meta: "R-QA · 0603" }, { id: "", label: "invalid" }, null],
    deleteUsageById: { "board-qa": { specificationsCount: 1, bomRowsCount: 1 } },
    capabilities: { createEdit: true, delete: true, bomImport: true, bomRowAdd: true, bomRowEdit: true, bomRowDelete: true },
  });
  assert.equal(boardsCommandModel.canCreateEdit, true);
  assert.equal(boardsCommandModel.selectedBoardId, "board-qa");
  assert.equal(boardsCommandModel.canDelete, true);
  assert.equal(boardsCommandModel.canImportBom, true);
  assert.equal(boardsCommandModel.canAddBomRows, true);
  assert.equal(boardsCommandModel.canEditBomRows, true);
  assert.equal(boardsCommandModel.canDeleteBomRows, true);
  assert.deepEqual(boardsCommandModel.bomNomenclatureOptions, [{ id: "rea-qa", label: "Резистор QA", meta: "R-QA · 0603" }]);
  assert.deepEqual(boardsCommandModel.deleteUsageById["board-qa"], { specificationsCount: 1, bomRowsCount: 1 });
  const boardsFailClosedModel = boardsAdapter.adaptBoardsModel({ bomLists: [], capabilities: { createEdit: "true", delete: "true", bomImport: "true", bomRowAdd: "true", bomRowEdit: "true", bomRowDelete: "true" } });
  assert.equal(boardsFailClosedModel.canCreateEdit, false, "non-boolean Boards write capability must fail closed");
  assert.equal(boardsFailClosedModel.canDelete, false, "non-boolean Boards delete capability must fail closed");
  assert.equal(boardsFailClosedModel.canImportBom, false, "non-boolean BOM import capability must fail closed");
  assert.equal(boardsFailClosedModel.canAddBomRows, false, "non-boolean BOM-row add capability must fail closed");
  assert.equal(boardsFailClosedModel.canEditBomRows, false, "non-boolean BOM-row capability must fail closed");
  assert.equal(boardsFailClosedModel.canDeleteBomRows, false, "non-boolean BOM-row delete capability must fail closed");

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

  const rolesAdapterOutput = join(temporaryRoot, "roles-adapter.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/roles/adapter.ts")],
    outfile: rolesAdapterOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const rolesAdapter = await import(`${pathToFileURL(rolesAdapterOutput).href}?qa=${Date.now()}`);
  assert.deepEqual(rolesAdapter.adaptRoles({ registries: { accessRoles: {} } }).roles, [], "invalid accessRoles registry must fail closed");
  assert.deepEqual(rolesAdapter.adaptRoles({ registries: { accessRoles: [{ id: "", label: "invalid" }] } }).roles, [], "roles without stable ids must fail closed");

  const rolesFixtureOutput = join(temporaryRoot, "roles-fixture.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/roles/fixture.ts")],
    outfile: rolesFixtureOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const { rolesFixture } = await import(`${pathToFileURL(rolesFixtureOutput).href}?qa=${Date.now()}`);
  const rolesModel = rolesAdapter.adaptRoles(rolesFixture);
  assert.equal(rolesModel.canEditMetadata, false, "Roles metadata capability must fail closed");
  assert.equal(rolesModel.canEditGrants, false, "Roles grants capability must fail closed");
  assert.equal(rolesModel.canEditDefaultScope, false, "Roles default-scope capability must fail closed");
  assert.equal(rolesAdapter.adaptRoles({ ...rolesFixture, capabilities: { metadataEdit: true } }).canEditMetadata, true, "Roles metadata capability must be explicit");
  assert.equal(rolesAdapter.adaptRoles({ ...rolesFixture, capabilities: { grantsEdit: true } }).canEditGrants, true, "Roles grants capability must be explicit");
  assert.equal(rolesAdapter.adaptRoles({ ...rolesFixture, capabilities: { defaultScopeEdit: true } }).canEditDefaultScope, true, "Roles default-scope capability must be explicit");
  assert.deepEqual(rolesModel.roles.map((role) => [role.id, role.allowedModuleCount, role.assignedEmployees.length]), [
    ["admin", 4, 1],
    ["master", 2, 1],
    ["auditor", 2, 1],
  ], "Roles adapter must preserve module visibility and explicit assignments");
  assert.deepEqual(rolesModel.roles.find((role) => role.id === "master")?.assignedEmployees[0], {
    id: "employee-master",
    name: "Иванов Сергей",
    personnelNumber: "0105",
    positionLabel: "Мастер участка",
    orgUnitLabel: "Производство",
  }, "role assignment must join canonical employee, position and organization labels");
  const auditorRole = rolesModel.roles.find((role) => role.id === "auditor");
  assert.equal(rolesAdapter.roleAllows(auditorRole, "roles", "print"), true, "read-only role must retain print");
  assert.equal(rolesAdapter.roleAllows(auditorRole, "roles", "edit"), false, "read-only role must deny mutating actions");

  const { createAccessControlService } = await import(`${pathToFileURL(join(repositoryRoot, "src/modules/access_control/service.js")).href}?qa=${Date.now()}`);
  const { toAccessControlAssignments, toAccessControlRoles } = await import(`${pathToFileURL(join(repositoryRoot, "src/modules/system_domains/runtime_adapter.js")).href}?qa=${Date.now()}`);
  const legacyRolesService = createAccessControlService({
    accessRoles: toAccessControlRoles(rolesFixture.item),
    subjectRoleAssignments: toAccessControlAssignments(rolesFixture.item),
    responsibilityScopes: [],
  });
  rolesModel.roles.forEach((role) => {
    rolesModel.modules.forEach((moduleItem) => {
      rolesAdapter.ROLE_ACTIONS.forEach((action) => {
        assert.equal(
          rolesAdapter.roleAllows(role, moduleItem.id, action.id),
          legacyRolesService.grants(role.id, moduleItem.id, action.id),
          `React grant visibility must match the production access-control service for ${role.id}/${moduleItem.id}/${action.id}`,
        );
      });
    });
  });

  const structureAdapterOutput = join(temporaryRoot, "structure-employees-adapter.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/structure-employees/adapter.ts")],
    outfile: structureAdapterOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const structureAdapter = await import(`${pathToFileURL(structureAdapterOutput).href}?qa=${Date.now()}`);
  assert.equal(structureAdapter.formatStructurePersonName("Иванов Иван Иванович"), "Иванов Иван", "employee display name must match the legacy formatter");
  assert.equal(structureAdapter.formatStructurePersonName("John Ronald Reuel Tolkien"), "John Ronald Reuel Tolkien", "non-Russian names must not be shortened");
  assert.deepEqual(structureAdapter.adaptStructureEmployees({ registries: { employees: {} } }).employees, [], "invalid employees registry must fail closed");
  assert.equal(structureAdapter.adaptStructureEmployees({ registries: { employees: [] } }).counts.migrationDiagnostics, null, "unloaded diagnostics must not invent a zero badge");
  assert.equal(structureAdapter.adaptStructureEmployees({ registries: { employees: [] }, migrationDiagnosticsCount: "" }).counts.migrationDiagnostics, null, "blank diagnostics metadata must remain unknown");
  assert.equal(structureAdapter.adaptStructureEmployees({ registries: { employees: [] }, migrationDiagnosticsCount: 0 }).counts.migrationDiagnostics, 0, "an explicit authoritative zero must remain visible");

  const structureFixtureOutput = join(temporaryRoot, "structure-employees-fixture.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/structure-employees/fixture.ts")],
    outfile: structureFixtureOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const { structureEmployeesFixture } = await import(`${pathToFileURL(structureFixtureOutput).href}?qa=${Date.now()}`);
  const structureModel = structureAdapter.adaptStructureEmployees(structureEmployeesFixture);
  assert.equal(structureModel.canArchive, false, "Employees archive capability must fail closed");
  assert.equal(structureAdapter.adaptStructureEmployees({ ...structureEmployeesFixture, capabilities: { archive: true } }).canArchive, true, "Employees archive capability must be explicit");
  assert.deepEqual(structureModel.counts, {
    orgUnits: 2,
    workCenters: 2,
    positions: 3,
    employees: 3,
    equipment: 1,
    responsibilityPolicies: 1,
    migrationDiagnostics: 152,
  });
  assert.deepEqual(structureModel.employees.map((employee) => [employee.id, employee.displayName, employee.statusLabel]), [
    ["EMP-001", "Николаев Ирина", "активно"],
    ["EMP-003", "Петров Алексей", "архив"],
    ["EMP-002", "Степанов Ирина", "активно"],
  ]);
  assert.equal(structureModel.employees[0].employmentLabel, "Мастер отдела · Отдел нанесения влагозащитных покрытий");
  assert.equal(structureModel.employees[0].workCenterLabel, "Влагозащита");

  const structureViewModelOutput = join(temporaryRoot, "structure-employees-view-model.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/structure-employees/view-model.ts")],
    outfile: structureViewModelOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const structureViewModel = await import(`${pathToFileURL(structureViewModelOutput).href}?qa=${Date.now()}`);
  const structureRegistryOptions = structureViewModel.buildStructureRegistryOptions(structureModel);
  assert.deepEqual(structureRegistryOptions.map((option) => [option.id, option.count, option.action]), [
    ["orgUnits", 2, "navigate"],
    ["workCenters", 2, "navigate"],
    ["positions", 3, "navigate"],
    ["employees", 3, "employees"],
    ["equipment", 1, "navigate"],
    ["responsibilityPolicies", 1, "navigate"],
    ["migrationDiagnostics", 152, "navigate"],
  ], "the permanent Structure surface must keep registry navigation inside React");
  assert.equal(structureViewModel.resolveVisibleStructureEmployee(structureModel.employees, "missing")?.id, "EMP-001");

  const { PRODUCTION_STRUCTURE_MATRIX_COLUMNS, PRODUCTION_STRUCTURE_MATRIX_ROWS } = await import(`${pathToFileURL(join(repositoryRoot, "src/production_structure_matrix_data.js")).href}?qa=${Date.now()}`);
  const { migrateLegacySystemDomains } = await import(`${pathToFileURL(join(repositoryRoot, "src/modules/system_domains/service.js")).href}?qa=${Date.now()}`);
  const canonicalMigration = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS, migratedAt: "2026-07-19T00:00:00.000Z" });
  const canonicalStructureModel = structureAdapter.adaptStructureEmployees({
    registries: canonicalMigration.domains.registries,
    migrationDiagnosticsCount: PRODUCTION_STRUCTURE_MATRIX_ROWS.length,
  });
  assert.deepEqual([
    canonicalStructureModel.counts.orgUnits,
    canonicalStructureModel.counts.workCenters,
    canonicalStructureModel.counts.positions,
    canonicalStructureModel.counts.employees,
    canonicalStructureModel.counts.equipment,
    canonicalStructureModel.counts.migrationDiagnostics,
  ], [19, 19, 49, 76, 6, 152], "React adapter must consume the complete canonical migration read-model");
  assert.equal(canonicalStructureModel.employees.length, 76, "no canonical employee may be dropped by the adapter");

  const positionsAdapterOutput = join(temporaryRoot, "structure-positions-adapter.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/structure-positions/adapter.ts")], outfile: positionsAdapterOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const positionsAdapter = await import(`${pathToFileURL(positionsAdapterOutput).href}?qa=${Date.now()}`);
  assert.deepEqual(positionsAdapter.adaptStructurePositions({ registries: { positions: {} } }).positions, [], "invalid positions registry must fail closed");
  const positionsModel = positionsAdapter.adaptStructurePositions(structureEmployeesFixture);
  assert.equal(positionsModel.canArchive, false, "Positions archive capability must fail closed");
  assert.equal(positionsAdapter.adaptStructurePositions({ ...structureEmployeesFixture, capabilities: { archive: true } }).canArchive, true, "Positions archive capability must be explicit");
  assert.deepEqual(positionsModel.positions.map((position) => [position.id, position.kindLabel, position.orgUnitLabel, position.workCenterLabel, position.statusLabel]), [
    ["POS-MASTER", "Мастер", "Отдел нанесения влагозащитных покрытий", "Влагозащита", "активно"],
    ["POS-MANUAL", "Исполнитель", "Отдел ручного монтажа", "Ручной монтаж", "активно"],
    ["POS-COATING", "Исполнитель", "Отдел нанесения влагозащитных покрытий", "Влагозащита", "активно"],
  ]);
  const canonicalPositionsModel = positionsAdapter.adaptStructurePositions({ registries: canonicalMigration.domains.registries, migrationDiagnosticsCount: PRODUCTION_STRUCTURE_MATRIX_ROWS.length });
  assert.equal(canonicalPositionsModel.positions.length, 49, "no canonical position may be dropped by the adapter");

  const positionsViewModelOutput = join(temporaryRoot, "structure-positions-view-model.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/structure-positions/view-model.ts")], outfile: positionsViewModelOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const positionsViewModel = await import(`${pathToFileURL(positionsViewModelOutput).href}?qa=${Date.now()}`);
  assert.equal(positionsViewModel.buildPositionRegistryOptions(positionsModel).find((entry) => entry.id === "positions")?.action, "positions");
  assert.equal(positionsViewModel.resolveVisiblePosition(positionsModel.positions, "missing")?.id, "POS-MASTER");

  const orgUnitsAdapterOutput = join(temporaryRoot, "structure-org-units-adapter.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/structure-org-units/adapter.ts")], outfile: orgUnitsAdapterOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const orgUnitsAdapter = await import(`${pathToFileURL(orgUnitsAdapterOutput).href}?qa=${Date.now()}`);
  assert.deepEqual(orgUnitsAdapter.adaptStructureOrgUnits({ registries: { orgUnits: {} } }).orgUnits, []);
  const orgUnitsModel = orgUnitsAdapter.adaptStructureOrgUnits(structureEmployeesFixture);
  assert.equal(orgUnitsModel.canArchive, false, "Org Units archive capability must fail closed");
  assert.equal(orgUnitsAdapter.adaptStructureOrgUnits({ ...structureEmployeesFixture, capabilities: { archive: true } }).canArchive, true, "Org Units archive capability must be explicit");
  assert.deepEqual(orgUnitsModel.orgUnits.map((orgUnit) => [orgUnit.id, orgUnit.kindLabel, orgUnit.parentOrgUnitLabel, orgUnit.statusLabel]), [["D-COATING", "Отдел", "—", "активно"], ["D-MANUAL", "Отдел", "—", "активно"]]);
  assert.equal(orgUnitsAdapter.adaptStructureOrgUnits({ registries: canonicalMigration.domains.registries }).orgUnits.length, 19, "no canonical org unit may be dropped");

  const workCentersAdapterOutput = join(temporaryRoot, "structure-work-centers-adapter.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/structure-work-centers/adapter.ts")], outfile: workCentersAdapterOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const workCentersAdapter = await import(`${pathToFileURL(workCentersAdapterOutput).href}?qa=${Date.now()}`);
  assert.deepEqual(workCentersAdapter.adaptStructureWorkCenters({ registries: { workCenters: {} } }).workCenters, []);
  const workCentersModel = workCentersAdapter.adaptStructureWorkCenters(structureEmployeesFixture);
  assert.equal(workCentersModel.canArchive, false, "Work Centers archive capability must fail closed");
  assert.equal(workCentersAdapter.adaptStructureWorkCenters({ ...structureEmployeesFixture, capabilities: { archive: true } }).canArchive, true, "Work Centers archive capability must be explicit");
  assert.deepEqual(workCentersModel.workCenters.map((entry) => [entry.id, entry.orgUnitLabel, entry.parentWorkCenterLabel, entry.planningLabel, entry.statusLabel]), [["D-COATING", "Отдел нанесения влагозащитных покрытий", "—", "активно", "активно"], ["D-MANUAL", "Отдел ручного монтажа", "—", "активно", "активно"]]);
  assert.equal(workCentersAdapter.adaptStructureWorkCenters({ registries: canonicalMigration.domains.registries }).workCenters.length, 19, "no canonical work center may be dropped");

  const equipmentAdapterOutput = join(temporaryRoot, "structure-equipment-adapter.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/structure-equipment/adapter.ts")], outfile: equipmentAdapterOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const equipmentAdapter = await import(`${pathToFileURL(equipmentAdapterOutput).href}?qa=${Date.now()}`);
  assert.deepEqual(equipmentAdapter.adaptStructureEquipment({ registries: { equipment: {} } }).equipment, []);
  const equipmentModel = equipmentAdapter.adaptStructureEquipment(structureEmployeesFixture);
  assert.equal(equipmentModel.canArchive, false, "Equipment archive capability must fail closed");
  assert.equal(equipmentAdapter.adaptStructureEquipment({ ...structureEmployeesFixture, capabilities: { archive: true } }).canArchive, true, "Equipment archive capability must be explicit");
  assert.deepEqual(equipmentModel.equipment.map((entry) => [entry.id, entry.workCenterLabel, entry.quantityLabel, entry.scheduleLabel, entry.statusLabel]), [["EQ-001", "Влагозащита", "1", "—", "активно"]]);
  assert.equal(equipmentAdapter.adaptStructureEquipment({ registries: canonicalMigration.domains.registries }).equipment.length, 6, "no canonical equipment may be dropped");

  const policiesAdapterOutput = join(temporaryRoot, "structure-responsibility-policies-adapter.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/structure-responsibility-policies/adapter.ts")], outfile: policiesAdapterOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const policiesAdapter = await import(`${pathToFileURL(policiesAdapterOutput).href}?qa=${Date.now()}`);
  assert.deepEqual(policiesAdapter.adaptStructureResponsibilityPolicies({ registries: { responsibilityPolicies: {} } }).policies, []);
  const policiesModel = policiesAdapter.adaptStructureResponsibilityPolicies(structureEmployeesFixture);
  assert.deepEqual(policiesModel.policies.map((entry) => [entry.id, entry.subjectEmployeeLabel, entry.modeLabel, entry.targetEmployeesLabel]), [["POLICY-001", "Николаев Ирина", "Подразделение", "Степанов Ирина"]]);

  const diagnosticsAdapterOutput = join(temporaryRoot, "structure-migration-diagnostics-adapter.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/structure-migration-diagnostics/adapter.ts")], outfile: diagnosticsAdapterOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const diagnosticsAdapter = await import(`${pathToFileURL(diagnosticsAdapterOutput).href}?qa=${Date.now()}`);
  const diagnosticsModel = diagnosticsAdapter.adaptStructureMigrationDiagnostics({ item: { registries: canonicalMigration.domains.registries }, legacyMatrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS, legacyMatrixColumns: PRODUCTION_STRUCTURE_MATRIX_COLUMNS, migrationReport: canonicalMigration.report });
  assert.equal(diagnosticsModel.rows.length, 152, "all legacy migration rows must cross the typed boundary");
  assert.equal(diagnosticsModel.sourceFieldCount, 51);
  assert.equal(diagnosticsModel.issues.length, 4);
  assert.equal(diagnosticsModel.metrics.sourceRows, 152);
  assert.deepEqual(diagnosticsAdapter.adaptStructureMigrationDiagnostics({}).rows, []);

  const { createProductionStructureMatrixModule } = await import(`${pathToFileURL(join(repositoryRoot, "src/modules/production_structure_matrix/render.js")).href}?qa=${Date.now()}`);
  const registryListeners = new Map();
  const employeesRegistryButton = {
    dataset: { systemDomainRegistry: "employees" },
    addEventListener(type, listener) { registryListeners.set(type, listener); },
    fire(type) { registryListeners.get(type)?.({ currentTarget: this, preventDefault() {} }); },
  };
  const structurePage = {
    querySelector() { return null; },
    querySelectorAll(selector) { return selector === "[data-system-domain-registry]" ? [employeesRegistryButton] : []; },
  };
  const legacyStructureModule = createProductionStructureMatrixModule({
    PRODUCTION_STRUCTURE_MATRIX_COLUMNS,
    PRODUCTION_STRUCTURE_MATRIX_ROWS,
    canEditSystemDomainRegistry: () => false,
    escapeAttribute: escapeLegacyText,
    escapeHtml: escapeLegacyText,
    getApp: () => ({ querySelector: (selector) => selector === ".production-structure-page" ? structurePage : null }),
    getSystemDomainsState: () => structureEmployeesFixture,
    render: () => {},
    renderUiActionButton: ({ label = "", attributes = "" }) => `<button ${attributes}>${escapeLegacyText(label)}</button>`,
    renderUiEmptyState: ({ title = "", text = "" }) => `<div>${escapeLegacyText(title)}${escapeLegacyText(text)}</div>`,
    renderUiFormField: ({ control = "" }) => control,
    renderUiFormGrid: ({ body = "" }) => body,
    renderUiModuleHeader: ({ title = "", description = "" }) => `<header><h1>${escapeLegacyText(title)}</h1><p>${escapeLegacyText(description)}</p></header>`,
    renderUiModulePage: ({ sidebar = "", header = "", content = "" }) => `<main>${sidebar}${header}${content}</main>`,
    renderUiModuleSidebar: ({ body = "" }) => `<aside>${body}</aside>`,
    renderUiPanel: ({ title = "", meta = "", body = "" }) => `<section><h2>${escapeLegacyText(title)}</h2><p>${escapeLegacyText(meta)}</p>${body}</section>`,
    renderUiPanelBody: ({ body = "" }) => body,
    renderUiSidebarItem: ({ title = "", meta = "", badge = "", attributes = "" }) => `<button ${attributes}><span>${escapeLegacyText(title)}</span><small>${escapeLegacyText(meta)}</small><b>${escapeLegacyText(badge)}</b></button>`,
    renderUiStatusToken: (label = "") => `<span>${escapeLegacyText(label)}</span>`,
    renderUiTableControlAttributes: () => "",
    renderUiTableWrap: ({ body = "", attributes = "" }) => `<div ${attributes}>${body}</div>`,
  });
  legacyStructureModule.bindProductionStructureMatrixEvents();
  employeesRegistryButton.fire("click");
  const legacyStructureHtml = legacyStructureModule.renderProductionStructureMatrixPage();
  const legacyEmployeeTable = legacyStructureHtml.match(/<table class="directory-table ui-table production-structure-registry-table">([\s\S]*?)<\/table>/)?.[1] || "";
  assert.ok(legacyEmployeeTable, "actual legacy Structure and Employees table must render");
  const legacyEmployeeHeaders = [...legacyEmployeeTable.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((match) => decodeLegacyText(match[1]));
  assert.deepEqual(legacyEmployeeHeaders.slice(0, -1), structureViewModel.STRUCTURE_EMPLOYEE_READ_COLUMNS, "React employee columns must match the actual legacy order");
  assert.equal(legacyEmployeeHeaders.at(-1), "Действие", "legacy employee command column must remain outside the read-only React slice");
  const legacyEmployeeBody = legacyEmployeeTable.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || "";
  const legacyEmployeeRows = [...legacyEmployeeBody.matchAll(/<tr[^>]*data-system-domain-row="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => {
    const cells = [...match[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]);
    return {
      id: match[1],
      displayName: decodeLegacyText(cells[0].match(/<strong>([\s\S]*?)<\/strong>/)?.[1] || ""),
      stableId: decodeLegacyText(cells[0].match(/<span>([\s\S]*?)<\/span>/)?.[1] || ""),
      cells: [decodeLegacyText(cells[1]), decodeLegacyText(cells[2]), decodeLegacyText(cells[3])],
    };
  });
  assert.deepEqual(legacyEmployeeRows, structureModel.employees.map((employee) => ({
    id: employee.id,
    displayName: employee.displayName,
    stableId: employee.id,
    cells: [employee.personnelNumber, employee.employmentLabel, employee.statusLabel],
  })), "React employees adapter must preserve actual legacy visible rows, identity and order");
  const legacyStructureSidebar = [...legacyStructureHtml.matchAll(/<button[^>]*data-system-domain-registry="([^"]+)"[^>]*>[\s\S]*?<b>([^<]*)<\/b><\/button>/g)].map((match) => [match[1], decodeLegacyText(match[2])]);
  assert.deepEqual(legacyStructureSidebar, structureRegistryOptions.map((option) => [option.id, String(option.count)]), "React registry navigation counts must match the actual legacy sidebar");

  const componentTypesAdapterOutput = join(temporaryRoot, "component-types-adapter.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/component-types/adapter.ts")],
    outfile: componentTypesAdapterOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const { adaptComponentTypes, adaptComponentTypesModel } = await import(`${pathToFileURL(componentTypesAdapterOutput).href}?qa=${Date.now()}`);
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
  assert.deepEqual(adaptComponentTypesModel({ componentTypes: [], capabilities: { createEdit: true, delete: true } }), { items: [], canCreateEdit: true, canDelete: true }, "Component Types adapter must expose only explicit write capabilities");
  assert.deepEqual(adaptComponentTypesModel({ componentTypes: [] }), { items: [], canCreateEdit: false, canDelete: false }, "Component Types write capabilities must fail closed");

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
  assert.equal(componentTypesViewModel.formatDecimal(0.7), "0,7");
  assert.equal(componentTypesViewModel.formatDecimal(0.226), "0,23");

  const operationsAdapterOutput = join(temporaryRoot, "operations-adapter.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/operations/adapter.ts")], outfile: operationsAdapterOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const { adaptOperations, adaptOperationsModel } = await import(`${pathToFileURL(operationsAdapterOutput).href}?qa=${Date.now()}`);
  const operations = adaptOperations({ operations: [
    { id: "op-b", name: "SMT-монтаж", code: "SMT-010", workCenterId: "D3", workCenterLabel: "SMT-монтаж", unitsPerHour: 55, status: "Активен" },
    { id: "", name: "invalid" },
    { id: "op-a", name: "Отмывка", workCenterId: "D3_UW", workCenterLabel: "Отмывка", unitsPerHour: -1, status: "Отключен" },
  ] });
  assert.deepEqual(operations.map((item) => [item.id, item.name, item.workCenterLabel, item.unitsPerHour, item.statusTone]), [
    ["op-b", "SMT-монтаж", "SMT-монтаж", 55, "success"],
    ["op-a", "Отмывка", "Отмывка", 0, "neutral"],
  ]);
  assert.deepEqual(adaptOperations({ operations: {} }), [], "invalid operations payload must fail closed");
  const operationsCommandModel = adaptOperationsModel({ operations: [{ id: "op-b", name: "SMT-монтаж" }], deleteUsageById: { "op-b": { canDelete: true, routeStepsCount: 2, slotsCount: 3, specificationRowsCount: 1 } }, capabilities: { createEdit: true, delete: true } });
  assert.equal(operationsCommandModel.canCreateEdit, true, "explicit Operations write capability must cross the typed adapter");
  assert.equal(operationsCommandModel.canDelete, true, "explicit Operations delete capability must cross the typed adapter");
  assert.deepEqual(operationsCommandModel.deleteUsageById["op-b"], { canDelete: true, routeStepsCount: 2, slotsCount: 3, specificationRowsCount: 1 });
  assert.equal(adaptOperationsModel({ operations: [{ id: "protected", name: "Встроенная" }], capabilities: { delete: true } }).deleteUsageById.protected.canDelete, false, "missing per-row Operations delete authority must fail closed");
  const operationsFailClosed = adaptOperationsModel({ operations: [], capabilities: { createEdit: "true", delete: "true" } });
  assert.equal(operationsFailClosed.canCreateEdit, false, "non-boolean Operations write capability must fail closed");
  assert.equal(operationsFailClosed.canDelete, false, "non-boolean Operations delete capability must fail closed");
  const operationsViewModelOutput = join(temporaryRoot, "operations-view-model.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/operations/view-model.ts")], outfile: operationsViewModelOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const operationsViewModel = await import(`${pathToFileURL(operationsViewModelOutput).href}?qa=${Date.now()}`);
  assert.deepEqual(operationsViewModel.buildOperationFilters(operations).map((entry) => [entry.label, entry.count]), [["Все операции", 2], ["SMT-монтаж", 1], ["Отмывка", 1]]);
  assert.equal(operationsViewModel.filterOperations(operations, "Отмывка")[0]?.id, "op-a");
  assert.equal(operationsViewModel.resolveVisibleOperation(operations, "missing")?.id, "op-b");

  const nomenclatureTypesAdapterOutput = join(temporaryRoot, "nomenclature-types-adapter.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/nomenclature-types/adapter.ts")], outfile: nomenclatureTypesAdapterOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const { adaptNomenclatureTypes, adaptNomenclatureTypesModel } = await import(`${pathToFileURL(nomenclatureTypesAdapterOutput).href}?qa=${Date.now()}`);
  const nomenclatureTypes = adaptNomenclatureTypes({ nomenclatureTypes: [
    { id: "type-rea", name: "РЭА компоненты", code: "REA", description: "Электронные компоненты", status: "Активен" },
    { id: "", name: "invalid" },
    { id: "type-old", name: "Архив", status: "Отключен" },
  ] });
  assert.deepEqual(nomenclatureTypes.map((item) => [item.id, item.code, item.description, item.statusTone]), [
    ["type-rea", "REA", "Электронные компоненты", "success"],
    ["type-old", "—", "—", "neutral"],
  ]);
  assert.deepEqual(adaptNomenclatureTypes({ nomenclatureTypes: {} }), [], "invalid nomenclature-types payload must fail closed");
  const mutableNomenclatureType = { id: "type-deep", name: "Deep", hidden: { tags: ["original"] } };
  const immutableNomenclatureType = adaptNomenclatureTypes({ nomenclatureTypes: [mutableNomenclatureType] })[0];
  mutableNomenclatureType.hidden.tags[0] = "mutated";
  assert.deepEqual(immutableNomenclatureType.baseline.hidden, { tags: ["original"] }, "Nomenclature Type baseline must be a detached deep JSON clone");
  assert(Object.isFrozen(immutableNomenclatureType.baseline) && Object.isFrozen(immutableNomenclatureType.baseline.hidden), "Nomenclature Type baseline must remain deeply immutable");
  const nomenclatureTypesImpactFingerprint = `sha256:${"a".repeat(64)}`;
  const nomenclatureTypesTargetRow = { id: "type-qa", name: "QA", hidden: { preserve: "target" } };
  const nomenclatureTypesFallbackRow = { id: "type-rea", name: "РЭА", hidden: { preserve: true } };
  const nomenclatureTypesCommandModel = adaptNomenclatureTypesModel({
    nomenclatureTypes: [nomenclatureTypesTargetRow, nomenclatureTypesFallbackRow],
    nomenclature: [{ id: "nom-a", type: "QA" }, { id: "nom-b", type: "QA" }],
    specifications: [{ id: "spec-a", structureItems: [{ id: "line-a", nomenclatureType: "QA" }] }],
    deleteUsageById: { "type-qa": {
      itemId: "type-qa",
      expectedRow: nomenclatureTypesTargetRow,
      nomenclatureCount: 2,
      specificationRowsCount: 1,
      fallbackType: "Подменённая подпись",
      fallbackTypeId: "type-rea",
      fallbackExpectedRow: nomenclatureTypesFallbackRow,
      impactFingerprint: nomenclatureTypesImpactFingerprint,
    } },
    capabilities: { createEdit: true, delete: true },
  });
  assert.equal(nomenclatureTypesCommandModel.canCreateEdit, true, "explicit Nomenclature Types write capability must cross the typed adapter");
  assert.equal(nomenclatureTypesCommandModel.canDelete, true, "explicit Nomenclature Types delete capability must cross the typed adapter");
  assert.deepEqual(nomenclatureTypesCommandModel.deleteUsageById["type-qa"], {
    nomenclatureCount: 2,
    specificationRowsCount: 1,
    fallbackType: "РЭА",
    fallbackTypeId: "type-rea",
    expectedRow: nomenclatureTypesTargetRow,
    fallbackExpectedRow: nomenclatureTypesFallbackRow,
    impactFingerprint: nomenclatureTypesImpactFingerprint,
    serverContractReady: true,
  });
  const mismatchedNomenclatureTypesPreview = adaptNomenclatureTypesModel({
    nomenclatureTypes: [nomenclatureTypesTargetRow, nomenclatureTypesFallbackRow],
    nomenclature: [{ id: "nom-a", type: "QA" }],
    specifications: [{ id: "spec-a", structureItems: [] }],
    directoryRevision: 17,
    deleteUsageById: { "type-qa": {
      itemId: "type-qa",
      expectedRow: nomenclatureTypesTargetRow,
      nomenclatureCount: 99,
      specificationRowsCount: 0,
      fallbackType: "Подменённая подпись",
      fallbackTypeId: "type-rea",
      fallbackExpectedRow: nomenclatureTypesFallbackRow,
      impactFingerprint: nomenclatureTypesImpactFingerprint,
    } },
    capabilities: { serverCommandsEnabled: true, canEditNomenclatureTypes: true, canDeleteNomenclatureTypes: true },
  }).deleteUsageById["type-qa"];
  assert.equal(mismatchedNomenclatureTypesPreview.serverContractReady, false, "display counts must match the exact current Directory preview");
  assert.equal(mismatchedNomenclatureTypesPreview.nomenclatureCount, 1, "display counts must be derived from Directory rather than loose payload counters");
  assert.equal(mismatchedNomenclatureTypesPreview.fallbackType, "РЭА", "fallback label must come from the exact fallback baseline rather than loose display text");
  const nomenclatureTypesServerCommandModel = adaptNomenclatureTypesModel({
    nomenclatureTypes: [{ id: "type-qa", name: "QA" }, nomenclatureTypesFallbackRow],
    directoryRevision: 17,
    capabilities: {
      serverCommandsEnabled: true,
      canCreateNomenclatureTypes: true,
      canEditNomenclatureTypes: true,
      canDeleteNomenclatureTypes: true,
    },
  });
  assert.equal(nomenclatureTypesServerCommandModel.canCreateEdit, true, "server owner rights require an exact Directory revision");
  assert.equal(nomenclatureTypesServerCommandModel.canCreate, true);
  assert.equal(nomenclatureTypesServerCommandModel.canEdit, true);
  assert.equal(nomenclatureTypesServerCommandModel.canDelete, true, "server owner delete right must cross only with an exact Directory revision");
  assert.equal(nomenclatureTypesServerCommandModel.directoryRevision, 17);
  const nomenclatureTypesEditOnly = adaptNomenclatureTypesModel({
    nomenclatureTypes: [],
    directoryRevision: 17,
    capabilities: { serverCommandsEnabled: true, canCreateNomenclatureTypes: false, canEditNomenclatureTypes: true, canDeleteNomenclatureTypes: false },
  });
  assert.equal(nomenclatureTypesEditOnly.canCreate, false, "server create right must not be inferred from edit");
  assert.equal(nomenclatureTypesEditOnly.canEdit, true, "server edit right must remain independently usable");
  const nomenclatureTypesMissingRevision = adaptNomenclatureTypesModel({
    nomenclatureTypes: [],
    capabilities: { serverCommandsEnabled: true, canCreateNomenclatureTypes: true, canEditNomenclatureTypes: true, canDeleteNomenclatureTypes: true },
  });
  assert.equal(nomenclatureTypesMissingRevision.canCreateEdit, false, "server writes must fail closed without the shared Directory revision");
  assert.equal(nomenclatureTypesMissingRevision.canDelete, false, "server delete must fail closed without the shared Directory revision");
  const nomenclatureTypesFailClosed = adaptNomenclatureTypesModel({ nomenclatureTypes: [], capabilities: { createEdit: "true", delete: "true" } });
  assert.equal(nomenclatureTypesFailClosed.canCreateEdit, false, "non-boolean Nomenclature Types write capability must fail closed");
  assert.equal(nomenclatureTypesFailClosed.canDelete, false, "non-boolean Nomenclature Types delete capability must fail closed");
  const nomenclatureTypesViewModelOutput = join(temporaryRoot, "nomenclature-types-view-model.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/nomenclature-types/view-model.ts")], outfile: nomenclatureTypesViewModelOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const nomenclatureTypesViewModel = await import(`${pathToFileURL(nomenclatureTypesViewModelOutput).href}?qa=${Date.now()}`);
  assert.deepEqual(nomenclatureTypesViewModel.buildNomenclatureTypeFilters(nomenclatureTypes).map((entry) => [entry.label, entry.count]), [["Все типы", 2], ["Активен", 1], ["Отключен", 1]]);
  assert.equal(nomenclatureTypesViewModel.filterNomenclatureTypes(nomenclatureTypes, "Отключен")[0]?.id, "type-old");
  assert.equal(nomenclatureTypesViewModel.resolveVisibleNomenclatureType(nomenclatureTypes, "missing")?.id, "type-rea");

  const statusesAdapterOutput = join(temporaryRoot, "statuses-adapter.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/statuses/adapter.ts")], outfile: statusesAdapterOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const { adaptStatuses, adaptStatusesModel } = await import(`${pathToFileURL(statusesAdapterOutput).href}?qa=${Date.now()}`);
  const statuses = adaptStatuses({ statuses: [{ id: "ready", name: "Готов", group: "Документы", code: "ready" }, { id: "custom-status-qa", name: "QA", group: "Документы", code: "qa", statusAuthority: "user" }, { id: "", name: "invalid" }] });
  assert.deepEqual(statuses.map((item) => [item.id, item.name, item.group, item.code, item.isUserManaged]), [["ready", "Готов", "Документы", "ready", false], ["custom-status-qa", "QA", "Документы", "qa", true]]);
  assert.deepEqual(adaptStatuses({ statuses: {} }), []);
  const statusesCommandModel = adaptStatusesModel({ statuses: [], capabilities: { createEditCustom: true, deleteCustom: true } });
  assert.equal(statusesCommandModel.canCreateEditCustom, true);
  assert.equal(statusesCommandModel.canDeleteCustom, true);
  const statusesFailClosed = adaptStatusesModel({ statuses: [], capabilities: { createEditCustom: "true", deleteCustom: "true" } });
  assert.equal(statusesFailClosed.canCreateEditCustom, false, "non-boolean custom Status write capability must fail closed");
  assert.equal(statusesFailClosed.canDeleteCustom, false, "non-boolean custom Status delete capability must fail closed");
  const statusesViewModelOutput = join(temporaryRoot, "statuses-view-model.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/statuses/view-model.ts")], outfile: statusesViewModelOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const statusesViewModel = await import(`${pathToFileURL(statusesViewModelOutput).href}?qa=${Date.now()}`);
  assert.deepEqual(statusesViewModel.buildStatusFilters(statuses).map((entry) => [entry.label, entry.count]), [["Все статусы", 2], ["Документы", 2]]);
  assert.equal(statusesViewModel.resolveVisibleStatus(statuses, "missing")?.id, "ready");

  const specifications2AdapterOutput = join(temporaryRoot, "specifications2-adapter.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/specifications2/adapter.ts")], outfile: specifications2AdapterOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const { adaptSpecifications2Payload } = await import(`${pathToFileURL(specifications2AdapterOutput).href}?qa=${Date.now()}`);
  const specifications2Model = adaptSpecifications2Payload({ model: { serverStatus: "ready", registry: [{ id: "spec-1", title: "Изделие", rowCount: 3, selected: true }], selectedEntry: { id: "spec-1", publicationRevision: 4, serverRevision: { id: "rev-4", sourceEntryId: "spec-1", specificationId: "doc-1", revisionNo: 4, treeItems: [{ sourceRowId: "child", parentSourceRowId: "root", name: "Плата", quantity: 2 }, { sourceRowId: "root", name: "Изделие", quantity: 1 }, { sourceRowId: "leaf", parentSourceRowId: "child", name: "Резистор", quantity: 4 }], routes: [{ sourceDraftId: "route-1", operations: [{}, {}] }] } } } });
  assert.deepEqual(specifications2Model.selectedEntry?.serverRevision?.treeItems.map((item) => [item.id, item.depth]), [["root", 0], ["child", 1], ["leaf", 2]], "Specifications 2.0 adapter must derive hierarchy from PostgreSQL parent ids, not response ordering");
  assert.equal(specifications2Model.selectedEntry?.serverRevision?.operationCount, 2, "Specifications 2.0 adapter must preserve published route operation totals");
  assert.deepEqual(adaptSpecifications2Payload({}).registry, [], "invalid Specifications 2.0 payload must fail closed");

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
  const { resolveNomenclatureActivation, resolveReadOnlyScenarioActivation } = await import(`${pathToFileURL(activationPolicyOutput).href}?qa=${Date.now()}`);
  assert.deepEqual(resolveNomenclatureActivation({ featureFlagEnabled: false, activePane: "items", accessMode: "read-only-evaluation" }), { activateReact: false, reason: "disabled" });
  assert.deepEqual(resolveNomenclatureActivation({ featureFlagEnabled: true, activePane: "boards", accessMode: "read-only-evaluation" }), { activateReact: false, reason: "unsupported-scope" });
  assert.deepEqual(resolveNomenclatureActivation({ featureFlagEnabled: true, activePane: "items", accessMode: "editor" }), { activateReact: false, reason: "write-parity-incomplete" });
  assert.deepEqual(resolveNomenclatureActivation({ featureFlagEnabled: true, activePane: "items", accessMode: "read-only-evaluation" }), { activateReact: true, reason: "eligible" });
  assert.deepEqual(resolveReadOnlyScenarioActivation({ featureFlagEnabled: false, accessMode: "read-only-evaluation" }), { activateReact: false, reason: "disabled" });
  assert.deepEqual(resolveReadOnlyScenarioActivation({ featureFlagEnabled: true, accessMode: "editor" }), { activateReact: false, reason: "write-parity-incomplete" });
  assert.deepEqual(resolveReadOnlyScenarioActivation({ featureFlagEnabled: true, accessMode: "read-only-evaluation", supportedScope: false }), { activateReact: false, reason: "unsupported-scope" });
  assert.deepEqual(resolveReadOnlyScenarioActivation({ featureFlagEnabled: true, accessMode: "read-only-evaluation" }), { activateReact: true, reason: "eligible" });

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

  const weeklyControlOutput = join(temporaryRoot, "weekly-production-control.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/weekly-production-control/adapter.ts")],
    outfile: weeklyControlOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const weeklyControlAdapter = await import(`${pathToFileURL(weeklyControlOutput).href}?qa=${Date.now()}`);
  const weeklyFixtureOutput = join(temporaryRoot, "weekly-production-control-fixture.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/weekly-production-control/fixture.ts")],
    outfile: weeklyFixtureOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const { weeklyProductionControlFixture } = await import(`${pathToFileURL(weeklyFixtureOutput).href}?qa=${Date.now()}`);
  const weeklyControlModel = weeklyControlAdapter.adaptWeeklyProductionControl(weeklyProductionControlFixture);
  assert.equal(weeklyControlModel.canActivate, true, "Weekly Control needs an exact seven-day model");
  assert.deepEqual(weeklyControlModel.groups.map((group) => [group.id, group.days.length, group.totalPlan, group.totalFact]), [
    ["assembly::line-1", 7, 100, 100],
    ["smt::dek", 7, 500, 494],
  ], "Weekly Control adapter must preserve group order and daily density");
  const weeklyDeviationNote = weeklyControlModel.groups[0].days.find((day) => day.note)?.note;
  assert(weeklyDeviationNote?.title.includes("Отклонение") && weeklyDeviationNote.text === "Причина проверяется", "Weekly Control adapter must preserve the owner-prepared deviation note contract");
  assert.equal(weeklyControlAdapter.formatWeeklyControlQuantity(12.6, "шт."), "13 шт.");
  assert.equal(weeklyControlAdapter.formatWeeklyControlPercent(5.5), "+6%");
  assert.deepEqual(weeklyControlAdapter.adaptWeeklyProductionControl({}).groups, [], "invalid Weekly Control payload must fail closed");

  const timesheetOutput = join(temporaryRoot, "timesheet.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/timesheet/adapter.ts")], outfile: timesheetOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const timesheetAdapter = await import(`${pathToFileURL(timesheetOutput).href}?qa=${Date.now()}`);
  const timesheetFixtureOutput = join(temporaryRoot, "timesheet-fixture.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/timesheet/fixture.ts")], outfile: timesheetFixtureOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const { timesheetFixture } = await import(`${pathToFileURL(timesheetFixtureOutput).href}?qa=${Date.now()}`);
  const timesheetModel = timesheetAdapter.adaptTimesheet(timesheetFixture);
  assert.equal(timesheetModel.canActivate, true, "Timesheet needs one cell per employee and visible day");
  assert.deepEqual([timesheetModel.employeeCount, timesheetModel.departmentCount, timesheetModel.days.length], [3, 2, 7]);
  assert.deepEqual(timesheetModel.groups.map((group) => [group.department, group.employees.length]), [["Отдел ручного монтажа", 2], ["Склад", 1]]);
  assert.equal(timesheetModel.groups[0].employees[0].cells[2].overtime, 2, "Timesheet adapter must preserve overtime facts");
  const editableTimesheetModel = timesheetAdapter.adaptTimesheet({ ...timesheetFixture, capabilities: { attendanceEdit: true, editableEmployeeIds: ["employee-1"], attendanceEventKeys: ["employee-1|2026-07-15"] } });
  assert.equal(editableTimesheetModel.canEditAttendance, true, "Timesheet write payload must expose the bounded attendance capability");
  assert.equal(editableTimesheetModel.groups[0].employees[0].canEditAttendance, true, "Timesheet employee capability must stay explicit");
  assert.equal(editableTimesheetModel.groups[0].employees[0].cells[2].hasAttendanceEvent, true, "Timesheet reset must only target an explicit attendance event");
  assert.equal(timesheetAdapter.formatTimesheetHours(7.25), "7,25");
  assert.deepEqual(timesheetAdapter.adaptTimesheet({}).groups, [], "invalid Timesheet payload must fail closed");

  const planningWorkbenchOutput = join(temporaryRoot, "planning-workbench.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/planning-workbench/adapter.ts")], outfile: planningWorkbenchOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const planningWorkbenchAdapter = await import(`${pathToFileURL(planningWorkbenchOutput).href}?qa=${Date.now()}`);
  const planningWorkbenchFixtureOutput = join(temporaryRoot, "planning-workbench-fixture.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/planning-workbench/fixture.ts")], outfile: planningWorkbenchFixtureOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const { planningWorkbenchFixture } = await import(`${pathToFileURL(planningWorkbenchFixtureOutput).href}?qa=${Date.now()}`);
  const planningWorkbenchModel = planningWorkbenchAdapter.adaptPlanningWorkbench(planningWorkbenchFixture);
  assert.equal(planningWorkbenchModel.canActivate, true, "Planning Workbench needs queue, five readiness metrics and structure rows");
  assert.equal(planningWorkbenchModel.canEditQuantity, false, "Planning quantity capability must fail closed");
  assert.equal(planningWorkbenchAdapter.adaptPlanningWorkbench({ ...planningWorkbenchFixture, capabilities: { quantityEdit: true } }).canEditQuantity, true, "Planning quantity capability must be explicit");
  assert.deepEqual([planningWorkbenchModel.queue.length, planningWorkbenchModel.metrics.length, planningWorkbenchModel.rows.length], [3, 5, 4]);
  assert.deepEqual(planningWorkbenchModel.rows.map((row) => [row.kind, row.title, row.quantity]), [["task", "Контроллер КТ-7", 120], ["step", "Монтаж компонентов", 120], ["step", "Оптический контроль", 120], ["task", "Корпус КТ-7", 120]]);
  assert.equal(planningWorkbenchAdapter.adaptPlanningWorkbench({}).canActivate, false, "invalid Planning Workbench payload must fail closed");

  const shiftWorkOrdersOutput = join(temporaryRoot, "shift-work-orders.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/shift-work-orders/adapter.ts")], outfile: shiftWorkOrdersOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const shiftWorkOrdersAdapter = await import(`${pathToFileURL(shiftWorkOrdersOutput).href}?qa=${Date.now()}`);
  const shiftWorkOrdersFixtureOutput = join(temporaryRoot, "shift-work-orders-fixture.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/shift-work-orders/fixture.ts")], outfile: shiftWorkOrdersFixtureOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const { shiftWorkOrdersFixture, shiftWorkOrdersPrintPackageFixture } = await import(`${pathToFileURL(shiftWorkOrdersFixtureOutput).href}?qa=${Date.now()}`);
  const shiftWorkOrdersModel = shiftWorkOrdersAdapter.adaptShiftWorkOrders(shiftWorkOrdersFixture);
  assert.equal(shiftWorkOrdersModel.canActivate, true, "Shift Work Orders needs documents, operations, assignments and a selected detail");
  assert.deepEqual([shiftWorkOrdersModel.documents.length, shiftWorkOrdersModel.operationCount, shiftWorkOrdersModel.rows.length], [2, 3, 3]);
  assert.deepEqual(shiftWorkOrdersModel.rows.map((row) => [row.documentNumber, row.status.id, row.issueReportCount]), [["СЗН-1042-01", "issued", 1], ["СЗН-1042-02", "assigned", 0], ["СЗН-1041-01", "closed", 0]]);
  assert.deepEqual(shiftWorkOrdersModel.rows.map((row) => [row.id, row.sourceRowId]), [["a-1", "source-a-1"], ["a-2", "source-a-2"], ["b-1", "source-b-1"]], "Shift Work Orders must preserve source identity separately from the journal row ID");
  const shiftWorkOrdersFactModel = shiftWorkOrdersAdapter.adaptShiftWorkOrders({ ...shiftWorkOrdersFixture, capabilities: { assignmentSave: true, factSave: true }, factContexts: [{ rowId: "a-1", canEdit: true, hasFact: true, actualQuantity: 91, laborMinutes: 240, executorCount: 2, comment: "QA", deviationComment: "" }] });
  assert.equal(shiftWorkOrdersFactModel.canSaveFact, true, "Shift Work Orders fact capability must be explicit");
  assert.equal(shiftWorkOrdersFactModel.canSaveAssignment, true, "Shift Work Orders assignment capability must be explicit");
  assert.deepEqual([shiftWorkOrdersFactModel.rows[0].factEditable, shiftWorkOrdersFactModel.rows[0].actualQuantity, shiftWorkOrdersFactModel.rows[0].laborMinutes, shiftWorkOrdersFactModel.rows[0].executorCount, shiftWorkOrdersFactModel.rows[0].factComment], [true, 91, 240, 2, "QA"], "Shift Work Orders fact context must stay bound to the exact row ID");
  assert.equal(shiftWorkOrdersAdapter.adaptShiftWorkOrders({}).canActivate, false, "invalid Shift Work Orders payload must fail closed");
  const shiftPrintPackage = shiftWorkOrdersAdapter.adaptWorkOrderPrintPackage(shiftWorkOrdersPrintPackageFixture);
  assert.equal(shiftPrintPackage.canActivate, true, "Shift Work Orders print package needs a completed owner model");
  assert.deepEqual([shiftPrintPackage.operations.length, shiftPrintPackage.journalRows.length, shiftPrintPackage.executors.length], [2, 2, 1]);
  assert.deepEqual(shiftPrintPackage.operations.map((row) => [row.operationName, row.plannedQuantity, row.documentCount]), [["Монтаж", 120, 1], ["Контроль", 120, 1]]);
  const shiftWorkOrdersScenarioSource = await readFile(join(sourceRoot, "modules/shift-work-orders/ShiftWorkOrdersScenario.tsx"), "utf8");
  assert.match(shiftWorkOrdersScenarioSource, /data-react-shift-work-order-photo-viewer/);
  assert.match(shiftWorkOrdersScenarioSource, /setActivePhotoId\(report\.photoId\)/);
  assert.doesNotMatch(shiftWorkOrdersScenarioSource, /onRequestLegacy\?\.\(`photo:/);
  assert.doesNotMatch(shiftWorkOrdersScenarioSource, /onRequestLegacy\?\.\(`(?:print|package):/);
  assert.doesNotMatch(shiftWorkOrdersScenarioSource, /onRequestLegacy/, "Shift Work Orders user actions must never request a legacy fallback");
  assert.match(shiftWorkOrdersScenarioSource, /type: "open-workshop"/);
  assert.match(shiftWorkOrdersScenarioSource, /journalRowId: selected\.id, sourceRowId: selected\.sourceRowId/);
  assert.match(shiftWorkOrdersScenarioSource, /onLoadPrintRenderer/);
  assert.match(shiftWorkOrdersScenarioSource, /onLoadFactEditor/);

  const shiftMasterBoardOutput = join(temporaryRoot, "shift-master-board.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/shift-master-board/adapter.ts")], outfile: shiftMasterBoardOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const shiftMasterBoardAdapter = await import(`${pathToFileURL(shiftMasterBoardOutput).href}?qa=${Date.now()}`);
  const shiftMasterBoardFixtureOutput = join(temporaryRoot, "shift-master-board-fixture.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/shift-master-board/fixture.ts")], outfile: shiftMasterBoardFixtureOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const { createShiftMasterBoardFocusFixture, shiftMasterBoardFixture } = await import(`${pathToFileURL(shiftMasterBoardFixtureOutput).href}?qa=${Date.now()}`);
  const shiftMasterBoardModel = shiftMasterBoardAdapter.adaptShiftMasterBoardPayload(shiftMasterBoardFixture);
  const shiftMasterBoardOpenModel = shiftMasterBoardAdapter.adaptShiftMasterBoardPayload(createShiftMasterBoardFocusFixture("open"));
  assert.deepEqual([shiftMasterBoardModel.focus, shiftMasterBoardModel.rows.length, shiftMasterBoardOpenModel.focus, shiftMasterBoardOpenModel.rows.length], ["all", 4, "open", 3], "Shift Master Board focus payload must stay owner-shaped");
  assert.deepEqual([shiftMasterBoardOpenModel.plannedQuantity, shiftMasterBoardOpenModel.assignedQuantity, shiftMasterBoardOpenModel.factQuantity], [320, 160, 50], "Shift Master Board focused KPIs must cross the adapter unchanged");
  assert.equal(shiftMasterBoardModel.canAssign, true, "Shift Master Board assignment capability must fail closed unless the host enables it");
  assert.deepEqual(shiftMasterBoardModel.selectedRow.assignableEmployees.map((employee) => [employee.id, employee.quantity]), [["employee-assigned", 80], ["employee-reserve", 0]], "Shift Master Board assignment rows must preserve current executor quantities");
  const shiftMasterBoardScenarioSource = await readFile(join(sourceRoot, "modules/shift-master-board/ShiftMasterBoardScenario.tsx"), "utf8");
  assert.match(shiftMasterBoardScenarioSource, /data-shift-master-board-date/);
  assert.match(shiftMasterBoardScenarioSource, /data-shift-master-board-master/);
  assert.match(shiftMasterBoardScenarioSource, /data-shift-master-board-focus/);
  assert.match(shiftMasterBoardScenarioSource, /onSelectFocus\?\.\(option\.id\)/);
  assert.match(shiftMasterBoardScenarioSource, /type: "save-assignment"/);
  assert.match(shiftMasterBoardScenarioSource, /data-shift-master-board-assignment/);
  assert.match(shiftMasterBoardScenarioSource, /data-shift-master-board-transfer/);
  assert.match(shiftMasterBoardScenarioSource, /ShiftWorkOrderPrintPreview/);
  assert.doesNotMatch(shiftMasterBoardScenarioSource, /onRequestLegacy\?\.\("focus/);

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

  const requiredMarkers = ["ModulePage", "ModuleHeader", "ModuleSidebar", "ModuleWorkspace", "Panel", "TableWrap", "MetricGrid", "MetricCard", "ActionButton", "SelectableRow", "DetailPanel", "EmptyState", "SystemState", "StatusToken"];
  const uiSource = await readFile(join(sourceRoot, "ui/components.tsx"), "utf8");
  for (const marker of requiredMarkers) {
    assert.match(uiSource, new RegExp(`data-ui-component=[{]?['\"]${marker}`), `missing ${marker} contract marker`);
  }
  assert.match(uiSource, /className="table-wrap ui-table-wrap"/, "React TableWrap must use the production table class");
  assert.match(uiSource, /data-scroll-contract="horizontal-only"/, "React TableWrap must retain explicit horizontal overflow ownership");

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
  assert.match(nomenclatureIslandSource, /onRequestBoards/);
  assert.doesNotMatch(nomenclatureIslandSource, /onRequestLegacy/, "Nomenclature user navigation must not request a generic legacy fallback");

  const boardsIslandSource = await readFile(join(sourceRoot, "boards-island.tsx"), "utf8");
  assert.match(boardsIslandSource, /export function mountBoardsReactIsland/);
  assert.match(boardsIslandSource, /onCommand/);

  const productsEventsSource = await readFile(join(repositoryRoot, "src/modules/products/events.js"), "utf8");
  assert.match(productsEventsSource, /function saveBomCommand/);
  assert.match(productsEventsSource, /function deleteBomCommand/);
  assert.match(productsEventsSource, /getBomImportRows,/, "Board delete command must receive the lazy BOM row owner explicitly");
  const appEventsSource = await readFile(join(repositoryRoot, "src/modules/app_events/service.js"), "utf8");
  assert.match(appEventsSource, /function getRoutesEventsDependencies\(\)[\s\S]*getBomImportRows,/, "App Events must pass the BOM row owner into the lazy Routes bridge");
  assert.match(appEventsSource, /getFallbackNomenclatureType = \(\) => ""/, "App Events must receive the Nomenclature Type fallback owner explicitly");
  assert.match(appEventsSource, /deleteEmployeeSession = async \(\) => \(\{ ok: true, authenticated: false \}\),/, "App Events must fail closed to an inert signed-employee-session cleanup dependency");
  assert.match(appEventsSource, /createAppInteractionsModule\(\{[\s\S]*deleteEmployeeSession,/, "App Events must pass signed employee-session cleanup to the canonical global-navigation owner");
  const appInteractionsSource = await readFile(join(repositoryRoot, "src/modules/app_interactions/render.js"), "utf8");
  assert.match(appInteractionsSource, /function performAuthLogout\(\)[\s\S]*Promise\.resolve\(deleteEmployeeSession\(\)\)\.catch\(\(\) => \{\}\);[\s\S]*lockAuthGate\(\)/, "canonical global logout must clear server command authority before locking the local gate");
  const authEventsSource = await readFile(join(repositoryRoot, "src/modules/auth_render/events.js"), "utf8");
  assert.match(authEventsSource, /AUTH_PIN_TEMPORARILY_DISABLED\s*&&\s*!isEmployeeAuthRequired\(\)/, "the local no-PIN compatibility path must never bypass required server employee auth");
  assert.match(authEventsSource, /Promise\.resolve\(deleteEmployeeSession\(\)\)\.catch\(\(\) => \{\}\)/, "module-local logout must also clear the signed employee session when it owns the event");
  assert.match(productsEventsSource, /getSpecificationStructureItems\(specification\)\.some\(\(item\) => item\.bomListId === bomId\)/, "Board delete command must report structure references before cleanup");
  assert.match(productsEventsSource, /withDirectoryEntityRemovalAllowed\(\(\) => persistDirectoryState\(\)\)/, "Board delete command must use the existing removal owner");
  assert.match(productsEventsSource, /\.\.\.\(previousBom \|\| \{\}\)/, "Board edit must retain hidden metadata before applying typed fields");
  assert.match(productsEventsSource, /projectId: String\(previousBom\?\.projectId \|\| ""\)/, "Board edit must retain its Specifications project reference");
  assert.match(productsEventsSource, /upsertBomResultToNomenclature\(row, row\.updatedAt\)/);

  const structureEmployeesIslandSource = await readFile(join(sourceRoot, "structure-employees-island.tsx"), "utf8");
  assert.match(structureEmployeesIslandSource, /export function mountStructureEmployeesReactIsland/);
  assert.match(structureEmployeesIslandSource, /onNavigateRegistry/);
  assert.doesNotMatch(structureEmployeesIslandSource, /onRequestLegacy/, "permanent Structure navigation must not request a generic legacy fallback");

  const rolesIslandSource = await readFile(join(sourceRoot, "roles-island.tsx"), "utf8");
  assert.match(rolesIslandSource, /export function mountRolesReactIsland/);

  const componentTypesIslandSource = await readFile(join(sourceRoot, "component-types-island.tsx"), "utf8");
  assert.match(componentTypesIslandSource, /export function mountComponentTypesReactIsland/);
  assert.match(componentTypesIslandSource, /onRequestLegacy/);
  assert.match(componentTypesIslandSource, /onCommand/);

  const operationsIslandSource = await readFile(join(sourceRoot, "operations-island.tsx"), "utf8");
  assert.match(operationsIslandSource, /export function mountOperationsReactIsland/);
  assert.match(operationsIslandSource, /onRequestLegacy/);

  const nomenclatureTypesIslandSource = await readFile(join(sourceRoot, "nomenclature-types-island.tsx"), "utf8");
  assert.match(nomenclatureTypesIslandSource, /export function mountNomenclatureTypesReactIsland/);
  assert.match(nomenclatureTypesIslandSource, /onRequestLegacy/);
  assert.match(nomenclatureTypesIslandSource, /onCommand/);

  const appEventsServiceSource = await readFile(join(repositoryRoot, "src/modules/app_events/service.js"), "utf8");
  assert.match(appEventsServiceSource, /syncNomenclatureTypeRenameInCurrentDirectoryState/);
  assert.match(appEventsServiceSource, /!String\(previousName \|\| ""\)\.trim\(\)/, "Nomenclature Type create must not normalize an empty previous name into the default REA type");
  assert.match(appEventsServiceSource, /options\.customStatusWrite === true/);
  assert.match(appEventsServiceSource, /isUserManagedDirectoryStatus\(rows\[rowIndex\]\)/, "custom Status owner must verify the persisted row rather than trusting command input");

  const statusesIslandSource = await readFile(join(sourceRoot, "statuses-island.tsx"), "utf8");
  assert.match(statusesIslandSource, /export function mountStatusesReactIsland/);
  assert.match(statusesIslandSource, /onRequestLegacy/);
  assert.match(statusesIslandSource, /onCommand/);

  const specifications2IslandSource = await readFile(join(sourceRoot, "specifications2-island.tsx"), "utf8");
  assert.match(specifications2IslandSource, /export function mountSpecifications2ReactIsland/);
  assert.doesNotMatch(specifications2IslandSource, /onRequestLegacy/, "Specifications 2.0 user actions must not request the legacy renderer");

  const mainSource = await readFile(join(sourceRoot, "main.tsx"), "utf8");
  assert.match(mainSource, /lifecycle_qa/);
  assert.match(mainSource, /scenario.*component-types/);
  assert.match(mainSource, /scenarioParam.*boards/);
  assert.match(mainSource, /scenarioParam.*structure-employees/);
  assert.match(mainSource, /scenarioParam.*roles/);
  assert.match(mainSource, /scenarioParam.*operations/);
  assert.match(mainSource, /scenarioParam.*specifications2/);
  assert.match(mainSource, /createReactIslandFeatureGate/);
  assert.match(mainSource, /featureGate\.update\(updatePayload\)/);
  assert.match(mainSource, /featureGate\.dispose\(\)/);
  assert.match(mainSource, /Legacy-интерфейс восстановлен/);
  assert.match(mainSource, /Lifecycle QA render failure/);
  assert.match(mainSource, /reactIslandCommitMs/);
  assert.match(mainSource, /featureGate\.requestLegacy\("unsupported-scope"\)/);
  assert.match(mainSource, /write-parity-incomplete/);
  assert.match(mainSource, /access.*editor/);

  const productionHostModule = await import(`${pathToFileURL(join(repositoryRoot, "src/modules/nomenclature/react_island_host.js")).href}?qa=${Date.now()}`);
  const makeProductionHost = (activation) => productionHostModule.createNomenclatureReactIslandHost({
    getActivation: () => activation,
    getPayload: () => ({}),
    getTargetRoot: () => null,
  });
  assert.deepEqual(
    makeProductionHost({ featureFlagEnabled: false, activePane: "items", accessMode: "read-only-evaluation" }).prepareRender(),
    { activateReact: false, reason: "disabled" },
    "production Nomenclature island must stay disabled by default",
  );
  assert.deepEqual(
    makeProductionHost({ featureFlagEnabled: true, activePane: "boards", accessMode: "read-only-evaluation" }).prepareRender(),
    { activateReact: false, reason: "unsupported-scope" },
    "Boards must remain a separately owned surface",
  );
  assert.deepEqual(
    makeProductionHost({ featureFlagEnabled: true, activePane: "items", accessMode: "editor" }).prepareRender(),
    { activateReact: false, reason: "write-parity-incomplete" },
    "edit-capable Nomenclature sessions must retain legacy commands",
  );
  const eligibleProductionHost = makeProductionHost({ featureFlagEnabled: true, activePane: "items", accessMode: "read-only-evaluation" });
  assert.deepEqual(eligibleProductionHost.prepareRender(), { activateReact: true, reason: "eligible" });
  assert.match(eligibleProductionHost.renderTarget(), /data-react-nomenclature-island/);
  const permanentProductionHost = makeProductionHost({ featureFlagEnabled: true, activePane: "items", accessMode: "react", runtimeMode: "react", serverReadReady: false, serverReadFailure: "" });
  assert.deepEqual(permanentProductionHost.prepareRender(), { activateReact: true, reason: "eligible" }, "permanent Nomenclature must own the route before shared-state readiness");
  assert.match(permanentProductionHost.renderTarget(), /data-react-island-state="loading"/, "permanent Nomenclature must show its bounded loading shell");

  const boardsProductionHostModule = await import(`${pathToFileURL(join(repositoryRoot, "src/modules/nomenclature/boards_react_island_host.js")).href}?qa=${Date.now()}`);
  const makeBoardsProductionHost = (activation) => boardsProductionHostModule.createBoardsReactIslandHost({
    getActivation: () => activation,
    getPayload: () => ({}),
    getTargetRoot: () => null,
  });
  assert.deepEqual(
    makeBoardsProductionHost({ featureFlagEnabled: false, activePane: "boards", accessMode: "read-only-evaluation" }).prepareRender(),
    { activateReact: false, reason: "disabled" },
    "production Boards island must stay disabled by default",
  );
  assert.deepEqual(
    makeBoardsProductionHost({ featureFlagEnabled: true, activePane: "items", accessMode: "read-only-evaluation" }).prepareRender(),
    { activateReact: false, reason: "unsupported-scope" },
    "Boards React must not take over the Nomenclature items pane",
  );
  assert.deepEqual(
    makeBoardsProductionHost({ featureFlagEnabled: true, activePane: "boards", accessMode: "editor" }).prepareRender(),
    { activateReact: false, reason: "write-parity-incomplete" },
    "edit-capable Boards sessions must retain legacy commands",
  );
  const eligibleBoardsProductionHost = makeBoardsProductionHost({ featureFlagEnabled: true, activePane: "boards", accessMode: "read-only-evaluation" });
  assert.deepEqual(eligibleBoardsProductionHost.prepareRender(), { activateReact: true, reason: "eligible" });
  assert.match(eligibleBoardsProductionHost.renderTarget(), /data-react-boards-island/);
  assert.deepEqual(makeBoardsProductionHost({ featureFlagEnabled: true, activePane: "boards", accessMode: "write-evaluation" }).prepareRender(), { activateReact: true, reason: "eligible" }, "Boards must accept only its explicit create/edit evaluation mode in addition to read-only evaluation");

  const structureProductionHostModule = await import(`${pathToFileURL(join(repositoryRoot, "src/modules/production_structure_matrix/react_island_host.js")).href}?qa=${Date.now()}`);
  const makeStructureProductionHost = (activation) => structureProductionHostModule.createStructureEmployeesReactIslandHost({
    getActivation: () => activation,
    getPayload: () => ({}),
    getTargetRoot: () => null,
  });
  assert.deepEqual(
    makeStructureProductionHost({ featureFlagEnabled: false, serverReadReady: true, accessMode: "read-only-evaluation" }).prepareRender(),
    { activateReact: false, reason: "disabled" },
    "production Structure Employees island must stay disabled by default",
  );
  assert.deepEqual(
    makeStructureProductionHost({ featureFlagEnabled: true, serverReadReady: false, accessMode: "read-only-evaluation" }).prepareRender(),
    { activateReact: false, reason: "server-read-pending" },
    "Structure Employees React must wait for the PostgreSQL read model",
  );
  assert.deepEqual(
    makeStructureProductionHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "editor" }).prepareRender(),
    { activateReact: false, reason: "write-parity-incomplete" },
    "edit-capable Structure Employees sessions must retain legacy commands",
  );
  const eligibleStructureProductionHost = makeStructureProductionHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "read-only-evaluation" });
  assert.deepEqual(eligibleStructureProductionHost.prepareRender(), { activateReact: true, reason: "eligible" });
  assert.match(eligibleStructureProductionHost.renderTarget(), /data-react-structure-employees-island/);
  const makeStructurePositionsProductionHost = (activation) => structureProductionHostModule.createStructurePositionsReactIslandHost({ getActivation: () => activation, getPayload: () => ({}), getTargetRoot: () => null });
  assert.deepEqual(makeStructurePositionsProductionHost({ featureFlagEnabled: false, serverReadReady: true, accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "disabled" });
  assert.deepEqual(makeStructurePositionsProductionHost({ featureFlagEnabled: true, serverReadReady: false, accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "server-read-pending" });
  assert.deepEqual(makeStructurePositionsProductionHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "editor" }).prepareRender(), { activateReact: false, reason: "write-parity-incomplete" });
  const eligibleStructurePositionsHost = makeStructurePositionsProductionHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "read-only-evaluation" });
  assert.deepEqual(eligibleStructurePositionsHost.prepareRender(), { activateReact: true, reason: "eligible" });
  assert.match(eligibleStructurePositionsHost.renderTarget(), /data-react-structure-positions-island/);
  const makeStructureOrgUnitsHost = (activation) => structureProductionHostModule.createStructureOrgUnitsReactIslandHost({ getActivation: () => activation, getPayload: () => ({}), getTargetRoot: () => null });
  assert.deepEqual(makeStructureOrgUnitsHost({ featureFlagEnabled: false, serverReadReady: true, accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "disabled" });
  assert.deepEqual(makeStructureOrgUnitsHost({ featureFlagEnabled: true, serverReadReady: false, accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "server-read-pending" });
  assert.deepEqual(makeStructureOrgUnitsHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "editor" }).prepareRender(), { activateReact: false, reason: "write-parity-incomplete" });
  const eligibleStructureOrgUnitsHost = makeStructureOrgUnitsHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "read-only-evaluation" }); assert.deepEqual(eligibleStructureOrgUnitsHost.prepareRender(), { activateReact: true, reason: "eligible" }); assert.match(eligibleStructureOrgUnitsHost.renderTarget(), /data-react-structure-org-units-island/);
  const makeStructureWorkCentersHost = (activation) => structureProductionHostModule.createStructureWorkCentersReactIslandHost({ getActivation: () => activation, getPayload: () => ({}), getTargetRoot: () => null });
  assert.deepEqual(makeStructureWorkCentersHost({ featureFlagEnabled: false, serverReadReady: true, accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "disabled" });
  assert.deepEqual(makeStructureWorkCentersHost({ featureFlagEnabled: true, serverReadReady: false, accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "server-read-pending" });
  assert.deepEqual(makeStructureWorkCentersHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "editor" }).prepareRender(), { activateReact: false, reason: "write-parity-incomplete" });
  const eligibleStructureWorkCentersHost = makeStructureWorkCentersHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "read-only-evaluation" }); assert.deepEqual(eligibleStructureWorkCentersHost.prepareRender(), { activateReact: true, reason: "eligible" }); assert.match(eligibleStructureWorkCentersHost.renderTarget(), /data-react-structure-work-centers-island/);
  const makeStructureEquipmentHost = (activation) => structureProductionHostModule.createStructureEquipmentReactIslandHost({ getActivation: () => activation, getPayload: () => ({}), getTargetRoot: () => null });
  assert.deepEqual(makeStructureEquipmentHost({ featureFlagEnabled: false, serverReadReady: true, accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "disabled" });
  assert.deepEqual(makeStructureEquipmentHost({ featureFlagEnabled: true, serverReadReady: false, accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "server-read-pending" });
  assert.deepEqual(makeStructureEquipmentHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "editor" }).prepareRender(), { activateReact: false, reason: "write-parity-incomplete" });
  const eligibleStructureEquipmentHost = makeStructureEquipmentHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "read-only-evaluation" }); assert.deepEqual(eligibleStructureEquipmentHost.prepareRender(), { activateReact: true, reason: "eligible" }); assert.match(eligibleStructureEquipmentHost.renderTarget(), /data-react-structure-equipment-island/);
  const makeStructureResponsibilityPoliciesHost = (activation) => structureProductionHostModule.createStructureResponsibilityPoliciesReactIslandHost({ getActivation: () => activation, getPayload: () => ({}), getTargetRoot: () => null });
  assert.deepEqual(makeStructureResponsibilityPoliciesHost({ featureFlagEnabled: false, serverReadReady: true, accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "disabled" });
  assert.deepEqual(makeStructureResponsibilityPoliciesHost({ featureFlagEnabled: true, serverReadReady: false, accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "server-read-pending" });
  assert.deepEqual(makeStructureResponsibilityPoliciesHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "editor" }).prepareRender(), { activateReact: false, reason: "write-parity-incomplete" });
  const eligibleStructureResponsibilityPoliciesHost = makeStructureResponsibilityPoliciesHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "read-only-evaluation" }); assert.deepEqual(eligibleStructureResponsibilityPoliciesHost.prepareRender(), { activateReact: true, reason: "eligible" }); assert.match(eligibleStructureResponsibilityPoliciesHost.renderTarget(), /data-react-structure-responsibility-policies-island/);
  const makeStructureMigrationDiagnosticsHost = (activation) => structureProductionHostModule.createStructureMigrationDiagnosticsReactIslandHost({ getActivation: () => activation, getPayload: () => ({}), getTargetRoot: () => null });
  assert.deepEqual(makeStructureMigrationDiagnosticsHost({ featureFlagEnabled: false, serverReadReady: true, accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "disabled" });
  assert.deepEqual(makeStructureMigrationDiagnosticsHost({ featureFlagEnabled: true, serverReadReady: false, accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "server-read-pending" });
  assert.deepEqual(makeStructureMigrationDiagnosticsHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "editor" }).prepareRender(), { activateReact: false, reason: "write-parity-incomplete" });
  const eligibleStructureMigrationDiagnosticsHost = makeStructureMigrationDiagnosticsHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "read-only-evaluation" }); assert.deepEqual(eligibleStructureMigrationDiagnosticsHost.prepareRender(), { activateReact: true, reason: "eligible" }); assert.match(eligibleStructureMigrationDiagnosticsHost.renderTarget(), /data-react-structure-migration-diagnostics-island/);

  const weeklyProductionControlHostModule = await import(`${pathToFileURL(join(repositoryRoot, "src/modules/weekly_production_control/react_island_host.js")).href}?qa=${Date.now()}`);
  const makeWeeklyProductionControlHost = (activation) => weeklyProductionControlHostModule.createWeeklyProductionControlReactIslandHost({ getActivation: () => activation, getPayload: () => ({}), getTargetRoot: () => null });
  assert.deepEqual(makeWeeklyProductionControlHost({ featureFlagEnabled: false, serverReadReady: true, accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "disabled" });
  assert.deepEqual(makeWeeklyProductionControlHost({ featureFlagEnabled: true, serverReadReady: false, accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "server-read-pending" });
  assert.deepEqual(makeWeeklyProductionControlHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "editor" }).prepareRender(), { activateReact: false, reason: "write-parity-incomplete" });
  const eligibleWeeklyProductionControlHost = makeWeeklyProductionControlHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "read-only-evaluation" });
  assert.deepEqual(eligibleWeeklyProductionControlHost.prepareRender(), { activateReact: true, reason: "eligible" });
  assert.match(eligibleWeeklyProductionControlHost.renderTarget(), /data-react-weekly-production-control-island/);
  const permanentWeeklyLoadingHost = makeWeeklyProductionControlHost({ featureFlagEnabled: true, runtimeMode: "react", policyId: "qa-weekly-react", serverReadReady: false, serverReadFailure: "", accessMode: "react" });
  assert.deepEqual(permanentWeeklyLoadingHost.prepareRender(), { activateReact: true, reason: "eligible" }, "permanent Weekly React must own the route while its PostgreSQL read is pending");
  assert.match(permanentWeeklyLoadingHost.renderTarget(), /data-react-island-runtime-mode="react"[\s\S]*data-react-island-state="loading"[\s\S]*role="status"/, "permanent Weekly pending state must remain a React-owned loading shell");
  const permanentWeeklyErrorHost = makeWeeklyProductionControlHost({ featureFlagEnabled: true, runtimeMode: "react", policyId: "qa-weekly-react", serverReadReady: false, serverReadFailure: "compatibility-fallback", accessMode: "react" });
  assert.deepEqual(permanentWeeklyErrorHost.prepareRender(), { activateReact: true, reason: "eligible" }, "permanent Weekly React must own server read failures");
  assert.match(permanentWeeklyErrorHost.renderTarget(), /data-react-island-state="error"[\s\S]*role="alert"[\s\S]*compatibility-fallback/, "permanent Weekly read failure must render a bounded React error surface");
  const permanentWeeklyReadyHost = makeWeeklyProductionControlHost({ featureFlagEnabled: true, runtimeMode: "react", policyId: "qa-weekly-react", serverReadReady: true, serverReadFailure: "", accessMode: "react" });
  assert.deepEqual(permanentWeeklyReadyHost.prepareRender(), { activateReact: true, reason: "eligible" });
  assert.match(permanentWeeklyReadyHost.renderTarget(), /data-react-island-state="loading"/, "ready permanent Weekly must retain its React loading target until the bundle commits");

  const timesheetProductionHostModule = await import(`${pathToFileURL(join(repositoryRoot, "src/modules/timesheet/react_island_host.js")).href}?qa=${Date.now()}`);
  const makeTimesheetProductionHost = (activation) => timesheetProductionHostModule.createTimesheetReactIslandHost({ getActivation: () => activation, getPayload: () => ({}), getTargetRoot: () => null });
  assert.deepEqual(makeTimesheetProductionHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "editor" }).prepareRender(), { activateReact: false, reason: "write-parity-incomplete" });
  assert.deepEqual(makeTimesheetProductionHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "write-evaluation" }).prepareRender(), { activateReact: true, reason: "eligible" });

  const specifications2ProductionHostModule = await import(`${pathToFileURL(join(repositoryRoot, "src/modules/specifications2/react_island_host.js")).href}?qa=${Date.now()}`);
  const makeSpecifications2ProductionHost = (activation) => specifications2ProductionHostModule.createSpecifications2ReactIslandHost({ getActivation: () => activation, getPayload: () => ({}), getTargetRoot: () => null });
  assert.deepEqual(makeSpecifications2ProductionHost({ featureFlagEnabled: false, moduleReady: true, serverReadReady: true, accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "disabled" });
  assert.deepEqual(makeSpecifications2ProductionHost({ featureFlagEnabled: true, moduleReady: false, serverReadReady: false, accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "module-not-ready" });
  assert.deepEqual(makeSpecifications2ProductionHost({ featureFlagEnabled: true, moduleReady: true, serverReadReady: false, accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "postgres-revision-not-confirmed" });
  assert.deepEqual(makeSpecifications2ProductionHost({ featureFlagEnabled: true, moduleReady: true, serverReadReady: true, accessMode: "editor" }).prepareRender(), { activateReact: false, reason: "write-parity-incomplete" });
  const eligibleSpecifications2Host = makeSpecifications2ProductionHost({ featureFlagEnabled: true, moduleReady: true, serverReadReady: true, accessMode: "read-only-evaluation" });
  assert.deepEqual(eligibleSpecifications2Host.prepareRender(), { activateReact: true, reason: "eligible" });
  assert.match(eligibleSpecifications2Host.renderTarget(), /data-react-specifications2-island/);
  const permanentSpecifications2LoadingHost = makeSpecifications2ProductionHost({ featureFlagEnabled: true, runtimeMode: "react", policyId: "qa-specifications2-react", moduleReady: false, serverReadReady: false, serverReadFailure: "", accessMode: "react" });
  assert.deepEqual(permanentSpecifications2LoadingHost.prepareRender(), { activateReact: true, reason: "eligible" }, "permanent Specifications 2.0 must own the route before its model loads");
  assert.match(permanentSpecifications2LoadingHost.renderTarget(), /data-react-island-runtime-mode="react"[\s\S]*data-react-island-state="loading"/);

  const rolesProductionHostModule = await import(`${pathToFileURL(join(repositoryRoot, "src/modules/access_roles/react_island_host.js")).href}?qa=${Date.now()}`);
  const makeRolesProductionHost = (activation) => rolesProductionHostModule.createRolesReactIslandHost({
    getActivation: () => activation,
    getPayload: () => ({}),
    getTargetRoot: () => null,
  });
  assert.deepEqual(
    makeRolesProductionHost({ featureFlagEnabled: false, serverReadReady: true, accessMode: "read-only-evaluation" }).prepareRender(),
    { activateReact: false, reason: "disabled" },
    "production Roles island must stay disabled by default",
  );
  assert.deepEqual(
    makeRolesProductionHost({ featureFlagEnabled: true, serverReadReady: false, accessMode: "read-only-evaluation" }).prepareRender(),
    { activateReact: false, reason: "server-read-pending" },
    "Roles React must wait for the PostgreSQL read model",
  );
  assert.deepEqual(
    makeRolesProductionHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "editor" }).prepareRender(),
    { activateReact: false, reason: "write-parity-incomplete" },
    "edit-capable Roles sessions must retain legacy commands",
  );
  const eligibleRolesProductionHost = makeRolesProductionHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "read-only-evaluation" });
  assert.deepEqual(eligibleRolesProductionHost.prepareRender(), { activateReact: true, reason: "eligible" });
  assert.match(eligibleRolesProductionHost.renderTarget(), /data-react-roles-island/);
  assert.deepEqual(makeRolesProductionHost({ featureFlagEnabled: true, serverReadReady: true, accessMode: "write-evaluation" }).prepareRender(), { activateReact: true, reason: "eligible" }, "Roles metadata write evaluation must use the same bounded host");

  const directoryComponentTypesHostModule = await import(`${pathToFileURL(join(repositoryRoot, "src/modules/directories/react_island_host.js")).href}?qa=${Date.now()}`);
  const makeDirectoryComponentTypesHost = (activation) => directoryComponentTypesHostModule.createDirectoryComponentTypesReactIslandHost({
    getActivation: () => activation,
    getPayload: () => ({}),
    getTargetRoot: () => null,
  });
  assert.deepEqual(
    makeDirectoryComponentTypesHost({ featureFlagEnabled: false, activeSection: "componentTypes", accessMode: "read-only-evaluation" }).prepareRender(),
    { activateReact: false, reason: "disabled" },
    "Directory Component Types island must stay disabled by default",
  );
  assert.deepEqual(
    makeDirectoryComponentTypesHost({ featureFlagEnabled: true, activeSection: "operations", accessMode: "read-only-evaluation" }).prepareRender(),
    { activateReact: false, reason: "unsupported-scope" },
    "other directory sections must remain legacy",
  );
  assert.deepEqual(
    makeDirectoryComponentTypesHost({ featureFlagEnabled: true, activeSection: "componentTypes", accessMode: "editor" }).prepareRender(),
    { activateReact: false, reason: "write-parity-incomplete" },
    "directory editors must retain legacy commands",
  );
  const eligibleDirectoryComponentTypesHost = makeDirectoryComponentTypesHost({ featureFlagEnabled: true, activeSection: "componentTypes", accessMode: "read-only-evaluation" });
  assert.deepEqual(eligibleDirectoryComponentTypesHost.prepareRender(), { activateReact: true, reason: "eligible" });
  assert.match(eligibleDirectoryComponentTypesHost.renderTarget(), /data-react-directory-component-types-island/);
  assert.deepEqual(
    makeDirectoryComponentTypesHost({ featureFlagEnabled: true, activeSection: "componentTypes", accessMode: "write-evaluation" }).prepareRender(),
    { activateReact: true, reason: "eligible" },
    "Component Types must accept only its explicit write-evaluation mode in addition to read-only evaluation",
  );

  const makeDirectoryOperationsHost = (activation) => directoryComponentTypesHostModule.createDirectoryOperationsReactIslandHost({
    getActivation: () => activation,
    getPayload: () => ({}),
    getTargetRoot: () => null,
  });
  assert.deepEqual(
    makeDirectoryOperationsHost({ featureFlagEnabled: false, activeSection: "operations", accessMode: "read-only-evaluation" }).prepareRender(),
    { activateReact: false, reason: "disabled" },
    "Directory Operations island must stay disabled by default",
  );
  assert.deepEqual(
    makeDirectoryOperationsHost({ featureFlagEnabled: true, activeSection: "componentTypes", accessMode: "read-only-evaluation" }).prepareRender(),
    { activateReact: false, reason: "unsupported-scope" },
    "Operations React must not take over other directory sections",
  );
  assert.deepEqual(
    makeDirectoryOperationsHost({ featureFlagEnabled: true, activeSection: "operations", accessMode: "editor" }).prepareRender(),
    { activateReact: false, reason: "write-parity-incomplete" },
    "Operations editors must retain legacy commands",
  );
  const eligibleDirectoryOperationsHost = makeDirectoryOperationsHost({ featureFlagEnabled: true, activeSection: "operations", accessMode: "read-only-evaluation" });
  assert.deepEqual(eligibleDirectoryOperationsHost.prepareRender(), { activateReact: true, reason: "eligible" });
  assert.match(eligibleDirectoryOperationsHost.renderTarget(), /data-react-directory-operations-island/);
  assert.deepEqual(
    makeDirectoryOperationsHost({ featureFlagEnabled: true, activeSection: "operations", accessMode: "write-evaluation" }).prepareRender(),
    { activateReact: true, reason: "eligible" },
    "Operations must accept only its explicit write-evaluation mode in addition to read-only evaluation",
  );

  const makeDirectoryNomenclatureTypesHost = (activation) => directoryComponentTypesHostModule.createDirectoryNomenclatureTypesReactIslandHost({
    getActivation: () => activation,
    getPayload: () => ({}),
    getTargetRoot: () => null,
  });
  assert.deepEqual(
    makeDirectoryNomenclatureTypesHost({ featureFlagEnabled: false, activeSection: "nomenclatureTypes", accessMode: "read-only-evaluation" }).prepareRender(),
    { activateReact: false, reason: "disabled" },
    "Directory Nomenclature Types island must stay disabled by default",
  );
  assert.deepEqual(
    makeDirectoryNomenclatureTypesHost({ featureFlagEnabled: true, activeSection: "operations", accessMode: "read-only-evaluation" }).prepareRender(),
    { activateReact: false, reason: "unsupported-scope" },
    "Nomenclature Types React must not take over other directory sections",
  );
  assert.deepEqual(
    makeDirectoryNomenclatureTypesHost({ featureFlagEnabled: true, activeSection: "nomenclatureTypes", accessMode: "editor" }).prepareRender(),
    { activateReact: false, reason: "write-parity-incomplete" },
    "Nomenclature Types editors must retain legacy commands",
  );
  const eligibleDirectoryNomenclatureTypesHost = makeDirectoryNomenclatureTypesHost({ featureFlagEnabled: true, activeSection: "nomenclatureTypes", accessMode: "read-only-evaluation" });
  assert.deepEqual(eligibleDirectoryNomenclatureTypesHost.prepareRender(), { activateReact: true, reason: "eligible" });
  assert.match(eligibleDirectoryNomenclatureTypesHost.renderTarget(), /data-react-directory-nomenclature-types-island/);
  assert.deepEqual(
    makeDirectoryNomenclatureTypesHost({ featureFlagEnabled: true, activeSection: "nomenclatureTypes", accessMode: "write-evaluation" }).prepareRender(),
    { activateReact: true, reason: "eligible" },
    "Nomenclature Types must accept only its explicit local write-evaluation mode in addition to read-only evaluation",
  );

  const makeDirectoryStatusesHost = (activation) => directoryComponentTypesHostModule.createDirectoryStatusesReactIslandHost({ getActivation: () => activation, getPayload: () => ({}), getTargetRoot: () => null });
  assert.deepEqual(makeDirectoryStatusesHost({ featureFlagEnabled: false, activeSection: "statuses", accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "disabled" });
  assert.deepEqual(makeDirectoryStatusesHost({ featureFlagEnabled: true, activeSection: "operations", accessMode: "read-only-evaluation" }).prepareRender(), { activateReact: false, reason: "unsupported-scope" });
  assert.deepEqual(makeDirectoryStatusesHost({ featureFlagEnabled: true, activeSection: "statuses", accessMode: "editor" }).prepareRender(), { activateReact: false, reason: "write-parity-incomplete" });
  const eligibleDirectoryStatusesHost = makeDirectoryStatusesHost({ featureFlagEnabled: true, activeSection: "statuses", accessMode: "read-only-evaluation" });
  assert.deepEqual(eligibleDirectoryStatusesHost.prepareRender(), { activateReact: true, reason: "eligible" });
  assert.match(eligibleDirectoryStatusesHost.renderTarget(), /data-react-directory-statuses-island/);
  assert.deepEqual(makeDirectoryStatusesHost({ featureFlagEnabled: true, activeSection: "statuses", accessMode: "write-evaluation" }).prepareRender(), { activateReact: true, reason: "eligible" }, "Statuses must accept its explicit local custom-write evaluation mode");

  const productionAppSource = await readFile(join(repositoryRoot, "src/app.js"), "utf8");
  assert.match(productionAppSource, /if \(\["day", "schedule"\]\.includes\(action\)\) openTimesheetEditor\(value, dateKey\);\s*if \(ui\.activeModule === "timesheet"\) render\(\{ skipRememberScroll: true \}\);/, "Timesheet technical island failure must still render the legacy rollback path while day/schedule actions open their legacy editor");
  assert.match(productionAppSource, /isShiftWorkOrdersWorkshopTargetSelected\(decision, getShiftMasterBoardModel\(\)\)/, "Shift Work Orders navigation must verify the exact Workshop owner selection");
  assert.match(productionAppSource, /ui\.shiftMasterBoardSelectedSlotId = previous\.selectedSlotId;\s*ui\.windowStart = previous\.windowStart;\s*ui\.activeDispatchSlotId = previous\.activeDispatchSlotId;/, "Shift Work Orders must restore its previous owner selection when the Workshop source disappears");
  assert.match(productionAppSource, /MES_REACT_NOMENCLATURE === true/);
  assert.match(productionAppSource, /MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /localHosts\.has\(window\.location\.hostname\)/);
  assert.match(productionAppSource, /params\.get\("qa-auth-bypass"\) !== "1"/);
  assert.match(productionAppSource, /params\.get\("react-nomenclature"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-nomenclature-readonly"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-nomenclature-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /params\.get\("qa-auth-bypass"\) === "1" \|\| Boolean\(getAuthenticatedAccessPerson\(\)\)/);
  assert.match(productionAppSource, /serverEvaluationAllowed && isNomenclatureReactEvaluationRequested\(\)/);
  assert.match(productionAppSource, /resolveReactRuntimeActivation\(\{[\s\S]*?surfaceId: "nomenclature"/, "Nomenclature permanent activation must come from the immutable runtime policy");
  assert.match(productionAppSource, /nomenclatureReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /navigateBoards:[\s\S]*?activeNomenclaturePane = "boards"[\s\S]*?updateModuleUrlParam\("bomLists"\)/, "Boards must be a separate navigation target, not a Nomenclature legacy fallback");
  assert.match(productionAppSource, /MES_REACT_BOARDS === true/);
  assert.match(productionAppSource, /MES_REACT_BOARDS_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-boards"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-boards-readonly"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-boards-write"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-boards-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /authorizeSystemDomainAction\("nomenclature", "edit", \{ resourceId: "boards" \}\)/);
  assert.match(productionAppSource, /await ensureNomenclatureRenderModule\(\)/, "Boards write must await its lazy result-Nomenclature owner before mutation");
  assert.match(productionAppSource, /saveBomCommand\(\{/);
  assert.match(productionAppSource, /deleteBomCommand\(\{ bomId:/);
  assert.match(productionAppSource, /command\.type === "import-bom-xlsx"/, "Boards Excel import must retain one typed host branch");
  assert.match(productionAppSource, /await importBomFromXlsxFile\(file\)/, "Boards Excel import must delegate the File to the existing owner");
  assert.match(productionAppSource, /importedBom\.sourceFileName !== fileName \|\| !importedRows\.length/, "Boards Excel import must read the authoritative imported BOM back");
  assert.match(productionAppSource, /command\.type === "add-bom-nomenclature-row"/, "Boards Nomenclature row add must retain one typed host branch");
  assert.match(productionAppSource, /addNomenclatureToBom\(bomId, nomenclatureId\)/, "Boards row add must delegate to the existing owner");
  assert.match(productionAppSource, /authoritativeRows\.length !== rows\.length \+ 1/, "Boards row add must verify exactly one authoritative row");
  assert.match(productionAppSource, /String\(appendedRow\?\.nomenclatureId \|\| ""\) !== nomenclatureId/, "Boards row add must verify the owner-linked Nomenclature identity");
  assert.match(productionAppSource, /command\.type === "update-bom-cell"/, "Boards non-quantity cell edits must retain one typed host branch");
  assert.match(productionAppSource, /editableColumns = \[0, 1, 2, 3, 4, 5, 7, 8\]/, "Boards generic cell command must exclude the separately validated quantity column");
  assert.match(productionAppSource, /updateBomImportCell\(bomId, rowIndex, columnIndex, input\.value\)/, "Boards generic cell edit must delegate to the existing owner");
  assert.match(productionAppSource, /JSON\.stringify\(authoritativeRow\.values\) !== JSON\.stringify\(expectedNextRow\.values\)/, "Boards generic cell edit must read the complete owner row back");
  assert.match(productionAppSource, /command\.type === "delete-bom-row"/, "Boards row delete must retain its own typed host branch");
  assert.match(productionAppSource, /input\.expectedRows/, "Boards row delete must carry a full expected-table snapshot");
  assert.match(productionAppSource, /deleteBomImportRow\(bomId, rowIndex\)/, "Boards row delete must delegate to the existing owner");
  assert.match(productionAppSource, /authoritativeRows\.map\(\(row\) => rowSignature\(row\.values\)\)/, "Boards row delete must read the owner result back");
  assert.match(productionAppSource, /const activeReactHost = useBoardsHost \? boardsReactIslandHost : nomenclatureReactIslandHost/);
  assert.match(productionAppSource, /boardsReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_EMPLOYEES === true/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-structure-employees"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-structure-employees-readonly"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-structure-employees-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /command\.type === "reactivate"/, "Structure Employees reactivation must retain a distinct lifecycle branch");
  assert.match(productionAppSource, /source: "react:structure-employees:reactivate"/, "Structure Employees reactivation must use the existing System Domains owner");
  assert.match(productionAppSource, /authoritativeEmployee\.isActive === false/, "Structure Employees reactivation must read the owner result back");
  assert.match(productionAppSource, /authoritativeEmployee\.archivedAt/, "Structure Employees reactivation must reject a retained archive marker");
  assert.match(productionAppSource, /systemDomainsServerReadState\.status === "server"/);
  assert.match(productionAppSource, /const productionStructureReactHosts = Object\.freeze\(\{ employees: structureEmployeesReactIslandHost, positions: structurePositionsReactIslandHost, orgUnits: structureOrgUnitsReactIslandHost, workCenters: structureWorkCentersReactIslandHost, equipment: structureEquipmentReactIslandHost, responsibilityPolicies: structureResponsibilityPoliciesReactIslandHost, migrationDiagnostics: structureMigrationDiagnosticsReactIslandHost \}\)/, "Every structure registry must retain an independently selectable island host");
  assert.match(productionAppSource, /function getActiveProductionStructureReactHost\(\)/, "Structure runtime must select only the currently active nested registry host");
  assert.match(productionAppSource, /getReactRuntimeMode\("structureEmployees"\) === "evaluation"[\s\S]*?\? "employees"/, "Cold Employees read/write evaluation must retain the Employees nested registry");
  assert.match(productionAppSource, /const PRODUCTION_STRUCTURE_REGISTRY_QUERY_PARAM = "structureRegistry"/, "Structure nested routing must use one canonical query parameter");
  assert.match(productionAppSource, /getProductionStructureMatrixRegistryFromUrl\(\)/, "Structure runtime must restore the canonical nested registry from the URL");
  assert.match(productionAppSource, /if \(getActiveProductionStructureReactHost\(\)\.isReactEligible\(\)\) return;/, "An eligible nested React host must suppress only its own legacy event binding");
  assert.match(productionAppSource, /activeReactHost\.prepareRender\(\)/);
  assert.match(productionAppSource, /structureEmployeesReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /setProductionStructureMatrixActiveRegistry\(registryId\)/, "Structure navigation must preserve the selected typed registry");
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_POSITIONS === true/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_POSITIONS_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-structure-positions"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-structure-positions-readonly"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-structure-positions-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /structurePositionsReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /setProductionStructureMatrixActiveRegistry\(registryId\)/);
  assert.match(productionAppSource, /source: "react:structure-positions:reactivate"/, "Positions reactivation must use the existing System Domains owner");
  assert.match(productionAppSource, /authoritativePosition\.archivedAt/, "Positions reactivation must reject a retained archive marker");
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_ORG_UNITS === true/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_ORG_UNITS_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-structure-org-units-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /structureOrgUnitsReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /source: "react:structure-org-units:reactivate"/, "Org Units reactivation must use the existing System Domains owner");
  assert.match(productionAppSource, /authoritativeOrgUnit\.archivedAt/, "Org Units reactivation must reject a retained archive marker");
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_WORK_CENTERS === true/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_WORK_CENTERS_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-structure-work-centers-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /source: "react:structure-work-centers:reactivate"/, "Work Centers reactivation must use the existing System Domains owner");
  assert.match(productionAppSource, /authoritativeWorkCenter\.archivedAt/, "Work Centers reactivation must reject a retained archive marker");
  assert.match(productionAppSource, /structureWorkCentersReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_EQUIPMENT === true/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_EQUIPMENT_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-structure-equipment-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /source: "react:structure-equipment:reactivate"/, "Equipment reactivation must use the existing System Domains owner");
  assert.match(productionAppSource, /authoritativeEquipment\.archivedAt/, "Equipment reactivation must reject a retained archive marker");
  assert.match(productionAppSource, /structureEquipmentReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES === true/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /structureResponsibilityPoliciesReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS === true/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /resolveReactRuntimeActivation\(\{[\s\S]*?surfaceId: "structureMigrationDiagnostics"/, "Diagnostics activation must derive from the immutable three-mode release policy");
  assert.match(productionAppSource, /function getStructureMigrationDiagnosticsReactReadState\(\)/, "Permanent Diagnostics ownership must wait for both System Domains and the lazy matrix model");
  assert.match(productionAppSource, /systemDomainsServerReadState\.status === "server" && Boolean\(systemDomainsState\) && matrixReady && reportReady/, "Diagnostics readiness must be authoritative and fail closed");
  assert.match(productionAppSource, /if \(systemDomainsServerReadPromise\) return systemDomainsServerReadPromise/, "Concurrent System Domains consumers must await the same authoritative read");
  assert.match(productionAppSource, /systemDomainsServerReadState\.status === "fallback" && systemDomainsServerReadRetryTimer !== null/, "A rendered read error must wait for the scheduled retry instead of starting a sibling fetch loop");
  assert.match(productionAppSource, /productionStructureMatrixData = matrixData/);
  assert.match(productionAppSource, /legacyMatrixRows: productionStructureMatrixData\.PRODUCTION_STRUCTURE_MATRIX_ROWS/);
  assert.match(productionAppSource, /navigateRegistry: \(registryId\) => \{[\s\S]*?setProductionStructureMatrixActiveRegistry/, "Diagnostics registry navigation must use the normal nested-route owner instead of a fallback signal");
  assert.match(productionAppSource, /structureMigrationDiagnosticsReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /MES_REACT_WEEKLY_PRODUCTION_CONTROL === true/);
  assert.match(productionAppSource, /MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-weekly-production-control-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /resolveReactRuntimeActivation\(\{[\s\S]*?surfaceId: "weeklyProductionControl"/, "Weekly activation must derive from the immutable three-mode release policy");
  assert.match(productionAppSource, /getWeeklyProductionControlReactReadState\(\)/, "Weekly permanent ownership must distinguish read loading, failure and readiness");
  assert.match(productionAppSource, /waitingForScheduledReadRetry/, "Weekly read errors must wait for the bounded retry instead of re-entering render immediately");
  assert.match(productionAppSource, /weeklyProductionControlReactIslandHost\.prepareRender\(\)/);
  assert.match(productionAppSource, /weeklyProductionControlReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /if \(!waitingForScheduledReadRetry\) hydrateWeeklyPlanningPeriod\(\);[\s\S]*?weeklyProductionControlReactIslandHost\.prepareRender\(\)[\s\S]*?if \(reactDecision\.activateReact\) return weeklyProductionControlReactIslandHost\.renderTarget\(\);[\s\S]*?ensureProductionStructureMatrixModule\(\);/, "Permanent Weekly must hydrate bounded owners and return its React shell before loading the legacy Structure renderer used only by rollback");
  assert.match(productionAppSource, /projectSystemDomainWorkCenters\(systemDomainsState, \[\]\)/, "Permanent Weekly must project canonical System Domains without a legacy fallback seed");
  assert.match(productionAppSource, /getPayload: \(\) => \(\{ productionInput: getWeeklyProductionControlReadModelInput\(\) \}\)/, "Permanent Weekly must pass a strict raw DTO rather than the legacy model");
  assert.match(productionAppSource, /MES_REACT_ROLES === true/);
  assert.match(productionAppSource, /MES_REACT_ROLES_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-roles"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-roles-readonly"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-roles-write"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-roles-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /rolesReactIslandHost\.prepareRender\(\)/);
  assert.match(productionAppSource, /rolesReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /moduleDefinitions: getModuleDefinitions\(\)/);
  assert.match(productionAppSource, /MES_REACT_DIRECTORY_COMPONENT_TYPES === true/);
  assert.match(productionAppSource, /MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-directory-component-types"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-directory-component-types-readonly"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-directory-component-types-write"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-directory-component-types-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /canEditDirectorySection\("componentTypes"\)/);
  assert.match(productionAppSource, /persistDirectoryStateWithRemoval\(\)/);
  assert.match(productionAppSource, /componentTypes: directoryComponentTypesReactIslandHost/);
  assert.match(productionAppSource, /operations: directoryOperationsReactIslandHost/);
  assert.match(productionAppSource, /nomenclatureTypes: directoryNomenclatureTypesReactIslandHost/);
  assert.match(productionAppSource, /host !== activeReactHost\) host\.prepareRender\(\)/);
  assert.match(productionAppSource, /activeReactHost\?\.prepareRender\(\)/);
  assert.match(productionAppSource, /directoryComponentTypesReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /MES_REACT_DIRECTORY_OPERATIONS === true/);
  assert.match(productionAppSource, /MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-directory-operations"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-directory-operations-readonly"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-directory-operations-write"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-directory-operations-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /canEditDirectorySection\("operations"\)/);
  assert.match(productionAppSource, /getOperationDeleteUsage\(operation\.id\)/);
  assert.match(productionAppSource, /MES_OPERATION_MAP\.some\(\(operation\) => operation\.id === itemId\)/);
  assert.match(productionAppSource, /deleteOperationMapItem\(itemId, \{ deferDirectoryPersist: true \}\)/);
  assert.match(productionAppSource, /directoryOperationsReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /workCenterLabel: appEventsService\.formatDirectoryCell/);
  assert.match(productionAppSource, /MES_REACT_DIRECTORY_NOMENCLATURE_TYPES === true/);
  assert.match(productionAppSource, /MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-directory-nomenclature-types"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-directory-nomenclature-types-readonly"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-directory-nomenclature-types-write"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-directory-nomenclature-types-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /canEditDirectorySection\("nomenclatureTypes"\)/);
  assert.match(productionAppSource, /getFallbackNomenclatureType: \(\.\.\.args\) => typeof getFallbackNomenclatureType === "function" \? getFallbackNomenclatureType\(\.\.\.args\) : ""/, "production App Events must inject the real Nomenclature Type fallback owner");
  assert.match(productionAppSource, /saveDirectoryRow\("nomenclatureTypes"/);
  assert.match(productionAppSource, /deleteDirectoryStateRow\("nomenclatureTypes"/);
  assert.match(productionAppSource, /directoryNomenclatureTypesReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /MES_REACT_DIRECTORY_STATUSES === true/);
  assert.match(productionAppSource, /MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-directory-statuses-write"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-directory-statuses-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /statuses: getDirectoryData\("statuses"\)\.rows/);
  assert.match(productionAppSource, /canEditCustomStatusDirectorySection\(\)/);
  assert.match(productionAppSource, /saveDirectoryRow\("statuses"/);
  assert.match(productionAppSource, /directoryStatusesReactIslandHost\.mount\(\)/);
  const productionHostSource = await readFile(join(repositoryRoot, "src/modules/react_island_host.js"), "utf8");
  assert.match(productionHostSource, /dataset\.reactIslandCommitMs/);
  assert.match(productionHostSource, /performance\?\.now/);
  assert.match(productionHostSource, /requestLegacyRender\?\.\(fallbackReason, String\(scope \|\| ""\)\)/);
  const nomenclatureProductionHostSource = await readFile(join(repositoryRoot, "src/modules/nomenclature/react_island_host.js"), "utf8");
  assert.match(nomenclatureProductionHostSource, /createReactIslandHost/);
  assert.match(nomenclatureProductionHostSource, /canFallbackToLegacy:[\s\S]*?accessMode !== "react"/, "permanent Nomenclature failures must stay fail-closed");
  assert.match(nomenclatureProductionHostSource, /getShellState:[\s\S]*?serverReadFailure/, "permanent Nomenclature must own loading and read-error shells");
  assert.match(nomenclatureProductionHostSource, /onRequestBoards:[\s\S]*?navigateBoards/, "Boards navigation must bypass generic legacy fallback telemetry");
  const structureProductionHostSource = await readFile(join(repositoryRoot, "src/modules/production_structure_matrix/react_island_host.js"), "utf8");
  assert.match(structureProductionHostSource, /createReactIslandHost/);
  assert.match(structureProductionHostSource, /createStructurePositionsReactIslandHost/);
  assert.match(structureProductionHostSource, /createStructureOrgUnitsReactIslandHost/);
  assert.match(structureProductionHostSource, /createStructureWorkCentersReactIslandHost/);
  assert.match(structureProductionHostSource, /createStructureEquipmentReactIslandHost/);
  assert.match(structureProductionHostSource, /createStructureResponsibilityPoliciesReactIslandHost/);
  assert.match(structureProductionHostSource, /createStructureMigrationDiagnosticsReactIslandHost/);
  const weeklyProductionControlHostSource = await readFile(join(repositoryRoot, "src/modules/weekly_production_control/react_island_host.js"), "utf8");
  assert.match(weeklyProductionControlHostSource, /createReactIslandHost/);
  assert.match(weeklyProductionControlHostSource, /__MES_WEEKLY_PRODUCTION_CONTROL_REACT_BUNDLE_VERSION__/);
  assert.match(weeklyProductionControlHostSource, /activation\.accessMode === "react"/, "permanent Weekly must own its route before server read readiness");
  assert.match(weeklyProductionControlHostSource, /getShellState:[\s\S]*?compatibility-fallback|serverReadFailure/, "permanent Weekly must render loading and read-error shells without legacy");
  const planningWorkbenchHostSource = await readFile(join(repositoryRoot, "src/modules/planning_workbench/react_island_host.js"), "utf8");
  assert.match(planningWorkbenchHostSource, /onNavigate: navigate/);
  assert.match(planningWorkbenchHostSource, /onCommand: executeCommand/);
  assert.match(productionAppSource, /type === "select-item"/);
  assert.match(productionAppSource, /hydratePlanningWorkbenchBootstrap\(\{ force: true, renderOnChange: false \}\)/);
  assert.match(productionAppSource, /params\.get\("react-planning-workbench-write"\) === "1"/);
  assert.match(productionAppSource, /requireServerCommand: true/);
  const shiftWorkOrdersHostSource = await readFile(join(repositoryRoot, "src/modules/shift_work_orders/react_island_host.js"), "utf8");
  assert.match(shiftWorkOrdersHostSource, /shift-work-orders-print\.js/);
  assert.match(shiftWorkOrdersHostSource, /__MES_SHIFT_WORK_ORDERS_PRINT_BUNDLE_VERSION__/);
  assert.match(productionAppSource, /loadPrintPackage: async/);
  assert.match(productionAppSource, /getWorkOrderPrintPackageViewModel\(routeId\)/);
  assert.match(productionAppSource, /printDocument: \(title = ""\)/);
  const shiftMasterBoardHostSource = await readFile(join(repositoryRoot, "src/modules/shift_master_board/react_island_host.js"), "utf8");
  assert.match(shiftMasterBoardHostSource, /onSelectDate: selectDate/);
  assert.match(shiftMasterBoardHostSource, /onSelectFocus: selectFocus/);
  assert.match(shiftMasterBoardHostSource, /onSelectMaster: selectMaster/);
  assert.match(shiftMasterBoardHostSource, /onCommand: executeCommand/);
  assert.match(shiftMasterBoardHostSource, /shift-work-orders-print\.js/);
  assert.match(shiftMasterBoardHostSource, /__MES_SHIFT_MASTER_BOARD_PRINT_BUNDLE_VERSION__/);
  assert.match(productionAppSource, /selectFocus: \(focus = ""\)/);
  assert.match(productionAppSource, /ui\.shiftMasterBoardFocus = nextFocus/);
  assert.match(productionAppSource, /selectDate: \(dateKey = ""\)/);
  assert.match(productionAppSource, /setShiftWorkbenchDate\(dateKey\)/);
  assert.match(productionAppSource, /selectMaster: \(masterId = ""\)/);
  assert.match(productionAppSource, /!model\.canSelectMaster/);
  assert.match(productionAppSource, /model\.profiles \|\| \[\]/);
  assert.match(productionAppSource, /markShiftMasterBoardSheetPrinted\(row\.id/);
  assert.match(productionAppSource, /params\.get\("react-shift-master-board-write"\) === "1"/);
  assert.match(productionAppSource, /mirrorShiftMasterBoardAssignmentToServer\(row, saved\)/);
  const boardsProductionHostSource = await readFile(join(repositoryRoot, "src/modules/nomenclature/boards_react_island_host.js"), "utf8");
  assert.match(boardsProductionHostSource, /createReactIslandHost/);
  const rolesProductionHostSource = await readFile(join(repositoryRoot, "src/modules/access_roles/react_island_host.js"), "utf8");
  assert.match(rolesProductionHostSource, /createReactIslandHost/);
  const specifications2ProductionHostSource = await readFile(join(repositoryRoot, "src/modules/specifications2/react_island_host.js"), "utf8");
  assert.match(specifications2ProductionHostSource, /createReactIslandHost/);
  assert.match(specifications2ProductionHostSource, /__MES_SPECIFICATIONS2_REACT_BUNDLE_VERSION__/);
  const directoryComponentTypesHostSource = await readFile(join(repositoryRoot, "src/modules/directories/react_island_host.js"), "utf8");
  assert.match(directoryComponentTypesHostSource, /createReactIslandHost/);
  assert.match(directoryComponentTypesHostSource, /onRequestLegacy\("legacy-directory"\)/);
  assert.match(productionAppSource, /directoryReactLegacyOverride = true/);
  assert.match(directoryComponentTypesHostSource, /createDirectoryOperationsReactIslandHost/);
  assert.match(directoryComponentTypesHostSource, /createDirectoryNomenclatureTypesReactIslandHost/);
  assert.match(directoryComponentTypesHostSource, /createDirectoryStatusesReactIslandHost/);

  const productionBuildSource = await readFile(join(repositoryRoot, "scripts/build.mjs"), "utf8");
  assert.match(productionBuildSource, /bundleReactMigrationIsland/);
  assert.match(productionBuildSource, /shift-work-orders-print\.js/);
  assert.match(productionBuildSource, /react-islands", "nomenclature\.js/);
  assert.match(productionBuildSource, /react-islands", "boards\.js/);
  assert.match(productionBuildSource, /react-islands", "structure-employees\.js/);
  assert.match(productionBuildSource, /react-islands", "structure-positions\.js/);
  assert.match(productionBuildSource, /react-islands", "structure-org-units\.js/);
  assert.match(productionBuildSource, /react-islands", "structure-work-centers\.js/);
  assert.match(productionBuildSource, /react-islands", "structure-equipment\.js/);
  assert.match(productionBuildSource, /react-islands", "structure-responsibility-policies\.js/);
  assert.match(productionBuildSource, /react-islands", "structure-migration-diagnostics\.js/);
  assert.match(productionBuildSource, /react-islands", "weekly-production-control\.js/);
  assert.match(productionBuildSource, /react-islands", "roles\.js/);
  assert.match(productionBuildSource, /react-islands", "component-types\.js/);
  assert.match(productionBuildSource, /react-islands", "operations\.js/);
  assert.match(productionBuildSource, /react-islands", "nomenclature-types\.js/);
  assert.match(productionBuildSource, /react-islands", "statuses\.js/);
  assert.match(productionBuildSource, /react-islands", "specifications2\.js/);
  assert.match(productionBuildSource, /bundleReactMigrationIsland[\s\S]*?jsx: "automatic"/);
  assert.match(productionBuildSource, /nomenclatureReactIslandVersion = await fileHash/);
  assert.match(productionBuildSource, /replaceAll\(nomenclatureReactIslandVersionMarker, nomenclatureReactIslandVersion\)/);
  assert.match(productionBuildSource, /replaceAll\(boardsReactIslandVersionMarker, boardsReactIslandVersion\)/);
  assert.match(productionBuildSource, /replaceAll\(structureEmployeesReactIslandVersionMarker, structureEmployeesReactIslandVersion\)/);
  assert.match(productionBuildSource, /replaceAll\(structurePositionsReactIslandVersionMarker, structurePositionsReactIslandVersion\)/);
  assert.match(productionBuildSource, /replaceAll\(structureOrgUnitsReactIslandVersionMarker, structureOrgUnitsReactIslandVersion\)/);
  assert.match(productionBuildSource, /replaceAll\(structureWorkCentersReactIslandVersionMarker, structureWorkCentersReactIslandVersion\)/);
  assert.match(productionBuildSource, /replaceAll\(structureEquipmentReactIslandVersionMarker, structureEquipmentReactIslandVersion\)/);
  assert.match(productionBuildSource, /replaceAll\(structureResponsibilityPoliciesReactIslandVersionMarker, structureResponsibilityPoliciesReactIslandVersion\)/);
  assert.match(productionBuildSource, /replaceAll\(structureMigrationDiagnosticsReactIslandVersionMarker, structureMigrationDiagnosticsReactIslandVersion\)/);
  assert.match(productionBuildSource, /replaceAll\(weeklyProductionControlReactIslandVersionMarker, weeklyProductionControlReactIslandVersion\)/);
  assert.match(productionBuildSource, /replaceAll\(rolesReactIslandVersionMarker, rolesReactIslandVersion\)/);
  assert.match(productionBuildSource, /replaceAll\(directoryComponentTypesReactIslandVersionMarker, directoryComponentTypesReactIslandVersion\)/);
  assert.match(productionBuildSource, /replaceAll\(directoryOperationsReactIslandVersionMarker, directoryOperationsReactIslandVersion\)/);
  assert.match(productionBuildSource, /replaceAll\(directoryNomenclatureTypesReactIslandVersionMarker, directoryNomenclatureTypesReactIslandVersion\)/);
  assert.match(productionBuildSource, /replaceAll\(directoryStatusesReactIslandVersionMarker, directoryStatusesReactIslandVersion\)/);
  assert.match(productionBuildSource, /replaceAll\(specifications2ReactIslandVersionMarker, specifications2ReactIslandVersion\)/);

  const runtimeConfigSource = await readFile(join(repositoryRoot, "scripts/shared-state-storage.mjs"), "utf8");
  assert.match(runtimeConfigSource, /MES_REACT_NOMENCLATURE:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_BOARDS:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_BOARDS_READ_ONLY_EVALUATION:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_STRUCTURE_EMPLOYEES:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_STRUCTURE_POSITIONS:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_STRUCTURE_POSITIONS_READ_ONLY_EVALUATION:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_STRUCTURE_ORG_UNITS:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_STRUCTURE_ORG_UNITS_READ_ONLY_EVALUATION:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_STRUCTURE_WORK_CENTERS:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_STRUCTURE_WORK_CENTERS_READ_ONLY_EVALUATION:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_STRUCTURE_EQUIPMENT:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_STRUCTURE_EQUIPMENT_READ_ONLY_EVALUATION:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES_READ_ONLY_EVALUATION:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS_READ_ONLY_EVALUATION:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_WEEKLY_PRODUCTION_CONTROL:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_ROLES:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_ROLES_READ_ONLY_EVALUATION:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_DIRECTORY_COMPONENT_TYPES:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_DIRECTORY_OPERATIONS:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_DIRECTORY_NOMENCLATURE_TYPES:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_DIRECTORY_CLUSTER_SERVER_COMMANDS_PRIMARY:.*MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS.*=== "1"/,
    "Directory cluster ownership must reach the browser only as a non-secret fail-closed boolean");
  assert.match(runtimeConfigSource, /MES_REACT_DIRECTORY_STATUSES:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_SPECIFICATIONS2:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION:.*=== "1"/);

  const [{ stdout: changedPathsOutput }, { stdout: untrackedPathsOutput }] = await Promise.all([
    execFileAsync("git", ["diff", "--name-only", acceptedPostgresBaseline], { cwd: repositoryRoot }),
    execFileAsync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: repositoryRoot }),
  ]);
  const specificationsAuthorityQaPath = "scripts/domain-specifications2-publication-authority-qa.mjs";
  const changedPaths = [...new Set(`${changedPathsOutput}\n${untrackedPathsOutput}`.split("\n").filter(Boolean))];
  const employeeAuthSchemaContractPaths = new Set([
    "db/migrations/027_employee_auth_credentials.sql",
    "scripts/domain-employee-auth-repository.mjs",
    "scripts/domain-postgres-preflight-policy.mjs",
    "scripts/domain-postgres-preflight-policy-qa.mjs",
    "scripts/employee-auth-schema-contract-qa.mjs",
  ]);
  if ([...employeeAuthSchemaContractPaths].some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...employeeAuthSchemaContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...employeeAuthSchemaContractPaths].sort(),
      "Employee-auth schema/preflight policy must remain an atomic, separately executable contract",
    );
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/domain-postgres-preflight-policy-qa.mjs")], { cwd: repositoryRoot });
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/employee-auth-schema-contract-qa.mjs")], { cwd: repositoryRoot });

    const preflightPolicy = await import(`${pathToFileURL(join(repositoryRoot, "scripts/domain-postgres-preflight-policy.mjs")).href}?qa=${Date.now()}`);
    const frozenFoundationMigrations = [
      "009_specifications2_revision_read_model",
      "014_shift_execution_command_idempotency",
      "022_shift_execution_carryover_lifecycle",
      "023_system_domains_postgres_primary_authority",
      "026_system_responsibility_policy_lifecycle",
    ];
    assert.deepEqual(
      [...preflightPolicy.FOUNDATION_REQUIRED_DOMAIN_MIGRATIONS],
      frozenFoundationMigrations,
      "Employee-auth preflight policy must not rewrite the accepted foundation migration contract",
    );
    assert.deepEqual(
      preflightPolicy.getRequiredDomainMigrations({}),
      frozenFoundationMigrations,
      "Foundation preflight must continue to require migration 026 without conditionally enabling employee auth",
    );
  }
  const nomenclatureCommandContractPaths = new Set([
    "scripts/domain-nomenclature-command.mjs",
    "scripts/domain-nomenclature-reducer.mjs",
    "scripts/domain-nomenclature-command-qa.mjs",
    "scripts/nomenclature-command-authorization.mjs",
    "scripts/nomenclature-command-server-wiring-qa.mjs",
  ]);
  if ([...nomenclatureCommandContractPaths].some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...nomenclatureCommandContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...nomenclatureCommandContractPaths].sort(),
      "Nomenclature command owner must remain an atomic, separately executable backend contract",
    );
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/domain-nomenclature-command-qa.mjs")], { cwd: repositoryRoot });
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/nomenclature-command-server-wiring-qa.mjs")], { cwd: repositoryRoot });
  }
  const directoryClusterCommandContractPaths = new Set([
    "package.json",
    "server.js",
    "scripts/preview-dist.mjs",
    "scripts/shared-state-endpoint.mjs",
    "scripts/shared-state-storage.mjs",
    "scripts/domain-nomenclature-command.mjs",
    "scripts/nomenclature-command-authorization.mjs",
    "scripts/directory-cluster-type-reducer.mjs",
    "scripts/directory-cluster-type-reducer-qa.mjs",
    "scripts/directory-cluster-board-reducer.mjs",
    "scripts/directory-cluster-board-reducer-qa.mjs",
    "scripts/domain-directory-cluster-command.mjs",
    "scripts/domain-directory-cluster-command-qa.mjs",
    "scripts/directory-cluster-authorization-qa.mjs",
    "scripts/directory-cluster-command-server-wiring-qa.mjs",
    "scripts/directory-cluster-nomenclature-types-e2e.mjs",
    "src/modules/nomenclature_types/server_owner_client.js",
    "scripts/nomenclature-types-server-owner-client-qa.mjs",
  ]);
  if ([...directoryClusterCommandContractPaths].some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...directoryClusterCommandContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...directoryClusterCommandContractPaths].sort(),
      "Directory cluster owner must remain an atomic, separately executable backend/client contract",
    );
    await execFileAsync("npm", ["run", "qa:domain-directory-cluster-command"], { cwd: repositoryRoot });
  }
  const sharedStateAuthorityBridgeContractPaths = new Set([
    "package.json",
    "db/migrations/028_specifications2_publication_idempotency.sql",
    "db/migrations/029_specifications2_revision_identity_backfill.sql",
    "db/migrations/030_specifications2_legacy_revision_identity_guard.sql",
    "ops/shared-state/with-authority-rollout-lock.sh",
    "ops/auth/activate-pilot-nomenclature-command-owner.sh",
    "ops/auth/deactivate-pilot-nomenclature-command-owner.sh",
    "ops/postgres/activate-specifications2-publication.sh",
    "ops/postgres/deactivate-specifications2-publication.sh",
    "ops/postgres/activate-specifications2-work-orders.sh",
    "ops/postgres/deactivate-specifications2-work-orders.sh",
    "ops/postgres/apply-domain-migrations.sh",
    "ops/postgres/specifications2-server-command-compatibility.json",
    "scripts/apply-domain-migrations-rollout-qa.mjs",
    "scripts/postgres-autonomy-bootstrap-qa.mjs",
    "scripts/release-activate.mjs",
    "scripts/release-stage.mjs",
    "scripts/release-rollback.mjs",
    "scripts/release-rollback-qa.mjs",
    "scripts/release-activation-transaction-qa.mjs",
    "scripts/release-specifications2-command-contract.mjs",
    "scripts/release-specifications2-stage-preflight.mjs",
    "scripts/release-specifications2-stage-preflight-qa.mjs",
    "scripts/release-specifications2-switch-guard-qa.mjs",
    "scripts/specifications2-rollout-readiness-policy.mjs",
    "scripts/specifications2-rollout-readiness-policy-qa.mjs",
    "ops/postgres/activate-system-domains-command-surfaces.sh",
    "ops/postgres/deactivate-system-domains-command-surfaces.sh",
    "ops/postgres/retire-system-domains-snapshot.sh",
    "ops/postgres/recover-system-domains-primary-command-surfaces.sh",
    "scripts/shared-state-endpoint.mjs",
    "scripts/shared-state-storage.mjs",
    "scripts/shared-state-functional-qa.mjs",
    "scripts/shared-state-authority-bridge-qa.mjs",
    "scripts/sync-shared-state-contours.mjs",
    "scripts/sync-shared-state-contours-authority-qa.mjs",
    "scripts/domain-nomenclature-command.mjs",
    "scripts/domain-nomenclature-reducer.mjs",
    "scripts/nomenclature-command-server-wiring-qa.mjs",
    "scripts/domain-directory-cluster-command.mjs",
    "scripts/directory-cluster-type-reducer.mjs",
    "scripts/directory-cluster-command-server-wiring-qa.mjs",
    "scripts/domain-specifications2-export.mjs",
    "scripts/domain-specifications2-import.mjs",
    "scripts/domain-specifications2-import-qa.mjs",
    "scripts/domain-specifications2-snapshot-export-qa.mjs",
    "scripts/domain-specifications2-snapshot-repository.mjs",
    "scripts/domain-specifications2-repository.mjs",
    "scripts/domain-specifications2-repository-qa.mjs",
    "scripts/domain-work-orders-repository.mjs",
    "scripts/domain-specifications2-compatibility-fingerprint-bound-qa.mjs",
    "scripts/domain-specifications2-snapshot-sync.mjs",
    "scripts/domain-specifications2-snapshot-sync-qa.mjs",
    "src/domain/specifications2_quantity.js",
    "scripts/specifications2-publish-revision.mjs",
    "scripts/specifications2-server-first-publish-qa.mjs",
    "scripts/specifications2-pilot-chain-seed.mjs",
    "scripts/planning-snapshot-writer-coverage-qa.mjs",
    "scripts/specifications2-command-authorization.mjs",
    "scripts/specifications2-command-authorization-qa.mjs",
    "scripts/domain-api.mjs",
    "scripts/domain-api-qa.mjs",
    "src/modules/specifications2/publication.js",
    "scripts/specifications2-publication-qa.mjs",
  ]);
  if ([...sharedStateAuthorityBridgeContractPaths].some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...sharedStateAuthorityBridgeContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...sharedStateAuthorityBridgeContractPaths].sort(),
      "Protected shared-state domains must migrate to explicit owner ports as one atomic authority bridge",
    );
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/shared-state-authority-bridge-qa.mjs")], { cwd: repositoryRoot });
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/domain-specifications2-snapshot-sync-qa.mjs")], { cwd: repositoryRoot });
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/specifications2-publish-revision-qa.mjs")], { cwd: repositoryRoot });
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/specifications2-command-authorization-qa.mjs")], { cwd: repositoryRoot });
  }
  const specifications2AttachmentCommandContractPaths = new Set([
    "package.json",
    "ops/shared-state/with-authority-rollout-lock.sh",
    "ops/postgres/activate-specifications2-attachments.sh",
    "ops/postgres/deactivate-specifications2-attachments.sh",
    "ops/postgres/specifications2-server-command-compatibility.json",
    "scripts/release-server-command-contract-verify.mjs",
    "scripts/release-specifications2-command-contract.mjs",
    "scripts/release-specifications2-switch-guard-qa.mjs",
    "scripts/specifications2-rollout-readiness-policy.mjs",
    "scripts/specifications2-rollout-readiness-policy-qa.mjs",
    "scripts/specifications2-attachment-commands-client-qa.mjs",
    "src/modules/domain_api/specifications2_attachment_commands.js",
  ]);
  if ([...specifications2AttachmentCommandContractPaths].some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...specifications2AttachmentCommandContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...specifications2AttachmentCommandContractPaths].sort(),
      "Specifications 2.0 attachment rollout must keep its client, readiness policy, manifest verifier and root lifecycle atomic",
    );
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/specifications2-attachment-commands-client-qa.mjs")], { cwd: repositoryRoot });
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/specifications2-rollout-readiness-policy-qa.mjs")], { cwd: repositoryRoot });
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/release-specifications2-switch-guard-qa.mjs")], { cwd: repositoryRoot });
  }
  const specifications2WorkOrderIdentityContractPaths = new Set([
    "scripts/domain-specifications2-repository.mjs",
    "scripts/domain-specifications2-repository-qa.mjs",
    "scripts/specifications2-work-order-command-qa.mjs",
    "src/domain/specifications2_work_order.js",
  ]);
  if ([...specifications2WorkOrderIdentityContractPaths].some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...specifications2WorkOrderIdentityContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...specifications2WorkOrderIdentityContractPaths].sort(),
      "Specifications 2.0 Work Order identity must keep its SHA-256 builder, repository and executable QA atomic",
    );
    await execFileAsync("npm", ["run", "qa:domain-specifications2-work-order-command"], { cwd: repositoryRoot });
    await execFileAsync("npm", ["run", "qa:domain-specifications2-repository"], { cwd: repositoryRoot });
  }
  const shiftExecutionAuthorizationContractPaths = new Set([
    "package.json",
    "scripts/domain-api.mjs",
    "scripts/domain-api-qa.mjs",
    "scripts/domain-shift-execution-repository.mjs",
    "scripts/nomenclature-command-authorization.mjs",
    "scripts/shift-execution-carryover-cancel-api-qa.mjs",
    "scripts/shift-execution-carryover-lifecycle-qa.mjs",
    "scripts/shift-execution-command-authorization.mjs",
    "scripts/shift-execution-command-authorization-qa.mjs",
    "scripts/shift-execution-dispatch-repository-qa.mjs",
  ]);
  if ([...shiftExecutionAuthorizationContractPaths].some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...shiftExecutionAuthorizationContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...shiftExecutionAuthorizationContractPaths].sort(),
      "Shift Execution writes must keep session/RBAC resolution, target lookup, repository TOCTOU guards and executable QA atomic",
    );
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/shift-execution-command-authorization-qa.mjs")], { cwd: repositoryRoot });
    await execFileAsync("npm", ["run", "qa:domain-shift-command"], { cwd: repositoryRoot });
    await execFileAsync("npm", ["run", "qa:domain-api"], { cwd: repositoryRoot });
    await execFileAsync("npm", ["run", "qa:domain-shift-repository"], { cwd: repositoryRoot });
    await execFileAsync("npm", ["run", "qa:domain-shift-read-model"], { cwd: repositoryRoot });
    await execFileAsync("npm", ["run", "qa:domain-shift-command-client"], { cwd: repositoryRoot });
    await execFileAsync("npm", ["run", "qa:employee-auth-core"], { cwd: repositoryRoot });
    await execFileAsync("npm", ["run", "qa:domain-specifications2-command-authorization"], { cwd: repositoryRoot });
    await execFileAsync("npm", ["run", "qa:domain-directory-cluster-command"], { cwd: repositoryRoot });
  }
  const releaseCommandContractPaths = new Set([
    "package.json",
    "ops/auth/nomenclature-server-command-compatibility.json",
    "ops/postgres/specifications2-server-command-compatibility.json",
    "ops/postgres/system-domains-server-command-compatibility.json",
    "ops/postgres/shift-execution-server-command-compatibility.json",
    "scripts/release-specifications2-command-contract.mjs",
    "scripts/release-nomenclature-command-contract.mjs",
    "scripts/release-system-domains-command-contract.mjs",
    "scripts/release-shift-execution-command-contract.mjs",
    "scripts/release-server-command-contract-verify.mjs",
    "scripts/release-specifications2-switch-guard-qa.mjs",
    "scripts/release-nomenclature-command-contract-qa.mjs",
    "scripts/release-system-domains-command-contract-qa.mjs",
    "scripts/release-shift-execution-command-contract-qa.mjs",
    "scripts/release-stage.mjs",
    "scripts/release-activate.mjs",
    "scripts/release-rollback.mjs",
    "scripts/release-activation-diagnostics-qa.mjs",
    "scripts/release-activation-transaction-qa.mjs",
    "scripts/release-rollback-qa.mjs",
    "ops/shared-state/with-authority-rollout-lock.sh",
    "ops/postgres/activate-specifications2-attachments.sh",
    "ops/postgres/deactivate-specifications2-attachments.sh",
    "ops/postgres/activate-specifications2-work-orders.sh",
    "ops/postgres/deactivate-specifications2-work-orders.sh",
    "ops/postgres/activate-specifications2-publication.sh",
    "ops/postgres/deactivate-specifications2-publication.sh",
    "ops/postgres/activate-system-domains-command-surfaces.sh",
    "ops/postgres/deactivate-system-domains-command-surfaces.sh",
    "ops/postgres/recover-system-domains-primary-command-surfaces.sh",
    "ops/postgres/retire-system-domains-snapshot.sh",
    "ops/postgres/activate-shift-execution-commands.sh",
    "ops/postgres/deactivate-shift-execution-commands.sh",
    "ops/postgres/deactivate-staged-candidate-command-surfaces.sh",
    "ops/postgres/mes-pilot-shift-execution-commands.conf",
    "ops/postgres/apply-domain-migrations.sh",
    "scripts/apply-domain-migrations-rollout-qa.mjs",
    "scripts/release-specifications2-stage-preflight.mjs",
    "scripts/release-specifications2-stage-preflight-qa.mjs",
    "scripts/specifications2-rollout-readiness-policy.mjs",
    "scripts/specifications2-rollout-readiness-policy-qa.mjs",
    "scripts/release-staged-command-deactivation-policy.mjs",
    "scripts/domain-postgres-preflight-policy.mjs",
    "scripts/domain-postgres-preflight-policy-qa.mjs",
    "scripts/postgres-autonomy-bootstrap-qa.mjs",
  ]);
  if ([...releaseCommandContractPaths].some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...releaseCommandContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...releaseCommandContractPaths].sort(),
      "Release command rollout must keep markers, manifest builders/verifier, transactional switch, root lifecycle and focused QA atomic",
    );
    await execFileAsync("npm", ["run", "qa:release-command-contracts"], { cwd: repositoryRoot });
    await execFileAsync("npm", ["run", "qa:release-activation-diagnostics"], { cwd: repositoryRoot });
    await execFileAsync("npm", ["run", "qa:release-provenance"], { cwd: repositoryRoot });
    await execFileAsync("npm", ["run", "qa:postgres-autonomy-bootstrap"], { cwd: repositoryRoot });
  }
  const releaseRootRecoveryContractPaths = new Set([
    "package.json",
    "ops/frontend/harden-pilot-release-root-trust.sh",
    "ops/frontend/recover-pilot-release-transitions.sh",
    "ops/frontend/with-pilot-release-authority-lock.sh",
    "scripts/pilot-root-trust-bootstrap.mjs",
    "scripts/pilot-root-trust-bootstrap-qa.mjs",
    "scripts/release-immutable-source.mjs",
    "scripts/release-immutable-source-qa.mjs",
    "scripts/release-root-seal-verify.mjs",
    "scripts/release-root-seal-verify-qa.mjs",
    "scripts/release-root-stage-policy.mjs",
    "scripts/release-root-stage-policy-qa.mjs",
    "scripts/release-root-reinode-active.mjs",
    "scripts/release-root-reinode-active-qa.mjs",
    "scripts/release-switch-journal.mjs",
    "scripts/release-switch-journal-qa.mjs",
    "scripts/release-recovery-gate-qa.mjs",
    "scripts/release-stage.mjs",
    "scripts/release-activate.mjs",
    "scripts/release-rollback.mjs",
    "scripts/release-provenance-qa.mjs",
    "scripts/release-activation-record-qa.mjs",
    "scripts/release-activation-diagnostics-qa.mjs",
    "scripts/release-activation-transaction-qa.mjs",
    "scripts/release-rollback-qa.mjs",
  ]);
  const releaseRootRecoveryTriggerPaths = [...releaseRootRecoveryContractPaths]
    .filter((path) => path !== "package.json");
  if (releaseRootRecoveryTriggerPaths.some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...releaseRootRecoveryContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...releaseRootRecoveryContractPaths].sort(),
      "Release root trust, immutable helper bundle, durable journals and recovery gates must remain one atomic executable contract",
    );
    assert.equal(
      packageManifest.scripts?.["qa:release-provenance"],
      "node scripts/release-provenance-qa.mjs && node scripts/release-activation-record-qa.mjs && node scripts/release-rollback-qa.mjs && npm run qa:release-root-stage-trust && npm run qa:release-command-contracts",
      "Release provenance QA must retain the complete root trust and rollback chain",
    );
    await execFileAsync("npm", ["run", "qa:release-provenance"], { cwd: repositoryRoot });
  }

  const pilotRuntimeIsolationContractPaths = new Set([
    "package.json",
    "deploy/systemd/mes-pilot.service",
    "ops/postgres/mes-pilot-domain-import.service",
    "ops/postgres/mes-pilot-domain-migrate.service",
    "ops/postgres/mes-pilot-domain-snapshot-sync.service",
    "ops/postgres/mes-provision-postgres.sh",
    "ops/security/check-postgres-credential.mjs",
    "ops/security/install-pilot-runtime-uid-isolation.sh",
    "ops/security/mes-pilot-admin-auth.conf",
    "ops/security/mes-pilot-credential-rotation-recovery.service",
    "ops/security/mes-pilot-domain-migrator-credential-check.service",
    "ops/security/mes-pilot-domain-runtime-credential-check.service",
    "ops/security/mes-pilot-public-auth.conf",
    "ops/security/mes-pilot-runtime-transition-recovery.conf",
    "ops/security/mes-pilot-writer-transition-recovery.conf",
    "ops/security/pilot-base-env-migrate.mjs",
    "ops/security/pilot-credential-rotation-journal.sh",
    "ops/security/pilot-root-identity-lock.sh",
    "ops/security/pilot-runtime-security-dispatch.sh",
    "ops/security/pilot-runtime-transition-gate.sh",
    "ops/security/pilot-secret-env-rewrite.mjs",
    "ops/security/recover-pilot-credential-rotation.sh",
    "ops/security/recover-pilot-uid-cutover.sh",
    "ops/security/rotate-pilot-credentials.sh",
    "ops/security/verify-pilot-runtime-uid-isolation.sh",
    "scripts/domain-system-domains-import.mjs",
    "scripts/postgres-autonomy-bootstrap-qa.mjs",
    "scripts/pilot-credential-rotation-crash-qa.mjs",
    "scripts/pilot-runtime-recovery-authority-qa.mjs",
    "scripts/pilot-runtime-uid-isolation-qa.mjs",
  ]);
  const pilotRuntimeIsolationTriggerPaths = [...pilotRuntimeIsolationContractPaths]
    .filter((path) => path !== "package.json");
  if (pilotRuntimeIsolationTriggerPaths.some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...pilotRuntimeIsolationContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...pilotRuntimeIsolationContractPaths].sort(),
      "Pilot UID, split credentials, writer identities and crash recovery must remain one atomic runtime isolation contract",
    );
    await execFileAsync("npm", ["run", "qa:postgres-autonomy-bootstrap"], { cwd: repositoryRoot });
    await execFileAsync("npm", ["run", "qa:pilot-credential-rotation-crash"], { cwd: repositoryRoot });
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/domain-system-domains-import-guard-qa.mjs")], { cwd: repositoryRoot });
  }

  const specifications2GuardRepairContractPaths = new Set([
    "db/migrations/031_specifications2_guard_function_repair.sql",
    "ops/postgres/activate-specifications2-publication.sh",
    "ops/postgres/activate-specifications2-work-orders.sh",
    "ops/postgres/specifications2-server-command-compatibility.json",
    "scripts/apply-domain-migrations-rollout-qa.mjs",
    "scripts/domain-postgres-migrate.mjs",
    "scripts/domain-postgres-preflight-policy.mjs",
    "scripts/domain-specifications2-repository.mjs",
    "scripts/domain-specifications2-repository-qa.mjs",
    "scripts/release-activate.mjs",
    "scripts/release-rollback.mjs",
    "scripts/release-rollback-qa.mjs",
    "scripts/release-specifications2-command-contract.mjs",
  ]);
  if ([...specifications2GuardRepairContractPaths].some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...specifications2GuardRepairContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...specifications2GuardRepairContractPaths].sort(),
      "Specifications 2.0 repeatable guard repair must keep SQL, readiness fingerprints, release markers and rollback proof atomic",
    );
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/domain-specifications2-repository-qa.mjs")], { cwd: repositoryRoot });
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/apply-domain-migrations-rollout-qa.mjs")], { cwd: repositoryRoot });
  }

  const shiftAuthoritySeparationContractPaths = new Set([
    "package.json",
    "ops/postgres/mes-pilot-domain-migrate.service",
    "scripts/domain-postgres-migrate.mjs",
    "scripts/domain-shift-execution-authority-reconcile.mjs",
    "scripts/domain-shift-execution-authority-reconcile-qa.mjs",
    "scripts/pilot-runtime-uid-isolation-qa.mjs",
    "scripts/postgres-autonomy-bootstrap-qa.mjs",
  ]);
  const shiftAuthoritySeparationTriggerPaths = [...shiftAuthoritySeparationContractPaths]
    .filter((path) => path !== "package.json");
  if (shiftAuthoritySeparationTriggerPaths.some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...shiftAuthoritySeparationContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...shiftAuthoritySeparationContractPaths].sort(),
      "Pure SQL migration and explicit Shift authority reconciliation must remain separately invocable and jointly QA-gated",
    );
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/domain-shift-execution-authority-reconcile-qa.mjs")], { cwd: repositoryRoot });
    await execFileAsync("npm", ["run", "qa:domain-shift-authority"], { cwd: repositoryRoot });
    await execFileAsync("npm", ["run", "qa:domain-shift-parity"], { cwd: repositoryRoot });
  }

  const planningCommandAuthorizationContractPaths = new Set([
    "package.json",
    "scripts/domain-api.mjs",
    "scripts/domain-api-qa.mjs",
    "scripts/domain-postgres-repository.mjs",
    "scripts/nomenclature-command-authorization.mjs",
    "scripts/planning-command-authorization.mjs",
    "scripts/planning-command-authorization-qa.mjs",
    "scripts/planning-command-server-wiring-qa.mjs",
    "scripts/planning-postgres-projection-safety-qa.mjs",
    "scripts/planning-runtime-projection-cache-qa.mjs",
  ]);
  const planningCommandAuthorizationTriggerPaths = [...planningCommandAuthorizationContractPaths]
    .filter((path) => path !== "package.json");
  if (planningCommandAuthorizationTriggerPaths.some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...planningCommandAuthorizationContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...planningCommandAuthorizationContractPaths].sort(),
      "Planning quantity/slot writes must keep signed employee RBAC, bounded request handling and durable actor audit atomic",
    );
    await execFileAsync("npm", ["run", "qa:domain-api"], { cwd: repositoryRoot });
    await execFileAsync("npm", ["run", "qa:planning-postgres-safety"], { cwd: repositoryRoot });
    await execFileAsync("npm", ["run", "qa:domain-postgres-repository"], { cwd: repositoryRoot });
  }
  const planningStartDatePersistenceContractPaths = new Set([
    "db/migrations/032_planning_work_order_start_date.sql",
    "scripts/domain-postgres-import-qa.mjs",
    "scripts/domain-postgres-import.mjs",
    "scripts/domain-read-model-qa.mjs",
    "scripts/domain-snapshot-export-qa.mjs",
    "scripts/domain-snapshot-export.mjs",
    "scripts/domain-snapshot-sync-qa.mjs",
    "scripts/domain-snapshot-sync-runner.mjs",
    "scripts/domain-snapshot-sync.mjs",
    "scripts/planning-runtime-projection-postgres-repository-qa.mjs",
    "scripts/planning-workbench-bootstrap-postgres-repository-qa.mjs",
    "src/domain/calendar_date.js",
    "src/modules/domain_api/work_orders_read_model.js",
  ]);
  if ([...planningStartDatePersistenceContractPaths].some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...planningStartDatePersistenceContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...planningStartDatePersistenceContractPaths].sort(),
      "Planning start-date persistence must keep migration, import/export/snapshot, projection and client read-model changes atomic",
    );
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/planning-start-date-owner-qa.mjs")], { cwd: repositoryRoot });
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/domain-read-model-qa.mjs")], { cwd: repositoryRoot });
  }
  if (changedPaths.includes(specificationsAuthorityQaPath)) {
    const { stdout: authorityQaDiff } = await execFileAsync("git", ["diff", "--unified=0", acceptedPostgresBaseline, "--", specificationsAuthorityQaPath], { cwd: repositoryRoot });
    const assertionChanges = authorityQaDiff
      .split("\n")
      .filter((line) => (/^[+-]/.test(line) && !/^(---|\+\+\+)/.test(line)));
    assert.deepEqual(assertionChanges, [
      "-assert.match(renderSource, /writeStore\\(\\{ \\.\\.\\.latestStore, registry, selectedId: entryId \\}, \\{ suppressSharedStatePush: true \\}\\)/, \"server-primary acknowledgement must not enqueue a competing shared-state snapshot write\");",
      "+assert.match(renderSource, /writeStore\\(\\{ \\.\\.\\.latestStore, registry, selectedId: normalizedEntryId \\}, \\{ suppressSharedStatePush: true \\}\\)/, \"server-primary acknowledgement must not enqueue a competing shared-state snapshot write\");",
    ], "Specifications authority QA may only follow the already-reviewed entryId normalization");
  }
  const systemDomainsLifecycleArchiveContractPaths = new Set([
    "package.json",
    "db/migrations/033_system_domains_lifecycle_archived_at.sql",
    "scripts/domain-api.mjs",
    "scripts/domain-postgres-preflight-policy.mjs",
    "scripts/domain-postgres-preflight-policy-qa.mjs",
    "scripts/domain-schema-qa.mjs",
    "scripts/domain-system-domains-repository.mjs",
    "scripts/system-domains-lifecycle-schema-qa.mjs",
    "src/domain/system_domains_lifecycle.js",
    "src/modules/system_domains/service.js",
  ]);
  const hasSystemDomainsLifecycleArchiveContract = [...systemDomainsLifecycleArchiveContractPaths]
    .some((path) => changedPaths.includes(path));
  if (hasSystemDomainsLifecycleArchiveContract) {
    assert.deepEqual(
      [...systemDomainsLifecycleArchiveContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...systemDomainsLifecycleArchiveContractPaths].sort(),
      "System Domains archivedAt persistence must keep migration, fail-closed route/preflight, repository and executable QA atomic",
    );
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/system-domains-lifecycle-schema-qa.mjs")], { cwd: repositoryRoot });
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/domain-postgres-preflight-policy-qa.mjs")], { cwd: repositoryRoot });
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/domain-schema-qa.mjs")], { cwd: repositoryRoot });
  }
  const productionResourceDependencyLockContractPaths = new Set([
    "package.json",
    "scripts/domain-api.mjs",
    "scripts/domain-postgres-import.mjs",
    "scripts/domain-postgres-repository.mjs",
    "scripts/domain-shift-execution-authority.mjs",
    "scripts/domain-shift-execution-import.mjs",
    "scripts/domain-shift-execution-repository.mjs",
    "scripts/domain-specifications2-repository.mjs",
    "scripts/production-resource-dependency-lock.mjs",
    "scripts/production-resource-dependency-lock-qa.mjs",
    "scripts/shift-execution-authority-qa.mjs",
  ]);
  if ([...productionResourceDependencyLockContractPaths].some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...productionResourceDependencyLockContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...productionResourceDependencyLockContractPaths].sort(),
      "Equipment archive exclusion must keep System Domains, Planning, Specifications and Shift writers atomically QA-gated",
    );
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/production-resource-dependency-lock-qa.mjs")], { cwd: repositoryRoot });
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/shift-execution-authority-qa.mjs")], { cwd: repositoryRoot });
  }
  const responsibilityLifecyclePaths = new Set([
    "db/migrations/026_system_responsibility_policy_lifecycle.sql",
    "scripts/domain-postgres-preflight.mjs",
    "scripts/domain-schema-qa.mjs",
    "scripts/domain-system-domains-repository.mjs",
  ]);
  const systemDomainsConsistentReadContractPaths = new Set([
    "scripts/domain-system-domains-repository.mjs",
    "scripts/domain-system-domains-consistent-read-qa.mjs",
  ]);
  const systemDomainsCommandClientContractPaths = new Set([
    "src/modules/domain_api/system_domains_commands.js",
    "scripts/system-domains-commands-client-qa.mjs",
  ]);
  const systemDomainsDisposableCleanupContractPaths = new Set([
    "ops/postgres/cleanup-disposable-production-structure.sh",
    "scripts/system-domains-disposable-structure-cleanup.mjs",
    "scripts/system-domains-disposable-structure-cleanup-qa.mjs",
  ]);
  if ([...systemDomainsDisposableCleanupContractPaths].some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...systemDomainsDisposableCleanupContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...systemDomainsDisposableCleanupContractPaths].sort(),
      "Disposable Production Structure cleanup must keep its root wrapper, sealed implementation and executable QA atomic",
    );
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/system-domains-disposable-structure-cleanup-qa.mjs")], { cwd: repositoryRoot });
  }
  if ([...systemDomainsCommandClientContractPaths].some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...systemDomainsCommandClientContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...systemDomainsCommandClientContractPaths].sort(),
      "System Domains browser command errors must keep their focused executable client QA atomic",
    );
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/system-domains-commands-client-qa.mjs")], { cwd: repositoryRoot });
  }
  if ([...systemDomainsConsistentReadContractPaths].some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...systemDomainsConsistentReadContractPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...systemDomainsConsistentReadContractPaths].sort(),
      "System Domains RBAC reads must keep the repeatable-read repository change and executable concurrency QA atomic",
    );
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/domain-system-domains-consistent-read-qa.mjs")], { cwd: repositoryRoot });
  }
  if ([...responsibilityLifecyclePaths].some((path) => changedPaths.includes(path))) {
    assert.deepEqual([...responsibilityLifecyclePaths].filter((path) => changedPaths.includes(path)).sort(), [...responsibilityLifecyclePaths].sort(), "Responsibility-policy lifecycle owner contract must remain an atomic schema/repository/QA change");
    const lifecycleMigration = await readFile(join(repositoryRoot, "db/migrations/026_system_responsibility_policy_lifecycle.sql"), "utf8");
    assert.equal(lifecycleMigration, `BEGIN;\n\nALTER TABLE system_responsibility_policies\n  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,\n  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;\n\nINSERT INTO mes_schema_migrations(version)\nVALUES ('026_system_responsibility_policy_lifecycle')\nON CONFLICT (version) DO NOTHING;\n\nCOMMIT;\n`, "Responsibility-policy lifecycle migration must stay additive and non-destructive");
    const { stdout: repositoryDiff } = await execFileAsync("git", ["diff", "--unified=0", acceptedPostgresBaseline, "--", "scripts/domain-system-domains-repository.mjs"], { cwd: repositoryRoot });
    const repositoryChanges = repositoryDiff.split("\n").filter((line) => /^[+-]/.test(line) && !/^(---|\+\+\+)/.test(line));
    const lifecycleRepositoryChanges = [
      "-      INSERT INTO system_responsibility_policies (id, subject_employee_id, mode, updated_at_source, source_ref)",
      "-      VALUES (${text(item.id)}, ${text(item.subjectEmployeeId)}, ${text(item.mode)}, ${text(item.updatedAt)}, ${tx.json(item.sourceRef || {})})`;",
      "+      INSERT INTO system_responsibility_policies (id, subject_employee_id, mode, updated_at_source, is_active, archived_at, source_ref)",
      "+      VALUES (${text(item.id)}, ${text(item.subjectEmployeeId)}, ${text(item.mode)}, ${text(item.updatedAt)}, ${item.isActive !== false}, ${timestamp(item.archivedAt)}, ${tx.json(item.sourceRef || {})})`;",
      "-          responsibilityPolicies: policies.map((r) => ({ id:r.id, subjectEmployeeId:r.subject_employee_id, mode:r.mode, targetEmployeeIds:targetIds.get(r.id) || [], updatedAt:r.updated_at_source, sourceRef:r.source_ref || {} })),",
      "+          responsibilityPolicies: policies.map((r) => ({ id:r.id, subjectEmployeeId:r.subject_employee_id, mode:r.mode, targetEmployeeIds:targetIds.get(r.id) || [], updatedAt:r.updated_at_source, isActive:r.is_active, archivedAt:iso(r.archived_at), sourceRef:r.source_ref || {} })),",
    ];
    const lifecycleRepositoryChangeSet = new Set(lifecycleRepositoryChanges);
    assert.deepEqual(
      repositoryChanges.filter((line) => lifecycleRepositoryChangeSet.has(line)),
      lifecycleRepositoryChanges,
      "Responsibility-policy repository exception may only persist and hydrate lifecycle fields",
    );
    const consistentReadRepositoryChanges = repositoryChanges.filter((line) => !lifecycleRepositoryChangeSet.has(line));
    const expectedConsistentReadRepositoryChanges = [
      '-      const [set] = await sql`SELECT schema_id, schema_version, source_fingerprint, source, metadata, migrated_at, revision, updated_at FROM system_domain_sets WHERE id = ${SET_ID}`;',
      '-      if (!set) return { ...storage, item: null, revision: 0, updatedAt: "" };',
      "-      const [orgUnits, workCenters, scheduleTemplates, positions, employees, employmentAssignments, equipment, scheduleAssignments, attendanceEvents, accessRoles, grants, roleAssignments, policies, targets] = await Promise.all([",
      '-        sql`SELECT * FROM system_org_units ORDER BY id`, sql`SELECT * FROM system_work_centers ORDER BY id`, sql`SELECT * FROM system_schedule_templates ORDER BY id`, sql`SELECT * FROM system_positions ORDER BY id`, sql`SELECT * FROM system_employees ORDER BY id`, sql`SELECT * FROM system_employment_assignments ORDER BY id`, sql`SELECT * FROM system_equipment ORDER BY id`, sql`SELECT * FROM system_schedule_assignments ORDER BY id`, sql`SELECT * FROM system_attendance_events ORDER BY id`, sql`SELECT * FROM system_access_roles ORDER BY id`, sql`SELECT * FROM system_access_grants ORDER BY id`, sql`SELECT * FROM system_role_assignments ORDER BY id`, sql`SELECT * FROM system_responsibility_policies ORDER BY id`, sql`SELECT * FROM system_responsibility_targets ORDER BY policy_id, employee_id`,',
      "-      ]);",
      "+      // RBAC decisions must never combine a revision row from one projection",
      "+      // with grants or assignments from another. replace() swaps all 14",
      "+      // registries transactionally, while PostgreSQL READ COMMITTED gives",
      "+      // each statement a fresh snapshot. Hold one repeatable-read snapshot",
      "+      // for the complete aggregate instead of borrowing parallel pool clients.",
      "+      return readTransaction(async (tx) => {",
      '+        const [set] = await tx`SELECT schema_id, schema_version, source_fingerprint, source, metadata, migrated_at, revision, updated_at FROM system_domain_sets WHERE id = ${SET_ID}`;',
      '+        if (!set) return { ...storage, item: null, revision: 0, updatedAt: "" };',
      "+        const [orgUnits, workCenters, scheduleTemplates, positions, employees, employmentAssignments, equipment, scheduleAssignments, attendanceEvents, accessRoles, grants, roleAssignments, policies, targets] = await Promise.all([",
      '+          tx`SELECT * FROM system_org_units ORDER BY id`, tx`SELECT * FROM system_work_centers ORDER BY id`, tx`SELECT * FROM system_schedule_templates ORDER BY id`, tx`SELECT * FROM system_positions ORDER BY id`, tx`SELECT * FROM system_employees ORDER BY id`, tx`SELECT * FROM system_employment_assignments ORDER BY id`, tx`SELECT * FROM system_equipment ORDER BY id`, tx`SELECT * FROM system_schedule_assignments ORDER BY id`, tx`SELECT * FROM system_attendance_events ORDER BY id`, tx`SELECT * FROM system_access_roles ORDER BY id`, tx`SELECT * FROM system_access_grants ORDER BY id`, tx`SELECT * FROM system_role_assignments ORDER BY id`, tx`SELECT * FROM system_responsibility_policies ORDER BY id`, tx`SELECT * FROM system_responsibility_targets ORDER BY policy_id, employee_id`,',
      "+        ]);",
      "-      return {",
      "-        ...storage,",
      "-        item: normalizeInput(item),",
      "-        revision: Number(set.revision),",
      "-        fingerprint: text(set.source_fingerprint),",
      "-        updatedAt: iso(set.updated_at),",
      "-      };",
      "+        return {",
      "+          ...storage,",
      "+          item: normalizeInput(item),",
      "+          revision: Number(set.revision),",
      "+          fingerprint: text(set.source_fingerprint),",
      "+          updatedAt: iso(set.updated_at),",
      "+        };",
      "+      });",
      "-      const [set, countRow] = await Promise.all([",
      '-        sql`SELECT revision, updated_at FROM system_domain_sets WHERE id = ${SET_ID}`.then((result) => result[0]),',
      "-        sql`",
      "+      return readTransaction(async (tx) => {",
      "+        const [set, countRow] = await Promise.all([",
      '+          tx`SELECT revision, updated_at FROM system_domain_sets WHERE id = ${SET_ID}`.then((result) => result[0]),',
      "+          tx`",
      "-        `.then((result) => result[0]),",
      "-      ]);",
      '-      if (!set) return { ...storage, revision: 0, updatedAt: "", configured: true, summary: { registryCounts: Object.fromEntries(SYSTEM_DOMAIN_REGISTRY_NAMES.map((name) => [name, 0])), totalRows: 0 } };',
      "-      const aliases = {",
      '-        orgUnits: "org_units", workCenters: "work_centers", scheduleTemplates: "schedule_templates", positions: "positions",',
      '-        employees: "employees", employmentAssignments: "employment_assignments", equipment: "equipment",',
      '-        scheduleAssignments: "schedule_assignments", attendanceEvents: "attendance_events", accessRoles: "access_roles",',
      '-        grants: "grants", roleAssignments: "role_assignments", responsibilityPolicies: "responsibility_policies",',
      "-      };",
      "-      const counts = Object.fromEntries(SYSTEM_DOMAIN_REGISTRY_NAMES.map((name) => [name, Number(countRow?.[aliases[name]] || 0)]));",
      "-      return { ...storage, revision: Number(set.revision), updatedAt: iso(set.updated_at), configured: true, summary: { registryCounts: counts, totalRows: Object.values(counts).reduce((sum, count) => sum + count, 0) } };",
      "+          `.then((result) => result[0]),",
      "+        ]);",
      '+        if (!set) return { ...storage, revision: 0, updatedAt: "", configured: true, summary: { registryCounts: Object.fromEntries(SYSTEM_DOMAIN_REGISTRY_NAMES.map((name) => [name, 0])), totalRows: 0 } };',
      "+        const aliases = {",
      '+          orgUnits: "org_units", workCenters: "work_centers", scheduleTemplates: "schedule_templates", positions: "positions",',
      '+          employees: "employees", employmentAssignments: "employment_assignments", equipment: "equipment",',
      '+          scheduleAssignments: "schedule_assignments", attendanceEvents: "attendance_events", accessRoles: "access_roles",',
      '+          grants: "grants", roleAssignments: "role_assignments", responsibilityPolicies: "responsibility_policies",',
      "+        };",
      "+        const counts = Object.fromEntries(SYSTEM_DOMAIN_REGISTRY_NAMES.map((name) => [name, Number(countRow?.[aliases[name]] || 0)]));",
      "+        return { ...storage, revision: Number(set.revision), updatedAt: iso(set.updated_at), configured: true, summary: { registryCounts: counts, totalRows: Object.values(counts).reduce((sum, count) => sum + count, 0) } };",
      "+      });",
    ];
    if (hasSystemDomainsLifecycleArchiveContract) {
      const repositorySource = await readFile(join(repositoryRoot, "scripts/domain-system-domains-repository.mjs"), "utf8");
      assert.equal(
        createHash("sha256").update(repositorySource).digest("hex"),
        "a4ee77fcf54be726093c863e484f735646da2fc74a8299cac5f2669a7e2c3a06",
        "System Domains lifecycle persistence repository must remain the exact executable-QA-gated implementation",
      );
      let previousIndex = -1;
      for (const change of expectedConsistentReadRepositoryChanges) {
        const index = consistentReadRepositoryChanges.indexOf(change, previousIndex + 1);
        assert(index > previousIndex, `System Domains repeatable-read projection change is missing or reordered: ${change}`);
        previousIndex = index;
      }
    } else {
      assert.deepEqual(
        consistentReadRepositoryChanges,
        expectedConsistentReadRepositoryChanges,
        "System Domains repository may additionally contain only the separately QA-gated repeatable-read projection change",
      );
    }
    await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/domain-system-domains-consistent-read-qa.mjs")], { cwd: repositoryRoot });
    const { stdout: preflightDiff } = await execFileAsync("git", ["diff", "--unified=0", acceptedPostgresBaseline, "--", "scripts/domain-postgres-preflight.mjs"], { cwd: repositoryRoot });
    const preflightChanges = preflightDiff.split("\n").filter((line) => /^[+-]/.test(line) && !/^(---|\+\+\+)/.test(line));
    assert.deepEqual(preflightChanges, [
      "+import {",
      "+  getRequiredDomainMigrations,",
      "+  requiresPlanningStartDateCommandMigration,",
      '+} from "./domain-postgres-preflight-policy.mjs";',
      '+import { createPostgresWorkOrdersRepository } from "./domain-postgres-repository.mjs";',
      "+",
      "-  const requiredMigrations = [",
      '-    "009_specifications2_revision_read_model",',
      '-    "014_shift_execution_command_idempotency",',
      '-    "022_shift_execution_carryover_lifecycle",',
      '-    "023_system_domains_postgres_primary_authority",',
      "-  ];",
      "+  const requiredMigrations = getRequiredDomainMigrations(process.env);",
      "+  if (requiresPlanningStartDateCommandMigration(process.env)) {",
      "+    const readiness = await createPostgresWorkOrdersRepository({ sql }).startDateCommandReadiness();",
      "+    if (readiness.schemaReady !== true) {",
      '+      throw new Error(`PostgreSQL Planning start-date owner schema is not exact: ${readiness.error || "readiness proof failed"}`);',
      "+    }",
      "+  }",
    ], "PostgreSQL preflight may only delegate the frozen migration list and exact Planning start-date schema proof to their separately tested policies");
    const { stdout: schemaQaDiff } = await execFileAsync("git", ["diff", "--unified=0", acceptedPostgresBaseline, "--", "scripts/domain-schema-qa.mjs"], { cwd: repositoryRoot });
    const schemaQaChanges = schemaQaDiff.split("\n").filter((line) => /^[+-]/.test(line) && !/^(---|\+\+\+)/.test(line));
    const expectedSchemaQaChanges = [
      '+const responsibilityPolicyLifecycleMigrationPath = fileURLToPath(new URL("../db/migrations/026_system_responsibility_policy_lifecycle.sql", import.meta.url));',
      '+const responsibilityPolicyLifecycleSql = await readFile(responsibilityPolicyLifecycleMigrationPath, "utf-8");',
      '+const planningStartDateMigrationPath = fileURLToPath(new URL("../db/migrations/032_planning_work_order_start_date.sql", import.meta.url));',
      '+const planningStartDateSql = await readFile(planningStartDateMigrationPath, "utf-8");',
      '+const postgresPreflightPolicyPath = fileURLToPath(new URL("./domain-postgres-preflight-policy.mjs", import.meta.url));',
      '+const postgresPreflightPolicySql = await readFile(postgresPreflightPolicyPath, "utf-8");',
      '-  postgresPreflightSql.includes(\'"023_system_domains_postgres_primary_authority"\'),',
      '+  postgresPreflightSql.includes("getRequiredDomainMigrations(process.env)")',
      '+    && postgresPreflightPolicySql.includes(\'"023_system_domains_postgres_primary_authority"\'),',
      "+[",
      '+  "ALTER TABLE system_responsibility_policies",',
      '+  "ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",',
      '+  "ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ",',
      '+  "VALUES (\'026_system_responsibility_policy_lifecycle\')",',
      "+].forEach((fragment) => assert(responsibilityPolicyLifecycleSql.includes(fragment), `Responsibility-policy lifecycle migration is missing: ${fragment}`));",
      '+assert(!/DROP\\s+(TABLE|DATABASE|SCHEMA)/i.test(responsibilityPolicyLifecycleSql), "Responsibility-policy lifecycle migration must not contain destructive statements");',
      "+[",
      '+  "ADD COLUMN IF NOT EXISTS planning_start_date DATE",',
      '+  "ADD COLUMN IF NOT EXISTS idempotency_key TEXT",',
      '+  "CREATE UNIQUE INDEX IF NOT EXISTS domain_change_log_actor_idempotency_uidx",',
      '+  "WHERE actor_id IS NOT NULL AND idempotency_key IS NOT NULL",',
      '+  "VALUES (\'032_planning_work_order_start_date\')",',
      "+].forEach((fragment) => assert(planningStartDateSql.includes(fragment), `Planning start-date migration is missing: ${fragment}`));",
      '+assert(!/DROP\\s+(TABLE|DATABASE|SCHEMA|COLUMN)/i.test(planningStartDateSql), "Planning start-date migration must not contain destructive statements");',
      "+assert(",
      '+  postgresPreflightSql.includes("getRequiredDomainMigrations(process.env)")',
      '+    && postgresPreflightPolicySql.includes(\'"026_system_responsibility_policy_lifecycle"\'),',
      '+  "PostgreSQL domain preflight must require the Responsibility Policy lifecycle migration",',
      "+);",
    ];
    if (hasSystemDomainsLifecycleArchiveContract) {
      const schemaQaSource = await readFile(join(repositoryRoot, "scripts/domain-schema-qa.mjs"), "utf8");
      assert.equal(
        createHash("sha256").update(schemaQaSource).digest("hex"),
        "a27f68810e9bce93c4c45ea2172f250dcdce156cc9fbb885513e5d9ef37c9ddf",
        "System Domains lifecycle schema QA must remain the exact executable-QA-gated implementation",
      );
      let previousIndex = -1;
      for (const change of expectedSchemaQaChanges) {
        const index = schemaQaChanges.indexOf(change, previousIndex + 1);
        assert(index > previousIndex, `Existing schema QA gate is missing or reordered: ${change}`);
        previousIndex = index;
      }
    } else {
      assert.deepEqual(
        schemaQaChanges,
        expectedSchemaQaChanges,
        "Schema QA exception must remain the exact Responsibility Policy/Planning start-date migration gates plus policy delegation",
      );
    }
  }
  const reactRuntimePolicyDeliveryPaths = new Set([
    "server.js",
    "scripts/react-runtime-policy.mjs",
    "react-runtime-policy.json",
  ]);
  if ([...reactRuntimePolicyDeliveryPaths].some((path) => changedPaths.includes(path))) {
    assert.deepEqual(
      [...reactRuntimePolicyDeliveryPaths].filter((path) => changedPaths.includes(path)).sort(),
      [...reactRuntimePolicyDeliveryPaths].sort(),
      "React runtime policy delivery must include the server loader and immutable policy artifact together",
    );
    const { stdout: serverPolicyDiff } = await execFileAsync("git", ["diff", "--unified=0", acceptedPostgresBaseline, "--", "server.js"], { cwd: repositoryRoot });
    const serverPolicyChanges = serverPolicyDiff.split("\n").filter((line) => /^[+-]/.test(line) && !/^(---|\+\+\+)/.test(line));
    assert.deepEqual(serverPolicyChanges, [
      '+import { handleEmployeeAuthRequest } from "./scripts/employee-auth-endpoint.mjs";',
      '+import { inspectEmployeeAuthSession } from "./scripts/employee-auth-guard.mjs";',
      '+import {',
      '+  getCurrentDirectoryAuthorization,',
      '+  getCurrentNomenclatureAuthorization,',
      '+} from "./scripts/nomenclature-command-authorization.mjs";',
      '+import { handleNomenclatureCommandRequest } from "./scripts/domain-nomenclature-command.mjs";',
      '+import { handleDirectoryClusterCommandRequest } from "./scripts/domain-directory-cluster-command.mjs";',
      '+import {',
      '+  assertSingleReactEvaluationPermission,',
      '+  getPublicReactRuntimePolicy,',
      '+  loadReactRuntimePolicy,',
      '+  summarizeReactRuntimePolicy,',
      '+} from "./scripts/react-runtime-policy.mjs";',
      '+const reactRuntimePolicy = await loadReactRuntimePolicy({ projectRoot: root, env: process.env });',
      '+const activeReactEvaluationSurfaces = assertSingleReactEvaluationPermission(process.env, reactRuntimePolicy);',
      '+const publicReactRuntimePolicy = getPublicReactRuntimePolicy(reactRuntimePolicy);',
      '+const reactRuntimeSummary = summarizeReactRuntimePolicy(reactRuntimePolicy, {',
      '+  activeEvaluationSurfaces: activeReactEvaluationSurfaces,',
      '+});',
      '-    .replace("</head>", `${renderRuntimeConfigScript(process.env)}\\n  </head>`)',
      '+    .replace("</head>", `${renderRuntimeConfigScript(process.env, { reactRuntimePolicy: publicReactRuntimePolicy })}\\n  </head>`)',
      '-  res.end(JSON.stringify({ status: statusCode === 200 ? "ok" : "degraded", version, sharedState }));',
      '+  res.end(JSON.stringify({ status: statusCode === 200 ? "ok" : "degraded", version, sharedState, reactRuntime: reactRuntimeSummary }));',
      '+  if (await handleEmployeeAuthRequest(req, res, url, {',
      '+    headers: noCacheHeaders,',
      '+  })) {',
      '+    return;',
      '+  }',
      '+',
      '+  if (await handleDirectoryClusterCommandRequest(req, res, url, {',
      '+    env: process.env,',
      '+    filePath: sharedStatePaths.filePath,',
      '+    backupDir: sharedStatePaths.backupDir,',
      '+    auditLogPath: sharedStatePaths.auditLogPath,',
      '+    headers: noCacheHeaders,',
      '+    getAuthorization: async ({ resource, surface }) => {',
      '+      const session = await inspectEmployeeAuthSession(req, process.env);',
      '+      if (!session.principal) {',
      '+        if ([',
      '+          "employee-auth-not-configured",',
      '+          "employee-auth-storage-not-configured",',
      '+          "employee-auth-storage-unavailable",',
      '+        ].includes(session.reason)) {',
      '+          throw new Error("Employee authorization storage is unavailable");',
      '+        }',
      '+        return null;',
      '+      }',
      '+      const authorization = await getCurrentDirectoryAuthorization(session.principal, {',
      '+        databaseUrl: process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",',
      '+        moduleId: surface === "boards" ? "nomenclature" : "directories",',
      '+        resourceId: resource,',
      '+      });',
      '+      if (!authorization.allowed && /(?:unavailable|not-configured)$/.test(String(authorization.reason || ""))) {',
      '+        throw new Error("Current Directory RBAC projection is unavailable");',
      '+      }',
      '+      return authorization;',
      '+    },',
      '+  })) {',
      '+    return;',
      '+  }',
      '+',
      '+  if (await handleNomenclatureCommandRequest(req, res, url, {',
      '+    env: process.env,',
      '+    filePath: sharedStatePaths.filePath,',
      '+    backupDir: sharedStatePaths.backupDir,',
      '+    auditLogPath: sharedStatePaths.auditLogPath,',
      '+    headers: noCacheHeaders,',
      '+    getAuthorization: async () => {',
      '+      const session = await inspectEmployeeAuthSession(req, process.env);',
      '+      if (!session.principal) {',
      '+        if ([',
      '+          "employee-auth-not-configured",',
      '+          "employee-auth-storage-not-configured",',
      '+          "employee-auth-storage-unavailable",',
      '+        ].includes(session.reason)) {',
      '+          throw new Error("Employee authorization storage is unavailable");',
      '+        }',
      '+        return null;',
      '+      }',
      '+      const authorization = await getCurrentNomenclatureAuthorization(session.principal, {',
      '+        databaseUrl: process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",',
      '+      });',
      '+      if (!authorization.allowed && /(?:unavailable|not-configured)$/.test(String(authorization.reason || ""))) {',
      '+        throw new Error("Current Nomenclature RBAC projection is unavailable");',
      '+      }',
      '+      return authorization;',
      '+    },',
      '+  })) {',
      '+    return;',
      '+  }',
      '+',
    ], "server.js may contain only the reviewed runtime-policy delivery and separately QA-gated employee-auth/Nomenclature/Directory command routes");
  }
  const frozenBackendDiff = changedPaths
    .filter(isFrozenBackendPath)
    .filter((path) => path !== specificationsAuthorityQaPath
      && !responsibilityLifecyclePaths.has(path)
      && !reactRuntimePolicyDeliveryPaths.has(path)
      && !employeeAuthSchemaContractPaths.has(path)
      && !nomenclatureCommandContractPaths.has(path)
      && !directoryClusterCommandContractPaths.has(path)
      && !sharedStateAuthorityBridgeContractPaths.has(path)
      && !specifications2AttachmentCommandContractPaths.has(path)
      && !specifications2WorkOrderIdentityContractPaths.has(path)
      && !shiftExecutionAuthorizationContractPaths.has(path)
      && !releaseCommandContractPaths.has(path)
      && !pilotRuntimeIsolationContractPaths.has(path)
      && !specifications2GuardRepairContractPaths.has(path)
      && !shiftAuthoritySeparationContractPaths.has(path)
      && !planningCommandAuthorizationContractPaths.has(path)
      && !planningStartDatePersistenceContractPaths.has(path)
      && !systemDomainsConsistentReadContractPaths.has(path)
      && !systemDomainsCommandClientContractPaths.has(path)
      && !systemDomainsDisposableCleanupContractPaths.has(path)
      && !systemDomainsLifecycleArchiveContractPaths.has(path)
      && !productionResourceDependencyLockContractPaths.has(path));
  assert.deepEqual(frozenBackendDiff, [], `migration branch changed frozen backend contracts:\n${frozenBackendDiff.join("\n")}`);
  const { stdout: runtimeStateDiff } = await execFileAsync("git", ["diff", "--unified=0", acceptedPostgresBaseline, "--", "src/modules/runtime_state/service.js"], { cwd: repositoryRoot });
  const allowedRuntimeStateAdditions = new Set([
    "+  async function hydrateSharedStateValues(valueKeys = [], { allowBeforeInitialSync = false, throwOnError = false } = {}) {",
    "+      if (allowBeforeInitialSync) {",
    "+        // A targeted permanent-surface read can race the initial metadata",
    "+        // handshake. Its successful response already proves the same shared",
    "+        // owner is configured, so expose that authority before the surface is",
    "+        // allowed to render or execute a durable command.",
    "+        sharedStateStatus.configured = true;",
    "+        sharedStateStatus.enabled = true;",
    "+        sharedStateStatus.version = Math.max(",
    "+          Number(sharedStateStatus.version || 0),",
    "+          Number(snapshot.version || 0),",
    "+    if (throwOnError) throw error;",
    "+  acknowledgeSharedUiPatch,",
    "+  if (sharedStateStatus.valueProjection === \"metadata\") {",
    "+    // A non-Planning module has not hydrated the authoritative Planning",
    "+    // projection. Omitting the key preserves the server value; sending the",
    "+    // empty/stale local compatibility copy would be rejected or destructive.",
    "+    delete values[STORAGE_KEY];",
    "+  } else if (hasMeaningfulPlanningState(planningState)) {",
    "+async function persistDirectoryStateDurably(reason = \"directory-state\") {",
    "+  persistDirectoryState();",
    "+  // A compact UI acknowledgement or a poll may already be using the shared",
    "+  // state transport. Wait for that read/write to settle, then push the exact",
    "+  // directory projection immediately. React command surfaces must not report",
    "+  // success while their mutation exists only in this browser tab.",
    "+  const waitDeadline = Date.now() + 10_000;",
    "+  for (let attempt = 1; attempt <= 6; attempt += 1) {",
    "+    while ((sharedStateStatus.saveInFlight || sharedStateStatus.pollInFlight) && Date.now() < waitDeadline) {",
    "+      await new Promise((resolve) => window.setTimeout(resolve, 25));",
    "+    }",
    "+    if (sharedStateStatus.saveInFlight || sharedStateStatus.pollInFlight) return false;",
    "+    const attemptReason = attempt === 1 ? reason : `${reason}:durable-retry-${attempt}`;",
    "+    scheduleSharedStatePush(attemptReason);",
    "+    if (await pushSharedState(attemptReason, { notifyConflict: attempt === 6 })) return true;",
    "+    if (Date.now() >= waitDeadline) return false;",
    "+    await new Promise((resolve) => window.setTimeout(resolve, attempt * 75));",
    "+  }",
    "+  return false;",
    "+}",
    "+",
    "+async function persistDirectoryStateWithRemoval() {",
    "+  const previousValue = directoryEntityRemovalAllowed;",
    "+  directoryEntityRemovalAllowed = true;",
    "+  try {",
    "+    return await persistDirectoryStateDurably(\"directory-removal\");",
    "+  } finally {",
    "+    directoryEntityRemovalAllowed = previousValue;",
    "+  }",
    "+}",
    "+",
    "+    persistDirectoryStateDurably,",
    "+    persistDirectoryStateWithRemoval,",
    "+        sharedStateStatus.sharedUiBase = acknowledgeSharedUiPatch(",
    "+          sharedStateStatus.sharedUiBase || {},",
    "+          pendingSharedUi,",
    "+          pendingSharedUiFull,",
    "+        );",
    "+    } else if (sharedStateStatus.sharedUiBase !== null) {",
    "+      // Domain writes still carry the compatibility values, but their UI",
    "+      // intent is only the delta from the last observed server baseline. This",
    "+      // keeps an immediately refreshed CAS version from overwriting unrelated",
    "+      // UI entries that another browser committed in the meantime.",
    "+      const sharedUiPatch = getSharedUiPatch(sharedStateStatus.sharedUiBase, pendingSharedUiFull);",
    "+      if (hasSharedUiPatchChanges(sharedUiPatch)) writePayload.sharedUiPatch = sharedUiPatch;",
    "+    try {",
    "+      // A normal 409 response contains the complete compatibility snapshot and",
    "+      // can exceed the browser's transport timeout on real Pilot data. Read a",
    "+      // metadata-only revision immediately before each durable attempt so the",
    "+      // protected full write starts from a current CAS version instead.",
    "+      const baseline = await requestSharedState(\"GET\", null, { emptyProjection: true });",
    "+      if (baseline.configured === false) return false;",
    "+      const baselineVersion = Number(baseline.version || 0);",
    "+      if (!Number.isFinite(baselineVersion) || baselineVersion <= 0) return false;",
    "+      sharedStateStatus.version = baselineVersion;",
    "+      if (sharedStateStatus.sharedUiBase === null) {",
    "+        sharedStateStatus.sharedUiBase = cloneSharedUiSnapshot(baseline.sharedUi || {});",
    "+      }",
    "+    } catch (error) {",
    "+      if (Date.now() >= waitDeadline) return false;",
    "+      await new Promise((resolve) => window.setTimeout(resolve, attempt * 75));",
    "+      continue;",
    "+    if (sharedStateStatus.saveInFlight || sharedStateStatus.pollInFlight) {",
    "+      return \"Синхронизация занята дольше 10 секунд.\";",
    "+      if (baseline.configured === false) return \"Общее хранилище не настроено.\";",
    "+      if (!Number.isFinite(baselineVersion) || baselineVersion <= 0) {",
    "+        return \"Сервер не вернул действующую ревизию общего состояния.\";",
    "+      if (Date.now() >= waitDeadline) {",
    "+        return `Не удалось прочитать ревизию общего состояния: ${error?.message || String(error)}`;",
    "+    if (Date.now() >= waitDeadline) return \"Сервер не подтвердил запись за 10 секунд.\";",
    "+  return \"Сервер не подтвердил запись после шести защищённых попыток.\";",
    "+  const compactValueAcknowledgement = options.compactValueAcknowledgement === true && !compactSharedUi;",
    "+    if (compactValueAcknowledgement) {",
    "+      if (!Object.prototype.hasOwnProperty.call(writePayload, \"sharedUiPatch\")) {",
    "+        writePayload.sharedUiPatch = getSharedUiPatch(",
    "+          sharedStateStatus.sharedUiBase || pendingSharedUiFull,",
    "+      writePayload.responseMode = \"ack\";",
    "+      // Directory-only commands are intentionally independent from the",
    "+      // legacy Shift Execution compatibility projection. Once that",
    "+      // projection is retired, attaching a stale complete sharedUi snapshot",
    "+      // makes an otherwise current directory write look like an attempted",
    "+      // restoration. The patch above carries the only UI intent the server",
    "+      // should merge for this compact transport.",
    "+      delete writePayload.sharedUi;",
    "+      const retryValues = compactSharedUi",
    "+        ? {}",
    "+        : compactValueAcknowledgement",
    "+          ? pendingValues",
    "+          : mergeSharedStateConflictValues(response.current.values || {}, pendingValues);",
    "+      if (compactValueAcknowledgement) retryPayload.responseMode = \"ack\";",
    "+      if (compactValueAcknowledgement) {",
    "+        delete retryPayload.sharedUi;",
    "+        retryPayload.responseMode = \"ack\";",
    "+      if (compactSharedUi || compactValueAcknowledgement) {",
    "+        transport: compactSharedUi ? \"shared-ui-ack\" : compactValueAcknowledgement ? \"directory-value-ack\" : \"snapshot\",",
    "+    const allPendingValues = sharedStateStatus.pendingValues || getSharedStateValues();",
    "+    sharedStateStatus.pendingValues = Object.fromEntries([",
    "+      DIRECTORY_STORAGE_KEY,",
    "+      DIRECTORY_DEFAULTS_STORAGE_KEY,",
    "+      DIRECTORY_DELETED_ENTITIES_STORAGE_KEY,",
    "+    ].filter(Boolean).flatMap((key) => (",
    "+      Object.prototype.hasOwnProperty.call(allPendingValues, key)",
    "+        ? [[key, allPendingValues[key]]]",
    "+        : []",
    "+    )));",
    "+    if (await pushSharedState(attemptReason, {",
    "+      notifyConflict: attempt === 6,",
    "+      compactValueAcknowledgement: true,",
    "+    })) return true;",
  ]);
  const allowedRuntimeStateRemovals = new Set([
    "-  async function hydrateSharedStateValues(valueKeys = [], { allowBeforeInitialSync = false } = {}) {",
    "-  if (hasMeaningfulPlanningState(planningState)) {",
    "-        sharedStateStatus.sharedUiBase = applySharedUiPatch(sharedStateStatus.sharedUiBase || {}, pendingSharedUi);",
    "-      const retryValues = compactSharedUi ? {} : mergeSharedStateConflictValues(response.current.values || {}, pendingValues);",
    "-      if (compactSharedUi) {",
    "-        transport: compactSharedUi ? \"shared-ui-ack\" : \"snapshot\",",
  ]);
  const reviewedNomenclatureRuntimeAdditions = new Set([
    "+import {",
    "+  applyNomenclatureDirectoryMutation,",
    "+  parseCompleteDirectoryProjection,",
    "+} from \"../nomenclature/durable_directory_mutation.js\";",
    "+  let nomenclatureDurableMutationInFlight = false;",
    "+    || nomenclatureDurableMutationInFlight",
    "+    persistNomenclatureDirectoryMutationDurably,",
  ]);
  const reviewedNomenclatureRuntimeHunkSignatures = new Set([
    "+    executeNomenclatureServerCommand = async () => ({ ok: false, status: 0, code: \"owner-unavailable\", error: \"Nomenclature command owner is unavailable\" }),",
    "+    isNomenclatureServerCommandsPrimary = () => false,",
    "+    refreshNomenclatureReactProjection = () => false,",
    "+  const nomenclatureCommandAttemptRevisions = new Map();",
    "+    // Requests with different projections can finish out of order. Never let",
    "+      if (!refreshNomenclatureReactProjection()) render({ skipRememberScroll: true });",
    "+function rememberSharedStateValueHydration(valueKeys = [], version = 0) {",
    "+    rememberSharedStateValueHydration(",
    "+    if (throwOnError) throw error;",
    "+async function hydratePlanningSnapshotFallback() {",
    "+function isDirectoryStateReason(reason = \"\") {",
    "+  if (nomenclatureDurableMutationInFlight) {",
    "+  const keepsQueuedDirectoryWrite = isDirectoryStateReason(pendingReason)",
    "+    : getSharedStateValuesForReason(sharedStateStatus.pendingReason);",
    "+    : (sharedStateStatus.pendingValues || getSharedStateValuesForReason(reason));",
    "+      pendingValues = getSharedStateValuesForReason(reason);",
    "+      if (!Object.prototype.hasOwnProperty.call(pendingValues, DIRECTORY_STORAGE_KEY)) {",
    "+        pendingValues = getSharedStateValuesForReason(reason);",
    "+      const acknowledgedDirectory = Object.prototype.hasOwnProperty.call(pendingValues, DIRECTORY_STORAGE_KEY);",
    "+    const version = Number(snapshot.version || 0);",
    "+    if (metadataOnly && valueProjectionEpoch !== sharedStateValueProjectionEpoch) {",
    "+  // Publish the boot flag before starting the asynchronous shared-state",
    "+function applyAuthoritativeNomenclatureProjection(projection = null) {",
    "+    persistNomenclatureDirectoryMutationDurably,",
  ]);
  const reviewedNomenclatureRuntimeExactHunkChanges = new Set([
    [
      "+  if (isNomenclatureServerCommandsPrimary()) {",
      "+    // Directory is still a monolithic compatibility blob. Once Nomenclature",
      "+    // commands are primary, a generic save cannot prove that its local copy",
      "+    // includes the latest command-owned rows (or unlink side effects in BOM",
      "+    // and specifications). Roll back the in-memory mutation and fail visibly",
      "+    // until that section has its own owner command; never report a local-only",
      "+    // success or overwrite a newer Nomenclature projection.",
      "+    if (previousState) {",
      "+      directoryState = previousState;",
      "+      commitRuntimeState();",
      "+    }",
      "+    return false;",
      "+  }",
    ],
    [
      "+  return true;",
    ],
    [
      "-  }",
      "+}",
    ],
    [
      "-      sharedStateStatus.version = Number(response.current?.version || sharedStateStatus.version);",
      "+      sharedStateStatus.version = Math.max(",
      "+        Number(sharedStateStatus.version || 0),",
      "+        Number(response.current?.version || 0),",
      "+      );",
    ],
    [
      "-      sharedStateStatus.version = Number(response.current.version || sharedStateStatus.version);",
      "+      sharedStateStatus.version = Math.max(",
      "+        Number(sharedStateStatus.version || 0),",
      "+        Number(response.current.version || 0),",
      "+      );",
    ],
    [
      "-        sharedStateStatus.version = Number(response.current?.version || sharedStateStatus.version);",
      "+        sharedStateStatus.version = Math.max(",
      "+          Number(sharedStateStatus.version || 0),",
      "+          Number(response.current?.version || 0),",
      "+        );",
    ],
    [
      "-    const version = Number(snapshot.version || 0);",
    ],
    [
      "-    sharedStateStatus.version = Number(snapshot.version || 0);",
      "+    sharedStateStatus.version = Math.max(",
      "+      Number(sharedStateStatus.version || 0),",
      "+      Number(snapshot.version || 0),",
      "+    );",
    ],
  ].map((lines) => JSON.stringify(lines)));
  const reviewedPlanningLegacyQuiesceRuntimeHunkSignatures = new Set([
    "+    isPlanningLegacyWritesQuiesced = () => false,",
    "+  let legacyDomainRestoreRequiresRefresh = false;",
    "+  if (legacyDomainRestoreRequiresRefresh) return false;",
    "+  if (isPlanningLegacyWritesQuiesced() && !isCompactSharedUiReason(requestedReason)) {",
    "+function discardBlockedLegacyDomainWriteIntent() {",
    "+  if (isPlanningLegacyWritesQuiesced() && !isCompactSharedUiReason(reason)) {",
    "+    if (response.legacyDomainWritesQuiesced === true",
    "+      if (response.legacyDomainWritesQuiesced === true",
    "+function restoreAuthoritativeLegacyDomainSnapshot() {",
    "+  if (isPlanningLegacyWritesQuiesced() && !sharedStateApplyingRemote) {",
  ]);
  const runtimeStateDiffLines = runtimeStateDiff.split("\n");
  const reviewedRuntimeLineIndexes = new Set();
  let runtimeHunkStart = -1;
  const reviewRuntimeHunk = (endIndex) => {
    if (runtimeHunkStart < 0) return;
    const hunkLines = runtimeStateDiffLines.slice(runtimeHunkStart, endIndex);
    const hunkChanges = hunkLines.filter((line) => (
      (line.startsWith("+") && !line.startsWith("+++"))
      || (line.startsWith("-") && !line.startsWith("---"))
    ));
    if (!hunkLines.some((line) => reviewedNomenclatureRuntimeHunkSignatures.has(line))
      && !reviewedNomenclatureRuntimeExactHunkChanges.has(JSON.stringify(hunkChanges))
      && !hunkLines.some((line) => reviewedPlanningLegacyQuiesceRuntimeHunkSignatures.has(line))) return;
    for (let index = runtimeHunkStart; index < endIndex; index += 1) {
      reviewedRuntimeLineIndexes.add(index);
    }
  };
  runtimeStateDiffLines.forEach((line, index) => {
    if (!line.startsWith("@@")) return;
    reviewRuntimeHunk(index);
    runtimeHunkStart = index;
  });
  reviewRuntimeHunk(runtimeStateDiffLines.length);
  const unexpectedRuntimeStateLines = runtimeStateDiffLines.filter((line, index) => (
    (line.startsWith("+") && !line.startsWith("+++") && !allowedRuntimeStateAdditions.has(line) && !reviewedNomenclatureRuntimeAdditions.has(line) && !reviewedRuntimeLineIndexes.has(index))
    || (line.startsWith("-") && !line.startsWith("---") && !allowedRuntimeStateRemovals.has(line) && !reviewedRuntimeLineIndexes.has(index))
  ));
  assert.deepEqual(unexpectedRuntimeStateLines, [], `frontend migration changed runtime state outside the reviewed directory-removal flush:\n${unexpectedRuntimeStateLines.join("\n")}`);
  const runtimeStateContractSource = await readFile(join(repositoryRoot, "src/modules/runtime_state/service.js"), "utf8");
  const runtimeFunctionSource = (startMarker, endMarker) => {
    const start = runtimeStateContractSource.indexOf(startMarker);
    const end = runtimeStateContractSource.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0 && end > start, `runtime-state contract markers are missing: ${startMarker} -> ${endMarker}`);
    return runtimeStateContractSource.slice(start, end);
  };
  const scheduleSharedStatePushSource = runtimeFunctionSource("function scheduleSharedStatePush", "function mergeSystemDomainsAttendanceConflict");
  const pushSharedStateSource = runtimeFunctionSource("async function pushSharedState", "async function pollSharedState");
  const discardBlockedIntentSource = runtimeFunctionSource("function discardBlockedLegacyDomainWriteIntent", "function disableSharedStateAfterLegacyDomainRestoreFailure");
  const restoreLegacyDomainSource = runtimeFunctionSource("function restoreAuthoritativeLegacyDomainSnapshot", "function persistState");
  const persistStateSource = runtimeFunctionSource("function persistState", "function recoverPlanningStateFromStorageIfRuntimeEmpty");
  const persistDirectoryStateSource = runtimeFunctionSource("function persistDirectoryState()", "let planningCoreService");
  assert.match(scheduleSharedStatePushSource, /if \(legacyDomainRestoreRequiresRefresh\) return false;[\s\S]*if \(isPlanningLegacyWritesQuiesced\(\) && !isCompactSharedUiReason\(requestedReason\)\) \{[\s\S]*discardBlockedLegacyDomainWriteIntent\(\);[\s\S]*restoreAuthoritativeLegacyDomainSnapshot\(\);[\s\S]*return false;/, "known Planning evaluation must discard a queued legacy-domain intent and restore authority before any scheduled POST");
  assert.match(pushSharedStateSource, /if \(legacyDomainRestoreRequiresRefresh\) return false;[\s\S]*if \(isPlanningLegacyWritesQuiesced\(\) && !isCompactSharedUiReason\(reason\)\) \{[\s\S]*discardBlockedLegacyDomainWriteIntent\(\);[\s\S]*restoreAuthoritativeLegacyDomainSnapshot\(\);[\s\S]*return false;/, "the direct push entry point must independently fail closed when the evaluation flag is already known");
  const quiesceResponseMarkers = [...pushSharedStateSource.matchAll(/if \(response\.legacyDomainWritesQuiesced === true\s*\|\| response\.planningLegacyWritesQuiesced === true\) \{/g)].map((match) => match.index);
  const genericConflictMarkers = [...pushSharedStateSource.matchAll(/if \(response\.conflict && response\.current\) \{/g)].map((match) => match.index);
  assert.equal(quiesceResponseMarkers.length, 2, "both the first POST and its one conflict retry must consume the dedicated legacy-domain quiesce marker");
  assert.ok(genericConflictMarkers.length >= 2
    && quiesceResponseMarkers[0] < genericConflictMarkers[0]
    && quiesceResponseMarkers[1] < genericConflictMarkers[1], "authority quiesce must terminate each POST stage before its generic conflict/retry branch");
  assert.match(discardBlockedIntentSource, /pendingReason = "";[\s\S]*pendingWriteMode = "";[\s\S]*pendingValues = null;[\s\S]*pendingSharedUi = null;[\s\S]*pendingSharedUiFull = null;[\s\S]*clearTimeout\(sharedStateStatus\.saveTimer\)[\s\S]*removeItem\(SHARED_UI_LOCAL_DIRTY_KEY\)/, "a denied legacy-domain intent must clear every in-memory, timer and durable replay channel");
  assert.match(restoreLegacyDomainSource, /requestSharedState\("GET"\)[\s\S]*snapshot\.configured === false \|\| !snapshot\.values[\s\S]*applySharedStateSnapshot\(snapshot, \{[\s\S]*allowSharedUiOnly: false,[\s\S]*preserveLocalSharedUi: false,[\s\S]*disableSharedStateAfterLegacyDomainRestoreFailure\(\)/, "legacy-domain recovery must fetch and apply one complete canonical projection or disable this tab until refresh");
  assert.equal((runtimeStateContractSource.match(/legacyDomainRestoreRequiresRefresh\s*=\s*false/g) || []).length, 1, "a failed authority restore must not be reset inside the running page");
  assert.match(persistStateSource, /if \(isPlanningLegacyWritesQuiesced\(\) && !sharedStateApplyingRemote\) \{[\s\S]*discardBlockedLegacyDomainWriteIntent\(\);[\s\S]*restoreAuthoritativeLegacyDomainSnapshot\(\);[\s\S]*return \{ changed: false, blocked: true \};[\s\S]*localStorage\.setItem\(STORAGE_KEY/, "legacy Planning persistence must be blocked before local storage or shared-state mutation");
  assert.match(persistDirectoryStateSource, /if \(isPlanningLegacyWritesQuiesced\(\) && !sharedStateApplyingRemote\) \{[\s\S]*discardBlockedLegacyDomainWriteIntent\(\);[\s\S]*restoreAuthoritativeLegacyDomainSnapshot\(\);[\s\S]*return false;[\s\S]*localStorage\.setItem\(DIRECTORY_STORAGE_KEY/, "legacy Directory persistence must be blocked and canonically restored before any local write");
  await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/shared-state-runtime-rebase-qa.mjs")], { cwd: repositoryRoot });
  assert.match(runtimeStateContractSource, /isNomenclatureServerCommandsPrimary = \(\) => false/, "Nomenclature command-primary dependency must default off so the CAS rollback remains selectable");
  assert.match(runtimeStateContractSource, /function persistDirectoryState\(\)[\s\S]*if \(isNomenclatureServerCommandsPrimary\(\)\)[\s\S]*directoryState = previousState;[\s\S]*return false;[\s\S]*localStorage\.setItem\(DIRECTORY_STORAGE_KEY[\s\S]*return true;/, "command-primary must reject monolithic Directory writes while the unchanged rollback path remains selectable");
  assert.match(runtimeStateContractSource, /function getSharedStateValuesForReason\(reason = "snapshot"\)[\s\S]*isDirectoryStateReason\(reason\) && !isNomenclatureServerCommandsPrimary\(\)[\s\S]*delete values\[DIRECTORY_STORAGE_KEY\]/, "generic snapshots must retain Directory only in the command-primary-off rollback path");
  assert.match(runtimeStateContractSource, /async function persistNomenclatureDirectoryMutationDurably\(intent = \{\}\)[\s\S]*if \(isNomenclatureServerCommandsPrimary\(\)\)[\s\S]*persistNomenclatureServerCommandDurably\(intent\)[\s\S]*requestSharedState\("GET", null, \{ valueKeys: \[DIRECTORY_STORAGE_KEY\] \}\)/, "durable Nomenclature writes must split exactly between server-command primary and CAS rollback");
  assert.match(runtimeStateContractSource, /executeNomenclatureServerCommand\(intent, attempt\.revision\)[\s\S]*applyAuthoritativeNomenclatureProjection\(result\.projection\)[\s\S]*code: "command-superseded"/, "command-primary writes must use the hydrated revision and reject superseded replay as user success");
  assert.match(runtimeStateContractSource, /if \(result\?\.conflict && result\.projection\)[\s\S]*applyAuthoritativeNomenclatureProjection\(result\.projection\)[\s\S]*return getNomenclatureServerCommandFailure\(result\)/, "trusted conflict projection may refresh state but the command must remain failed");
  assert.match(runtimeStateContractSource, /requestSharedState\("POST", \{[\s\S]*responseMode: "ack",[\s\S]*values: \{ \[DIRECTORY_STORAGE_KEY\]: JSON\.stringify\(mutation\.directory\) \}[\s\S]*if \(response\.conflict === true\)/, "command-primary-off rollback must retain the narrow fail-closed CAS acknowledgement");

  const commandParityMatrix = JSON.parse(await readFile(join(labRoot, "command-parity-matrix.json"), "utf8"));
  const expectedCommandScenarioIds = [
    "authPicker", "boards", "componentTypes", "contourAdmin", "employeeDesktop", "gantt",
    "nomenclature", "nomenclatureTypes", "operations", "planningWorkbench", "roles",
    "shiftMasterBoard", "shiftWorkOrders", "specifications2", "statuses", "structureEmployees",
    "structureEquipment", "structureMigrationDiagnostics", "structureOrgUnits", "structurePositions",
    "structureResponsibilityPolicies", "structureWorkCenters", "timesheet", "weeklyProductionControl",
  ];
  assert.equal(commandParityMatrix.schemaVersion, 2, "command-parity matrix schema must be explicit");
  assert.equal(commandParityMatrix.updatedAt, "2026-07-21", "command parity evidence date must match the permanent Pilot acceptance checkpoint");
  assert.equal(commandParityMatrix.pilotAcceptance, "mixed-runtime-permanent-read-only-accepted", "command parity must distinguish two permanent read-only surfaces from the remaining legacy-default scenarios");
  assert.deepEqual(
    commandParityMatrix.scenarios.map((scenario) => scenario.id).sort(),
    expectedCommandScenarioIds,
    "every production-integrated React scenario must have one command-parity row",
  );
  assert.equal(new Set(commandParityMatrix.scenarios.map((scenario) => scenario.id)).size, 24, "command-parity scenario IDs must be unique");
  assert(commandParityMatrix.scenarios.every((scenario) => scenario.readParity === "local-production-shell"), "all registered scenarios must retain local production-shell read evidence");
  assert(commandParityMatrix.scenarios.every((scenario) => scenario.legacyRollback === true), "every scenario must retain a declared legacy rollback");
  assert(commandParityMatrix.scenarios.every((scenario) => ["slice-complete", "pending", "not-applicable"].includes(scenario.sliceParity)), "slice-parity status must use the closed vocabulary");
  assert.deepEqual(commandParityMatrix.scenarios.filter((scenario) => scenario.sliceParity === "slice-complete").map((scenario) => scenario.id), ["nomenclature", "componentTypes", "operations", "nomenclatureTypes", "statuses", "boards", "structureEmployees", "structurePositions", "structureOrgUnits", "structureWorkCenters", "structureEquipment", "structureResponsibilityPolicies", "roles", "timesheet", "planningWorkbench", "shiftWorkOrders", "shiftMasterBoard", "employeeDesktop", "specifications2", "gantt", "authPicker", "contourAdmin"], "twenty-two scenarios must retain locally complete vertical slices without claiming whole-module completion");
  assert.deepEqual(commandParityMatrix.scenarios.filter((scenario) => scenario.sliceParity === "not-applicable").map((scenario) => scenario.id), ["structureMigrationDiagnostics", "weeklyProductionControl"], "diagnostics and the read-only Weekly Control product module must have no command scope");
  assert.equal(commandParityMatrix.scenarios.filter((scenario) => scenario.sliceParity === "pending").length, 0, "no registered command slice may remain implicit or pending");
  assert.match(commandParityMatrix.scenarios.find((scenario) => scenario.id === "structureMigrationDiagnostics")?.nextVerticalScope || "", /permanent Pilot acceptance is complete on v\.1\.500\.21.*monitoring.*rollback evidence/);
  assert.match(commandParityMatrix.scenarios.find((scenario) => scenario.id === "weeklyProductionControl")?.nextVerticalScope || "", /runtime-independent production read-model accepted on v\.1\.500\.26.*monitoring.*previous rollback.*legacy dry-run evidence/);
  assert.doesNotMatch(commandParityMatrix.scenarios.find((scenario) => scenario.id === "structureMigrationDiagnostics")?.nextVerticalScope || "", /default-off/i, "permanent Diagnostics may not regress to default-off wording");
  assert.doesNotMatch(commandParityMatrix.scenarios.find((scenario) => scenario.id === "weeklyProductionControl")?.nextVerticalScope || "", /default-off/i, "permanent Weekly may not regress to default-off wording");
  assert.match(commandParityMatrix.scenarios.find((scenario) => scenario.id === "shiftWorkOrders")?.nextVerticalScope || "", /assignment, fact\/correction and typed Workshop source\/date navigation are locally complete.*Shift Execution and module owners.*Pilot write acceptance.*disposable cleanup/);
  assert.match(commandParityMatrix.scenarios.find((scenario) => scenario.id === "shiftMasterBoard")?.nextVerticalScope || "", /permanent React candidate.*manual lane movement.*typed commands.*existing owners.*Pilot write acceptance.*disposable cleanup/);
  assert.match(commandParityMatrix.scenarios.find((scenario) => scenario.id === "employeeDesktop")?.nextVerticalScope || "", /accepted Pilot read baseline.*task start.*fact.*Report write acceptance/);
  assert.match(commandParityMatrix.scenarios.find((scenario) => scenario.id === "specifications2")?.nextVerticalScope || "", /Pilot draft-row publication.*exact-revision work-order acceptance.*attachment binding.*route structure.*server-owned contracts/);
  assert.match(commandParityMatrix.scenarios.find((scenario) => scenario.id === "gantt")?.nextVerticalScope || "", /period, scale, zoom, expand\/collapse, quantity visibility and today are React-native.*existing UI-state owner.*without a toolbar fallback.*start-time reschedule is locally complete.*read-only slot edit.*schedule-mutating refresh.*dependency editing.*drag.*resize.*optimization remain separate/);
  assert.match(commandParityMatrix.scenarios.find((scenario) => scenario.id === "authPicker")?.nextVerticalScope || "", /Pilot PIN acceptance/);
  assert.match(commandParityMatrix.scenarios.find((scenario) => scenario.id === "contourAdmin")?.nextVerticalScope || "", /authenticated Admin acceptance/);
  assert(commandParityMatrix.scenarios.every((scenario) => typeof scenario.nextVerticalScope === "string" && scenario.nextVerticalScope.trim()), "every scenario must identify its next acceptance scope");

  const { stdout: performanceBudget } = await execFileAsync(process.execPath, [join(labRoot, "performance-budget.mjs")], { cwd: repositoryRoot });
  assert.match(performanceBudget, /"nomenclature"/);
  assert.match(performanceBudget, /"boards"/);
  assert.match(performanceBudget, /"structureEmployees"/);
  assert.match(performanceBudget, /"componentTypes"/);
  assert.match(performanceBudget, /"operations"/);
  assert.match(performanceBudget, /"nomenclatureTypes"/);
  assert.match(performanceBudget, /"statuses"/);
  assert.match(performanceBudget, /"structurePositions"/);
  assert.match(performanceBudget, /"structureOrgUnits"/);
  assert.match(performanceBudget, /"structureWorkCenters"/);
  assert.match(performanceBudget, /"structureEquipment"/);
  assert.match(performanceBudget, /"structureResponsibilityPolicies"/);
  assert.match(performanceBudget, /"structureMigrationDiagnostics"/);
  assert.match(performanceBudget, /"weeklyProductionControl"/);
  assert.match(performanceBudget, /"timesheet"/);
  assert.match(performanceBudget, /"planningWorkbench"/);
  assert.match(performanceBudget, /"shiftWorkOrders"/);
  assert.match(performanceBudget, /"shiftMasterBoard"/);
  assert.match(performanceBudget, /"employeeDesktop"/);
  assert.match(performanceBudget, /"contourAdmin"/);
  assert.match(performanceBudget, /"specifications2"/);

  await execFileAsync(process.execPath, [join(labRoot, "build.mjs")], { cwd: repositoryRoot });
  await execFileAsync(process.execPath, [join(repositoryRoot, "scripts/build.mjs")], { cwd: repositoryRoot });
  const productionIslandBundle = await readFile(join(repositoryRoot, "dist/src/react-islands/nomenclature.js"), "utf8");
  assert.match(productionIslandBundle, /mountNomenclatureReactIsland/);
  const productionBoardsIslandBundle = await readFile(join(repositoryRoot, "dist/src/react-islands/boards.js"), "utf8");
  assert.match(productionBoardsIslandBundle, /mountBoardsReactIsland/);
  const productionStructureIslandBundle = await readFile(join(repositoryRoot, "dist/src/react-islands/structure-employees.js"), "utf8");
  assert.match(productionStructureIslandBundle, /mountStructureEmployeesReactIsland/);
  const productionStructurePositionsBundle = await readFile(join(repositoryRoot, "dist/src/react-islands/structure-positions.js"), "utf8");
  assert.match(productionStructurePositionsBundle, /mountStructurePositionsReactIsland/);
  const productionStructureOrgUnitsBundle = await readFile(join(repositoryRoot, "dist/src/react-islands/structure-org-units.js"), "utf8"); assert.match(productionStructureOrgUnitsBundle, /mountStructureOrgUnitsReactIsland/);
  const productionStructureWorkCentersBundle = await readFile(join(repositoryRoot, "dist/src/react-islands/structure-work-centers.js"), "utf8"); assert.match(productionStructureWorkCentersBundle, /mountStructureWorkCentersReactIsland/);
  const productionStructureEquipmentBundle = await readFile(join(repositoryRoot, "dist/src/react-islands/structure-equipment.js"), "utf8"); assert.match(productionStructureEquipmentBundle, /mountStructureEquipmentReactIsland/);
  const productionStructureResponsibilityPoliciesBundle = await readFile(join(repositoryRoot, "dist/src/react-islands/structure-responsibility-policies.js"), "utf8"); assert.match(productionStructureResponsibilityPoliciesBundle, /mountStructureResponsibilityPoliciesReactIsland/);
  const productionStructureMigrationDiagnosticsBundle = await readFile(join(repositoryRoot, "dist/src/react-islands/structure-migration-diagnostics.js"), "utf8"); assert.match(productionStructureMigrationDiagnosticsBundle, /mountStructureMigrationDiagnosticsReactIsland/);
  const productionWeeklyProductionControlBundle = await readFile(join(repositoryRoot, "dist/src/react-islands/weekly-production-control.js"), "utf8"); assert.match(productionWeeklyProductionControlBundle, /mountWeeklyProductionControlReactIsland/);
  const productionRolesIslandBundle = await readFile(join(repositoryRoot, "dist/src/react-islands/roles.js"), "utf8");
  assert.match(productionRolesIslandBundle, /mountRolesReactIsland/);
  const productionComponentTypesBundle = await readFile(join(repositoryRoot, "dist/src/react-islands/component-types.js"), "utf8");
  assert.match(productionComponentTypesBundle, /mountComponentTypesReactIsland/);
  const productionOperationsBundle = await readFile(join(repositoryRoot, "dist/src/react-islands/operations.js"), "utf8");
  assert.match(productionOperationsBundle, /mountOperationsReactIsland/);
  const productionNomenclatureTypesBundle = await readFile(join(repositoryRoot, "dist/src/react-islands/nomenclature-types.js"), "utf8");
  assert.match(productionNomenclatureTypesBundle, /mountNomenclatureTypesReactIsland/);
  const productionStatusesBundle = await readFile(join(repositoryRoot, "dist/src/react-islands/statuses.js"), "utf8");
  assert.match(productionStatusesBundle, /mountStatusesReactIsland/);
  const productionSpecifications2Bundle = await readFile(join(repositoryRoot, "dist/src/react-islands/specifications2.js"), "utf8");
  assert.match(productionSpecifications2Bundle, /mountSpecifications2ReactIsland/);
  const productionAppBundle = await readFile(join(repositoryRoot, "dist/src/app.js"), "utf8");
  assert.doesNotMatch(productionAppBundle, /__MES_NOMENCLATURE_REACT_BUNDLE_VERSION__/);
  assert.doesNotMatch(productionAppBundle, /__MES_BOARDS_REACT_BUNDLE_VERSION__/);
  assert.doesNotMatch(productionAppBundle, /__MES_STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION__/);
  assert.doesNotMatch(productionAppBundle, /__MES_STRUCTURE_POSITIONS_REACT_BUNDLE_VERSION__/);
  assert.doesNotMatch(productionAppBundle, /__MES_STRUCTURE_ORG_UNITS_REACT_BUNDLE_VERSION__/);
  assert.doesNotMatch(productionAppBundle, /__MES_STRUCTURE_WORK_CENTERS_REACT_BUNDLE_VERSION__/);
  assert.doesNotMatch(productionAppBundle, /__MES_STRUCTURE_EQUIPMENT_REACT_BUNDLE_VERSION__/);
  assert.doesNotMatch(productionAppBundle, /__MES_STRUCTURE_RESPONSIBILITY_POLICIES_REACT_BUNDLE_VERSION__/);
  assert.doesNotMatch(productionAppBundle, /__MES_STRUCTURE_MIGRATION_DIAGNOSTICS_REACT_BUNDLE_VERSION__/);
  assert.doesNotMatch(productionAppBundle, /__MES_WEEKLY_PRODUCTION_CONTROL_REACT_BUNDLE_VERSION__/);
  assert.doesNotMatch(productionAppBundle, /__MES_ROLES_REACT_BUNDLE_VERSION__/);
  assert.doesNotMatch(productionAppBundle, /__MES_DIRECTORY_COMPONENT_TYPES_REACT_BUNDLE_VERSION__/);
  assert.doesNotMatch(productionAppBundle, /__MES_DIRECTORY_OPERATIONS_REACT_BUNDLE_VERSION__/);
  assert.doesNotMatch(productionAppBundle, /__MES_DIRECTORY_NOMENCLATURE_TYPES_REACT_BUNDLE_VERSION__/);
  assert.doesNotMatch(productionAppBundle, /__MES_DIRECTORY_STATUSES_REACT_BUNDLE_VERSION__/);
  assert.doesNotMatch(productionAppBundle, /__MES_SPECIFICATIONS2_REACT_BUNDLE_VERSION__/);
  console.log(`React migration QA passed: ${sources.length} typed sources, mixed immutable runtime policy, adapter boundary, UI markers, frozen backend guard, build.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
