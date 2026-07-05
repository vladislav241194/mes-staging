# Corrective Phase B Result

Дата: 2026-07-05

## Summary

Corrective Phase B закрыла статусный и табличный добор без изменения бизнес-логики, маршрутизации, Gantt geometry, `styles/ui/planning-order.css` и `styles/ui/runtime-safety.css`.

## Block A: Status / Badge / Chip

Мигрировано или токенизировано 14 patterns:

| pattern | action | after |
|---|---|---|
| `.status-pill` | token-only | общий алиас в `styles/ui/status.css` |
| `.status-pill.ok` | token-only | success status tokens |
| `.status-pill.warning` | token-only | warning status tokens |
| `.status-pill.critical` | token-only | danger status tokens |
| `.deadline-badge` | token-only | общий алиас вне Gantt |
| `.supply-status-pill` | token-only | semantic status tokens |
| `.supply-status-pill.is-warning` | token-only | warning tokens |
| `.supply-status-pill.is-ok` | token-only | success tokens |
| `.supply-status-pill.is-danger` | token-only | danger tokens |
| `.supply-readonly-badge` | token-only | info/status tokens |
| `.shop-map-readonly-badge` | token-only | covered by legacy badge aliases |
| `.auth-prototype-role-marker` | token-only | neutral status tokens |
| `.shift-master-assignment-chip` | token-only | info/neutral tokens |
| `.director-order-chip` | token-only | neutral/warning/danger tokens |

## Block B: Table Exceptions

Print and visual sample tables are now explicitly marked:

- `data-ui-component="PrintTable"`: 9 tables
- `data-ui-component="VisualSampleTable"`: 1 table

The table audit now reports:

- production table exceptions: 0
- unclassified table exceptions: 0
- non-production table exceptions: 10
- table contract violations: 0

## Block C: Duplicate Selectors

Safe selector-family cleanup was limited to legacy status aliases:

- generic `.status-pill` duplicates collapsed into `styles/ui/status.css`
- generic `.deadline-badge` duplicates collapsed into `styles/ui/status.css`

Gantt-scoped `.deadline-badge` rules were left intact because they belong to Gantt-specific rendering.

## Block D: Shrinking Budgets

Added and integrated:

- `scripts/ui-status-badge-budget.json`
- `scripts/ui-table-exception-budget.json`
- `scripts/css-duplicate-selector-budget.json`
- `scripts/ui-corrective-phase-b-budget.mjs`

Integrated into:

- `npm run qa:ui`
- `npm run qa:css`
- `npm run qa:syntax`

## Metrics

| metric | before | after | delta |
|---|---:|---:|---:|
| duplicate selector groups | 349 | 347 | -2 |
| largest duplicate selector group | 12 | 12 | 0 |
| legacy tail lines | 3961 | 3961 | 0 |
| `!important` usages | 2905 | 2905 | 0 |
| raw hex usages | 1875 | 1830 | -45 |
| border-radius px declarations | 199 | 199 | 0 |
| production table exceptions | 0 | 0 | 0 |
| unclassified table exceptions | n/a | 0 | n/a |
| non-production table exceptions | 0 | 10 | +10 |
| print table exceptions | 0 | 9 | +9 |
| visual sample table exceptions | 0 | 1 | +1 |
| tokenized status/badge/chip patterns | n/a | 14 | n/a |
| raw local status colors | n/a | 107 | n/a |

Machine metrics: `reports/corrective-phase-b-metrics.json`.

## QA

- `node --check src/app.js`: pass
- `node --check src/ui/components.js`: pass
- `node --check src/ui_runtime_contracts.js`: pass
- `node --check scripts/ui-table-contract-audit.mjs`: pass
- `node --check scripts/ui-corrective-phase-b-budget.mjs`: pass
- `npm run qa:css`: pass
- `npm run qa:ui`: pass

Full final QA is tracked in the execution log for Phase B.

## Remaining Risk

Duplicate selector groups are still high because the largest remaining families are broad layout/sidebar/table/Gantt selectors. Phase B intentionally did not touch Gantt geometry, planning-order layout, or runtime-safety behavior. The next safe pass should target table wrapper duplication or segmented/action control duplication with visual QA.
