# PostgreSQL ↔ frontend coordination handoff

Date: 2026-07-19  
PostgreSQL worktree: `/Users/vladislav/Documents/Codex/2026-05-30/mes-postgres-primary`  
Branch: `codex/postgres-primary-slice`  
Accepted PostgreSQL release commit: `c3b405993c1b723dbb8dc6dedc5b4bb423f87f51`

Handoff commit at first publication: `4f0fbae`

Visible pilot version: `v.1.499.70`
Active pilot release: `v.1.499.70-c3b4059`
Integrated main: `origin/main` contains accepted release commit `c3b405993c1b723dbb8dc6dedc5b4bb423f87f51`

This handoff contains no credentials. Pilot QA access must be obtained directly from the owner and must not be copied into Git, task handoffs, logs, screenshots, or memory.

## Current state

The PostgreSQL code and release slice is integrated, live and finally accepted. The root-controlled Specifications 2.0 rollout was completed on 2026-07-19; there is no remaining PostgreSQL migration gate for frontend work.

Already confirmed on the live pilot:

- System Domains external login reads the PostgreSQL-backed production structure: 9 departments and 76 employees.
- A master can create an executor assignment in Workshop, and the PostgreSQL readiness surface reads it back (`assignmentCount=1`, `executorCount=1`).
- After a cold employee login, the assigned task appears on the worker desktop; the employee records 1 of 1 units and the UI reads the closed fact back into Workshop/Gantt state.
- The top-bar logout interaction returns the employee to the external authorization screen.
- Temporary live-QA assignment/fact/carryover rows were removed with an exact-key guarded transaction; post-cleanup Shift Execution counts are `0/0/0/0` and all four domain readiness checks remain green.
- PostgreSQL command authority for System Domains and Shift Execution fails closed when the database authority is unavailable.
- Work Orders and bounded Planning/Shift Execution projections are PostgreSQL reads.
- System Domains compatibility state is retired, and its module reads no longer hydrate from shared-state.
- Shift Execution shared-state payloads are tombstoned under server authority; its compatibility archive and authority digest match.
- Bootstrap snapshot restore is disabled by default on protected pilot/staging environments and is retained only as an explicit emergency fallback.
- A real staging rollback drill between two manifest-verified, commit-derived releases completed successfully; health checks passed after rollback.
- Compatibility backup/export creation is restricted to `0600`; every deploy-owned existing file in `/srv/mes/pilot/backups` was also restricted to `0600`.
- `qa:stabilize` is green, including all domain migration, authority, Specifications 2.0, release provenance, rollback and build gates.
- Staging and pilot were built from the same commit with identical source and dist digests.
- The live browser loaded `v.1.499.70` assets and rendered PostgreSQL-backed Workshop, Structure and Employees (`19/19/49/76/6`) and Specifications 2.0 (`91/18/66`).
- The exact active release commit was fast-forwarded to `origin/main`.
- Every file directly under `/srv/mes/pilot/backups` is now restricted to `0600`.
- Specifications 2.0 revision publication is live with `enabled=true`, `schemaReady=true` and `revisionPublicationServerPrimary=true`.
- Specifications 2.0 attachment upload/download is live with `enabled=true` and `schemaReady=true`.
- An authenticated browser session rendered the PostgreSQL-confirmed revision 6, the enabled publication action and enabled production-file add/replace controls. Acceptance deliberately did not create revision 7 or a test attachment in production data.
- Final readiness remains green for Work Orders, System Domains, Specifications 2.0 and Shift Execution with `sourceSynchronized=true`. The final read observed one current Shift Execution assignment/executor and no facts or carryovers; it was preserved as live user data rather than treated as QA debris.

## Final rollout acceptance

- The authorized operator completed the required rollout commands:

  ```bash
  find /srv/mes/pilot/backups -maxdepth 1 -type f ! -perm 0600 -exec chmod 0600 -- {} +
  /srv/mes/pilot/app/ops/postgres/activate-specifications2-attachments.sh
  /srv/mes/pilot/app/ops/postgres/activate-specifications2-publication.sh
  ```

- The post-rollout audit confirmed both command schemas, both feature flags, PostgreSQL primary authority, authenticated UI wiring, backup permissions, domain counts and final health (`v.1.499.70`, `status=ok`).
- Active runtime remains `/srv/mes/pilot/releases/v.1.499.70-c3b4059/app`; `active-release.json` and the release manifest agree on commit `c3b405993c1b723dbb8dc6dedc5b4bb423f87f51`, source digest `750ff3071bbc96ca12cb1eca17e7cff2b35ed3fceda3e320007df9c11b922aeb` and dist digest `aec2d15e9f69d6bd0e0284a8e8e005e1353106b91e0f05c1e43ddbfb14350d6e`.
- `origin/main` contains the accepted release commit. No PostgreSQL-specific code, rollout or production-data debt remains in this goal.

## Files changed by the integrated PostgreSQL slice

The following were principal shared files in the completed slice. They are now in `origin/main`; this list is historical overlap context, not an assertion that they still differ from main:

- `app-version.json`
- `db/migrations/025_shift_execution_postgres_authority.sql`
- `index.html`
- `ops/postgres/verify-shift-execution-http-e2e.mjs`
- `package.json`
- `scripts/domain-api.mjs`
- `scripts/domain-postgres-migrate.mjs`
- `scripts/domain-postgres-repository.mjs`
- `scripts/domain-shift-execution-authority.mjs`
- `scripts/domain-shift-execution-import.mjs`
- `scripts/domain-shift-execution-repository.mjs`
- `scripts/domain-work-orders-repository.mjs`
- `scripts/internal-shift-execution-e2e-endpoint-qa.mjs`
- `scripts/internal-shift-execution-e2e-endpoint.mjs`
- `scripts/planning-gantt-window-api-qa.mjs`
- `scripts/planning-gantt-window-postgres-repository-qa.mjs`
- `scripts/planning-gantt-window-projection.mjs`
- `scripts/planning-postgres-projection-safety-qa.mjs`
- `scripts/preview-dist.mjs`
- `scripts/shared-state-boot-projection-qa.mjs`
- `scripts/shared-state-endpoint.mjs`
- `scripts/shared-state-functional-qa.mjs`
- `scripts/shared-state-planning-bootstrap-qa.mjs`
- `scripts/shift-execution-authority-qa.mjs`
- `scripts/shift-execution-dispatch-app-wiring-contract-qa.mjs`
- `scripts/system-domains-primary-runtime-qa.mjs`
- `src/app.js`
- `src/modules/runtime_state/service.js`

The branch also adds PostgreSQL/performance handoff and status documents under `docs/handoff/` and `reports/`.

Not changed by this PostgreSQL branch at the handoff point:

- `package-lock.json`
- `server.js`
- `scripts/build.mjs`

Do not infer that these three files are generally free: inspect the current Git diff before changing shared build files.

## API and data contracts

Contracts treated as stable for frontend consumption:

- `/api/v1/domain-readiness` authority/readiness reporting.
- System Domains PostgreSQL read model for production structure, employees, timesheet and access control.
- System Domains command authority and its fail-closed behavior.
- Shift Execution bounded dispatch with explicit scope fields including `sourceRowIds`, `workCenterIds`, `dateKey`, and coverage completeness.
- Shift Execution assignment, fact, carryover and cancellation commands with idempotency and database authority markers.
- Work Orders PostgreSQL read projection.
- Specifications 2.0 reads and work-order creation from published data.
- Specifications 2.0 server-primary revision publication and PostgreSQL attachment upload/download.
- Bounded Planning/Gantt PostgreSQL window projection.

Contracts or flows not declared valid:

- Any frontend path that directly treats shared-state or the bootstrap snapshot as current domain authority. These are compatibility/emergency artifacts, not live domain sources.

Frontend modules depending on this migration:

- `authPrototype` and `authSessionPrototype`
- `shiftMasterBoard` and employee Workshop task views
- `shiftWorkOrders`
- production structure matrix
- timesheet
- roles/access-control UI
- Planning/Gantt
- Specifications 2.0

## Ownership after release acceptance

| Area | PostgreSQL task | Frontend task |
| --- | --- | --- |
| Database schema, migrations, repositories | Completed and frozen at the accepted release | Does not touch without a new coordinated backend task |
| `/api/v1/*` domain contracts and server adapters | Contracts frozen at `c3b4059` | Consumes through adapters only |
| `src/app.js`, login hydration, runtime reconciliation | No pending code edit | May change after rebasing onto `origin/main` and checking overlap |
| Shift Execution server projection/bridge | Accepted and frozen | Consumes only |
| Pure module rendering and CSS | No pending edit | May change after rebasing and normal QA |
| Legacy UI | Keeps operational and changes only for vertical PostgreSQL wiring | Preserves until replacement acceptance |
| Shared build files | Changes only by agreement | Changes only by agreement |
| `package-lock.json` | No pending edit | Normal single-owner coordination per change |

The current product frontend is legacy JavaScript/HTML/CSS, not React/TypeScript. Any React proof of concept must remain in an isolated branch and isolated files, must preserve the legacy UI, and must not change business logic, API contracts, or the data model.

## Parallel frontend edits

The blanket PostgreSQL file lock is released because the accepted slice is in `origin/main` and the two Specifications 2.0 flags are live-accepted. A frontend task must rebase onto `c3b4059` or newer and inspect its actual diff. Publication/attachment adapters and runtime capability policy are stable contracts; change them only as an explicit new backend task. Rendering and CSS work may proceed normally.

## Required integration order

1. PostgreSQL task is complete and its contracts are frozen at the accepted release.
2. Frontend task rebases onto `origin/main` and consumes the frozen contracts.
3. Any isolated React proof of concept is evaluated and integrated separately.

Before starting frontend edits, verify `git status`, branch, merge-base, and `git diff --name-status` in the frontend worktree. If an intended edit changes Specifications 2.0 publication/attachment capability policy, treat it as a new coordinated backend change rather than reopening this completed migration goal implicitly.
