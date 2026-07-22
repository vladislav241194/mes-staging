import type {
  ShiftMasterBoardAssignableEmployee,
  ShiftMasterBoardExecutor,
  ShiftMasterBoardLane,
  ShiftMasterBoardMasterOption,
  ShiftMasterBoardModel,
  ShiftMasterBoardRow,
  ShiftMasterBoardTransfer,
} from "./adapter";

type UnknownRecord = Record<string, unknown>;
type BoardFocus = ShiftMasterBoardModel["focus"];
type BoardTone = ShiftMasterBoardRow["signal"]["tone"];

interface DateValue {
  key: string;
  epochDay: number;
  date: Date;
}

interface BoardWindow {
  start: Date | null;
  end: Date | null;
  dateKey: string;
  label: string;
}

interface IndexedRecord {
  key: string;
  value: UnknownRecord;
}

interface EmployeeProjection {
  id: string;
  name: string;
  role: string;
  department: string;
  workCenterIds: string[];
  canDistribute: boolean;
  canExecute: boolean;
}

interface MasterProjection extends EmployeeProjection {
  policy: UnknownRecord;
}

interface RowContext {
  input: UnknownRecord;
  planning: UnknownRecord;
  window: BoardWindow;
  routesById: Map<string, UnknownRecord>;
  stepsById: Map<string, UnknownRecord>;
  workCentersById: Map<string, UnknownRecord>;
  equipmentById: Map<string, UnknownRecord>;
  employeesById: Map<string, EmployeeProjection>;
  mastersById: Map<string, MasterProjection>;
  masterProfiles: MasterProjection[];
  assignments: IndexedRecord[];
  facts: IndexedRecord[];
  carryovers: IndexedRecord[];
  activeMaster: MasterProjection | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const BOARD_LANES = [
  { id: "intake", label: "План", caption: "ожидает распределения мастером", tone: "neutral" },
  { id: "assigned", label: "В работе", caption: "есть ресурс, исполнители или лист", tone: "success" },
  { id: "fact", label: "Закрытие смены", caption: "смена вернула результат", tone: "success" },
] as const;

export const SHIFT_MASTER_BOARD_SUPPORTED_READ_FIELDS = [
  "current planning window, routes, operations and scheduled slots",
  "PostgreSQL Shift Execution assignments, executors, latest facts and active carryovers",
  "System Domains employees, work centers, employment and responsibility scopes",
  "Timesheet availability for the selected shift date",
  "session/UI date, selected card, focus and active master",
  "React rows, lanes, selection, KPI and explicit command capabilities",
] as const;

export const SHIFT_MASTER_BOARD_DEFERRED_READ_FIELDS = [
  "legacy synthetic rows for unscheduled route steps without an owner assignment",
  "seven-day history, swimlane groups and per-master row counters not rendered by the React scenario",
  "labor-capacity, per-panel and warning/assist calculations outside the current React row contract",
  "historic assignments and carryovers outside the bounded current-shift PostgreSQL projection",
  "print audit records and the full legacy SZN document metadata; writes stay in the command owner",
] as const;

const asRecord = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value)
  ? value as UnknownRecord
  : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const asText = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const asNumber = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;
const asQuantity = (value: unknown): number => {
  const result = Math.round(Number(String(value ?? "").replace(",", ".")));
  return Number.isFinite(result) && result > 0 ? result : 0;
};
const firstText = (...values: unknown[]): string => values.map((value) => asText(value)).find(Boolean) || "";
const own = (value: UnknownRecord, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const shortPersonName = (value: unknown, fallback = "Сотрудник"): string => {
  const parts = asText(value).split(/\s+/).filter(Boolean);
  return (parts.length > 2 ? parts.slice(0, 2) : parts).join(" ") || fallback;
};

function indexedRecords(value: unknown): IndexedRecord[] {
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      const record = asRecord(entry);
      return { key: firstText(record.id, String(index)), value: record };
    });
  }
  return Object.entries(asRecord(value)).map(([key, entry]) => ({ key, value: asRecord(entry) }));
}

function parseDate(value: unknown): DateValue | null {
  const match = asText(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const epochMs = Date.UTC(year, month - 1, day);
  const date = new Date(epochMs);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, epochDay: Math.floor(epochMs / DAY_MS), date };
}

function parseDateTime(value: unknown): Date | null {
  const raw = asText(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateKeyFrom(value: unknown): string {
  const raw = asText(value);
  const direct = parseDate(raw);
  if (direct) return direct.key;
  const prefix = raw.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  return parseDate(prefix)?.key || "";
}

function formatDate(dateKey: string): string {
  const date = parseDate(dateKey);
  if (!date) return "Текущая смена";
  return `${String(date.date.getUTCDate()).padStart(2, "0")}.${String(date.date.getUTCMonth() + 1).padStart(2, "0")}.${date.date.getUTCFullYear()}`;
}

function formatTimeRange(startValue: unknown, endValue: unknown): string {
  const timePart = (value: unknown): string => {
    const raw = asText(value);
    return raw.match(/T(\d{2}:\d{2})/)?.[1] || raw.match(/\b(\d{2}:\d{2})\b/)?.[1] || "";
  };
  const start = timePart(startValue);
  const end = timePart(endValue);
  return start && end ? `${start}–${end}` : "время не задано";
}

function rowEffectiveOn(row: UnknownRecord, dateKey: string): boolean {
  const date = parseDate(dateKey);
  if (!date || row.isActive === false || asText(row.archivedAt)) return false;
  const from = parseDate(row.validFrom ?? row.effectiveFrom);
  const to = parseDate(row.validTo ?? row.effectiveTo);
  return (!from || from.epochDay <= date.epochDay) && (!to || date.epochDay <= to.epochDay);
}

function indexById(value: unknown): Map<string, UnknownRecord> {
  return new Map(asArray(value).flatMap((entry) => {
    const item = asRecord(entry);
    const id = asText(item.id);
    return id ? [[id, item] as const] : [];
  }));
}

function sourcePayload(value: unknown): UnknownRecord {
  const payload = asRecord(value);
  return payload.command && Object.keys(asRecord(payload.source)).length
    ? asRecord(payload.source)
    : payload;
}

function resolveRegistries(input: UnknownRecord): UnknownRecord {
  const domains = asRecord(input.domains);
  const systemDomains = asRecord(input.systemDomains);
  const candidates = [
    asRecord(input.registries),
    asRecord(domains.registries),
    asRecord(systemDomains.registries),
    domains,
    systemDomains,
  ];
  const nested = candidates.find((candidate) => Object.keys(candidate).length > 0) || {};
  const names = [
    "orgUnits", "workCenters", "positions", "employees", "employmentAssignments", "equipment",
    "scheduleTemplates", "scheduleAssignments", "attendanceEvents", "responsibilityPolicies", "responsibilities",
  ];
  return Object.fromEntries(names.flatMap((name) => {
    const value = own(nested, name) ? nested[name] : input[name];
    return typeof value === "undefined" ? [] : [[name, value] as const];
  }));
}

function resolvePlanning(input: UnknownRecord): UnknownRecord {
  const planning = asRecord(input.planning);
  const projection = asRecord(input.projection);
  return Object.keys(planning).length ? planning : Object.keys(projection).length ? projection : input;
}

function resolveShiftExecution(input: UnknownRecord): UnknownRecord {
  const shiftExecution = asRecord(input.shiftExecution);
  const projection = asRecord(shiftExecution.projection);
  return Object.keys(projection).length ? { ...shiftExecution, ...projection } : shiftExecution;
}

function resolveWindow(input: UnknownRecord, planning: UnknownRecord): BoardWindow {
  const ui = asRecord(input.ui);
  const scope = asRecord(resolveShiftExecution(input).scope);
  const source = {
    ...scope,
    ...asRecord(planning.window),
    ...asRecord(input.window),
  };
  const slots = asArray(planning.slots).map(asRecord);
  const explicitDateKey = firstText(
    ui.dateKey,
    ui.windowStart,
    input.dateKey,
    source.dateKey,
    dateKeyFrom(source.start),
    dateKeyFrom(slots[0]?.plannedStart),
  );
  const parsedDate = parseDate(dateKeyFrom(explicitDateKey));
  const explicitStart = parseDateTime(source.start ?? source.windowStart);
  const explicitEnd = parseDateTime(source.end ?? source.windowEnd);
  const start = explicitStart || (parsedDate ? parsedDate.date : null);
  const end = explicitEnd && start && explicitEnd > start
    ? explicitEnd
    : start
      ? new Date(start.getTime() + DAY_MS)
      : null;
  const dateKey = parsedDate?.key || (start ? start.toISOString().slice(0, 10) : "");
  return {
    start,
    end,
    dateKey,
    label: firstText(source.label, dateKey ? `${formatDate(dateKey)} · 1 смена` : "Текущая смена"),
  };
}

function overlapsWindow(slot: UnknownRecord, window: BoardWindow): boolean {
  if (!window.start || !window.end) return true;
  const start = parseDateTime(slot.plannedStart ?? slot.start);
  const end = parseDateTime(slot.plannedEnd ?? slot.end);
  if (!start || !end || end <= start) return false;
  return start < window.end && end > window.start;
}

function resolveEmployment(employeeId: string, assignments: UnknownRecord[], dateKey: string): UnknownRecord {
  return assignments
    .filter((row) => asText(row.employeeId) === employeeId && rowEffectiveOn(row, dateKey))
    .sort((left, right) => Number(right.isPrimary === true) - Number(left.isPrimary === true)
      || asText(right.validFrom ?? right.effectiveFrom).localeCompare(asText(left.validFrom ?? left.effectiveFrom), "en"))[0] || {};
}

function projectEmployees(registries: UnknownRecord, dateKey: string): EmployeeProjection[] {
  const positionsById = indexById(registries.positions);
  const orgUnitsById = indexById(registries.orgUnits);
  const employmentAssignments = asArray(registries.employmentAssignments).map(asRecord);
  return asArray(registries.employees).map(asRecord).flatMap((employee): EmployeeProjection[] => {
    const id = asText(employee.id);
    if (!id || !rowEffectiveOn(employee, dateKey)) return [];
    const employment = resolveEmployment(id, employmentAssignments, dateKey);
    const position = positionsById.get(asText(employment.positionId)) || {};
    const orgUnit = orgUnitsById.get(asText(employment.orgUnitId)) || {};
    const capabilities = asRecord(position.capabilities);
    const workCenterIds = [...new Set([
      ...asArray(employee.workCenterIds).map((value) => asText(value)),
      asText(employment.workCenterId),
      asText(position.workCenterId),
    ].filter(Boolean))];
    return [{
      id,
      name: shortPersonName(firstText(employee.displayName, employee.name, id), id),
      role: firstText(position.name, employee.role, "Сотрудник"),
      department: firstText(orgUnit.name, employee.department, "Отдел не указан"),
      workCenterIds,
      canDistribute: capabilities.canDistribute === true || asText(position.kind) === "manager" || employee.canDistribute === true || asText(employee.personKind) === "master",
      canExecute: capabilities.canExecute !== false && capabilities.canReceiveShiftSheet !== false && employee.canExecute !== false,
    }];
  });
}

function descendantOrSame(candidateId: string, rootId: string, workCentersById: Map<string, UnknownRecord>): boolean {
  if (!candidateId || !rootId) return false;
  let currentId = candidateId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    if (currentId === rootId) return true;
    visited.add(currentId);
    currentId = asText(workCentersById.get(currentId)?.parentWorkCenterId);
  }
  return false;
}

function ownsWorkCenter(profile: MasterProjection | null, workCenterId: string, workCentersById: Map<string, UnknownRecord>): boolean {
  if (!profile || !workCenterId) return false;
  return profile.workCenterIds.some((rootId) => descendantOrSame(workCenterId, rootId, workCentersById));
}

function projectMasters(
  employees: EmployeeProjection[],
  registries: UnknownRecord,
  dateKey: string,
  workCentersById: Map<string, UnknownRecord>,
): MasterProjection[] {
  const employeesById = new Map(employees.map((employee) => [employee.id, employee] as const));
  const policies = [
    ...asArray(registries.responsibilityPolicies).map(asRecord),
    ...asArray(registries.responsibilities).map(asRecord),
  ].filter((policy) => rowEffectiveOn(policy, dateKey));
  return employees.filter((employee) => employee.canDistribute).map((employee) => {
    const policy = policies.find((candidate) => firstText(candidate.subjectEmployeeId, candidate.masterId) === employee.id) || {};
    const targetIds = asArray(policy.targetEmployeeIds ?? policy.employeeIds).map((value) => asText(value)).filter(Boolean);
    const targetCenters = targetIds.flatMap((id) => employeesById.get(id)?.workCenterIds || []);
    const directCenters = [...new Set([...employee.workCenterIds, ...targetCenters])];
    const compactCenters = directCenters.filter((candidate, index) => !directCenters.some((other, otherIndex) => (
      otherIndex !== index && descendantOrSame(candidate, other, workCentersById)
    )));
    return { ...employee, workCenterIds: compactCenters.length ? compactCenters : directCenters, policy };
  }).filter((profile) => profile.workCenterIds.length > 0);
}

function resolveSessionRole(session: UnknownRecord): string {
  const role = asRecord(session.role);
  const activeRole = asRecord(session.activeRole);
  return firstText(role.id, activeRole.id, session.roleId, typeof session.role === "string" ? session.role : "");
}

function resolveSessionPersonId(session: UnknownRecord): string {
  const authenticated = asRecord(session.authenticatedPerson);
  const person = asRecord(session.person);
  const actor = asRecord(session.actor);
  return firstText(authenticated.id, authenticated.employeeId, actor.employeeId, actor.id, person.id, session.employeeId, session.personId);
}

function resolveBoardFocus(value: unknown): BoardFocus {
  const focus = asText(value);
  return focus === "mine" || focus === "open" || focus === "attention" ? focus : "all";
}

function resolveActiveMaster({
  input,
  masters,
}: {
  input: UnknownRecord;
  masters: MasterProjection[];
}): { active: MasterProjection | null; scoped: MasterProjection | null; canSelect: boolean } {
  const ui = asRecord(input.ui);
  const session = asRecord(input.session);
  const roleId = resolveSessionRole(session);
  const personId = resolveSessionPersonId(session);
  const authenticatedMaster = masters.find((profile) => profile.id === personId) || null;
  const isMasterRole = roleId === "master" || session.isMaster === true;
  const scoped = isMasterRole ? authenticatedMaster : null;
  const requestedId = firstText(ui.activeShiftMasterId, ui.activeMasterId, ui.masterId, input.activeMasterId, session.activeMasterId);
  const active = scoped || masters.find((profile) => profile.id === requestedId) || authenticatedMaster || masters[0] || null;
  const capability = asRecord(input.capabilities);
  const canSelect = session.canSelectMaster === true
    || capability.masterSelection === true
    || ["admin", "productionHead"].includes(roleId);
  return { active, scoped: isMasterRole ? scoped : null, canSelect };
}

function collectShiftExecution(input: UnknownRecord): { assignments: IndexedRecord[]; facts: IndexedRecord[]; carryovers: IndexedRecord[] } {
  const shiftExecution = resolveShiftExecution(input);
  const assignmentSource = own(shiftExecution, "items")
    ? shiftExecution.items
    : own(shiftExecution, "assignments")
      ? shiftExecution.assignments
      : input.assignments ?? input.storedAssignments;
  const assignments = indexedRecords(assignmentSource).map((entry) => {
    const source = sourcePayload(entry.value.sourcePayload);
    return { ...entry, value: { ...source, ...entry.value } };
  });
  const embeddedFacts = assignments.flatMap((entry) => {
    const item = entry.value;
    const candidates = asArray(item.facts).length ? asArray(item.facts) : item.currentFact ? [item.currentFact] : [];
    return candidates.map((fact, index) => {
      const value = asRecord(fact);
      return { key: firstText(value.id, `${entry.key}:fact:${index}`), value: { ...sourcePayload(value.sourcePayload), ...value, assignmentId: firstText(value.assignmentId, entry.value.id, entry.key) } };
    });
  });
  const facts = [...indexedRecords(shiftExecution.facts ?? input.facts), ...embeddedFacts];
  const embeddedCarryovers = assignments.flatMap((entry) => asArray(entry.value.carryovers).map((carryover, index) => {
    const value = asRecord(carryover);
    return { key: firstText(value.id, `${entry.key}:carryover:${index}`), value: { ...sourcePayload(value.sourcePayload), ...value, sourceAssignmentId: firstText(value.sourceAssignmentId, entry.value.id, entry.key) } };
  }));
  const carryovers = [...indexedRecords(shiftExecution.carryovers ?? input.carryovers), ...embeddedCarryovers];
  return { assignments, facts, carryovers };
}

function assignmentRowId(entry: IndexedRecord): string {
  const assignment = entry.value;
  const sheet = asRecord(assignment.sheetContract);
  const transfer = asRecord(assignment.transferContract ?? sheet.transferContract);
  return firstText(assignment.sourceRowId, sheet.rowId, transfer.sourceRowId, assignment.rowId, entry.key);
}

function assignmentSlotId(entry: IndexedRecord): string {
  const assignment = entry.value;
  const sheet = asRecord(assignment.sheetContract);
  const transfer = asRecord(assignment.transferContract ?? sheet.transferContract);
  return firstText(assignment.sourceSlotId, assignment.slotId, sheet.sourceSlotId, transfer.sourceSlotId);
}

function assignmentForSlot(slotId: string, rowId: string, assignments: IndexedRecord[]): IndexedRecord | null {
  return assignments.find((entry) => assignmentRowId(entry) === rowId)
    || assignments.find((entry) => assignmentSlotId(entry) === slotId)
    || null;
}

function latestFact(assignment: IndexedRecord | null, facts: IndexedRecord[]): UnknownRecord {
  if (!assignment) return {};
  const assignmentId = firstText(assignment.value.id, assignment.key);
  const rowId = assignmentRowId(assignment);
  const matches = facts.filter((entry) => {
    const value = entry.value;
    return firstText(value.assignmentId, value.shiftAssignmentId) === assignmentId
      || (asText(value.sourceRowId) && asText(value.sourceRowId) === rowId);
  });
  return matches.sort((left, right) => firstText(right.value.reportedAt, right.value.updatedAt, right.value.createdAt)
    .localeCompare(firstText(left.value.reportedAt, left.value.updatedAt, left.value.createdAt), "en"))[0]?.value || {};
}

function routeIdFor(slot: UnknownRecord, assignment: UnknownRecord, step: UnknownRecord): string {
  const sheet = asRecord(assignment.sheetContract);
  const transfer = asRecord(assignment.transferContract ?? sheet.transferContract);
  return firstText(slot.routeId, assignment.workOrderId, assignment.routeId, assignment.planningOrderId, sheet.routeId, transfer.routeId, step.routeId);
}

function stepIdFor(slot: UnknownRecord, assignment: UnknownRecord): string {
  const sheet = asRecord(assignment.sheetContract);
  const transfer = asRecord(assignment.transferContract ?? sheet.transferContract);
  return firstText(slot.routeStepId, assignment.operationId, assignment.stepId, sheet.stepId, transfer.stepId);
}

function workCenterIdFor(slot: UnknownRecord, assignment: UnknownRecord, step: UnknownRecord): string {
  const sheet = asRecord(assignment.sheetContract);
  const transfer = asRecord(assignment.transferContract ?? sheet.transferContract);
  return firstText(
    assignment.workCenterId,
    sheet.workCenterId,
    transfer.fromWorkCenterId,
    step.planningWorkCenterId,
    step.workCenterId,
    slot.planningWorkCenterId,
    slot.workCenterId,
  );
}

function routeSteps(routeId: string, context: RowContext): UnknownRecord[] {
  return [...context.stepsById.values()].filter((step) => firstText(step.routeId, asRecord(step.metadata).routeId) === routeId)
    .sort((left, right) => asNumber(left.stepOrder ?? left.sequenceNo) - asNumber(right.stepOrder ?? right.sequenceNo)
      || asText(left.operationName ?? left.name).localeCompare(asText(right.operationName ?? right.name), "ru"));
}

function nextRouteStep(stepId: string, routeId: string, context: RowContext): UnknownRecord | null {
  const steps = routeSteps(routeId, context);
  const index = steps.findIndex((step) => asText(step.id) === stepId);
  return index >= 0 ? steps[index + 1] || null : null;
}

function transferFor({
  rowId,
  routeId,
  stepId,
  operationName,
  workCenterId,
  workCenterLabel,
  plannedQuantity,
  assignedQuantity,
  fact,
  assignment,
  context,
}: {
  rowId: string;
  routeId: string;
  stepId: string;
  operationName: string;
  workCenterId: string;
  workCenterLabel: string;
  plannedQuantity: number;
  assignedQuantity: number;
  fact: UnknownRecord;
  assignment: IndexedRecord | null;
  context: RowContext;
}): { transfer: ShiftMasterBoardTransfer; status: string; carryover: UnknownRecord | null; goodQuantity: number } {
  const actualQuantity = asQuantity(fact.actualQuantity);
  const defectQuantity = asQuantity(fact.defectQuantity);
  const goodQuantity = Math.max(0, actualQuantity - defectQuantity);
  const updatedAt = firstText(fact.reportedAt, fact.updatedAt);
  const remainingQuantity = updatedAt ? Math.max(0, plannedQuantity - goodQuantity) : Math.max(0, plannedQuantity - assignedQuantity);
  const assignmentId = assignment ? firstText(assignment.value.id, assignment.key) : "";
  const carryover = context.carryovers.find((entry) => (
    firstText(entry.value.sourceAssignmentId) === assignmentId
    || firstText(entry.value.sourceRowId) === rowId
  ))?.value || null;
  if (updatedAt && remainingQuantity > 0) {
    return {
      goodQuantity,
      status: "partial_carryover_required",
      carryover,
      transfer: {
        fromOperationName: operationName,
        fromWorkCenterLabel: workCenterLabel,
        toOperationName: operationName,
        toWorkCenterLabel: workCenterLabel,
        targetLabel: "Остаток в следующую смену",
        remainingQuantity,
      },
    };
  }
  const next = nextRouteStep(stepId, routeId, context);
  const nextWorkCenterId = next ? firstText(next.planningWorkCenterId, next.workCenterId) : "";
  const nextCenter = context.workCentersById.get(nextWorkCenterId) || {};
  return {
    goodQuantity,
    status: updatedAt ? "complete" : assignment?.value.issued === true || asText(assignment?.value.status) === "issued" ? "issued_waiting_fact" : "draft",
    carryover,
    transfer: {
      fromOperationName: operationName,
      fromWorkCenterLabel: workCenterLabel,
      toOperationName: next ? firstText(next.operationName, next.name, "Следующая операция") : "Завершение маршрута",
      toWorkCenterLabel: next ? firstText(nextCenter.name, nextWorkCenterId, "Участок не задан") : "Выход маршрута",
      targetLabel: next ? "Следующая операция" : "Закрытие операции",
      remainingQuantity,
    },
  };
}

function explicitTimesheetAvailability(input: UnknownRecord, employeeId: string, dateKey: string): UnknownRecord | null {
  const timesheet = asRecord(input.timesheet);
  const sources = [input.timesheetAvailability, timesheet.availability, timesheet.availabilityByEmployee];
  for (const sourceValue of sources) {
    const source = asRecord(sourceValue);
    const direct = asRecord(source[`${employeeId}::${dateKey}`]);
    if (Object.keys(direct).length) return direct;
    const employee = asRecord(source[employeeId]);
    const dated = asRecord(employee[dateKey]);
    if (Object.keys(dated).length) return dated;
    if (Object.keys(employee).length && (dateKeyFrom(employee.dateKey ?? employee.date) === dateKey || !dateKeyFrom(employee.dateKey ?? employee.date))) return employee;
  }
  const model = asRecord(timesheet.model);
  const employees = [
    ...asArray(timesheet.employees),
    ...asArray(model.employees),
    ...asArray(timesheet.groups).flatMap((group) => asArray(asRecord(group).employees)),
    ...asArray(model.groups).flatMap((group) => asArray(asRecord(group).employees)),
  ].map(asRecord);
  const employee = employees.find((candidate) => firstText(candidate.id, candidate.timesheetId) === employeeId);
  if (!employee) return null;
  return asArray(employee.cells).map(asRecord).find((cell) => dateKeyFrom(cell.dateKey ?? cell.date ?? cell.id) === dateKey) || null;
}

function scheduleAvailability(input: UnknownRecord, registries: UnknownRecord, employee: EmployeeProjection, dateKey: string): { isAvailable: boolean; label: string } {
  const explicit = explicitTimesheetAvailability(input, employee.id, dateKey);
  if (explicit) {
    const value = firstText(explicit.value, explicit.code, explicit.status, explicit.availabilityStatus).toLowerCase();
    const isAvailable = explicit.isAvailable === true || explicit.availabilityStatus === "available" || ["work", "overtime", "work-overtime", "available"].includes(value);
    const hours = Math.max(0, asNumber(explicit.hours ?? explicit.availableHours));
    return {
      isAvailable,
      label: firstText(explicit.label, explicit.title, isAvailable ? `${hours.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ч по Табелю` : "недоступен по Табелю"),
    };
  }
  const date = parseDate(dateKey);
  if (!date) return { isAvailable: false, label: "дата смены не определена" };
  const attendance = asArray(registries.attendanceEvents).map(asRecord)
    .filter((event) => asText(event.employeeId) === employee.id && dateKeyFrom(event.date ?? event.dateKey) === dateKey);
  const kind = firstText(attendance.find((event) => firstText(event.kind, event.type) !== "overtime")?.kind,
    attendance.find((event) => firstText(event.kind, event.type) !== "overtime")?.type).toLowerCase();
  const absenceLabels: Record<string, string> = { vacation: "отпуск", sick: "больничный", leave: "отгул", off: "выходной", day_off: "выходной" };
  if (absenceLabels[kind]) return { isAvailable: false, label: absenceLabels[kind] };
  const schedules = asArray(registries.scheduleAssignments).map(asRecord)
    .filter((assignment) => asText(assignment.employeeId) === employee.id && rowEffectiveOn(assignment, dateKey))
    .sort((left, right) => asText(right.validFrom ?? right.effectiveFrom).localeCompare(asText(left.validFrom ?? left.effectiveFrom), "en"));
  const schedule = schedules[0] || {};
  const template = indexById(registries.scheduleTemplates).get(asText(schedule.scheduleTemplateId)) || {};
  const code = firstText(template.code, schedule.code);
  if (!code && kind !== "work" && kind !== "overtime") return { isAvailable: false, label: "график не определён" };
  const patternMatch = code.match(/^(\d+)\/(\d+)$/);
  const workDays = Math.max(1, Math.min(31, Number(patternMatch?.[1] || 5)));
  const offDays = Math.max(1, Math.min(31, Number(patternMatch?.[2] || 2)));
  const patternLength = workDays + offDays;
  const anchor = parseDate(code === "5/2" ? "1970-01-05" : "1970-01-01") as DateValue;
  const patternOffset = Math.max(0, Math.round(asNumber(schedule.patternOffset ?? template.patternOffset)));
  const patternIndex = ((date.epochDay - anchor.epochDay + patternOffset) % patternLength + patternLength) % patternLength;
  const scheduledWorkday = patternIndex < workDays;
  const isAvailable = kind === "work" || kind === "overtime" || scheduledWorkday;
  const start = firstText(attendance[0]?.startTime, attendance[0]?.start, schedule.startTime, template.startTime, template.start, "08:00");
  const end = firstText(attendance[0]?.endTime, attendance[0]?.end, schedule.endTime, template.endTime, template.end, code === "2/2" ? "20:00" : "17:00");
  return { isAvailable, label: isAvailable ? `${code || "график"} · ${start}–${end}` : "выходной" };
}

function responsibilityEmployees(
  master: MasterProjection | null,
  workCenterId: string,
  employees: EmployeeProjection[],
  workCentersById: Map<string, UnknownRecord>,
): EmployeeProjection[] {
  const eligible = employees.filter((employee) => employee.canExecute && employee.workCenterIds.length > 0);
  if (!master) return eligible.filter((employee) => employee.workCenterIds.some((id) => descendantOrSame(id, workCenterId, workCentersById)));
  const policy = master.policy;
  const mode = firstText(policy.mode, "department");
  const targetIds = new Set(asArray(policy.targetEmployeeIds ?? policy.employeeIds).map((value) => asText(value)).filter(Boolean));
  if (mode === "all") return eligible;
  if (mode === "manual") {
    const manual = eligible.filter((employee) => targetIds.has(employee.id));
    if (manual.length) return manual;
  }
  const roots = mode === "workCenter" && workCenterId ? [workCenterId] : master.workCenterIds;
  return eligible.filter((employee) => employee.workCenterIds.some((id) => roots.some((root) => descendantOrSame(id, root, workCentersById))));
}

function executorRows(assignment: UnknownRecord, employeesById: Map<string, EmployeeProjection>): ShiftMasterBoardExecutor[] {
  return asArray(assignment.executors).map(asRecord).flatMap((executor, index): ShiftMasterBoardExecutor[] => {
    const id = firstText(executor.employeeId, executor.id);
    const quantity = asQuantity(executor.quantity);
    if (!id && quantity <= 0) return [];
    return [{
      id: id || `executor-${index + 1}`,
      name: employeesById.get(id)?.name || firstText(executor.employeeName, executor.name, "Исполнитель"),
      quantity,
      note: asText(executor.note),
    }];
  });
}

function assignableRows({
  input,
  dateKey,
  workCenterId,
  assignment,
  executors,
  owner,
  context,
}: {
  input: UnknownRecord;
  dateKey: string;
  workCenterId: string;
  assignment: UnknownRecord;
  executors: ShiftMasterBoardExecutor[];
  owner: MasterProjection | null;
  context: RowContext;
}): ShiftMasterBoardAssignableEmployee[] {
  const employeeById = context.employeesById;
  const scoped = responsibilityEmployees(owner, workCenterId, [...employeeById.values()], context.workCentersById);
  const currentById = new Map(executors.map((executor) => [executor.id, executor] as const));
  const result = scoped.map((employee): ShiftMasterBoardAssignableEmployee => {
    const availability = scheduleAvailability(input, resolveRegistries(input), employee, dateKey);
    return {
      id: employee.id,
      name: employee.name,
      quantity: currentById.get(employee.id)?.quantity || 0,
      available: availability.isAvailable,
      availabilityLabel: availability.label,
    };
  });
  executors.forEach((executor) => {
    if (result.some((employee) => employee.id === executor.id)) return;
    const employee = employeeById.get(executor.id);
    const availability = employee ? scheduleAvailability(input, resolveRegistries(input), employee, dateKey) : null;
    result.push({
      id: executor.id,
      name: executor.name,
      quantity: executor.quantity,
      available: availability?.isAvailable === true,
      availabilityLabel: availability?.label || "текущее назначение вне доступной смены",
    });
  });
  return result.sort((left, right) => left.name.localeCompare(right.name, "ru"));
}

function buildRow(slotValue: unknown, context: RowContext, forcedAssignment: IndexedRecord | null = null): ShiftMasterBoardRow | null {
  const slot = asRecord(slotValue);
  const slotId = firstText(slot.id, forcedAssignment ? assignmentSlotId(forcedAssignment) : "");
  const rowId = forcedAssignment ? assignmentRowId(forcedAssignment) : [slotId, context.window.dateKey].filter(Boolean).join("::");
  if (!rowId) return null;
  const assignmentEntry = forcedAssignment || assignmentForSlot(slotId, rowId, context.assignments);
  const assignment = assignmentEntry?.value || {};
  const stepId = stepIdFor(slot, assignment);
  const step = context.stepsById.get(stepId) || {};
  const routeId = routeIdFor(slot, assignment, step);
  const route = context.routesById.get(routeId) || {};
  const workCenterId = workCenterIdFor(slot, assignment, step);
  const workCenter = context.workCentersById.get(workCenterId) || {};
  const sheet = asRecord(assignment.sheetContract);
  const transferContract = asRecord(assignment.transferContract ?? sheet.transferContract);
  const source = sourcePayload(assignment.sourcePayload);
  const fact = latestFact(assignmentEntry, context.facts);
  const executors = executorRows(assignment, context.employeesById);
  const assignedQuantity = executors.length ? executors.reduce((sum, executor) => sum + executor.quantity, 0) : asQuantity(assignment.assignedQuantity);
  const plannedQuantity = asQuantity(assignment.plannedQuantity ?? sheet.plannedQuantity ?? transferContract.plannedQuantity ?? slot.quantity ?? route.planningQuantity);
  const operationName = firstText(sheet.operationName, transferContract.fromOperationName, slot.operationName, step.operationName, step.name, "Операция");
  const workCenterLabel = firstText(sheet.workCenterLabel, transferContract.fromWorkCenterLabel, workCenter.name, workCenter.label, workCenterId, "Участок не задан");
  const transferResult = transferFor({ rowId, routeId, stepId, operationName, workCenterId, workCenterLabel, plannedQuantity, assignedQuantity, fact, assignment: assignmentEntry, context });
  const actualQuantity = asQuantity(fact.actualQuantity);
  const defectQuantity = asQuantity(fact.defectQuantity);
  const updatedAt = firstText(fact.reportedAt, fact.updatedAt);
  const issued = assignment.issued === true || asText(assignment.status) === "issued";
  const explicit = Boolean(assignmentEntry || assignment.resourceId || executors.length || assignment.note);
  const laneOverride = firstText(asRecord(asRecord(context.input.ui).laneBySlot)[rowId], asRecord(asRecord(context.input.ui).shiftMasterBoardLaneBySlot)[rowId]);
  const laneId = updatedAt || actualQuantity > 0 || defectQuantity > 0
    ? "fact"
    : ["intake", "assigned", "fact"].includes(laneOverride)
      ? laneOverride
      : issued || explicit
        ? "assigned"
        : "intake";
  const riskLabel = firstText(assignment.riskLabel, assignment.riskReason, source.riskLabel, source.riskReason);
  const signal: { label: string; tone: BoardTone } = updatedAt
    ? transferResult.goodQuantity >= plannedQuantity && defectQuantity <= 0
      ? { label: "факт закрыт", tone: "success" }
      : { label: "есть отклонение", tone: "warning" }
    : riskLabel
      ? { label: `риск: ${riskLabel.toLocaleLowerCase("ru-RU")}`, tone: "warning" }
      : assignedQuantity > 0
        ? assignedQuantity >= plannedQuantity
          ? { label: "распределено", tone: "success" }
          : { label: "частично", tone: "warning" }
        : { label: "нужно распределить", tone: "warning" };
  const assignmentMasterId = firstText(assignment.masterId, sheet.masterId);
  const owner = context.mastersById.get(assignmentMasterId)
    || (context.activeMaster && ownsWorkCenter(context.activeMaster, workCenterId, context.workCentersById) ? context.activeMaster : null)
    || context.masterProfiles.find((profile) => ownsWorkCenter(profile, workCenterId, context.workCentersById))
    || context.activeMaster;
  const resourceId = firstText(assignment.resourceId, sheet.resourceId, slot.resourceId, step.resourceId);
  const resource = context.equipmentById.get(resourceId) || {};
  const dateKey = firstText(sheet.shiftDateKey, dateKeyFrom(rowId.match(/::(\d{4}-\d{2}-\d{2})$/)?.[1]), context.window.dateKey);
  const carryover = transferResult.carryover;
  return {
    id: rowId,
    slotId,
    routeId,
    stepId,
    workCenterId,
    resourceId,
    dateKey,
    documentNumber: firstText(sheet.documentNumber, assignment.documentNumber, `СЗН-${dateKey.replaceAll("-", "")}-${firstText(workCenter.code, workCenterId, "WC")}-${slotId.slice(-4).toUpperCase()}`),
    operationName,
    orderLabel: firstText(sheet.orderLabel, route.orderLabel, route.specificationName, route.name, assignment.workOrderId, "Заказ-наряд"),
    routePartLabel: firstText(sheet.routePartLabel, step.specTaskName, step.taskName, operationName, "Основной маршрут"),
    workCenterLabel,
    resourceLabel: firstText(sheet.resourceLabel, resource.name, resource.label, resourceId),
    timeLabel: formatTimeRange(slot.plannedStart ?? slot.start, slot.plannedEnd ?? slot.end),
    issuedAt: firstText(assignment.issuedAt),
    plannedQuantity,
    assignedQuantity,
    factQuantity: transferResult.goodQuantity,
    remainingQuantity: Math.max(0, plannedQuantity - transferResult.goodQuantity),
    unit: firstText(assignment.unit, sheet.unit, slot.unit, route.unit, "шт."),
    laneId,
    signal,
    masterName: owner?.name || firstText(sheet.masterName, assignment.masterName, "Мастер не назначен"),
    executors,
    assignableEmployees: assignableRows({ input: context.input, dateKey, workCenterId, assignment, executors, owner, context }),
    factUpdatedAt: updatedAt || "факт не внесён",
    riskLabel,
    factReady: issued,
    hasFact: Boolean(updatedAt),
    actualQuantity,
    defectQuantity,
    laborMinutes: asQuantity(fact.laborMinutes),
    executorCount: asQuantity(fact.executorCount),
    factComment: asText(fact.comment),
    deviationComment: asText(fact.deviationComment),
    isCarryover: false,
    sourceRowId: firstText(assignment.sourceRowId, rowId),
    sourceDateKey: "",
    carryoverReason: "",
    transferStatus: transferResult.status,
    carryoverId: firstText(carryover?.id),
    carryoverDateKey: dateKeyFrom(carryover?.dateKey),
    carryoverRemainingQuantity: asQuantity(carryover?.remainingQuantity),
    transferTargetLabel: transferResult.transfer.targetLabel,
    transfer: transferResult.transfer,
  };
}

function buildCarryoverRow(entry: IndexedRecord, context: RowContext): ShiftMasterBoardRow | null {
  const carryover = entry.value;
  const carryoverDateKey = dateKeyFrom(carryover.dateKey);
  if (!carryoverDateKey || carryoverDateKey !== context.window.dateKey) return null;
  const assignmentId = asText(carryover.sourceAssignmentId);
  const sourceAssignment = context.assignments.find((candidate) => firstText(candidate.value.id, candidate.key) === assignmentId) || null;
  const assignment = sourceAssignment?.value || {};
  const sourceSlotId = firstText(carryover.sourceSlotId, assignmentSlotId(sourceAssignment || { key: "", value: {} }));
  const sourceSlot = asArray(context.planning.slots).map(asRecord).find((slot) => asText(slot.id) === sourceSlotId) || {};
  const stepId = firstText(carryover.operationId, assignment.operationId, assignment.stepId, sourceSlot.routeStepId);
  const step = context.stepsById.get(stepId) || {};
  const routeId = firstText(carryover.workOrderId, assignment.workOrderId, assignment.routeId, sourceSlot.routeId, step.routeId);
  const route = context.routesById.get(routeId) || {};
  const workCenterId = firstText(carryover.workCenterId, assignment.workCenterId, step.planningWorkCenterId, step.workCenterId, sourceSlot.workCenterId);
  const workCenter = context.workCentersById.get(workCenterId) || {};
  const plannedQuantity = asQuantity(carryover.remainingQuantity);
  const operationName = firstText(carryover.operationName, step.operationName, sourceSlot.operationName, "Операция");
  const workCenterLabel = firstText(carryover.workCenterLabel, workCenter.name, workCenterId, "Участок не задан");
  const owner = context.masterProfiles.find((profile) => ownsWorkCenter(profile, workCenterId, context.workCentersById)) || context.activeMaster;
  const sourceRowId = firstText(carryover.sourceRowId, sourceAssignment ? assignmentRowId(sourceAssignment) : "");
  const sourceDateKey = dateKeyFrom(sourceRowId.match(/::(\d{4}-\d{2}-\d{2})$/)?.[1]);
  const id = firstText(carryover.id, entry.key);
  if (!id) return null;
  const transfer: ShiftMasterBoardTransfer = {
    fromOperationName: operationName,
    fromWorkCenterLabel: workCenterLabel,
    toOperationName: operationName,
    toWorkCenterLabel: workCenterLabel,
    targetLabel: "Остаток в следующую смену",
    remainingQuantity: plannedQuantity,
  };
  return {
    id,
    slotId: sourceSlotId,
    routeId,
    stepId,
    workCenterId,
    resourceId: firstText(carryover.resourceId, assignment.resourceId),
    dateKey: carryoverDateKey,
    documentNumber: firstText(carryover.documentNumber, `ОСТ-${carryoverDateKey.replaceAll("-", "")}-${firstText(workCenter.code, workCenterId, "WC")}`),
    operationName,
    orderLabel: firstText(carryover.orderLabel, route.specificationName, route.name, routeId, "Заказ-наряд"),
    routePartLabel: firstText(carryover.routePartLabel, step.specTaskName, operationName),
    workCenterLabel,
    resourceLabel: "",
    timeLabel: "время не задано",
    issuedAt: "",
    plannedQuantity,
    assignedQuantity: 0,
    factQuantity: 0,
    remainingQuantity: plannedQuantity,
    unit: firstText(carryover.unit, assignment.unit, "шт."),
    laneId: "intake",
    signal: { label: "остаток смены", tone: "warning" },
    masterName: owner?.name || "Мастер не назначен",
    executors: [],
    assignableEmployees: assignableRows({ input: context.input, dateKey: carryoverDateKey, workCenterId, assignment: {}, executors: [], owner, context }),
    factUpdatedAt: "факт не внесён",
    riskLabel: "",
    factReady: false,
    hasFact: false,
    actualQuantity: 0,
    defectQuantity: 0,
    laborMinutes: 0,
    executorCount: 0,
    factComment: "",
    deviationComment: "",
    isCarryover: true,
    sourceRowId,
    sourceDateKey,
    carryoverReason: firstText(carryover.reason, "Остаток после закрытия факта предыдущей смены"),
    transferStatus: "carryover",
    carryoverId: id,
    carryoverDateKey,
    carryoverRemainingQuantity: plannedQuantity,
    transferTargetLabel: transfer.targetLabel,
    transfer,
  };
}

function syntheticAssignmentSlot(entry: IndexedRecord, context: RowContext): UnknownRecord {
  const assignment = entry.value;
  const sheet = asRecord(assignment.sheetContract);
  const transfer = asRecord(assignment.transferContract ?? sheet.transferContract);
  const slotId = assignmentSlotId(entry);
  const stepId = firstText(assignment.operationId, assignment.stepId, sheet.stepId, transfer.stepId);
  const routeId = firstText(assignment.workOrderId, assignment.routeId, sheet.routeId, transfer.routeId);
  const step = context.stepsById.get(stepId) || {};
  return {
    id: slotId || firstText(assignment.sourceRowId, entry.key),
    routeId,
    routeStepId: stepId,
    workCenterId: firstText(assignment.workCenterId, sheet.workCenterId, transfer.fromWorkCenterId, step.workCenterId),
    resourceId: firstText(assignment.resourceId, sheet.resourceId),
    operationName: firstText(sheet.operationName, transfer.fromOperationName, step.operationName),
    plannedStart: firstText(assignment.plannedStart, sheet.plannedStart, `${context.window.dateKey}T08:00:00`),
    plannedEnd: firstText(assignment.plannedEnd, sheet.plannedEnd, `${context.window.dateKey}T17:00:00`),
    quantity: asQuantity(assignment.plannedQuantity ?? sheet.plannedQuantity ?? transfer.plannedQuantity),
    unit: firstText(assignment.unit, sheet.unit),
  };
}

function capability(value: UnknownRecord, ...keys: string[]): boolean {
  return keys.some((key) => value[key] === true);
}

export function isShiftMasterBoardProductionInput(value: unknown): boolean {
  const input = asRecord(value);
  return ["planning", "shiftExecution", "systemDomains", "domains", "registries", "session", "ui", "window", "assignments", "storedAssignments"]
    .some((key) => own(input, key));
}

export function buildShiftMasterBoardProductionModel(inputValue: unknown, capabilitiesValue: unknown = {}): ShiftMasterBoardModel {
  const input = asRecord(inputValue);
  const planning = resolvePlanning(input);
  const registries = resolveRegistries(input);
  const window = resolveWindow(input, planning);
  const routesById = indexById(planning.routes);
  const stepsById = indexById(planning.routeSteps ?? planning.steps);
  const workCentersById = new Map<string, UnknownRecord>();
  [...asArray(planning.workCenters), ...asArray(registries.workCenters)].map(asRecord).forEach((workCenter) => {
    const id = asText(workCenter.id);
    if (id) workCentersById.set(id, { ...(workCentersById.get(id) || {}), ...workCenter });
  });
  const equipmentById = indexById(registries.equipment);
  const employees = projectEmployees(registries, window.dateKey);
  const employeesById = new Map(employees.map((employee) => [employee.id, employee] as const));
  const masterProfiles = projectMasters(employees, registries, window.dateKey, workCentersById);
  const mastersById = new Map(masterProfiles.map((master) => [master.id, master] as const));
  const masterState = resolveActiveMaster({ input, masters: masterProfiles });
  const shiftExecution = collectShiftExecution(input);
  const context: RowContext = {
    input,
    planning,
    window,
    routesById,
    stepsById,
    workCentersById,
    equipmentById,
    employeesById,
    mastersById,
    masterProfiles,
    assignments: shiftExecution.assignments,
    facts: shiftExecution.facts,
    carryovers: shiftExecution.carryovers,
    activeMaster: masterState.active,
  };
  const slots = asArray(planning.slots).map(asRecord).filter((slot) => overlapsWindow(slot, window));
  const rowsById = new Map<string, ShiftMasterBoardRow>();
  slots.forEach((slot) => {
    const rowId = [asText(slot.id), window.dateKey].filter(Boolean).join("::");
    const assignment = assignmentForSlot(asText(slot.id), rowId, context.assignments);
    const row = buildRow(slot, context, assignment);
    if (row) rowsById.set(row.id, row);
  });
  context.assignments.forEach((assignment) => {
    const rowId = assignmentRowId(assignment);
    const rowDateKey = firstText(dateKeyFrom(rowId.match(/::(\d{4}-\d{2}-\d{2})$/)?.[1]), dateKeyFrom(assignment.value.dateKey), dateKeyFrom(asRecord(assignment.value.sheetContract).shiftDateKey));
    if (rowDateKey && rowDateKey !== window.dateKey) return;
    if ([...rowsById.values()].some((row) => row.id === rowId || row.sourceRowId === rowId)) return;
    const row = buildRow(syntheticAssignmentSlot(assignment, context), context, assignment);
    if (row) rowsById.set(row.id, row);
  });
  context.carryovers.forEach((carryover) => {
    const row = buildCarryoverRow(carryover, context);
    if (row && !rowsById.has(row.id)) rowsById.set(row.id, row);
  });
  let allRows = [...rowsById.values()].sort((left, right) => left.timeLabel.localeCompare(right.timeLabel, "ru")
    || left.workCenterLabel.localeCompare(right.workCenterLabel, "ru")
    || left.operationName.localeCompare(right.operationName, "ru"));
  if (masterState.scoped) {
    allRows = allRows.filter((row) => {
      const workCenterId = [...workCentersById.entries()].find(([, workCenter]) => firstText(workCenter.name, workCenter.label) === row.workCenterLabel)?.[0] || "";
      return row.masterName === masterState.scoped?.name || ownsWorkCenter(masterState.scoped, workCenterId, workCentersById);
    });
  } else if (resolveSessionRole(asRecord(input.session)) === "master") {
    allRows = [];
  }
  const ui = asRecord(input.ui);
  const focus = resolveBoardFocus(firstText(ui.focus, ui.shiftMasterBoardFocus, input.focus));
  const rows = allRows.filter((row) => {
    if (focus === "mine") {
      const rowWorkCenterId = [...workCentersById.entries()].find(([, workCenter]) => (
        firstText(workCenter.name, workCenter.label, workCenter.id) === row.workCenterLabel
      ))?.[0] || "";
      return row.masterName === masterState.active?.name
        || ownsWorkCenter(masterState.active, rowWorkCenterId, workCentersById);
    }
    if (focus === "open") return row.laneId !== "fact";
    if (focus === "attention") return row.laneId !== "fact"
      || row.assignedQuantity <= 0
      || row.assignedQuantity < row.plannedQuantity
      || row.factQuantity < row.plannedQuantity
      || !row.factReady
      || Boolean(row.riskLabel);
    return true;
  });
  const selectedId = firstText(ui.selectedRowId, ui.selectedSlotId, ui.shiftMasterBoardSelectedSlotId, input.selectedRowId);
  const selectedRow = rows.find((row) => row.id === selectedId)
    || rows.find((row) => row.laneId !== "fact")
    || rows[0]
    || null;
  const lanes: ShiftMasterBoardLane[] = BOARD_LANES.map((lane) => ({ ...lane, rows: rows.filter((row) => row.laneId === lane.id) }));
  const capabilities = { ...asRecord(input.capabilities), ...asRecord(capabilitiesValue) };
  const masters: ShiftMasterBoardMasterOption[] = masterState.canSelect
    ? masterProfiles.map((profile) => ({ id: profile.id, name: profile.name }))
    : [];
  const plannedQuantity = rows.reduce((sum, row) => sum + row.plannedQuantity, 0);
  const assignedQuantity = rows.reduce((sum, row) => sum + row.assignedQuantity, 0);
  const factQuantity = rows.reduce((sum, row) => sum + row.factQuantity, 0);
  return {
    windowLabel: window.label,
    dateKey: window.dateKey,
    rows,
    lanes,
    selectedRow,
    focus,
    masterId: masterState.active?.id || "",
    masterLabel: masterState.active ? `${masterState.active.name} · ${masterState.active.department}` : "Мастер не назначен · Участок не указан",
    masters,
    plannedQuantity,
    assignedQuantity,
    factQuantity,
    openQuantity: Math.max(0, plannedQuantity - factQuantity),
    canAssign: capability(capabilities, "assignmentSave", "canAssign"),
    canRecordFact: capability(capabilities, "factSave", "canRecordFact"),
    canMoveLane: capability(capabilities, "laneMove", "canMoveLane"),
    readModelCoverage: {
      contract: "postgres-shift-master-board-read-v1",
      supported: SHIFT_MASTER_BOARD_SUPPORTED_READ_FIELDS,
      deferred: SHIFT_MASTER_BOARD_DEFERRED_READ_FIELDS,
    },
  };
}
