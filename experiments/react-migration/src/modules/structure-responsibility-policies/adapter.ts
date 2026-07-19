import { formatStructurePersonName, STRUCTURE_REGISTRY_DEFINITIONS, type StructureRegistryId } from "../structure-employees/adapter";
interface EntityDto { id?: unknown; displayName?: unknown; name?: unknown; subjectEmployeeId?: unknown; mode?: unknown; targetEmployeeIds?: unknown; updatedAt?: unknown }
export interface StructureResponsibilityPolicy { id: string; subjectEmployeeLabel: string; modeLabel: string; modeTone: "warning" | "neutral"; targetEmployeesLabel: string; updatedAtLabel: string }
export interface StructureResponsibilityPoliciesReadModel { policies: StructureResponsibilityPolicy[]; counts: Record<StructureRegistryId, number> }
const MODE_LABELS: Record<string, string> = { department: "Подразделение", workCenter: "Рабочий центр", manual: "Ручной список", all: "Все сотрудники" };
const text = (value: unknown) => String(value ?? "").trim();
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const rows = (value: unknown): EntityDto[] => Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") as EntityDto[] : [];
const label = (entity?: EntityDto) => { const raw = text(entity?.displayName || entity?.name || entity?.id); return formatStructurePersonName(raw, raw || "Без названия"); };
export function adaptStructureResponsibilityPolicies(payload: unknown): StructureResponsibilityPoliciesReadModel {
  const payloadRecord = record(payload); const item = Object.keys(record(payloadRecord.item)).length ? record(payloadRecord.item) : payloadRecord; const registries = Object.keys(record(item.registries)).length ? record(item.registries) : item;
  const employees = rows(registries.employees); const employeeIndex = new Map(employees.flatMap((entry) => text(entry.id) ? [[text(entry.id), entry] as const] : []));
  const reference = (id: string) => !id ? "—" : employeeIndex.has(id) ? label(employeeIndex.get(id)) : `${id} · связь не найдена`;
  const policies = rows(registries.responsibilityPolicies).flatMap((entry): StructureResponsibilityPolicy[] => {
    const id = text(entry.id); const subjectEmployeeId = text(entry.subjectEmployeeId); if (!id || !subjectEmployeeId) return [];
    const mode = text(entry.mode); const targetIds = Array.isArray(entry.targetEmployeeIds) ? entry.targetEmployeeIds.map(text).filter(Boolean) : [];
    const targetLabels = targetIds.slice(0, 3).map(reference); const tail = targetIds.length > 3 ? ` +${targetIds.length - 3}` : "";
    return [{ id, subjectEmployeeLabel: reference(subjectEmployeeId), modeLabel: MODE_LABELS[mode] || mode || "Не задан", modeTone: mode === "manual" ? "warning" : "neutral", targetEmployeesLabel: targetLabels.length ? `${targetLabels.join(", ")}${tail}` : "—", updatedAtLabel: text(entry.updatedAt) || "—" }];
  }).sort((left, right) => left.subjectEmployeeLabel.localeCompare(right.subjectEmployeeLabel, "ru") || left.id.localeCompare(right.id, "en"));
  const diagnosticsCount = Math.max(0, Math.trunc(Number(payloadRecord.migrationDiagnosticsCount ?? item.migrationDiagnosticsCount ?? (Array.isArray(payloadRecord.legacyMatrixRows) ? payloadRecord.legacyMatrixRows.length : 0)) || 0));
  return { policies, counts: Object.fromEntries(STRUCTURE_REGISTRY_DEFINITIONS.map((definition) => [definition.id, definition.id === "migrationDiagnostics" ? diagnosticsCount : rows(registries[definition.id]).length])) as Record<StructureRegistryId, number> };
}
