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

- sixteen typed sources in the combined registry lab compiled;
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
- `Печатные платы` uses the separate legacy `bomLists` count instead of the
  count of nomenclature rows with that type;
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

## Legacy Boards pane parity

The source audit of `src/modules/nomenclature/render.js` showed that
`Печатные платы` is not a normal nomenclature filter. It switches to the
embedded Boards/BOM pane and its badge counts `directoryState.bomLists`.

The fixture deliberately contains one nomenclature PCB row and two `bomLists`.
The browser rendered `Печатные платы 2`. Clicking it requested
`unsupported-scope`, unmounted React, restored the host-owned legacy view, and
left no React `main`. The console remained clean. The Boards pane is therefore
preserved in legacy until it receives its own vertical migration; React no
longer silently changes this business navigation into a row filter.

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

## React island failure and host fallback evidence

The lifecycle host deliberately passed a payload whose property access throws:

1. The React boundary caught the render error and notified the host.
2. The feature gate scheduled one fallback, unmounted React outside its render
   phase, and rendered the host-owned `Legacy-интерфейс восстановлен` state.
3. The lifecycle status retained the exact `Lifecycle QA render failure`
   reason; host controls remained available and no React `main` remained.
4. A later update was rejected in `legacy` state and did not remount React.
5. Disposing the gate preserved the restored legacy view and disabled further
   lifecycle actions.
6. Browser console warnings/errors: none.

## Not yet proven

- parity against a live MES payload;
- mounting inside the legacy application;
- feature-flag rollback;
- main bundle and navigation performance;
- Pilot acceptance.

Those gates remain blocked by the PostgreSQL integration order and must not be
claimed from this isolated lab.
