# PostgreSQL ↔ frontend coordination handoff

Date: 2026-07-19  
PostgreSQL worktree: `/Users/vladislav/Documents/Codex/2026-05-30/mes-postgres-primary`  
Branch: `codex/postgres-primary-slice`  
Base / merge-base with `origin/main`: `49d0e1eeecd7b653bdb09d61e73068bb12d22741`  
Current PostgreSQL branch commit: `96ed910`

Handoff commit at first publication: `4f0fbae`

Visible pilot version: `v.1.499.69`
Active pilot release: `v.1.499.69-9404ee4`

This handoff contains no credentials. Pilot QA access must be obtained directly from the owner and must not be copied into Git, task handoffs, logs, screenshots, or memory.

## Current state

The PostgreSQL slice is still in progress and must be integrated as one vertical unit only after the remaining command-surface activation, final release gates, merge to `main`, and final live acceptance.

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

Still pending in the PostgreSQL task:

- Root-level activation and live validation of the Specifications 2.0 publication and attachment command flags. The `deploy` account cannot install the required systemd drop-ins, so this exact operation requires the authorized root operator.
- Restricting permissions on compatibility backup/export files and committing the corresponding storage hardening.
- Final full QA, merge to `main`, visible version bump, commit-derived pilot release, and final live UI/API acceptance.

## Files owned by the PostgreSQL task

The following files differ from `origin/main` and must not be edited in parallel without explicit coordination:

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

Do not infer that these three files are generally free: coordinate before changing shared build files. During the current goal, `package-lock.json` has one designated owner: the PostgreSQL task.

## API and data contracts

Contracts treated as stable for frontend consumption:

- `/api/v1/domain-readiness` authority/readiness reporting.
- System Domains PostgreSQL read model for production structure, employees, timesheet and access control.
- System Domains command authority and its fail-closed behavior.
- Shift Execution bounded dispatch with explicit scope fields including `sourceRowIds`, `workCenterIds`, `dateKey`, and coverage completeness.
- Shift Execution assignment, fact, carryover and cancellation commands with idempotency and database authority markers.
- Work Orders PostgreSQL read projection.
- Specifications 2.0 reads and work-order creation from published data.
- Bounded Planning/Gantt PostgreSQL window projection.

Contracts or flows not yet declared stable:

- Specifications 2.0 publication and downstream attachment commands while their pilot capability flags remain disabled.
- Any frontend path that directly treats shared-state or the bootstrap snapshot as current domain authority.

Frontend modules depending on this migration:

- `authPrototype` and `authSessionPrototype`
- `shiftMasterBoard` and employee Workshop task views
- `shiftWorkOrders`
- production structure matrix
- timesheet
- roles/access-control UI
- Planning/Gantt
- Specifications 2.0

## Ownership until PostgreSQL acceptance

| Area | PostgreSQL task | Frontend task |
| --- | --- | --- |
| Database schema, migrations, repositories | Changes and verifies | Does not touch |
| `/api/v1/*` domain contracts and server adapters | Changes and freezes contract | Consumes through adapters only |
| `src/app.js`, login hydration, runtime reconciliation | Owns until the live scenario is green | Does not touch |
| Shift Execution server projection/bridge | Owns | Does not touch |
| Pure module rendering and CSS | Touches only for required API wiring | May change in isolated files after confirming no overlap |
| Legacy UI | Keeps operational and changes only for vertical PostgreSQL wiring | Preserves until replacement acceptance |
| Shared build files | Changes only by agreement | Changes only by agreement |
| `package-lock.json` | Sole owner during this goal | Does not edit in parallel |

The current product frontend is legacy JavaScript/HTML/CSS, not React/TypeScript. Any React proof of concept must remain in an isolated branch and isolated files, must preserve the legacy UI, and must not change business logic, API contracts, or the data model.

## Files temporarily blocked for parallel frontend edits

Until the PostgreSQL task publishes a green live scenario and final contract checkpoint, do not change:

- `src/app.js`
- `src/modules/runtime_state/service.js`
- System Domains hydration/reconciliation code
- Shift Master Board server projection/bridge code
- Shift Execution domain API/repository/authority code
- the QA scripts validating those paths
- `package.json`, `index.html`, `app-version.json`, or `package-lock.json`

Pure visual work outside these files may proceed in a separate branch after checking the actual Git diff, not only this document.

## Required integration order

1. PostgreSQL task completes backup permission hardening and obtains authorized root activation of the two Specifications 2.0 command surfaces.
2. PostgreSQL task completes live command-surface acceptance and the full release QA gate.
3. PostgreSQL slice is merged to `main`, released as a commit-derived artifact, and accepted on the live pilot.
4. Frontend task rebases onto that accepted commit and consumes the frozen contracts.
5. Any isolated React proof of concept is evaluated and integrated separately; it must not be merged ahead of the PostgreSQL authority slice.

Before starting frontend edits, verify `git status`, branch, merge-base, and `git diff --name-status` in the frontend worktree. If any intended file overlaps the ownership list above, stop and coordinate the exact hunk or wait for the PostgreSQL checkpoint.
