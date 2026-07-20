# React migration performance gate

Date: 2026-07-20
Branch: `codex/frontend-react-migration`

## Deterministic bundle budgets

Command:

```sh
node experiments/react-migration/performance-budget.mjs
```

Current minified measurements:

| Artifact | Raw | Gzip | Budget raw | Budget gzip |
| --- | ---: | ---: | ---: | ---: |
| Nomenclature production island | 213,718 B | 65,421 B | 225,000 B | 68,000 B |
| Boards/BOM production island | 221,436 B | 67,304 B | 225,000 B | 68,000 B |
| Structure Employees production island | 219,262 B | 66,162 B | 225,000 B | 68,000 B |
| Structure Positions production island | 216,543 B | 65,712 B | 225,000 B | 68,000 B |
| Structure Org Units production island | 214,972 B | 65,451 B | 225,000 B | 68,000 B |
| Structure Work Centers production island | 217,407 B | 65,683 B | 225,000 B | 68,000 B |
| Structure Equipment production island | 216,206 B | 65,655 B | 225,000 B | 68,000 B |
| Structure Responsibility Policies production island | 217,366 B | 65,998 B | 225,000 B | 68,000 B |
| Structure Migration Diagnostics production island | 208,970 B | 64,267 B | 225,000 B | 68,000 B |
| Weekly Production Control production island | 206,572 B | 63,950 B | 225,000 B | 68,000 B |
| Timesheet production island | 214,632 B | 65,508 B | 225,000 B | 68,000 B |
| Planning Workbench production island | 206,952 B | 64,065 B | 225,000 B | 68,000 B |
| Shift Work Orders production island | 224,968 B | 67,925 B | 225,000 B | 68,000 B |
| Shift Work Orders lazy print entry | 19,025 B | 3,659 B | 225,000 B | 68,000 B |
| Shift Work Orders lazy command entry | 9,370 B | 3,020 B | 225,000 B | 68,000 B |
| Shift Master Board production island | 225,000 B | 67,932 B | 225,000 B | 68,000 B |
| Employee Desktop production island | 224,501 B | 67,204 B | 225,000 B | 68,000 B |
| Authorization picker production island | 206,680 B | 64,121 B | 225,000 B | 68,000 B |
| Contour Admin production island | 207,695 B | 63,983 B | 225,000 B | 68,000 B |
| Specifications 2.0 production island | 218,918 B | 66,198 B | 225,000 B | 68,000 B |
| Gantt production island | 210,560 B | 64,962 B | 225,000 B | 68,000 B |
| Roles and Access independent entry | 222,758 B | 66,971 B | 225,000 B | 68,000 B |
| Component Types independent entry | 212,161 B | 64,999 B | 225,000 B | 68,000 B |
| Operations independent entry | 210,478 B | 64,840 B | 225,000 B | 68,000 B |
| Nomenclature Types independent entry | 210,301 B | 64,630 B | 225,000 B | 68,000 B |
| Statuses independent entry | 213,503 B | 65,173 B | 225,000 B | 68,000 B |
| Full twenty-four-scenario lab | 566,267 B | 127,918 B | 567,000 B | 128,000 B |
| Shared lab CSS | 29,860 B | 5,345 B | 30,000 B | 5,350 B |

The budget script also inspects the minified Nomenclature, Boards, Structure,
Shift Work Orders, Shift Master Board, Employee Desktop, Contour Admin,
Specifications 2.0 and Roles artifacts and rejects unrelated scenario labels.
The same isolation check now covers the Gantt artifact.
The Shift Work Orders base-entry check additionally rejects the print-sheet
and fact-editor markers, while each dedicated lazy entry must contain its own
marker. This preserves
independent vertical slices instead of shipping every lab scenario with an
individual island. The larger `564,000 B / 128,000 B` limit
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
| Shift Work Orders | 51.50 ms in production shell | browser gate passed | attachment and lazy SZN/package/command overlays, typed assignment/fact correction and cleanup through the Shift Execution owner with legacy read-back |
| Shift Master Board | 25.90 ms in production shell | browser gate passed | PostgreSQL date rehydration, privileged master switching, focus recovery, assignment, facts, canonical carryover, typed transfer and lazy SZN print |
| Employee Desktop | measured by the same callback | browser gate passed | task/fact/photo Report read-back, deviation guard, revision 5 |
| Contour Admin | measured by the same callback | browser gate passed | contour selection preserved, revision 2 |
| Specifications 2.0 | measured by the same callback | browser gate passed | tree collapse and revision 7 -> 8 preserved |

The bundled production Roles island is `214,423 B` raw / `66,615 B` gzip /
`57,356 B` Brotli. Its production-shell first commit remains below the `2,000 ms`
local gate (`28.60 ms` in the latest full run); metadata/grant/default-scope,
exact-employee assignment and unassigned-role lifecycle QA additionally prove revision-conflict retry,
assigned/current-role fail-closed guards, inactive grant denial, cleanup,
protected-registry preservation and legacy read-back. This is regression
evidence, not Pilot acceptance.

The bundled production Component Types island is `201,269 B` raw / `63,156 B`
gzip / `54,455 B` Brotli. Its production-shell first commit measured below
`25 ms` locally; this is regression evidence, not Pilot acceptance.

The bundled production Operations island is `205,613 B` raw / `64,439 B`
gzip / `55,610 B` Brotli. Its production-shell first commit remained below `25 ms`
locally; this is regression evidence, not Pilot write acceptance.

The bundled production Nomenclature Types island is `205,408 B` raw /
`64,243 B` gzip / `55,514 B` Brotli. Its latest production-shell first commit
was `15.50 ms` locally; this is regression evidence, not Pilot acceptance.

The bundled production Statuses island is `204,911 B` raw / `64,133 B` gzip /
`55,175 B` Brotli. Its production-shell first commit was below `20 ms` while
rendering all 85 current runtime rows; this is regression evidence, not Pilot
acceptance.

The bundled production Structure Employees island remains separately budgeted;
the independent production artifact is `219,262 B` raw / `66,162 B` gzip. Its
latest production-shell first commit was `22.10 ms` across 76 PostgreSQL-backed
rows. Create/edit/archive/reactivate QA proves
dependency rejection before PUT, ID-bound confirmation, conflict retry,
atomic employee deactivation plus primary-assignment closure, ended-secondary
and hidden-field preservation, cleared reactivation `archivedAt`, and active
legacy read-back. This is regression
evidence, not Pilot write acceptance.

The bundled production Structure Positions island is `209,245 B` raw /
`65,222 B` gzip / `56,302 B` Brotli. Its production-shell first commit was
`26.50 ms` in the latest full run across 49 PostgreSQL-backed rows;
create/edit/archive/reactivate QA proves ID-bound confirmations, rejection of
active employment references before PUT, active-reference guards,
reference/hidden-field preservation, cleared archive marker and active legacy
read-back. This is regression evidence, not Pilot acceptance.

The bundled production Structure Org Units island is `207,866 B` raw /
`64,977 B` gzip / `56,032 B` Brotli. Its production-shell first commit was
`22.00 ms` across 19 PostgreSQL-backed rows; create/edit/archive/reactivate QA additionally
returns a twentieth row, rejects an indirect hierarchy cycle and referenced
parent archive before mutation, keeps ordinary save lifecycle-neutral, clears
`archivedAt` on restoration and proves active legacy read-back. This is
regression evidence, not Pilot acceptance.

The bundled production Structure Work Centers island is `209,584 B` raw /
`65,205 B` gzip / `56,301 B` Brotli. Its latest production-shell first commit
was `20.10 ms` across 19 PostgreSQL-backed rows; create/edit/archive/reactivate QA returns a
twentieth row, rejects an indirect hierarchy cycle and a referenced baseline
archive before mutation, proves ID-bound confirmations, preserves hidden,
reference and explicit Planning/Gantt fields, clears the lifecycle archive marker
and reads the active row through legacy. A separate read adapter keeps the aggregate lab within budget. This is
regression evidence, not Pilot acceptance.

The bundled production Structure Equipment island is `209,011 B` raw /
`65,176 B` gzip / `56,294 B` Brotli. Its production-shell first commit was
`17.40 ms` across six PostgreSQL-backed rows; create/edit/archive/reactivate QA additionally
returns a seventh row, rejects invalid quantity before mutation, requires an
explicit lifecycle confirmation, clears the archive marker and preserves
organization, work-center, schedule, quantity and hidden fields through active
legacy read-back. This is regression evidence, not Pilot
acceptance.

The bundled production Structure Responsibility Policies island is `209,489 B`
raw / `65,490 B` gzip / `56,527 B` Brotli. Its latest temporary non-empty
production-shell first commit was `18.50 ms`; create/edit/archive/reactivate QA
returns a second policy, rejects a duplicate master before mutation, preserves
manual targets and hidden fields, persists `isActive=false`, then clears the
archive marker on reactivation. Separate read adapters keep the aggregate lab
within its existing budget. This is regression evidence, not Pilot acceptance.

The bundled production Structure Migration Diagnostics island is `203,082 B`
raw / `63,875 B` gzip / `55,020 B` Brotli. Its 152-row production-shell first
commit was `18.0 ms`; this is regression evidence, not Pilot acceptance.

The bundled production Weekly Production Control island is `202,775 B` raw /
`63,714 B` gzip / `54,840 B` Brotli. Its 25-group, eleven-column production-
shell first commit remains below `50 ms`; this is regression evidence, not Pilot acceptance.

The bundled production Timesheet island is `214,632 B` raw / `65,508 B` gzip.
Its latest 76-employee, 35-column production-shell first commit was `213.50 ms`;
attendance and permanent-schedule save/reset QA additionally proves validation,
conflict retry, hidden-field preservation and legacy read-back. A separate read
scenario keeps the aggregate lab inside its
existing budget. This is regression evidence, not Pilot acceptance.

The Planning Workbench production entry is `206,952 B` raw / `64,065 B` gzip;
the bundled production artifact is `203,294 B` raw / `63,828 B` gzip /
`54,880 B` Brotli. Its two-order PostgreSQL-bootstrap production-shell
first commit remains below `200 ms`; route/row selection stays inside React,
and the localhost-only quantity slice proves validation, conflict without
mutation, retry, authoritative slot refresh, legacy read-back and an unchanged
compatibility snapshot. This is regression evidence, not Pilot acceptance.

The bundled production Shift Work Orders base island is `217,934 B` raw /
`67,553 B` gzip / `64,100 B` Brotli. Its lazy print chunk is `13,774 B` raw /
`3,378 B` gzip / `3,137 B` Brotli, and its lazy command chunk is `6,943 B` raw /
`2,817 B` gzip / `2,661 B` Brotli. The one-assignment PostgreSQL-backed
production-shell gate keeps zero writes in read-only mode, lazily opens SZN,
package and command UI, delegates two print calls to the host, then proves
typed assignment and fact correction, React/legacy read-back and exact cleanup
through two revision-checked assignment plus two fact-only owner writes. The isolated lab additionally proves an in-React attachment
overlay with Escape close. This is regression evidence, not Pilot write
acceptance.

The bundled production Shift Master Board island is `217,258 B` raw /
`67,589 B` gzip / `58,223 B` Brotli. Its one-card PostgreSQL-backed production-
shell first commit was `25.90 ms`; owner-backed date navigation proves
`19 -> 20 -> 19`, `productionHead` can switch a validated master, and focus proves
`all -> empty open -> all`, read-only assignment returns to legacy and the
write evaluation proves assignment, partial fact, immediate canonical
carryover read-back, next/source navigation, corrected fact and exact canonical
cancellation. Typed transfer stays in the base island; SZN reuses the existing
`13,774 B` raw / `3,351 B` gzip / `3,145 B` Brotli lazy print chunk and delegates
print-record/browser-print ownership to the host. This is regression evidence,
not Pilot acceptance.

The bundled production Employee Desktop island is `214,902 B` raw /
`66,681 B` gzip / `57,535 B` Brotli. Its one-task PostgreSQL-backed production-
shell first commit was `30.00 ms`, below the `2,000 ms` production-shell gate;
the same run proves read-only denial, one owner-backed start, duplicate denial,
deviation validation, exactly one PostgreSQL fact command with read-back, plus
one owner-prepared/persisted photo Report and journal-counter read-back.
This is regression evidence, not Pilot
acceptance.

The bundled production Authorization picker island is `202,559 B` raw /
`63,740 B` gzip / `54,990 B` Brotli. Its nine-department production-shell gate
preserves the read-only legacy handoff, rejects one PIN in React, then delegates
successful role/session creation to the existing owner without persisting PIN
digits. This is regression evidence, not Pilot acceptance.

The bundled production Contour Admin island is `203,825 B` raw / `63,608 B`
gzip / `54,810 B` Brotli. Its exact admin-host production-shell first commit
stayed below `20 ms`; cancellation emitted no call and one confirmed mock
emitted the exact allowlisted action/token. This is regression evidence, not
Admin/Pilot acceptance.

The bundled production Specifications 2.0 island is `212,193 B` raw /
`65,914 B` gzip / `56,703 B` Brotli. Its four-row PostgreSQL revision production-
shell first commit was `7.60 ms`; the same run proves exact-ID confirmation,
cancel, conflict/retry, revision `7 -> 8`, forced PostgreSQL read-back and legacy
read-back plus one idempotent exact-revision work order. This is regression
evidence, not Pilot write acceptance.

The bundled production Gantt island is `204,190 B` raw / `63,874 B` gzip /
`55,121 B` Brotli. Its three-row/two-slot PostgreSQL production-shell first
commit was `17.10 ms`; the same run proves inspection of one owner-derived
dependency, target-slot selection and zero Planning writes. This is regression
evidence, not Pilot acceptance.

All measured paths produced revision `1` then `2`.

These local values prove the measurement mechanism only. They are not a Pilot
performance claim or SLA. After integration, the same callback must be measured
on the authenticated Pilot navigation path and compared with the legacy module
on identical payload and viewport.
