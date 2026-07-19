# Structure Work Centers React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Scope

Read and local-only create/edit/archive vertical scenario:

`open Structure and Employees -> Work Centers -> select a center -> inspect its passport`.

The typed adapter consumes the authenticated PostgreSQL System Domains snapshot,
preserves all stable IDs and resolves organization and parent-center references.
The write-gated editor delegates to the existing revision-checked System Domains
owner; Pilot remains read-only and default-off.

## Evidence

- invalid containers and rows without stable ID/name fail closed;
- all `19` canonical work centers survive the typed boundary;
- the five legacy cells (`Рабочий центр + stable ID`, `Подразделение`, `Родитель`,
  `Планирование`, `Статус`) and order match React literally;
- selection/passport, seven registry links, six metrics, exact Equipment fallback,
  unchanged state and clean console pass in the production shell;
- Employees 76/76, Positions 49/49 and Org Units 19/19 regressions pass;
- local create returns a twentieth row with exact organization, parent and
  explicit false Planning/Gantt flags;
- an indirect hierarchy cycle is rejected before PUT;
- conflict-without-mutation, retry, hidden-field preservation and exact legacy
  read-back pass while the compatibility snapshot remains unchanged;
- archive of a baseline center referenced by an active position, equipment or
  employment assignment is rejected before PUT;
- ID-bound confirmation cannot move to another selected row; the created leaf
  is archived with `isActive=false` and a valid `archivedAt` while its cleared
  parent, hidden marker, organization and Planning/Gantt flags are preserved;
- legacy reads back the twentieth row as archived;
- Planning/Gantt impact QA proves opt-out, restore, archive and new-center
  catalog behavior, plus stable employee/Shift IDs across rename;
- latest local first commit was `27.30 ms`.

The independent production entry is `216,718 B` raw / `65,617 B` gzip. Separate
read adapters keep the full lab at `556,607 B` raw / `126,132 B` gzip.
It remains false by default.

## Pilot acceptance

The production host shipped disabled by default in release
`v.1.499.73-b1b77cf`. On 2026-07-19, one authenticated session evaluated Work
Centers in read-only mode.

- all `19` PostgreSQL-backed rows matched legacy in order and in all five read
  fields;
- first React commit was `33.80 ms`;
- selection preserved organization and parent-center references and opened the
  correct passport;
- registry counts and summary metrics remained aligned;
- create stayed disabled;
- requesting Equipment returned to the exact six-row legacy registry;
- deactivation restored the unchanged `19`-row legacy Work Centers view even
  with the evaluation query retained.

The flags are off, the temporary root directory has been removed, and no Pilot
data was written. The new command evidence is local-only; authenticated Pilot
write acceptance remains a separate controlled checkpoint.
