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

Nomenclature and Component Types have locally complete command parity;
Structure Migration Diagnostics is intentionally read-only and owns no
commands. The remaining scenarios retain their explicit next vertical scopes.

| Priority | Scenario | Command status | Risk | Next vertical scope |
| ---: | --- | --- | --- | --- |
| 1 | Nomenclature | Local complete: create/edit/delete | Medium | Separately approved Pilot read-only evaluation, then separately approved write evaluation |
| 2 | Component Types | Local complete: create/edit/delete | Low | Separately gated Pilot write evaluation with a `directories:edit` role and disposable-row cleanup |
| 3 | Operations | Pending | Medium | Create/edit and work-center reference parity; delete stays separate |
| 4 | Weekly Production Control | Pending | Medium | Week selection and report actions without duplicating aggregation |
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
current authenticated QA role is read-only. Operations is the next directory
read/command-owner audit; its work-center reference impact must be proved before
any write evaluation.
