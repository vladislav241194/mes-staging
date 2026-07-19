# React command-parity matrix

Date: 2026-07-19

This is the executable completion ledger for the frontend migration. Its source
is `experiments/react-migration/command-parity-matrix.json`, and React migration
QA fails when a production-integrated scenario is missing, duplicated, loses
its rollback declaration, or is marked complete without an explicit status.

All 24 scenarios have local production-shell read evidence and keep legacy
rollback. The all-flags-off Pilot baseline is accepted. Authenticated Pilot
read-only acceptance now covers Nomenclature empty-state plus five non-empty
System Domains registries: Employees `76/76`, Positions `49/49`, Org Units
`19/19`, Work Centers `19/19` and Equipment `6/6`. Every evaluation was
session-scoped, measured, returned to legacy and left all rollout flags off.
The Directories cluster additionally has Component Types `8/8` and Operations
`22/22` accepted with literal visible-cell and row-order parity. Weekly
Production Control is accepted on its current `25 x 11` Pilot projection,
including the deviation-note interaction and same-data legacy rollback.
Shift Master Board read-only acceptance now also covers the current three-lane,
two-card scope, date/master controls, KPI, task passport and typed physical
transfer on immutable release `.77`; evaluation was disabled after acceptance.
Shift Work Orders read-only acceptance covers the current one-document tree,
selected SZN passport, typed transfer and both lazy print previews on `.79`;
evaluation was likewise disabled and legacy restored.
Employee Desktop read-only acceptance covers the current completed assignment,
seven metrics and the Structure, Route and PDF overlays on `.81`; task/fact/
Report commands were not invoked, evaluation was disabled and legacy restored.
Gantt read-only acceptance now covers one real route, nine rows, 69 slots and
50 dependency pairs on `.85`; the dependency inspector was exercised, no
schedule write was invoked, evaluation was disabled and legacy restored. This
Nomenclature Types read-only acceptance additionally covers all 10 real rows,
four literal columns, selection/detail and the common panel contract on `.86`.
No write command was enabled; evaluation was disabled and the 10-row legacy
directory restored. Subsequent accepted checkpoints added Statuses, Roles and
Access, Timesheet, Planning Workbench, Specifications 2.0 and the pre-PIN
Authorization picker. This brings authenticated Pilot read acceptance to 20 of
24 scenarios on the all-flags-off `v.1.500.01-1a8a9a4` baseline. The remaining
four are non-empty Nomenclature, Boards/BOM, non-empty Responsibility Policies
and Contour Admin on its mapped host.

Nomenclature, Component Types, Nomenclature Types and custom Operations have
locally complete create/edit/delete command parity. Bundled MES operations stay
protected. User-managed Statuses have locally complete create/edit/delete parity;
board metadata has create/edit/delete and one existing-row BOM quantity edit.
Structure Employees,
Structure Positions, Structure Org Units, Structure Work Centers, Structure
Equipment and Structure Responsibility Policies now have locally complete PostgreSQL-backed create/edit
parity through the System Domains owner; Positions, Org Units, Work Centers and
Equipment also have explicit archive.
Other reference-sensitive,
lifecycle, import, other BOM-cell/row and delete commands remain explicit legacy-only
slices. Timesheet now has locally complete single-day attendance and permanent
schedule save/remove. Roles and Access now has locally complete passport
metadata editing, six-action grant toggles and the role default scope through
the `access-control` owner; assignments, personal/assignment scopes, read-only
and active remain legacy. Structure Migration Diagnostics and Weekly Production Control are intentionally
read-only product modules and own no write commands. Planning Workbench now has
locally complete route/item navigation and quantity editing through its current
PostgreSQL-backed owner; dates, labor, Gantt transfer and cancel remain legacy.
Shift Work Orders now keeps attachment inspection, SZN print preview and the
work-order print package inside React while reusing the existing package owner
and host print callback; assignment, fact and Workshop remain legacy. The
Shift Master Board now owns its date and RBAC-scoped master selectors, four focus controls, bounded executor
assignment, fact entry/correction and the complete carryover navigation cycle.
The existing host normalizes focus, rechecks RBAC, access matrix, Timesheet
availability and quantity bounds, then executes and refreshes PostgreSQL
through the Shift Execution owner. A partial fact immediately reconciles the
POST result to its canonical ID; React opens the next-shift remainder, returns
to the source task and corrects the fact, while the owner cancels that exact
canonical remainder. React also renders the owner's typed physical-transfer
contract and lazy-loads the shared SZN preview; the host records the print and
invokes the browser print boundary. Date changes use the existing workbench owner
and rehydrate the requested PostgreSQL dispatch scope; master changes are exposed
only to `admin`/`productionHead` and force the owner-backed `mine` focus. Manual
lane movement remains legacy. Employee Desktop now
starts an available task and records its quantities/deviation note through the
existing authenticated fact aggregation owner; React validates the visible
task, disables repeats and reads back `В работе` and `факт записан`, while
photo preparation and Report creation reuse the existing journal owner. The
Report journal remains compatibility UI-state rather than PostgreSQL.
Structure, Route and PDF instruction are now React read-only overlays over the
same task payload; person switching remains the module rollback. Gantt now also keeps dependency inspection
inside React using the existing `getDependencyPairs` owner and a local-only
typed start-time move through the revision-checked `changeSlotSchedule` owner;
dependency editing, drag, resize and optimization remain legacy. The remaining scenarios
retain their explicit next vertical scopes.

Specifications 2.0 now has locally complete editing of one existing draft row
through its unchanged compatibility owner. React receives only the selected
draft row fields, while add/remove/reparent, publication, attachments, routes
and work-order commands remain legacy. Production-shell QA proves one
compatibility persistence, unchanged published revision metadata/tree and zero
Specifications API writes.

Authorization now has locally complete PIN entry and failed-attempt feedback.
The five digits remain only in React component memory and cross one transient
typed command; the existing auth owner still validates the PIN, decrements and
persists the attempt counter, assigns the role and creates the session. Neither
failed nor successful PIN values appear in UI or session storage.

Contour Admin now has locally complete protected Ops command presentation:
React owns explicit confirmation and result state, while the host rechecks the
scenario/action pair and the existing owner calls the unchanged admin-only Ops
API. Server cookie authentication, action allowlist, required confirmation
token, audit and command execution remain outside React. Local QA uses a mock
endpoint and performs no backup, sync, promote or rollback operation.

| Priority | Scenario | Command status | Risk | Next vertical scope |
| ---: | --- | --- | --- | --- |
| 1 | Nomenclature | Local complete: create/edit/delete | Medium | Separately approved Pilot read-only evaluation, then separately approved write evaluation |
| 2 | Component Types | Local complete: create/edit/delete | Low | Separately gated Pilot write evaluation with a `directories:edit` role and disposable-row cleanup |
| 3 | Operations | Local complete: create/edit/custom delete with Specifications and loaded-Planning cleanup; bundled rows protected | Medium | Separately gated Pilot create/edit/custom-delete evaluation with a disposable row and verified cleanup |
| 4 | Weekly Production Control | Not applicable: product module is read-only; Pilot read accepted | Low | Keep default-off until an explicit default-on decision |
| 5 | Nomenclature Types | Local complete: create/edit/delete with fallback reference reassignment; Pilot read accepted | Medium | Keep default-off; separately gate write/delete evaluation with a disposable type, cancel safety and reference audit |
| 6 | Statuses | Local complete: user-managed create/edit/delete; system rows protected | Medium | Keep read acceptance; any write evaluation requires one disposable user-authority status and verified cleanup |
| 7 | Boards/BOM | Local complete: board metadata create/edit/delete plus existing-row BOM quantity with Specifications cleanup; Excel import, other cells and row deletion remain legacy | Medium | Separately gated Pilot read-only evaluation, then metadata/quantity write with a disposable board |
| 8 | Structure Employees | Local complete: employee + primary assignment create/edit/archive with active-dependency rejection and ID-bound confirmation | High | Separately gated Pilot create/edit/archive evaluation with a disposable unreferenced employee; reactivation remains legacy |
| 9 | Structure Positions | Local complete: create/edit/archive with organization, work-center and schedule references plus explicit archive confirmation | High | Separately gated Pilot create/edit/archive evaluation with a disposable position; assignment-impact audit remains separate |
| 10 | Structure Org Units | Local complete: create/edit/archive with hierarchy-cycle and active-reference rejection plus ID-bound confirmation | High | Separately gated Pilot create/edit/archive evaluation with a disposable leaf unit; reactivation remains owner-gap |
| 11 | Structure Equipment | Local complete: create/edit/archive with organization, work-center, quantity, schedule validation and explicit archive confirmation | High | Separately gated Pilot write evaluation with disposable equipment; scheduling commands remain legacy |
| 12 | Structure Responsibility Policies | Local complete: create/edit with mode, unique master and allowed-employee validation; archive blocked by owner persistence gap | High | Define an owner/schema contract that persists lifecycle before archive or Pilot write evaluation |
| 13 | Structure Work Centers | Local complete: create/edit/archive with organization, parent hierarchy, active-reference rejection and Planning/Gantt flags | High | Separately gated Pilot create/edit/archive evaluation with a disposable leaf work center; reactivation remains owner-gap |
| 14 | Timesheet | Local complete: one-day attendance plus permanent schedule save/remove | High | Separately gated Pilot write evaluation on disposable attendance and schedule coordinates |
| 15 | Roles and Access | Local complete: role label, description, default module, six-action grant toggles and role default scope; assignments, personal/assignment scopes and lifecycle remain legacy | Critical | Separately gated Pilot metadata/grant/default-scope write evaluation |
| 16 | Planning Workbench | Local complete: route/detail navigation and quantity edit; dates, labor, Gantt transfer and cancel remain legacy | Critical | Separately gated Pilot quantity write evaluation |
| 17 | Shift Work Orders | Local complete: attachment viewer plus SZN/package print previews; assignment, fact and Workshop remain legacy; Pilot read accepted | Critical | Keep default-off; assignment/fact remain separate command scopes owned by Workshop and Employee Desktop |
| 18 | Shift Master Board | Local complete: date and privileged-master switching, card selection, focus, bounded executor assignment, fact/correction, canonical carryover create/navigate/cancel, typed transfer and SZN preview/print; manual lane movement remains legacy; Pilot read accepted | Critical | Keep default-off; manual lane movement requires its own later command scope |
| 19 | Employee Desktop | Local complete: task start, fact, photo Report and Structure/Route/PDF context through existing owners; Pilot read accepted | Critical | Separately gated Pilot write acceptance of task start/fact/Report before default-on consideration |
| 20 | Specifications 2.0 | Local complete: existing draft-row edit before publish; structure/publication/server commands remain legacy | Critical | Separately gated Pilot draft-row edit acceptance before attachment and work-order commands |
| 21 | Gantt | Local complete: dependency inspection, target-slot selection and revision-checked start-time reschedule; Pilot read accepted | Critical | Keep default-off; dependency editing, drag, resize and optimization remain separate command scopes |
| 22 | Authorization | Local complete: PIN entry, failed-attempt feedback and owner-backed session handoff | Critical | Separately gated Pilot PIN acceptance before any default-on decision |
| 23 | Contour Admin | Local complete: confirmation/result UI over the protected Ops owner; deploy request without an API action remains legacy | Critical | Separately gated authenticated Admin acceptance with dry-run-first policy |
| — | Structure Migration Diagnostics | Not applicable | Low | Pilot read-only acceptance only |

The Directories cluster now has Component Types read parity accepted on Pilot
and local command parity through the existing RBAC-protected directory owner.
Its isolated QA creates, edits, reads through legacy and removes one disposable
row, restoring the original dataset and leaving Planning routes, steps and
slots unchanged. Pilot write acceptance remains a separate gate because the
current authenticated QA role is read-only. Operations read parity is also
accepted on Pilot: all `22/22` rows and three visible fields matched legacy,
the `Склад` filter returned seven rows, and rollback restored the same
authenticated legacy screen. Its local RBAC-gated React contour now creates
and edits through that same owner, preserves hidden operation fields, reads the
result through legacy and restores the original edited row. It also discloses
usage, proves byte-stable cancel and deletes a custom row while clearing the
exact Specifications reference. Owner-level QA
proves propagation to ordinary and work-center-override route steps,
recalculation of an unfinished unlocked slot, and immutability of locked,
completed and unrelated slots on edit; delete clears every linked loaded slot,
including locked/completed, while preserving unrelated rows. The Directories
metadata-only persistence path preserves an unloaded Planning snapshot instead
of sending an empty compatibility copy. The audit also found and repaired a missing
`applyPlanningOrderLaborToSlot` dependency at the legacy service boundary.
Bundled MES operations remain non-deletable because normalization owns them.

Nomenclature Types now has local RBAC-gated create/edit/delete parity through
the existing directory owner. Its disposable-snapshot QA proves create,
rename, Nomenclature and Specifications 2.0 rename propagation, usage-aware
delete confirmation, byte-stable cancel, fallback reassignment in both
reference families, legacy read-back and no changes to unrelated Planning
rows. The owner audit repaired four legacy defects: unavailable/stale rename
state, empty-previous-name normalization, a missing production fallback-owner
dependency and loss of normalized Specifications references during delete.
Pilot remains default-off and has no write runtime flag for this scenario.

Statuses now has local create/edit/delete parity only for explicitly
user-managed rows. Both `custom-status-` ID and persisted
`statusAuthority: "user"` are required at the command owner; system, forged,
missing and RBAC-denied delete targets fail closed. Disposable
production-shell QA proves create/edit, byte-identical delete cancellation,
confirmed removal persistence, unchanged system contracts, legacy read-back
without the disposable row and unchanged Planning rows. Pilot remains
default-off and has no Statuses write runtime flag.

Boards/BOM now has local metadata create/edit/delete and existing-row quantity
parity through the existing lazy Products command owner. Production-shell QA
rejects invalid quantities before persistence, verifies the complete expected
row before `updateBomImportCell`, preserves the other eight values and three
unrelated rows, and reads the new quantity through legacy. It also preserves hidden
fields, `projectId` and imported rows on edit, synchronizes both existing and
new result Nomenclature, then proves usage-aware delete cancellation and exact
Specifications cleanup. The independently addressable Nomenclature result and
Planning remain unchanged, and legacy reads the two remaining boards. The
owner audit also repaired the missing `upsertBomResultToNomenclature` and
`getBomImportRows` dependencies in the lazy path. Excel import, other BOM-cell
edits, row deletion and counters remain separate legacy slices.

Structure Employees is the first locally complete PostgreSQL-backed React
command slice. Its local-only write gate delegates to the existing compound
System Domains owner, which saves `employees` and the primary
`employmentAssignments` row as one revision-checked command. Production-shell
QA proves create, conflict without mutation, retry, edit and explicit archive.
Archive is rejected before PUT for active secondary employment, schedule,
access-role or responsibility dependencies; the owner deactivates the employee
and closes the active primary assignment atomically while preserving an ended
secondary assignment and hidden fields. ID-bound confirmation, archived legacy
`77`-row read-back and an unchanged disposable compatibility snapshot pass.
Reactivation and Pilot write acceptance remain separate controlled checkpoints.

Structure Positions extends that pattern to a referenced registry. Its
local-only editor creates and edits position name, code, category, organization,
work center, base schedule and active state, and separately confirms archive.
QA proves exact reference IDs, conflict-without-mutation plus retry,
`isActive=false`/`archivedAt`, hidden-field preservation, archived `50`-row
legacy read-back, rejection of positions with active employment assignments
before PUT and unchanged disposable compatibility state. The audit also
fixed Structure active-host routing so a write-gated registry cannot disable
legacy event binding while another host is selected.

Structure Org Units adds hierarchy-safe PostgreSQL create/edit/archive. Its local-only
editor saves name, code, type, parent and active state through the same
revision-checked System Domains owner. Production-shell QA proves parent
existence, rejects an indirect parent cycle and archive of a referenced parent
before any PUT, preserves hidden/parent fields, exercises
conflict-without-mutation plus retry, archives the leaf with
`isActive=false`/`archivedAt`, returns the twentieth archived row through legacy
and leaves the disposable compatibility snapshot unchanged. Pilot write
acceptance is a separate controlled checkpoint.

Structure Work Centers adds hierarchy-safe PostgreSQL create/edit/archive for name,
code, organization, parent, Planning participation, Gantt visibility and active
state. The impact audit repaired two runtime projection defects: an explicitly
cleared parent could return from the legacy fallback, and explicit false
Planning/Gantt flags could be re-enabled through legacy `isPlanningUnit`.
Executable owner QA now proves opt-out, restore, archive and new-center behavior
in the shared Planning/Gantt catalog while stable employee/Shift references
survive rename. Production-shell QA rejects an indirect hierarchy cycle before
PUT and rejects archive of a baseline center referenced by an active child,
position, equipment or employment assignment. It preserves hidden/reference
fields, exercises conflict-without-mutation plus retry and ID-bound archive
confirmation, returns the twentieth archived row through legacy and leaves the
disposable compatibility snapshot unchanged. Reactivation remains an owner gap;
Pilot write acceptance is a separate controlled checkpoint.

Structure Equipment adds PostgreSQL create/edit for all seven legacy fields and
explicit two-step archive through the existing archive owner,
including the organization reference that is not visible in the five-column
read table. The command owner rejects a negative or fractional quantity and
missing organization, work-center or schedule references before persistence.
Production-shell QA proves exact reference IDs, conflict-without-mutation plus
retry, archive `isActive=false`/`archivedAt`, hidden/reference/quantity
preservation, archived `7`-row legacy read-back and an unchanged disposable
compatibility snapshot. Pilot write acceptance is separate.

Timesheet adds bounded React editors for the fact of one selected day and the
employee's permanent schedule. The typed host reuses the existing legacy
attendance-event builder plus `saveScheduleAssignment` / `removeScheduleAssignment`
and delegates every write to the revision-checked `timesheet` System Domains
owner. Production-shell QA rejects absence plus overtime and an invalid cycle
offset before PUT, saves both a sick day and an alternate schedule, reads both
through legacy, exposes a revision conflict without mutation, resets both
coordinates and preserves unrelated hidden event and assignment fields. All
writes use a localhost-only gate; Pilot remains default-off and read-only.

Structure Responsibility Policies completes the non-critical Structure command
set without moving assignability logic into React. The editor writes the master,
mode and retained manual employee list; `operational_runtime/service.js` remains
the owner of `department`, `workCenter`, `manual` and `all` resolution. The host
rejects missing employees and a duplicate master before persistence. QA proves
manual-target preservation across a switch to `all`, conflict-without-mutation
plus retry, hidden-field preservation, `2`-row legacy read-back and unchanged
disposable compatibility state. Archive remains legacy and Pilot write
acceptance is separate.

Weekly Production Control's earlier “week selection” command scope was removed
after source audit: no such legacy command exists, and the module explicitly
describes itself as an informational read-only projection. Its real missing
interaction was the focus/hover deviation note and workplace report popover.
The legacy owner now includes the already formatted note contract in its read
model; React renders it with the same text, keyboard focus behavior and
viewport-safe presentation without reproducing aggregation or report logic.
Pilot acceptance on `v.1.499.74-7784ab4` proved the current `25 x 11` matrix,
all 25 normalized row projections, live deviation-note focus, clean console and
rollback to the same legacy data. Both rollout flags are currently off.
