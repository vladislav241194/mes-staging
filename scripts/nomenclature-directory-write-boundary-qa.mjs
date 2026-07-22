import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createRuntimeStateServiceModule } from "../src/modules/runtime_state/service.js";

const DIRECTORY_STORAGE_KEY = "mes-qa-directory";
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => { memory.set(key, String(value)); },
  removeItem: (key) => { memory.delete(key); },
};

const storedDirectory = {
  nomenclature: [{ id: "server-row", name: "Server authority" }],
  bomLists: [{ id: "server-bom", name: "Server BOM" }],
  specifications: [],
};
let runtimeDirectory = {
  nomenclature: [{ id: "local-row", name: "Unowned local mutation" }],
  bomLists: [],
  specifications: [{ id: "local-spec", name: "Unowned local specification" }],
};
memory.set(DIRECTORY_STORAGE_KEY, JSON.stringify(storedDirectory));

const runtime = createRuntimeStateServiceModule({
  DIRECTORY_STORAGE_KEY,
  isNomenclatureServerCommandsPrimary: () => true,
  sharedStateStatus: {},
  getDirectoryState: () => runtimeDirectory,
  setDirectoryState: (value) => { runtimeDirectory = value; },
});

assert.equal(runtime.persistDirectoryState(), false, "command-primary must reject a generic Directory persist");
assert.deepEqual(runtimeDirectory, storedDirectory, "a rejected generic persist must restore the last acknowledged local projection");
assert.deepEqual(JSON.parse(memory.get(DIRECTORY_STORAGE_KEY)), storedDirectory, "a rejected generic persist must not change localStorage");
assert.match(
  await runtime.persistDirectoryStateDurably("qa-unowned-directory-write"),
  /серверная команда/i,
  "durable compatibility callers must receive an explicit owner-command error",
);

const sources = Object.fromEntries(await Promise.all([
  "src/app.js",
  "src/modules/app_events/service.js",
  "src/modules/planning_routes/service.js",
  "src/modules/products/events.js",
  "src/modules/products/render.js",
  "src/modules/runtime_state/service.js",
].map(async (file) => [file, await readFile(new URL(`../${file}`, import.meta.url), "utf8")])));

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(end, -1, `missing boundary after ${name}`);
  return source.slice(start, end);
}

const app = sources["src/app.js"];
const appEvents = sources["src/modules/app_events/service.js"];
const planningRoutes = sources["src/modules/planning_routes/service.js"];
const productsEvents = sources["src/modules/products/events.js"];
const productsRender = sources["src/modules/products/render.js"];
const runtimeState = sources["src/modules/runtime_state/service.js"];

assert.match(runtimeState, /if \(isNomenclatureServerCommandsPrimary\(\)\) \{[\s\S]*?directoryState = previousState;[\s\S]*?return false;/);
assert.match(runtimeState, /if \(persistDirectoryState\(\) === false\) return LEGACY_DIRECTORY_WRITE_BLOCK_MESSAGE;/);
assert.match(runtimeState, /delete values\[DIRECTORY_STORAGE_KEY\];[\s\S]*?delete values\[DIRECTORY_DEFAULTS_STORAGE_KEY\];/);

const directoryCapability = functionBody(app, "canEditDirectorySection", "canEditCustomStatusDirectorySection");
assert(directoryCapability.indexOf("isNomenclatureServerCommandsPrimary()") < directoryCapability.indexOf("authorizeSystemDomainAction"), "Directory controls must become read-only before RBAC grants are considered");
assert.match(functionBody(app, "canEditCustomStatusDirectorySection", "isUserManagedDirectoryStatus"), /isNomenclatureServerCommandsPrimary\(\).*return false/s);
assert.match(app, /function canWriteBoardsReact[\s\S]*?!isLegacyDirectoryWriteBlocked\(\)[\s\S]*?authorizeSystemDomainAction\("nomenclature", "edit", \{ resourceId: "boards" \}\)/, "Boards React writes must fail closed under command-primary before RBAC can grant them");
assert.match(app, /const boardsReactIslandHost[\s\S]*?capabilities:\s*\{[\s\S]*?createEdit: canWrite,[\s\S]*?delete: canWrite,[\s\S]*?bomImport: canWrite/, "Boards React must expose the fail-closed write decision to every visible editor capability");
assert.match(app, /const commitSpecifications2Publication[\s\S]*?if \(isLegacyDirectoryWriteBlocked\(\)\)[\s\S]*?buildSpecifications2Publication/, "Specifications 2 publication must fail before compatibility state is built");

for (const [name, nextName] of [
  ["updateSpecificationStructure", "addSpecificationStructureItem"],
  ["saveSpekiSpecification", "getSpecificationDeleteUsage"],
  ["deleteSpekiSpecification", "bindNomenclatureEvents"],
  ["saveSpecificationModuleForm", "saveBomCommand"],
]) {
  const body = functionBody(productsEvents, name, nextName);
  const guard = body.indexOf("rejectLegacyDirectoryWrite()");
  const mutation = body.search(/directoryState\.|replaceDirectoryState\(/);
  assert(guard >= 0 && mutation > guard, `${name} must fail before its first Directory mutation`);
}

for (const [name, nextName] of [
  ["updateBomImportRows", "updateBomImportCell"],
  ["createSpekiSpecification", "getActiveNomenclatureItem"],
  ["ensureRouteModuleProjectForSpecification", "resolveRouteModuleProjectId"],
]) {
  const body = functionBody(productsRender, name, nextName);
  const guard = body.indexOf("isLegacyDirectoryWriteBlocked()");
  const mutation = body.search(/directoryState\.|ensureSpecificationPlanningUnit\(/);
  assert(guard >= 0 && mutation > guard, `${name} must fail before its first compatibility mutation`);
}

const fulfillment = functionBody(planningRoutes, "updatePlanningSupplyFulfillment", "getRouteStepQuantityForBatch");
assert(fulfillment.indexOf("isLegacyDirectoryWriteBlocked()") < fulfillment.indexOf("directoryState.specifications"), "Planning fulfillment must fail before mutating a specification");
assert(fulfillment.indexOf("persistDirectoryState() === false") < fulfillment.indexOf("notifySaveSuccess"), "Planning fulfillment must never toast success after a rejected Directory persist");

const saveDirectoryRow = functionBody(appEvents, "saveDirectoryRow", "deleteDirectoryRow");
assert(saveDirectoryRow.indexOf("persistDirectoryState() === false") < saveDirectoryRow.indexOf("notifySaveSuccess"), "legacy Directory save must stop before success feedback");
assert.match(functionBody(productsEvents, "deleteBomList"), /if \(!result\.ok\) alert\(result\.message\)/, "legacy BOM delete must show the fail-closed owner message");

console.log("Nomenclature Directory write boundary QA passed:");
console.log("- command-primary restores the acknowledged projection and rejects generic durable writes");
console.log("- Boards, Specifications, Directory and Planning compatibility editors fail before mutation or success feedback");
