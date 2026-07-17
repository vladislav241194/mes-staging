import { canApplyPlanningRuntimeProjection, createPlanningRuntimeProjectionReadModel, hasExactPlanningRuntimeProjection } from "../src/modules/domain_api/planning_runtime_projection_read_model.js";

function assert(value, message) { if (!value) throw new Error(message); }
let calls = 0;
const model = createPlanningRuntimeProjectionReadModel({
  fetchImpl: async () => ({ status: 200, ok: true, headers: { get: () => '"5"' }, json: async () => ({ ok: true, projection: { routes: [{ id: "r1" }], routeSteps: [{ id: "s1" }], slots: [{ id: "p1" }] } }) }),
  now: () => ++calls,
});
const loaded = await model.refresh();
assert(loaded.ok && loaded.projection.routes[0].id === "r1", "runtime projection read model must cache a valid server projection");
assert(hasExactPlanningRuntimeProjection({ routes: [{ id: "r1" }], routeSteps: [{ id: "s1" }], slots: [{ id: "p1" }] }, loaded.projection), "exact projection parity must accept equal route, step and slot identities");
assert(!hasExactPlanningRuntimeProjection({ routes: [{ id: "r1" }], routeSteps: [], slots: [{ id: "p1" }] }, loaded.projection), "exact projection parity must reject a partial server projection");
assert(canApplyPlanningRuntimeProjection({ routes: [], routeSteps: [], slots: [] }, loaded.projection), "an empty first-time runtime must accept the server projection without downloading the legacy planning snapshot");
assert(!canApplyPlanningRuntimeProjection({ routes: [{ id: "legacy-r1" }], routeSteps: [], slots: [] }, loaded.projection), "a non-empty incompatible compatibility runtime must keep the safe snapshot fallback");
console.log("Planning runtime projection read model QA: OK");
