import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { renderDispatchModulePage } from "../src/modules/dispatch/render.js";
import { withBundledTypeScriptClient } from "./typescript-client-qa-loader.mjs";

const { getMesModuleBlueprintDefinition } = await withBundledTypeScriptClient(
  new URL("../src/module_registry.js", import.meta.url),
  async (module) => module,
  { prefix: "mes-extracted-module-registry-qa-" },
);
const { createStructureEmployeesReactIslandHost } = await withBundledTypeScriptClient(
  new URL("../src/modules/production_structure_matrix/react_island_host.ts", import.meta.url),
  async (module) => module,
  { prefix: "mes-extracted-structure-host-qa-" },
);

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-extracted-render-ui-"));
let typedUi;
try {
  const output = join(temporaryRoot, "ui-render-runtime.mjs");
  await build({
    stdin: {
      contents: [
        'export { createUiRenderers } from "./src/ui/components.ts";',
        'export { createMesModulePatternRenderer } from "./src/ui/module_patterns.ts";',
        'export { escapeAttribute } from "./src/ui/html.ts";',
      ].join("\n"),
      resolveDir: fileURLToPath(new URL("..", import.meta.url)),
      sourcefile: "extracted-render-ui-entry.mjs",
      loader: "js",
    },
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    logLevel: "silent",
  });
  typedUi = await import(`${pathToFileURL(output).href}?qa=${Date.now()}`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

const { createMesModulePatternRenderer, createUiRenderers, escapeAttribute } = typedUi;

const failures = [];
const renderers = createUiRenderers({
  icon: (name) => `<svg data-smoke-icon="${escapeAttribute(name)}"></svg>`,
});
const renderMesModulePatternPage = createMesModulePatternRenderer({
  getBlueprint: getMesModuleBlueprintDefinition,
  renderUiModuleHeader: renderers.renderUiModuleHeader,
  renderUiModulePage: renderers.renderUiModulePage,
  renderUiModuleSidebar: renderers.renderUiModuleSidebar,
});

const dispatchHtml = renderDispatchModulePage({
  renderMesModulePatternPage,
  renderUiModuleHeader: renderers.renderUiModuleHeader,
  renderUiPanel: renderers.renderUiPanel,
  renderUiPanelBody: renderers.renderUiPanelBody,
  renderUiSystemState: renderers.renderUiSystemState,
});

check("dispatch rollback module", dispatchHtml, [
  "data-ui-component=\"ModulePage\"",
  "data-ui-runtime=\"hard-v1\"",
  "dispatch-page",
  "dispatch-placeholder-page",
  "dispatch-placeholder-panel",
  "data-ui-component=\"Panel\"",
  "data-ui-component=\"SystemState\"",
  "Диспетчерская временно отключена",
]);

const structureEmployeesHost = createStructureEmployeesReactIslandHost({
  getActivation: () => ({
    accessMode: "react",
    featureFlagEnabled: true,
    runtimeMode: "react",
    serverReadReady: true,
  }),
  getPayload: () => ({ registries: { employees: [] } }),
});
structureEmployeesHost.prepareRender();

check("production structure React host", structureEmployeesHost.renderTarget(), [
  "data-react-structure-employees-island",
  "data-react-island-runtime-mode=\"react\"",
  "data-ui-component=\"ModulePage\"",
  "production-structure-page",
  "Сотрудники",
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
