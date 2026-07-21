import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createReactIslandHost } from "../src/modules/react_island_host.js";
import { createNomenclatureReactIslandHost } from "../src/modules/nomenclature/react_island_host.js";
import { resolveReactRuntimeActivation } from "../src/modules/react_runtime_policy.js";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

class FakeElement {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.isConnected = true;
    this.textContent = "";
  }

  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = String(value); }
}

const releasePolicy = JSON.parse(await readFile(join(root, "react-runtime-policy.json"), "utf8"));
assert.notEqual(releasePolicy.surfaces?.boards, "react", "Nomenclature cutover must not silently absorb the separately governed Boards surface");
const permanentCandidatePolicy = {
  ...releasePolicy,
  policyId: "qa-nomenclature-permanent-candidate",
  surfaces: { ...releasePolicy.surfaces, nomenclature: "react", boards: "legacy" },
};

const publishedConfig = getPublicRuntimeConfig({
  APP_ENV: "pilot",
  MES_REACT_NOMENCLATURE: "1",
  MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION: "1",
  MES_REACT_NOMENCLATURE_WRITE_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
}, { reactRuntimePolicy: permanentCandidatePolicy });
assert.equal(publishedConfig.MES_REACT_RUNTIME_POLICY?.surfaces?.nomenclature, "react", "permanent policy must reach the browser bootstrap");
assert.equal(publishedConfig.MES_REACT_NOMENCLATURE, false, "obsolete evaluation feature flags must be masked after permanent cutover");
assert.equal(publishedConfig.MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION, false, "read-only evaluation permission must be masked after permanent cutover");
assert.equal(publishedConfig.MES_REACT_NOMENCLATURE_WRITE_EVALUATION, false, "write evaluation permission must be masked after permanent cutover");
const publishedScript = renderRuntimeConfigScript({ DATABASE_URL: "must-not-leak" }, { reactRuntimePolicy: permanentCandidatePolicy });
assert.match(publishedScript, /"nomenclature":"react"/, "runtime bootstrap must publish permanent Nomenclature ownership");
assert.doesNotMatch(publishedScript, /must-not-leak/, "runtime bootstrap must not expose deployment secrets");

const permanentActivation = resolveReactRuntimeActivation({
  surfaceId: "nomenclature",
  runtimeConfig: { MES_REACT_RUNTIME_POLICY: permanentCandidatePolicy },
  evaluationFeatureEnabled: false,
  evaluationRequested: false,
  localQaEnabled: false,
});
assert.deepEqual(permanentActivation, { runtimeMode: "react", featureFlagEnabled: true, accessMode: "react" }, "normal URL must activate permanent Nomenclature without query or environment flags");
const queryCannotDowngrade = resolveReactRuntimeActivation({
  surfaceId: "nomenclature",
  runtimeConfig: { MES_REACT_RUNTIME_POLICY: permanentCandidatePolicy },
  evaluationFeatureEnabled: false,
  evaluationRequested: false,
  localQaEnabled: false,
});
assert.deepEqual(queryCannotDowngrade, permanentActivation, "evaluation/query inputs must not downgrade a permanent policy decision");

const previousHTMLElement = globalThis.HTMLElement;
const previousDocument = globalThis.document;
globalThis.HTMLElement = FakeElement;
globalThis.document = { createElement: () => new FakeElement() };

try {
  let shellActivation = {
    runtimeMode: "react",
    accessMode: "react",
    featureFlagEnabled: true,
    serverReadReady: false,
    serverReadFailure: "",
    policyId: "qa-nomenclature-permanent",
  };
  const shellTelemetry = [];
  let shellLegacyRenders = 0;
  const shellHost = createNomenclatureReactIslandHost({
    getActivation: () => shellActivation,
    getPayload: () => ({}),
    getTargetRoot: () => ({ querySelector: () => new FakeElement() }),
    requestLegacyRender: () => { shellLegacyRenders += 1; },
    executeCommand: () => { throw new Error("unready permanent shell dispatched a command"); },
    reportTelemetry: (event) => shellTelemetry.push(event),
  });
  assert.match(shellHost.renderTarget(), /data-react-island-runtime-mode="react"/);
  assert.match(shellHost.renderTarget(), /data-react-island-state="loading"/);
  assert.match(shellHost.renderTarget(), /data-ui-component="ModuleSidebar"/, "permanent loading/error shell must preserve the common module layout");
  assert.equal(await shellHost.mount(), false, "permanent Nomenclature must not mount before the durable projection is ready");
  assert.equal(shellLegacyRenders, 0, "permanent loading must not request legacy Nomenclature");
  assert.equal(shellTelemetry.filter((event) => event.state === "loading" && event.stage === "read").length, 1, "repeated loading renders must emit one bounded event");
  shellActivation = { ...shellActivation, serverReadFailure: "read-unavailable" };
  assert.match(shellHost.renderTarget(), /data-react-island-state="error"/);
  assert.match(shellHost.renderTarget(), /read-unavailable/);
  assert.equal(await shellHost.mount(), false, "permanent Nomenclature must not mount against a failed durable read");
  assert.equal(shellLegacyRenders, 0, "permanent read failure must not expose legacy Nomenclature");
  assert.equal(shellTelemetry.filter((event) => event.state === "error" && event.stage === "read").length, 1, "repeated read errors must emit one bounded event");

  const permanentTarget = new FakeElement();
  const permanentTelemetry = [];
  const permanentErrors = [];
  let permanentLoads = 0;
  let permanentLegacyRenders = 0;
  const permanentFailureHost = createReactIslandHost({
    getActivation: () => ({ runtimeMode: "react", accessMode: "react" }),
    getPayload: () => ({}),
    getTargetRoot: () => ({ querySelector: () => permanentTarget }),
    getIneligibilityReason: () => "",
    targetSelector: "[data-react-nomenclature-test]",
    renderTarget: '<div data-react-nomenclature-test data-react-island-state="loading"></div>',
    loadIsland: async () => { permanentLoads += 1; throw new Error("bounded Nomenclature mount failure"); },
    mountIsland: () => null,
    requestLegacyRender: () => { permanentLegacyRenders += 1; },
    canFallbackToLegacy: (activation) => activation.accessMode !== "react",
    getTelemetryContext: () => ({ surfaceId: "nomenclature", runtimeMode: "react", policyId: "qa-nomenclature-permanent" }),
    reportTelemetry: (event) => permanentTelemetry.push(event),
    reportError: (error) => permanentErrors.push(error.message),
  });
  assert.equal(await permanentFailureHost.mount(), false);
  assert.equal(permanentFailureHost.getFailureReason(), "mount-error");
  assert.equal(permanentTarget.dataset.reactIslandState, "error");
  assert.equal(permanentLegacyRenders, 0, "permanent mount failure must never request live legacy Nomenclature");
  assert.deepEqual(permanentErrors, ["bounded Nomenclature mount failure"]);
  assert.equal(permanentTelemetry.filter((event) => event.state === "error" && event.stage === "mount").length, 1);
  assert.deepEqual(permanentFailureHost.prepareRender(), { activateReact: true, reason: "mount-error" });
  assert.equal(await permanentFailureHost.mount(), false);
  assert.equal(permanentLoads, 1, "latched permanent failure must not enter a remount loop");
  assert.equal(permanentTelemetry.filter((event) => event.state === "error").length, 1, "latched permanent failure telemetry must stay bounded");

  const evaluationTarget = new FakeElement();
  let evaluationLegacyRenders = 0;
  const evaluationHost = createReactIslandHost({
    getActivation: () => ({ runtimeMode: "evaluation", accessMode: "read-only-evaluation" }),
    getPayload: () => ({}),
    getTargetRoot: () => ({ querySelector: () => evaluationTarget }),
    getIneligibilityReason: () => "",
    targetSelector: "[data-react-nomenclature-test]",
    renderTarget: '<div data-react-nomenclature-test></div>',
    loadIsland: async () => { throw new Error("evaluation mount failure"); },
    mountIsland: () => null,
    requestLegacyRender: () => { evaluationLegacyRenders += 1; },
    canFallbackToLegacy: (activation) => activation.accessMode !== "react",
    reportError: () => {},
  });
  assert.equal(await evaluationHost.mount(), false);
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.equal(evaluationLegacyRenders, 1, "evaluation rollback must remain available even after permanent cutover is implemented");

  const readyTarget = new FakeElement();
  readyTarget.setAttribute("aria-busy", "true");
  const readyTelemetry = [];
  const readyHost = createReactIslandHost({
    getActivation: () => ({ runtimeMode: "react", accessMode: "react" }),
    getPayload: () => ({}),
    getTargetRoot: () => ({ querySelector: () => readyTarget }),
    getIneligibilityReason: () => "",
    targetSelector: "[data-react-nomenclature-test]",
    renderTarget: '<div data-react-nomenclature-test aria-busy="true"></div>',
    loadIsland: async () => ({}),
    mountIsland: ({ onReady }) => { onReady({ revision: 3 }); return { unmount() {} }; },
    canFallbackToLegacy: () => false,
    getTelemetryContext: () => ({ surfaceId: "nomenclature", runtimeMode: "react", policyId: "qa-nomenclature-permanent" }),
    reportTelemetry: (event) => readyTelemetry.push(event),
  });
  assert.equal(await readyHost.mount(), true);
  assert.equal(readyTarget.dataset.reactIslandState, "ready");
  assert.equal(readyTarget["aria-busy"], "false");
  assert.equal(readyTelemetry.filter((event) => event.state === "ready" && event.stage === "commit").length, 1);
} finally {
  if (previousHTMLElement === undefined) delete globalThis.HTMLElement;
  else globalThis.HTMLElement = previousHTMLElement;
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}

const [appSource, hostSource, islandSource, productsEventsSource, runtimeStateSource] = await Promise.all([
  readFile(join(root, "src/app.js"), "utf8"),
  readFile(join(root, "src/modules/nomenclature/react_island_host.js"), "utf8"),
  readFile(join(root, "experiments/react-migration/src/modules/nomenclature/NomenclatureScenario.tsx"), "utf8"),
  readFile(join(root, "src/modules/products/events.js"), "utf8"),
  readFile(join(root, "src/modules/runtime_state/service.js"), "utf8"),
]);
const hostStart = appSource.indexOf("function getNomenclatureReactReadState");
const hostEnd = appSource.indexOf("function getBoardsReactLocalQaOverrides", hostStart);
const appHostSource = appSource.slice(hostStart, hostEnd);
assert(hostStart >= 0 && hostEnd > hostStart, "Nomenclature application host boundary must be discoverable");
assert.match(appHostSource, /resolveReactRuntimeActivation\(\{[^]*surfaceId:\s*["']nomenclature["']/, "Nomenclature activation must come from the signed runtime policy");
assert.match(appHostSource, /serverReadReady/, "Nomenclature activation must expose durable read readiness");
assert.match(appHostSource, /serverReadFailure/, "Nomenclature activation must expose durable read failure");
const writeDecisionStart = appHostSource.indexOf("function getNomenclatureReactWriteDecision");
const writeDecisionEnd = appHostSource.indexOf("function canRequestNomenclatureEmployeeElevation", writeDecisionStart);
const writeDecisionSource = appHostSource.slice(writeDecisionStart, writeDecisionEnd);
assert(writeDecisionStart >= 0 && writeDecisionEnd > writeDecisionStart, "permanent Nomenclature write decision must be discoverable");
assert.match(writeDecisionSource, /activation\.accessMode\s*===\s*["']react["']\s*\|\|\s*isNomenclatureServerCommandsPrimary\(\)/, "permanent or command-primary ownership must select the server-authority guard");
assert.match(writeDecisionSource, /activation\.ownerReady\s*!==\s*true/, "server-authority writes must require the durable owner projection");
assert.match(writeDecisionSource, /nomenclatureServerCapabilitiesState\.status\s*!==\s*["']ready["']/, "server-authority writes must wait for an explicit capability result");
assert.match(writeDecisionSource, /!result\?\.authenticated\s*\|\|\s*!result\.actor\?\.employeeId/, "server-authority writes must require an authenticated employee actor");
assert.match(writeDecisionSource, /getAuthenticatedAccessPerson\(\)/, "server actor must be checked against the locally selected employee");
assert.match(writeDecisionSource, /String\(result\.actor\.employeeId\)\s*!==\s*String\(localPerson\.id\)/, "capability actor must exactly match the locally selected employee");
assert.match(writeDecisionSource, /getEmployeeServerActor\(\)/, "write capability must also require the signed employee-session actor");
assert.match(writeDecisionSource, /String\(sessionActor\.employeeId\)\s*!==\s*String\(localPerson\.id\)/, "signed session actor must exactly match the locally selected employee");
assert.match(writeDecisionSource, /serverCommandsConfigured\s*!==\s*true\s*\|\|\s*capabilities\.serverCommandsEnabled\s*!==\s*true/, "server command configuration and operator enablement must both be required");
assert.match(writeDecisionSource, /canEditNomenclature\s*!==\s*true/, "all server-authority mutations must require edit capability");
assert.match(writeDecisionSource, /normalizedAction\s*===\s*["']create["'][^]*canCreateNomenclature\s*!==\s*true/, "create must require its dedicated server capability");
assert.match(writeDecisionSource, /normalizedAction\s*===\s*["']delete["'][^]*canDeleteNomenclature\s*!==\s*true/, "delete must require its dedicated server capability");
assert.match(writeDecisionSource, /canEditDirectorySection\(["']nomenclature["']\)[^]*accessMode\s*!==\s*["']write-evaluation["']/, "local RBAC must remain confined to the non-primary evaluation rollback path");
assert.match(appHostSource, /command\.type\s*===\s*["']delete["'][^]*getNomenclatureReactWriteDecision\(["']delete["']\)/, "delete dispatch must independently recheck its server capability");
assert.match(appHostSource, /getNomenclatureReactWriteDecision\(input\.isNew\s*===\s*true\s*\?\s*["']create["']\s*:\s*["']edit["']\)/, "save dispatch must independently recheck create/edit server capability");
assert.match(appHostSource, /requireDurable:\s*true/, "permanent Nomenclature saves must require durable server acknowledgement");
assert.match(appSource, /if\s*\(!failClosed\)\s*ensureStatusDirectoryDefaults\(\)/, "permanent targeted reads must not auto-write missing compatibility defaults");
assert.match(hostSource, /canFallbackToLegacy:[^]*accessMode\s*!==\s*["']react["']/, "permanent Nomenclature host must fail closed instead of rendering live legacy");
assert.match(hostSource, /getShellState:[^]*serverReadFailure[^]*serverReadReady/, "Nomenclature host must own loading and read-error shells");
assert.match(hostSource, /surfaceId:\s*["']nomenclature["']/, "Nomenclature telemetry must retain the policy surface id");
assert.match(islandSource, /onRequestBoards|onNavigateBoards/, "Boards must be an explicit navigation intent, not a Nomenclature legacy request");
assert.doesNotMatch(islandSource, /onRequestLegacy/, "permanent Nomenclature UI must not model Boards as a legacy fallback");
assert.match(islandSource, /expectedRow/, "the React editor must retain the exact row baseline captured when the draft opens");
assert.match(productsEventsSource, /persistNomenclatureDirectoryMutationDurably\(\{/, "Nomenclature owner must use the isolated durable mutation path");
assert.match(productsEventsSource, /code:\s*["']persistence-unconfirmed["']/, "unconfirmed Nomenclature persistence must fail closed");
const serverCommandStart = runtimeStateSource.indexOf("async function persistNomenclatureServerCommandDurably");
const durableMutationStart = runtimeStateSource.indexOf("async function persistNomenclatureDirectoryMutationDurably", serverCommandStart);
const legacyDurableEnd = runtimeStateSource.indexOf("async function persistDirectoryStateDurably", durableMutationStart);
const serverCommandSource = runtimeStateSource.slice(serverCommandStart, durableMutationStart);
const durableMutationSource = runtimeStateSource.slice(durableMutationStart, legacyDurableEnd);
assert(serverCommandStart >= 0 && durableMutationStart > serverCommandStart && legacyDurableEnd > durableMutationStart, "server-command primary and CAS rollback boundaries must be discoverable");
assert.match(durableMutationSource, /if\s*\(isNomenclatureServerCommandsPrimary\(\)\)\s*\{\s*return await persistNomenclatureServerCommandDurably\(intent\)/, "command-primary mode must dispatch through the dedicated Nomenclature command owner");
assert.match(serverCommandSource, /getNomenclatureCommandExpectedRevision\(intent\)/, "server commands must bind retries to the hydrated expected revision");
assert.match(serverCommandSource, /executeNomenclatureServerCommand\(intent,\s*attempt\.revision\)/, "server commands must send the stable expected revision to the authenticated owner");
assert.match(serverCommandSource, /Number\(result\?\.status\s*\|\|\s*0\)\s*>\s*0[^]*nomenclatureCommandAttemptRevisions\.delete/, "only a definitive HTTP response may release the retry revision");
assert.match(serverCommandSource, /applyAuthoritativeNomenclatureProjection\(result\.projection\)/, "server-command success must apply only the authoritative projection");
assert.match(serverCommandSource, /result\.superseded\s*===\s*true[^]*code:\s*["']command-superseded["']/, "a superseded idempotent replay must refresh state but fail the user command");
assert.match(serverCommandSource, /result\?\.conflict\s*&&\s*result\.projection[^]*applyAuthoritativeNomenclatureProjection/, "a trusted conflict projection may refresh the UI while the command remains failed");
assert.match(durableMutationSource, /requestSharedState\(["']GET["'],\s*null,\s*\{\s*valueKeys:\s*\[DIRECTORY_STORAGE_KEY\]\s*\}\)/, "primary=false must retain the exact-projection CAS rollback read");
assert.match(durableMutationSource, /requestSharedState\(["']POST["'][^]*responseMode:\s*["']ack["'][^]*values:\s*\{\s*\[DIRECTORY_STORAGE_KEY\]/, "primary=false must retain the narrow CAS acknowledgement write");
assert.match(durableMutationSource, /if\s*\(response\.conflict\s*===\s*true\)[^]*code:\s*["']version-conflict["']/, "CAS rollback conflicts must still fail closed");
assert.match(runtimeStateSource, /isNomenclatureServerCommandsPrimary\s*=\s*\(\)\s*=>\s*false/, "the runtime-state dependency must default command-primary off for rollback safety");
assert.match(runtimeStateSource, /isDirectoryStateReason\(reason\)\s*&&\s*!isNomenclatureServerCommandsPrimary\(\)/, "generic directory snapshots must remain available only while the command owner is not primary");
assert.match(runtimeStateSource, /rememberSharedStateValueHydration/, "targeted reads must retain a server-version watermark");
assert.match(appSource, /sharedStateStatus\.version[^>]*>\s*Number\(hydrationState\.version/, "an advanced metadata revision must invalidate stale Nomenclature hydration");
assert.match(appSource, /hydrationState\.retryAt\s*=\s*failClosed\s*\?\s*Date\.now\(\)\s*\+\s*3_000/, "transient fail-closed reads must become retryable after a bounded cooldown");

console.log("Nomenclature permanent React runtime QA passed: signed policy, employee-authenticated server-command primary, authoritative projections, CAS rollback and fail-closed ownership.");
