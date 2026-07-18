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
| Nomenclature production island | 205,469 B | 63,705 B | 225,000 B | 68,000 B |
| Boards/BOM production island | 208,616 B | 64,478 B | 225,000 B | 68,000 B |
| Structure Employees production island | 210,459 B | 64,768 B | 225,000 B | 68,000 B |
| Full four-scenario lab | 248,419 B | 72,626 B | 260,000 B | 80,000 B |
| Shared lab CSS | 5,787 B | 1,691 B | 6,000 B | 2,000 B |

The budget script also inspects the minified Nomenclature, Boards and Structure
Employees artifacts and rejects unrelated scenario labels. This preserves
independent vertical slices instead of shipping every lab scenario with an
individual island. The larger `260,000 B / 80,000 B` limit applies only to the
four-scenario development lab, never to a production island.

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
| Boards/BOM | measured by the same callback | 3.80 ms | 2 rows, 5 components, revision 2 |
| Structure Employees | measured by the same callback | 2.90 ms | 1 employee, metric and detail updated, revision 2 |

All measured paths produced revision `1` then `2`.

These local values prove the measurement mechanism only. They are not a Pilot
performance claim or SLA. After integration, the same callback must be measured
on the authenticated Pilot navigation path and compared with the legacy module
on identical payload and viewport.
