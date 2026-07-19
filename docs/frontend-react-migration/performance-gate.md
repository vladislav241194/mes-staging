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
| Nomenclature production island | 205,544 B | 63,733 B | 225,000 B | 68,000 B |
| Boards/BOM production island | 208,691 B | 64,506 B | 225,000 B | 68,000 B |
| Structure Employees production island | 210,534 B | 64,790 B | 225,000 B | 68,000 B |
| Structure Positions production island | 209,401 B | 64,418 B | 225,000 B | 68,000 B |
| Structure Org Units production island | 208,771 B | 64,265 B | 225,000 B | 68,000 B |
| Structure Work Centers production island | 209,465 B | 64,375 B | 225,000 B | 68,000 B |
| Structure Equipment production island | 209,048 B | 64,318 B | 225,000 B | 68,000 B |
| Structure Responsibility Policies production island | 210,157 B | 64,629 B | 225,000 B | 68,000 B |
| Structure Migration Diagnostics production island | 208,970 B | 64,266 B | 225,000 B | 68,000 B |
| Weekly Production Control production island | 204,805 B | 63,393 B | 225,000 B | 68,000 B |
| Timesheet production island | 204,934 B | 63,584 B | 225,000 B | 68,000 B |
| Planning Workbench production island | 205,200 B | 63,549 B | 225,000 B | 68,000 B |
| Shift Work Orders isolated entry | 210,824 B | 64,526 B | 225,000 B | 68,000 B |
| Roles and Access independent entry | 208,876 B | 64,532 B | 225,000 B | 68,000 B |
| Component Types independent entry | 204,932 B | 63,572 B | 225,000 B | 68,000 B |
| Operations independent entry | 203,439 B | 63,200 B | 225,000 B | 68,000 B |
| Nomenclature Types independent entry | 203,317 B | 63,128 B | 225,000 B | 68,000 B |
| Statuses independent entry | 204,663 B | 63,488 B | 225,000 B | 68,000 B |
| Full eighteen-scenario lab | 382,793 B | 94,415 B | 390,000 B | 105,000 B |
| Shared lab CSS | 6,017 B | 1,751 B | 6,500 B | 2,100 B |

The budget script also inspects the minified Nomenclature, Boards, Structure,
Shift Work Orders and Roles artifacts and rejects unrelated scenario labels.
This preserves independent vertical slices instead of shipping every lab
scenario with an individual island. The larger `390,000 B / 105,000 B` limit
applies only to the eighteen-scenario development lab, never to a production
island. Its raw limit increased only as isolated scenarios were added; every
production entry retains the unchanged `225,000 B / 68,000 B` gate.

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
| Timesheet | measured by the same callback | browser gate passed | overtime updated, revision 2 |
| Planning Workbench | measured by the same callback | browser gate passed | Gantt readiness updated, revision 2 |
| Shift Work Orders | measured by the same callback | browser gate passed | selection/collapse preserved, revision 2 |

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

The bundled production Weekly Production Control island is `201,150 B` raw /
`63,156 B` gzip / `54,408 B` Brotli. Its 25-group, eleven-column production-
shell first commit remains below `50 ms`; this is regression evidence, not Pilot acceptance.

The bundled production Timesheet island is `201,559 B` raw / `63,358 B` gzip /
`54,518 B` Brotli. Its 76-employee, 35-column production-shell first commit was
`206.60 ms`; this is regression evidence, not Pilot acceptance.

The bundled production Planning Workbench island is `201,793 B` raw /
`63,311 B` gzip / `54,483 B` Brotli. Its two-order PostgreSQL-bootstrap
production-shell first commit was `18.70 ms`; this is regression evidence, not
Pilot acceptance.

All measured paths produced revision `1` then `2`.

These local values prove the measurement mechanism only. They are not a Pilot
performance claim or SLA. After integration, the same callback must be measured
on the authenticated Pilot navigation path and compared with the legacy module
on identical payload and viewport.
