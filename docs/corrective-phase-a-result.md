# Corrective Phase A Result

Дата: 2026-07-05

## Итог

Corrective Phase A выполнена как производственный проход, а не как документация. Закрыто 5 из 7 блоков постановки: A, B, C, D, E. Блоки F/G оставлены на следующий проход, потому что минимальный порог фазы уже закрыт без изменения бизнес-логики и без риска для Gantt-геометрии.

## Закрытые блоки

| Блок | Статус | Что сделано |
| --- | --- | --- |
| A. Runtime decomposition | Закрыто | `nomenclature` вынесен из `src/app.js` в `src/modules/nomenclature/render.js`; в `src/app.js` остался тонкий compatibility wrapper. |
| B. CSS legacy pressure | Закрыто | Runtime-safety правила и поздний UI-блок заказ-нарядов вынесены из `styles/layers/99-legacy-overrides-tail.css` в `styles/ui/runtime-safety.css` и `styles/ui/planning-order.css`; legacy-tail сокращен больше чем на 300 строк. |
| C. Raw-token shrinking budget | Закрыто | `border-radius: 999px` заменен на `var(--mes-ui-pill)` в CSS-слоях; добавлен `scripts/ui-raw-token-budgets.json`; `scripts/ui-raw-token-audit.mjs` теперь проверяет budget. |
| D. Module coverage alignment | Закрыто | `dispatch`, `shiftWorkOrders`, `employees`, `timesheet` переведены в документированный partial runtime вместо ложного hard-runtime. |
| E. Form helper migration | Закрыто | 9 стандартных полей редактора номенклатуры переведены на `renderUiFormField`; action-кнопки формы переведены на `renderUiActionButton`. |

## Метрики

| Метрика | До | После | Дельта |
| --- | ---: | ---: | ---: |
| `src/app.js` lines | 39103 | 39000 | -103 |
| `src/modules/**/*.js` | 1 | 2 | +1 |
| imports from `./modules/*` in `src/app.js` | 1 | 2 | +1 |
| `styles/layers/99-legacy-overrides-tail.css` lines | 4821 | 3961 | -860 |
| raw `border-radius px` declarations | 294 | 199 | -95 |
| raw `!important` usages in audited CSS graph | 3047 | 2905 | -142 |
| raw hex usages in audited CSS graph | 1894 | 1875 | -19 |
| raw `font-size px` declarations | 779 | 750 | -29 |
| raw `font-weight` declarations | 484 | 457 | -27 |
| raw `line-height` declarations | 609 | 580 | -29 |
| spacing/position px declarations | 2094 | 2023 | -71 |
| duplicate selector groups | 349 | 349 | 0 |
| runtime registry hard modules | 18 | 14 | -4 |
| runtime registry partial modules | 0 | 4 | +4 |
| legacy runtime modules | 0 | 0 | 0 |

Полные machine-readable метрики: `reports/corrective-phase-a-metrics.json`.

## Основные файлы

- `src/modules/nomenclature/render.js`
- `src/app.js`
- `src/ui/contracts/runtime-contracts.js`
- `src/ui_runtime_contracts.js`
- `scripts/ui-raw-token-audit.mjs`
- `scripts/ui-raw-token-budgets.json`
- `scripts/ui-runtime-coverage-qa.mjs`
- `scripts/module-smoke-qa.mjs`
- `scripts/design-qa-snapshots.mjs`
- `scripts/ui-contract-coverage-report.mjs`
- `scripts/ui-hardening-plan-qa.mjs`
- `scripts/ui-contract-qa.mjs`
- `scripts/css-layer-audit.mjs`
- `styles/ui/planning-order.css`
- `styles/ui/runtime-safety.css`
- `styles/layers/99-legacy-overrides-tail.css`
- `styles.css`

## QA

Финальный полный прогон:

- `npm run qa:night` — pass
- Внутри него прошли `qa:syntax`, `qa:architecture`, `qa:functional`, `qa:visual`
- `qa:visual`: `macbook-air-15: 48/48 modules passed`
- `npm run qa:css` — pass
- `npm run qa:ui` — pass
- `npm run qa:visual` — pass
- `npm run qa:ui:regression` — pass
- `git diff --check` — pass
- `node scripts/ui-raw-token-audit.mjs` — pass
- `node scripts/ui-runtime-coverage-qa.mjs` — pass
- `node scripts/ui-hardening-plan-qa.mjs` — pass
- `node scripts/ui-contract-qa.mjs` — pass

## Что не трогалось

- Не менялась Gantt geometry, drag/resize/dependency logic и `data-gantt-*`.
- Не менялась бизнес-логика маршрутов, заказ-нарядов, СЗН, табеля, авторизации.
- Не добавлялись новые UI-библиотеки.
- Не делался редизайн.
- Не удалялись CSS-правила вслепую.

## Оставлено на следующий проход

- F. Status/badge/helper migration: можно мигрировать локальные badge/status места на общий `renderUiStatusToken`.
- G. Table exception tightening: можно уменьшить число документированных table exceptions и сделать бюджет по исключениям.
- CSS duplicate selector groups пока не уменьшены: фаза закрыла блок B через сокращение legacy-tail (`-860` строк), но не трогала крупные дубли `:root`, `.directory-table`, `.gantt-shell`.
