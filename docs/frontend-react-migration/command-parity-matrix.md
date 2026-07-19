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
command parity. Operations has locally complete create/edit parity while its
reference-clearing delete remains an explicit legacy-only slice. Structure
Migration Diagnostics and Weekly Production Control are intentionally
read-only product modules and own no write commands. The remaining scenarios
retain their explicit next vertical scopes.

| Priority | Scenario | Command status | Risk | Next vertical scope |
| ---: | --- | --- | --- | --- |
| 1 | Nomenclature | Local complete: create/edit/delete | Medium | Separately approved Pilot read-only evaluation, then separately approved write evaluation |
| 2 | Component Types | Local complete: create/edit/delete | Low | Separately gated Pilot write evaluation with a `directories:edit` role and disposable-row cleanup |
| 3 | Operations | Local complete: create/edit; delete remains legacy | Medium | Separately gated Pilot create/edit evaluation; delete stays separate until Specifications usage cleanup is covered |
| 4 | Weekly Production Control | Not applicable: product module is read-only; Pilot read accepted | Low | Keep default-off until an explicit default-on decision |
| 5 | Nomenclature Types | Pending | High | Create/edit plus reference synchronization |
| 6 | Statuses | Pending | High | Non-system status create/edit with lifecycle protection |
| 7 | Boards/BOM | Pending | High | Board create/edit before import, row editing and delete |
| 8 | Structure registries | Pending | High/Critical | One registry and one command at a time, preserving PostgreSQL references |
| 9 | Timesheet | Pending | High | One attendance-day save/remove scenario |
| 10 | Roles and Access | Pending | Critical | Role metadata before grants, assignments and scopes |
| 11 | Planning and operational modules | Pending | Critical | Navigation/local actions before scheduling, assignment or fact mutations |
| 12 | Specifications 2.0, Gantt, Authorization | Pending | Critical | Dedicated protected editor/security slices |
| 13 | Contour Admin | Protected legacy | Critical | Separate Ops approval required before any command migration |
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
