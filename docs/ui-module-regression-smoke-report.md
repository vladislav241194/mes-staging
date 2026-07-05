# UI Module Regression Smoke Report

Generated: 2026-07-05T20:39:35.455Z

## Summary

- modules: 19
- viewports: desktop 1440x932, tablet 1180x820, tablet-compact 1024x768, narrow 430x932, narrow-compact 390x844
- checks: 95
- failed: 0
- warnings: 11

## Checks

viewport | module | status | type | body overflow X | table | overlays | notes
--- | --- | --- | --- | --- | --- | --- | ---
desktop | gantt | ok | special-runtime-protected | 0 | - | 0 |
desktop | planning | ok | contract | 0 | TableWrap | 0 |
desktop | shiftWorkOrders | ok | contract | 0 | EmptyState | 0 |
desktop | routes | ok | contract | 0 | TableWrap | 0 |
desktop | products | ok | contract | 0 | EmptyState | 0 |
desktop | nomenclature | ok | contract | 0 | TableWrap | 0 |
desktop | directories | ok | contract | 0 | TableWrap | 0 |
desktop | timesheet | ok | special-runtime | 0 | TableWrap | 0 |
desktop | productionStructureMatrix | ok | special-runtime | 0 | TableWrap | 0 |
desktop | shiftMasterBoard | ok | contract | 0 | - | 0 |
desktop | authPrototype | ok | special-runtime | 0 | - | 0 |
desktop | authSessionPrototype | ok | contract | 0 | EmptyState | 0 |
desktop | roles | ok | contract | 0 | TableWrap | 0 |
desktop | planningTable | ok | contract | 0 | TableWrap | 0 |
desktop | supply | ok | contract | 0 | TableWrap | 0 |
desktop | shopMap | ok | special-runtime | 0 | TableWrap | 0 |
desktop | visualSystem | ok | special-runtime | 0 | TableWrap | 2 |
desktop | employees | ok | placeholder | 0 | - | 0 |
desktop | dispatch | ok | placeholder | 0 | - | 0 |
tablet | gantt | ok | special-runtime-protected | 0 | - | 0 |
tablet | planning | ok | contract | 0 | TableWrap | 0 |
tablet | shiftWorkOrders | ok | contract | 0 | TableWrap | 0 |
tablet | routes | ok | contract | 0 | TableWrap | 0 |
tablet | products | ok | contract | 0 | EmptyState | 0 |
tablet | nomenclature | ok | contract | 0 | TableWrap | 0 |
tablet | directories | ok | contract | 0 | TableWrap | 0 |
tablet | timesheet | ok | special-runtime | 0 | TableWrap | 0 |
tablet | productionStructureMatrix | ok | special-runtime | 0 | TableWrap | 0 |
tablet | shiftMasterBoard | ok | contract | 0 | - | 0 |
tablet | authPrototype | ok | special-runtime | 0 | - | 0 |
tablet | authSessionPrototype | ok | contract | 0 | EmptyState | 0 |
tablet | roles | ok | contract | 0 | TableWrap | 0 |
tablet | planningTable | ok | contract | 0 | TableWrap | 0 |
tablet | supply | ok | contract | 0 | TableWrap | 0 |
tablet | shopMap | ok | special-runtime | 0 | TableWrap | 0 |
tablet | visualSystem | ok | special-runtime | 0 | TableWrap | 2 |
tablet | employees | ok | placeholder | 0 | - | 0 |
tablet | dispatch | ok | placeholder | 0 | - | 0 |
tablet-compact | gantt | ok | special-runtime-protected | 0 | - | 0 |
tablet-compact | planning | ok | contract | 0 | TableWrap | 0 |
tablet-compact | shiftWorkOrders | ok | contract | 0 | TableWrap | 0 |
tablet-compact | routes | ok | contract | 0 | TableWrap | 0 |
tablet-compact | products | ok | contract | 0 | EmptyState | 0 |
tablet-compact | nomenclature | ok | contract | 0 | TableWrap | 0 |
tablet-compact | directories | ok | contract | 0 | TableWrap | 0 |
tablet-compact | timesheet | ok | special-runtime | 0 | TableWrap | 0 |
tablet-compact | productionStructureMatrix | ok | special-runtime | 0 | TableWrap | 0 |
tablet-compact | shiftMasterBoard | ok | contract | 0 | - | 0 |
tablet-compact | authPrototype | ok | special-runtime | 0 | - | 0 |
tablet-compact | authSessionPrototype | ok | contract | 0 | EmptyState | 0 |
tablet-compact | roles | ok | contract | 0 | TableWrap | 0 |
tablet-compact | planningTable | ok | contract | 0 | TableWrap | 0 |
tablet-compact | supply | ok | contract | 0 | TableWrap | 0 |
tablet-compact | shopMap | ok | special-runtime | 0 | TableWrap | 0 |
tablet-compact | visualSystem | ok | special-runtime | 0 | TableWrap | 2 |
tablet-compact | employees | ok | placeholder | 0 | - | 0 |
tablet-compact | dispatch | ok | placeholder | 0 | - | 0 |
narrow | gantt | warn | special-runtime-protected | 0 | - | 0 | header bounds limited on narrow viewport
narrow | planning | ok | contract | 0 | TableWrap | 0 |
narrow | shiftWorkOrders | ok | contract | 0 | TableWrap | 0 |
narrow | routes | ok | contract | 0 | TableWrap | 0 |
narrow | products | ok | contract | 0 | EmptyState | 0 |
narrow | nomenclature | ok | contract | 0 | TableWrap | 0 |
narrow | directories | ok | contract | 0 | TableWrap | 0 |
narrow | timesheet | warn | special-runtime | 0 | TableWrap | 0 | action zone overflow div.timesheet-controls.ui-toolbar
narrow | productionStructureMatrix | ok | special-runtime | 0 | TableWrap | 0 |
narrow | shiftMasterBoard | ok | contract | 0 | - | 0 |
narrow | authPrototype | ok | special-runtime | 0 | - | 0 |
narrow | authSessionPrototype | ok | contract | 0 | EmptyState | 0 |
narrow | roles | ok | contract | 0 | TableWrap | 0 |
narrow | planningTable | ok | contract | 0 | TableWrap | 0 |
narrow | supply | ok | contract | 0 | TableWrap | 0 |
narrow | shopMap | ok | special-runtime | 0 | TableWrap | 0 |
narrow | visualSystem | ok | special-runtime | 0 | TableWrap | 2 |
narrow | employees | ok | placeholder | 0 | - | 0 |
narrow | dispatch | ok | placeholder | 0 | - | 0 |
narrow-compact | gantt | warn | special-runtime-protected | 0 | - | 0 | header bounds limited on narrow viewport
narrow-compact | planning | ok | contract | 0 | TableWrap | 0 |
narrow-compact | shiftWorkOrders | ok | contract | 0 | TableWrap | 0 |
narrow-compact | routes | warn | contract | 0 | TableWrap | 0 | action zone overflow div.module-form-actions.full.ui-action-bar
narrow-compact | products | ok | contract | 0 | EmptyState | 0 |
narrow-compact | nomenclature | ok | contract | 0 | TableWrap | 0 |
narrow-compact | directories | ok | contract | 0 | TableWrap | 0 |
narrow-compact | timesheet | warn | special-runtime | 0 | TableWrap | 0 | action zone overflow div.timesheet-controls.ui-toolbar
narrow-compact | productionStructureMatrix | ok | special-runtime | 0 | TableWrap | 0 |
narrow-compact | shiftMasterBoard | ok | contract | 0 | - | 0 |
narrow-compact | authPrototype | ok | special-runtime | 0 | - | 0 |
narrow-compact | authSessionPrototype | ok | contract | 0 | EmptyState | 0 |
narrow-compact | roles | ok | contract | 0 | TableWrap | 0 |
narrow-compact | planningTable | ok | contract | 0 | TableWrap | 0 |
narrow-compact | supply | ok | contract | 0 | TableWrap | 0 |
narrow-compact | shopMap | ok | special-runtime | 0 | TableWrap | 0 |
narrow-compact | visualSystem | ok | special-runtime | 0 | TableWrap | 2 |
narrow-compact | employees | ok | placeholder | 0 | - | 0 |
narrow-compact | dispatch | ok | placeholder | 0 | - | 0 |
