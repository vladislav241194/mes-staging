# Hard UI Runtime Coverage Pass v2

Дата прохода: 2026-06-30.

Цель прохода: убрать серую зону между UI-kit и живыми модулями. Новый или недавно мигрированный модуль должен быть явно отнесен к `hard`, `special`, `partial` или `legacy`, а hard-модули должны проходить браузерные проверки геометрии.

## Покрытие

Источник правды: `src/ui_runtime_contracts.js`.
Для special-runtime модулей там же закреплен явный контракт `module -> data-ui-runtime / data-ui-component`.

Hard-runtime модули:

- `authPrototype` - Авторизация;
- `authSessionPrototype` - Рабочий стол;
- `planningTable` - План-таблица;
- `matrix` - Матрица;
- `shiftWorkOrders` - Журнал СЗН;
- `timesheet` - Табель;
- `roles` - Роли;
- `productionStructureMatrix` - Права;
- `employees` - Структура;
- `dispatch` - Диспетчерская-заглушка;
- `shiftMasterBoard` - Мастерская;
- `supply` - Снабжение;
- `shopMap` - Цех производства;
- `directories` - Справочники;
- `products` - Спецификации;
- `nomenclature` - Номенклатура;
- `routes` - Маршрутная карта;
- `planning` - Заказ-наряды.

Partial-модули: нет.

Special-runtime модули:

- `gantt` - живой Гант, специализированный canvas/timeline runtime;
- `visualSystem` - стенд UI-состояний, специализированный visual-system runtime.

Legacy-модули: нет.

`special` означает не "legacy", а отдельный проверяемый runtime-контракт для экранов, которые нельзя валидировать как обычную панельную страницу.

## Что теперь проверяется

`scripts/module-smoke-qa.mjs` открывает модули в браузере и для hard-runtime страниц проверяет:

- что каждый hard-runtime модуль включен в smoke-список;
- наличие `data-ui-runtime="hard-v1"`;
- наличие `ModulePage`, `ModuleWorkspace`, `ModuleContent`;
- отсутствие горизонтального page overflow;
- отсутствие прямых наложений детей внутри `ModuleContent`;
- отсутствие `Panel` без прямого `PanelBody`;
- отсутствие видимых панелей, кнопок, полей и table-wrap без `data-ui-component`;
- отсутствие выхода содержимого `PanelBody` за нижнюю границу панели;
- отсутствие наложений соседних flow-блоков внутри прямого `PanelBody`;
- отсутствие внутреннего вертикального scroll-контейнера у `TableWrap[data-scroll-contract="horizontal-only"]`.
- отсутствие ручного обхода runtime helper-а: `data-ui-runtime="hard-v1"` и `ModulePage` marker должны выпускаться только `renderUiModulePage()`.

Smoke QA использует тот же эталонный viewport, что и visual QA: MacBook Air 15, `1710x1112`.

`scripts/design-qa-snapshots.mjs` дополнительно делает `typographyWarnings` блокирующим дефектом для hard-runtime модулей. Внутренние тексты таблиц, карточек и рабочих блоков не должны самопроизвольно становиться крупнее 16 px или сверхжирными.

Все hard-runtime и special-runtime модули должны присутствовать в visual QA. `scripts/design-qa-snapshots.mjs` сверяет свой список с `HARD_UI_RUNTIME_MODULE_IDS` и `SPECIAL_UI_RUNTIME_MODULE_IDS` и падает до запуска браузера, если новый runtime-модуль не попал в экранный прогон MacBook Air 15. Для `authPrototype` покрытие идет отдельными состояниями авторизации, а не обычным открытием модуля.

`scripts/ui-contract-qa.mjs` дополнительно защищает сами проверки, чтобы hard-gates не исчезли при будущих рефакторах.

`scripts/ui-hardening-plan-qa.mjs` закрепляет исходный 11-шаговый план стабилизации UI как исполняемый gate. Это отдельный контроль от преждевременного закрытия больших UI-задач: каждый этап плана обязан иметь конкретные проверяемые признаки в runtime, CSS, smoke/browser QA или package scripts.

`scripts/ui-runtime-class-audit.mjs` сверяет CSS-классы ключевых hard-runtime префиксов с `src/app.js`. Сейчас под контролем auth/session, мастерская, журнал СЗН, табель, роли, права, план-таблица, матрица, заказ-наряды, технологии, справочники, снабжение/цех и живые planning/gantt/ui-shell префиксы. Если CSS-класс из этого списка остается без runtime-источника, `qa:ui` падает.

Тот же аудит проверяет весь CSS-граф на неожиданные CSS-only классы. Комментарии и строковые литералы CSS перед поиском маскируются, поэтому URL/import/SVG-строки не попадают в whitelist как ложные классы. Разрешены только динамические состояния `is-*`, `status-*`, `dense-select-*` и динамические row-классы `production-row`/`resource-row`/`workCenter-row`. Текущий глобальный CSS-only счетчик: 101 разрешенный класс, 0 неожиданных.

## Исправления прохода

- `Структура`, `Диспетчерская` и `Мастерская` переведены в hard-runtime покрытие.
- `Матрица` исправлена через общий `renderPlanningTableMatrix()`: таблица теперь находится внутри `PanelBody`.
- `Права` исправлены: матрица распределения мастеров и большая таблица структуры теперь используют `PanelBody`.
- `Табель` исправлен: hero-блок и табличный блок получили `PanelBody`, table wrapper получил общий `ui-table-wrap`.
- `План-таблица` исправлена: все основные панели блока теперь обернуты в `PanelBody`.
- CSS-контракт `TableWrap` усилен через `data-ui-component`, а не только через класс.
- Design snapshots усилены: типографические предупреждения в hard-runtime модулях теперь валят проверку.
- Design snapshots дополнены hard-модулями `shiftWorkOrders` и `authSessionPrototype`, которые раньше не попадали в экранный прогон.
- Design snapshots усилены runtime coverage guard: hard/special модуль больше не может выпасть из обычного или focus-прогона без падения QA.
- Module smoke усилен: hard-runtime модуль теперь не может выпасть из smoke-проверки без падения QA.
- Module smoke усилен: special-runtime модуль теперь тоже не может выпасть из smoke-проверки без падения QA.
- Module smoke запрещает `hard-v1` и specialized runtime markers вне соответствующих списков `HARD_UI_RUNTIME_MODULE_IDS`/`SPECIAL_UI_RUNTIME_MODULE_IDS`.
- Module smoke усилен для вложенной геометрии: соседние flow-блоки внутри `PanelBody` больше не могут наезжать друг на друга без падения QA.
- Добавлен `ui-runtime-class-audit`: CSS hard-runtime префиксов больше не может накапливать классы без источника в `src/app.js`.
- Module smoke усилен для alias-страниц: `bomLists`, `speki`, `specifications` и другие alias теперь проходят hard-runtime проверки по целевому модулю.
- Module smoke получил отдельный `gantt-v1` gate: живой Гант проверяется как `GanttRuntime`/`GanttCanvas`/`GanttTimeline`/`GanttRowsLayer`/`GanttSlot`/`GanttDependencyLayer`, а не как обычная панельная страница.
- `gantt-v1` gate дополнительно проверяет drift slot-маркеров, базовую геометрию первой колбаски и наличие `GanttOperationalLayer`/`GanttOperationalSegment` для распределенных или фактических слотов.
- `gantt-v1` gate открывает первый слот двойным кликом и проверяет opened-state edit surface выбранной операции: актуальная модалка редактирования `Modal` или совместимый `Drawer`.
- `gantt-v1` gate проверяет `GanttNonWorkingLayer`/`GanttNonWorkingZone` и отсекает зоны с нулевой геометрией.
- `gantt-v1` gate выполняет короткий pointer-drag по живой колбаске и проверяет `GanttSnapOverlay`/`GanttDragGhost`/`GanttSnapGuide`.
- `gantt-v1` gate выполняет pointer-resize через `GanttResizeHandle` и проверяет resize-mode snap guide.
- `gantt-v1` gate проверяет `GanttDependencySlotMask`/`GanttDependencySlotMaskRect`, `marker-end` и mask у dependency paths, чтобы стрелки не теряли защиту читаемости рядом с колбасками.
- Module smoke получил отдельный `visual-system-v1` gate: стенд UI-состояний проверяется как `VisualSystemRuntime` и не смешивается с рабочими hard-модулями.
- `visual-system-v1` gate дополнительно проверяет три Gantt-колонки масштаба, набор fact-сценариев и образцы передачи.
- `visual-system-v1` gate измеряет Gantt samples и валит проверку, если колбаски, transfer-flow или dependency sample выходят за свою колонку.
- UI contract усилен source-level guard: hard-runtime marker нельзя размножить вручную вне `renderUiModulePage()`.
- UI contract усилен source-level guard: живые страницы нельзя собирать ручным literal `module-data-page`; для обычных модулей используется только `renderUiModulePage()`.
- Удалены мертвые ручные page-shell: старый `renderPlanningPage`, старый `renderSpecificationsPage`, старый экран `object-tree`.
- Удалены старые CSS/runtime хвосты `object-tree` и старого `spec-constructor/spec-structure` слоя; `ui-contract` запрещает их возврат рядом с текущим `speki` runtime.
- Удален старый ручной planning work editor: `work-nav`, `required/composition/operations` панели, старый `order-placement` конструктор, dead placement handlers и связанные CSS-хвосты по всем CSS-слоям.
- `ui-contract` и `legacy-inventory` теперь запрещают возврат старого planning work editor слоя в JS, CSS и UI Core.
- Удалены неиспользуемые CSS-хвосты старой route/staff авторизации, включая `staff-login/pin/result`, `department-strip`, `executor-grid`, `role-grid`, `search`; auth CSS-аудит по runtime-классам теперь дает 0 отсутствующих классов.
- Удалены неиспользуемые CSS-хвосты старых `planning-order-*` макетов и весь старый `scada-*` слой; возврат этих классов запрещен через `ui-contract` и `legacy-inventory`.
- Удалены мертвые CSS-хвосты текущей доски Мастерской: старый `shift-master-board-load` и `shift-master-board-detail-head`; аудит `shift-master-board-*` классов теперь дает 0 отсутствующих runtime-классов.
- CSS duplicate budget снижен с 584 до 470 групп, то есть до фактического уровня после чистки; рост дублей теперь будет падать в `qa:css`.
- `ui-runtime-class-audit` расширен на технологический контур: `route-*`, `routes-*`, `speki-*`, `bom-*`, `nomenclature-*`. CSS технологических модулей теперь тоже обязан иметь живую runtime-опору в `src/app.js`.
- `ui-runtime-class-audit` также закрывает runtime-хвосты `employee-*`, `employees-*`, `directory-*`, `dispatch-*`, `supply-*`, `shop-*`, `shop-map-*`, `product-*`, `products-*`; CSS-only классы этих hard-модулей теперь считаются ошибкой.
- Старый CSS-only `spec-*`/`specification-*` конструктор удален точечно; живые `spec-bom-plan-*`, `specification-list-*` и `speki-*` оставлены и защищены class-audit'ом.
- Старые standalone-классы stepper/guided/process удалены; живые `operation-*` классы защищены class-audit'ом.
- Старые `slot-*` хвосты прежнего контента/ручного количества Ганта удалены; живые `slot-working/non-working/operational/transfer/quantity-badge` классы остались и закрыты class-audit'ом.
- Старые `planning-*` supply/chain/sidebar хвосты и старые generic `module-*` header/status/kpi/logout классы удалены; живые `planning-*` и `module-*` классы теперь защищены class-audit'ом.
- Дополнительно вычищены старые `auth/access/smt/visual/row/bar/modal/app` CSS-only хвосты; эти префиксы включены в `ui-runtime-class-audit`.
- `ui-runtime-class-audit` теперь проверяет весь CSS-граф на неожиданные CSS-only классы. Перед поиском классов он маскирует комментарии и строковые литералы CSS. Разрешены только задокументированные динамические паттерны: `is-*`, `status-*`, `dense-select-*`, `production-row`, `resource-row`, `workCenter-row`. Фактический счетчик после чистки: 101 разрешенный CSS-only класс, 0 неожиданных.
- Удален мертвый модификатор `.module-sidebar-actions.two`; сайдбарные action-зоны теперь не держат скрытый двухколоночный legacy-режим.
- Удален последний найденный глобальным class-audit мертвый CSS-хвост `production-resource-factor-panel`; живой стиль расчета ресурсов остается через `route-step-resource-factors`.
- Исправлено focus-состояние модуля `Роли`: глобальное схлопывание `.module-data-page` в одну колонку больше не ломает RBAC-sidebar, редактор ролей сохраняет двухколоночную рабочую сетку и проходит inset-аудит design snapshots.
- `Снабжение` переведено с ручной оболочки на `renderUiModulePage()`/`renderUiModuleSidebar()` и добавлено в hard-runtime список.
- `Цех производства` переведен с ручной оболочки на `renderUiModulePage()` и получил `PanelBody` в рабочих панелях карты.
- `Справочники` переведены с ручной оболочки на `renderUiModulePage()`/`renderUiModuleSidebar()`, таблица справочника теперь находится внутри `PanelBody`.
- `Спецификации` переведены на `renderUiModulePage()`, а рабочая таблица состава закреплена внутри `PanelBody`.
- `Номенклатура` переведена на `renderUiModulePage()`: обычная вкладка и BOM-вкладка `bomLists` проходят hard-smoke как один контракт.
- `Маршрутная карта` переведена на `renderUiModulePage()`, карточка маршрута и редактор операций получили прямые `PanelBody`.
- `Заказ-наряды` переведены на `renderUiModulePage()`: shell, workspace и основные рабочие/detail-панели теперь проходят hard-smoke без изменения логики трудозатрат и передачи в Гант.

## Остаточный долг

- Legacy-модулей больше нет: все модули находятся либо в `hard`, либо в `special`.
- CSS-граф остается большим, но сокращен до 29 265 строк: аудит фиксирует duplicate selector groups на текущем бюджете 470, exact duplicate rules уже отсутствуют; старый planning work editor и мертвые auth/planning/scada CSS-хвосты вычищены до 0 hard-forbidden matches.
- `projectId` и `batchId` остаются как compatibility alias и контролируются legacy QA.

Подробная логика по special-runtime зонам: `docs/hard-ui-runtime-legacy-roadmap-v2.md`.
Технические детали по закрытию бывшего legacy: `docs/hard-ui-runtime-remaining-legacy-v2.md`.

## Обязательные проверки

Перед завершением прохода должны быть зелеными:

- `npm run qa:ui`;
- `npm run qa:module-smoke`;
- `npm run qa:stabilize`;
- `git diff --check`;
- `node scripts/build.mjs`.
