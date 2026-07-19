type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord => value && typeof value === "object" ? value as UnknownRecord : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const asText = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const asNumber = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;

export interface WeeklyControlDay {
  id: string;
  label: string;
  weekday: string;
  isWeekend: boolean;
  planQuantity: number;
  factQuantity: number;
  deviationPercent: number;
  isDeviation: boolean;
  tone: string;
  noteCount: number;
  reportCount: number;
  note: WeeklyControlDayNote | null;
}

export interface WeeklyControlDayNote {
  title: string;
  plan: string;
  fact: string;
  author: string;
  text: string;
  extraNotes: string;
  reportText: string;
  extraReports: string;
}

export interface WeeklyControlGroup {
  id: string;
  workCenterLabel: string;
  resourceLabel: string;
  unit: string;
  days: WeeklyControlDay[];
  totalPlan: number;
  totalFact: number;
  deviationPercent: number;
  deviationCount: number;
  reportCount: number;
  statusTone: "success" | "warning" | "neutral";
}

export const formatWeeklyControlQuantity = (value: number, unit = "шт."): string => `${Math.round(value).toLocaleString("ru-RU")} ${unit || "шт."}`;
export const formatWeeklyControlPercent = (value: number): string => {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
};

function adaptDay(value: unknown, fallback: UnknownRecord = {}): WeeklyControlDay | null {
  const source = asRecord(value);
  const noteSource = asRecord(source.note);
  const id = asText(source.id, asText(fallback.id));
  if (!id) return null;
  return {
    id,
    label: asText(source.label, asText(fallback.label, id)),
    weekday: asText(source.weekday, asText(fallback.weekday)),
    isWeekend: source.isWeekend === true || fallback.isWeekend === true,
    planQuantity: asNumber(source.planQuantity),
    factQuantity: asNumber(source.factQuantity),
    deviationPercent: asNumber(source.deviationPercent),
    isDeviation: source.isDeviation === true,
    tone: asText(source.tone, "neutral"),
    noteCount: asArray(source.deviationNotes).length,
    reportCount: asArray(source.reports).length,
    note: asText(noteSource.title) ? {
      title: asText(noteSource.title),
      plan: asText(noteSource.plan),
      fact: asText(noteSource.fact),
      author: asText(noteSource.author, "Заметка отклонения"),
      text: asText(noteSource.text, "Заметка не заполнена."),
      extraNotes: asText(noteSource.extraNotes),
      reportText: asText(noteSource.reportText),
      extraReports: asText(noteSource.extraReports),
    } : null,
  };
}

export function adaptWeeklyProductionControl(payload: unknown) {
  const root = asRecord(payload);
  const source = asRecord(root.model || payload);
  const dayDefinitions = asArray(source.days).map(asRecord);
  const days = dayDefinitions.map((day) => adaptDay(day, day)).filter(Boolean) as WeeklyControlDay[];
  const groups = asArray(source.groups).map((value, index): WeeklyControlGroup | null => {
    const group = asRecord(value);
    const id = asText(group.id, `weekly-group-${index}`);
    const groupDays = asArray(group.days).map((day, dayIndex) => adaptDay(day, dayDefinitions[dayIndex] || {})).filter(Boolean) as WeeklyControlDay[];
    const deviationCount = asNumber(group.deviationCount) || groupDays.filter((day) => day.isDeviation).length;
    const statusTone = deviationCount ? "warning" : asNumber(group.totalPlan) > 0 && asNumber(group.totalFact) >= asNumber(group.totalPlan) ? "success" : "neutral";
    return {
      id,
      workCenterLabel: asText(group.workCenterLabel, "Участок не задан"),
      resourceLabel: asText(group.resourceLabel, "Оборудование не задано"),
      unit: asText(group.unit, "шт."),
      days: groupDays,
      totalPlan: asNumber(group.totalPlan),
      totalFact: asNumber(group.totalFact),
      deviationPercent: asNumber(group.deviationPercent),
      deviationCount,
      reportCount: asArray(group.reports).length,
      statusTone,
    };
  }).filter(Boolean) as WeeklyControlGroup[];
  const totalsSource = asRecord(source.totals);
  const totals = {
    plan: asNumber(totalsSource.plan),
    fact: asNumber(totalsSource.fact),
    deviationPercent: asNumber(totalsSource.deviationPercent),
    deviationCount: asNumber(totalsSource.deviationCount),
    reportCount: asNumber(totalsSource.reportCount),
  };
  return {
    weekLabel: asText(source.weekLabel, "Неделя не задана"),
    days,
    groups,
    totals,
    operationCount: asArray(source.rows).length,
    canActivate: days.length === 7,
  };
}
