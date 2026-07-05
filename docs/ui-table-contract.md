# UI Table And TreeTable Contract

Цель: таблицы MES должны иметь общий TableWrap, читаемую плотность и управляемую иерархию без локального зоопарка header/hover/selected/tree.

## Runtime contract

- Wrapper: `renderUiTableWrap`.
- Marker: `data-ui-component="TableWrap"`.
- Layout marker: `data-layout="table"`.
- CSS source: `styles/mes-ui-core.css`.

## CSS contract selectors

Новые и мигрируемые таблицы должны постепенно сходиться к этим системным классам:

- `.ui-table`
- `.ui-table-header`
- `.ui-table-row`
- `.ui-table-row.is-selected`
- `.ui-table-cell`
- `.ui-table-actions`
- `.ui-tree-cell`
- `.ui-tree-toggle`
- `.ui-table-empty`

Существующие таблицы пока могут оставаться на модульных классах, если они находятся внутри `TableWrap` и используют compatibility-переменные.

## TableWrap tokens

`TableWrap` задает compatibility переменные:

- `--ui-table-row-height`
- `--ui-table-row-height-compact`
- `--ui-table-head-bg`
- `--ui-table-head-text`
- `--ui-table-row-bg`
- `--ui-table-row-hover-bg`
- `--ui-table-row-selected-bg`
- `--ui-table-row-border`
- `--ui-table-tree-line`
- `--ui-table-tree-dot`
- `--ui-table-tree-dot-active`
- `--ui-table-tree-indent`
- `--ui-table-action-size`

Источник значений: `--mes-ui-table-*`.

## Table rules

1. Вертикальный scroll внутри таблицы запрещен без отдельного основания; scroll должен быть на page/content level.
2. Горизонтальный scroll допустим только у `TableWrap`.
3. Header, hover, selected и empty state должны брать цвета из токенов.
4. Иконки действий внутри таблиц должны идти через `renderUiActionButton({ tone: "table-icon" })` или совместимый `.table-icon-button.ui-action-button`.
5. Tree lines/dots должны брать `--ui-table-tree-*`.

## Живые сложные таблицы

| Модуль | Таблица | Риск |
|---|---|---|
| `shiftWorkOrders` | Журнал СЗН tree table | Высокий: иерархия, раскрытие, выбранная строка, report summary |
| `planning` | Заказ-наряды / маршрутные строки | Высокий: трудозатраты, inline controls, detail panel |
| `products` | Спецификации | Средний: sidebar + dense rows |
| `routes` | Маршрутные карты | Средний: дерево/структура и печатные формы |
| `productionStructureMatrix` | Права/матрица | Высокий: широкая таблица, много полей |
| `timesheet` | Табель | Высокий: календарная сетка, compact density |

## Compatibility coverage

В `styles/mes-ui-core.css` общий TableWrap contract уже применяется к таким историческим таблицам:

- `.directory-table`
- `.planning-order-table`
- `.shift-work-orders-table`
- `.route-object-table`
- `.speki-structure-table`
- `.nomenclature-table`
- `.timesheet-table`
- `.production-structure-table`
- `.supply-table`
- `.bom-import-table`
- `.ui-table`

Это не означает, что все таблицы уже полностью мигрированы. Это означает, что базовая ширина, scroll, header, row density и tree variables управляются из одного слоя, а не из каждой страницы отдельно.

## Что не делать

- Не переносить таблицу на новый DOM ради визуального совпадения.
- Не менять business data attributes: `data-planning-order-row`, `data-route-step-row`, `data-shift-work-order-row`, `data-shift-work-order-tree-toggle`.
- Не прятать overflow за счет `overflow: hidden` на панелях.
- Не добавлять новые локальные selected/hover цвета без токена.
