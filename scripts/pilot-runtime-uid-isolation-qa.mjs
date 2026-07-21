import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readlink, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPilotBaseEnv,
  parseStrictEnv,
  parseSystemdEnvironment,
} from "../ops/security/pilot-base-env-migrate.mjs";

const root = new URL("../", import.meta.url);
const paths = {
  appUnit: "deploy/systemd/mes-pilot.service",
  provision: "ops/postgres/mes-provision-postgres.sh",
  migrate: "ops/postgres/mes-pilot-domain-migrate.service",
  import: "ops/postgres/mes-pilot-domain-import.service",
  sync: "ops/postgres/mes-pilot-domain-snapshot-sync.service",
  adminDropin: "ops/security/mes-pilot-admin-auth.conf",
  publicDropin: "ops/security/mes-pilot-public-auth.conf",
  runtimeCheck: "ops/security/mes-pilot-domain-runtime-credential-check.service",
  migratorCheck: "ops/security/mes-pilot-domain-migrator-credential-check.service",
  checkCredential: "ops/security/check-postgres-credential.mjs",
  baseEnv: "ops/security/pilot-base-env-migrate.mjs",
  credentialJournal: "ops/security/pilot-credential-rotation-journal.sh",
  credentialRecovery: "ops/security/recover-pilot-credential-rotation.sh",
  credentialRecoveryUnit: "ops/security/mes-pilot-credential-rotation-recovery.service",
  releaseRecoveryAppDependency: "ops/security/mes-pilot-release-recovery-app-credential-recovery.conf",
  releaseRecoveryWriterDependency: "ops/security/mes-pilot-release-recovery-writer-credential-recovery.conf",
  rootLock: "ops/security/pilot-root-identity-lock.sh",
  transitionGate: "ops/security/pilot-runtime-transition-gate.sh",
  runtimeDispatcher: "ops/security/pilot-runtime-security-dispatch.sh",
  appTransitionDropin: "ops/security/mes-pilot-runtime-transition-recovery.conf",
  writerTransitionDropin: "ops/security/mes-pilot-writer-transition-recovery.conf",
  uidRecovery: "ops/security/recover-pilot-uid-cutover.sh",
  syncTimer: "ops/postgres/mes-pilot-domain-snapshot-sync.timer",
  authorityLock: "ops/shared-state/with-authority-rollout-lock.sh",
  rewrite: "ops/security/pilot-secret-env-rewrite.mjs",
  install: "ops/security/install-pilot-runtime-uid-isolation.sh",
  rotate: "ops/security/rotate-pilot-credentials.sh",
  verify: "ops/security/verify-pilot-runtime-uid-isolation.sh",
  migrationRunner: "scripts/domain-postgres-migrate.mjs",
  shiftAuthorityReconcile: "scripts/domain-shift-execution-authority-reconcile.mjs",
  systemDomainsImport: "scripts/domain-system-domains-import.mjs",
};
const source = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([name, path]) => [name, await readFile(new URL(path, root), "utf8")])));

const releaseRecoveryCredentialDependency = `[Unit]
Requires=mes-pilot-credential-rotation-recovery.service
After=mes-pilot-credential-rotation-recovery.service
`;
assert.equal(source.releaseRecoveryAppDependency, releaseRecoveryCredentialDependency);
assert.equal(source.releaseRecoveryWriterDependency, releaseRecoveryCredentialDependency);

assert.match(source.appUnit, /^User=mes-pilot$/m);
assert.match(source.appUnit, /^Group=mes-pilot$/m);
assert.match(source.appUnit, /^SupplementaryGroups=mes-pilot-data$/m);
assert.match(source.appUnit, /^Requires=mes-pilot-credential-rotation-recovery\.service$/m);
assert.match(source.appUnit, /^After=.*mes-pilot-credential-rotation-recovery\.service$/m);
assert.doesNotMatch(source.appUnit, /^User=deploy$/m);
assert.match(source.appUnit, /^ProtectSystem=strict$/m);
assert.match(source.appUnit, /^ProtectProc=invisible$/m);
assert.match(source.appUnit, /^CapabilityBoundingSet=$/m);
assert.match(source.appUnit, /^ReadWritePaths=\/srv\/mes\/pilot\/shared-state \/srv\/mes\/pilot\/backups \/srv\/mes\/pilot\/audit \/srv\/mes\/pilot\/runtime$/m);
assert.doesNotMatch(source.appUnit, /^ReadWritePaths=\/srv\/mes\/pilot$/m);

for (const [name, unit] of [["migration", source.migrate], ["import", source.import]]) {
  assert.match(unit, /^User=mes-pilot-migrator$/m, `${name} must use the dedicated migrator UID`);
  assert.match(unit, /^SupplementaryGroups=mes-pilot-data$/m, `${name} must use the controlled data-group bridge`);
  assert.match(unit, /^EnvironmentFile=\/etc\/mes\/mes-pilot-domain-migrator\.env$/m, `${name} must receive only the migrator env`);
  assert.doesNotMatch(unit, /EnvironmentFile=\/etc\/mes\/mes-pilot-domain\.env/, `${name} must not receive runtime credentials`);
  assert.match(unit, /^ProtectSystem=strict$/m);
}
assert.match(source.import, /^ReadOnlyPaths=.*\/srv\/mes\/pilot\/shared-state$/m);
assert.match(source.import, /^ReadWritePaths=\/srv\/mes\/pilot\/backups$/m);
assert.doesNotMatch(source.import, /ReadWritePaths=\/srv\/mes\/pilot(?:\s|$)/m);
assert.match(source.migrate, /domain-postgres-migrate\.mjs --schema-only/);
assert.doesNotMatch(source.migrate, /^ReadWritePaths=/m, "schema migration must not receive mutable Pilot paths");
assert.doesNotMatch(source.migrationRunner, /MES_(?:SHARED_STATE_DIR|BACKUP_DIR|AUDIT_LOG_PATH)|reconcileShiftExecutionPostgresAuthority|rollbackShiftExecutionPostgresAuthority|\bunlink\b/,
  "schema migration must remain pure SQL after the service starts");
assert.match(source.shiftAuthorityReconcile, /reconcileShiftExecutionPostgresAuthority/);
assert.match(source.shiftAuthorityReconcile, /rollbackShiftExecutionPostgresAuthority/);
assert.match(source.shiftAuthorityReconcile, /MES_SHARED_STATE_DIR[\s\S]*MES_BACKUP_DIR[\s\S]*MES_AUDIT_LOG_PATH/);
assert.match(source.shiftAuthorityReconcile, /await unlinkFn\(rollbackTriggerPath\)/,
  "the explicit reconciler must acknowledge its durable rollback trigger only after rollback succeeds");
assert.match(source.sync, /^User=mes-pilot$/m);
assert.match(source.sync, /^SupplementaryGroups=mes-pilot-data$/m);
assert.match(source.sync, /^EnvironmentFile=\/etc\/mes\/mes-pilot-domain\.env$/m);
assert.doesNotMatch(source.sync, /mes-pilot-domain-migrator\.env/);

assert.match(source.provision, /RUNTIME_ENV_FILE="\/etc\/mes\/mes-pilot-domain\.env"/);
assert.match(source.provision, /MIGRATOR_ENV_FILE="\/etc\/mes\/mes-pilot-domain-migrator\.env"/);
assert.match(source.provision, /JOURNAL_DIR="\$\{JOURNAL_PARENT\}\/pilot-postgres-provision"/);
assert.match(source.provision, /prepare_journal[\s\S]*mv -T -- "\$temporary" "\$JOURNAL_DIR"[\s\S]*sync -f "\$JOURNAL_PARENT"/);
assert.match(source.provision, /install_env_from_journal "\$RUNTIME_JOURNAL_FILE" "\$RUNTIME_ENV_FILE"[\s\S]*runtime-installed[\s\S]*install_env_from_journal "\$MIGRATOR_JOURNAL_FILE" "\$MIGRATOR_ENV_FILE"[\s\S]*pair-installed[\s\S]*committed[\s\S]*clear_journal/);
assert.match(source.provision, /partial credential pair exists without its durable provisioning journal/);
assert.match(source.provision, /custom identifiers are not journaled/);
assert.match(source.provision, /Command flags also do not belong here/);
assert.doesNotMatch(source.provision, /DATABASE_URL=.*\nMES_DOMAIN_MIGRATOR_DATABASE_URL=/);

assert.match(source.adminDropin, /^EnvironmentFile=\/etc\/mes\/mes-pilot-admin-auth\.env$/m);
assert.match(source.publicDropin, /^EnvironmentFile=\/etc\/mes\/mes-pilot-public-auth\.env$/m);
assert.doesNotMatch(`${source.adminDropin}\n${source.publicDropin}`, /(?:PASSWORD_HASH|SESSION_SECRET)=.+/);
assert.match(source.rewrite, /ignoredCommandKeys[\s\S]*\^MES_ENABLE_\.\*COMMAND/);
assert.match(source.rewrite, /MES_ADMIN_SESSION_SECRET[\s\S]*randomBytes/);
assert.match(source.rewrite, /MES_PUBLIC_AUTH_SESSION_SECRET[\s\S]*randomBytes/);
assert.match(source.rewrite, /MES_EMPLOYEE_AUTH_SESSION_SECRET[\s\S]*randomBytes/);
assert.match(source.rewrite, /preservedPasswordHashes/);
assert.match(source.rewrite, /handle\.sync\(\)[\s\S]*rename\(temporary, path\)/);

const defaults = parseStrictEnv(`
NODE_ENV=production
APP_ENV=pilot
HOST=127.0.0.1
PORT=4175
APP_BASE_URL=https://pilot.mes-line.ru
MES_SHARED_STATE_DIR=/srv/mes/pilot/shared-state
MES_BACKUP_DIR=/srv/mes/pilot/backups
MES_AUDIT_LOG_PATH=/srv/mes/pilot/audit/audit.log
MES_ALLOW_DESTRUCTIVE_ACTIONS=false
MES_ENABLE_WORKFLOW_PRESET_RESTORE=false
MES_BACKUP_BEFORE_SHARED_STATE_WRITE=true
BACKUP_RETENTION_DAYS=30
`, "defaults");
const preservedBaseEnv = buildPilotBaseEnv({
  defaults,
  unit: parseSystemdEnvironment("Environment=PORT=4177\n", "unit"),
  hardening: parseSystemdEnvironment("Environment=BACKUP_RETENTION_DAYS=91\n", "hardening"),
  existing: parseStrictEnv("BACKUP_RETENTION_DAYS=137\n", "existing"),
});
assert.equal(preservedBaseEnv.get("PORT"), "4177", "safe current unit values must survive the cutover");
assert.equal(preservedBaseEnv.get("BACKUP_RETENTION_DAYS"), "137", "safe existing base-env values must win over defaults/drop-ins");
assert.throws(() => parseStrictEnv("MES_ADMIN_SESSION_SECRET=secret\n", "unsafe"), /forbidden or unclassified key/);
assert.throws(() => parseStrictEnv("MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS=1\n", "unsafe"), /forbidden or unclassified key/);
assert.throws(() => parseStrictEnv("UNREVIEWED_SETTING=value\n", "unsafe"), /forbidden or unclassified key/);
assert.throws(() => buildPilotBaseEnv({
  defaults,
  unit: new Map(),
  existing: new Map([["MES_SHARED_STATE_DIR", "/tmp/pilot-state"]]),
}), /normalized absolute Pilot path/);

assert.match(source.install, /useradd --system --gid mes-pilot /);
assert.match(source.install, /useradd --system --gid mes-pilot-migrator /);
assert.match(source.install, /groupadd --system mes-pilot-data/);
assert.match(source.install, /usermod --gid mes-pilot --groups mes-pilot-data/);
assert.match(source.install, /usermod --gid mes-pilot-migrator --groups mes-pilot-data/);
assert.match(source.install, /usermod .*--lock --shell \/usr\/sbin\/nologin/);
assert.match(source.install, /assert_exact_identity mes-pilot mes-pilot mes-pilot,mes-pilot-data/);
assert.match(source.install, /assert_exact_identity mes-pilot-migrator mes-pilot-migrator mes-pilot-data,mes-pilot-migrator/);
assert.match(source.install, /distinct nonzero numeric IDs/);
assert.match(source.install, /ROOT_SEAL_HELPER="\/usr\/local\/libexec\/mes\/active-bundle\/release-root-seal-verify\.mjs"/);
assert.match(source.install, /"\$ROOT_SEAL_HELPER" release[\s\S]*--release-id="\$ACTIVE_RELEASE_ID"[\s\S]*"\$ROOT_SEAL_HELPER" pointer[\s\S]*"\$ROOT_SEAL_HELPER" release[\s\S]*--release-id="\$candidate_release_id"/);
assert.match(source.install, /SCRIPT_PATH[\s\S]*EXPECTED_SCRIPT[\s\S]*UID cutover must execute from the exact non-active staged candidate/);
assert.match(source.install, /runuser -u mes-stage[\s\S]*"\$PUBLIC_RELEASE_VERIFIER"[\s\S]*--expected-release-id="\$candidate_release_id"/);
assert.match(source.install, /MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD[\s\S]*with-authority-rollout-lock\.sh/);
assert.match(source.install, /pilot-secret-env-rewrite\.mjs" --mode=split-and-rotate/);
assert.match(source.install, /pilot-base-env-migrate\.mjs/);
assert.match(source.install, /mes-pilot-credential-rotation-recovery\.service/);
assert.match(source.install, /mes-pilot-release-recovery-app-credential-recovery\.conf/);
assert.match(source.install, /mes-pilot-release-recovery-writer-credential-recovery\.conf/);
assert.match(source.install, /recover-pilot-credential-rotation\.sh/);
assert.match(source.install, /pilot-credential-rotation-journal\.sh/);
assert.match(source.install, /pilot-runtime-transition-gate\.sh/);
assert.match(source.install, /mes-pilot-writer-transition-recovery\.conf/);
assert.match(source.install, /verify-pilot-runtime-uid-isolation\.sh/);
assert.match(source.install, /rotate-pilot-credentials\.sh"[\s\\]*\n\s*--confirm-rotate-all --trusted-staged-release-id="\$candidate_release_id"/);
assert.match(source.install, /assert_real_directory\(\)[\s\S]*readlink -f/);
assert.match(source.install, /assert_real_file\(\)[\s\S]*readlink -f/);
assert.ok(source.install.includes('find "$path" -xdev \\( ! -type d -a ! -type f \\)'), "mutable tree scan must reject symlinks and special nodes without crossing devices");
assert.ok(source.install.includes('find "$path" -xdev -type f -links +1'), "mutable tree scan must reject multiply-linked files");
assert.match(source.install, /chown_tree_from_to\(\)[\s\S]*find "\$path" -xdev[\s\S]*-exec chown/);
assert.doesNotMatch(source.install, /chown -R/);
assert.match(source.install, /chown_tree_from_to deploy deploy mes-pilot:mes-pilot-data \/srv\/mes\/pilot\/shared-state \/srv\/mes\/pilot\/backups/);
assert.match(source.install, /-m 2750 \/srv\/mes\/pilot\/shared-state/);
assert.match(source.install, /-m 2770 \/srv\/mes\/pilot\/backups/);
assert.match(source.install, /BOOTSTRAP_BIND_SOURCE="\$\{REPO_ROOT\}\/ops\/frontend\/mes-pilot-bootstrap-snapshot-bind\.conf"/);
assert.match(source.install, /cmp -s "\$BOOTSTRAP_BIND_SOURCE" "\$BOOTSTRAP_BIND_DROPIN"/);
assert.match(source.install, /"\$BOOTSTRAP_BIND_DROPIN"[\s\S]*managed_paths=/);
assert.match(source.install, /managed_paths=\([\s\S]*"\$BOOTSTRAP_BIND_DROPIN"/);
assert.match(source.install, /install_root_file_atomically "\$BOOTSTRAP_BIND_SOURCE" "\$BOOTSTRAP_BIND_DROPIN" 0644/);
assert.match(source.install, /chown root:root "\$OPERATIONAL_BOOTSTRAP"[\s\S]*chmod 0444 "\$OPERATIONAL_BOOTSTRAP"/);
assert.match(source.install, /runuser -u mes-pilot -- test -r "\$OPERATIONAL_BOOTSTRAP"/);
assert.match(source.install, /runuser -u deploy -- test -r "\$OPERATIONAL_BOOTSTRAP"[\s\\]*\n\s*\|\| \/usr\/sbin\/runuser -u mes-stage/);
assert.match(source.verify, /assert_systemd_word_property "\$SERVICE" BindReadOnlyPaths[\s\S]*\/srv\/mes\/pilot\/app\/bootstrap-snapshot\.json/);
assert.match(source.verify, /assert_systemd_word_property "\$SERVICE" BindReadOnlyPaths[\s\S]*\/srv\/mes\/pilot\/app\/dist\/bootstrap-snapshot\.json/);
assert.match(source.verify, /runuser -u deploy -- test -r "\$OPERATIONAL_BOOTSTRAP"/);
assert.match(source.verify, /served_bootstrap_sha256[\s\S]*bootstrap-snapshot\.json/);
const mutablePreflight = source.install.indexOf("for path in /srv/mes/pilot/shared-state /srv/mes/pilot/backups /srv/mes/pilot/audit; do assert_real_directory");
const firstMutableStat = source.install.indexOf('shared_mode="$(stat -c %a /srv/mes/pilot/shared-state)"');
const firstMutableInstall = source.install.indexOf("install -d -o mes-pilot -g mes-pilot-data -m 2750 /srv/mes/pilot/shared-state");
const firstMutableChown = source.install.indexOf("chown_tree_from_to deploy deploy mes-pilot:mes-pilot-data");
assert.ok(mutablePreflight >= 0 && mutablePreflight < firstMutableStat && mutablePreflight < firstMutableInstall && mutablePreflight < firstMutableChown,
  "mutable path preflight must precede stat/install/chown");

const bundlePublish = source.install.indexOf('mv -T -- "$runtime_bundle_stage" "$runtime_bundle_target"');
const bundlePointerSwitch = source.install.indexOf('mv -Tf -- "$runtime_pointer_temporary" "$RUNTIME_ACTIVE_BUNDLE"');
const bundlePrevalidation = source.install.lastIndexOf('verify_runtime_bundle_target "$runtime_bundle_target" "$runtime_bundle_id"', bundlePointerSwitch);
const credentialRecoveryUnitInstall = source.install.indexOf('install_root_file_atomically "${SCRIPT_DIR}/mes-pilot-credential-rotation-recovery.service"');
const releaseRecoveryAppDependencyInstall = source.install.indexOf(
  'install_persistent_release_recovery_dependency \\\n  "${SCRIPT_DIR}/mes-pilot-release-recovery-app-credential-recovery.conf"',
);
const releaseRecoveryWriterDependencyInstall = source.install.indexOf(
  'install_persistent_release_recovery_dependency \\\n  "${SCRIPT_DIR}/mes-pilot-release-recovery-writer-credential-recovery.conf"',
);
const earlyGateInstall = source.install.indexOf('install_root_file_atomically "${SCRIPT_DIR}/mes-pilot-runtime-transition-recovery.conf"');
const firstDaemonReload = source.install.indexOf("systemctl daemon-reload");
const identityCreate = source.install.indexOf("getent group mes-pilot >/dev/null");
const quiesceMarker = source.install.indexOf('marker_temporary="$(mktemp "${WRITER_QUIESCE_MARKER}.XXXXXX")"');
const uidJournalMutation = source.install.indexOf("\nprepare_uid_cutover_journal\n", identityCreate);
assert.ok(bundlePublish >= 0 && bundlePublish < bundlePrevalidation && bundlePrevalidation < bundlePointerSwitch
  && bundlePointerSwitch < credentialRecoveryUnitInstall
  && credentialRecoveryUnitInstall < releaseRecoveryAppDependencyInstall
  && releaseRecoveryAppDependencyInstall < releaseRecoveryWriterDependencyInstall
  && releaseRecoveryWriterDependencyInstall < earlyGateInstall
  && earlyGateInstall < firstDaemonReload && firstDaemonReload < identityCreate
  && identityCreate < quiesceMarker && quiesceMarker < uidJournalMutation,
"the credential unit and both persistent release-recovery dependency bridges must publish before the first daemon-reload, identities and every quiesce/journal mutation");
assert.match(source.install, /ensure_root_systemd_dropin_directory\(\)[\s\S]*readlink -f -- "\$directory"[\s\S]*stat -c '%u:%g:%a' "\$directory"[\s\S]*0:0:755/);
assert.match(source.install, /install_persistent_release_recovery_dependency\(\)[\s\S]*if \[\[ -e "\$target" \|\| -L "\$target" \]\][\s\S]*stat -c '%u:%g:%a:%h' "\$target"[\s\S]*cmp -s "\$source" "\$target"/,
  "an existing dependency bridge must be exact and may not be silently repaired or replaced");
assert.match(source.install, /install_persistent_release_recovery_dependency\(\)[\s\S]*install_root_file_atomically "\$source" "\$target" 0644[\s\S]*Installed release-recovery dependency drop-in failed verification/,
  "a missing dependency bridge must be atomically installed and re-verified");

// Model every durable power-loss prefix before systemd publication. Any edge
// visible after reboot has its required service file, and no identity/journal
// mutation is reachable until both edges have been published together.
const releaseRecoveryBridgePrefixes = [
  { credentialService: false, appEdge: false, writerEdge: false, daemonReload: false, identityMutation: false },
  { credentialService: true, appEdge: false, writerEdge: false, daemonReload: false, identityMutation: false },
  { credentialService: true, appEdge: true, writerEdge: false, daemonReload: false, identityMutation: false },
  { credentialService: true, appEdge: true, writerEdge: true, daemonReload: false, identityMutation: false },
  { credentialService: true, appEdge: true, writerEdge: true, daemonReload: true, identityMutation: false },
  { credentialService: true, appEdge: true, writerEdge: true, daemonReload: true, identityMutation: true },
];
for (const [index, prefix] of releaseRecoveryBridgePrefixes.entries()) {
  if (prefix.appEdge || prefix.writerEdge) assert(prefix.credentialService, `bridge prefix ${index} exposes a missing required unit`);
  if (prefix.daemonReload) assert(prefix.appEdge && prefix.writerEdge, `bridge prefix ${index} publishes an incomplete graph`);
  if (prefix.identityMutation) assert(prefix.daemonReload, `bridge prefix ${index} mutates identity before graph publication`);
}
const managedPathsStart = source.install.indexOf("managed_paths=(");
const managedPathsEnd = source.install.indexOf("\n)\nfor path in \"${managed_paths[@]}\"", managedPathsStart);
assert(managedPathsStart >= 0 && managedPathsEnd > managedPathsStart);
assert.doesNotMatch(source.install.slice(managedPathsStart, managedPathsEnd), /RELEASE_RECOVERY_(?:APP|WRITER)_DEPENDENCY_DROPIN/,
  "persistent release-recovery bridges must survive legacy rollback and cutover rollback");
assert.match(source.install, /RUNTIME_BUNDLES_ROOT="\$\{LIBEXEC_ROOT\}\/runtime-security-bundles"/);
assert.match(source.install, /RUNTIME_ACTIVE_BUNDLE="\$\{LIBEXEC_ROOT\}\/runtime-security-active"/);
assert.match(source.install, /runtime-security-bundles\/\$\{runtime_bundle_id\}/);
assert.match(source.install, /LC_ALL=C sha256sum "\$\{RUNTIME_BUNDLE_FILES\[@\]\}" > "\$RUNTIME_BUNDLE_MANIFEST"/);
assert.match(source.install, /ln -s "runtime-security-bundles\/\$\{runtime_bundle_id\}"[\s\S]*mv -Tf -- "\$runtime_pointer_temporary" "\$RUNTIME_ACTIVE_BUNDLE"[\s\S]*sync -f "\$LIBEXEC_ROOT"/);
assert.match(source.install, /runtime_dispatch_status[\s\S]*runtime_pointer_rollback[\s\S]*mv -Tf -- "\$runtime_pointer_rollback" "\$RUNTIME_ACTIVE_BUNDLE"[\s\S]*previous pointer state was restored/);
assert.doesNotMatch(source.install, /install .*\/usr\/local\/libexec\/mes\/(?:pilot-root-identity-lock|pilot-runtime-transition-gate|pilot-credential-rotation-journal|recover-pilot|pilot-check-postgres-credential)/,
  "runtime helpers must never be projected or rewritten one-by-one");
assert.match(source.install, /for unit in mes-pilot-domain-migrate\.service mes-pilot-domain-import\.service mes-pilot-domain-snapshot-sync\.service; do[\s\S]*mes-pilot-writer-transition-recovery\.conf/);
assert.match(source.install, /pilot_stop_running_consumer mes-pilot-domain-snapshot-sync\.service/);
assert.match(source.install, /set_uid_cutover_journal_phase committed[\s\S]*rotate-pilot-credentials\.sh[\s\S]*restore_timer_state "\$timer_was_active"[\s\S]*clear_uid_cutover_journal[\s\S]*rm -f -- "\$WRITER_QUIESCE_MARKER"/);

assert.match(source.rotate, /systemctl mask --runtime mes-pilot-domain-migrate\.service mes-pilot-domain-import\.service mes-pilot-domain-snapshot-sync\.service/);
assert.match(source.rotate, /supports only the journaled mes_pilot\/mes_app\/mes_migrator contract/);
assert.match(source.rotate, /ROOT_SEAL_HELPER="\/usr\/local\/libexec\/mes\/active-bundle\/release-root-seal-verify\.mjs"/);
assert.match(source.rotate, /"\$ROOT_SEAL_HELPER" release[\s\S]*"\$ROOT_SEAL_HELPER" pointer/);
assert.match(source.rotate, /Non-active rotation script requires an exact sealed staged release id/);
assert.match(source.rotate, /for unit in mes-pilot-domain-migrate\.service mes-pilot-domain-import\.service; do[\s\S]*--property=MainPID[\s\S]*has a live MainPID/);
assert.doesNotMatch(source.rotate, /systemctl is-active --quiet "\$unit"/,
  "queued direct-writer requesters must be classified by MainPID, not cancelled as active units");
assert.match(source.rotate, /pilot_stop_running_consumer mes-pilot-domain-migrate\.service[\s\S]*pilot_stop_running_consumer mes-pilot-domain-import\.service[\s\S]*pilot_stop_running_consumer mes-pilot-domain-snapshot-sync\.service[\s\S]*pilot_stop_running_consumer "\$SERVICE"/);
assert.match(source.rotate, /BEGIN;[\s\S]*ALTER ROLE[\s\S]*COMMIT;/);
assert.match(source.rotate, /MES_ROTATE_APP_PASSWORD[\s\S]*runuser -u postgres --preserve-environment/);
assert.doesNotMatch(source.rotate, /--set=(?:app|migrator)_password=/, "passwords must not appear in psql argv");
assert.match(source.rotate, /write_root_env_atomically "\$DOMAIN_ENV" DATABASE_URL/);
assert.match(source.rotate, /pilot-secret-env-rewrite\.mjs" --mode=rotate-sessions/);
assert.match(source.rotate, /rollback_rotation/);
assert.match(source.rotate, /wait_for_health/);
assert.match(source.rotate, /verify-pilot-runtime-uid-isolation\.sh/);
assert.match(source.rotate, /pilot_write_app_verification_intent[\s\S]*systemctl start "\$SERVICE"[\s\S]*pilot_clear_app_verification_intent/);
assert.match(source.rotate, /restore_timer_state "\$timer_was_active"[\s\S]*pilot_journal_set_phase "\$BACKUP_DIR" committed/);
assert.match(source.rotate, /pilot_journal_prepare[\s\S]*roles-updated[\s\S]*env-updated[\s\S]*sessions-updated[\s\S]*verified[\s\S]*committed/);
assert.match(source.rotate, /journal_recovery_pending[\s\S]*recover_interrupted_rotation/);
assert.match(source.credentialRecoveryUnit, /^Before=mes-pilot\.service .*mes-pilot-domain-snapshot-sync\.service$/m);
assert.doesNotMatch(source.credentialRecoveryUnit, /mes-pilot-domain-snapshot-sync\.timer/);
assert.doesNotMatch(source.syncTimer, /mes-pilot-credential-rotation-recovery\.service/,
  "timer must not depend on the recovery service that synchronously restores it");
assert.doesNotMatch(source.credentialRecoveryUnit, /^ConditionPathExists=/m, "recovery trust check must execute before every Pilot start");
assert.match(source.credentialRecovery, /PILOT_IDENTITY_LOCK_BUSY[\s\S]*pilot_validate_app_verification_intent[\s\S]*PILOT_IDENTITY_LOCK_UNSAFE/);
assert.match(source.credentialRecovery, /pilot_journal_restore_files/);
assert.match(source.credentialRecovery, /pilot_stop_running_consumer mes-pilot-domain-migrate\.service[\s\S]*pilot_stop_running_consumer mes-pilot-domain-import\.service[\s\S]*pilot_stop_running_consumer mes-pilot-domain-snapshot-sync\.service[\s\S]*pilot_stop_running_consumer mes-pilot\.service/);
assert.doesNotMatch(source.credentialRecovery, /systemctl stop mes-pilot-domain-snapshot-sync\.service mes-pilot\.service/);
assert.match(source.uidRecovery, /pilot_stop_running_consumer mes-pilot-domain-migrate\.service[\s\S]*pilot_stop_running_consumer mes-pilot-domain-import\.service[\s\S]*pilot_stop_running_consumer mes-pilot-domain-snapshot-sync\.service[\s\S]*pilot_stop_running_consumer mes-pilot\.service/);
assert.match(source.uidRecovery, /required_managed_paths=\([\s\S]*legacy_optional_managed_paths=\([\s\S]*legacy_manifest_seen[\s\S]*Legacy UID-cutover manifest omitted/,
  "bundle recovery must accept new journals while requiring complete pre-bundle helper manifests");
assert.match(source.credentialRecovery, /restore_timer_state "\$timer_was_active"[\s\S]*pilot_journal_clear/);
assert.match(source.uidRecovery, /restore_timer_state "\$marker_timer_was_active"[\s\S]*clear_journal/);

assert.match(source.rootLock, /exec \/usr\/bin\/python3 -I -S -c/);
assert.match(source.rootLock, /fcntl\.flock\(fd, fcntl\.LOCK_EX \| fcntl\.LOCK_NB\)/);
assert.match(source.rootLock, /if fd == 8:[\s\S]*os\.set_inheritable\(fd, True\)[\s\S]*os\.dup2\(fd, 8, inheritable=True\)/);
assert.match(source.rootLock, /environment\[result_key\] = "busy"[\s\S]*os\.execve[\s\S]*environment\[result_key\] = "held"[\s\S]*os\.execve/);
assert.doesNotMatch(source.rootLock, /exec 9/);
assert.match(source.authorityLock, /adopt_flock_path_fd[\s\S]*\/usr\/bin\/flock --exclusive --nonblock[\s\S]*"\$lock_file"/);
assert.match(source.rootLock, /PILOT_IDENTITY_LOCK_BUSY=75[\s\S]*PILOT_IDENTITY_LOCK_UNSAFE=76/);
assert.match(source.rootLock, /acquire_result[\s\S]*held\)[\s\S]*busy\)/);
assert.match(source.rootLock, /\/proc\/\$\{owner_pid\}\/fd\/8/);
assert.match(source.rootLock, /\/proc\/\$\{owner_pid\}\/fdinfo\/8/);
assert.doesNotMatch(source.rootLock, /\/proc\/locks/,
  "lock proof must remain available when ProcSubset=pid hides global proc files");
assert.match(source.transitionGate, /--consumer=writer[\s\S]*PILOT_IDENTITY_LOCK_BUSY/);
assert.match(source.transitionGate, /0\)\s+pilot_remove_stale_app_verification_intent[\s\S]*exit 0/,
  "a free-lock gate must remove stale verification intent even without any journal");
assert.match(source.transitionGate, /"\$consumer" == app[\s\S]*pilot_validate_app_verification_intent/);
assert.match(source.appTransitionDropin, /--consumer=app/);
assert.match(source.writerTransitionDropin, /--consumer=writer/);
assert.match(source.appTransitionDropin, /pilot-runtime-security-dispatch pilot-runtime-transition-gate\.sh/);
assert.match(source.writerTransitionDropin, /pilot-runtime-security-dispatch pilot-runtime-transition-gate\.sh/);
assert.match(source.credentialRecoveryUnit, /with-pilot-release-authority-lock\.sh --operation=runtime-security-recovery --busy-policy=app-intent[\s\S]*pilot-runtime-security-dispatch recover-pilot-credential-rotation\.sh; \/usr\/local\/libexec\/mes\/pilot-runtime-security-dispatch recover-pilot-uid-cutover\.sh/);
assert.equal((source.credentialRecoveryUnit.match(/^ExecStart=/gm) || []).length, 1,
  "both recovery passes must be serialized by one authority wrapper invocation");
assert.doesNotMatch(source.credentialRecoveryUnit, /^(?:Requires|After)=.*mes-pilot-release-recovery-/m,
  "runtime credential recovery must not form a dependency cycle with release recovery");
for (const recoverySource of [source.credentialRecovery, source.uidRecovery]) {
  assert.match(recoverySource, /MES_RELEASE_AUTHORITY_LOCK_HELD[\s\S]*MES_RELEASE_AUTHORITY_LOCK_FD[\s\S]*\/proc\/\$\$\/fd\/9/);
  assert.match(recoverySource, /\$3 == "FLOCK"[\s\S]*\$5 == "WRITE"[\s\S]*\$6 == owner_pid/);
  assert.doesNotMatch(recoverySource, /flock -n 9/,
    "recovery must inspect inherited fd9 without rewriting its recorded owner PID");
}
assert.match(source.runtimeDispatcher, /runtime-security-bundles\/\(\[0-9a-f\]\{64\}\)/);
assert.match(source.runtimeDispatcher, /sha256sum --check --strict --status/);
assert.match(source.runtimeDispatcher, /bundle membership differs from the ABI-v1 manifest/);
assert.match(source.runtimeDispatcher, /MES_PILOT_RUNTIME_SECURITY_BUNDLE_DIR/);
assert.match(source.runtimeDispatcher, /caller_name="\$\(\/usr\/bin\/id -un\)"[\s\S]*mes-pilot\)[\s\S]*\/usr\/bin\/id -u mes-pilot[\s\S]*--variable=DATABASE_URL[\s\S]*--expected-role=mes_app/);
assert.match(source.runtimeDispatcher, /mes-pilot-migrator\)[\s\S]*\/usr\/bin\/id -u mes-pilot-migrator[\s\S]*--variable=MES_DOMAIN_MIGRATOR_DATABASE_URL[\s\S]*--expected-role=mes_migrator/);
assert.match(source.runtimeDispatcher, /elif \[\[ \$\{EUID\} -ne 0 \]\]; then[\s\S]*root execution is required/,
  "all non-credential recovery and gate artifacts must remain root-only");

// Executable crash-prefix model for the root publication protocol. It covers
// both first install and conversion from the old per-file projection. At every
// boundary a bridge sees either the complete old helper set or one complete,
// digest-addressed bundle selected by a relative atomic symlink.
const runtimeArtifactNames = [
  "check-postgres-credential.mjs",
  "pilot-credential-rotation-journal.sh",
  "pilot-root-identity-lock.sh",
  "pilot-runtime-transition-gate.sh",
  "recover-pilot-credential-rotation.sh",
  "recover-pilot-uid-cutover.sh",
];
const bridgeNames = ["recovery.service", "app.conf", "migrate.conf", "import.conf", "sync.conf"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function publishModelBundle(libexecRoot, label) {
  const bundles = join(libexecRoot, "runtime-security-bundles");
  await mkdir(bundles, { recursive: true });
  const stage = await mkdtemp(join(bundles, ".prepare."));
  const rows = [];
  for (const name of runtimeArtifactNames) {
    const body = `${label}:${name}\n`;
    await writeFile(join(stage, name), body, { mode: 0o555 });
    rows.push(`${sha256(body)}  ${name}`);
  }
  const manifest = `${rows.join("\n")}\n`;
  await writeFile(join(stage, "runtime-security-manifest.sha256"), manifest, { mode: 0o444 });
  const id = sha256(manifest);
  const target = join(bundles, id);
  await rename(stage, target);
  return { id, label, target };
}

async function switchModelPointer(libexecRoot, bundleId) {
  const temporary = join(libexecRoot, `runtime-security-active.new.${bundleId.slice(0, 8)}`);
  await symlink(`runtime-security-bundles/${bundleId}`, temporary);
  await rename(temporary, join(libexecRoot, "runtime-security-active"));
}

async function installModelFileAtomically(path, body) {
  const temporary = `${path}.install`;
  await writeFile(temporary, body);
  await rename(temporary, path);
}

async function verifyModelBundle(target, id) {
  const manifest = await readFile(join(target, "runtime-security-manifest.sha256"), "utf8");
  assert.equal(sha256(manifest), id);
  assert.deepEqual((await readdir(target)).sort(), [...runtimeArtifactNames, "runtime-security-manifest.sha256"].sort());
  const rows = new Map(manifest.trim().split("\n").map((row) => {
    const match = row.match(/^([0-9a-f]{64})  ([a-z0-9.-]+)$/);
    assert.ok(match);
    return [match[2], match[1]];
  }));
  for (const name of runtimeArtifactNames) {
    const body = await readFile(join(target, name), "utf8");
    assert.equal(sha256(body), rows.get(name));
  }
}

async function verifyModelPrefix(libexecRoot, hasLegacyProjection) {
  const dispatcherPath = join(libexecRoot, "pilot-runtime-security-dispatch");
  const activePath = join(libexecRoot, "runtime-security-active");
  let activeBundle = null;
  try {
    const link = await readlink(activePath);
    assert.match(link, /^runtime-security-bundles\/[0-9a-f]{64}$/);
    const id = link.slice(link.lastIndexOf("/") + 1);
    const target = join(libexecRoot, link);
    await verifyModelBundle(target, id);
    activeBundle = target;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  for (const name of bridgeNames) {
    try {
      const bridge = await readFile(join(libexecRoot, name), "utf8");
      if (bridge === `dispatcher:${name}\n`) {
        assert.ok(activeBundle, "a dispatcher bridge must never precede a complete active bundle");
        assert.equal(await readFile(dispatcherPath, "utf8"), "stable-dispatcher-v1\n");
      } else {
        assert.equal(bridge, `direct-old:${name}\n`);
        assert.ok(hasLegacyProjection);
        for (const artifact of runtimeArtifactNames) {
          assert.equal(await readFile(join(libexecRoot, `old-${artifact}`), "utf8"), `old:${artifact}\n`);
        }
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

// Corrupt content-addressed targets are rejected before publication, and a
// synthetic post-switch dispatcher failure restores the previously verified
// relative pointer atomically.
{
  const modelRoot = await mkdtemp(join(tmpdir(), "mes-runtime-bundle-corrupt-"));
  try {
    const oldBundle = await publishModelBundle(modelRoot, "old");
    await installModelFileAtomically(join(modelRoot, "pilot-runtime-security-dispatch"), "stable-dispatcher-v1\n");
    await switchModelPointer(modelRoot, oldBundle.id);
    await verifyModelPrefix(modelRoot, false);
    const corruptBundle = await publishModelBundle(modelRoot, "corrupt");
    await chmod(join(corruptBundle.target, runtimeArtifactNames[0]), 0o755);
    await writeFile(join(corruptBundle.target, runtimeArtifactNames[0]), "tampered\n");
    await assert.rejects(verifyModelBundle(corruptBundle.target, corruptBundle.id));

    const nextBundle = await publishModelBundle(modelRoot, "next");
    const oldLink = await readlink(join(modelRoot, "runtime-security-active"));
    await switchModelPointer(modelRoot, nextBundle.id);
    const syntheticDispatcherStatus = 1;
    if (syntheticDispatcherStatus !== 0) {
      const rollbackPointer = join(modelRoot, "runtime-security-active.rollback");
      await symlink(oldLink, rollbackPointer);
      await rename(rollbackPointer, join(modelRoot, "runtime-security-active"));
    }
    assert.equal(await readlink(join(modelRoot, "runtime-security-active")), oldLink);
    await verifyModelPrefix(modelRoot, false);
  } finally {
    await rm(modelRoot, { recursive: true, force: true });
  }
}

for (const hasLegacyProjection of [false, true]) {
  // 0=new bundle inert, 1=dispatcher complete, 2=pointer atomically switched,
  // then one boundary for each independently atomic systemd bridge.
  for (let boundary = 0; boundary <= 2 + bridgeNames.length; boundary += 1) {
    const modelRoot = await mkdtemp(join(tmpdir(), "mes-runtime-bundle-prefix-"));
    try {
      if (hasLegacyProjection) {
        for (const artifact of runtimeArtifactNames) {
          await writeFile(join(modelRoot, `old-${artifact}`), `old:${artifact}\n`);
        }
        for (const name of bridgeNames) await writeFile(join(modelRoot, name), `direct-old:${name}\n`);
      }
      const next = await publishModelBundle(modelRoot, "new");
      if (boundary >= 1) await installModelFileAtomically(join(modelRoot, "pilot-runtime-security-dispatch"), "stable-dispatcher-v1\n");
      if (boundary >= 2) await switchModelPointer(modelRoot, next.id);
      for (let index = 0; index < bridgeNames.length && boundary >= 3 + index; index += 1) {
        await installModelFileAtomically(join(modelRoot, bridgeNames[index]), `dispatcher:${bridgeNames[index]}\n`);
      }
      await verifyModelPrefix(modelRoot, hasLegacyProjection);
    } finally {
      await rm(modelRoot, { recursive: true, force: true });
    }
  }
}

assert.match(source.verify, /runuser -u deploy -- \/bin\/cat "\/proc\/\$\{main_pid\}\/environ"/);
assert.match(source.verify, /grep -zq '\^MES_DOMAIN_MIGRATOR_DATABASE_URL='/);
assert.match(source.verify, /assert_exact_keys "\$DOMAIN_ENV" DATABASE_URL/);
assert.match(source.verify, /assert_exact_keys "\$MIGRATOR_ENV" MES_DOMAIN_MIGRATOR_DATABASE_URL/);
assert.match(source.verify, /assert_locked_identity mes-pilot mes-pilot mes-pilot,mes-pilot-data/);
assert.match(source.verify, /assert_locked_identity mes-pilot-migrator mes-pilot-migrator mes-pilot-data,mes-pilot-migrator/);
assert.match(source.verify, /runuser -u mes-pilot-migrator -- test -r "\$state_file"/);
assert.match(source.verify, /runuser -u mes-pilot-migrator -- test -w \/srv\/mes\/pilot\/backups/);
assert.match(source.verify, /runuser -u mes-pilot-migrator -- test -w "\$import_export_file"/);
assert.match(source.verify, /grep -Eq '\^MES_ENABLE_\.\*COMMAND'/);
assert.match(source.verify, /--require-command-flags-off/);
assert.match(source.verify, /grep -ziEq '\^MES_ENABLE_\[\^=\]\*COMMAND/);
assert.match(source.verify, /Environment=.*MES_\(ADMIN\|PUBLIC\|EMPLOYEE\).*\(PASSWORD_HASH\|SESSION_SECRET\)=/);
assert.match(source.verify, /ROOT_SEAL_HELPER="\/usr\/local\/libexec\/mes\/active-bundle\/release-root-seal-verify\.mjs"/);
assert.match(source.verify, /"\$ROOT_SEAL_HELPER" release[\s\S]*"\$ROOT_SEAL_HELPER" pointer/);
assert.match(source.verify, /RUNTIME_DISPATCHER="\/usr\/local\/libexec\/mes\/pilot-runtime-security-dispatch"[\s\S]*"\$RUNTIME_DISPATCHER" pilot-root-identity-lock\.sh/);
assert.match(source.verify, /05-runtime-transition-recovery\.conf[\s\S]*--consumer=writer/);
assert.match(source.verify, /assert_release_recovery_dependency_dropin "\$RELEASE_RECOVERY_APP_DEPENDENCY_DROPIN"/);
assert.match(source.verify, /assert_release_recovery_dependency_dropin "\$RELEASE_RECOVERY_WRITER_DEPENDENCY_DROPIN"/);
assert.match(source.verify, /systemctl show mes-pilot-credential-rotation-recovery\.service --property=LoadState --value/);
assert.match(source.verify, /for release_recovery_unit in mes-pilot-release-recovery-app\.service mes-pilot-release-recovery-writer\.service; do[\s\S]*assert_systemd_word_property "\$release_recovery_unit" Requires mes-pilot-credential-rotation-recovery\.service[\s\S]*assert_systemd_word_property "\$release_recovery_unit" After mes-pilot-credential-rotation-recovery\.service/,
  "live verification must prove both effective release-recovery dependency graphs after daemon-reload");

assert.match(source.runtimeCheck, /^User=mes-pilot$/m);
assert.match(source.runtimeCheck, /pilot-runtime-security-dispatch check-postgres-credential\.mjs --variable=DATABASE_URL --expected-role=mes_app/);
assert.match(source.migratorCheck, /^User=mes-pilot-migrator$/m);
assert.match(source.migratorCheck, /pilot-runtime-security-dispatch check-postgres-credential\.mjs --variable=MES_DOMAIN_MIGRATOR_DATABASE_URL --expected-role=mes_migrator/);
assert.match(source.checkCredential, /SELECT current_user AS role/);
assert.match(source.checkCredential, /\/srv\/mes\/pilot\/app\/node_modules\/postgres\/src\/index\.js/);
assert.doesNotMatch(source.checkCredential, /console\.log\([^\n]*(?:databaseUrl|process\.env)/);
assert.match(source.systemDomainsImport, /process\.env\.MES_DOMAIN_MIGRATOR_DATABASE_URL/);

for (const path of [paths.provision, paths.install, paths.rotate, paths.verify, paths.credentialJournal, paths.credentialRecovery,
  paths.rootLock, paths.transitionGate, paths.runtimeDispatcher, paths.uidRecovery]) {
  execFileSync("bash", ["-n", new URL(path, root).pathname], { stdio: "pipe" });
  const metadata = await stat(new URL(path, root));
  assert.ok((metadata.mode & 0o111) !== 0, `${path} must be executable`);
}

// Real non-root execution must fail before filesystem dispatch for both an
// otherwise well-shaped credential check and every root-only helper. The two
// unit/static assertions above prove the only admitted service identities and
// their exact variable/role argument tuples.
if (typeof process.getuid === "function" && process.getuid() !== 0) {
  const dispatcherPath = new URL(paths.runtimeDispatcher, root).pathname;
  for (const args of [
    ["check-postgres-credential.mjs", "--variable=DATABASE_URL", "--expected-role=mes_app"],
    ["pilot-root-identity-lock.sh"],
  ]) {
    const denied = spawnSync("bash", [dispatcherPath, ...args], { encoding: "utf8" });
    assert.equal(denied.status, 76, `non-service user must be denied for ${args[0]}`);
  }
}

// Execute the status classifier without touching /run: a mocked unsafe path
// must remain 76, while an actual flock conflict status must map only to 75.
execFileSync("bash", ["-c", `
  set +e
  source "$1"
  pilot_classify_identity_flock_status 1 >/dev/null 2>&1; test $? -eq 75 || exit 20
  pilot_identity_lock_unsafe test >/dev/null 2>&1; test $? -eq 76 || exit 21
  pilot_assert_root_identity_lock_path() { return 76; }
  pilot_open_root_identity_lock >/dev/null 2>&1; test $? -eq 76 || exit 22
  fixture="$(mktemp)"
  printf 'pos:\t0\nflags:\t0100002\nlock:\t1: FLOCK ADVISORY WRITE 4242 00:2a:777 0 EOF\n' > "$fixture"
  pilot_fdinfo_contains_identity_flock "$fixture" 4242 777 || exit 23
  pilot_fdinfo_contains_identity_flock "$fixture" 4243 777 && exit 24
  rm -f "$fixture"
`, "qa", new URL(paths.rootLock, root).pathname], { stdio: "pipe" });

// On Linux CI, prove the fd invariant with real kernel flocks: one process owns
// authority fd9 and identity fd8 simultaneously; both competitors are blocked;
// releasing fd8 does not release fd9.
if (process.platform === "linux" && spawnSync("flock", ["--version"], { stdio: "ignore" }).status === 0) {
  const lockDir = await mkdtemp(join(tmpdir(), "mes-dual-flock-qa-"));
  try {
    execFileSync("bash", ["-c", `
      set -e
      : > "$1/authority"; : > "$1/identity"
      exec 9>"$1/authority"; flock -n 9
      exec 8>"$1/identity"; flock -n 8
      ! flock -n "$1/authority" -c true
      ! flock -n "$1/identity" -c true
      flock -u 8; exec 8>&-
      flock -n "$1/identity" -c true
      ! flock -n "$1/authority" -c true
      flock -u 9; exec 9>&-
      flock -n "$1/authority" -c true
    `, "qa", lockDir], { stdio: "pipe" });
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
}
for (const path of [paths.rewrite, paths.baseEnv, paths.checkCredential, paths.migrationRunner, paths.shiftAuthorityReconcile]) {
  execFileSync(process.execPath, ["--check", new URL(path, root).pathname], { stdio: "pipe" });
}

await import("./pilot-credential-rotation-crash-qa.mjs");

console.log("Pilot runtime UID isolation QA: OK (static contract plus executable live adversarial verifier)");
