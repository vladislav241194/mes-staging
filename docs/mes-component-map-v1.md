# MES Component Map v1

Цель: сделать новые прототипы быстрее и предсказуемее. Этот документ связывает текущие UI-паттерны vanilla-прототипа с контрактными helper-функциями, CSS-классами и будущей миграцией на компонентный стек.

## Главное правило

Новый модуль не должен начинаться с ручной верстки `main/aside/header/panel/table`. Сначала выбирается паттерн из этой карты. Если паттерна не хватает, расширяется UI Core helper, а не создается локальная копия.

## Карта UI-паттернов

| Задача | Использовать сейчас | CSS/атрибут | Что заменяет | Будущий компонент |
| --- | --- | --- | --- | --- |
| Страница модуля | `renderUiAppShell()` | `main.app-shell`, `data-layout-page`, `data-ui-component="AppShell"` | ручной `main` с разной геометрией | `ModuleShell` |
| Аннотация модуля в topbar | shell/topbar contract | `.app-module-annotation` | глобальный поиск, breadcrumbs | `ModuleAnnotation` |
| Внутренний сайдбар | `module-data-sidebar` + `renderUiSidebarItem()` | `.module-data-sidebar`, `.ui-sidebar-list`, `.ui-sidebar-label`, `.ui-sidebar-item`, `data-ui-component="SidebarItem"` | старые `module-entity-*` и ручные sidebar-карточки | `ModuleSidebar`, `SidebarItem` |
| Рабочая область | `module-data-workspace` | `data-layout="page-workspace"` | блок внутри блока с локальным scroll | `Workspace` |
| Заголовок рабочей зоны | `renderUiModuleHeader()` | `.directory-header`, `data-ui-component="ModuleHeader"` | локальные header-реализации | `ModuleHeader` |
| Панель | `renderUiPanel()` + `renderUiPanelHead()` | `.module-panel`, `.ui-panel-head`, `data-ui-component="Panel/PanelHead"` | разнотипные карточки и жирные заголовки | `Panel` |
| Тело/подвал панели | `renderUiPanelBody()` / `renderUiPanelFooter()` | `.ui-panel-body`, `.ui-panel-footer`, `data-ui-component="PanelBody/PanelFooter"` | локальные body/footer с разными отступами | `PanelBody`, `PanelFooter` |
| Поле формы | `renderUiFormField()` | `.ui-form-field`, `data-ui-component="FormField"` | разные label/input/select/textarea по высоте и отступам | `FormField` |
| Empty state | `renderUiEmptyState()` | `.module-preview-empty`, `data-ui-component="EmptyState"` | декоративные KPI-заглушки | `EmptyState` |
| Status/signal | `renderUiStatusToken()` + `getMesStatusView()` | `.ui-status-token`, `.mes-signal`, `data-ui-component="StatusToken"` | локальные цвета и ручные подписи статусов | `StatusToken`, `Signal` |
| Демо-функция | `renderUiDemoBadge()` + demo CSS | `.ui-demo-badge`, `data-ui-component="DemoBadge"` | черные/желтые локальные плашки без контракта | `DemoBadge` |
| Action bar | `renderUiActionBar()` + `renderUiActionButton()` | `.ui-action-bar`, `.primary-button`, `.secondary-button`, `data-ui-component="ActionBar/ActionButton"` | произвольные группы кнопок | `ActionBar`, `Button` |
| Таблица | `renderUiTableWrap()` | `.ui-table-wrap`, `data-layout="table"`, `data-ui-component="TableWrap"` | панель с внутренним вертикальным scroll | `DataTable` |
| Плотная таблица MES | table + локальный `overflow-x:auto` | `overflow-y:hidden`, sticky actions только внутри таблицы | page-wide horizontal overflow | `DenseTable` |
| Dropdown | `renderUiDropdownFrame()` или специализированный live-helper с `data-ui-component="Dropdown"` | `.ui-dropdown`, `.ui-dropdown-menu`, `data-ui-component="Dropdown"` | выпадающие списки внутри скрытых overflow-контейнеров | `Dropdown` |
| Drawer/карточка справа | `renderUiDrawerFrame()` / `renderUiDrawerShell()` | `.detail-drawer`, `.ui-drawer`, `data-ui-component="Drawer"` | floating panel без scroll/resize правил | `Drawer` |
| Modal | `renderUiModalFrame()` / `renderUiModalShell()` | `.modal`, `.ui-modal`, `data-ui-component="Modal"` | широкая модалка вне viewport | `Modal` |
| Доска оперативных задач | board + guarded drag/drop + swimlane + quick-focus + control-gates + detail + coverage-bars + checklist + route-chain + risk + carryover + sheet + fact | `.shift-master-board-*`, `data-shift-board-*` | ручные списки задач без стадий, контекста, риска и остатка | `WorkBoard`, `WorkCard`, `WorkControlGates`, `AttentionStrip`, `WorkItemDetail`, `WorkCoverage`, `WorkReadinessChecklist` |
| Gantt slot | Gantt design system + `renderUiGanttBar()` для прототипов | `.operation-slot`, `.slot-working-segment`, `.slot-non-working-segment`, `.ui-gantt-bar`, `data-ui-component="GanttBar"` | локальные “колбаски” без правил | `GanttSlot`, `GanttBar` |

## Карта бизнес-view-model

| Данные | Использовать сейчас | Не использовать напрямую |
| --- | --- | --- |
| Статус слота Gantt | `getGanttSlotStatusView(slot)` | `slot.status` для UI-подписей/цветов |
| Статус заказ-наряда | `getWorkOrderPlanningStatusValue(route)` | локальные `route.planningStatus === ...` |
| Статус MES | `getMesStatusView(scope, value)` | локальные словари label/color |
| Производственный контекст слота | `getSlotProductionContextId(slot)` | `slot.projectId` / `slot.specificationId` в UI-логике |
| Документ планирования слота | `getSlotPlanningOrderId(slot, fallbackRouteId)` | `slot.batchId` как бизнес-сущность |
| Маршрут слота | `getSlotRouteId(slot, planningState)` | ручной выбор между `routeId`, `batchId`, `routeStepId` |
| Слот в заказ-наряде | `slotMatchesPlanningOrder(slot, planningOrderId)` | прямые сравнения `slot.batchId === ...` |
| Слот в изделии/спецификации | `slotMatchesProductionContext(slot, productionId)` | прямые сравнения `slot.projectId === ...` |
| Предупреждение Ганта: изделие | `getWarningProductionId(warning)` | `warning.projectId` вне fallback-helper |
| Предупреждение Ганта: заказ-наряд | `getWarningPlanningOrderId(warning)` | `warning.batchId` вне fallback-helper |
| Заказ-наряд | `getWorkOrderViewModel(route)` | ручной сбор паспорта/таблицы из route |
| Карточка маршрута | `getRouteCardViewModel(route)` | повторное вычисление route context в каждом блоке |
| Сменный лист | `getShiftWorkOrderViewModel(row)` | локальная сборка документов мастерской |
| Диспетчерская | placeholder-модуль без активных данных | восстановление старых `dispatch-route-card`, `dispatch-kpi-card`, `dispatch-fact-*` |

## Scroll contract

| Ситуация | Правило |
| --- | --- |
| Обычная панель | Не ставить `overflow-y:auto`; панель растягивает страницу вниз |
| Плотная таблица | Разрешен только локальный `overflow-x:auto` внутри table wrap |
| Gantt/timeline | Разрешен локальный горизонтальный scroll внутри диаграммы |
| Sidebar list | Допустим вертикальный scroll только в списке, не в карточках |
| Dropdown/modal | Должны оставаться в viewport; не вкладывать в скрытые overflow-контейнеры |

## Runtime UI markers

Каждый UI Core helper должен ставить `data-ui-component`. Это не декоративный атрибут, а диагностический контракт для QA и будущей миграции на компонентный стек.

Минимальный набор маркеров:

- `AppShell`;
- `ModuleHeader`;
- `Panel`, `PanelHead`, `PanelBody`, `PanelFooter`;
- `ActionButton`, `ActionBar`;
- `SidebarItem`;
- `TableWrap`;
- `FormField`;
- `Dropdown`, `Modal`, `Drawer`;
- `GanttBar`;
- `StatusToken`;
- `DemoBadge`, `DemoMarker`.

Если новый блок нельзя понятно пометить одним из этих маркеров, сначала расширяется UI-kit, а не создается локальная HTML-структура.

Живые ручные контейнеры, которые еще не переведены на helper, не являются исключением из контракта: `section.module-panel` маркируется как `Panel`, а table-wrap/ui-table-wrap маркируется как `TableWrap` и получает `data-scroll-contract="horizontal-only"`. Это позволяет Visual QA и статическим gate-ам отличать управляемый UI-kit слой от случайной локальной верстки.

## Runtime normalizer

Пока проект остается большим vanilla-прототипом, часть живых экранов еще содержит старые, но рабочие HTML-фрагменты. Для них действует временный bridge `applyUiRuntimeContracts()`:

- после каждого `render()` он проставляет `data-ui-component` на видимые формы, обычные `label` с input/select/textarea, кнопки, table-wrap, панели, dropdown, modal, drawer и Gantt-слоты;
- он не должен подменять миграцию helper-ами, но делает старый живой UI диагностируемым;
- Visual QA проверяет `unmarked = 0`, то есть UI-примитивы не должны оставаться без контракта.

Правило для нового кода остается жестким: сначала использовать helper, а runtime normalizer считать страховкой для старого слоя.

## CSS Architecture

Корневой `styles.css` является manifest-файлом. Он не должен содержать обычные правила, кроме `@import` CSS-слоев.

Текущий порядок:

- `styles/layers/00-foundation-base.css`;
- `styles/layers/10-shell-directory-gantt-base.css`;
- `styles/layers/20-technology-calculator-specifications.css`;
- `styles/layers/30-module-shell-ui-foundations.css`;
- `styles/layers/40-gantt-planning-routes.css`;
- `styles/layers/50-nomenclature-routes-directories.css`;
- `styles/layers/60-operational-modules.css`;
- `styles/layers/70-planning-table-and-matrix.css`;
- `styles/layers/80-visual-system-ui-states.css`;
- `styles/layers/90-shift-master-board.css`;
- `styles/layers/99-legacy-overrides-tail.css`;
- `styles/mes-ui-core.css` отдельным link после manifest.

Новые shared-компоненты добавляются в `styles/mes-ui-core.css`. Новые модульные правила добавляются в соответствующий `styles/layers/*` файл. Если нужного слоя нет, сначала создается слой и добавляется в manifest/build/QA, а не дописывается случайный CSS в конец tail.

Если правило начинает обслуживать несколько модулей, оно должно мигрировать из модульного слоя в `styles/mes-ui-core.css`. Shared UI contract не должен жить в позднем модульном файле с `!important`: это возвращает старую модель override-ов и замедляет прототипирование.

`scripts/build.mjs` версионирует не только `styles.css`, но и его `@import` CSS layers. `qa:css`, `qa:legacy` и `qa:ui` должны читать весь CSS-граф, иначе проверки считаются неполными.

`qa:css` считает CSS-долг с учетом контекста `@media` / `@supports`. Одинаковые правила в разных breakpoint-ах не считаются exact duplicate. Exact duplicate rule groups должны оставаться равными 0; новый CSS не должен увеличивать same-context duplicate selector groups.

Текущий CSS gate дополнительно фиксирует broad `!important` layout rules. После UI stabilization pass общий бюджет broad `!important` layout rules равен 0; новые shared sidebar/table/page правила не добавляются через аварийные флаги, а оформляются точными контрактами или переносятся в `styles/mes-ui-core.css`.

## Legacy budget

`npm run qa:legacy` теперь фиксирует текущий максимум legacy debt. Новая работа может уменьшать счетчики, но не должна увеличивать:

- `projectId`;
- `batchId`;
- `planning-v2` в runtime/CSS должен оставаться равным 0; текущие заказ-наряды используют `planning-order-*`;
- `project-*` UI class names в визуальном слое должны оставаться равными 0, включая старые `project-main/status/readiness` и `director-project-*`; использовать `specification-*`, `production-*`, `order-*`, `route-*`;
- `planning-batch` должен оставаться равным 0;
- `planning-order-batch-row/actions/grid` должен оставаться равным 0; в текущих заказ-нарядах живет только контейнер `planning-order-batch-editor` для сводки размещения;
- `mini-action` / `assistant-command` должны оставаться равными 0; помощник Ганта использует стандартный `secondary-button`;
- старые `dispatch-*` рабочей доски должны оставаться равными 0; текущая Диспетчерская является placeholder-модулем;
- `planningDemo` / `planningManualDemo`;
- `shiftMaster` / `shiftMasterContext` / `shiftMasterV2` должны оставаться только URL/module alias на `shiftMasterBoard`;
- `shift-master-v2` CSS/классы должны оставаться равными 0;
- `shift-method-*` runtime/CSS слой старой Мастерской должен оставаться равным 0;
- `rkd` / РКД должен оставаться удаленным из runtime/CSS/module alias;
- удаленный `module-entity-*` sidebar layer;
- удаленные `reports/debug` CSS-селекторы должны оставаться равными 0.
- standalone `bomLists` layout (`data-layout-page="bomLists"`, `bom-list-app-shell`) должен оставаться равным 0: платы/BOM являются вкладкой Номенклатуры, а не отдельным экраном.
- старый `dashboard-*` layout должен оставаться равным 0: обзорные/аналитические экраны собираются через текущий `renderUiAppShell()` и `module-panel`.
- standalone shell-классы `calculator-app-shell`, `project-app-shell`, `specification-app-shell` должны оставаться равными 0: это старые оболочки экранов, а не live-компоненты.

Если счетчик вырос, это не всегда означает ошибку бизнес-логики, но означает, что новая реализация снова поехала мимо текущего UI/flow контракта.
