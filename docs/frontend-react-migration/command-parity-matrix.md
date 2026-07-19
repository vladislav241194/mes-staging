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

Nomenclature and Component Types have locally complete create/edit/delete
command parity. Operations, Nomenclature Types, user-managed Statuses and board
metadata have locally complete create/edit parity. Structure Employees,
Structure Positions, Structure Org Units, Structure Work Centers, Structure
Equipment and Structure Responsibility Policies now have locally complete PostgreSQL-backed create/edit
parity through the System Domains owner, while reference-sensitive,
lifecycle, import, BOM-row and delete commands remain explicit legacy-only
slices. Timesheet now has locally complete single-day attendance save/remove;
permanent schedule assignment remains legacy. Roles and Access now has locally
complete passport metadata editing through the `access-control` owner; grants,
assignments, scopes, read-only and active remain legacy. Structure Migration Diagnostics and Weekly Production Control are intentionally
read-only product modules and own no write commands. Planning Workbench now has
locally complete route/item navigation and quantity editing through its current
PostgreSQL-backed owner; dates, labor, Gantt transfer and cancel remain legacy. The remaining scenarios
retain their explicit next vertical scopes.

| Priority | Scenario | Command status | Risk | Next vertical scope |
| ---: | --- | --- | --- | --- |
| 1 | Nomenclature | Local complete: create/edit/delete | Medium | Separately approved Pilot read-only evaluation, then separately approved write evaluation |
| 2 | Component Types | Local complete: create/edit/delete | Low | Separately gated Pilot write evaluation with a `directories:edit` role and disposable-row cleanup |
| 3 | Operations | Local complete: create/edit; delete remains legacy | Medium | Separately gated Pilot create/edit evaluation; delete stays separate until Specifications usage cleanup is covered |
| 4 | Weekly Production Control | Not applicable: product module is read-only; Pilot read accepted | Low | Keep default-off until an explicit default-on decision |
| 5 | Nomenclature Types | Local complete: create/edit; delete remains legacy | Medium | Separately gated Pilot read-only evaluation, then write evaluation with a disposable type and reference audit |
| 6 | Statuses | Local complete: user-managed create/edit; system rows and delete protected | Medium | Separately gated Pilot read-only evaluation, then write evaluation with one disposable user-authority status |
| 7 | Boards/BOM | Local complete: board metadata create/edit; import, BOM rows and delete remain legacy | Medium | Separately gated Pilot read-only evaluation, then metadata write with a disposable board |
| 8 | Structure Employees | Local complete: employee + primary assignment create/edit; archive remains legacy | High | Separately gated Pilot write evaluation with a disposable employee and cleanup |
| 9 | Structure Positions | Local complete: create/edit with organization, work-center and schedule references; archive remains legacy | High | Separately gated Pilot write evaluation with a disposable position and cleanup |
| 10 | Structure Org Units | Local complete: create/edit with parent existence and hierarchy-cycle validation; archive remains legacy | High | Separately gated Pilot write evaluation with a disposable child unit and cleanup |
| 11 | Structure Equipment | Local complete: create/edit with organization, work-center, quantity and schedule validation; archive remains legacy | High | Separately gated Pilot write evaluation with disposable equipment and cleanup |
| 12 | Structure Responsibility Policies | Local complete: create/edit with mode, unique master and allowed-employee validation; archive remains legacy | High | Separately gated Pilot write evaluation with a disposable policy and cleanup |
| 13 | Structure Work Centers | Local complete: create/edit with organization, parent hierarchy and Planning/Gantt flags; archive remains legacy | High | Separately gated Pilot write evaluation with a disposable work center and cleanup |
| 14 | Timesheet | Local complete: one-day attendance save/remove; permanent schedules remain legacy | High | Separately gated Pilot write evaluation on a disposable attendance day |
| 15 | Roles and Access | Local complete: role label, description and default module; grants, assignments and scopes remain legacy | Critical | Separately gated Pilot metadata write evaluation |
| 16 | Planning Workbench | Local complete: route/detail navigation and quantity edit; dates, labor, Gantt transfer and cancel remain legacy | Critical | Separately gated Pilot quantity write evaluation |
| 17 | Shift operational modules | Pending; Shift Work Orders attachment viewer is locally React-owned | Critical | Shift Work Orders print/package preview before assignment or fact mutations |
| 18 | Specifications 2.0, Gantt, Authorization | Pending | Critical | Dedicated protected editor/security slices |
| 19 | Contour Admin | Protected legacy | Critical | Separate Ops approval required before any command migration |
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
result through legacy and restores the original edited row. Owner-level QA
proves propagation to ordinary and work-center-override route steps,
recalculation of an unfinished unlocked slot, and immutability of locked,
completed and unrelated slots. The audit also found and repaired a missing
`applyPlanningOrderLaborToSlot` dependency at the legacy service boundary.
Delete additionally touches Specifications and therefore stays separate and
legacy-only.

Nomenclature Types now has local RBAC-gated create/edit parity through the
existing directory owner. Its disposable-snapshot QA proves create, rename,
Nomenclature item type propagation, Specifications 2.0 structure-reference
propagation, legacy read-back and no changes to unrelated Planning rows. The
owner audit also repaired two legacy defects: synchronization previously used
an unavailable/stale state boundary, and a new row's empty previous name could
normalize to `РЭА компоненты` and recategorize existing items. Pilot remains
default-off and has no write runtime flag for this scenario.

Statuses now has local create/edit parity only for explicitly user-managed
rows. Both `custom-status-` ID and persisted `statusAuthority: "user"` are
required at the command owner; system rows remain hard read-only even if input
forges the marker. Disposable production-shell QA proves create/edit,
persistence, unchanged system contracts, legacy read-back and unchanged
Planning rows. Pilot remains default-off and has no Statuses write runtime
flag.

Boards/BOM now has local metadata create/edit parity through the existing lazy
Products command owner. Production-shell QA preserves hidden fields,
`projectId`, imported rows and Specifications references, synchronizes both
existing and new result Nomenclature, reads the edit through legacy and leaves
Planning unchanged. The owner audit also repaired the missing
`upsertBomResultToNomenclature` dependency in the legacy save path. Excel
import, BOM-row edits, counters and delete remain separate legacy slices.

Structure Employees is the first locally complete PostgreSQL-backed React
command slice. Its local-only write gate delegates to the existing compound
System Domains owner, which saves `employees` and the primary
`employmentAssignments` row as one revision-checked command. Production-shell
QA proves create, conflict without mutation, retry, edit, reference integrity,
hidden-field preservation, legacy `77`-row read-back and an unchanged disposable
compatibility snapshot. Archive remains legacy and Pilot write acceptance is a
separate controlled checkpoint.

Structure Positions extends that pattern to a referenced registry. Its
local-only editor creates and edits position name, code, category, organization,
work center, base schedule and active state. QA proves exact reference IDs,
conflict-without-mutation plus retry, hidden-field preservation, `50`-row
legacy read-back and unchanged disposable compatibility state. The audit also
fixed Structure active-host routing so a write-gated registry cannot disable
legacy event binding while another host is selected.

Structure Org Units adds hierarchy-safe PostgreSQL create/edit. Its local-only
editor saves name, code, type, parent and active state through the same
revision-checked System Domains owner. Production-shell QA proves parent
existence, rejects an indirect parent cycle before any PUT, preserves hidden
fields, exercises conflict-without-mutation plus retry, returns the twentieth
row through legacy and leaves the disposable compatibility snapshot unchanged.
Archive remains legacy and Pilot write acceptance is a separate controlled
checkpoint.

Structure Work Centers adds hierarchy-safe PostgreSQL create/edit for name,
code, organization, parent, Planning participation, Gantt visibility and active
state. The impact audit repaired two runtime projection defects: an explicitly
cleared parent could return from the legacy fallback, and explicit false
Planning/Gantt flags could be re-enabled through legacy `isPlanningUnit`.
Executable owner QA now proves opt-out, restore, archive and new-center behavior
in the shared Planning/Gantt catalog while stable employee/Shift references
survive rename. Production-shell QA rejects an indirect hierarchy cycle before
PUT, preserves hidden fields, exercises conflict-without-mutation plus retry,
returns the twentieth row through legacy and leaves the disposable compatibility
snapshot unchanged. Archive remains legacy and Pilot write acceptance is a
separate controlled checkpoint.

Structure Equipment adds PostgreSQL create/edit for all seven legacy fields,
including the organization reference that is not visible in the five-column
read table. The command owner rejects a negative or fractional quantity and
missing organization, work-center or schedule references before persistence.
Production-shell QA proves exact reference IDs, conflict-without-mutation plus
retry, hidden-field preservation, `7`-row legacy read-back and an unchanged
disposable compatibility snapshot. Archive remains legacy and Pilot write
acceptance is separate.

Timesheet adds a bounded React editor for the fact of one selected day while
the permanent employee schedule remains in legacy. The host reuses the existing
legacy attendance-event builder and the revision-checked `timesheet` System
Domains command owner. Production-shell QA rejects absence plus overtime before
PUT, saves a sick day, reads it through legacy, exposes a revision conflict
without mutation, retries reset, restores the projected schedule and preserves
an unrelated hidden event field. All writes use a localhost-only gate; Pilot
remains default-off and read-only.

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
