# Nomenclature legacy data-parity QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Authoritative comparison

The isolated QA imports and executes the current production source
`src/modules/nomenclature/render.js`. It does not copy its table into a test.
The same fixture is passed through the React typed adapter.

The comparison proves:

- legacy read headers and React headers have the same order:
  `Наименование`, `Артикул`, `Раздел`, `Корпус`, `Ед.`, `Производитель`,
  `Статус`;
- all four row IDs remain in the same order;
- every visible cell in those seven columns is equal;
- the legacy selected row equals the React initial selected row;
- absent article, package and manufacturer values use the legacy `-` fallback;
- the PostgreSQL stop-list stays unchanged.

## Intentional non-parity

The actual legacy table has an eighth `Действия` column and the page has a
create/edit/delete form. They are not present as working commands in the first
React slice. This is not reported as parity.

The activation policy permits React only for explicit read-only evaluation.
Editor access receives `write-parity-incomplete` and remains in legacy. Boards
receives `unsupported-scope` and remains in its legacy BOM pane.

## Remaining gate

This test proves deterministic data parity for the fixture and current source.
After PostgreSQL acceptance, it must be repeated with one captured, sanitized
read payload from the accepted host adapter and followed by side-by-side visual
comparison on the same Pilot viewport. No live data is stored in this branch.
