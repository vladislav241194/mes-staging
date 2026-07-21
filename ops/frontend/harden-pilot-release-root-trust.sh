#!/usr/bin/env bash
set -euo pipefail

# This file and every argument are uploaded from one freshly published Git
# object and SHA-verified in a root-only directory before this script runs.
export PATH=/usr/sbin:/usr/bin:/sbin:/bin

if [[ "$(id -u)" != "0" ]]; then
  echo "Run through the mes-line-root SSH alias (uid 0 required)." >&2
  exit 73
fi

if [[ "${1:-}" != "--locked" ]]; then
  lock_wrapper_source="${9:-}"
  [[ -n "$lock_wrapper_source" ]] || { echo "SHA-verified lock wrapper source is required." >&2; exit 76; }
  exec env MES_RELEASE_BOOTSTRAP_SOURCE_VERIFIED=1 \
    /bin/bash "$lock_wrapper_source" \
    --bootstrap-source-verified \
    --operation=bootstrap \
    -- /bin/bash "$0" --locked "$@"
fi
shift

[[ "${MES_RELEASE_AUTHORITY_LOCK_HELD:-}" == "1" && "${MES_RELEASE_AUTHORITY_LOCK_FD:-}" == "9" ]] \
  || { echo "Root trust bootstrap must hold the canonical authority lock on fd9." >&2; exit 74; }
authority_lock="/run/lock/mes/mes-authority-rollout.lock"
[[ -f "$authority_lock" && ! -L "$authority_lock" \
  && "$(readlink -f -- "$authority_lock")" == "$authority_lock" \
  && "$(stat -Lc '%u:%g:%a:%h' -- "$authority_lock")" == 0:0:600:1 \
  && -e /proc/$$/fd/9 \
  && "$(stat -Lc '%d:%i' -- /proc/$$/fd/9 2>/dev/null || true)" == "$(stat -Lc '%d:%i' -- "$authority_lock")" ]] \
  || { echo "Root trust bootstrap fd9 does not name the canonical authority lock." >&2; exit 74; }
authority_inode="$(stat -Lc '%i' -- "$authority_lock")"
awk -v owner_pid="$$" -v lock_inode="$authority_inode" '
  $1 == "lock:" && $3 == "FLOCK" && $5 == "WRITE" && $6 == owner_pid {
    split($7, identity, ":");
    if (identity[3] == lock_inode) found = 1;
  }
  END { exit(found ? 0 : 1) }
' /proc/$$/fdinfo/9 \
  || { echo "Root trust bootstrap could not prove exact authority lock ownership." >&2; exit 74; }

assert_real_directory() {
  local path="$1"
  if [[ ! -d "$path" || -L "$path" || "$(readlink -f -- "$path")" != "$path" ]]; then
    echo "Refusing non-canonical or symlink path: $path" >&2
    exit 74
  fi
}

assert_root_sealed() {
  local path="$1"
  assert_real_directory "$path"
  if [[ "$(stat -Lc '%u:%g' -- "$path")" != "0:0" ]] \
    || find "$path" -maxdepth 0 -perm /022 -print -quit | grep -q .; then
    echo "Path is not a root-controlled sealed directory: $path" >&2
    exit 74
  fi
}

sync_path() {
  /usr/bin/sync -f "$1"
}

# Re-inode journals and quarantined deploy-era trees are root authority state,
# not release payload.  A first bootstrap creates their dedicated directories;
# an existing path is accepted only when it is already the exact root-only
# directory contract.  In particular, never repair or follow a pre-created
# symlink or a directory with weaker/foreign metadata.
ensure_reinode_state_directory() {
  local path="$1"
  if [[ ! -e "$path" && ! -L "$path" ]]; then
    install -d -o root -g root -m 0700 "$path"
    sync_path "$(dirname -- "$path")"
  fi
  if [[ ! -d "$path" || -L "$path" || "$(readlink -f -- "$path")" != "$path" \
      || "$(stat -Lc '%u:%g:%a' -- "$path")" != "0:0:700" ]]; then
    echo "Unsafe Pilot re-inode state directory: $path" >&2
    exit 74
  fi
}

# Lock the path chain from the already trusted /srv parent downward.
assert_root_sealed /srv
for path in /srv/mes /srv/mes/pilot /srv/mes/pilot/releases; do
  assert_real_directory "$path"
  chown 0:0 -- "$path"
  chmod go-w -- "$path"
  assert_root_sealed "$path"
done
ensure_reinode_state_directory /srv/mes/pilot/reinode-transactions
ensure_reinode_state_directory /srv/mes/pilot/quarantine

seal_verifier_source="${1:-}"
reinode_helper_source="${2:-}"
public_verifier_source="${3:-}"
tree_sha_source="${4:-}"
runtime_policy_source="${5:-}"
activate_runner_source="${6:-}"
rollback_runner_source="${7:-}"
switch_journal_source="${8:-}"
lock_wrapper_source="${9:-}"
recovery_gate_source="${10:-}"
bootstrap_bind_source="${11:-}"
if [[ "$#" -ne 11 ]]; then
  echo "Exactly ten helper paths and one SHA-verified bootstrap bind drop-in are required." >&2
  exit 76
fi

source_paths=(
  "$seal_verifier_source"
  "$reinode_helper_source"
  "$public_verifier_source"
  "$tree_sha_source"
  "$runtime_policy_source"
  "$activate_runner_source"
  "$rollback_runner_source"
  "$switch_journal_source"
  "$lock_wrapper_source"
  "$recovery_gate_source"
)
installed_names=(
  release-root-seal-verify.mjs
  release-root-reinode-active.mjs
  release-verify.mjs
  release-tree-sha.mjs
  react-runtime-policy.mjs
  release-activate-root.mjs
  release-rollback-root.mjs
  release-switch-journal.mjs
  with-pilot-release-authority-lock.sh
  recover-pilot-release-transitions.sh
)
for source_path in "${source_paths[@]}" "$bootstrap_bind_source"; do
  if [[ ! -f "$source_path" || -L "$source_path" || "$(stat -Lc '%u:%g:%a' -- "$source_path")" != "0:0:400" ]]; then
    echo "Untrusted root tool source: $source_path" >&2
    exit 76
  fi
  case "$(readlink -f -- "$source_path")" in
    /root/*) ;;
    *) echo "Root tool source must be uploaded beneath /root: $source_path" >&2; exit 76 ;;
  esac
done
digests=()
for source_path in "${source_paths[@]}"; do
  digests+=("$(sha256sum "$source_path" | awk '{print $1}')")
done

assert_root_sealed /usr
assert_root_sealed /usr/local
install -d -o root -g root -m 0755 /usr/local/libexec /usr/local/libexec/mes /usr/local/libexec/mes/bundles
assert_root_sealed /usr/local/libexec
assert_root_sealed /usr/local/libexec/mes
assert_root_sealed /usr/local/libexec/mes/bundles

bundle_payload=""
for index in "${!installed_names[@]}"; do
  bundle_payload+="${installed_names[$index]} ${digests[$index]}"$'\n'
done
bundle_id="$(printf '%s' "$bundle_payload" | sha256sum | awk '{print $1}')"
bundle_root="/usr/local/libexec/mes/bundles"
bundle_path="${bundle_root}/${bundle_id}"
bundle_next="${bundle_root}/.${bundle_id}.next.$$"

if [[ ! -d "$bundle_path" ]]; then
  [[ ! -e "$bundle_next" ]] || { echo "Stale helper bundle temporary path: $bundle_next" >&2; exit 76; }
  install -d -o root -g root -m 0755 "$bundle_next"
  for index in "${!installed_names[@]}"; do
    install -o root -g root -m 0555 "${source_paths[$index]}" "$bundle_next/${installed_names[$index]}"
    [[ "$(sha256sum "$bundle_next/${installed_names[$index]}" | awk '{print $1}')" == "${digests[$index]}" ]]
    sync_path "$bundle_next/${installed_names[$index]}"
  done
  manifest_arguments=("$bundle_next/helper-bundle.manifest.json" "$bundle_id")
  for index in "${!installed_names[@]}"; do
    manifest_arguments+=("${installed_names[$index]}" "${digests[$index]}")
  done
  /usr/bin/node --input-type=module - "${manifest_arguments[@]}" <<'NODE'
import { open } from "node:fs/promises";
const [path, bundleId, ...pairs] = process.argv.slice(2);
const files = {};
for (let index = 0; index < pairs.length; index += 2) files[pairs[index]] = pairs[index + 1];
const handle = await open(path, "wx", 0o444);
await handle.writeFile(`${JSON.stringify({ schemaVersion: 1, bundleId, files }, null, 2)}\n`, "utf8");
await handle.sync();
await handle.close();
NODE
  chown root:root "$bundle_next/helper-bundle.manifest.json"
  chmod 0444 "$bundle_next/helper-bundle.manifest.json"
  sync_path "$bundle_next"
  mv -T "$bundle_next" "$bundle_path"
  sync_path "$bundle_root"
fi

# Verify a pre-existing or newly committed immutable versioned bundle.
for index in "${!installed_names[@]}"; do
  [[ -f "$bundle_path/${installed_names[$index]}" && ! -L "$bundle_path/${installed_names[$index]}" ]]
  [[ "$(sha256sum "$bundle_path/${installed_names[$index]}" | awk '{print $1}')" == "${digests[$index]}" ]]
done

# Prevalidate the inactive target without executing any of its JavaScript.
# Exact membership prevents an unmanifested helper from being smuggled into a
# bundle that otherwise has valid hashes.
prevalidation_arguments=("$bundle_path" "$bundle_id")
for index in "${!installed_names[@]}"; do
  prevalidation_arguments+=("${installed_names[$index]}" "${digests[$index]}")
done
/usr/bin/node --input-type=module - "${prevalidation_arguments[@]}" <<'NODE'
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { basename } from "node:path";
const [bundlePath, bundleId, ...pairs] = process.argv.slice(2);
const files = {};
for (let index = 0; index < pairs.length; index += 2) files[pairs[index]] = pairs[index + 1];
const expectedEntries = [...Object.keys(files), "helper-bundle.manifest.json"].sort();
const entries = (await readdir(bundlePath)).sort();
if (JSON.stringify(entries) !== JSON.stringify(expectedEntries)) throw new Error("helper bundle membership mismatch");
if (await realpath(bundlePath) !== bundlePath || basename(bundlePath) !== bundleId) throw new Error("helper bundle path mismatch");
const directory = await lstat(bundlePath);
if (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== 0 || directory.gid !== 0
  || (directory.mode & 0o777) !== 0o755) throw new Error("helper bundle directory metadata mismatch");
const manifestPath = `${bundlePath}/helper-bundle.manifest.json`;
const manifestMetadata = await lstat(manifestPath);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (!manifestMetadata.isFile() || manifestMetadata.isSymbolicLink()
  || manifestMetadata.uid !== 0 || manifestMetadata.gid !== 0
  || (manifestMetadata.mode & 0o777) !== 0o444
  || manifest?.schemaVersion !== 1 || manifest?.bundleId !== bundleId
  || JSON.stringify(Object.keys(manifest?.files || {}).sort()) !== JSON.stringify(Object.keys(files).sort())) {
  throw new Error("helper bundle manifest mismatch");
}
for (const [name, expectedDigest] of Object.entries(files)) {
  const path = `${bundlePath}/${name}`;
  const metadata = await lstat(path);
  const bytes = await readFile(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== 0 || metadata.gid !== 0
    || (metadata.mode & 0o777) !== 0o555
    || manifest.files[name] !== expectedDigest
    || createHash("sha256").update(bytes).digest("hex") !== expectedDigest) {
    throw new Error(`helper bundle artifact mismatch: ${name}`);
  }
}
const computedId = createHash("sha256").update(Object.keys(files)
  .map((name) => `${name} ${files[name]}\n`).join(""))
  .digest("hex");
if (computedId !== bundleId) throw new Error("helper bundle identity mismatch");
NODE

# Commit the complete bundle with one durable pointer rename. Every reader
# resolves all helpers through this one pointer, so power loss can expose only
# the complete previous bundle or the complete new bundle, never a mixed set.
active_bundle="/usr/local/libexec/mes/active-bundle"
active_bundle_next="${active_bundle}.next.${bundle_id}.$$"
old_active_target=""
if [[ -e "$active_bundle" || -L "$active_bundle" ]]; then
  [[ -L "$active_bundle" ]] || { echo "Active helper bundle pointer is not a symlink." >&2; exit 76; }
  old_active_target="$(readlink -- "$active_bundle")"
  [[ "$old_active_target" =~ ^bundles/[a-f0-9]{64}$ ]] \
    || { echo "Active helper bundle pointer target is unsafe." >&2; exit 76; }
  /usr/bin/node "$active_bundle/release-root-seal-verify.mjs" bundle
fi
[[ ! -e "$active_bundle_next" && ! -L "$active_bundle_next" ]] \
  || { echo "Stale active helper bundle pointer: $active_bundle_next" >&2; exit 76; }
ln -s "bundles/${bundle_id}" "$active_bundle_next"
chown -h root:root "$active_bundle_next"
sync_path /usr/local/libexec/mes
mv -Tf "$active_bundle_next" "$active_bundle"
sync_path /usr/local/libexec/mes

if ! /usr/bin/node /usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs bundle; then
  rollback_pointer="${active_bundle}.rollback.${bundle_id}.$$"
  if [[ -n "$old_active_target" ]]; then
    ln -s "$old_active_target" "$rollback_pointer"
    chown -h root:root "$rollback_pointer"
    mv -Tf "$rollback_pointer" "$active_bundle"
  else
    rm -f -- "$active_bundle"
  fi
  sync_path /usr/local/libexec/mes
  if [[ -n "$old_active_target" ]]; then
    /usr/bin/node "$active_bundle/release-root-seal-verify.mjs" bundle \
      || { echo "Old helper bundle rollback verification failed." >&2; exit 76; }
  fi
  echo "New helper bundle post-switch verification failed; the durable old pointer was restored." >&2
  exit 76
fi

if ! getent passwd mes-stage >/dev/null; then
  /usr/sbin/useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin --user-group mes-stage
fi

runtime_dir="/srv/mes/pilot/runtime"
operational_bootstrap="${runtime_dir}/bootstrap-snapshot.json"
sealed_bootstrap_dir="/srv/mes/pilot/bootstrap-recovery"
sealed_bootstrap="${sealed_bootstrap_dir}/bootstrap-snapshot.json"
if [[ ! -d "$runtime_dir" || -L "$runtime_dir" || "$(readlink -f -- "$runtime_dir")" != "$runtime_dir" ]]; then
  echo "Pilot operational runtime path is not a canonical real directory." >&2
  exit 76
fi
if getent passwd mes-pilot >/dev/null \
  && [[ "$(stat -Lc '%U:%G' -- "$runtime_dir")" == "mes-pilot:mes-pilot" ]]; then
  chown mes-pilot:mes-pilot -- "$runtime_dir"
  runtime_reader="mes-pilot"
else
  chown root:deploy -- "$runtime_dir"
  runtime_reader="deploy"
fi
chmod 0750 -- "$runtime_dir"
if [[ ! -f "$operational_bootstrap" || -L "$operational_bootstrap" \
    || "$(readlink -f -- "$operational_bootstrap")" != "$operational_bootstrap" \
    || "$(stat -Lc '%h' -- "$operational_bootstrap")" != "1" ]]; then
  echo "Pilot operational bootstrap snapshot is not a canonical single-link regular file." >&2
  exit 76
fi
chown root:root -- "$operational_bootstrap"
chmod 0444 -- "$operational_bootstrap"
[[ "$(stat -Lc '%u:%g:%a:%h' -- "$operational_bootstrap")" == "0:0:444:1" ]] \
  || { echo "Pilot operational bootstrap snapshot hardening failed." >&2; exit 76; }
/usr/sbin/runuser -u "$runtime_reader" -- test -r "$operational_bootstrap" \
  || { echo "$runtime_reader cannot read the hardened operational bootstrap snapshot." >&2; exit 76; }
if /usr/sbin/runuser -u mes-stage -- test -r "$operational_bootstrap"; then
  echo "mes-stage must not read the live Pilot operational bootstrap snapshot." >&2
  exit 76
fi

# This bootstrap step never manufactures the bind source from mutable runtime
# bytes. Active re-inode is the first operation allowed to atomically seed manifest-bound mirror bytes.
# On a first-run host the mandatory bind contract
# therefore stays unpublished until that mirror exists: bootstrap may fail
# safely, but it must never leave an otherwise healthy Pilot unable to restart.
if [[ ! -e "$sealed_bootstrap_dir" && ! -L "$sealed_bootstrap_dir" ]]; then
  install -d -o root -g root -m 0700 "$sealed_bootstrap_dir"
fi
[[ -d "$sealed_bootstrap_dir" && ! -L "$sealed_bootstrap_dir" \
  && "$(readlink -f -- "$sealed_bootstrap_dir")" == "$sealed_bootstrap_dir" \
  && "$(stat -Lc '%u:%g:%a' -- "$sealed_bootstrap_dir")" == "0:0:700" ]] \
  || { echo "Pilot sealed bootstrap directory is unsafe." >&2; exit 76; }
if [[ -e "$sealed_bootstrap" || -L "$sealed_bootstrap" ]]; then
  [[ -f "$sealed_bootstrap" && ! -L "$sealed_bootstrap" \
    && "$(stat -Lc '%u:%g:%a:%h' -- "$sealed_bootstrap")" == "0:0:444:1" ]] \
    || { echo "Pilot sealed bootstrap artifact is unsafe." >&2; exit 76; }
fi
bootstrap_forbidden_identities=(deploy mes-stage)
getent passwd mes-pilot >/dev/null && bootstrap_forbidden_identities+=(mes-pilot)
for identity in "${bootstrap_forbidden_identities[@]}"; do
  if /usr/sbin/runuser -u "$identity" -- test -r "$sealed_bootstrap" \
    || /usr/sbin/runuser -u "$identity" -- test -w "$sealed_bootstrap_dir"; then
    echo "$identity can access or replace the sealed bootstrap mirror." >&2
    exit 76
  fi
done

atomic_install_config() {
  local target="$1"
  local source="$2"
  local next="${target}.next.${bundle_id}.$$"
  install -d -o root -g root -m 0755 "$(dirname "$target")"
  install -o root -g root -m 0644 "$source" "$next"
  sync_path "$next"
  mv -Tf "$next" "$target"
  sync_path "$(dirname "$target")"
}

bootstrap_bind_target=/etc/systemd/system/mes-pilot.service.d/06-bootstrap-snapshot-bind.conf
bootstrap_bind_state=deferred-until-active-reinode
if [[ -f "$sealed_bootstrap" && ! -L "$sealed_bootstrap" ]]; then
  /usr/bin/node --input-type=module -e \
    'JSON.parse(await (await import("node:fs/promises")).readFile(process.argv[1], "utf8"));' \
    "$sealed_bootstrap"
  atomic_install_config "$bootstrap_bind_target" "$bootstrap_bind_source"
  bootstrap_bind_state=published-from-root-sealed-mirror
elif [[ -e "$bootstrap_bind_target" || -L "$bootstrap_bind_target" ]]; then
  # Recover only the exact managed first-run residue left by an older
  # bootstrap. Never unlink an unknown or redirected systemd configuration.
  [[ -f "$bootstrap_bind_target" && ! -L "$bootstrap_bind_target" \
    && "$(readlink -f -- "$bootstrap_bind_target")" == "$bootstrap_bind_target" \
    && "$(stat -Lc '%u:%g:%a:%h' -- "$bootstrap_bind_target")" == "0:0:644:1" \
    && "$(sha256sum "$bootstrap_bind_target" | awk '{print $1}')" == "$(sha256sum "$bootstrap_bind_source" | awk '{print $1}')" ]] \
    || { echo "Unsafe bootstrap bind residue while the sealed mirror is absent." >&2; exit 76; }
  rm -f -- "$bootstrap_bind_target"
  sync_path "$(dirname -- "$bootstrap_bind_target")"
fi

config_tmp="$(mktemp -d /root/.mes-release-recovery-config.XXXXXX)"
trap 'rm -rf -- "$config_tmp"' EXIT
printf '%s\n' \
  '[Unit]' \
  'Description=MES Pilot release recovery gate for application start' \
  '# Ordering is safe on a first-run host where credential recovery is not installed yet.' \
  '# The steady-state mes-pilot unit Requires it directly after UID isolation.' \
  'After=mes-pilot-credential-rotation-recovery.service' \
  'Before=mes-pilot.service' \
  '' \
  '[Service]' \
  'Type=oneshot' \
  'ExecStart=/bin/bash /usr/local/libexec/mes/active-bundle/recover-pilot-release-transitions.sh --consumer=app' \
  > "$config_tmp/app.service"
printf '%s\n' \
  '[Unit]' \
  'Description=MES Pilot release recovery gate for direct writers' \
  '# Ordering is safe on a first-run host where credential recovery is not installed yet.' \
  '# Steady-state writer units Require it directly after UID isolation.' \
  'After=mes-pilot-credential-rotation-recovery.service' \
  'Before=mes-pilot-domain-migrate.service mes-pilot-domain-import.service mes-pilot-domain-snapshot-sync.service' \
  '' \
  '[Service]' \
  'Type=oneshot' \
  'ExecStart=/bin/bash /usr/local/libexec/mes/active-bundle/recover-pilot-release-transitions.sh --consumer=writer' \
  > "$config_tmp/writer.service"
printf '%s\n' \
  '[Unit]' \
  'Requires=mes-pilot-release-recovery-app.service' \
  'After=mes-pilot-release-recovery-app.service' \
  > "$config_tmp/app.conf"
printf '%s\n' \
  '[Unit]' \
  'Requires=mes-pilot-release-recovery-writer.service' \
  'After=mes-pilot-release-recovery-writer.service' \
  > "$config_tmp/writer.conf"

atomic_install_config /etc/systemd/system/mes-pilot-release-recovery-app.service "$config_tmp/app.service"
atomic_install_config /etc/systemd/system/mes-pilot-release-recovery-writer.service "$config_tmp/writer.service"
atomic_install_config /etc/systemd/system/mes-pilot.service.d/04-release-recovery.conf "$config_tmp/app.conf"
for unit in mes-pilot-domain-migrate.service mes-pilot-domain-import.service mes-pilot-domain-snapshot-sync.service; do
  atomic_install_config "/etc/systemd/system/${unit}.d/04-release-recovery.conf" "$config_tmp/writer.conf"
done
systemctl daemon-reload

printf '%s\n' \
  "Pilot release trust bundle is root-owned, manifest-bound and crash-committed: ${bundle_id}" \
  "Pilot bootstrap bind contract: ${bootstrap_bind_state}"
