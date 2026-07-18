# Nomenclature React migration lab QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`
Baseline: `49d0e1eeecd7b653bdb09d61e73068bb12d22741`

## Scope

Standalone, read-only React + TypeScript scenario using the actual legacy
`nomenclature` and `nomenclatureTypes` shapes. The lab is not connected to MES,
does not call an API, does not persist browser state, and cannot write data.

## Automated evidence

Command:

```sh
node experiments/react-migration/qa.mjs
```

Result:

- seven typed sources compiled;
- invalid position records fail closed;
- legacy REA aliases normalize to `РЭА компоненты`;
- inactive type rows are excluded;
- dynamic filters and Russian record-count forms pass;
- required MES UI contract markers are present;
- no legacy runtime, shared-state, persistence, or direct network coupling;
- PostgreSQL stop-list unchanged from baseline;
- standalone production bundle builds.

## Browser evidence

Checked in the local in-app browser at a 1280px viewport:

- all four positions render with the seven legacy data columns;
- declared active types render with correct counts;
- the archived type is absent;
- `РЭА компоненты` filters the list from four rows to two;
- keyboard `Enter` selects `Микроконтроллер STM32`;
- the detail card updates to manufacturer `ST`;
- exactly one filter and one table row expose the selected state;
- wide-table overflow is owned by `TableWrap` (`758px` content inside `686px`)
  and does not create page overflow (`1280px` page width);
- an active zero-count type shows `EmptyState`, no table, no selected row, and
  no page overflow;
- browser console warnings/errors: none.

## React island lifecycle evidence

The standalone host was opened with `?lifecycle_qa=1` and exercised through
visible host controls:

1. Initial mount rendered four positions and status `mounted`.
2. `update(payload)` replaced the snapshot with one cable position, updated all
   type counters, changed the count to `1 запись`, and selected the new item.
3. `unmount()` removed every child from `#root` while preserving the root and
   the host-owned lifecycle controls; status became `unmounted`.
4. A second update after unmount was rejected with
   `Nomenclature React island is already unmounted`; the root stayed empty and
   no `main` element was recreated.
5. Browser console warnings/errors: none.

## React island failure evidence

The lifecycle host deliberately passed a payload whose property access throws:

1. The error stayed inside the React target and rendered `SystemState` with
   `Интерфейс временно недоступен` and a return-to-legacy instruction.
2. The host callback received `Lifecycle QA render failure` and exposed it in
   the host-owned lifecycle status.
3. The target remained mounted with one fallback child and host controls stayed
   available.
4. `unmount()` then emptied `#root`, preserved the host controls, and disabled
   further update/error actions.
5. Browser console warnings/errors: none.

## Not yet proven

- parity against a live MES payload;
- mounting inside the legacy application;
- feature-flag rollback;
- main bundle and navigation performance;
- Pilot acceptance.

Those gates remain blocked by the PostgreSQL integration order and must not be
claimed from this isolated lab.
