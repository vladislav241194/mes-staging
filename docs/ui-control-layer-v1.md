# UI Control Layer v1

Цель слоя: сделать интерфейс управляемым через один контракт, а не через точечные правки по модулям.

## Где менять глобальные правила

| Что нужно изменить | Главная точка правки |
| --- | --- |
| Ширина внутреннего сайдбара | `--mes-ui-module-sidebar-width` в `styles/mes-ui-core.css` |
| Отступ страницы модуля | `--mes-ui-density-page` |
| Расстояние между блоками | `--mes-ui-density-gap` |
| Отступы заголовка панели | `--mes-ui-panel-head-padding` |
| Отступы тела панели | `--mes-ui-panel-body-padding` |
| Высота обычных кнопок | `--mes-ui-control-height` |
| Размер иконок-кнопок | `--mes-ui-icon-button-size` |
| Размер кнопок в таблицах | `--mes-ui-table-icon-button-size` |
| Высота input/select/textarea | `--mes-ui-form-control-height` |
| Минимальная высота строки таблицы | `--mes-ui-table-row-height` |
| Скругления панелей/модалок/кнопок | `--mes-ui-radius-*` |
| Базовые цвета UI | `--mes-ui-bg`, `--mes-ui-surface`, `--mes-ui-line`, `--mes-ui-text`, `--mes-ui-primary` |
| Фон рабочих страниц модулей | `--mes-ui-module-page-background`, `--mes-ui-module-page-background-size` |

## Контракт компонентов

Единый реестр находится в `src/ui_runtime_contracts.js`.

Там задаются:

- какие модули считаются hard-runtime;
- какие компоненты существуют (`Panel`, `ActionButton`, `FormField`, `TableWrap`, `Modal`, `Drawer`, `Dropdown`, `GanttBar`);
- какие helper-функции должны их создавать;
- какие селекторы runtime-normalizer обязан маркировать через `data-ui-component`;
- какие CSS-классы должны ходить парой, например `primary-button` + `ui-action-button`.

## Правило для новых модулей

Новый модуль сначала собирается из helper-ов:

- `renderUiModulePage()`;
- `renderUiModuleSidebar()`;
- `renderUiModuleHeader()`;
- `renderUiPanel()` + `renderUiPanelBody()`;
- `renderUiActionButton()`;
- `renderUiFormField()`;
- `renderUiTableWrap()`;
- `renderUiModalFrame()` / `renderUiModalShell()`;
- `renderUiDrawerFrame()` / `renderUiDrawerShell()`.

Если helper-а не хватает, расширяется UI contract, а не создается локальная копия HTML/CSS.

## QA-защита

`npm run qa:ui` проверяет, что:

- исходный 11-шаговый план UI-стабилизации имеет исполняемое покрытие через `scripts/ui-hardening-plan-qa.mjs`;
- все компоненты из `src/ui_runtime_contracts.js` имеют helper/маркер/CSS-контракт;
- runtime-normalizer берет селекторы из общего контракта;
- старые классы кнопок, форм и таблиц не живут без UI-kit companion-класса;
- CSS-only классы не появляются без отражения в runtime;
- hard-runtime модули не возвращаются к legacy-оболочке.

`npm run qa:css` дополнительно контролирует CSS-долг: root `styles.css` остается manifest-файлом, broad `!important` не возвращаются, а exact duplicate rules не растут.

## Как выполнять будущие UI-запросы

Если пользователь просит “поправь сайдбар/кнопки/панели/поля/таблицы во всем проекте”, сначала ищем соответствующий токен или контракт в `styles/mes-ui-core.css` и `src/ui_runtime_contracts.js`.

Точечная модульная правка допустима только если поведение действительно уникально для модуля. Если проблема повторяется хотя бы в двух местах, правило переносится в `UI Control Surface v1`.

## Stop condition для больших UI-задач

Нельзя считать большую задачу по стабилизации UI выполненной только потому, что исправлен один видимый маркер. Перед отчетом должны пройти:

- `npm run qa:ui`;
- `npm run qa:css`;
- `npm run qa:module-smoke`;
- `npm run build`;
- `git diff --check`.

Отдельно важно: `scripts/ui-hardening-plan-qa.mjs` проверяет не внешний вид, а факт покрытия всех 11 этапов исходного плана: инвентаризация, registry, кнопки, сайдбар/header, panel/spacing, table, form, modal/drawer/dropdown, миграция модулей, QA-gates и финальная проверка.

Фактический статус закрытия каждого этапа ведется в `docs/ui-hardening-plan-status-v1.md`. Этот документ не является источником правды сам по себе: его статус подтверждается только прохождением `scripts/ui-hardening-plan-qa.mjs`.
