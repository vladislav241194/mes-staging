import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(resolve(process.cwd(), "src/modules/gantt_runtime/render.js"), "utf8");
const beginDragStart = source.indexOf("function beginDrag(event, slotId, mode, rows, rowLayout, scaleInfo) {");
const beginDragEnd = source.indexOf("function suppressNextGanttSlotClick", beginDragStart);
const beginDragSource = beginDragStart >= 0 && beginDragEnd > beginDragStart
  ? source.slice(beginDragStart, beginDragEnd)
  : "";
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(Boolean(beginDragSource), "Gantt beginDrag implementation was not found");
expect(beginDragSource.includes("if (ui.drag) return;"), "Gantt must reject a concurrent drag before mutating a slot");
expect(beginDragSource.includes("pointerId: event.pointerId,"), "Gantt drag must retain the pointer identity");
expect(beginDragSource.includes("originalSlot: { ...slot },"), "Gantt drag must snapshot the original slot before preview mutation");
expect(beginDragSource.includes("originalSlotRef: slot,"), "Gantt drag must retain the original slot reference for safe rollback");
expect(beginDragSource.includes("const restoreCancelledDrag = (drag) => {"), "Gantt must define a cancelled-drag rollback");
expect(beginDragSource.includes("targetSlot !== drag.originalSlotRef"), "Gantt rollback must not overwrite a slot replaced by another action");
expect(beginDragSource.includes("Object.assign(targetSlot, drag.originalSlot);"), "Gantt rollback must restore the original slot values");
expect(beginDragSource.includes('document.addEventListener("pointercancel", onCancel);'), "Gantt must listen for pointercancel");
expect(beginDragSource.includes('window.addEventListener("blur", onWindowBlur);'), "Gantt must cancel drag when the window loses focus");
expect(beginDragSource.includes('pointerCaptureTarget?.addEventListener("lostpointercapture", onLostPointerCapture);'), "Gantt must listen for lost pointer capture");
expect(beginDragSource.includes("pointerCaptureTarget.setPointerCapture(event.pointerId);"), "Gantt must capture the active pointer");
expect(beginDragSource.includes("pointerCaptureTarget.releasePointerCapture(drag.pointerId);"), "Gantt must release pointer capture when drag ends");
expect(/const onCancel = \(cancelEvent\) => \{\s*if \(cancelEvent\.pointerId !== ui\.drag\?\.pointerId\) return;\s*finishDrag\(\);/s.test(beginDragSource), "pointercancel must roll back only the active drag");
expect(/const onLostPointerCapture = \(captureEvent\) => \{\s*if \(captureEvent\.pointerId !== ui\.drag\?\.pointerId\) return;\s*finishDrag\(\);/s.test(beginDragSource), "lost pointer capture must roll back only the active drag");
expect(/const onWindowBlur = \(\) => finishDrag\(\);/.test(beginDragSource), "window blur must roll back the active drag");
expect(/if \(persist && drag\.moved\) \{[\s\S]*?persistState\(\);[\s\S]*?return;\s*\}\s*if \(restoreCancelledDrag\(drag\)\) render\(\);/.test(beginDragSource), "Only pointer-up persistence may write a drag; cancellation must restore locally");

const persistCalls = [...beginDragSource.matchAll(/persistState\(\)/g)].length;
expect(persistCalls === 1, `Gantt beginDrag must contain one persistence path, found ${persistCalls}`);

if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}

console.log("Gantt drag cancellation QA passed");
