import { readFile } from "node:fs/promises";

function assert(value, message) {
  if (!value) throw new Error(message);
}

const [runtimeState, app] = await Promise.all([
  readFile(new URL("../src/modules/runtime_state/service.js", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
]);

assert(runtimeState.includes('getInitialPlanningBootstrapMode = () => "required"'), "Runtime state must expose an explicit initial Planning-bootstrap policy.");
assert(runtimeState.includes('const metadataSnapshotPromise = requestSharedState("GET", null, { emptyProjection: true })'), "Shared-state metadata must begin in parallel with the Planning workbench bootstrap.");
assert(runtimeState.includes('const serverPlanningApplied = requestedPlanningBootstrapMode === "required"'), "Only modules that require the Planning projection may invoke the workbench BFF during startup.");
assert(runtimeState.includes('const metadataOnly = serverPlanningApplied || requestedPlanningBootstrapMode === "deferred";'), "Metadata-only polling must distinguish a healthy BFF from an intentionally deferred module.");
assert(runtimeState.includes('snapshot = await requestSharedState("GET", null, { valueKeys: [STORAGE_KEY] });'), "Boot must retain the narrow planning-snapshot fallback when the server projection is unavailable.");
assert(runtimeState.includes("async function hydratePlanningSnapshotFallback()"), "Deferred Planning entry must promote its fallback through runtime state.");
assert(runtimeState.includes('setSharedStateValueProjection("planning");'), "Planning fallback must restore the full polling contract.");
assert(runtimeState.includes("sharedStateValueProjectionEpoch"), "A late metadata poll must be fenced after Planning promotes the full projection.");
assert(runtimeState.includes("const hasPlanningState = Object.prototype.hasOwnProperty.call(values, STORAGE_KEY);"), "Partial planning snapshots must be recognized explicitly.");
assert(runtimeState.includes("options.allowSharedUiOnly !== true"), "An empty projection must be rejected unless it is the explicit shared-UI-only bootstrap path.");
assert(runtimeState.includes("if (hasDirectoryState)"), "Directory state must be applied only when it was requested.");
assert(runtimeState.includes("if (hasPlanningState)"), "Planning state must be applied only when it was requested.");
assert(app.includes("function hydrateSharedStateForModule(moduleId, valueKeys = [])"), "Module-scoped shared-state hydration is missing.");
assert(app.includes("sharedStateModuleHydrations.delete(hydrationKey);"), "A deferred module hydration must retry after an early shared-state miss.");
assert(app.includes('hydrateSharedStateForModule("directories", [DIRECTORY_STORAGE_KEY])'), "Directories must hydrate their own projection.");
assert(!app.includes('hydrateSharedStateForModule("planning", [SYSTEM_DOMAINS_STORAGE_KEY])'), "Planning must not hydrate System Domains before the explicit scheduling action.");
assert(app.includes("async function ensurePlanningSystemDomains()"), "Planning must retain on-demand System Domains hydration for scheduling.");
assert(app.includes('hydrateSharedStateForModule("specifications2", [DIRECTORY_STORAGE_KEY])'), "Specifications 2.0 must hydrate directory dependencies independently.");
assert(runtimeState.includes("isSystemDomainsServerAuthoritative = () => false"), "Runtime state must accept the System Domains authority gate.");
assert(runtimeState.includes("values[SYSTEM_DOMAINS_STORAGE_KEY] = null;"), "Server-authoritative System Domains must retire only their shared snapshot copy.");
assert(runtimeState.includes("!isSystemDomainsServerAuthoritative()"), "A retired System Domains snapshot must not overwrite the server projection during hydration.");
assert(app.includes("function hasSystemDomainsServerAuthority()"), "System Domains authority must require every command surface.");
assert(app.includes("SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES"), "System Domains authority surfaces must be explicit and reviewable.");
assert(app.includes("function hasSystemDomainsServerCommandCoverage()"), "System Domains must distinguish command coverage from primary authority.");
assert(/return hasSystemDomainsServerCommandCoverage\(\) && hasObservedSystemDomainsPrimaryAuthority\(\);/.test(app), "Complete command surfaces must not be treated as PostgreSQL-primary before the durable marker exists.");
assert(/if \(!hasObservedSystemDomainsPrimaryAuthority\(\) && localSignature && localSignature !== serverSignature\)/.test(app), "Compatibility snapshot parity must remain enforced until PostgreSQL-primary is observed.");
assert(/if \(!hasObservedSystemDomainsPrimaryAuthority\(\)\) scheduleSystemDomainsServerReadRetry\(moduleId\);/.test(app), "A successful compatibility read must retry authority discovery instead of creating a tombstone from the browser.");
assert(app.includes("isSystemDomainsServerAuthoritative: () => hasObservedSystemDomainsPrimaryAuthority()"), "Runtime tombstone behavior must become fail-closed as soon as observed PostgreSQL-primary authority is durable, not wait for a cached server read.");
assert(app.includes("allowBeforeInitialSync: true"), "Cold boot must explicitly fetch the System Domains tombstone before initial shared-state synchronization enables normal polling.");
assert(runtimeState.includes("async function hydrateSharedStateValues(valueKeys = [], { allowBeforeInitialSync = false } = {})"), "Projected System Domains hydration must support the explicit cold-boot path.");
assert(runtimeState.includes("onSystemDomainsSnapshotRetired = () => {}"), "Runtime state must notify the app when it observes a new System Domains tombstone.");
const reloadSystemDomainsState = app.match(/function reloadSystemDomainsState\([\s\S]*?\n}\n\nfunction updateSystemDomainRegistry/);
assert(reloadSystemDomainsState, "System Domains reload path is missing.");
assert((reloadSystemDomainsState[0].match(/hasObservedSystemDomainsPrimaryAuthority\(\)/g) || []).length >= 2, "Legacy System Domains reload must stop both before and after its async matrix import when PostgreSQL-primary is observed.");
assert(app.includes("PLANNING_STARTUP_PROJECTION_MODULE_IDS"), "Modules that still render the legacy Planning graph must have an explicit bootstrap compatibility guard.");
assert(app.includes("getInitialPlanningBootstrapMode: () => ("), "App must select the initial Planning bootstrap policy by active module.");
assert(app.includes("onPlanningBootstrap: () => hydratePlanningWorkbenchBootstrap()"), "Runtime startup must wire the compact Planning workbench bootstrap.");
assert(!app.includes("onPlanningBootstrap: () => hydratePlanningRuntimeProjection()"), "Planning startup must not fetch the complete runtime projection.");
assert(runtimeState.includes("function isCompactSharedUiReason(reason = \"\")"), "Shared UI writes must have an explicit compact transport gate.");
assert(runtimeState.includes("responseMode = \"ack\""), "Shared UI writes must request the compact acknowledgement.");
assert(runtimeState.includes("pendingValues = compactSharedUi ? null : getSharedStateValues()"), "Shared UI writes must not capture every compatibility value.");
assert(runtimeState.includes("sharedUiPatch = pendingSharedUi"), "Compact UI writes must carry an entry-level patch.");
assert((runtimeState.match(/compactAckUnavailable/g) || []).length >= 2, "Compact UI writes must recover when a reset exposes an empty shared-state baseline after a conflict.");
assert(runtimeState.includes("function reconcileSharedUiAfterFullWrite"), "A full shared-state retry must reconcile the merged UI response locally.");
assert(runtimeState.includes("rebaseSharedUiAfterFullWrite("), "A full shared-state retry must rebase local UI changes over the server response.");

console.log("Shared-state boot projection QA: OK");
