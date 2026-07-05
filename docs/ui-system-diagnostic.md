# UI/UX Architecture Diagnostic

Дата анализа: 2026-07-05.

Задача отчета: описать текущее состояние UI/UX-архитектуры и дизайн-системы проекта без редизайна, исправления стилей и изменения бизнес-логики. Анализ выполнен по исходному коду, CSS-графу и QA-скриптам.

## 1. Общая информация о проекте

### Frontend stack

Проект является vanilla JS SPA-прототипом без React/Vue/Svelte:

- runtime приложения: `src/app.js`;
- состояние и доменная модель: `src/data.js`, `src/mes_contracts.js`, `src/mes_org_model.js`, `src/production_structure_matrix_data.js`, `src/production_structure_service.js`, `src/types.js`, `src/validation.js`;
- статический сервер/сборка: `server.js`, `scripts/build.mjs`;
- роутинг: query-параметр `?module=...`, переключение внутри `render()` в `src/app.js:6434`.

`package.json` не содержит внешних UI-зависимостей. Скрипты проекта в основном запускают Node QA/build-команды: `npm run build`, `npm run qa:ui`, `npm run qa:css`, `npm run qa:architecture`, `npm run qa:functional`.

### UI-библиотеки

Внешних UI-библиотек не найдено:

- `shadcn/ui`: не используется;
- `Radix UI`: не используется;
- `Tailwind`: не используется;
- CSS Modules: не используются;
- JSX/React `className`: не используется, поиск дал `0`;
- обычный CSS: основной механизм стилизации;
- inline styles: используются активно для геометрии, прогрессов, дерева, Gantt, Supply и некоторых визуальных прототипов.

Иконки генерируются внутренним helper-ом `icon(...)` в `src/app.js`, а не внешней библиотекой компонентов.

### Основные entrypoint-стили

Основной CSS entrypoint:

- `styles.css`.

Фактически `styles.css` импортирует слой за слоем:

- `styles/layers/00-foundation-base.css`;
- `styles/layers/10-shell-directory-gantt-base.css`;
- `styles/layers/20-technology-specifications.css`;
- `styles/layers/30-module-shell-ui-foundations.css`;
- `styles/layers/40-gantt-planning-routes.css`;
- `styles/layers/50-nomenclature-routes-directories.css`;
- `styles/layers/60-operational-modules.css`;
- `styles/layers/70-planning-table-and-matrix.css`;
- `styles/layers/80-visual-system-ui-states.css`;
- `styles/layers/90-shift-master-board.css`;
- `styles/layers/99-legacy-overrides-tail.css`.

Отдельный UI-core слой:

- `styles/mes-ui-core.css`.

Важный симптом: `styles.css` задуман как manifest-only файл, но сейчас содержит реальные правила для topbar (`styles.css:14-42`). `scripts/css-layer-audit.mjs` из-за этого падает.

### Конфиги дизайна

Классических конфигов дизайн-системы нет:

- `tailwind.config.*`: не найден;
- `components.json`: не найден;
- `globals.css`: не найден;
- theme files уровня Tailwind/shadcn: не найдены.

Роль дизайн-конфигов частично выполняют:

- `styles/mes-ui-core.css:1-63` - UI tokens и базовые semantic colors;
- `src/ui_runtime_contracts.js:1-40` - список модулей с hard/special UI runtime;
- `src/ui_runtime_contracts.js:129-268` - реестр UI runtime компонентов;
- `src/ui_runtime_contracts.js:270-316` - список токенов UI runtime;
- `src/mes_contracts.js:44-56` - MES signals/statuses;
- `workflow-preset.json` - сохраненный рабочий пресет.

### Размер и плотность UI-кода

По локальному анализу:

- `src/app.js`: 39 221 строк;
- весь CSS-граф, включая layers и UI-core: около 29 000 строк;
- `src/ui_runtime_contracts.js`: 417 строк;
- `src/mes_contracts.js`: 743 строки.

CSS-аудит показал:

- `5481` CSS rules;
- `457` duplicate selector groups;
- largest duplicate selector group: `12`;
- `3150` вхождений `!important` по CSS-графу при прямом подсчете;
- `505` уникальных CSS custom properties;
- `277` уникальных hex-цветов;
- `117` media queries.

Это означает, что проект уже имеет слой UI-kit, но фактическая система стилей остается большой cascade-driven системой с локальными переопределениями.

## 2. Карта экранов

Все основные страницы переключаются через `?module=...`. Список модулей определяется в `src/app.js:16276-16298`, группы меню - в `src/app.js:16310-16317`, порядок доменного потока - в `src/mes_contracts.js:274-295`.

| Route | Название | Назначение | UI-нагрузка |
|---|---|---|---|
| `gantt` | Планирование | Диаграмма нагрузки, календарное размещение операций, зависимости, переносы, статусы | Gantt, filters, toolbar, modals, drawer, dense rows |
| `planning` | Заказ-наряды | Плановый документ, трудозатраты, состав заказа, подготовка передачи в Gantt | tree table, forms, filters, detail panels |
| `dispatch` | Диспетчерская | Заглушка/операционный placeholder | panel placeholder |
| `shiftMasterBoard` | Мастерская | Доска мастера, распределение задач, исполнители, сменные листы, факт | cards, board, forms, load bars, modal |
| `authSessionPrototype` | Рабочий стол | Рабочее место исполнителя: задания, инструкции, ввод факта/брака с планшета | tablet UI, numeric input, task cards, modals |
| `shiftWorkOrders` | Журнал СЗН | Read-only дерево сменных заказ-нарядов, печать, report, фото | tree table, detail panel, print modals, image modal |
| `matrix` | Матрица | Read-only матрица загрузки по дням | matrix/table cards |
| `routes` | Маршрутная карта | Технологический маршрут, операции, печатная форма | tree table, forms, modals, print preview |
| `products` | Спецификации | Структура изделия, BOM, вложенность | sidebar, tree table, forms |
| `nomenclature` | Номенклатура | Мастер-данные изделий/позиций | table, filters, sidebar |
| `productionStructureMatrix` | Права | Производственная структура/права/матрица настройки | very wide table, forms |
| `employees` | Структура | Оргструктура и сотрудники | hierarchy chart, cards |
| `timesheet` | Табель | Графики сотрудников, смены, отпуска, больничные | large calendar table, modal editor |
| `roles` | Роли | Настройка ролей, доступов, стартовых модулей | forms, permissions table |
| `directories` | Справочники | Системные справочники | generic tables, filters, modals |
| `visualSystem` | UI-состояния | Витрина UI-примеров/состояний | documentation panels, samples |
| `authPrototype` | Авторизация | PIN/выбор отдела/участка/сотрудника | tablet cards, PIN pad |
| `planningTable` | План-таблица | Альтернативная таблица планирования | tables, cards |
| `supply` | Снабжение | Прототип снабжения и сроков | Gantt-like timeline, register table |
| `shopMap` | Цех производства | Карта цеха/виджеты | floor map, cards, modal |

Самые сложные визуально:

- `gantt`: абсолютная геометрия, timeline, rows, scroll, SVG dependencies, resize/drag;
- `planning`: дерево состава + трудозатраты + inline controls;
- `shiftWorkOrders`: дерево документов + detail panel + print/report/photo;
- `shiftMasterBoard`: рабочая карточка + board + доступные исполнители + распределение;
- `timesheet`: широкая календарная таблица;
- `productionStructureMatrix`: очень широкая матрица с иерархией и множеством полей.

Страницы с таблицами:

- `planning`, `shiftWorkOrders`, `routes`, `products`, `nomenclature`, `timesheet`, `roles`, `directories`, `productionStructureMatrix`, `planningTable`, `supply`.

Страницы с Gantt/timeline:

- `gantt`, частично `supply`, UI-примеры в `visualSystem`.

Страницы с drawer/modal:

- `gantt`, `routes`, `shiftWorkOrders`, `shiftMasterBoard`, `authSessionPrototype`, `timesheet`, `directories`, `shopMap`, `planning`.

## 3. Карта компонентов

### Папки с компонентами

Отдельной компонентной структуры нет. В проекте нет:

- `src/components/ui`;
- `src/components/mes`;
- `src/pages`;
- `src/layouts`.

Фактические компоненты реализованы как функции в одном файле:

- `src/app.js`.

CSS для этих компонентов размазан по:

- `styles/mes-ui-core.css`;
- `styles/layers/*.css`;
- особенно `styles/layers/99-legacy-overrides-tail.css`.

### Базовые UI-компоненты

Формальный UI runtime registry есть в `src/ui_runtime_contracts.js:129-268`:

- `AppShell`;
- `ModulePage`;
- `ModuleSidebar`;
- `ModuleWorkspace`;
- `ModuleContent`;
- `ModuleHeader`;
- `Panel`;
- `PanelHead`;
- `PanelBody`;
- `PanelFooter`;
- `ActionButton`;
- `ActionBar`;
- `SidebarItem`;
- `TableWrap`;
- `FormField`;
- `Dropdown`;
- `Modal`;
- `Drawer`;
- `GanttBar`;
- `StatusToken`;
- `DemoBadge`;
- `DemoMarker`;
- `EmptyState`.

Реальные helper-ы находятся в `src/app.js:22182-22434`:

- `renderUiPanelHead`;
- `renderUiPanel`;
- `renderUiPanelBody`;
- `renderUiPanelFooter`;
- `renderUiEmptyState`;
- `renderUiStatusToken`;
- `renderUiActionButton`;
- `renderUiSidebarItem`;
- `renderUiModuleSidebar`;
- `renderUiModulePage`;
- `renderUiModuleHeader`;
- `renderUiTableWrap`;
- `renderUiFormField`;
- `renderUiDropdownFrame`;
- `renderUiModalFrame`;
- `renderUiModalShell`;
- `renderUiDrawerFrame`;
- `renderUiDrawerShell`;
- `renderUiGanttBar`.

### Layout-компоненты

Layout helpers:

- `renderUiAppShell` в `src/app.js:6399-6410`;
- `renderModuleMenu` в `src/app.js:16424-16480`;
- `renderAppTopbar` в `src/app.js:16536-16571`;
- `renderUiModulePage` в `src/app.js:22316-22337`;
- `renderUiModuleSidebar` в `src/app.js:22294-22314`;
- `renderUiModuleHeader` в `src/app.js:22340-22351`.

Проблема: Gantt использует общий `AppShell`, но внутри имеет отдельный custom runtime: `renderToolbar`, `renderTimeline`, `renderRow`, `renderSlot`, `renderSlotDrawer`, `renderEditorModal` и др. Это special runtime, а не обычный `ModulePage`.

### Бизнес-компоненты MES

Бизнес-компоненты существуют как render-функции:

- `renderPlanningWorkbenchPage`, `renderPlanningOrderStructureTable`, `renderPlanningOrderStepRow` (`src/app.js:7020`, `7979`, `8112`);
- `renderShiftMasterBoardPage`, `renderShiftMasterBoardSheetModal` (`src/app.js:10919`, `11477`);
- `renderShiftWorkOrdersPage`, `renderShiftWorkOrdersTable`, print/report modals (`src/app.js:11772`, `12322`, `12213`, `12245`);
- `renderTimesheetPage`, `renderTimesheetEditorModal` (`src/app.js:15213`, `15100`);
- `renderRoutesPage`, `renderRouteObjectRows`, print preview (`src/app.js:26763`, `28073`, `27364`);
- `renderSpekiPage`, `renderSpekiStructureTable` (`src/app.js:21488`, `21723`);
- `renderNomenclaturePage`, `renderNomenclatureTable` (`src/app.js:23753`, `23842`);
- `renderDirectoryPage`, `renderDirectoryTable`, directory modals (`src/app.js:28358`, `28881`, `29595`, `29636`);
- `renderToolbar`, `renderTimeline`, `renderRow`, `renderSlot`, `renderGanttDependencyEditControls`, `renderEditorModal` (`src/app.js:33657`, `33889`, `33969`, `35239`, `35753`, `37156`).

### Одноразовые локальные компоненты

Много локальных фрагментов имеют собственные классы и стили:

- `planning-order-labor-summary`;
- `planning-manual-inline-labor`;
- `shift-work-orders-detail-volume`;
- `shift-work-orders-transfer`;
- `auth-session-fact-panel`;
- `auth-prototype-person-tile`;
- `timesheet-day-button`;
- `production-structure-control`;
- `dense-inline-select`;
- `directory-column-filter`;
- `route-object-table`;
- `speki-structure-table`.

Они не вынесены в отдельные компоненты, из-за чего похожие визуальные решения переизобретаются локально.

### Дублирующие реализации

Кнопки:

- старые `.primary-button`, `.secondary-button`, `.icon-button`, `.table-icon-button` в `styles/layers/10-shell-directory-gantt-base.css:184-220`;
- runtime-контракт `.ui-action-button` в `styles/mes-ui-core.css:770-813`;
- дополнительные responsive/button patches в `styles/layers/70-planning-table-and-matrix.css:20-37` и `styles/layers/80-visual-system-ui-states.css:3061-3073`.

Статусы/бейджи:

- `.status-pill`, `.deadline-badge` в `styles/layers/10-shell-directory-gantt-base.css:220-241`, `748-769`;
- `.mes-signal` в `styles/layers/80-visual-system-ui-states.css:3089-3142`;
- `renderUiStatusToken` в `src/app.js:22227-22230`;
- локальные `supply-status-pill`, `planning-order-state-token`, `shift-work-orders-group-status`.

Таблицы:

- generic `.directory-table`;
- module-specific `.planning-order-table`;
- `.shift-work-orders-table`;
- `.timesheet-table`;
- `.production-structure-table`;
- `.nomenclature-table`;
- `.route-object-table`;
- `.speki-structure-table`;
- `.supply-table`;
- `.bom-import-table`.

Модалки/drawers:

- runtime helper `renderUiModalFrame`;
- `renderUiModalShell`;
- legacy `.modal-header`, `.modal-footer`;
- Gantt slot drawer `.slot-drawer`;
- `detail-drawer`;
- print preview modals in routes and shift work orders.

## 4. Анализ Tailwind и стилей

### Tailwind/className

Tailwind не используется. Поиск по проекту дал:

- `className=`: `0`;
- `rounded-[...]`: `0`;
- `w-[...]`: `0`;
- `h-[...]`: `0`;
- `text-[...]`: `0`;
- `shadow-[...]`: `0`;
- `@tailwind`: `0`;
- `radix`: `0`;
- `shadcn`: `0`.

То есть проблема не в Tailwind utility soup, а в string-template HTML + обычном CSS с большим количеством селекторов и переопределений.

### Длинные локальные class-строки

Вместо JSX `className` используются длинные `class="..."` внутри template strings. Примеры:

- `src/app.js:7990-7992`: таблица Заказ-нарядов одновременно получает `speki-structure-table-wrap`, `route-object-table-wrap`, `planning-order-table-wrap`, `ui-table-wrap`, `directory-table`, `speki-structure-table`, `route-object-table`, `planning-order-table`;
- `src/app.js:8072-8075`: строка объекта заказа сочетает `route-object-row`, `planning-order-object-row`, `is-selected`, `is-route-main`, `is-route-orphan`;
- `src/app.js:8144-8148`: строка операции сочетает `route-step-compact-row`, `planning-order-step-row`, состояние tone и inline `--speki-level`;
- `src/app.js:35239-35354`: Gantt slot формируется с большим набором state-классов и inline geometry.

Такой подход делает DOM зависимым от нескольких CSS-слоев одновременно. Один и тот же элемент может попадать под generic, module-specific и legacy override правила.

### Inline styles

В `src/app.js` найдено `97` `style="..."` и `14` DOM style mutations.

Типовые категории:

- геометрия Gantt: `src/app.js:33892-33909`, `33985-33987`, `35285-35354`, `35693`;
- дерево/иерархия: `src/app.js:8075`, `8148`, `12374`, `12410`, `12443`, `21610`, `21840`;
- progress/load bars: `src/app.js:11256`, `11369`, `11969-11970`, `23637`;
- Supply timeline: `src/app.js:13288-13485`;
- popover positioning: `src/app.js:29897-29900`;
- shop map: `src/app.js:18874`, `30221-30222`;
- Gantt dependency clipping: `src/app.js:33645-33649`.

Inline styles оправданы для вычисляемой геометрии, но сейчас они также используются как быстрый способ задавать визуальные состояния. Это усложняет глобальную нормализацию.

### Глобальные CSS-правила с конфликтным потенциалом

Главные конфликтные зоны:

- `.directory-table` повторяется в `10-shell-directory-gantt-base.css`, `20-technology-specifications.css`, `30-module-shell-ui-foundations.css`, `60-operational-modules.css`, `70-planning-table-and-matrix.css`;
- `.gantt-shell`, `.operation-slot`, `.timeline-cell`, `.topbar` стилизуются в `10`, `20`, `40`, `50`, `60`, `80`, `90`;
- `.app-topbar` стилизуется в `50`, `60`, `90`, `mes-ui-core.css`, `99`, а также сейчас в `styles.css`;
- `.primary-button`, `.secondary-button`, `.icon-button`, `.table-icon-button` одновременно являются legacy-классами и частью `ActionButton` runtime contract.

`scripts/css-layer-audit.mjs` сообщает:

- duplicate selector groups: `457`;
- exact duplicate rule groups: `2`;
- `styles.css` нарушает manifest-only правило;
- точные дубли: `main.app-shell[data-layout="app-shell"] > .app-topbar .app-topbar-title` и `.app-module-annotation` в `styles.css` и `styles/layers/99-legacy-overrides-tail.css`.

### Повторяющиеся наборы классов

Повторяются:

- `module-panel ui-panel`;
- `directory-sidebar module-data-sidebar ui-module-sidebar`;
- `directory-workspace module-data-workspace ui-module-workspace`;
- `module-data-content ui-module-content`;
- `directory-table ... ui-table-wrap`;
- `primary-button/secondary-button/icon-button + ui-action-button`.

Часть повторов полезна как compatibility layer, но она же позволяет локальным старым стилям продолжать влиять на новые блоки.

### Шкала отступов, радиусов, типографики

Формальная шкала есть в `styles/mes-ui-core.css:31-62`:

- control height: `36px`;
- icon button: `36px`;
- table icon button: `30px`;
- form control: `34px`;
- table row height: `40px`;
- radius: `4px`, `5px`, `6px`, `8px`, pill;
- font sizes: `11px`, `13px`, `15px`;
- line heights: `15px`, `18px`, `20px`.

Но фактический CSS использует много прямых значений:

- `202` уникальных `px`-значения;
- `277` hex-цветов;
- локальные font-weight вроде `520`, `560`, `620`, `680`, `720`, `760`, `820`, `860`.

Итог: шкала существует, но не является обязательной.

## 5. Анализ дизайн-токенов

### Semantic tokens

Базовые токены есть:

- `--mes-ui-bg`;
- `--mes-ui-surface`;
- `--mes-ui-surface-soft`;
- `--mes-ui-line`;
- `--mes-ui-text`;
- `--mes-ui-muted`;
- `--mes-ui-primary`;
- `--mes-ui-sidebar-bg`;
- `--mes-ui-success`, `--mes-ui-warning`, `--mes-ui-danger`;
- radius/spacing/type tokens.

Они определены в `styles/mes-ui-core.css:1-63`.

### Прямые цвета

Прямые цвета используются массово. Топ hex-цветов по частоте:

- `#ffffff`: 188;
- `#64748b`: 165;
- `#0f172a`: 109;
- `#f8fafc`: 104;
- `#2563eb`: 78;
- `#475569`: 49;
- `#d7e0ea`: 43;
- `#cbd5e1`: 43;
- `#eff6ff`: 38;
- `#e2e8f0`: 37.

Примеры прямых цветов:

- Gantt slot variables: `styles/layers/40-gantt-planning-routes.css:183-187`;
- material transfer: `styles/layers/40-gantt-planning-routes.css:200-204`;
- dependency paths: `styles/layers/40-gantt-planning-routes.css:411-424`;
- old route table backgrounds: `styles/layers/40-gantt-planning-routes.css:795-800`;
- Gantt duplicate layer: `styles/layers/50-nomenclature-routes-directories.css:2239-2280`.

### Статусы

Доменные статусы заданы в `src/mes_contracts.js:56-120` и далее:

- `ganttSlot`: `planned`, `in_progress`, `paused`, `completed`, `overdue`, `problem`;
- `workOrderPlanning`: `queued`, `partial`, `scheduled`, `canceled`;
- `shiftAssignment`: `draft`, `issued`;
- `dispatchFact`: `not_reported`, `partial`, `accepted`, `problem`.

Сигналы заданы в `src/mes_contracts.js:44-54`:

- `neutral`, `ready`, `active`, `warning`, `blocked`, `problem`, `manual`, `calculated`, `demo`.

Параллельно в `src/app.js:195-203` есть UI signal tones: `neutral`, `ready`, `risk`, `warning`, `blocked`, `manual`, `test`, `calc`, `systemError`. Это создает две близкие, но не полностью одинаковые системы.

### Success/warning/error/info/neutral

Единая идея есть в `.mes-signal`:

- `styles/layers/80-visual-system-ui-states.css:3089-3142`.

Но параллельно живут:

- `.status-pill.*`;
- `.deadline-badge.*`;
- `.supply-status-pill.*`;
- локальные state-token классы.

Это значит, что `success/warning/error/info/neutral` не всегда оформляются одним компонентом.

### Density

Есть отдельные density tokens:

- `--mes-ui-density-page`;
- `--mes-ui-density-gap`;
- `--mes-ui-panel-gap`;
- `--mes-ui-table-row-height`.

Но нет полноценного режима `compact/default/comfortable`, который был бы общим контрактом для всех таблиц, карточек, форм и Gantt.

### Иконки

Формальная шкала:

- `--mes-ui-icon-button-size: 36px`;
- `--mes-ui-table-icon-button-size: 30px`;
- `--mes-ui-touch-min: 32px`.

Фактически иконки и кнопки переопределяются в разных слоях, включая `styles/layers/70-planning-table-and-matrix.css:20-37`, `styles/layers/80-visual-system-ui-states.css:1665-1677`, `styles/layers/90-shift-master-board.css:901-946`.

## 6. Анализ таблиц и data-dense UI

### Таблицы

Основные таблицы:

- Generic directory tables: `renderDirectoryTable` в `src/app.js:28881`;
- Номенклатура: `renderNomenclatureTable` в `src/app.js:23842`;
- BOM import/list: `renderBomImportTable` в `src/app.js:24118`;
- Спецификации: `renderSpekiStructureTable` в `src/app.js:21723`;
- Маршрутная карта: `renderRouteObjectRows`, `renderRouteStepTableRow` в `src/app.js:28073`, `28153`;
- Заказ-наряды: `renderPlanningOrderStructureTable` в `src/app.js:7979`;
- Журнал СЗН: `renderShiftWorkOrdersTable` в `src/app.js:12322`;
- Табель: `renderTimesheetPage` в `src/app.js:15213`;
- Роли: `renderAccessRolePermissionPanel`, `renderAccessRoleAssignmentsPanel` в `src/app.js:15958`, `16010`;
- Права/матрица: `renderProductionStructureMatrixPage`, `renderProductionStructureMatrixRow` в `src/app.js:22932`, `22793`;
- План-таблица: `renderPlanningTableMatrix`, `renderPlanningTableRegister` в `src/app.js:23046`, `23691`;
- Supply register: `renderSupplyRegisterTable` в `src/app.js:13497`.

### Общий компонент или разные реализации

Есть общий wrapper `renderUiTableWrap` (`src/app.js:22354-22359`) и data marker `data-ui-component="TableWrap"`.

Но единого Table component нет. Таблицы отличаются:

- классами;
- column widths;
- row heights;
- selected/hover behavior;
- tree-line geometry;
- empty state;
- action cell rendering;
- sticky behavior;
- горизонтальным overflow.

Например, `shiftWorkOrders` и `planning` визуально сближаются через `99-legacy-overrides-tail.css`, но это две разные ветки:

- `shiftWorkOrders`: `styles/layers/99-legacy-overrides-tail.css:2280-2543`;
- `planning`: `styles/layers/99-legacy-overrides-tail.css:4279-4425`.

### Header, hover, selected, empty state, actions

Наблюдения:

- `shiftWorkOrders` использует темную шапку на цвете сайдбара (`styles/layers/99-legacy-overrides-tail.css:2327-2343`);
- `planning` повторяет похожую идею, но через собственные переменные (`styles/layers/99-legacy-overrides-tail.css:4313-4329`);
- `directory-table` имеет собственные hover/selected правила в нескольких layers;
- selected row в tree tables сделан через outline/drop-shadow, но не один универсальный `.ui-table-row.is-selected`;
- actions cell в generic tables и module-specific tables отличаются.

### Data-dense риски

Основные риски:

- таблицы используют `table-layout: fixed` и `overflow-x: hidden`, чтобы влезать по ширине, но это может скрывать важные данные;
- tree lines зависят от `--speki-level`, pseudo-elements и row heights, поэтому разрывы появляются при изменении плотности;
- touch-target в некоторых table actions ниже 32-36px;
- формы внутри таблицы (`select`, `input`) конкурируют с row selection;
- локальные table-specific nth-child widths легко ломаются при изменении столбцов.

### Номенклатура, спецификации, маршрутные карты, планирование

Эти модули особенно чувствительны:

- `nomenclature`: много колонок, sidebar, filters;
- `products`: спецификация и BOM дерево используют `speki-*` классы, которые потом повторно используются в routes/planning;
- `routes`: дерево маршрута и операций связано с бизнес-атрибутами `data-route-*`;
- `planning`: использует `speki`/`route`/`planning-order` классы одновременно, что делает таблицу зависимой от трех визуальных историй сразу.

## 7. Анализ Gantt/планирования

### Состав экрана Gantt

Gantt runtime расположен в `src/app.js`:

- toolbar: `renderToolbar` (`src/app.js:33657`);
- timeline: `renderTimeline`, `renderGanttTimelineWeekGroup`, `renderGanttTimelineDayCell` (`src/app.js:33889-33938`);
- rows: `renderRow`, `renderRowLabel`, `renderGanttRowMetricCells` (`src/app.js:33969`, `34380`, `34818`);
- non-working zones: `renderNonWorkingLayer` family около `src/app.js:34372`;
- slots: `renderSlot`, `renderGanttSlotLine`, `renderGanttSlotOperationalLayer` (`src/app.js:35239`, `35380`, `35175`);
- transfer batch visual: `renderSlotTransferBatchVisual` (`src/app.js:34929`);
- dependencies: `renderGanttDependencyEditControls`, SVG dependency layer (`src/app.js:35753`, `35693`);
- editor/drawer/modals: `renderSlotDrawer`, `renderEditorModal`, `renderSplitModal`, `renderGanttOptimizationModal` (`src/app.js:37006`, `37156`, `37390`, `33721`).

### Где зашиты локальные стили

CSS Gantt находится сразу в нескольких слоях:

- `styles/layers/10-shell-directory-gantt-base.css`;
- `styles/layers/20-technology-specifications.css`;
- `styles/layers/40-gantt-planning-routes.css`;
- `styles/layers/50-nomenclature-routes-directories.css`;
- `styles/layers/60-operational-modules.css`;
- `styles/layers/80-visual-system-ui-states.css`;
- `styles/layers/90-shift-master-board.css`;
- `styles/mes-ui-core.css`.

Примеры риска:

- `.gantt-shell` повторяется 8 раз по CSS audit;
- `.operation-slot` задан в `10`, `20`, `40`, `50`, `60`, `90`;
- `.planner-workspace-gantt-only > .topbar` имеет несколько разных grid templates;
- Gantt slot colors заданы direct hex в `40` и повторены/переопределены в `50` и `90`.

### Риск визуальной поломки

Gantt хрупок из-за сочетания:

- абсолютного позиционирования (`left`, `top`, `width`, `height` inline);
- scroll-синхронизации;
- SVG paths, masks and markers;
- row virtualization-like layout через `rowLayout`;
- зависимости от `LEFT_WIDTH`, `TIMELINE_HEIGHT`, `scaleInfo.cellWidth`;
- нескольких CSS layers с одинаковыми селекторами;
- разных режимов `hours/days/weeks`;
- модалок и drawer поверх Gantt.

### Что нужно выделить в MES-компоненты

Рекомендуемые будущие компоненты:

- `MesGanttShell`;
- `MesGanttToolbar`;
- `MesGanttTimeline`;
- `MesGanttRow`;
- `MesGanttRowLabel`;
- `MesGanttSlot`;
- `MesGanttSlotSegment`;
- `MesGanttOperationalLayer`;
- `MesGanttDependencyLayer`;
- `MesGanttDependencyEditor`;
- `MesGanttSlotEditorModal`;
- `MesGanttSlotDrawer`;
- `MesGanttNonWorkingZone`.

Важно: выделение должно быть behavior-preserving. Нельзя сначала менять DOM/геометрию.

## 8. Анализ layout

### Sidebar/header/page container/content area

Глобальная оболочка:

- `renderUiAppShell` (`src/app.js:6399-6410`);
- `renderModuleMenu` (`src/app.js:16424-16480`);
- `renderAppTopbar` (`src/app.js:16536-16571`).

Module page:

- `renderUiModulePage` (`src/app.js:22316-22337`) создает `module-data-page ui-module-page`;
- `renderUiModuleSidebar` (`src/app.js:22294-22314`);
- `renderUiModuleHeader` (`src/app.js:22340-22351`);
- `renderUiPanel` (`src/app.js:22196-22203`).

### Есть ли единый AppShell/PageShell

Да, формально есть:

- `AppShell`;
- `ModulePage`.

Но не все страницы одинаковы:

- обычные модули идут через `renderUiModulePage`;
- Gantt является special runtime и внутри использует `.planner-workspace`, `.topbar`, `.gantt-shell`;
- `authPrototype` работает без sidebar/topbar как standalone auth gate;
- часть модалок использует `renderUiModalShell`, но внутри сохраняет старые `.modal-header`, `.modal-footer`.

### Где страницы используют собственную верстку

Собственный layout особенно заметен в:

- `gantt`: `renderToolbar`, `.planner-workspace-gantt-only`, `.topbar`;
- `authPrototype`: fullscreen auth wizard;
- `authSessionPrototype`: tablet workspace layout;
- `shiftMasterBoard`: рабочая карточка + board + исполнители;
- `timesheet`: календарная таблица;
- `productionStructureMatrix`: wide matrix;
- `shopMap`: карта цеха с absolute widget positions;
- `supply`: supply Gantt-like timeline.

## 9. Анализ адаптивности

### Breakpoints

Найдены media queries примерно на:

- `1500px`;
- `1400px`;
- `1320px`;
- `1200px`;
- `1180px`;
- `980px`;
- `920px`;
- `900px`;
- `800px`;
- `768px`;
- `760px`;
- `480px`;
- `2400px x 1500px` для крупного рабочего стола.

Breakpoints не являются единой системой. Они разнесены по module-specific patches.

### Плохо адаптирующиеся страницы

Высокий риск на:

- `gantt`: диаграмма требует горизонтального и вертикального пространства, mobile/tablet поведение сложно;
- `planning`: таблица с inline forms;
- `shiftWorkOrders`: дерево документов + detail panel;
- `timesheet`: месячная таблица сотрудников;
- `productionStructureMatrix`: wide matrix;
- `routes/products`: tree tables;
- `authSessionPrototype`: должен быть tablet-first, но требует отдельного таргета 2880x1920 и локальных правок.

### Horizontal overflow

Horizontal overflow встречается или маскируется в:

- Gantt shell;
- `productionStructureMatrix`;
- `timesheet`;
- `planning-order-table`;
- `shift-work-orders-table`;
- route/specification trees;
- supply timeline.

Опасность: часть таблиц переводится на `overflow-x: hidden`, чтобы визуально убрать скролл. Это снижает шум, но может скрывать данные.

### Обрезание элементов

Зоны риска:

- topbar action/auth card;
- sidebar badges;
- table action cells;
- tree toggle dots and text;
- Gantt slot badges;
- modal content in small viewports;
- PIN pad/auth tiles;
- fact entry cards in Рабочий стол.

### Редактирование с телефона

Редактирование с телефона неудобно или рискованно для:

- Gantt drag/resize/dependencies;
- planning inline labor table;
- routes/specifications tree editing;
- production structure matrix;
- timesheet month view;
- directory tables with filters/dropdowns.

Система больше похожа на desktop/tablet MES, чем на mobile-first приложение.

## 10. Основные проблемы

### Критические

1. Один монолитный runtime-файл вместо компонентной архитектуры.
   - Файл: `src/app.js`, 39 221 строк.
   - Пример: render switch в `src/app.js:6434-6691`, UI helpers в `src/app.js:22182-22434`, Gantt в `src/app.js:33657+`.
   - Риск: любое изменение визуального паттерна требует помнить все места генерации HTML.

2. CSS-контракт есть, но не является единственным источником UI.
   - Файл: `src/ui_runtime_contracts.js:129-268`, `styles/mes-ui-core.css`.
   - Пример: `ActionButton` включает `.primary-button`, `.secondary-button`, `.icon-button`, `.table-icon-button`, которые также стилизуются legacy-слоями.
   - Риск: “поправить кнопку глобально” не гарантирует одинаковый результат.

3. CSS cascade содержит много дубликатов и пересечений.
   - Файл: весь `styles/layers/*`.
   - Данные: CSS audit - `457` duplicate selector groups.
   - Пример: `.directory-table th, .directory-table td` найдено 9 раз; `.gantt-shell` 8 раз; `.module-tab` 7 раз.

4. `styles.css` нарушает собственное manifest-only правило.
   - Файл: `styles.css:14-42`.
   - Скрипт: `node scripts/css-layer-audit.mjs` падает.
   - Риск: hotfix в root cascade перекрывает архитектуру layers.

5. Gantt является special runtime с множеством локальных правил.
   - Файлы: `src/app.js:33657-35868`, `styles/layers/40-gantt-planning-routes.css`, `50`, `60`, `80`, `90`.
   - Риск: изменение slot/topbar/dependency может ломать scroll, hit testing, modals.

6. Таблицы похожи визуально, но реализованы разными ветками.
   - Файлы: `src/app.js:7979`, `12322`, `21723`, `23842`, `28881`.
   - CSS: `styles/layers/99-legacy-overrides-tail.css:2280-2543`, `4279-4425`.
   - Риск: улучшение таблицы в одном модуле не переносится автоматически.

7. Старые и новые UI-классы используются одновременно.
   - Пример: `module-panel ui-panel`, `directory-sidebar module-data-sidebar ui-module-sidebar`, `primary-button ui-action-button`.
   - Риск: новые blocks наследуют старые visual quirks.

8. Inline geometry смешана с visual state.
   - Файл: `src/app.js`.
   - Данные: `97` style attributes.
   - Пример: Gantt geometry, tree levels, load bars, supply timeline.
   - Риск: часть дизайна нельзя поменять CSS-токеном.

9. `99-legacy-overrides-tail.css` стал не только legacy, но и местом новых решений.
   - Пример: актуальный UI Журнала СЗН и Заказ-нарядов находится в `99-legacy-overrides-tail.css:2280-2543` и `4279-4425`.
   - Риск: “legacy tail” фактически становится главным design layer, что противоречит названию и усложняет поддержку.

10. Статусы и tone-система раздвоены.
    - Файлы: `src/mes_contracts.js:44-56`, `src/app.js:195-203`, `styles/layers/80-visual-system-ui-states.css:3089-3142`.
    - Риск: один и тот же смысл может выглядеть по-разному.

11. App topbar имеет конфликтную историю.
    - Файлы: `styles/layers/50-nomenclature-routes-directories.css:1646-1682`, `styles/mes-ui-core.css:459-471`, `styles/layers/99-legacy-overrides-tail.css`, `styles.css:14-42`.
    - Риск: недавние проблемы topbar/focus/auth card являются симптомом неединого layout contract.

12. QA-gates проверяют наличие контрактов, но не доказывают единый источник UI.
    - Файлы: `src/ui_runtime_contracts.js:49-127`, `scripts/ui-contract-qa.mjs`, `scripts/ui-runtime-coverage-qa.mjs`, `scripts/module-smoke-qa.mjs`.
    - Пример: в `src/ui_runtime_contracts.js` все стадии помечены `closed`, но CSS audit при этом падает.

### Средние

13. Нет компонентных папок и границ ответственности.
    - Факт: `find src styles -maxdepth 3 -type d` показывает только `src`, `styles`, `styles/layers`.
    - Риск: внешний разработчик не понимает, куда добавить новый UI pattern.

14. Breakpoints локальные, не системные.
    - Файлы: `styles/mes-ui-core.css`, `60-operational-modules.css`, `80-visual-system-ui-states.css`, `99-legacy-overrides-tail.css`.
    - Риск: адаптивность исправляется модульно и расходится.

15. Цвета не полностью токенизированы.
    - Данные: `277` unique hex colors.
    - Риск: изменение палитры сайдбара/таблиц не распространяется глобально.

16. Типографика data-dense таблиц задается вручную.
    - Пример: `shiftWorkOrders` tree typography в `styles/layers/99-legacy-overrides-tail.css:2468-2543`.
    - Риск: похожие таблицы снова расходятся.

17. Dropdown/select система смешанная.
    - Файлы: `renderDenseInlineSelect` в `src/app.js:16584+`, `renderUiDropdownFrame` в `src/app.js:22372-22378`.
    - Риск: viewport-safe логика и стили раскрытых меню не едины.

18. Print forms живут рядом с screen UI.
    - Файлы: routes print helpers `src/app.js:27223+`, shift work orders print helpers `src/app.js:12035+`, work order package print helpers `src/app.js:27581+`.
    - Риск: печатный CSS и экранный CSS могут влиять друг на друга.

### Косметические

19. Названия слоев не отражают реальное назначение.
    - Пример: `99-legacy-overrides-tail.css` содержит новые эталонные таблицы.

20. UI-состояния не являются Storybook-like источником компонентов.
    - Файл: `renderVisualSystemPage` в `src/app.js:20790`.
    - Риск: примеры в UI-состояниях не гарантируют, что live-модули используют тот же компонент.

## 11. Рекомендованная целевая структура

### Что вынести в `src/components/ui`

Минимальный набор:

- `AppShell`;
- `Topbar`;
- `Sidebar`;
- `ModulePage`;
- `ModuleHeader`;
- `Panel`;
- `ActionButton`;
- `IconButton`;
- `StatusToken`;
- `Badge`;
- `Table`;
- `TableTreeCell`;
- `TableActionsCell`;
- `FormField`;
- `Select`;
- `Dropdown`;
- `Modal`;
- `Drawer`;
- `EmptyState`;
- `PinPad`;
- `PhotoPreview`.

### Что вынести в `src/components/mes`

MES-specific components:

- `MesGantt/*`;
- `MesRouteTree`;
- `MesWorkOrderTreeTable`;
- `MesShiftWorkOrderTreeTable`;
- `MesShiftWorkOrderDetail`;
- `MesShiftMasterBoard`;
- `MesWorkerLoadCard`;
- `MesLaborCell`;
- `MesTimesheetCalendar`;
- `MesProductionStructureMatrix`;
- `MesAuthWizard`;
- `MesWorkerDesktop`;
- `MesPrintPreview`;
- `MesIssueReportPanel`.

### Какие токены создать

Рекомендуемые token groups:

- `color.surface.*`;
- `color.text.*`;
- `color.border.*`;
- `color.sidebar.*`;
- `color.status.success/warning/error/info/neutral/manual/calc/demo`;
- `color.table.header/row/hover/selected/tree`;
- `color.gantt.plan/distributed/fact/deficit/transfer/nonWorking`;
- `space.0/1/2/3/4/5`;
- `radius.none/xs/sm/md/lg/pill`;
- `font.size.caption/body/table/section/title`;
- `font.weight.regular/medium/semibold/bold`;
- `lineHeight.caption/body/table`;
- `control.height.compact/default/touch`;
- `icon.size.inline/button/table/sidebar`;
- `zIndex.dropdown/modal/drawer/topbar`;
- `density.compact/default/comfortable`.

### Какие страницы мигрировать первыми

Безопасный порядок:

1. `shiftWorkOrders` и `planning`: зафиксировать общий `MesTreeTable` на основе текущего лучшего паттерна.
2. `products`, `routes`, `nomenclature`: перевести tree/directory tables на тот же table contract.
3. `shiftMasterBoard` и `authSessionPrototype`: вынести карточки заданий, исполнителей, факт-ввод.
4. `timesheet` и `productionStructureMatrix`: создать отдельный `DataGrid/WideTable` contract.
5. `gantt`: только после стабилизации table/layout/button/status tokens, отдельными маленькими behavior-preserving шагами.

### Порядок безопасного рефакторинга

1. Заморозить текущий DOM для критических модулей snapshot-тестами.
2. Создать tokens-only слой без изменения визуала.
3. Создать UI component helpers, которые генерируют тот же DOM/classes.
4. Перевести один тип паттерна за раз: buttons, then status, then panels, then table wrapper.
5. Для таблиц сначала выделить shared CSS variables, потом общий renderer.
6. Для Gantt сначала выделить pure view-model helpers, не трогая DOM.
7. Удалять legacy selectors только после доказанного отсутствия runtime references.

## 12. Что нельзя делать

### Где редизайн опасен

Опасные зоны:

- Gantt timeline/rows/slots/dependencies;
- Gantt drag/resize/snap/dependency edit;
- planning order tree table with inline labor forms;
- shift work orders tree with collapse/selection/report counts;
- route/specification tree tables;
- timesheet calendar grid;
- production structure matrix;
- auth flow/session gate;
- print preview forms.

### Компоненты, завязанные на бизнес-логику

Нельзя считать чисто визуальными:

- `renderSlot`, `renderGanttSlotOperationalLayer`, `renderGanttDependencyEditControls`;
- `renderPlanningOrderStructureTable`, `renderPlanningManualInlineLaborCell`;
- `renderShiftWorkOrdersTable`, `buildShiftWorkOrderDocumentTree`;
- `renderShiftMasterBoardPage`, assignment/loadbar cards;
- `renderAuthSessionFactPanel`;
- `renderTimesheetEditorModal`;
- `renderProductionStructureMatrixRow`;
- `renderDenseInlineSelect`.

### Где нельзя менять DOM без риска

DOM-структуру нельзя менять без отдельной функциональной проверки:

- элементы с `data-*` handlers: `data-planning-order-row`, `data-route-step-row`, `data-shift-work-order-row`, `data-shift-work-order-tree-toggle`, `data-gantt-*`, `data-auth-*`;
- Gantt slots and SVG dependency nodes;
- rows with `--speki-level`;
- modal forms with IDs: `slotForm`, `ganttOptimizationForm`;
- table rows with active/selected state;
- auth wizard step buttons and PIN inputs;
- print preview DOM used for print/export.

## 13. Финальный вывод

Текущее состояние UI-системы: функционально богатый MES-прототип с большим количеством уже найденных и частично нормализованных UI-паттернов, но без настоящей компонентной архитектуры. UI-kit/runtime contracts существуют, однако не являются единственным способом строить интерфейс. Основной риск не в отсутствии стилей, а в том, что стиль, DOM, бизнес-логика и compatibility patches живут вместе в одном runtime и большом CSS cascade.

Оценка хрупкости: высокая.

Причина: изменение одного визуального правила не гарантирует системного эффекта, потому что одинаковый паттерн часто реализован несколькими селекторами, несколькими render-функциями и несколькими слоями CSS.

Первые 5 задач для стабилизации:

1. Вернуть `styles.css` в manifest-only состояние и устранить exact duplicate CSS rules, чтобы CSS audit снова был зеленым.
2. Вынести `Table`/`TreeTable` contract: один компонент и один CSS contract для `shiftWorkOrders`, `planning`, `routes`, `products`.
3. Создать обязательный `ActionButton/IconButton/StatusToken` renderer и запретить новые raw `.primary-button`, `.secondary-button`, `.status-pill` без UI helper.
4. Разделить `99-legacy-overrides-tail.css`: текущие эталонные решения перенести в named component layers, настоящий legacy оставить отдельно.
5. Для Gantt создать отдельную карту компонентов и snapshot QA на DOM/geometry перед любым переносом стилей.

