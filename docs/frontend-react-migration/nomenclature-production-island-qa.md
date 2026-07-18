# Nomenclature production island QA

Date: 2026-07-19
Base: accepted PostgreSQL/main handoff `fc71e01`

## Integrated boundary

The existing Nomenclature runtime now has a real React island host. The host
reads the current `directoryState` payload through the already validated typed
adapter. It does not add a command, mutate application state, or change an API
or PostgreSQL contract.

React activation requires both runtime values to be exactly `true`:

- `MES_REACT_NOMENCLATURE`;
- `MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION`.

Both are absent by default, so the production and Pilot behavior remains the
legacy renderer and the React bundle is not requested.

The server publishes these booleans from the non-secret environment switches
`MES_REACT_NOMENCLATURE=1` and
`MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION=1`. Any missing value or value
other than `1` publishes `false`.

Local browser QA can use query overrides `react-nomenclature=1` and
`react-nomenclature-readonly=1`. They are accepted only on
`localhost`, `127.0.0.1`, or `::1`, and only together with
`qa-auth-bypass=1`; the same URL cannot activate React on Pilot or another
remote host.

## Automatic legacy boundaries

- feature flag absent or disabled: legacy;
- Boards/BOM pane: legacy (`unsupported-scope`);
- editor-capable session without the explicit evaluation flag: legacy
  (`write-parity-incomplete`);
- dynamic bundle load or React render failure: the island is unmounted and the
  module rerenders once in legacy for the rest of the page session;
- the Boards sidebar action inside React requests the same legacy fallback and
  preserves the user's intent by opening the legacy Boards/BOM pane.

The production bundle is emitted separately at
`dist/src/react-islands/nomenclature.js`, so it is not part of the default app
startup path. Current minified size is about `197 KiB` raw / `63,288 B` gzip,
inside the isolated `225,000 B` raw / `68,000 B` gzip budget.
Its request URL uses the content hash of the island artifact rather than the
human-readable application version, so an island-only update cannot reuse a
stale immutable browser response.

## Local evidence

- syntax checks for the host and `src/app.js` pass;
- React migration QA covers disabled, unsupported, editor and eligible
  activation decisions;
- the build contains the independent island export;
- the production island uses the automatic JSX runtime and does not depend on
  a browser-global `React` variable;
- root bundle performance budget passes (`app 202,329 B` Brotli);
- root production build passes at application version `v.1.499.70`;
- frozen backend guard passes.

This is local integration evidence, not Pilot acceptance. The two flags remain
off until an authenticated evaluation session and same-data visual comparison
are scheduled.

## Local browser checkpoint

The production shell was exercised through the local dist preview after the
initial integration commit. This checkpoint found and fixed three issues that
source/build checks alone did not expose:

1. the server did not publish the two rollout booleans;
2. the production island bundle used the classic JSX runtime and expected an
   unavailable browser-global `React`;
3. the immutable island URL used only the human-readable application version,
   so a corrected island could remain stale in browser cache.

After the fixes, browser evidence confirms:

- default-off renders legacy with no React target and no page overflow;
- local read-only QA activation mounts exactly one island at revision `1`;
- the create button is disabled and the island has no legacy editor rows;
- the empty-state screen has no page-level horizontal overflow;
- choosing `Печатные платы` unmounts React and opens exactly one legacy
  Boards/BOM pane while preserving the requested destination;
- enabling only the feature flag without the read-only evaluation flag never
  mounts React.

The shared local state used by this checkpoint currently contains zero
Nomenclature rows. Non-empty row parity remains covered by the actual legacy
renderer/typed-adapter fixture QA; an authenticated same-data Pilot evaluation
is still required before activation.
