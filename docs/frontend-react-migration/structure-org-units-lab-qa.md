# Structure Org Units React migration QA

Date: 2026-07-20
Branch: `codex/frontend-react-migration`

## Scope

Read vertical scenario:

`open Structure and Employees -> Org Units -> select a unit -> inspect its passport`.

The adapter consumes the authenticated PostgreSQL System Domains snapshot and
preserves stable IDs, Russian sort order, department/section category, parent
hierarchy, code and archive status.

Local-only command scenario:

`create child unit -> reject hierarchy cycle -> edit with revision conflict -> retry -> reject referenced-parent archive -> explicitly archive/reactivate leaf -> read through legacy`.

The command owner remains in `src/app.js`, requires the PostgreSQL primary
System Domains surface and `productionStructureMatrix.edit`. Ordinary save is
lifecycle-neutral. Archive and reactivation are ID-bound, require a second
confirmation and delegate to existing owners. Archive rejects active incoming
hierarchy, production and employment references; reactivation requires an
active parent, clears `archivedAt` and reads the authoritative result back.

## Evidence

- invalid containers and rows without stable ID/name fail closed;
- all `19` canonical org units survive the typed boundary;
- the five legacy cells (`Подразделение + stable ID`, `Тип`, `Родитель`, `Код`,
  `Статус`) and order match React literally;
- production-shell QA covers selection/passport, seven registry links, six
  metrics, exact Work Centers legacy fallback, unchanged state and clean console;
- Positions regression still matches 49/49 after three-host routing;
- local write QA creates a twentieth child row and preserves its exact parent;
- an indirect cycle is rejected before any PUT reaches the command API;
- conflict does not mutate the revision, retry advances it exactly once;
- a referenced parent archive is rejected before PUT;
- leaf archive persists `isActive=false` plus valid `archivedAt`; hidden and
  parent fields survive;
- ordinary edit exposes no lifecycle control; explicit reactivation persists
  `isActive=true`, clears `archivedAt`, preserves parent/hidden fields and reads
  back as 20 active rows through legacy;
- the disposable compatibility snapshot remains byte-for-byte unchanged;
- latest local Org Units first commit was `22.00 ms`.

The independent artifact is `214,972 B` raw / `65,451 B` gzip; bundled production
is `207,866 B` raw / `64,977 B` gzip / `56,032 B` Brotli, below the
`225,000 B / 68,000 B` gate. The aggregate lab uses the separate read-only
scenario and remains `557,101 B / 126,296 B`, below its development-only gate.
Both read and write remain false by default.

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
data was written. The new command slice is local evidence only; Pilot write
acceptance remains a separate controlled checkpoint.
