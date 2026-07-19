# Weekly Production Control React migration QA

Date: 2026-07-19
Status: isolated read-only scenario; production host not connected

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
- independent minified entry: `204,704 B` raw / `63,343 B` gzip, under the
  unchanged `225,000 B / 68,000 B` production-island ceiling.

Command:

```sh
npm run qa:weekly-production-control-react-lab
```

This is not a production integration or Pilot acceptance claim. The next gate
is an application host that passes `getWeeklyProductionControlModel()` output
behind false-by-default runtime and session flags, followed by literal parity
against the actual legacy renderer on the same read model.
