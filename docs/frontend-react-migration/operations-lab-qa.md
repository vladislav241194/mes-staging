# Directory Operations React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Scope

Read-only vertical scenario:

`open Directories -> Operations -> filter by resolved work center -> select an operation -> inspect its card`.

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
- create/edit/delete remain legacy and the React action is disabled;
- “Все справочники” restores a full legacy directory section without cycling
  into another React island.

`npm run qa:directory-operations-react-island` compares the same runtime
payload in two production shells. Three legacy rows equal three React rows in
all cells and order. Work-center filtering, one selected row, detail context,
legacy return, unchanged state, clean console, and a `< 25 ms` local first
commit pass.

The independent entry is `203,364 B` raw / `63,173 B` gzip. The production
artifact is `200,213 B` raw / `62,802 B` gzip / `54,111 B` Brotli.

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

The command owner audit confirms that create/edit propagates into linked route
steps and unfinished Gantt slots, while delete also clears operation references
from Specifications. Therefore the next write slice must prove reference impact
on disposable local data; Pilot write and delete remain disabled.
