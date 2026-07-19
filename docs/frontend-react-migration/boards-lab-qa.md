# Boards/BOM React migration QA

Date: 2026-07-19
Branch: `codex/frontend-react-migration`

## Scope

Locally complete board-metadata create/edit vertical scenario:

`open Boards -> inspect BOM -> create a board card -> edit an existing board -> verify Nomenclature result and Specifications references -> read through legacy`.

React owns the typed editor for `name`, `boardCode` and `resultItem`. The
existing Products command owner remains responsible for normalization,
persistence, result-Nomenclature synchronization, notifications and rerender.
Excel import, BOM row editing, component counters and delete remain separate
legacy slices.

## Legacy contract preserved

- imported `importRows` remain authoritative and preserve all nine Excel A:I
  values, source headers, file/sheet metadata and package/quantity semantics;
- old eight component-count fields remain the fallback for boards without row
  data;
- board edit preserves stable ID, `projectId`, status, arbitrary hidden
  metadata, BOM rows and import metadata;
- Specifications `bomListA` and structure `bomListId` references remain stable;
- board result create/edit continues to upsert the existing Nomenclature
  result with the same `sourceBomResultId`;
- unsupported import, row and delete commands never cross the React boundary.

The owner refactor also repaired a legacy defect: `saveBomModuleForm` called
`upsertBomResultToNomenclature` without receiving it through the lazy Products
events dependency chain. The dependency now crosses App Events -> Routes
Events -> Products Events explicitly.

## Automated evidence

`npm run qa:boards-react-island` proves:

- exact read parity: nine headers, four BOM rows, 16 components and four active
  component groups;
- default legacy without a session request, board selection, empty state,
  table-owned overflow and return to the normalized Nomenclature pane;
- local RBAC-gated board create/edit in a disposable owner-only `0600`
  snapshot;
- unchanged hidden metadata, four imported rows, Specifications references and
  Planning routes/steps/slots;
- existing and newly created board results synchronize to Nomenclature;
- the edited board and all four BOM rows read back through the real legacy form;
- clean browser console after excluding the fixture-only critical-default
  reconciliation notice;
- first React commit `16.80 ms`, below the `2000 ms` local gate.

The independent entry is `212,565 B` raw / `65,324 B` gzip. The production
artifact is `206,793 B` raw / `65,055 B` gzip / `56,012 B` Brotli.

## Production boundary

Read-only activation still requires false-by-default runtime permissions plus
a per-session request. Board create/edit exists only behind local
`react-boards-write=1`, exact boolean capability and the existing
`nomenclature:edit` authorization check. No Pilot/server write flag exists.
No release, Pilot activation or real-data mutation was performed.
