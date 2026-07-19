# Structure Equipment React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Scope

Read vertical scenario:

`open Structure and Employees -> Equipment -> select an item -> inspect its passport`.

The typed adapter consumes the authenticated PostgreSQL System Domains snapshot
and preserves stable IDs, legacy Russian ordering, work-center and schedule
references, quantity and archive status.

Local-only command scenario:

`reject invalid quantity -> create equipment -> edit with revision conflict -> retry -> read through legacy`.

The form covers all seven legacy fields, including `orgUnitId`, which is not
visible in the five-column read table. The host remains the command owner and
requires PostgreSQL primary authority plus `productionStructureMatrix.edit`.

## Evidence

- invalid containers and rows without stable ID/name fail closed;
- all `6` canonical equipment rows survive the typed boundary;
- all five legacy cells and source order match React literally;
- selection/passport, seven registry links, six metrics, exact Org Units fallback,
  unchanged state and clean console pass in the production shell;
- all four previously integrated Structure registry regressions remain exact;
- negative quantity is rejected before any PUT;
- create preserves organization, work-center and schedule IDs plus quantity;
- conflict does not mutate the revision and retry advances it exactly once;
- hidden server-only fields survive edit and legacy reads back all seven rows;
- the disposable compatibility snapshot stays byte-for-byte unchanged;
- latest local first commit was `32.30 ms`.

The production artifact is `214,824 B` raw / `65,385 B` gzip, below the
`225,000 B / 68,000 B` gate. The aggregate lab uses a separate read-only
scenario and remains below `478,000 B / 118,000 B`. Both read and write remain
false by default.

## Pilot acceptance

The production host shipped disabled by default in release
`v.1.499.73-b1b77cf`. On 2026-07-19, one authenticated session evaluated
Equipment in read-only mode.

- all six PostgreSQL-backed rows matched legacy in order and in all five read
  fields;
- first React commit was `32.10 ms`;
- selection preserved work-center and schedule references and opened the
  correct passport;
- registry counts and summary metrics remained aligned;
- create stayed disabled;
- requesting Org Units returned to the exact `19`-row legacy registry;
- deactivation restored the unchanged six-row legacy Equipment view even with
  the evaluation query retained.

The flags are off, the temporary root directory has been removed, and no Pilot
data was written. The new command slice is local evidence only; Pilot write
acceptance remains a separate controlled checkpoint.
