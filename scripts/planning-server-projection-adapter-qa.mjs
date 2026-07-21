import { projectServerPlanningRoutes, projectServerPlanningSteps } from "../src/modules/planning_workbench/server_projection_adapter.js";

function assert(value, message) { if (!value) throw new Error(message); }

const snapshotRoutes = [{ id: "wo-1", planningQuantity: 1 }, { id: "wo-2", planningQuantity: 2 }];
const serverRoutes = [
  { id: "wo-1", number: "WO-1", quantity: 10, lifecycleStatus: "released", planningStatus: "scheduled", planningStartDate: "2026-07-19", concurrencyRevision: 4, metadata: { id: "wo-1", sourceSpecifications2EntryId: "spec-1", planningStartDate: "2026-07-18" } },
  { id: "wo-2", number: "WO-2", quantity: 20, lifecycleStatus: "queued", planningStatus: "queued", planningStartDate: null, concurrencyRevision: 2, metadata: { id: "wo-2", sourceSpecifications2EntryId: "spec-1", planningStartDate: "2026-07-18" } },
];
const routes = projectServerPlanningRoutes(serverRoutes, snapshotRoutes);
assert(routes.exact && routes.routes[0].planningQuantity === 10 && routes.routes[0].workOrderSnapshot.id === "WO-1", "Exact server route projection must become the rendered route source");
assert(routes.routes[0].planningStartDate === "2026-07-19", "canonical server start-date field must override compatibility metadata");
assert(routes.routes[1].planningStartDate === "", "explicit canonical null must not fall back to stale compatibility metadata");
assert(!projectServerPlanningRoutes([serverRoutes[0]], snapshotRoutes).exact, "Partial server routes must retain the snapshot fallback");

const snapshotSteps = [{ id: "step-1", routeId: "wo-1" }];
const steps = projectServerPlanningSteps({ operations: [{ id: "step-1", operationId: "OP-1", name: "Монтаж", workCenterId: "SMT", nextWorkCenterId: "QA", quantityMultiplier: 2, labor: { mode: "unit" }, metadata: { id: "step-1", routeId: "wo-1", stepOrder: 1 }, slot: { id: "slot-1", plannedStart: "2026-07-17T08:00:00.000Z", plannedEnd: "2026-07-17T09:00:00.000Z", status: "planned", quantity: 10, isLocked: false, metadata: { id: "slot-1" } } }] }, snapshotSteps);
assert(steps.exact && steps.steps[0].operationName === "Монтаж" && steps.steps[0].planningSlot?.id === "slot-1", "Exact server operation detail must retain rendering and slot metadata");
assert(!projectServerPlanningSteps({ operations: [] }, snapshotSteps).exact, "Missing server operation details must retain the snapshot fallback");

console.log("Planning server projection adapter QA: OK");
