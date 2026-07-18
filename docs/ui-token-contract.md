# UI Token Contract

Цель: все повторяемые визуальные правила должны изменяться через токены в `styles/mes-ui-core.css`, а не через локальные hex/px/font-weight в модульных файлах.

## Основной файл

- `styles/mes-ui-core.css`
- Registry: `UI_RUNTIME_STYLE_TOKENS` в `src/ui_runtime_contracts.js`

## Группы токенов

| Группа | Примеры | Что управляет |
|---|---|---|
| Background/surface | `--mes-ui-bg`, `--mes-ui-surface`, `--mes-ui-surface-soft`, `--mes-ui-surface-selected` | Фоны страниц, панелей, выбранных строк |
| Border/line | `--mes-ui-line`, `--mes-ui-line-soft`, `--mes-ui-line-strong` | Линии, разделители, рамки |
| Text | `--mes-ui-text`, `--mes-ui-text-muted`, `--mes-ui-text-soft`, `--mes-ui-text-inverse` | Цвет текста |
| Sidebar/accent | `--mes-ui-sidebar-bg`, `--mes-ui-primary` | Основной синий спектр системы |
| Density/spacing | `--mes-space-*`, `--mes-ui-density-page`, `--mes-ui-density-gap`, `--mes-ui-density-page-gap`, `--mes-density-page-gap`, `--mes-density-panel-gap`, `--mes-density-card-gap` | Отступы между блоками и внутри страниц |
| Panel inset | `--mes-ui-panel-head-padding`, `--mes-ui-panel-body-padding`, `--mes-ui-panel-footer-padding` | Внутренние отступы панелей |
| Controls | `--mes-ui-control-height-*`, `--mes-control-height-compact`, `--mes-control-height-default`, `--mes-control-height-touch`, `--mes-ui-form-control-height`, `--mes-control-padding-x`, `--mes-control-gap` | Высота и плотность кнопок/полей |
| Icons | `--mes-ui-icon-size-*`, `--mes-icon-button-size`, `--mes-table-icon-button-size`, `--mes-ui-topbar-compact-action-size` | Размеры иконок |
| Tables | `--mes-ui-table-*`, `--mes-table-*`, `--mes-density-table-row-*` | Header, rows, selected, tree lines, compact/default density |
| Typography | `--mes-ui-type-*`, `--mes-font-size-*`, `--mes-line-height-table`, `--mes-ui-line-*`, `--mes-font-weight-*` | Размеры, line-height, жирность |
| Radius | `--mes-ui-radius-*`, `--mes-radius-*`, `--mes-ui-pill`, `--mes-radius-pill` | Скругления |
| Status | `--mes-ui-status-*-bg/border/text`, `--mes-status-*-bg/border/text/accent` | Success/warning/danger/info/neutral/demo/manual/calculated |
| Gantt | `--mes-ui-gantt-*`, `--mes-gantt-*` | Цвета план/распределено/факт/дефицит/передача и безопасные aliases |

## Exact aliases from stabilization pass

Эти имена добавлены намеренно, чтобы будущие задания могли ссылаться на понятные системные категории, а не на исторические `--mes-ui-*` названия:

- Density: `--mes-density-page-gap`, `--mes-density-panel-gap`, `--mes-density-card-gap`, `--mes-density-table-row-compact`, `--mes-density-table-row-default`, `--mes-density-table-row-comfortable`.
- Controls: `--mes-control-height-compact`, `--mes-control-height-default`, `--mes-control-height-touch`, `--mes-control-padding-x`, `--mes-control-gap`.
- Tables: `--mes-table-header-bg`, `--mes-table-header-text`, `--mes-table-row-bg`, `--mes-table-row-hover-bg`, `--mes-table-row-selected-bg`, `--mes-table-row-border`, `--mes-table-tree-line`, `--mes-table-tree-dot`, `--mes-table-tree-dot-active`.
- Radius: `--mes-radius-none`, `--mes-radius-xs`, `--mes-radius-sm`, `--mes-radius-md`, `--mes-radius-lg`, `--mes-radius-xl`, `--mes-radius-pill`.
- Status: `--mes-status-neutral-*`, `--mes-status-ready-*`, `--mes-status-active-*`, `--mes-status-warning-*`, `--mes-status-blocked-*`, `--mes-status-problem-*`, `--mes-status-manual-*`, `--mes-status-calculated-*`, `--mes-status-demo-*`.
- Gantt: `--mes-gantt-row-height`, `--mes-gantt-timeline-height`, `--mes-gantt-left-width`, `--mes-gantt-slot-radius`, `--mes-gantt-slot-border`, `--mes-gantt-slot-planned-bg`, `--mes-gantt-slot-active-bg`, `--mes-gantt-slot-warning-bg`, `--mes-gantt-slot-problem-bg`, `--mes-gantt-non-working-bg`, `--mes-gantt-dependency-color`.

## Правила использования

1. Новый цвет в модуле нельзя писать напрямую, если смысл уже покрыт token group.
2. Новый spacing/radius/font-size сначала добавляется как token, затем используется в модуле.
3. Для status нельзя смешивать локальные цвета и `StatusToken`.
4. Для table/tree нельзя задавать локальные цвета линий без `--mes-ui-table-*`.
5. Для Gantt нельзя менять геометрию через token pass; только цвета/типографика и только после отдельной проверки.

## Текущий статус

Token layer усилен без редизайна: новые токены в основном являются алиасами существующих значений. Это значит, что будущая глобальная правка может менять один token, но текущие модули не получают неожиданной смены геометрии.

`scripts/ui-raw-token-audit.mjs` работает как baseline-aware hard gate: исторические прямые visual values зафиксированы в `scripts/ui-raw-token-baseline.json` и `scripts/ui-raw-token-budgets.json`, а любое новое значение вне token layer останавливает `qa:ui`. Baseline — не признак нормализованного дизайна: его нужно постепенно уменьшать отдельными миграциями.
