#!/usr/bin/env bash
# Remove the Pilot permission for the session-scoped Nomenclature write evaluation.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
PORT="${MES_PILOT_PORT:-4175}"
DROPIN_FILE="/etc/systemd/system/${SERVICE}.service.d/71-react-nomenclature-write-evaluation.conf"
SOURCE_FILE="${APP_DIR}/ops/frontend/mes-pilot-react-nomenclature-write-evaluation.conf"
backup_dir="$(mktemp -d /root/.mes-react-nomenclature-write-deactivation.XXXXXX)"
had_previous=0
evaluation_permission_removed=0
completed=0

request_home() {
  curl --fail --silent --show-error --connect-timeout 2 --max-time 5 \
    -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/"
}

request_health() {
  curl --fail --silent --show-error --connect-timeout 2 --max-time 5 \
    -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/healthz"
}

report_failure_backup() {
  if [[ $completed -eq 1 ]]; then
    rm -rf "$backup_dir"
    return
  fi
  if [[ $evaluation_permission_removed -eq 1 && $had_previous -eq 1 ]]; then
    echo "Managed React write-evaluation drop-in remains removed, but the OFF state was not proven. Exact former drop-in backup: $backup_dir/previous.conf" >&2
    # Never restore a write-enabling evaluation permission during rollback.
    trap - EXIT
    return
  fi
  rm -rf "$backup_dir"
}
trap report_failure_backup EXIT

if [[ -f "$DROPIN_FILE" ]]; then
  [[ -f "$SOURCE_FILE" ]] \
    || { echo "Current release React Nomenclature write evaluation artifact is missing; refusing deletion." >&2; exit 1; }
  cmp -s "$SOURCE_FILE" "$DROPIN_FILE" \
    || { echo "Refusing to delete an unrecognized or operator-modified React Nomenclature write evaluation drop-in." >&2; exit 1; }
  cp -a "$DROPIN_FILE" "$backup_dir/previous.conf"
  had_previous=1
  rm -f "$DROPIN_FILE"
  evaluation_permission_removed=1
fi
systemctl daemon-reload
systemctl restart "$SERVICE"

for attempt in $(seq 1 12); do
  health="$(request_health 2>/dev/null || true)"
  home="$(request_home 2>/dev/null || true)"
  if grep -Fq '"status":"ok"' <<<"$health" \
    && grep -Fq '"MES_REACT_NOMENCLATURE":false' <<<"$home" \
    && grep -Fq '"MES_REACT_NOMENCLATURE_WRITE_EVALUATION":false' <<<"$home"; then
    completed=1
    break
  fi
  sleep 1
done

[[ $completed -eq 1 ]] \
  || { echo "React Nomenclature write evaluation permission was removed, but the OFF state was not proven. Do not roll back the release until service health is restored." >&2; exit 1; }

rm -rf "$backup_dir"
trap - EXIT
echo "React Nomenclature write evaluation is disabled; every session uses legacy."
