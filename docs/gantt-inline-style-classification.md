# Gantt Inline Style Classification

Generated: 2026-07-05T20:34:48.353Z

## Summary

- inline style entries: 16
- geometry entries: 16
- geometry CSS variable entries: 0
- visual inline violations: 0
- unknown inline warnings: 0

Geometry inline styles are allowed because Gantt is an absolute-positioned timeline. Visual inline styles are not allowed unless explicitly moved into the Gantt token contract.

## Entries

| range | line | style keys | classification | status |
| --- | ---: | --- | --- | --- |
| slots | 35148 | `height` | geometry | ok |
| slots | 35156 | `width`, `left` | geometry | ok |
| slots | 35165 | `left`, `width` | geometry | ok |
| slots | 35178 | `left`, `width` | geometry | ok |
| slots | 35189 | `left`, `width` | geometry | ok |
| slots | 35219 | `left` | geometry | ok |
| slots | 35241 | `height`, `top` | geometry | ok |
| slots | 35243 | `left`, `width`, `height`, `--cell-width` | geometry | ok |
| dependencies | 35628 | `height` | geometry | ok |
| dependencies | 35630 | `left`, `width` | geometry | ok |
| dependencies | 35662 | `width` | geometry | ok |
| dependencies | 35691 | `width` | geometry | ok |
| overlays | 37126 | `left`, `top`, `width`, `height`, `--cell-width`, `--snap-width`, `--dependency-clip-left` | geometry | ok |
| overlays | 37130 | `left`, `width` | geometry | ok |
| overlays | 37131 | `left`, `top`, `width`, `height` | geometry | ok |
| overlays | 37132 | `left` | geometry | ok |

## Allowed Geometry Keys

- `left`
- `top`
- `width`
- `height`
- `transform`
- `grid-template-columns`
- `--left-width`
- `--timeline-width`
- `--total-height`
- `--cell-width`
- `--snap-width`
- `--dependency-clip-left`
- `--slot-height`
- `--slot-radius`
- `--segment-left`
- `--segment-width`
- `--slot-validation-progress`
- `--slot-fact-progress`
- `--transfer-width`

## Visual Keys That Must Stay Out Of Inline Styles

- `background`
- `background-color`
- `color`
- `border`
- `border-color`
- `border-radius`
- `box-shadow`
- `opacity`
- `fill`
- `stroke`
