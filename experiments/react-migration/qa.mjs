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
  assert.equal(readModel.canCreateEdit, false, "write capability must fail closed");
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
  assert.equal(boardsAdapter.adaptBoardsModel({ bomLists: [], capabilities: { createEdit: true } }).canCreateEdit, true);
  assert.equal(boardsAdapter.adaptBoardsModel({ bomLists: [], capabilities: { createEdit: "true" } }).canCreateEdit, false, "non-boolean Boards write capability must fail closed");

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
  assert.equal(rolesAdapter.adaptRoles({ ...rolesFixture, capabilities: { metadataEdit: true } }).canEditMetadata, true, "Roles metadata capability must be explicit");
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
    ["orgUnits", 2, "legacy"],
    ["workCenters", 2, "legacy"],
    ["positions", 3, "legacy"],
    ["employees", 3, "employees"],
    ["equipment", 1, "legacy"],
    ["responsibilityPolicies", 1, "legacy"],
    ["migrationDiagnostics", 152, "legacy"],
  ], "only the Employees registry may remain inside the React vertical slice");
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
  assert.deepEqual(orgUnitsModel.orgUnits.map((orgUnit) => [orgUnit.id, orgUnit.kindLabel, orgUnit.parentOrgUnitLabel, orgUnit.statusLabel]), [["D-COATING", "Отдел", "—", "активно"], ["D-MANUAL", "Отдел", "—", "активно"]]);
  assert.equal(orgUnitsAdapter.adaptStructureOrgUnits({ registries: canonicalMigration.domains.registries }).orgUnits.length, 19, "no canonical org unit may be dropped");

  const workCentersAdapterOutput = join(temporaryRoot, "structure-work-centers-adapter.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/structure-work-centers/adapter.ts")], outfile: workCentersAdapterOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const workCentersAdapter = await import(`${pathToFileURL(workCentersAdapterOutput).href}?qa=${Date.now()}`);
  assert.deepEqual(workCentersAdapter.adaptStructureWorkCenters({ registries: { workCenters: {} } }).workCenters, []);
  const workCentersModel = workCentersAdapter.adaptStructureWorkCenters(structureEmployeesFixture);
  assert.deepEqual(workCentersModel.workCenters.map((entry) => [entry.id, entry.orgUnitLabel, entry.parentWorkCenterLabel, entry.planningLabel, entry.statusLabel]), [["D-COATING", "Отдел нанесения влагозащитных покрытий", "—", "активно", "активно"], ["D-MANUAL", "Отдел ручного монтажа", "—", "активно", "активно"]]);
  assert.equal(workCentersAdapter.adaptStructureWorkCenters({ registries: canonicalMigration.domains.registries }).workCenters.length, 19, "no canonical work center may be dropped");

  const equipmentAdapterOutput = join(temporaryRoot, "structure-equipment-adapter.mjs");
  await build({ entryPoints: [join(sourceRoot, "modules/structure-equipment/adapter.ts")], outfile: equipmentAdapterOutput, bundle: true, platform: "node", format: "esm", target: "node20" });
  const equipmentAdapter = await import(`${pathToFileURL(equipmentAdapterOutput).href}?qa=${Date.now()}`);
  assert.deepEqual(equipmentAdapter.adaptStructureEquipment({ registries: { equipment: {} } }).equipment, []);
  const equipmentModel = equipmentAdapter.adaptStructureEquipment(structureEmployeesFixture);
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
  const { adaptOperations } = await import(`${pathToFileURL(operationsAdapterOutput).href}?qa=${Date.now()}`);
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
  assert.equal(adaptNomenclatureTypesModel({ nomenclatureTypes: [], capabilities: { createEdit: true } }).canCreateEdit, true, "explicit Nomenclature Types write capability must cross the typed adapter");
  assert.equal(adaptNomenclatureTypesModel({ nomenclatureTypes: [], capabilities: { createEdit: "true" } }).canCreateEdit, false, "non-boolean Nomenclature Types write capability must fail closed");
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
  assert.equal(adaptStatusesModel({ statuses: [], capabilities: { createEditCustom: true } }).canCreateEditCustom, true);
  assert.equal(adaptStatusesModel({ statuses: [], capabilities: { createEditCustom: "true" } }).canCreateEditCustom, false, "non-boolean custom Status capability must fail closed");
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
  assert.match(shiftWorkOrdersScenarioSource, /onLoadPrintRenderer/);

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
  const shiftMasterBoardScenarioSource = await readFile(join(sourceRoot, "modules/shift-master-board/ShiftMasterBoardScenario.tsx"), "utf8");
  assert.match(shiftMasterBoardScenarioSource, /data-shift-master-board-focus/);
  assert.match(shiftMasterBoardScenarioSource, /onSelectFocus\?\.\(option\.id\)/);
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
  assert.match(nomenclatureIslandSource, /onRequestLegacy/);

  const boardsIslandSource = await readFile(join(sourceRoot, "boards-island.tsx"), "utf8");
  assert.match(boardsIslandSource, /export function mountBoardsReactIsland/);
  assert.match(boardsIslandSource, /onCommand/);

  const productsEventsSource = await readFile(join(repositoryRoot, "src/modules/products/events.js"), "utf8");
  assert.match(productsEventsSource, /function saveBomCommand/);
  assert.match(productsEventsSource, /\.\.\.\(previousBom \|\| \{\}\)/, "Board edit must retain hidden metadata before applying typed fields");
  assert.match(productsEventsSource, /projectId: String\(previousBom\?\.projectId \|\| ""\)/, "Board edit must retain its Specifications project reference");
  assert.match(productsEventsSource, /upsertBomResultToNomenclature\(row, row\.updatedAt\)/);

  const structureEmployeesIslandSource = await readFile(join(sourceRoot, "structure-employees-island.tsx"), "utf8");
  assert.match(structureEmployeesIslandSource, /export function mountStructureEmployeesReactIsland/);
  assert.match(structureEmployeesIslandSource, /onRequestLegacy/);

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
  assert.match(specifications2IslandSource, /onRequestLegacy/);

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
    "Boards must remain in legacy",
  );
  assert.deepEqual(
    makeProductionHost({ featureFlagEnabled: true, activePane: "items", accessMode: "editor" }).prepareRender(),
    { activateReact: false, reason: "write-parity-incomplete" },
    "edit-capable Nomenclature sessions must retain legacy commands",
  );
  const eligibleProductionHost = makeProductionHost({ featureFlagEnabled: true, activePane: "items", accessMode: "read-only-evaluation" });
  assert.deepEqual(eligibleProductionHost.prepareRender(), { activateReact: true, reason: "eligible" });
  assert.match(eligibleProductionHost.renderTarget(), /data-react-nomenclature-island/);

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
  assert.match(productionAppSource, /MES_REACT_NOMENCLATURE === true/);
  assert.match(productionAppSource, /MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /localHosts\.has\(window\.location\.hostname\)/);
  assert.match(productionAppSource, /params\.get\("qa-auth-bypass"\) !== "1"/);
  assert.match(productionAppSource, /params\.get\("react-nomenclature"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-nomenclature-readonly"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-nomenclature-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /params\.get\("qa-auth-bypass"\) === "1" \|\| Boolean\(getAuthenticatedAccessPerson\(\)\)/);
  assert.match(productionAppSource, /serverEvaluationAllowed && isNomenclatureReactEvaluationRequested\(\)/);
  assert.match(productionAppSource, /nomenclatureReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /reason === "unsupported-scope".*activeNomenclaturePane = "boards"/s);
  assert.match(productionAppSource, /MES_REACT_BOARDS === true/);
  assert.match(productionAppSource, /MES_REACT_BOARDS_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-boards"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-boards-readonly"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-boards-write"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-boards-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /authorizeSystemDomainAction\("nomenclature", "edit", \{ resourceId: "boards" \}\)/);
  assert.match(productionAppSource, /await ensureNomenclatureRenderModule\(\)/, "Boards write must await its lazy result-Nomenclature owner before mutation");
  assert.match(productionAppSource, /saveBomCommand\(\{/);
  assert.match(productionAppSource, /const activeReactHost = useBoardsHost \? boardsReactIslandHost : nomenclatureReactIslandHost/);
  assert.match(productionAppSource, /boardsReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_EMPLOYEES === true/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-structure-employees"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-structure-employees-readonly"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-structure-employees-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /systemDomainsServerReadState\.status === "server"/);
  assert.match(productionAppSource, /const structureReactHosts = \{ employees: structureEmployeesReactIslandHost, positions: structurePositionsReactIslandHost, orgUnits: structureOrgUnitsReactIslandHost, workCenters: structureWorkCentersReactIslandHost, equipment: structureEquipmentReactIslandHost, responsibilityPolicies: structureResponsibilityPoliciesReactIslandHost, migrationDiagnostics: structureMigrationDiagnosticsReactIslandHost \}/);
  assert.match(productionAppSource, /activeReactHost\.prepareRender\(\)/);
  assert.match(productionAppSource, /structureEmployeesReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /setProductionStructureMatrixActiveRegistry\(registryId \|\| "employees"\)/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_POSITIONS === true/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_POSITIONS_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-structure-positions"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-structure-positions-readonly"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-structure-positions-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /structurePositionsReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /setProductionStructureMatrixActiveRegistry\(registryId \|\| "positions"\)/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_ORG_UNITS === true/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_ORG_UNITS_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-structure-org-units-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /structureOrgUnitsReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_WORK_CENTERS === true/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_WORK_CENTERS_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-structure-work-centers-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /structureWorkCentersReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_EQUIPMENT === true/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_EQUIPMENT_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-structure-equipment-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /structureEquipmentReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES === true/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /structureResponsibilityPoliciesReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS === true/);
  assert.match(productionAppSource, /MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /productionStructureMatrixData = matrixData/);
  assert.match(productionAppSource, /legacyMatrixRows: productionStructureMatrixData\.PRODUCTION_STRUCTURE_MATRIX_ROWS/);
  assert.match(productionAppSource, /structureMigrationDiagnosticsReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /MES_REACT_WEEKLY_PRODUCTION_CONTROL === true/);
  assert.match(productionAppSource, /MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-weekly-production-control-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /weeklyProductionControlReactIslandHost\.prepareRender\(\)/);
  assert.match(productionAppSource, /weeklyProductionControlReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /ensureProductionStructureMatrixModule\(\);[\s\S]*?hydrateWeeklyPlanningPeriod\(\)/);
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
  assert.match(productionAppSource, /directoryOperationsReactIslandHost\.mount\(\)/);
  assert.match(productionAppSource, /workCenterLabel: appEventsService\.formatDirectoryCell/);
  assert.match(productionAppSource, /MES_REACT_DIRECTORY_NOMENCLATURE_TYPES === true/);
  assert.match(productionAppSource, /MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION === true/);
  assert.match(productionAppSource, /params\.get\("react-directory-nomenclature-types"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-directory-nomenclature-types-readonly"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-directory-nomenclature-types-write"\) === "1"/);
  assert.match(productionAppSource, /params\.get\("react-directory-nomenclature-types-evaluation"\) !== "1"/);
  assert.match(productionAppSource, /canEditDirectorySection\("nomenclatureTypes"\)/);
  assert.match(productionAppSource, /saveDirectoryRow\("nomenclatureTypes"/);
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
  assert.match(shiftMasterBoardHostSource, /onSelectFocus: selectFocus/);
  assert.match(productionAppSource, /selectFocus: \(focus = ""\)/);
  assert.match(productionAppSource, /ui\.shiftMasterBoardFocus = nextFocus/);
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
  assert.match(runtimeConfigSource, /MES_REACT_DIRECTORY_STATUSES:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_SPECIFICATIONS2:.*=== "1"/);
  assert.match(runtimeConfigSource, /MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION:.*=== "1"/);

  const { stdout: changedPathsOutput } = await execFileAsync("git", ["diff", "--name-only", acceptedPostgresBaseline], { cwd: repositoryRoot });
  const frozenBackendDiff = changedPathsOutput.split("\n").filter(isFrozenBackendPath);
  assert.deepEqual(frozenBackendDiff, [], `migration branch changed frozen backend contracts:\n${frozenBackendDiff.join("\n")}`);
  const { stdout: runtimeStateDiff } = await execFileAsync("git", ["diff", "--unified=0", acceptedPostgresBaseline, "--", "src/modules/runtime_state/service.js"], { cwd: repositoryRoot });
  const allowedRuntimeStateAdditions = new Set([
    "+async function persistDirectoryStateWithRemoval() {",
    "+  const previousValue = directoryEntityRemovalAllowed;",
    "+  directoryEntityRemovalAllowed = true;",
    "+  try {",
    "+    persistDirectoryState();",
    "+    return await pushSharedState(\"directory-removal\");",
    "+  } finally {",
    "+    directoryEntityRemovalAllowed = previousValue;",
    "+  }",
    "+}",
    "+",
    "+    persistDirectoryStateWithRemoval,",
  ]);
  const unexpectedRuntimeStateLines = runtimeStateDiff.split("\n").filter((line) => (
    (line.startsWith("+") && !line.startsWith("+++") && !allowedRuntimeStateAdditions.has(line))
    || (line.startsWith("-") && !line.startsWith("---"))
  ));
  assert.deepEqual(unexpectedRuntimeStateLines, [], `frontend migration changed runtime state outside the reviewed directory-removal flush:\n${unexpectedRuntimeStateLines.join("\n")}`);

  const commandParityMatrix = JSON.parse(await readFile(join(labRoot, "command-parity-matrix.json"), "utf8"));
  const expectedCommandScenarioIds = [
    "authPicker", "boards", "componentTypes", "contourAdmin", "employeeDesktop", "gantt",
    "nomenclature", "nomenclatureTypes", "operations", "planningWorkbench", "roles",
    "shiftMasterBoard", "shiftWorkOrders", "specifications2", "statuses", "structureEmployees",
    "structureEquipment", "structureMigrationDiagnostics", "structureOrgUnits", "structurePositions",
    "structureResponsibilityPolicies", "structureWorkCenters", "timesheet", "weeklyProductionControl",
  ];
  assert.equal(commandParityMatrix.schemaVersion, 1, "command-parity matrix schema must be explicit");
  assert.equal(commandParityMatrix.pilotAcceptance, "all-flags-off-baseline-accepted", "command parity must distinguish the accepted legacy baseline from pending React-island acceptance");
  assert.deepEqual(
    commandParityMatrix.scenarios.map((scenario) => scenario.id).sort(),
    expectedCommandScenarioIds,
    "every production-integrated React scenario must have one command-parity row",
  );
  assert.equal(new Set(commandParityMatrix.scenarios.map((scenario) => scenario.id)).size, 24, "command-parity scenario IDs must be unique");
  assert(commandParityMatrix.scenarios.every((scenario) => scenario.readParity === "local-production-shell"), "all registered scenarios must retain local production-shell read evidence");
  assert(commandParityMatrix.scenarios.every((scenario) => scenario.legacyRollback === true), "every scenario must retain a declared legacy rollback");
  assert(commandParityMatrix.scenarios.every((scenario) => ["local-complete", "pending", "not-applicable"].includes(scenario.commandParity)), "command-parity status must use the closed vocabulary");
  assert.deepEqual(commandParityMatrix.scenarios.filter((scenario) => scenario.commandParity === "local-complete").map((scenario) => scenario.id), ["nomenclature", "componentTypes", "operations", "nomenclatureTypes", "statuses", "boards", "structureEmployees", "structurePositions", "structureOrgUnits", "structureWorkCenters", "structureEquipment", "structureResponsibilityPolicies", "roles", "timesheet", "planningWorkbench", "shiftWorkOrders", "shiftMasterBoard", "employeeDesktop", "specifications2", "gantt"], "twenty scenarios must retain locally complete command parity");
  assert.deepEqual(commandParityMatrix.scenarios.filter((scenario) => scenario.commandParity === "not-applicable").map((scenario) => scenario.id), ["structureMigrationDiagnostics", "weeklyProductionControl"], "diagnostics and the read-only Weekly Control product module must have no command scope");
  assert.equal(commandParityMatrix.scenarios.filter((scenario) => scenario.commandParity === "pending").length, 2, "both remaining command scenarios must stay explicit");
  assert.match(commandParityMatrix.scenarios.find((scenario) => scenario.id === "shiftWorkOrders")?.nextVerticalScope || "", /Pilot read-only acceptance.*print\/package previews/);
  assert.match(commandParityMatrix.scenarios.find((scenario) => scenario.id === "shiftMasterBoard")?.nextVerticalScope || "", /Pilot read-only focus acceptance/);
  assert.match(commandParityMatrix.scenarios.find((scenario) => scenario.id === "employeeDesktop")?.nextVerticalScope || "", /Pilot task-start acceptance/);
  assert.match(commandParityMatrix.scenarios.find((scenario) => scenario.id === "specifications2")?.nextVerticalScope || "", /Pilot draft-row edit acceptance/);
  assert.match(commandParityMatrix.scenarios.find((scenario) => scenario.id === "gantt")?.nextVerticalScope || "", /Pilot dependency-inspection acceptance/);
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
  console.log(`React migration QA passed: ${sources.length} typed sources, production disabled-by-default island, adapter boundary, UI markers, frozen backend guard, build.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
