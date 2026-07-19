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
| Structure Positions production island | 209,326 B | 64,392 B | 225,000 B | 68,000 B |
| Structure Org Units production island | 208,696 B | 64,239 B | 225,000 B | 68,000 B |
| Structure Work Centers production island | 209,390 B | 64,349 B | 225,000 B | 68,000 B |
| Structure Equipment production island | 208,973 B | 64,291 B | 225,000 B | 68,000 B |
| Structure Responsibility Policies production island | 210,082 B | 64,604 B | 225,000 B | 68,000 B |
| Structure Migration Diagnostics production island | 208,915 B | 64,240 B | 225,000 B | 68,000 B |
| Weekly Production Control independent entry | 204,704 B | 63,343 B | 225,000 B | 68,000 B |
| Roles and Access independent entry | 208,801 B | 64,511 B | 225,000 B | 68,000 B |
| Component Types independent entry | 204,857 B | 63,539 B | 225,000 B | 68,000 B |
| Operations independent entry | 203,364 B | 63,173 B | 225,000 B | 68,000 B |
| Nomenclature Types independent entry | 203,242 B | 63,096 B | 225,000 B | 68,000 B |
| Statuses independent entry | 204,588 B | 63,461 B | 225,000 B | 68,000 B |
| Full fifteen-scenario lab | 341,330 B | 86,395 B | 350,000 B | 92,000 B |
| Shared lab CSS | 6,017 B | 1,751 B | 6,500 B | 2,100 B |

The budget script also inspects the minified Nomenclature, Boards, Structure
registry and Roles artifacts and rejects unrelated scenario labels. This preserves
independent vertical slices instead of shipping every lab scenario with an
individual island. The larger `350,000 B / 92,000 B` limit applies only to the
fifteen-scenario development lab, never to a production island. Its raw limit
increased only as isolated scenarios were added; every production entry retains the
unchanged `225,000 B / 68,000 B` gate.

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
| Weekly Production Control | measured by the same callback | browser gate passed | weekly fact total updated, revision 2 |

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

The bundled production Statuses island is `200,980 B` raw / `62,993 B` gzip /
`54,248 B` Brotli. Its production-shell first commit was below `20 ms` while
rendering all 85 current runtime rows; this is regression evidence, not Pilot
acceptance.

The bundled production Structure Positions island is `203,728 B` raw /
`63,958 B` gzip / `55,098 B` Brotli. Its production-shell first commit stayed
below `20 ms` across 49 PostgreSQL-backed rows; this is regression evidence, not
Pilot acceptance.

The bundled production Structure Org Units island is `203,298 B` raw /
`63,823 B` gzip / `55,093 B` Brotli. Its production-shell first commit was
`17.3 ms` across 19 PostgreSQL-backed rows; this is regression evidence, not
Pilot acceptance.

The bundled production Structure Work Centers island is `203,739 B` raw /
`64,039 B` gzip / `55,095 B` Brotli. Its production-shell first commit was
`23.8 ms` across 19 PostgreSQL-backed rows; this is regression evidence, not
Pilot acceptance.

The bundled production Structure Equipment island is `203,506 B` raw /
`63,993 B` gzip / `55,085 B` Brotli. Its production-shell first commit was
`16.5 ms` across six PostgreSQL-backed rows; this is regression evidence, not
Pilot acceptance.

The bundled production Structure Responsibility Policies island is `204,254 B`
raw / `64,244 B` gzip / `55,365 B` Brotli. Its temporary non-empty production-
shell first commit was `17.2 ms`; this is regression evidence, not Pilot acceptance.

The bundled production Structure Migration Diagnostics island is `203,082 B`
raw / `63,875 B` gzip / `55,020 B` Brotli. Its 152-row production-shell first
commit was `18.0 ms`; this is regression evidence, not Pilot acceptance.

All measured paths produced revision `1` then `2`.

These local values prove the measurement mechanism only. They are not a Pilot
performance claim or SLA. After integration, the same callback must be measured
on the authenticated Pilot navigation path and compared with the legacy module
on identical payload and viewport.
