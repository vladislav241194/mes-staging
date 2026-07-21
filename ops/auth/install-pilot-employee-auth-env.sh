#!/usr/bin/env bash
# Installs operator-supplied employee-auth settings without storing a secret in Git.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

SOURCE_FILE=""
APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
for arg in "$@"; do
  case "$arg" in
    --source=*) SOURCE_FILE="${arg#--source=}" ;;
    *) echo "Usage: $0 --source=/root/mes-pilot-employee-auth.env" >&2; exit 2 ;;
  esac
done
[[ -n "$SOURCE_FILE" && "$SOURCE_FILE" = /* ]] || { echo "An absolute --source path is required." >&2; exit 2; }
case "$SOURCE_FILE" in
  "$APP_DIR"/*) echo "Secret source must stay outside the immutable application release." >&2; exit 1 ;;
esac

TARGET_DIR="/etc/mes"
TARGET_FILE="${TARGET_DIR}/mes-pilot-employee-auth.env"
backup_dir="$(mktemp -d /root/.mes-pilot-employee-auth-env.XXXXXX)"
had_previous=0
configuration_changed=0
completed=0

restore_on_failure() {
  if [[ $completed -eq 1 || $configuration_changed -eq 0 ]]; then
    rm -rf "$backup_dir"
    return
  fi
  if [[ $had_previous -eq 1 ]]; then
    cp -a "$backup_dir/previous.env" "$TARGET_FILE"
  else
    rm -f "$TARGET_FILE"
  fi
  rm -rf "$backup_dir"
}
trap restore_on_failure EXIT

[[ -f "$SOURCE_FILE" && ! -L "$SOURCE_FILE" ]] || { echo "Source must be a regular non-symlink file." >&2; exit 1; }
[[ "$(stat -c '%u' "$SOURCE_FILE")" == "0" ]] || { echo "Source must be owned by root." >&2; exit 1; }
source_mode="$(stat -c '%a' "$SOURCE_FILE")"
(( (8#$source_mode & 077) == 0 )) || { echo "Source must not be accessible by group/other." >&2; exit 1; }

/usr/bin/node -e '
  const fs = require("node:fs");
  const allowed = new Set([
    "MES_EMPLOYEE_AUTH_HOSTS",
    "MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS",
    "MES_EMPLOYEE_AUTH_MAX_ATTEMPTS",
    "MES_EMPLOYEE_AUTH_LOCK_SECONDS",
    "MES_EMPLOYEE_AUTH_SESSION_SECRET",
  ]);
  const entries = {};
  for (const raw of fs.readFileSync(process.argv[1], "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || !allowed.has(match[1]) || Object.hasOwn(entries, match[1])) throw new Error("Employee-auth env contains an unsupported or duplicate entry");
    entries[match[1]] = match[2];
  }
  if (!String(entries.MES_EMPLOYEE_AUTH_HOSTS || "").split(",").map((v) => v.trim()).includes("pilot.mes-line.ru")) throw new Error("Pilot employee-auth host is missing");
  if (!/^[A-Za-z0-9_-]{32,}$/.test(String(entries.MES_EMPLOYEE_AUTH_SESSION_SECRET || ""))) throw new Error("A base64url employee session secret of at least 32 characters is required");
  const bounds = {
    MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS: [300, 86400],
    MES_EMPLOYEE_AUTH_MAX_ATTEMPTS: [1, 20],
    MES_EMPLOYEE_AUTH_LOCK_SECONDS: [1, 86400],
  };
  for (const [key, [minimum, maximum]] of Object.entries(bounds)) {
    if (entries[key] === undefined) continue;
    const value = Number(entries[key]);
    if (!/^\d+$/.test(entries[key]) || !Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${key} must be between ${minimum} and ${maximum}`);
  }
' "$SOURCE_FILE"

install -d -o root -g root -m 0755 "$TARGET_DIR"
if [[ -f "$TARGET_FILE" ]]; then
  cp -a "$TARGET_FILE" "$backup_dir/previous.env"
  had_previous=1
fi
configuration_changed=1
install -o root -g root -m 0600 "$SOURCE_FILE" "$TARGET_FILE"

[[ "$(stat -c '%u:%g:%a' "$TARGET_FILE")" == "0:0:600" ]] || { echo "Installed employee-auth env ownership/mode is invalid." >&2; exit 1; }
completed=1
echo "Pilot employee-auth environment installed as root:root 0600. Service flags were not changed."
