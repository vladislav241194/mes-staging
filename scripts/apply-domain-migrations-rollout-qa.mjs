import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [applySource, lockSource, readinessPolicySource, repositorySource, markerSource] = await Promise.all([
  readFile(new URL("../ops/postgres/apply-domain-migrations.sh", import.meta.url), "utf8"),
  readFile(new URL("../ops/shared-state/with-authority-rollout-lock.sh", import.meta.url), "utf8"),
  readFile(new URL("./specifications2-rollout-readiness-policy.mjs", import.meta.url), "utf8"),
  readFile(new URL("./domain-specifications2-repository.mjs", import.meta.url), "utf8"),
  readFile(new URL("../ops/postgres/specifications2-server-command-compatibility.json", import.meta.url), "utf8"),
]);
const marker = JSON.parse(markerSource);
assert.equal(marker.workOrderRequestFingerprintVersion, 1,
  "the staged compatibility marker must bind the exact Work Order request fingerprint contract");

const lockBoundary = applySource.indexOf("MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD");
const migrationStart = applySource.indexOf('systemctl start "${SERVICE}"');
assert(lockBoundary >= 0 && migrationStart > lockBoundary, "the shared authority lock must be acquired before any migration service mutation");
assert(applySource.includes('exec "${APP_DIR}/ops/shared-state/with-authority-rollout-lock.sh" "$0" "$@"'), "the root helper must re-enter itself through the shared lock without losing arguments");
assert(lockSource.includes("adopt_flock_path_fd")
  && lockSource.includes("write_owner_marker")
  && lockSource.includes("export MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD=1")
  && lockSource.includes('exec "$@"'),
"the explicit re-entry sentinel must be exported only after same-PID fd9 adoption and proof");
assert(lockSource.includes('lock_file="${lock_parent}/mes-authority-rollout.lock"')
  && lockSource.includes("/usr/bin/flock --exclusive --nonblock")
  && lockSource.includes('"$lock_file" /usr/bin/env -u BASH_ENV')
  && lockSource.includes("--no-fork")
  && lockSource.includes('prove_fd_lock "$$" "$target_fd" "$expected_file"')
  && !lockSource.includes('mkdir "$lock_dir"'),
"migration and rollout commands must share one SIGKILL-safe kernel authority lock");
assert(applySource.includes("mes-pilot-domain-migrate.service"), "the helper must invoke only the controlled migration service");
assert(applySource.includes('work-orders-schema-ready "${readiness}"') && applySource.includes('publication-schema-ready "${readiness}"'), "migration closure must require both live Specifications 2.0 command capabilities to report the shared exact schema proof");
assert(applySource.includes("028/029/030/031") && applySource.includes("exact rollback guards"), "the root operator failure must name the complete required migration/function/fingerprint/trigger contract");
assert(!applySource.includes("MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS=1") && !applySource.includes("MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS=1"), "schema migration must never activate a Specifications 2.0 command surface");

assert(readinessPolicySource.includes('commandStatus(payload, "specifications2WorkOrderCreation")') && readinessPolicySource.includes('commandStatus(payload, "specifications2RevisionPublication")'), "both root rollout modes must consume the candidate's shared command readiness proof");
assert(repositorySource.includes("to_regclass('public.specifications2_publication_requests')"), "live readiness must prove the migration 028 publication-request schema, not only its manifest marker");
assert(repositorySource.includes("version = '029_specifications2_revision_identity_backfill'")
  && repositorySource.includes("version = '030_specifications2_legacy_revision_identity_guard'")
  && repositorySource.includes("version = '031_specifications2_guard_function_repair'"),
"live readiness must prove migration markers 029, 030 and 031");
assert(repositorySource.includes("pg_get_triggerdef")
  && repositorySource.includes("to_regprocedure")
  && repositorySource.includes("sha256(convert_to(function_definition.prosrc, 'UTF8'))"),
"live readiness must fail closed unless the exact trigger definitions, tgfoid identities and guard-function body digests match");
assert.deepEqual(marker.requiredMigrations, [
  "019_specifications2_attachment_blobs",
  "028_specifications2_publication_idempotency",
  "029_specifications2_revision_identity_backfill",
  "030_specifications2_legacy_revision_identity_guard",
  "031_specifications2_guard_function_repair",
], "the versioned release contract must list exactly the migrations proved by candidate readiness");

console.log("Apply domain migrations authority rollout QA: OK");
