# PostgreSQL-primary checkpoint: System Domains compatibility state

Date: 2026-07-18

Branch: `codex/postgres-primary-slice`

Base: `41450ce` (`origin/feat/shared-state-startup-safe`)

## Completed slice

The initial `/api/shared-state` metadata handshake now requests a dedicated
System Domains compatibility descriptor:

- `retired`: PostgreSQL is primary and the response repeats only the durable
  `null` tombstone, including on matching-version responses;
- `active`: the large compatibility matrix is not transferred in metadata and
  the browser hydrates its exact remote value before allowing it into writes;
- `absent`: legacy bootstrap is permitted only after the server domain read
  fails and no valid local System Domains state exists;
- unknown/mixed-version server: fail closed, hydrate the targeted compatibility
  value, and never resend a potentially stale local or bundled matrix while
  that hydration is pending or failed.

The previous standalone cold System Domains shared-state request was removed.
The descriptor is observed as soon as metadata arrives, before the Planning
bootstrap settles and before shared-state revision gating. Version-zero
snapshots still run the compatibility callback.

## Evidence

Passed locally in the clean worktree:

```text
npm run qa:shared-state
npm run qa:domain-migration
npm run build
node scripts/run-with-dist-preview.mjs -- node scripts/boot-performance-qa.mjs --module=planning --with-shared-state --skip-warm-start-check --report=reports/performance/planning-shared-state-coalesced.json
git diff --check
```

The Planning boot report contains one `/api/shared-state` request. It does not
contain the removed standalone System Domains compatibility read.

## Not yet released

This checkpoint has not changed the pilot release. Before deployment it still
requires an independent review, visible version bump, clean commit-derived
artifact, staged activation, health check, and authenticated pilot acceptance.

## Next vertical step

Complete a dedicated physical-slot parity/shadow contract for the bounded
Gantt window, then connect the client behind a kill switch. Do not authorize
PostgreSQL Gantt reads in a dual-source contour from the older aggregate parity
marker. After that, continue the production write/read-back path and retire the
matching snapshot projection only after pilot parity and rollback evidence.
