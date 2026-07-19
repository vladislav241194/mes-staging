# Frontend React Pilot readiness checkpoint

Date: 2026-07-19
Candidate branch: `codex/frontend-react-migration`
Candidate commit: `311fd5d`

## Read-only live evidence

The authenticated Pilot path was inspected without changing configuration or
data:

- `GET https://pilot.mes-line.ru/healthz` returned `status=ok`, version
  `v.1.499.72`, and `sharedState=ready`;
- the browser loaded `./src/app.js?v=db3bbb28f842-v.1.499.72`;
- Nomenclature rendered the legacy create action and no React mount target;
- all three Nomenclature rollout values were `false`:
  `MES_REACT_NOMENCLATURE`,
  `MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION`, and
  `MES_REACT_NOMENCLATURE_WRITE_EVALUATION`;
- the live Nomenclature payload contained zero rows;
- the browser console contained no warnings or errors.

This proves a healthy unchanged baseline. It does not prove the candidate,
because commit `311fd5d` is not deployed.

## Candidate distance

`origin/main` is still the accepted PostgreSQL handoff `fc71e01`, and the
frontend candidate is a clean descendant with no new main-side divergence.
The live frontend release source recorded for `v.1.499.72` is `6985693`.
Candidate `311fd5d` is 34 commits ahead of that release source; the aggregate
diff contains 227 paths, 11,027 insertions and 346 deletions.

This is a multi-scenario candidate, not a safe one-file Pilot toggle. A release
must therefore be built and activated through the normal commit-derived,
checksummed release procedure with all React flags off first.

## Required acceptance sequence

1. Create a new visible application version and immutable release artifact from
   the exact candidate commit. Do not reuse `v.1.499.72`.
2. Deploy with every React feature and evaluation flag false. Verify health,
   loaded asset hashes, legacy module navigation, authorization, current Shift
   Execution scope and a clean console.
3. Preserve the current `v.1.499.72` artifact as the immediate rollback target.
4. Enable only one read-only island permission, then request it in one
   authenticated session. Do not enable write evaluation in the first pass.
5. Compare legacy and React on the same server projection, viewport and user.
   Record mount time, visible row/cell parity, fallback and console evidence.
6. Disable the permission and verify legacy restoration before moving to the
   next island.
7. Evaluate Nomenclature create/edit only after a non-production disposable
   record or an explicitly approved real record is available. The current live
   Nomenclature store is empty, so a non-empty or write-parity claim cannot be
   made without creating data.

## Current decision

Local source, browser and stabilization gates are green, but authenticated
candidate acceptance is still missing. The next visible version is prepared as
`v.1.499.73`; all React flags remain disabled by default. The complete
`qa:stabilize` gate passes, including release provenance, rollback and
activation diagnostics, and two consecutive production builds have the same
release-tree digest
`39ea1956930450f9b0385a9aa93ecb9fc576fd4d0b02b19d9e2b1bdc72d6db8d`
when the operational bootstrap artifact paths are excluded exactly as in the
release procedure.

This is only a clean local release candidate. No server staging, activation,
rollout flag, real record or Pilot data was changed. The immutable manifest and
server-side checksums can only be created by the established staging command
after explicit deployment authorization.

The exact all-flags-off candidate is locked at `b1b77cf` with release ID
`v.1.499.73-b1b77cf`. Later Nomenclature delete-parity commits are the next
development checkpoint and must not be substituted into that release ID.
