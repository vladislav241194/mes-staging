# Hard UI Runtime Legacy Roadmap v2

Дата: 2026-06-30.

После Hard UI Runtime Coverage Pass v2 в hard-runtime переведены 18 модулей. Еще 2 модуля переведены в special-runtime. Partial-модулей нет, legacy-модулей нет.

## Текущий статус

Hard-runtime:

- `authPrototype`;
- `authSessionPrototype`;
- `planningTable`;
- `matrix`;
- `shiftWorkOrders`;
- `timesheet`;
- `roles`;
- `productionStructureMatrix`;
- `employees`;
- `dispatch`;
- `shiftMasterBoard`;
- `supply`;
- `shopMap`;
- `directories`;
- `products`;
- `nomenclature`;
- `routes`;
- `planning`.

Special-runtime:

- `gantt`;
- `visualSystem`.

## Кандидаты и причины

| Модуль | Почему special-runtime | Что проверяется сейчас | Что расширить дальше |
|---|---|---|---|
| `gantt` | Гант имеет собственный canvas/timeline contract, fixed layers, slots, arrows, drawer и operational overlays. | `GanttRuntime`, `GanttCanvas`, `GanttTimeline`, `GanttRowsLayer`, `GanttSlot`, `GanttDependencyLayer`, `GanttDependencySlotMask`, `GanttDependencySlotMaskRect`, `GanttNonWorkingLayer`, `GanttNonWorkingZone`, `GanttSnapOverlay`, `GanttDragGhost`, `GanttResizeHandle`, arrow markers, slot marker drift, operational layer/segment для распределенных или фактических слотов, базовая геометрия canvas и первой колбаски, opened-state `Drawer`, pointer-drag и pointer-resize smoke. | Pixel-sampling стрелок относительно slot-mask, если понадобится еще строже. |
| `visualSystem` | Это не обычный модуль, а стенд UI-состояний с демонстрационными исключениями и крупными образцами. | `VisualSystemRuntime`, наличие стендовых панелей, `Gantt Design System`, три Gantt-колонки масштаба, fact-сценарии, transfer samples, отсутствие page overflow, отсутствие выхода Gantt samples за колонки. | Интерактивные visual samples, если они появятся. |

## Рекомендуемая очередность

1. При необходимости расширить `gantt-v1` gate до pixel-sampling стрелок относительно slot-mask.
2. Расширять `visual-system-v1` gate дальше только при появлении интерактивных visual samples.
3. Не переводить эти два экрана в обычный `hard-v1`, пока их природа остается специализированной.

## Gate для следующего прохода

Каждый переведенный legacy-модуль должен пройти:

- `npm run qa:ui`;
- `npm run qa:module-smoke`;
- `npm run qa:visual`;
- профильный functional QA, если модуль влияет на сценарии;
- `npm run qa:nonvisual` перед завершением прохода.

Нельзя переводить модуль в `HARD_UI_RUNTIME_MODULE_IDS`, пока он не прошел hard-smoke как hard-модуль. Специализированные runtime-модули должны оставаться в `SPECIAL_UI_RUNTIME_MODULE_IDS` и иметь отдельный smoke gate.
