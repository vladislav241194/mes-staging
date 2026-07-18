#!/usr/bin/env bash
set -euo pipefail

# Root-only, additive schema step. It deliberately does not enable any command
# feature flag and therefore cannot redirect browser writes away from the
# compatibility snapshot by itself.
if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash ops/postgres/apply-domain-migrations.sh" >&2
  exit 1
fi

readonly SERVICE="mes-pilot-domain-migrate.service"
readonly IMPORT_SERVICE="mes-pilot-domain-import.service"
readonly INTERNAL_ORIGIN="http://127.0.0.1:4175"
readonly INTERNAL_HOST="mes-internal"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The deploy user may start this named import unit but must not obtain database
# credentials or arbitrary root shell access.  Keep the installed unit aligned
# with the versioned source whenever this root-only schema gate is run, so a
# later deploy-triggered import reconciles every staged read model.
install -m 0644 "${SCRIPT_DIR}/${IMPORT_SERVICE}" "/etc/systemd/system/${IMPORT_SERVICE}"
systemctl daemon-reload

systemctl start "${SERVICE}"
if systemctl is-failed --quiet "${SERVICE}"; then
  systemctl status --no-pager "${SERVICE}" >&2 || true
  exit 1
fi

capabilities="$(curl -fsS --max-time 8 -H "Host: ${INTERNAL_HOST}" "${INTERNAL_ORIGIN}/api/v1/workshop/shift-execution/capabilities")"
node -e '
  const payload = JSON.parse(process.argv[1]);
  if (!payload.ok || payload.capabilities?.schemaReady !== true) {
    throw new Error("Required shift-execution migrations were not confirmed by the capability endpoint");
  }
' "${capabilities}"

readiness="$(curl -fsS --max-time 8 -H "Host: ${INTERNAL_HOST}" "${INTERNAL_ORIGIN}/api/v1/domain-readiness")"
node -e '
  const payload = JSON.parse(process.argv[1]);
  if (!payload.ok || payload.readiness?.commands?.specifications2AttachmentUpload?.schemaReady !== true) {
    throw new Error("Specifications 2.0 attachment migration was not confirmed by the domain readiness endpoint");
  }
' "${readiness}"

# Migration 023 is read by every System Domains readiness/command request.
# Confirm it through the running application so a service that skipped the new
# table cannot be reported as successfully migrated.
node -e '
  const payload = JSON.parse(process.argv[1]);
  const domains = payload?.readiness?.systemDomains || {};
  if (domains.storageBackend !== "postgresql" || domains.error) {
    throw new Error(`System Domains primary-authority migration was not confirmed: ${domains.error || domains.storageBackend || "unavailable"}`);
  }
' "${readiness}"

echo "Domain migrations are applied. Command feature flags remain unchanged."
