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
| Nomenclature production island | 213,750 B | 65,271 B | 225,000 B | 68,000 B |
| Boards/BOM production island | 212,565 B | 65,324 B | 225,000 B | 68,000 B |
| Structure Employees production island | 216,825 B | 65,878 B | 225,000 B | 68,000 B |
| Structure Positions production island | 215,168 B | 65,465 B | 225,000 B | 68,000 B |
| Structure Org Units production island | 213,588 B | 65,204 B | 225,000 B | 68,000 B |
| Structure Work Centers production island | 215,471 B | 65,474 B | 225,000 B | 68,000 B |
| Structure Equipment production island | 214,824 B | 65,385 B | 225,000 B | 68,000 B |
| Structure Responsibility Policies production island | 215,212 B | 65,557 B | 225,000 B | 68,000 B |
| Structure Migration Diagnostics production island | 208,970 B | 64,266 B | 225,000 B | 68,000 B |
| Weekly Production Control production island | 206,572 B | 63,948 B | 225,000 B | 68,000 B |
| Timesheet production island | 210,506 B | 64,915 B | 225,000 B | 68,000 B |
| Planning Workbench production island | 206,952 B | 64,065 B | 225,000 B | 68,000 B |
| Shift Work Orders production island | 220,036 B | 66,703 B | 225,000 B | 68,000 B |
| Shift Work Orders lazy print entry | 19,025 B | 3,659 B | 225,000 B | 68,000 B |
| Shift Master Board production island | 207,434 B | 64,044 B | 225,000 B | 68,000 B |
| Employee Desktop production island | 207,932 B | 64,056 B | 225,000 B | 68,000 B |
| Authorization picker production island | 202,893 B | 63,121 B | 225,000 B | 68,000 B |
| Contour Admin production island | 204,350 B | 63,207 B | 225,000 B | 68,000 B |
| Specifications 2.0 production island | 208,864 B | 64,433 B | 225,000 B | 68,000 B |
| Gantt production island | 204,733 B | 63,564 B | 225,000 B | 68,000 B |
| Roles and Access independent entry | 212,831 B | 65,382 B | 225,000 B | 68,000 B |
| Component Types independent entry | 211,805 B | 64,829 B | 225,000 B | 68,000 B |
| Operations independent entry | 207,600 B | 64,105 B | 225,000 B | 68,000 B |
| Nomenclature Types independent entry | 207,259 B | 63,928 B | 225,000 B | 68,000 B |
| Statuses independent entry | 210,171 B | 64,488 B | 225,000 B | 68,000 B |
| Full twenty-four-scenario lab | 504,778 B | 116,494 B | 505,000 B | 122,000 B |
| Shared lab CSS | 19,470 B | 3,912 B | 19,500 B | 4,000 B |

The budget script also inspects the minified Nomenclature, Boards, Structure,
Shift Work Orders, Shift Master Board, Employee Desktop, Contour Admin,
Specifications 2.0 and Roles artifacts and rejects unrelated scenario labels.
The same isolation check now covers the Gantt artifact.
The Shift Work Orders base-entry check additionally rejects the print-sheet
marker, while the dedicated lazy entry must contain it. This preserves
independent vertical slices instead of shipping every lab scenario with an
individual island. The larger `505,000 B / 122,000 B` limit
applies only to the twenty-four-scenario development lab, never to a production
island. Its raw limit increases only for an accepted isolated scenario or
bounded vertical capability; every production entry retains the unchanged
`225,000 B / 68,000 B` gate.

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

The current production Nomenclature artifact with the default-off create/edit
form is `205,773 B` raw / `64,539 B` gzip / `55,547 B` Brotli. The disposable
production-shell checkpoint committed its first React view below `20 ms` and
then proved one create plus one edit through the existing command owner.
| Structure Employees | measured by the same callback | 2.90 ms | 1 employee, metric and detail updated, revision 2 |
| Roles and Access | measured by the same callback | browser gate passed | selected role passport updated, revision 2 |
| Weekly Production Control | measured by the same callback | browser gate passed | weekly fact total updated, revision 2 |
| Timesheet | measured by the same callback | browser gate passed | overtime updated, revision 2 |
| Planning Workbench | measured by the same callback | browser gate passed | quantity conflict/retry, authoritative slot refresh and legacy read-back |
| Shift Work Orders | measured by the same callback | browser gate passed | attachment and lazy SZN/package overlays, host print callback, selection/collapse and revision 2 |
| Shift Master Board | measured by the same callback | browser gate passed | owner-backed focus 4 -> 3 cards, empty-focus recovery and revision 3 |
| Employee Desktop | measured by the same callback | browser gate passed | task start read back as `В работе`, selection preserved, revision 3 |
| Contour Admin | measured by the same callback | browser gate passed | contour selection preserved, revision 2 |
| Specifications 2.0 | measured by the same callback | browser gate passed | tree collapse and revision 7 -> 8 preserved |

The bundled production Roles island is `207,239 B` raw / `65,088 B` gzip /
`56,024 B` Brotli. Its production-shell first commit remains below `25 ms` on the
local QA contour; metadata QA additionally proves revision-conflict retry,
protected-registry preservation and legacy read-back. This is regression
evidence, not Pilot acceptance.

The bundled production Component Types island is `201,269 B` raw / `63,156 B`
gzip / `54,455 B` Brotli. Its production-shell first commit measured below
`25 ms` locally; this is regression evidence, not Pilot acceptance.

The bundled production Operations island is `200,213 B` raw / `62,802 B`
gzip / `54,111 B` Brotli. Its production-shell first commit measured below
`25 ms` locally; this is regression evidence, not Pilot acceptance.

The bundled production Nomenclature Types island is `203,085 B` raw /
`63,699 B` gzip / `54,776 B` Brotli. Its production-shell first commit was
`22.40 ms` locally; this is regression evidence, not Pilot acceptance.

The bundled production Statuses island is `204,911 B` raw / `64,133 B` gzip /
`55,175 B` Brotli. Its production-shell first commit was below `20 ms` while
rendering all 85 current runtime rows; this is regression evidence, not Pilot
acceptance.

The bundled production Structure Positions island is `203,728 B` raw /
`63,958 B` gzip / `55,098 B` Brotli. Its production-shell first commit stayed
below `20 ms` across 49 PostgreSQL-backed rows; this is regression evidence, not
Pilot acceptance.

The bundled production Structure Org Units island is `213,588 B` raw /
`65,204 B` gzip. Its production-shell first commit was `17.70 ms` across 19
PostgreSQL-backed rows; create/edit QA additionally returns a twentieth row,
rejects an indirect hierarchy cycle before mutation and preserves legacy
read-back. This is regression evidence, not Pilot acceptance.

The bundled production Structure Work Centers island is `215,471 B` raw /
`65,474 B` gzip. Its latest production-shell first commit was `141.10 ms` across 19
PostgreSQL-backed rows; create/edit QA additionally returns a twentieth row,
rejects an indirect hierarchy cycle before mutation, preserves explicit
Planning/Gantt flags and proves legacy read-back. A separate read adapter keeps
the aggregate lab within budget. This is regression evidence, not Pilot
acceptance.

The bundled production Structure Equipment island is `214,824 B` raw /
`65,385 B` gzip. Its production-shell first commit was `32.30 ms` across six
PostgreSQL-backed rows; create/edit QA additionally returns a seventh row,
rejects invalid quantity before mutation and preserves organization,
work-center and schedule references. This is regression evidence, not Pilot
acceptance.

The bundled production Structure Responsibility Policies island is `215,212 B`
raw / `65,557 B` gzip. Its temporary non-empty production-shell first commit was
`32.00 ms`; create/edit QA additionally returns a second policy, rejects a
duplicate master before mutation and preserves manual targets across a switch
to `all`. Separate read adapters keep the aggregate lab within its existing
budget. This is regression evidence, not Pilot acceptance.

The bundled production Structure Migration Diagnostics island is `203,082 B`
raw / `63,875 B` gzip / `55,020 B` Brotli. Its 152-row production-shell first
commit was `18.0 ms`; this is regression evidence, not Pilot acceptance.

The bundled production Weekly Production Control island is `202,775 B` raw /
`63,714 B` gzip / `54,840 B` Brotli. Its 25-group, eleven-column production-
shell first commit remains below `50 ms`; this is regression evidence, not Pilot acceptance.

The bundled production Timesheet island is `210,506 B` raw / `64,915 B` gzip.
Its latest 76-employee, 35-column production-shell first commit was `422.60 ms`;
single-day save/reset QA additionally proves validation, conflict retry and
legacy read-back. A separate read scenario keeps the aggregate lab inside its
existing budget. This is regression evidence, not Pilot acceptance.

The Planning Workbench production entry is `206,952 B` raw / `64,065 B` gzip;
the bundled production artifact is `203,294 B` raw / `63,828 B` gzip /
`54,880 B` Brotli. Its two-order PostgreSQL-bootstrap production-shell
first commit remains below `200 ms`; route/row selection stays inside React,
and the localhost-only quantity slice proves validation, conflict without
mutation, retry, authoritative slot refresh, legacy read-back and an unchanged
compatibility snapshot. This is regression evidence, not Pilot acceptance.

The bundled production Shift Work Orders base island is `213,696 B` raw /
`66,343 B` gzip / `57,159 B` Brotli, and its lazy print chunk is `13,774 B`
raw / `3,351 B` gzip / `2,890 B` Brotli. Its one-assignment PostgreSQL-backed
production-shell gate keeps zero writes, lazily opens both SZN and package
previews and delegates two print calls to the host; the isolated lab
additionally proves an in-React attachment overlay with Escape close. This is
regression evidence, not Pilot acceptance.

The bundled production Shift Master Board island is `203,459 B` raw /
`63,786 B` gzip / `54,849 B` Brotli. Its one-card PostgreSQL-backed production-
shell first commit was `34.20 ms`; owner-backed focus additionally proves
`all -> empty open -> all` without a Shift Execution write. This is regression
evidence, not Pilot acceptance.

The bundled production Employee Desktop island is `203,436 B` raw /
`63,673 B` gzip / `54,892 B` Brotli. Its one-task PostgreSQL-backed production-
shell first commit was `33.30 ms`, below the `2,000 ms` production-shell gate;
the same run proves read-only denial, one owner-backed start, duplicate denial
and zero Shift Execution writes. This is regression evidence, not Pilot
acceptance.

The bundled production Authorization picker island is `199,896 B` raw /
`62,906 B` gzip / `54,098 B` Brotli. Its nine-department production-shell
security gate confirmed that React contains no PIN keypad and hands the chosen
employee to a clean legacy PIN screen; this is regression evidence, not Pilot
acceptance.

The bundled production Contour Admin island is `201,348 B` raw / `63,003 B`
gzip / `54,161 B` Brotli. Its exact admin-host production-shell first commit
stayed below `20 ms`; this is regression evidence, not Admin/Pilot acceptance.

The bundled production Specifications 2.0 island is `204,557 B` raw /
`64,193 B` gzip / `60,833 B` Brotli. Its four-row PostgreSQL revision production-
shell first commit stayed below `20 ms`; this is regression evidence, not Pilot
acceptance.

The bundled production Gantt island is `201,763 B` raw / `63,352 B` gzip /
`54,525 B` Brotli. Its three-row/two-slot PostgreSQL production-shell first
commit was `15.30 ms`; this is regression evidence, not Pilot acceptance.

All measured paths produced revision `1` then `2`.

These local values prove the measurement mechanism only. They are not a Pilot
performance claim or SLA. After integration, the same callback must be measured
on the authenticated Pilot navigation path and compared with the legacy module
on identical payload and viewport.
