import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import { SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { createSystemDomainsRepository } from "./domain-system-domains-repository.mjs";
import {
  appendSharedStateAudit,
  backupSharedStateFile,
  getSharedStateServerPaths,
} from "./shared-state-storage.mjs";
import { updateSharedStateSnapshot } from "./shared-state-endpoint.mjs";
import {
  inspectSystemDomainsSnapshotConsistency,
  inspectSystemDomainsSnapshotPromotionCandidate,
} from "./domain-system-domains-snapshot-sync.mjs";

const ACTION = "system-domains-retire-compatibility-snapshot";
const REPAIR_ACTION = "system-domains-repair-postgres-primary-tombstone";
const REQUIRED_SERVER_COMMAND_SURFACES = ["production-structure", "timesheet", "access-control"];
const SYSTEM_DOMAINS_COMMAND_ACTOR_PATTERN = /^public:[^,\s]+$/;

function assert(value, message) {
  if (!value) throw new Error(message);
}

function text(value = "") {
  return String(value ?? "").trim();
}

function sha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function registryCounts(domains) {
  return Object.fromEntries(Object.entries(domains?.registries || {}).map(([name, values]) => [name, Array.isArray(values) ? values.length : 0]));
}

function commandCoverage(env = process.env) {
  const enabled = String(env.MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS || "") === "1";
  const surfaces = [...new Set(String(env.MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES || "")
    .split(",")
    .map((value) => text(value))
    .filter((value) => REQUIRED_SERVER_COMMAND_SURFACES.includes(value)))];
  const missingSurfaces = REQUIRED_SERVER_COMMAND_SURFACES.filter((surface) => !surfaces.includes(surface));
  const authorizedActors = new Set(String(env.MES_SYSTEM_DOMAINS_COMMAND_ACTORS || "")
    .split(",")
    .map((value) => text(value))
    .filter(Boolean));
  const invalidActorPolicy = [...authorizedActors].some((actorId) => !SYSTEM_DOMAINS_COMMAND_ACTOR_PATTERN.test(actorId));
  const actorPolicyReason = !authorizedActors.size
    ? "server-command-actor-policy-missing"
    : invalidActorPolicy
      ? "server-command-actor-policy-invalid"
      : "";
  return {
    enabled,
    requiredSurfaces: REQUIRED_SERVER_COMMAND_SURFACES,
    enabledSurfaces: surfaces,
    missingSurfaces,
    authorizedActorCount: authorizedActors.size,
    actorPolicyConfigured: !actorPolicyReason,
    actorPolicyReason,
    complete: enabled && missingSurfaces.length === 0 && !actorPolicyReason,
  };
}

function parseArgs(argv = []) {
  const options = {
    apply: false,
    resume: false,
    repair: false,
    confirmPostgresAuthority: false,
    filePath: "",
    actor: process.env.USER || "system-domains-retirement",
    expectedPostgresRevision: "",
    expectedPostgresSha256: "",
    expectedSnapshotVersion: "",
    expectedSnapshotSha256: "",
    transitionId: "",
  };
  const valueOptions = new Map([
    ["--file", "filePath"],
    ["--actor", "actor"],
    ["--expected-postgres-revision", "expectedPostgresRevision"],
    ["--expected-postgres-sha256", "expectedPostgresSha256"],
    ["--expected-snapshot-version", "expectedSnapshotVersion"],
    ["--expected-snapshot-sha256", "expectedSnapshotSha256"],
    ["--transition-id", "transitionId"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index] || "");
    if (argument === "--apply") {
      options.apply = true;
      continue;
    }
    if (argument === "--resume") {
      options.resume = true;
      continue;
    }
    if (argument === "--repair") {
      options.repair = true;
      continue;
    }
    if (argument === "--confirm-postgres-authority") {
      options.confirmPostgresAuthority = true;
      continue;
    }
    const [name, inlineValue] = argument.split(/=(.*)/s, 2);
    const optionName = valueOptions.get(name);
    if (!optionName) throw new Error(`Unsupported argument: ${argument}`);
    const value = inlineValue === undefined ? String(argv[index + 1] || "") : inlineValue;
    if (inlineValue === undefined) index += 1;
    options[optionName] = text(value);
  }
  if (options.resume && options.repair) throw new Error("Use either --resume or --repair, not both");
  return options;
}

function safeReconciliation(consistency = {}) {
  return consistency?.details?.reconciliation || null;
}

export function buildSystemDomainsRetirementPlan({ consistency, candidate, env = process.env } = {}) {
  const postgres = candidate?.postgres || {};
  const snapshot = candidate?.snapshot || {};
  const authority = candidate?.authority || {};
  const commands = commandCoverage(env);
  const reconciliation = safeReconciliation(consistency);
  const authorityMode = text(authority.mode || "compatibility-snapshot");
  const reasons = [];
  if (Number(postgres.revision || 0) < 1) reasons.push("postgres-uninitialized");
  if (text(snapshot.state) !== "active") reasons.push(`snapshot-${text(snapshot.state) || "missing"}`);
  if (text(snapshot.storageKind) !== "file") reasons.push("snapshot-storage-not-file");
  if (authorityMode !== "compatibility-snapshot") reasons.push(`authority-${authorityMode}`);
  if (consistency?.matches !== true || reconciliation?.promotion?.readEligible !== true) reasons.push("stable-parity-proof-missing");
  if (commands.missingSurfaces.length) reasons.push("server-command-surfaces-incomplete");
  if (!commands.actorPolicyConfigured) reasons.push(commands.actorPolicyReason);
  return {
    action: ACTION,
    mode: "retire",
    postgres: {
      revision: Number(postgres.revision || 0),
      sha256: sha256(postgres.serialized || ""),
      fingerprint: text(postgres.fingerprint) || `sha256:${sha256(postgres.serialized || "")}`,
      registryCounts: registryCounts(postgres.item),
    },
    snapshot: {
      state: text(snapshot.state),
      storageKind: text(snapshot.storageKind),
      version: Number(snapshot.snapshotVersion || 0),
      sha256: sha256(JSON.stringify(snapshot.rawSnapshot || null)),
      registryCounts: registryCounts(snapshot.domains),
    },
    authority: { mode: authorityMode },
    commands,
    reconciliation,
    eligible: reasons.length === 0,
    reasonCodes: reasons,
  };
}

function snapshotHasRetirementProof(snapshot = {}, transitionId = "") {
  const marker = snapshot?.rawSnapshot?.systemDomainsRetirement;
  if (text(marker?.transitionId) === text(transitionId) && text(marker?.action) === ACTION) return true;
  // Compatibility for a tombstone produced by the first release of this
  // procedure. New snapshots always receive the durable compact marker above.
  return Array.isArray(snapshot?.rawSnapshot?.events)
    && snapshot.rawSnapshot.events.some((event) => (
      event?.action === ACTION && text(event?.transitionId) === text(transitionId)
    ));
}

// A file update and PostgreSQL commit cannot share one transaction. If the
// process stops after the tombstone is written, keep the DB marker pending and
// make exactly that state resumable. The event ties the file tombstone to the
// durable DB proof; an arbitrary/null legacy value cannot be promoted.
export function buildSystemDomainsRetirementResumePlan({ candidate, env = process.env } = {}) {
  const postgres = candidate?.postgres || {};
  const snapshot = candidate?.snapshot || {};
  const authority = candidate?.authority || {};
  const commands = commandCoverage(env);
  const transitionId = text(authority.transitionId);
  const reasons = [];
  if (text(authority.mode) !== "transition-pending") reasons.push(`authority-${text(authority.mode) || "compatibility-snapshot"}`);
  if (!transitionId) reasons.push("transition-id-missing");
  // The authority proof is intentionally historical: valid PostgreSQL-primary
  // commands may have advanced the revision since cutover. Bind this repair
  // to the *current* revision/fingerprint through the dry-run proof, while
  // still requiring that the current aggregate cannot predate the recorded
  // primary transition.
  if (Number(authority.proofPostgresRevision || 0) < 1) reasons.push("primary-proof-revision-missing");
  if (!text(authority.proofPostgresFingerprint)) reasons.push("primary-proof-fingerprint-missing");
  if (Number(postgres.revision || 0) < Number(authority.proofPostgresRevision || 0)) reasons.push("postgres-revision-precedes-primary-proof");
  if (text(snapshot.state) !== "retired") reasons.push(`snapshot-${text(snapshot.state) || "missing"}`);
  if (text(snapshot.storageKind) !== "file") reasons.push("snapshot-storage-not-file");
  if (Number(snapshot.snapshotVersion || 0) <= Number(authority.proofSnapshotVersion || 0)) reasons.push("snapshot-tombstone-version-missing");
  if (!snapshotHasRetirementProof(snapshot, transitionId)) reasons.push("snapshot-tombstone-transition-proof-missing");
  if (commands.missingSurfaces.length) reasons.push("server-command-surfaces-incomplete");
  if (!commands.actorPolicyConfigured) reasons.push(commands.actorPolicyReason);
  return {
    action: ACTION,
    mode: "resume",
    transitionId,
    postgres: {
      revision: Number(postgres.revision || 0),
      fingerprint: text(postgres.fingerprint),
    },
    snapshot: {
      state: text(snapshot.state),
      storageKind: text(snapshot.storageKind),
      version: Number(snapshot.snapshotVersion || 0),
      hasTransitionProof: snapshotHasRetirementProof(snapshot, transitionId),
    },
    authority: {
      mode: text(authority.mode || "compatibility-snapshot"),
      transitionId,
      proofPostgresRevision: Number(authority.proofPostgresRevision || 0),
      proofSnapshotVersion: Number(authority.proofSnapshotVersion || 0),
    },
    commands,
    eligible: reasons.length === 0,
    reasonCodes: reasons,
  };
}

// A completed PostgreSQL-primary transition must never be rolled back merely
// because a stale compatibility writer reappeared.  This plan is deliberately
// narrower than retirement: it proves the already-active PostgreSQL revision,
// backs up the current file and restores only its null tombstone.
export function buildSystemDomainsRetirementRepairPlan({ candidate, env = process.env } = {}) {
  const postgres = candidate?.postgres || {};
  const snapshot = candidate?.snapshot || {};
  const authority = candidate?.authority || {};
  const commands = commandCoverage(env);
  const authorityMode = text(authority.mode || "compatibility-snapshot");
  const snapshotIsWritable = Boolean(snapshot.rawSnapshot?.values)
    && typeof snapshot.rawSnapshot.values === "object"
    && !Array.isArray(snapshot.rawSnapshot.values);
  const reasons = [];
  if (Number(postgres.revision || 0) < 1) reasons.push("postgres-uninitialized");
  if (authorityMode !== "postgres-primary") reasons.push(`authority-${authorityMode}`);
  if (!text(authority.transitionId)) reasons.push("transition-id-missing");
  // The transition proof is historic. Once PostgreSQL is primary, ordinary
  // authorized commands legitimately advance its aggregate revision and
  // fingerprint. A repair therefore proves the *current* aggregate through
  // its own dry-run CAS values, while still rejecting a projection that
  // predates the recorded primary transition.
  if (Number(authority.proofPostgresRevision || 0) < 1) reasons.push("primary-proof-revision-missing");
  if (!text(authority.proofPostgresFingerprint)) reasons.push("primary-proof-fingerprint-missing");
  if (Number(postgres.revision || 0) < Number(authority.proofPostgresRevision || 0)) reasons.push("postgres-revision-precedes-primary-proof");
  if (text(snapshot.storageKind) !== "file") reasons.push("snapshot-storage-not-file");
  if (text(snapshot.state) === "retired") reasons.push("snapshot-already-retired");
  if (!snapshotIsWritable) reasons.push("snapshot-not-writable");
  if (commands.missingSurfaces.length) reasons.push("server-command-surfaces-incomplete");
  if (!commands.actorPolicyConfigured) reasons.push(commands.actorPolicyReason);
  return {
    action: REPAIR_ACTION,
    mode: "repair",
    transitionId: text(authority.transitionId),
    postgres: {
      revision: Number(postgres.revision || 0),
      sha256: sha256(postgres.serialized || ""),
      fingerprint: text(postgres.fingerprint),
      registryCounts: registryCounts(postgres.item),
    },
    snapshot: {
      state: text(snapshot.state),
      storageKind: text(snapshot.storageKind),
      version: Number(snapshot.snapshotVersion || 0),
      sha256: sha256(JSON.stringify(snapshot.rawSnapshot || null)),
      writable: snapshotIsWritable,
    },
    authority: {
      mode: authorityMode,
      transitionId: text(authority.transitionId),
      proofPostgresRevision: Number(authority.proofPostgresRevision || 0),
      proofPostgresFingerprint: text(authority.proofPostgresFingerprint),
    },
    commands,
    eligible: reasons.length === 0,
    reasonCodes: reasons,
  };
}

export function assertRetirementPlanIsSafe(plan) {
  assert(plan?.postgres?.revision > 0, "PostgreSQL System Domains projection is not initialized");
  assert(plan?.snapshot?.state === "active", "Compatibility snapshot is not active and cannot be retired");
  assert(plan?.snapshot?.storageKind === "file", "Compatibility snapshot retirement currently requires the file storage backend");
  assert(plan?.authority?.mode === "compatibility-snapshot", "System Domains authority is already transitioning or PostgreSQL-primary");
  assert(plan?.commands?.complete === true, `System Domains retirement requires all server command surfaces and an explicit valid actor policy: ${(plan?.commands?.missingSurfaces || []).join(", ") || plan?.commands?.actorPolicyReason || "feature flag disabled"}`);
  assert(plan?.eligible === true, `PostgreSQL cannot safely retire the compatibility snapshot: ${(plan?.reasonCodes || []).join(", ") || "proof is missing"}`);
}

export function assertRetirementResumePlanIsSafe(plan, options, env = process.env) {
  assert(options?.apply, "Retirement resume requires --apply");
  assert(options?.confirmPostgresAuthority, "Retirement resume requires --confirm-postgres-authority");
  assert(String(env.MES_ALLOW_SYSTEM_DOMAINS_SNAPSHOT_RETIREMENT || "") === "1", "Retirement resume requires MES_ALLOW_SYSTEM_DOMAINS_SNAPSHOT_RETIREMENT=1");
  assert(text(options?.transitionId) && text(options.transitionId) === text(plan?.transitionId), "Retirement resume requires the exact pending --transition-id");
  assert(plan?.commands?.complete === true, `System Domains retirement requires all server command surfaces and an explicit valid actor policy: ${(plan?.commands?.missingSurfaces || []).join(", ") || plan?.commands?.actorPolicyReason || "feature flag disabled"}`);
  assert(plan?.eligible === true, `System Domains retirement cannot resume safely: ${(plan?.reasonCodes || []).join(", ") || "proof is missing"}`);
}

export function assertRetirementApplyProof(options, plan, env = process.env) {
  assert(options?.apply, "Retirement requires --apply");
  assert(options?.confirmPostgresAuthority, "Retirement requires --confirm-postgres-authority");
  assert(String(env.MES_ALLOW_SYSTEM_DOMAINS_SNAPSHOT_RETIREMENT || "") === "1", "Retirement requires MES_ALLOW_SYSTEM_DOMAINS_SNAPSHOT_RETIREMENT=1");
  assert(Number(options.expectedPostgresRevision) === plan.postgres.revision, "Expected PostgreSQL revision does not match the dry-run proof");
  assert(text(options.expectedPostgresSha256) === plan.postgres.sha256, "Expected PostgreSQL SHA-256 does not match the dry-run proof");
  assert(Number(options.expectedSnapshotVersion) === plan.snapshot.version, "Expected snapshot version does not match the dry-run proof");
  assert(text(options.expectedSnapshotSha256) === plan.snapshot.sha256, "Expected snapshot SHA-256 does not match the dry-run proof");
}

export function assertRetirementRepairPlanIsSafe(plan, options, env = process.env) {
  assertRetirementApplyProof(options, plan, env);
  assert(text(options?.transitionId) && text(options.transitionId) === text(plan?.transitionId), "Tombstone repair requires the exact PostgreSQL-primary --transition-id");
  assert(plan?.commands?.complete === true, `System Domains tombstone repair requires all server command surfaces and an explicit valid actor policy: ${(plan?.commands?.missingSurfaces || []).join(", ") || plan?.commands?.actorPolicyReason || "feature flag disabled"}`);
  assert(plan?.eligible === true, `PostgreSQL-primary compatibility tombstone cannot be repaired safely: ${(plan?.reasonCodes || []).join(", ") || "proof is missing"}`);
}

export function buildRetiredSystemDomainsSnapshot(current, { actor = "system-domains-retirement", transitionId = "", action = ACTION } = {}) {
  assert(current && typeof current === "object" && current.values && typeof current.values === "object", "Compatibility snapshot is invalid during retirement");
  const nextVersion = Number(current.version || 0) + 1;
  const createdAt = new Date().toISOString();
  return {
    ...current,
    updatedBy: { clientId: "system-domains-retirement", actor: text(actor) || "system-domains-retirement" },
    values: {
      ...current.values,
      [SYSTEM_DOMAINS_STORAGE_KEY]: null,
    },
    // Events roll over at 50 entries; this compact top-level proof is kept so
    // a valid pending transition can still resume after unrelated UI writes.
    systemDomainsRetirement: {
      transitionId: text(transitionId),
      action: text(action) || ACTION,
      createdAt,
    },
    events: [{
      version: nextVersion,
      createdAt,
      action: text(action) || ACTION,
      clientId: "system-domains-retirement",
      actor: text(actor) || "system-domains-retirement",
      transitionId: text(transitionId),
    }, ...(current.events || [])].slice(0, 50),
  };
}

function postRetirementIsReady(consistency = {}) {
  return consistency?.ok === true
    && consistency?.details?.authority?.mode === "postgres-primary"
    && consistency?.details?.reconciliation?.promotion?.readEligible === true
    && consistency?.details?.reconciliation?.promotion?.retirementEligible === true;
}

export async function retireSystemDomainsCompatibilitySnapshot({
  options,
  primary,
  paths,
  env = process.env,
  inspectCandidate = inspectSystemDomainsSnapshotPromotionCandidate,
  inspectConsistency = inspectSystemDomainsSnapshotConsistency,
  updateSnapshot = updateSharedStateSnapshot,
  backupSnapshot = backupSharedStateFile,
  appendAudit = appendSharedStateAudit,
} = {}) {
  assert(primary?.get && primary?.getAuthority && primary?.beginPostgresPrimaryTransition
    && primary?.finalizePostgresPrimaryTransition && primary?.abortPostgresPrimaryTransition,
  "Retirement requires a PostgreSQL System Domains repository with authority-transition support");
  assert(paths?.filePath, "Retirement requires a compatibility snapshot file path");
  const observation = await inspectCandidate({ primary, env, filePath: paths.filePath });
  const plan = options?.repair
    ? buildSystemDomainsRetirementRepairPlan({ ...observation, env })
    : options?.resume
      ? buildSystemDomainsRetirementResumePlan({ ...observation, env })
      : buildSystemDomainsRetirementPlan({ ...observation, env });
  if (options?.repair) {
    if (!options?.apply) return { ok: true, mode: "repair-dry-run", plan };
    assertRetirementRepairPlanIsSafe(plan, options, env);
    let backup = null;
    try {
      const repaired = await updateSnapshot({
        env,
        filePath: paths.filePath,
        expectedVersion: plan.snapshot.version,
        allowSystemDomainsCompatibilitySnapshotRetirement: true,
        update: async (current) => {
          assert(sha256(JSON.stringify(current)) === plan.snapshot.sha256, "Compatibility snapshot changed after the repair dry-run proof; run a new dry run");
          return buildRetiredSystemDomainsSnapshot(current, {
            actor: options.actor,
            transitionId: plan.transitionId,
            action: REPAIR_ACTION,
          });
        },
        beforeWrite: async () => {
          backup = await backupSnapshot({
            filePath: paths.filePath,
            backupDir: paths.backupDir,
            reason: "before-system-domains-postgres-primary-tombstone-repair",
            actor: options.actor,
            env,
            allowMissing: false,
          });
        },
      });
      if (!repaired?.ok) throw new Error(repaired?.conflict
        ? "Compatibility snapshot version changed after the repair dry-run proof; run a new dry run"
        : "PostgreSQL-primary compatibility tombstone repair failed");
      const postVerify = await inspectConsistency({ primary, env, filePath: paths.filePath });
      assert(postRetirementIsReady(postVerify), "PostgreSQL-primary System Domains readiness did not pass after compatibility tombstone repair");
      await appendAudit({
        auditLogPath: paths.auditLogPath,
        event: {
          action: REPAIR_ACTION,
          status: "applied",
          transitionId: plan.transitionId,
          postgresRevision: plan.postgres.revision,
          snapshotVersionBefore: plan.snapshot.version,
          snapshotVersionAfter: Number(repaired?.snapshot?.version || 0),
          postgresSha256: plan.postgres.sha256,
          snapshotSha256Before: plan.snapshot.sha256,
          backupPath: backup?.backupPath || "",
          actor: text(options.actor),
        },
      }).catch(() => {});
      return {
        ok: true,
        mode: "repaired",
        plan,
        transitionId: plan.transitionId,
        backupPath: backup?.backupPath || "",
        snapshotVersion: Number(repaired?.snapshot?.version || 0),
        postVerify: safeReconciliation(postVerify),
      };
    } catch (error) {
      await appendAudit({
        auditLogPath: paths.auditLogPath,
        event: {
          action: REPAIR_ACTION,
          status: "failed",
          transitionId: plan.transitionId,
          postgresRevision: plan.postgres.revision,
          snapshotVersionBefore: plan.snapshot.version,
          error: text(error?.message).slice(0, 240),
          actor: text(options.actor),
        },
      }).catch(() => {});
      throw error;
    }
  }
  if (options?.resume) {
    if (!options?.apply) return { ok: true, mode: "resume-dry-run", plan };
    assertRetirementResumePlanIsSafe(plan, options, env);
    try {
      const finalized = await primary.finalizePostgresPrimaryTransition({ transitionId: plan.transitionId, actorId: options.actor });
      assert(finalized?.mode === "postgres-primary", "System Domains authority transition did not finalize during resume");
      const postVerify = await inspectConsistency({ primary, env, filePath: paths.filePath });
      assert(postRetirementIsReady(postVerify), "PostgreSQL-primary System Domains readiness did not pass after retirement resume");
      await appendAudit({
        auditLogPath: paths.auditLogPath,
        event: { action: ACTION, status: "resumed", transitionId: plan.transitionId, postgresRevision: plan.postgres.revision, snapshotVersion: plan.snapshot.version, actor: text(options.actor) },
      }).catch(() => {});
      return { ok: true, mode: "resumed", plan, transitionId: plan.transitionId, postVerify: safeReconciliation(postVerify) };
    } catch (error) {
      await appendAudit({
        auditLogPath: paths.auditLogPath,
        event: { action: ACTION, status: "resume-failed", transitionId: plan.transitionId, postgresRevision: plan.postgres.revision, snapshotVersion: plan.snapshot.version, error: text(error?.message).slice(0, 240), actor: text(options.actor) },
      }).catch(() => {});
      throw error;
    }
  }
  assertRetirementPlanIsSafe(plan);
  if (!options?.apply) return { ok: true, mode: "dry-run", plan };
  assertRetirementApplyProof(options, plan, env);

  const transitionId = text(options.transitionId) || randomUUID();
  let transition = null;
  let backup = null;
  let retired = null;
  try {
    transition = await primary.beginPostgresPrimaryTransition({
      transitionId,
      expectedRevision: plan.postgres.revision,
      expectedFingerprint: plan.postgres.fingerprint,
      proofSnapshotVersion: plan.snapshot.version,
      proofSnapshotFingerprint: plan.snapshot.sha256,
      actorId: options.actor,
    });
    assert(transition?.mode === "transition-pending", "System Domains authority transition did not enter the pending state");
    retired = await updateSnapshot({
      env,
      filePath: paths.filePath,
      expectedVersion: plan.snapshot.version,
      allowSystemDomainsCompatibilitySnapshotRetirement: true,
      update: async (current) => {
        assert(sha256(JSON.stringify(current)) === plan.snapshot.sha256, "Compatibility snapshot changed after the dry-run proof; run a new dry run");
        return buildRetiredSystemDomainsSnapshot(current, { actor: options.actor, transitionId });
      },
      beforeWrite: async () => {
        backup = await backupSnapshot({
          filePath: paths.filePath,
          backupDir: paths.backupDir,
          reason: "before-system-domains-postgres-primary-retirement",
          actor: options.actor,
          env,
          allowMissing: false,
        });
      },
    });
    if (!retired?.ok) throw new Error(retired?.conflict
      ? "Compatibility snapshot version changed after the dry-run proof; run a new dry run"
      : "Compatibility snapshot retirement failed");
    const finalized = await primary.finalizePostgresPrimaryTransition({ transitionId, actorId: options.actor });
    assert(finalized?.mode === "postgres-primary", "System Domains authority transition did not finalize");
    const postVerify = await inspectConsistency({ primary, env, filePath: paths.filePath });
    assert(postRetirementIsReady(postVerify), "PostgreSQL-primary System Domains readiness did not pass after compatibility snapshot retirement");
    await appendAudit({
      auditLogPath: paths.auditLogPath,
      event: {
        action: ACTION,
        status: "applied",
        transitionId,
        postgresRevision: plan.postgres.revision,
        snapshotVersionBefore: plan.snapshot.version,
        snapshotVersionAfter: Number(retired?.snapshot?.version || 0),
        postgresSha256: plan.postgres.sha256,
        snapshotSha256Before: plan.snapshot.sha256,
        backupPath: backup?.backupPath || "",
        actor: text(options.actor),
      },
    }).catch(() => {});
    return {
      ok: true,
      mode: "applied",
      plan,
      transitionId,
      backupPath: backup?.backupPath || "",
      snapshotVersion: Number(retired?.snapshot?.version || 0),
      postVerify: safeReconciliation(postVerify),
    };
  } catch (error) {
    // No snapshot write means the pending marker can safely be removed.  If
    // the tombstone was written, preserve the fail-closed pending state for
    // diagnosis instead of risking a blind reanimation from an old backup.
    if (transition?.mode === "transition-pending" && !retired?.ok) {
      await primary.abortPostgresPrimaryTransition({ transitionId }).catch(() => {});
    }
    await appendAudit({
      auditLogPath: paths.auditLogPath,
      event: {
        action: ACTION,
        status: "failed",
        transitionId,
        postgresRevision: plan.postgres.revision,
        snapshotVersionBefore: plan.snapshot.version,
        postgresSha256: plan.postgres.sha256,
        snapshotSha256Before: plan.snapshot.sha256,
        snapshotRetired: retired?.ok === true,
        error: text(error?.message).slice(0, 240),
        actor: text(options.actor),
      },
    }).catch(() => {});
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = join(fileURLToPath(new URL("..", import.meta.url)));
  const paths = getSharedStateServerPaths({
    projectRoot,
    fallbackFile: join(projectRoot, ".mes-shared-state.json"),
    env: process.env,
  });
  if (options.filePath) paths.filePath = resolve(options.filePath);
  const primary = createSystemDomainsRepository();
  try {
    const result = await retireSystemDomainsCompatibilitySnapshot({ options, primary, paths, env: process.env });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await primary.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
