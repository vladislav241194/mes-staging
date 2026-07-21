#!/usr/bin/env bash
set -euo pipefail

export PATH=/usr/sbin:/usr/bin:/sbin:/bin

FIXED_ROOT="/usr/local/libexec/mes/active-bundle"
LOCK_WRAPPER="${FIXED_ROOT}/with-pilot-release-authority-lock.sh"
SEAL_HELPER="${FIXED_ROOT}/release-root-seal-verify.mjs"
SWITCH_HELPER="${FIXED_ROOT}/release-switch-journal.mjs"
REINODE_HELPER="${FIXED_ROOT}/release-root-reinode-active.mjs"
TRANSACTION_ROOT="/srv/mes/pilot/reinode-transactions"
consumer=""
locked=0

for argument in "$@"; do
  case "$argument" in
    --consumer=app|--consumer=writer) consumer="${argument#*=}" ;;
    --locked) locked=1 ;;
    *) echo "Unknown release recovery option: $argument" >&2; exit 2 ;;
  esac
done
[[ -n "$consumer" ]] || { echo "Release recovery requires --consumer=app|writer." >&2; exit 2; }
[[ ${EUID} -eq 0 ]] || { echo "Release recovery requires uid 0." >&2; exit 73; }

if [[ $locked -ne 1 ]]; then
  busy_policy="fail"
  [[ "$consumer" == "app" ]] && busy_policy="app-intent"
  exec /bin/bash "$LOCK_WRAPPER" \
    --operation="release-recovery-${consumer}" \
    --busy-policy="$busy_policy" \
    -- /bin/bash "$0" --consumer="$consumer" --locked
fi

[[ "${MES_RELEASE_AUTHORITY_LOCK_HELD:-}" == "1" && "${MES_RELEASE_AUTHORITY_LOCK_FD:-}" == "9" ]] \
  || { echo "Release recovery did not inherit authority fd9." >&2; exit 74; }
authority_lock="/run/lock/mes/mes-authority-rollout.lock"
[[ -f "$authority_lock" && ! -L "$authority_lock" \
  && "$(readlink -f -- "$authority_lock")" == "$authority_lock" \
  && "$(stat -Lc '%u:%g:%a:%h' -- "$authority_lock")" == 0:0:600:1 \
  && -e /proc/$$/fd/9 \
  && "$(stat -Lc '%d:%i' -- /proc/$$/fd/9 2>/dev/null || true)" == "$(stat -Lc '%d:%i' -- "$authority_lock")" ]] \
  || { echo "Release recovery fd9 does not name the canonical authority lock." >&2; exit 74; }
authority_inode="$(stat -Lc '%i' -- "$authority_lock")"
awk -v owner_pid="$$" -v lock_inode="$authority_inode" '
  $1 == "lock:" && $3 == "FLOCK" && $5 == "WRITE" && $6 == owner_pid {
    split($7, identity, ":");
    if (identity[3] == lock_inode) found = 1;
  }
  END { exit(found ? 0 : 1) }
' /proc/$$/fdinfo/9 \
  || { echo "Release recovery could not prove exact authority lock ownership." >&2; exit 74; }
/usr/bin/node "$SEAL_HELPER" bundle >/dev/null

pending_transactions=()
if [[ -e "$TRANSACTION_ROOT" || -L "$TRANSACTION_ROOT" ]]; then
  [[ -d "$TRANSACTION_ROOT" && ! -L "$TRANSACTION_ROOT" \
    && "$(readlink -f -- "$TRANSACTION_ROOT")" == "$TRANSACTION_ROOT" \
    && "$(stat -Lc '%u:%g:%a' -- "$TRANSACTION_ROOT")" == 0:0:700 ]] \
    || { echo "Re-inode transaction root is unsafe." >&2; exit 74; }
  while IFS= read -r -d '' journal_path; do
    [[ -f "$journal_path" && ! -L "$journal_path" \
      && "$(stat -Lc '%u:%g:%a' -- "$journal_path")" == 0:0:600 ]] \
      || { echo "Re-inode transaction journal is unsafe: $journal_path" >&2; exit 74; }
    transaction_state="$(/usr/bin/node --input-type=module - "$journal_path" <<'NODE'
import { readFile } from "node:fs/promises";
const path = process.argv[2];
const value = JSON.parse(await readFile(path, "utf8"));
if (!/^[A-Za-z0-9._-]{1,128}$/.test(String(value?.transactionId || ""))) process.exit(74);
process.stdout.write(`${value.transactionId}\t${String(value.phase || "")}`);
NODE
)"
    transaction_id="${transaction_state%%$'\t'*}"
    transaction_phase="${transaction_state#*$'\t'}"
    case "$transaction_phase" in
      committed|recovered) ;;
      *) pending_transactions+=("$transaction_id") ;;
    esac
  done < <(find "$TRANSACTION_ROOT" -mindepth 1 -maxdepth 1 -type f -name '*.json' -print0)
fi

switch_journal_pending=0
if [[ -e /var/lib/mes/release-switch/pilot.json || -L /var/lib/mes/release-switch/pilot.json ]]; then
  switch_journal_pending=1
fi

if (( ${#pending_transactions[@]} > 0 || switch_journal_pending == 1 )); then
  if systemctl is-active --quiet mes-pilot.service; then
    # Never issue a blocking stop from a unit ordered before a queued app start.
    # Fail the requesting start and schedule a separate stop; the next app start
    # performs deterministic recovery while the main process is inactive.
    systemctl stop --no-block mes-pilot.service >/dev/null 2>&1 || true
    echo "Unfinished release recovery found a running Pilot service; stop was queued and this start is blocked." >&2
    exit 75
  fi
fi

for transaction_id in "${pending_transactions[@]}"; do
  /usr/bin/node "$REINODE_HELPER" \
    --mode=recover \
    --transaction-id="$transaction_id" \
    --prestart=true \
    --confirm=RECOVER_PILOT_REINODE_TRANSACTION
done

/usr/bin/node "$SWITCH_HELPER" recover --contour=pilot --prestart=true >/dev/null
printf 'PILOT_RELEASE_RECOVERY_OK consumer=%s\n' "$consumer"
