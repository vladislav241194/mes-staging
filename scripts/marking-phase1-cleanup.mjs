#!/usr/bin/env node
import process from "node:process";
import postgres from "postgres";

const CONFIRMATION = "DELETE-ALL-MARKING-PHASE1-TEST-DATA";
const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.replace(/^--/, "").split("=");
  return [key, rest.join("=") || true];
}));
const execute = args.get("execute") === true;
const confirmation = String(args.get("confirm") || "");
const databaseUrl = String(process.env.MES_DOMAIN_DATABASE_URL || process.env.DATABASE_URL || "").trim();

if (!databaseUrl) throw new Error("MES_DOMAIN_DATABASE_URL or DATABASE_URL is required");
if (execute && typeof process.getuid === "function" && process.getuid() !== 0) throw new Error("Marking Phase 1 cleanup requires root");
if (execute && String(process.env.APP_ENV || "").trim() !== "pilot") throw new Error("Marking Phase 1 cleanup is permitted only with APP_ENV=pilot");
if (execute && confirmation !== CONFIRMATION) throw new Error(`Destructive cleanup requires --confirm=${CONFIRMATION}`);

const sql = postgres(databaseUrl, { max: 1, idle_timeout: 5, connect_timeout: 5, prepare: false });
const countRows = async (query = sql) => {
  const rows = await query`
    SELECT
      (SELECT count(*)::integer FROM marking_phase1_tasks) AS tasks,
      (SELECT count(*)::integer FROM marking_phase1_kits) AS kits,
      (SELECT count(*)::integer FROM marking_phase1_codes) AS codes,
      (SELECT count(*)::integer FROM marking_phase1_print_batches) AS print_batches,
      (SELECT count(*)::integer FROM marking_phase1_print_items) AS print_items,
      (SELECT count(*)::integer FROM marking_phase1_audit_events) AS audit_events,
      (SELECT count(*)::integer FROM marking_phase1_command_requests) AS command_requests
  `;
  return rows[0] || {};
};

try {
  const before = await countRows();
  if (!execute) {
    console.log(JSON.stringify({ ok: true, mode: "dry-run", scope: "marking-phase1-test-state", before, confirmation: CONFIRMATION }));
  } else {
    const after = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext('mes:marking-phase1:cleanup'))`;
      await tx`DELETE FROM marking_phase1_print_items`;
      await tx`DELETE FROM marking_phase1_command_requests`;
      await tx`DELETE FROM marking_phase1_audit_events`;
      await tx`DELETE FROM marking_phase1_print_batches`;
      await tx`DELETE FROM marking_phase1_codes`;
      await tx`DELETE FROM marking_phase1_kits`;
      await tx`DELETE FROM marking_phase1_tasks WHERE prototype_scope = 'isolated-test'`;
      return countRows(tx);
    });
    if (Object.values(after).some((value) => Number(value) !== 0)) throw new Error("Marking Phase 1 cleanup left rows behind");
    console.log(JSON.stringify({ ok: true, mode: "executed", scope: "marking-phase1-test-state", before, after }));
  }
} finally {
  await sql.end({ timeout: 5 });
}
