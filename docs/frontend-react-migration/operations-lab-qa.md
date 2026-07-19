# Directory Operations React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Scope

Vertical scenario:

`open Directories -> Operations -> filter/select -> create/edit a custom operation -> inspect delete impact -> cancel or confirm -> read back through legacy`.

The typed adapter consumes the production runtime projection rather than raw
organization IDs. Existing MES logic continues to sort operations and resolve
`workCenterId` into the user-facing work-center label. React preserves that
projection and does not duplicate routing, alias, or organization rules.

## Contract and evidence

- invalid containers and rows without stable ID/name fail closed;
- source order is preserved;
- status and non-negative rate normalization are typed;
- work-center filters operate on the already resolved label;
- the three legacy cells are `Операция`, `Отдел`, and `Статус`;
- read-only evaluation keeps create/edit/delete disabled;
- local write evaluation exposes create/edit/delete only after RBAC capability
  projection;
- bundled `MES_OPERATION_MAP` rows fail closed as protected; only custom rows
  can be deleted;
- delete confirmation reports exact Specifications references and only the
  Planning references loaded in the current runtime;
- “Все справочники” restores a full legacy directory section without cycling
  into another React island.

`npm run qa:directory-operations-react-island` compares the same runtime
payload in two production shells. Three legacy rows equal three React rows in
all cells and order. Work-center filtering, one selected row, detail context,
legacy return, unchanged read-only state, clean console, and a `< 25 ms` local
first commit pass.

The isolated local write contour additionally creates one disposable operation,
edits an existing operation, preserves hidden `code` and `unitsPerHour` fields,
proves byte-stable delete cancellation, confirms custom-row deletion and reads
the result through the legacy table. The linked Specifications row is cleared
without changing an unrelated row. The React form exposes exactly the three
legacy editor fields: operation name, work center and status.

Owner-level QA uses the real `app_events` service with controlled Planning
state. An ordinary linked route step follows operation name/work center, a step
with `workCenterOverride` keeps its own center, and an unfinished unlocked slot
is updated and recalculated. Locked, completed and unrelated slots remain byte-
equivalent. Delete-owner QA additionally proves exact cleanup of two linked
route steps, all three linked slots (ordinary, locked and completed) and one
Specifications row. The production-shell Directories run intentionally does
not hydrate Planning: its metadata-only write omits that key and preserves the
server snapshot byte-for-byte. These checks exposed and fixed the previously missing
`applyPlanningOrderLaborToSlot` dependency between Planning Core and the legacy
event owner and a stale Planning compatibility projection in non-Planning
shared-state writes.

The independent entry is `210,478 B` raw / `64,840 B` gzip. The production
artifact is `205,613 B` raw / `64,439 B` gzip / `55,610 B` Brotli.

## Production boundary

The production host requires two false-by-default server flags and a per-
session evaluation request. Without the request, editor access and all other
directory sections retain legacy.

## Pilot acceptance

Release `v.1.499.73-b1b77cf` was evaluated without changing the immutable
release. Controls from commit `264e127` enabled only
`MES_REACT_DIRECTORY_OPERATIONS=1` and
`MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION=1` from an isolated
root-only directory.

The authenticated `Алексеев Егор` session rendered revision `1` in `25.20 ms`.
All `22/22` React rows matched all `22/22` legacy rows in order and in the three
visible fields: operation, resolved work center and status. `Склад` contained
the expected seven operations; selecting `Приход от поставщика` opened stable
ID `D1_OP1`, code `WH-010`, work center `Склад` and `300 ед./ч`. Add remained
disabled, page overflow was absent and the browser console was clean.

`Все справочники` unmounted React and restored the exact legacy Operations
section. Deactivation removed all React flags; a newly authenticated session
with the evaluation query retained rendered the same 22-row legacy table and
no island. Health remained `ok`, the temporary root directory was removed and
no Pilot data was written.

Local command QA confirms complete custom-operation create/edit/delete parity.
Create/edit propagates into linked route steps and unfinished Gantt slots;
delete clears loaded route-step/slot references and exact Specifications
references through the existing owner. Pilot writes remain disabled. The next
gate is a separately controlled Pilot create/edit/custom-delete evaluation with
a disposable operation, explicit impact review and verified cleanup.
