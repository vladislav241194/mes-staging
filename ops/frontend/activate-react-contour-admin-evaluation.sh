#!/usr/bin/env bash
# Permit an authenticated, session-scoped, read-only Contour Admin evaluation.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
PORT="${MES_PILOT_PORT:-4175}"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
DROPIN_FILE="${DROPIN_DIR}/91-react-contour-admin-evaluation.conf"
SOURCE_FILE="${APP_DIR}/ops/frontend/mes-pilot-react-contour-admin-evaluation.conf"
backup_dir="$(mktemp -d /root/.mes-react-contour-admin-evaluation.XXXXXX)"
had_previous=0
configuration_changed=0
completed=0

request_home() {
  curl --fail --silent --show-error --connect-timeout 2 --max-time 5 \
    -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/"
}

request_health() {
  curl --fail --silent --show-error --connect-timeout 2 --max-time 5 \
    -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/healthz"
}

request_admin_login() {
  curl --fail --silent --show-error --connect-timeout 2 --max-time 5 \
    -H 'Host: admin.mes-line.ru' "http://127.0.0.1:${PORT}/admin-login"
}

restore_on_failure() {
  if [[ $completed -eq 1 || $configuration_changed -eq 0 ]]; then
    rm -rf "$backup_dir"
    return
  fi
  if [[ $had_previous -eq 1 ]]; then
    install -m 0644 "$backup_dir/previous.conf" "$DROPIN_FILE"
  else
    rm -f "$DROPIN_FILE"
  fi
  systemctl daemon-reload
  systemctl restart "$SERVICE" || true
  rm -rf "$backup_dir"
}
trap restore_on_failure EXIT

[[ -f "$SOURCE_FILE" ]] || { echo "Missing rollout artifact: $SOURCE_FILE" >&2; exit 1; }
grep -Fq 'Environment=MES_REACT_CONTOUR_ADMIN=1' "$SOURCE_FILE" \
  || { echo "Feature flag is missing from $SOURCE_FILE" >&2; exit 1; }
grep -Fq 'Environment=MES_REACT_CONTOUR_ADMIN_READ_ONLY_EVALUATION=1' "$SOURCE_FILE" \
  || { echo "Evaluation flag is missing from $SOURCE_FILE" >&2; exit 1; }

install -d -m 0755 "$DROPIN_DIR"
if [[ -f "$DROPIN_FILE" ]]; then
  cp -a "$DROPIN_FILE" "$backup_dir/previous.conf"
  had_previous=1
fi
configuration_changed=1
install -m 0644 "$SOURCE_FILE" "$DROPIN_FILE"
systemctl daemon-reload
systemctl restart "$SERVICE"

for attempt in $(seq 1 12); do
  health="$(request_health 2>/dev/null || true)"
  home="$(request_home 2>/dev/null || true)"
  admin_login="$(request_admin_login 2>/dev/null || true)"
  if grep -Fq '"status":"ok"' <<<"$health" \
    && grep -Fq '"MES_REACT_CONTOUR_ADMIN":true' <<<"$home" \
    && grep -Fq '"MES_REACT_CONTOUR_ADMIN_READ_ONLY_EVALUATION":true' <<<"$home" \
    && grep -Fq '<title>MES Admin</title>' <<<"$admin_login" \
    && grep -Fq 'name="password"' <<<"$admin_login"; then
    completed=1
    break
  fi
  sleep 1
done

[[ $completed -eq 1 ]] \
  || { echo "React Contour Admin evaluation did not become ready; prior service configuration will be restored." >&2; exit 1; }

echo "Authenticated session-scoped read-only React Contour Admin evaluation is permitted."
