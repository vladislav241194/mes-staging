# Codex integration notes

Goal: keep approved MES custom SVGs, but replace all generic/system icons with actual Lucide package components.

## Use custom local SVG for
- departments
- MES production units
- MES resources
- all approved custom semantic slugs from `mes-icon-approval-selection.json`

## Use `lucide-react` for
- all generic/system semantic slugs listed in `mappings/opensource-system-icon-map.json`
- examples: `search`, `filter`, `book`, `calendar`, `gantt`, `save`, `copy`, `missing-print`, `missing-users`

## Special case
- `production-floor-plan` remains a local SVG fallback.

## Do not do
- Do not redraw Lucide icons into local SVG again.
- Do not mix old failed manual stock redraws back into the project.
- Do not substitute custom MES icons with Lucide where a custom-approved SVG exists.
