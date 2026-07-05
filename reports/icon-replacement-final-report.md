# Icon Replacement Final Report

Дата: 2026-07-05

## Source of Truth

Использован только пакет `mes_mixed_custom_opensource_icon_pack.zip`.

Runtime-источники:

- `custom-approved/svg/by-semantic/*.svg` для MES-специфичных сущностей;
- `mappings/runtime-mixed-registry.json` и `mappings/opensource-system-icon-map.json` для системных slugs;
- `lucide-react` для системных open-source icons;
- `local-fallback-svg/by-semantic/production-floor-plan.svg` для `production-floor-plan`.

PNG из `custom-approved/references/selected-crops/*.png` используются только в UI-состояниях как reference preview.

## Что заменено

- Старый ручной SVG-словарь внутри `src/app.js::icon()` удален.
- Старый `src/icons/custom-mes/registry.js` превращен в compatibility facade к новому mixed registry.
- Старые `src/icons/custom-mes/custom-*.svg` и `src/icons/custom-mes/manifest.json` удалены из runtime-папки.
- Новый единый runtime слой: `src/icons/registry.js`.
- Генератор registry: `scripts/generate-mes-icon-registry.mjs`.
- Guardrail: `scripts/icon-system-qa.mjs`, npm script `qa:icons`.

## Покрытие

| Source | Count | Notes |
|---|---:|---|
| custom-svg | 47 | Approved MES SVG из архива |
| lucide-react | 79 | Системные иконки из Lucide React |
| local-fallback-svg | 1 | `production-floor-plan` |
| virtual-custom | 2 | `favicon`, `module-brand-letter-m`: brand placeholders из mapping, не production MES-icons |
| total semantic entries | 129 | Единый registry |

Важные semantic slugs покрыты:

- `department-smt`, `unit-smt-line-1`, `unit-smt-line-2`, `unit-pnp-machine`;
- `department-manual-assembly`;
- `unit-soldering-workplace`, `unit-tht-line-1..4`;
- `department-mechanical-assembly`;
- `department-coating`, `unit-selective-coating-line`;
- `production-floor-plan`;
- системные `search`, `filter`, `calendar`, `gantt`, `route`, `refresh`, `save`, `copy`, `missing-print`, `missing-users` и остальные из mapping.

## UI-состояния -> Иконки

Route:

`/?module=visualSystem&qa-auth-bypass=1#visual-icons`

Раздел показывает:

- custom MES icons;
- system Lucide icons;
- special fallback icons;
- semanticSlug, title, source, status;
- размеры 32 / 24 / 20 / 18 / 16;
- состояния default / muted / active / warning / danger;
- контексты sidebar / button / table / badge / department tile;
- PNG reference рядом с current SVG для 47 custom SVG;
- mapping table.

## Особые замечания

- `lucide-react` не экспортирует компонент `Figma`, хотя он указан в архивном mapping. Для служебного slug `figma-import-overview` используется официальный Lucide fallback `Component` и пометка в registry. Это не production MES-иконка.
- `favicon` и `module-brand-letter-m` в архиве помечены как `Custom`; они оставлены как virtual brand placeholders и не используются как MES production icons.
- Custom SVG из архива сохранены как fill-based SVG. Runtime больше не навязывает им `fill="none"` и `stroke`, чтобы не ломать утвержденную форму.

## Проверки

- `npm run qa:icons` — passed.
- `node --check src/app.js` — passed.
- `node --check src/icons/registry.js` — passed.
- `node --check src/icons/custom-mes/registry.js` — passed.
- `node --check scripts/icon-system-qa.mjs` — passed.
- `node --check scripts/generate-mes-icon-registry.mjs` — passed.
- `npm run build` — passed.
- `git diff --check` — passed.
- `npm run qa:ui` — attempted; stops on existing `ui-raw-token-audit` budget entries in `styles/layers/70-planning-table-and-matrix.css`, `styles/layers/80-visual-system-ui-states.css`, and `styles/layers/99-legacy-overrides-tail.css`. Icon guardrail, syntax, and build checks pass.

Browser smoke на `visualSystem#visual-icons`:

- карточек иконок: 129;
- reference PNG: 47;
- пустых SVG: 0;
- horizontal overflow: false.
