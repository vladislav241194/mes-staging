# Gantt Phase 5 Baseline

Phase: UI/UX Stabilization Phase 5 — Gantt Stabilization Contract.

## Snapshot

- Branch: `main`.
- Workspace state at Phase 5 start: dirty worktree already existed from previous stabilization phases.
- Pre-Phase 5 diff summary captured at task start: 37 files changed, 2627 insertions, 12509 deletions.
- Gantt was already a special runtime, not a normal `ModulePage`/`TableWrap` screen.
- The task intentionally did not reset or revert existing dirty files.

## Baseline Commands

Commands run before Phase 5 work:

| Command | Baseline Result |
| --- | --- |
| `git status --short` | dirty worktree, pre-existing changes present |
| `git diff --stat` | dirty diff present |
| `npm run build` | pass |
| `npm run qa:ui` | pass |
| `npm run qa:css` | pass |
| `npm run qa:architecture` | pass |
| `npm run qa:functional` | pass |
| `npm run qa:ui:regression` | pass |
| `npm run qa:ui:gantt` | pass |
| `npm run qa:ui:tables` | pass |
| `npm run qa:ui:overlays` | pass |

Commands missing before Phase 5 and added during the phase:

- `npm run qa:gantt`
- `npm run qa:gantt:inline`
- `npm run qa:gantt:geometry`
- `npm run qa:gantt:scale`
- `npm run qa:gantt:interactions`

## Existing Gantt Guardrails

Before Phase 5, generic UI regression already checked that the Gantt module opened and contained:

- Gantt shell/canvas/timeline.
- Gantt rows.
- Operation slots.
- Dependency paths.
- Zoom controls.
- Slot editor form.

That was useful smoke coverage, but it did not provide a dedicated Gantt contract for geometry, dynamic data attributes, inline styles, scale modes, or overlay states.

## Dangerous Runtime Zones

These Gantt zones were treated as protected:

| Zone | Risk | Reason |
| --- | --- | --- |
| Runtime shell/canvas | critical | Owns scroll container, absolute geometry and runtime markers |
| Timeline scale | high | Scale modes change cell count and placement |
| Rows/lane labels | high | Row heights and `top` positions drive slot placement |
| Operation slots | critical | Absolute `left/top/width/height`, drag/resize handles, status classes |
| Dependency SVG | critical | Path routing, masks, arrows and edit controls |
| Non-working layer | medium | Visual layer can accidentally cover slots |
| Drawer/editor/optimization overlays | high | Open states can break viewport, close actions or double modals |
| Drag/resize/snap | critical | Behavior was intentionally not changed in Phase 5 |

## Phase 5 Scope Boundary

Allowed:

- Contract markers.
- Token aliases for existing visual state.
- Static and browser regression scripts.
- Safe smoke interactions that do not save data.

Not allowed:

- Planning algorithm changes.
- Drag/resize behavior changes.
- Dependency route algorithm changes.
- Slot DOM rewrite.
- Visual redesign.
- Mass CSS cleanup outside safe token migration.
