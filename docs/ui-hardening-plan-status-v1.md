# UI Hardening Plan Status v1

Назначение: фиксировать фактическое закрытие 11 пунктов UI-стабилизации. Статус `Закрыто` допустим только если пункт присутствует в `UI_HARDENING_PLAN_STAGES` со статусом `closed` и его evidence проходит `scripts/ui-hardening-plan-qa.mjs`.

| Этап | Статус | Факт закрытия |
| --- | --- | --- |
| 1. UI-инвентаризация | Закрыто | Есть реестр `UI_RUNTIME_COMPONENT_CONTRACTS`, runtime coverage списки `HARD_UI_RUNTIME_MODULE_IDS`/`SPECIAL_UI_RUNTIME_MODULE_IDS`, class-audit включен в `qa:ui`. |
| 2. UI Contract Registry | Закрыто | В `src/ui_runtime_contracts.js` закреплены component contracts, style tokens и DOM normalizer contracts. |
| 3. ActionButton contract | Закрыто | Есть `renderUiActionButton`, CSS `.ui-action-button`, smoke-gate ловит видимые кнопки без UI marker. |
| 4. Sidebar/Header contract | Закрыто | Есть `renderUiModuleSidebar`/`renderUiModuleHeader`, стандартная ширина sidebar проверяется browser smoke, фон ModulePage проверяется smoke-gate. |
| 5. Panel/Spacing contract | Закрыто | Есть `renderUiPanel`/`renderUiPanelBody`, panel spacing вынесен в tokens, smoke-gate ловит выход контента и overlap внутри панелей. |
| 6. Table contract | Закрыто | Есть `renderUiTableWrap`, `data-scroll-contract="horizontal-only"`, smoke-gate ловит вертикальный scroll внутри TableWrap. |
| 7. FormField contract | Закрыто | Есть `renderUiFormField`, токен высоты формы, smoke-gate ловит поля без FormField marker. |
| 8. Modal/Drawer/Dropdown contract | Закрыто | Есть helper-ы `renderUiModal*`, `renderUiDrawer*`, `renderUiDropdownFrame`; opened-state QA покрывает важные overlay-состояния. |
| 9. Миграция ключевых модулей | Закрыто | Ключевые модули находятся в hard-runtime списке, `PARTIAL_UI_RUNTIME_MODULE_IDS` и `LEGACY_UI_RUNTIME_MODULE_IDS` пустые. |
| 10. QA-gates | Закрыто | `qa:ui`, `qa:syntax`, `qa:module-smoke`, `qa:css` запускают соответствующие проверки, включая `ui-hardening-plan-qa`. |
| 11. Проверка | Закрыто | `qa:stabilize` включает syntax, architecture, `git diff --check` и build; build копирует `mes-ui-core.css`. |

Обязательная команда приемки:

```bash
npm run qa:ui
```

Полная стабилизационная приемка:

```bash
npm run qa:stabilize
npm run qa:module-smoke
```
