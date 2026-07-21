import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DISPOSABLE_STRUCTURE_CLEANUP_ACTOR,
  executeDisposableStructureCleanup,
} from "./system-domains-disposable-structure-cleanup.mjs";

const TOKEN = "MOCK-QA-PSM-20260722-A1";
const REGISTRIES = [
  "orgUnits", "workCenters", "positions", "employees", "employmentAssignments", "equipment",
  "scheduleTemplates", "scheduleAssignments", "attendanceEvents", "accessRoles", "grants",
  "roleAssignments", "responsibilityPolicies",
];

function fixture() {
  const registries = Object.fromEntries(REGISTRIES.map((name) => [name, []]));
  registries.orgUnits = [
    { id: "OU-BASE", code: "BASE", name: "Baseline", isActive: true },
    { id: "OU-NEAR", code: `${TOKEN}-OTHER`, name: "Near but not exact token", isActive: true },
    { id: "OU-QA", code: TOKEN, name: `Подразделение ${TOKEN}`, isActive: true },
  ];
  registries.workCenters = [
    { id: "WC-BASE", code: "BASE", name: "Baseline", orgUnitId: "OU-BASE", isActive: true },
    { id: "WC-QA", code: TOKEN, name: `Рабочий центр ${TOKEN}`, orgUnitId: "OU-QA", isActive: true },
  ];
  registries.positions = [
    { id: "POS-BASE", code: "BASE", name: "Baseline", orgUnitId: "OU-BASE", workCenterId: "WC-BASE", isActive: true },
    { id: "POS-QA", code: TOKEN, name: `Должность ${TOKEN}`, orgUnitId: "OU-QA", workCenterId: "WC-QA", isActive: true },
  ];
  registries.employees = [
    { id: "EMP-BASE", personnelNumber: "BASE", displayName: "Baseline", isActive: true },
    { id: "EMP-QA", personnelNumber: TOKEN, displayName: `Сотрудник ${TOKEN}`, isActive: true },
  ];
  registries.employmentAssignments = [
    { id: "EA-BASE", employeeId: "EMP-BASE", positionId: "POS-BASE", orgUnitId: "OU-BASE", workCenterId: "WC-BASE", isPrimary: true },
    { id: "EA-QA", employeeId: "EMP-QA", positionId: "POS-QA", orgUnitId: "OU-QA", workCenterId: "WC-QA", isPrimary: true },
  ];
  registries.equipment = [
    { id: "EQ-BASE", code: "BASE", name: "Baseline", orgUnitId: "OU-BASE", workCenterId: "WC-BASE", quantity: 1, isActive: true },
    { id: "EQ-QA", code: TOKEN, name: `Оборудование ${TOKEN}`, orgUnitId: "OU-QA", workCenterId: "WC-QA", quantity: 1, isActive: true },
  ];
  registries.responsibilityPolicies = [
    { id: "POLICY-QA", subjectEmployeeId: "EMP-QA", mode: "manual", targetEmployeeIds: [], isActive: true },
  ];
  return { schemaId: "mes.system-domains", schemaVersion: 1, metadata: {}, registries };
}

function fingerprint(revision) {
  return `sha256:fixture-${revision}`;
}

function createRepository({
  item = fixture(),
  revision = 41,
  authority = "postgres-primary",
  authorityChangesBeforeCommit = false,
  mutateBeforeFreshRead = false,
  conflict = false,
} = {}) {
  let projection = structuredClone(item);
  let currentRevision = revision;
  let reads = 0;
  let authorityReads = 0;
  const replaceCalls = [];
  let closed = false;
  const repository = {
    async getAuthority() {
      authorityReads += 1;
      return { mode: authorityChangesBeforeCommit && authorityReads > 1 ? "compatibility-snapshot" : authority };
    },
    async get() {
      reads += 1;
      if (mutateBeforeFreshRead && reads === 2) currentRevision += 1;
      return { item: structuredClone(projection), revision: currentRevision, fingerprint: fingerprint(currentRevision) };
    },
    async replace(candidate, options) {
      replaceCalls.push({ candidate: structuredClone(candidate), options: structuredClone(options) });
      if (conflict) return { imported: false, conflict: true, revision: currentRevision + 1 };
      projection = structuredClone(candidate);
      currentRevision += 1;
      return { imported: true, replayed: false, conflict: false, revision: currentRevision, fingerprint: fingerprint(currentRevision) };
    },
    async close() { closed = true; },
  };
  return {
    factory: () => repository,
    state: () => ({ projection: structuredClone(projection), currentRevision, replaceCalls: structuredClone(replaceCalls), closed }),
  };
}

function dependencyRunner(dependencies = []) {
  return async (_options, action) => action({
    inspect: async () => structuredClone(dependencies),
    lockedTables: ["work_orders", "shift_assignments"],
  });
}

const ENV = { APP_ENV: "pilot", MES_DOMAIN_STORAGE: "postgres", DATABASE_URL: "postgresql://fixture" };

async function expectCode(code, action) {
  await assert.rejects(action, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

const successRepository = createRepository();
const receipt = await executeDisposableStructureCleanup({
  token: TOKEN,
  confirmToken: TOKEN,
  env: ENV,
  uid: 0,
  repositoryFactory: successRepository.factory,
  dependencySnapshotRunner: dependencyRunner(),
});
const success = successRepository.state();
assert.equal(receipt.ok, true);
assert.deepEqual(receipt.revision, { before: 41, after: 42 });
assert.equal(receipt.actorId, DISPOSABLE_STRUCTURE_CLEANUP_ACTOR);
assert.match(receipt.idempotencyKey, /^root-psm-cleanup:[a-f0-9]{32}$/);
assert.deepEqual(Object.values(receipt.removed).map((entry) => entry.count), Array(7).fill(1));
assert.equal(success.replaceCalls.length, 1);
assert.deepEqual(success.replaceCalls[0].options, {
  source: "root:disposable-production-structure-cleanup",
  expectedRevision: 41,
  actorId: DISPOSABLE_STRUCTURE_CLEANUP_ACTOR,
  commandType: "cleanup_disposable_production_structure",
  idempotencyKey: receipt.idempotencyKey,
});
for (const [registry, id] of Object.entries({
  orgUnits: "OU-QA", workCenters: "WC-QA", positions: "POS-QA", equipment: "EQ-QA",
  employees: "EMP-QA", responsibilityPolicies: "POLICY-QA", employmentAssignments: "EA-QA",
})) {
  assert(!success.projection.registries[registry].some((row) => row.id === id), `${registry}:${id} must be removed`);
}
assert(success.projection.registries.orgUnits.some((row) => row.id === "OU-BASE"));
assert(success.projection.registries.orgUnits.some((row) => row.id === "OU-NEAR"), "a longer token must not match the exact cleanup token");
assert(success.projection.registries.employmentAssignments.some((row) => row.id === "EA-BASE"));
assert.equal(success.closed, true);

await expectCode("root-required", () => executeDisposableStructureCleanup({
  token: TOKEN, confirmToken: TOKEN, env: ENV, uid: 1001,
}));
await expectCode("confirmation-mismatch", () => executeDisposableStructureCleanup({
  token: TOKEN, confirmToken: `${TOKEN}-OTHER`, env: ENV, uid: 0,
}));
await expectCode("invalid-token", () => executeDisposableStructureCleanup({
  token: "MOCK-QA-OTHER-1", confirmToken: "MOCK-QA-OTHER-1", env: ENV, uid: 0,
}));

const nonPrimaryRepository = createRepository({ authority: "compatibility-snapshot" });
await expectCode("postgres-primary-required", () => executeDisposableStructureCleanup({
  token: TOKEN, confirmToken: TOKEN, env: ENV, uid: 0,
  repositoryFactory: nonPrimaryRepository.factory,
  dependencySnapshotRunner: dependencyRunner(),
}));
assert.equal(nonPrimaryRepository.state().replaceCalls.length, 0);

const duplicate = fixture();
duplicate.registries.orgUnits.push({ id: "OU-QA-2", code: TOKEN, name: "Ambiguous", isActive: true });
const duplicateRepository = createRepository({ item: duplicate });
await expectCode("ambiguous-token-match", () => executeDisposableStructureCleanup({
  token: TOKEN, confirmToken: TOKEN, env: ENV, uid: 0,
  repositoryFactory: duplicateRepository.factory,
  dependencySnapshotRunner: dependencyRunner(),
}));
assert.equal(duplicateRepository.state().replaceCalls.length, 0);

const referenced = fixture();
referenced.registries.accessRoles.push({ id: "ROLE", isActive: true });
referenced.registries.roleAssignments.push({ id: "ROLE-QA", employeeId: "EMP-QA", roleId: "ROLE" });
const referencedRepository = createRepository({ item: referenced });
await expectCode("unexpected-system-domain-reference", () => executeDisposableStructureCleanup({
  token: TOKEN, confirmToken: TOKEN, env: ENV, uid: 0,
  repositoryFactory: referencedRepository.factory,
  dependencySnapshotRunner: dependencyRunner(),
}));
assert.equal(referencedRepository.state().replaceCalls.length, 0);

const externalRepository = createRepository();
await expectCode("unexpected-external-reference", () => executeDisposableStructureCleanup({
  token: TOKEN, confirmToken: TOKEN, env: ENV, uid: 0,
  repositoryFactory: externalRepository.factory,
  dependencySnapshotRunner: dependencyRunner([{ owner: "shift-execution", kind: "shift-executor", id: "SHIFT:EMP-QA" }]),
}));
assert.equal(externalRepository.state().replaceCalls.length, 0);

const changedRepository = createRepository({ mutateBeforeFreshRead: true });
await expectCode("aggregate-changed", () => executeDisposableStructureCleanup({
  token: TOKEN, confirmToken: TOKEN, env: ENV, uid: 0,
  repositoryFactory: changedRepository.factory,
  dependencySnapshotRunner: dependencyRunner(),
}));
assert.equal(changedRepository.state().replaceCalls.length, 0);

const authorityChangedRepository = createRepository({ authorityChangesBeforeCommit: true });
await expectCode("postgres-primary-changed", () => executeDisposableStructureCleanup({
  token: TOKEN, confirmToken: TOKEN, env: ENV, uid: 0,
  repositoryFactory: authorityChangedRepository.factory,
  dependencySnapshotRunner: dependencyRunner(),
}));
assert.equal(authorityChangedRepository.state().replaceCalls.length, 0);

const conflictRepository = createRepository({ conflict: true });
await expectCode("aggregate-conflict", () => executeDisposableStructureCleanup({
  token: TOKEN, confirmToken: TOKEN, env: ENV, uid: 0,
  repositoryFactory: conflictRepository.factory,
  dependencySnapshotRunner: dependencyRunner(),
}));
assert.equal(conflictRepository.state().replaceCalls.length, 1);

const wrapper = await readFile(new URL("../ops/postgres/cleanup-disposable-production-structure.sh", import.meta.url), "utf8");
for (const contract of [
  "EUID", "release-root-seal-verify.mjs", "--contract=system-domains", "active-release.json",
  "MES_DOMAIN_STORAGE=postgres", "MES_DISPOSABLE_STRUCTURE_CLEANUP_SEALED_APP",
  "MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD", "with-authority-rollout-lock.sh",
  "--confirm-token=", "exec /usr/bin/node",
]) assert(wrapper.includes(contract), `root wrapper is missing ${contract}`);
assert(!wrapper.includes("qa-auth-bypass") && !wrapper.includes("curl "), "cleanup wrapper must not use HTTP or localhost QA bypass");

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(packageJson.scripts["domain:system-domains:cleanup-disposable-structure"], "node scripts/system-domains-disposable-structure-cleanup.mjs");
assert.equal(packageJson.scripts["qa:domain-system-domains-disposable-cleanup"], "node scripts/system-domains-disposable-structure-cleanup-qa.mjs");

console.log("System Domains disposable Structure cleanup QA: OK");
console.log("- exact seven-row cleanup, auditable CAS receipt and unrelated-row preservation: pass");
console.log("- root/primary/token/reference/dependency/fresh-revision fail-closed gates: pass");
console.log("- sealed active-release wrapper without HTTP or localhost bypass: pass");
