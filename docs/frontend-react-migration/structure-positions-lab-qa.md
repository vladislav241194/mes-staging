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
false by default and has not been released or activated on Pilot.
