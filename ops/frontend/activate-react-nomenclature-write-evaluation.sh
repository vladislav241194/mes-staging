#!/usr/bin/env bash
# Permit one authenticated, RBAC-gated, session-scoped Nomenclature write evaluation.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
PORT="${MES_PILOT_PORT:-4175}"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
DROPIN_FILE="${DROPIN_DIR}/71-react-nomenclature-write-evaluation.conf"
SOURCE_FILE="${APP_DIR}/ops/frontend/mes-pilot-react-nomenclature-write-evaluation.conf"
backup_dir="$(mktemp -d /root/.mes-react-nomenclature-write-evaluation.XXXXXX)"
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

request_capabilities() {
  curl --fail --silent --show-error --connect-timeout 2 --max-time 5 \
    -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/api/v1/nomenclature/capabilities"
}

assert_command_owner_readiness() {
  /usr/bin/node -e '
    const value = JSON.parse(process.argv[1]);
    if (value.ok !== true || value.operatorReadiness !== true) throw new Error("Internal Nomenclature operator readiness is unavailable");
    if (value.employeeAuthStorageConfigured !== true || value.employeeAuthSchemaReady !== true) throw new Error("Migration 027 or employee-auth storage readiness is missing");
    if (value.employeeAuthConfigured !== true) throw new Error("Pilot employee authentication Stage 1 is not configured");
    if (value.capabilities?.serverCommandsConfigured !== true) throw new Error("Nomenclature command owner Stage 2 is not configured");
    if (value.capabilities?.serverCommandsEnabled !== false) throw new Error("Internal unauthenticated readiness must not receive write authority");
  ' "$1"
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
grep -Fq 'Environment=MES_REACT_NOMENCLATURE=1' "$SOURCE_FILE" \
  || { echo "Feature flag is missing from $SOURCE_FILE" >&2; exit 1; }
grep -Fq 'Environment=MES_REACT_NOMENCLATURE_WRITE_EVALUATION=1' "$SOURCE_FILE" \
  || { echo "Write evaluation flag is missing from $SOURCE_FILE" >&2; exit 1; }
if grep -Fq 'MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION' "$SOURCE_FILE"; then
  echo "Write rollout must not enable the read-only evaluation flag." >&2
  exit 1
fi

unexpected_flags="$(
  systemctl show "$SERVICE" --property=Environment --value \
    | tr ' ' '\n' \
    | grep -E '^MES_REACT_[A-Z0-9_]+=1$' \
    | grep -Ev '^(MES_REACT_NOMENCLATURE|MES_REACT_NOMENCLATURE_WRITE_EVALUATION)=1$' \
    || true
)"
if [[ -n "$unexpected_flags" ]]; then
  echo "Another React evaluation is active; deactivate it before Nomenclature write evaluation." >&2
  printf '%s\n' "$unexpected_flags" >&2
  exit 1
fi

pre_capabilities="$(request_capabilities)"
assert_command_owner_readiness "$pre_capabilities" \
  || { echo "Nomenclature write evaluation requires migration 027, employee-auth Stage 1 and command-owner Stage 2 readiness." >&2; exit 1; }

install -d -m 0755 "$DROPIN_DIR"
if [[ -f "$DROPIN_FILE" ]]; then
  cmp -s "$SOURCE_FILE" "$DROPIN_FILE" \
    || { echo "Refusing to overwrite an unrecognized or operator-modified React Nomenclature write evaluation drop-in." >&2; exit 1; }
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
  capabilities="$(request_capabilities 2>/dev/null || true)"
  if grep -Fq '"status":"ok"' <<<"$health" \
    && grep -Fq '"MES_REACT_NOMENCLATURE":true' <<<"$home" \
    && grep -Fq '"MES_REACT_NOMENCLATURE_WRITE_EVALUATION":true' <<<"$home" \
    && grep -Fq '"MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION":false' <<<"$home" \
    && assert_command_owner_readiness "$capabilities" 2>/dev/null; then
    completed=1
    break
  fi
  sleep 1
done

[[ $completed -eq 1 ]] \
  || { echo "React Nomenclature write evaluation did not become ready; prior service configuration will be restored." >&2; exit 1; }

echo "Authenticated, RBAC-gated Nomenclature write evaluation is permitted for an explicit session request."
