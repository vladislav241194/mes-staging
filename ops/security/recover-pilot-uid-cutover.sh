#!/usr/bin/env bash
# Restores the pre-cutover Pilot service/env/ownership contract when the
# one-time runtime UID installer was interrupted before its durable commit.
set -euo pipefail
set +x

[[ ${EUID} -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
readonly JOURNAL_DIR="/var/lib/mes/pilot-uid-cutover"
readonly BUNDLE_DIR="${MES_PILOT_RUNTIME_SECURITY_BUNDLE_DIR:-}"
readonly RELEASE_AUTHORITY_LOCK="/run/lock/mes/mes-authority-rollout.lock"
[[ "$BUNDLE_DIR" =~ ^/usr/local/libexec/mes/runtime-security-bundles/[0-9a-f]{64}$ ]] \
  || { echo "UID-cutover recovery must be entered through the fixed bundle dispatcher." >&2; exit 1; }
[[ ${MES_RELEASE_AUTHORITY_LOCK_HELD:-0} == 1 \
  && ${MES_RELEASE_AUTHORITY_LOCK_FD:-} == 9 \
  && -f "$RELEASE_AUTHORITY_LOCK" && ! -L "$RELEASE_AUTHORITY_LOCK" \
  && -e /proc/$$/fd/9 \
  && "$(stat -Lc '%d:%i' -- /proc/$$/fd/9 2>/dev/null || true)" == "$(stat -Lc '%d:%i' -- "$RELEASE_AUTHORITY_LOCK" 2>/dev/null || true)" ]] \
  || { echo "UID-cutover recovery requires the canonical inherited release authority fd9." >&2; exit 1; }
authority_lock_inode="$(stat -Lc '%i' -- "$RELEASE_AUTHORITY_LOCK")"
awk -v owner_pid="$$" -v lock_inode="$authority_lock_inode" '
  $1 == "lock:" && $3 == "FLOCK" && $5 == "WRITE" && $6 == owner_pid {
    split($7, identity, ":");
    if (identity[3] == lock_inode) found = 1;
  }
  END { exit(found ? 0 : 1) }
' /proc/$$/fdinfo/9 \
  || { echo "UID-cutover recovery did not inherit exact ownership of release authority fd9." >&2; exit 1; }
readonly ROOT_LOCK_LIBRARY="${BUNDLE_DIR}/pilot-root-identity-lock.sh"
readonly WRITER_QUIESCE_MARKER="/run/lock/mes/pilot-runtime-writers-quiesced"

[[ -f "$ROOT_LOCK_LIBRARY" && ! -L "$ROOT_LOCK_LIBRARY" \
  && "$(stat -c '%u:%g:%a' "$ROOT_LOCK_LIBRARY")" == 0:0:555 ]] \
  || { echo "Fixed root identity lock helper is unavailable." >&2; exit 1; }
# shellcheck source=pilot-root-identity-lock.sh
source "$ROOT_LOCK_LIBRARY"
if [[ ! -e "$JOURNAL_DIR" && ! -L "$JOURNAL_DIR" \
  && ! -e "$WRITER_QUIESCE_MARKER" && ! -L "$WRITER_QUIESCE_MARKER" ]]; then exit 0; fi
set +e
pilot_open_root_identity_lock "$0" "$@"
lock_status=$?
set -e
case "$lock_status" in
  0) ;;
  "$PILOT_IDENTITY_LOCK_BUSY")
    if pilot_validate_app_verification_intent; then
      echo "Active root identity verification intent proved; only the app gate may continue." >&2
      exit 0
    fi
    echo "UID-cutover recovery is busy without a valid app-verification intent." >&2
    exit 1
    ;;
  "$PILOT_IDENTITY_LOCK_UNSAFE")
    echo "UID-cutover recovery refused an unsafe identity lock path." >&2
    exit 1
    ;;
  *)
    echo "UID-cutover recovery failed to classify the identity lock ($lock_status)." >&2
    exit 1
    ;;
esac
pilot_remove_stale_app_verification_intent

restore_timer_state() {
  local expected="$1"
  [[ "$expected" =~ ^[01]$ ]] || return 1
  if [[ "$expected" -eq 1 ]]; then
    systemctl start mes-pilot-domain-snapshot-sync.timer
    systemctl is-active --quiet mes-pilot-domain-snapshot-sync.timer
  else
    systemctl stop mes-pilot-domain-snapshot-sync.timer
    ! systemctl is-active --quiet mes-pilot-domain-snapshot-sync.timer
  fi
}

marker_timer_was_active=0
marker_present=0
if [[ -e "$WRITER_QUIESCE_MARKER" || -L "$WRITER_QUIESCE_MARKER" ]]; then
  marker_present=1
  [[ -f "$WRITER_QUIESCE_MARKER" && ! -L "$WRITER_QUIESCE_MARKER" \
    && "$(readlink -f -- "$WRITER_QUIESCE_MARKER")" == "$WRITER_QUIESCE_MARKER" \
    && "$(stat -c '%u:%g:%a:%h' "$WRITER_QUIESCE_MARKER")" == 0:0:600:1 ]] \
    || { echo "Writer-quiesce marker is unsafe." >&2; exit 1; }
  marker_line="$(grep -m1 '^TIMER_WAS_ACTIVE=' "$WRITER_QUIESCE_MARKER")"
  marker_timer_was_active="${marker_line#TIMER_WAS_ACTIVE=}"
  [[ "$marker_timer_was_active" =~ ^[01]$ ]] || { echo "Writer-quiesce timer state is invalid." >&2; exit 1; }
fi

if [[ ! -e "$JOURNAL_DIR" && ! -L "$JOURNAL_DIR" ]]; then
  systemctl unmask --runtime mes-pilot-domain-migrate.service mes-pilot-domain-import.service mes-pilot-domain-snapshot-sync.service >/dev/null 2>&1 || true
  restore_timer_state "$marker_timer_was_active"
  rm -f -- "$WRITER_QUIESCE_MARKER"
  sync -f "$(dirname "$WRITER_QUIESCE_MARKER")"
  echo "Recovered the interrupted pre-journal writer quiesce."
  exit 0
fi

[[ -d "$JOURNAL_DIR" && ! -L "$JOURNAL_DIR" && "$(readlink -f -- "$JOURNAL_DIR")" == "$JOURNAL_DIR" \
  && "$(stat -c '%u:%g:%a' "$JOURNAL_DIR")" == 0:0:700 ]] \
  || { echo "UID-cutover journal is unsafe." >&2; exit 1; }
for required in phase metadata managed-paths; do
  path="$JOURNAL_DIR/$required"
  [[ -f "$path" && ! -L "$path" && "$(readlink -f -- "$path")" == "$path" \
    && "$(stat -c '%u:%g:%a' "$path")" == 0:0:600 ]] \
    || { echo "UID-cutover journal entry is unsafe: $path" >&2; exit 1; }
done

clear_journal() {
  local clearing="${JOURNAL_DIR}.clearing.$$"
  mv -T -- "$JOURNAL_DIR" "$clearing"
  sync -f "$(dirname "$JOURNAL_DIR")"
  find "$clearing" -xdev -type f -exec shred -u -- {} + 2>/dev/null || true
  rm -rf -- "$clearing"
  sync -f "$(dirname "$JOURNAL_DIR")"
}

phase="$(tr -d '[:space:]' < "$JOURNAL_DIR/phase")"
if [[ "$phase" == committed ]]; then
  if [[ "$marker_present" -eq 0 ]]; then
    committed_timer_line="$(grep -m1 '^TIMER_WAS_ACTIVE=' "$JOURNAL_DIR/metadata")"
    marker_timer_was_active="${committed_timer_line#TIMER_WAS_ACTIVE=}"
    [[ "$marker_timer_was_active" =~ ^[01]$ ]] || { echo "Invalid committed UID-cutover timer metadata." >&2; exit 1; }
  fi
  systemctl unmask --runtime mes-pilot-domain-migrate.service mes-pilot-domain-import.service mes-pilot-domain-snapshot-sync.service >/dev/null 2>&1 || true
  restore_timer_state "$marker_timer_was_active"
  clear_journal
  rm -f -- "$WRITER_QUIESCE_MARKER"
  sync -f "$(dirname "$WRITER_QUIESCE_MARKER")"
  echo "Cleared the journal from an already committed Pilot UID cutover."
  exit 0
fi
[[ "$phase" == prepared ]] || { echo "Unknown Pilot UID-cutover journal phase." >&2; exit 1; }

required_managed_paths=(
  /etc/systemd/system/mes-pilot.service
  /etc/mes/mes-pilot-domain.env
  /etc/mes/mes-pilot-domain-migrator.env
  /etc/mes/mes-pilot-admin-auth.env
  /etc/mes/mes-pilot-public-auth.env
  /etc/mes/mes-pilot-employee-auth.env
  /etc/mes/mes-pilot.env
  /etc/systemd/system/mes-pilot.service.d/10-hardening.conf
  /etc/systemd/system/mes-pilot.service.d/20-admin-auth.conf
  /etc/systemd/system/mes-pilot.service.d/30-public-auth.conf
  /etc/systemd/system/mes-pilot-domain-migrate.service
  /etc/systemd/system/mes-pilot-domain-import.service
  /etc/systemd/system/mes-pilot-domain-snapshot-sync.service
  /etc/systemd/system/mes-pilot-domain-snapshot-sync.timer
  /etc/systemd/system/mes-pilot-domain-runtime-credential-check.service
  /etc/systemd/system/mes-pilot-domain-migrator-credential-check.service
  /etc/systemd/system/mes-pilot-credential-rotation-recovery.service
)
# Backward-compatible recognition for a journal created by the pre-bundle
# installer. New journals never project these helpers one-by-one. If any old
# helper entry is present, require the complete old helper set before restore.
legacy_optional_managed_paths=(
  /usr/local/libexec/mes/pilot-root-identity-lock.sh
  /usr/local/libexec/mes/pilot-runtime-transition-gate.sh
  /usr/local/libexec/mes/pilot-credential-rotation-journal.sh
  /usr/local/libexec/mes/recover-pilot-uid-cutover.sh
  /usr/local/libexec/mes/recover-pilot-credential-rotation.sh
  /usr/local/libexec/mes/pilot-check-postgres-credential.mjs
)
declare -A allowed=() seen=()
for path in "${required_managed_paths[@]}" "${legacy_optional_managed_paths[@]}"; do allowed["$path"]=1; done
legacy_manifest_seen=0

restore_atomic() {
  local backup="$1"
  local target="$2"
  local temporary
  [[ -f "$backup" && ! -L "$backup" && "$(readlink -f -- "$backup")" == "$backup" ]] \
    || { echo "UID-cutover backup is missing or unsafe: $backup" >&2; return 1; }
  temporary="$(mktemp "${target}.uid-restore.XXXXXX")"
  cp --reflink=never --preserve=mode,ownership,timestamps -- "$backup" "$temporary"
  sync -f "$temporary"
  mv -fT -- "$temporary" "$target"
  sync -f "$(dirname "$target")"
}

pilot_stop_running_consumer mes-pilot-domain-migrate.service
pilot_stop_running_consumer mes-pilot-domain-import.service
pilot_stop_running_consumer mes-pilot-domain-snapshot-sync.service
pilot_stop_running_consumer mes-pilot.service
while IFS='|' read -r present path; do
  [[ "$present" =~ ^[01]$ && -n "${allowed[$path]:-}" && -z "${seen[$path]:-}" ]] \
    || { echo "UID-cutover managed-path manifest is invalid." >&2; exit 1; }
  seen["$path"]=1
  for legacy_path in "${legacy_optional_managed_paths[@]}"; do
    [[ "$path" != "$legacy_path" ]] || legacy_manifest_seen=1
  done
  if [[ "$present" -eq 1 ]]; then
    restore_atomic "$JOURNAL_DIR/files$path" "$path"
  else
    rm -f -- "$path"
    sync -f "$(dirname "$path")"
  fi
done < "$JOURNAL_DIR/managed-paths"
for path in "${required_managed_paths[@]}"; do
  [[ -n "${seen[$path]:-}" ]] || { echo "UID-cutover manifest omitted $path" >&2; exit 1; }
done
if [[ $legacy_manifest_seen -eq 1 ]]; then
  for path in "${legacy_optional_managed_paths[@]}"; do
    [[ -n "${seen[$path]:-}" ]] || { echo "Legacy UID-cutover manifest omitted $path" >&2; exit 1; }
  done
fi

metadata_value() {
  local key="$1"
  local line
  line="$(grep -m1 "^${key}=" "$JOURNAL_DIR/metadata")"
  printf '%s\n' "${line#*=}"
}
journal_timer_was_active="$(metadata_value TIMER_WAS_ACTIVE)"
[[ "$journal_timer_was_active" =~ ^[01]$ ]] || { echo "Invalid UID-cutover timer metadata." >&2; exit 1; }
[[ "$marker_present" -eq 1 ]] || marker_timer_was_active="$journal_timer_was_active"
restore_tree_root() {
  local key="$1" path="$2" value uid gid mode
  value="$(metadata_value "$key")"
  [[ "$value" =~ ^([0-9]+):([0-9]+):([0-7]{3,4})$ ]] || { echo "Invalid UID-cutover metadata for $key" >&2; exit 1; }
  uid="${BASH_REMATCH[1]}"; gid="${BASH_REMATCH[2]}"; mode="${BASH_REMATCH[3]}"
  chown "$uid:$gid" "$path"
  chmod "$mode" "$path"
}

# Only deploy-owned nodes were moved forward, so the reverse selectors cannot
# seize unrelated root-owned content that existed before the cutover.
find /srv/mes/pilot/audit /srv/mes/pilot/runtime -xdev -user mes-pilot -group mes-pilot -exec chown deploy:deploy -- {} +
find /srv/mes/pilot/shared-state /srv/mes/pilot/backups -xdev -user mes-pilot -group mes-pilot-data -exec chown deploy:deploy -- {} +
restore_tree_root SHARED /srv/mes/pilot/shared-state
restore_tree_root BACKUPS /srv/mes/pilot/backups
restore_tree_root AUDIT /srv/mes/pilot/audit
restore_tree_root RUNTIME /srv/mes/pilot/runtime
restore_tree_root STATE /srv/mes/pilot/shared-state/mes-pilot-shared-state-v1.json
import_metadata="$(metadata_value IMPORT_EXPORT)"
if [[ "$import_metadata" != absent ]]; then
  [[ "$import_metadata" =~ ^([0-9]+):([0-9]+):([0-7]{3,4})$ ]] || { echo "Invalid import-export metadata." >&2; exit 1; }
  [[ -f /srv/mes/pilot/backups/domain-export-initial.json && ! -L /srv/mes/pilot/backups/domain-export-initial.json ]] \
    || { echo "Import export disappeared during UID cutover." >&2; exit 1; }
  chown "${BASH_REMATCH[1]}:${BASH_REMATCH[2]}" /srv/mes/pilot/backups/domain-export-initial.json
  chmod "${BASH_REMATCH[3]}" /srv/mes/pilot/backups/domain-export-initial.json
fi

systemctl unmask --runtime mes-pilot-domain-migrate.service mes-pilot-domain-import.service mes-pilot-domain-snapshot-sync.service >/dev/null 2>&1 || true
systemctl daemon-reload
app_main_pid="$(systemctl show mes-pilot.service --property=MainPID --value 2>/dev/null || true)"
[[ "$app_main_pid" == 0 ]] || { echo "Pilot unexpectedly has a live MainPID during UID-cutover recovery." >&2; exit 1; }
restore_timer_state "$marker_timer_was_active"
clear_journal
rm -f -- "$WRITER_QUIESCE_MARKER"
sync -f "$(dirname "$WRITER_QUIESCE_MARKER")"
echo "Recovered the interrupted Pilot UID cutover before application start."
