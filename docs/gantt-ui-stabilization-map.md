# Gantt UI Stabilization Map

Gantt остается special runtime: он не является обычной `ModulePage + TableWrap` страницей, потому что содержит абсолютную геометрию, временную шкалу, зависимости и drag/resize.

## Основные зоны

| Зона | Файлы | Риск |
|---|---|---|
| Shell/viewport | `src/app.js`, `styles/layers/40-gantt-planning-routes.css` | Высокий: scroll, sticky, viewport |
| Timeline scale | `src/app.js`, `.timeline-*`, `.time-*` selectors | Высокий: ширины завязаны на расчет времени |
| Rows/lane labels | `.gantt-row`, `.row-label`, `.workcenter-label` | Средний: текст, hierarchy, scroll |
| Operation slots | `.operation-slot`, `.slot-content`, `.slot-working-segment`, `.slot-non-working-segment` | Критический: позиционирование и размеры |
| Dependencies | `.dependencies-layer`, `.dependency-path*` | Критический: SVG/lines, hit areas |
| Transfers | `.is-transfer`, material transfer slots | Высокий: визуальная семантика передачи |
| Modal editor | `render slot editor`, `.slot-form-*`, `.modal` | Средний: overlay + QA picker |

## Запрещено в общем UI-проходе

- Менять DOM слотов и зависимостей.
- Менять absolute positioning, left/top/width/height calculations.
- Менять drag/resize handles.
- Менять `data-gantt-*` attributes.
- Подменять Gantt CSS через общий Table/Panel refactor.

## Разрешено в UI-stabilization pass

- Документировать токены цветов Gantt.
- Выносить семантические цвета в `--mes-ui-gantt-*`.
- Добавлять guardrails, которые обнаруживают пустой canvas, broken scroll, double modal, missing data attributes.
- Нормализовать только текст/цвет/радиус, если это не влияет на расчет геометрии.

## Кандидаты на будущие MES-компоненты

- `GanttBarPlan`
- `GanttBarDistributed`
- `GanttBarFact`
- `GanttTransferFlow`
- `GanttDependencyPath`
- `GanttLaneLabel`
- `GanttSlotEditor`

Сначала нужен отдельный Gantt contract pass с visual snapshots MacBook Air 15 и проверкой canvas/slot bounds.
