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
false by default.

## Pilot acceptance

The production host shipped disabled by default in release
`v.1.499.73-b1b77cf`. On 2026-07-19, one authenticated session evaluated Org
Units in read-only mode.

- all `19` PostgreSQL-backed rows matched legacy in order and in all five read
  fields;
- first React commit was `33.30 ms`;
- selection preserved the parent hierarchy and opened the correct passport;
- the seven registry counts and six metrics remained aligned;
- create stayed disabled;
- requesting Work Centers returned to the exact `19`-row legacy registry;
- deactivation restored the unchanged `19`-row legacy Org Units view even with
  the evaluation query retained.

The flags are off, the temporary root directory has been removed, and no Pilot
data was written. Command migration is outside this accepted slice.
