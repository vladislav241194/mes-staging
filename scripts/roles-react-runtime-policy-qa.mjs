import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const mustBeAbsent = async (path) => {
  await assert.rejects(access(new URL(`../${path}`, import.meta.url)), { code: "ENOENT" }, `${path} must be deleted`);
};

const disabled = getPublicRuntimeConfig({ APP_ENV: "pilot" });
assert.equal(disabled.MES_REACT_ROLES, false, "legacy rollout flags must not accidentally enable a write evaluation");
assert.equal(disabled.MES_REACT_ROLES_READ_ONLY_EVALUATION, false, "Roles evaluation must remain disabled by default");

const script = renderRuntimeConfigScript({
  MES_REACT_ROLES: "1",
  MES_REACT_ROLES_READ_ONLY_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert(script.includes('"MES_REACT_ROLES":true'));
assert(script.includes('"MES_REACT_ROLES_READ_ONLY_EVALUATION":true'));
assert(!script.includes("must-not-leak"), "public runtime script must never expose deployment secrets");

const [
  appSource,
  hostSource,
  scenarioSource,
  adapterSource,
  domainApiSource,
  runtimePolicySource,
  featureRegistrySource,
  moduleRegistrySource,
  moduleSmokeSource,
  regressionSmokeSource,
  coverageReportSource,
] = await Promise.all([
  source("src/app.js"),
  source("src/modules/access_roles/react_island_host.ts"),
  source("experiments/react-migration/src/modules/roles/RolesScenario.tsx"),
  source("experiments/react-migration/src/modules/roles/adapter.ts"),
  source("scripts/domain-api.mjs"),
  source("react-runtime-policy.json"),
  source("src/feature_registry.js"),
  source("src/module_registry.js"),
  source("scripts/module-smoke-qa.mjs"),
  source("scripts/ui-module-regression-smoke.mjs"),
  source("scripts/ui-contract-coverage-report.mjs"),
]);
const runtimePolicy = JSON.parse(runtimePolicySource);

await mustBeAbsent("src/modules/access_roles/render.js");
await mustBeAbsent("src/modules/access_roles/service.js");

assert.equal(runtimePolicy.surfaces.roles, "react", "Roles normal route must be permanently React");
assert.doesNotMatch(appSource, /ensureAccessRolesModule|renderAccessRolesPage|bindAccessRolesEvents|modules\/access_roles\/render\.js|requestLegacyRender\s*:/, "app shell must not retain the same-release Roles renderer");
assert.match(appSource, /roles:\s*\{[\s\S]*?rolesReactIslandHost\.prepareRender\(\);[\s\S]*?return rolesReactIslandHost\.renderTarget\(\);[\s\S]*?bind:\s*\(\)\s*=>\s*\{\}/, "Roles route must always render the React fail-closed shell");
assert.doesNotMatch(hostSource, /requestLegacyRender|onRequestLegacy/, "Roles host must not expose a legacy callback");
assert.match(hostSource, /canFallbackToLegacy:\s*\(\)\s*=>\s*false/, "mount/read/render failures must fail closed");
assert(hostSource.includes("if (activation.serverReadFailure)"));
assert(hostSource.includes("if (!activation.serverReadReady)"));

assert.match(domainApiSource, /if \(surface === "access-control"\)[\s\S]*?system-domains-surface-not-server-authorized/, "real server must keep access-control writes explicitly disabled");
assert.match(domainApiSource, /const serverCommandSurfaces =[\s\S]*?surface === "production-structure"[\s\S]*?surface === "timesheet"[\s\S]*?: false/, "capability projection must not advertise access-control");
assert(appSource.includes('systemDomainsServerCommandState.surfaces.includes("access-control")'), "client commands must require the real server capability");

for (const blockedOperation of [
  "effective-window-persistence",
  "subject-responsibility-scope-persistence",
  "assignment-responsibility-scope-persistence",
  "read-only-role-persistence",
]) {
  assert(appSource.includes(`"${blockedOperation}"`));
  assert(adapterSource.includes(`"${blockedOperation}"`));
}
assert(scenarioSource.includes('data-react-parity-status="partial"'), "Roles must expose an honest PARTIAL marker");
assert(!scenarioSource.includes("data-react-complete-marker"), "Roles must not claim completion");
assert(!scenarioSource.includes("legacy"), "React UI must not direct users to a removed renderer");
assert(featureRegistrySource.includes('"src/modules/access_roles/react_island_host.ts"'));
assert(moduleRegistrySource.includes('"experiments/react-migration/src/modules/roles/RolesScenario.tsx"'));
assert.doesNotMatch(`${featureRegistrySource}\n${moduleRegistrySource}`, /src\/modules\/access_roles\/(?:render|service)\.js/);
for (const asyncBrowserGate of [moduleSmokeSource, regressionSmokeSource, coverageReportSource]) {
  assert(asyncBrowserGate.includes("[data-react-roles-island][data-react-island-state='ready']"), "async module gates must wait for the Roles React commit");
  assert(asyncBrowserGate.includes('moduleId !== "roles" ||') && asyncBrowserGate.includes("rolesReady"), "async module gates must not accept the loading shell as Roles coverage");
}

console.log("Roles React permanent fail-closed runtime QA: OK");
console.log("- same-release legacy renderer/service: absent");
console.log("- server access-control writes: explicitly unavailable");
console.log("- parity marker: PARTIAL");
