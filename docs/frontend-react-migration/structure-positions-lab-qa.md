# Structure Positions React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Scope

Read scenario plus a local-only PostgreSQL command evaluation:

`open Structure and Employees -> Positions -> select a position -> inspect its passport -> create/edit a position`.

The typed adapter consumes the authenticated PostgreSQL System Domains
projection. It resolves organization unit, work center, schedule and category
labels without changing stable IDs or domain authority.

The write slice exposes the existing legacy fields only: name, code, category,
organization unit, work center, base schedule and active state. It delegates to
the canonical System Domains owner and keeps archive in legacy.

## Command safety

The host requires localhost-only `react-structure-positions-write=1`, current
PostgreSQL read readiness, the `production-structure` command surface and
`productionStructureMatrix:edit` RBAC. Non-empty organization, work-center and
schedule IDs must exist in the current projection. The owner refreshes the
revision, checks exact compatibility parity and sends the full candidate with
`If-Match` plus an idempotency key. Fields not exposed by the editor are merged
from the existing entity.

## Evidence

- invalid containers and positions without stable ID/name fail closed;
- all `49` canonical positions survive the adapter in legacy sort order;
- the five legacy cells remain `Должность + stable ID`, `Категория`,
  `Подразделение`, `Рабочий центр`, and `Статус`;
- the passport adds code and base schedule from the same read model;
- production-shell QA matched 49 legacy rows to 49 React rows on the same
  intercepted PostgreSQL response;
- selection/detail, all seven registries, six metrics, requested Org Units
  fallback, unchanged state and clean console passed;
- Employees regression QA still matched all 76 rows after host routing changed;
- local create/edit QA advances `49 -> 50` rows, forces one revision conflict
  without mutation, retries successfully and reads the edit through legacy;
- organization, work-center and base-schedule references plus a hidden server
  field survive the write cycle;
- every command carries the production surface, matching `If-Match` revision
  and a non-empty idempotency key;
- latest local production-shell commit was `20.60 ms`, below the `2000 ms`
  local gate.

The production island is `215,168 B` raw / `65,465 B` gzip, within the unchanged
`225,000 B / 68,000 B` budget. The full lab is `474,000 B / 110,581 B`, below
`478,000 B / 118,000 B`. It remains false by default.

## Pilot acceptance

The production host shipped disabled by default in release
`v.1.499.73-b1b77cf`. On 2026-07-19, one authenticated session evaluated the
read-only Positions scope.

- all `49` PostgreSQL-backed rows matched legacy in order and in all five read
  fields;
- first React commit was `32.50 ms`;
- selection and the full position passport passed;
- the seven registry counts and six summary metrics stayed aligned;
- create remained disabled;
- an unsupported registry request returned to the exact `19`-row legacy
  Organization Units view;
- deactivation restored the unchanged `49`-row legacy Positions view even with
  the evaluation query retained.

The rollout flags are off, the temporary root directory has been removed, and
no Pilot data was written. Pilot command migration is not accepted by this slice.
Local create/edit completion does not authorize Pilot writes or archive.
