# MES frontend React migration master

Date: 2026-07-19
Branch: `codex/frontend-react-migration`
Worktree: `/Users/vladislav/Documents/Codex/2026-05-30/mes-frontend-react`
Baseline: `49d0e1eeecd7b653bdb09d61e73068bb12d22741`
Coordination handoff: PostgreSQL commit `4f0fbae`

## Coordination checkpoint

PostgreSQL handoff commit `c89a675` confirms the live worker assignment,
cold-login task display, fact read-back, logout, and guarded QA-data cleanup.
The accepted PostgreSQL release `c3b4059` is live, and `origin/main` has since
advanced to the final-gate handoff commit `e4e65aa`. The slice includes guarded
Specifications 2.0 commands, verified runtime rollback, and retirement fixes
for System Domains shared-state compatibility plus compatibility-backup
hardening, preparation of `v1.499.70`, and isolation of bootstrap compression
artifacts. Root activation and authenticated acceptance of the two
Specifications 2.0 command flags remain pending, so the published integration
order still places frontend rebase after that final audit. The accepted
PostgreSQL release and final-gate handoff are already on `main`; only the root
activation/final authenticated audit still prevents the actual frontend rebase.
Independent work inside the isolated frontend worktree remains available, so
the temporary stop-list below applies to integration files rather than blocking
the migration master as a whole.

## Goal

Move the MES frontend from legacy JavaScript and manual DOM rendering to React
and TypeScript through complete, measurable user scenarios. Preserve business
logic, API contracts, user data, the legacy UI, and the existing visual and
Gantt contracts until each replacement is explicitly accepted.

This branch is isolated and must not be merged ahead of the accepted
PostgreSQL authority slice.

## Temporary stop-list

Until the PostgreSQL worker scenario, rollback drill, merge, and live acceptance
are green, this task does not change:

- `src/app.js`;
- `src/modules/runtime_state/service.js`;
- auth/login hydration and runtime reconciliation;
- Shift Master Board server projection or bridge code;
- Shift Execution API, repository, authority, or their QA scripts;
- `package.json`, `package-lock.json`, `index.html`, or `app-version.json`;
- business logic, API contracts, or the data model.

The PostgreSQL task remains the sole owner of `package-lock.json` during its
active goal. Shared build files require explicit coordination.

## Migration rules

1. Use a strangler path: legacy remains available until a React scenario passes
   functional, visual, performance, and live-pilot acceptance.
2. Move one user scenario at a time, not one technical layer at a time.
3. Put all server payload normalization behind typed adapters.
4. Separate shared UI primitives from process-specific MES components.
5. Treat existing module differences as intentional, accidental, or unresolved
   before reproducing them.
6. Do not use React migration as permission to redesign, change commands, or
   replace PostgreSQL contracts.
7. A local build is not acceptance; the final gate is the real pilot path.

## Current module families

| Family | Modules | Migration treatment |
| --- | --- | --- |
| Registry/sidebar | Nomenclature, Roles, Production Structure, Directories | Shared page, sidebar, filter, table, detail contracts |
| Dense planning | Planning, Timesheet, Weekly Control | Shared loading/error contracts; specialized dense layouts |
| Operational | Workshop, Worker Desktop, Shift Journal | Blocked until PostgreSQL worker scenario and hydration freeze |
| Protected canvas | Gantt, Specifications 2.0 | Migrate last; retain geometry and interaction guardrails |
| Admin/standalone | Contours, Authorization | Keep isolated security and standalone-shell contracts |

## Isolated vertical scenarios

`Nomenclature: open -> filter by type -> select an item -> inspect its card.`

Why first:

- its renderer is not changed by the current PostgreSQL branch;
- it represents a common registry/sidebar/table/detail pattern;
- the first slice can be read-only and therefore cannot corrupt pilot data;
- its acceptance is visible and measurable;
- the resulting primitives can later support Roles, Production Structure, and
  Directories without forcing those modules to have identical layouts.

The initial implementation lives under `experiments/react-migration/`. It is a
standalone architecture lab using a fixture through a typed adapter. It is not
wired into the MES application and is not a release candidate.

The second proof is `Component Types: open -> filter by family -> select a type
-> inspect its calculation fields.` It mirrors all eight legacy columns and
reuses the same action, selectable-row, detail, table, status, sidebar, panel,
header and page contracts. This closes the one-off-prototype risk for the
registry family: shared behavior now has two consumers, while entity columns
remain scenario-specific.

All three scenarios are available through the generic reversible island boundary.
Nomenclature remains the only proposed first production feature-flag scope;
Component Types is an isolated reuse proof, and Boards/BOM is an isolated
process-specific proof; neither is a production activation claim.

The lab also contains a host-side feature gate. A disabled flag never mounts
React; mount/update/render failures schedule one fallback, unmount React, and
restore the host-owned legacy view. Browser QA proved disabled and render-error
paths without console warnings. This closes the isolated rollback-mechanics
gate but does not wire or activate a production flag.

The production-candidate Nomenclature and Boards entries are separated from the
multi-scenario lab. Each minified budget is `225,000 B` raw / `68,000 B` gzip;
the current artifacts are respectively `205,396 B` / `63,682 B` and
`208,032 B` / `64,296 B`, and each is checked not to contain unrelated
scenarios. The shared runtime reports post-commit revision
events, so Pilot mount/update time can later be measured without arbitrary
timeouts. Local timings are QA evidence only, not Pilot acceptance.

The legacy source audit also found that `Печатные платы` in the Nomenclature
sidebar opens the separate Boards/BOM pane and counts `bomLists`; it is not an
item filter. The React item-list scenario still requests `unsupported-scope`
and returns to legacy for that action. An independent Boards/BOM read-only
vertical scenario now covers board selection, identity, nine-column BOM
inspection, component totals and the empty-board state without prematurely
taking over production navigation.

The same audit confirmed that the legacy module owns create/edit/delete
commands. The read-only React slice is therefore eligible only for an explicit
evaluation access mode. Editor access returns `write-parity-incomplete` before
mount, so no working user loses commands while write parity is unfinished.

The QA now executes the actual legacy Nomenclature renderer and compares it
with the React adapter on the same fixture. The seven read headers, four row
IDs, cell values, order and initial selection match. The legacy editor and
`Действия` column are recorded as intentional non-parity protected by the
activation policy, not hidden behind a broad parity claim.

Boards QA also executes the actual legacy Boards page and BOM row normalizer on
the shared fixture. Nine read headers, normalized row values and order, plus
sidebar component totals match. The legacy action column, editable inputs,
create/import/delete commands, and editor mode remain explicit non-parity.

A dry-run rebase preflight against `origin/main@e4e65aa` found 33 frontend paths,
50 main paths, zero overlapping paths and zero merge conflict markers. The
actual rebase is structurally ready but remains deferred until the final root
Specifications acceptance required by the PostgreSQL handoff.

## Acceptance gates for the first integrated slice

- legacy and React routes can be switched independently by a feature flag;
- identical API payload produces equivalent visible data;
- filtering and selection survive rerenders without full-page replacement;
- keyboard focus and table/sidebar semantics remain usable;
- no command or write is introduced in the first slice;
- no regression in startup or navigation budgets;
- visual comparison is approved on the same viewport and data;
- pilot smoke is completed after the PostgreSQL slice is accepted and rebased.

## Integration order

1. Finish the isolated lab and component contract. **Complete for two registry proofs and the Boards/BOM read-only proof.**
2. Wait for PostgreSQL live worker acceptance and contract checkpoint.
3. Rebase this branch onto the accepted PostgreSQL/main commit.
4. Replace fixtures with read-only API adapters.
5. Mount the first React island behind a disabled-by-default feature flag.
6. Run legacy parity, functional, visual, performance, and pilot checks.
7. Only then choose the next registry scenario.
