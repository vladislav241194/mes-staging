# React command-parity matrix

Date: 2026-07-19

This is the executable completion ledger for the frontend migration. Its source
is `experiments/react-migration/command-parity-matrix.json`, and React migration
QA fails when a production-integrated scenario is missing, duplicated, loses
its rollback declaration, or is marked complete without an explicit status.

All 24 scenarios have local production-shell read evidence and keep legacy
rollback. Authenticated Pilot acceptance is still pending. Nomenclature is the
only scenario with locally complete command parity; Structure Migration
Diagnostics is intentionally read-only and owns no commands. The remaining 22
scenarios have an explicit next vertical scope.

| Priority | Scenario | Command status | Risk | Next vertical scope |
| ---: | --- | --- | --- | --- |
| 1 | Nomenclature | Local complete: create/edit/delete | Medium | Pilot read-only evaluation, then separately approved write evaluation |
| 2 | Component Types | Pending | Low | Disposable create/edit/delete through the existing directory owner |
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

The next implementation after Pilot acceptance is Component Types CRUD. It is
the lowest-risk reuse test for the shared registry/editor contracts and does
not require changing Planning, Shift Execution, authorization or PostgreSQL
authority rules.
