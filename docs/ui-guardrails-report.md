# UI Guardrails Report

## Активные guardrails

| Команда | Что защищает | Текущий статус после прохода |
|---|---|---|
| `npm run qa:ui` | Runtime helpers, module coverage, CSS-only classes, baseline-aware raw visual tokens, TableWrap contract, hardening plan | pass |
| `npm run qa:css` | Manifest-only `styles.css`, exact duplicates, broad `!important`, risky overflow | pass |
| `npm run qa:architecture` | Flow + UI + legacy + CSS + structure | pass |
| `npm run qa:functional` | Smoke/state/functional сценарии + Gantt runtime guardrails | pass |
| `npm run qa:gantt-guardrails` | Gantt shell/timeline/slots/dependencies/overlay mount | pass |
| `npm run build` | Staging build | pass |

## Что изменено в guardrails

1. `scripts/ui-runtime-class-audit.mjs` теперь различает:
   - dynamic CSS-only classes;
   - documented compatibility CSS-only classes;
   - unexpected runtime/global CSS-only classes.
2. Новые незадокументированные CSS-only classes продолжают падать.
3. Compatibility debt виден в логах QA, а не растворен в исключениях.
4. Добавлен `scripts/ui-raw-token-audit.mjs`: baseline-aware audit прямых hex/px/font-weight/radius/`!important`.
5. Добавлен `scripts/ui-table-contract-audit.mjs`: новые production tables должны идти через `TableWrap` или documented exception.
6. Добавлен `scripts/gantt-runtime-guardrails-qa.mjs`: Gantt runtime contract проверяется без изменения визуала/геометрии.
7. `qa:syntax` проверяет синтаксис новых audit scripts.

## Почему это важно

Раньше аудит видел только бинарную картину: любой CSS-only class = падение. Это мешало отделить уже существующий долг от нового регресса. Теперь новый регресс ловится, а старый долг имеет адресный список для миграции.

Raw-token audit больше не warning-only: текущий долг записан в `scripts/ui-raw-token-baseline.json`, а новые raw visual values вне token layer падают в `qa:ui`.

## Raw visual baseline

Последний прогон `npm run qa:ui` после Phase 2:

- raw hex usages: 2035;
- unique hex colors: 280;
- `!important`: 3128;
- font-size px declarations: 845;
- font-weight literal declarations: 496;
- line-height raw declarations: 616;
- border-radius px declarations: 333;
- spacing/position px declarations: 2257.

Top files by visual debt:

- `styles/layers/80-visual-system-ui-states.css`
- `styles/layers/70-planning-table-and-matrix.css`
- `styles/layers/99-legacy-overrides-tail.css`
- `styles/layers/10-shell-directory-gantt-base.css`
- `styles/layers/90-shift-master-board.css`

## Следующие guardrails

1. Overlay opened-state audit: modal/drawer/dropdown в открытом состоянии.
2. Table visual state audit: selected/hover/empty/action cell для MacBook Air 15.
3. Token debt burn-down: уменьшать baseline по одному CSS layer за проход.
4. Gantt data-attribute guard: расширить проверки `data-gantt-*` без изменения geometry.
5. Visual screenshot diff только для MacBook Air 15.
