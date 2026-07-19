# Component Types React migration lab QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`
Baseline: `49d0e1eeecd7b653bdb09d61e73068bb12d22741`

## Scope

Second standalone read-only registry scenario. It mirrors the actual legacy
`directoryState.componentTypes` fields and the eight columns configured by
`getDirectoryData("componentTypes")`. It does not call MES APIs, persist state,
or change any PostgreSQL-owned file.

## Automated evidence

`node experiments/react-migration/qa.mjs` passed with 17 typed sources:

- malformed rows and payloads fail closed;
- numeric fields normalize to finite non-negative values;
- family filters and visible-selection fallback pass;
- a filter removed by a payload update falls back to `all` in both registries;
- shared UI markers include action, selectable row, detail, empty and error;
- direct network, shared-state, runtime-state and browser-storage coupling are
  absent;
- PostgreSQL stop-list is unchanged from the baseline;
- the standalone bundle builds.

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
detail, return to legacy Operations, disabled React writes, unchanged state,
clean console, and a `< 25 ms` local first commit pass. The production artifact
is `201,269 B` raw / `63,156 B` gzip / `54,455 B` Brotli.

No release or Pilot activation exists yet. Authenticated Pilot acceptance and
rollback proof remain pending.
