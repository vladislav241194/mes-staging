# Hard UI-kit v1

Цель: новые и мигрированные модули не должны собираться ручной оболочкой. UI-kit должен быть runtime-слоем, а не только набором классов.

## Обязательный runtime

Новая страница собирается через `renderUiModulePage()`.

Минимальный контракт:

- `data-ui-component="ModulePage"`;
- `data-ui-runtime="hard-v1"`;
- `ModuleWorkspace`;
- `ModuleContent`;
- опционально `ModuleSidebar`;
- таблицы через `renderUiTableWrap()`;
- панели через `renderUiPanel()` и `renderUiPanelBody()`;
- кнопки через `renderUiActionButton()`;
- поля через `renderUiFormField()` или совместимый `ui-form-field`.

## Hard-runtime модули v1

- Авторизация;
- Рабочий стол;
- План-таблица;
- Матрица;
- Журнал СЗН;
- Табель;
- Роли;
- Права;
- Структура;
- Диспетчерская;
- Мастерская;
- Снабжение;
- Цех производства;
- Справочники;
- Спецификации;
- Номенклатура;
- Маршрутная карта;
- Заказ-наряды.

## Special-runtime модули

- Планирование: живой Гант использует `gantt-v1`, потому что это canvas/timeline engine, а не обычная панельная страница.
- UI-состояния: стенд использует `visual-system-v1`, потому что содержит демонстрационные исключения и не должен проходить рабочий typography gate.

Общий список покрытия хранится в `src/ui_runtime_contracts.js` и проверяется `scripts/ui-runtime-coverage-qa.mjs`.

Статусы покрытия:

- `hard` - модуль собран через `renderUiModulePage()` и проходит браузерные hard-runtime gates;
- `special` - модуль имеет отдельный runtime-gate и не должен насильно переводиться в обычный `hard-v1`;
- `partial` - модуль использует UI-kit helpers/markers, но верхняя оболочка еще не полностью переведена;
- `legacy` - модуль остается на историческом layout/CSS и требует отдельного миграционного прохода.

## Запрещенные обходы

Для hard-runtime модулей нельзя вручную собирать:

- `module-data-page`;
- `directory-workspace`;
- `module-data-content`;
- `ModuleContent` как произвольную сетку для вертикального стека блоков;
- внутренний сайдбар без `renderUiModuleSidebar()`;
- панели без `PanelBody`;
- панели, у которых `PanelBody` схлопывается и рисует содержимое поверх следующего блока;
- таблицы без `TableWrap`;
- page-level horizontal overflow.

## QA gate

`module-smoke-qa.mjs` открывает hard-runtime модули и проверяет фактический DOM:

- runtime marker `hard-v1`;
- компоненты `ModulePage`, `ModuleWorkspace`, `ModuleContent`;
- отсутствие горизонтального переполнения страницы;
- отсутствие `Panel` без прямого `PanelBody`;
- отсутствие видимых панелей, кнопок, полей и table-wrap без `data-ui-component`;
- отсутствие выхода содержимого `PanelBody` за нижнюю границу панели;
- отсутствие наложения прямых блоков внутри `ModuleContent`;
- отсутствие внутреннего вертикального scroll-контейнера у `TableWrap[data-scroll-contract="horizontal-only"]`;
- специальные правила для `Журнал СЗН`.

Для special-runtime модулей действуют отдельные DOM-gates:

- `gantt-v1`: `GanttRuntime`, `GanttCanvas`, `GanttTimeline`, `GanttRowsLayer`, `GanttSlot`, `GanttDependencyLayer`, `GanttDependencySlotMask`, `GanttDependencySlotMaskRect`, `GanttNonWorkingLayer`, `GanttNonWorkingZone`, `GanttSnapOverlay`, `GanttDragGhost`, `GanttResizeHandle`, operational layer/segments, arrow markers/path masks, opened-state edit surface (`Modal` или `Drawer`), drag/resize-state и базовая геометрия колбаски;
- `visual-system-v1`: `VisualSystemRuntime`, стендовые панели, `Gantt Design System`, три масштаба Gantt, fact-сценарии и transfer samples.

`ui-contract-qa.mjs` проверяет наличие helper-ов, CSS-контрактов и smoke-защиты.

Подробная карта покрытия и результат прохода v2: `docs/hard-ui-runtime-coverage-v2.md`.
