import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const [app, scenario, model] = await Promise.all([
  readFile("src/app.js", "utf8"),
  readFile("experiments/react-migration/src/modules/gantt/GanttScenario.tsx", "utf8"),
  readFile("experiments/react-migration/src/modules/gantt/production-model.ts", "utf8"),
]);
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

try {
  await access("src/modules/gantt_runtime/render.js", constants.F_OK);
  failures.push("Retired pointer-mutation Gantt renderer must be absent");
} catch (error) {
  if (error?.code !== "ENOENT") failures.push(error?.message || String(error));
}

expect(scenario.includes('const GANTT_SLOT_DRAG_MIME = "application/x-mes-gantt-slot"'), "React drag must use a private typed transfer payload");
expect(scenario.includes("event.dataTransfer.setData(GANTT_SLOT_DRAG_MIME"), "React drag must serialize the exact slot identity");
expect(scenario.includes("slot.rowId !== event.currentTarget.dataset.ganttReactDropLane"), "A slot must stay on its authoritative resource lane");
expect(scenario.includes('void commitSchedule(slot, plannedStart, "drag")'), "Drop must use the typed reschedule command");
expect(scenario.includes('source: "form" | "drag"'), "The command contract must identify form and drag sources");
expect(model.includes("const canDrag = canEditSchedule && capabilities.slotDrag !== false"), "Drag capability must fail closed with the schedule owner");
expect(app.includes('command.type !== "reschedule-slot"'), "The host must reject every unknown Gantt mutation");
expect(app.includes("authorizeSystemDomainAction(\"planning\", \"edit\")"), "The reschedule owner must retain RBAC");
expect(app.includes("changePlanningSlotSchedule(routeId, operationId, slotId, plannedStart.toISOString(), { expectedRevision, renderOnChange: false, renderOnConflict: false, requireDetailReadback: false, requireServerCommand: true })"), "React drag must call only the Planning server owner with exact concurrency and physical-slot projection readback");
expect(app.includes("projectedSlot.locked || projectedSlot.isLocked || isGanttSlotCompleted(projectedSlot)"), "Locked and completed projected slots must remain immutable");
expect(!app.includes("beginDrag("), "Deleted legacy pointer drag must not remain in the app graph");
expect(!app.includes("persistState();\n    return;\n  }\n  if (restoreCancelledDrag"), "Deleted local drag persistence must not remain in the app graph");

if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}
console.log("React Gantt drag owner QA passed");
