# MES Contract Migration v1

Дата: 2026-06-20
Цель: разорвать смешение маршрутной карты, заказ-наряда, сменного заказ-наряда, слота планирования и факта диспетчерской без разрушения текущего localStorage.

## Главный принцип

Активное хранилище остается совместимым со старым прототипом, но UI и новая логика должны читать данные через контрактный слой.

Нельзя больше локально трактовать строки `status`, `planningStatus`, `batchId`, `projectId` или `routeId` в каждом модуле отдельно. Сначала объект переводится в view-model, затем UI показывает уже готовые:

- тип документа;
- источник документа;
- статус;
- визуальный сигнал;
- доступный переход;
- влияние на следующий модуль.

## Уровни документов

| Контракт | Что означает | Где сейчас хранится | Что важно |
| --- | --- | --- | --- |
| `routeCard` | Маршрутная карта: как делать | `planningState.routes` + `planningState.routeSteps` | Технологическая структура и операции |
| `workOrder` | Заказ-наряд: что и сколько произвести | пока производно от `route` | Плановый документ, очередь, количество, срок |
| `ganttSlot` | Размещение операции во времени | `planningState.slots` | Производственный план, календарь, ресурс |
| `shiftWorkOrder` | Сменный заказ-наряд | производно от `slot` + `shiftMasterAssignments` | Работа мастера, ресурс, исполнитель, печатный лист |
| `dispatchFact` | Отключенный контур факта диспетчерской | legacy/future storage boundary | Сейчас не используется рабочим модулем; факт смены ведет Мастерская |

## Переходы между модулями

| Переход | Источник | Получатель | Политика данных |
| --- | --- | --- | --- |
| `routeCardToWorkOrder` | Маршрутная карта | Заказ-наряды | `copy-reference`: заказ-наряд ссылается на маршрутную карту |
| `workOrderToGanttSlot` | Заказ-наряды | Планирование | `derive-plan`: операции превращаются в слоты |
| `ganttSlotToShiftWorkOrder` | Планирование | Мастерская | `derive-shift-slice`: слот становится сменным заданием |
| `shiftWorkOrderIssue` | Мастерская | Мастерская | `assign-resource`: мастер назначает ресурс и исполнителя |
| `shiftWorkOrderToDispatchFact` | Мастерская | Архив факта | `write-fact-layer`: факт закрывается в Мастерской и попадает в аналитический архив |
| `dispatchFactToPlanningCorrection` | Архив факта | Планирование | отключено: не создавать новые корректировки из placeholder-модуля |

## Матрица структуры как источник организации

После перехода на матрицу структуры производственные справочники отделов, участков, ресурсов, оборудования, сотрудников и нормативов не являются активным источником системы.

Рабочий источник:

```text
production_structure_matrix_data.js
  -> production_structure_service.js
  -> planningState.workCenters / ресурсы / сотрудники / графики
```

Правки пользователя в модуле "Матрица структуры" хранятся в `ui.productionStructureMatrixOverrides` и синхронизируются через `shared-state.sharedUi.productionStructureMatrixOverrides`. После применения правок `planningState.workCenters` должен пересобираться из матрицы.

Матрица передает в runtime не только иерархию, но и расчетную доступность: `calendarShiftWindow`, `calendarShiftHours`, `humanHoursPerShift`, `equipmentHoursPerShift`, `availabilityHoursPerShift`, `shiftHours`, `availabilitySource`.

Важно разделять две величины:

- `shiftHours` - календарная/оборудовательная длительность одной смены для расчета режима "плановое количество за смену";
- `availabilityHoursPerShift` / `humanHoursPerShift` - суммарная доступность людей/оборудования, которую использует Табель и будущая Мастерская.

Режим трудозатрат "смена" в заказ-наряде обязан считать длительность по `shiftHours`/календарному окну участка, а не по hardcoded `12 часов` и не по суммарным человеко-часам отдела.

Табель при обычном рабочем дне использует `humanHoursPerShift` сотрудника из матрицы. Если пользователь вручную меняет график/время в табеле, часы пересчитываются по введенному окну и становятся табельной корректировкой.

Табельные правки (`timesheetCellOverrides`, `timesheetScheduleOverrides`) и оперативный слой Мастерской (`shiftMasterBoardAssignments`, `shiftMasterBoardFacts`, `shiftMasterBoardCarryovers`) также входят в `shared-state.sharedUi`, потому что они уже участвуют в доступности исполнителей и визуальном слое Ганта.

Старые `directoryState.departments/resources/equipment/productionResources/norms/employees` допустимы только как legacy-вход для очистки или миграции старого localStorage. Возвращать их в UI справочников, default directoryState или новую бизнес-логику запрещено.

Старые идентификаторы участков допустимы только как alias при нормализации. Например, `D3_MANUAL_CC` больше не создается как отдельный рабочий центр: ручная лакировка остается операцией, но планируется в матричном центре `D3_CC`.

Hardcoded-таблица скоростей рабочих центров также запрещена. Рабочая длительность операции должна идти от трудозатрат заказ-наряда и параметров операции; матрица дает структуру, график, ресурс и доступность, но не должна подменяться старым runtime-справочником скоростей.

Все незавершенные слоты Ганта обязаны иметь `planningLaborSource: "work_order"` и валидный режим трудозатрат заказ-наряда: `fixed`, `unit`, `panel` или `shift`. Если в старом локальном состоянии найден слот без этого источника, normalizer мигрирует его в режим `unit` по уже существующему рабочему окну слота. Это сохраняет геометрию текущего плана, но переводит дальнейшие пересчеты на контракт заказ-наряда.

## Статусы

Одинаковые слова в разных модулях больше нельзя считать одним статусом.

Пример:

- `partial` в `workOrderPlanning` = часть операций заказ-наряда размещена;
- `partial` в `dispatchFact` = legacy/future значение, пока не должно появляться из UI Диспетчерской.

Поэтому каждый статус должен иметь пару:

```text
scope + value
```

Примеры:

```text
ganttSlot:completed
workOrderPlanning:scheduled
shiftAssignment:issued
shiftAssignment:fact_closed
```

## Где менять правила

Основной контрактный слой:

```text
src/mes_contracts.js
```

Там находятся:

- `MES_DOCUMENT_KINDS`;
- `MES_STATUS_CONTRACTS`;
- `MES_FLOW_MODULES`;
- `MES_FLOW_TRANSITIONS`;
- `getMesStatusView()`;
- `getMesStatusOptions()`;
- `getMesFlowTransitionView()`.
- `buildMesFlowEvent()`.

Если меняется смысл статуса или перехода между модулями, сначала правится этот файл. Только потом подключается конкретный UI.

## Расширение под будущую бизнес-логику

Для будущих изменений статусов и переходов действует правило "сначала контракт, потом экран":

1. Новый статус добавляется в `MES_STATUS_CONTRACTS` с уникальной парой `scope + value`.
2. Новый переход добавляется в `MES_FLOW_TRANSITIONS` с `from`, `to`, `statusScope`, `nextStatus` и `dataPolicy`.
3. UI получает список значений через `getMesStatusOptions(scope)`.
4. Любая строка экрана строится через view-model и может хранить `flowIn`, `flowToPlanning`, `flowToFact` или `flowToCorrection`.
5. Только после этого меняется конкретная обработка кнопки, формы или сохранения.

Это нужно, чтобы будущая логика "заказ-наряд планирует в производство, мастерская приближает план к реальности, диспетчерская корректирует планирование" не расползалась по десяткам локальных `if`.

## Backward compatibility

Поля, которые пока нельзя резко удалить:

- `projectId` как legacy alias для `specificationId`;
- `batchId` как legacy alias для `routeId`/`planningOrderId`;
- `planningState.routes` как источник и для маршрутной карты, и для заказ-наряда;
- `planningState.slots` как источник для сменных строк.

Эти поля должны читаться через нормализацию и view-model. Новый UI не должен строить на них отдельную семантику.

## Slot compatibility facade

После pass `Legacy Isolation & Prototype Acceleration v1` прямое чтение идентификаторов слота считается допустимым только в compatibility/helper зонах. Для новой логики использовать фасады:

| Helper | Зачем нужен |
| --- | --- |
| `getSlotRouteId(slot, state, legacyBatchRouteIdById)` | Возвращает маршрут/заказ-наряд слота с учетом старого `batchId` и `routeStepId` |
| `getSlotPlanningOrderId(slot, fallbackRouteId)` | Возвращает документ планирования слота без ручного выбора между `planningOrderId`, `routeId` и legacy `batchId`; `batchId` используется только последним fallback |
| `getSlotProductionContextId(slot)` | Возвращает производственный контекст: сначала `specificationId`, затем legacy `projectId` |
| `slotMatchesProductionContext(slot, productionId)` | Единая проверка принадлежности слота изделию/спецификации |
| `slotMatchesPlanningOrder(slot, planningOrderId)` | Единая проверка принадлежности слота заказ-наряду/маршруту |

Эти helper не дают новым модулям копировать старую логику вида `slot.projectId === ... && slot.batchId === ...`. После CSS/UI stabilization pass нормализатор также переносит старые `slot.batchId` в актуальные `routeId` / `planningOrderId` и больше не сохраняет `batchId` обратно в новые слоты.

Legacy `route.planningStatus = "planned"` больше не должен жить в сохраненном состоянии. Нормализатор переводит его в контрактный `workOrderPlanning:queued`, а `qa:state` проверяет эту миграцию на перезагрузке.
Статус `planned` остается допустимым только для `ganttSlot:planned`. Строка справочника `route-planned` удалена как старый шум, а `qa:flow` запрещает возвращать default status `workOrderPlanning:planned`.
`getMesStatusContract(scope, value)` больше не делает cross-scope fallback при явно переданном `scope`: `workOrderPlanning:planned` не должен подставлять `ganttSlot:planned`. Backward-compatible lookup по одному `value` допустим только если scope пустой.

В `src/validation.js` прямые сравнения `slot.status` запрещены вне helper-зоны. Для прогресса и проверок использовать `validationSlotHasStatus()`, чтобы будущие изменения статусной модели не расходились с runtime-слоем.
Порядок fallback для заказ-наряда в validation должен совпадать с runtime: `planningOrderId -> routeId -> legacy batchId`. `batchId` не должен перехватывать актуальную связь слота.

## Warning compatibility facade

Предупреждения Ганта и аналитики больше не должны отдавать наружу старую пару `projectId` / `batchId` как основной контракт. Новая форма:

| Helper | Зачем нужен |
| --- | --- |
| `getWarningProductionId(warning)` | Возвращает изделие/спецификацию предупреждения: сначала `productionId`, затем legacy `projectId` |
| `getWarningPlanningOrderId(warning)` | Возвращает заказ-наряд/документ планирования: сначала `planningOrderId`, затем legacy `batchId` |

Прямое чтение `warning.projectId` / `warning.batchId` допустимо только внутри этих fallback-helper. Новые предупреждения должны формироваться с `productionId` и `planningOrderId`.

## Запрещенные паттерны после миграции

- Добавлять новый статус как просто строку в UI.
- Выбирать цвет статуса внутри конкретного компонента без `getMesStatusView()`.
- Рендерить CSS-класс напрямую через `status-${slot.status}`.
- Сравнивать `slot.status` или `route.planningStatus` в UI/модульной логике без contract-helper.
- Называть слот Ганта заказ-нарядом без `shiftWorkOrder`/`workOrder` контекста.
- Использовать `batchId` как новую бизнес-сущность.
- Искать маршрут слота локально через `slot.routeId` в каждом модуле. Общий `getSlotRoute(slot)` обязан сначала использовать `getSlotRouteId(slot, planningState)`, чтобы `routeId`, `planningOrderId` и legacy `batchId` не расходились.
- Добавлять новый переход между модулями без записи в `MES_FLOW_TRANSITIONS`.
- Указывать в `MES_FLOW_TRANSITIONS.sourceModule` / `targetModule` название, которого нет в `MES_MODULE_FLOW_CONTRACTS.label`.
- Возвращать прямую кнопку/handler передачи из `Маршрутной карты` в Gantt. Допустимый путь: `Маршрутная карта -> Заказ-наряд -> Планирование`. `qa:flow` проверяет, что `schedulePlanningRouteToGantt()` объявлен и вызывается только в контуре Заказ-нарядов.

## MES Flow Hardening Pass v1

Дата: 2026-06-20
Цель: закрепить "рельсы" после миграции, чтобы новые модули не возвращали старые трактовки статусов и документов.

Что добавлено:

- `getMesFlowTransitionsForStatus(scope, value)` в `src/mes_contracts.js`;
- helper-слой в `src/app.js` для `ganttSlot` и `workOrderPlanning`;
- справочник статусов показывает `Контракт`, `Переход` и `Следующий документ`;
- `scripts/flow-contract-qa.mjs`;
- npm-команда `npm run qa:flow`.

`npm run qa:flow` проверяет:

- все базовые документы существуют в `MES_DOCUMENT_KINDS`;
- все базовые переходы существуют в `MES_FLOW_TRANSITIONS`;
- каждый переход имеет `from`, `to`, `statusScope`, `nextStatus`, `dataPolicy`;
- каждый `statusScope + nextStatus` из перехода существует в `MES_STATUS_CONTRACTS`;
- в UI нет прямого `status-${slot.status}`;
- в UI нет прямого `GANTT_SLOT_STATUS_LABELS[slot.status]`;
- в UI нет прямых сравнений `slot.status === ...` или `route.planningStatus === ...`;
- `SLOT_STATUSES` не используется как источник UI-списка вместо contract options.
- наличие slot compatibility helper layer;
- запрет прямых сравнений `slot.projectId/specificationId` и `slot.batchId/planningOrderId/routeId`, чтобы новые изменения не обходили slot facade.
- запрет прямого чтения `slot.projectId` / `slot.batchId` вне двух зон: миграция старых сохранений и slot compatibility facade.
- запрет прямого чтения `warning.projectId` / `warning.batchId` вне warning compatibility facade.
- запрет прямого чтения slot alias в `src/validation.js` вне validation facade, чтобы предупреждения Ганта не начинали группировать данные по старым полям.

Допустимые исключения:

- запись `slot.status = ...`, если значение берется из `GANTT_SLOT_STATUS_VALUES`;
- `projectId` и `batchId` в legacy compatibility / migration / helper-зонах;
- `batchId` как технический alias `routeId`/`planningOrderId`, но не как новая бизнес-сущность.
- прямые `slot.projectId` / `slot.batchId` допустимы только внутри `normalizePlanningState()` при переносе старых сохранений и внутри helper-слоя `getSlot*()`.
- прямые `warning.projectId` / `warning.batchId` допустимы только внутри helper-слоя `getWarning*()`.

## Legacy backlog после ночного pass

| Хвост | Текущий статус | Почему не удален сразу | Правило для новой работы |
| --- | --- | --- | --- |
| `warehouse-page/sidebar/table` | запрещен в runtime/CSS, должен быть 0 | модуль Склад выпилен | не возвращать; складская операция допустима только как `material-transfer-slot` / `is-warehouse` семантика маршрута и Ганта |
| `material-transfer-slot` / `is-warehouse` | live-маркер | нужен для выдачи/возврата в производственных операциях и визуала Ганта | не использовать как новый модуль Склад |
| `planning-v2` | старое UI-имя текущих Заказ-нарядов | runtime/CSS уже переведены на `planning-order-*` | не возвращать в runtime/CSS; новые helper/view-model можно называть `workOrder`, визуальные классы держать в `planning-order-*` |
| `planning-batch` | удален из runtime/CSS как UI-имя | оставлен в `qa:legacy` только как запрещенный возврат | для размещения заказ-наряда использовать `planning-order-placement-*`, не возвращать batch-термин в UI |
| `projectId` | legacy alias для `specificationId` | нужен для чтения старых preset/localStorage | новая логика должна читать через `getSlotProductionContextId()` / route/specification helpers |
| `batchId` | legacy alias для `routeId`/`planningOrderId` | нужен только для чтения старых слотов Ганта при нормализации | новые слоты не записывают `batchId`; новая логика читает через `getSlotPlanningOrderId()` / `slotMatchesPlanningOrder()` |
| `module-entity-*` | удаленный старый sidebar helper слой | больше не используется живыми боковыми списками | новые боковые карточки собирать через `renderUiSidebarItem()` и классы `ui-sidebar-list/ui-sidebar-label/ui-sidebar-item` |

## Что уже переведено в v1

- Добавлен контрактный слой `src/mes_contracts.js`.
- Добавлен helper `buildMesFlowEvent()` для будущего журнала переходов между документами.
- Заказ-наряды начали читать статус размещения через `workOrderPlanning`.
- Заказ-наряд получил `flowToPlanning`, который фиксирует переход `workOrderToGanttSlot`.
- Маршрутная карта получила `flowToWorkOrder`, который фиксирует переход `routeCardToWorkOrder`.
- Сменные строки Мастерской получили `shiftWorkOrder` view-model.
- Сменный заказ-наряд получил `flowIn` из слота Ганта; факт закрывается через "Рабочий стол" исполнителя и записывается в общий слой факта.
- Диспетчерская отключена от активного flow: старый UI факта удален, placeholder ничего не читает и не пишет.
- Справочник статусов получил `contractScope` и `contractKind` для ключевых статусов.
- Справочник статусов проверяет точную пару `scope:value`, чтобы одинаковые значения вроде `partial` не смешивались между контурами.
- Справочник статусов показывает, каким `MES_FLOW_TRANSITIONS` выставляется статус и в какой следующий документ он ведет.
- Карта влияния статусов сначала читает контракт, а уже потом использует старые эвристики.

## Следующие безопасные шаги

1. Перевести маршрутную карту на `routeCard` view-model полностью.
2. Выделить явный `workOrder` объект хранения, когда бизнес-логика заказ-наряда станет стабильной.
3. Выделить явный `shiftWorkOrder` объект хранения после стабилизации Мастерской.
4. Подключить `planningCorrections` к отдельному UI принятия корректировок.
5. Удалять legacy-поля только после миграционного экспорта/импорта и проверки старых preset.
