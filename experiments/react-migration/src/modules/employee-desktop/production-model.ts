import type {
  EmployeeDesktopModel,
  EmployeeDesktopPerson,
  EmployeeDesktopRouteNode,
  EmployeeDesktopTask,
} from "./adapter";

type UnknownRecord = Record<string, unknown>;

interface IndexedRecord {
  key: string;
  value: UnknownRecord;
}

interface ProjectedRow {
  id: string;
  row: UnknownRecord;
  assignment: UnknownRecord;
}

const asRecord = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value)
  ? value as UnknownRecord
  : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const asText = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const asQuantity = (value: unknown): number => {
  const number = Math.round(Number(String(value ?? "").replace(",", ".")));
  return Number.isFinite(number) && number > 0 ? number : 0;
};
const asNonNegativeQuantity = (value: unknown): number => {
  const number = Math.round(Number(String(value ?? "").replace(",", ".")));
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

function indexedRecords(value: unknown): IndexedRecord[] {
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      const record = asRecord(entry);
      return { key: asText(record.id, String(index)), value: record };
    });
  }
  return Object.entries(asRecord(value)).map(([key, entry]) => ({ key, value: asRecord(entry) }));
}

function indexById(value: unknown): Map<string, UnknownRecord> {
  const result = new Map<string, UnknownRecord>();
  asArray(value).forEach((entry) => {
    const record = asRecord(entry);
    const id = asText(record.id);
    if (id) result.set(id, record);
  });
  return result;
}

function shortPersonName(value: unknown, fallback = "Исполнитель"): string {
  const parts = asText(value).split(/\s+/).filter(Boolean);
  return (parts.length > 2 ? parts.slice(0, 2) : parts).join(" ") || fallback;
}

function getAssignmentRowId(entry: IndexedRecord): string {
  const assignment = entry.value;
  const sheet = asRecord(assignment.sheetContract);
  const transfer = asRecord(assignment.transferContract ?? sheet.transferContract);
  return asText(
    assignment.sourceRowId,
    asText(sheet.rowId, asText(transfer.sourceRowId, asText(assignment.rowId, entry.key))),
  );
}

function getAssignmentSlotId(entry: IndexedRecord): string {
  const assignment = entry.value;
  const sheet = asRecord(assignment.sheetContract);
  const transfer = asRecord(assignment.transferContract ?? sheet.transferContract);
  return asText(
    assignment.slotId,
    asText(sheet.sourceSlotId, asText(transfer.sourceSlotId, getAssignmentRowId(entry))),
  );
}

function getRowId(row: UnknownRecord): string {
  return asText(row.id, asText(row.rowId, asText(row.slotId)));
}

function getAssignmentExecutors(assignmentValue: unknown, rowValue: unknown = {}): UnknownRecord[] {
  const assignment = asRecord(assignmentValue);
  const row = asRecord(rowValue);
  const boardAssignment = asRecord(row.boardAssignment);
  const candidates = [assignment.executors, boardAssignment.executors, row.executors]
    .find((value) => Array.isArray(value) && value.length) as unknown[] | undefined;
  return asArray(candidates).map(asRecord).filter((executor) => (
    Boolean(asText(executor.employeeId)) && asQuantity(executor.quantity) > 0
  ));
}

function resolveAssignmentForRow(row: UnknownRecord, entries: IndexedRecord[]): IndexedRecord | null {
  const rowId = getRowId(row);
  const sourceRowId = asText(row.sourceRowId);
  const slotId = asText(row.slotId);
  return entries.find((entry) => (
    entry.key === rowId
    || getAssignmentRowId(entry) === rowId
    || (sourceRowId && getAssignmentRowId(entry) === sourceRowId)
    || (slotId && getAssignmentSlotId(entry) === slotId)
  )) || null;
}

function buildSyntheticRow(
  entry: IndexedRecord,
  planning: UnknownRecord,
  workCentersById: Map<string, UnknownRecord>,
): UnknownRecord {
  const assignment = entry.value;
  const sheet = asRecord(assignment.sheetContract);
  const transfer = asRecord(assignment.transferContract ?? sheet.transferContract);
  const slotsById = indexById(planning.slots);
  const routesById = indexById(planning.routes);
  const stepsById = indexById(planning.routeSteps);
  const rowId = getAssignmentRowId(entry);
  const slotId = getAssignmentSlotId(entry);
  const slot = slotsById.get(slotId) || {};
  const routeId = asText(assignment.routeId, asText(sheet.routeId, asText(transfer.routeId, asText(slot.routeId))));
  const route = routesById.get(routeId) || {};
  const stepId = asText(assignment.stepId, asText(sheet.stepId, asText(transfer.stepId, asText(slot.routeStepId))));
  const step = stepsById.get(stepId) || {};
  const workCenterId = asText(
    assignment.workCenterId,
    asText(sheet.workCenterId, asText(transfer.fromWorkCenterId, asText(step.planningWorkCenterId, asText(step.workCenterId, asText(slot.workCenterId))))),
  );
  const workCenter = workCentersById.get(workCenterId) || {};
  const operationName = asText(sheet.operationName, asText(transfer.fromOperationName, asText(step.operationName, asText(slot.operationName, "Операция"))));
  const routePartLabel = asText(sheet.routePartLabel, asText(step.specTaskName, operationName));
  const orderLabel = asText(
    sheet.orderLabel,
    asText(route.specificationName, asText(route.name, asText(assignment.planningOrderId, "Заказ-наряд"))),
  );
  return {
    id: rowId,
    rowId,
    slotId,
    slot,
    route,
    routeId,
    step,
    stepId,
    startsAt: slot.plannedStart ?? assignment.updatedAt ?? sheet.updatedAt ?? "",
    endsAt: slot.plannedEnd ?? assignment.updatedAt ?? sheet.updatedAt ?? "",
    documentNumber: sheet.documentNumber ?? assignment.documentNumber ?? "",
    routeName: route.name ?? "Маршрутная карта",
    orderLabel,
    taskLabel: routePartLabel,
    routePartLabel,
    operationName,
    workCenterId,
    workCenter,
    workCenterLabel: sheet.workCenterLabel ?? transfer.fromWorkCenterLabel ?? workCenter.name ?? "Участок не задан",
    resourceId: sheet.resourceId ?? assignment.resourceId ?? slot.resourceId ?? "",
    resourceLabel: sheet.resourceLabel ?? "",
    plannedQuantity: assignment.plannedQuantity ?? sheet.plannedQuantity ?? transfer.plannedQuantity ?? slot.quantity ?? 0,
    unit: assignment.unit ?? sheet.unit ?? transfer.unit ?? "шт.",
    masterMinutesPerUnit: assignment.laborMinutesPerUnit ?? 0,
    boardAssignment: assignment,
  };
}

function projectRows(input: UnknownRecord): ProjectedRow[] {
  const planning = asRecord(input.planning);
  const workCentersById = indexById(input.workCenters);
  const assignmentEntries = indexedRecords(input.storedAssignments);
  const result = new Map<string, ProjectedRow>();

  asArray(input.boardRows).map(asRecord).forEach((row) => {
    const id = getRowId(row);
    if (!id) return;
    const stored = resolveAssignmentForRow(row, assignmentEntries);
    const assignment = stored?.value || asRecord(row.boardAssignment);
    result.set(id, { id, row, assignment });
  });

  assignmentEntries.forEach((entry) => {
    if (!getAssignmentExecutors(entry.value).length) return;
    const rowId = getAssignmentRowId(entry);
    const slotId = getAssignmentSlotId(entry);
    const existing = [...result.values()].find((item) => (
      item.id === rowId || asText(item.row.slotId) === slotId || asText(item.row.sourceRowId) === rowId
    ));
    if (existing) {
      result.set(existing.id, { ...existing, assignment: entry.value });
      return;
    }
    const row = buildSyntheticRow(entry, planning, workCentersById);
    const id = getRowId(row);
    if (id) result.set(id, { id, row, assignment: entry.value });
  });

  return [...result.values()];
}

function routeKey(row: UnknownRecord): string {
  return asText(asRecord(row.route).id, asText(row.routeId, asText(row.routeName, getRowId(row))));
}

function stepKey(row: UnknownRecord): string {
  return asText(
    asRecord(row.step).id,
    asText(row.stepId, [asText(row.operationName), asText(row.workCenterId), asText(row.taskLabel)].filter(Boolean).join("|")),
  );
}

function rowTime(row: UnknownRecord): number {
  const value = row.startsAt ?? asRecord(row.slot).plannedStart;
  const timestamp = new Date(asText(value)).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function routeChain(row: ProjectedRow, rows: ProjectedRow[]): { previous: UnknownRecord; current: UnknownRecord; next: UnknownRecord } {
  const ordered = rows.filter((item) => routeKey(item.row) === routeKey(row.row)).sort((left, right) => (
    rowTime(left.row) - rowTime(right.row) || left.id.localeCompare(right.id, "ru")
  ));
  const index = ordered.findIndex((item) => item.id === row.id);
  const currentStepKey = stepKey(row.row);
  const previous = index > 0
    ? [...ordered.slice(0, index)].reverse().find((item) => stepKey(item.row) !== currentStepKey)?.row || {}
    : {};
  const next = index >= 0
    ? ordered.slice(index + 1).find((item) => stepKey(item.row) !== currentStepKey)?.row || {}
    : {};
  return { previous, current: row.row, next };
}

function rowOperation(row: UnknownRecord, fallback = "Операция"): string {
  return asText(row.operationName, asText(asRecord(row.step).operationName, fallback));
}

function rowWorkCenterLabel(row: UnknownRecord, workCentersById: Map<string, UnknownRecord>, fallback = "Участок не задан"): string {
  const workCenterId = asText(row.workCenterId, asText(asRecord(row.slot).workCenterId));
  return asText(row.workCenterLabel, asText(asRecord(row.workCenter).name, asText(workCentersById.get(workCenterId)?.name, fallback)));
}

function rowRoutePartLabel(row: UnknownRecord, fallback = "Основной маршрут"): string {
  return asText(row.routePartLabel, asText(row.taskLabel, asText(asRecord(row.step).specTaskName, rowOperation(row, fallback))));
}

function laborMinutesPerUnit(row: UnknownRecord): number {
  const slot = asRecord(row.slot);
  const explicit = Number(slot.planningLaborMinutesPerUnit ?? row.minutesPerUnit ?? row.masterMinutesPerUnit ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const plannedQuantity = asQuantity(row.plannedQuantity ?? slot.quantity);
  const fixedMinutes = Number(slot.planningLaborFixedMinutes ?? 0);
  if (plannedQuantity > 0 && Number.isFinite(fixedMinutes) && fixedMinutes > 0) return fixedMinutes / plannedQuantity;
  const durationMs = Number(slot.planningLaborDurationMs ?? 0);
  return plannedQuantity > 0 && Number.isFinite(durationMs) && durationMs > 0 ? (durationMs / 60_000) / plannedQuantity : 0;
}

function formatLabor(value: number): string {
  return value > 0
    ? `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} мин/ед.`
    : "трудозатраты не заданы";
}

function reportSummary(value: unknown): { reportCount: number; photoCount: number } {
  if (Array.isArray(value)) {
    return {
      reportCount: value.length,
      photoCount: value.filter((entry) => Boolean(asRecord(entry).photo)).length,
    };
  }
  const record = asRecord(value);
  const reports = asArray(record.reports);
  return {
    reportCount: asNonNegativeQuantity(record.reportCount ?? (reports.length ? reports.length : 0)),
    photoCount: asNonNegativeQuantity(record.photoCount ?? reports.filter((entry) => Boolean(asRecord(entry).photo)).length),
  };
}

function buildRouteNodes(
  chain: { previous: UnknownRecord; current: UnknownRecord; next: UnknownRecord },
  workCentersById: Map<string, UnknownRecord>,
): EmployeeDesktopRouteNode[] {
  return [
    { label: "До", row: chain.previous, current: false, fallback: "старт" },
    { label: "Сейчас", row: chain.current, current: true, fallback: rowOperation(chain.current) },
    { label: "После", row: chain.next, current: false, fallback: "финиш" },
  ].map((item) => ({
    label: item.label,
    operationName: rowOperation(item.row, item.fallback),
    workCenterLabel: rowWorkCenterLabel(item.row, workCentersById, item.current ? "Участок не задан" : "вне текущего окна"),
    routePartLabel: Object.keys(item.row).length ? rowRoutePartLabel(item.row, "") : "",
    current: item.current,
  }));
}

function buildTasks(input: UnknownRecord, rows: ProjectedRow[]): EmployeeDesktopTask[] {
  const employeesById = indexById(input.employees);
  const workCentersById = indexById(input.workCenters);
  const factDraftEntries = indexedRecords(input.factDrafts);
  const factDrafts = new Map(factDraftEntries.map((entry) => [entry.key, entry.value]));
  const summaries = asRecord(input.reportSummaries);

  return rows.flatMap((projected) => {
    const { row, assignment, id: rowId } = projected;
    const chain = routeChain(projected, rows);
    const routeNodes = buildRouteNodes(chain, workCentersById);
    return getAssignmentExecutors(assignment, row).map((executor): EmployeeDesktopTask => {
      const employeeId = asText(executor.employeeId);
      const employee = employeesById.get(employeeId) || {};
      const taskId = `${rowId || "row"}::${employeeId || "employee"}`;
      const draft = factDrafts.get(taskId) || {};
      const assignedQuantity = asQuantity(executor.quantity);
      const actualQuantity = asNonNegativeQuantity(draft.actualQuantity);
      const defectQuantity = Math.min(assignedQuantity, asNonNegativeQuantity(draft.defectQuantity));
      const updatedAt = asText(draft.updatedAt);
      const isStarted = asText(draft.status) === "in_progress" && !updatedAt;
      const isDone = Boolean(updatedAt);
      const sheet = asRecord(assignment.sheetContract);
      const operationName = rowOperation(row);
      const workCenterLabel = rowWorkCenterLabel(row, workCentersById, asText(employee.department, "Участок не задан"));
      const summary = reportSummary(summaries[taskId] ?? summaries[rowId]);
      const minutesPerUnit = laborMinutesPerUnit(row);
      return {
        id: taskId,
        rowId,
        employeeId,
        employeeName: shortPersonName(employee.displayName ?? employee.name),
        operationName,
        workCenterLabel,
        orderLabel: asText(row.orderLabel, asText(sheet.orderLabel, asText(row.routeName, "Заказ-наряд"))),
        routePartLabel: rowRoutePartLabel(row),
        documentNumber: asText(row.documentNumber, asText(sheet.documentNumber, "СЗН не сформирован")),
        assignedQuantity,
        actualQuantity,
        defectQuantity,
        goodQuantity: Math.max(0, actualQuantity - defectQuantity),
        unit: asText(row.unit, asText(assignment.unit, "шт.")),
        laborLabel: formatLabor(minutesPerUnit),
        status: isDone ? "факт записан" : isStarted ? "в работе" : assignment.issued === true || row.isIssued === true ? "СЗН готов" : "назначено",
        isStarted,
        isDone,
        previousOperation: routeNodes[0].operationName,
        nextOperation: routeNodes[2].operationName,
        routeNodes,
        ...summary,
      };
    });
  }).sort((left, right) => (
    left.employeeName.localeCompare(right.employeeName, "ru")
    || left.operationName.localeCompare(right.operationName, "ru")
    || left.id.localeCompare(right.id, "ru")
  ));
}

function buildPeople(tasks: EmployeeDesktopTask[], employeesValue: unknown): EmployeeDesktopPerson[] {
  const employeesById = indexById(employeesValue);
  const byId = new Map<string, EmployeeDesktopPerson>();
  tasks.forEach((task) => {
    if (!task.employeeId || byId.has(task.employeeId)) return;
    const employee = employeesById.get(task.employeeId) || {};
    byId.set(task.employeeId, {
      id: task.employeeId,
      name: shortPersonName(employee.displayName ?? employee.name ?? task.employeeName),
    });
  });
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name, "ru"));
}

/**
 * Builds the React Employee Desktop contract directly from production-owned
 * projections. The function deliberately has no dependency on auth_render or
 * its mutable renderer model.
 */
export function buildEmployeeDesktopProductionModel(inputValue: unknown, capabilitiesValue: unknown = {}): EmployeeDesktopModel {
  const input = asRecord(inputValue);
  const session = asRecord(input.session);
  const capabilities = asRecord(capabilitiesValue);
  const allTasks = buildTasks(input, projectRows(input));
  const people = buildPeople(allTasks, input.employees);
  const role = asRecord(session.role ?? session.activeRole);
  const canViewAll = session.canViewAll === true || ["admin", "productionHead"].includes(asText(role.id));
  const authenticatedPerson = asRecord(session.authenticatedPerson ?? session.authPerson);
  const selectedPerson = asRecord(session.selectedPerson ?? session.person);
  const fallbackPerson = Object.keys(authenticatedPerson).length
    ? authenticatedPerson
    : Object.keys(selectedPerson).length
      ? selectedPerson
      : asRecord(asArray(input.employees)[0]);
  const fallbackPersonId = asText(fallbackPerson.id, people[0]?.id || "");
  let viewedPersonId = canViewAll ? asText(session.viewedPersonId, "__all") : fallbackPersonId;
  if (canViewAll && viewedPersonId !== "__all" && !people.some((person) => person.id === viewedPersonId)) {
    viewedPersonId = people[0]?.id || "__all";
  }
  if (!canViewAll) viewedPersonId = fallbackPersonId;
  const tasks = canViewAll && viewedPersonId === "__all"
    ? allTasks
    : allTasks.filter((task) => task.employeeId === viewedPersonId);
  const selectedTaskId = asText(session.selectedTaskId);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || tasks[0] || null;
  const viewedPerson = people.find((person) => person.id === viewedPersonId);
  const personName = viewedPerson?.name || shortPersonName(fallbackPerson.displayName ?? fallbackPerson.name);
  const activeTasks = tasks.filter((task) => !task.isDone);
  const doneTasks = tasks.filter((task) => task.isDone);
  return {
    tasks,
    selectedTask,
    people,
    viewedPersonId,
    personName,
    canSwitchPerson: capabilities.sessionNavigation === true && canViewAll,
    canReturnToUserSelection: capabilities.sessionNavigation === true,
    canStartTask: capabilities.taskStart === true,
    canSaveFact: capabilities.factSave === true,
    canSaveReport: capabilities.reportSave === true,
    assignedQuantity: tasks.reduce((sum, task) => sum + task.assignedQuantity, 0),
    goodQuantity: tasks.reduce((sum, task) => sum + task.goodQuantity, 0),
    activeCount: activeTasks.length,
    doneCount: doneTasks.length,
  };
}
