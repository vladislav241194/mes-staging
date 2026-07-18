# React migration performance gate

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Deterministic bundle budgets

Command:

```sh
node experiments/react-migration/performance-budget.mjs
```

Current minified measurements:

| Artifact | Raw | Gzip | Budget raw | Budget gzip |
| --- | ---: | ---: | ---: | ---: |
| Nomenclature production island | 204,954 B | 63,501 B | 225,000 B | 68,000 B |
| Full two-scenario lab | 218,626 B | 66,437 B | 240,000 B | 75,000 B |
| Shared lab CSS | 4,593 B | 1,438 B | 6,000 B | 2,000 B |

The budget script also inspects the minified Nomenclature artifact and rejects
it if the Component Types scenario label is bundled. This preserves the first
vertical slice instead of shipping every lab scenario with it.

The command is part of `qa.mjs`, so size regressions fail the normal isolated
contract gate.

## Commit-render telemetry

The shared island runtime exposes `onReady({ revision })` from a React effect
after commit. The lab host records scenario, revision, and elapsed commit time
on the mount element.

Browser evidence from one local run:

| Scenario | Initial commit | Update commit | Result after update |
| --- | ---: | ---: | --- |
| Nomenclature | 21.2 ms | 3.0 ms | 1 row, one selected row |
| Component Types | 9.6 ms | 1.4 ms | 1 row, detail updated |

Both paths produced revision `1` then `2`, with no console warnings/errors.

These local values prove the measurement mechanism only. They are not a Pilot
performance claim or SLA. After integration, the same callback must be measured
on the authenticated Pilot navigation path and compared with the legacy module
on identical payload and viewport.
