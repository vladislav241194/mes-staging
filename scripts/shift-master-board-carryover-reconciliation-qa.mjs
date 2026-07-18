import {
  getShiftMasterBoardCarryoverLogicalKey,
  reconcileShiftMasterBoardCarryovers,
} from "../src/modules/shift_master_board/carryover_reconciliation.js";

function assert(value, message) {
  if (!value) throw new Error(message);
}

const provisional = {
  "board-carryover-row-1": {
    id: "board-carryover-row-1",
    sourceRowId: "row-1",
    dateKey: "2026-07-18",
    remainingQuantity: 3,
    transferContract: { status: "partial_carryover_required" },
  },
};
const canonical = {
  "shift-carryover-1": {
    id: "shift-carryover-1",
    sourceRowId: "row-1",
    dateKey: "2026-07-18",
    remainingQuantity: 3,
    workCenterId: "D5",
  },
};

assert(getShiftMasterBoardCarryoverLogicalKey(provisional["board-carryover-row-1"]) === "row-1\u00002026-07-18", "logical carryover key must join the source row and target date");
const reconciled = reconcileShiftMasterBoardCarryovers(provisional, canonical, { dateKey: "2026-07-18" });
assert(Object.keys(reconciled).length === 1 && !reconciled["board-carryover-row-1"], "server canonical carryover must replace the provisional browser id");
assert(reconciled["shift-carryover-1"]?.serverId === "shift-carryover-1", "canonical server id must be retained for later cancellation");
assert(reconciled["shift-carryover-1"]?.transferContract?.status === "partial_carryover_required", "server overlay must preserve local presentation-only carryover data");

const duplicate = reconcileShiftMasterBoardCarryovers({
  ...reconciled,
  "stale-alias": { id: "stale-alias", sourceRowId: "row-1", dateKey: "2026-07-18", remainingQuantity: 3 },
}, canonical, { dateKey: "2026-07-18" });
assert(Object.keys(duplicate).length === 1 && duplicate["shift-carryover-1"], "one logical carryover must never retain stale id aliases");

const retainedOtherDate = reconcileShiftMasterBoardCarryovers({
  ...duplicate,
  "carryover-other-date": { id: "carryover-other-date", sourceRowId: "row-1", dateKey: "2026-07-19" },
}, {}, { dateKey: "2026-07-18", replaceDate: true });
assert(!retainedOtherDate["shift-carryover-1"] && retainedOtherDate["carryover-other-date"], "full date replacement must remove only the active date's carryovers");

console.log("Shift master board carryover reconciliation QA: OK");
