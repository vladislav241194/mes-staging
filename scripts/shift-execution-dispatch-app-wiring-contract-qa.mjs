import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function section(source, startMarker, endMarker, name) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert(start >= 0 && end > start, `${name} boundary must exist`);
  return source.slice(start, end);
}

const source = await readFile(fileURLToPath(new URL("../src/app.js", import.meta.url)), "utf8");
const dispatchScope = section(
  source,
  "function getShiftExecutionDispatchScope() {",
  "function isSameShiftExecutionDispatchScope(",
  "dispatch scope",
);
const dispatchActivation = section(
  source,
  "function getDispatchReactActivation() {",
  "function getDispatchReactProductionPayload() {",
  "React Dispatch activation",
);
const dispatchPayload = section(
  source,
  "function getDispatchReactProductionPayload() {",
  "function ensureDispatchReactProduction(",
  "React Dispatch payload",
);
const dispatchHydration = section(
  source,
  "function ensureDispatchReactProduction(",
  "function isShiftExecutionServerAuthoritative() {",
  "React Dispatch hydration",
);
const authority = section(
  source,
  "function isShiftExecutionServerAuthoritative() {",
  "function getShiftExecutionServerAssignment(",
  "dispatch authority",
);
const serverAssignment = section(
  source,
  "function getShiftExecutionServerAssignment(row = {}) {",
  "function mergeShiftExecutionProjectionRecords(",
  "dispatch server assignment lookup",
);
const dispatchApply = section(
  source,
  "function applyShiftExecutionDispatchProjection(result = {}) {",
  "function hydrateShiftExecutionServerProjection() {",
  "dispatch overlay application",
);
const hydration = section(
  source,
  "function hydrateShiftExecutionServerProjection() {",
  "function ensureShiftExecutionDomainApiModule() {",
  "dispatch hydration",
);
const refreshProjection = section(
  source,
  "async function refreshShiftExecutionServerProjection() {",
  "async function flushShiftExecutionOutbox() {",
  "dispatch forced refresh",
);
const moduleLoader = section(
  source,
  "function ensureShiftMasterBoardModule() {",
  "const shiftWorkOrderJournalOwner",
  "master board lazy loader",
);
const masterBoardRender = section(
  source,
  "    shiftMasterBoard: {\n      render: () => {",
  "    shiftWorkOrders: {",
  "master board render route",
);
const authSessionRender = section(
  source,
  "    authSessionPrototype: {\n      render: () => {",
  "    weeklyProductionControl: {",
  "employee desktop render route",
);

// The compact API scope is a Planning projection concern. Dispatch and the
// existing Shift surfaces must not depend on the retired Master Board renderer
// or its compatibility-only view model to obtain production row identifiers.
assert(dispatchScope.includes("planningState.routeSteps || []"), "dispatch scope must resolve work centers from the Planning projection");
assert(dispatchScope.includes("planningState.slots || []"), "dispatch scope must derive production rows from Planning slots");
assert(dispatchScope.includes("getShiftRowId(slot, dateKey)"), "dispatch scope must use the shared production source-row identity");
assert(dispatchScope.includes("getPlanningSlotWorkCenterId(slot, stepsById.get(slot.routeStepId) || null)"), "dispatch scope must retain the Planning work-center contract");
assert(dispatchScope.includes("sourceRowIds.sort()"), "dispatch scope must be deterministic for cache and ETag reuse");
assert(dispatchScope.includes("workCenterIds.sort()"), "dispatch scope must include a stable visible work-center filter");
assert(dispatchScope.includes("sourceRowIds.length > 200"), "dispatch scope must remain bounded by the server row contract");
assert(dispatchScope.includes("workCenterIds.length > 100"), "dispatch scope must remain bounded by the server work-center contract");
assert(!dispatchScope.includes("getShiftMasterBoardModel"), "dispatch scope must not depend on the legacy Master Board view model");
assert(!dispatchScope.includes("getShiftMasterBoardSlotRows("), "dispatch scope must not depend on the legacy Master Board slot helper");

// Permanent React Dispatch is production-backed and fail-closed: Planning must
// hydrate first, then the exact bounded Shift Execution projection. No mock or
// compatibility snapshot is accepted as a successful Dispatch read.
assert(dispatchActivation.includes('runtimeMode: "react"'), "Dispatch must remain a permanent React surface");
assert(dispatchActivation.includes('accessMode: "react"'), "Dispatch must not advertise a legacy access mode");
assert(dispatchActivation.includes('planningRuntimeProjectionState.status === "server"'), "Dispatch activation must require the PostgreSQL Planning projection");
assert(dispatchPayload.includes("planning: planningState"), "Dispatch payload must carry the Planning production projection");
assert(dispatchPayload.includes("shiftExecution"), "Dispatch payload must carry the bounded Shift Execution production projection");
assert(dispatchPayload.includes("getSystemDomainsRegistries()"), "Dispatch payload must use System Domains labels");
assert(dispatchPayload.includes("productionBacked: getDispatchReactActivation().serverReadReady"), "Dispatch marker eligibility must be tied to the complete production read");
assert(dispatchHydration.includes("hydratePlanningRuntimeProjection({ force, renderOnChange: false })"), "Dispatch must hydrate Planning before Shift Execution");
assert(dispatchHydration.includes("shiftExecutionDispatchReadModel.refresh({ ...scope, force })"), "Dispatch must request the exact bounded Shift Execution scope");
assert(dispatchHydration.includes('status: "error"'), "Dispatch hydration must fail closed when a production projection is unavailable");

// Permanent React Shift surfaces hydrate their production projections before
// preparing the island. The lazy renderer remains reachable only after React
// declines activation, preserving an immutable rollback path.
const loaderInitialize = moduleLoader.indexOf("initializeShiftMasterBoardModule(createShiftMasterBoardModule);");
const loaderRerender = moduleLoader.indexOf('["shiftMasterBoard", "authSessionPrototype"].includes(ui.activeModule)');
const renderModuleLoad = masterBoardRender.indexOf("ensureShiftMasterBoardModule();");
const renderHydration = masterBoardRender.indexOf('if (planningRuntimeProjectionState.status === "server") hydrateShiftExecutionServerProjection();');
const renderReactDecision = masterBoardRender.indexOf("shiftMasterBoardReactIslandHost.prepareRender();");
assert(loaderInitialize >= 0 && loaderRerender > loaderInitialize, "lazy board factory must initialize before re-rendering the active board");
assert(renderHydration >= 0 && renderReactDecision > renderHydration, "Master Board must start production hydration before preparing permanent React");
assert(renderModuleLoad > renderReactDecision, "Master Board legacy renderer must remain after the permanent React decision as rollback only");
assert(authSessionRender.includes('hydrateShiftExecutionServerProjection();'), "employee desktop must hydrate the PostgreSQL assignment and fact projection");
assert(authSessionRender.indexOf("hydrateShiftExecutionServerProjection();") < authSessionRender.indexOf("employeeDesktopReactIslandHost.prepareRender();"), "employee desktop must start production hydration before preparing permanent React");
assert(!authSessionRender.includes("ensureShiftMasterBoardModule();"), "employee desktop must not load the legacy Master Board renderer on its normal path");
assert(hydration.includes('["shiftMasterBoard", "authSessionPrototype"].includes(ui?.activeModule)'), "a changed dispatch projection must re-render both the Master Board and employee desktop");

// A bounded overlay must not erase compatibility snapshot state. It can only
// become authoritative once the server has explicitly proved full coverage.
assert(authority.includes("shiftExecutionServerState.coverageComplete === true"), "partial dispatch coverage must not be treated as authoritative");
assert(authority.includes("function isShiftExecutionDispatchScopeReadyForRow(row = {})"), "dispatch writes must require the exact current scoped read");
assert(authority.includes("&& !state.error"), "a cached dispatch payload with a failed refresh must not authorize a server write");
assert(serverAssignment.includes("isShiftExecutionDispatchScopeReadyForRow(row)"), "server assignment lookup must reject stale scopes");
assert(!serverAssignment.includes("getBySourceSlotId"), "server assignment lookup must never fall back to a possibly stale slot id");
assert(dispatchApply.includes("const replaceCovered = result.coverageComplete === true;"), "covered snapshot records may only be removed after a full-coverage proof");
assert(dispatchApply.includes("ui.shiftMasterBoardAssignments = mergeShiftExecutionProjectionRecords("), "dispatch assignments must merge into compatibility state");
assert(dispatchApply.includes("ui.shiftMasterBoardFacts = mergeShiftExecutionProjectionRecords("), "dispatch facts must merge into compatibility state");
assert(dispatchApply.includes("ui.shiftMasterBoardCarryovers = mergeShiftExecutionCarryovers("), "dispatch carryovers must merge into compatibility state");
assert(!dispatchApply.includes("ui.shiftMasterBoardAssignments = projection.assignments"), "partial dispatch must never replace all snapshot assignments");
assert(!dispatchApply.includes("ui.shiftMasterBoardFacts = projection.facts"), "partial dispatch must never replace all snapshot facts");
assert(!dispatchApply.includes("ui.shiftMasterBoardCarryovers = projection.carryovers"), "partial dispatch must never replace all snapshot carryovers");
assert(hydration.includes("shiftExecutionDispatchReadModel.refresh(scope)"), "hydration must request the compact scoped dispatch read model");
assert(hydration.includes("commandsEnabled: false"), "scope navigation must disable server writes until the new dispatch scope arrives");
assert(hydration.includes("const commandsEnabled = projectionReady && capabilityReady && capability.enabled === true;"), "a failed scoped projection must keep server writes disabled even when command capability is available");
assert(hydration.includes("if (coverageComplete && !wasAuthoritative) persistUiState();"), "partial dispatch reads must not persist over the compatibility snapshot");
assert(refreshProjection.includes("if (!result.ok)") && refreshProjection.includes("commandsEnabled: false"), "a failed forced dispatch refresh must fail closed before a subsequent write");

const mirrorWrites = [
  "mirrorShiftMasterBoardAssignmentToServer",
  "mirrorShiftMasterBoardFactToServer",
  "mirrorShiftMasterBoardCarryoverToServer",
].map((name) => section(source, `async function ${name}(`, "\n}", `${name} guard`));
assert(mirrorWrites.every((sectionText) => sectionText.includes("isShiftExecutionDispatchScopeReadyForRow(row)")), "every server write must wait for the exact current dispatch scope");

// The old whole-system read model is materially larger and reintroduced the
// global readback bottleneck; it must not remain reachable from app bootstrap.
assert(/import\(\s*["']\.\/modules\/domain_api\/shift_execution_dispatch_read_model\.js["']\s*\)/.test(source), "app must lazy-load the scoped dispatch read model");
assert(!/(?:import\(\s*|from\s*)["'][^"']*shift_execution_read_model\.js["']/.test(source), "app must not import the legacy whole-system shift execution read model");
assert(!/\bshiftExecutionReadModel\b/.test(source), "app must not retain the legacy full read-model handle");

console.log("Shift execution dispatch app wiring contract QA: OK");
