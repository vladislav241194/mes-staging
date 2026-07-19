# Structure Org Units React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Scope

Read-only vertical scenario:

`open Structure and Employees -> Org Units -> select a unit -> inspect its passport`.

The adapter consumes the authenticated PostgreSQL System Domains snapshot and
preserves stable IDs, Russian sort order, department/section category, parent
hierarchy, code and archive status.

## Evidence

- invalid containers and rows without stable ID/name fail closed;
- all `19` canonical org units survive the typed boundary;
- the five legacy cells (`Подразделение + stable ID`, `Тип`, `Родитель`, `Код`,
  `Статус`) and order match React literally;
- production-shell QA covers selection/passport, seven registry links, six
  metrics, exact Work Centers legacy fallback, unchanged state and clean console;
- Positions regression still matches 49/49 after three-host routing;
- latest local Org Units first commit was `17.3 ms`.

The independent entry is `208,696 B` raw / `64,239 B` gzip. The production
artifact is `203,298 B` raw / `63,823 B` gzip / `55,093 B` Brotli. It remains
false by default and has not been released or activated on Pilot.
