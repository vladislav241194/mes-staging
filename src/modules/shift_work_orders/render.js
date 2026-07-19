import { formatPersonDisplayName } from "../../ui/formatters.js";

export function createShiftWorkOrdersModule(dependencies = {}) {
  const {
    bindGenericModalCloseEvents = () => {},
    buildShiftMasterBoardSheetContract,
    buildShiftMasterBoardTransferContract,
    escapeAttribute,
    escapeHtml,
    formatDateTimeShort,
    getShiftMasterBoardAssignmentQuantity,
    getShiftMasterBoardModel,
    getShiftMasterEmployee,
    getShiftWorkOrderIssueLookupKeys,
    getShiftWorkOrderIssueReports,
    getShiftWorkOrderIssueSummary,
    getShiftWorkOrderReportPhotoItems,
    getSlotPlanningOrderId,
    getWorkOrderPrintPackageViewModel,
    icon,
    normalizePlainRecord,
    normalizeShiftMasterBoardQuantity,
    persistUiState,
    render,
    renderPreservingModuleScroll,
    renderRouteTreeCell,
    renderUiActionButton,
    renderUiEmptyState,
    renderUiModalFrame,
    renderUiModalShell,
    renderUiModulePage,
    renderUiPanel,
    renderUiPanelBody,
    renderUiStatusToken,
    renderUiTableWrap,
    toDate,
    toDateInput,
  } = dependencies;
  const getApp = dependencies.getApp || (() => null);
  const getUi = dependencies.getUi || (() => ({}));
  const app = {
    querySelector: (...args) => getApp()?.querySelector?.(...args) || null,
    querySelectorAll: (...args) => getApp()?.querySelectorAll?.(...args) || [],
  };
  const ui = new Proxy({}, {
    get(_target, property) {
      return getUi()?.[property];
    },
    set(_target, property, value) {
      const currentUi = getUi();
      if (currentUi && typeof currentUi === "object") currentUi[property] = value;
      return true;
    },
  });

  function getShiftWorkOrderJournalStatus(row = {}, assignment = {}, fact = {}, transfer = {}) {
    const assignedQuantity = normalizeShiftMasterBoardQuantity(row.boardAssignedQuantity || assignment.assignedQuantity || getShiftMasterBoardAssignmentQuantity(assignment));
    const factUpdated = Boolean(fact.updatedAt);
    const remainingQuantity = normalizeShiftMasterBoardQuantity(transfer.remainingQuantity || 0);
    if (factUpdated && remainingQuantity > 0) return { id: "carryover", label: "остаток", tone: "warning" };
    if (factUpdated) return { id: "closed", label: "факт внесен", tone: "ok" };
    if (assignment.issued) return { id: "issued", label: "в работе", tone: "primary" };
    if (assignedQuantity > 0) return { id: "assigned", label: "распределено", tone: "active" };
    return { id: "planned", label: "запланировано", tone: "neutral" };
  }
  
  function getShiftWorkOrderJournalStageLabel(status = {}) {
    const statusId = status?.id || "";
    if (statusId === "assigned") return "сменное задание";
    if (statusId === "issued") return "СЗН в работе";
    if (statusId === "closed") return "СЗН с фактом";
    if (statusId === "carryover") return "СЗН с остатком";
    return "запланировано";
  }
  
  function shouldIncludeShiftWorkOrderJournalRow(row = {}) {
    if (!row?.id) return false;
    if (row.status?.id && row.status.id !== "planned") return true;
    if (normalizeShiftMasterBoardQuantity(row.assignedQuantity || 0) > 0) return true;
    if (normalizeShiftMasterBoardQuantity(row.factQuantity || 0) > 0) return true;
    if (normalizeShiftMasterBoardQuantity(row.defectQuantity || 0) > 0) return true;
    if (Array.isArray(row.executors) && row.executors.length) return true;
    if (row.issuedAt) return true;
    const issueSummary = row.issueSummary || getShiftWorkOrderIssueSummary(row);
    return issueSummary.reportCount > 0 || issueSummary.photoCount > 0;
  }
  
  function buildShiftWorkOrderJournalRow(row = {}, options = {}) {
    const assignment = row.boardAssignment || options.assignment || {};
    const fact = row.boardFact || options.fact || {};
    const sheetContract = assignment.sheetContract || buildShiftMasterBoardSheetContract(row, assignment, fact);
    const transfer = fact.transferContract
      || assignment.transferContract
      || sheetContract.transferContract
      || buildShiftMasterBoardTransferContract(row, assignment, fact);
    const status = getShiftWorkOrderJournalStatus(row, assignment, fact, transfer);
    const plannedQuantity = normalizeShiftMasterBoardQuantity(sheetContract.plannedQuantity || row.plannedQuantity || assignment.plannedQuantity || 0);
    const assignedQuantity = normalizeShiftMasterBoardQuantity(sheetContract.assignedQuantity || row.boardAssignedQuantity || assignment.assignedQuantity || 0);
    const factQuantity = normalizeShiftMasterBoardQuantity(transfer.factQuantity || sheetContract.factQuantity || row.boardGoodQuantity || 0);
    const defectQuantity = normalizeShiftMasterBoardQuantity(transfer.defectQuantity || fact.defectQuantity || 0);
    const remainingQuantity = normalizeShiftMasterBoardQuantity(transfer.remainingQuantity || Math.max(0, plannedQuantity - factQuantity));
    const executors = Array.isArray(sheetContract.executors) && sheetContract.executors.length
      ? sheetContract.executors
      : (assignment.executors || []).map((executor) => {
        const employee = getShiftMasterEmployee(executor.employeeId);
        return {
          employeeId: executor.employeeId || "",
          employeeName: employee?.name || "Исполнитель не выбран",
          quantity: normalizeShiftMasterBoardQuantity(executor.quantity || 0),
          note: executor.note || "",
        };
      });
    const updatedAt = fact.updatedAt || sheetContract.updatedAt || assignment.updatedAt || row.issuedAt || row.startsAt || "";
    const rawIssueSummary = getShiftWorkOrderIssueSummary(row) || {};
    const issueSummary = { reportCount: Math.max(0, Number(rawIssueSummary.reportCount || 0) || 0), photoCount: Math.max(0, Number(rawIssueSummary.photoCount || 0) || 0) };
    const issueReports = getShiftWorkOrderIssueReports(row);
    return {
      id: row.id || sheetContract.rowId || options.id || "",
      sourceRowId: row.id || sheetContract.rowId || options.id || "",
      slotId: sheetContract.sourceSlotId || row.slotId || row.slot?.id || assignment.slotId || "",
      routeId: sheetContract.routeId || row.route?.id || row.routeId || assignment.routeId || row.documentContract?.routeId || "",
      planningOrderId: sheetContract.planningOrderId
        || row.documentContract?.planningOrderId
        || getSlotPlanningOrderId(row.slot || {}, sheetContract.routeId || row.route?.id || row.routeId || "")
        || row.route?.id
        || row.routeId
        || assignment.planningOrderId
        || "",
      routeStepId: sheetContract.stepId || row.step?.id || row.stepId || row.slot?.routeStepId || assignment.stepId || "",
      stepId: sheetContract.stepId || row.step?.id || row.stepId || row.slot?.routeStepId || assignment.stepId || "",
      documentNumber: sheetContract.documentNumber || row.documentNumber || "СЗН без номера",
      orderLabel: sheetContract.orderLabel || getShiftMasterRowOrderLabel(row),
      routePartLabel: sheetContract.routePartLabel || getShiftMasterRowRoutePartLabel(row),
      operationName: sheetContract.operationName || row.operationName || "Операция",
      workCenterLabel: sheetContract.workCenterLabel || row.workCenterLabel || "Участок не задан",
      resourceLabel: sheetContract.resourceLabel || row.resourceLabel || "",
      masterName: sheetContract.masterName || row.masterProfile?.name || "Мастер не назначен",
      executors,
      executorLabel: executors.length
        ? formatShiftWorkOrderExecutorList(executors)
        : "не назначены",
      plannedQuantity,
      assignedQuantity,
      factQuantity,
      defectQuantity,
      remainingQuantity,
      unit: sheetContract.unit || transfer.unit || row.unit || "шт.",
      status,
      stageLabel: getShiftWorkOrderJournalStageLabel(status),
      transfer,
      sheetContract,
      issuedAt: sheetContract.issuedAt || assignment.issuedAt || "",
      updatedAt,
      shiftDateKey: sheetContract.shiftDateKey || row.dateKey || row.timesheetDateKey || (row.startsAt ? toDateInput(row.startsAt) : ""),
      dateLabel: updatedAt ? formatDateTimeShort(updatedAt) : "дата не задана",
      timeLabel: row.timeLabel || "",
      issueSummary,
      issueReports,
    };
  }
  
  function buildShiftWorkOrderJournalStoredRow(id = "", assignment = {}) {
    const sheetContract = assignment.sheetContract || {};
    const transfer = assignment.transferContract || sheetContract.transferContract || {};
    const fact = normalizePlainRecord(ui.shiftMasterBoardFacts)[id] || {};
    const status = getShiftWorkOrderJournalStatus({}, assignment, fact, transfer);
    const plannedQuantity = normalizeShiftMasterBoardQuantity(sheetContract.plannedQuantity || transfer.plannedQuantity || assignment.plannedQuantity || 0);
    const assignedQuantity = normalizeShiftMasterBoardQuantity(sheetContract.assignedQuantity || transfer.assignedQuantity || assignment.assignedQuantity || 0);
    const factQuantity = normalizeShiftMasterBoardQuantity(transfer.factQuantity || sheetContract.factQuantity || fact.actualQuantity || 0);
    const remainingQuantity = normalizeShiftMasterBoardQuantity(transfer.remainingQuantity || Math.max(0, plannedQuantity - factQuantity));
    const updatedAt = fact.updatedAt || sheetContract.updatedAt || assignment.updatedAt || "";
    const issueTarget = { id, sourceRowId: sheetContract.rowId || assignment.sourceRowId || id };
    const rawIssueSummary = getShiftWorkOrderIssueSummary(issueTarget) || {};
    const issueSummary = { reportCount: Math.max(0, Number(rawIssueSummary.reportCount || 0) || 0), photoCount: Math.max(0, Number(rawIssueSummary.photoCount || 0) || 0) };
    const issueReports = getShiftWorkOrderIssueReports(issueTarget);
    return {
      id,
      sourceRowId: sheetContract.rowId || assignment.sourceRowId || id,
      slotId: sheetContract.sourceSlotId || assignment.slotId || "",
      routeId: sheetContract.routeId || assignment.routeId || transfer.routeId || "",
      planningOrderId: sheetContract.planningOrderId || assignment.planningOrderId || transfer.planningOrderId || sheetContract.routeId || assignment.routeId || "",
      routeStepId: sheetContract.stepId || assignment.stepId || transfer.stepId || transfer.fromStepId || "",
      stepId: sheetContract.stepId || assignment.stepId || transfer.stepId || transfer.fromStepId || "",
      documentNumber: sheetContract.documentNumber || `СЗН ${id.slice(0, 8)}`,
      orderLabel: sheetContract.orderLabel || assignment.planningOrderId || "Заказ-наряд",
      routePartLabel: sheetContract.routePartLabel || "Часть маршрута",
      operationName: sheetContract.operationName || transfer.fromOperationName || "Операция",
      workCenterLabel: sheetContract.workCenterLabel || transfer.fromWorkCenterLabel || assignment.workCenterId || "Участок не задан",
      resourceLabel: sheetContract.resourceLabel || assignment.resourceId || "",
      masterName: sheetContract.masterName || assignment.masterId || "Мастер не назначен",
      executors: sheetContract.executors || assignment.executors || [],
      executorLabel: (sheetContract.executors || assignment.executors || []).length
        ? formatShiftWorkOrderExecutorList(sheetContract.executors || assignment.executors || [])
        : "не назначены",
      plannedQuantity,
      assignedQuantity,
      factQuantity,
      defectQuantity: normalizeShiftMasterBoardQuantity(transfer.defectQuantity || fact.defectQuantity || 0),
      remainingQuantity,
      unit: sheetContract.unit || transfer.unit || assignment.unit || "шт.",
      status,
      stageLabel: getShiftWorkOrderJournalStageLabel(status),
      transfer,
      sheetContract,
      issuedAt: sheetContract.issuedAt || assignment.issuedAt || "",
      updatedAt,
      shiftDateKey: sheetContract.shiftDateKey || assignment.dateKey || assignment.timesheetDateKey || (updatedAt ? toDateInput(updatedAt) : ""),
      dateLabel: updatedAt ? formatDateTimeShort(updatedAt) : "дата не задана",
      timeLabel: "",
      issueSummary,
      issueReports,
    };
  }
  
  function getShiftWorkOrderJournalViewModel() {
    const model = getShiftMasterBoardModel();
    const rows = [];
    const rowIds = new Set();
    (model.allRows || []).forEach((row) => {
      const journalRow = buildShiftWorkOrderJournalRow(row);
      if (!shouldIncludeShiftWorkOrderJournalRow(journalRow)) return;
      rows.push(journalRow);
      rowIds.add(journalRow.id);
    });
    Object.entries(normalizePlainRecord(ui.shiftMasterBoardAssignments)).forEach(([id, assignment]) => {
      if (!id || rowIds.has(id)) return;
      const journalRow = buildShiftWorkOrderJournalStoredRow(id, assignment);
      if (!shouldIncludeShiftWorkOrderJournalRow(journalRow)) return;
      rows.push(journalRow);
    });
    const sortedRows = rows.sort((left, right) => (
      toDate(right.updatedAt || right.issuedAt || 0) - toDate(left.updatedAt || left.issuedAt || 0)
      || String(left.documentNumber).localeCompare(String(right.documentNumber), "ru")
      || String(left.id).localeCompare(String(right.id), "ru")
    ));
    const selectedId = String(ui.shiftWorkOrderJournalSelectedId || "");
    const selectedRow = sortedRows.find((row) => row.id === selectedId)
      || sortedRows.find((row) => row.status.id !== "planned")
      || sortedRows[0]
      || null;
    if (selectedRow && ui.shiftWorkOrderJournalSelectedId !== selectedRow.id) ui.shiftWorkOrderJournalSelectedId = selectedRow.id;
    const byStatus = sortedRows.reduce((map, row) => {
      map[row.status.id] = (map[row.status.id] || 0) + 1;
      return map;
    }, {});
    const totals = sortedRows.reduce((acc, row) => {
      acc.planned += row.plannedQuantity;
      acc.assigned += row.assignedQuantity;
      acc.fact += row.factQuantity;
      acc.remaining += row.remainingQuantity;
      return acc;
    }, { planned: 0, assigned: 0, fact: 0, remaining: 0 });
    return {
      rows: sortedRows,
      documentTree: buildShiftWorkOrderDocumentTree(sortedRows),
      selectedRow,
      byStatus,
      totals,
      sourceWindow: model.window,
    };
  }
  
  function renderShiftWorkOrdersPage() {
    const model = getShiftWorkOrderJournalViewModel();
    return renderUiModulePage({
      ariaLabel: "Журнал сменных заданий",
      className: "shift-work-orders-page",
      workspaceClassName: "shift-work-orders-workspace",
      contentClassName: "shift-work-orders-content",
      visualContract: "base-glass-reference-v1 headerless-module",
      content: `
        <section class="shift-work-orders-main-grid">
          ${renderShiftWorkOrdersTable(model)}
          ${renderShiftWorkOrdersDetail(model.selectedRow)}
        </section>
      `,
    });
  }
  
  function renderShiftWorkOrderIssueReports(row) {
    const rowId = row?.id || row?.sourceRowId || "";
    const reports = getShiftWorkOrderIssueReports(row || rowId);
    const photoItems = getShiftWorkOrderReportPhotoItems(row || rowId);
    const photoCount = photoItems.length;
    return `
      <section class="shift-work-orders-issue-list" data-visual-qa-target="shift-work-orders-issue-reports">
        <header data-visual-qa-target="shift-work-orders-issue-header">
          <strong data-visual-qa-target="shift-work-orders-issue-title">Проблемы / Report</strong>
          <span data-visual-qa-target="shift-work-orders-issue-count">${reports.length.toLocaleString("ru-RU")} записей · ${photoCount.toLocaleString("ru-RU")} фото</span>
        </header>
        ${reports.length ? reports.map((report) => {
          const photo = normalizePlainRecord(report.photo);
          const reportRowId = report.rowId || rowId;
          const photoButtonAttributes = photo.dataUrl
            ? `type="button" data-shift-work-order-report-photo="${escapeAttribute(photo.id || report.id)}" data-shift-work-order-report-photo-row="${escapeAttribute(reportRowId)}" data-visual-qa-target="shift-work-orders-issue-photo"`
            : `type="button" disabled data-visual-qa-target="shift-work-orders-issue-photo"`;
          return `
            <article class="shift-work-orders-issue-card" data-visual-qa-target="shift-work-orders-issue-card">
              <button class="shift-work-orders-issue-photo ${photo.dataUrl ? "has-photo" : "is-empty"}" ${photoButtonAttributes} aria-label="${escapeAttribute(photo.dataUrl ? `Открыть фото проблемы. Всего фото: ${photoCount}` : "Фото не приложено")}">
                ${photo.dataUrl ? `<img src="${escapeAttribute(photo.dataUrl)}" alt="${escapeAttribute(photo.name || "Фото проблемы")}">` : icon("alert")}
                ${photo.dataUrl ? `<span class="shift-work-orders-issue-photo-count" data-visual-qa-target="shift-work-orders-issue-photo-count">${photoCount.toLocaleString("ru-RU")}</span>` : ""}
              </button>
              <div class="shift-work-orders-issue-copy" data-visual-qa-target="shift-work-orders-issue-copy">
                <header data-visual-qa-target="shift-work-orders-issue-card-header">
                  <strong data-visual-qa-target="shift-work-orders-issue-card-author">${escapeHtml(formatShiftWorkOrderPersonName(report.employeeName || "Исполнитель"))}</strong>
                  <span data-visual-qa-target="shift-work-orders-issue-card-date">${escapeHtml(report.createdAt ? formatDateTimeShort(report.createdAt) : "без даты")}</span>
                </header>
                <p data-visual-qa-target="shift-work-orders-issue-card-text">${escapeHtml(report.text || "Описание не заполнено.")}</p>
                <small data-visual-qa-target="shift-work-orders-issue-card-meta">${escapeHtml([
                  report.operationName || row?.operationName || "",
                  report.workCenterLabel || row?.workCenterLabel || "",
                  photo.name ? `фото: ${photo.name}` : "",
                ].filter(Boolean).join(" · "))}</small>
                ${photo.storageNote ? `<small data-visual-qa-target="shift-work-orders-issue-card-storage-note">${escapeHtml(photo.storageNote)}</small>` : ""}
              </div>
            </article>
          `;
        }).join("") : `
          <p class="shift-work-orders-issue-empty" data-visual-qa-target="shift-work-orders-issue-empty">Проблемы по этому СЗН не зафиксированы.</p>
        `}
      </section>
    `;
  }
  
  function buildShiftWorkOrderDocumentTree(rows = []) {
    const groups = new Map();
    (rows || []).forEach((row) => {
      const key = String(row.planningOrderId || row.routeId || row.orderLabel || "work-order").trim() || "work-order";
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          routeId: row.planningOrderId || row.routeId || "",
          label: row.orderLabel || "Заказ-наряд",
          meta: row.routePartLabel || row.operationName || "",
          plannedQuantity: 0,
          assignedQuantity: 0,
          factQuantity: 0,
          remainingQuantity: 0,
          unit: row.unit || "шт.",
          issueReportCount: 0,
          issuePhotoCount: 0,
          rows: [],
          operationMap: new Map(),
          latestTime: 0,
          latestLabel: "дата не задана",
        });
      }
      const group = groups.get(key);
      group.rows.push(row);
      const operationKey = String(row.routeStepId || row.stepId || row.sheetContract?.stepId || [
        row.routePartLabel,
        row.operationName,
        row.workCenterLabel,
      ].filter(Boolean).join("|") || "operation").trim();
      if (!group.operationMap.has(operationKey)) {
        group.operationMap.set(operationKey, {
          id: operationKey,
          operationName: row.operationName || "Операция",
          workCenterLabel: row.workCenterLabel || "Участок не задан",
          routePartLabel: row.routePartLabel || "",
          plannedQuantity: 0,
          assignedQuantity: 0,
          factQuantity: 0,
          remainingQuantity: 0,
          unit: row.unit || "шт.",
          issueReportCount: 0,
          issuePhotoCount: 0,
          rows: [],
          latestTime: 0,
          latestLabel: "дата не задана",
        });
      }
      const operationGroup = group.operationMap.get(operationKey);
      const issueSummary = row.issueSummary || getShiftWorkOrderIssueSummary(row);
      operationGroup.rows.push(row);
      operationGroup.plannedQuantity = Math.max(
        operationGroup.plannedQuantity,
        normalizeShiftMasterBoardQuantity(row.plannedQuantity || 0),
      );
      operationGroup.assignedQuantity += normalizeShiftMasterBoardQuantity(row.assignedQuantity || 0);
      operationGroup.factQuantity += normalizeShiftMasterBoardQuantity(row.factQuantity || 0);
      operationGroup.remainingQuantity = Math.max(0, operationGroup.plannedQuantity - operationGroup.factQuantity);
      operationGroup.issueReportCount += issueSummary.reportCount;
      operationGroup.issuePhotoCount += issueSummary.photoCount;
      if (!group.routeId && (row.planningOrderId || row.routeId)) group.routeId = row.planningOrderId || row.routeId;
      if (!group.meta && row.routePartLabel) group.meta = row.routePartLabel;
      const rowTime = toDate(row.updatedAt || row.issuedAt || row.shiftDateKey || 0);
      if (rowTime > group.latestTime) {
        group.latestTime = rowTime;
        group.latestLabel = row.dateLabel || (row.updatedAt ? formatDateTimeShort(row.updatedAt) : "дата не задана");
      }
      if (rowTime > operationGroup.latestTime) {
        operationGroup.latestTime = rowTime;
        operationGroup.latestLabel = row.dateLabel || (row.updatedAt ? formatDateTimeShort(row.updatedAt) : "дата не задана");
      }
    });
    return [...groups.values()].map((group) => {
      const operationGroups = [...group.operationMap.values()].sort((left, right) => (
        right.latestTime - left.latestTime
        || String(left.operationName).localeCompare(String(right.operationName), "ru")
        || String(left.id).localeCompare(String(right.id), "ru")
      ));
      operationGroups.forEach((operationGroup) => {
        operationGroup.rows.sort((left, right) => (
          toDate(right.updatedAt || right.issuedAt || right.shiftDateKey || 0) - toDate(left.updatedAt || left.issuedAt || left.shiftDateKey || 0)
          || String(left.documentNumber).localeCompare(String(right.documentNumber), "ru")
        ));
      });
      group.operationGroups = operationGroups;
      group.operationMap = undefined;
      group.plannedQuantity = operationGroups.reduce((sum, operationGroup) => sum + operationGroup.plannedQuantity, 0);
      group.assignedQuantity = operationGroups.reduce((sum, operationGroup) => sum + operationGroup.assignedQuantity, 0);
      group.factQuantity = operationGroups.reduce((sum, operationGroup) => sum + operationGroup.factQuantity, 0);
      group.remainingQuantity = operationGroups.reduce((sum, operationGroup) => sum + operationGroup.remainingQuantity, 0);
      group.issueReportCount = operationGroups.reduce((sum, operationGroup) => sum + operationGroup.issueReportCount, 0);
      group.issuePhotoCount = operationGroups.reduce((sum, operationGroup) => sum + operationGroup.issuePhotoCount, 0);
      return group;
    }).sort((left, right) => (
      right.latestTime - left.latestTime
      || String(left.label).localeCompare(String(right.label), "ru")
      || String(left.id).localeCompare(String(right.id), "ru")
    ));
  }
  
  function formatShiftWorkOrderPrintQuantity(value, unit = "шт.") {
    return `${normalizeShiftMasterBoardQuantity(value || 0).toLocaleString("ru-RU")} ${unit || "шт."}`;
  }
  
  function getShiftWorkOrderOperationTreeStatus(operationGroup = {}) {
    const plannedQuantity = normalizeShiftMasterBoardQuantity(operationGroup.plannedQuantity || 0);
    const assignedQuantity = normalizeShiftMasterBoardQuantity(operationGroup.assignedQuantity || 0);
    const factQuantity = normalizeShiftMasterBoardQuantity(operationGroup.factQuantity || 0);
    if (plannedQuantity > 0 && factQuantity >= plannedQuantity) return { label: "закрыта", tone: "ok" };
    if (plannedQuantity > 0 && assignedQuantity >= plannedQuantity) return { label: "распределена", tone: "active" };
    if (assignedQuantity > 0) return { label: "частично", tone: "warning" };
    return { label: "план", tone: "neutral" };
  }
  
  function getShiftWorkOrderDetailPercent(value = 0, total = 0) {
    const normalizedValue = normalizeShiftMasterBoardQuantity(value || 0);
    const normalizedTotal = normalizeShiftMasterBoardQuantity(total || 0);
    if (normalizedTotal <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((normalizedValue / normalizedTotal) * 100)));
  }
  
  function renderShiftWorkOrdersDetailVolume(row, issueSummary = getShiftWorkOrderIssueSummary(row)) {
    const unit = row.unit || "шт.";
    const plannedQuantity = normalizeShiftMasterBoardQuantity(row.plannedQuantity || 0);
    const assignedQuantity = normalizeShiftMasterBoardQuantity(row.assignedQuantity || 0);
    const factQuantity = normalizeShiftMasterBoardQuantity(row.factQuantity || 0);
    const defectQuantity = normalizeShiftMasterBoardQuantity(row.defectQuantity || 0);
    const remainingQuantity = normalizeShiftMasterBoardQuantity(row.remainingQuantity || Math.max(0, plannedQuantity - factQuantity));
    const assignedPercent = getShiftWorkOrderDetailPercent(assignedQuantity, plannedQuantity);
    const factPercent = getShiftWorkOrderDetailPercent(factQuantity, plannedQuantity);
    const factSource = row.status.id === "closed" || row.status.id === "carryover"
      ? "внесен с рабочего стола"
      : "ожидает рабочего стола";
    return `
      <section class="shift-work-orders-detail-volume" data-visual-qa-target="shift-work-orders-detail-volume">
        <div class="shift-work-orders-detail-progress" aria-hidden="true">
          <i style="width: ${assignedPercent}%"></i>
          <b style="width: ${factPercent}%"></b>
        </div>
        <div class="shift-work-orders-detail-volume-grid">
          <article><span>Распределено</span><strong>${assignedQuantity.toLocaleString("ru-RU")} ${escapeHtml(unit)}</strong></article>
          <article><span>Факт</span><strong>${factQuantity.toLocaleString("ru-RU")} ${escapeHtml(unit)}</strong><small>${escapeHtml(factSource)}</small></article>
          <article><span>Остаток</span><strong>${remainingQuantity.toLocaleString("ru-RU")} ${escapeHtml(unit)}</strong></article>
          <article><span>Брак</span><strong>${defectQuantity.toLocaleString("ru-RU")} ${escapeHtml(unit)}</strong></article>
          <article><span>Report</span><strong>${issueSummary.reportCount.toLocaleString("ru-RU")} проблем</strong><small>${issueSummary.photoCount.toLocaleString("ru-RU")} фото</small></article>
        </div>
      </section>
    `;
  }
  
  function renderShiftWorkOrdersDetailTransfer(row) {
    const transfer = row.transfer || {};
    return `
      <section class="shift-work-orders-transfer" data-visual-qa-target="shift-work-orders-transfer">
        <article>
          <span>До</span>
          <strong>${escapeHtml(transfer.fromOperationName || row.operationName)}</strong>
          <small>${escapeHtml(transfer.fromWorkCenterLabel || row.workCenterLabel)}</small>
        </article>
        <span class="shift-work-orders-transfer-link" data-visual-qa-target="shift-work-orders-transfer-link" aria-hidden="true"></span>
        <article class="is-current">
          <span>Сейчас</span>
          <strong>${escapeHtml(row.operationName)}</strong>
          <small>${escapeHtml(row.workCenterLabel)} · текущий шаг</small>
        </article>
        <span class="shift-work-orders-transfer-link" data-visual-qa-target="shift-work-orders-transfer-link" aria-hidden="true"></span>
        <article>
          <span>После</span>
          <strong>${escapeHtml(transfer.toOperationName || transfer.targetLabel || "следующий шаг")}</strong>
          <small>${escapeHtml(transfer.toWorkCenterLabel || "не задано")}</small>
        </article>
      </section>
    `;
  }
  
  function formatShiftWorkOrderPersonName(value = "") {
    return formatPersonDisplayName(value, { fallback: "Исполнитель" });
  }
  
  function formatShiftWorkOrderExecutorList(executors = []) {
    return (Array.isArray(executors) ? executors : [])
      .map((executor) => formatShiftWorkOrderPersonName(executor.employeeName || getShiftMasterEmployee(executor.employeeId)?.name || "Исполнитель"))
      .filter(Boolean)
      .join(", ");
  }
  
  function renderShiftWorkOrderPrintInfoTable(rows = [], className = "") {
    return `
      <table data-ui-component="PrintTable" class="route-print-table shift-work-order-print-info-table ${escapeAttribute(className)}">
        <tbody>
          ${rows.map(([label, value]) => `
            <tr>
              <th>${escapeHtml(label)}</th>
              <td>${escapeHtml(value || "—")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }
  
  function renderShiftWorkOrderPrintQuantityTable(row) {
    const unit = row.unit || "шт.";
    const items = [
      ["План", row.plannedQuantity],
      ["Распределено", row.assignedQuantity],
      ["Факт", row.factQuantity],
      ["Брак", row.defectQuantity],
      ["Остаток", row.remainingQuantity],
    ];
    return `
      <table data-ui-component="PrintTable" class="route-print-table shift-work-order-print-quantity-table">
        <thead>
          <tr>
            ${items.map(([label]) => `<th>${escapeHtml(label)}</th>`).join("")}
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            ${items.map(([, value]) => `<td>${escapeHtml(formatShiftWorkOrderPrintQuantity(value, unit))}</td>`).join("")}
            <td>${escapeHtml(row.status?.label || "—")}</td>
          </tr>
        </tbody>
      </table>
    `;
  }
  
  function renderShiftWorkOrderPrintExecutorsTable(row) {
    const executors = Array.isArray(row.executors) ? row.executors : [];
    if (!executors.length) {
      return `
        <div class="route-print-empty">
          <strong>Исполнители не назначены</strong>
          <span>Сменный заказ-наряд пока остается плановой строкой без распределения.</span>
        </div>
      `;
    }
    return `
      <table data-ui-component="PrintTable" class="route-print-table shift-work-order-print-executors-table">
        <thead>
          <tr>
            <th>П/п</th>
            <th>Исполнитель</th>
            <th>Кол-во</th>
            <th>Комментарий</th>
          </tr>
        </thead>
        <tbody>
          ${executors.map((executor, index) => `
            <tr>
              <td>${index + 1}</td>
              <td><strong>${escapeHtml(formatShiftWorkOrderPersonName(executor.employeeName || getShiftMasterEmployee(executor.employeeId)?.name || "Исполнитель"))}</strong></td>
              <td>${escapeHtml(formatShiftWorkOrderPrintQuantity(executor.quantity || 0, row.unit || "шт."))}</td>
              <td>${escapeHtml(executor.note || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }
  
  function renderShiftWorkOrderPrintTransferTable(row) {
    const transfer = row.transfer || {};
    return renderShiftWorkOrderPrintInfoTable([
      ["Откуда", [transfer.fromWorkCenterLabel || row.workCenterLabel, transfer.fromOperationName || row.operationName].filter(Boolean).join(" · ")],
      ["Сейчас", [row.workCenterLabel, row.operationName].filter(Boolean).join(" · ")],
      ["Куда", [transfer.toWorkCenterLabel || "не задано", transfer.toOperationName || transfer.targetLabel || "следующий шаг"].filter(Boolean).join(" · ")],
      ["Передача", transfer.targetLabel || "нет данных"],
      ["Остаток передачи", transfer.remainingQuantity ? formatShiftWorkOrderPrintQuantity(transfer.remainingQuantity, row.unit || "шт.") : "остатка нет"],
    ], "shift-work-order-print-transfer-table");
  }
  
  function renderShiftWorkOrderPrintSignatureGrid() {
    return `
      <div class="route-print-signatures shift-work-order-print-signatures">
        ${["Мастер", "Исполнитель", "Передал", "Принял"].map((label) => `
          <article>
            <span>${escapeHtml(label)}</span>
            <i aria-hidden="true"></i>
          </article>
        `).join("")}
      </div>
    `;
  }
  
  function renderShiftWorkOrderPrintSheet(row) {
    const documentDate = formatDateTimeShort(new Date().toISOString());
    const formedLabel = row.issuedAt ? formatDateTimeShort(row.issuedAt) : "ожидает распределение";
    return `
      <article class="route-print-sheet shift-work-order-print-sheet" aria-label="Печатная форма сменного заказ-наряда">
        <section class="route-print-title-block">
          <div class="route-print-title-row">
            <h1>Сменный заказ-наряд ${escapeHtml(row.documentNumber || "")}</h1>
            <time class="route-print-title-date">${escapeHtml(documentDate)}</time>
          </div>
          <p>${escapeHtml([row.operationName, row.orderLabel, formatShiftWorkOrderPrintQuantity(row.plannedQuantity, row.unit)].filter(Boolean).join(" | "))}</p>
        </section>
  
        <section class="route-print-section">
          <header class="route-print-section-head">
            <div>
              <span>Паспорт документа</span>
              <h2>Основание сменной работы</h2>
            </div>
            <strong>${escapeHtml(row.status?.label || "статус не задан")}</strong>
          </header>
          ${renderShiftWorkOrderPrintInfoTable([
            ["Заказ-наряд", row.orderLabel],
            ["Маршрут", row.routePartLabel],
            ["Операция", row.operationName],
            ["Участок", row.workCenterLabel],
            ["Ресурс", row.resourceLabel || row.workCenterLabel],
            ["Мастер", formatShiftWorkOrderPersonName(row.masterName)],
            ["Сформирован", formedLabel],
            ["Обновлено", row.dateLabel],
          ], "shift-work-order-print-passport-table")}
        </section>
  
        <section class="route-print-section">
          <header class="route-print-section-head">
            <div>
              <span>Объем</span>
              <h2>План, распределение и факт</h2>
            </div>
          </header>
          ${renderShiftWorkOrderPrintQuantityTable(row)}
        </section>
  
        <section class="route-print-section">
          <header class="route-print-section-head">
            <div>
              <span>Назначение</span>
              <h2>Исполнители сменного задания</h2>
            </div>
          </header>
          ${renderShiftWorkOrderPrintExecutorsTable(row)}
        </section>
  
        <section class="route-print-section">
          <header class="route-print-section-head">
            <div>
              <span>Передача</span>
              <h2>Физическое движение изделия</h2>
            </div>
          </header>
          ${renderShiftWorkOrderPrintTransferTable(row)}
        </section>
  
        <section class="route-print-section route-print-notes">
          <header class="route-print-section-head">
            <div>
              <span>Производство</span>
              <h2>Отметки смены</h2>
            </div>
          </header>
          <div></div>
        </section>
  
        ${renderShiftWorkOrderPrintSignatureGrid()}
      </article>
    `;
  }
  
  function renderShiftWorkOrderPrintPreviewModal() {
    const rowId = String(ui.shiftWorkOrderPrintPreviewId || "");
    if (!rowId) return "";
    const model = getShiftWorkOrderJournalViewModel();
    const row = model.rows.find((item) => item.id === rowId) || model.selectedRow;
    if (!row) return "";
    return `
      <div class="modal-backdrop route-print-backdrop shift-work-order-print-backdrop" data-modal-backdrop>
        ${renderUiModalShell({
          className: "large-modal route-print-modal shift-work-order-print-modal",
          attributes: "aria-label=\"Печатная форма сменного заказ-наряда\"",
          content: `
          <div class="modal-header route-print-ui">
            <div>
              <span class="eyebrow">Печатная форма</span>
              <h2>${escapeHtml(row.documentNumber || "Сменный заказ-наряд")}</h2>
            </div>
            ${renderUiActionButton({ iconName: "close", tone: "icon", attributes: "data-close-modal type=\"button\" title=\"Закрыть\" aria-label=\"Закрыть\"" })}
          </div>
          <div class="route-print-scroll">
            ${renderShiftWorkOrderPrintSheet(row)}
          </div>
          <div class="modal-footer route-print-ui">
            ${renderUiActionButton({ label: "Закрыть", iconName: "close", attributes: "data-close-modal type=\"button\"" })}
            ${renderUiActionButton({ label: "Печать / PDF", iconName: "download", tone: "primary", attributes: "data-shift-work-order-print-run type=\"button\"" })}
          </div>
        `,
        })}
      </div>
    `;
  }
  
  function renderShiftWorkOrderIssuePhotoModal() {
    const viewer = normalizePlainRecord(ui.shiftWorkOrderIssuePhotoViewer);
    const rowId = String(viewer.rowId || "").trim();
    const photoId = String(viewer.photoId || "").trim();
    if (!rowId || !photoId) return "";
    const photos = getShiftWorkOrderReportPhotoItems(rowId);
    if (!photos.length) return "";
    const activeIndex = Math.max(0, photos.findIndex((item) => item.photoId === photoId || item.reportId === photoId));
    const activePhoto = photos[activeIndex] || photos[0];
    const model = getShiftWorkOrderJournalViewModel();
    const row = model.rows.find((item) => getShiftWorkOrderIssueLookupKeys(item).includes(rowId)) || model.selectedRow || null;
    const counterLabel = `${(activeIndex + 1).toLocaleString("ru-RU")} из ${photos.length.toLocaleString("ru-RU")}`;
    return `
      <div class="modal-backdrop shift-work-orders-photo-backdrop" data-modal-backdrop>
        ${renderUiModalFrame({
          className: "large-modal shift-work-orders-photo-modal",
          size: "large",
          attributes: "aria-label=\"Фото report\"",
          title: activePhoto.name || "Фото проблемы",
          meta: `Report · ${counterLabel}${[row?.documentNumber, activePhoto.employeeName ? formatShiftWorkOrderPersonName(activePhoto.employeeName) : "", activePhoto.createdAt ? formatDateTimeShort(activePhoto.createdAt) : ""].filter(Boolean).length ? ` · ${[row?.documentNumber, activePhoto.employeeName ? formatShiftWorkOrderPersonName(activePhoto.employeeName) : "", activePhoto.createdAt ? formatDateTimeShort(activePhoto.createdAt) : ""].filter(Boolean).join(" · ")}` : ""}`,
          headActions: renderUiActionButton({ iconName: "close", tone: "icon", attributes: "data-close-modal type=\"button\" title=\"Закрыть\" aria-label=\"Закрыть\"" }),
          body: `
            <div class="shift-work-orders-photo-viewer" data-visual-qa-target="shift-work-orders-photo-viewer">
              ${renderUiActionButton({ iconName: "arrowLeft", tone: "icon", className: "shift-work-orders-photo-nav", attributes: `data-shift-work-order-report-photo-nav="-1" type="button" ${photos.length > 1 ? "" : "disabled"} aria-label="Предыдущее фото"` })}
              <figure class="shift-work-orders-photo-stage" data-visual-qa-target="shift-work-orders-photo-stage">
                <img src="${escapeAttribute(activePhoto.dataUrl)}" alt="${escapeAttribute(activePhoto.name || "Фото проблемы")}">
                <figcaption>
                  <strong>${escapeHtml(activePhoto.text || "Описание проблемы не заполнено.")}</strong>
                  <span>${escapeHtml([activePhoto.operationName, activePhoto.workCenterLabel].filter(Boolean).join(" · "))}</span>
                </figcaption>
              </figure>
              ${renderUiActionButton({ iconName: "arrowRight", tone: "icon", className: "shift-work-orders-photo-nav", attributes: `data-shift-work-order-report-photo-nav="1" type="button" ${photos.length > 1 ? "" : "disabled"} aria-label="Следующее фото"` })}
            </div>
          `,
          actions: `
            <span class="shift-work-orders-photo-counter" data-visual-qa-target="shift-work-orders-photo-counter">${escapeHtml(counterLabel)}</span>
            ${renderUiActionButton({ label: "Закрыть", iconName: "close", attributes: "data-close-modal type=\"button\"" })}
          `,
        })}
      </div>
    `;
  }
  
  function normalizeShiftWorkOrderCollapsedTreeIds(value = []) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  }
  
  function getShiftWorkOrderTreeNodeId(type = "", id = "", parentId = "") {
    return ["shiftWorkOrder", type, parentId, id]
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join("::");
  }
  
  function getShiftWorkOrderCollapsedTreeSet() {
    return new Set(normalizeShiftWorkOrderCollapsedTreeIds(ui.shiftWorkOrderCollapsedTreeIds));
  }
  
  function toggleShiftWorkOrderTreeNode(nodeId = "") {
    const safeNodeId = String(nodeId || "").trim();
    if (!safeNodeId) return;
    const collapsedTreeIds = getShiftWorkOrderCollapsedTreeSet();
    if (collapsedTreeIds.has(safeNodeId)) {
      collapsedTreeIds.delete(safeNodeId);
    } else {
      collapsedTreeIds.add(safeNodeId);
    }
    ui.shiftWorkOrderCollapsedTreeIds = [...collapsedTreeIds];
    persistUiState();
    renderPreservingModuleScroll();
  }
  
  function renderShiftWorkOrdersTable(model) {
    if (!model.rows.length) {
      return renderUiPanel({
        title: "Реестр пуст",
        meta: "нет сменных строк",
        className: "shift-work-orders-panel",
        body: renderUiPanelBody({
          body: renderUiEmptyState({
            iconName: "document",
            title: "Сменные задания еще не распределены",
            text: "Журнал заполнится после распределения сменной задачи в Мастерской, выдачи СЗН, факта или report.",
          }),
        }),
      });
    }
    const documentTree = model.documentTree || buildShiftWorkOrderDocumentTree(model.rows);
    const operationCount = documentTree.reduce((sum, group) => sum + (group.operationGroups || []).length, 0);
    const collapsedTreeIds = getShiftWorkOrderCollapsedTreeSet();
    return renderUiPanel({
      title: "Дерево документов",
      meta: `${documentTree.length.toLocaleString("ru-RU")} заказ-нарядов · ${operationCount.toLocaleString("ru-RU")} операций · ${model.rows.length.toLocaleString("ru-RU")} заданий · окно ${model.sourceWindow.label}`,
      className: "shift-work-orders-panel shift-work-orders-table-panel",
      body: renderUiPanelBody({
        body: renderUiTableWrap({
          className: "shift-work-orders-table-wrap ui-document-tree-table-wrap",
          body: `
            <table class="directory-table shift-work-orders-table ui-table ui-document-tree-table">
              <thead>
                <tr class="ui-table-header">
                  <th>Документы</th>
                  <th>Состав</th>
                  <th>План</th>
                  <th>Распр.</th>
                  <th>Факт</th>
                  <th>Ост.</th>
                  <th>Статус</th>
                  <th>Обновлено</th>
                </tr>
              </thead>
              <tbody>
                ${documentTree.map((group, groupIndex) => {
                  const operationGroups = group.operationGroups || [];
                  const groupIsLast = groupIndex === documentTree.length - 1;
                  const groupNodeId = getShiftWorkOrderTreeNodeId("package", group.id);
                  const groupCollapsed = collapsedTreeIds.has(groupNodeId);
                  return `
                  <tr
                    class="ui-table-row shift-work-orders-tree-parent ${groupCollapsed ? "is-collapsed" : "is-expanded"}"
                    data-shift-work-order-package-row="${escapeAttribute(group.id)}"
                    data-shift-work-order-tree-toggle="${escapeAttribute(groupNodeId)}"
                    aria-expanded="${groupCollapsed ? "false" : "true"}"
                    title="${escapeAttribute(groupCollapsed ? "Раскрыть заказ-наряд" : "Свернуть заказ-наряд")}"
                    style="--speki-level: 0;"
                    tabindex="0"
                  >
                    <td>${renderRouteTreeCell({
                      level: 0,
                      hasChildren: operationGroups.length > 0,
                      isLast: groupIsLast,
                      continuationLevels: [],
                      content: `
                        <div class="shift-work-orders-tree-copy">
                          <strong>${escapeHtml(group.label)}</strong>
                          <small>печатный пакет заказ-наряда</small>
                        </div>
                      `,
                      className: "is-shift-work-order-parent",
                    })}</td>
                    <td><strong>${(group.operationGroups || []).length.toLocaleString("ru-RU")} операций</strong><small>${group.rows.length.toLocaleString("ru-RU")} заданий · ${escapeHtml(group.meta || "маршрут")}</small></td>
                    <td>${group.plannedQuantity.toLocaleString("ru-RU")} ${escapeHtml(group.unit)}</td>
                    <td>${group.assignedQuantity.toLocaleString("ru-RU")}</td>
  	                  <td>${group.factQuantity.toLocaleString("ru-RU")}</td>
  	                  <td>${group.remainingQuantity.toLocaleString("ru-RU")}</td>
  	                  <td><span class="shift-work-orders-group-status" style="color: var(--mes-ui-quiet-text); font-weight: var(--mes-ui-weight-quiet);">заказ-наряд</span></td>
  	                  <td>${escapeHtml(group.latestLabel)}</td>
  	                </tr>
                  ${groupCollapsed ? "" : operationGroups.map((operationGroup, operationIndex) => {
                    const operationStatus = getShiftWorkOrderOperationTreeStatus(operationGroup);
                    const operationIsLast = operationIndex === operationGroups.length - 1;
                    const operationNodeId = getShiftWorkOrderTreeNodeId("operation", operationGroup.id, group.id);
                    const operationCollapsed = collapsedTreeIds.has(operationNodeId);
                    return `
                    <tr
                      class="ui-table-row shift-work-orders-tree-operation ${operationCollapsed ? "is-collapsed" : "is-expanded"}"
                      data-shift-work-order-operation-row="${escapeAttribute(operationGroup.id)}"
                      data-shift-work-order-tree-toggle="${escapeAttribute(operationNodeId)}"
                      aria-expanded="${operationCollapsed ? "false" : "true"}"
                      title="${escapeAttribute(operationCollapsed ? "Раскрыть операцию" : "Свернуть операцию")}"
                      style="--speki-level: 1;"
                      tabindex="0"
                    >
                      <td>${renderRouteTreeCell({
                        level: 1,
                        hasChildren: operationGroup.rows.length > 0,
                        isLast: operationIsLast,
                        continuationLevels: [!groupIsLast],
                        content: `
                          <div class="shift-work-orders-tree-copy">
                            <strong>${escapeHtml(operationGroup.operationName)}</strong>
                            <small>операция · ${operationGroup.rows.length.toLocaleString("ru-RU")} заданий</small>
                          </div>
                        `,
                        className: "is-shift-work-order-operation",
                      })}</td>
                      <td><strong>${escapeHtml(operationGroup.workCenterLabel)}</strong><small>${escapeHtml(operationGroup.routePartLabel || "маршрут")}</small></td>
                      <td>${operationGroup.plannedQuantity.toLocaleString("ru-RU")} ${escapeHtml(operationGroup.unit)}</td>
                      <td>${operationGroup.assignedQuantity.toLocaleString("ru-RU")}</td>
  	                    <td>${operationGroup.factQuantity.toLocaleString("ru-RU")}</td>
  	                    <td>${operationGroup.remainingQuantity.toLocaleString("ru-RU")}</td>
  	                    <td><span class="shift-work-orders-group-status" style="color: var(--mes-ui-quiet-text); font-weight: var(--mes-ui-weight-quiet);">${escapeHtml(operationStatus.label)}</span></td>
  	                    <td>${escapeHtml(operationGroup.latestLabel)}</td>
  	                  </tr>
  	                  ${operationCollapsed ? "" : operationGroup.rows.map((row, rowIndex) => {
                      const childTreeClasses = [
                        "ui-table-row",
                        "shift-work-orders-tree-child",
                        rowIndex === 0 ? "is-first-in-operation" : "",
                        rowIndex === operationGroup.rows.length - 1 ? "is-last-in-operation" : "",
                        row.id === model.selectedRow?.id ? "is-active" : "",
                      ].filter(Boolean).join(" ");
                      const childIsLast = rowIndex === operationGroup.rows.length - 1;
                      return `
                      <tr class="${childTreeClasses}" data-shift-work-order-row="${escapeAttribute(row.id)}" style="--speki-level: 2;" tabindex="0">
                        <td>${renderRouteTreeCell({
                          level: 2,
                          hasChildren: false,
                          isLast: childIsLast,
                          continuationLevels: [!groupIsLast, !operationIsLast],
                          content: `
                            <div class="shift-work-orders-tree-copy">
                              <strong>${escapeHtml(row.documentNumber)}</strong>
                              <small>${escapeHtml(row.stageLabel || "сменное задание")}</small>
                            </div>
                          `,
                          className: "is-shift-work-order-child",
                        })}</td>
                        <td><strong>${escapeHtml(formatShiftWorkOrderExecutorList(row.executors) || formatShiftWorkOrderPersonName(row.masterName || "") || row.workCenterLabel)}</strong><small>${escapeHtml(row.shiftDateKey || row.dateLabel)}</small></td>
                        <td>${row.plannedQuantity.toLocaleString("ru-RU")} ${escapeHtml(row.unit)}</td>
                        <td>${row.assignedQuantity.toLocaleString("ru-RU")}</td>
  	                      <td>${row.factQuantity.toLocaleString("ru-RU")}</td>
  	                      <td>${row.remainingQuantity.toLocaleString("ru-RU")}</td>
  	                      <td>${renderUiStatusToken(row.status.label, row.status.tone)}</td>
  	                      <td>${escapeHtml(row.dateLabel)}</td>
  	                    </tr>
                    `;
                    }).join("")}
                  `;
                  }).join("")}
                `;
                }).join("")}
              </tbody>
            </table>
          `,
        }),
      }),
    });
  }
  
  function renderShiftWorkOrdersDetail(row) {
    if (!row) {
      return renderUiPanel({
        title: "Документ не выбран",
        meta: "",
        className: "shift-work-orders-panel shift-work-orders-detail-panel",
        body: renderUiPanelBody({
          body: renderUiEmptyState({ iconName: "document", title: "Выберите сменное задание", text: "Карточка покажет маршрут передачи, исполнителей и факт." }),
        }),
      });
    }
    const executorRows = row.executors.length ? row.executors : [];
    const packageRouteId = row.routeId || row.planningOrderId || "";
    const issueSummary = row.issueSummary || getShiftWorkOrderIssueSummary(row);
    return renderUiPanel({
      title: row.documentNumber,
      meta: "",
      className: "shift-work-orders-panel shift-work-orders-detail-panel",
      actions: `
        ${renderUiActionButton({
          label: "Печать СЗН",
          iconName: "document",
          attributes: `data-shift-work-order-print-preview="${escapeAttribute(row.id)}" type="button"`,
        })}
        ${renderUiActionButton({
          label: "Пакет ЗН",
          iconName: "package",
          attributes: `data-work-order-print-preview="${escapeAttribute(packageRouteId)}" type="button" ${packageRouteId ? "" : "disabled"}`,
        })}
        ${renderUiActionButton({
          label: "Мастерская",
          iconName: "worker",
          attributes: `data-shift-work-order-open-master="${escapeAttribute(row.sourceRowId)}" type="button"`,
        })}
      `,
      body: renderUiPanelBody({
        body: `
          ${renderShiftWorkOrderIssueReports(row)}
          <section class="shift-work-orders-detail-summary" data-visual-qa-target="shift-work-orders-detail-summary">
            <article data-visual-qa-target="shift-work-orders-detail-order"><span>Заказ-наряд</span><strong>${escapeHtml(row.orderLabel)}</strong><small>${escapeHtml(row.routePartLabel)}</small></article>
            <article data-visual-qa-target="shift-work-orders-detail-operation"><span>Операция</span><strong>${escapeHtml(row.operationName)}</strong><small>${escapeHtml(row.workCenterLabel)}</small></article>
            <article data-visual-qa-target="shift-work-orders-detail-master"><span>Мастер</span><strong>${escapeHtml(formatShiftWorkOrderPersonName(row.masterName))}</strong><small>${escapeHtml(row.resourceLabel || row.workCenterLabel)}</small></article>
          </section>
          ${renderShiftWorkOrdersDetailVolume(row, issueSummary)}
          ${renderShiftWorkOrdersDetailTransfer(row)}
          <section class="shift-work-orders-executors" data-visual-qa-target="shift-work-orders-executors">
            <header><strong>Исполнители</strong><span>${executorRows.length.toLocaleString("ru-RU")} назначений</span></header>
            ${executorRows.length ? executorRows.map((executor) => `
              <article>
                <strong>${escapeHtml(formatShiftWorkOrderPersonName(executor.employeeName || getShiftMasterEmployee(executor.employeeId)?.name || "Исполнитель"))}</strong>
                <span>${normalizeShiftMasterBoardQuantity(executor.quantity || 0).toLocaleString("ru-RU")} ${escapeHtml(row.unit)}</span>
              </article>
            `).join("") : `<p>Исполнители еще не назначены.</p>`}
          </section>
        `,
      }),
    });
  }
  
  function bindShiftWorkOrdersEvents() {
    bindGenericModalCloseEvents();
    app.querySelectorAll("[data-shift-work-order-print-preview]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const rowId = button.getAttribute("data-shift-work-order-print-preview") || "";
        if (!rowId) return;
        ui.shiftWorkOrderPrintPreviewId = rowId;
        ui.shiftWorkOrderJournalSelectedId = rowId;
        persistUiState();
        renderPreservingModuleScroll();
      });
    });
  
    app.querySelector("[data-shift-work-order-print-run]")?.addEventListener("click", () => {
      const previousTitle = document.title;
      const row = getShiftWorkOrderJournalViewModel().rows.find((item) => item.id === ui.shiftWorkOrderPrintPreviewId);
      const restoreTitle = () => {
        document.title = previousTitle;
        window.removeEventListener("afterprint", restoreTitle);
      };
      document.title = row?.documentNumber || "";
      window.addEventListener("afterprint", restoreTitle, { once: true });
      window.requestAnimationFrame(() => window.print());
    });
  
    app.querySelectorAll("[data-work-order-print-preview]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const routeId = button.getAttribute("data-work-order-print-preview") || "";
        if (!routeId) return;
        ui.workOrderPrintPreviewId = routeId;
        persistUiState();
        renderPreservingModuleScroll();
      });
    });
  
    app.querySelector("[data-work-order-print-run]")?.addEventListener("click", () => {
      const previousTitle = document.title;
      const model = getWorkOrderPrintPackageViewModel(ui.workOrderPrintPreviewId);
      const restoreTitle = () => {
        document.title = previousTitle;
        window.removeEventListener("afterprint", restoreTitle);
      };
      document.title = model?.workOrderView?.objectLabel || model?.workOrderView?.title || "";
      window.addEventListener("afterprint", restoreTitle, { once: true });
      window.requestAnimationFrame(() => window.print());
    });
  
    app.querySelectorAll("[data-shift-work-order-tree-toggle]").forEach((row) => {
      const toggle = (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleShiftWorkOrderTreeNode(row.getAttribute("data-shift-work-order-tree-toggle") || "");
      };
      row.addEventListener("click", toggle);
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        toggle(event);
      });
    });
  
    app.querySelectorAll("[data-shift-work-order-row]").forEach((row) => {
      const select = () => {
        const nextId = row.getAttribute("data-shift-work-order-row") || "";
        if (!nextId || ui.shiftWorkOrderJournalSelectedId === nextId) return;
        ui.shiftWorkOrderJournalSelectedId = nextId;
        persistUiState();
        renderPreservingModuleScroll();
      };
      row.addEventListener("click", select);
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        select();
      });
    });
    app.querySelectorAll("[data-shift-work-order-report-photo]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const rowId = button.getAttribute("data-shift-work-order-report-photo-row") || "";
        const photoId = button.getAttribute("data-shift-work-order-report-photo") || "";
        if (!rowId || !photoId) return;
        ui.shiftWorkOrderIssuePhotoViewer = { rowId, photoId };
        renderPreservingModuleScroll();
      });
    });
    app.querySelectorAll("[data-shift-work-order-report-photo-nav]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const viewer = normalizePlainRecord(ui.shiftWorkOrderIssuePhotoViewer);
        const rowId = String(viewer.rowId || "").trim();
        const photos = getShiftWorkOrderReportPhotoItems(rowId);
        if (!rowId || photos.length < 2) return;
        const currentPhotoId = String(viewer.photoId || "").trim();
        const currentIndex = Math.max(0, photos.findIndex((item) => item.photoId === currentPhotoId || item.reportId === currentPhotoId));
        const delta = Number(button.getAttribute("data-shift-work-order-report-photo-nav") || 0) || 0;
        const nextIndex = (currentIndex + delta + photos.length) % photos.length;
        ui.shiftWorkOrderIssuePhotoViewer = { rowId, photoId: photos[nextIndex].photoId };
        renderPreservingModuleScroll();
      });
    });
    app.querySelectorAll("[data-shift-work-order-open-master]").forEach((button) => {
      button.addEventListener("click", () => {
        const sourceRowId = button.getAttribute("data-shift-work-order-open-master") || "";
        if (sourceRowId) ui.shiftMasterBoardSelectedSlotId = sourceRowId;
        ui.activeModule = "shiftMasterBoard";
        persistUiState();
        render();
      });
    });
  }

  return {
    bindShiftWorkOrdersEvents,
    formatShiftWorkOrderPersonName,
    getShiftWorkOrderJournalViewModel,
    renderShiftWorkOrderIssuePhotoModal,
    renderShiftWorkOrderPrintPreviewModal,
    renderShiftWorkOrdersPage,
  };
}
