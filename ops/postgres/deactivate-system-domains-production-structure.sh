#!/usr/bin/env bash
# Backwards-compatible entry point.  The staged rollback refuses to alter a
# PostgreSQL-primary contour and owns all service-environment checks.
set -euo pipefail

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
exec bash "${APP_DIR}/ops/postgres/deactivate-system-domains-command-surfaces.sh" --to=disabled "$@"
