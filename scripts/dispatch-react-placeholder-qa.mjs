import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { withBundledTypeScriptClient } from "./typescript-client-qa-loader.mjs";

const { createDispatchReactIslandHost } = await withBundledTypeScriptClient(
  new URL("../src/modules/dispatch/react_island_host.ts", import.meta.url),
  (hostModule) => hostModule,
  { prefix: "mes-dispatch-react-host-qa-" },
);

const host = createDispatchReactIslandHost({ getTargetRoot: () => null });
assert.deepEqual(host.prepareRender(), { activateReact: true, reason: "eligible" }, "Dispatch must always select its permanent React host");

const [runtime, scenario, rollbackRenderer] = await Promise.all([
  readFile(new URL("../src/modules/dispatch/runtime.js", import.meta.url), "utf8"),
  readFile(new URL("../experiments/react-migration/src/modules/dispatch/DispatchScenario.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/dispatch/render.js", import.meta.url), "utf8"),
]);

assert.doesNotMatch(runtime, /\.\/render\.js|renderDispatchModulePage|requestLegacyRender/u, "normal Dispatch runtime must fail closed without the rollback renderer");
assert.match(runtime, /reactHost\.prepareRender\(\)/u);
assert.match(runtime, /reactHost\.mount\(\)/u);
assert.match(scenario, /React TS · read-only/u);
assert.match(scenario, /data-dispatch-production-table/u);
assert.doesNotMatch(scenario, /scope pending|data-dispatch-react-placeholder|Не подключены|mock/u);
assert.match(rollbackRenderer, /renderDispatchModulePage/u, "immutable rollback source must remain available outside the normal graph");
console.log("Dispatch permanent React source guard QA passed.");
