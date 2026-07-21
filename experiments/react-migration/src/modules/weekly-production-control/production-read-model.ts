type UnknownRecord = Record<string, unknown>;

const DAY_MS = 24 * 60 * 60 * 1000;

// Visible MES production order is a product contract, not a renderer detail.
// System Domains intentionally sorts registries by durable ID, so keep the
// accepted shop-floor hierarchy explicitly in the typed read model and append
// future centers/equipment after these known entries.
const WEEKLY_STRUCTURE_ORDER = [
  "D-MANUAL",
  "S-MANUAL-1",
  "S-MANUAL-2",
  "S-MANUAL-3",
  "S-MANUAL-4",
  "S-LOCKSMITH-1",
  "D-SMT",
  "S-SMT-1",
  "S-SMT-2",
  "S-AOI",
  "S-SMT-REPAIR",
  "S-WASH",
  "D-COATING",
  "D-PROGRAMMING",
  "D-SERVICE",
  "D-WAREHOUSE",
  "S-PACKING",
  "D-QC",
  "D-TECH",
  "EQ-S-SMT-1-S2-L2-1",
  "EQ-S-SMT-2-S2-1",
  "EQ-S-AOI-PEMTRON-1",
  "EQ-S-WASH-UZ-3-1-1",
  "EQ-S-WASH-STRUYNAYA-OTMYVKA-1",
  "EQ-D-COATING-NONAME-1",
] as const;
const WEEKLY_STRUCTURE_ORDER_INDEX = new Map<string, number>(WEEKLY_STRUCTURE_ORDER.map((id, index) => [id, index]));

const asRecord = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const asText = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const asNumber = (value: unknown, fallback = 0): number => Number.isFinite(Number(value)) ? Number(value) : fallback;
const asQuantity = (value: unknown): number => Math.max(0, asNumber(value));
const normalizeLookupText = (value: unknown): string => asText(value).toLocaleLowerCase("ru-RU");

function toDate(value: unknown): Date {
  if (value instanceof Date) return new Date(value.getTime());
  return new Date(typeof value === "string" || typeof value === "number" ? value : String(value ?? ""));
}

function startOfDay(value: unknown): Date {
  const date = toDate(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(value: unknown): Date {
  const date = startOfDay(value);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date;
}

function addMs(value: unknown, milliseconds: number): Date {
  return new Date(toDate(value).getTime() + milliseconds);
}

function toDateInput(value: unknown): string {
  const date = toDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: unknown): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(toDate(value));
}

function formatShortDate(value: unknown): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(toDate(value));
}

function formatDateTimeShort(value: unknown): string {
  return toDate(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatPersonName(value: unknown): string {
  if (typeof value === "string") return value.trim() || "Исполнитель";
  const source = asRecord(value);
  return asText(source.name || source.fullName || source.id, "Исполнитель");
}

export const formatWeeklyControlQuantity = (value: number, unit = "шт."): string => `${Math.round(value).toLocaleString("ru-RU")} ${unit || "шт."}`;
export const formatWeeklyControlPercent = (value: number): string => {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
};

export interface WeeklyProductionControlDayNote {
  title: string;
  plan: string;
  fact: string;
  author: string;
  text: string;
  extraNotes: string;
  reportText: string;
  extraReports: string;
}

interface WeeklyProductionControlDeviationNote {
  employeeName: unknown;
  employeeLabel: string;
  text: string;
  createdAt: string;
  deviationPercent: number;
}

interface WeeklyProductionControlSourceRow {
  id: string;
  plannedStart: Date;
  plannedEnd: Date;
  quantity: number;
  unit: string;
  workCenterId: string;
  parentWorkCenterId: string;
  workCenterLabel: string;
  resourceLabel: string;
  sourceKind: string;
  sortIndex: number;
  isWeeklyControlStructureRow: boolean;
  factRecords: UnknownRecord[];
  reports: UnknownRecord[];
}

export interface WeeklyProductionControlDay {
  id: string;
  date: Date;
  end: Date;
  label: string;
  weekday: string;
  isWeekend: boolean;
  planQuantity: number;
  factQuantity: number;
  defectQuantity: number;
  rows: WeeklyProductionControlSourceRow[];
  reports: UnknownRecord[];
  deviationNotes: WeeklyProductionControlDeviationNote[];
  deviationPercent: number;
  isDeviation: boolean;
  tone: string;
  note: WeeklyProductionControlDayNote | null;
}

export interface WeeklyProductionControlGroup {
  id: string;
  workCenterLabel: string;
  resourceLabel: string;
  unit: string;
  rows: WeeklyProductionControlSourceRow[];
  reports: UnknownRecord[];
  isStructureRow: boolean;
  sourceKind: string;
  sortIndex: number;
  days: WeeklyProductionControlDay[];
  totalPlan: number;
  totalFact: number;
  totalDefect: number;
  deviationPercent: number;
  deviationCount: number;
  statusTone: string;
}

export interface WeeklyProductionControlModel {
  rows: WeeklyProductionControlSourceRow[];
  groups: WeeklyProductionControlGroup[];
  days: Array<Pick<WeeklyProductionControlDay, "id" | "date" | "end" | "label" | "weekday" | "isWeekend">>;
  weekStart: Date;
  weekEnd: Date;
  weekLabel: string;
  totals: {
    plan: number;
    fact: number;
    defect: number;
    deviationCount: number;
    reportCount: number;
    deviationPercent: number;
  };
  deviationRows: Array<{ group: WeeklyProductionControlGroup; day: WeeklyProductionControlDay; reports: UnknownRecord[] }>;
}

interface WorkingDay extends Omit<WeeklyProductionControlDay, "note"> {
  note: null;
  reportKeys: Set<string>;
}

interface WorkingGroup extends Omit<WeeklyProductionControlGroup, "days" | "totalPlan" | "totalFact" | "totalDefect" | "deviationPercent" | "deviationCount" | "statusTone"> {
  days: WorkingDay[];
  reportKeys: Set<string>;
}

function normalizeSourceRow(value: unknown, index: number): WeeklyProductionControlSourceRow | null {
  const source = asRecord(value);
  const plannedStart = toDate(source.plannedStart);
  const plannedEnd = toDate(source.plannedEnd);
  if (!Number.isFinite(plannedStart.getTime()) || !Number.isFinite(plannedEnd.getTime())) return null;
  return {
    id: asText(source.id, `weekly-row-${index}`),
    plannedStart,
    plannedEnd,
    quantity: asQuantity(source.quantity),
    unit: asText(source.unit, "шт."),
    workCenterId: asText(source.workCenterId),
    parentWorkCenterId: asText(source.parentWorkCenterId),
    workCenterLabel: asText(source.workCenterLabel, "Участок не задан"),
    resourceLabel: asText(source.resourceLabel, "Ресурс не назначен"),
    sourceKind: asText(source.sourceKind),
    sortIndex: Number.isFinite(Number(source.sortIndex)) ? Number(source.sortIndex) : Number.MAX_SAFE_INTEGER,
    isWeeklyControlStructureRow: source.isWeeklyControlStructureRow === true,
    factRecords: asArray(source.factRecords).map(asRecord),
    reports: asArray(source.reports).map(asRecord),
  };
}

function getDeviationPercent(factQuantity = 0, planQuantity = 0): number {
  const plan = Number(planQuantity || 0);
  const fact = Number(factQuantity || 0);
  if (plan <= 0) return fact > 0 ? 100 : 0;
  return ((fact - plan) / plan) * 100;
}

function getDayTone(day: Pick<WeeklyProductionControlDay, "isDeviation" | "factQuantity" | "planQuantity">): string {
  if (day.isDeviation) return day.factQuantity < day.planQuantity ? "risk" : "warning";
  if (day.planQuantity <= 0 && day.factQuantity <= 0) return "neutral";
  if (day.factQuantity >= day.planQuantity && day.planQuantity > 0) return "ok";
  if (day.factQuantity > 0) return "active";
  return "neutral";
}

function getPlanShare(row: WeeklyProductionControlSourceRow, day: Pick<WeeklyProductionControlDay, "id" | "date" | "end">): number {
  if (row.plannedEnd <= row.plannedStart) return toDateInput(row.plannedStart) === day.id ? row.quantity : 0;
  const overlapStart = Math.max(row.plannedStart.getTime(), day.date.getTime());
  const overlapEnd = Math.min(row.plannedEnd.getTime(), day.end.getTime());
  if (overlapEnd <= overlapStart) return 0;
  return row.quantity * ((overlapEnd - overlapStart) / Math.max(1, row.plannedEnd.getTime() - row.plannedStart.getTime()));
}

function isReportedFact(record: UnknownRecord): boolean {
  const status = asText(record.status);
  return asQuantity(record.actualQuantity) > 0
    || asQuantity(record.defectQuantity) > 0
    || Boolean(asText(record.updatedAt || record.factUpdatedAt))
    || Boolean(status && status !== "not_reported");
}

function factDayKey(record: UnknownRecord, row: WeeklyProductionControlSourceRow, weekAnchor: string): string {
  const value = record.updatedAt || record.factUpdatedAt || row.plannedEnd || row.plannedStart || weekAnchor;
  return toDateInput(startOfDay(value));
}

function reportKey(report: UnknownRecord): string {
  return asText(report.id || `${asText(report.rowId)}:${asText(report.taskId)}:${asText(report.createdAt)}:${asText(report.text)}`);
}

function reportDayKey(report: UnknownRecord, row: WeeklyProductionControlSourceRow, weekAnchor: string): string {
  return toDateInput(startOfDay(report.createdAt || row.plannedEnd || row.plannedStart || weekAnchor));
}

function factDeviationNotes(record: UnknownRecord): WeeklyProductionControlDeviationNote[] {
  const notes = asArray(record.deviationNotes).map((value): WeeklyProductionControlDeviationNote | null => {
    const note = asRecord(value);
    const text = asText(note.text || note.comment);
    if (!text) return null;
    return {
      employeeName: note.employeeName,
      employeeLabel: asText(note.employeeLabel),
      text,
      createdAt: asText(note.createdAt || record.updatedAt || record.factUpdatedAt),
      deviationPercent: asNumber(note.deviationPercent),
    };
  }).filter((note): note is WeeklyProductionControlDeviationNote => Boolean(note));
  const singleComment = asText(record.deviationComment || record.deviationReason);
  if (singleComment && !notes.some((note) => note.text === singleComment)) {
    notes.push({
      employeeName: "Рабочее место",
      employeeLabel: "Рабочее место",
      text: singleComment,
      createdAt: asText(record.updatedAt || record.factUpdatedAt),
      deviationPercent: 0,
    });
  }
  return notes;
}

function dayNoteData(day: WeeklyProductionControlDay, unit: string): WeeklyProductionControlDayNote {
  const deviationNote = day.deviationNotes[0] || null;
  const report = day.reports[0] || null;
  const noteTitle = deviationNote
    ? [
      deviationNote.employeeLabel || formatPersonName(deviationNote.employeeName),
      deviationNote.createdAt ? formatDateTimeShort(deviationNote.createdAt) : "",
    ].filter(Boolean).join(" · ")
    : "Заметка отклонения не заполнена";
  return {
    title: `Отклонение ${formatWeeklyControlPercent(day.deviationPercent)}`,
    plan: `План: ${formatWeeklyControlQuantity(day.planQuantity, unit)}`,
    fact: `Факт: ${formatWeeklyControlQuantity(day.factQuantity, unit)}`,
    author: noteTitle,
    text: deviationNote?.text || "При закрытии смены исполнитель должен указать причину, если факт ниже плана больше чем на 5%.",
    extraNotes: day.deviationNotes.length > 1 ? `Еще заметок: ${day.deviationNotes.length - 1}` : "",
    reportText: asText(report?.text),
    extraReports: day.reports.length > 1 ? `Еще report: ${day.reports.length - 1}` : "",
  };
}

function buildStructureRows(source: UnknownRecord): WeeklyProductionControlSourceRow[] {
  const workCenters = asArray(source.workCenters).map(asRecord)
    .filter((center) => center.isActive !== false && center.showInGantt !== false);
  const workCentersById = new Map(workCenters.map((center) => [asText(center.id), center]));
  const resources = asArray(source.resources).map(asRecord)
    .filter((resource) => normalizeLookupText(resource.participatesInPlanning || "yes") !== "no");
  // The retired matrix exposed every work center through the resource catalog
  // before appending concrete equipment. Reconstruct that ordering from the
  // canonical registries themselves; no legacy matrix row is needed.
  const orderedResources: UnknownRecord[] = [
    ...workCenters.map((center): UnknownRecord => ({
      id: center.id,
      name: center.name,
      workCenterId: center.id,
      sourceKind: "structureResource",
    })),
    ...resources,
  ];
  const usesAcceptedStructureOrder = orderedResources.some((resource) => WEEKLY_STRUCTURE_ORDER_INDEX.has(asText(resource.id)));
  const seen = new Set<string>();
  const rows: WeeklyProductionControlSourceRow[] = [];
  const addRow = (row: Omit<WeeklyProductionControlSourceRow, "plannedStart" | "plannedEnd" | "factRecords" | "reports">) => {
    const key = `${row.workCenterId || row.workCenterLabel || "work-center"}::${row.resourceLabel || row.workCenterLabel || "resource"}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      ...row,
      plannedStart: new Date(0),
      plannedEnd: new Date(0),
      factRecords: [],
      reports: [],
    });
  };
  orderedResources.forEach((resource, index) => {
    const workCenterId = asText(resource.workCenterId || resource.id);
    const workCenter = workCentersById.get(workCenterId) || null;
    addRow({
      id: `weekly-control-resource-${asText(resource.id, String(index))}`,
      quantity: 0,
      unit: "шт.",
      workCenterId,
      parentWorkCenterId: asText(workCenter?.parentWorkCenterId),
      workCenterLabel: asText(workCenter?.name || resource.workCenter || resource.name, "Участок не задан"),
      resourceLabel: asText(resource.name || workCenter?.name, "Ресурс не задан"),
      sourceKind: asText(resource.sourceKind, "structureResource"),
      sortIndex: WEEKLY_STRUCTURE_ORDER_INDEX.get(asText(resource.id))
        ?? (usesAcceptedStructureOrder ? WEEKLY_STRUCTURE_ORDER.length + index : index),
      isWeeklyControlStructureRow: true,
    });
  });
  workCenters.forEach((center, index) => {
    addRow({
      id: `weekly-control-work-center-${asText(center.id, String(index))}`,
      quantity: 0,
      unit: "шт.",
      workCenterId: asText(center.id),
      parentWorkCenterId: asText(center.parentWorkCenterId),
      workCenterLabel: asText(center.name, "Участок не задан"),
      resourceLabel: asText(center.name, "Ресурс не задан"),
      sourceKind: "structureWorkCenter",
      sortIndex: orderedResources.length + index,
      isWeeklyControlStructureRow: true,
    });
  });
  return rows;
}

export function buildWeeklyProductionControlReadModel(input: unknown): WeeklyProductionControlModel {
  const source = asRecord(input);
  const generatedAt = toDate(source.generatedAt);
  const requestedWeekStart = toDate(source.weekStart);
  const weekStart = Number.isFinite(requestedWeekStart.getTime())
    ? startOfWeek(requestedWeekStart)
    : startOfWeek(Number.isFinite(generatedAt.getTime()) ? generatedAt : new Date());
  const weekEnd = addMs(weekStart, 7 * DAY_MS);
  const weekAnchor = asText(source.weekAnchor, toDateInput(weekStart));
  const rows = asArray(source.rows)
    .map(normalizeSourceRow)
    .filter((row): row is WeeklyProductionControlSourceRow => Boolean(row))
    .filter((row) => row.plannedStart < weekEnd && row.plannedEnd > weekStart);
  const days = Array.from({ length: 7 }, (_, index) => {
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
  const dayIndexById = new Map(days.map((day, index) => [day.id, index]));
  const groupsByKey = new Map<string, WorkingGroup>();

  const getGroup = (row: WeeklyProductionControlSourceRow): WorkingGroup => {
    const groupKey = `${row.workCenterId || row.workCenterLabel || "work-center"}::${row.resourceLabel || row.workCenterLabel || "resource"}`;
    let group = groupsByKey.get(groupKey);
    if (!group) {
      group = {
        id: groupKey,
        workCenterLabel: row.workCenterLabel || "Участок не задан",
        resourceLabel: row.resourceLabel || "Оборудование не задано",
        unit: row.unit || "шт.",
        rows: [],
        reports: [],
        reportKeys: new Set<string>(),
        isStructureRow: row.isWeeklyControlStructureRow,
        sourceKind: row.sourceKind,
        sortIndex: Number.isFinite(row.sortIndex) ? row.sortIndex : Number.MAX_SAFE_INTEGER,
        days: days.map((day) => ({
          ...day,
          planQuantity: 0,
          factQuantity: 0,
          defectQuantity: 0,
          rows: [],
          reports: [],
          deviationNotes: [],
          reportKeys: new Set<string>(),
          deviationPercent: 0,
          isDeviation: false,
          tone: "neutral",
          note: null,
        })),
      };
      groupsByKey.set(groupKey, group);
    }
    if (row.isWeeklyControlStructureRow) group.isStructureRow = true;
    if (row.sourceKind && !group.sourceKind) group.sourceKind = row.sourceKind;
    if (Number.isFinite(row.sortIndex)) group.sortIndex = Math.min(group.sortIndex, row.sortIndex);
    return group;
  };

  buildStructureRows(source).forEach((row) => getGroup(row));
  rows.forEach((row) => {
    const group = getGroup(row);
    group.rows.push(row);
    group.days.forEach((day) => {
      const planShare = getPlanShare(row, day);
      if (planShare <= 0) return;
      day.planQuantity += planShare;
      day.rows.push(row);
    });
    row.factRecords.filter(isReportedFact).forEach((record) => {
      const dayIndex = dayIndexById.get(factDayKey(record, row, weekAnchor));
      if (typeof dayIndex !== "number") return;
      group.days[dayIndex].factQuantity += asQuantity(record.actualQuantity);
      group.days[dayIndex].defectQuantity += asQuantity(record.defectQuantity);
      group.days[dayIndex].deviationNotes.push(...factDeviationNotes(record));
    });
    row.reports.forEach((report) => {
      const key = reportKey(report);
      if (!key || group.reportKeys.has(key)) return;
      group.reportKeys.add(key);
      group.reports.push(report);
      const dayIndex = dayIndexById.get(reportDayKey(report, row, weekAnchor));
      if (typeof dayIndex === "number" && !group.days[dayIndex].reportKeys.has(key)) {
        group.days[dayIndex].reportKeys.add(key);
        group.days[dayIndex].reports.push(report);
      }
    });
  });

  const groups: WeeklyProductionControlGroup[] = [...groupsByKey.values()].map((workingGroup) => {
    const totalPlan = workingGroup.days.reduce((sum, day) => sum + day.planQuantity, 0);
    const totalFact = workingGroup.days.reduce((sum, day) => sum + day.factQuantity, 0);
    const totalDefect = workingGroup.days.reduce((sum, day) => sum + day.defectQuantity, 0);
    const normalizedDays: WeeklyProductionControlDay[] = workingGroup.days.map(({ reportKeys: _reportKeys, ...day }) => {
      const deviationPercent = getDeviationPercent(day.factQuantity, day.planQuantity);
      const isDeviation = (day.planQuantity > 0 || day.factQuantity > 0) && Math.abs(deviationPercent) > 5;
      return {
        ...day,
        deviationPercent,
        isDeviation,
        tone: getDayTone({
          factQuantity: day.factQuantity,
          planQuantity: day.planQuantity,
          isDeviation,
        }),
      };
    });
    const deviationCount = normalizedDays.filter((day) => day.isDeviation).length;
    const { reportKeys: _reportKeys, ...group } = workingGroup;
    return {
      ...group,
      days: normalizedDays,
      totalPlan,
      totalFact,
      totalDefect,
      deviationPercent: getDeviationPercent(totalFact, totalPlan),
      deviationCount,
      statusTone: deviationCount ? "risk" : totalFact >= totalPlan && totalPlan > 0 ? "ok" : "neutral",
    };
  }).sort((left, right) => (
    right.deviationCount - left.deviationCount
    || right.totalPlan - left.totalPlan
    || left.sortIndex - right.sortIndex
    || left.workCenterLabel.localeCompare(right.workCenterLabel, "ru")
    || left.resourceLabel.localeCompare(right.resourceLabel, "ru")
  ));

  const totals = groups.reduce((accumulator, group) => {
    accumulator.plan += group.totalPlan;
    accumulator.fact += group.totalFact;
    accumulator.defect += group.totalDefect;
    accumulator.deviationCount += group.deviationCount;
    accumulator.reportCount += group.reports.length;
    return accumulator;
  }, { plan: 0, fact: 0, defect: 0, deviationCount: 0, reportCount: 0, deviationPercent: 0 });
  totals.deviationPercent = getDeviationPercent(totals.fact, totals.plan);

  const deviationRows = groups.flatMap((group) => group.days
    .filter((day) => day.isDeviation)
    .map((day) => ({ group, day, reports: day.reports.length ? day.reports : group.reports })));
  const groupsWithInteraction = groups.map((group) => ({
    ...group,
    days: group.days.map((day) => ({
      ...day,
      note: day.isDeviation || day.deviationNotes.length || day.reports.length ? dayNoteData(day, group.unit) : null,
    })),
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
