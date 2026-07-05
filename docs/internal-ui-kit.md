# Internal UI Kit

The MES UI Kit is a runtime layer, not only a style guide. It consists of:

- `styles/mes-ui-core.css`: tokens and compatibility aliases.
- `styles/ui/actions.css`: ActionButton contract.
- `styles/ui/status.css`: StatusToken contract.
- `styles/ui/kit-polish.css`: Phase 7 shared visual polish layer.
- `src/ui/components.js`: render helpers.
- `src/ui_runtime_contracts.js`: runtime component, style token and normalizer contracts.
- `scripts/ui-kit-guard-qa.mjs`: guard against bypassing the kit.

## Rules

1. Add UI through helpers first.
2. Add visual values as semantic tokens in `styles/mes-ui-core.css`.
3. Add shared visual normalization in `styles/ui/kit-polish.css`.
4. Add page-specific CSS only when the page has a documented special runtime or true domain-specific geometry.
5. Run `npm run qa:ui-kit`, `npm run qa:ui`, `npm run qa:css` after UI changes.

## Default Density

- Compact: dense tables, tree rows, table icon actions.
- Default: MES module panels and regular toolbars.
- Touch: authorization, workplace fact entry, large tablet controls.

## Special Runtime Exceptions

- Gantt geometry is not part of the generic UI Kit. Only visual tokens may be adjusted.
- Authorization and workplace screens may use touch density, but still use ModulePage, Panel, ActionButton and FormField contracts where possible.
