# Nomenclature production island QA

Date: 2026-07-19
Base: accepted PostgreSQL/main handoff `fc71e01`

## Integrated boundary

The existing Nomenclature runtime now has a real React island host. The host
reads the current `directoryState` payload through the already validated typed
adapter. Read-only mode remains unchanged. A separate write-evaluation boundary
can invoke create/edit through the same `products/events` command owner as the
legacy form; React receives neither storage handles nor mutable global state,
and no API or PostgreSQL contract changes.

The read-only server rollout requires the first two runtime values to be exactly
`true`; write evaluation additionally requires the third:

- `MES_REACT_NOMENCLATURE`;
- `MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION`;
- `MES_REACT_NOMENCLATURE_WRITE_EVALUATION` for the separately gated
  create/edit evaluation.

The second value permits an evaluation request; it does not switch every
session into read-only mode. A session must also request
`react-nomenclature-evaluation=1` and be either authenticated or explicitly
running with `qa-auth-bypass=1`. Without that per-session request, editors and
ordinary users stay in legacy even when both read switches are enabled.

All switches are absent by default, so the production and Pilot behavior
remains the legacy renderer and the React bundle is not requested.

The server publishes these booleans from the non-secret environment switches
`MES_REACT_NOMENCLATURE=1` and
`MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION=1`, plus the independent
`MES_REACT_NOMENCLATURE_WRITE_EVALUATION=1`. Any missing value or value other
than `1` publishes `false`.

Production write evaluation additionally requires an authenticated session
request `react-nomenclature-write-evaluation=1`. The write permission is false
by default and independent of the read-only permission. Local disposable QA
uses `react-nomenclature=1&react-nomenclature-write=1` under the existing
loopback plus `qa-auth-bypass=1` restriction.

Local browser QA can use query overrides `react-nomenclature=1` and
`react-nomenclature-readonly=1`. They are accepted only on
`localhost`, `127.0.0.1`, or `::1`, and only together with
`qa-auth-bypass=1`; the same URL cannot activate React on Pilot or another
remote host.

## Automatic legacy boundaries

- feature flag absent or disabled: legacy;
- server rollout enabled without an authenticated/QA session evaluation
  request: legacy;
- Boards/BOM pane: legacy (`unsupported-scope`);
- editor-capable session without the explicit write-evaluation flag: legacy
  (`write-parity-incomplete`);
- delete remains an explicit handoff to the exact selected legacy editor;
- dynamic bundle load or React render failure: the island is unmounted and the
  module rerenders once in legacy for the rest of the page session;
- the Boards sidebar action inside React requests the same legacy fallback and
  preserves the user's intent by opening the legacy Boards/BOM pane.

The production bundle is emitted separately at
`dist/src/react-islands/nomenclature.js`, so it is not part of the default app
startup path. Current production artifact is `205,773 B` raw / `64,539 B` gzip /
`55,547 B` Brotli,
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
- root bundle performance budget passes (`app 202,535 B` Brotli in the current build);
- root production build passes at release-candidate version `v.1.499.72`;
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

The manual local checkpoint used an empty Nomenclature store. A repeatable
production-shell functional QA now closes that gap with a disposable `0600`
shared-state file containing four positions and two boards. It proves the
same seven visible cells and row order in legacy and React, initial
selection/detail agreement, counts `4 / 2 / 2`, the
single-row Mechanics filter, disabled writes, legacy Boards fallback and an
unchanged state file after the complete read-only scenario. A separate preview
over the same disposable `0600` fixture proves one React create, one React edit,
exact field persistence through the existing command owner, unchanged Planning
state, a legacy-form edit through the extracted same owner, and selected-row
fallback to the legacy editor for delete. The temporary
directory and browser profile are removed after every run.

The production target records `data-react-island-commit-ms` when revision `1`
commits. The automated local gate requires this end-to-end value (dynamic
bundle load plus the first React commit) to stay below `2000 ms`; Pilot will
use the same marker rather than a fixed wait.

Run the complete checkpoint with:

```sh
npm run qa:nomenclature-react-island
```

An authenticated same-data Pilot evaluation is still required before any
default-on activation or removal of the legacy fallback.

## Pilot rollout operations

Release `v.1.499.71-7b9bbf7` was activated on Pilot with both React flags
absent. Public health returned `status=ok`, version `v.1.499.71`, and the
authenticated browser loaded the new application asset while keeping the
Nomenclature module on legacy. The active service and release pointer were
healthy, no React root or commit marker was present, and the create action was
still available. The current Pilot Nomenclature payload in that session was
empty, so a non-empty live parity claim was deliberately not made.

Release `v.1.499.72-6985693` then replaced it with the versioned rollout
operations included. Its public health is `ok`, shared state is `ready`, both
scripts are executable in the immutable active release, and the browser loaded
`src/app.js?v=db3bbb28f842-v.1.499.72`. Both flags remain `false`, legacy still
renders with the create action, there is no React root or commit marker, and
the browser console is clean. Release `.71` is the immediate rollback target.

The repository now ships a controlled root-only permission toggle:

```sh
/srv/mes/pilot/app/ops/frontend/activate-react-nomenclature-evaluation.sh
```

It installs only `70-react-nomenclature-evaluation.conf`, restarts the selected
service, requires health plus both published booleans to be true, and restores
the previous drop-in automatically if verification fails. Ordinary sessions
still use legacy because the per-session `react-nomenclature-evaluation=1`
request remains mandatory.

Disable the permission with:

```sh
/srv/mes/pilot/app/ops/frontend/deactivate-react-nomenclature-evaluation.sh
```

The deploy account can restart Pilot but cannot write the root-owned systemd
drop-in. Therefore the permission toggle requires the same narrow root-operator
handoff model used by the accepted PostgreSQL feature activations.
