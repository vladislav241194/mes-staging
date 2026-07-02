# Hard UI Runtime Former Legacy v2

Дата: 2026-06-30.

После текущего прохода hard-runtime покрывает 18 модулей, а `gantt` и `visualSystem` переведены в special-runtime. Legacy-модулей больше нет. Эти две зоны нельзя закрывать обычным `hard-v1`, потому что они не являются стандартными панельными страницами.

## Закрыто в этом проходе: `planning`

Статус: переведен в обычный `hard-v1` runtime.

Что сделано:

- активный `renderPlanningWorkbenchPage()` переведен на `renderUiModulePage()`;
- `planning-order-main` стал `ModuleWorkspace`;
- `planning-order-workspace` стал `ModuleContent`;
- пустые состояния, структура заказ-наряда, detail-панели трудозатрат, цепочки, обеспечения, операции, состава, SMT-расчета, обязательных настроек и размещения получили прямой `PanelBody`;
- модуль добавлен в `HARD_UI_RUNTIME_MODULE_IDS`;
- `module-smoke`, `planning-labor` и visual QA прошли после миграции.

Оставшийся риск по `planning`:

- opened states и модальные сценарии все еще лучше проверять профильными QA, потому что модуль влияет на трудозатраты и передачу в Гант.

## `gantt`

Статус: не должен переводиться на обычный `hard-v1` как таблица или форма. В этом проходе для него добавлен специализированный `data-ui-runtime="gantt-v1"`.

Почему:

- Гант является rendering engine: timeline, canvas, rows-layer, slots, arrows, operational overlays;
- его стабильность зависит от собственных координат, а не от обычного потока `PanelBody`;
- обычная проверка `ModuleContent`/`PanelBody` может дать ложные ошибки или подтолкнуть к неверной CSS-архитектуре.

Рекомендуемый контракт:

- уже проверяется в `module-smoke`: `GanttRuntime`, `GanttCanvas`, `GanttTimeline`, `GanttRowsLayer`, `GanttSlot`, `GanttDependencyLayer`, `GanttDependencySlotMask`, `GanttDependencySlotMaskRect`, `GanttNonWorkingLayer`, `GanttNonWorkingZone`, `GanttSnapOverlay`, `GanttDragGhost`, `GanttResizeHandle`, arrow marker contract, dependency path mask contract, drift slot-маркеров, наличие слотов, базовая геометрия canvas и первой колбаски;
- уже проверяется operational overlay: если есть распределенные или фактические слоты, должны быть `GanttOperationalLayer` и `GanttOperationalSegment`;
- уже проверяется opened-state: smoke открывает первый слот двойным кликом и валидирует `Drawer` выбранной операции;
- уже проверяется drag-state: smoke выполняет pointer-drag и валидирует `GanttSnapOverlay`, `GanttDragGhost`, `GanttSnapGuide`;
- уже проверяется resize-state: smoke выполняет pointer-resize через `GanttResizeHandle` и валидирует resize-mode snap guide;
- дальше расширять только при необходимости: pixel-sampling стрелок относительно slot-mask;
- отдельные gates: нет вертикального lock-scroll, колбаски не выходят из row, стрелки не попадают внутрь строк, operational layer не дублирует текст, non-working zones не ломают геометрию.

## `visualSystem`

Статус: специальный стенд, не рабочий модуль. В этом проходе для него добавлен `data-ui-runtime="visual-system-v1"`.

Почему:

- на странице намеренно есть образцы с крупной типографикой, сценарии исключений, демонстрационные состояния и визуальные эталоны;
- обычный hard-runtime typography gate там будет шуметь;
- переводить его в `hard-v1` имеет смысл только после выделения `VisualSystemRuntime`.

Рекомендуемый контракт:

- уже проверяется в `module-smoke`: `VisualSystemRuntime`, наличие стендовых панелей, наличие блока `Gantt Design System`, три Gantt-колонки масштаба, fact-сценарии, transfer samples, отсутствие page overflow, отсутствие выхода Gantt samples за свои колонки;
- не применять рабочий typography gate;
- дальше расширять только при появлении интерактивных visual samples.

## Gate перед закрытием долга

Полностью закрытым UI-runtime долг считается только когда:

- `PARTIAL_UI_RUNTIME_MODULE_IDS` остается пустым;
- `gantt` получил отдельный специализированный runtime-gate;
- `visualSystem` получил отдельный стендовый runtime-gate;
- `npm run qa:ui`, `npm run qa:module-smoke`, `npm run qa:visual`, `npm run qa:nonvisual`, `git diff --check` проходят зелено.
