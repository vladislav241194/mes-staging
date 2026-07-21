# Weekly Production Control React migration QA

Date: 2026-07-19

Permanent Pilot update: 2026-07-21
Status: permanent default-on accepted; current desktop recheck complete on `v.1.500.21-8fb92d9`

## Vertical scenario

`Open Weekly Production Control -> inspect seven-day plan/fact matrix -> focus
a deviation cell -> inspect its note/report -> inspect weekly summary.`

The legacy module remains authoritative for week bounds, PostgreSQL planning
period hydration, structure/resource resolution, fact aggregation, reports and
deviation calculations. The React adapter accepts only its completed read model;
it does not call APIs, read global state or reproduce production calculations.

## Evidence

- two resource groups retain seven ordered days and 14 plan/fact cells;
- eleven visible columns preserve the legacy matrix order;
- plan, fact, deviation and report summary values survive the typed boundary;
- the legacy owner prepares note/report presentation text; React does not
  reproduce employee, date, deviation or report formatting;
- keyboard focus opens the full deviation context, keeps focus on the source
  cell, stays inside the viewport and closes on blur;
- payload revision `1 -> 2` updates the mounted view without remounting;
- the dense table owns horizontal overflow instead of widening the page;
- a disabled feature flag restores the lab legacy fallback;
- browser console remains clean;
- independent minified entry: `206,572 B` raw / `63,948 B` gzip, under the
  unchanged `225,000 B / 68,000 B` production-island ceiling.

Command:

```sh
npm run qa:weekly-production-control-react-lab
```

At the original evaluation checkpoint the production host passed
`getWeeklyProductionControlModel()` output behind two false-by-default runtime
permissions and an explicit authenticated session request. Production-shell QA proves literal parity for 25 completed
resource/work-center groups and eleven columns on one compact PostgreSQL period
payload. Owner-level QA additionally proves that deviation note and report text
are produced by `getWeeklyProductionControlModel()`, while isolated browser QA
proves keyboard/viewport behavior. It also found and closed a legacy lazy-load race: Weekly now initializes
its Structure read helpers and rerenders both paths after all six resources are
available. The bundled production artifact is `202,775 B` raw / `63,714 B`
gzip / `54,840 B` Brotli. That paragraph records local production-shell
evidence; permanent Pilot evidence is recorded separately below.

The source audit also corrected the command ledger: Weekly Control owns no
write commands and no legacy week-selector command. Its command status is
therefore `not-applicable`.

## Pilot acceptance

Release `v.1.499.74-7784ab4` was built from clean upstream commit `7784ab4`,
staged as an immutable artifact and activated with
`v.1.499.73-b1b77cf` retained as the immediate rollback target. The release
manifest records source digest
`4351a52a4d4bb3b0206fcd9fe7d6b2c16ff414aa94e46b022e1f18200e6c8bf8`
and dist digest
`39c6c47d9dbf05a7fb9fccc6a2a42f3f54bf6998383fe4d37b13dbf3468dba20`.

The root-owned evaluation enabled only
`MES_REACT_WEEKLY_PRODUCTION_CONTROL=1` and
`MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION=1`. An existing
authenticated QA session explicitly requested the evaluation and proved:

- island state `ready`, revision `1`, first commit `214.80 ms`;
- the current week `13.07.2026-19.07.2026`, `25` resource groups and `11`
  columns;
- plan `28 171`, fact `1`, `17` deviations and `0` workplace reports;
- all 25 normalized React row projections exactly matched the same legacy
  rows after rollback (SHA-256
  `db7cd6bd49f1a9a4e13e652c58aede3fc8da1352339a03ce7396a21fe67b0ee7`);
- focusing a live deviation cell opened the owner-prepared note with plan,
  fact and missing-reason guidance; its `390 px` popover remained fully inside
  the `1986 x 1851` viewport;
- the page did not horizontally overflow and the browser console remained
  free of warnings and errors.

No application data was created or changed. At that historical evaluation
checkpoint deactivation removed the isolated systemd drop-in, both Weekly flags
returned to `false`, health remained `ok`, and the same authenticated query
rendered legacy with the same `25 x 11` matrix. Permanent rollout happened only
in the later immutable-policy releases described below.

## Permanent Pilot acceptance

Weekly Production Control became the first permanent read-only React surface on
`v.1.500.19-53022a2`. That acceptance proved the real `25 x 11` projection in
desktop and narrow viewports, query isolation and a clean browser console
without an evaluation flag or session request.

Current-release desktop recheck on `v.1.500.21-8fb92d9` proved:

- the island root is `ready`, runtime mode is `react`, and `aria-busy=false`;
- the real table still contains `25` rows and `11` headers;
- the page has no horizontal overflow and exposes zero inputs or write controls;
- query parameters cannot override the permanent runtime policy;
- the accessible browser log contains no warning or error.

The `.21` check was desktop-only. Weekly's narrow acceptance remains the
historical `.19` evidence and is not represented as a new `.21` narrow run.

The full immutable-release drill was
`v.1.500.21-8fb92d9 -> v.1.500.20-a4d8b2f -> v.1.500.21-8fb92d9 ->
v.1.500.18-93d02ed -> v.1.500.19-53022a2 -> v.1.500.20-a4d8b2f ->
v.1.500.21-8fb92d9`. The pinned `.18` policy exposed zero React surfaces and
rendered the same `25 x 11` Weekly projection through legacy. Final reactivation
restored `.21` with Weekly and Diagnostics as the only two permanent React
surfaces, no evaluation drop-ins and no evaluation environment values. No
application data was written during acceptance or rollback.

## Current Pilot consolidation addendum: `v.1.500.26-097d66c`

The `.21` acceptance text above is retained verbatim as historical evidence.
The current immutable Pilot release is `v.1.500.26-097d66c` at exact commit
`097d66c416ef61e091099c63b8bc272841c364f5`; immediate previous is
`v.1.500.25-1f8369c`, and pinned legacy remains
`v.1.500.18-93d02ed`.

This release moves the Weekly production read-model out of the normal legacy
runtime. React now receives the bounded Planning Period, System Domains and
fact/report owner inputs through the typed production model. The old Weekly
runtime remains lazy-loadable only through the explicit rollback selector.
Authenticated desktop acceptance reached `ready`, cleared `aria-busy`, retained
exactly `25 x 11`, and matched the text of every row against immutable `.25`.
The live DOM/error state was clean. Query-isolation was not repeated on `.26`
and live-console capture was unavailable, so neither is claimed as fresh `.26`
evidence; both remain separately covered by local production-shell QA.

The real release drill was `.26 -> .25 -> .26`, with exact Weekly row parity
after rollback and reactivation. Legacy `.18` was resolved and inspected only
through a dry-run: its pinned runtime policy contains zero React surfaces, but
the release was not activated in this drill. No application data was written,
all evaluation residue is absent, and command-owner hashes are unchanged from
`.25`. This accepted consolidation contributes exactly two
legacy-consolidation points, taking the global evidence-weighted result from
`48%` to `50%`; it does not claim completion of the remaining MES migration.
