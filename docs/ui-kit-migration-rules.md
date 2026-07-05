# UI Kit Migration Rules

## Safe Order

1. Mark existing DOM with `data-ui-component`.
2. Replace raw HTML with helper only when handlers and selectors are understood.
3. Move visual value into `styles/mes-ui-core.css`.
4. Add shared visual rule to `styles/ui/kit-polish.css`.
5. Add or update QA guard.
6. Run regression before changing the next family.

## What To Migrate First

1. Repeated button/action patterns.
2. Tables and tree tables.
3. Form fields.
4. Modal/drawer/dropdown shells.
5. Status and badge patterns.
6. Page-specific panels that only differ by spacing.

## What To Leave As Exception

- Gantt geometry and dependency layers.
- Touch-only PIN keypad geometry.
- Print preview sizing where page format matters.
- Canvas/map/flow surfaces with internal coordinate systems.

## Forbidden In New UI

- New direct colors in layer CSS.
- New random `font-weight`, `font-size`, `line-height`, `border-radius`.
- New `!important` in the polish layer.
- New module-specific selectors in `styles/ui/kit-polish.css`.
- New local table wrappers without `renderUiTableWrap`.
- New buttons without `renderUiActionButton`.

## Required QA

For every migration pass:

```bash
npm run qa:ui-kit
npm run qa:ui
npm run qa:css
npm run qa:ui:regression
```

For Gantt-adjacent work:

```bash
npm run qa:gantt
npm run qa:gantt:geometry
npm run qa:gantt:scale
```
