import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { build } from "esbuild";

import { buildWeeklyProductionControlReadInput } from "../src/modules/weekly_production_control/production_read_input.js";
import { createWeeklyProductionControlModule } from "../src/modules/weekly_production_control/render.js";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-weekly-model-parity-"));
const typedOutput = join(temporaryRoot, "production-read-model.mjs");

function startOfDay(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(value) {
  const date = startOfDay(value);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date;
}

function addMs(value, milliseconds) {
  return new Date(new Date(value).getTime() + milliseconds);
}

function quantity(value) {
  return Math.max(0, Number(value || 0) || 0);
}

function toDateInput(value) {
  const date = new Date(value);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(new Date(value));
}

function formatDateTimeShort(value) {
  return new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function linkedEntries(source = {}, slotId = "") {
  const prefix = `${slotId}::`;
  return Object.entries(source).filter(([key, record]) => (
    key === slotId
    || key.startsWith(prefix)
    || record?.slotId === slotId
    || String(record?.slotId || "").startsWith(prefix)
  ));
}

function normalizeProjection(model) {
  const number = (value) => Math.round(Number(value || 0) * 1_000_000) / 1_000_000;
  const day = (value) => ({
    id: value.id,
    label: value.label,
    weekday: value.weekday,
    isWeekend: value.isWeekend,
    planQuantity: number(value.planQuantity),
    factQuantity: number(value.factQuantity),
    defectQuantity: number(value.defectQuantity),
    deviationPercent: number(value.deviationPercent),
    isDeviation: value.isDeviation,
    tone: value.tone,
    rows: value.rows.map((row) => row.id),
    reports: value.reports.map((report) => report.id),
    deviationNotes: value.deviationNotes.map((note) => ({
      employeeName: String(note.employeeName || ""),
      text: note.text,
      createdAt: note.createdAt,
      deviationPercent: number(note.deviationPercent),
    })),
    note: value.note,
  });
  const group = (value) => ({
    id: value.id,
    workCenterLabel: value.workCenterLabel,
    resourceLabel: value.resourceLabel,
    unit: value.unit,
    rows: value.rows.map((row) => row.id),
    reports: value.reports.map((report) => report.id),
    isStructureRow: value.isStructureRow,
    sourceKind: value.sourceKind,
    sortIndex: value.sortIndex,
    totalPlan: number(value.totalPlan),
    totalFact: number(value.totalFact),
    totalDefect: number(value.totalDefect),
    deviationPercent: number(value.deviationPercent),
    deviationCount: value.deviationCount,
    statusTone: value.statusTone,
    days: value.days.map(day),
  });
  return {
    weekStart: model.weekStart.toISOString(),
    weekEnd: model.weekEnd.toISOString(),
    weekLabel: model.weekLabel,
    days: model.days.map((value) => ({
      id: value.id,
      date: value.date.toISOString(),
      end: value.end.toISOString(),
      label: value.label,
      weekday: value.weekday,
      isWeekend: value.isWeekend,
    })),
    rows: model.rows.map((row) => row.id),
    groups: model.groups.map(group),
    totals: Object.fromEntries(Object.entries(model.totals).map(([key, value]) => [key, number(value)])),
    deviationRows: model.deviationRows.map((value) => ({
      groupId: value.group.id,
      dayId: value.day.id,
      reports: value.reports.map((report) => report.id),
    })),
  };
}

try {
  await build({
    entryPoints: [join(repositoryRoot, "experiments/react-migration/src/modules/weekly-production-control/production-read-model.ts")],
    outfile: typedOutput,
    bundle: true,
    format: "esm",
    platform: "node",
    logLevel: "silent",
  });
  const { buildWeeklyProductionControlReadModel } = await import(`${pathToFileURL(typedOutput).href}?qa=${Date.now()}`);

  const weekStart = startOfWeek(new Date());
  const mondayStart = addMs(weekStart, 8 * 60 * 60 * 1000);
  const mondayEnd = addMs(weekStart, 12 * 60 * 60 * 1000);
  const spanningEnd = addMs(weekStart, 2 * 24 * 60 * 60 * 1000);
  const periodRows = [
    {
      id: "slot-a",
      slot: { id: "slot-a" },
      plannedStart: mondayStart,
      plannedEnd: mondayEnd,
      quantity: 100,
      unit: "шт.",
      workCenterId: "wc-a",
      workCenterLabel: "Линия A",
      resourceLabel: "Принтер A",
      sourceKind: "planning-period-weekly-api",
    },
    {
      id: "slot-b",
      slot: { id: "slot-b" },
      plannedStart: weekStart,
      plannedEnd: spanningEnd,
      quantity: 200,
      unit: "шт.",
      workCenterId: "wc-b",
      workCenterLabel: "Линия B",
      resourceLabel: "Принтер B",
      sourceKind: "planning-period-weekly-api",
    },
  ];
  const boardAssignments = {
    "slot-b": {
      slotId: "slot-b",
      sourceRowId: "slot-b",
      sheetContract: { rowId: "slot-b", sourceSlotId: "slot-b" },
    },
  };
  const boardFacts = {
    "slot-a": {
      slotId: "slot-a",
      actualQuantity: 85,
      defectQuantity: 5,
      status: "accepted",
      deviationNotes: [{
        employeeName: "Иван Иванов",
        text: "Остановка линии",
        createdAt: addMs(mondayStart, 5 * 60 * 60 * 1000).toISOString(),
        deviationPercent: -20,
      }],
      updatedAt: addMs(mondayStart, 5 * 60 * 60 * 1000).toISOString(),
    },
  };
  const authSessionFactDrafts = {
    "slot-b::task": {
      actualQuantity: 120,
      defectQuantity: 10,
      deviationComment: "Недостаток материала",
      updatedAt: addMs(weekStart, 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000).toISOString(),
    },
  };
  const issueReports = {
    "slot-a": [{
      id: "report-a",
      rowId: "slot-a",
      taskId: "slot-a::task",
      text: "Проверить подачу",
      createdAt: addMs(mondayStart, 5 * 60 * 60 * 1000).toISOString(),
    }],
  };
  const workCenters = [
    { id: "wc-a", name: "Линия A", isActive: true, showInGantt: true },
    { id: "wc-b", name: "Линия B", isActive: true, showInGantt: true },
    { id: "wc-empty", name: "Линия без плана", isActive: true, showInGantt: true },
  ];
  const resources = [
    { id: "resource-a", name: "Принтер A", workCenterId: "wc-a", participatesInPlanning: "yes" },
    { id: "resource-b", name: "Принтер B", workCenterId: "wc-b", participatesInPlanning: "yes" },
    { id: "resource-empty", name: "Ресурс без плана", workCenterId: "wc-empty", participatesInPlanning: "yes" },
  ];
  const productionInput = buildWeeklyProductionControlReadInput({
    generatedAt: new Date(),
    weekStart,
    weekAnchor: toDateInput(weekStart),
    periodRows,
    workCenters,
    resources,
    planningAssignments: {},
    boardAssignments,
    boardFacts,
    authSessionFactDrafts,
    issueReports,
  });
  assert.equal(productionInput.rows[0].factRecords.length, 1, "raw DTO must attach board facts to the bounded planning row");
  assert.equal(productionInput.rows[0].reports.length, 1, "raw DTO must attach issue reports without a renderer helper");
  assert.equal(productionInput.rows[1].factRecords.length, 1, "raw DTO must attach authenticated-session facts when no board fact exists");

  const factsByRow = Object.fromEntries(productionInput.rows.map((row) => [row.id, row.factRecords]));
  const reportsByRow = Object.fromEntries(productionInput.rows.map((row) => [row.id, row.reports]));
  const legacy = createWeeklyProductionControlModule({
    DAY_MS: 24 * 60 * 60 * 1000,
    addMs,
    formatDate,
    formatDateTimeShort,
    formatShiftWorkOrderPersonName: (value) => String(value || "Исполнитель"),
    formatShortDate,
    getAuthSessionFactEntriesForGanttSlot: () => [],
    getGanttLinkedRecordEntries: (_source, slotId) => (factsByRow[slotId] || []).map((record, index) => [`${slotId}::${index}`, record]),
    getPlanningState: () => ({ shiftMasterAssignments: {} }),
    getPlanningTableSlotRows: () => periodRows,
    getProductionStructureMatrixRuntimeOverrides: () => ({}),
    getProductionStructureResources: () => [
      ...workCenters.map((center) => ({ id: center.id, name: center.name, workCenterId: center.id, participatesInPlanning: "yes", sourceKind: "structureResource" })),
      ...resources,
    ],
    getProductionStructureWorkCenters: () => workCenters,
    getShiftMasterAssignmentsForGanttSlot: () => [],
    getShiftMasterBoardFactEntriesForGanttSlot: () => [],
    getShiftWorkOrderIssueReports: (target) => reportsByRow[target?.id || target] || [],
    getUi: () => ({ weeklyProductionControlWeekAnchor: toDateInput(weekStart) }),
    getWeekNumber: () => 1,
    isGanttFactRecordReported: () => true,
    mapLegacyWorkCenterId: (value) => String(value || ""),
    normalizeLookupText: (value) => String(value || "").toLocaleLowerCase("ru-RU"),
    normalizePlainRecord: (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {},
    normalizeShiftMasterBoardQuantity: quantity,
    normalizeShiftMasterFactQuantity: quantity,
    startOfDay,
    startOfWeek: () => new Date(weekStart),
    toDate: (value) => new Date(value),
    toDateInput,
  });

  const legacyModel = legacy.getWeeklyProductionControlModel();
  const typedModel = buildWeeklyProductionControlReadModel(productionInput);
  assert.deepEqual(normalizeProjection(typedModel), normalizeProjection(legacyModel),
    "strict typed Weekly model must retain the exact legacy read-model projection");

  const emptyInput = buildWeeklyProductionControlReadInput({ weekStart, periodRows: [], workCenters, resources });
  const emptyTyped = buildWeeklyProductionControlReadModel(emptyInput);
  assert.equal(emptyTyped.rows.length, 0);
  assert.equal(emptyTyped.groups.length, 6, "structure-only work centers and resources must remain visible without plan rows");
  console.log("Weekly Production Control model parity QA: OK");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
