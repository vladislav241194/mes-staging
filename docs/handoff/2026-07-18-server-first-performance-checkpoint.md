# Server-first performance checkpoint — 18 July 2026

## Purpose

This is a safe stopping point for the gradual MES performance and domain-model migration. It adds a bounded Gantt read-model foundation without changing the current Planning/Gantt client path or the pilot release. It is intentionally not a claim that the whole migration, or the user-visible loading problem, is complete.

For the full continuation plan, use
[the detailed handoff](2026-07-18-performance-migration-detailed-handoff.md)
together with
[the status report](../../reports/server-first-performance-status-2026-07-18.md).

## Start here

- Repository/worktree used for this checkpoint: `/tmp/mes-pilot-baseline-applycheck-20260718-0206`.
- Branch: `feat/weekly-planning-slice`.
- Do **not** reset, pull into, or clean the user's original dirty checkout at `/Users/vladislav/Documents/Codex/2026-05-30/files-mentioned-by-the-user-mes`.
- Before continuing, use a fresh worktree from this commit and check `git status --short`.
- Latest known deployed pilot baseline before this checkpoint: `v1.499.66` / `49d0e1e`.

## What this checkpoint adds

`GET /api/v1/planning/gantt-window?from=YYYY-MM-DD&to=YYYY-MM-DD` is an isolated, read-only Gantt contract:

- a half-open UTC time window;
- compact route, route-step and **physical slot** records;
- all split slots preserved rather than collapsed to the first slot;
- boundary continuation identifiers for bars crossing the visible range;
- ETag support and a PostgreSQL GiST range query for a future PostgreSQL-only contour.

No client code consumes this endpoint yet. The existing global Planning state remains untouched.

## Critical safety rule

The older planning parity proof has one slot per operation and cannot prove physical split slots. Therefore, while a compatibility snapshot exists, this endpoint deliberately reads the snapshot and returns:

`fallbackReason: "postgres-gantt-window-physical-slots-unverified"`

PostgreSQL is used only in a PostgreSQL-only contour with no compatibility snapshot. Do not relax this rule until a dedicated physical-slot parity/shadow comparison proves slot IDs, times, status, quantity, lock, work-centre and resource assignment.

## Explicitly excluded work

During investigation, an uncommitted startup shared-state coalescing experiment was found to have a stale-local-System-Domains safety hole. It is deliberately **not part of this checkpoint**, must not be deployed, and should be discarded from a fresh continuation worktree. The next agent should either redesign it with an active/absent/tombstone sentinel and failure-path QA, or leave the current two-request path in place.

## Evidence before the checkpoint

The normal pilot startup already avoids downloading the full shared-state snapshot. The major remaining user-perceived cost is static browser work, not PostgreSQL query time. Therefore the next work must measure an authenticated Planning to Gantt user path; local green builds and BFF timings alone are not acceptance evidence.

Focused checks passed for this checkpoint:

```bash
npm run qa:planning-gantt-window
node scripts/domain-api-qa.mjs
node scripts/planning-period-api-qa.mjs
npm run qa:domain-repositories
npm run qa:domain-read-repository-pooling
npm run build
git diff --check
```

## Next three tasks

1. Add a dedicated physical-slot parity/shadow contract, then permit PostgreSQL Gantt reads only after it matches the compatibility snapshot.
2. Behind an isolated feature flag, teach the Gantt renderer to consume `gantt-window` without replacing global Planning/editor state.
3. Capture authenticated pilot timings for Planning-to-Gantt navigation; only then choose the next bundle/API cut based on measured bottleneck.

## Release protocol

Do not deploy this foundation automatically. When it is ready to be exposed, bump the visible version, build, run the checks above, commit, push the branch, then use the established staged release commands:

```bash
npm run release:stage:pilot -- --release-id=vX.Y.Z-<shortsha>
npm run release:activate:pilot -- --release-id=vX.Y.Z-<shortsha>
curl -fsS --max-time 15 https://pilot.mes-line.ru/healthz
npm run release:promote-main -- --contour=pilot --release-id=vX.Y.Z-<shortsha>
```

Finish with an authenticated real-user-path acceptance check. Do not use credentials, browser session cookies, manual rsync, or a service restart as a substitute for that check.
