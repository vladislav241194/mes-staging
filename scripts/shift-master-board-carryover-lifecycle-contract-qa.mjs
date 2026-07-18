import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function section(source, startMarker, endMarker, name) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert(start >= 0 && end > start, `${name} boundary must exist`);
  return source.slice(start, end);
}

const app = await readFile(fileURLToPath(new URL("../src/app.js", import.meta.url)), "utf8");
const render = await readFile(fileURLToPath(new URL("../src/modules/shift_master_board/render.js", import.meta.url)), "utf8");
const bridge = await readFile(fileURLToPath(new URL("../src/modules/shift_master_board/server_execution_bridge.js", import.meta.url)), "utf8");

const saveFact = section(render, "function saveShiftMasterBoardFact(", "function removeShiftMasterBoardCarryoverForSource(", "fact save lifecycle");
const createCarryover = section(render, "function createShiftMasterBoardCarryover(", "function bindShiftMasterBoardEvents(", "carryover creation lifecycle");
const mirrorFact = section(app, "async function mirrorShiftMasterBoardFactToServer(", "async function mirrorShiftMasterBoardCarryoverToServer(", "fact server mirror");
const mirrorCarryover = section(app, "async function mirrorShiftMasterBoardCarryoverToServer(", "async function mirrorShiftMasterBoardCarryoverRemovalToServer(", "carryover server mirror");
const mirrorRemoval = section(app, "async function mirrorShiftMasterBoardCarryoverRemovalToServer(", "function hydratePlanningWorkOrderDetail(", "carryover removal mirror");

assert(saveFact.includes("void onShiftMasterBoardFactSaved(finalRow, finalFact);"), "fact persistence must not relay an automatic carryover through the fact callback");
assert(saveFact.includes("onShiftMasterBoardCarryoverRemoved(finalRow, removedCarryover)"), "completed fact correction must notify the carryover cancellation lifecycle");
assert(createCarryover.includes("item.sourceRowId === slotId && item.dateKey === nextDate"), "carryovers must be matched by their logical source-row/date identity");
assert(createCarryover.includes("if (!isUnchanged) void onShiftMasterBoardCarryoverCreated(row, carryover, existing);"), "an unchanged partial fact must not emit a duplicate carryover write");
assert(mirrorFact.includes("async function mirrorShiftMasterBoardFactToServer(row, fact)"), "fact mirror must not accept a duplicate carryover argument");
assert(!mirrorFact.includes("mirrorShiftMasterBoardCarryoverToServer("), "fact mirror must not issue a second automatic carryover command");
assert(mirrorCarryover.includes("mirrorShiftMasterBoardCarryoverRemovalToServer(row, replacedCarryover"), "changed partial carryovers must cancel their active canonical predecessor first");
assert(mirrorRemoval.includes("buildShiftMasterBoardCarryoverCancelWrite"), "removed carryovers must build the explicit cancellation command");
assert(app.includes("onShiftMasterBoardCarryoverRemoved: (...args) => mirrorShiftMasterBoardCarryoverRemovalToServer(...args)"), "board callback must route removal through the server command adapter");
assert(bridge.includes("write.type === \"carryover-cancel\""), "server bridge must execute carryover cancellation commands");

console.log("Shift master board carryover lifecycle contract QA: OK");
