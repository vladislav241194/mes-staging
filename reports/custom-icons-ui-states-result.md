# Custom MES Icons UI States Result

## Summary

- Added managed custom MES icon package under `src/icons/custom-mes/`.
- Added 13 production SVG icons and 24 semantic mappings.
- Added runtime registry with semanticSlug, iconName, runtime IDs, group, status, source, usage and review notes.
- Added `UI-состояния -> Иконки` section inside the existing `visualSystem` module.
- Added preview zones: SVG grid, size preview 24/20/16, UI context preview, Reference vs SVG, mapping table, review notes.
- Added real DOM filters by text, group, status, source and usage.
- Unpacked visual PNG references to `assets/icon-references/`; PNG is used only as review reference.

## Added Files

- `src/icons/custom-mes/custom-smt-nozzle-chip.svg`
- `src/icons/custom-mes/custom-manual-solder-wrench.svg`
- `src/icons/custom-mes/custom-soldering-iron-only.svg`
- `src/icons/custom-mes/custom-coating-nozzle-drop.svg`
- `src/icons/custom-mes/custom-mechanical-assembly.svg`
- `src/icons/custom-mes/custom-programming-pogopins.svg`
- `src/icons/custom-mes/custom-qc-microscope.svg`
- `src/icons/custom-mes/custom-warehouse-boxes-handlift.svg`
- `src/icons/custom-mes/custom-production-technology-support.svg`
- `src/icons/custom-mes/custom-marking-packaging.svg`
- `src/icons/custom-mes/custom-service-repair-claim.svg`
- `src/icons/custom-mes/custom-gost-document.svg`
- `src/icons/custom-mes/custom-aoi-machine-vision.svg`
- `src/icons/custom-mes/registry.js`
- `src/icons/custom-mes/manifest.json`
- `assets/icon-references/*.png`
- `reports/mes_icon_visual_references_embedded.html`
- `reports/visual-reference-manifest-embedded.json`

## Runtime Integration

- `icon(name)` now checks `getMesCustomIconName()` and renders custom SVG before falling back to stock icons.
- Auth department tiles use registry-based custom icons for departments.
- Auth unit tiles use registry-based custom icons for SMT, AOI, coating and THT/manual lines.
- Employee structure work-center/resource cards can resolve icons by runtime work-center ID.
- Shop map production flow uses custom icons for warehouse, SMT, AOI, coating, manual assembly, QC, firmware, mechanical assembly and marking/packaging.
- Gantt row labels were intentionally not changed to avoid geometry drift.

## Browser Smoke

- `visualSystem`: section exists, 24 cards, 13 reference image slots, 253 custom SVG instances.
- `visualSystem`: filter `smt` returns 4 visible cards and updates counter to `4 строк`.
- `visualSystem`: after scrolling to Reference vs SVG, 13/13 PNG references load.
- `shopMap`: production flow has 10 nodes, 9 custom icons, no horizontal document overflow.
- `authPrototype`: first step renders custom icons in department tiles, no horizontal document overflow.

## QA

| Check | Status | Notes |
| --- | --- | --- |
| `node --check src/icons/custom-mes/registry.js` | OK | Syntax passed |
| `node --check src/app.js` | OK | Syntax passed |
| `npm run build` | OK | Static build created |
| `npm run qa:ui` | OK | UI contracts, raw token budget, table contract, status/table budgets passed |
| `npm run qa:css` | OK | CSS layer audit and duplicate budget passed |
| `npm run qa:ui:regression` | OK | 100 checks, 0 failed, 11 warnings |
| `git diff --check` | OK | Passed after removing trailing whitespace from generated report |
| `npm run qa:visual` | BLOCKED | Fails before screenshots: `design-qa-snapshots is missing runtime modules: weeklyProductionControl` |
| `npm run lint` | MISSING | No `lint` script in `package.json` |
| `npm run qa` | MISSING | No generic `qa` script in `package.json` |

## Notes

- PNG visual references are not used as production icons.
- SVG icons are rendered through `currentColor`, `fill="none"`, `stroke-width="1.85"`, rounded caps and joins.
- The registry is now the editing point for future icon replacement: update semanticSlug/iconName/runtime aliases there first, then UI-state previews and product UI will follow.
