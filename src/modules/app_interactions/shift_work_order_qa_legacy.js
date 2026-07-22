export function createShiftWorkOrderQaLegacyApi(dependencies = {}) {
  const {
    getShiftMasterBoardModel = () => ({ rows: [], allRows: [] }),
    getUi = () => null,
    isQaRuntimeRequest = () => false,
    normalizeShiftMasterBoardQuantity = (rawValue = 0) => Number(rawValue) || 0,
    normalizeShiftWorkOrderIssueReports = () => ({}),
    persistUiState = () => {},
    renderPreservingModuleScroll = () => {},
    saveShiftMasterBoardAssignment = () => null,
  } = dependencies;

  function hasQaRuntimeAccess() {
    try {
      return Boolean(isQaRuntimeRequest());
    } catch {
      return false;
    }
  }

  function setShiftWorkOrderIssueReportsForTest(reportsByRow) {
    if (!hasQaRuntimeAccess()) {
      return { applied: false, reason: "qa parameter is required" };
    }
    const ui = getUi();
    if (!ui || typeof ui !== "object") {
      return { applied: false, reason: "runtime state is unavailable" };
    }
    ui.shiftWorkOrderIssueReports = normalizeShiftWorkOrderIssueReports(reportsByRow);
    persistUiState();
    renderPreservingModuleScroll();
    return {
      applied: true,
      rowCount: Object.keys(ui.shiftWorkOrderIssueReports || {}).length,
    };
  }

  function seedShiftWorkOrderJournalAssignmentForTest() {
    if (!hasQaRuntimeAccess()) {
      return { seeded: false, reason: "qa parameter is required" };
    }
    const ui = getUi();
    if (!ui || typeof ui !== "object") {
      return { seeded: false, reason: "runtime state is unavailable" };
    }
    const model = getShiftMasterBoardModel() || {};
    const rows = model.allRows || model.rows || [];
    const row = rows.find((item) => (
      item?.id
      && normalizeShiftMasterBoardQuantity(item.plannedQuantity || 0) > 0
      && ((item.availableEmployees || []).length || (item.employees || []).length)
    )) || rows[0] || null;
    if (!row?.id) return { seeded: false, reason: "shift row is missing" };
    const employee = (row.availableEmployees || []).find((item) => item?.id)
      || (row.employees || []).find((item) => item?.id)
      || null;
    if (!employee?.id) return { seeded: false, reason: "employee is missing", rowId: row.id };
    const plannedQuantity = normalizeShiftMasterBoardQuantity(row.plannedQuantity || 1);
    const quantity = Math.max(1, Math.min(plannedQuantity || 1, Math.floor((plannedQuantity || 1) * 0.5) || 1));
    const assignment = saveShiftMasterBoardAssignment(row.id, {
      masterId: row.masterProfile?.id || ui.activeShiftMasterId || "",
      executors: [{
        employeeId: employee.id,
        quantity,
        note: "QA распределение для журнала",
      }],
      updatedAt: new Date().toISOString(),
    });
    renderPreservingModuleScroll();
    return {
      seeded: Boolean(assignment?.assignedQuantity),
      rowId: row.id,
      assignedQuantity: assignment?.assignedQuantity || 0,
      plannedQuantity,
    };
  }

  return {
    setShiftWorkOrderIssueReportsForTest,
    seedShiftWorkOrderJournalAssignmentForTest,
  };
}
