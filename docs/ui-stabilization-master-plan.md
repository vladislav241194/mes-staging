# UI Stabilization Master Plan

Дата старта прохода: 2026-07-05.

Цель: стабилизировать текущую UI/UX-архитектуру MES-проекта без редизайна, смены стека, изменения бизнес-логики, маршрутизации или DOM-контрактов критических сценариев.

## 1. Baseline

Ветка: `main`.

Состояние до начала этого прохода: рабочее дерево уже содержит незакоммиченные изменения в `docs/`, `scripts/`, `src/`, `styles/`, `workflow-preset.json`; также есть удаленный `styles/layers/20-technology-calculator-specifications.css`, новый `styles/layers/20-technology-specifications.css` и новый `docs/ui-system-diagnostic.md`.

Новые изменения этого прохода должны выполняться поверх существующего состояния без откатов пользовательских/предыдущих правок.

## 2. Исходные проблемы

1. UI-kit существует, но не является единственным способом сборки интерфейса.
2. В проекте одновременно работают новые `ui-*` классы, старые классы, module-specific CSS и `99-legacy-overrides-tail.css`.
3. Изменение базового визуального правила часто делается локально и не распространяется на все модули.
4. `styles.css` содержит реальные CSS-правила, хотя должен быть manifest-only entrypoint.
5. CSS-граф содержит много duplicate selector groups и exact duplicate rules.
6. Token layer неполный: часть цветов, отступов, типографики, радиусов, высот строк и table/Gantt значений задается напрямую.
7. Таблицы и tree tables похожи визуально, но реализованы разными селекторами и локальными правилами.
8. `99-legacy-overrides-tail.css` стал местом новых эталонных решений, а не только legacy compatibility layer.
9. Gantt содержит критическую геометрию, inline styles и SVG-dependencies; его нельзя редизайнить или менять DOM без guardrails.
10. QA-скрипты частично есть, но должны лучше фиксировать возвращение локального UI-хаоса.

## 3. Потенциально изменяемые файлы

- `styles.css`
- `styles/mes-ui-core.css`
- `styles/layers/30-module-shell-ui-foundations.css`
- `styles/layers/40-gantt-planning-routes.css`
- `styles/layers/80-visual-system-ui-states.css`
- `styles/layers/99-legacy-overrides-tail.css`
- `src/app.js`
- `src/ui_runtime_contracts.js`
- `scripts/css-layer-audit.mjs`
- `scripts/ui-contract-qa.mjs`
- `scripts/module-smoke-qa.mjs`
- `docs/ui-runtime-contract.md`
- `docs/ui-token-contract.md`
- `docs/ui-table-contract.md`
- `docs/ui-legacy-layer-map.md`
- `docs/gantt-ui-stabilization-map.md`
- `docs/ui-guardrails-report.md`
- `docs/ui-stabilization-result.md`

Изменения в `src/app.js` допустимы только для усиления UI helpers/markers/compatibility classes без изменения бизнес-логики и обработчиков.

## 4. Запрещенные зоны

- Gantt geometry, drag/resize, dependency routing, snap overlay.
- DOM/data attributes: `data-gantt-*`, `data-planning-order-row`, `data-route-step-row`, `data-shift-work-order-row`, `data-shift-work-order-tree-toggle`, `data-auth-*`.
- Print preview DOM and print forms.
- Auth/session business flow.
- Timesheet and production structure data logic.
- Route/specification/planning labor calculations.
- Любые новые локальные visual fixes без token/helper/contract.

## 5. Этапы и статус

| Этап | Задача | Статус |
|---|---|---|
| 0 | Git baseline, master plan, baseline checks | closed |
| 1 | CSS architecture reset: `styles.css` manifest-only, exact duplicates | closed |
| 2 | Token layer: spacing, typography, radius, controls, density, status, table, Gantt | closed |
| 3 | UI runtime contract: helper usage, compatibility mapping, docs | closed |
| 4 | ActionButton/IconButton/StatusToken normalization | closed |
| 5 | Panel/ModulePage/Layout normalization without risky redesign | closed |
| 6 | Table/TreeTable contract and first compatibility mapping | closed |
| 7 | `99-legacy-overrides-tail.css` inventory and map | closed |
| 8 | Gantt stabilization map and guardrails | closed |
| 9 | UI guardrails/QA reports | closed |
| 10 | Final docs and checks | closed |
| 11 | Follow-up after failed self-review: exact tokens, raw audit, Table contract selectors, functional blockers | closed |

## 6. Критерии готовности текущего прохода

1. `styles.css` возвращен к manifest-only состоянию или максимально приближен к нему.
2. Exact duplicate CSS rules уменьшены безопасным способом.
3. Token layer усилен и задокументирован.
4. Runtime helper contract задокументирован.
5. Кнопки, статусы, панели и таблицы получают общий visual contract или compatibility mapping.
6. Есть Table/TreeTable contract и список мигрированных/совместимых таблиц.
7. `99-legacy-overrides-tail.css` получил карту ответственности.
8. Gantt получил карту опасных зон без изменения геометрии.
9. QA guardrails фиксируют baseline и предупреждают о новых локальных UI-паттернах.
10. Создан `docs/ui-stabilization-result.md` с командами, изменениями, рисками и следующими задачами.

## 7. Baseline checks

- `npm run build`: pass.
- `npm run qa:ui`: fail на `MES UI Runtime Class Audit`, 22 CSS-only runtime classes и 5 global CSS-only classes.
- `npm run qa:css`: fail, потому что `styles.css` содержал реальные CSS-правила и было 2 exact duplicate rule groups.
- `npm run qa:architecture`: fail транзитивно через `qa:ui`.
- `npm run qa:functional`: fail на `planning-labor-functional-qa.mjs`: `UI mode select for planning labor was not found`.

## 8. Внесенный системный сдвиг

1. `styles.css` снова manifest-only.
2. Runtime shell guard перенесен в `styles/layers/99-legacy-overrides-tail.css` с сохранением full-width/focus-mode поведения.
3. `styles/mes-ui-core.css` усилен токенами surface/text/spacing/density/type/control/status/table/tree/Gantt.
4. `renderUiActionButton` получил tone-контракт для `ghost`, `danger`, `compact`, `touch`, `icon`, `table-icon`.
5. `UI_RUNTIME_COMPATIBILITY_CSS_ONLY_CLASSES` фиксирует существующий compatibility-долг; новые незарегистрированные CSS-only классы снова будут падать в QA.
6. Добавлены отдельные документы по runtime, token, table, legacy, Gantt и guardrails.
7. Добавлен warning-only raw-token audit для прямых visual values.
8. Table/TreeTable contract получил системные `.ui-table-*` и `.ui-tree-*` selectors.
9. SMT-калькуляторный CSS-долг удален из compatibility namespace.
10. Baseline functional blocker в `planning-labor-functional-qa.mjs` закрыт.

## 9. Итоговые проверки после follow-up

- `npm run build`: pass.
- `npm run qa:ui`: pass.
- `npm run qa:css`: pass.
- `npm run qa:architecture`: pass.
- `npm run qa:functional`: pass.
- `git diff --check`: pass.

## 10. Что осталось не как незакрытый этап, а как измеримый следующий долг

1. Raw visual values пока в warning-only baseline, не в fail-budget.
2. CSS duplicate selector groups остаются высокими: 450 groups.
3. Compatibility CSS-only classes остаются: 16.
4. Gantt остается special runtime и требует отдельного pass с bounds/snapshot guardrails.
5. `99-legacy-overrides-tail.css` остается самым рискованным местом для новых локальных визуальных решений.
