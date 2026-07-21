import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runShiftExecutionAuthorityReconcile } from "./domain-shift-execution-authority-reconcile.mjs";

const directory = await mkdtemp(join(tmpdir(), "mes-shift-authority-reconcile-qa-"));
const triggerPath = join(directory, ".shift-execution-authority-rollback.json");
const trigger = {
  action: "rollback",
  transitionId: "shift-authority-reconcile-qa",
  sourceDigest: "c".repeat(64),
};
const triggerSource = `${JSON.stringify(trigger, null, 2)}\n`;
const env = {
  MES_SHARED_STATE_DIR: directory,
  MES_BACKUP_DIR: directory,
  MES_AUDIT_LOG_PATH: join(directory, "audit.jsonl"),
  MES_DOMAIN_MIGRATOR_DATABASE_URL: "postgres://unused-in-injected-qa",
};

try {
  let reconcileCalls = 0;
  let rollbackCalls = 0;
  let unlinkCalls = 0;
  const forbiddenReconcile = async () => { reconcileCalls += 1; throw new Error("dry run must not reconcile"); };
  const forbiddenRollback = async () => { rollbackCalls += 1; throw new Error("dry run must not roll back"); };
  const trackedUnlink = async (path) => { unlinkCalls += 1; await unlink(path); };

  await writeFile(triggerPath, triggerSource, { mode: 0o600 });
  const rollbackPlan = await runShiftExecutionAuthorityReconcile({
    env,
    argv: ["--dry-run"],
    reconcileFn: forbiddenReconcile,
    rollbackFn: forbiddenRollback,
    unlinkFn: trackedUnlink,
  });
  assert.equal(rollbackPlan.dryRun, true);
  assert.equal(rollbackPlan.action, "rollback");
  assert.equal(rollbackPlan.transitionId, trigger.transitionId);
  assert.equal(rollbackPlan.sourceDigest, trigger.sourceDigest);
  assert.equal(reconcileCalls, 0);
  assert.equal(rollbackCalls, 0);
  assert.equal(unlinkCalls, 0);
  assert.equal(await readFile(triggerPath, "utf8"), triggerSource, "dry-run must leave the rollback trigger byte-identical");

  const rollbackFailure = new Error("injected rollback failure");
  await assert.rejects(
    runShiftExecutionAuthorityReconcile({
      env,
      rollbackFn: async () => { rollbackCalls += 1; throw rollbackFailure; },
      unlinkFn: trackedUnlink,
    }),
    (error) => error === rollbackFailure,
  );
  assert.equal(rollbackCalls, 1);
  assert.equal(unlinkCalls, 0, "a failed rollback must not acknowledge the durable trigger");
  assert.equal(await readFile(triggerPath, "utf8"), triggerSource, "a failed rollback must retain the exact durable trigger for retry");

  const rollbackEvents = [];
  const rollbackResult = await runShiftExecutionAuthorityReconcile({
    env,
    rollbackFn: async ({ transitionId, sourceDigest, env: observedEnv }) => {
      rollbackEvents.push("rollback");
      assert.equal(transitionId, trigger.transitionId);
      assert.equal(sourceDigest, trigger.sourceDigest);
      assert.equal(observedEnv, env);
      return { ok: true, transitionId, restoredSnapshotVersion: 42 };
    },
    unlinkFn: async (path) => {
      rollbackEvents.push("unlink");
      await unlink(path);
    },
  });
  assert.deepEqual(rollbackEvents, ["rollback", "unlink"], "the trigger may be deleted only after rollback succeeds");
  assert.equal(rollbackResult.action, "rollback");
  assert.equal(rollbackResult.result.transitionId, trigger.transitionId);
  await assert.rejects(access(triggerPath), (error) => error?.code === "ENOENT");

  const reconcilePlan = await runShiftExecutionAuthorityReconcile({
    env,
    argv: ["--dry-run"],
    reconcileFn: forbiddenReconcile,
    rollbackFn: forbiddenRollback,
    unlinkFn: trackedUnlink,
  });
  assert.equal(reconcilePlan.action, "reconcile");
  assert.equal(reconcilePlan.dryRun, true);
  assert.equal(reconcileCalls, 0);
  assert.equal(rollbackCalls, 1);
  assert.equal(unlinkCalls, 0);

  const authority = {
    mode: "postgres-primary",
    transitionId: "stable-shift-authority",
    sourceDigest: "d".repeat(64),
  };
  const reconcileFn = async ({ env: observedEnv }) => {
    reconcileCalls += 1;
    assert.equal(observedEnv, env);
    return { ok: true, authority, retiredSnapshotVersion: 43 };
  };
  const firstReconcile = await runShiftExecutionAuthorityReconcile({ env, reconcileFn });
  const repeatedReconcile = await runShiftExecutionAuthorityReconcile({ env, reconcileFn });
  assert.equal(reconcileCalls, 2, "each explicit invocation must delegate exactly once to the idempotent authority reconciler");
  assert.deepEqual(repeatedReconcile.result, firstReconcile.result, "a repeated reconcile must report the same converged authority");

  await writeFile(triggerPath, `${JSON.stringify({ ...trigger, sourceDigest: "invalid" })}\n`, { mode: 0o600 });
  await assert.rejects(
    runShiftExecutionAuthorityReconcile({ env, reconcileFn, rollbackFn: forbiddenRollback, unlinkFn: trackedUnlink }),
    /rollback trigger is invalid/,
  );
  assert.equal(reconcileCalls, 2, "an invalid trigger must fail before reconciliation");
  assert.equal(rollbackCalls, 1, "an invalid trigger must fail before rollback");
  assert.equal(unlinkCalls, 0, "an invalid trigger must never be deleted");

  await assert.rejects(
    runShiftExecutionAuthorityReconcile({ env, argv: ["--apply"] }),
    /Unknown Shift authority reconciliation option/,
  );

  const scriptsDirectory = new URL("./", import.meta.url);
  const repositoryRoot = fileURLToPath(new URL("../", scriptsDirectory));
  const migrationSource = await readFile(new URL("domain-postgres-migrate.mjs", scriptsDirectory), "utf8");
  const migrationUnit = await readFile(new URL("../ops/postgres/mes-pilot-domain-migrate.service", scriptsDirectory), "utf8");
  const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
  assert.match(migrationSource, /accepts only --schema-only/);
  assert.doesNotMatch(migrationSource, /domain-shift-execution-authority-reconcile|reconcileShiftExecutionPostgresAuthority|rollbackShiftExecutionPostgresAuthority/);
  assert.match(migrationUnit, /domain-postgres-migrate\.mjs --schema-only/);
  assert.doesNotMatch(migrationUnit, /authority-reconcile|reconcile-shift-authority/);
  assert.equal(packageJson.scripts["domain:postgres:migrate"], "node scripts/domain-postgres-migrate.mjs");
  assert.equal(packageJson.scripts["domain:postgres:reconcile-shift-authority"], "node scripts/domain-shift-execution-authority-reconcile.mjs");
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("Shift execution authority reconcile QA: OK");
