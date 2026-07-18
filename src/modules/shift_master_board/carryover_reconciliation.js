function text(value) {
  return String(value || "").trim();
}

// A carryover is not identified by its client-generated presentation id.
// During dual-write the server assigns a canonical id after the local board
// has already rendered a provisional item.  Its durable identity is the
// source board row plus the target shift date.
export function getShiftMasterBoardCarryoverLogicalKey(carryover = {}) {
  const sourceRowId = text(carryover?.sourceRowId);
  const dateKey = text(carryover?.dateKey);
  return sourceRowId && dateKey ? `${sourceRowId}\u0000${dateKey}` : "";
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

// Merge the compact server overlay without leaving both a locally generated
// id and its server counterpart in the board.  Server fields win, while
// local presentation-only fields (for example transferContract) survive until
// their own read model becomes server-owned.
export function reconcileShiftMasterBoardCarryovers(current = {}, incoming = {}, {
  dateKey = "",
  replaceDate = false,
} = {}) {
  const next = { ...record(current) };
  const scopedDateKey = text(dateKey);
  if (replaceDate && scopedDateKey) {
    Object.entries(next).forEach(([id, carryover]) => {
      if (text(carryover?.dateKey) === scopedDateKey) delete next[id];
    });
  }

  Object.entries(record(incoming)).forEach(([key, rawIncoming]) => {
    const incoming = record(rawIncoming);
    const canonicalId = text(incoming.id || key);
    if (!canonicalId) return;
    const logicalKey = getShiftMasterBoardCarryoverLogicalKey(incoming);
    let preserved = {};
    if (logicalKey) {
      Object.entries(next).forEach(([existingId, existing]) => {
        if (getShiftMasterBoardCarryoverLogicalKey(existing) !== logicalKey) return;
        // Preserve presentation-only data from the most recently known local
        // record, then remove every alias before writing the canonical id.
        preserved = { ...preserved, ...record(existing) };
        delete next[existingId];
      });
    } else if (next[canonicalId]) {
      preserved = record(next[canonicalId]);
      delete next[canonicalId];
    }
    next[canonicalId] = {
      ...preserved,
      ...incoming,
      id: canonicalId,
      // Only dispatch data can authorize a cancellation.  A local snapshot
      // id might look similar but was never accepted by the server.
      serverId: canonicalId,
    };
  });
  return next;
}
