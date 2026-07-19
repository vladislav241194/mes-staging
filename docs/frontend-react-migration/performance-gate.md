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
| Roles and Access independent entry | 208,801 B | 64,511 B | 225,000 B | 68,000 B |
| Component Types independent entry | 204,857 B | 63,539 B | 225,000 B | 68,000 B |
| Operations independent entry | 203,364 B | 63,173 B | 225,000 B | 68,000 B |
| Nomenclature Types independent entry | 203,242 B | 63,096 B | 225,000 B | 68,000 B |
| Full seven-scenario lab | 276,375 B | 76,915 B | 280,000 B | 85,000 B |
| Shared lab CSS | 6,017 B | 1,751 B | 6,500 B | 2,100 B |

The budget script also inspects the minified Nomenclature, Boards, Structure
Employees and Roles artifacts and rejects unrelated scenario labels. This preserves
independent vertical slices instead of shipping every lab scenario with an
individual island. The larger `280,000 B / 85,000 B` limit applies only to the
seven-scenario development lab, never to a production island.

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
| Roles and Access | measured by the same callback | browser gate passed | selected role passport updated, revision 2 |

The bundled production Roles island is `204,264 B` raw / `64,094 B` gzip /
`55,289 B` Brotli. Its production-shell first commit measured below `25 ms` on the
local QA contour; this is regression evidence, not Pilot acceptance.

The bundled production Component Types island is `201,269 B` raw / `63,156 B`
gzip / `54,455 B` Brotli. Its production-shell first commit measured below
`25 ms` locally; this is regression evidence, not Pilot acceptance.

The bundled production Operations island is `200,213 B` raw / `62,802 B`
gzip / `54,111 B` Brotli. Its production-shell first commit measured below
`25 ms` locally; this is regression evidence, not Pilot acceptance.

The bundled production Nomenclature Types island is `200,131 B` raw /
`62,738 B` gzip / `53,938 B` Brotli. Its production-shell first commit was
`18.6 ms` locally; this is regression evidence, not Pilot acceptance.

All measured paths produced revision `1` then `2`.

These local values prove the measurement mechanism only. They are not a Pilot
performance claim or SLA. After integration, the same callback must be measured
on the authenticated Pilot navigation path and compared with the legacy module
on identical payload and viewport.
