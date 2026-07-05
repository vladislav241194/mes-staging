# Corrective Phase B Baseline

Дата: 2026-07-05
Ветка: `main`

## Контекст

Перед Phase B рабочее дерево уже содержало изменения Phase A/A.5 и смежных UI-проходов. Phase B не начиналась с чистого git state, поэтому baseline фиксирует метрики долга, а не состояние коммита.

## Baseline QA

- `npm run build`: pass
- `npm run qa:ui`: pass
- `npm run qa:css`: pass
- `npm run qa:architecture`: pass
- `npm run qa:functional`: pass
- `npm run qa:ui:tables`: pass
- `npm run qa:ui:overlays`: pass
- `npm run qa:ui:regression`: pass
- `npm run qa:visual`: pass
- `npm run qa:ui-kit`: pass
- `git diff --check`: pass

## Baseline Metrics

| metric | before |
|---|---:|
| duplicate selector groups | 349 |
| largest duplicate selector group | 12 |
| legacy tail lines | 3961 |
| `!important` usages | 2905 |
| raw hex usages | 1875 |
| border-radius px declarations | 199 |
| tables found | 33 |
| tables under TableWrap | 23 |
| table exceptions | 10 |
| production table exceptions | 0 |
| print table exceptions | 0 |
| visual sample table exceptions | 0 |
| `renderUiStatusToken` calls | 56 |

## Baseline Table Exceptions

All 10 exceptions were documented broadly as print/visual exceptions, but the runtime tables did not carry explicit `data-ui-component="PrintTable"` or `data-ui-component="VisualSampleTable"` markers. The audit therefore could not distinguish production table debt from non-production print/sample tables.

## Baseline Status/Badge/Chip State

StatusToken existed, but legacy aliases remained local:

- `.status-pill`
- `.deadline-badge`
- `.supply-status-pill`
- `.supply-readonly-badge`
- `.shop-map-readonly-badge`
- `.auth-prototype-role-marker`
- `.shift-master-assignment-chip`
- `.director-order-chip`
- `.module-menu-badge`

## Baseline Duplicate Families

Top duplicate families were still dominated by historical global selectors. Phase B selected only safe status/badge families for cleanup and left Gantt geometry, sidebar geometry, `planning-order.css`, and `runtime-safety.css` untouched.
