import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const disabled = getPublicRuntimeConfig({});
assert.equal(disabled.MES_REACT_WEEKLY_PRODUCTION_CONTROL, false);
assert.equal(disabled.MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION, false);

const enabled = getPublicRuntimeConfig({
  MES_REACT_WEEKLY_PRODUCTION_CONTROL: "1",
  MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert.equal(enabled.MES_REACT_WEEKLY_PRODUCTION_CONTROL, true);
assert.equal(enabled.MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION, true);

const script = renderRuntimeConfigScript({
  MES_REACT_WEEKLY_PRODUCTION_CONTROL: "1",
  MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert.match(script, /"MES_REACT_WEEKLY_PRODUCTION_CONTROL":true/);
assert.match(script, /"MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION":true/);
assert.doesNotMatch(script, /must-not-leak/);

const [app, host, runtimePolicy, moduleRegistry] = await Promise.all([
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/weekly_production_control/react_island_host.js", import.meta.url), "utf8"),
  readFile(new URL("../react-runtime-policy.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../src/module_registry.js", import.meta.url), "utf8"),
]);

assert.equal(runtimePolicy.surfaces.weeklyProductionControl, "react", "current Weekly runtime must be permanent React");
assert.doesNotMatch(app, /selectWeeklyProductionControlRuntime|weeklyProductionControlLegacyRuntime|weeklyProductionControlLoadingInstance|createWeeklyProductionControlRuntimeInstance|getWeeklyProductionControlLegacyRuntimeInstance|getWeeklyProductionControlRuntimeInstance|modules\/weekly_production_control\/render\.js/);
assert.match(app, /const weeklyProductionControlProductionRuntimeInstance = Object\.freeze\(\{[\s\S]{0,500}formatWeeklyProductionControlPercent:[\s\S]{0,500}formatWeeklyProductionControlQuantity:/);
assert.match(app, /initialize: \(\) => weeklyProductionControlProductionRuntimeInstance/);
assert.match(app, /getPayload: \(\) => \(\{ productionInput: getWeeklyProductionControlReadModelInput\(\) \}\)/);
assert.match(app, /weeklyProductionControlReactIslandHost\.prepareRender\(\);\s*return weeklyProductionControlReactIslandHost\.renderTarget\(\)/);
assert.match(app, /weeklyProductionControl:\s*\{[\s\S]{0,900}bind: \(\) => \{\}/);
assert.doesNotMatch(app, /requestLegacyRender:\s*\(\)\s*=>\s*\{[\s\S]{0,160}weeklyProductionControl/);
assert.match(host, /canFallbackToLegacy: \(\) => false/);
assert.match(host, /evaluation-disabled/);
assert.match(host, /runtime-policy-disabled/);
assert.doesNotMatch(host, /requestLegacyRender|onRequestLegacy/);
assert.match(moduleRegistry, /weeklyProductionControl[\s\S]{0,1200}sourceFiles: \["src\/modules\/weekly_production_control\/react_island_host\.js", "src\/modules\/weekly_production_control\/production_read_input\.js"\]/);
console.log("Weekly Production Control React runtime policy QA passed.");
