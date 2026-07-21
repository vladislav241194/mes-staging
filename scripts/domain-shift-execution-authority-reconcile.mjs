import { readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  reconcileShiftExecutionPostgresAuthority,
  rollbackShiftExecutionPostgresAuthority,
} from "./domain-shift-execution-authority.mjs";

const REQUIRED_PATHS = ["MES_SHARED_STATE_DIR", "MES_BACKUP_DIR", "MES_AUDIT_LOG_PATH"];

function parseArgs(argv = []) {
  const options = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown Shift authority reconciliation option: ${arg}`);
  }
  return options;
}

function requireExplicitEnvironment(env) {
  for (const key of REQUIRED_PATHS) {
    if (!String(env[key] || "").trim()) {
      throw new Error(`${key} is required for explicit Shift authority reconciliation`);
    }
  }
  if (!String(env.MES_DOMAIN_MIGRATOR_DATABASE_URL || "").trim()) {
    throw new Error("MES_DOMAIN_MIGRATOR_DATABASE_URL is required for explicit Shift authority reconciliation");
  }
}

function validateRollbackTrigger(trigger) {
  if (!trigger
    || trigger.action !== "rollback"
    || !String(trigger.transitionId || "")
    || !/^[a-f0-9]{64}$/.test(String(trigger.sourceDigest || ""))) {
    throw new Error("Shift Execution rollback trigger is invalid");
  }
  return {
    action: "rollback",
    transitionId: String(trigger.transitionId),
    sourceDigest: String(trigger.sourceDigest),
  };
}

export async function runShiftExecutionAuthorityReconcile({
  env = process.env,
  argv = [],
  readFileFn = readFile,
  unlinkFn = unlink,
  reconcileFn = reconcileShiftExecutionPostgresAuthority,
  rollbackFn = rollbackShiftExecutionPostgresAuthority,
} = {}) {
  const options = parseArgs(argv);
  requireExplicitEnvironment(env);

  const rollbackTriggerPath = resolve(env.MES_SHARED_STATE_DIR, ".shift-execution-authority-rollback.json");
  let rollbackTrigger = null;
  try {
    rollbackTrigger = validateRollbackTrigger(JSON.parse(await readFileFn(rollbackTriggerPath, "utf8")));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  if (rollbackTrigger) {
    if (options.dryRun) {
      return {
        ok: true,
        dryRun: true,
        action: "rollback",
        rollbackTriggerPath,
        transitionId: rollbackTrigger.transitionId,
        sourceDigest: rollbackTrigger.sourceDigest,
      };
    }
    const result = await rollbackFn({
      transitionId: rollbackTrigger.transitionId,
      sourceDigest: rollbackTrigger.sourceDigest,
      env,
    });
    // The durable request is the crash-recovery boundary. Keep it until the
    // rollback has fully succeeded so the next invocation can safely retry.
    await unlinkFn(rollbackTriggerPath);
    return {
      ok: true,
      dryRun: false,
      action: "rollback",
      rollbackTriggerPath,
      result,
    };
  }

  if (options.dryRun) {
    return {
      ok: true,
      dryRun: true,
      action: "reconcile",
      rollbackTriggerPath,
    };
  }
  const result = await reconcileFn({ env });
  return {
    ok: true,
    dryRun: false,
    action: "reconcile",
    rollbackTriggerPath,
    result,
  };
}

async function main() {
  const outcome = await runShiftExecutionAuthorityReconcile({ argv: process.argv.slice(2) });
  if (outcome.dryRun) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      dryRun: true,
      plannedAction: outcome.action,
      transitionId: outcome.transitionId || "",
      sourceDigest: outcome.sourceDigest || "",
      rollbackTriggerPath: outcome.rollbackTriggerPath,
    }, null, 2)}\n`);
  } else if (outcome.action === "rollback") {
    console.log(`Shift Execution authority rollback: ${outcome.result.transitionId}`);
  } else {
    console.log(`Shift Execution authority: ${outcome.result.authority.mode}`);
  }
}

const invokedAsCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedAsCli) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
