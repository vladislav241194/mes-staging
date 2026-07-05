# UI Kit Usage Guide

## New Button

Use `renderUiActionButton`.

- Primary: `tone: "primary"`.
- Secondary: default.
- Danger: `tone: "danger"`.
- Icon only: `tone: "icon"` with an aria-label.
- Table icon: `tone: "table-icon"` with an aria-label.

Do not write a raw `button` with custom padding, color or font.

## New Status

Use `renderUiStatusToken(label, tone)`.

Allowed tones: `neutral`, `ready`, `active`, `warning`, `blocked`, `problem`, `manual`, `calc`, `calculated`, `demo`, `danger`, `success`.

If the new meaning is domain-specific, map it to one of the semantic tones before adding CSS.

## New Table

Wrap tables with `renderUiTableWrap`. The wrapper owns horizontal scrolling and must not create vertical scrolling inside panels.

Use:

- compact text through table tokens;
- table icon actions for row actions;
- selected rows with `is-selected` or `is-active`;
- group rows with existing tree/group classes.

## New Panel

Use `renderUiPanel` and `renderUiPanelBody`. If the panel has bottom actions, use `renderUiPanelFooter`.

Do not put a card inside a card only for spacing.

## New Overlay

Use:

- `renderUiModalFrame` or `renderUiModalShell`;
- `renderUiDrawerFrame` or `renderUiDrawerShell`;
- `renderUiDropdownFrame`.

Use overlay tokens for max height/width and shadow. Do not add new z-index values unless they become tokens.

## New Gantt Visual State

Add or reuse a `--mes-ui-gantt-*` token. Do not change slot DOM, scale, width, left, top, dependency routing, drag or resize logic in UI Kit work.

## QA After UI Work

Run:

```bash
npm run qa:ui-kit
npm run qa:ui
npm run qa:css
npm run qa:ui:regression
npm run qa:gantt
```

For broad changes, also run:

```bash
npm run build
npm run qa:architecture
npm run qa:functional
git diff --check
```
