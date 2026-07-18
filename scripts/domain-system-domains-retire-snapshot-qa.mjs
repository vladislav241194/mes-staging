import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { serializeSystemDomains } from "../src/modules/system_domains/service.js";
import {
  buildRetiredSystemDomainsSnapshot,
  buildSystemDomainsRetirementPlan,
  buildSystemDomainsRetirementRepairPlan,
  retireSystemDomainsCompatibilitySnapshot,
} from "./domain-system-domains-retire-snapshot.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };
const directory = await mkdtemp(join(tmpdir(), "mes-system-domains-retire-"));
const filePath = join(directory, "shared-state.json");
const domains = {
  schemaId: "mes.system-domains",
  schemaVersion: 1,
  metadata: { source: "retirement-qa" },
  registries: {
    orgUnits: [{ id: "D1", code: "D1", name: "Склад", kind: "department", parentOrgUnitId: "", isActive: true, validFrom: "", validTo: "", sourceRef: {} }],
    workCenters: [], positions: [], employees: [], employmentAssignments: [], equipment: [], scheduleTemplates: [], scheduleAssignments: [], attendanceEvents: [], accessRoles: [], grants: [], roleAssignments: [], responsibilityPolicies: [],
  },
};

function sha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function makeSnapshot(version = 17) {
  return {
    version,
    values: {
      "mes-planning-prototype-state-v2": JSON.stringify({ routes: [{ id: "route-preserved" }] }),
      [SYSTEM_DOMAINS_STORAGE_KEY]: serializeSystemDomains(domains),
    },
    events: [],
  };
}

function makeConsistency({ authority = { mode: "compatibility-snapshot" }, snapshotState = "active" } = {}) {
  return {
    ok: true,
    matches: snapshotState === "active",
    details: {
      authority,
      reconciliation: {
        promotion: {
          readEligible: authority.mode === "postgres-primary" || snapshotState === "active",
          retirementEligible: authority.mode === "postgres-primary" && snapshotState === "retired",
        },
      },
    },
  };
}

try {
  let snapshot = makeSnapshot();
  let authority = { mode: "compatibility-snapshot" };
  const fingerprints = {
    postgres: `sha256:${sha256(serializeSystemDomains(domains))}`,
  };
  const candidate = () => ({
    postgres: { item: domains, revision: 4, fingerprint: fingerprints.postgres, serialized: serializeSystemDomains(domains) },
    snapshot: {
      state: snapshot.values[SYSTEM_DOMAINS_STORAGE_KEY] === null ? "retired" : "active",
      storageKind: "file",
      snapshotVersion: snapshot.version,
      rawSnapshot: structuredClone(snapshot),
      domains: snapshot.values[SYSTEM_DOMAINS_STORAGE_KEY] === null ? null : domains,
    },
    authority,
  });
  const completeCommandEnv = {
    MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS: "1",
    MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES: "production-structure,timesheet,access-control",
    MES_SYSTEM_DOMAINS_COMMAND_ACTORS: "public:retirement-qa",
  };
  const plan = buildSystemDomainsRetirementPlan({ consistency: makeConsistency(), candidate: candidate(), env: completeCommandEnv });
  assert(plan.eligible && plan.postgres.fingerprint === fingerprints.postgres, "a stable active snapshot must produce a PostgreSQL-primary retirement plan");
  const incompleteCommands = buildSystemDomainsRetirementPlan({
    consistency: makeConsistency(),
    candidate: candidate(),
    env: { MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS: "1", MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES: "production-structure" },
  });
  assert(!incompleteCommands.eligible && incompleteCommands.reasonCodes.includes("server-command-surfaces-incomplete"), "retirement must refuse a partial server-command rollout");
  const retiredPreview = buildRetiredSystemDomainsSnapshot(snapshot, { transitionId: "preview" });
  assert(retiredPreview.values[SYSTEM_DOMAINS_STORAGE_KEY] === null && JSON.parse(retiredPreview.values["mes-planning-prototype-state-v2"]).routes[0].id === "route-preserved", "retirement must tombstone only System Domains and preserve other shared state");

  const transitions = [];
  const primary = {
    async get() { return { item: domains, revision: 4, fingerprint: fingerprints.postgres }; },
    async getAuthority() { return authority; },
    async beginPostgresPrimaryTransition(input) {
      assert(input.expectedRevision === 4 && input.expectedFingerprint === fingerprints.postgres, "transition must bind the exact PostgreSQL proof");
      authority = { mode: "transition-pending", transitionId: input.transitionId, proofPostgresRevision: 4, proofPostgresFingerprint: fingerprints.postgres };
      transitions.push({ type: "begin", ...input });
      return { ...authority };
    },
    async finalizePostgresPrimaryTransition({ transitionId }) {
      assert(authority.mode === "transition-pending" && authority.transitionId === transitionId, "only the pending proof may finalize primary authority");
      authority = { ...authority, mode: "postgres-primary", activatedAt: "2026-07-18T00:00:00.000Z" };
      transitions.push({ type: "finalize", transitionId });
      return { ...authority };
    },
    async abortPostgresPrimaryTransition({ transitionId }) {
      assert(authority.mode === "transition-pending" && authority.transitionId === transitionId, "only the matching pending proof may abort");
      authority = { mode: "compatibility-snapshot" };
      transitions.push({ type: "abort", transitionId });
      return { ...authority, aborted: true };
    },
  };
  const backupEvents = [];
  const audits = [];
  const common = {
    primary,
    paths: { filePath, backupDir: directory, auditLogPath: join(directory, "audit.log") },
    env: { ...completeCommandEnv, MES_ALLOW_SYSTEM_DOMAINS_SNAPSHOT_RETIREMENT: "1" },
    inspectCandidate: async () => ({ consistency: makeConsistency({ authority, snapshotState: "active" }), candidate: candidate() }),
    inspectConsistency: async () => makeConsistency({ authority, snapshotState: "retired" }),
    backupSnapshot: async () => { backupEvents.push("backup"); return { backupPath: join(directory, "backup.json") }; },
    appendAudit: async (event) => { audits.push(event); },
    updateSnapshot: async ({ expectedVersion, update, beforeWrite, allowSystemDomainsCompatibilitySnapshotRetirement }) => {
      assert(expectedVersion === snapshot.version, "retirement must use an optimistic shared-state version proof");
      assert(allowSystemDomainsCompatibilitySnapshotRetirement === true, "retirement must use the explicit root-only System Domains tombstone capability");
      await beforeWrite();
      snapshot = await update(snapshot);
      snapshot.version += 1;
      return { ok: true, snapshot };
    },
  };
  const dry = await retireSystemDomainsCompatibilitySnapshot({ ...common, options: { actor: "retirement-qa" } });
  assert(dry.ok && dry.mode === "dry-run" && snapshot.values[SYSTEM_DOMAINS_STORAGE_KEY] !== null && transitions.length === 0, "dry run must not start a transition or modify the snapshot");
  const applied = await retireSystemDomainsCompatibilitySnapshot({
    ...common,
    options: {
      apply: true,
      confirmPostgresAuthority: true,
      actor: "retirement-qa",
      expectedPostgresRevision: String(plan.postgres.revision),
      expectedPostgresSha256: plan.postgres.sha256,
      expectedSnapshotVersion: String(plan.snapshot.version),
      expectedSnapshotSha256: plan.snapshot.sha256,
      transitionId: "retirement-qa-proof",
    },
  });
  assert(applied.ok && applied.mode === "applied" && authority.mode === "postgres-primary", "retirement must finalize durable PostgreSQL authority after the tombstone write");
  assert(snapshot.values[SYSTEM_DOMAINS_STORAGE_KEY] === null && snapshot.version === 18, "retirement must write exactly one null tombstone");
  assert(transitions.map((entry) => entry.type).join(",") === "begin,finalize", "retirement must use the pending-to-active state machine");
  assert(backupEvents.length === 1 && audits.some((entry) => entry.event?.status === "applied"), "retirement must back up and audit before reporting success");

  let rollbackAuthority = { mode: "compatibility-snapshot" };
  const rollbackPrimary = {
    ...primary,
    async getAuthority() { return rollbackAuthority; },
    async beginPostgresPrimaryTransition(input) { rollbackAuthority = { mode: "transition-pending", transitionId: input.transitionId }; return { ...rollbackAuthority }; },
    async abortPostgresPrimaryTransition({ transitionId }) { assert(rollbackAuthority.transitionId === transitionId, "failed pre-write transition must retain its ID for rollback"); rollbackAuthority = { mode: "compatibility-snapshot" }; return { ...rollbackAuthority, aborted: true }; },
  };
  const rollbackSnapshot = makeSnapshot(23);
  await retireSystemDomainsCompatibilitySnapshot({
    ...common,
    primary: rollbackPrimary,
    inspectCandidate: async () => ({ consistency: makeConsistency(), candidate: {
      ...candidate(),
      snapshot: { state: "active", storageKind: "file", snapshotVersion: rollbackSnapshot.version, rawSnapshot: rollbackSnapshot, domains },
      authority: rollbackAuthority,
    } }),
    updateSnapshot: async () => ({ ok: false, conflict: true }),
    options: {
      apply: true, confirmPostgresAuthority: true, actor: "retirement-qa",
      expectedPostgresRevision: "4", expectedPostgresSha256: sha256(serializeSystemDomains(domains)),
      expectedSnapshotVersion: "23", expectedSnapshotSha256: sha256(JSON.stringify(rollbackSnapshot)), transitionId: "retirement-qa-rollback",
    },
  }).then(() => { throw new Error("a snapshot conflict must stop retirement"); }).catch((error) => {
    assert(String(error.message).includes("version changed"), "a shared-state CAS conflict must be reported precisely");
  });
  assert(rollbackAuthority.mode === "compatibility-snapshot", "a failed pre-write retirement must remove its pending authority marker");

  // A filesystem write and the DB finalization cannot be atomic. Prove that a
  // failure in that narrow gap leaves a resumable, evidence-bound state rather
  // than requiring direct database/file surgery.
  let strandedSnapshot = makeSnapshot(31);
  let strandedAuthority = { mode: "compatibility-snapshot" };
  let failFinalizeOnce = true;
  const strandedCandidate = () => ({
    postgres: { item: domains, revision: 4, fingerprint: fingerprints.postgres, serialized: serializeSystemDomains(domains) },
    snapshot: {
      state: strandedSnapshot.values[SYSTEM_DOMAINS_STORAGE_KEY] === null ? "retired" : "active",
      storageKind: "file",
      snapshotVersion: strandedSnapshot.version,
      rawSnapshot: structuredClone(strandedSnapshot),
      domains: strandedSnapshot.values[SYSTEM_DOMAINS_STORAGE_KEY] === null ? null : domains,
    },
    authority: strandedAuthority,
  });
  const strandedPrimary = {
    ...primary,
    async getAuthority() { return strandedAuthority; },
    async beginPostgresPrimaryTransition(input) {
      strandedAuthority = {
        mode: "transition-pending", transitionId: input.transitionId,
        proofPostgresRevision: 4, proofPostgresFingerprint: fingerprints.postgres,
        proofSnapshotVersion: input.proofSnapshotVersion, proofSnapshotFingerprint: input.proofSnapshotFingerprint,
      };
      return { ...strandedAuthority };
    },
    async finalizePostgresPrimaryTransition({ transitionId }) {
      assert(strandedAuthority.mode === "transition-pending" && strandedAuthority.transitionId === transitionId, "resume must finalize the same pending transition");
      if (failFinalizeOnce) { failFinalizeOnce = false; throw new Error("simulated finalize interruption"); }
      strandedAuthority = { ...strandedAuthority, mode: "postgres-primary", activatedAt: "2026-07-18T00:00:00.000Z" };
      return { ...strandedAuthority };
    },
    async abortPostgresPrimaryTransition({ transitionId }) {
      assert(strandedAuthority.transitionId === transitionId, "only a pre-write failure may abort a stranded transition");
      strandedAuthority = { mode: "compatibility-snapshot" };
      return { ...strandedAuthority, aborted: true };
    },
  };
  const strandedCommon = {
    ...common,
    primary: strandedPrimary,
    inspectCandidate: async () => ({
      consistency: makeConsistency({ authority: strandedAuthority, snapshotState: strandedCandidate().snapshot.state }),
      candidate: strandedCandidate(),
    }),
    inspectConsistency: async () => makeConsistency({ authority: strandedAuthority, snapshotState: strandedCandidate().snapshot.state }),
    updateSnapshot: async ({ expectedVersion, update, beforeWrite, allowSystemDomainsCompatibilitySnapshotRetirement }) => {
      assert(expectedVersion === strandedSnapshot.version, "stranded retirement must retain its initial CAS proof");
      assert(allowSystemDomainsCompatibilitySnapshotRetirement === true, "resumed retirement must use the explicit root-only System Domains tombstone capability");
      await beforeWrite();
      strandedSnapshot = await update(strandedSnapshot);
      strandedSnapshot.version += 1;
      return { ok: true, snapshot: strandedSnapshot };
    },
  };
  const strandedInitialPlan = buildSystemDomainsRetirementPlan({
    consistency: makeConsistency(), candidate: strandedCandidate(), env: completeCommandEnv,
  });
  await retireSystemDomainsCompatibilitySnapshot({
    ...strandedCommon,
    options: {
      apply: true, confirmPostgresAuthority: true, actor: "retirement-qa",
      expectedPostgresRevision: "4", expectedPostgresSha256: strandedInitialPlan.postgres.sha256,
      expectedSnapshotVersion: "31", expectedSnapshotSha256: strandedInitialPlan.snapshot.sha256,
      transitionId: "retirement-qa-resume",
    },
  }).then(() => { throw new Error("an interrupted finalization must not be reported as complete"); }).catch((error) => {
    assert(String(error.message).includes("simulated finalize interruption"), "the finalization interruption must be preserved");
  });
  assert(strandedAuthority.mode === "transition-pending" && strandedSnapshot.values[SYSTEM_DOMAINS_STORAGE_KEY] === null, "a post-tombstone failure must retain the fail-closed resumable state");
  // A normal shared-state event window retains only 50 entries. The compact
  // root-written transition proof must keep resume viable after that window
  // has rolled over and no longer contains the original retirement event.
  strandedSnapshot.events = Array.from({ length: 51 }, (_, index) => ({
    action: "ordinary-shared-ui-save", transitionId: `ordinary-${index}`,
  })).slice(0, 50);
  assert(!strandedSnapshot.events.some((event) => event.action === "system-domains-retire-compatibility-snapshot"), "resume rollover fixture must no longer retain the original retirement event");
  assert(strandedSnapshot.systemDomainsRetirement?.transitionId === "retirement-qa-resume", "root tombstone must persist a compact transition proof outside the event window");
  const resumed = await retireSystemDomainsCompatibilitySnapshot({
    ...strandedCommon,
    options: {
      apply: true, resume: true, confirmPostgresAuthority: true, actor: "retirement-qa",
      transitionId: "retirement-qa-resume",
    },
  });
  assert(resumed.ok && resumed.mode === "resumed" && strandedAuthority.mode === "postgres-primary", "the exact pending transition must resume without re-writing the snapshot");

  // Valid PostgreSQL-primary commands advance the aggregate revision after
  // cutover. If a stale/out-of-band compatibility payload later reappears,
  // repair must bind its dry-run proof to that current revision instead of
  // becoming permanently ineligible because the historical transition proof
  // still points to revision 4.
  const updatedDomains = {
    ...domains,
    metadata: { ...domains.metadata, source: "retirement-qa-post-primary-command" },
  };
  const updatedSerialized = serializeSystemDomains(updatedDomains);
  const updatedFingerprint = `sha256:${sha256(updatedSerialized)}`;
  snapshot = {
    ...snapshot,
    version: 19,
    values: { ...snapshot.values, [SYSTEM_DOMAINS_STORAGE_KEY]: updatedSerialized },
  };
  const repairCandidate = () => ({
    postgres: { item: updatedDomains, revision: 5, fingerprint: updatedFingerprint, serialized: updatedSerialized },
    snapshot: {
      state: "active",
      storageKind: "file",
      snapshotVersion: snapshot.version,
      rawSnapshot: structuredClone(snapshot),
      domains: updatedDomains,
    },
    authority,
  });
  const repairPlan = buildSystemDomainsRetirementRepairPlan({ candidate: repairCandidate(), env: completeCommandEnv });
  assert(repairPlan.eligible && repairPlan.postgres.revision === 5 && repairPlan.authority.proofPostgresRevision === 4, "a reappeared compatibility payload must be repairable after a valid primary revision advance");
  const repairPrimary = {
    ...primary,
    async get() { return { item: updatedDomains, revision: 5, fingerprint: updatedFingerprint }; },
    async getAuthority() { return authority; },
  };
  const repaired = await retireSystemDomainsCompatibilitySnapshot({
    ...common,
    primary: repairPrimary,
    inspectCandidate: async () => ({ consistency: makeConsistency({ authority, snapshotState: "active" }), candidate: repairCandidate() }),
    inspectConsistency: async () => makeConsistency({ authority, snapshotState: "retired" }),
    options: {
      apply: true, repair: true, confirmPostgresAuthority: true, actor: "retirement-qa",
      expectedPostgresRevision: String(repairPlan.postgres.revision),
      expectedPostgresSha256: repairPlan.postgres.sha256,
      expectedSnapshotVersion: String(repairPlan.snapshot.version),
      expectedSnapshotSha256: repairPlan.snapshot.sha256,
      transitionId: repairPlan.transitionId,
    },
  });
  assert(repaired.ok && repaired.mode === "repaired" && authority.mode === "postgres-primary", "tombstone repair must retain PostgreSQL primary authority");
  assert(snapshot.values[SYSTEM_DOMAINS_STORAGE_KEY] === null && snapshot.version === 20, "tombstone repair must retire only the reappeared compatibility value");
  assert(snapshot.events?.[0]?.action?.includes("repair-postgres-primary-tombstone"), "tombstone repair must leave a distinct audited snapshot event");

  await writeFile(filePath, JSON.stringify(snapshot), "utf8");
  assert((await readFile(filePath, "utf8")).includes("route-preserved"), "retirement QA fixture must preserve unrelated shared state on disk");
  console.log("System Domains PostgreSQL-primary retirement QA: OK");
} finally {
  await rm(directory, { recursive: true, force: true });
}
