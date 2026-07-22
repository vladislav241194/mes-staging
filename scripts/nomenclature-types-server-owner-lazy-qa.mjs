import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appSource = await readFile(join(root, "src/app.js"), "utf8");

const section = (startMarker, endMarker) => {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `source boundary is missing: ${startMarker}`);
  return appSource.slice(start, end);
};

assert.doesNotMatch(
  appSource,
  /^import[^\n]*nomenclature_types\/server_owner_client\.js|^import\s*\{[^]*?\}\s*from\s*["']\.\/modules\/nomenclature_types\/server_owner_client\.js["'];/m,
  "Nomenclature Types server owner must not remain in the startup import graph",
);

const loaderSource = section(
  "function ensureNomenclatureTypesServerOwnerModule()",
  "const NOMENCLATURE_CAPABILITIES_RECHECK_MS",
);
assert.match(loaderSource, /import\("\.\/modules\/nomenclature_types\/server_owner_client\.js"\)/);
assert.match(loaderSource, /if \(nomenclatureTypesServerOwnerModuleLoad\) return nomenclatureTypesServerOwnerModuleLoad/);
assert.match(loaderSource, /prepareDeleteContract:\s*prepareNomenclatureTypeDeleteContract/);
assert.match(loaderSource, /nomenclatureTypesServerOwnerModuleError\s*=/);

const createSessionSource = section("async function createEmployeeServerSession", "function deleteEmployeeServerSession");
const reconcileSessionSource = section("function reconcileEmployeeServerSession", "function ensureNomenclatureServerCapabilities");
const finishElevationSource = section("function finishNomenclatureEmployeeElevation", "function cancelNomenclatureEmployeeElevation");
for (const source of [createSessionSource, reconcileSessionSource, finishElevationSource]) {
  assert.match(
    source,
    /if \(isNomenclatureTypesSurfaceActive\(\)\) void ensureNomenclatureTypesServerCapabilities\(\{ force: true \}\)/,
    "post-login Nomenclature Types capability refresh must be scoped to the active surface",
  );
}

const capabilitySource = section("function ensureNomenclatureTypesServerCapabilities", "function ensureNomenclatureTypesDeleteContracts");
assert.match(capabilitySource, /ensureNomenclatureTypesServerOwnerModule\(\)\.then/);
assert.match(capabilitySource, /ownerModule\.client\.getCapabilities\(\)/);

const commandSource = section("async function executeNomenclatureTypesServerCommand", "const directoryNomenclatureTypesReactIslandHost");
assert.match(commandSource, /const ownerModule = await ensureNomenclatureTypesServerOwnerModule\(\)/);
assert.match(commandSource, /code: "owner-unavailable"/);
assert.doesNotMatch(commandSource, /nomenclatureTypesServerOwnerClient\./);

const hostSource = section("const directoryNomenclatureTypesReactIslandHost", "const directoryStatusesReactIslandHost");
assert.match(
  hostSource,
  /isNomenclatureTypesSurfaceActive\(\) && nomenclatureTypesServerCapabilitiesState\.status === "idle"/,
  "inactive Directory sections must not load the Nomenclature Types owner",
);
assert.match(hostSource, /nomenclatureTypesServerOwnerModuleError[^]*code: "owner-unavailable"/);

const result = await build({
  entryPoints: { app: join(root, "src/app.js") },
  outdir: join(root, ".nomenclature-types-server-owner-lazy-qa"),
  bundle: true,
  splitting: true,
  format: "esm",
  target: "es2020",
  write: false,
  metafile: true,
  logLevel: "silent",
});
const outputs = Object.values(result.metafile.outputs);
const appOutput = outputs.find((output) => String(output.entryPoint || "").endsWith("src/app.js"));
const ownerInput = Object.keys(result.metafile.inputs)
  .find((input) => input.endsWith("src/modules/nomenclature_types/server_owner_client.js"));
const ownerOutput = outputs.find((output) => String(output.entryPoint || "").endsWith("src/modules/nomenclature_types/server_owner_client.js"));

assert(appOutput, "app entry output must be present in the bundle graph");
assert(ownerInput, "Nomenclature Types server owner must remain available as a lazy source module");
assert.equal(Boolean(appOutput.inputs?.[ownerInput]), false, "Nomenclature Types server owner must not be part of the startup app output");
assert(ownerOutput, "Nomenclature Types server owner must be emitted as a lazy route/command chunk");

console.log("Nomenclature Types server owner route-lazy graph QA passed.");
