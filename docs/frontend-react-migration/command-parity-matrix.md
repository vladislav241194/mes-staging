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
metadata have locally complete create/edit parity. Structure Employees now has
locally complete employee plus primary-assignment create/edit parity through
the PostgreSQL System Domains owner, while reference-sensitive,
lifecycle, import, BOM-row and delete commands remain explicit legacy-only
slices. Structure Migration Diagnostics and Weekly Production Control are intentionally
read-only product modules and own no write commands. The remaining scenarios
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
| 9 | Remaining Structure registries | Pending | High/Critical | One registry and one command at a time, preserving PostgreSQL references |
| 10 | Timesheet | Pending | High | One attendance-day save/remove scenario |
| 11 | Roles and Access | Pending | Critical | Role metadata before grants, assignments and scopes |
| 12 | Planning and operational modules | Pending | Critical | Navigation/local actions before scheduling, assignment or fact mutations |
| 13 | Specifications 2.0, Gantt, Authorization | Pending | Critical | Dedicated protected editor/security slices |
| 14 | Contour Admin | Protected legacy | Critical | Separate Ops approval required before any command migration |
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
