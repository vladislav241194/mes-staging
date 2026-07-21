import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  REACT_RUNTIME_PERMANENT_CONSUMERS,
  REACT_RUNTIME_SURFACE_IDS,
  assertReactRuntimeEnvironment,
  getPublicReactRuntimePolicy,
  loadReactRuntimePolicy,
  normalizeReactRuntimePolicy,
  summarizeReactRuntimePolicy,
} from "./react-runtime-policy.mjs";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";
import { getReactRuntimeMode, resolveReactRuntimeActivation } from "../src/modules/react_runtime_policy.js";

const projectRoot = join(import.meta.dirname, "..");
const requireDist = process.argv.includes("--require-dist");
const policyPath = join(projectRoot, "react-runtime-policy.json");
const sourcePolicyText = await readFile(policyPath, "utf8");
const ledger = JSON.parse(await readFile(join(projectRoot, "experiments", "react-migration", "cutover-ledger.json"), "utf8"));
const commandScenarioIds = ledger.scenarioAcceptance.map((scenario) => scenario.id).sort();
assert.deepEqual([...REACT_RUNTIME_SURFACE_IDS].sort(), commandScenarioIds, "runtime policy must cover the same 24 production scenarios as the cutover ledger");
const acceptedSurfaceIds = ledger.scenarioAcceptance.filter((scenario) => scenario.defaultOn).map((scenario) => scenario.id).sort();
const evidenceAcceptedSurfaceIds = [...(ledger.permanentPilotEvidence?.reactSurfaces || [])].sort();
assert.deepEqual(acceptedSurfaceIds, evidenceAcceptedSurfaceIds, "accepted IDs must come from matching scenario default-on and permanent Pilot evidence");
const candidatePolicy = ledger.candidatePolicy ?? null;
const candidateSurfaceIds = candidatePolicy ? [...candidatePolicy.surfaceIds].sort() : [];

const policy = await loadReactRuntimePolicy({ projectRoot, env: { APP_ENV: "local" } });
assert.equal(policy.schemaVersion, 1);
assert.equal(policy.policyId, "mes-react-runtime-v1");
assert.match(policy.sha256 || "", /^[a-f0-9]{64}$/);
assert.equal(policy.source, "react-runtime-policy.json");
assert.equal(Object.keys(policy.surfaces).length, 24);
assert(REACT_RUNTIME_SURFACE_IDS.every((id) => ["legacy", "evaluation", "react"].includes(policy.surfaces[id])));
assert.deepEqual(REACT_RUNTIME_PERMANENT_CONSUMERS, ["nomenclature", "structureMigrationDiagnostics", "weeklyProductionControl"], "permanent allowlist must stay explicit and minimal");
const expectedReactSurfaceIds = [...new Set([...acceptedSurfaceIds, ...candidateSurfaceIds])].sort();
assert.deepEqual(
  summarizeReactRuntimePolicy(policy).reactSurfaces,
  expectedReactSurfaceIds,
  candidatePolicy
    ? "candidate release policy React IDs must equal accepted IDs plus the declared awaiting-acceptance candidate IDs"
    : "release policy React IDs must equal accepted IDs when no candidate policy is declared",
);
assert(
  summarizeReactRuntimePolicy(policy).reactSurfaces.every((id) => REACT_RUNTIME_PERMANENT_CONSUMERS.includes(id)),
  "only explicitly wired permanent consumers, including a declared candidate, may use react mode",
);
assert.deepEqual(summarizeReactRuntimePolicy(policy).activeEvaluationSurfaces, []);
if (candidatePolicy) {
  assert.equal(candidatePolicy.status, "awaiting-pilot-acceptance", "candidate policy must stay explicitly unaccepted");
  assert.deepEqual(candidateSurfaceIds, ["nomenclature"], "this candidate policy must contain only Nomenclature");
  assert.equal(candidatePolicy.runtimePolicySha256, policy.sha256, "candidate evidence contract must bind the exact current policy bytes");
  assert.equal(candidatePolicy.baseAcceptedRelease, ledger.activePilotRelease, "candidate must name the accepted release it extends");
  assert.deepEqual(candidatePolicy.requiredEvidence, [
    "current-release-read",
    "create-edit-readback-delete-cleanup",
    "rollback-reactivation",
  ], "candidate acceptance must require the complete read/write/cleanup/rollback evidence set");
  assert.equal(Object.hasOwn(candidatePolicy, "pilotEvidence"), false, "candidate may not claim Pilot evidence before acceptance");
  assert.equal(ledger.currentProgress, 50, "an awaiting candidate must not increase audited progress");
  for (const surfaceId of candidateSurfaceIds) {
    const acceptance = ledger.scenarioAcceptance.find((scenario) => scenario.id === surfaceId);
    assert(acceptance, `${surfaceId}: candidate must map to a scenario acceptance row`);
    assert.equal(acceptance.defaultOn, false, `${surfaceId}: candidate is not accepted default-on yet`);
    assert.equal(acceptance.currentReleaseRead, "pending", `${surfaceId}: candidate current-release read must remain pending`);
    assert(!acceptedSurfaceIds.includes(surfaceId), `${surfaceId}: candidate may not already be in accepted IDs`);
    assert.equal(ledger.permanentPilotEvidence?.authenticatedPilot?.[surfaceId], undefined, `${surfaceId}: candidate must be absent from permanent Pilot evidence`);
  }
} else {
  assert.equal(policy.sha256, ledger.permanentPilotEvidence?.runtimePolicySha256, "without a candidate, current policy bytes must equal the accepted permanent policy evidence");
}

const allEvaluationSurfaces = Object.fromEntries(REACT_RUNTIME_SURFACE_IDS.map((id) => [id, "evaluation"]));
const evaluationPolicy = normalizeReactRuntimePolicy({
  schemaVersion: 1,
  policyId: "qa-all-evaluation",
  surfaces: allEvaluationSurfaces,
});
const weeklyReactPolicy = normalizeReactRuntimePolicy({
  schemaVersion: 1,
  policyId: "qa-weekly-react",
  surfaces: { ...allEvaluationSurfaces, weeklyProductionControl: "react" },
});
const weeklyLegacyPolicy = normalizeReactRuntimePolicy({
  schemaVersion: 1,
  policyId: "qa-weekly-legacy",
  surfaces: { ...allEvaluationSurfaces, weeklyProductionControl: "legacy" },
});
const wiredReactPolicy = normalizeReactRuntimePolicy({
  schemaVersion: 1,
  policyId: "qa-wired-react",
  surfaces: { ...allEvaluationSurfaces, nomenclature: "react", structureMigrationDiagnostics: "react", weeklyProductionControl: "react" },
});

assert.throws(() => normalizeReactRuntimePolicy({ schemaVersion: 2, policyId: "bad", surfaces: {} }), /schema/);
assert.throws(() => normalizeReactRuntimePolicy({ schemaVersion: 1, policyId: "bad", surfaces: {} }), /every production surface/);
assert.throws(() => normalizeReactRuntimePolicy({ schemaVersion: 1, policyId: "bad-policy", surfaces: { ...policy.surfaces, weeklyProductionControl: "unknown" } }), /Unsupported React runtime mode/);
assert.throws(() => normalizeReactRuntimePolicy({ schemaVersion: 1, policyId: "bad-policy", surfaces: { ...policy.surfaces, invented: "legacy" } }), /every production surface/);
assert.throws(() => normalizeReactRuntimePolicy({
  schemaVersion: 1,
  policyId: "unwired-react",
  surfaces: { ...allEvaluationSurfaces, gantt: "react" },
}), /not wired for permanent mode: gantt/);

const weeklyEvaluationEnv = {
  MES_REACT_WEEKLY_PRODUCTION_CONTROL: "1",
  MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION: "1",
};
const nomenclatureEvaluationEnv = {
  MES_REACT_NOMENCLATURE: "1",
  MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION: "1",
};
const diagnosticsEvaluationEnv = {
  MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS: "1",
  MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS_READ_ONLY_EVALUATION: "1",
};
assert.deepEqual(assertReactRuntimeEnvironment({}, evaluationPolicy), []);
assert.deepEqual(assertReactRuntimeEnvironment(weeklyEvaluationEnv, evaluationPolicy), ["weeklyProductionControl"]);
assert.deepEqual(
  summarizeReactRuntimePolicy(evaluationPolicy, { activeEvaluationSurfaces: ["weeklyProductionControl"] }).activeEvaluationSurfaces,
  ["weeklyProductionControl"],
);
assert.throws(() => assertReactRuntimeEnvironment({ MES_REACT_WEEKLY_PRODUCTION_CONTROL: "1" }, evaluationPolicy), /feature flag is orphaned/);
assert.throws(() => assertReactRuntimeEnvironment({ MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION: "1" }, evaluationPolicy), /permission is orphaned/);
assert.throws(() => assertReactRuntimeEnvironment({
  MES_REACT_NOMENCLATURE: "1",
  MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION: "1",
  MES_REACT_NOMENCLATURE_WRITE_EVALUATION: "1",
}, evaluationPolicy), /Exactly one React evaluation permission/);
assert.throws(() => assertReactRuntimeEnvironment({ ...weeklyEvaluationEnv, ...nomenclatureEvaluationEnv }, evaluationPolicy), /Only one React evaluation surface/);
assert.throws(() => assertReactRuntimeEnvironment({ MES_REACT_UNKNOWN_SURFACE: "1" }, evaluationPolicy), /Unknown configured React runtime environment flag/);
assert.throws(() => assertReactRuntimeEnvironment({ MES_REACT_UNKNOWN_SURFACE: "0" }, evaluationPolicy), /Unknown configured React runtime environment flag/);
assert.throws(() => assertReactRuntimeEnvironment({ MES_REACT_WEEKLY_PRODUCTION_CONTROL: "true" }, evaluationPolicy), /exact value 1/);
assert.throws(() => assertReactRuntimeEnvironment(weeklyEvaluationEnv, weeklyReactPolicy), /flags are forbidden.*mode is react/);
assert.throws(() => assertReactRuntimeEnvironment(weeklyEvaluationEnv, weeklyLegacyPolicy), /flags are forbidden.*mode is legacy/);
assert.throws(() => assertReactRuntimeEnvironment(diagnosticsEvaluationEnv, wiredReactPolicy), /flags are forbidden.*mode is react/);

const evaluationPublicPolicy = getPublicReactRuntimePolicy(evaluationPolicy);
const weeklyReactPublicPolicy = getPublicReactRuntimePolicy(weeklyReactPolicy);
const weeklyLegacyPublicPolicy = getPublicReactRuntimePolicy(weeklyLegacyPolicy);
const wiredReactPublicPolicy = getPublicReactRuntimePolicy(wiredReactPolicy);
const maskedEnvironment = {
  APP_ENV: "pilot",
  DATABASE_URL: "must-not-leak",
  ...weeklyEvaluationEnv,
  ...nomenclatureEvaluationEnv,
  ...diagnosticsEvaluationEnv,
};
const evaluationConfig = getPublicRuntimeConfig(maskedEnvironment, { reactRuntimePolicy: evaluationPublicPolicy });
assert.equal(evaluationConfig.MES_REACT_WEEKLY_PRODUCTION_CONTROL, true);
assert.equal(evaluationConfig.MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION, true);
assert.equal(evaluationConfig.MES_REACT_NOMENCLATURE, true);
const reactConfig = getPublicRuntimeConfig(maskedEnvironment, { reactRuntimePolicy: weeklyReactPublicPolicy });
assert.equal(reactConfig.MES_REACT_WEEKLY_PRODUCTION_CONTROL, false, "react mode must mask its obsolete evaluation feature flag");
assert.equal(reactConfig.MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION, false, "react mode must mask its obsolete evaluation permission");
assert.equal(reactConfig.MES_REACT_NOMENCLATURE, true, "another surface may retain its isolated evaluation contract");
const legacyConfig = getPublicRuntimeConfig(maskedEnvironment, { reactRuntimePolicy: weeklyLegacyPublicPolicy });
assert.equal(legacyConfig.MES_REACT_WEEKLY_PRODUCTION_CONTROL, false, "legacy mode must mask its evaluation feature flag");
assert.equal(legacyConfig.MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION, false, "legacy mode must mask its evaluation permission");
const wiredReactConfig = getPublicRuntimeConfig(maskedEnvironment, { reactRuntimePolicy: wiredReactPublicPolicy });
assert.equal(wiredReactConfig.MES_REACT_NOMENCLATURE, false, "wired React Nomenclature candidate must mask its obsolete evaluation feature flag");
assert.equal(wiredReactConfig.MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION, false, "wired React Nomenclature candidate must mask its obsolete read evaluation permission");
assert.equal(wiredReactConfig.MES_REACT_NOMENCLATURE_WRITE_EVALUATION, false, "wired React Nomenclature candidate must mask its obsolete write evaluation permission");
assert.equal(wiredReactConfig.MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS, false, "permanent Diagnostics must mask its obsolete evaluation feature flag");
assert.equal(wiredReactConfig.MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS_READ_ONLY_EVALUATION, false, "permanent Diagnostics must mask its obsolete evaluation permission");

const runtimeScript = renderRuntimeConfigScript(maskedEnvironment, { reactRuntimePolicy: weeklyReactPublicPolicy });
assert.match(runtimeScript, /"MES_REACT_RUNTIME_POLICY"/);
assert.doesNotMatch(runtimeScript, /must-not-leak/);
assert.equal(getReactRuntimeMode("weeklyProductionControl", reactConfig), "react");
assert.equal(getReactRuntimeMode("unknown-surface", reactConfig), "legacy");
assert.deepEqual(resolveReactRuntimeActivation({
  surfaceId: "weeklyProductionControl",
  runtimeConfig: evaluationConfig,
  evaluationFeatureEnabled: true,
  evaluationRequested: false,
}), { runtimeMode: "evaluation", featureFlagEnabled: false, accessMode: "legacy" });
assert.deepEqual(resolveReactRuntimeActivation({
  surfaceId: "weeklyProductionControl",
  runtimeConfig: evaluationConfig,
  evaluationFeatureEnabled: true,
  evaluationRequested: true,
}), { runtimeMode: "evaluation", featureFlagEnabled: true, accessMode: "read-only-evaluation" });
assert.deepEqual(resolveReactRuntimeActivation({
  surfaceId: "weeklyProductionControl",
  runtimeConfig: reactConfig,
  evaluationFeatureEnabled: true,
  evaluationRequested: true,
  localQaEnabled: true,
}), { runtimeMode: "react", featureFlagEnabled: true, accessMode: "react" }, "query and evaluation flags must not downgrade permanent React");
assert.deepEqual(resolveReactRuntimeActivation({
  surfaceId: "nomenclature",
  runtimeConfig: wiredReactConfig,
  evaluationFeatureEnabled: true,
  evaluationRequested: true,
  localQaEnabled: true,
}), { runtimeMode: "react", featureFlagEnabled: true, accessMode: "react" }, "query and evaluation flags must not downgrade a wired Nomenclature candidate policy");
assert.deepEqual(resolveReactRuntimeActivation({
  surfaceId: "structureMigrationDiagnostics",
  runtimeConfig: wiredReactConfig,
  evaluationFeatureEnabled: true,
  evaluationRequested: true,
  localQaEnabled: true,
}), { runtimeMode: "react", featureFlagEnabled: true, accessMode: "react" }, "query and local flags must not downgrade permanent Diagnostics");

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-react-runtime-policy-"));
try {
  const localMissingPolicy = await loadReactRuntimePolicy({ projectRoot: temporaryRoot, env: { APP_ENV: "local" } });
  assert.equal(localMissingPolicy.policyId, "implicit-legacy");
  assert(REACT_RUNTIME_SURFACE_IDS.every((id) => localMissingPolicy.surfaces[id] === "legacy"));
  await assert.rejects(
    loadReactRuntimePolicy({ projectRoot: temporaryRoot, env: { APP_ENV: "pilot" } }),
    /required in protected environment: pilot/,
  );

  const malformedPolicyPath = join(temporaryRoot, "react-runtime-policy.json");
  await writeFile(malformedPolicyPath, "{not-json}\n");
  await assert.rejects(
    loadReactRuntimePolicy({ projectRoot: temporaryRoot, env: { APP_ENV: "pilot" } }),
    /JSON|position|property name/i,
  );
  await assert.rejects(
    loadReactRuntimePolicy({ projectRoot, env: { APP_ENV: "pilot", MES_REACT_RUNTIME_POLICY_PATH: malformedPolicyPath } }),
    /forbidden in protected environments/,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

const [serverSource, previewSource, buildSource, deploySource, sharedStateSource] = await Promise.all([
  readFile(join(projectRoot, "server.js"), "utf8"),
  readFile(join(projectRoot, "scripts", "preview-dist.mjs"), "utf8"),
  readFile(join(projectRoot, "scripts", "build.mjs"), "utf8"),
  readFile(join(projectRoot, "scripts", "deploy-contour.mjs"), "utf8"),
  readFile(join(projectRoot, "scripts", "shared-state-storage.mjs"), "utf8"),
]);
assert.match(serverSource, /loadReactRuntimePolicy\(\{ projectRoot: root, env: process\.env \}\)/, "server must load the active release policy");
assert.match(serverSource, /assertSingleReactEvaluationPermission\(process\.env, reactRuntimePolicy\)/, "server startup must enforce the evaluation environment contract");
assert.match(serverSource, /renderRuntimeConfigScript\(process\.env, \{ reactRuntimePolicy: publicReactRuntimePolicy \}\)/, "server must expose only the validated public policy");
assert.match(serverSource, /reactRuntime: reactRuntimeSummary/, "server health must expose the policy summary");
assert.match(previewSource, /loadReactRuntimePolicy\(\{ projectRoot: distDir, env: process\.env \}\)/, "preview must load the built dist policy, not mutable source");
assert.match(previewSource, /assertSingleReactEvaluationPermission\(process\.env, reactRuntimePolicy\)/, "preview startup must enforce the evaluation environment contract");
assert.match(buildSource, /loadReactRuntimePolicy\(\{ projectRoot, env: \{ APP_ENV: "production" \} \}\)/, "build must validate the immutable policy before copying it");
assert.match(buildSource, /copyFile\(join\(projectRoot, "react-runtime-policy\.json"\), join\(stagingDistDir, "react-runtime-policy\.json"\)\)/, "build must copy the policy byte-for-byte into dist");
assert.match(deploySource, /"react-runtime-policy\.json"/, "the retained deployment allowlist must ship the policy");
assert.match(sharedStateSource, /evaluationAllowed && config\[contract\.feature\] === true/, "public legacy booleans must be masked by the immutable policy");

const distPolicyPath = join(projectRoot, "dist", "react-runtime-policy.json");
let distPolicyText = null;
try {
  distPolicyText = await readFile(distPolicyPath, "utf8");
} catch (error) {
  if (error?.code !== "ENOENT" || requireDist) throw error;
}
if (distPolicyText !== null) {
  assert.equal(distPolicyText, sourcePolicyText, "dist policy must be byte-identical to the immutable source policy");
}
if (requireDist) assert.notEqual(distPolicyText, null, "--require-dist needs a completed build artifact");

console.log(`React runtime policy QA passed: protected fail-closed, exact evaluation env, policy masking, permanent-consumer allowlist, and immutable delivery identity; ${candidatePolicy ? `${candidateSurfaceIds.join(", ")} acceptance pending` : "no candidate policy"}.`);
