import assert from "node:assert/strict";

import { loadReactRuntimePolicyBrowserModule } from "./react-runtime-policy-browser-loader.mjs";

const { getReactRuntimeMode, resolveReactRuntimeActivation } = await loadReactRuntimePolicyBrowserModule();

const runtimeConfig = (mode) => ({
  MES_REACT_RUNTIME_POLICY: {
    surfaces: { qaSurface: mode },
  },
});

assert.equal(getReactRuntimeMode("qaSurface", runtimeConfig("react")), "react");
assert.equal(getReactRuntimeMode("qaSurface", runtimeConfig("evaluation")), "evaluation");
assert.equal(getReactRuntimeMode("qaSurface", runtimeConfig("legacy")), "legacy");
assert.equal(getReactRuntimeMode("qaSurface", runtimeConfig("unexpected")), "legacy", "unknown modes must fail closed");
assert.equal(getReactRuntimeMode("missingSurface", runtimeConfig("react")), "legacy", "missing surfaces must fail closed");
assert.equal(getReactRuntimeMode("qaSurface", null), "legacy", "missing runtime config must fail closed");

const permanent = resolveReactRuntimeActivation({
  surfaceId: "qaSurface",
  runtimeConfig: runtimeConfig("react"),
  evaluationFeatureEnabled: false,
  evaluationRequested: false,
});
assert.deepEqual(permanent, { runtimeMode: "react", featureFlagEnabled: true, accessMode: "react" });
assert.equal(Object.isFrozen(permanent), true, "activation decisions must remain immutable");

const evaluationDisabled = resolveReactRuntimeActivation({
  surfaceId: "qaSurface",
  runtimeConfig: runtimeConfig("evaluation"),
  evaluationFeatureEnabled: true,
  evaluationRequested: false,
});
assert.deepEqual(evaluationDisabled, { runtimeMode: "evaluation", featureFlagEnabled: false, accessMode: "legacy" });

const evaluationRequested = resolveReactRuntimeActivation({
  surfaceId: "qaSurface",
  runtimeConfig: runtimeConfig("evaluation"),
  evaluationFeatureEnabled: true,
  evaluationRequested: true,
});
assert.deepEqual(evaluationRequested, { runtimeMode: "evaluation", featureFlagEnabled: true, accessMode: "read-only-evaluation" });

const localQa = resolveReactRuntimeActivation({
  surfaceId: "qaSurface",
  runtimeConfig: runtimeConfig("evaluation"),
  localQaEnabled: true,
});
assert.deepEqual(localQa, { runtimeMode: "evaluation", featureFlagEnabled: true, accessMode: "read-only-evaluation" });

const invalid = resolveReactRuntimeActivation({
  surfaceId: "qaSurface",
  runtimeConfig: runtimeConfig("unexpected"),
  evaluationFeatureEnabled: true,
  evaluationRequested: true,
  localQaEnabled: true,
});
assert.deepEqual(invalid, { runtimeMode: "legacy", featureFlagEnabled: false, accessMode: "legacy" }, "invalid policy must ignore every evaluation override");
assert.equal(Object.isFrozen(invalid), true, "fail-closed decisions must remain immutable");

console.log("React browser runtime policy QA: OK (strict TS source bundled for Node 20; legacy fail-closed semantics preserved)");
