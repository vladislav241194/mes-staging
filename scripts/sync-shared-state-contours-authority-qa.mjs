import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY,
  NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY,
} from "./shared-state-endpoint.mjs";
import {
  createTargetSnapshot,
  extractEffectiveOwnerFlags,
  inspectContourSyncAuthorityBoundaries,
  inspectContourSyncAuthorityBoundary,
  isAuthorityFlockContention,
  requireExistingContourSyncTarget,
} from "./sync-shared-state-contours.mjs";
import { withSharedStateFileLock, writeSharedStateFileAtomic } from "./shared-state-storage.mjs";

const legacy = { version: 1, values: {}, sharedUi: {}, events: [] };
const [syncSource, rolloutWrapper, ...ownerRolloutSources] = await Promise.all([
  readFile(new URL("./sync-shared-state-contours.mjs", import.meta.url), "utf8"),
  readFile(new URL("../ops/shared-state/with-authority-rollout-lock.sh", import.meta.url), "utf8"),
  ...[
    "../ops/auth/activate-pilot-nomenclature-command-owner.sh",
    "../ops/auth/deactivate-pilot-nomenclature-command-owner.sh",
    "../ops/postgres/activate-specifications2-publication.sh",
    "../ops/postgres/deactivate-specifications2-publication.sh",
    "../ops/postgres/activate-system-domains-command-surfaces.sh",
    "../ops/postgres/deactivate-system-domains-command-surfaces.sh",
    "../ops/postgres/retire-system-domains-snapshot.sh",
    "../ops/postgres/recover-system-domains-primary-command-surfaces.sh",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
]);
assert(syncSource.includes('AUTHORITY_ROLLOUT_LOCK_PARENT = "/run/lock/mes"')
  && syncSource.includes('AUTHORITY_ROLLOUT_LOCK_FILE = `${AUTHORITY_ROLLOUT_LOCK_PARENT}/mes-authority-rollout.lock`')
  && syncSource.includes('execFileAsync("/usr/bin/flock"')
  && syncSource.includes('"--no-fork"')
  && syncSource.includes('"--conflict-exit-code=75"')
  && !syncSource.includes("staleMs: 24 * 60 * 60 * 1_000")
  && rolloutWrapper.includes('lock_parent="/run/lock/mes"')
  && rolloutWrapper.includes('lock_file="${lock_parent}/mes-authority-rollout.lock"')
  && rolloutWrapper.includes("flock -n 9")
  && !rolloutWrapper.includes('mkdir "$lock_dir"'),
"full contour sync and authority rollouts must serialize on the exact same root-controlled kernel flock file");
assert(syncSource.includes("ensureRootAuthorityRolloutLockParent")
  && syncSource.includes("MES_AUTHORITY_LOCK_REQUIRES_ROOT")
  && rolloutWrapper.includes("Authority rollout lock requires uid 0"),
"runtime and deploy identities must not be able to create, remove, or bypass the global authority lock");
assert.equal(isAuthorityFlockContention({ code: 75 }), true,
  "the dedicated flock conflict exit code must be classified as contention");
assert.equal(isAuthorityFlockContention({ code: 1 }), false,
  "a contour-sync child failure must not be mislabeled as lock contention");
for (const source of ownerRolloutSources) {
  assert(source.includes("MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD")
    && source.includes("with-authority-rollout-lock.sh"),
  "every supported owner activation/deactivation must execute under the shared rollout mutex");
}
assert.deepEqual(inspectContourSyncAuthorityBoundary(legacy, {}), { ok: true, blockers: [] },
  "an explicitly flags-off immutable legacy rollback snapshot remains eligible for controlled contour sync");

const activeOwners = inspectContourSyncAuthorityBoundary(legacy, {
  MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "1",
  MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: "1",
  MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS: "1",
  MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS: "1",
  MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS: "1",
  MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS: "1",
});
assert(!activeOwners.ok
  && activeOwners.blockers.includes("nomenclature-command-owner-active")
  && activeOwners.blockers.includes("directory-cluster-command-owner-active")
  && activeOwners.blockers.includes("specifications2-work-order-owner-active")
  && activeOwners.blockers.includes("specifications2-publication-owner-active")
  && activeOwners.blockers.includes("shift-execution-command-owner-active")
  && activeOwners.blockers.includes("system-domains-command-owner-active"),
  "full-snapshot contour sync must fail closed while narrow server owners are active");

for (const [flag, blocker] of [
  ["MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS", "specifications2-work-order-owner-active"],
  ["MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS", "shift-execution-command-owner-active"],
]) {
  const sourceOwned = inspectContourSyncAuthorityBoundaries({
    sourceSnapshot: legacy,
    targetSnapshot: legacy,
    sourceEnv: { [flag]: "1" },
    targetEnv: {},
  });
  assert(!sourceOwned.ok
    && sourceOwned.blockers.includes(`source:${blocker}`)
    && sourceOwned.target.ok,
  `${flag} must independently block a clean Stage source from full-snapshot promotion`);

  const targetOwned = inspectContourSyncAuthorityBoundaries({
    sourceSnapshot: legacy,
    targetSnapshot: legacy,
    sourceEnv: {},
    targetEnv: { [flag]: "1" },
  });
  assert(!targetOwned.ok
    && targetOwned.source.ok
    && targetOwned.blockers.includes(`target:${blocker}`),
  `${flag} must independently protect a clean Pilot target from full-snapshot replacement`);
}

const receipts = inspectContourSyncAuthorityBoundary({
  ...legacy,
  values: {
    [NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, entries: {} }),
    [DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, entries: {} }),
  },
}, {});
assert(!receipts.ok
  && receipts.blockers.includes("nomenclature-command-receipts-present")
  && receipts.blockers.includes("directory-cluster-command-receipts-present"),
"a full-snapshot sync must not erase or replace server-owned receipt ledgers even after flags are disabled");

const publication = inspectContourSyncAuthorityBoundary({
  ...legacy,
  specifications2PublicationAuthority: {
    publications: { entry: { revision: 1, fingerprint: "immutable" } },
  },
}, {});
assert(!publication.ok && publication.blockers.includes("specifications2-publication-authority-present"),
  "a full-snapshot sync must not erase immutable Specifications 2.0 publication authority");

const retirementMarkers = inspectContourSyncAuthorityBoundary({
  ...legacy,
  systemDomainsRetirement: { state: "retired", transitionId: "system-transition" },
  shiftExecutionRetirement: { state: "retired", transitionId: "shift-transition" },
}, {});
assert(!retirementMarkers.ok
  && retirementMarkers.blockers.includes("system-domains-retirement-present")
  && retirementMarkers.blockers.includes("shift-execution-retirement-present"),
"full-snapshot contour sync must not erase or transplant root/DB-bound domain retirement proofs");
const tombstone = inspectContourSyncAuthorityBoundary({
  ...legacy,
  values: { "mes-planning-prototype-system-domains-v1": null },
}, {});
assert(!tombstone.ok && tombstone.blockers.includes("system-domains-retirement-tombstone-present"),
  "full-snapshot contour sync must not erase or transplant a retired System Domains compatibility tombstone");
assert.deepEqual(extractEffectiveOwnerFlags([
  "APP_ENV=pilot",
  "MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=1",
  "MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS=0",
  "MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS=1",
  "MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS=1",
  "MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS=1",
  "MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS=1",
].join("\0")), {
  MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "1",
  MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: "0",
  MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS: "1",
  MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS: "1",
  MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS: "1",
  MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS: "1",
}, "owner preflight must derive flags from the running service environment rather than the root shell");

const versionedTarget = createTargetSnapshot({
  sourceSnapshot: { ...legacy, version: 5 },
  targetBeforeSnapshot: { ...legacy, version: Number.MAX_SAFE_INTEGER - 2 },
  sourceConfig: { label: "stage", sharedStateKey: "stage-key" },
  targetConfig: { label: "pilot", sharedStateKey: "pilot-key" },
  actor: "qa",
  reason: "version-monotonicity",
});
assert.equal(versionedTarget.version, Number.MAX_SAFE_INTEGER - 1,
  "a clean contour sync must advance from the target revision even if its clock/version is ahead of Stage");
assert.throws(() => requireExistingContourSyncTarget(null), (error) => error?.code === "MES_SHARED_STATE_TARGET_MISSING",
  "a root-run contour sync must fail closed when target ownership cannot be inherited");

const cleanPair = inspectContourSyncAuthorityBoundaries({
  sourceSnapshot: legacy,
  targetSnapshot: legacy,
  sourceEnv: {},
  targetEnv: {},
});
assert.deepEqual(cleanPair, {
  ok: true,
  blockers: [],
  source: { ok: true, blockers: [] },
  target: { ok: true, blockers: [] },
}, "an explicit flags-off legacy rollback remains eligible only when both contours are authority-clean");

const stageReceiptsPilotClean = inspectContourSyncAuthorityBoundaries({
  sourceSnapshot: {
    ...legacy,
    values: {
      [NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, entries: {} }),
    },
  },
  targetSnapshot: legacy,
  sourceEnv: {},
  targetEnv: {},
});
assert(!stageReceiptsPilotClean.ok
  && stageReceiptsPilotClean.blockers.includes("source:nomenclature-command-receipts-present")
  && stageReceiptsPilotClean.target.ok,
"a clean flags-off Pilot must not import a Stage snapshot containing server-owned receipts");

const stagePublicationPilotClean = inspectContourSyncAuthorityBoundaries({
  sourceSnapshot: {
    ...legacy,
    specifications2PublicationAuthority: {
      publications: { entry: { revision: 1, fingerprint: "stage-owned" } },
    },
  },
  targetSnapshot: legacy,
  sourceEnv: {},
  targetEnv: {},
});
assert(!stagePublicationPilotClean.ok
  && stagePublicationPilotClean.blockers.includes("source:specifications2-publication-authority-present")
  && stagePublicationPilotClean.target.ok,
"a clean flags-off Pilot must not import Stage Specifications 2.0 publication authority");

const stageOwnerPilotClean = inspectContourSyncAuthorityBoundaries({
  sourceSnapshot: legacy,
  targetSnapshot: legacy,
  sourceEnv: { MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: "1" },
  targetEnv: {},
});
assert(!stageOwnerPilotClean.ok
  && stageOwnerPilotClean.blockers.includes("source:directory-cluster-command-owner-active")
  && stageOwnerPilotClean.target.ok,
"a source-side server owner lock must block promotion even when Pilot is clean and flags-off");

const stageCleanPilotOwned = inspectContourSyncAuthorityBoundaries({
  sourceSnapshot: legacy,
  targetSnapshot: {
    ...legacy,
    values: {
      [DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, entries: {} }),
    },
    specifications2PublicationAuthority: {
      publications: { entry: { revision: 2, fingerprint: "pilot-owned" } },
    },
  },
  sourceEnv: {},
  targetEnv: { MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS: "1" },
});
assert(!stageCleanPilotOwned.ok
  && stageCleanPilotOwned.source.ok
  && stageCleanPilotOwned.blockers.includes("target:directory-cluster-command-receipts-present")
  && stageCleanPilotOwned.blockers.includes("target:specifications2-publication-authority-present")
  && stageCleanPilotOwned.blockers.includes("target:specifications2-publication-owner-active"),
"target-side authority receipts, publication markers and owner locks must remain protected from full replacement");

const permissionsRoot = await mkdtemp(join(tmpdir(), "mes-contour-sync-permissions-"));
try {
  const targetPath = join(permissionsRoot, "pilot-shared-state.json");
  await writeFile(targetPath, `${JSON.stringify(legacy)}\n`, { mode: 0o600 });
  await chmod(targetPath, 0o640);
  const before = await stat(targetPath);
  await writeSharedStateFileAtomic(targetPath, { ...legacy, version: 2 });
  const after = await stat(targetPath);
  assert.equal(after.mode & 0o777, before.mode & 0o777,
    "the root-capable contour promotion writer must preserve the existing Pilot file mode");
  assert.equal(after.uid, before.uid,
    "the contour promotion writer must preserve the target owner when executed by its current owner");
  assert.equal(after.gid, before.gid,
    "the contour promotion writer must preserve the target group when executed by its current owner");
  assert.equal(JSON.parse(await readFile(targetPath, "utf8")).version, 2,
    "the permission-preserving contour promotion writer must persist the requested snapshot");
  const absentRuntimeDir = join(permissionsRoot, "absent-runtime");
  await assert.rejects(
    withSharedStateFileLock(join(absentRuntimeDir, "authority-rollout"), async () => {}, { createParent: false }),
    (error) => error?.code === "MES_SHARED_STATE_LOCK_PARENT_MISSING",
    "the outer rollout mutex must fail closed when its deploy-owned runtime parent is absent",
  );
  assert.equal(await stat(absentRuntimeDir).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error)), null,
    "a root-run missing-parent preflight must not create a stranded root-owned runtime directory");
} finally {
  await rm(permissionsRoot, { recursive: true, force: true });
}

console.log("Contour sync shared-state authority QA: OK");
console.log("- flags-off legacy rollback remains available only for two clean contours: pass");
console.log("- source and target owner locks, durable receipts and publication markers block full replacement: pass");
console.log("- clean flags-off Pilot cannot import Stage-owned authority: pass");
console.log("- atomic promotion preserves target uid/gid/mode ownership contract: pass");
console.log("- retirement proofs, target revision and missing-target ownership fail closed: pass");
