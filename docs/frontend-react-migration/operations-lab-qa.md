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
directory sections retain legacy. No release or Pilot activation exists yet;
authenticated Pilot acceptance and rollback proof remain pending.
