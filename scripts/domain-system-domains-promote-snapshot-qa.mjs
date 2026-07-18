import { SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { reconcileSystemDomains } from "../src/modules/system_domains/reconciliation.js";
import { serializeSystemDomains } from "../src/modules/system_domains/service.js";
import {
  buildSystemDomainsPromotionPlan,
  promoteSystemDomainsCompatibilitySnapshot,
} from "./domain-system-domains-promote-snapshot.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };
const clone = (value) => structuredClone(value);

const snapshotDomains = {
  schemaId: "mes.system-domains",
  schemaVersion: 1,
  metadata: { source: "snapshot" },
  registries: {
    orgUnits: [{ id: "org-a", name: "A" }],
    workCenters: [], positions: [], employees: [], employmentAssignments: [], equipment: [],
    scheduleTemplates: [], scheduleAssignments: [], attendanceEvents: [], accessRoles: [], grants: [], roleAssignments: [], responsibilityPolicies: [],
  },
};

function makePostgresDomains() {
  const domains = clone(snapshotDomains);
  domains.metadata = {
    ...domains.metadata,
    lastMutationKeys: ["attendanceEvents"],
    lastMutationRegistry: "attendanceEvents",
    migratedAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
  };
  domains.registries.attendanceEvents.push({ id: "attendance-pg-only", employeeId: "employee-a", comment: "private-comment-must-not-leak" });
  return domains;
}

function makeSnapshot(domains = snapshotDomains, version = 17) {
  return {
    version,
    updatedAt: "2026-07-18T00:00:00.000Z",
    values: {
      "mes-planning-prototype-state-v2": JSON.stringify({ routes: [{ id: "route-preserved" }] }),
      "mes-planning-prototype-directories-v2": JSON.stringify({ statuses: [] }),
      [SYSTEM_DOMAINS_STORAGE_KEY]: serializeSystemDomains(domains),
    },
    sharedUi: { ganttDependencyRoutes: { "slot-a": [] } },
    events: [],
  };
}

function makeObservation({ postgresDomains, snapshot, revision = 9 }) {
  const snapshotValue = JSON.parse(snapshot.values[SYSTEM_DOMAINS_STORAGE_KEY]);
  const reconciliation = reconcileSystemDomains({
    snapshotDomains: snapshotValue,
    postgresDomains,
    snapshotVersion: snapshot.version,
    postgresRevision: revision,
    stability: "verified",
  });
  return {
    consistency: {
      ok: true,
      matches: reconciliation.matches,
      reason: reconciliation.matches ? "" : "projection_diff",
      details: { reconciliation },
      revision,
      snapshotVersion: snapshot.version,
    },
    candidate: {
      postgres: { item: postgresDomains, revision, serialized: serializeSystemDomains(postgresDomains) },
      snapshot: {
        state: "active",
        storageKind: "file",
        snapshotVersion: snapshot.version,
        rawSnapshot: snapshot,
        domains: snapshotValue,
        serialized: serializeSystemDomains(snapshotValue),
      },
    },
  };
}

function makeUpdateSnapshot(state, { mutateBeforeUpdate = null } = {}) {
  return async ({ expectedVersion, update, beforeWrite }) => {
    const current = mutateBeforeUpdate ? mutateBeforeUpdate(clone(state.snapshot)) : clone(state.snapshot);
    if (Number(expectedVersion) !== Number(current.version)) return { ok: false, conflict: true, snapshot: current };
    const next = await update(current);
    const promoted = {
      ...current,
      ...next,
      version: Number(current.version) + 1,
      updatedAt: "2026-07-18T00:01:00.000Z",
    };
    if (beforeWrite) await beforeWrite({ current, snapshot: promoted });
    state.snapshot = promoted;
    return { ok: true, snapshot: promoted };
  };
}

async function main() {
  const postgresDomains = makePostgresDomains();
  const state = { snapshot: makeSnapshot() };
  const revision = 9;
  const auditEvents = [];
  const backups = [];
  const primary = {
    async get() { return { item: postgresDomains, revision }; },
    async withExclusiveProjectionLock(action) { return action(); },
  };
  const inspectCandidate = async () => makeObservation({ postgresDomains, snapshot: state.snapshot, revision });
  const inspectConsistency = async () => makeObservation({ postgresDomains, snapshot: state.snapshot, revision }).consistency;
  const baseOptions = { apply: false, confirmPostgresAuthority: false, actor: "promotion-qa" };
  const common = {
    primary,
    paths: { filePath: "/tmp/promotion-qa.json", backupDir: "/tmp/promotion-qa-backups", auditLogPath: "/tmp/promotion-qa-audit.log" },
    env: { MES_ALLOW_SYSTEM_DOMAINS_SNAPSHOT_PROMOTION: "1" },
    inspectCandidate,
    inspectConsistency,
    backupSnapshot: async (input) => { backups.push(input); return { backupPath: "/tmp/promotion-before.json" }; },
    appendAudit: async (event) => { auditEvents.push(event); },
  };

  const dryRun = await promoteSystemDomainsCompatibilitySnapshot({
    ...common,
    options: baseOptions,
    updateSnapshot: makeUpdateSnapshot(state),
  });
  assert(dryRun.ok && dryRun.mode === "dry-run" && dryRun.plan.eligible, "A stable additive PostgreSQL projection must produce a safe dry-run plan");
  assert(state.snapshot.version === 17 && backups.length === 0, "Dry-run must not change or back up the compatibility snapshot");
  assert(!JSON.stringify(dryRun).includes("private-comment-must-not-leak"), "Promotion dry-run must not expose domain values");

  const plan = buildSystemDomainsPromotionPlan(await inspectCandidate());
  const applyOptions = {
    apply: true,
    confirmPostgresAuthority: true,
    actor: "promotion-qa",
    expectedPostgresRevision: String(plan.postgres.revision),
    expectedPostgresSha256: plan.postgres.sha256,
    expectedSnapshotVersion: String(plan.snapshot.version),
    expectedSnapshotSha256: plan.snapshot.sha256,
  };
  const applied = await promoteSystemDomainsCompatibilitySnapshot({
    ...common,
    options: applyOptions,
    updateSnapshot: makeUpdateSnapshot(state),
  });
  assert(applied.ok && applied.mode === "applied" && state.snapshot.version === 18, "Explicit promotion must update the compatibility snapshot exactly once");
  assert(state.snapshot.values[SYSTEM_DOMAINS_STORAGE_KEY] === serializeSystemDomains(postgresDomains), "Promotion must copy only the canonical PostgreSQL System Domains projection");
  assert(JSON.parse(state.snapshot.values["mes-planning-prototype-state-v2"]).routes[0].id === "route-preserved", "Promotion must preserve unrelated compatibility data");
  assert(backups.length === 1 && auditEvents.some((entry) => entry.event?.status === "applied"), "Promotion must create a backup and safe audit event before reporting success");

  const staleState = { snapshot: makeSnapshot() };
  const stalePlan = buildSystemDomainsPromotionPlan(makeObservation({ postgresDomains, snapshot: staleState.snapshot, revision }));
  const staleApplyOptions = {
    ...applyOptions,
    expectedSnapshotVersion: String(stalePlan.snapshot.version),
    expectedSnapshotSha256: stalePlan.snapshot.sha256,
  };
  await promoteSystemDomainsCompatibilitySnapshot({
    ...common,
    options: staleApplyOptions,
    inspectCandidate: async () => makeObservation({ postgresDomains, snapshot: staleState.snapshot, revision }),
    inspectConsistency: async () => makeObservation({ postgresDomains, snapshot: staleState.snapshot, revision }).consistency,
    updateSnapshot: makeUpdateSnapshot(staleState, {
      mutateBeforeUpdate: (current) => ({ ...current, sharedUi: { changedExternally: true } }),
    }),
  }).then(() => { throw new Error("A changed snapshot must block promotion"); }).catch((error) => {
    assert(String(error.message).includes("Compatibility snapshot changed"), "Promotion must reject a snapshot changed after the proof");
  });
  assert(staleState.snapshot.version === 17, "A changed snapshot must not be written by promotion");

  const unsafeSnapshot = makeSnapshot();
  const unsafePostgres = clone(snapshotDomains);
  const unsafeObservation = makeObservation({ postgresDomains: unsafePostgres, snapshot: unsafeSnapshot, revision });
  unsafeObservation.candidate.snapshot.domains.registries.attendanceEvents.push({ id: "snapshot-only" });
  unsafeObservation.consistency.details.reconciliation.promotion.snapshotPromotionEligible = false;
  unsafeObservation.consistency.details.reconciliation.promotion.snapshotPromotionReasonCodes = ["snapshot-has-entities-missing-in-postgres"];
  await promoteSystemDomainsCompatibilitySnapshot({
    ...common,
    options: baseOptions,
    inspectCandidate: async () => unsafeObservation,
    updateSnapshot: makeUpdateSnapshot({ snapshot: unsafeSnapshot }),
  }).then(() => { throw new Error("Snapshot-only data must block promotion"); }).catch((error) => {
    assert(String(error.message).includes("snapshot-has-entities-missing-in-postgres"), "Promotion must not discard snapshot-only entities");
  });

  const rootWrapper = await readFile(fileURLToPath(new URL("../ops/postgres/promote-system-domains-snapshot.sh", import.meta.url)), "utf8");
  assert(rootWrapper.includes("EUID") && rootWrapper.includes("Run as root"), "Promotion wrapper must remain root-only");
  assert(rootWrapper.includes("MES_ALLOW_SYSTEM_DOMAINS_SNAPSHOT_PROMOTION=1"), "Promotion wrapper must provide the explicit second gate");
  assert(rootWrapper.includes("domain:system-domains:promote-snapshot"), "Promotion wrapper must execute only the reviewed promotion command");
  assert(rootWrapper.includes("MES_SHARED_STATE_DIR") && rootWrapper.includes("/srv/mes/pilot/shared-state"), "Promotion wrapper must target the active pilot shared-state directory when the domain env only supplies PostgreSQL access");
  assert(rootWrapper.includes("MES_BACKUP_DIR") && rootWrapper.includes("/srv/mes/pilot/backups"), "Promotion wrapper must preserve backups alongside the active pilot state");

  console.log("System Domains PostgreSQL-to-snapshot promotion QA: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
