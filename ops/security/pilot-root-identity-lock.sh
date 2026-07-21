#!/usr/bin/env bash
# Opens the shared Pilot identity/credential flock through fd 8. Authority
# rollout serialization owns fd 9, so these two independent locks must never
# overwrite each other's open file description. The root-only
# directory prevents deploy (or any other unprivileged UID) from manufacturing
# a busy lock that would bypass boot recovery. Callers must distinguish a real
# lock conflict from an unsafe lock path: only the former can ever participate
# in the narrowly proved app-verification exception below.

readonly PILOT_IDENTITY_LOCK_BUSY=75
readonly PILOT_IDENTITY_LOCK_UNSAFE=76
readonly PILOT_IDENTITY_LOCK_PARENT="/run/lock/mes"
readonly PILOT_IDENTITY_LOCK_FILE="${PILOT_IDENTITY_LOCK_PARENT}/pilot-runtime-uid-isolation.lock"
readonly PILOT_APP_VERIFICATION_INTENT="${PILOT_IDENTITY_LOCK_PARENT}/pilot-app-verification.intent"
readonly PILOT_IDENTITY_LOCK_ACQUIRE_RESULT_ENV="MES_PILOT_IDENTITY_LOCK_ACQUIRE_RESULT"

pilot_identity_lock_unsafe() {
  echo "$*" >&2
  return "$PILOT_IDENTITY_LOCK_UNSAFE"
}

pilot_fdinfo_contains_identity_flock() {
  local fdinfo_path="$1" owner_pid="$2" lock_inode="$3"
  [[ -r "$fdinfo_path" ]] || return 1
  awk -v owner_pid="$owner_pid" -v lock_inode="$lock_inode" '
    $1 == "lock:" && $3 == "FLOCK" && $5 == "WRITE" && $6 == owner_pid {
      split($7, identity, ":");
      if (identity[3] == lock_inode) found = 1;
    }
    END { exit(found ? 0 : 1) }
  ' "$fdinfo_path"
}

pilot_assert_root_identity_lock_path() {
  [[ -d /run/lock && ! -L /run/lock && "$(readlink -f -- /run/lock)" == /run/lock \
    && "$(stat -c '%u:%g' /run/lock)" == 0:0 ]] \
    || { pilot_identity_lock_unsafe "Pilot identity lock parent /run/lock is unsafe."; return; }
  if [[ -e "$PILOT_IDENTITY_LOCK_PARENT" || -L "$PILOT_IDENTITY_LOCK_PARENT" ]]; then
    [[ -d "$PILOT_IDENTITY_LOCK_PARENT" && ! -L "$PILOT_IDENTITY_LOCK_PARENT" \
      && "$(readlink -f -- "$PILOT_IDENTITY_LOCK_PARENT")" == "$PILOT_IDENTITY_LOCK_PARENT" \
      && "$(stat -c '%u:%g:%a' "$PILOT_IDENTITY_LOCK_PARENT")" == 0:0:700 ]] \
      || { pilot_identity_lock_unsafe "Pilot identity lock directory must be canonical root:root 0700."; return; }
  else
    install -d -o root -g root -m 0700 "$PILOT_IDENTITY_LOCK_PARENT" \
      || { pilot_identity_lock_unsafe "Pilot identity lock directory could not be created safely."; return; }
  fi

  if [[ ! -e "$PILOT_IDENTITY_LOCK_FILE" && ! -L "$PILOT_IDENTITY_LOCK_FILE" ]]; then
    install -o root -g root -m 0600 /dev/null "$PILOT_IDENTITY_LOCK_FILE" \
      || { pilot_identity_lock_unsafe "Pilot identity lock file could not be created safely."; return; }
  fi
  [[ -f "$PILOT_IDENTITY_LOCK_FILE" && ! -L "$PILOT_IDENTITY_LOCK_FILE" \
    && "$(readlink -f -- "$PILOT_IDENTITY_LOCK_FILE")" == "$PILOT_IDENTITY_LOCK_FILE" \
    && "$(stat -c '%u:%g:%a:%h' "$PILOT_IDENTITY_LOCK_FILE")" == 0:0:600:1 ]] \
    || { pilot_identity_lock_unsafe "Pilot identity lock file must be canonical root:root 0600 with one link."; return; }
}

pilot_assert_root_identity_lock_held() {
  local owner_pid="${MES_PILOT_IDENTITY_LOCK_OWNER_PID:-}"
  local lock_device_inode owner_fd_device_inode owner_start current_start lock_inode
  pilot_assert_root_identity_lock_path || return
  [[ "$owner_pid" =~ ^[1-9][0-9]*$ && -d "/proc/${owner_pid}" \
    && "$(stat -c %u "/proc/${owner_pid}")" == 0 ]] \
    || { pilot_identity_lock_unsafe "Pilot identity lock owner PID is invalid."; return; }
  [[ -e "/proc/${owner_pid}/fd/8" ]] \
    || { pilot_identity_lock_unsafe "Pilot identity lock owner no longer exposes fd 8."; return; }
  lock_device_inode="$(stat -Lc '%d:%i' "$PILOT_IDENTITY_LOCK_FILE")"
  owner_fd_device_inode="$(stat -Lc '%d:%i' "/proc/${owner_pid}/fd/8" 2>/dev/null || true)"
  [[ "$owner_fd_device_inode" == "$lock_device_inode" ]] \
    || { pilot_identity_lock_unsafe "Pilot identity lock fd does not name the fixed lock file."; return; }
  owner_start="${MES_PILOT_IDENTITY_LOCK_OWNER_START_TICKS:-}"
  current_start="$(awk '{print $22}' "/proc/${owner_pid}/stat" 2>/dev/null || true)"
  [[ "$owner_start" =~ ^[1-9][0-9]*$ && "$current_start" == "$owner_start" ]] \
    || { pilot_identity_lock_unsafe "Pilot identity lock owner start time is invalid."; return; }
  lock_inode="$(stat -Lc '%i' "$PILOT_IDENTITY_LOCK_FILE")"
  # ProcSubset=pid intentionally hides the global kernel lock table in the
  # app/writer service namespaces. fdinfo is per-process, remains available to the root
  # gate, and proves that this exact fd owns the exact FLOCK inode.
  pilot_fdinfo_contains_identity_flock "/proc/${owner_pid}/fdinfo/8" "$owner_pid" "$lock_inode" \
    || { pilot_identity_lock_unsafe "Pilot identity lock owner does not own the kernel flock."; return; }
}

pilot_classify_identity_flock_status() {
  local flock_status="$1"
  case "$flock_status" in
    0) return 0 ;;
    1) return "$PILOT_IDENTITY_LOCK_BUSY" ;;
    *) pilot_identity_lock_unsafe "Pilot identity kernel flock failed unexpectedly (status $flock_status)." ;;
  esac
}

pilot_open_root_identity_lock() {
  local acquire_result reentry_command owner_start expected_device_inode
  pilot_assert_root_identity_lock_path || return
  acquire_result="${!PILOT_IDENTITY_LOCK_ACQUIRE_RESULT_ENV:-}"
  case "$acquire_result" in
    held)
      unset "$PILOT_IDENTITY_LOCK_ACQUIRE_RESULT_ENV"
      export MES_PILOT_IDENTITY_LOCK_OWNER_PID="$$"
      owner_start="$(awk '{print $22}' "/proc/$$/stat" 2>/dev/null || true)"
      export MES_PILOT_IDENTITY_LOCK_OWNER_START_TICKS="$owner_start"
      pilot_assert_root_identity_lock_held || return
      export MES_PILOT_IDENTITY_LOCK_HELD=1
      return 0
      ;;
    busy)
      unset "$PILOT_IDENTITY_LOCK_ACQUIRE_RESULT_ENV"
      return "$PILOT_IDENTITY_LOCK_BUSY"
      ;;
    "") ;;
    *) pilot_identity_lock_unsafe "Pilot identity lock acquisition result is invalid."; return ;;
  esac
  [[ $# -gt 0 ]] \
    || { pilot_identity_lock_unsafe "Pilot identity lock acquisition requires an exact re-entry command."; return; }
  reentry_command="$(readlink -f -- "$1" 2>/dev/null || true)"
  [[ -n "$reentry_command" && -f "$reentry_command" && ! -L "$reentry_command" && -x "$reentry_command" ]] \
    || { pilot_identity_lock_unsafe "Pilot identity lock re-entry command is unavailable or unsafe."; return; }
  shift
  [[ -x /usr/bin/python3 ]] \
    || { pilot_identity_lock_unsafe "Pilot identity lock requires /usr/bin/python3."; return; }
  expected_device_inode="$(stat -Lc '%d:%i' -- "$PILOT_IDENTITY_LOCK_FILE")"
  # A tiny fixed Python syscall bridge is necessary here: unlike util-linux's
  # file-path command form, it can re-enter the caller in the *same PID* on
  # both success and EWOULDBLOCK. That lets the caller execute its busy-policy
  # case without forking away an already-owned fd 9. On success dup2 fixes the
  # locked open-file-description at fd 8 before execve.
  exec /usr/bin/python3 -I -S -c '
import errno
import fcntl
import os
import sys

path, expected_identity, command, *arguments = sys.argv[1:]
result_key = "MES_PILOT_IDENTITY_LOCK_ACQUIRE_RESULT"
fd = os.open(path, os.O_RDWR | os.O_CLOEXEC)
metadata = os.fstat(fd)
actual_identity = f"{metadata.st_dev}:{metadata.st_ino}"
if actual_identity != expected_identity:
    os.close(fd)
    raise SystemExit(76)
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError as error:
    if error.errno not in (errno.EACCES, errno.EAGAIN):
        os.close(fd)
        raise
    os.close(fd)
    environment = dict(os.environ)
    environment[result_key] = "busy"
    os.execve(command, [command, *arguments], environment)
if fd == 8:
    os.set_inheritable(fd, True)
else:
    os.dup2(fd, 8, inheritable=True)
    os.close(fd)
environment = dict(os.environ)
environment[result_key] = "held"
os.execve(command, [command, *arguments], environment)
' "$PILOT_IDENTITY_LOCK_FILE" "$expected_device_inode" "$reentry_command" "$@"
}

pilot_validate_app_verification_intent() {
  local intent_pid intent_start intent_value
  pilot_assert_root_identity_lock_path || return
  [[ -f "$PILOT_APP_VERIFICATION_INTENT" && ! -L "$PILOT_APP_VERIFICATION_INTENT" \
    && "$(readlink -f -- "$PILOT_APP_VERIFICATION_INTENT")" == "$PILOT_APP_VERIFICATION_INTENT" \
    && "$(stat -c '%u:%g:%a:%h' "$PILOT_APP_VERIFICATION_INTENT")" == 0:0:600:1 ]] \
    || { pilot_identity_lock_unsafe "Pilot app-verification intent is missing or unsafe."; return; }
  [[ "$(wc -l < "$PILOT_APP_VERIFICATION_INTENT")" -eq 3 ]] \
    || { pilot_identity_lock_unsafe "Pilot app-verification intent has an invalid shape."; return; }
  intent_pid="$(sed -n 's/^PID=//p' "$PILOT_APP_VERIFICATION_INTENT")"
  intent_start="$(sed -n 's/^START_TICKS=//p' "$PILOT_APP_VERIFICATION_INTENT")"
  intent_value="$(sed -n 's/^INTENT=//p' "$PILOT_APP_VERIFICATION_INTENT")"
  [[ "$intent_value" == app-verification && "$intent_pid" =~ ^[1-9][0-9]*$ \
    && "$intent_start" =~ ^[1-9][0-9]*$ ]] \
    || { pilot_identity_lock_unsafe "Pilot app-verification intent values are invalid."; return; }
  MES_PILOT_IDENTITY_LOCK_OWNER_PID="$intent_pid" \
  MES_PILOT_IDENTITY_LOCK_OWNER_START_TICKS="$intent_start" \
    pilot_assert_root_identity_lock_held
}

pilot_write_app_verification_intent() {
  local owner_pid owner_start temporary
  pilot_assert_root_identity_lock_held || return
  owner_pid="$MES_PILOT_IDENTITY_LOCK_OWNER_PID"
  owner_start="$MES_PILOT_IDENTITY_LOCK_OWNER_START_TICKS"
  if [[ -e "$PILOT_APP_VERIFICATION_INTENT" || -L "$PILOT_APP_VERIFICATION_INTENT" ]]; then
    pilot_validate_app_verification_intent || return
    [[ "$(sed -n 's/^PID=//p' "$PILOT_APP_VERIFICATION_INTENT")" == "$owner_pid" \
      && "$(sed -n 's/^START_TICKS=//p' "$PILOT_APP_VERIFICATION_INTENT")" == "$owner_start" ]] \
      || { pilot_identity_lock_unsafe "Pilot app-verification intent belongs to another lock owner."; return; }
    return 0
  fi
  temporary="$(mktemp "${PILOT_APP_VERIFICATION_INTENT}.XXXXXX")"
  {
    printf 'PID=%s\n' "$owner_pid"
    printf 'START_TICKS=%s\n' "$owner_start"
    printf 'INTENT=app-verification\n'
  } > "$temporary"
  chown root:root "$temporary"
  chmod 0600 "$temporary"
  sync -f "$temporary"
  mv -T -- "$temporary" "$PILOT_APP_VERIFICATION_INTENT"
  sync -f "$PILOT_IDENTITY_LOCK_PARENT"
  pilot_validate_app_verification_intent
}

pilot_clear_app_verification_intent() {
  [[ ! -e "$PILOT_APP_VERIFICATION_INTENT" && ! -L "$PILOT_APP_VERIFICATION_INTENT" ]] && return 0
  pilot_validate_app_verification_intent || return
  rm -f -- "$PILOT_APP_VERIFICATION_INTENT"
  sync -f "$PILOT_IDENTITY_LOCK_PARENT"
}

pilot_remove_stale_app_verification_intent() {
  pilot_assert_root_identity_lock_held || return
  [[ ! -e "$PILOT_APP_VERIFICATION_INTENT" && ! -L "$PILOT_APP_VERIFICATION_INTENT" ]] && return 0
  [[ -f "$PILOT_APP_VERIFICATION_INTENT" && ! -L "$PILOT_APP_VERIFICATION_INTENT" \
    && "$(readlink -f -- "$PILOT_APP_VERIFICATION_INTENT")" == "$PILOT_APP_VERIFICATION_INTENT" \
    && "$(stat -c '%u:%g:%a:%h' "$PILOT_APP_VERIFICATION_INTENT")" == 0:0:600:1 ]] \
    || { pilot_identity_lock_unsafe "Stale Pilot app-verification intent is unsafe."; return; }
  rm -f -- "$PILOT_APP_VERIFICATION_INTENT"
  sync -f "$PILOT_IDENTITY_LOCK_PARENT"
}

pilot_stop_running_consumer() {
  local unit="$1" main_pid current_pid
  main_pid="$(systemctl show "$unit" --property=MainPID --value 2>/dev/null || true)"
  [[ "$main_pid" =~ ^[0-9]+$ ]] \
    || { pilot_identity_lock_unsafe "Cannot determine MainPID for $unit."; return; }
  [[ "$main_pid" -ne 0 ]] || return 0
  [[ -d "/proc/${main_pid}" ]] \
    || { pilot_identity_lock_unsafe "$unit reports a stale MainPID."; return; }
  systemctl stop "$unit"
  current_pid="$(systemctl show "$unit" --property=MainPID --value 2>/dev/null || true)"
  [[ "$current_pid" == 0 ]] \
    || { pilot_identity_lock_unsafe "$unit still has a live MainPID after stop."; return; }
}
