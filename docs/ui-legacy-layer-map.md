# UI Legacy Layer Map

Цель: отделить допустимую compatibility-зону от нового UI-контракта.

## CSS layers

| Файл | Назначение | Правило |
|---|---|---|
| `styles.css` | Только manifest imports | Реальные CSS-правила запрещены |
| `styles/mes-ui-core.css` | Tokens + reusable runtime contracts | Новый источник правды |
| `styles/layers/00-foundation-base.css` | Базовые foundation rules | Только низкоуровневые правила |
| `styles/layers/10-shell-directory-gantt-base.css` | Исторический shell/directory/gantt base | Не расширять без причины |
| `styles/layers/20-technology-specifications.css` | Технологии/spec compatibility после удаления SMT-калькулятора | Не расширять новыми module-specific паттернами |
| `styles/layers/30-module-shell-ui-foundations.css` | Module shell compatibility | Кандидат на постепенное схлопывание в UI Core |
| `styles/layers/40-gantt-planning-routes.css` | Живой Gantt/routes CSS | Опасная зона |
| `styles/layers/50-nomenclature-routes-directories.css` | Номенклатура/маршруты/директории | Кандидат на дальнейшее схлопывание table/card паттернов |
| `styles/layers/60-operational-modules.css` | Операционные модули | Старые planning blocks |
| `styles/layers/70-planning-table-and-matrix.css` | Planning/table/matrix | Кандидат на Table contract migration |
| `styles/layers/80-visual-system-ui-states.css` | UI-состояния и эталоны | Должен показывать контракты, не плодить production CSS |
| `styles/layers/90-shift-master-board.css` | Мастерская | Много живых бизнес-зон, править аккуратно |
| `styles/layers/99-legacy-overrides-tail.css` | Tail compatibility and emergency guards | Только documented overrides |

## Compatibility CSS-only classes

Список хранится в `UI_RUNTIME_COMPATIBILITY_CSS_ONLY_CLASSES`:

- `directory-actions`
- `kpi-row`
- `planning-detail-disclosure`
- `planning-editable-panel`
- `planning-order-actions`
- `planning-order-map-head`
- `planning-panel-head`
- `planning-result-panel`

## Policy

1. Новый CSS-only class с runtime prefix должен падать в `npm run qa:ui`.
2. Добавление класса в compatibility list требует причины и последующей задачи на миграцию/удаление.
3. `99-legacy-overrides-tail.css` не должен быть местом новых эталонов.
4. Если визуальная проблема повторяется в двух модулях, правка идет в `styles/mes-ui-core.css` или helper contract, а не в локальный layer.

## Cleared During This Pass

- Removed dead SMT calculator visual selectors: `smt-line-card`, `smt-coefficients-*`, `smt-coefficient-field`, `smt-result-kpi-row`.
- Removed `smt-` from `UI_RUNTIME_CONTROLLED_CLASS_PREFIXES`, so new SMT-prefixed CSS will no longer be treated as a valid MES runtime namespace.
- Reduced documented compatibility CSS-only classes from 22 to 16.

## Cleared During Phase 2

- Removed dead technology/spec compatibility selectors:
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
- Current `qa:ui` compatibility CSS-only count: `7`.
- Remaining list is intentionally limited to live planning/directory compatibility classes that need a separate runtime migration.

## Phase 6 CSS Decomposition

Two shared component families were moved out of `styles/mes-ui-core.css` into explicit UI component files:

- `styles/ui/actions.css` for `ActionButton`;
- `styles/ui/status.css` for `StatusToken`.

`styles.css` is still manifest-only and now imports these files after legacy layers. `scripts/css-layer-audit.mjs` validates this order, so future component CSS can be moved deliberately instead of being hidden inside module layers.
