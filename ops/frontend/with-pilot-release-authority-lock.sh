#!/usr/bin/env bash
set -euo pipefail
# Never inherit job control from SHELLOPTS. A monitor-mode background launcher
# is a process-group leader, so setsid forks and destroys the exact PID binding
# between the kernel flock, release intent and protected command.
set +m

export PATH=/usr/sbin:/usr/bin:/sbin:/bin

LOCK_PARENT="/run/lock/mes"
LOCK_FILE="${LOCK_PARENT}/mes-authority-rollout.lock"
RELEASE_INTENT="${LOCK_PARENT}/mes-release-operation.intent"
RELEASE_APP_INTENT="${LOCK_PARENT}/mes-release-app-verification.intent"
RUNTIME_INTENT="${LOCK_PARENT}/pilot-app-verification.intent"
SHARED_APP_INTENT="${LOCK_PARENT}/mes-shared-authority-app-verification.intent"
IDENTITY_LOCK="${LOCK_PARENT}/pilot-runtime-uid-isolation.lock"
PILOT_ROOT="/srv/mes/pilot"
PILOT_APP="${PILOT_ROOT}/app"
PILOT_RELEASES="${PILOT_ROOT}/releases"
PILOT_ACTIVE_RECORD="${PILOT_RELEASES}/active-release.json"
INSTALLED_ROOT="/usr/local/libexec/mes/active-bundle"
AUTHORITY_FD=9
IDENTITY_FD=8
INPUT_FD=7
FLOCK_CONFLICT_STATUS=200
OWNER_REENTRY_ENV="MES_RELEASE_AUTHORITY_LOCK_OWNER_REENTRY"
OWNER_MARKER_ENV="MES_RELEASE_AUTHORITY_LOCK_OWNER_MARKER"

operation=""
busy_policy="fail"
bootstrap_source_verified=0
original_arguments=("$@")

while [[ $# -gt 0 ]]; do
  case "$1" in
    --operation=*) operation="${1#*=}"; shift ;;
    --busy-policy=*) busy_policy="${1#*=}"; shift ;;
    --bootstrap-source-verified) bootstrap_source_verified=1; shift ;;
    --) shift; break ;;
    *) echo "Unknown release authority-lock option: $1" >&2; exit 2 ;;
  esac
done

[[ ${EUID} -eq 0 ]] || { echo "Release authority lock requires uid 0." >&2; exit 73; }
[[ -n "$operation" && $# -gt 0 ]] || { echo "Release authority lock requires --operation and a command." >&2; exit 2; }
[[ "$busy_policy" == "fail" || "$busy_policy" == "app-intent" ]] \
  || { echo "Unsupported authority-lock busy policy: $busy_policy" >&2; exit 2; }

assert_root_regular() {
  local path="$1" mode="$2"
  [[ -f "$path" && ! -L "$path" ]] \
    && [[ "$(readlink -f -- "$path")" == "$path" ]] \
    && [[ "$(stat -Lc '%u:%g:%a' -- "$path")" == "0:0:${mode}" ]]
}

assert_installed_bundle() {
  if [[ $bootstrap_source_verified -eq 1 ]]; then
    local invoked
    invoked="$(readlink -f -- "$0")"
    [[ "$invoked" == /root/* ]] \
      && assert_root_regular "$invoked" 400 \
      || { echo "Bootstrap lock wrapper is not the SHA-verified root-only source." >&2; exit 76; }
    return 0
  fi
  /usr/bin/node "${INSTALLED_ROOT}/release-root-seal-verify.mjs" bundle >/dev/null
}

ensure_lock_inode() {
  if [[ ! -d "$LOCK_PARENT" ]]; then
    install -d -o root -g root -m 0700 "$LOCK_PARENT"
  fi
  [[ -d "$LOCK_PARENT" && ! -L "$LOCK_PARENT" ]] \
    && [[ "$(readlink -f -- "$LOCK_PARENT")" == "$LOCK_PARENT" ]] \
    && [[ "$(stat -Lc '%u:%g:%a' -- "$LOCK_PARENT")" == "0:0:700" ]] \
    || { echo "Release authority lock parent is not canonical root:root 0700." >&2; exit 74; }
  if [[ ! -e "$LOCK_FILE" ]]; then
    install -o root -g root -m 0600 /dev/null "$LOCK_FILE"
  fi
  assert_root_regular "$LOCK_FILE" 600 \
    || { echo "Release authority lock inode is not canonical root:root 0600." >&2; exit 74; }
}

assert_canonical_root_directory() {
  local path="$1"
  [[ -d "$path" && ! -L "$path" \
    && "$(readlink -f -- "$path")" == "$path" \
    && "$(stat -Lc '%u:%g' -- "$path")" == 0:0 ]] \
    && ! find "$path" -maxdepth 0 -perm /022 -print -quit | grep -q .
}

assert_no_pilot_runtime_transition_state() {
  # A release operation may later phase-admit the app while fd9 is held. That
  # is safe only if credential/UID recovery has no durable work to perform.
  assert_canonical_root_directory /var \
    && assert_canonical_root_directory /var/lib \
    || { echo "Pilot credential journal parent chain is unsafe." >&2; return 74; }
  if [[ ! -e /var/lib/mes && ! -L /var/lib/mes ]]; then
    install -d -o root -g root -m 0755 /var/lib/mes || return 74
    sync -f /var/lib || return 74
  fi
  assert_canonical_root_directory /var/lib/mes \
    || { echo "Pilot credential journal root is unsafe." >&2; return 74; }
  for path in \
    /var/lib/mes/pilot-credential-rotation \
    /var/lib/mes/pilot-uid-cutover \
    /run/lock/mes/pilot-runtime-writers-quiesced; do
    if [[ -e "$path" || -L "$path" ]]; then
      echo "Pilot runtime transition state blocks release mutation: $path" >&2
      return 75
    fi
  done
  local stale_prepare
  stale_prepare="$(find /var/lib/mes -xdev -mindepth 1 -maxdepth 1 \
    \( -name 'pilot-credential-rotation.prepare.*' -o -name 'pilot-uid-cutover.prepare.*' \) \
    -print -quit)" || return 74
  [[ -z "$stale_prepare" ]] \
    || { echo "Pilot runtime transition preparation blocks release mutation: $stale_prepare" >&2; return 75; }
}

intent_value() {
  local path="$1" key="$2"
  sed -n "s/^${key}=//p" "$path" | head -n 1
}

prove_fd_lock() {
  local pid="$1" fd="$2" expected_file="$3"
  local expected_inode
  [[ "$pid" =~ ^[1-9][0-9]*$ && "$fd" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  [[ -e "/proc/${pid}/fd/${fd}" ]] || return 1
  [[ "$(stat -Lc '%d:%i' -- "/proc/${pid}/fd/${fd}" 2>/dev/null || true)" \
      == "$(stat -Lc '%d:%i' -- "$expected_file")" ]] || return 1
  expected_inode="$(stat -Lc '%i' -- "$expected_file")"
  awk -v owner_pid="$pid" -v lock_inode="$expected_inode" '
    $1 == "lock:" && $3 == "FLOCK" && $5 == "WRITE" && $6 == owner_pid {
      split($7, identity, ":");
      if (identity[3] == lock_inode) found = 1;
    }
    END { exit(found ? 0 : 1) }
  ' "/proc/${pid}/fdinfo/${fd}" 2>/dev/null
}

adopt_flock_path_fd() {
  local target_fd="$1" expected_file="$2" expected_device_inode
  local candidate fd candidate_device_inode candidate_inode
  local -a candidates=()
  expected_device_inode="$(stat -Lc '%d:%i' -- "$expected_file")"
  for candidate in /proc/$$/fdinfo/[0-9]*; do
    [[ -e "$candidate" ]] || continue
    fd="${candidate##*/}"
    [[ "$fd" =~ ^[0-9]+$ ]] || continue
    candidate_device_inode="$(stat -Lc '%d:%i' -- "/proc/$$/fd/${fd}" 2>/dev/null || true)"
    [[ "$candidate_device_inode" == "$expected_device_inode" ]] || continue
    candidate_inode="$(stat -Lc '%i' -- "/proc/$$/fd/${fd}" 2>/dev/null || true)"
    awk -v owner_pid="$$" -v lock_inode="$candidate_inode" '
      $1 == "lock:" && $3 == "FLOCK" && $5 == "WRITE" && $6 == owner_pid {
        split($7, identity, ":");
        if (identity[3] == lock_inode) found = 1;
      }
      END { exit(found ? 0 : 1) }
    ' "$candidate" 2>/dev/null && candidates+=("$fd")
  done
  [[ ${#candidates[@]} -eq 1 ]] || return 1
  fd="${candidates[0]}"
  if [[ "$fd" -ne "$target_fd" ]]; then
    eval "exec ${target_fd}>&${fd}"
    eval "exec ${fd}>&-"
  fi
  [[ "$(stat -Lc '%d:%i' -- "$expected_file")" == "$expected_device_inode" ]] || return 1
  prove_fd_lock "$$" "$target_fd" "$expected_file"
}

assert_owner_marker() {
  local marker="$1"
  [[ "$marker" == "${LOCK_PARENT}/.release-authority-owner."* \
    && -f "$marker" && ! -L "$marker" \
    && "$(readlink -f -- "$marker")" == "$marker" \
    && "$(stat -Lc '%u:%g:%a:%h' -- "$marker")" == "0:0:600:1" ]]
}

write_owner_marker() {
  local marker="$1" start_ticks
  assert_owner_marker "$marker" || return 1
  prove_fd_lock "$$" "$AUTHORITY_FD" "$LOCK_FILE" || return 1
  start_ticks="$(awk '{print $22}' "/proc/$$/stat" 2>/dev/null || true)"
  [[ "$start_ticks" =~ ^[1-9][0-9]*$ ]] || return 1
  {
    printf 'PID=%s\n' "$$"
    printf 'START_TICKS=%s\n' "$start_ticks"
  } > "$marker"
  sync -f "$marker"
}

owner_marker_matches_child() {
  local marker="$1" expected_pid="$2"
  assert_owner_marker "$marker" || return 1
  [[ "$(wc -l < "$marker")" -eq 2 \
    && "$(sed -n 's/^PID=//p' "$marker")" == "$expected_pid" \
    && "$(sed -n 's/^START_TICKS=//p' "$marker")" =~ ^[1-9][0-9]*$ ]]
}

release_journal_pending() {
  [[ -e /var/lib/mes/release-switch/pilot.json || -L /var/lib/mes/release-switch/pilot.json ]] && return 0
  if [[ -e /srv/mes/pilot/reinode-transactions || -L /srv/mes/pilot/reinode-transactions ]]; then
    [[ -d /srv/mes/pilot/reinode-transactions \
      && ! -L /srv/mes/pilot/reinode-transactions \
      && "$(readlink -f -- /srv/mes/pilot/reinode-transactions)" == /srv/mes/pilot/reinode-transactions \
      && "$(stat -Lc '%u:%g:%a' -- /srv/mes/pilot/reinode-transactions)" == 0:0:700 ]] || return 2
    set +e
    /usr/bin/node --input-type=module <<'NODE'
import { readFile, readdir } from "node:fs/promises";
const root = "/srv/mes/pilot/reinode-transactions";
try {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const value = JSON.parse(await readFile(`${root}/${entry.name}`, "utf8"));
      if (!["committed", "recovered"].includes(String(value?.phase || ""))) process.exit(0);
    } catch { process.exit(0); }
  }
  process.exit(1);
} catch {
  process.exit(2);
}
NODE
    local journal_status=$?
    set -e
    return "$journal_status"
  fi
  return 1
}

prove_release_app_verification_intent() {
  assert_root_regular "$RELEASE_APP_INTENT" 600 || return 1
  [[ "$(wc -l < "$RELEASE_APP_INTENT")" -eq 8 ]] || return 1
  local pid start_ticks intent operation expected_target journal_kind journal_id journal_phase current_start journal_path
  pid="$(intent_value "$RELEASE_APP_INTENT" PID)"
  start_ticks="$(intent_value "$RELEASE_APP_INTENT" START_TICKS)"
  intent="$(intent_value "$RELEASE_APP_INTENT" INTENT)"
  operation="$(intent_value "$RELEASE_APP_INTENT" OPERATION)"
  expected_target="$(intent_value "$RELEASE_APP_INTENT" EXPECTED_TARGET)"
  journal_kind="$(intent_value "$RELEASE_APP_INTENT" JOURNAL_KIND)"
  journal_id="$(intent_value "$RELEASE_APP_INTENT" JOURNAL_ID)"
  journal_phase="$(intent_value "$RELEASE_APP_INTENT" JOURNAL_PHASE)"
  [[ "$intent" == release-app-verification && "$pid" =~ ^[1-9][0-9]*$ \
    && "$start_ticks" =~ ^[1-9][0-9]*$ \
    && "$expected_target" =~ ^/srv/mes/pilot/releases/[A-Za-z0-9._-]+/app$ \
    && -L /srv/mes/pilot/app \
    && "$(readlink -f -- /srv/mes/pilot/app)" == "$expected_target" ]] || return 1
  current_start="$(awk '{print $22}' "/proc/${pid}/stat" 2>/dev/null || true)"
  [[ "$current_start" == "$start_ticks" ]] || return 1
  prove_fd_lock "$pid" "$AUTHORITY_FD" "$LOCK_FILE" || return 1
  case "$journal_kind" in
    switch)
      [[ "$journal_id" == pilot && "$journal_phase" == pointer-switched \
        && ( "$operation" == activation || "$operation" == rollback ) ]] || return 1
      journal_path="/var/lib/mes/release-switch/pilot.json"
      assert_root_regular "$journal_path" 600 || return 1
      /usr/bin/node --input-type=module - "$journal_path" "$operation" "$journal_phase" "$expected_target" <<'NODE'
import { readFile } from "node:fs/promises";
const [path, operation, phase, target] = process.argv.slice(2);
const value = JSON.parse(await readFile(path, "utf8"));
if (value?.schemaVersion !== 1 || value?.contour !== "pilot"
  || value?.operation !== operation || value?.phase !== phase
  || value?.to?.target !== target) process.exit(1);
NODE
      ;;
    reinode)
      [[ "$journal_id" =~ ^[A-Za-z0-9._-]{1,128}$ \
        && ( "$operation" == reinode || "$operation" == reinode-recovery ) \
        && ( "$journal_phase" == verified || "$journal_phase" == recovering || "$journal_phase" == rollback-started ) ]] || return 1
      journal_path="/srv/mes/pilot/reinode-transactions/${journal_id}.json"
      assert_root_regular "$journal_path" 600 || return 1
      /usr/bin/node --input-type=module - "$journal_path" "$journal_id" "$journal_phase" "$expected_target" <<'NODE'
import { readFile } from "node:fs/promises";
const [path, id, phase, target] = process.argv.slice(2);
const value = JSON.parse(await readFile(path, "utf8"));
const active = JSON.parse(await readFile("/srv/mes/pilot/releases/active-release.json", "utf8"));
if (value?.schemaVersion !== 1 || value?.transactionId !== id
  || value?.mode !== "active" || value?.phase !== phase
  || `${value?.sourceReleasePath || ""}/app` !== target
  || active?.releaseId !== value?.releaseId) process.exit(1);
NODE
      ;;
    *) return 1 ;;
  esac
}

prove_runtime_intent_without_release_journal() {
  local journal_status
  set +e
  release_journal_pending
  journal_status=$?
  set -e
  [[ "$journal_status" -eq 1 ]] || return 1
  assert_root_regular "$RUNTIME_INTENT" 600 || return 1
  assert_root_regular "$IDENTITY_LOCK" 600 || return 1
  [[ "$(wc -l < "$RUNTIME_INTENT")" -eq 3 ]] || return 1
  local pid start_ticks intent current_start
  pid="$(intent_value "$RUNTIME_INTENT" PID)"
  start_ticks="$(intent_value "$RUNTIME_INTENT" START_TICKS)"
  intent="$(intent_value "$RUNTIME_INTENT" INTENT)"
  [[ "$intent" == "app-verification" && "$pid" =~ ^[1-9][0-9]*$ \
    && "$start_ticks" =~ ^[1-9][0-9]*$ ]] || return 1
  current_start="$(awk '{print $22}' "/proc/${pid}/stat" 2>/dev/null || true)"
  [[ "$current_start" == "$start_ticks" ]] || return 1
  # The runtime transition owner must prove both independent locks: fd8 is
  # the identity lock and fd9 is the shared authority lock. Merely creating a
  # root-owned intent file is therefore insufficient to admit the app gate.
  prove_fd_lock "$pid" "$IDENTITY_FD" "$IDENTITY_LOCK" || return 1
  prove_fd_lock "$pid" "$AUTHORITY_FD" "$LOCK_FILE"
}

prove_stable_active_pointer() {
  local expected_target="$1" release_id="$2" recorded_release_id target_before target_after
  [[ "$release_id" =~ ^[A-Za-z0-9._-]{1,96}$ \
    && "$expected_target" == "${PILOT_RELEASES}/${release_id}/app" \
    && -L "$PILOT_APP" && "$(stat -c '%u:%g' -- "$PILOT_APP")" == 0:0 ]] || return 1
  assert_root_regular "$PILOT_ACTIVE_RECORD" 644 || return 1
  target_before="$(readlink -f -- "$PILOT_APP" 2>/dev/null || true)"
  [[ "$target_before" == "$expected_target" \
    && -d "$expected_target" && ! -L "$expected_target" \
    && "$(readlink -f -- "$expected_target")" == "$expected_target" \
    && "$(stat -Lc '%u:%g' -- "$expected_target")" == 0:0 ]] || return 1
  recorded_release_id="$(/usr/bin/node --input-type=module - "$PILOT_ACTIVE_RECORD" <<'NODE'
import { readFile } from "node:fs/promises";
const record = JSON.parse(await readFile(process.argv[2], "utf8"));
const releaseId = String(record?.releaseId || "");
if (!/^[A-Za-z0-9._-]{1,96}$/.test(releaseId)) process.exit(1);
process.stdout.write(releaseId);
NODE
)" || return 1
  [[ "$recorded_release_id" == "$release_id" ]] || return 1
  target_after="$(readlink -f -- "$PILOT_APP" 2>/dev/null || true)"
  [[ "$target_after" == "$target_before" ]]
}

prove_shared_authority_app_verification_intent() {
  local journal_status pid start_ticks intent expected_target release_id current_start
  [[ "$operation" == release-recovery-app || "$operation" == runtime-security-recovery ]] || return 1
  set +e
  release_journal_pending
  journal_status=$?
  set -e
  [[ "$journal_status" -eq 1 ]] || return 1
  assert_root_regular "$SHARED_APP_INTENT" 600 || return 1
  [[ "$(wc -l < "$SHARED_APP_INTENT")" -eq 5 ]] || return 1
  pid="$(intent_value "$SHARED_APP_INTENT" PID)"
  start_ticks="$(intent_value "$SHARED_APP_INTENT" START_TICKS)"
  intent="$(intent_value "$SHARED_APP_INTENT" INTENT)"
  expected_target="$(intent_value "$SHARED_APP_INTENT" EXPECTED_TARGET)"
  release_id="$(intent_value "$SHARED_APP_INTENT" ACTIVE_RELEASE_ID)"
  [[ "$intent" == shared-authority-app-verification \
    && "$pid" =~ ^[1-9][0-9]*$ && "$start_ticks" =~ ^[1-9][0-9]*$ ]] || return 1
  current_start="$(awk '{print $22}' "/proc/${pid}/stat" 2>/dev/null || true)"
  [[ "$current_start" == "$start_ticks" ]] || return 1
  prove_fd_lock "$pid" "$AUTHORITY_FD" "$LOCK_FILE" || return 1
  prove_stable_active_pointer "$expected_target" "$release_id" || return 1
  # The credential/UID dependency may use this proof only when it has no
  # recovery work. Otherwise it must retain the normal exclusive lock path.
  assert_no_pilot_runtime_transition_state || return 1
  set +e
  release_journal_pending
  journal_status=$?
  set -e
  [[ "$journal_status" -eq 1 ]]
}

write_intent() {
  local temporary="${RELEASE_INTENT}.next.$$"
  local lock_identity
  lock_identity="$(stat -Lc '%d:%i' -- "$LOCK_FILE")"
  umask 077
  {
    printf 'schema=1\n'
    printf 'pid=%s\n' "$$"
    printf 'fd=%s\n' "$AUTHORITY_FD"
    printf 'operation=%s\n' "$operation"
    printf 'lock_dev_inode=%s\n' "$lock_identity"
  } > "$temporary"
  chown root:root "$temporary"
  chmod 0600 "$temporary"
  mv -f "$temporary" "$RELEASE_INTENT"
}

assert_installed_bundle
ensure_lock_inode

if [[ ${!OWNER_REENTRY_ENV:-0} == 1 ]]; then
  owner_marker="${!OWNER_MARKER_ENV:-}"
  adopt_flock_path_fd "$AUTHORITY_FD" "$LOCK_FILE" \
    || { echo "Release authority lock fd hand-off could not be proved." >&2; exit 74; }
  write_owner_marker "$owner_marker" \
    || { echo "Release authority lock owner hand-off could not be proved." >&2; exit 74; }
  case "$operation" in
    bootstrap|reinode|reinode-recovery|release-recovery-app|release-recovery-writer)
      assert_no_pilot_runtime_transition_state
      ;;
  esac
  write_intent
  export MES_RELEASE_AUTHORITY_LOCK_HELD=1
  export MES_RELEASE_AUTHORITY_LOCK_FD="$AUTHORITY_FD"
  export MES_RELEASE_AUTHORITY_LOCK_OWNER_PID="$$"
  unset "$OWNER_REENTRY_ENV" "$OWNER_MARKER_ENV"
  exec "$@"
fi

[[ -x /usr/bin/flock && -x /usr/bin/setsid ]] \
  || { echo "Release authority lock requires /usr/bin/flock and /usr/bin/setsid." >&2; exit 74; }
owner_marker="$(mktemp "${LOCK_PARENT}/.release-authority-owner.XXXXXX")"
chown root:root "$owner_marker"
chmod 0600 "$owner_marker"
child_pid=""

cleanup() {
  if [[ -n "$child_pid" ]] && owner_marker_matches_child "$owner_marker" "$child_pid"; then
    # The lock-owner command has exited, so reacquire the same kernel lock
    # before removing only its intent. If a successor won the race, this waits
    # for that operation and cannot delete the successor's different PID.
    /usr/bin/flock --exclusive --wait 2 --conflict-exit-code 75 \
      "$LOCK_FILE" /usr/bin/env -i \
      PATH=/usr/sbin:/usr/bin:/sbin:/bin /bin/bash --noprofile --norc -ceu '
      intent="$1"; expected_pid="$2"; lock_parent="$3"
      if [[ -e "$intent" || -L "$intent" ]]; then
        [[ -f "$intent" && ! -L "$intent" \
          && "$(readlink -f -- "$intent")" == "$intent" \
          && "$(stat -Lc "%u:%g:%a:%h" -- "$intent")" == "0:0:600:1" ]] \
          || exit 74
        actual_pid="$(sed -n "s/^pid=//p" "$intent" | head -n 1)"
        if [[ "$actual_pid" == "$expected_pid" ]]; then
          rm -f -- "$intent"
          sync -f "$lock_parent"
        fi
      fi
    ' mes-release-intent-cleanup "$RELEASE_INTENT" "$child_pid" "$LOCK_PARENT" \
      || echo "Release authority intent cleanup did not complete safely." >&2
  fi
  rm -f -- "$owner_marker"
}
trap cleanup EXIT

forward_signal() {
  local signal="$1" exit_status="$2" child_signal="${3:-$1}" attempts=0
  trap - HUP INT TERM
  if [[ -n "$child_pid" ]] && kill -0 "$child_pid" 2>/dev/null; then
    # Bash marks asynchronous children SIGINT-ignored before exec. Translate
    # the caller's INT to TERM for the lock-owner child, but preserve the
    # conventional external 130 status. Never wait forever for an uncooperative
    # command while fd9 and the release intent remain held.
    kill -s "$child_signal" -- "-$child_pid" 2>/dev/null \
      || kill -s "$child_signal" "$child_pid" 2>/dev/null \
      || true
    while kill -0 "$child_pid" 2>/dev/null && [[ "$attempts" -lt 100 ]]; do
      /bin/sleep 0.02
      attempts=$((attempts + 1))
    done
    if kill -0 "$child_pid" 2>/dev/null; then
      kill -KILL -- "-$child_pid" 2>/dev/null \
        || kill -KILL "$child_pid" 2>/dev/null \
        || true
    fi
    wait "$child_pid" 2>/dev/null || true
  fi
  exit "$exit_status"
}
trap 'forward_signal HUP 129 HUP' HUP
trap 'forward_signal INT 130 TERM' INT
trap 'forward_signal TERM 143 TERM' TERM

# Bash redirects stdin of an asynchronous command to /dev/null when job
# control is disabled unless an explicit redirection is present. Activation
# intentionally streams its root transaction over stdin, so preserve the
# caller's read end on the reserved descriptor 7 for the owner child.
[[ ! -e "/proc/$$/fd/${INPUT_FD}" ]] \
  || { echo "Release authority stdin descriptor ${INPUT_FD} is already in use." >&2; exit 74; }
eval "exec ${INPUT_FD}<&0"
/usr/bin/setsid /usr/bin/env \
  "${OWNER_REENTRY_ENV}=1" \
  "${OWNER_MARKER_ENV}=${owner_marker}" \
  /usr/bin/flock --exclusive --nonblock \
    --conflict-exit-code "$FLOCK_CONFLICT_STATUS" --no-fork \
    "$LOCK_FILE" /usr/bin/env -u BASH_ENV -u ENV -u CDPATH \
      /bin/bash --noprofile --norc "$(readlink -f -- "$0")" "${original_arguments[@]}" \
      0<&"$INPUT_FD" &
child_pid=$!
eval "exec ${INPUT_FD}<&-"
set +e
wait "$child_pid"
child_status=$?
set -e

if owner_marker_matches_child "$owner_marker" "$child_pid"; then
  # Preserve command exit codes verbatim. In particular, a protected command
  # may itself return 75 or 200; the owner marker distinguishes that from an
  # initial flock conflict.
  exit "$child_status"
fi
if [[ "$child_status" -eq "$FLOCK_CONFLICT_STATUS" ]]; then
  if [[ "$busy_policy" == "app-intent" ]] \
    && { prove_release_app_verification_intent \
      || prove_runtime_intent_without_release_journal \
      || prove_shared_authority_app_verification_intent; }; then
    printf '%s\n' "Release recovery gate: live canonical root operation owns authority; app verification may continue." >&2
    exit 0
  fi
  echo "Another authority rollout owns $LOCK_FILE." >&2
  exit 75
fi
echo "Release authority lock owner failed before the protected command started." >&2
exit "$child_status"
