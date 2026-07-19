# Structure Positions React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Scope

Read-only vertical scenario:

`open Structure and Employees -> Positions -> select a position -> inspect its passport`.

The typed adapter consumes the authenticated PostgreSQL System Domains
projection. It resolves organization unit, work center, schedule and category
labels without changing stable IDs or domain authority.

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
- repeated local Positions commits stayed below `20 ms`.

The independent entry is `209,326 B` raw / `64,392 B` gzip. The production
artifact is `203,728 B` raw / `63,958 B` gzip / `55,098 B` Brotli. It remains
false by default.

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
no Pilot data was written. Command migration is not accepted by this slice.
