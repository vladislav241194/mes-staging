# Corrective Phase A Baseline

Start time: 2026-07-05 11:11:53 MSK

## Git State Before Corrective Phase A

- Branch: `main`
- HEAD before changes: `7286d0c`
- Tracked changed files: 0
- Untracked entries: 0
- `git diff --stat`: empty

## Production Files Already Changed Before Corrective Phase A

None. The worktree was clean at the start of this corrective pass.

## Scripts Already Changed Before Corrective Phase A

None. The worktree was clean at the start of this corrective pass.

## Docs/Reports Already Untracked Before Corrective Phase A

None. The worktree was clean at the start of this corrective pass.

## Separation Rule

Everything changed after this file belongs to Corrective Phase A unless explicitly stated otherwise in the final result report.

## Baseline Metrics Used For Comparison

| Metric | Baseline |
| --- | ---: |
| `src/app.js` lines | 39103 |
| `src/modules/**/*.js` files | 1 |
| imports from `./modules/*` in `src/app.js` | 1 |
| `styles/layers/99-legacy-overrides-tail.css` lines | 4821 |
| duplicate selector groups | 349 |
| raw hex usages | 1894 |
| unique hex colors | 223 |
| `!important` usages | 3047 |
| `font-size px` declarations | 779 |
| raw `font-weight` declarations | 484 |
| raw `line-height` declarations | 609 |
| raw `border-radius px` declarations | 294 |
| spacing/position px declarations | 2094 |

## Baseline QA

The same QA family was used as the final comparison target.

- `npm run build` - pass
- `npm run qa:ui` - pass
- `npm run qa:css` - pass
- `npm run qa:architecture` - pass
- `npm run qa:functional` - pass
- `npm run qa:ui:regression` - pass
- `npm run qa:ui:tables` - pass
- `npm run qa:ui:overlays` - pass
- `npm run qa:ui:gantt` - pass
- `npm run qa:gantt` - pass
- `npm run qa:gantt:geometry` - pass
- `npm run qa:gantt:scale` - pass
- `npm run qa:visual` - pass
- `npm run qa:ui-kit` - pass
- `npm run qa:boundaries` - pass
- `npm run qa:ui:helpers` - pass
