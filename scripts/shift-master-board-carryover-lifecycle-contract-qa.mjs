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
const owner = await readFile(fileURLToPath(new URL("../src/modules/shift_master_board/command_owner.js", import.meta.url)), "utf8");
const bridge = await readFile(fileURLToPath(new URL("../src/modules/shift_master_board/server_execution_bridge.js", import.meta.url)), "utf8");

const mergedCarryovers = section(owner, "function mergedCarryoverStore(", "export function prepareShiftMasterBoardFact(", "canonical carryover merge");
const prepareFact = section(owner, "export function prepareShiftMasterBoardFact(", "export function prepareShiftMasterBoardLane(", "fact command lifecycle");
const executeFact = section(app, "async function executeShiftExecutionFactCommand(", "async function executeEmployeeDesktopOperationFactCommand(", "fact owner execution");
const mirrorFact = section(app, "async function mirrorShiftMasterBoardFactToServer(", "async function mirrorShiftMasterBoardCarryoverToServer(", "fact server mirror");
const mirrorCarryover = section(app, "async function mirrorShiftMasterBoardCarryoverToServer(", "async function mirrorShiftMasterBoardCarryoverRemovalToServer(", "carryover server mirror");
const mirrorRemoval = section(app, "async function mirrorShiftMasterBoardCarryoverRemovalToServer(", "async function changePlanningRouteQuantity(", "carryover removal mirror");

assert(mergedCarryovers.includes("sourceRowId && dateKey"), "carryover merge must use the logical source-row/date identity");
assert(prepareFact.includes("text(carryover?.sourceRowId) === row.id && validDateKey(carryover?.dateKey) === nextDateKey"), "fact command must find the canonical carryover by source row and next date");
assert(prepareFact.includes("const unchanged = Boolean(existing && quantity(existing.remainingQuantity) === remainingQuantity)"), "an unchanged partial fact must reuse its canonical carryover");
assert(prepareFact.includes("carryoverChanged = !unchanged") && prepareFact.includes("replacedCarryover = carryoverChanged ? existing : null"), "changed carryovers must expose their predecessor to the server bridge");
assert(prepareFact.includes("removedCarryovers = Object.values(carryoverStore).filter"), "a completed corrected fact must expose every active carryover for cancellation");
assert(executeFact.includes("mirrorShiftMasterBoardFactToServer(prepared.row, prepared.fact)"), "fact execution must await the fact server owner");
assert(executeFact.includes("prepared.carryover && prepared.carryoverChanged") && executeFact.includes("mirrorShiftMasterBoardCarryoverToServer(prepared.row, prepared.carryover, prepared.replacedCarryover)"), "changed partial facts must write one canonical carryover");
assert(executeFact.includes("for (const removedCarryover of prepared.removedCarryovers || [])") && executeFact.includes("mirrorShiftMasterBoardCarryoverRemovalToServer"), "completed corrections must cancel every removed carryover");
assert(!mirrorFact.includes("mirrorShiftMasterBoardCarryoverToServer("), "fact mirror must not issue a duplicate automatic carryover command");
assert(mirrorCarryover.includes("mirrorShiftMasterBoardCarryoverRemovalToServer(row, replacedCarryover"), "changed partial carryovers must cancel their canonical predecessor first");
assert(mirrorRemoval.includes("buildShiftMasterBoardCarryoverCancelWrite"), "removed carryovers must build the explicit cancellation command");
assert(bridge.includes("write.type === \"carryover-cancel\""), "server bridge must execute carryover cancellation commands");
assert(!app.includes("modules/shift_master_board/render.js") && !app.includes("onShiftMasterBoardCarryoverRemoved"), "current app must not retain the retired renderer callback lifecycle");

console.log("Shift master board carryover lifecycle contract QA: OK");
