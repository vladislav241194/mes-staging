import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syncGeneratedModuleBlueprintIndexes } from "./generate-module-blueprint-index.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = join(dirname(scriptPath), "..");

function readArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function toSlug(id = "") {
  return String(id)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function toPascal(id = "") {
  return String(id)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function renderBlueprint({ id, slug, label, icon, groupId, order, flowOrder, pattern, pascal }) {
  const sidebarPattern = ["sidebar-workspace", "registry-table", "tree-editor", "detail-workflow"].includes(pattern);
  return `import {
  MES_MODULE_HEADER_MODES,
  MES_MODULE_LAYOUT_PATTERNS,
  MES_MODULE_NAVIGATION_SCOPES,
  MES_MODULE_RUNTIME_CONTRACTS,
  MES_MODULE_RUNTIME_KINDS,
  MES_MODULE_RUNTIME_LIFECYCLES,
  MES_MODULE_SIDEBAR_MODES,
  defineMesModuleBlueprint,
} from "../../module_blueprint.js";

export const MODULE_BLUEPRINT = defineMesModuleBlueprint({
  id: "${id}",
  label: ${JSON.stringify(label)},
  icon: "${icon}",
  navigation: { groupId: "${groupId}", order: ${order}, scope: MES_MODULE_NAVIGATION_SCOPES.USER },
  layout: {
    pattern: MES_MODULE_LAYOUT_PATTERNS.${pattern.replace(/-([a-z])/g, (_, letter) => `_${letter.toUpperCase()}`).toUpperCase()},
    header: MES_MODULE_HEADER_MODES.REQUIRED,
    sidebar: MES_MODULE_SIDEBAR_MODES.${sidebarPattern ? "REQUIRED" : "ABSENT"},
    shellClassName: "${slug.replace(/_/g, "-")}-app-shell",
    pageClassName: "${slug.replace(/_/g, "-")}-page",
    ariaLabel: ${JSON.stringify(label)},
  },
  runtime: { kind: MES_MODULE_RUNTIME_KINDS.STANDARD, contract: MES_MODULE_RUNTIME_CONTRACTS.HARD, instanceKey: "${id}", lifecycle: MES_MODULE_RUNTIME_LIFECYCLES.BLUEPRINT_NATIVE, chrome: "standard" },
  qa: {
    smoke: true,
    visualWave: "reference",
    parity: { family: "${sidebarPattern ? "sidebar-standard" : "full-header"}", shell: "standard", page: "${sidebarPattern ? "sidebar" : "full"}", header: "required" },
    regression: { type: "contract", hasTable: false, hasActions: false },
  },
  access: { defaultRoleActions: { productionHead: ["view"] } },
  capabilities: { table: false, tree: false, actions: false, overlays: [] },
  flow: {
    order: ${flowOrder},
    contract: {
      label: ${JSON.stringify(label)},
      group: ${JSON.stringify(groupId === "loadPlanning" ? "Планирование нагрузки" : groupId === "operations" ? "Оперативное управление" : groupId === "technologies" ? "Технологии" : "Система")},
      role: ${JSON.stringify(`Безопасный read-only прототип модуля «${label}».`)},
      reads: [],
      writes: [],
      ganttImpact: "none",
      ganttVisualChange: "—",
      editPolicy: "Blueprint scaffold starts without storage, API, shared-state or write paths.",
    },
  },
  ownership: {
    files: ["src/modules/${slug}/blueprint.js", "src/modules/${slug}/render.js", "src/modules/${slug}/runtime.js"],
    css: [], storage: [], api: [], qa: [],
  },
  sourceFiles: ["src/modules/${slug}/blueprint.js", "src/modules/${slug}/render.js", "src/modules/${slug}/runtime.js"],
  prototypeNative: true,
});
`;
}

function renderPage({ id, label, pascal, pattern }) {
  const sidebarPattern = ["sidebar-workspace", "registry-table", "tree-editor", "detail-workflow"].includes(pattern);
  return `export function render${pascal}Page({ renderMesModulePatternPage, renderUiPanel, renderUiPanelBody, renderUiSystemState }) {
  return renderMesModulePatternPage({
    moduleId: "${id}",
    ${sidebarPattern ? `sidebar: { eyebrow: "Прототип", title: ${JSON.stringify(label)}, variant: "list", body: "" },\n    ` : ""}header: { eyebrow: "Прототип MES", title: ${JSON.stringify(label)}, description: "Каркас готов к доменному моделированию." },
    content: renderUiPanel({
      title: "Стартовый сценарий",
      meta: "read-only blueprint",
      body: renderUiPanelBody({ body: renderUiSystemState({
        iconName: "info",
        title: "Модуль подключен",
        text: "Добавьте доменную модель и renderer, не меняя app.js, меню или QA-списки.",
        tone: "neutral",
      }) }),
    }),
  });
}
`;
}

function renderRuntime({ pascal }) {
  return `import { render${pascal}Page } from "./render.js";

export function createModuleRuntimeAdapter(context = {}) {
  return {
    render: () => render${pascal}Page({
      renderMesModulePatternPage: context.renderMesModulePatternPage,
      renderUiPanel: context.renderUiPanel,
      renderUiPanelBody: context.renderUiPanelBody,
      renderUiSystemState: context.renderUiSystemState,
    }),
  };
}
`;
}

export async function scaffoldModule(options = {}) {
  const targetRoot = options.targetRoot ? resolve(options.targetRoot) : projectRoot;
  const id = String(options.id || readArg("id")).trim();
  const label = String(options.label || readArg("label")).trim();
  const slug = String(options.slug || readArg("slug") || toSlug(id)).trim();
  const icon = String(options.icon || readArg("icon", "info")).trim();
  const groupId = String(options.groupId || readArg("group", "operations")).trim();
  const pattern = String(options.pattern || readArg("pattern", "full-width")).trim();
  const order = Number(options.order || readArg("order", "90"));
  const flowOrder = Number(options.flowOrder || readArg("flow-order", "900"));
  const dryRun = options.dryRun === true || process.argv.includes("--dry-run");
  const allowedGroups = new Set(["loadPlanning", "operations", "technologies", "system"]);
  const allowedPatterns = new Set(["sidebar-workspace", "registry-table", "tree-editor", "matrix", "board", "calendar", "dashboard", "detail-workflow", "full-width"]);
  if (!/^[a-z][A-Za-z0-9]*$/.test(id)) throw new Error("--id must be a camelCase module id.");
  if (!label) throw new Error("--label is required.");
  if (!/^[a-z][a-z0-9_]*$/.test(slug)) throw new Error("--slug must use snake_case.");
  if (!allowedGroups.has(groupId)) throw new Error(`Unsupported --group: ${groupId}`);
  if (!allowedPatterns.has(pattern)) throw new Error(`Unsupported --pattern: ${pattern}`);
  if (!Number.isFinite(order) || !Number.isFinite(flowOrder)) throw new Error("--order and --flow-order must be numbers.");

  const moduleDir = join(targetRoot, "src", "modules", slug);
  if (await pathExists(moduleDir)) throw new Error(`Module directory already exists: src/modules/${slug}`);
  const pascal = toPascal(id);
  const files = new Map([
    [join(moduleDir, "blueprint.js"), renderBlueprint({ id, slug, label, icon, groupId, order, flowOrder, pattern, pascal })],
    [join(moduleDir, "render.js"), renderPage({ id, label, pascal, pattern })],
    [join(moduleDir, "runtime.js"), renderRuntime({ pascal })],
  ]);
  if (!dryRun) {
    await mkdir(moduleDir, { recursive: true });
    await Promise.all([...files].map(([path, source]) => writeFile(path, source)));
    if (targetRoot === projectRoot && options.syncIndexes !== false) {
      await syncGeneratedModuleBlueprintIndexes();
    }
  }
  return { id, slug, dryRun, files: [...files.keys()].map((path) => path.replace(`${targetRoot}/`, "")), targetRoot };
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const result = await scaffoldModule();
  console.log(`${result.dryRun ? "Dry-run" : "Created"} module ${result.id}: ${result.files.join(", ")}`);
}
