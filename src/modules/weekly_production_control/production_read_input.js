function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function quantity(value) {
  return Math.max(0, Number(value || 0) || 0);
}

function linkedEntries(source = {}, slotId = "") {
  if (!slotId) return [];
  const prefix = `${slotId}::`;
  return Object.entries(asRecord(source))
    .filter(([key, record]) => {
      const recordSlotId = text(record?.slotId);
      return key === slotId
        || key.startsWith(prefix)
        || recordSlotId === slotId
        || recordSlotId.startsWith(prefix);
    })
    .map(([key, record]) => [text(record?.slotId, key), record])
    .filter(([, record]) => Boolean(record));
}

function reportedFact(record = {}) {
  const status = text(record.status);
  return quantity(record.actualQuantity) > 0
    || quantity(record.defectQuantity) > 0
    || Boolean(text(record.updatedAt || record.factUpdatedAt))
    || Boolean(status && status !== "not_reported");
}

function boardFactEntries(store = {}, slotId = "") {
  return linkedEntries(store, slotId).map(([key, record]) => {
    const actualQuantity = quantity(record?.actualQuantity);
    const defectQuantity = quantity(record?.defectQuantity);
    return [key, {
      slotId: text(record?.slotId, key),
      actualQuantity: Math.max(0, actualQuantity - defectQuantity),
      defectQuantity,
      status: actualQuantity > defectQuantity ? "accepted" : "not_reported",
      comment: text(record?.comment),
      deviationComment: text(record?.deviationComment),
      deviationNotes: asArray(record?.deviationNotes),
      updatedAt: text(record?.updatedAt),
    }];
  });
}

function assignmentRecords({ planningAssignments = {}, boardAssignments = {} } = {}, slotId = "") {
  const masterEntries = linkedEntries(planningAssignments, slotId);
  const boardEntries = linkedEntries(boardAssignments, slotId);
  const boardKeys = new Set(boardEntries.map(([key]) => key));
  const hasBoardEntries = boardEntries.length > 0;
  return [
    ...masterEntries
      .filter(([key]) => !boardKeys.has(key) && !(hasBoardEntries && key === slotId))
      .map(([, record]) => record),
    ...boardEntries.map(([, record]) => record),
  ].filter(Boolean);
}

function authSessionFactEntries({ boardAssignments = {}, authSessionFactDrafts = {} } = {}, slotId = "") {
  if (!slotId) return [];
  const assignmentStore = asRecord(boardAssignments);
  const findAssignment = (rowId) => {
    const direct = asRecord(assignmentStore[rowId]);
    if (Object.keys(direct).length) return direct;
    return Object.values(assignmentStore).find((assignment) => (
      assignment
      && (
        assignment.sourceRowId === rowId
        || assignment.slotId === rowId
        || assignment.sheetContract?.rowId === rowId
        || assignment.sheetContract?.sourceSlotId === rowId
      )
    )) || {};
  };
  return Object.entries(asRecord(authSessionFactDrafts)).map(([taskId, value]) => {
    const draft = asRecord(value);
    if (!draft.updatedAt) return null;
    const separatorIndex = taskId.lastIndexOf("::");
    const rowId = separatorIndex > 0 ? taskId.slice(0, separatorIndex) : taskId;
    const assignment = findAssignment(rowId);
    const linkedSlotId = text(
      assignment.slotId
      || assignment.sheetContract?.sourceSlotId
      || assignment.transferContract?.sourceSlotId
      || rowId,
    );
    if (linkedSlotId !== slotId && rowId !== slotId && !taskId.startsWith(`${slotId}::`)) return null;
    const actualQuantity = quantity(draft.actualQuantity);
    const defectQuantity = quantity(draft.defectQuantity);
    const deviationComment = text(draft.deviationComment);
    return [taskId, {
      slotId: linkedSlotId || slotId,
      actualQuantity: Math.max(0, actualQuantity - defectQuantity),
      defectQuantity,
      status: "accepted",
      comment: "Факт внесен с рабочего стола исполнителя",
      deviationComment,
      deviationNotes: deviationComment ? [{
        taskId,
        employeeName: "Исполнитель",
        text: deviationComment,
        createdAt: text(draft.updatedAt),
        deviationPercent: 0,
      }] : [],
      updatedAt: text(draft.updatedAt),
    }];
  }).filter(Boolean);
}

function factRecordsForRow(stores, rowId) {
  const masterEntries = linkedEntries(stores.planningAssignments, rowId);
  const boardEntries = boardFactEntries(stores.boardFacts, rowId);
  const boardKeys = new Set(boardEntries.map(([key]) => key));
  const hasBoardEntries = boardEntries.length > 0;
  const authEntries = hasBoardEntries ? [] : authSessionFactEntries(stores, rowId);
  return [
    ...masterEntries
      .filter(([key]) => !boardKeys.has(key) && !(hasBoardEntries && key === rowId))
      .map(([, record]) => record),
    ...boardEntries.map(([, record]) => record),
    ...authEntries.map(([, record]) => record),
  ].filter(reportedFact);
}

function issueLookupKeys(target = {}) {
  const source = asRecord(target);
  const sheet = asRecord(source.sheetContract);
  const transfer = asRecord(source.transfer);
  return [...new Set([
    source.id,
    source.rowId,
    source.sourceRowId,
    source.slotId,
    sheet.rowId,
    sheet.sourceRowId,
    sheet.sourceSlotId,
    transfer.sourceRowId,
    transfer.sourceSlotId,
  ].map((value) => text(value)).filter(Boolean))];
}

function reportsForRow(stores, rowId) {
  const targets = [{
    id: rowId,
    rowId,
    sourceRowId: rowId,
    slotId: rowId,
    sheetContract: { rowId, sourceRowId: rowId, sourceSlotId: rowId },
  }];
  assignmentRecords(stores, rowId).forEach((assignment) => {
    const sheetContract = asRecord(assignment.sheetContract);
    const transfer = asRecord(assignment.transferContract || sheetContract.transferContract);
    const sourceRowId = text(
      assignment.sourceRowId
      || sheetContract.rowId
      || transfer.sourceRowId
      || assignment.slotId
      || rowId,
    );
    targets.push({
      id: sourceRowId || rowId,
      rowId: sourceRowId || rowId,
      sourceRowId: sourceRowId || rowId,
      slotId: text(assignment.slotId || sheetContract.sourceSlotId || transfer.sourceSlotId, rowId),
      sheetContract,
      transfer,
    });
  });
  const reportStore = asRecord(stores.issueReports);
  const seen = new Set();
  return targets.flatMap((target) => issueLookupKeys(target).flatMap((key) => asArray(reportStore[key])))
    .filter((report) => {
      const key = text(report?.id || `${text(report?.rowId)}:${text(report?.taskId)}:${text(report?.createdAt)}:${text(report?.text)}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// This boundary accepts only explicit raw owner projections. It deliberately
// cannot call a legacy renderer, planning-table view model or Weekly model
// factory. The bounded planning API rows remain the authority for the period;
// execution/report stores contribute only facts linked to those durable IDs.
export function buildWeeklyProductionControlReadInput({
  generatedAt = new Date(),
  weekStart,
  weekAnchor = "",
  periodRows,
  workCenters = [],
  resources = [],
  planningAssignments = {},
  boardAssignments = {},
  boardFacts = {},
  authSessionFactDrafts = {},
  issueReports = {},
} = {}) {
  if (!Array.isArray(periodRows)) {
    throw new Error("Weekly Production Control requires bounded planning period rows");
  }
  const stores = {
    planningAssignments: asRecord(planningAssignments),
    boardAssignments: asRecord(boardAssignments),
    boardFacts: asRecord(boardFacts),
    authSessionFactDrafts: asRecord(authSessionFactDrafts),
    issueReports: asRecord(issueReports),
  };
  return {
    generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt,
    weekStart: weekStart instanceof Date ? weekStart.toISOString() : weekStart,
    weekAnchor,
    workCenters: asArray(workCenters).map((value) => ({ ...asRecord(value) })),
    resources: asArray(resources).map((value) => ({ ...asRecord(value) })),
    rows: periodRows.map((value, index) => {
      const row = asRecord(value);
      const rowId = text(row.id, `weekly-row-${index}`);
      return {
        id: rowId,
        plannedStart: row.plannedStart instanceof Date ? row.plannedStart.toISOString() : row.plannedStart,
        plannedEnd: row.plannedEnd instanceof Date ? row.plannedEnd.toISOString() : row.plannedEnd,
        quantity: quantity(row.quantity),
        unit: text(row.unit, "шт."),
        workCenterId: text(row.workCenterId),
        parentWorkCenterId: text(row.parentWorkCenterId),
        workCenterLabel: text(row.workCenterLabel, "Участок не задан"),
        resourceLabel: text(row.resourceLabel, "Ресурс не назначен"),
        sourceKind: text(row.sourceKind, "planning-period-weekly-api"),
        sortIndex: Number.isFinite(Number(row.sortIndex)) ? Number(row.sortIndex) : Number.MAX_SAFE_INTEGER,
        factRecords: factRecordsForRow(stores, rowId),
        reports: reportsForRow(stores, rowId),
      };
    }),
  };
}
