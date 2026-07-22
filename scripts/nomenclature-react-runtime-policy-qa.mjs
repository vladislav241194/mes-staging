import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const disabled = getPublicRuntimeConfig({ APP_ENV: "pilot" });
assert(disabled.MES_REACT_NOMENCLATURE === false, "Nomenclature React rollout must be disabled by default");
assert(disabled.MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION === false, "read-only evaluation must be disabled by default");
assert(disabled.MES_REACT_NOMENCLATURE_WRITE_EVALUATION === false, "write evaluation must be disabled by default");
assert(disabled.MES_NOMENCLATURE_SERVER_COMMANDS_PRIMARY === false, "Nomenclature server commands must not become primary by default");

const enabled = getPublicRuntimeConfig({
  APP_ENV: "pilot",
  MES_REACT_NOMENCLATURE: "1",
  MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION: "1",
  MES_REACT_NOMENCLATURE_WRITE_EVALUATION: "1",
  MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "1",
  DATABASE_URL: "must-not-leak",
});
assert(enabled.MES_REACT_NOMENCLATURE === true, "explicit Nomenclature React rollout must reach the browser bootstrap");
assert(enabled.MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION === true, "explicit read-only evaluation permission must reach the browser bootstrap");
assert(enabled.MES_REACT_NOMENCLATURE_WRITE_EVALUATION === true, "explicit write evaluation permission must reach the browser bootstrap");
assert(enabled.MES_NOMENCLATURE_SERVER_COMMANDS_PRIMARY === true, "explicit Nomenclature server-command ownership must reach the browser bootstrap");

const nonExact = getPublicRuntimeConfig({
  MES_REACT_NOMENCLATURE: "true",
  MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION: "yes",
  MES_REACT_NOMENCLATURE_WRITE_EVALUATION: "yes",
  MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "true",
});
assert(nonExact.MES_REACT_NOMENCLATURE === false, "non-exact rollout values must fail closed");
assert(nonExact.MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION === false, "non-exact evaluation values must fail closed");
assert(nonExact.MES_REACT_NOMENCLATURE_WRITE_EVALUATION === false, "non-exact write values must fail closed");
assert(nonExact.MES_NOMENCLATURE_SERVER_COMMANDS_PRIMARY === false, "non-exact server-command ownership must fail closed");

const script = renderRuntimeConfigScript({
  MES_REACT_NOMENCLATURE: "1",
  MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION: "1",
  MES_REACT_NOMENCLATURE_WRITE_EVALUATION: "1",
  MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "1",
  DATABASE_URL: "must-not-leak",
});
assert(script.includes('"MES_REACT_NOMENCLATURE":true'), "public runtime script must contain the rollout boolean");
assert(script.includes('"MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION":true'), "public runtime script must contain the evaluation boolean");
assert(script.includes('"MES_REACT_NOMENCLATURE_WRITE_EVALUATION":true'), "public runtime script must contain the write evaluation boolean");
assert(script.includes('"MES_NOMENCLATURE_SERVER_COMMANDS_PRIMARY":true'), "public runtime script must contain the command-primary boolean");
assert(!script.includes("must-not-leak"), "public runtime script must never expose deployment secrets");

const [appSource, boardsOwnerSource, productsEventsSource, productsRuntimeSource, appInteractionsSource, nomenclatureIslandHostSource, boardsIslandHostSource, runtimeStateSource, sharedStateEndpointSource] = await Promise.all([
  readFile(join(root, "src/app.js"), "utf8"),
  readFile(join(root, "src/modules/nomenclature/boards_command_owner.js"), "utf8"),
  readFile(join(root, "src/modules/products/events.js"), "utf8"),
  readFile(join(root, "src/modules/products/compatibility_runtime.js"), "utf8"),
  readFile(join(root, "src/modules/app_interactions/render.js"), "utf8"),
  readFile(join(root, "src/modules/nomenclature/react_island_host.ts"), "utf8"),
  readFile(join(root, "src/modules/nomenclature/boards_react_island_host.ts"), "utf8"),
  readFile(join(root, "src/modules/runtime_state/service.js"), "utf8"),
  readFile(join(root, "scripts/shared-state-endpoint.mjs"), "utf8"),
]);
const nomenclatureHostStart = appSource.indexOf("const nomenclatureReactIslandHost");
const boardsHostStart = appSource.indexOf("const boardsReactIslandHost", nomenclatureHostStart);
const boardsHostEnd = appSource.indexOf("function resolveProductionStructureRegistryActivation", boardsHostStart);
const nomenclatureHostSource = appSource.slice(nomenclatureHostStart, boardsHostStart);
const boardsHostSource = appSource.slice(boardsHostStart, boardsHostEnd);
const nomenclaturePayloadSource = nomenclatureHostSource.slice(nomenclatureHostSource.indexOf("getPayload:"), nomenclatureHostSource.indexOf("getTargetRoot:"));
const boardsPayloadSource = boardsHostSource.slice(boardsHostSource.indexOf("getPayload:"), boardsHostSource.indexOf("getTargetRoot:"));
assert(nomenclatureHostStart >= 0 && boardsHostStart > nomenclatureHostStart && boardsHostEnd > boardsHostStart, "Nomenclature and Boards host boundaries must be discoverable");
assert(/getPayload:[^]*productionModel:\s*\{[^]*directory:\s*directoryState[^]*systemDomains:\s*\{\s*registries:\s*getSystemDomainsRegistries\(\)\s*\}[^]*\bui\b[^]*capabilities:/.test(nomenclaturePayloadSource), "Nomenclature must build its read payload from the typed raw production contract");
assert(!/getNomenclatureDeleteUsage\(/.test(nomenclaturePayloadSource), "Nomenclature read payload must not call the legacy view-model usage helper");
assert(/getPayload:[^]*productionModel:\s*\{[^]*directory:\s*directoryState[^]*systemDomains:\s*\{\s*registries:\s*getSystemDomainsRegistries\(\)\s*\}[^]*\bui\b[^]*capabilities:/.test(boardsPayloadSource), "Boards must build its read payload from the typed raw production contract");
assert(!/(getBomLinkedSpecifications|getBomImportRows|normalizeLookupText)\(/.test(boardsPayloadSource), "Boards read payload must not call legacy model projection helpers");
const nomenclatureRouteStart = appSource.indexOf("    nomenclature: {\n      render: () => {");
const planningRouteStart = appSource.indexOf("    planning: {", nomenclatureRouteStart);
const nomenclatureRouteSource = appSource.slice(nomenclatureRouteStart, planningRouteStart);
assert(nomenclatureRouteStart >= 0 && planningRouteStart > nomenclatureRouteStart, "Nomenclature route boundary must be discoverable");
assert(/allowBeforeInitialSync:\s*true[^]*failClosed:\s*true/.test(nomenclatureRouteSource), "Nomenclature route must retain targeted fail-closed directory hydration");
assert(/inactiveReactHost\.prepareRender\(\)[^]*activeReactHost\.prepareRender\(\)[^]*return activeReactHost\.renderTarget\(\)/.test(nomenclatureRouteSource), "Nomenclature route must render only the selected React surface");
assert(/bind:\s*\(\)\s*=>\s*\{\}/.test(nomenclatureRouteSource), "Nomenclature route must not bind retired legacy DOM events");
assert(!/ensureNomenclatureRenderModule|renderNomenclaturePage|bindNomenclatureEvents|bindBomListsEvents/.test(nomenclatureRouteSource), "Nomenclature route must not retain a live legacy render or bind path");
assert(!/modules\/nomenclature\/render\.js|ensureNomenclatureRenderModule|renderNomenclatureModulePage|renderNomenclaturePage/.test(appSource), "application runtime must not reach the retired Nomenclature renderer");
assert(!/renderNomenclatureModulePage|renderNomenclaturePage/.test(productsRuntimeSource), "Products compatibility runtime must not retain the retired Nomenclature route wrapper");
assert(!/bomDeleteList|nomenclatureDeleteItem/.test(appInteractionsSource), "global confirm handling must not retain obsolete Nomenclature legacy actions");
assert(/moduleId\s*===\s*["']bomLists["']\s*\?\s*["']nomenclature["']/.test(appInteractionsSource), "Boards deep links must continue to route through the Nomenclature React surface");
assert(/canFallbackToLegacy:\s*\(\)\s*=>\s*false/.test(nomenclatureIslandHostSource), "Nomenclature renderer failures must stay fail-closed in React");
assert(/canFallbackToLegacy:\s*\(\)\s*=>\s*false/.test(boardsIslandHostSource), "Boards renderer failures must stay fail-closed in React");
assert(!/requestLegacyRender/.test(nomenclatureIslandHostSource + boardsIslandHostSource), "Nomenclature and Boards hosts must not expose a legacy-render callback");
assert(/react-required/.test(nomenclatureIslandHostSource) && /react-required/.test(boardsIslandHostSource), "both hosts must expose a deterministic React-required shell");
const boardsOwnerLoaderStart = appSource.indexOf("function ensureBoardsCommandOwner()", boardsHostStart - 4000);
const boardsOwnerLoaderSource = appSource.slice(boardsOwnerLoaderStart, boardsHostStart);
assert(boardsOwnerLoaderStart >= 0 && boardsOwnerLoaderStart < boardsHostStart, "Boards command owner lazy boundary must be discoverable before the host");
assert(!/^import[^\n]*boards_command_owner\.js/m.test(appSource), "Boards command owner must not remain in the startup import graph");
assert(boardsOwnerLoaderSource.includes('import("./modules/nomenclature/boards_command_owner.js")'), "Boards command owner must load through a route-local dynamic import");
assert(boardsOwnerLoaderSource.includes("if (boardsCommandOwnerLoad) return boardsCommandOwnerLoad"), "concurrent Boards commands must share one cached module load");
assert(boardsHostSource.includes("const commandOwner = await ensureBoardsCommandOwner()"), "ordinary Boards commands must await the isolated owner before executing");
assert(boardsHostSource.indexOf("await ensureBoardsCommandOwner()") < boardsHostSource.indexOf("commandOwner.execute(command)"), "Boards owner must be ready before a command can execute");
assert(boardsHostSource.includes('code: "owner-unavailable"'), "a failed Boards owner import must fail closed without legacy fallback");
assert(!boardsHostSource.includes("ensureNomenclatureRenderModule()"), "ordinary Boards commands must not load the legacy products renderer");
assert(boardsHostSource.includes('code: "deferred-import"'), "XLSX must be explicitly deferred instead of entering the legacy path");
assert(!/products\/render\.js|ensureNomenclatureRenderModule|saveBomCommand|deleteBomCommand/.test(boardsOwnerSource), "Boards command owner must remain isolated from the retired renderer and commands");
assert(appSource.includes("requireDurable: true"), "Pilot Nomenclature React saves must require a durable owner acknowledgement");
assert(productsEventsSource.includes("persistNomenclatureDirectoryMutationDurably({"), "Nomenclature owner must await the isolated durable mutation path");
assert(productsEventsSource.includes('code: "persistence-unconfirmed"'), "Nomenclature save must fail closed when persistence is not confirmed");
assert(productsEventsSource.includes("expectedRow: command.expectedRow"), "Durable commands must use the baseline captured by the open React draft");
const serverCommandStart = runtimeStateSource.indexOf("async function persistNomenclatureServerCommandDurably");
const durableMutationStart = runtimeStateSource.indexOf("async function persistNomenclatureDirectoryMutationDurably", serverCommandStart);
const durableMutationEnd = runtimeStateSource.indexOf("async function persistDirectoryStateDurably", durableMutationStart);
const serverCommandSource = runtimeStateSource.slice(serverCommandStart, durableMutationStart);
const durableMutationSource = runtimeStateSource.slice(durableMutationStart, durableMutationEnd);
assert(serverCommandStart >= 0 && durableMutationStart > serverCommandStart && durableMutationEnd > durableMutationStart, "command-primary and CAS rollback boundaries must be discoverable");
assert(durableMutationSource.includes("if (isNomenclatureServerCommandsPrimary())") && durableMutationSource.includes("persistNomenclatureServerCommandDurably(intent)"), "command-primary mode must bypass generic shared-state writes");
assert(serverCommandSource.includes("executeNomenclatureServerCommand(intent, attempt.revision)"), "command-primary writes must send the hydrated expected revision to the server owner");
assert(serverCommandSource.includes("applyAuthoritativeNomenclatureProjection(result.projection)"), "command-primary writes must commit the authoritative server projection");
assert(serverCommandSource.includes('code: "command-superseded"'), "superseded idempotent replays must not be reported as ordinary success");
assert(durableMutationSource.includes('requestSharedState("GET", null, { valueKeys: [DIRECTORY_STORAGE_KEY] })'), "primary=false must retain the exact directory CAS read");
assert(durableMutationSource.includes('responseMode: "ack"') && durableMutationSource.includes("values: { [DIRECTORY_STORAGE_KEY]: JSON.stringify(mutation.directory) }"), "primary=false must retain the narrow CAS acknowledgement payload");
assert(durableMutationSource.includes('if (response.conflict === true)') && !durableMutationSource.includes('nomenclature-save:conflict-retry'), "CAS rollback conflicts must fail closed without stale automatic retry");
assert(durableMutationSource.includes("directoryState = mutation.directory") && durableMutationSource.includes("commitRuntimeState()"), "CAS rollback state must commit only after server acknowledgement");
assert(runtimeStateSource.includes("isNomenclatureServerCommandsPrimary = () => false"), "runtime command-primary dependency must default false so rollback remains available");
assert(runtimeStateSource.includes("if (isDirectoryStateReason(reason) && !isNomenclatureServerCommandsPrimary()) return values"), "legacy directory snapshots must remain writable only when command-primary is off");
assert(sharedStateEndpointSource.includes("isCompactDirectoryAcknowledgementRequest"), "The shared-state endpoint must recognize the narrow directory acknowledgement contract");
assert(sharedStateEndpointSource.includes("compactDirectoryAcknowledgement ? projectSnapshotValues"), "Directory acknowledgement conflicts must not return the full compatibility snapshot");
assert(sharedStateEndpointSource.includes("compactAcknowledgement") && sharedStateEndpointSource.includes("responseMode"), "Successful directory writes must return the compact acknowledgement envelope");
const ledger = JSON.parse(await readFile(join(root, "experiments/react-migration/cutover-ledger.json"), "utf8"));
const nomenclatureLedger = ledger.modules.find((module) => module.id === "nomenclature");
assert(nomenclatureLedger?.runtimeLegacyModelDependency === false && nomenclatureLedger?.normalLegacyPath === false, "Nomenclature/Boards normal route must be recorded as legacy-free");

console.log("Nomenclature React runtime policy QA: server-command primary and CAS rollback OK");
