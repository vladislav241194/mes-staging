# MES Prototyping Speed Pass v1

Цель документа - ускорить дальнейшее прототипирование MES без изменения бизнес-логики. Это не редизайн и не миграция на новый стек, а рабочий контракт: какие UI-блоки использовать, что запрещено возвращать и какие проверки запускать.

Связанная карта компонентов: `docs/mes-component-map-v1.md`. Она нужна как короткий справочник "что использовать сейчас" при создании новых экранов и прототипов.

## Что зафиксировано

### 1. UI-contract freeze

Новые модули и новые блоки должны собираться из существующего контракта:

- `app-shell` + `app-topbar` + `app-module-annotation`;
- `module-data-page`;
- `module-data-sidebar`;
- `module-data-workspace`;
- `module-panel`;
- `ui-panel-head` через helper `renderUiPanelHead`;
- `ui-panel-body` / `ui-panel-footer` через helper-ы `renderUiPanelBody` и `renderUiPanelFooter`;
- `ui-form-field` через helper `renderUiFormField`;
- `ui-dropdown` через helper `renderUiDropdownFrame`;
- `ui-modal` / `ui-drawer` через helper-ы `renderUiModalFrame`, `renderUiModalShell`, `renderUiDrawerFrame` и `renderUiDrawerShell`;
- `ui-gantt-bar` через helper `renderUiGanttBar` для быстрых Gantt-прототипов;
- `module-preview-empty` через helper `renderUiEmptyState`;
- `mes-signal` / `ui-status-token` для статусов и сигналов;
- `ui-demo-badge` для демо-функций, которые можно редактировать, но которые пока не влияют на расчеты.
- `data-ui-component` на корне каждого UI Core helper-а, чтобы QA видел источник компонента, а не только CSS-класс.

Запрещено для новых экранов:

- возвращать глобальный поиск;
- возвращать хлебные крошки;
- рисовать сайдбар или заголовок вручную с новой геометрией;
- делать информационные KPI-блоки ради декоративной статистики;
- использовать старые module-specific паттерны, если есть общий UI Core helper.

### 2. CSS-слои

`styles.css` теперь является manifest-файлом, а не монолитом. Он подключает слои в сохраненном историческом cascade-порядке:

1. `styles/layers/00-foundation-base.css` - tokens, reset, базовые browser primitives;
2. `styles/layers/10-shell-directory-gantt-base.css` - первый проход shell/sidebar/directory/Gantt primitives;
3. `styles/layers/20-technology-specifications.css` - BOM, спецификации, технологические primitives;
4. `styles/layers/30-module-shell-ui-foundations.css` - module shell, sidebar, employee, planning-order foundations;
5. `styles/layers/40-gantt-planning-routes.css` - Gantt, планирование, маршрутные карты;
6. `styles/layers/50-nomenclature-routes-directories.css` - номенклатура, маршруты, справочники, таблицы;
7. `styles/layers/60-operational-modules.css` - снабжение, табель, цех, оперативные модули;
8. `styles/layers/70-planning-table-and-matrix.css` - план-таблица, матрица, аналитические таблицы;
9. `styles/layers/80-visual-system-ui-states.css` - UI-состояния, Gantt Design System, runtime/design snapshot стенд;
10. `styles/layers/90-shift-master-board.css` - текущая доска Мастерской;
11. `styles/layers/99-legacy-overrides-tail.css` - поздние override-правила, которые еще ждут отдельного cleanup.

Общий UI-kit живет в `styles/mes-ui-core.css` и подключается после manifest, чтобы быть стабилизационным контрактом поверх исторического CSS.

Новые общие правила добавляются в `styles/mes-ui-core.css`. Новые модульные правила добавляются в соответствующий файл `styles/layers/*`, а не в конец произвольного слоя. `styles.css` нельзя использовать для обычных правил: только `@import`.

### 3. Мертвый CSS и legacy

Legacy-классы пока не удаляются массово, если они могут держать старый экран или совместимость. Они должны быть видны в QA warnings:

- `warehouse-*`;
- `planning-v2` в runtime/CSS;
- `projectId` / `batchId` как совместимость.

Старые демо-ветки `shiftMasterScenario`, `shiftMasterHmi`, визуальный слой `shiftMasterV2` и старый runtime/CSS слой `shift-method-*` удалены из runtime/CSS и заблокированы в `qa:ui`. `shiftMaster`, `shiftMasterContext` и `shiftMasterV2` допускаются только как старые URL/module alias, которые перенаправляются на текущую основную `Мастерскую · доска`; layout-page должен быть `shiftMasterBoard`.

Самостоятельный модуль РКД удален: запрещены `module=rkd`, отдельный `data-layout-page="rkd"`, module alias и пункты навигации. При этом «Черновик РКД» внутри «Спецификаций 2.0» является действующей вкладкой и использует префикс `specifications2-rkd-*`; его поведение закреплено отдельной QA-проверкой.

Правило: warning означает "не использовать дальше"; failure означает "нельзя вернуть в runtime".

Хлебные крошки удалены из runtime и CSS. Их возврат должен считаться ошибкой QA.

Поиск удален из runtime и CSS. Возврат `.search-field`, `.directory-search`, `.module-search`, `.filter-search`, `app-global-search`, `type="search"` или `ui.search` должен считаться ошибкой QA.

Update-popup "Обновление готово" удален из runtime. Возврат баннера обновления, `UPDATE_CHECK`, `UPDATE_DISMISSED`, `update-popup` или `update-banner` должен считаться ошибкой QA.

Shared-state contract: все ключи из `SHARED_STATE_VALUE_KEYS` в `src/app.js` должны быть разрешены в `ALLOWED_VALUE_KEYS` endpoint `scripts/shared-state-endpoint.mjs`. `qa:flow` проверяет это автоматически. Сейчас shared snapshot включает состояние планирования, справочники, tombstones справочников, supply-control слой и флаг seeded операций рабочих центров.

`npm run qa:shared-state` проверяет сам endpoint: пустой snapshot, whitelist значений, сохранение supply-control, сохранение optional value/shared UI keys при payload от старой вкладки, whitelist `sharedUi` и конфликт версии `409`. Этот тест входит в `npm run qa:functional`.

`accessRoleProfiles` и `accessRoleAssignments` входят в `sharedUi`: модуль `Роли` уже влияет на авторизацию и видимость модулей, поэтому его настройки нельзя оставлять только в локальном UI state одной вкладки.

`npm run qa:module-smoke` без screenshots открывает все модули из `MES_MODULE_FLOW_SEQUENCE` и основные legacy alias на desktop viewport, проверяет корректный `layout-page`, topbar-заголовок из `MES_MODULE_FLOW_CONTRACTS.label`, группу/роль topbar-аннотации, непустой shell и отсутствие startup error/console error. Отдельно проверяются входы `bomLists`, `speki`, `specifications`, `planning2`, `planningWorkbench`, `warehouse`, `shiftMaster`, `shiftMasterContext`, `shiftMasterV2`: они должны открывать новые целевые модули, а не отдельные старые layout-page. Это быстрый gate против ситуаций вида "Ошибка запуска интерфейса" или "модуль переименовали только в одном месте" после рефакторинга.

`npm run qa:auth` проверяет полубоевой вход без `qa-auth-bypass`: явный путь `Административный отдел -> Группа без участка -> Алексеев`, PIN-клавиатуру из 10 уникальных цифр без `C/С`, ошибочный PIN без unlocked-сессии, PIN `55555`, обычный shell с меню/topbar, роль из авторизованного сотрудника, карточку сайдбара с ФИО/должностью/отделом, reload сессии до конца дня и `Выход` обратно на первый шаг. Этот тест входит в `npm run qa:functional`, потому что авторизация стала стартовым контуром системы.

`npm run qa:roles` проверяет модуль `Роли` как рабочий инструмент: роль можно выбрать, изменить описание, включить permission, назначить роль сотруднику и сохранить это через reload. Этот тест входит в `npm run qa:functional`, потому что авторизация теперь зависит от настроек ролей.

`npm run qa:shift-flow` проверяет сквозной оперативный контур: заказ-наряд/трудозатраты -> реальный слот планирования -> Табель -> Мастерская -> факт/остаток -> operational layer Ганта. Это gate от разрыва между модулями, когда отдельные проверки зеленые, но сменная работа перестает отражаться на колбаске.

### 4. Компонентные render-функции

В `src/app.js` добавлен UI Core слой:

- `renderUiPanelHead`;
- `renderUiPanel`;
- `renderUiPanelBody`;
- `renderUiPanelFooter`;
- `renderUiEmptyState`;
- `renderUiStatusToken`;
- `renderUiDemoBadge`;
- `renderUiActionButton`;
- `renderUiActionBar`;
- `renderUiSidebarItem`;
- `renderUiAppShell`;
- `renderUiModuleHeader`;
- `renderUiTableWrap`;
- `renderUiFormField`;
- `renderUiDropdownFrame`;
- `renderUiModalFrame`;
- `renderUiModalShell`;
- `renderUiDrawerFrame`;
- `renderUiDrawerShell`;
- `renderUiGanttBar`;
- `normalizeUiTone`.

Новый UI нужно начинать с этих функций. Если функции не хватает, сначала расширить UI Core, а уже потом собирать модуль.

Каждый helper также ставит `data-ui-component`: `AppShell`, `Panel`, `PanelHead`, `PanelBody`, `PanelFooter`, `ModuleHeader`, `ActionButton`, `ActionBar`, `SidebarItem`, `TableWrap`, `FormField`, `Dropdown`, `Modal`, `Drawer`, `GanttBar`, `StatusToken`, `DemoBadge`, `DemoMarker`. Это промежуточный слой перед будущими React/HeroUI-компонентами и диагностический якорь для QA.

Дополнительно включен runtime normalizer `applyUiRuntimeContracts()`. Он запускается после каждого `render()` и маркирует старые живые примитивы, которые еще не переведены на helper-ы: формы, обычные `label` с input/select/textarea, все кнопки, table-wrap, панели, panel head/footer, dropdown, modal, drawer и Gantt-слоты. Это временный стабилизационный bridge: новый код все равно должен начинаться с helper-а, но design snapshots и статические gate-ы теперь могут видеть и проверять старые участки.

Если старый живой блок пока не переведен на helper, он все равно обязан иметь runtime-маркер. Любой ручной `section.module-panel` должен иметь `data-ui-component="Panel"`, а любой table-wrap/ui-table-wrap должен иметь `data-ui-component="TableWrap"` и `data-scroll-contract="horizontal-only"`. `qa:ui` падает на незамаркированных контейнерах, чтобы новая ручная верстка не возвращалась невидимо.

### 5. Шаблон нового модуля

Минимальный шаблон нового рабочего модуля:

```text
section.module-data-page
  aside.module-data-sidebar
    directory-sidebar-head
    module-sidebar-actions
    ui-sidebar-list
  div.module-data-workspace
    header.directory-header или собственный compact header
    div.module-data-content
      section.module-panel
        renderUiPanelHead(...)
        рабочий блок
      section.module-panel
        renderUiPanelHead(...)
        таблица / форма / карточка
```

Если модуль плотный, можно использовать внутренний горизонтальный scroll только внутри таблицы, Gantt или временной шкалы. Вся страница не должна получать горизонтальный scroll.

Для новых UX-макетов использовать `renderUiAppShell(...)`, чтобы не копировать вручную `main.app-shell`, главное меню и topbar. Fixed/drawer/modal элементы передаются через `body` и `modals`; ручной shell в `src/app.js` запрещен `qa:ui`.

Scroll-contract для новых модулей:

- вертикальный scroll принадлежит только `module-data-workspace` или основной рабочей области модуля;
- `module-panel`, карточки и табличные блоки не должны получать `overflow-y: auto`;
- если таблица плотная и не помещается, ей разрешен только `overflow-x: auto` + `overflow-y: hidden`;
- такой table-wrap обязан иметь `data-scroll-contract="horizontal-only"`;
- если содержимого стало больше, блок растягивает страницу вниз, а не создает второй вертикальный scroll внутри себя.

Inset-contract для заголовков и текстовых блоков:

- заголовок панели не должен иметь боковой `padding: 0`; минимум бокового inset должен идти из общего panel/header contract;
- если нужно сделать блок плотнее, уменьшать `gap`, `line-height` или вертикальный padding, но не убирать левый/правый воздух;
- для новых модулей проверять, что текст заголовка не прилипает к рамке панели и не выглядит вывалившимся из блока;
- `npm run qa:css` показывает диагностический список `Potential insetless panel/header text`.

### 6. UI-kit в коде

`UI-состояния` остается визуальной витриной. Источником новых интерфейсных решений должен быть кодовый слой helpers + CSS contract, а не ручное копирование похожей верстки.

### 7. Упрощение app.js

Физический разрез монолита уже выполнен безопасным способом: порядок cascade сохранен через manifest. Следующие cleanup-проходы должны не менять порядок без snapshot/functional проверки, а постепенно переносить повторяющиеся shared-правила из `styles/layers/*` в `styles/mes-ui-core.css` и снижать CSS budgets.

### 8. Бизнес и UI

Рендеры не должны заново трактовать бизнес-значение статуса или сущности. Для статусов действует `MES_STATUS_CONTRACTS`; для визуального статуса используется `getMesStatusView(scope, value)`.

Для будущих переходов "заказ-наряд -> планирование -> мастерская -> диспетчерская -> корректировка плана" сначала добавляется контракт перехода, потом UI.

Для модулей действует `MES_MODULE_FLOW_CONTRACTS` и `getMesGanttInfluenceMatrix()`. Там зафиксировано:

- название и роль модуля для topbar-аннотации;
- что модуль читает;
- что модуль пишет;
- влияет ли модуль на Gantt напрямую;
- что именно визуально меняется в Gantt;
- какую политику редактирования соблюдать.

Эта матрица нужна, чтобы новый прототип не начал напрямую менять диаграмму там, где по архитектуре должен только читать или создавать запрос корректировки.
`qa:flow` сверяет `getModuleDefinitions()` и группировку главного меню с `MES_MODULE_FLOW_CONTRACTS`: новый модуль нельзя добавить в меню без явного `label`, `role`, контракта чтения, записи, влияния на Gantt и политики редактирования, а группа в сайдбаре должна совпадать с группой контракта.
Порядок главного сайдбара также является контрактом: "Планирование нагрузки" -> "Оперативное управление" -> "Технологии" -> "Система" -> "UX-макеты". Внутри групп порядок сейчас зафиксирован в `scripts/flow-contract-qa.mjs`, чтобы новые прототипы не возвращали хаотичную навигацию.
`ganttImpact` также ограничен словарем допустимых значений (`none`, `indirect`, `writes-on-transfer`, `direct`, `visual-operational-layer` и UX/demo-варианты), чтобы новые модули не вводили почти одинаковые термины влияния.

### 9. Legacy aliases audit

Старые алиасы не считаются новой сущностью:

- `projectId` - совместимость со старой моделью проекта;
- `batchId` - совместимость со старой моделью партии;
- `planning-order-*` - текущее UI-имя модуля `Заказ-наряды`; старое `planning-v2` запрещено в runtime/CSS;
- `shiftMaster`, `shiftMasterContext`, `shiftMasterV2` - исторические URL/module alias основного модуля `Мастерская · доска`, не layout-page.

Legacy `planningStatus: "planned"` у заказ-наряда нормализуется в контрактный `queued`; новые статусы заказ-наряда должны идти только из `MES_STATUS_CONTRACTS` scope `workOrderPlanning`.

Новые функции и новые поля не должны использовать эти имена как бизнес-источник.

### 10. QA gate

Команда:

```bash
npm run qa:stabilize
```

Проверяет базовую цепочку стабилизации одной командой: `qa:syntax`, `qa:flow`, `qa:ui`, `qa:legacy`, `qa:css`, `git diff --check`, `build`.

Команда:

```bash
npm run qa:architecture
```

Проверяет архитектурный слой одной командой: `qa:flow`, `qa:ui`, `qa:legacy`, `qa:css`. Это gate для бизнес-фасадов, UI-kit контрактов, legacy-алиасов и CSS-layer бюджета. `qa:stabilize` вызывает его после синтаксиса и перед `git diff --check`.

Команда:

```bash
npm run qa:syntax
```

Проверяет синтаксис критичных входов без запуска браузера: `src/app.js`, `src/mes_contracts.js`, `src/validation.js`, `scripts/build.mjs`, `scripts/run-with-local-server.mjs`. Это быстрый первый барьер перед flow/UI/functionality проверками.

Команда:

```bash
npm run qa:functional
```

Проверяет живые сценарии: целостность runtime state, валидность route-level настроек трудозатрат, трудозатраты заказ-наряда как источник расчета слотов Ганта (`фикс.`, `мин/ед`, `мин/мульт.`, `смена`), сохранение scroll при смене режима трудозатрат через UI-select, текущую основную `Мастерскую · доска` (`shiftMasterBoard`) и полубоевую авторизацию по PIN.
Команда запускается через `scripts/run-with-local-server.mjs`: если `localhost:4174` уже поднят, используется текущий сервис; если нет, wrapper временно поднимает `server.js` на время проверки. Wrapper выставляет `MES_QA_URL` дочерним browser-скриптам и проверяет, что обслуживаемые `src/app.js`, CSS-слои и `workflow-preset.json` не отстают от файлов проекта. Это нужно для ночных/autonomous прогонов, чтобы functional QA не зависел от ручного старта сервиса и не смотрел старый preset.

Команда:

```bash
npm run qa:nonvisual
```

Использовать для длинного автономного прохода без визуального QA. Она запускает `qa:stabilize` и `qa:functional`, но не делает screenshot/mobile/visual проверки.

Если на `localhost:4174` запущен `scripts/preview-dist.mjs`, точечные browser/functional проверки читают `dist`, а не live `src`/CSS. После правок `src/app.js`, `styles.css`, `styles/layers/*.css`, `styles/mes-ui-core.css` или `workflow-preset.json` перед одиночными `qa:state`, `qa:module-smoke`, `qa:planning-labor` и похожими командами нужно выполнить `node scripts/build.mjs`. Полный `npm run qa:nonvisual` уже делает build перед functional-секцией, а wrapper проверяет stale frontend assets, включая CSS layers и preset.

Команда:

```bash
npm run qa:legacy
```

Показывает legacy inventory:

- hard forbidden patterns: поиск, breadcrumbs, старые демо-ветки Мастерской, удаленный РКД в runtime/CSS/HTML, старый `dashboard-*` layout, старые standalone shell-классы `project/specification`, старое имя `planning-v2`, старый `planning-order-batch-row/actions/grid` слой заказ-нарядов, кастомные кнопки помощника Ганта `mini-action`/`assistant-command`, старая рабочая доска диспетчерской;
- compatibility debt: `projectId`, `batchId`, legacy planning demo storage keys, `shiftMaster/shiftMasterContext/shiftMasterV2` URL aliases; после stabilization pass бюджеты ужаты до `projectId <= 126`, `batchId <= 8`, а новые слоты больше не записывают `batchId`; `planning-batch`, старые `project-*` UI class names включая `project-main/status/readiness` и `director-project-*`, `planning-v2` и `planning-order-batch-row/actions/grid` зафиксированы как запрещенный возврат с бюджетом 0;
- compatibility debt для `report-card-head` закрыт: новый helper выпускает только `ui-panel-head`, а CSS-совместимость `:is(.report-card-head, .ui-panel-head)` удалена;
- CSS legacy map: live `material-transfer-slot`, запрещенный старый warehouse-page/sidebar/table CSS, старый CSS `shiftMasterV2`, module-specific sidebar overrides;
- `qa:css` проверяет не только счетчики selector debt, но и баланс CSS-блоков во всех импортированных CSS layers, чтобы браузер не съедал большой кусок stylesheet из-за недозакрытой скобки после механической чистки;
- `qa:css` считает дубли context-aware: одинаковое правило в разных `@media` больше не считается exact duplicate. Текущий hard-gate для exact duplicate rule groups равен 0; текущий hard-gate broad `!important` layout rules равен 0; следующий cleanup должен уменьшать same-context duplicate selector groups; shared-контракты, найденные в модульных слоях, нужно переносить в `styles/mes-ui-core.css`, а не закреплять через новый `!important`;
- наличие фасадных helper anchors, через которые должна проходить новая логика.
- каждый модульный flow contract обязан явно описывать `label`, `role`, `reads`, `writes`, `ganttImpact`, `ganttVisualChange` и `editPolicy`, а runtime-список модулей и группы главного меню должны совпадать с `MES_MODULE_FLOW_CONTRACTS`, включая UX-макеты.
- прямые сравнения `slot.projectId/specificationId` и `slot.batchId/planningOrderId/routeId` теперь запрещены в `qa:flow`; новые выборки слотов должны идти через `slotMatchesProductionContext`, `slotMatchesPlanningOrder` или `getSlotRouteId`.
- старый модульный слой `warehouse-page/sidebar/table` должен оставаться равным 0; складская семантика операций допускается только через live `material-transfer-slot` / `is-warehouse` маркеры маршрута и Ганта.
- новые sidebar-карточки должны собираться через `renderUiSidebarItem`, чтобы не возвращать разные высоты, жирности и бейджи в боковых списках; `qa:legacy` отдельно проверяет, что старый слой `module-entity-*` не возвращается в runtime/CSS.
- все страницы должны собирать внешний shell через `renderUiAppShell()`; ручной `<main class="app-shell...">` в `src/app.js` запрещен `qa:ui`.
- внутренние сайдбары должны использовать `directory-sidebar module-data-sidebar`; голый `directory-sidebar` больше не считается допустимым для модульных экранов.
- прямой HTML-класс `ui-sidebar-item` в runtime запрещен: новые элементы боковых списков должны идти через helper `renderUiSidebarItem`, а внутренние классы helper-а (`ui-sidebar-item-body`, `ui-sidebar-item-badge`) остаются допустимыми.
- `.module-panel` не должен получать `overflow:auto/scroll`; вертикальный скролл принадлежит workspace/page, а таблицы используют только локальный горизонтальный scroll.
- workspace/grid правила не должны протекать на sidebar items или их `strong/small/em`; это проверяет `qa:ui`, потому что такие selector-list ошибки визуально выглядят как случайные проблемы типографики.

Важно: `qa:legacy` не означает, что весь debt нужно удалить сразу. Он нужен, чтобы новая работа не увеличивала старый слой незаметно.

Команда:

```bash
npm run qa:css
```

Показывает CSS layer audit:

- точные дубли селекторов;
- опасные `module-panel` overflow-правила;
- широкие `!important` layout-правила и их разбивку по CSS-файлам;
- давление legacy-селекторов `module-entity-*`; `planning-batch`, старый `warehouse-slot` Gantt marker, `planning-v2` и `planning-order-batch-row/actions/grid` отдельно блокируются `qa:legacy`, а текущие боковые списки должны использовать `ui-sidebar-*`.
- давление CSS-селекторов удаленных из runtime `reports/debug` модулей; этот слой должен оставаться равным 0 и не возвращаться в CSS.
- давление CSS-селекторов старого `dashboard-*` layout; этот слой должен оставаться равным 0, а новые обзорные экраны должны использовать текущий shell/UI-kit.
- давление standalone shell-классов `project/specification-app-shell`; эти оболочки должны оставаться равными 0.
- потенциально опасные заголовки/toolbar без бокового inset: `directory-sidebar-head`, `directory-table-toolbar`, `detail-card-head`, `supply-header` и panel-head варианты.

Это диагностический отчет и budget gate. Его задача - показать, где следующий cleanup даст максимальную скорость прототипирования, и не дать новым правкам увеличить:

- context-aware duplicate selector groups выше текущего бюджета;
- largest context-aware duplicate selector group выше текущего бюджета;
- exact duplicate rule groups выше 0;
- risky `module-panel` vertical overflow выше 0;
- insetless panel/header text выше 0;
- broad `!important` layout rules выше текущего бюджета;
- legacy selector pressure выше текущего бюджета.

Команда:

```bash
npm run qa:ui
```

Проверяет:

- UI Core helpers, физический CSS manifest `styles.css`, CSS layers `styles/layers/*.css` и контрактный слой `styles/mes-ui-core.css`;
- отсутствие поиска, breadcrumbs и старых демо-веток Мастерской;
- запрет возврата старой доски Мастерской;
- наличие scroll-contract для новых таблиц: `ui-table-wrap` не должен становиться внутренним вертикальным scroll-контейнером;
- наличие runtime normalizer и visual gate `unmarked = 0` для FormField/ActionButton/TableWrap/Panel/Dropdown/Modal/Drawer/GanttBar;
- наличие документации и QA gate.

Команда:

```bash
npm run qa:flow
```

Проверяет:

- документные типы, статусы и переходы в `src/mes_contracts.js`;
- что каждый переход выставляет существующий статус;
- что модульная матрица влияния на Gantt синхронизирована с `MES_MODULE_FLOW_SEQUENCE`;
- запрет прямой интерпретации ключевых статусов в UI.
- запрет прямых сравнений слота по legacy-связям `projectId`, `specificationId`, `batchId`, `planningOrderId`, `routeId` вне фасадных helper.
- запрет прямого чтения `slot.projectId` и `slot.batchId` вне миграции старых сохранений и slot compatibility helper layer.

## Самопроверка после UI-правок

Минимум:

```bash
node --check src/app.js
npm run qa:flow
npm run qa:ui
git diff --check
node scripts/build.mjs
```

Если правились сложные таблицы, dropdown, Gantt, sticky-колонки или плотная верстка, дополнительно:

```bash
npm run qa:visual
node scripts/scroll-dropdown-qa.mjs
```

`qa:visual` сначала выполняет `npm run build`, а потом проверяет не только закрытые страницы, но и обязательные opened states: карточка операции Ганта, фильтр справочника, раскрытая трудоемкость маршрутной карты, печатная форма маршрутной карты, редактор дня Табеля и сменный лист Мастерской. Список runtime-модулей сверяется с `HARD_UI_RUNTIME_MODULE_IDS` и `SPECIAL_UI_RUNTIME_MODULE_IDS`, поэтому новый hard/special модуль нельзя забыть добавить в экранный прогон. Если новый модуль добавляет важную модалку, drawer, dropdown или inline-edit состояние, его нужно добавить в `interactionStates` visual QA.

Для длинного автономного ночного прохода использовать единый тяжелый набор:

```bash
npm run qa:night
```

Он запускает `qa:stabilize`, функциональные сценарии `qa:functional`, затем `qa:visual` на единственном эталонном viewport MacBook Air 15. Мобильный прогон остается отдельной ручной командой `qa:mobile` и не входит в ночной цикл без явного запроса. Если задача явно без визуального QA, использовать `qa:nonvisual`. Обычный `qa:stabilize` намеренно остается быстрее, чтобы не замедлять каждую маленькую итерацию прототипирования.

## Что это ускоряет

- Новый экран можно собирать из повторяемого shell/sidebar/workspace/panel/table паттерна.
- Старые решения не нужно искать глазами: часть из них теперь ловит `qa:ui`.
- Если UI ломается, у нас есть единая точка расширения: сначала helper/CSS contract, потом модуль.
- Прототип можно развивать без постоянного ручного переписывания одинаковых заголовков, empty states и demo-блоков.
