# Server Deployment & Data-Safety Baseline

Date: 2026-07-06

## Summary

The MES prototype now has an application-side deployment and data-safety baseline for a future server move. No SSH credentials or server shell access were provided in this run, so this pass did not change firewall rules, service managers, reverse proxy configs, server users, or server storage.

Server-side status:

- server access not provided;
- server-side commands not executed;
- manual server checklist required before user testing.

## S00 Baseline Preflight

Initial local baseline gates were run before implementation. Result: pass.

Pre-existing worktree note:

- `reports/autonomous-ui-ux-stabilization-program-resume.md` was already untracked before this task and was not modified by this pass.

Initial gates:

| Gate | Result |
| --- | --- |
| `npm run build` | pass |
| `npm run qa:ui` | pass |
| `npm run qa:css` | pass |
| `npm run qa:architecture` | pass |
| `npm run qa:visual` | pass |
| `npm run qa:ui:regression` | pass |
| `npm run qa:functional` | pass |
| `git diff --check` | pass |

## S01 Existing Server Inventory

Server inventory was not completed because server access was not available.

Local deployment inventory:

- local source server: `server.js`;
- static dist preview server: `scripts/preview-dist.mjs`;
- shared-state endpoint: `scripts/shared-state-endpoint.mjs`;
- workflow preset endpoint: `scripts/workflow-preset-endpoint.mjs`;
- Vercel API shared-state wrapper: `api/shared-state.js`;
- existing staging notes: `DEPLOY.md`;
- no Docker, Compose, Nginx, Caddy, PM2, or systemd config is present in the repository.

## S02 Deployment Topology Design

Recommended topology for one virtual machine:

- `dev` contour: internal testing, frequent updates, no real user data;
- `user-testing` contour: production test contour for real users, persistent data, no destructive defaults.

Recommended environment separation:

- distinct `PORT` per contour;
- distinct `APP_ENV`;
- distinct `MES_SHARED_STATE_DIR`;
- distinct `MES_BACKUP_DIR`;
- distinct `MES_AUDIT_LOG_PATH`;
- distinct public URL or reverse-proxy vhost.

The detailed deployment and rollback runbook is in `docs/server-deploy-runbook.md`.

## S03 Persistent Shared-State Baseline

Added shared-state storage helpers in `scripts/shared-state-storage.mjs`.

Supported environment variables:

- `APP_ENV` / `MES_APP_ENV`;
- `APP_BASE_URL`;
- `MES_SHARED_STATE_KEY`;
- `MES_SHARED_STATE_FILE`;
- `MES_SHARED_STATE_DIR`;
- `MES_BACKUP_DIR`;
- `MES_AUDIT_LOG_PATH`;
- `MES_ALLOW_DESTRUCTIVE_ACTIONS`;
- `MES_ENABLE_WORKFLOW_PRESET_RESTORE`;
- `MES_BACKUP_BEFORE_SHARED_STATE_WRITE`;
- `BACKUP_RETENTION_DAYS`;
- `MES_PRUNE_BACKUPS`.

Runtime config is injected into `index.html` by:

- `server.js`;
- `scripts/preview-dist.mjs`.

This lets the browser know which environment it is running in and whether destructive actions are allowed.

## S04 Destructive Action Guards

Protected environments:

- `staging`;
- `user-testing`;
- `production`.

Server-side destructive shared-state writes are blocked in protected environments unless:

```bash
MES_ALLOW_DESTRUCTIVE_ACTIONS=true
```

Blocked action patterns include reset, restore, seed, preset, wipe, clear, delete, destructive, initial-state, and initial-preset.

Client-side guards were added for:

- workflow preset auto-restore;
- manual workflow preset restore;
- timesheet cell reset;
- timesheet schedule reset;
- access role reset.

Workflow preset file saving is also blocked in protected environments unless destructive actions are explicitly allowed.

All blocked client-side destructive attempts are recorded in local audit storage:

- `mes-planning-prototype-data-safety-audit-v1`.

Server-side shared-state attempts are recorded in:

- `MES_AUDIT_LOG_PATH`.

## S05 Backup / Restore Baseline

Added scripts:

- `scripts/backup-shared-state.mjs`;
- `scripts/list-shared-state-backups.mjs`;
- `scripts/restore-shared-state.mjs`.

Added npm commands:

- `npm run backup:shared-state`;
- `npm run list:shared-state-backups`;
- `npm run restore:shared-state`.

Restore is deliberately gated by:

```bash
MES_RESTORE_CONFIRM=RESTORE_SHARED_STATE
```

Before restore, the current shared-state file is backed up automatically.

Manual smoke test result:

| Check | Result |
| --- | --- |
| backup from temp shared-state | pass |
| list temp backups as JSON | pass |
| restore from backup with confirmation | pass |
| pre-restore backup created | pass |

## S06 Access Protection Baseline

No server firewall, users, SSH, TLS, reverse-proxy, or process-manager configuration was changed because server access was not provided.

Minimum manual checklist before user testing:

- create a non-root service user;
- keep shared-state outside the git checkout;
- restrict write permissions to service data directories;
- configure TLS at the reverse proxy;
- protect direct access to internal ports;
- keep `MES_ALLOW_DESTRUCTIVE_ACTIONS=false` for `user-testing`;
- verify backup creation before every deploy.

## S07 Deploy / Rollback Runbook

Created:

- `docs/server-deploy-runbook.md`.

The runbook covers:

- two-contour topology;
- environment variables;
- pre-deploy gates;
- backup before update;
- deploy;
- post-deploy QA;
- code rollback;
- data restore;
- forbidden server actions.

## S08 Server QA Policy

Required before deploy:

```bash
npm run build
npm run qa:ui
npm run qa:css
npm run qa:architecture
npm run qa:visual
npm run qa:ui:regression
npm run qa:functional
git diff --check
```

Required before user-testing deploy:

```bash
npm run backup:shared-state -- --reason=before-deploy --actor=deploy
npm run list:shared-state-backups
```

Required after deploy:

- verify that the app opens;
- verify shared-state reads;
- verify one safe write scenario;
- verify old data is still visible;
- verify destructive reset/preset actions are blocked in `user-testing`.

## S09 Implementation QA

Targeted checks:

| Command | Result |
| --- | --- |
| `npm run qa:syntax` | pass |
| `npm run qa:shared-state` | pass |
| backup/list/restore temp smoke | pass |

Final gates:

| Command | Result | Duration |
| --- | --- | --- |
| `npm run build` | pass | 1s |
| `npm run qa:ui` | pass | 4s |
| `npm run qa:css` | pass | 0s |
| `npm run qa:architecture` | pass | 6s |
| `npm run qa:visual` | pass | 59s |
| `npm run qa:ui:regression` | pass | 87s |
| `npm run qa:functional` | pass | 262s |
| `git diff --check` | pass | 0s |

Final gate logs:

- `/tmp/mes-server-baseline-final.Mt3vXA`

## Files Changed

Created:

- `docs/server-deploy-runbook.md`;
- `reports/server-deployment-data-safety-baseline.md`;
- `scripts/backup-shared-state.mjs`;
- `scripts/list-shared-state-backups.mjs`;
- `scripts/restore-shared-state.mjs`;
- `scripts/shared-state-storage.mjs`.

Updated:

- `.gitignore`;
- `package.json`;
- `server.js`;
- `scripts/preview-dist.mjs`;
- `scripts/shared-state-endpoint.mjs`;
- `scripts/shared-state-functional-qa.mjs`;
- `scripts/workflow-preset-endpoint.mjs`;
- `src/app.js`.

## Intentionally Not Done

- no SSH connection was attempted;
- no server packages were installed;
- no firewall or port rules were changed;
- no Nginx/Caddy/systemd/PM2 config was created in-place;
- no production/user-testing data was touched;
- no data directories were deleted;
- no business logic or Gantt geometry was changed.

## User-Testing Verdict

Ready with constraints.

Application-side data-safety baseline is ready. Server-side user testing should not start until the VM is provisioned with separate `dev` and `user-testing` directories, the first backup is verified, and the service is started with protected environment variables.

## Next Recommended Action

Provision the VM with the two-contour directory layout from `docs/server-deploy-runbook.md`, then run the first `user-testing` deploy with a verified shared-state backup.
