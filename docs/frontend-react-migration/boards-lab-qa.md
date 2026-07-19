# Boards/BOM React migration QA

Date: 2026-07-20
Branch: `codex/frontend-react-migration`

## Scope

Locally complete board-metadata create/edit/delete plus all nine BOM cell edits
and row-delete vertical scenario:

`open Boards -> inspect BOM -> reject invalid quantity -> change quantity ->
edit every remaining A:I field -> normalize package -> cancel row delete ->
confirm exact row delete -> read the complete row through legacy -> create a board card -> edit an
existing board -> inspect delete impact -> cancel -> confirm delete -> verify
Nomenclature result, Specifications cleanup and unchanged Planning`.

React owns the typed editor for `name`, `boardCode` and `resultItem`. The
existing Products command owner remains responsible for normalization,
persistence, result-Nomenclature synchronization, reference cleanup,
notifications and rerender. The bounded quantity control sends the row index,
complete expected normalized row and integer quantity; the host rejects stale,
missing, fractional or negative requests before the existing
`updateBomImportCell` owner. The eight text inputs use the same owner with an
exact non-quantity column allowlist and accept only its complete normalized row
read-back. Excel import, add-from-Nomenclature and legacy component counters
remain separate slices. Row deletion separately
carries the complete expected table, requires accessible confirmation and
delegates to `deleteBomImportRow`; independently addressable Nomenclature stays
outside that delete.

## Legacy contract preserved

- imported `importRows` remain authoritative and preserve all nine Excel A:I
  values, source headers, file/sheet metadata and package/quantity semantics;
- old eight component-count fields remain the fallback for boards without row
  data;
- board edit preserves stable ID, `projectId`, status, arbitrary hidden
  metadata, BOM rows and import metadata;
- board edit keeps Specifications `bomListA` and structure `bomListId`
  references stable; delete clears only references to the removed board;
- board result create/edit continues to upsert the existing Nomenclature
  result with the same `sourceBomResultId`;
- row deletion preserves independently addressable component Nomenclature;
- board deletion preserves the independently addressable Nomenclature result
  and all Planning routes, steps and slots;
- unsupported Excel-import and add-from-Nomenclature commands never cross the
  React boundary.

The owner refactor also repaired a legacy defect: `saveBomModuleForm` called
`upsertBomResultToNomenclature` without receiving it through the lazy Products
events dependency chain. The dependency now crosses App Events -> Routes
Events -> Products Events explicitly. The delete audit also added the missing
explicit `getBomImportRows` dependency across that same lazy chain.

## Automated evidence

`npm run qa:boards-react-island` proves:

- exact read parity: nine headers, four BOM rows, 16 components and four active
  component groups;
- default legacy without a session request, board selection, empty state,
  table-owned overflow and return to the normalized Nomenclature pane;
- local RBAC-gated board create/edit/delete in a disposable owner-only `0600`
  snapshot;
- invalid BOM quantity rejection without persistence, successful `10 -> 12`
  owner update, preservation of the other eight row values and three unrelated
  rows, unchanged Planning and legacy input read-back;
- sequential edits of columns `0,1,2,3,4,5,7,8`, package normalization
  `805 -> 0805`, complete owner-row read-back, existing/new keyed Nomenclature
  behavior and all nine final values through legacy;
- byte-identical row-delete cancellation, confirmed removal of only row four,
  complete expected-table recheck, preservation of three retained rows, hidden
  board metadata, component Nomenclature and unchanged Planning;
- unchanged hidden metadata and three imported rows during board edit;
- existing and newly created board results synchronize to Nomenclature;
- board-delete confirmation reports one linked Specification and three BOM rows;
- cancel is byte-stable; confirm removes one board, clears its direct and
  structure references, retains its Nomenclature result, and leaves Planning
  routes/steps/slots unchanged;
- the two remaining boards read back through the real legacy screen;
- clean browser console after excluding the fixture-only critical-default
  reconciliation notice;
- the final full run committed its first React view in `25.90 ms`, below the
  `2000 ms` local gate.

The production island is `218,822 B` raw / `66,754 B` gzip, below the unchanged
`225,000 B / 68,000 B` gate. The aggregate lab uses a separate read-only Boards
scenario and remains below its unchanged budget at `556,703 B / 126,149 B`.

## Production boundary

Read-only activation still requires false-by-default runtime permissions plus
a per-session request. Board create/edit/delete, all nine BOM cell edits and row
delete exist only behind local `react-boards-write=1`, exact boolean capability and the existing
`nomenclature:edit` authorization check. No Pilot/server write flag exists.
No release, Pilot activation or real-data mutation was performed.

## Pilot rollout preparation

The read-only evaluation now has an isolated root-controlled rollout contour:

- `ops/frontend/mes-pilot-react-boards-evaluation.conf`;
- `ops/frontend/activate-react-boards-evaluation.sh`;
- `ops/frontend/deactivate-react-boards-evaluation.sh`;
- `scripts/boards-react-rollout-ops-qa.mjs`.

It owns only systemd drop-in `89-react-boards-evaluation.conf`, verifies health
and both public read flags after restart, and restores the prior configuration
on activation failure. The rollout QA is part of
`npm run qa:boards-react-island`.

The contour is prepared but not activated. Pilot currently has no non-empty
Boards/BOM payload suitable for a meaningful parity claim, so the live read
checkpoint remains pending and legacy stays the default.
