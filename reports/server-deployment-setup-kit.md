# Server Deployment Setup Kit

Date: 2026-07-06

## Scope

This pass continued the server setup work after the data-safety baseline. No SSH access was provided, so no live VM was changed. The result is a ready-to-copy setup kit for two contours on one VM.

## Created

Deployment templates:

- `deploy/env/mes-dev.env.example`;
- `deploy/env/mes-user-testing.env.example`;
- `deploy/systemd/mes-dev.service`;
- `deploy/systemd/mes-user-testing.service`;
- `deploy/nginx/mes-two-contours.conf.example`.

Server helper scripts:

- `scripts/server-preflight.mjs`;
- `scripts/server-healthcheck.mjs`.

NPM commands:

- `npm run server:preflight`;
- `npm run server:healthcheck`.

Updated:

- `docs/server-deploy-runbook.md`;
- `package.json`.

## Behavior

`server:preflight` checks:

- Node.js version;
- `PORT`;
- writable shared-state directory;
- writable backup directory;
- writable audit directory;
- protected contour safety flags;
- shared-state location outside the git checkout for protected contours.

`server:healthcheck` checks:

- application page responds with HTTP 2xx;
- `/api/shared-state` responds with HTTP 2xx;
- shared-state response is JSON and configured.

## Local Smoke QA

Commands executed:

```bash
npm run qa:syntax
npm run build
npm run server:preflight -- --create-dirs
npm run preview
npm run server:healthcheck
```

Smoke environment:

- `APP_ENV=user-testing`;
- temporary shared-state directory under `/tmp`;
- temporary backup directory under `/tmp`;
- temporary audit log under `/tmp`;
- `MES_ALLOW_DESTRUCTIVE_ACTIONS=false`;
- `MES_ENABLE_WORKFLOW_PRESET_RESTORE=false`;
- local preview port `4199`.

Result:

- syntax: pass;
- build: pass;
- preflight: pass;
- preview start: pass;
- healthcheck: pass;
- shared-state version returned by healthcheck: `0`.

## Server Access Status

- SSH access: not provided;
- live server inventory: not completed;
- firewall/reverse-proxy changes: not executed;
- systemd installation: not executed;
- TLS setup: not executed.

## Next Action

Copy the env and systemd templates to the VM, edit domain/path values, run `npm run server:preflight -- --create-dirs` as the service user, then install the systemd units.
