import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createDirectoryPresentationModule } from "../src/modules/routes/directory_presentation.js";
import { createRoutesRenderModule } from "../src/modules/routes/render.js";

const assert = (value, message) => {
  if (!value) throw new Error(message);
};

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const appPath = join(root, "src", "app.js");
const appEventsPath = join(root, "src", "modules", "app_events", "service.js");
const routesRenderPath = join(root, "src", "modules", "routes", "render.js");
const presentationPath = join(root, "src", "modules", "routes", "directory_presentation.js");
const [appSource, appEventsSource, routesRenderSource, presentationSource] = await Promise.all([
  readFile(appPath, "utf8"),
  readFile(appEventsPath, "utf8"),
  readFile(routesRenderPath, "utf8"),
  readFile(presentationPath, "utf8"),
]);

assert(
  !appEventsSource.includes("function renderDirectoryTable("),
  "Directory table templates must not remain in the eager app events service",
);
assert(
  !appEventsSource.includes("directory-table-toolbar"),
  "Directory table markup must not remain in the eager app events service",
);
assert(
  routesRenderSource.includes('import { createDirectoryPresentationModule } from "./directory_presentation.js";'),
  "Routes renderer must own the lazy directory presentation dependency",
);
assert(
  routesRenderSource.includes("const directoryPresentation = createDirectoryPresentationModule({"),
  "Routes renderer must construct the directory presentation facade after it loads",
);
assert(
  routesRenderSource.includes("renderDirectoryTable,\n    renderDirectoryPage,"),
  "Routes renderer must retain a directory table facade for the lazy runtime",
);
assert(
  appSource.includes('import("./modules/routes/render.js")'),
  "App must continue to reach directory presentation only through the routes render chunk",
);
assert(
  presentationSource.includes("directory-table-toolbar"),
  "Lazy presentation module must retain the directory table markup",
);

const escape = (value = "") => String(value ?? "");
const statusRow = {
  id: "route-draft",
  name: "Черновик",
  audit: "Ядро",
  impactView: "",
};
const directoryData = {
  sectionId: "statuses",
  caption: "Проверка статусов",
  columns: ["Название", "Аудит", "Влияние"],
  keys: ["name", "audit", "impactView"],
  rows: [statusRow],
  visibleRows: [{ row: statusRow, rowIndex: 0 }],
  activeFilterCount: 0,
  readOnly: false,
};

const presentation = createDirectoryPresentationModule({
  escapeAttribute: escape,
  escapeHtml: escape,
  formatDirectoryCell: (_sectionId, _key, value) => value ?? "",
  getDirectoryColumnFilterOptions: () => [{ value: "Черновик", count: 1 }],
  getDirectoryColumnFilterValues: () => [],
  getDirectoryHealth: () => ({ ready: 1, review: 0 }),
  getSelectedDirectoryRowIndex: () => 0,
  getStatusAuditInfo: () => ({ label: "Ядро", tone: "core", meta: "Критический контракт" }),
  getStatusImpactMap: () => ({
    decision: "Ядро",
    decisionTone: "critical",
    modules: ["Заказ-наряды"],
    blocks: "переход",
    changes: "состояние",
    deleteRule: "нельзя удалить",
    note: "Контракт",
  }),
  getStatusImpactParts: () => [{ label: "Роль", value: "Ядро" }],
  getStatusLifecycleModules: () => ({ originModule: "Маршрут", changeModule: "Планирование" }),
  getStatusNextDocumentView: () => "Заказ-наряд",
  getStatusTransitionView: () => "Маршрут → Планирование",
  icon: (name) => `<svg data-icon="${name}"></svg>`,
  joinUiClasses: (...values) => values.filter(Boolean).join(" "),
  normalizeDirectoryFilterSearch: (value) => String(value).toLowerCase(),
});

const tableMarkup = presentation.renderDirectoryTable(directoryData);
assert(tableMarkup.includes("directory-table-toolbar"), "Lazy facade must render the directory toolbar");
assert(tableMarkup.includes("data-directory-filter"), "Lazy facade must retain column filters");
assert(tableMarkup.includes("status-audit-token is-core"), "Lazy facade must retain status audit cells");
assert(tableMarkup.includes("data-edit-directory-row"), "Lazy facade must retain row actions");

const passthrough = ({ body = "", content = "", sidebar = "", header = "", actions = "" } = {}) => `${sidebar}${header}${body}${content}${actions}`;
const routesRuntime = createRoutesRenderModule({
  escapeAttribute: escape,
  escapeHtml: escape,
  formatDirectoryCell: (_sectionId, _key, value) => value ?? "",
  getDirectoryColumnFilterOptions: () => [{ value: "Черновик", count: 1 }],
  getDirectoryColumnFilterValues: () => [],
  getDirectoryData: () => directoryData,
  getDirectoryHealth: () => ({ ready: 1, review: 0 }),
  getSelectedDirectoryRowIndex: () => 0,
  getStatusAuditInfo: () => ({ label: "Ядро", tone: "core", meta: "Критический контракт" }),
  getStatusImpactMap: () => ({ decision: "Ядро", decisionTone: "critical", modules: ["Заказ-наряды"], blocks: "переход", changes: "состояние", deleteRule: "нельзя удалить", note: "Контракт" }),
  getStatusImpactParts: () => [{ label: "Роль", value: "Ядро" }],
  getStatusLifecycleModules: () => ({ originModule: "Маршрут", changeModule: "Планирование" }),
  getStatusNextDocumentView: () => "Заказ-наряд",
  getStatusTransitionView: () => "Маршрут → Планирование",
  getVisibleDirectoryGroups: () => [{ label: "Основные", sections: [{ id: "statuses", label: "Статусы", count: () => 1 }] }],
  getVisibleDirectorySections: () => [{ id: "statuses", label: "Статусы", description: "Контракт", count: () => 1 }],
  icon: (name) => `<svg data-icon="${name}"></svg>`,
  joinUiClasses: (...values) => values.filter(Boolean).join(" "),
  normalizeDirectoryFilterSearch: (value) => String(value).toLowerCase(),
  planningState: { routes: [] },
  renderDirectoryEditorModal: () => "",
  renderDirectoryReaderModal: () => "",
  renderUiActionButton: ({ label = "", attributes = "" } = {}) => `<button ${attributes}>${label}</button>`,
  renderUiModuleHeader: ({ title = "", description = "", actions = "" } = {}) => `${title}${description}${actions}`,
  renderUiModulePage: passthrough,
  renderUiModuleSidebar: passthrough,
  renderUiPanelBody: passthrough,
  renderUiSidebarItem: ({ title = "", attributes = "" } = {}) => `<button ${attributes}>${title}</button>`,
  renderUiStatusToken: (label = "") => label,
  ui: { activeDirectory: "statuses" },
});
const routesMarkup = routesRuntime.renderDirectoryPage();
assert(routesMarkup.includes("directory-table-toolbar"), "Direct directories runtime must render the lazy table facade");
assert(routesMarkup.includes("Статусы"), "Direct directories runtime must retain the selected directory");

try {
  const bundledAppPath = join(root, "dist", "src", "app.js");
  const bundledApp = await readFile(bundledAppPath, "utf8");
  const [bundledAppStat, ...sourceStats] = await Promise.all([
    stat(bundledAppPath),
    stat(appPath),
    stat(appEventsPath),
    stat(routesRenderPath),
    stat(presentationPath),
  ]);
  if (sourceStats.some((sourceStat) => sourceStat.mtimeMs > bundledAppStat.mtimeMs)) {
    console.log("Directory presentation bundle check skipped: dist is older than source");
  } else {
  const chunkDir = join(root, "dist", "src", "chunks");
  const chunkEntries = await readdir(chunkDir);
  const chunkSources = await Promise.all(chunkEntries
    .filter((entry) => entry.endsWith(".js"))
    .map(async (entry) => ({ entry, source: await readFile(join(chunkDir, entry), "utf8") })));
  const routesRenderChunk = chunkSources.find(({ source }) => (
    source.includes("createRoutesRenderModule") && source.includes("directory-table-toolbar")
  ));
  assert(routesRenderChunk, "Routes render chunk must contain the lazy directory presentation");
  assert(!bundledApp.includes("directory-table-toolbar"), "Bootstrap bundle must exclude directory table templates");
  assert(bundledApp.includes(`./chunks/${routesRenderChunk.entry}`), "Bootstrap bundle must only reach directory presentation through the routes render chunk");
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log("Directory presentation lazy-load QA passed");
