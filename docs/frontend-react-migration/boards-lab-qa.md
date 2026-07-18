# Boards/BOM React migration lab QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`
Baseline: `49d0e1eeecd7b653bdb09d61e73068bb12d22741`

## Scope

Standalone, read-only vertical scenario:

`open Boards -> select a board -> inspect board identity -> inspect BOM rows and component totals`.

It reads the existing `directoryState.bomLists` shape through a typed adapter.
It does not call an API, persist state, expose create/import/edit/delete commands,
or change the production Nomenclature activation policy.

## Legacy contract preserved

The source audit and executable parity test cover the current production
renderers in `src/modules/nomenclature/render.js` and
`src/modules/products/render.js`:

- a board has `id`, `name`, `boardCode`, `resultItem`, optional status/source
  file, `importHeaders`, and `importRows`;
- each imported row keeps the nine Excel A:I values;
- numeric package values such as `603` normalize to `0603`;
- quantity uses the current non-negative integer rounding semantics;
- component totals are calculated from imported row quantities and classified
  into the eight existing groups;
- a board without imported rows keeps the legacy sidebar badge `0`;
- the legacy `Действия` column and editable inputs remain outside the React
  read-only slice.

The same fixture is rendered by the actual legacy Boards page and adapted for
React. Header order, normalized row values, row order, and sidebar component
totals match.

## Automated evidence

Command:

```sh
node experiments/react-migration/qa.mjs
```

Result:

- 27 TypeScript/TSX sources compile;
- invalid board records and invalid row containers fail closed;
- the known `Аритикул производителя` header typo normalizes to the current
  legacy label;
- four imported rows produce 16 components in four active component groups;
- actual legacy row normalization equals the React adapter result;
- actual legacy table headers and sidebar totals equal the React read model;
- direct network calls, persistence, shared-state coupling, and blocked-path
  changes remain forbidden;
- independent Boards island and full lab build successfully.

## Browser evidence

Checked in the local in-app browser at `1280x720`:

1. `Плата управления` opened with four rows, 16 components, four active groups,
   the expected 9 headers, and its board/source metadata.
2. Selecting `Плата питания` changed the pressed sidebar item and rendered the
   zero-row empty state with status `Черновик`.
3. Updating the payload replaced the snapshot without remounting: scenario
   stayed `boards`, revision advanced to `2`, the selected board showed two
   rows and five components, and the measured local commit was `3.80 ms`.
4. The wide table overflow remained inside `TableWrap`; the page itself had no
   horizontal overflow.
5. `?scenario=boards&access=editor` produced
   `write-parity-incomplete`, no React page, and no React revision.
6. A deliberate render failure produced exactly one `render-error` legacy
   fallback with the original failure message retained.

The local commit duration proves the telemetry path, not Pilot performance.

## Production boundary

`mountBoardsReactIsland(...)` is an isolated, independently budgeted entry point.
It is now connected to the production Nomenclature host as a separate,
disabled-by-default read-only island. It mounts only when the current pane is
`boards`, both `MES_REACT_BOARDS=1` and
`MES_REACT_BOARDS_READ_ONLY_EVALUATION=1`, and an authenticated session
explicitly requests `react-boards-evaluation=1`. Editor access stays legacy.

Localhost QA may use `qa-auth-bypass=1`, `react-boards=1`, and
`react-boards-readonly=1`. These overrides are rejected on non-local hosts.

Production-shell command:

```sh
npm run qa:boards-react-island
```

Result:

- the same directory payload produces the same nine legacy and React BOM
  headers and the same four normalized rows in the same order;
- server flags without a per-session request preserve the legacy Boards editor;
- the initial board exposes 16 components in four active groups;
- selecting the empty board preserves its card and explicit empty state;
- import remains disabled and the disposable `0600` state file stays unchanged;
- `Вся номенклатура` unmounts React and returns to the two-row legacy items pane;
- console and page-level overflow checks are clean;
- observed local commits were `15.90–21.20 ms`, below the `2000 ms` local gate;
- artifact size is `203,869 B` raw / `64,223 B` gzip / `60,893 B` Brotli,
  within its `225,000 B` raw / `68,000 B` gzip budget.

No Boards flag is included in the active Pilot release. Authenticated Pilot
comparison and rollback remain downstream of the first Nomenclature live
evaluation, so `v.1.499.72-6985693` is unchanged.
