# Mobile Limited Support Map

Phase 7 does not implement a full mobile redesign. This map records expected limited behavior.

## Viewports

- Narrow smoke: `390x844`, `430x932`.
- Tablet smoke: `1024x768`, `1180x820`, `1366x1024`.

## Usable On Tablet / Touch

- `authPrototype`: touch-first authorization; PIN keypad and tile flow.
- `authSessionPrototype`: workplace/fact-entry flow; should use touch density.
- `shiftMasterBoard`: master workflow; dense but should not hard-break on tablet.
- `shiftWorkOrders`: document journal; table may use horizontal TableWrap scroll.

## Limited Support

- `planning`: dense order table; usable with wrapping and TableWrap, not optimized for small phones.
- `gantt`: special runtime; horizontal timeline is expected. No mobile Gantt redesign in Phase 7.
- `timesheet`: dense calendar/table; limited on narrow screens.
- `productionStructureMatrix`: wide matrix; horizontal table scroll is expected.
- `routes`, `products`, `nomenclature`, `directories`, `roles`, `supply`: usable enough for smoke checks, but not touch-optimized.

## Not A Goal In Phase 7

- Phone-first route editing.
- Phone-first Gantt planning.
- Phone-first production structure matrix editing.
- Removing columns to fit mobile.

## Required Narrow Checks

- No blank screen.
- Header/topbar reachable.
- Critical modal can be closed.
- Critical actions not fully clipped.
- Horizontal overflow is owned by TableWrap or special runtime canvas.
