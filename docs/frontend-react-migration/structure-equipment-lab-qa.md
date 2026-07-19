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

The independent entry is `208,954 B` raw / `64,285 B` gzip. The production
artifact is `203,506 B` raw / `63,993 B` gzip / `55,085 B` Brotli. It remains
false by default and has not been released or activated on Pilot.
