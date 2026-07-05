# UI/UX Visual Baseline Repair Pass

Дата: 2026-07-05

## Scope

Задача выполнена как точечный Visual Baseline Repair Pass после Corrective Baseline Phase 0.

Не выполнялись:

- редизайн;
- массовый CSS cleanup;
- изменение Gantt geometry;
- изменение planning functional flow;
- изменение бизнес-логики;
- замена иконок;
- удаление модулей из visual coverage;
- suppression visual findings;
- обновление baseline без устранения причины.

## Baseline до правок

Команда:

```bash
npm run qa:visual
```

Исходный отчет:

```txt
tmp/design-qa-snapshots-1783278049958/report.md
```

Результат:

```txt
macbook-air-15: 42/48 modules passed
```

Findings:

| Module | Snapshot | Finding | Target / area | Примечание |
| --- | --- | --- | --- | --- |
| visualSystem | normal | inset=1 | `article.visual-system-panel.is-full.visual-icons-panel` | icon section had panel marker but zero inner padding |
| weeklyProductionControl | normal | typography=3 | summary cards | `strong` values were `700 17px/18px` |
| weeklyProductionControl | focus | typography=3 | summary cards | same as normal snapshot |
| shiftWorkOrders | normal | text=2 | `span.mes-signal.ui-status-token.is-ok` | current baseline differs from TZ: text=2, not text=3 |
| authSessionPrototype | normal | typography=3 | fact cards | `strong` values were `600 18px/22px` |
| authSessionPrototype | focus | typography=3 | fact cards | same as normal snapshot |

Новых модулей с visual failures вне указанного scope не появилось.

## Source of truth и владельцы правок

| Module | Runtime owner | CSS owner | Причина |
| --- | --- | --- | --- |
| visualSystem | `renderVisualIconSystemSection` in `src/app.js` | `styles/layers/80-visual-system-ui-states.css` | `visual-icons-panel` оставался `visual-system-panel`, но section override задавал `padding: 0`, из-за чего QA видел inset issue |
| weeklyProductionControl | `renderWeeklyProductionControlPage` / summary renderer in `src/app.js` | `styles/layers/70-planning-table-and-matrix.css` | summary values использовали локальный `--weekly-control-font-xl: 17px`, что выше visual typography threshold |
| shiftWorkOrders | tree rows in `src/app.js` using `renderUiStatusToken` | `styles/layers/99-legacy-overrides-tail.css` | статус `факт внесен` не помещался в узкую статусную колонку таблицы |
| authSessionPrototype | `renderAuthSessionFactPanel` in `src/app.js` | `styles/layers/99-legacy-overrides-tail.css` | fact card values использовали `18px/22px`, что выше visual typography threshold |

## Изменения

Измененные файлы:

- `styles/layers/70-planning-table-and-matrix.css`
- `styles/layers/80-visual-system-ui-states.css`
- `styles/layers/99-legacy-overrides-tail.css`
- `reports/ui-ux-visual-baseline-repair.md`

Сделано:

- `weeklyProductionControl`: `--weekly-control-font-xl` переведен на существующий typography token `var(--mes-font-size-section-title)`.
- `visualSystem`: `visual-icons-panel` получил внутренний inset через существующий spacing token `var(--mes-space-4)` вместо нулевого padding.
- `shiftWorkOrders`: status token в 7-й колонке таблицы получил локальный перенос `white-space: normal` и `overflow-wrap: anywhere`, без изменения статуса и ширины таблицы.
- `authSessionPrototype`: fact card value typography переведена на `var(--mes-font-size-section-title)` и `var(--mes-ui-line-section-title)` в normal и large viewport block.

`!important` не добавлялся.

## Результат visual QA после правок

Команда:

```bash
npm run qa:visual
```

Итоговый отчет:

```txt
tmp/design-qa-snapshots-1783278337199/report.md
```

Результат:

```txt
macbook-air-15: 48/48 modules passed
```

Visual findings:

| Module | Before | After |
| --- | --- | --- |
| visualSystem | inset=1 | fixed |
| weeklyProductionControl | typography=3 | fixed |
| weeklyProductionControl-focus | typography=3 | fixed |
| shiftWorkOrders | text=2 | fixed |
| authSessionPrototype | typography=3 | fixed |
| authSessionPrototype-focus | typography=3 | fixed |

## Проверки

| Command | Status |
| --- | --- |
| `npm run build` | pass |
| `npm run qa:ui` | pass |
| `npm run qa:css` | pass |
| `npm run qa:architecture` | pass |
| `npm run qa:visual` | pass |
| `npm run qa:ui:regression` | pass |
| `git diff --check` | pass |
| `npm run qa:functional` | not run, explicitly out of scope for this Visual Baseline Repair Pass |

## Намеренно не делалось

- Не менялась структура `renderVisualIconSystemSection`.
- Не менялись данные summary cards, order cards, fact cards или статусы.
- Не менялись таблицы и Gantt geometry.
- Не менялись thresholds в `scripts/design-qa-snapshots.mjs`.
- Не обновлялись snapshots как способ скрыть проблему.

## Итог

Visual Baseline Repair закрыт: все visual findings из scope устранены реальными CSS/token правками, `npm run qa:visual` проходит `48/48`, обязательные non-visual gates проходят.
