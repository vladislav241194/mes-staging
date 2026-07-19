export function createWeeklyProductionControlModule(dependencies = {}) {
  const {
    DAY_MS,
    addMs,
    escapeAttribute,
    escapeHtml,
    formatDate,
    formatDateTimeShort,
    formatShiftWorkOrderPersonName,
    formatShortDate,
    getAuthSessionFactEntriesForGanttSlot,
    getGanttLinkedRecordEntries,
    getPlanningTableSlotRows,
    getProductionStructureMatrixRuntimeOverrides,
    getProductionStructureResources,
    getProductionStructureWorkCenters,
    getShiftMasterAssignmentsForGanttSlot,
    getShiftMasterBoardFactEntriesForGanttSlot,
    getShiftWorkOrderIssueReports,
    getWeekNumber,
    isGanttFactRecordReported,
    mapLegacyWorkCenterId,
    normalizeLookupText,
    normalizePlainRecord,
    normalizeShiftMasterBoardQuantity,
    normalizeShiftMasterFactQuantity,
    renderPlanningTableInlineEmpty,
    renderMesModulePatternPage,
    renderUiEmptyState,
    renderUiMetricGrid,
    renderUiPanel,
    renderUiPanelBody,
    renderUiStatusToken,
    renderUiTableWrap,
    startOfDay,
    startOfWeek,
    toDate,
    toDateInput,
  } = dependencies;
  const getApp = dependencies.getApp || (() => null);
  const getPlanningState = dependencies.getPlanningState || (() => ({}));
  const getUi = dependencies.getUi || (() => ({}));

  function getWeeklyProductionControlWeekStart() {
    return startOfWeek(new Date());
  }
  
  function getWeeklyProductionControlDays(weekStart = getWeeklyProductionControlWeekStart()) {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addMs(weekStart, index * DAY_MS);
      return {
        id: toDateInput(date),
        date,
        end: addMs(date, DAY_MS),
        label: formatShortDate(date),
        weekday: date.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", ""),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
      };
    });
  }
  
  function getWeeklyProductionControlPlanShare(row = {}, day = {}) {
    const slotStart = toDate(row.plannedStart);
    const slotEnd = toDate(row.plannedEnd);
    if (!Number.isFinite(slotStart.getTime()) || !Number.isFinite(slotEnd.getTime()) || !day?.date || !day?.end) return 0;
    if (slotEnd <= slotStart) return toDateInput(slotStart) === day.id ? normalizeShiftMasterBoardQuantity(row.quantity || 0) : 0;
    const overlapStart = Math.max(slotStart.getTime(), day.date.getTime());
    const overlapEnd = Math.min(slotEnd.getTime(), day.end.getTime());
    if (overlapEnd <= overlapStart) return 0;
    return normalizeShiftMasterBoardQuantity(row.quantity || 0) * ((overlapEnd - overlapStart) / Math.max(1, slotEnd.getTime() - slotStart.getTime()));
  }
  
  function getWeeklyProductionControlFactRecordsForSlot(slot = {}) {
    if (!slot?.id) return [];
    const masterEntries = getGanttLinkedRecordEntries(getPlanningState().shiftMasterAssignments || {}, slot.id);
    const boardEntries = getShiftMasterBoardFactEntriesForGanttSlot(slot.id);
    const boardKeys = new Set(boardEntries.map(([key]) => key));
    const hasBoardEntries = boardEntries.length > 0;
    const authSessionEntries = hasBoardEntries ? [] : getAuthSessionFactEntriesForGanttSlot(slot.id);
    return [
      ...masterEntries
        .filter(([key]) => !boardKeys.has(key) && !(hasBoardEntries && key === slot.id))
        .map(([, record]) => record),
      ...boardEntries.map(([, record]) => record),
      ...authSessionEntries.map(([, record]) => record),
    ].filter(isGanttFactRecordReported);
  }
  
  function getWeeklyProductionControlFactDateKey(record = {}, row = {}) {
    const value = record.updatedAt || record.factUpdatedAt || row.plannedEnd || row.plannedStart || getUi().weeklyProductionControlWeekAnchor;
    return toDateInput(startOfDay(toDate(value)));
  }
  
  function getWeeklyProductionControlReportKey(report = {}) {
    return String(report.id || `${report.rowId || ""}:${report.taskId || ""}:${report.createdAt || ""}:${report.text || ""}`).trim();
  }
  
  function getWeeklyProductionControlReportsForRow(row = {}) {
    const targets = [{
      id: row.id,
      rowId: row.id,
      sourceRowId: row.id,
      slotId: row.id,
      sheetContract: {
        rowId: row.id,
        sourceRowId: row.id,
        sourceSlotId: row.id,
      },
    }];
    getShiftMasterAssignmentsForGanttSlot(row.id).forEach((assignment) => {
      const sheetContract = normalizePlainRecord(assignment.sheetContract);
      const transferContract = normalizePlainRecord(assignment.transferContract || sheetContract.transferContract);
      const sourceRowId = String(assignment.sourceRowId || sheetContract.rowId || transferContract.sourceRowId || assignment.slotId || row.id || "").trim();
      targets.push({
        id: sourceRowId || row.id,
        rowId: sourceRowId || row.id,
        sourceRowId: sourceRowId || row.id,
        slotId: assignment.slotId || sheetContract.sourceSlotId || transferContract.sourceSlotId || row.id,
        sheetContract,
        transfer: transferContract,
      });
    });
    const seen = new Set();
    return targets.flatMap((target) => getShiftWorkOrderIssueReports(target))
      .filter((report) => {
        const key = getWeeklyProductionControlReportKey(report);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }
  
  function getWeeklyProductionControlReportDayKey(report = {}, row = {}) {
    const value = report.createdAt || row.plannedEnd || row.plannedStart || getUi().weeklyProductionControlWeekAnchor;
    return toDateInput(startOfDay(toDate(value)));
  }
  
  function getWeeklyProductionControlFactDeviationNotes(record = {}) {
    const notes = Array.isArray(record.deviationNotes) ? record.deviationNotes : [];
    const normalizedNotes = notes
      .map((note) => {
        const normalized = normalizePlainRecord(note);
        const text = String(normalized.text || normalized.comment || "").trim();
        if (!text) return null;
        return {
          employeeName: String(normalized.employeeName || "Исполнитель").trim(),
          text,
          createdAt: String(normalized.createdAt || record.updatedAt || record.factUpdatedAt || "").trim(),
          deviationPercent: Number(normalized.deviationPercent || 0) || 0,
        };
      })
      .filter(Boolean);
    const singleComment = String(record.deviationComment || record.deviationReason || "").trim();
    if (singleComment && !normalizedNotes.some((note) => note.text === singleComment)) {
      normalizedNotes.push({
        employeeName: "Рабочее место",
        text: singleComment,
        createdAt: String(record.updatedAt || record.factUpdatedAt || "").trim(),
        deviationPercent: 0,
      });
    }
    return normalizedNotes;
  }
  
  function getWeeklyProductionControlDeviationPercent(factQuantity = 0, planQuantity = 0) {
    const plan = Number(planQuantity || 0);
    const fact = Number(factQuantity || 0);
    if (plan <= 0) return fact > 0 ? 100 : 0;
    return ((fact - plan) / plan) * 100;
  }
  
  function getWeeklyProductionControlDayTone(day = {}) {
    if (day.isDeviation) return day.factQuantity < day.planQuantity ? "risk" : "warning";
    if (day.planQuantity <= 0 && day.factQuantity <= 0) return "neutral";
    if (day.factQuantity >= day.planQuantity && day.planQuantity > 0) return "ok";
    if (day.factQuantity > 0) return "active";
    return "neutral";
  }
  
  function formatWeeklyProductionControlQuantity(value = 0, unit = "шт.") {
    return `${Math.round(Number(value || 0)).toLocaleString("ru-RU")} ${unit || "шт."}`;
  }
  
  function formatWeeklyProductionControlPercent(value = 0) {
    const rounded = Math.round(Number(value || 0));
    return `${rounded > 0 ? "+" : ""}${rounded}%`;
  }
  
  function getWeeklyProductionControlBaseRows() {
    const overrides = getProductionStructureMatrixRuntimeOverrides();
    const workCenters = getProductionStructureWorkCenters(overrides)
      .filter((center) => center?.isActive !== false && center?.showInGantt !== false);
    const workCentersById = new Map(workCenters.map((center) => [mapLegacyWorkCenterId(center.id), center]));
    const resources = getProductionStructureResources(overrides)
      .filter((resource) => normalizeLookupText(resource?.participatesInPlanning || "yes") !== "no");
    const seen = new Set();
    const baseRows = [];
  
    const addBaseRow = (row = {}) => {
      const key = [
        row.workCenterId || row.workCenterLabel || "work-center",
        row.resourceLabel || row.workCenterLabel || "resource",
      ].join("::");
      if (seen.has(key)) return;
      seen.add(key);
      baseRows.push({
        ...row,
        isWeeklyControlStructureRow: true,
        unit: row.unit || "шт.",
      });
    };
  
    resources.forEach((resource, index) => {
      const workCenterId = mapLegacyWorkCenterId(resource.workCenterId || resource.id || "");
      const workCenter = workCentersById.get(workCenterId) || null;
      addBaseRow({
        id: `weekly-control-resource-${resource.id || index}`,
        workCenterId,
        parentWorkCenterId: workCenter?.parentWorkCenterId || "",
        workCenterLabel: workCenter?.name || resource.workCenter || resource.name || "Участок не задан",
        resourceLabel: resource.name || workCenter?.name || "Ресурс не задан",
        sourceKind: resource.sourceKind || "structureResource",
        sortIndex: index,
      });
    });
  
    workCenters.forEach((center, index) => {
      addBaseRow({
        id: `weekly-control-work-center-${center.id || index}`,
        workCenterId: mapLegacyWorkCenterId(center.id || ""),
        parentWorkCenterId: center.parentWorkCenterId || "",
        workCenterLabel: center.name || "Участок не задан",
        resourceLabel: center.name || "Ресурс не задан",
        sourceKind: "structureWorkCenter",
        sortIndex: resources.length + index,
      });
    });
  
    return baseRows;
  }
  
  function getWeeklyProductionControlModel() {
    const weekStart = getWeeklyProductionControlWeekStart();
    const weekEnd = addMs(weekStart, 7 * DAY_MS);
    const allRows = getPlanningTableSlotRows({ weekStart, weekEnd });
    const rows = allRows.filter((row) => row.plannedStart < weekEnd && row.plannedEnd > weekStart);
    const days = getWeeklyProductionControlDays(weekStart);
    const dayIndexById = new Map(days.map((day, index) => [day.id, index]));
    const groupsByKey = new Map();
  
    const getGroup = (row) => {
      const groupKey = [
        row.workCenterId || row.workCenterLabel || "work-center",
        row.resourceLabel || row.workCenterLabel || "resource",
      ].join("::");
      if (!groupsByKey.has(groupKey)) {
        groupsByKey.set(groupKey, {
          id: groupKey,
          workCenterLabel: row.workCenterLabel || "Участок не задан",
          resourceLabel: row.resourceLabel || "Оборудование не задано",
          unit: row.unit || "шт.",
          rows: [],
          reports: [],
          reportKeys: new Set(),
          isStructureRow: Boolean(row.isWeeklyControlStructureRow),
          sourceKind: row.sourceKind || "",
          sortIndex: Number.isFinite(row.sortIndex) ? row.sortIndex : Number.MAX_SAFE_INTEGER,
          days: days.map((day) => ({
            ...day,
            planQuantity: 0,
            factQuantity: 0,
            defectQuantity: 0,
            rows: [],
            reports: [],
            deviationNotes: [],
            reportKeys: new Set(),
            deviationPercent: 0,
            isDeviation: false,
            tone: "neutral",
          })),
        });
      }
      const group = groupsByKey.get(groupKey);
      if (row.isWeeklyControlStructureRow) group.isStructureRow = true;
      if (row.sourceKind && !group.sourceKind) group.sourceKind = row.sourceKind;
      if (Number.isFinite(row.sortIndex)) group.sortIndex = Math.min(group.sortIndex, row.sortIndex);
      return group;
    };
  
    getWeeklyProductionControlBaseRows().forEach((row) => {
      getGroup(row);
    });
  
    rows.forEach((row) => {
      const group = getGroup(row);
      group.rows.push(row);
  
      days.forEach((day, index) => {
        const planShare = getWeeklyProductionControlPlanShare(row, day);
        if (planShare <= 0) return;
        group.days[index].planQuantity += planShare;
        group.days[index].rows.push(row);
      });
  
      getWeeklyProductionControlFactRecordsForSlot(row.slot).forEach((record) => {
        const dayIndex = dayIndexById.get(getWeeklyProductionControlFactDateKey(record, row));
        if (typeof dayIndex !== "number") return;
        group.days[dayIndex].factQuantity += normalizeShiftMasterFactQuantity(record.actualQuantity || 0);
        group.days[dayIndex].defectQuantity += normalizeShiftMasterFactQuantity(record.defectQuantity || 0);
        group.days[dayIndex].deviationNotes.push(...getWeeklyProductionControlFactDeviationNotes(record));
      });
  
      getWeeklyProductionControlReportsForRow(row).forEach((report) => {
        const reportKey = getWeeklyProductionControlReportKey(report);
        if (!reportKey || group.reportKeys.has(reportKey)) return;
        group.reportKeys.add(reportKey);
        group.reports.push(report);
        const dayIndex = dayIndexById.get(getWeeklyProductionControlReportDayKey(report, row));
        if (typeof dayIndex === "number" && !group.days[dayIndex].reportKeys.has(reportKey)) {
          group.days[dayIndex].reportKeys.add(reportKey);
          group.days[dayIndex].reports.push(report);
        }
      });
    });
  
    const groups = [...groupsByKey.values()].map((group) => {
      group.totalPlan = group.days.reduce((sum, day) => sum + day.planQuantity, 0);
      group.totalFact = group.days.reduce((sum, day) => sum + day.factQuantity, 0);
      group.totalDefect = group.days.reduce((sum, day) => sum + day.defectQuantity, 0);
      group.days = group.days.map((day) => {
        const deviationPercent = getWeeklyProductionControlDeviationPercent(day.factQuantity, day.planQuantity);
        const isDeviation = (day.planQuantity > 0 || day.factQuantity > 0) && Math.abs(deviationPercent) > 5;
        return {
          ...day,
          deviationPercent,
          isDeviation,
          tone: getWeeklyProductionControlDayTone({ ...day, deviationPercent, isDeviation }),
        };
      });
      group.deviationPercent = getWeeklyProductionControlDeviationPercent(group.totalFact, group.totalPlan);
      group.deviationCount = group.days.filter((day) => day.isDeviation).length;
      group.statusTone = group.deviationCount ? "risk" : group.totalFact >= group.totalPlan && group.totalPlan > 0 ? "ok" : "neutral";
      delete group.reportKeys;
      group.days.forEach((day) => {
        delete day.reportKeys;
      });
      return group;
    }).sort((left, right) => (
      right.deviationCount - left.deviationCount
      || right.totalPlan - left.totalPlan
      || left.sortIndex - right.sortIndex
      || left.workCenterLabel.localeCompare(right.workCenterLabel, "ru")
      || left.resourceLabel.localeCompare(right.resourceLabel, "ru")
    ));
  
    const totals = groups.reduce((acc, group) => {
      acc.plan += group.totalPlan;
      acc.fact += group.totalFact;
      acc.defect += group.totalDefect;
      acc.deviationCount += group.deviationCount;
      acc.reportCount += group.reports.length;
      return acc;
    }, { plan: 0, fact: 0, defect: 0, deviationCount: 0, reportCount: 0 });
    totals.deviationPercent = getWeeklyProductionControlDeviationPercent(totals.fact, totals.plan);
  
    const deviationRows = groups.flatMap((group) => group.days
      .filter((day) => day.isDeviation)
      .map((day) => ({
        group,
        day,
        reports: day.reports.length ? day.reports : group.reports,
      })));
    const groupsWithInteraction = groups.map((group) => ({
      ...group,
      days: group.days.map((day) => {
        const noteCount = Array.isArray(day.deviationNotes) ? day.deviationNotes.length : 0;
        const reportCount = Array.isArray(day.reports) ? day.reports.length : 0;
        return {
          ...day,
          note: day.isDeviation || noteCount || reportCount
            ? getWeeklyProductionControlDayNoteData(day, group.unit)
            : null,
        };
      }),
    }));
  
    return {
      rows,
      groups: groupsWithInteraction,
      days,
      weekStart,
      weekEnd,
      weekLabel: `${formatDate(weekStart)}-${formatDate(addMs(weekEnd, -DAY_MS))}`,
      totals,
      deviationRows,
    };
  }
  
  function renderWeeklyProductionControlPage() {
    const model = getWeeklyProductionControlModel();
    const actions = `
      ${renderUiStatusToken(`Текущая неделя ${getWeekNumber(model.weekStart)}`, "primary")}
    `;
    return renderMesModulePatternPage({
      moduleId: "weeklyProductionControl",
      header: {
        eyebrow: "Планирование нагрузки",
        title: "Контроль недели",
        description: "Read-only срез для начальника производства: план из заказ-нарядов, факт из рабочего места, report при отклонении больше 5%.",
        actions,
        className: "directory-header weekly-production-control-header",
      },
      content: model.groups.length ? `
        ${renderWeeklyProductionControlMatrix(model)}
        ${renderWeeklyProductionControlSummary(model)}
      ` : renderUiPanel({
        title: "Нет данных недели",
        meta: model.weekLabel,
        className: "weekly-production-control-panel",
        body: renderUiPanelBody({
          body: renderUiEmptyState({
            iconName: "chart",
            title: "В выбранной неделе нет плановых операций",
            text: "Проверь дату недели или передай заказ-наряды в планирование.",
          }),
        }),
      }),
    });
  }
  
  function renderWeeklyProductionControlSummary(model) {
    const summaryItems = [
      ["Неделя", model.weekLabel, `${model.groups.length.toLocaleString("ru-RU")} участков / ресурсов`],
      ["План", formatWeeklyProductionControlQuantity(model.totals.plan), `${model.rows.length.toLocaleString("ru-RU")} операций`],
      ["Факт", formatWeeklyProductionControlQuantity(model.totals.fact), `${formatWeeklyProductionControlPercent(model.totals.deviationPercent)} к плану`],
      ["Отклонения >5%", model.totals.deviationCount.toLocaleString("ru-RU"), `${model.totals.reportCount.toLocaleString("ru-RU")} report из рабочего места`],
    ];
    return renderUiPanel({
      title: "Сводка недельного контроля",
      meta: "информативно · без записи в систему",
      className: "weekly-production-control-panel weekly-production-control-summary-panel",
      body: renderUiPanelBody({
        body: renderUiMetricGrid({
          className: "weekly-production-control-summary-grid",
          itemClassName: "weekly-production-control-summary-card",
          items: summaryItems.map(([label, value, meta]) => ({ label, value, meta })),
        }),
      }),
    });
  }
  
  function getWeeklyProductionControlDayNoteData(day, unit = "шт.") {
    const deviationNote = day.deviationNotes[0] || null;
    const report = day.reports[0] || null;
    const noteTitle = deviationNote
      ? [
        formatShiftWorkOrderPersonName(deviationNote.employeeName || "Исполнитель"),
        deviationNote.createdAt ? formatDateTimeShort(deviationNote.createdAt) : "",
      ].filter(Boolean).join(" · ")
      : "Заметка отклонения не заполнена";
    const noteText = deviationNote?.text || "При закрытии смены исполнитель должен указать причину, если факт ниже плана больше чем на 5%.";
    const reportText = report?.text || "";
    const extraReports = day.reports.length > 1 ? `Еще report: ${day.reports.length - 1}` : "";
    const extraNotes = day.deviationNotes.length > 1 ? `Еще заметок: ${day.deviationNotes.length - 1}` : "";
    return {
      title: `Отклонение ${formatWeeklyProductionControlPercent(day.deviationPercent)}`,
      plan: `План: ${formatWeeklyProductionControlQuantity(day.planQuantity, unit)}`,
      fact: `Факт: ${formatWeeklyProductionControlQuantity(day.factQuantity, unit)}`,
      author: noteTitle,
      text: noteText,
      extraNotes,
      reportText,
      extraReports,
    };
  }
  
  function getWeeklyProductionControlDayMarkers(day = {}) {
    const noteCount = Array.isArray(day.deviationNotes) ? day.deviationNotes.length : 0;
    const reportCount = Array.isArray(day.reports) ? day.reports.length : 0;
    if (!noteCount && !reportCount) return "";
    const markers = [];
    if (noteCount) {
      const label = `${noteCount.toLocaleString("ru-RU")} заметок отклонения из рабочего стола`;
      markers.push(`<span class="weekly-production-control-day-marker is-note" title="${escapeAttribute(label)}" aria-label="${escapeAttribute(label)}"></span>`);
    }
    if (reportCount) {
      const photoCount = day.reports.reduce((sum, report) => sum + (normalizePlainRecord(report.photo).dataUrl ? 1 : 0), 0);
      const label = `${reportCount.toLocaleString("ru-RU")} report${photoCount ? ` · ${photoCount.toLocaleString("ru-RU")} фото` : ""}`;
      markers.push(`<span class="weekly-production-control-day-marker is-report" title="${escapeAttribute(label)}" aria-label="${escapeAttribute(label)}"></span>`);
    }
    return `
      <span class="weekly-production-control-day-markers" data-visual-qa-target="weekly-production-control-day-markers">
        ${markers.join("")}
      </span>
    `;
  }
  
  function renderWeeklyProductionControlDayCell(day, unit = "шт.") {
    const noteCount = Array.isArray(day.deviationNotes) ? day.deviationNotes.length : 0;
    const reportCount = Array.isArray(day.reports) ? day.reports.length : 0;
    const hasCellNoteContext = day.isDeviation || noteCount || reportCount;
    const note = hasCellNoteContext ? getWeeklyProductionControlDayNoteData(day, unit) : null;
    const noteAttributes = note ? [
      'tabindex="0"',
      'data-weekly-production-note="yes"',
      `aria-label="${escapeAttribute(`${note.title}. ${note.plan}. ${note.fact}. ${note.text}`)}"`,
      `data-weekly-note-title="${escapeAttribute(note.title)}"`,
      `data-weekly-note-plan="${escapeAttribute(note.plan)}"`,
      `data-weekly-note-fact="${escapeAttribute(note.fact)}"`,
      `data-weekly-note-author="${escapeAttribute(note.author)}"`,
      `data-weekly-note-text="${escapeAttribute(note.text)}"`,
      `data-weekly-note-extra-notes="${escapeAttribute(note.extraNotes)}"`,
      `data-weekly-note-report="${escapeAttribute(note.reportText)}"`,
      `data-weekly-note-extra-reports="${escapeAttribute(note.extraReports)}"`,
    ].join(" ") : "";
    return `
      <td class="weekly-production-control-day-cell is-${escapeAttribute(day.tone)} ${day.isWeekend ? "is-weekend" : ""} ${day.isDeviation ? "has-deviation" : ""}" ${noteAttributes}>
        <span class="weekly-production-control-day-grid">
          <span class="weekly-production-control-day-metric is-plan">
            <small>План</small>
            <strong>${Math.round(day.planQuantity).toLocaleString("ru-RU")}</strong>
          </span>
          <span class="weekly-production-control-day-metric is-fact">
            <small>Факт</small>
            <strong>${Math.round(day.factQuantity).toLocaleString("ru-RU")}</strong>
          </span>
        </span>
        ${getWeeklyProductionControlDayMarkers(day)}
      </td>
    `;
  }
  
  function renderWeeklyProductionControlMatrix(model) {
    return renderUiPanel({
      title: "План / факт по дням",
      meta: `${model.days.length} дней · отклонение считается от плана дня`,
      className: "weekly-production-control-panel weekly-production-control-matrix-panel",
      body: renderUiPanelBody({
        body: renderUiTableWrap({
          className: "weekly-production-control-table-wrap",
          body: `
            <table class="directory-table ui-table weekly-production-control-table">
              <thead>
                <tr>
                  <th>Участок / оборудование</th>
                  ${model.days.map((day) => `<th><strong>${escapeHtml(day.weekday)}</strong><span>${escapeHtml(day.label)}</span></th>`).join("")}
                  <th>Итого</th>
                  <th>Откл.</th>
                  <th>Report</th>
                </tr>
              </thead>
              <tbody>
                ${model.groups.map((group) => {
                  const showResourceLabel = normalizeLookupText(group.resourceLabel) !== normalizeLookupText(group.workCenterLabel);
                  return `
                  <tr class="${group.deviationCount ? "has-deviation" : ""}">
                    <td class="weekly-production-control-resource-cell">
                      <strong>${escapeHtml(group.workCenterLabel)}</strong>
                      ${showResourceLabel ? `<small>${escapeHtml(group.resourceLabel || "Оборудование не задано")}</small>` : ""}
                    </td>
                    ${group.days.map((day) => renderWeeklyProductionControlDayCell(day, group.unit)).join("")}
                    <td><strong>${escapeHtml(formatWeeklyProductionControlQuantity(group.totalPlan, group.unit))}</strong><span>факт ${escapeHtml(formatWeeklyProductionControlQuantity(group.totalFact, group.unit))}</span></td>
                    <td>${renderUiStatusToken(formatWeeklyProductionControlPercent(group.deviationPercent), group.statusTone)}</td>
                    <td><strong>${group.reports.length.toLocaleString("ru-RU")} report</strong><span>${group.deviationCount ? `${group.deviationCount} откл.` : "без отклонений"}</span></td>
                  </tr>
                `;
                }).join("")}
              </tbody>
            </table>
          `,
        }),
      }),
    });
  }
  
  function renderWeeklyProductionControlDeviationPanel(model) {
    return renderUiPanel({
      title: "Отклонения и объяснения",
      meta: model.deviationRows.length ? `${model.deviationRows.length.toLocaleString("ru-RU")} дней с отклонением больше 5%` : "отклонений больше 5% нет",
      className: "weekly-production-control-panel weekly-production-control-deviation-panel",
      body: renderUiPanelBody({
        body: model.deviationRows.length ? renderUiTableWrap({
          className: "weekly-production-control-deviation-wrap",
          body: `
            <table class="directory-table ui-table weekly-production-control-deviation-table">
              <thead>
                <tr>
                  <th>День</th>
                  <th>Участок / оборудование</th>
                  <th>План</th>
                  <th>Факт</th>
                  <th>Откл.</th>
                  <th>Report рабочего места</th>
                </tr>
              </thead>
              <tbody>
                ${model.deviationRows.map(({ group, day, reports }) => {
                  const report = reports[0] || null;
                  return `
                    <tr>
                      <td><strong>${escapeHtml(day.weekday)}</strong><span>${escapeHtml(day.label)}</span></td>
                      <td><strong>${escapeHtml(group.workCenterLabel)}</strong><span>${escapeHtml(group.resourceLabel)}</span></td>
                      <td>${escapeHtml(formatWeeklyProductionControlQuantity(day.planQuantity, group.unit))}</td>
                      <td>${escapeHtml(formatWeeklyProductionControlQuantity(day.factQuantity, group.unit))}</td>
                      <td>${renderUiStatusToken(formatWeeklyProductionControlPercent(day.deviationPercent), day.tone)}</td>
                      <td class="weekly-production-control-report-cell">
                        ${report ? `
                          <strong>${escapeHtml(formatShiftWorkOrderPersonName(report.employeeName || "Исполнитель"))}${report.createdAt ? ` · ${escapeHtml(formatDateTimeShort(report.createdAt))}` : ""}</strong>
                          <span>${escapeHtml(report.text || "Описание не заполнено.")}</span>
                        ` : `
                          <strong>Report не найден</strong>
                          <span>Отклонение требует объяснения с рабочего места.</span>
                        `}
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          `,
        }) : renderPlanningTableInlineEmpty("Неделя без существенных отклонений", "Факт не отличается от плана больше чем на 5% по участкам и оборудованию.", "check"),
      }),
    });
  }
  
  function getWeeklyProductionControlNotePopover() {
    let popover = document.querySelector(".weekly-production-control-note-popover");
    if (popover) return popover;
    popover = document.createElement("section");
    popover.className = "weekly-production-control-note-popover";
    popover.setAttribute("role", "note");
    popover.hidden = true;
    document.body.appendChild(popover);
    return popover;
  }
  
  function positionWeeklyProductionControlNotePopover(popover, target) {
    if (!popover || !target) return;
    const rect = target.getBoundingClientRect();
    const margin = 14;
    popover.style.visibility = "hidden";
    popover.hidden = false;
    popover.style.left = "0px";
    popover.style.top = "0px";
    const width = popover.offsetWidth || 360;
    const height = popover.offsetHeight || 180;
    let left = rect.left;
    let top = rect.bottom + 10;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
    if (top + height > window.innerHeight - margin) top = rect.top - height - 10;
    left = Math.max(margin, left);
    top = Math.max(margin, top);
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
    popover.style.visibility = "visible";
  }
  
  function showWeeklyProductionControlNote(target) {
    if (!target?.dataset?.weeklyProductionNote) return;
    const popover = getWeeklyProductionControlNotePopover();
    popover.innerHTML = `
      <header>
        <strong>${escapeHtml(target.dataset.weeklyNoteTitle || "Отклонение")}</strong>
        <span>${escapeHtml([target.dataset.weeklyNotePlan, target.dataset.weeklyNoteFact].filter(Boolean).join(" · "))}</span>
      </header>
      <div>
        <em>${escapeHtml(target.dataset.weeklyNoteAuthor || "Заметка отклонения")}</em>
        <p>${escapeHtml(target.dataset.weeklyNoteText || "Заметка не заполнена.")}</p>
        ${target.dataset.weeklyNoteExtraNotes ? `<small>${escapeHtml(target.dataset.weeklyNoteExtraNotes)}</small>` : ""}
        ${target.dataset.weeklyNoteReport ? `<small>Report: ${escapeHtml(target.dataset.weeklyNoteReport)}</small>` : ""}
        ${target.dataset.weeklyNoteExtraReports ? `<small>${escapeHtml(target.dataset.weeklyNoteExtraReports)}</small>` : ""}
      </div>
    `;
    positionWeeklyProductionControlNotePopover(popover, target);
  }
  
  function hideWeeklyProductionControlNote() {
    const popover = document.querySelector(".weekly-production-control-note-popover");
    if (!popover) return;
    popover.hidden = true;
  }
  
  function bindWeeklyProductionControlEvents() {
    getApp().querySelectorAll("[data-weekly-production-note]").forEach((cell) => {
      cell.addEventListener("mouseenter", () => showWeeklyProductionControlNote(cell));
      cell.addEventListener("mousemove", () => positionWeeklyProductionControlNotePopover(getWeeklyProductionControlNotePopover(), cell));
      cell.addEventListener("mouseleave", hideWeeklyProductionControlNote);
      cell.addEventListener("focus", () => showWeeklyProductionControlNote(cell));
      cell.addEventListener("blur", hideWeeklyProductionControlNote);
    });
  }

  return {
    bindWeeklyProductionControlEvents,
    formatWeeklyProductionControlPercent,
    formatWeeklyProductionControlQuantity,
    getWeeklyProductionControlModel,
    renderWeeklyProductionControlPage,
  };
}
