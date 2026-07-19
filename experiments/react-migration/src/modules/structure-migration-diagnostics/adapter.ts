import { formatStructurePersonName, STRUCTURE_REGISTRY_DEFINITIONS, type StructureRegistryId } from "../structure-employees/adapter";
interface SourceRowDto { id?: unknown; cells?: unknown }
export interface MigrationDiagnosticRow { id: string; code: string; rowType: string; structure: string; parent: string; activity: string; activityTone: "warning" | "neutral" }
export interface MigrationIssueGroup { id: "orphans" | "duplicates" | "unmatchedMatrixOverrideKeys" | "ignoredRows"; title: string; emptyTitle: string; items: string[] }
export interface StructureMigrationDiagnosticsReadModel { canActivate: boolean; metrics: { sourceRows: number; employees: number; orgUnits: number; positions: number; orphans: number; duplicates: number }; rows: MigrationDiagnosticRow[]; sourceFieldCount: number; issues: MigrationIssueGroup[]; counts: Record<StructureRegistryId, number> }
const text = (value: unknown) => String(value ?? "").trim();
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const entityRows = (value: unknown): Record<string, unknown>[] => array(value).filter((entry) => entry && typeof entry === "object") as Record<string, unknown>[];
const count = (value: unknown) => Math.max(0, Math.trunc(Number(value) || 0));
export function adaptStructureMigrationDiagnostics(payload: unknown): StructureMigrationDiagnosticsReadModel {
  const root = record(payload); const item = Object.keys(record(root.item)).length ? record(root.item) : root; const registries = Object.keys(record(item.registries)).length ? record(item.registries) : item; const report = record(root.migrationReport || item.migrationReport);
  const sourceRows = array(root.legacyMatrixRows || item.legacyMatrixRows) as SourceRowDto[]; const sourceCounts = record(report.sourceCounts); const targetCounts = record(report.targetCounts);
  const rows = sourceRows.map((row, index) => { const cells = record(row.cells); const id = text(row.id || cells["ID / код"]) || `source-row-${index + 1}`; const rawStructure = text(cells["Структура"]); const activity = text(cells["Активность строки"] || cells["Статус активности"]) || "не задано"; return { id, code: text(cells["ID / код"] || row.id) || "—", rowType: text(cells["Тип строки"]) || "—", structure: formatStructurePersonName(rawStructure, rawStructure || "—"), parent: text(cells["Родитель"]) || "—", activity, activityTone: activity === "архив" ? "warning" as const : "neutral" as const }; });
  const issueDefinitions = [
    ["orphans", "Потерянные связи", "Потерянных связей нет"], ["duplicates", "Дубликаты", "Дубликатов нет"],
    ["unmatchedMatrixOverrideKeys", "Неприменённые overrides", "Все overrides сопоставлены"], ["ignoredRows", "Игнорированные legacy-строки", "Игнорированных строк нет"],
  ] as const;
  const issues = issueDefinitions.map(([id, title, emptyTitle]) => ({ id, title, emptyTitle, items: array(report[id]).map((entry) => JSON.stringify(entry)) }));
  return { canActivate: report.canActivate === true, metrics: { sourceRows: count(sourceCounts.matrixRows ?? rows.length), employees: count(targetCounts.employees), orgUnits: count(targetCounts.orgUnits), positions: count(targetCounts.positions), orphans: array(report.orphans).length, duplicates: array(report.duplicates).length }, rows, sourceFieldCount: array(root.legacyMatrixColumns || item.legacyMatrixColumns).length, issues, counts: Object.fromEntries(STRUCTURE_REGISTRY_DEFINITIONS.map((definition) => [definition.id, definition.id === "migrationDiagnostics" ? rows.length : entityRows(registries[definition.id]).length])) as Record<StructureRegistryId, number> };
}
