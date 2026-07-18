# Detailed handoff: MES performance stabilization and server-first migration

## 1. Mission

Continue the active objective without breaking the pilot:

> Stabilize MES performance and move gradually from the shared-state snapshot server to a proper server-side domain model. Preserve current behaviour while moving critical reads and then commands in vertical slices, and prove both local and pilot results.

The goal is not simply to make PostgreSQL exist. The goal is a noticeably faster and stable user path with a controlled migration away from snapshot authority.

## 2. Canonical start point

Use a fresh worktree from Git commit 3fb5468:

- commit: 3fb5468 feat(planning): add safe bounded gantt window read model;
- remote branch: origin/feat/weekly-planning-slice;
- repository: git@github.com:vladislav241194/mes-staging.git;
- latest known deployed pilot baseline: v1.499.66.

Suggested setup:

    git fetch origin
    git worktree add ../mes-next-agent origin/feat/weekly-planning-slice
    cd ../mes-next-agent
    git status --short
    npm ci --ignore-scripts --no-audit --fund=false

Do not continue from the user's original checkout:

    /Users/vladislav/Documents/Codex/2026-05-30/files-mentioned-by-the-user-mes

It is on an old main commit and has 452 unrelated dirty entries. Do not run reset, clean, checkout, pull, or a broad formatting command there.

## 3. Current release and Git state

| Item | Known state |
| --- | --- |
| Pilot health | GET https://pilot.mes-line.ru/healthz returned status: ok, version: v1.499.66, sharedState: ready. |
| Pilot code baseline | 49d0e1e perf(directories): defer presentation templates. |
| Feature checkpoint | 3fb5468 contains only the bounded Gantt read-model foundation and documentation. |
| Unpublished code | Do not assume there is any safe unpublished product change. A separate shared-state coalescing experiment was intentionally excluded after two P1 findings. |
| Deployment policy | No manual copy/restart. Use the staged release scripts only after a clean commit and a visible version bump. |

## 4. Completed slices

### 4.1 Earlier performance slices

| Commit | Change | Intended effect |
| --- | --- | --- |
| 2aee7bc | Nomenclature/BOM presentation lazy-load. | Avoid non-critical module code on first view. |
| 32477ae | Route events deferred, Planning projection cache. | Reduce work in Planning runtime hot path. |
| ec2eeea | Hot Planning projection cache completed. | Avoid repeated aggregate reconstruction. |
| 49d0e1e | Directory presentation templates deferred. | Shrink initial main bundle work. |

### 4.2 Bounded Gantt foundation in 3fb5468

New endpoint:

    GET /api/v1/planning/gantt-window?from=YYYY-MM-DD&to=YYYY-MM-DD

Contract characteristics:

- validates ordered ISO/UTC bounds and uses half-open overlap semantics;
- returns compact routes, routeSteps, slots and boundaryContinuations;
- keeps every physical slot, including split work on one route step;
- carries resolved work centre/resource scalars, lock state, status, quantity and continuation flags;
- supports ETag/conditional GET;
- PostgreSQL repository uses a bounded tstzrange query and avoids transferring full JSON documents.

Files introduced or changed:

    scripts/planning-gantt-window-projection.mjs
    scripts/planning-gantt-window-api-qa.mjs
    scripts/planning-gantt-window-postgres-repository-qa.mjs
    scripts/domain-api.mjs
    scripts/domain-postgres-repository.mjs
    scripts/domain-work-orders-repository.mjs
    scripts/planning-postgres-projection-safety-qa.mjs
    package.json

### 4.3 Non-negotiable Gantt safety boundary

The old Planning parity marker verifies a legacy aggregate with one slot per operation. It cannot prove the full physical slot sequence. Therefore:

- PostgreSQL Gantt is allowed only in a PostgreSQL-only contour with no compatibility snapshot;
- when a snapshot exists, the new endpoint reads the snapshot and returns:

      fallbackReason: postgres-gantt-window-physical-slots-unverified

- do not change that fallback merely because the old aggregate parity test is green;
- a test already models a PostgreSQL-only extra split slot and proves it is not leaked into a compatibility result.

The next agent must add a separate physical-slot parity/shadow contract before enabling PostgreSQL for dual-source Gantt.

## 5. Architecture as it actually stands

    Browser modules
        ├─ global Planning/editor state (legacy compatibility graph)
        ├─ compact BFF/read-model consumers
        └─ shared-state runtime transport
                 │
                 ├─ /api/shared-state             compatibility snapshot and shared UI
                 └─ /api/v1/...                   server domain read-models
                                                   │
                                                   ├─ PostgreSQL repositories
                                                   └─ snapshot repository fallback

The migration must keep both sources coherent while individual UI consumers switch. A server API existing beside snapshot data is not permission to replace a consumer.

## 6. Measurement facts and their meaning

Observed during the preceding profile:

| Fact | Approximate observation | Consequence |
| --- | --- | --- |
| Full shared-state snapshot | 944 KB raw / 66 KB gzip | Avoid accidentally fetching it at startup. |
| Largest snapshot values | Planning and Specifications 2.0 | Migrate/highly compress consumers separately. |
| Cold static resources before page renderer | about 389 KB brotli | Browser parse/execute/render is a major remaining cost. |
| Loopback compact BFF reads | low milliseconds | PostgreSQL alone will not solve perceived seconds-long load. |
| Pilot full snapshot on healthy boot | not normally required | Do not optimise a path that is not the active bottleneck. |

The acceptance metric is missing: record an authenticated cold and warm Planning to Gantt trace before and after a client cutover. Do not report generic endpoint latency as user-visible success.

## 7. Work package A — safe shared-state startup coalescing

### Why it exists

The baseline sends:

1. a metadata /api/shared-state request using X-MES-Shared-State-Keys: __none__;
2. a separate early full System Domains projected read.

The second request can be removed in the normal PostgreSQL-primary case, but only with a safe compatibility-state descriptor.

### Failed experiment: do not copy

An excluded experiment attempted a tombstone-only projection. It had P1 defects:

1. it dropped a received System Domains null before writeSharedStateValues(), leaving stale localStorage alive;
2. it returned the same empty payload for remote active compatibility data and an absent key, permitting a legacy import/push after server API failure;
3. it did not fire the startup callback for a configured version-0 snapshot.

### Target protocol

Use a dedicated header, separate from the value-key grammar:

    X-MES-System-Domains-Compatibility: status

The metadata response includes a tiny descriptor:

    systemDomainsCompatibility: { state: retired | active | absent }

Rules:

- retired: the compatibility key exists and is null; include only that null value so the browser deletes stale localStorage and observes the primary tombstone;
- active: key exists but is non-null; do not transfer the large matrix in the metadata request;
- absent: key is not present;
- missing/invalid descriptor from a mixed old server is unknown, never silently treated as absent;
- a metadata request with a matching known version still returns the descriptor; it must not degrade into an ambiguous unchanged response.

### Required client decision flow

1. Runtime observes the descriptor before waiting for a Planning BFF.
2. It writes a received null to writeSharedStateValues so the stale local key is physically removed.
3. It invokes a startup callback even when configured is true and version is 0.
4. For active or unknown, fetch the actual System Domains compatibility value before any legacy fallback. Keep generic shared-state writes from re-sending a potentially stale local value while this targeted hydration is pending.
5. For retired, call the server domain read with fallbackToLegacy false.
6. For confirmed absent, legacy fallback is allowed only if the server read failed and no valid local System Domains state exists.
7. No server-read failure path may call reloadSystemDomainsState with migrateLegacy true until that decision has been made.

### Exact likely callsites

| File | Area | Work |
| --- | --- | --- |
| scripts/shared-state-endpoint.mjs | request projection parsing and GET response | Add compact descriptor and preserve it across known-version responses. |
| src/modules/runtime_state/service.js | requestSharedState, startSharedStateSync, pollSharedState | Send descriptor request, observe it before version gating, expose/track safe targeted compatibility hydration. |
| src/app.js | System Domains startup and hydrateSystemDomainsServerRead | Remove standalone cold IIFE; make fallback decision explicitly after descriptor/hydration. |
| scripts/shared-state-functional-qa.mjs | endpoint QA | Cover active, absent, retired and known-version descriptor cases. |
| scripts/shared-state-planning-bootstrap-qa.mjs | startup harness | Prove one shared-state GET, callback on version 0, deferred boot and BFF concurrency. |
| scripts/system-domains-primary-runtime-qa.mjs | runtime safety | Seed stale local System Domains; prove tombstone removes it and active/unknown cannot revive it. |
| scripts/shared-state-boot-projection-qa.mjs | source contract | Assert no standalone cold full read remains and no unsafe legacy fallback ordering returns. |

### Package-A acceptance gates

- active metadata never transfers the matrix;
- a remote null clears a seeded stale local value;
- active/unknown server-read failure obtains target remote compatibility data or remains fail-closed, never imports/pushes bundle legacy;
- absent allows the historical fallback;
- version 0 triggers the callback;
- healthy startup has one shared-state GET, not two;
- existing npm run qa:shared-state remains green.

## 8. Work package B — physical-slot parity for Gantt

Do this before a dual-source PostgreSQL Gantt client rollout.

1. Define a stable comparison payload for the visible range: slot ID, route ID, route-step ID, start/end, status, quantity, lock, work centre, resource and boundary membership.
2. Query both sources for the same canonical range.
3. If unequal, return snapshot and emit a compact diagnostic/metric; do not substitute a partially equal aggregate marker.
4. Persist a dedicated marker only if the whole physical-slot contract matches.
5. Add cases for extra split slot, missing split slot, shifted end time, changed resource and changed lock status.

The implementation must bound work to the requested Gantt horizon. Do not read the complete Planning graph just to prove one week.

## 9. Work package C — client cutover behind a flag

Once package B is proven:

1. Add a dedicated Gantt read-model module with feature flag/kill switch.
2. Fetch only the visible horizon with prefetch for an adjacent horizon; do not write the response into global planningState.
3. Keep editor, drag/write and route-detail paths on existing compatibility state initially.
4. Keep a snapshot fallback on malformed/failed window response.
5. Instrument endpoint byte size, data latency, renderer-ready time and user navigation time.
6. Run real authenticated browser acceptance before declaring a gain.

## 10. Mandatory validation protocol

Use the smallest checks while editing, then the full relevant matrix:

    node --check src/modules/runtime_state/service.js
    node --check src/app.js
    node --check scripts/shared-state-endpoint.mjs
    node --check scripts/domain-api.mjs
    npm run qa:shared-state
    npm run qa:planning-gantt-window
    node scripts/domain-api-qa.mjs
    node scripts/planning-period-api-qa.mjs
    npm run qa:domain-repositories
    npm run qa:domain-read-repository-pooling
    npm run build
    git diff --check

For a boot change, add:

    node scripts/run-with-dist-preview.mjs -- node scripts/boot-performance-qa.mjs --module=planning --with-shared-state --skip-warm-start-check --report=reports/performance/planning-shared-state-coalesced.json

Inspect the report and count actual /api/shared-state calls. Do not infer browser acceptance from this local check.

## 11. Commit and release protocol

1. Keep work isolated by vertical slice. Never mix Gantt client cutover, shared-state startup behavior and unrelated UI polish in one commit.
2. Before a visible release, bump all visible version references found by searching for the current version.
3. Commit only after clean targeted checks.
4. Push an explicit branch.
5. Stage and activate through the release commands:

       npm run release:stage:pilot -- --release-id=vX.Y.Z-<shortsha>
       npm run release:activate:pilot -- --release-id=vX.Y.Z-<shortsha>
       curl -fsS --max-time 15 https://pilot.mes-line.ru/healthz
       npm run release:promote-main -- --contour=pilot --release-id=vX.Y.Z-<shortsha>

6. Confirm Git remote history and pilot health.
7. Perform authenticated user-path acceptance. Do not use secrets, copied browser cookies, manual rsync or direct service restart as a release substitute.

## 12. Things not to do

- Do not publish the excluded shared-state experiment.
- Do not use the legacy aggregate parity marker to authorise physical slots.
- Do not reset the user’s original dirty checkout.
- Do not merge or promote a branch only because local build succeeds.
- Do not announce user-perceived speed-up without an authenticated navigation trace.
- Do not reduce data safety by treating unknown compatibility state as absent.

## 13. Starter prompt for the next agent

    Continue the MES server-first performance migration from commit 3fb5468.
    First read docs/handoff/2026-07-18-performance-migration-detailed-handoff.md
    and reports/server-first-performance-status-2026-07-18.md.
    Work only in a fresh clean worktree; do not touch the user’s dirty original
    checkout. Implement Work package A test-first: safe System Domains metadata
    descriptor retired|active|absent, targeted active hydration before legacy
    fallback, tombstone clearing, version-0 callback, and one shared-state
    startup request. Run the full validation matrix. Commit and push only that
    vertical slice; do not deploy until tests and a focused review prove its
    failure paths. Then report measured facts, remaining gap and the exact next
    task. Never claim full performance completion without an authenticated
    Planning-to-Gantt trace.

## 14. Full-goal completion criteria

The original goal is complete only when all are true:

- critical user paths have server domain read/write authority with safe rollback;
- snapshot is no longer the active authority for migrated contours;
- Planning/Gantt user path has a measured, repeatable improvement;
- pilot runs the released version without startup/data integrity regression;
- local, server, and authenticated pilot validation prove the relevant paths;
- the final Git history and handoff identify exact release and rollback points.
