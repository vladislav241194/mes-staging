#!/usr/bin/env bash
# Backwards-compatible entry point.  The staged rollout script owns the
# authority/parity checks and exact effective-environment verification.
set -euo pipefail

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
exec bash "${APP_DIR}/ops/postgres/activate-system-domains-command-surfaces.sh" --through=production-structure "$@"
