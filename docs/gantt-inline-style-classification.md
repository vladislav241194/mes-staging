# Gantt Inline Style Classification

Generated: 2026-07-18T13:26:18.114Z

## Summary

- inline style entries: 25
- geometry entries: 25
- geometry CSS variable entries: 0
- visual inline violations: 0
- unknown inline warnings: 0

Geometry inline styles are allowed because Gantt is an absolute-positioned timeline. Visual inline styles are not allowed unless explicitly moved into the Gantt token contract.

## Entries

| source | line | style keys | classification | status |
| --- | ---: | --- | --- | --- |
| src/modules/gantt_runtime/render.js | 547 | `height` | geometry | ok |
| src/modules/gantt_runtime/render.js | 555 | `width`, `left` | geometry | ok |
| src/modules/gantt_runtime/render.js | 564 | `left`, `width` | geometry | ok |
| src/modules/gantt_runtime/render.js | 577 | `left`, `width` | geometry | ok |
| src/modules/gantt_runtime/render.js | 588 | `left`, `width` | geometry | ok |
| src/modules/gantt_runtime/render.js | 618 | `left` | geometry | ok |
| src/modules/gantt_runtime/render.js | 640 | `height`, `top` | geometry | ok |
| src/modules/gantt_runtime/render.js | 642 | `left`, `width`, `height`, `--cell-width` | geometry | ok |
| src/modules/gantt_runtime/render.js | 930 | `height` | geometry | ok |
| src/modules/gantt_runtime/render.js | 932 | `left`, `width` | geometry | ok |
| src/modules/gantt_runtime/render.js | 964 | `width` | geometry | ok |
| src/modules/gantt_runtime/render.js | 993 | `width` | geometry | ok |
| src/modules/gantt_runtime/render.js | 1459 | `left`, `height` | geometry | ok |
| src/modules/gantt_runtime/render.js | 1508 | `--transfer-width` | geometry | ok |
| src/modules/gantt_runtime/render.js | 1737 | `--segment-left`, `--segment-width` | geometry | ok |
| src/modules/gantt_runtime/render.js | 1779 | `--slot-validation-progress`, `--slot-fact-progress` | geometry | ok |
| src/modules/gantt_runtime/render.js | 1854 | `left`, `width` | geometry | ok |
| src/modules/gantt_runtime/render.js | 1881 | `left`, `width` | geometry | ok |
| src/modules/gantt_runtime/render.js | 1907 | `left`, `top`, `width`, `height`, `--slot-height`, `--slot-radius` | geometry | ok |
| src/modules/gantt_runtime/render.js | 1923 | `left`, `top`, `width`, `height`, `--slot-height`, `--slot-radius` | geometry | ok |
| src/modules/gantt_runtime/render.js | 2262 | `left`, `top`, `width`, `height`, `--dependency-clip-left` | geometry | ok |
| src/modules/gantt_runtime/render.js | 2433 | `left`, `top`, `width`, `height`, `--cell-width`, `--snap-width`, `--dependency-clip-left` | geometry | ok |
| src/modules/gantt_runtime/render.js | 2437 | `left`, `width` | geometry | ok |
| src/modules/gantt_runtime/render.js | 2438 | `left`, `top`, `width`, `height` | geometry | ok |
| src/modules/gantt_runtime/render.js | 2439 | `left` | geometry | ok |

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
