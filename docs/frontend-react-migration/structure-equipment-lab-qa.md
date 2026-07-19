# Structure Equipment React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Scope

Read-only vertical scenario:

`open Structure and Employees -> Equipment -> select an item -> inspect its passport`.

The typed adapter consumes the authenticated PostgreSQL System Domains snapshot
and preserves stable IDs, legacy Russian ordering, work-center and schedule
references, quantity and archive status.

## Evidence

- invalid containers and rows without stable ID/name fail closed;
- all `6` canonical equipment rows survive the typed boundary;
- all five legacy cells and source order match React literally;
- selection/passport, seven registry links, six metrics, exact Org Units fallback,
  unchanged state and clean console pass in the production shell;
- all four previously integrated Structure registry regressions remain exact;
- latest local first commit was `16.5 ms`.

The independent entry is `208,973 B` raw / `64,291 B` gzip. The production
artifact is `203,506 B` raw / `63,993 B` gzip / `55,085 B` Brotli. It remains
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
data was written. Command migration is outside this accepted slice.
