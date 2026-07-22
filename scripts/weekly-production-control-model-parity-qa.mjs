import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { build } from "esbuild";

import { DEFAULT_PRODUCTION_WORK_CENTERS } from "../src/production_structure_default_work_centers.js";
import { PRODUCTION_STRUCTURE_MATRIX_ROWS } from "./fixtures/production_structure_matrix_data.js";
import { migrateLegacySystemDomains } from "../src/modules/system_domains/service.js";
import {
  createSystemDomainCanonicalWorkCenterIdMap,
  projectSystemDomainResources,
  projectSystemDomainWorkCenters,
} from "../src/modules/system_domains/runtime_adapter.js";
import { buildWeeklyPlanningPeriodRowsFromCompact } from "../src/modules/weekly_production_control/planning_period_rows.js";
import { buildWeeklyProductionControlReadInput } from "../src/modules/weekly_production_control/production_read_input.js";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-weekly-model-parity-"));
const typedOutput = join(temporaryRoot, "production-read-model.mjs");

function startOfWeek(value) {
  const source = new Date(value);
  const date = new Date(source.getFullYear(), source.getMonth(), source.getDate());
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date;
}

function addMs(value, milliseconds) {
  return new Date(new Date(value).getTime() + milliseconds);
}

function toDateInput(value) {
  const date = new Date(value);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
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

  const typedModel = buildWeeklyProductionControlReadModel(productionInput);
  assert.deepEqual(typedModel.rows.map((row) => row.id), ["slot-a", "slot-b"],
    "strict typed Weekly model must retain the bounded owner rows");
  assert.equal(typedModel.totals.plan, 300, "strict typed Weekly model must retain total plan quantity");
  assert.equal(typedModel.totals.fact, 190, "strict typed Weekly model must retain accepted quantity after defects");
  assert.equal(typedModel.totals.defect, 15, "strict typed Weekly model must retain defect quantity");
  assert.equal(typedModel.totals.reportCount, 1, "strict typed Weekly model must retain linked issue reports");
  const ownerPreparedNote = typedModel.groups
    .flatMap((group) => group.days)
    .find((day) => day.deviationNotes.some((note) => note.text === "Остановка линии"))
    ?.note;
  assert.equal(ownerPreparedNote?.text, "Остановка линии", "typed Weekly note must use the owner-prepared deviation reason");
  assert.equal(ownerPreparedNote?.reportText, "Проверить подачу", "typed Weekly note must retain its linked issue report");

  const emptyInput = buildWeeklyProductionControlReadInput({ weekStart, periodRows: [], workCenters, resources });
  const emptyTyped = buildWeeklyProductionControlReadModel(emptyInput);
  assert.equal(emptyTyped.rows.length, 0);
  assert.equal(emptyTyped.groups.length, 6, "structure-only work centers and resources must remain visible without plan rows");

  // Literal Pilot .25 regression fixture captured before the typed runtime
  // consolidation. System Domains owns matrix IDs while the bounded Planning
  // transport retains runtime IDs. Losing this bridge produced 31 visible
  // rows on .26: six raw-ID plan groups plus the canonical 25-row structure.
  const pilotWeekStart = new Date(2026, 6, 20);
  const { domains, report: domainMigrationReport } = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS });
  assert.equal(domainMigrationReport.canActivate, true, "canonical System Domains fixture must be activation-ready");
  const domainWorkCenters = projectSystemDomainWorkCenters(domains, []);
  const domainResources = projectSystemDomainResources(domains, [], []);
  const canonicalIdByRuntimeId = createSystemDomainCanonicalWorkCenterIdMap(domains, DEFAULT_PRODUCTION_WORK_CENTERS);
  const domainWorkCenterById = new Map(domainWorkCenters.map((center) => [center.id, center]));
  const livePlannedGroups = [
    { runtimeId: "D5", quantities: [144, 144, 144, 141, 144, 144, 144] },
    { runtimeId: "D9", quantities: [96, 96, 96, 96, 96, 96, 265] },
    // The live row total is exactly 3000 while its six independently rendered
    // day shares round to 608/393/533/468/458/543 (their displayed sum is
    // 3003). Half-unit shares reproduce that accepted display contract.
    { runtimeId: "D3_UW", quantities: [607.5, 392.5, 532.5, 467.5, 457.5, 542.5, 0] },
    { runtimeId: "D3_AOI", quantities: [470, 480, 470, 480, 165, 0, 0] },
    { runtimeId: "D4", quantities: [0, 0, 0, 138, 288, 288, 286] },
    { runtimeId: "D3", quantities: [610, 0, 0, 0, 0, 0, 0] },
  ];
  const compactPilotRows = livePlannedGroups.flatMap(({ runtimeId, quantities }) => quantities.flatMap((plannedQuantity, dayIndex) => {
    if (!plannedQuantity) return [];
    const plannedStart = addMs(pilotWeekStart, dayIndex * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000);
    return [{
      id: `pilot-25-${runtimeId}-${dayIndex}`,
      plannedStart: plannedStart.toISOString(),
      plannedEnd: addMs(plannedStart, 4 * 60 * 60 * 1000).toISOString(),
      quantity: plannedQuantity,
      unit: "шт.",
      workCenterId: runtimeId,
      sourceWorkCenterId: runtimeId,
    }];
  }));
  const projectPilotRows = (mapWorkCenterId) => buildWeeklyPlanningPeriodRowsFromCompact(compactPilotRows, {
    toDate: (value) => new Date(value),
    mapWorkCenterId,
    getWorkCenter: (id) => domainWorkCenterById.get(String(id || "")) || null,
    getResource: () => null,
  });
  const buildPilotModel = (mapWorkCenterId) => buildWeeklyProductionControlReadModel(buildWeeklyProductionControlReadInput({
    generatedAt: pilotWeekStart,
    weekStart: pilotWeekStart,
    weekAnchor: toDateInput(pilotWeekStart),
    periodRows: projectPilotRows(mapWorkCenterId),
    workCenters: domainWorkCenters,
    resources: domainResources,
  }));
  const brokenPilotModel = buildPilotModel((value) => String(value || ""));
  assert.equal(brokenPilotModel.groups.length, 31, "identity mapping must reproduce the six duplicate raw-ID groups seen on Pilot .26");

  const fixedPilotModel = buildPilotModel((value) => canonicalIdByRuntimeId.get(String(value || "")) || String(value || ""));
  const visibleGroupLabel = (group) => group.resourceLabel === group.workCenterLabel
    ? group.workCenterLabel
    : `${group.workCenterLabel} ${group.resourceLabel}`;
  const expectedFirstSix = [
    { label: "Отдел ручного монтажа", total: 1005, days: [144, 144, 144, 141, 144, 144, 144] },
    { label: "Слесарный участок 1", total: 841, days: [96, 96, 96, 96, 96, 96, 265] },
    { label: "Участок отмывки", total: 3000, days: [608, 393, 533, 468, 458, 543, 0] },
    { label: "Участок оптической инспекции", total: 2065, days: [470, 480, 470, 480, 165, 0, 0] },
    { label: "Отдел технического контроля", total: 1000, days: [0, 0, 0, 138, 288, 288, 286] },
    { label: "Отдел поверхностного монтажа", total: 610, days: [610, 0, 0, 0, 0, 0, 0] },
  ];
  const expectedRemainingLabels = [
    "Участок ручного монтажа 1",
    "Участок ручного монтажа 2",
    "Участок ручного монтажа 3",
    "Участок ручного монтажа 4",
    "Участок поверхностного монтажа 1",
    "Участок поверхностного монтажа 2",
    "Участок ремонта поверхностного монтажа",
    "Отдел нанесения влагозащитных покрытий",
    "Отдел программной подготовки изделий",
    "Сервисный отдел",
    "Склад",
    "Участок упаковки и маркировки изделий",
    "Технологический отдел",
    "Участок поверхностного монтажа 1 S2 + L2",
    "Участок поверхностного монтажа 2 S2",
    "Участок оптической инспекции pemtron",
    "Участок отмывки УЗ 3+1",
    "Участок отмывки Струйная отмывка",
    "Отдел нанесения влагозащитных покрытий noName",
  ];
  assert.equal(fixedPilotModel.groups.length, 25, "canonical identity bridge must restore the exact Pilot .25 row count");
  assert.equal(fixedPilotModel.days.length + 4, 11, "Weekly table contract must retain the exact Pilot .25 header count");
  assert.deepEqual(fixedPilotModel.groups.slice(0, 6).map((group) => ({
    label: visibleGroupLabel(group),
    total: Math.round(group.totalPlan),
    days: group.days.map((day) => Math.round(day.planQuantity)),
  })), expectedFirstSix, "first six groups must retain the literal Pilot .25 order and plan quantities");
  assert.deepEqual(fixedPilotModel.groups.slice(6).map(visibleGroupLabel), expectedRemainingLabels,
    "zero-plan structure groups must retain the literal Pilot .25 order and labels");
  assert.deepEqual(fixedPilotModel.groups.slice(-6).map((group) => ({
    workCenterLabel: group.workCenterLabel,
    resourceLabel: group.resourceLabel,
  })), [
    { workCenterLabel: "Участок поверхностного монтажа 1", resourceLabel: "S2 + L2" },
    { workCenterLabel: "Участок поверхностного монтажа 2", resourceLabel: "S2" },
    { workCenterLabel: "Участок оптической инспекции", resourceLabel: "pemtron" },
    { workCenterLabel: "Участок отмывки", resourceLabel: "УЗ 3+1" },
    { workCenterLabel: "Участок отмывки", resourceLabel: "Струйная отмывка" },
    { workCenterLabel: "Отдел нанесения влагозащитных покрытий", resourceLabel: "noName" },
  ], "equipment rows must retain the exact Pilot .25 strong/small label split");
  console.log("Weekly Production Control production model contract QA: OK");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
