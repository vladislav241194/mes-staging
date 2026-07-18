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

## Automatic legacy boundaries

- feature flag absent or disabled: legacy;
- Boards/BOM pane: legacy (`unsupported-scope`);
- editor-capable session without the explicit evaluation flag: legacy
  (`write-parity-incomplete`);
- dynamic bundle load or React render failure: the island is unmounted and the
  module rerenders once in legacy for the rest of the page session;
- the Boards sidebar action inside React requests the same legacy fallback.

The production bundle is emitted separately at
`dist/src/react-islands/nomenclature.js`, so it is not part of the default app
startup path. Current minified size is about `197 KiB` raw / `63,288 B` gzip,
inside the isolated `225,000 B` raw / `68,000 B` gzip budget.

## Local evidence

- syntax checks for the host and `src/app.js` pass;
- React migration QA covers disabled, unsupported, editor and eligible
  activation decisions;
- the build contains the independent island export;
- root bundle performance budget passes (`app 202,329 B` Brotli);
- root production build passes at application version `v.1.499.70`;
- frozen backend guard passes.

This is local integration evidence, not Pilot acceptance. The two flags remain
off until an authenticated evaluation session and same-data visual comparison
are scheduled.
