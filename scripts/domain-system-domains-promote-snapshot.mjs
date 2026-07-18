import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import { SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { serializeSystemDomains } from "../src/modules/system_domains/service.js";
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

const ACTION = "system-domains-promote-postgres-to-compatibility-snapshot";

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

function parseArgs(argv = []) {
  const options = {
    apply: false,
    confirmPostgresAuthority: false,
    filePath: "",
    actor: process.env.USER || "system-domains-promotion",
    expectedPostgresRevision: "",
    expectedPostgresSha256: "",
    expectedSnapshotVersion: "",
    expectedSnapshotSha256: "",
  };
  const valueOptions = new Map([
    ["--file", "filePath"],
    ["--actor", "actor"],
    ["--expected-postgres-revision", "expectedPostgresRevision"],
    ["--expected-postgres-sha256", "expectedPostgresSha256"],
    ["--expected-snapshot-version", "expectedSnapshotVersion"],
    ["--expected-snapshot-sha256", "expectedSnapshotSha256"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index] || "");
    if (argument === "--apply") {
      options.apply = true;
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
  return options;
}

function safeConsistencyDetails(consistency = {}) {
  return consistency?.details?.reconciliation || null;
}

export function buildSystemDomainsPromotionPlan({ consistency, candidate } = {}) {
  const postgres = candidate?.postgres || {};
  const snapshot = candidate?.snapshot || {};
  const postgresSerialized = text(postgres.serialized);
  const rawSnapshot = snapshot.rawSnapshot || null;
  const reconciliation = safeConsistencyDetails(consistency);
  return {
    action: ACTION,
    postgres: {
      revision: Number(postgres.revision || 0),
      sha256: sha256(postgresSerialized),
      registryCounts: registryCounts(postgres.item),
    },
    snapshot: {
      state: text(snapshot.state),
      storageKind: text(snapshot.storageKind),
      version: Number(snapshot.snapshotVersion || 0),
      sha256: sha256(JSON.stringify(rawSnapshot)),
      registryCounts: registryCounts(snapshot.domains),
    },
    reconciliation,
    eligible: Boolean(reconciliation?.promotion?.snapshotPromotionEligible),
    reasonCodes: reconciliation?.promotion?.snapshotPromotionReasonCodes || [],
  };
}

export function assertPromotionPlanIsSafe(plan) {
  assert(plan?.postgres?.revision > 0, "PostgreSQL System Domains projection is not initialized");
  assert(plan?.snapshot?.state === "active", "Compatibility snapshot is not active and cannot be promoted");
  assert(plan?.snapshot?.storageKind === "file", "Compatibility snapshot promotion currently requires the file storage backend");
  assert(plan?.eligible === true, `PostgreSQL cannot safely promote the compatibility snapshot: ${(plan?.reasonCodes || []).join(", ") || "proof is missing"}`);
}

export function assertPromotionApplyProof(options, plan, env = process.env) {
  assert(options?.apply, "Promotion requires --apply");
  assert(options?.confirmPostgresAuthority, "Promotion requires --confirm-postgres-authority");
  assert(String(env.MES_ALLOW_SYSTEM_DOMAINS_SNAPSHOT_PROMOTION || "") === "1", "Promotion requires MES_ALLOW_SYSTEM_DOMAINS_SNAPSHOT_PROMOTION=1");
  assert(Number(options.expectedPostgresRevision) === plan.postgres.revision, "Expected PostgreSQL revision does not match the dry-run proof");
  assert(text(options.expectedPostgresSha256) === plan.postgres.sha256, "Expected PostgreSQL SHA-256 does not match the dry-run proof");
  assert(Number(options.expectedSnapshotVersion) === plan.snapshot.version, "Expected snapshot version does not match the dry-run proof");
  assert(text(options.expectedSnapshotSha256) === plan.snapshot.sha256, "Expected snapshot SHA-256 does not match the dry-run proof");
}

export function buildPromotedSnapshot(current, { postgresSerialized, actor = "system-domains-promotion" } = {}) {
  assert(current && typeof current === "object" && current.values && typeof current.values === "object", "Compatibility snapshot is invalid during promotion");
  const nextVersion = Number(current.version || 0) + 1;
  const createdAt = new Date().toISOString();
  return {
    ...current,
    updatedBy: { clientId: "system-domains-promotion", actor: text(actor) || "system-domains-promotion" },
    values: {
      ...current.values,
      [SYSTEM_DOMAINS_STORAGE_KEY]: postgresSerialized,
    },
    events: [{
      version: nextVersion,
      createdAt,
      action: ACTION,
      clientId: "system-domains-promotion",
      actor: text(actor) || "system-domains-promotion",
    }, ...(current.events || [])].slice(0, 50),
  };
}

export async function promoteSystemDomainsCompatibilitySnapshot({
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
  assert(primary?.get && primary?.withExclusiveProjectionLock, "Promotion requires a lock-capable PostgreSQL System Domains repository");
  assert(paths?.filePath, "Promotion requires a compatibility snapshot file path");
  const observation = await inspectCandidate({ primary, env, filePath: paths.filePath });
  const plan = buildSystemDomainsPromotionPlan(observation);
  assertPromotionPlanIsSafe(plan);
  if (!options?.apply) return { ok: true, mode: "dry-run", plan };

  assertPromotionApplyProof(options, plan, env);
  let backup = null;
  let updated = null;
  try {
    await primary.withExclusiveProjectionLock(async () => {
      const lockedProjection = await primary.get();
      const lockedSerialized = lockedProjection?.item ? serializeSystemDomains(lockedProjection.item) : "";
      assert(Number(lockedProjection?.revision || 0) === plan.postgres.revision, "PostgreSQL revision changed after the dry-run proof; run a new dry run");
      assert(sha256(lockedSerialized) === plan.postgres.sha256, "PostgreSQL System Domains changed after the dry-run proof; run a new dry run");
      updated = await updateSnapshot({
        env,
        filePath: paths.filePath,
        expectedVersion: plan.snapshot.version,
        update: async (current) => {
          assert(sha256(JSON.stringify(current)) === plan.snapshot.sha256, "Compatibility snapshot changed after the dry-run proof; run a new dry run");
          return buildPromotedSnapshot(current, { postgresSerialized: lockedSerialized, actor: options.actor });
        },
        beforeWrite: async () => {
          backup = await backupSnapshot({
            filePath: paths.filePath,
            backupDir: paths.backupDir,
            reason: "before-system-domains-postgres-promotion",
            actor: options.actor,
            env,
            allowMissing: false,
          });
        },
      });
      if (!updated?.ok) throw new Error(updated?.conflict
        ? "Compatibility snapshot version changed after the dry-run proof; run a new dry run"
        : "Compatibility snapshot update failed");
    });

    const postVerify = await inspectConsistency({ primary, env, filePath: paths.filePath });
    if (!postVerify?.matches) throw new Error(`Compatibility snapshot promotion did not reach exact parity: ${text(postVerify?.reason) || "post-verify-failed"}`);
    await appendAudit({
      auditLogPath: paths.auditLogPath,
      event: {
        action: ACTION,
        status: "applied",
        postgresRevision: plan.postgres.revision,
        snapshotVersionBefore: plan.snapshot.version,
        snapshotVersionAfter: Number(updated?.snapshot?.version || 0),
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
      backupPath: backup?.backupPath || "",
      snapshotVersion: Number(updated?.snapshot?.version || 0),
      postVerify: safeConsistencyDetails(postVerify),
    };
  } catch (error) {
    await appendAudit({
      auditLogPath: paths.auditLogPath,
      event: {
        action: ACTION,
        status: "failed",
        postgresRevision: plan.postgres.revision,
        snapshotVersionBefore: plan.snapshot.version,
        postgresSha256: plan.postgres.sha256,
        snapshotSha256Before: plan.snapshot.sha256,
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
    const result = await promoteSystemDomainsCompatibilitySnapshot({ options, primary, paths, env: process.env });
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
