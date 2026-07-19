# Weekly Production Control React migration QA

Date: 2026-07-19
Status: production-integrated read-only island; disabled by default

## Vertical scenario

`Open Weekly Production Control -> inspect seven-day plan/fact matrix -> inspect weekly summary.`

The legacy module remains authoritative for week bounds, PostgreSQL planning
period hydration, structure/resource resolution, fact aggregation, reports and
deviation calculations. The React adapter accepts only its completed read model;
it does not call APIs, read global state or reproduce production calculations.

## Evidence

- two resource groups retain seven ordered days and 14 plan/fact cells;
- eleven visible columns preserve the legacy matrix order;
- plan, fact, deviation and report summary values survive the typed boundary;
- payload revision `1 -> 2` updates the mounted view without remounting;
- the dense table owns horizontal overflow instead of widening the page;
- a disabled feature flag restores the lab legacy fallback;
- browser console remains clean;
- independent minified entry: `204,805 B` raw / `63,386 B` gzip, under the
  unchanged `225,000 B / 68,000 B` production-island ceiling.

Command:

```sh
npm run qa:weekly-production-control-react-lab
```

The production host now passes `getWeeklyProductionControlModel()` output
behind two false-by-default runtime permissions and an explicit authenticated
session request. Production-shell QA proves literal parity for 25 completed
resource/work-center groups and eleven columns on one compact PostgreSQL period
payload. It also found and closed a legacy lazy-load race: Weekly now initializes
its Structure read helpers and rerenders both paths after all six resources are
available. The bundled production artifact is `201,150 B` raw / `63,156 B`
gzip / `54,408 B` Brotli. This is local production-shell evidence, not Pilot
acceptance or default-on activation.
