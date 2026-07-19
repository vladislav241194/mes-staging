# Timesheet React migration QA

Date: 2026-07-19
Status: isolated read-only lab; not production-integrated

## Vertical scenario

`Open Timesheet -> inspect the personnel calendar -> inspect attendance totals.`

The typed adapter consumes the completed `getTimesheetModel()` result. Legacy
remains authoritative for PostgreSQL hydration, period and view selection,
employee schedules, attendance values, editing and every save/remove command.
React does not read global state or call an API.

## Evidence

- two departments retain three employees in source order;
- seven ordered days produce 21 attendance cells and twelve visible columns;
- employee, planned-hours and overtime summary values survive the typed boundary;
- payload revision `1 -> 2` updates the mounted view without remounting;
- the dense table owns horizontal overflow instead of widening the page;
- day, schedule, view and period actions explicitly request the legacy route;
- a disabled feature flag restores the lab legacy fallback;
- browser console remains clean;
- independent minified entry: `204,904 B` raw / `63,575 B` gzip, under the
  unchanged `225,000 B / 68,000 B` production-island ceiling.

Command:

```sh
npm run qa:timesheet-react-lab
```

This proves the read-model and dense-calendar component boundary only. It is
not wired to the MES shell, is not activated on Pilot and does not move any
attendance or schedule command out of legacy.
