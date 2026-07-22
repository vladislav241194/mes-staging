import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createDispatchReactIslandHost } from "../src/modules/dispatch/react_island_host.js";

const host = createDispatchReactIslandHost({ getTargetRoot: () => null });
assert.deepEqual(host.prepareRender(), { activateReact: true, reason: "eligible" }, "Dispatch placeholder must always use its isolated React surface");

const [runtime, scenario, ledger, registry] = await Promise.all([
  readFile(new URL("../src/modules/dispatch/runtime.js", import.meta.url), "utf8"),
  readFile(new URL("../experiments/react-migration/src/modules/dispatch/DispatchScenario.tsx", import.meta.url), "utf8"),
  readFile(new URL("../experiments/react-migration/cutover-ledger.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../src/react_completion_registry.js", import.meta.url), "utf8"),
]);

assert.match(runtime, /reactHost\.prepareRender\(\)/);
assert.match(runtime, /reactHost\.mount\(\)/);
assert.match(scenario, /React \+ TS/);
assert.match(scenario, /data-dispatch-react-placeholder/);
assert.doesNotMatch(scenario, /onRequestLegacy|fetch\(|localStorage|sessionStorage/);
assert.equal(ledger.modules.find((module) => module.id === "dispatch")?.runtimeMode, "react-mock");
assert.equal(ledger.modules.find((module) => module.id === "dispatch")?.visibleLegacyRendererPath, false);
assert.match(registry, /id: "dispatch", status: PARTIAL, surfaceIds: \["dispatch"\]/);
console.log("Dispatch React placeholder contract QA passed.");
