import { readFile } from "node:fs/promises";

function assert(value, message) { if (!value) throw new Error(message); }
const source = await readFile(new URL("./release-rollback.mjs", import.meta.url), "utf8");
const activateSource = await readFile(new URL("./release-activate.mjs", import.meta.url), "utf8");
const stageSource = await readFile(new URL("./release-stage.mjs", import.meta.url), "utf8");
const marker = JSON.parse(await readFile(new URL("../ops/postgres/specifications2-server-command-compatibility.json", import.meta.url), "utf8"));
const activateWorkOrders = await readFile(new URL("../ops/postgres/activate-specifications2-work-orders.sh", import.meta.url), "utf8");
const deactivateWorkOrders = await readFile(new URL("../ops/postgres/deactivate-specifications2-work-orders.sh", import.meta.url), "utf8");
const activatePublication = await readFile(new URL("../ops/postgres/activate-specifications2-publication.sh", import.meta.url), "utf8");
const deactivatePublication = await readFile(new URL("../ops/postgres/deactivate-specifications2-publication.sh", import.meta.url), "utf8");
const rolloutReadinessPolicy = await readFile(new URL("./specifications2-rollout-readiness-policy.mjs", import.meta.url), "utf8");
const packageSource = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

assert(source.includes('targetMode === "legacy-baseline" ? record?.legacyBaseline : record?.previous'), "Rollback must select previous or the pinned legacy baseline explicitly");
assert(source.includes('remote: "mes-line-root"') && activateSource.includes('remote: "mes-line-root"'), "Activation and rollback must use the approved root SSH boundary by default");
assert(
  activateSource.includes('FIXED_ROOT_ACTIVATE_RUNNER = "/usr/local/libexec/mes/active-bundle/release-activate-root.mjs"')
    && source.includes('FIXED_ROOT_ROLLBACK_RUNNER = "/usr/local/libexec/mes/active-bundle/release-rollback-root.mjs"'),
  "Release switches must dispatch only to fixed root-owned runners",
);
assert(!activateSource.includes("function remoteBashArgs") && !source.includes("function remoteBashArgs"), "Mutable local release shell text must never be streamed to root over SSH");
assert(activateSource.includes("await assertFixedRootRunner(FIXED_ROOT_ACTIVATE_RUNNER)") && source.includes("await assertFixedRootRunner(FIXED_ROOT_ROLLBACK_RUNNER)"), "Each fixed runner must verify uid, exact path and its root-owned seal before the embedded shell runs");
assert(stageSource.includes('sourceRelativePath: "scripts/release-activate.mjs"') && stageSource.includes("FIXED_ROOT_ACTIVATE_RUNNER"), "Staging must install the activation runner from the exact published Git blob");
assert(stageSource.includes('sourceRelativePath: "scripts/release-rollback.mjs"') && stageSource.includes("FIXED_ROOT_ROLLBACK_RUNNER"), "Staging must install the rollback runner from the exact published Git blob");
assert(source.includes('root_seal_helper="/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs"') && activateSource.includes('root_seal_helper="/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs"'), "Every release switch must start from the atomically selected root-owned seal verifier");
assert(source.indexOf('/usr/bin/node "$root_seal_helper" release') < source.indexOf('run_fixed_public_verifier \\\n  --app-root="$current_target"'), "Rollback must recursively seal the current release before executing the fixed public verifier");
assert(source.indexOf('--app="$previous_target" >/dev/null') < source.indexOf('restore_verification="$(run_fixed_public_verifier --app-root="$previous_target"'), "Rollback must recursively seal the selected release before executing the fixed public verifier");
assert(!source.includes("run_candidate_node") && !activateSource.includes("run_candidate_node"), "Release switches must never execute a release-provided verifier");
assert(activateSource.indexOf('/usr/bin/node "$root_seal_helper" release') < activateSource.indexOf('manifest_verification="$(run_fixed_public_verifier'), "Activation must recursively seal the candidate before fixed public verification");
assert(activateSource.indexOf('--app="$previous_target" >/dev/null') < activateSource.indexOf('previous_manifest_verification="$(run_fixed_public_verifier'), "Activation must seal the currently serving release before fixed public verification");
assert(activateSource.includes('refusing automatic rollback to an unsealed previous release') && activateSource.includes('--pointer="$rollback_pointer_path"'), "Automatic activation rollback must fail closed and verify its exact temporary pointer");
assert(source.includes('Rollback recovery is fail-closed') && source.includes('--pointer="$rolled_pointer"'), "Failed manual rollback recovery must not restart an unsealed prior runtime");
assert(source.includes('["previous", "legacy-baseline"]'), "Rollback CLI must allow only the two reviewed target modes");
assert(source.includes('target !== `${contour.releasesPath}/${releaseId}/app`'), "Rollback must reject targets outside the exact contour release path");
assert(source.includes('selected.kind !== "release-pointer"') && source.includes("unmanifested legacy directories are ineligible"), "Rollback must fail closed for historical legacy directories that have no new-inode attestation");
assert(activateSource.includes("unattested_legacy_directory_ineligible") && activateSource.includes("pinned, root-reinoded and attested immutable legacy release pointer"), "Activation must preserve rollback only through the attested immutable legacy release pointer");
assert(source.includes('actual_current') && source.includes('Active runtime does not match active-release.json'), "Rollback must bind the active symlink to the recorded release before switching it");
assert(source.includes("release-verify.mjs") && source.includes("--expected-release-id"), "Rollback must verify a previous commit-derived release before activating it");
assert(source.includes("restore_current") && source.includes("trap 'code=$?; restore_current"), "A failed rollback must restore the current release pointer");
assert(source.includes('check_health "http://localhost:$port/healthz"') && source.includes('check_health "$public_health_url"'), "Rollback must pass local and public health checks");
assert(source.includes('health?.version !== expectedVersion') && activateSource.includes('health?.version !== expectedVersion'), "Activation and rollback health checks must prove the exact selected release version");
for (const [name, releaseSwitch, currentNeedle, targetNeedle] of [
  ["activation", activateSource, '"$previous_target" "$previous_release_path/release-manifest.json"', '"$release_app_path" "$release_path/release-manifest.json"'],
  ["rollback", source, '"$current_target" "$current_release_path/release-manifest.json"', '"$previous_target" "$previous_release_path/release-manifest.json"'],
]) {
  const journalPrepare = releaseSwitch.indexOf('"$journal_helper" prepare');
  const mirrorInvariant = releaseSwitch.indexOf('target_bootstrap_sha="$(verify_pilot_bootstrap_recovery_invariant');
  const pointerSwitch = releaseSwitch.indexOf('phase=pointer-switched', journalPrepare);
  const restart = releaseSwitch.indexOf('systemctl restart "$service"', pointerSwitch);
  const servedDigest = releaseSwitch.indexOf('check_served_bootstrap "$target_bootstrap_sha"', restart);
  assert(mirrorInvariant >= 0 && journalPrepare > mirrorInvariant && pointerSwitch > journalPrepare
    && restart > pointerSwitch && servedDigest > restart,
  `${name} must prove the immutable bootstrap invariant before journaling or pointer mutation and verify served bytes after restart`);
  assert(releaseSwitch.includes(currentNeedle) && releaseSwitch.includes(targetNeedle)
    && releaseSwitch.includes('"$legacy_bootstrap_target" "$legacy_bootstrap_manifest"'),
  `${name} bootstrap invariant must cover current, target and pinned legacy releases`);
  assert(releaseSwitch.includes('descriptor.operationalPath !== "/srv/mes/pilot/runtime/bootstrap-snapshot.json"'),
    `${name} must retain the exact schema-v3 operationalPath while treating bootstrap-recovery as implementation state`);
  const invariantStart = releaseSwitch.indexOf("verify_pilot_bootstrap_recovery_invariant() {");
  const invariantEnd = releaseSwitch.indexOf("\n}\n\nclear_release_app_verification_intent", invariantStart);
  const invariantFunction = releaseSwitch.slice(invariantStart, invariantEnd);
  assert(invariantStart >= 0 && invariantEnd > invariantStart);
  assert(invariantFunction.includes('[ "$current_sha" = "$target_sha" ] && [ "$current_sha" = "$legacy_sha" ]'));
  assert(!/(?:install|cp|mv|rm|writeFile|rename)[^\n]*recovery/.test(invariantFunction)
    && !invariantFunction.includes(".next.$$"),
  `${name} switch-time invariant must be read-only so SIGKILL recovery cannot expose a pointer/mirror mismatch`);
}
assert(source.includes("rollback-$timestamp.json") && source.includes("active-release.json.next"), "Rollback must write an audit record and atomically replace the active release record");
assert(source.includes("runtimePolicyFromVerification") && source.includes("health?.reactRuntime?.sha256"), "Rollback must restore and verify the selected release policy");
assert(!source.includes('previousReleasePath + "/activation.json"') && source.includes("Restored manifest identity differs from the verified release"), "Rollback must reconstruct its active record from the sealed target manifest instead of trusting copied deploy-era activation metadata");
assert(source.includes("releaseId: rolledBackReleaseId") && source.includes("target: currentTarget"), "A reconstructed rollback record must retain the sealed current release as the reversible previous pointer");
assert(source.includes("legacyBaseline: currentActive.legacyBaseline"), "Rollback must carry the pinned legacy baseline into the restored active record");
assert(source.includes('authority_lock_parent="/run/lock/mes"')
  && source.includes('authority_lock_file="$authority_lock_parent/mes-authority-rollout.lock"')
  && source.includes('FIXED_ROOT_AUTHORITY_WRAPPER = "/usr/local/libexec/mes/active-bundle/with-pilot-release-authority-lock.sh"')
  && source.includes('"--operation=rollback"')
  && source.includes('MES_RELEASE_AUTHORITY_LOCK_HELD')
  && source.includes('/proc/$$/fdinfo/9')
  && source.includes('$6 == owner_pid')
  && !source.includes('flock -n 9')
  && !source.includes('/srv/mes/pilot/shared-state/mes-authority-rollout'),
"Rollback must serialize its pointer switch through one exact root-owned authority lock outside the runtime-writable tree");
for (const transitionPath of [
  "/var/lib/mes/pilot-credential-rotation",
  "/var/lib/mes/pilot-uid-cutover",
  "/run/lock/mes/pilot-runtime-writers-quiesced",
]) {
  assert(source.includes(transitionPath) && activateSource.includes(transitionPath), `activation and rollback must fail before mutation when ${transitionPath} is present`);
}
assert(source.indexOf("assert_no_pilot_runtime_transition_state") < source.indexOf('/usr/bin/node "$journal_helper" recover')
  && activateSource.indexOf("assert_no_pilot_runtime_transition_state") < activateSource.indexOf('/usr/bin/node "$journal_helper" recover'),
"activation and rollback must prove credential/UID recovery is absent before release journal recovery or pointer mutation");
for (const [name, releaseSwitch] of [["activation", activateSource], ["rollback", source]]) {
  assert(releaseSwitch.includes("for systemd_root in /etc/systemd/system /run/systemd/system"), `${name} must inspect persistent and reboot-ephemeral evaluation drop-ins`);
  assert(releaseSwitch.includes("-evaluation-auto-rollback\\.(timer|service)$"), `${name} must reject loaded release-anchored evaluation cleanup units`);
  assert(releaseSwitch.indexOf("assert_no_active_evaluation \\") < releaseSwitch.indexOf('/usr/bin/node "$journal_helper" recover'), `${name} must reject every active evaluation before journal recovery or pointer mutation`);
}
assert(source.includes("grep -RIl -E 'MES_ENABLE_SPECIFICATIONS2_(SERVER_(COMMANDS|PUBLISH_COMMANDS)|ATTACHMENT_COMMANDS)=1'"), "Rollback must reject every configured Specifications 2.0 command owner regardless of drop-in filename");
assert(source.includes("MES_ENABLE_SPECIFICATIONS2_(SERVER_(COMMANDS|PUBLISH_COMMANDS)|ATTACHMENT_COMMANDS)=1"), "Rollback must inspect Work Order, publication and attachment command flags");
assert(source.includes("target_has_v6_specifications2_command_compatibility") && source.includes("specifications2-server-command-compatibility.json"), "Rollback may retain commands only for a target carrying the versioned v6 compatibility marker");
assert(source.indexOf("assert_legacy_incompatible_specifications2_commands_disabled\nfi") < source.indexOf('mv -Tf "$app_path.next" "$app_path"'), "An incompatible target must be proved command-OFF before the rollback pointer switch");
assert(source.lastIndexOf("assert_legacy_incompatible_specifications2_commands_disabled") > source.indexOf('systemctl restart "$service"'), "Rollback must repeat the command-OFF proof after restarting an incompatible target");
assert(activateSource.includes("previous_has_v6_specifications2_command_compatibility") && activateSource.includes("legacy_incompatible_previous_specifications2_command_enabled"), "Activation must protect its automatic rollback direction when the previous release lacks the marker");
assert(activateSource.includes('manifest?.schemaVersion < 3') && activateSource.includes('manifest.runtimeIncludes.includes("ops")') && activateSource.includes('[ "$previous_kind" = "release-pointer" ]'), "Only a manifest-verified schema-v3 release pointer whose source digest covers ops may waive command-OFF");
assert(activateSource.includes("previous_command_owners_safe_for_rollback") && activateSource.includes("not proved OFF") && activateSource.includes("no_universally_compatible_command_recovery_runtime") && activateSource.includes("legacy_incompatible_specifications2_command_became_enabled"), "Activation may restore a sealed contract-old runtime only while every incompatible command owner is repeatedly proved OFF");
assert(source.includes("MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=1") && source.includes("target_has_nomenclature_command_compatibility"), "Rollback must protect Nomenclature command authority with a manifest-bound compatibility contract");
assert(source.includes("neither the current nor selected runtime carries every manifest-bound server-command contract required for fail-safe recovery"), "Rollback must retain one universally compatible recovery direction for every command contract");
assert(activateSource.includes('authority_lock_parent="/run/lock/mes"')
  && activateSource.includes('authority_lock_file="$authority_lock_parent/mes-authority-rollout.lock"')
  && activateSource.includes('FIXED_ROOT_AUTHORITY_WRAPPER = "/usr/local/libexec/mes/active-bundle/with-pilot-release-authority-lock.sh"')
  && activateSource.includes('"--operation=activation"')
  && activateSource.includes('MES_RELEASE_AUTHORITY_LOCK_HELD')
  && activateSource.includes('/proc/$$/fdinfo/9')
  && activateSource.includes('$6 == owner_pid')
  && !activateSource.includes('flock -n 9')
  && !activateSource.includes('/srv/mes/pilot/shared-state/mes-authority-rollout'),
"Activation must serialize its pointer switch through one exact root-owned authority lock outside the runtime-writable tree");
assert(JSON.stringify(marker) === JSON.stringify({
  schemaVersion: 1,
  contract: "specifications2-server-commands",
  publicationFingerprintAdapterVersion: 6,
  workOrderRevisionIdentityVersion: 1,
  workOrderRequestFingerprintVersion: 1,
  workOrderAggregateIdentityVersion: 1,
  attachmentCommandVersion: 1,
  authenticatedActorVersion: 1,
  rbacAuthorizationVersion: 1,
  requestSecurityVersion: 1,
  outboxEnvelopeVersion: 1,
  controlledRootExclusivity: {
    required: true,
    lockName: "mes-authority-rollout.lock",
    incompatibleTargetRequiresDisabledFlags: [
      "MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS",
      "MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS",
      "MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS",
    ],
  },
  requiredMigrations: [
    "019_specifications2_attachment_blobs",
    "028_specifications2_publication_idempotency",
    "029_specifications2_revision_identity_backfill",
    "030_specifications2_legacy_revision_identity_guard",
    "031_specifications2_guard_function_repair",
  ],
}), "The release compatibility marker must bind the exact command, outbox, identity and migration contract");
for (const [name, script] of [["activate Work Orders", activateWorkOrders], ["deactivate Work Orders", deactivateWorkOrders]]) {
  assert(script.includes("63-specifications2-work-orders.conf"), `${name} must own the Work Order enable drop-in`);
  assert(script.includes("62-specifications2-work-orders-off.conf"), `${name} must also own the inherited-environment OFF override`);
  assert(script.includes("with-authority-rollout-lock.sh"), `${name} must share the authority rollout lock`);
  assert(script.includes("release-server-command-contract-verify.mjs") && script.includes("--contract=specifications2"), `${name} must bind root lifecycle to the immutable manifest-verified release`);
}
assert(rolloutReadinessPolicy.includes('commandStatus(payload, "specifications2WorkOrderCreation")') && rolloutReadinessPolicy.includes('commandStatus(payload, "specifications2RevisionPublication")'), "The shared rollout policy must verify the exact Work Order and publication readiness capabilities");
assert(activateWorkOrders.includes("specifications2-server-command-compatibility.json") && activateWorkOrders.includes("work-orders-schema-ready") && activateWorkOrders.includes("work-orders-ready"), "Work Order activation must require the versioned compatible release and exact Work Order/publication migrations 028-031");
assert(deactivateWorkOrders.includes("work-orders-disabled"), "Work Order deactivation must use the strict fail-closed readiness policy");
assert(activatePublication.includes("publication-schema-ready") && activatePublication.includes("publication-ready"), "Publication activation must require strict schema and enabled readiness");
assert(deactivatePublication.includes("curl --fail") && deactivatePublication.includes("publication-disabled"), "Publication deactivation must reject HTTP failure, missing readiness and old enabled state");
assert(deactivatePublication.includes("release-server-command-contract-verify.mjs") && deactivatePublication.includes("--contract=specifications2"), "Publication deactivation must bind to the immutable manifest-verified release");
assert(packageSource.scripts?.["release:rollback:pilot"]?.includes("release-rollback.mjs --contour=pilot"), "Package scripts must expose pilot release rollback");
assert(packageSource.scripts?.["release:rollback:staging"]?.includes("release-rollback.mjs --contour=staging"), "Package scripts must expose staging release rollback");
await import("./release-specifications2-switch-guard-qa.mjs");
await import("./release-specifications2-stage-preflight-qa.mjs");
await import("./release-root-seal-verify-qa.mjs");
await import("./specifications2-rollout-readiness-policy-qa.mjs");
console.log("Release rollback QA: OK");
