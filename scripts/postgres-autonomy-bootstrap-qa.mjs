import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function assert(condition, message) { if (!condition) throw new Error(message); }
const base = new URL("../ops/postgres/", import.meta.url);
const script = await readFile(fileURLToPath(new URL("mes-provision-postgres.sh", base)), "utf-8");
const migrationUnit = await readFile(fileURLToPath(new URL("mes-pilot-domain-migrate.service", base)), "utf-8");
const migrationRunner = await readFile(fileURLToPath(new URL("domain-postgres-migrate.mjs", new URL("./", import.meta.url))), "utf-8");
const shiftAuthorityReconcile = await readFile(fileURLToPath(new URL("domain-shift-execution-authority-reconcile.mjs", new URL("./", import.meta.url))), "utf-8");
const importUnit = await readFile(fileURLToPath(new URL("mes-pilot-domain-import.service", base)), "utf-8");
const syncUnit = await readFile(fileURLToPath(new URL("mes-pilot-domain-snapshot-sync.service", base)), "utf-8");
const syncTimer = await readFile(fileURLToPath(new URL("mes-pilot-domain-snapshot-sync.timer", base)), "utf-8");
const activationDropIn = await readFile(fileURLToPath(new URL("mes-pilot-domain-storage.conf", base)), "utf-8");
const systemDomainsCommandDropIn = await readFile(fileURLToPath(new URL("mes-pilot-system-domains-production-structure.conf", base)), "utf-8");
const systemDomainsCommandActorDropIn = await readFile(fileURLToPath(new URL("mes-pilot-system-domains-command-actors.conf", base)), "utf-8");
const systemDomainsCommandActorExample = await readFile(fileURLToPath(new URL("mes-pilot-system-domains-command-actors.env.example", base)), "utf-8");
const systemDomainsCommandActivation = await readFile(fileURLToPath(new URL("activate-system-domains-production-structure.sh", base)), "utf-8");
const systemDomainsCommandRollback = await readFile(fileURLToPath(new URL("deactivate-system-domains-production-structure.sh", base)), "utf-8");
const systemDomainsCommandSurfaceActivation = await readFile(fileURLToPath(new URL("activate-system-domains-command-surfaces.sh", base)), "utf-8");
const systemDomainsCommandSurfaceRollback = await readFile(fileURLToPath(new URL("deactivate-system-domains-command-surfaces.sh", base)), "utf-8");
const systemDomainsPrimaryCommandRecovery = await readFile(fileURLToPath(new URL("recover-system-domains-primary-command-surfaces.sh", base)), "utf-8");
const employeeAuthReadiness = await readFile(fileURLToPath(new URL("../auth/assert-pilot-employee-auth-readiness.sh", base)), "utf-8");
const systemDomainsTimesheetDropIn = await readFile(fileURLToPath(new URL("mes-pilot-system-domains-timesheet.conf", base)), "utf-8");
const systemDomainsAccessControlDropIn = await readFile(fileURLToPath(new URL("mes-pilot-system-domains-access-control.conf", base)), "utf-8");
const specifications2AttachmentDropIn = await readFile(fileURLToPath(new URL("mes-pilot-specifications2-attachments.conf", base)), "utf-8");
const specifications2AttachmentActivation = await readFile(fileURLToPath(new URL("activate-specifications2-attachments.sh", base)), "utf-8");
const specifications2AttachmentRollback = await readFile(fileURLToPath(new URL("deactivate-specifications2-attachments.sh", base)), "utf-8");
const specifications2PublicationDropIn = await readFile(fileURLToPath(new URL("mes-pilot-specifications2-publication.conf", base)), "utf-8");
const specifications2PublicationActivation = await readFile(fileURLToPath(new URL("activate-specifications2-publication.sh", base)), "utf-8");
const specifications2PublicationRollback = await readFile(fileURLToPath(new URL("deactivate-specifications2-publication.sh", base)), "utf-8");
const applyDomainMigrations = await readFile(fileURLToPath(new URL("apply-domain-migrations.sh", base)), "utf-8");
const retireSystemDomainsSnapshot = await readFile(fileURLToPath(new URL("retire-system-domains-snapshot.sh", base)), "utf-8");
assert(!script.includes("MES_DOMAIN_STORAGE=snapshot"), "Bootstrap must leave storage selection to the safe application default, not override activation");
assert(script.includes("Storage mode is intentionally absent"), "Bootstrap must document why no storage mode is persisted with credentials");
assert(script.includes("chmod 0600"), "Bootstrap must protect database secrets");
assert(script.includes("NOSUPERUSER NOCREATEDB NOCREATEROLE"), "Database roles must be least-privilege roles");
assert(script.includes("openssl rand -hex 32"), "Connection-string passwords must be URL-safe");
assert(script.includes("ALTER SYSTEM SET listen_addresses = '127.0.0.1,::1'"), "PostgreSQL must be bound to loopback only");
assert(script.includes("MES_DOMAIN_MIGRATOR_DATABASE_URL"), "Bootstrap must keep the migration connection separate from the app connection");
assert(script.includes("mes-pilot-domain-migrator.env") && script.includes("pilot-postgres-provision"), "Bootstrap must journal a dedicated migrator env as part of one credential pair");
assert(script.includes("Command flags also do not belong here"), "Bootstrap must keep command flags out of database credential files");
assert(script.includes("custom identifiers are not journaled"), "Bootstrap must reject DB/role identifiers that recovery cannot replay exactly");
assert(script.includes("partial credential pair exists without its durable provisioning journal"), "Bootstrap must fail closed on an unjournaled partial pair");
assert(script.includes("install_env_from_journal") && script.includes("runtime-installed") && script.includes("pair-installed"), "Bootstrap must resume the two-file install from one durable credential journal");
assert(!/--set=(?:app|migrator)_password=/.test(script), "Bootstrap must not expose either database password in psql argv");
const provisionPrepared = script.indexOf('prepare_journal "$(openssl rand -hex 32)"');
const provisionRoleMutation = script.indexOf("ALTER ROLE %I WITH LOGIN PASSWORD");
const provisionRuntimeInstall = script.indexOf('install_env_from_journal "$RUNTIME_JOURNAL_FILE"');
const provisionMigratorInstall = script.indexOf('install_env_from_journal "$MIGRATOR_JOURNAL_FILE"');
const provisionCommit = script.indexOf("set_journal_phase committed");
const provisionClear = script.indexOf("clear_journal", provisionCommit);
assert(provisionPrepared >= 0 && provisionPrepared < provisionRoleMutation && provisionRoleMutation < provisionRuntimeInstall
  && provisionRuntimeInstall < provisionMigratorInstall && provisionMigratorInstall < provisionCommit && provisionCommit < provisionClear,
"Provision journal must precede PostgreSQL mutation and survive both env installs through commit");

// Inject the legacy-dangerous crash after only runtime.env was renamed. The
// durable pair retains both passwords, so replay converges both DB roles/envs
// to the same pair instead of refusing the second run or inventing new secrets.
for (const point of ["journal-prepared", "roles-updated", "runtime-only", "pair-installed", "committed-before-clear"]) {
  const state = {
    journal: { app: "journal-app", migrator: "journal-migrator" },
    db: point === "journal-prepared" ? null : { app: "journal-app", migrator: "journal-migrator" },
    runtimeEnv: ["runtime-only", "pair-installed", "committed-before-clear"].includes(point) ? "journal-app" : null,
    migratorEnv: ["pair-installed", "committed-before-clear"].includes(point) ? "journal-migrator" : null,
  };
  state.db = { app: state.journal.app, migrator: state.journal.migrator };
  state.runtimeEnv = state.journal.app;
  state.migratorEnv = state.journal.migrator;
  state.journal = null;
  assert(state.db.app === state.runtimeEnv && state.db.migrator === state.migratorEnv && state.journal === null,
    `${point}: provisioning replay must converge and clear the pair journal`);
}
assert(migrationUnit.includes("User=mes-pilot-migrator"), "Migration must use the locked migrator OS identity");
assert(migrationUnit.includes("EnvironmentFile=/etc/mes/mes-pilot-domain-migrator.env"), "Migration must use only the protected migrator environment file");
assert(!migrationUnit.includes("EnvironmentFile=/etc/mes/mes-pilot-domain.env"), "Migration must not receive runtime database credentials");
assert(migrationUnit.includes("domain-postgres-migrate.mjs --schema-only"), "Migration unit must select the pure-schema execution contract");
assert(!migrationUnit.includes("ReadWritePaths="), "Pure schema migration must not receive shared-state, backup, or audit write paths");
assert(!/MES_(?:SHARED_STATE_DIR|BACKUP_DIR|AUDIT_LOG_PATH)|reconcileShiftExecutionPostgresAuthority|rollbackShiftExecutionPostgresAuthority|\bunlink\b/.test(migrationRunner), "Schema migration must not reconcile Shift authority after SQL commit");
assert(shiftAuthorityReconcile.includes("reconcileShiftExecutionPostgresAuthority") && shiftAuthorityReconcile.includes("rollbackShiftExecutionPostgresAuthority"), "Shift authority side effects must remain available only through the separate explicit reconciler");
assert(shiftAuthorityReconcile.includes("MES_SHARED_STATE_DIR") && shiftAuthorityReconcile.includes("MES_BACKUP_DIR") && shiftAuthorityReconcile.includes("MES_AUDIT_LOG_PATH"), "Explicit Shift authority reconciliation must fail closed without its mutable path contract");
assert(importUnit.includes("User=mes-pilot-migrator"), "Import must use the locked migrator OS identity");
assert(importUnit.includes("domain-postgres-import.mjs") && importUnit.includes("--apply"), "Import unit must use the controlled importer directly without a writable npm cache");
assert(importUnit.includes("mes-pilot-shared-state-v1.json"), "Pilot import must target the active pilot snapshot, not a default file name");
assert(importUnit.includes("Environment=APP_ENV=pilot"), "Pilot import must preserve the source contour identity");
assert(syncUnit.includes("MES_DOMAIN_STORAGE=postgres") && syncUnit.includes("domain-snapshot-sync-runner.mjs"), "Compatibility outbox runner must be an explicit PostgreSQL system service");
assert(syncUnit.includes("User=mes-pilot") && syncUnit.includes("EnvironmentFile=/etc/mes/mes-pilot-domain.env"), "Compatibility outbox must use the isolated runtime identity and runtime credential only");
assert(syncUnit.includes("ReadWritePaths=/srv/mes/pilot/shared-state"), "Compatibility outbox runner may write only the shared-state projection");
assert(syncTimer.includes("OnUnitActiveSec=30s") && syncTimer.includes("Persistent=true"), "Compatibility outbox must retry independently of HTTP writes");
assert(activationDropIn.includes("Environment=MES_DOMAIN_STORAGE=postgres"), "Activation drop-in must explicitly opt into PostgreSQL over the safe snapshot default");
assert(systemDomainsCommandDropIn.includes("MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS=1"), "System Domains command activation must be an explicit root-only drop-in");
assert(systemDomainsCommandDropIn.includes("MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES=production-structure"), "First command rollout must enable only the reviewed production-structure surface");
assert(systemDomainsCommandDropIn.includes("Timesheet and access-control"), "Command activation must document the intentionally excluded surfaces");
assert(systemDomainsCommandActorDropIn.includes("EnvironmentFile=/etc/mes/mes-pilot-system-domains-command-actors.env"), "System Domains command activation must load the separate protected actor policy");
assert(systemDomainsCommandActorExample.includes("# MES_SYSTEM_DOMAINS_COMMAND_ACTORS=public:"), "Actor-policy example must require an explicit public principal instead of shipping a live allowlist");
assert(systemDomainsCommandActivation.includes("activate-system-domains-command-surfaces.sh") && systemDomainsCommandActivation.includes("--through=production-structure"), "Legacy first-surface activation entry point must delegate to the guarded staged rollout");
assert(systemDomainsCommandRollback.includes("deactivate-system-domains-command-surfaces.sh") && systemDomainsCommandRollback.includes("--to=disabled"), "Legacy first-surface rollback entry point must delegate to the guarded staged rollback");
assert(systemDomainsTimesheetDropIn.includes("MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES=production-structure,timesheet"), "Dormant Timesheet compatibility artifact must keep an explicit complete surface list");
assert(systemDomainsAccessControlDropIn.includes("MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES=production-structure,timesheet,access-control"), "Dormant Access Control compatibility artifact must keep an explicit complete surface list");
assert(systemDomainsCommandSurfaceActivation.includes("Usage: activate-system-domains-command-surfaces.sh --through=production-structure"), "Staged command-surface rollout must advertise Production Structure as its only eligible target");
const productionOnlyGate = systemDomainsCommandSurfaceActivation.indexOf('if [[ "$THROUGH" != "production-structure" ]]');
const rolloutLockEntry = systemDomainsCommandSurfaceActivation.indexOf('with-authority-rollout-lock.sh');
assert(productionOnlyGate >= 0 && rolloutLockEntry > productionOnlyGate, "Timesheet and Access Control activation must fail before the rollout lock or any service mutation");
assert(systemDomainsCommandSurfaceActivation.includes("Timesheet and Access Control server writes remain disabled until their employee-session RBAC and server delta invariants are implemented."), "Unreviewed Timesheet and Access Control writers must fail closed with an explicit reason");
assert(systemDomainsCommandSurfaceActivation.includes("compatibilityReady") && systemDomainsCommandSurfaceActivation.includes("primaryReady") && systemDomainsCommandSurfaceActivation.includes("retirementEligible"), "Command-surface rollout readiness must accept only stable compatibility parity or a durable PostgreSQL-primary tombstone");
assert(systemDomainsCommandSurfaceActivation.includes("assert-pilot-employee-auth-readiness.sh") && systemDomainsCommandSurfaceActivation.includes("assert_employee_auth_readiness"), "Production Structure activation must require root-level employee-auth readiness before and after restart");
assert(systemDomainsCommandSurfaceActivation.includes("!same(current, expected) && !same(current, predecessor)"), "Staged command-surface rollout must reject skipped stages based on the running service state");
assert(systemDomainsCommandSurfaceActivation.includes("configuredServerCommandSurfaces") && systemDomainsCommandSurfaceActivation.includes("serverCommandsConfigured"), "Staged command-surface rollout must verify the exact live configured surface list after restart");
assert(systemDomainsCommandSurfaceActivation.includes("request_internal_api()") && systemDomainsCommandSurfaceActivation.includes("for attempt in $(seq 1 12)"), "Staged command-surface rollout must wait for the restarted Node listener before judging its live capability");
assert(systemDomainsCommandSurfaceActivation.includes("--connect-timeout 2 --max-time 5"), "Staged command-surface rollout retry must remain time-bounded when a loopback request hangs");
assert(systemDomainsCommandSurfaceActivation.includes("LEGACY_PRODUCTION_DROPIN_FILE") && systemDomainsCommandSurfaceActivation.includes("60-system-domains-production-structure.conf"), "Staged command-surface rollout must remove the pre-policy production drop-in that can win lexical systemd override order");
assert(systemDomainsCommandSurfaceActivation.includes("MES_PUBLIC_AUTH_USERNAME") && systemDomainsCommandSurfaceActivation.includes("expectedPrincipal") && systemDomainsCommandSurfaceActivation.includes("actors.includes(expectedPrincipal)"), "Staged command-surface rollout must prove the active public principal is present in the protected actor policy");
assert(systemDomainsCommandSurfaceActivation.includes("/proc/${MAIN_PID}/environ") && systemDomainsCommandSurfaceActivation.includes("MES_SYSTEM_DOMAINS_COMMAND_ACTORS"), "Staged command-surface rollout must verify the effective process environment instead of only systemd files");
assert(systemDomainsCommandSurfaceActivation.includes("restore_on_failure") && systemDomainsCommandSurfaceActivation.includes("mktemp -d /root/.mes-system-domains-command-surfaces"), "Staged command-surface rollout must restore prior drop-ins if restart or verification fails");
assert(systemDomainsCommandSurfaceActivation.includes("existing System Domains authority mode was preserved"), "Command-surface rollout must prove it did not change System Domains authority");
assert(systemDomainsCommandSurfaceActivation.includes("This does not retire the compatibility snapshot"), "Writer-surface rollout must state that primary cutover remains separate");
assert(!systemDomainsCommandSurfaceActivation.includes("retire-system-domains-snapshot.sh --apply"), "Writer-surface rollout must not execute the root-only snapshot retirement cutover");
assert(systemDomainsCommandSurfaceRollback.includes("--to=disabled|production-structure|timesheet"), "Staged command-surface rollback must support an explicit disabled state and safe downshifts");
assert(systemDomainsCommandSurfaceRollback.includes("rm -f \"$ACTOR_POLICY_DROPIN_FILE\" \"$PRODUCTION_DROPIN_FILE\" \"$LEGACY_PRODUCTION_DROPIN_FILE\" \"$TIMESHEET_DROPIN_FILE\" \"$ACCESS_CONTROL_DROPIN_FILE\""), "Staged command-surface rollback must remove every current and legacy writer drop-in before rebuilding a lower stage");
assert(systemDomainsCommandSurfaceRollback.includes("primarySuspendReady") && systemDomainsCommandSurfaceRollback.includes('target === "disabled"') && systemDomainsCommandSurfaceRollback.includes("retirementEligible"), "Staged command-surface rollback must permit only a tombstone-preserving PostgreSQL-primary suspension to disabled");
assert(systemDomainsCommandSurfaceRollback.includes("SCRIPT_APP_DIR") && systemDomainsCommandSurfaceRollback.includes('"$source_target" == "${RELEASES_DIR}/${release_id}/app"') && systemDomainsCommandSurfaceRollback.includes('release --releases-root="$RELEASES_DIR" --release-id="$release_id" --app="$source_target"'), "Primary suspension must be runnable from a separately sealed staged release without trusting mutable files");
assert(systemDomainsCommandSurfaceRollback.includes("stat.uid !== 0") && systemDomainsCommandSurfaceRollback.includes("stat.mode & 0o077"), "Staged command-surface rollback must validate root-owned 0600 actor policy before re-enabling a writer");
assert(systemDomainsCommandSurfaceRollback.includes("expectedPrincipal") && systemDomainsCommandSurfaceRollback.includes("actors.includes(expectedPrincipal)"), "Staged command-surface rollback must not re-enable a writer that excludes the active public principal");
assert(systemDomainsCommandSurfaceRollback.includes("/proc/${MAIN_PID}/environ") && systemDomainsCommandSurfaceRollback.includes("restore_on_failure"), "Staged command-surface rollback must verify effective process state and restore failed changes");
assert(systemDomainsCommandSurfaceRollback.includes("snapshot/tombstone state were preserved"), "Command-surface rollback must not silently restore or change legacy snapshot/tombstone data");
assert(systemDomainsPrimaryCommandRecovery.includes("authority?.mode !== \"postgres-primary\"") && systemDomainsPrimaryCommandRecovery.includes("retirementEligible !== true"), "PostgreSQL-primary recovery must require an already durable tombstone authority proof");
assert(systemDomainsPrimaryCommandRecovery.includes('EXPECTED_CSV="production-structure"') && systemDomainsPrimaryCommandRecovery.includes("Timesheet and Access Control remain fail-closed"), "PostgreSQL-primary recovery must restore only the reviewed Production Structure surface");
assert(!systemDomainsPrimaryCommandRecovery.includes('EXPECTED_CSV="production-structure,timesheet'), "PostgreSQL-primary recovery must not broaden command ownership to Timesheet or Access Control");
assert(systemDomainsPrimaryCommandRecovery.includes("MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES !== process.argv[2]") && systemDomainsPrimaryCommandRecovery.includes("expectedPrincipal") && systemDomainsPrimaryCommandRecovery.includes("actors.includes(expectedPrincipal)") && systemDomainsPrimaryCommandRecovery.includes("/proc/${MAIN_PID}/environ"), "PostgreSQL-primary recovery must restore every writer surface and authorize the active public principal in the running process");
assert(systemDomainsCommandSurfaceRollback.includes("request_internal_api()") && systemDomainsPrimaryCommandRecovery.includes("request_internal_api()"), "Command-surface rollback and primary recovery must wait for the restarted listener before capability verification");
assert(systemDomainsCommandSurfaceRollback.includes("LEGACY_PRODUCTION_DROPIN_FILE") && systemDomainsPrimaryCommandRecovery.includes("LEGACY_PRODUCTION_DROPIN_FILE"), "Rollback and primary recovery must remove the old production drop-in instead of leaving an unreviewed surface override active");
assert(systemDomainsPrimaryCommandRecovery.includes("restore_on_failure") && systemDomainsPrimaryCommandRecovery.includes("retired compatibility snapshot remains untouched"), "PostgreSQL-primary recovery must preserve old drop-ins on failure without attempting a legacy data restore");
assert(systemDomainsPrimaryCommandRecovery.includes("assert-pilot-employee-auth-readiness.sh") && systemDomainsPrimaryCommandRecovery.includes("assert_employee_auth_readiness"), "PostgreSQL-primary recovery must require employee-auth readiness before restoring production-structure");
assert(employeeAuthReadiness.includes("employeeAuthStorageConfigured") && employeeAuthReadiness.includes("employeeAuthSchemaReady") && employeeAuthReadiness.includes("/proc/${MAIN_PID}/environ") && !employeeAuthReadiness.includes("Cookie:"), "Root employee-auth readiness must prove route/storage/schema/process state without a browser actor");
assert(specifications2AttachmentDropIn.includes("MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS=1"), "Specifications 2.0 attachment rollout must require an explicit service flag");
assert(specifications2AttachmentActivation.includes("attachments-schema-ready"), "Attachment rollout must confirm migration 019 through the shared fail-closed readiness policy before changing service state");
assert(specifications2AttachmentActivation.includes("attachments-ready") && specifications2AttachmentActivation.includes("restore_on_failure"), "Attachment rollout must verify the live capability and restore the prior drop-in after a failed restart");
assert(specifications2AttachmentActivation.includes("release-server-command-contract-verify.mjs") && specifications2AttachmentActivation.includes("--contract=specifications2"), "Attachment rollout must bind root activation to the immutable manifest-verified Specifications 2.0 release");
assert(specifications2AttachmentActivation.includes("with-authority-rollout-lock.sh"), "Attachment rollout must share the authority rollout lock");
assert(specifications2AttachmentActivation.includes("Run as root"), "Attachment rollout must remain an explicit root-only action");
assert(specifications2AttachmentRollback.includes("rm -f \"$DROPIN_FILE\"") && specifications2AttachmentRollback.includes("restore_on_failure"), "Attachment rollback must remove only its own drop-in and restore it if verification fails");
assert(specifications2AttachmentRollback.includes("attachments-disabled"), "Attachment rollback must verify that the live capability is explicitly disabled through the shared policy");
assert(specifications2AttachmentRollback.includes("with-authority-rollout-lock.sh"), "Attachment rollback must share the authority rollout lock");
assert(specifications2AttachmentRollback.includes("release-server-command-contract-verify.mjs") && specifications2AttachmentRollback.includes("--contract=specifications2"), "Attachment rollback must bind root lifecycle to the immutable manifest-verified release");
assert(specifications2PublicationDropIn.includes("MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS=1"), "Specifications 2.0 publication rollout must require an explicit service flag");
assert(specifications2PublicationActivation.includes("publication-schema-ready"), "Publication rollout must prove shared exact schema readiness before changing service state");
assert(specifications2PublicationActivation.includes("publication-ready") && specifications2PublicationActivation.includes("restore_on_failure"), "Publication rollout must verify the strict live capability and restore the prior drop-in on failure");
assert(specifications2PublicationActivation.includes("Run as root"), "Publication rollout must remain an explicit root-only action");
assert(specifications2PublicationRollback.includes("rm -f \"$DROPIN_FILE\"") && specifications2PublicationRollback.includes("restore_on_failure"), "Publication rollback must remove only its own drop-in and restore it if verification fails");
assert(specifications2PublicationRollback.includes("curl --fail") && specifications2PublicationRollback.includes("publication-disabled"), "Publication rollback must fail closed unless the live capability is explicitly disabled");
assert(applyDomainMigrations.includes("EUID"), "Domain migration helper must remain root-only");
assert(applyDomainMigrations.includes("mes-pilot-domain-migrate.service"), "Domain migration helper must use the controlled migrator service");
assert(applyDomainMigrations.includes("schemaReady"), "Domain migration helper must verify the API sees migration 014");
assert(applyDomainMigrations.includes("with-authority-rollout-lock.sh") && applyDomainMigrations.includes("MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD"), "Domain migration helper must share the authority lock and use an explicit re-entry sentinel");
assert(applyDomainMigrations.includes("work-orders-schema-ready") && applyDomainMigrations.includes("publication-schema-ready"), "Domain migration helper must verify the exact candidate Specifications 2.0 schema contract");
assert(!applyDomainMigrations.includes("MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS"), "Schema migration helper must not activate workshop commands");
assert(retireSystemDomainsSnapshot.includes("systemctl show --property=MainPID"), "System Domains retirement must inspect the running service rather than inherit a shell-local command flag");
assert(retireSystemDomainsSnapshot.includes("/proc/${MAIN_PID}/environ"), "System Domains retirement must read the effective systemd environment for its command coverage proof");
assert(retireSystemDomainsSnapshot.includes("MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS") && retireSystemDomainsSnapshot.includes("MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES") && retireSystemDomainsSnapshot.includes("MES_SYSTEM_DOMAINS_COMMAND_ACTORS"), "System Domains retirement must require all effective server command gates");
assert(retireSystemDomainsSnapshot.includes("MES_PUBLIC_AUTH_USERNAME") && retireSystemDomainsSnapshot.includes("actors.includes(principal)"), "System Domains retirement must prove that the active browser principal is authorized before tombstoning the snapshot");
assert(retireSystemDomainsSnapshot.includes("configuredServerCommandSurfaces") && retireSystemDomainsSnapshot.includes("readEligible") && retireSystemDomainsSnapshot.includes("consistencyResponse?.consistency?.matches") && retireSystemDomainsSnapshot.includes("live command capability"), "System Domains retirement must re-check the live command capability and pre-cutover stable compatibility proof immediately before cutover");
await import("./apply-domain-migrations-rollout-qa.mjs");
console.log("PostgreSQL autonomy bootstrap QA: OK");
