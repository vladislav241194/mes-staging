# UI Runtime Contract

Цель контракта: новый интерфейс MES должен собираться через runtime helpers и `data-ui-component`, а не через ручные HTML/CSS-паттерны. Это не редизайн, а слой управляемости.

## Источники правды

- Runtime helpers: `src/app.js`.
- Реестр компонентов и QA-метаданные: `src/ui_runtime_contracts.js`.
- Базовый visual contract: `styles/mes-ui-core.css`.
- Исторический compatibility tail: `styles/layers/99-legacy-overrides-tail.css`.

## Обязательные компоненты

| Компонент | Helper | Marker | Назначение |
|---|---|---|---|
| AppShell | `renderUiAppShell` | `data-layout="app-shell"` | Глобальный shell, sidebar, topbar, modal layer |
| ModulePage | `renderUiModulePage` | `data-ui-component="ModulePage"` | Единая сетка страницы модуля |
| ModuleSidebar | `renderUiModuleSidebar` | `data-ui-component="ModuleSidebar"` | Внутренний sidebar модуля |
| ModuleHeader | `renderUiModuleHeader` | `data-ui-component="ModuleHeader"` | Заголовок рабочей области |
| Panel | `renderUiPanel` | `data-ui-component="Panel"` | Базовый блок интерфейса |
| PanelHead/Body/Footer | `renderUiPanelHead/Body/Footer` | `PanelHead`, `PanelBody`, `PanelFooter` | Управляемые inset/gap/overflow внутри панелей |
| ActionButton | `renderUiActionButton` | `data-ui-component="ActionButton"` | Все обычные, primary, icon, table, danger, ghost кнопки |
| ActionBar | `renderUiActionBar` | `data-ui-component="ActionBar"` | Группа действий |
| TableWrap | `renderUiTableWrap` | `data-ui-component="TableWrap"` | Табличный scroll и table tokens |
| FormField | `renderUiFormField` | `data-ui-component="FormField"` | Label + input/select/textarea |
| Dropdown | `renderUiDropdownFrame` | `data-ui-component="Dropdown"` | Выпадающий слой |
| Modal | `renderUiModalFrame/Shell` | `data-ui-component="Modal"` | Модальный слой |
| Drawer | `renderUiDrawerFrame/Shell` | `data-ui-component="Drawer"` | Выдвижная панель |
| StatusToken | `renderUiStatusToken` | `data-ui-component="StatusToken"` | Статусы и сигналы |
| GanttBar | `renderUiGanttBar` | `data-ui-component="GanttBar"` | Эталонная демо-колбаска; живой Gantt пока special runtime |

## ActionButton tone contract

`renderUiActionButton` поддерживает:

- `primary`: основной command.
- `secondary`: обычный command по умолчанию.
- `icon`: квадратная icon-кнопка.
- `table-icon`: компактное действие внутри таблицы.
- `ghost`: тихая кнопка без фона.
- `danger`: опасное действие.
- `compact`: уменьшенная высота.
- `touch`: увеличенная высота для планшета.

Новые кнопки не должны собираться через голые `button`, `primary-button` или `secondary-button` без `ui-action-button` и `data-ui-component="ActionButton"`.

## Compatibility classes

`UI_RUNTIME_COMPATIBILITY_CSS_ONLY_CLASSES` в `src/ui_runtime_contracts.js` - это не разрешение писать новые старые классы. Это список текущего CSS-долга, который:

1. уже существовал до прохода;
2. не найден напрямую в `src/app.js`;
3. должен быть мигрирован или удален отдельными безопасными проходами;
4. защищен так, что новые CSS-only классы не смогут появиться незаметно.

## Guardrails

- `npm run qa:ui` должен падать на новом незарегистрированном runtime/global CSS-only классе.
- `npm run qa:css` должен падать, если `styles.css` перестанет быть manifest-only.
- `scripts/ui-raw-token-audit.mjs` должен показывать baseline прямых visual values, пока без fail-budget.
- `data-ui-component` обязателен для новых helpers.
- Старый класс допустим только как compatibility companion, если рядом есть новый `ui-*` marker.

## Current compatibility baseline

После follow-up прохода:

- CSS-only runtime classes: 16.
- Compatibility CSS-only classes: 16.
- Unexpected runtime/global CSS-only classes: 0.
- Prefix `smt-` удален из runtime namespace.

## Phase 6 Runtime Extraction

Shared UI helpers are no longer owned by `src/app.js`:

- pure HTML/class/tone helpers: `src/ui/html.js`;
- render helpers: `src/ui/components.js`;
- runtime coverage contracts: `src/ui/contracts/runtime-contracts.js`;
- hardening plan contracts: `src/ui/contracts/hardening-plan-contracts.js`.

`src/ui_runtime_contracts.js` remains the compatibility entrypoint for existing imports. New shared helpers must be added to `src/ui/*` and covered by `npm run qa:ui:helpers`.
