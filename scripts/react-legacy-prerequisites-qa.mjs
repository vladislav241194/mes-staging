import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { inferAccessRoleIdForPerson } from "../src/modules/auth_render/access_role_resolver.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const resolverOptions = {
  defaultRoleId: "admin",
  accessRoleAssignments: { "employee-explicit": "technologist" },
  normalizeAccessRoleAssignments: (value) => value,
  normalizeLookupText: (value) => String(value || "").trim().toLowerCase(),
};

assert.equal(inferAccessRoleIdForPerson(null, resolverOptions), "admin");
assert.equal(inferAccessRoleIdForPerson({ id: "employee-explicit", role: "Исполнитель" }, resolverOptions), "technologist");
assert.equal(inferAccessRoleIdForPerson({ id: "head", role: "Начальник производства" }, resolverOptions), "productionHead");
assert.equal(inferAccessRoleIdForPerson({ id: "planner", department: "ПДО" }, resolverOptions), "planner");
assert.equal(inferAccessRoleIdForPerson({ id: "master", canDistribute: true }, resolverOptions), "master");
assert.equal(inferAccessRoleIdForPerson({ id: "dispatcher", canCloseFact: true, canExecute: false }, resolverOptions), "dispatcher");
assert.equal(inferAccessRoleIdForPerson({ id: "employee", role: "Оператор" }, resolverOptions), "executor");

const [appSource, productsRuntimeSource] = await Promise.all([
  readFile(join(root, "src/app.js"), "utf8"),
  readFile(join(root, "src/modules/products/compatibility_runtime.js"), "utf8"),
]);

assert.match(
  appSource,
  /import \{ inferAccessRoleIdForPerson as resolveAccessRoleIdForPerson \} from "\.\/modules\/auth_render\/access_role_resolver\.js";/,
  "the app must resolve auth roles without reading the products renderer export",
);
const productsInitialization = appSource.slice(
  appSource.indexOf("function initializeProductsCompatibilityRuntime()"),
  appSource.indexOf("} = createProductsCompatibilityRuntime({", appSource.indexOf("function initializeProductsCompatibilityRuntime()")),
);
assert.ok(productsInitialization.length > 0, "products initialization boundary must remain inspectable");
assert.doesNotMatch(
  productsInitialization,
  /\binferAccessRoleIdForPerson\b/,
  "the Products compatibility runtime must not supply the app auth resolver",
);
assert.doesNotMatch(
  productsRuntimeSource,
  /access_role_resolver|resolveAccessRoleIdForPerson|inferAccessRoleIdForPerson/,
  "the pruned Products compatibility runtime must not retain the retired auth flow",
);
assert.match(
  appSource,
  /const legacyDeleteUsageById = serverCapability\.configured\s*\? \{\}\s*:\s*Object\.fromEntries/,
  "server-configured Nomenclature Types must skip legacy delete-usage calculation",
);

console.log("React legacy prerequisites QA passed");
