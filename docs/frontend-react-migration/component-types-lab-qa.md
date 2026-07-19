# Component Types React migration lab QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`
Baseline: `49d0e1eeecd7b653bdb09d61e73068bb12d22741`

## Scope

Second standalone registry scenario. It mirrors the actual legacy
`directoryState.componentTypes` fields and the eight columns configured by
`getDirectoryData("componentTypes")`. Read mode remains the default; a separate
local write-evaluation path delegates to the existing RBAC-protected directory
command owner and does not change any PostgreSQL-owned file.

## Automated evidence

`node experiments/react-migration/qa.mjs` passes with the full typed migration
source set:

- malformed rows and payloads fail closed;
- numeric fields normalize to finite non-negative values;
- family filters and visible-selection fallback pass;
- a filter removed by a payload update falls back to `all` in both registries;
- shared UI markers include action, selectable row, detail, empty and error;
- direct network, shared-state, runtime-state and browser-storage coupling are
  absent;
- PostgreSQL stop-list is unchanged from the baseline;
- the standalone bundle builds.
- write capabilities fail closed unless explicitly supplied by the production
  host.

## Browser evidence

Checked at `/?scenario=component-types`:

- four fixture rows render with all eight legacy columns;
- family counters are `R/C/L 1`, `Дискреты 1`, `Микросхемы 2`;
- filtering to `Микросхемы` leaves exactly two rows and one selected row;
- keyboard `Enter` selects `QFN / DFN`, updates the detail panel, and preserves
  its `Отключен` status;
- exactly one shared `ActionButton`, one `DetailPanel`, one active filter and
  two shared `SelectableRow` instances are present after filtering;
- the table owns its horizontal overflow (`732px` content in a `686px` wrap)
  without page overflow (`1280px` page and viewport);
- browser console warnings/errors: none.

Nomenclature was rechecked after extracting the shared action/row/detail
components. Its four-row initial state and zero-count `EmptyState` path remained
functional with no console warnings/errors.

## Production integration

The scenario now has an independent production bundle and uses the shared
island host only for the `componentTypes` directory section. Activation requires
two false-by-default server flags and a per-session evaluation request. All
other directory sections and every edit-capable session remain legacy.

Production-shell QA compares the same four-row runtime payload in legacy and
React. All eight formatted cells and row order match, including Russian decimal
format and the `комп./ч`, `сек`, and `шт.` units. Family filtering, selection,
detail, return to the full legacy directories list, disabled React writes, unchanged state,
clean console, and a `< 25 ms` local first commit pass. The production artifact
remains below its `225,000 B` raw / `68,000 B` gzip budget.

## Local command parity

The local production-shell QA now also runs a separate write contour. React
creates one disposable Component Type, edits its name and coefficient, and
then verifies the exact persisted fields through the legacy table. Deletion
uses the existing directory mutation primitive with the established
`persistDirectoryStateWithRemoval` flush so a shared-state rebase cannot revive
the deleted row.

After cleanup, all four original fixture rows and their order are restored.
Planning routes, route steps and slots are byte-equivalent by domain projection,
and the browser console remains clean. The write path is available only when
the local QA request is explicit and the current RBAC subject has
`directories:edit`; capabilities otherwise remain false.

## Pilot acceptance

The production host shipped disabled by default in release
`v.1.499.73-b1b77cf`. On 2026-07-19, one authenticated session evaluated
Component Types in read-only mode.

The live dataset contained eight rows, extending the four-row local fixture.
All eight rows and all eight formatted cells matched legacy literally and in
the same order. Family counts were `3 / 1 / 3 / 1`; the `Микросхемы` filter and
the `BGA` passport passed. First React commit was `137.40 ms`, and add remained
disabled. Returning to `Все справочники` restored the four-section legacy
directory shell.

Deactivation restored the unchanged eight-row legacy table in an authenticated
session even with the evaluation query retained. All flags are off, the
temporary root directory is removed, and no Pilot data was written. The Pilot
write checkpoint remains separate and requires an authenticated
`directories:edit` subject plus its own server-side write gate; the current QA
role correctly remains read-only.
