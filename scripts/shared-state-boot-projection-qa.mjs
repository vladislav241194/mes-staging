import { readFile } from "node:fs/promises";

function assert(value, message) {
  if (!value) throw new Error(message);
}

const [runtimeState, app] = await Promise.all([
  readFile(new URL("../src/modules/runtime_state/service.js", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
]);

assert(runtimeState.includes("const serverPlanningApplied = await onPlanningBootstrap().catch(() => false);"), "Boot must attempt the server-authoritative planning projection before the compatibility snapshot.");
assert(runtimeState.includes("const initialValueKeys = serverPlanningApplied ? [] : [STORAGE_KEY];"), "Boot must retain the narrow planning-snapshot fallback when the server projection is unavailable.");
assert(runtimeState.includes("? { emptyProjection: true }"), "A server-authoritative planning bootstrap must request metadata only from shared state.");
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
