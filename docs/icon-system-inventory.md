# Icon System Inventory

## 1. Summary

- Total inventory entries: 82
- Unique icon records: 82
- Helper-based SVG icons: 54
- Static helper usage locations: 324
- Inline SVG groups outside helper: 8
- CSS icon/marker groups: 9
- Emoji/symbol icon groups: 3
- SVG asset files: 4
- Missing helper names / fallback-to-info records: 4

By module:
- shared: 25 records, 25 unique, contexts: other, visual-system, button, form, status, topbar, department-auth, risk: high
- gantt: 17 records, 17 unique, contexts: status, gantt, topbar, table-action, form, risk: high
- products: 6 records, 6 unique, contexts: visual-system, sidebar, button, form, status, risk: high
- routes: 5 records, 5 unique, contexts: button, other, table-action, risk: high
- authPrototype: 4 records, 4 unique, contexts: button, topbar, visual-system, risk: high
- planning: 4 records, 4 unique, contexts: table-action, operations-resources, risk: high
- visualSystem: 3 records, 3 unique, contexts: other, visual-system, risk: medium
- authSessionPrototype: 3 records, 3 unique, contexts: other, visual-system, risk: low
- employees: 3 records, 3 unique, contexts: operations-resources, risk: medium
- directories: 2 records, 2 unique, contexts: button, risk: low
- shopMap: 2 records, 2 unique, contexts: other, operations-resources, risk: high
- timesheet: 2 records, 2 unique, contexts: form, button, risk: medium
- shiftWorkOrders: 2 records, 2 unique, contexts: topbar, status, risk: high
- nomenclature: 1 records, 1 unique, contexts: other, risk: low
- supply: 1 records, 1 unique, contexts: other, risk: medium
- global-shell: 1 records, 1 unique, contexts: sidebar, risk: medium
- products/routes/planning: 1 records, 1 unique, contexts: table-action, risk: medium

By usage context:
- other: 24
- button: 9
- gantt: 9
- status: 8
- visual-system: 8
- table-action: 7
- form: 5
- operations-resources: 5
- topbar: 4
- sidebar: 2
- department-auth: 1

## 2. Icon source map

| source type | count | files | notes |
|---|---:|---|---|
| helper | 54 | src/app.js | Основной словарь icon(name), SVG inline templates. |
| inline-svg | 8 | src/app.js | Сгруппировано по визуальному/техническому смыслу. |
| css | 9 | styles/layers/30-module-shell-ui-foundations.css, styles/layers/10-shell-directory-gantt-base.css, styles/layers/50-nomenclature-routes-directories.css, styles/ui/planning-order.css, styles/layers/40-gantt-planning-routes.css, styles/layers/60-operational-modules.css | Сгруппировано по визуальному/техническому смыслу. |
| emoji | 3 | src/app.js | Сгруппировано по визуальному/техническому смыслу. |
| asset | 4 | favicon.svg, assets/production-floor-plan.svg, selected-row-color-options.svg, design/gantt-figma-first/figma-import-overview.svg | Сгруппировано по визуальному/техническому смыслу. |
| unknown | 4 | src/app.js | Имена, которых нет в helper; сейчас fallback на info. |

## 3. Icons by module

| module | icons count | unique icons | main contexts | risk |
|---|---:|---:|---|---|
| shared | 25 | 25 | other, visual-system, button, form, status, topbar, department-auth | high |
| gantt | 17 | 17 | status, gantt, topbar, table-action, form | high |
| products | 6 | 6 | visual-system, sidebar, button, form, status | high |
| routes | 5 | 5 | button, other, table-action | high |
| authPrototype | 4 | 4 | button, topbar, visual-system | high |
| planning | 4 | 4 | table-action, operations-resources | high |
| visualSystem | 3 | 3 | other, visual-system | medium |
| authSessionPrototype | 3 | 3 | other, visual-system | low |
| employees | 3 | 3 | operations-resources | medium |
| directories | 2 | 2 | button | low |
| shopMap | 2 | 2 | other, operations-resources | high |
| timesheet | 2 | 2 | form, button | medium |
| shiftWorkOrders | 2 | 2 | topbar, status | high |
| nomenclature | 1 | 1 | other | low |
| supply | 1 | 1 | other | medium |
| global-shell | 1 | 1 | sidebar | medium |
| products/routes/planning | 1 | 1 | table-action | medium |

## 4. Icons by context

### navigation

- refresh (refresh) — обновить, пересчитать, оптимизировать, отмывка
- chevron-down (chevronDown) — раскрыть, выпадающее меню, вниз
- arrow-left (arrowLeft) — назад, предыдущий, outdent
- arrow-right (arrowRight) — вперед, следующий, indent/open
- focus (focus) — режим фокуса/полный экран
- module-brand-letter-m (moduleMenuBrandM) — бренд MES в главном сайдбаре

### sidebar

- chevron-down (chevronDown) — раскрыть, выпадающее меню, вниз
- module-brand-letter-m (moduleMenuBrandM) — бренд MES в главном сайдбаре

### topbar

- refresh (refresh) — обновить, пересчитать, оптимизировать, отмывка
- arrow-left (arrowLeft) — назад, предыдущий, outdent
- arrow-right (arrowRight) — вперед, следующий, indent/open
- focus (focus) — режим фокуса/полный экран

### buttons

- filter (filter) — фильтр данных, отбор строк
- package-inventory (package) — номенклатура, склад, упаковка, изделие
- worker (worker) — исполнитель, мастерская, рабочий персонал
- directory (directory) — справочник, права, реестр данных
- today (today) — сегодня, переход к текущей дате
- reset (reset) — сброс настроек/дня/графика
- chevron-up (chevronUp) — свернуть, поднять строку
- split (split) — узел, сборка, разделение маршрута
- lock (lock) — авторизация, роль, доступ закрыт

### table actions

- info (info) — информация, пустое состояние, подсказка
- edit (edit) — редактировать
- trash (trash) — удалить объект
- trash-soft (trashSoft) — удалить строку/позицию без тяжелого danger
- tree-branch-css (treeBranchCss) — иерархия строк таблицы
- missing-open (open) — несогласованность между iconName/icon и словарем icon()
- missing-print (print) — несогласованность между iconName/icon и словарем icon()

### status

- search (search) — поиск, инспекция, AOI, фильтрация результатов
- alert (alert) — ошибка, риск, предупреждение, критичность
- check (check) — готово, подтверждение, качество, ОТК
- close (close) — закрыть, отмена, снять выбор
- play (play) — старт, взять в работу, статус
- download (download) — экспорт, печать PDF, скачать
- speki-section-tooltip-css (spekiSectionTooltipCss) — объяснение типа строки или секции
- dash-empty-symbol (emptyDash) — нет данных / не задано

### department/auth

- missing-departments (departments) — несогласованность между iconName/icon и словарем icon()

### operations/resources

- employee-hierarchy-connectors (employeeHierarchyArrow) — показывает иерархические связи отделов/участков/ресурсов
- employee-hierarchy-arrow-marker (employeeHierarchyArrowMarker) — направление связи в структуре сотрудников и ресурсов
- planning-transfer-link-css (planningTransferLinkCss) — связь до/сейчас/после операции
- initials-avatar (employeeInitials) — сотрудник без отдельной иконки/фото
- production-floor-plan (production-floor-plan.svg) — карта цеха и производственных зон

### Gantt

- gantt (gantt) — планирование, временная шкала, линия SMT
- plus (plus) — добавить строку/запись/масштаб
- minus (minus) — уменьшить масштаб
- gantt-dependency-layer (ganttDependencyLayer) — визуальные связи между плановыми слотами
- gantt-dependency-arrow (ganttDependencyArrow) — направление зависимости между операциями
- gantt-dependency-edit-hit (dependencyEditHit) — интерактивная зона редактирования связи
- operation-slot-locked-letter-l (lockedSlotL) — зафиксированная операция в Ганте
- gantt-week-boundary-css (ganttWeekBoundaryCss) — разделитель временной шкалы
- transfer-batch-indicator-css (transferBatchIndicatorCss) — передача количества между операциями

### forms

- calendar (calendar) — дата, табель, заказ-наряды, период планирования
- clock (clock) — время, длительность, ритм
- save (save) — сохранить, зафиксировать
- select-chevron-css (selectChevronCss) — выпадающий список
- toggle-knob-css (toggleKnobCss) — включено/выключено

### overlays

- none

### visualSystem

- document (document) — СЗН, документ, печатная форма, инструкция PDF
- pcb-bom (bom) — BOM, печатная плата, SMT, электронный состав
- operation (operation) — операция маршрута, участок, производственная связь
- camera (camera) — фото report с планшета
- tree (tree) — структура изделия, дерево документов
- pin-backspace-apple (backspaceApple) — удаление последней цифры PIN
- visual-gantt-dependency-sample (visualGanttDependency) — эталон отображения зависимости операций
- visual-gantt-transfer-arrow (visualGanttTransferArrow) — передача между этапами маршрута

## 5. Department icons

| department | current icon | visual meaning | real department operation | replacement keywords | suggested icon concepts |
|---|---|---|---|---|---|
| Административный отдел | settings/lock/target | settings/lock/target | управление производством, права, вход руководителя | administration department access settings target icon | settings, target, shield-user |
| Отдел нанесения влагозащитных покрытий | package | package | нанесение покрытий, работа с изделием/партией | conformal coating electronics package protection icon | spray-can, shield, package |
| Отдел поверхностного монтажа | bom/gantt | bom/gantt | SMT, линии поверхностного монтажа, плата | surface mount technology circuit board production line icon | circuit-board, cpu, chart-gantt |
| Отдел программной подготовки изделий | settings/keyboard | settings/keyboard | прошивка, настройка, программирование | firmware programming settings keyboard icon | settings, keyboard, terminal |
| Отдел ручного монтажа | operation/worker | operation/worker | ручной монтаж, пайка, исполнитель | manual assembly soldering worker operation icon | hard-hat, workflow, hand-metal |
| Отдел технического контроля | check/monitor | check/monitor | контроль качества, проверка, ОТК | quality control check monitor inspection icon | circle-check, monitor-check, scan-eye |
| Сервисный отдел | document | document | сервисные работы и документы | service department document tool icon | wrench, file-text, life-buoy |
| Склад | warehouse/package | warehouse/package | склад, выдача/возврат, хранение | warehouse inventory package icon | warehouse, package, boxes |
| Технологический отдел | book/routeEdit | book/routeEdit | маршруты, документация, технология | technology department route documentation icon | book-open, route, pencil-ruler |
| Слесарно-сборочный отдел | settings/tree | settings/tree | сборка, механические операции, узлы | mechanical assembly department tree settings icon | wrench, network, settings |
| Отдел маркировки и упаковки | package | package | маркировка, упаковка, финальная подготовка | marking packaging label package icon | package, tag, barcode |

## 6. Action icons

| action/currentName | current visual | main meaning | replacement keywords | risk |
|---|---|---|---|---|
| plus | плюс | добавить строку/запись/масштаб | plus add icon | low |
| edit | карандаш | редактировать | pencil edit icon | low |
| trash | корзина | удалить объект | trash delete icon | high |
| trashSoft | мягкая корзина | удалить строку/позицию без тяжелого danger | trash delete soft icon | high |
| copy | две копии | копировать | copy duplicate icon | low |
| download | стрелка вниз | экспорт, печать PDF, скачать | download export icon | high |
| upload | стрелка вверх | загрузка файла/фото | upload file icon | high |
| search | поиск / лупа | поиск, инспекция, AOI, фильтрация результатов | search magnifier inspection icon | low |
| filter | воронка фильтра | фильтр данных, отбор строк | filter funnel data table icon | low |
| reset | стрелка сброса | сброс настроек/дня/графика | reset undo circular arrow icon | low |
| save | дискета | сохранить, зафиксировать | save disk icon | high |
| close | крестик | закрыть, отмена, снять выбор | x close cancel icon | high |
| chevronDown | стрелка вниз | раскрыть, выпадающее меню, вниз | chevron down expand icon | low |
| chevronUp | стрелка вверх | свернуть, поднять строку | chevron up collapse move up icon | low |
| chevronRight | стрелка вправо | раскрыть дерево, следующий уровень | chevron right expand tree icon | low |
| arrowLeft | стрелка влево | назад, предыдущий, outdent | arrow left back previous icon | low |
| arrowRight | стрелка вправо | вперед, следующий, indent/open | arrow right next forward icon | low |
| settings | шестеренка | настройка, программирование, ресурс/станок | settings gear configuration icon | low |
| alert | треугольник предупреждения | ошибка, риск, предупреждение, критичность | warning triangle alert icon | high |
| info | круг info | информация, пустое состояние, подсказка | info circle icon | low |
| check | галочка | готово, подтверждение, качество, ОТК | check success approval icon | high |
| calendar | календарь | дата, табель, заказ-наряды, период планирования | calendar date schedule icon | medium |
| worker | рабочий в каске | исполнитель, мастерская, рабочий персонал | worker hard hat production operator icon | medium |
| lock | замок закрыт | авторизация, роль, доступ закрыт | lock access icon | high |
| unlock | замок открыт | успешная авторизация, доступ открыт | unlock access granted icon | high |
| route | маршрут с точками | маршрут операции, переход между этапами | route path nodes icon | medium |
| routeEdit | маршрут с карандашом | редактирование маршрута, технологический маршрут | route edit pencil icon | medium |
| gantt | линейки диаграммы Ганта | планирование, временная шкала, линия SMT | gantt chart timeline icon | medium |

## 7. Replacement strategy

1. Сначала заменить navigation/module icons: это самая видимая зона, но она централизована через `getModuleDefinitions()` и helper `icon(name)`.
2. Потом department/auth icons: они влияют на быстрый выбор отдела на планшете, но часть маппинга сейчас динамическая.
3. Потом table action icons: delete/edit/open/print/save должны быть максимально распознаваемыми и одинаковыми.
4. Потом status icons: alert/check/info/lock нельзя менять без проверки сигналов риска и готовности.
5. Потом Gantt icons и inline SVG: здесь высокий риск, потому что часть SVG является геометрией зависимостей, а не простой пиктограммой.
6. Потом decorative/demo icons и CSS-generated symbols: их можно привести к общему стилю после основных действий.

## 8. Open-source search keywords

| semanticSlug | meaning | English search query | Russian search query | possible icon names | recommended libraries |
|---|---|---|---|---|---|
| search | поиск, инспекция, AOI, фильтрация результатов | search magnifier inspection icon | иконка поиск, инспекция, AOI, фильтрация результатов | search, scan-search, scan-eye | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| filter | фильтр данных, отбор строк | filter funnel data table icon | иконка фильтр данных, отбор строк | filter, funnel | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| bug | дефект, баг, report, проблема интерфейса | bug issue report icon | иконка дефект, баг, report, проблема интерфейса | bug, bug-off | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| monitor | диспетчерская, контроль, экран мониторинга | monitor dashboard analytics icon | иконка диспетчерская, контроль, экран мониторинга | monitor, activity, chart-no-axes-combined | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| map | карта цеха, план помещений | map floor plan workshop icon | иконка карта цеха, план помещений | map, map-pinned | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| palette | UI-состояния, визуальная система | palette design system icon | иконка UI-состояния, визуальная система | palette | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| target | цель, фокус, начальник производства | target goal production control icon | иконка цель, фокус, начальник производства | target, crosshair | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| selection | выделение, список вариантов | selection list icon | иконка выделение, список вариантов | list-checks, rows-3 | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| keyboard | рабочий стол, ввод PIN/данных | keyboard tablet input icon | иконка рабочий стол, ввод PIN/данных | keyboard | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| book | технологический отдел, документация | book manual documentation icon | иконка технологический отдел, документация | book-open, book-text | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| document | СЗН, документ, печатная форма, инструкция PDF | document file work order icon | иконка СЗН, документ, печатная форма, инструкция PDF | file-text, clipboard-list, scroll-text | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| pcb-bom | BOM, печатная плата, SMT, электронный состав | circuit board bom pcb icon | иконка BOM, печатная плата, SMT, электронный состав | circuit-board, cpu, microchip | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| package-inventory | номенклатура, склад, упаковка, изделие | package box inventory icon | иконка номенклатура, склад, упаковка, изделие | package, box | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| supply | снабжение, логистика, поставка компонентов | truck supply logistics icon | иконка снабжение, логистика, поставка компонентов | truck, package-check | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| worker | исполнитель, мастерская, рабочий персонал | worker hard hat production operator icon | иконка исполнитель, мастерская, рабочий персонал | hard-hat, user-round-cog, factory | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| warehouse | склад, хранение, выдача и возврат | warehouse storage icon | иконка склад, хранение, выдача и возврат | warehouse, house | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| directory | справочник, права, реестр данных | folder directory catalog icon | иконка справочник, права, реестр данных | folder, database | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| operation | операция маршрута, участок, производственная связь | workflow nodes operation icon | иконка операция маршрута, участок, производственная связь | workflow, git-branch | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| settings | настройка, программирование, ресурс/станок | settings gear configuration icon | иконка настройка, программирование, ресурс/станок | settings, cog | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| calendar | дата, табель, заказ-наряды, период планирования | calendar date schedule icon | иконка дата, табель, заказ-наряды, период планирования | calendar-days, calendar | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| camera | фото report с планшета | camera photo attachment icon | иконка фото report с планшета | camera | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| today | сегодня, переход к текущей дате | today calendar current date icon | иконка сегодня, переход к текущей дате | calendar-clock, calendar-check | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| gantt | планирование, временная шкала, линия SMT | gantt chart timeline icon | иконка планирование, временная шкала, линия SMT | chart-gantt, timeline | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| route-edit | редактирование маршрута, технологический маршрут | route edit pencil icon | иконка редактирование маршрута, технологический маршрут | route, pencil-ruler | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| route | маршрут операции, переход между этапами | route path nodes icon | иконка маршрут операции, переход между этапами | route, git-branch | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| tree | структура изделия, дерево документов | hierarchy tree structure icon | иконка структура изделия, дерево документов | network, tree-pine, list-tree | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| refresh | обновить, пересчитать, оптимизировать, отмывка | refresh sync recalculate icon | иконка обновить, пересчитать, оптимизировать, отмывка | refresh-cw, rotate-cw | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| reset | сброс настроек/дня/графика | reset undo circular arrow icon | иконка сброс настроек/дня/графика | undo-2, history | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| plus | добавить строку/запись/масштаб | plus add icon | иконка добавить строку/запись/масштаб | plus | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| minus | уменьшить масштаб | minus zoom out icon | иконка уменьшить масштаб | minus | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| clock | время, длительность, ритм | clock time duration icon | иконка время, длительность, ритм | clock | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| chevron-down | раскрыть, выпадающее меню, вниз | chevron down expand icon | иконка раскрыть, выпадающее меню, вниз | chevron-down | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| chevron-up | свернуть, поднять строку | chevron up collapse move up icon | иконка свернуть, поднять строку | chevron-up | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| chevron-right | раскрыть дерево, следующий уровень | chevron right expand tree icon | иконка раскрыть дерево, следующий уровень | chevron-right | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| alert | ошибка, риск, предупреждение, критичность | warning triangle alert icon | иконка ошибка, риск, предупреждение, критичность | triangle-alert | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| info | информация, пустое состояние, подсказка | info circle icon | иконка информация, пустое состояние, подсказка | info | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| check | готово, подтверждение, качество, ОТК | check success approval icon | иконка готово, подтверждение, качество, ОТК | check | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| close | закрыть, отмена, снять выбор | x close cancel icon | иконка закрыть, отмена, снять выбор | x | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| arrow-left | назад, предыдущий, outdent | arrow left back previous icon | иконка назад, предыдущий, outdent | arrow-left | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| pin-backspace-apple | удаление последней цифры PIN | backspace keyboard delete key icon | иконка удаление последней цифры PIN | delete, badge-x | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| arrow-right | вперед, следующий, indent/open | arrow right next forward icon | иконка вперед, следующий, indent/open | arrow-right | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| edit | редактировать | pencil edit icon | иконка редактировать | pencil | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| play | старт, взять в работу, статус | play start run icon | иконка старт, взять в работу, статус | play | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| split | узел, сборка, разделение маршрута | split branch assembly icon | иконка узел, сборка, разделение маршрута | split, git-fork | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| trash | удалить объект | trash delete icon | иконка удалить объект | trash-2 | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| trash-soft | удалить строку/позицию без тяжелого danger | trash delete soft icon | иконка удалить строку/позицию без тяжелого danger | trash | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| save | сохранить, зафиксировать | save disk icon | иконка сохранить, зафиксировать | save | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| chart | матрица, аналитика, метрики | bar chart analytics icon | иконка матрица, аналитика, метрики | chart-column | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| upload | загрузка файла/фото | upload file icon | иконка загрузка файла/фото | upload | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| download | экспорт, печать PDF, скачать | download export icon | иконка экспорт, печать PDF, скачать | download | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| copy | копировать | copy duplicate icon | иконка копировать | copy | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| focus | режим фокуса/полный экран | focus fullscreen icon | иконка режим фокуса/полный экран | scan, maximize | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| lock | авторизация, роль, доступ закрыт | lock access icon | иконка авторизация, роль, доступ закрыт | lock-keyhole | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| unlock | успешная авторизация, доступ открыт | unlock access granted icon | иконка успешная авторизация, доступ открыт | unlock-keyhole | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| employee-hierarchy-connectors | показывает иерархические связи отделов/участков/ресурсов | organization hierarchy connector arrow svg | иконка показывает иерархические связи отделов/участков/ресурсов | arrow-right, route, workflow, git-branch | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| employee-hierarchy-arrow-marker | направление связи в структуре сотрудников и ресурсов | small arrow marker svg hierarchy connector | иконка направление связи в структуре сотрудников и ресурсов | arrow-right, route, workflow, git-branch | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| visual-gantt-dependency-sample | эталон отображения зависимости операций | gantt dependency arrow icon line | иконка эталон отображения зависимости операций | arrow-right, route, workflow, git-branch | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| visual-gantt-transfer-arrow | передача между этапами маршрута | curved transfer arrow production icon | иконка передача между этапами маршрута | arrow-right, route, workflow, git-branch | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| route-print-qr-placeholder | машиночитаемый идентификатор печатного документа | qr code placeholder icon | иконка машиночитаемый идентификатор печатного документа | arrow-right, route, workflow, git-branch | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| gantt-dependency-layer | визуальные связи между плановыми слотами | gantt dependency connector arrow | иконка визуальные связи между плановыми слотами | arrow-right, route, workflow, git-branch | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| gantt-dependency-arrow | направление зависимости между операциями | timeline dependency arrow marker icon | иконка направление зависимости между операциями | arrow-right, route, workflow, git-branch | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| gantt-dependency-edit-hit | интерактивная зона редактирования связи | svg hit area connector line icon | иконка интерактивная зона редактирования связи | arrow-right, route, workflow, git-branch | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| module-brand-letter-m | бренд MES в главном сайдбаре | MES letter mark app sidebar logo | иконка бренд MES в главном сайдбаре | chevron-down, badge, circle, corner-down-right | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| operation-slot-locked-letter-l | зафиксированная операция в Ганте | locked task badge icon | иконка зафиксированная операция в Ганте | chevron-down, badge, circle, corner-down-right | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| select-chevron-css | выпадающий список | select chevron down icon | иконка выпадающий список | chevron-down, badge, circle, corner-down-right | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| tree-branch-css | иерархия строк таблицы | tree branch connector line icon | иконка иерархия строк таблицы | chevron-down, badge, circle, corner-down-right | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| planning-transfer-link-css | связь до/сейчас/после операции | process transfer connector line icon | иконка связь до/сейчас/после операции | chevron-down, badge, circle, corner-down-right | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| toggle-knob-css | включено/выключено | toggle switch knob icon | иконка включено/выключено | chevron-down, badge, circle, corner-down-right | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| speki-section-tooltip-css | объяснение типа строки или секции | info tooltip badge icon | иконка объяснение типа строки или секции | chevron-down, badge, circle, corner-down-right | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| gantt-week-boundary-css | разделитель временной шкалы | timeline week boundary marker | иконка разделитель временной шкалы | chevron-down, badge, circle, corner-down-right | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| transfer-batch-indicator-css | передача количества между операциями | batch transfer marker icon | иконка передача количества между операциями | chevron-down, badge, circle, corner-down-right | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| initials-avatar | сотрудник без отдельной иконки/фото | user initials avatar icon | символ сотрудник без отдельной иконки/фото | user, minus, dot | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| dash-empty-symbol | нет данных / не задано | empty state dash symbol | символ нет данных / не задано | user, minus, dot | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| middle-dot-separator | разделение кратких атрибутов | middle dot separator UI symbol | символ разделение кратких атрибутов | user, minus, dot | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| favicon | служебный графический asset проекта | favicon svg asset icon | иконка asset favicon.svg | image, file-image | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| production-floor-plan | карта цеха и производственных зон | production floor plan svg icon map | SVG карта производственного цеха | map, factory, floor-plan | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| selected-row-color-options | служебный графический asset проекта | selected-row-color-options svg asset icon | иконка asset selected-row-color-options.svg | image, file-image | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| figma-import-overview | служебный графический asset проекта | figma-import-overview svg asset icon | иконка asset figma-import-overview.svg | image, file-image | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| missing-departments | несогласованность между iconName/icon и словарем icon() | departments icon | иконка departments | departments | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| missing-open | несогласованность между iconName/icon и словарем icon() | open icon | иконка open | open | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| missing-print | несогласованность между iconName/icon и словарем icon() | print icon | иконка print | print | lucide, tabler, phosphor, heroicons, remix, material-symbols |
| missing-users | несогласованность между iconName/icon и словарем icon() | users icon | иконка users | users | lucide, tabler, phosphor, heroicons, remix, material-symbols |

## 9. Risks

- Critical recognition icons: `trash`, `save`, `close`, `alert`, `check`, `lock`, `unlock`, `download`, `upload`, `backspaceApple`.
- Do not replace Gantt dependency SVG/markers mechanically: they are geometry, masks and hit-areas, not just pictures.
- Department/auth icons need UX review because operators choose departments by touch and visual recognition.
- Missing helper names (`open`, `print`, `users`, `departments`) currently fall back to `info`; this should be corrected during replacement, not in this inventory task.
- CSS-generated tree/connector lines are part of table readability; changing them can break hierarchy perception.
- Keep stroke weight close to the current thin-line SVG style unless the whole icon system is migrated at once.

## 10. High replacement complexity

- gantt-dependency-layer (ganttDependencyLayer) — gantt/gantt: Inline SVG не заменять механически: часто связан с геометрией, marker-end, mask или hit-area.
- gantt-dependency-arrow (ganttDependencyArrow) — gantt/gantt: Inline SVG не заменять механически: часто связан с геометрией, marker-end, mask или hit-area.
- gantt-dependency-edit-hit (dependencyEditHit) — gantt/gantt: Inline SVG не заменять механически: часто связан с геометрией, marker-end, mask или hit-area.
- operation-slot-locked-letter-l (lockedSlotL) — gantt/gantt: CSS-generated icon/marker. При замене важно проверить layout, hit-area и псевдоэлементы.
- planning-transfer-link-css (planningTransferLinkCss) — planning/operations-resources: CSS-generated icon/marker. При замене важно проверить layout, hit-area и псевдоэлементы.
- toggle-knob-css (toggleKnobCss) — gantt/form: CSS-generated icon/marker. При замене важно проверить layout, hit-area и псевдоэлементы.
- gantt-week-boundary-css (ganttWeekBoundaryCss) — gantt/gantt: CSS-generated icon/marker. При замене важно проверить layout, hit-area и псевдоэлементы.
- transfer-batch-indicator-css (transferBatchIndicatorCss) — gantt/gantt: CSS-generated icon/marker. При замене важно проверить layout, hit-area и псевдоэлементы.
- production-floor-plan (production-floor-plan.svg) — shopMap/operations-resources: Файловый SVG asset. Не связан напрямую с helper icon(name).

## 11. Files produced

- `reports/icon-system-inventory.json` — full structured inventory.
- `reports/icon-system-inventory.csv` — compact inventory table.
- `reports/icon-usage-summary.json` — counts and missing helper names.
- `reports/icon-replacement-keywords.csv` — GPT/search-ready keyword table.
- `reports/icon-gallery.html` — local gallery with current SVG when renderable.

Production code was not changed by this audit.