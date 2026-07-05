# UI Regression Manual Check Reduction

| What Was Checked Manually | Now Checked Automatically | Command | Limitations |
| --- | --- | --- | --- |
| Does each main module open after a UI change? | 20 modules across 5 viewports | `npm run qa:ui:regression` | Does not judge visual taste |
| Did a module render a blank page? | Text length, shell and content bounds | `npm run qa:ui:regression` | Requires local server freshness |
| Did body-level horizontal overflow appear? | `reports/ui-overflow-report.json` | `npm run qa:ui:regression` | Some narrow limited-support modules warn |
| Did a table lose `TableWrap`? | Table regression report | `npm run qa:ui:tables` | Print tables remain documented exceptions |
| Did tree indentation/toggles disappear? | Tree markers and level markers in tables | `npm run qa:ui:tables` | Does not validate every branch visually |
| Did overlay opening break? | Safe overlay probes | `npm run qa:ui:overlays` | AuthSession report may be unavailable when there is no task |
| Did Gantt lose timeline/slots/dependency layer? | Gantt section in regression smoke | `npm run qa:ui:gantt` | Does not test drag/resize |
| Did Gantt lose its special runtime contract? | Dedicated Gantt DOM/data/geometry suite | `npm run qa:gantt` | Does not perform destructive drag/resize/save actions |
| Did Gantt receive visual inline styles? | Gantt inline-style audit | `npm run qa:gantt:inline` | Geometry inline styles are allowed |
| Did Gantt scale switching blank the canvas? | Hours/days/weeks smoke across 5 viewports | `npm run qa:gantt:scale` | Does not approve final visual design |
| Did Gantt overlays open and close safely? | Editor, optimization and dependency-edit smoke | `npm run qa:gantt:interactions` | Does not save slot/editor data |
| Did console/runtime errors appear? | CDP console/runtime error collection | `npm run qa:ui:regression` | Warnings are not fatal |
| Did local UI classes drift from runtime? | Runtime class audit | `npm run qa:ui` | Static/runtime class presence, not visual review |
| Did raw tokens increase? | Raw token audit | `npm run qa:ui` | Baseline-aware, not a design approval |

## Still Manual

- Fine visual hierarchy and readability.
- Design polish of individual blocks.
- Gantt drag/resize/dependency editing.
- Gantt visual polish and pixel-level design approval.
- Deep editing in `productionStructureMatrix`.
- Print preview visual fidelity.
- Full mobile/tablet UX decisions.
