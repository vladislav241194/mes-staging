#!/usr/bin/env bash
# Serialize every supported shared-state authority switch with full contour sync.
#
# Linux records the PID which actually calls flock(2) in /proc/<pid>/fdinfo.
# Running `flock -n 9` as a child of this shell therefore leaves a lock whose
# recorded owner is the short-lived flock process, not the authority command.
# The parent/owner hand-off below uses util-linux's supported file-path command
# form. With --no-fork it execs this wrapper in the flock(2) owner PID; re-entry
# then finds the one locked OFD under /proc, dup2s it to fd 9, and execs the
# requested command without changing PID.
set -euo pipefail
# An exported SHELLOPTS=...:monitor would otherwise make the asynchronous
# setsid launcher a process-group leader. util-linux setsid then forks, which
# breaks the one-PID flock owner/marker/command invariant.
set +m

readonly AUTHORITY_FD=9
readonly FLOCK_CONFLICT_STATUS=200
readonly OWNER_REENTRY_ENV="MES_AUTHORITY_LOCK_OWNER_REENTRY"
readonly OWNER_MARKER_ENV="MES_AUTHORITY_LOCK_OWNER_MARKER"

if [[ $# -lt 1 ]]; then
  echo "Authority rollout lock wrapper requires a command." >&2
  exit 2
fi

if [[ ${EUID} -ne 0 ]]; then
  echo "Authority rollout lock requires uid 0." >&2
  exit 73
fi

lock_parent="/run/lock/mes"
lock_file="${lock_parent}/mes-authority-rollout.lock"
shared_app_intent="${lock_parent}/mes-shared-authority-app-verification.intent"
pilot_root="/srv/mes/pilot"
pilot_app="${pilot_root}/app"
pilot_releases="${pilot_root}/releases"
pilot_active_record="${pilot_releases}/active-release.json"
if [[ ! -d "$lock_parent" ]]; then
  mkdir -m 0700 -- "$lock_parent"
fi
if [[ -L "$lock_parent" || "$(readlink -f -- "$lock_parent")" != "$lock_parent" ]] \
  || [[ "$(stat -c '%u:%g:%a' -- "$lock_parent" 2>/dev/null || true)" != "0:0:700" ]]; then
  echo "Authority rollout lock parent is not a canonical root-controlled directory: $lock_parent" >&2
  exit 74
fi
if [[ ! -e "$lock_file" ]]; then
  install -o root -g root -m 0600 /dev/null "$lock_file"
fi
if [[ ! -f "$lock_file" || -L "$lock_file" || "$(readlink -f -- "$lock_file")" != "$lock_file" ]] \
  || [[ "$(stat -c '%u:%g:%a' -- "$lock_file" 2>/dev/null || true)" != "0:0:600" ]]; then
  echo "Authority rollout lock file is not a canonical root-controlled regular file: $lock_file" >&2
  exit 74
fi

prove_fd_lock() {
  local pid="$1" fd="$2" expected_file="$3" expected_inode
  [[ "$pid" =~ ^[1-9][0-9]*$ && "$fd" =~ ^[0-9]+$ ]] || return 1
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
  local target_fd="$1" expected_file="$2" expected_device_inode expected_inode
  local candidate fd candidate_device_inode candidate_inode
  local -a candidates=()
  expected_device_inode="$(stat -Lc '%d:%i' -- "$expected_file")"
  expected_inode="$(stat -Lc '%i' -- "$expected_file")"
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
  [[ "$marker" == "${lock_parent}/.authority-lock-owner."* \
    && -f "$marker" && ! -L "$marker" \
    && "$(readlink -f -- "$marker")" == "$marker" \
    && "$(stat -c '%u:%g:%a:%h' -- "$marker")" == "0:0:600:1" ]]
}

write_owner_marker() {
  local marker="$1" start_ticks
  assert_owner_marker "$marker" || return 1
  prove_fd_lock "$$" "$AUTHORITY_FD" "$lock_file" || return 1
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

assert_root_regular() {
  local path="$1" mode="$2"
  [[ -f "$path" && ! -L "$path" \
    && "$(readlink -f -- "$path")" == "$path" \
    && "$(stat -Lc '%u:%g:%a:%h' -- "$path")" == "0:0:${mode}:1" ]]
}

read_stable_active_release() {
  local expected_target release_id target_before target_after
  [[ -L "$pilot_app" && "$(stat -c '%u:%g' -- "$pilot_app")" == 0:0 ]] || return 1
  assert_root_regular "$pilot_active_record" 644 || return 1
  target_before="$(readlink -f -- "$pilot_app" 2>/dev/null || true)"
  release_id="$(/usr/bin/node --input-type=module - "$pilot_active_record" <<'NODE'
import { readFile } from "node:fs/promises";
const record = JSON.parse(await readFile(process.argv[2], "utf8"));
const releaseId = String(record?.releaseId || "");
if (!/^[A-Za-z0-9._-]{1,96}$/.test(releaseId)) process.exit(1);
process.stdout.write(releaseId);
NODE
)" || return 1
  expected_target="${pilot_releases}/${release_id}/app"
  [[ "$target_before" == "$expected_target" \
    && -d "$expected_target" && ! -L "$expected_target" \
    && "$(readlink -f -- "$expected_target")" == "$expected_target" \
    && "$(stat -Lc '%u:%g' -- "$expected_target")" == 0:0 ]] || return 1
  target_after="$(readlink -f -- "$pilot_app" 2>/dev/null || true)"
  [[ "$target_after" == "$target_before" ]] || return 1
  printf '%s\n%s\n' "$release_id" "$expected_target"
}

publish_shared_app_verification_intent() {
  local snapshot release_id expected_target start_ticks temporary
  prove_fd_lock "$$" "$AUTHORITY_FD" "$lock_file" || return 1
  if ! snapshot="$(read_stable_active_release)"; then
    # Bootstrap and repair operations may legitimately run without a stable
    # application pointer. They retain the lock, but receive no app-start
    # exception and therefore remain fail-closed at the recovery dependency.
    return 0
  fi
  release_id="${snapshot%%$'\n'*}"
  expected_target="${snapshot#*$'\n'}"
  start_ticks="$(awk '{print $22}' "/proc/$$/stat" 2>/dev/null || true)"
  [[ "$start_ticks" =~ ^[1-9][0-9]*$ ]] || return 1
  temporary="${shared_app_intent}.next.$$"
  umask 077
  {
    printf 'PID=%s\n' "$$"
    printf 'START_TICKS=%s\n' "$start_ticks"
    printf 'INTENT=shared-authority-app-verification\n'
    printf 'EXPECTED_TARGET=%s\n' "$expected_target"
    printf 'ACTIVE_RELEASE_ID=%s\n' "$release_id"
  } > "$temporary"
  chown root:root "$temporary"
  chmod 0600 "$temporary"
  sync -f "$temporary"
  mv -Tf -- "$temporary" "$shared_app_intent"
  sync -f "$lock_parent"
  assert_root_regular "$shared_app_intent" 600
}

if [[ ${!OWNER_REENTRY_ENV:-0} == 1 ]]; then
  owner_marker="${!OWNER_MARKER_ENV:-}"
  adopt_flock_path_fd "$AUTHORITY_FD" "$lock_file" \
    || { echo "Authority rollout lock fd hand-off could not be proved." >&2; exit 74; }
  write_owner_marker "$owner_marker" \
    || { echo "Authority rollout lock owner hand-off could not be proved." >&2; exit 74; }
  publish_shared_app_verification_intent \
    || { echo "Shared authority app-verification intent could not be published safely." >&2; exit 74; }
  unset "$OWNER_REENTRY_ENV" "$OWNER_MARKER_ENV"
  export MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD=1
  exec "$@"
fi

[[ -x /usr/bin/flock && -x /usr/bin/setsid ]] \
  || { echo "Authority rollout lock requires /usr/bin/flock and /usr/bin/setsid." >&2; exit 74; }
owner_marker="$(mktemp "${lock_parent}/.authority-lock-owner.XXXXXX")"
chown root:root "$owner_marker"
chmod 0600 "$owner_marker"
child_pid=""

cleanup() {
  if [[ -n "$child_pid" ]] && owner_marker_matches_child "$owner_marker" "$child_pid"; then
    /usr/bin/flock --exclusive --wait 2 --conflict-exit-code 75 \
      "$lock_file" /usr/bin/env -i \
      PATH=/usr/sbin:/usr/bin:/sbin:/bin /bin/bash --noprofile --norc -ceu '
      intent="$1"; expected_pid="$2"; lock_parent="$3"
      if [[ -e "$intent" || -L "$intent" ]]; then
        [[ -f "$intent" && ! -L "$intent" \
          && "$(readlink -f -- "$intent")" == "$intent" \
          && "$(stat -Lc "%u:%g:%a:%h" -- "$intent")" == "0:0:600:1" ]] \
          || exit 74
        actual_pid="$(sed -n "s/^PID=//p" "$intent" | head -n 1)"
        if [[ "$actual_pid" == "$expected_pid" ]]; then
          rm -f -- "$intent"
          sync -f "$lock_parent"
        fi
      fi
    ' mes-shared-app-intent-cleanup "$shared_app_intent" "$child_pid" "$lock_parent" \
      || echo "Shared authority app-verification intent cleanup did not complete safely." >&2
  fi
  rm -f -- "$owner_marker"
}
trap cleanup EXIT

forward_signal() {
  local signal="$1" exit_status="$2" child_signal="${3:-$1}" attempts=0
  trap - HUP INT TERM
  if [[ -n "$child_pid" ]] && kill -0 "$child_pid" 2>/dev/null; then
    # A non-interactive bash starts asynchronous children with SIGINT ignored.
    # Translate INT to TERM for the lock-owner child while retaining the
    # caller-facing 130 status. Bound the wait and force release if a protected
    # command ignores the forwarded termination signal.
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

/usr/bin/setsid /usr/bin/env \
  "${OWNER_REENTRY_ENV}=1" \
  "${OWNER_MARKER_ENV}=${owner_marker}" \
  /usr/bin/flock --exclusive --nonblock \
    --conflict-exit-code "$FLOCK_CONFLICT_STATUS" --no-fork \
    "$lock_file" /usr/bin/env -u BASH_ENV -u ENV -u CDPATH \
      /bin/bash --noprofile --norc "$(readlink -f -- "$0")" "$@" &
child_pid=$!
set +e
wait "$child_pid"
child_status=$?
set -e

if owner_marker_matches_child "$owner_marker" "$child_pid"; then
  # Preserve the command's status verbatim, including 75 or 200. The marker
  # proves that flock acquired the lock before the command produced it.
  exit "$child_status"
fi
if [[ "$child_status" -eq "$FLOCK_CONFLICT_STATUS" ]]; then
  echo "Another shared-state authority rollout or contour sync is active: $lock_file" >&2
  exit 75
fi
echo "Authority rollout lock owner failed before the protected command started." >&2
exit "$child_status"
