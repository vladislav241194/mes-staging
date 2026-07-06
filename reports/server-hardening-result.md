# Server Hardening Result

Date: 2026-07-06

## Scope

Autonomous server pass for the deployed MES prototype on `194.58.115.217`.

## Confirmed Server State

- OS: Ubuntu 24.04.4 LTS.
- Runtime: Node.js 24.18.0, npm 11.16.0, git 2.43.0.
- Reverse proxy: Caddy.
- Domains:
  - `https://staging.mes-line.ru` -> `127.0.0.1:4174`;
  - `https://pilot.mes-line.ru` -> `127.0.0.1:4175`.
- App directories:
  - `/srv/mes/dev/app`;
  - `/srv/mes/user-testing/app`.
- Shared-state directories:
  - `/srv/mes/dev/shared-state`;
  - `/srv/mes/user-testing/shared-state`.
- Git remote: `git@github.com:vladislav241194/mes-staging.git`.

## Changes Applied

Before changes, ports `4174` and `4175` listened on `0.0.0.0`.

Applied:

- pushed commit `f7b62ef chore(server): add deployment setup kit`;
- pulled `f7b62ef` into both `/srv/mes/dev/app` and `/srv/mes/user-testing/app`;
- rebuilt both contours with `npm run build`;
- created pre-hardening backups for both contours;
- added systemd drop-ins:
  - `/etc/systemd/system/mes-dev.service.d/10-hardening.conf`;
  - `/etc/systemd/system/mes-user-testing.service.d/10-hardening.conf`;
- set both apps to `HOST=127.0.0.1`;
- added `APP_BASE_URL` to both service environments;
- added `ExecStartPre=/usr/bin/npm run server:preflight`;
- added `NoNewPrivileges=true`, `PrivateTmp=true`, `ProtectSystem=full`;
- kept writable paths limited to `/srv/mes/dev` and `/srv/mes/user-testing`;
- reset stale failed state of disabled `nginx.service`.

## Backups Created

Dev:

- `/srv/mes/dev/backups/2026-07-06T18-53-49-748Z__mes-dev-shared-state-v1__before-server-hardening.json`

User-testing:

- `/srv/mes/user-testing/backups/2026-07-06T18-55-12-858Z__mes-user-testing-shared-state-v1__before-server-hardening.json`

## Validation

Server-side:

- `mes-dev.service`: active;
- `mes-user-testing.service`: active;
- `caddy.service`: active;
- `nginx.service`: inactive and disabled;
- failed systemd units: `0`;
- `4174`: listens on `127.0.0.1`;
- `4175`: listens on `127.0.0.1`.

Healthchecks:

- `https://staging.mes-line.ru`: pass, shared-state version `1`;
- `https://pilot.mes-line.ru`: pass, shared-state version `2007`;
- external direct `http://194.58.115.217:4174`: timeout;
- external direct `http://194.58.115.217:4175`: timeout.

## Remaining Risks

- Root password was shared in chat and should be rotated.
- SSH should move to key-based deploy access.
- Caddy is the active reverse proxy; Nginx config should remain disabled unless Caddy is intentionally replaced.
- The live systemd units still keep base `Environment=HOST=0.0.0.0`, but the drop-in override sets `HOST=127.0.0.1` and the actual process binds to localhost.

## Next Recommended Action

Rotate root password and configure SSH key access for the `deploy` user.
