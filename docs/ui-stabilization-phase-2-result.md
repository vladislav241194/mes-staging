# UI Stabilization Phase 2 Result

Дата: 2026-07-05.

## 1. Summary

Phase 2 выполнен как кодовая миграция, а не как документация. Закрыто 6 практических блоков из требуемых 5:

- проверен baseline `qa:functional`, исходный blocker `planning-labor-functional-qa.mjs` не воспроизвелся;
- `planning` и `shiftWorkOrders` подключены к Table/TreeTable contract;
- compatibility CSS-only debt физически сокращен удалением мертвых классов;
- raw token audit переведен в baseline-aware режим с fail на новые нарушения;
- добавлен table contract audit и подключен к `qa:ui`;
- добавлен Gantt runtime guardrail без изменения Gantt geometry/DOM slot behavior;
- duplicate selector pressure безопасно снижен ограниченно: `450 -> 448`, без рискованной перепаковки live Gantt/table/sidebar CSS.

## 2. Diff summary

Рабочее дерево уже содержало изменения предыдущих задач, поэтому общий `git diff --stat` нельзя считать чистой метрикой только Phase 2. Текущий общий diff:

- 37 files changed;
- 2486 insertions;
- 11379 deletions.

Phase 2 production/runtime changes:

- `src/app.js`;
- `src/ui_runtime_contracts.js`;
- `styles/mes-ui-core.css`;
- `styles/layers/20-technology-specifications.css`;
- `styles/layers/70-planning-table-and-matrix.css`;
- `styles/layers/80-visual-system-ui-states.css`;
- `styles/layers/99-legacy-overrides-tail.css`;
- `package.json`.

Phase 2 scripts:

- `scripts/ui-raw-token-audit.mjs`;
- `scripts/ui-raw-token-baseline.json`;
- `scripts/ui-table-contract-audit.mjs`;
- `scripts/gantt-runtime-guardrails-qa.mjs`.

Phase 2 docs:

- `docs/ui-stabilization-phase-2-result.md`;
- обновлены `docs/ui-legacy-layer-map.md` и `docs/ui-guardrails-report.md`.

## 3. Functional QA

Исходное состояние в начале этого прохода:

- `npm run qa:functional`: pass;
- blocker `planning-labor-functional-qa.mjs`: `UI mode select for planning labor was not found` не воспроизвелся.

Что сделано:

- blocker не игнорировался, а был проверен полным functional run;
- новый `qa:gantt-guardrails:inner` добавлен в общий `qa:functional:inner`.

Итог:

- `npm run qa:functional`: pass.

## 4. Table/TreeTable migration

Измененные live render-функции:

- `renderPlanningOrderStructureTable`;
- `renderShiftWorkOrdersTable`;
- `renderRouteTreeCell`;
- дополнительные planning register blocks с `planning-order-register-table`.

Что мигрировано:

- `planning-order-table` теперь идет через `renderUiTableWrap`;
- `shift-work-orders-table` сохранен внутри `renderUiTableWrap`, но усилен `ui-table`;
- table headers получили `ui-table-header`;
- live rows получили `ui-table-row`;
- empty state получил `ui-table-empty`;
- tree cell получил `ui-tree-cell` как contract-marker.

Что сохранено без изменений:

- `data-planning-order-row`;
- `data-route-step-row`;
- `data-shift-work-order-row`;
- `data-shift-work-order-tree-toggle`;
- обработчики строк и существующая бизнес-разметка.

Что дополнительно защищено:

- `styles/mes-ui-core.css` ограничивает generic `.ui-tree-cell`, чтобы marker не ломал старую геометрию `speki-tree-cell`.

## 5. Compatibility debt reduction

До прохода:

- compatibility CSS-only classes: 16.

После прохода:

- compatibility CSS-only classes: 7 по счетчику `qa:ui`;
- в выводе остаются documented classes: `directory-actions`, `kpi-row`, `planning-detail-disclosure`, `planning-editable-panel`, `planning-order-actions`, `planning-order-map-head`, `planning-panel-head`, `planning-result-panel`.

Физически удалены из compatibility list и CSS:

- `bom-table`;
- `calculation-readiness-panel`;
- `calculation-readiness-steps`;
- `component-matrix-panel`;
- `readonly-token`;
- `shift-work-orders-tree-muted-action`;
- `spec-bom-plan-list`;
- `spec-bom-plan-panel`;
- `specification-bindings-panel`;
- `specification-list-main`;
- `specification-list-meta`;
- `specification-list-row`;
- `specification-list-table`.

Оставлено:

- planning/detail/action classes, потому что они еще участвуют в живых layout/compatibility зонах;
- `directory-actions` и `kpi-row`, потому что их безопаснее мигрировать отдельным проходом через layout contract, а не удалять как мертвые.

## 6. Token audit

Скрипт:

- `scripts/ui-raw-token-audit.mjs`.

Baseline:

- `scripts/ui-raw-token-baseline.json`.

Подключение:

- `npm run qa:ui`;
- `npm run qa:architecture` транзитивно через `qa:ui`;
- `npm run qa:syntax`.

Baseline numbers после cleanup:

- raw hex usages: 2035;
- unique hex colors: 280;
- `!important`: 3128;
- font-size px declarations: 845;
- font-weight literal declarations: 496;
- line-height raw declarations: 616;
- border-radius px declarations: 333;
- spacing/position px declarations: 2257.

Поведение:

- `--update-baseline` обновляет зафиксированный долг;
- обычный режим падает только на новые raw visual values вне token layer;
- `styles/mes-ui-core.css` считается token layer и не блокирует проверку.

## 7. Table audit

Скрипт:

- `scripts/ui-table-contract-audit.mjs`.

Подключение:

- `npm run qa:ui`;
- `npm run qa:architecture` транзитивно через `qa:ui`;
- `npm run qa:syntax`.

Последний результат:

- tables found: 33;
- tables under `TableWrap`: 23;
- documented table exceptions: 10;
- table contract violations: 0;
- table-like class patterns checked: 125;
- table-like class violations: 0.

Documented exceptions:

- print tables в route/work-order/shift-work-order print forms;
- один visual-system sample.

## 8. Duplicate selector pressure

Before:

- duplicate selector groups: 450.

After:

- duplicate selector groups: 448.

Что реально снижено:

- давление уменьшилось за счет удаления мертвого compatibility CSS в `styles/layers/20-technology-specifications.css`, `styles/layers/70-planning-table-and-matrix.css`, `styles/layers/80-visual-system-ui-states.css`, `styles/layers/99-legacy-overrides-tail.css`.

Что не схлопывалось в этом проходе:

- крупные группы `.directory-table`, `.module-menu`, `.gantt-shell`, `.primary-button/.secondary-button`;
- причина: эти группы смешивают desktop/tablet/legacy overrides и live Gantt/table/sidebar behavior. Массовое схлопывание там было бы уже визуальным рефакторингом с риском регрессий.

## 9. Gantt guardrails

Скрипт:

- `scripts/gantt-runtime-guardrails-qa.mjs`.

Подключение:

- `npm run qa:gantt-guardrails`;
- `npm run qa:functional`;
- `npm run qa:syntax`.

Проверки:

- `main.app-shell[data-layout-page="gantt"]`;
- `[data-gantt-shell][data-ui-component="GanttRuntime"]`;
- `.gantt-canvas[data-ui-component="GanttCanvas"]`;
- `.timeline-row[data-ui-component="GanttTimeline"]`;
- `.gantt-row`;
- `.operation-slot[data-slot-id][data-ui-component="GanttSlot"]:not(.aggregate-slot)`;
- `.dependencies-layer[data-ui-component="GanttDependencyLayer"]`;
- `[data-gantt-zoom]`;
- double click по слоту не создает две модалки: `#slotForm <= 1`, `.modal-backdrop <= 1`.

Что не трогалось:

- Gantt geometry;
- `data-gantt-*`;
- drag/resize/dependency behavior;
- absolute positioning;
- SVG dependency paths;
- DOM slot structure.

## 10. QA results

| Command | Status | Notes |
|---|---|---|
| `npm run build` | pass | `dist` собран, asset hashes обновлены |
| `npm run qa:ui` | pass | raw token audit + table audit подключены |
| `npm run qa:css` | pass | duplicate selector groups `448`, exact duplicates `0` |
| `npm run qa:syntax` | pass | новые scripts включены |
| `npm run qa:architecture` | pass | flow/ui/legacy/css/structure |
| `npm run qa:gantt-guardrails` | pass | 20 non-aggregate slots, 3 aggregate slots, 1 modal |
| `npm run qa:functional` | pass | все functional smoke, включая новый Gantt guardrail |
| `git diff --check` | pass | whitespace clean |

## 11. Remaining risks

1. Duplicate selector pressure остается высоким: 448 groups.
2. `styles/layers/99-legacy-overrides-tail.css` все еще крупный и содержит много overrides.
3. Compatibility list уменьшен сильно, но оставшиеся planning/directory classes требуют отдельной runtime migration.
4. Raw token baseline большой; audit теперь не дает расти долгу, но старый долг еще не очищен.
5. Table contract audit защищает новые table literals, но не заменяет визуальный QA всех table states.

## 12. Next tasks

1. Мигрировать оставшиеся compatibility CSS-only classes: `directory-actions`, `kpi-row`, `planning-*`.
2. Сделать отдельный safe pass по `.directory-table th/td` duplicate groups с visual/browser checks.
3. Вынести table selected/hover/header/tree tokens в более строгий `mes-ui-core` contract и убрать module overrides.
4. Добавить overlay opened-state audit для modal/drawer/dropdown.
5. Уменьшать raw token baseline по одному layer за проход, начиная с `99-legacy-overrides-tail.css` и `70-planning-table-and-matrix.css`.
