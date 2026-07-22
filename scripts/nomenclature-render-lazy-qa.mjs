import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const assert = (value, message) => { if (!value) throw new Error(message); };
const appPath = fileURLToPath(new URL("../src/app.js", import.meta.url));
const retiredProductsRenderPath = fileURLToPath(new URL("../src/modules/products/render.js", import.meta.url));
const productsRuntimePath = fileURLToPath(new URL("../src/modules/products/compatibility_runtime.js", import.meta.url));
const nomenclatureRenderPath = fileURLToPath(new URL("../src/modules/nomenclature/render.js", import.meta.url));
const nomenclatureHostPath = fileURLToPath(new URL("../src/modules/nomenclature/react_island_host.js", import.meta.url));
const boardsHostPath = fileURLToPath(new URL("../src/modules/nomenclature/boards_react_island_host.js", import.meta.url));
const featureRegistryPath = fileURLToPath(new URL("../src/feature_registry.js", import.meta.url));
const moduleRegistryPath = fileURLToPath(new URL("../src/module_registry.js", import.meta.url));

const [app, productsRuntime, nomenclatureHost, boardsHost, featureRegistry, moduleRegistry] = await Promise.all([
  readFile(appPath, "utf8"),
  readFile(productsRuntimePath, "utf8"),
  readFile(nomenclatureHostPath, "utf8"),
  readFile(boardsHostPath, "utf8"),
  readFile(featureRegistryPath, "utf8"),
  readFile(moduleRegistryPath, "utf8"),
]);

let retiredRendererExists = true;
try {
  await access(nomenclatureRenderPath);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  retiredRendererExists = false;
}

let retiredProductsRendererExists = true;
try {
  await access(retiredProductsRenderPath);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  retiredProductsRendererExists = false;
}

assert(!retiredRendererExists, "retired Nomenclature renderer must be physically absent");
assert(!retiredProductsRendererExists, "retired Products renderer path must be physically absent");
assert(!app.includes("modules/nomenclature/render.js"), "current Nomenclature runtime must not import the retired renderer");
assert(!app.includes("modules/products/render.js"), "current application runtime must not import the retired Products renderer path");
assert(!app.includes("ensureNomenclatureRenderModule"), "current Nomenclature runtime must not retain a legacy single-flight loader");
assert(!app.includes("renderNomenclatureModulePage") && !app.includes("renderNomenclaturePage"), "application route must not retain a legacy render wrapper");
assert(!productsRuntime.includes("renderNomenclatureModulePage") && !productsRuntime.includes("renderNomenclaturePage"), "Products compatibility runtime must not retain the legacy route wrapper");
assert(/canFallbackToLegacy:\s*\(\)\s*=>\s*false/.test(nomenclatureHost), "Nomenclature host must remain fail-closed in React");
assert(/canFallbackToLegacy:\s*\(\)\s*=>\s*false/.test(boardsHost), "Boards host must remain fail-closed in React");
assert(!featureRegistry.includes("src/modules/nomenclature/render.js"), "feature metadata must not reference the retired renderer");
assert(!moduleRegistry.includes("src/modules/nomenclature/render.js"), "module metadata must not reference the retired renderer");
assert(featureRegistry.includes("src/modules/nomenclature/react_island_host.js") && featureRegistry.includes("src/modules/nomenclature/boards_react_island_host.js"), "feature metadata must retain both React hosts");
assert(moduleRegistry.includes("src/modules/nomenclature/react_island_host.js") && moduleRegistry.includes("src/modules/nomenclature/boards_react_island_host.js"), "module metadata must retain both React hosts");

console.log("Nomenclature retired-renderer removal QA passed");
