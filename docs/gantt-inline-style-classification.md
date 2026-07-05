# Gantt Inline Style Classification

Generated: 2026-07-05T04:50:15.435Z

## Summary

- inline style entries: 20
- geometry entries: 20
- geometry CSS variable entries: 0
- visual inline violations: 0
- unknown inline warnings: 0

Geometry inline styles are allowed because Gantt is an absolute-positioned timeline. Visual inline styles are not allowed unless explicitly moved into the Gantt token contract.

## Entries

| range | line | style keys | classification | status |
| --- | ---: | --- | --- | --- |
| toolbar | 33785 | `height` | geometry | ok |
| toolbar | 33793 | `width`, `left` | geometry | ok |
| toolbar | 33802 | `left`, `width` | geometry | ok |
| toolbar | 33815 | `left`, `width` | geometry | ok |
| toolbar | 33826 | `left`, `width` | geometry | ok |
| toolbar | 33856 | `left` | geometry | ok |
| timeline-rows | 34265 | `height` | geometry | ok |
| timeline-rows | 34267 | `left`, `width` | geometry | ok |
| timeline-rows | 34299 | `width` | geometry | ok |
| timeline-rows | 34328 | `width` | geometry | ok |
| slots | 35062 | `--segment-left`, `--segment-width` | geometry | ok |
| slots | 35104 | `--slot-validation-progress`, `--slot-fact-progress` | geometry | ok |
| slots | 35178 | `left`, `width` | geometry | ok |
| slots | 35205 | `left`, `width` | geometry | ok |
| slots | 35231 | `left`, `top`, `width`, `height`, `--slot-height`, `--slot-radius` | geometry | ok |
| slots | 35247 | `left`, `top`, `width`, `height`, `--slot-height`, `--slot-radius` | geometry | ok |
| dependencies | 35753 | `left`, `top`, `width`, `height`, `--cell-width`, `--snap-width`, `--dependency-clip-left` | geometry | ok |
| dependencies | 35757 | `left`, `width` | geometry | ok |
| dependencies | 35758 | `left`, `top`, `width`, `height` | geometry | ok |
| dependencies | 35759 | `left` | geometry | ok |

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
