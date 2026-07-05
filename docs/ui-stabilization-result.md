# UI Stabilization Result

Дата: 2026-07-05.

См. продолжение практической миграции: `docs/ui-stabilization-phase-2-result.md`.

## Что сделано

1. `styles.css` очищен до manifest-only.
2. Runtime shell guard перенесен в `styles/layers/99-legacy-overrides-tail.css`.
3. `styles/mes-ui-core.css` усилен token groups для surface, line, text, spacing, density, controls, icons, tables/tree tables, typography, radius, status и Gantt.
4. `renderUiActionButton` получил расширенный tone contract: `primary`, `secondary`, `icon`, `table-icon`, `ghost`, `danger`, `compact`, `touch`.
5. `src/ui_runtime_contracts.js` обновлен:
   - расширен `UI_RUNTIME_STYLE_TOKENS`;
   - добавлен `UI_RUNTIME_COMPATIBILITY_CSS_ONLY_CLASSES`.
6. `scripts/ui-runtime-class-audit.mjs` больше не смешивает старый documented compatibility-долг с новым регрессом.
7. Добавлен warning-only raw visual token audit: `scripts/ui-raw-token-audit.mjs`.
8. `qa:ui` теперь выводит baseline по прямым hex/px/font-weight/radius/`!important`.
9. Table/TreeTable contract усилен через `.ui-table-*`, `.ui-tree-*` и compatibility-переменные в `styles/mes-ui-core.css`.
10. Физически удален хвост SMT-калькулятора из CSS compatibility:
   - `smt-line-card`;
   - `smt-coefficients-*`;
   - `smt-coefficient-field`;
   - `smt-result-kpi-row`;
   - prefix `smt-` удален из runtime namespace.
11. Исправлены QA-блокеры:
   - `planning-labor-functional-qa.mjs` теперь выбирает строку операции перед проверкой scroll preservation;
   - `shift-master-board-functional-qa.mjs` получил diagnostic details по tiny targets;
   - компактная кнопка выхода в topbar переведена на `--mes-ui-topbar-compact-action-size`.
12. Добавлены документы:
   - `docs/ui-runtime-contract.md`
   - `docs/ui-token-contract.md`
   - `docs/ui-table-contract.md`
   - `docs/ui-legacy-layer-map.md`
   - `docs/gantt-ui-stabilization-map.md`
   - `docs/ui-guardrails-report.md`

## Baseline до исправлений

- `npm run build`: pass.
- `npm run qa:ui`: fail на CSS-only classes.
- `npm run qa:css`: fail на root stylesheet и exact duplicate CSS rules.
- `npm run qa:architecture`: fail транзитивно через `qa:ui`.
- `npm run qa:functional`: fail на `planning-labor-functional-qa.mjs`: `UI mode select for planning labor was not found`.

## Проверки после исправлений

- `node --check src/app.js && node --check src/ui_runtime_contracts.js && node --check scripts/ui-runtime-class-audit.mjs`: pass.
- `npm run build`: pass.
- `npm run qa:ui`: pass.
- `npm run qa:css`: pass.
- `npm run qa:architecture`: pass.
- `npm run qa:functional`: pass.
- `git diff --check`: pass.

## Измеримый результат повторного прохода

- CSS-only runtime classes: `22 -> 16`.
- Compatibility CSS-only classes: `22 -> 16`.
- Exact duplicate CSS rule groups: `2 -> 0`.
- Duplicate selector groups: `455 -> 450`.
- `styles.css`: manifest-only.
- `qa:planning-labor`: pass.
- `qa:shift-master-board`: pass, `tinyTargets: 0`.
- Raw visual token audit baseline:
  - raw hex usages: 2073;
  - unique hex colors: 281;
  - `!important`: 3129;
  - font-size px declarations: 857;
  - font-weight literal declarations: 507;
  - border-radius px declarations: 340;
  - spacing/position px declarations: 2275.

## Остаточные риски

1. В CSS остается высокий duplicate selector pressure: 450 groups, максимум 12.
2. Compatibility CSS-only classes остаются в проекте как задокументированный долг, а не удалены физически полностью.
3. Raw visual values пока только считаются warning-only audit, без fail-бюджета.
4. `99-legacy-overrides-tail.css` все еще содержит много правил и должен постепенно худеть.
5. Gantt остается special runtime и требует отдельного стабилизационного прохода.

## Следующие задачи

1. Физически мигрировать или удалить compatibility CSS-only classes из `UI_RUNTIME_COMPATIBILITY_CSS_ONLY_CLASSES`.
2. Перевести `scripts/ui-raw-token-audit.mjs` из warning-only в budget mode.
3. Продолжить Table contract migration для `planning`, `shiftWorkOrders`, `productionStructureMatrix`.
4. Провести Gantt contract pass с MacBook Air 15 snapshot bounds.
5. Разобрать duplicate selector groups в shell/table/gantt слоях без изменения DOM.
