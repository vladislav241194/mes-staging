import { formatStructurePersonName, STRUCTURE_REGISTRY_DEFINITIONS, type StructureRegistryId } from "../structure-employees/adapter";
interface EntityDto { id?: unknown; displayName?: unknown; name?: unknown; subjectEmployeeId?: unknown; mode?: unknown; targetEmployeeIds?: unknown; updatedAt?: unknown; isActive?: unknown }
export interface StructureResponsibilityPolicy { id: string; subjectEmployeeId: string; subjectEmployeeLabel: string; mode: string; modeLabel: string; modeTone: "warning" | "neutral"; targetEmployeeIds: string[]; targetEmployeesLabel: string; updatedAtLabel: string; isActive: boolean; statusLabel: string; statusTone: "success" | "warning" }
export interface StructureResponsibilityEmployeeOption { id: string; label: string }
export interface StructureResponsibilityPoliciesReadModel { policies: StructureResponsibilityPolicy[]; counts: Record<StructureRegistryId, number>; employees: StructureResponsibilityEmployeeOption[]; canCreateEdit: boolean; canArchive: boolean; canElevate?: boolean; writeUnavailableReason?: string }
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
    const isActive = entry.isActive !== false;
    return [{ id, subjectEmployeeId, subjectEmployeeLabel: reference(subjectEmployeeId), mode, modeLabel: MODE_LABELS[mode] || mode || "Не задан", modeTone: mode === "manual" ? "warning" : "neutral", targetEmployeeIds: targetIds, targetEmployeesLabel: targetLabels.length ? `${targetLabels.join(", ")}${tail}` : "—", updatedAtLabel: text(entry.updatedAt) || "—", isActive, statusLabel: isActive ? "активно" : "архив", statusTone: isActive ? "success" : "warning" }];
  }).sort((left, right) => left.subjectEmployeeLabel.localeCompare(right.subjectEmployeeLabel, "ru") || left.id.localeCompare(right.id, "en"));
  const diagnosticsCount = Math.max(0, Math.trunc(Number(payloadRecord.migrationDiagnosticsCount ?? item.migrationDiagnosticsCount ?? (Array.isArray(payloadRecord.legacyMatrixRows) ? payloadRecord.legacyMatrixRows.length : 0)) || 0));
  const capabilities = record(payloadRecord.capabilities);
  return { policies, counts: Object.fromEntries(STRUCTURE_REGISTRY_DEFINITIONS.map((definition) => [definition.id, definition.id === "migrationDiagnostics" ? diagnosticsCount : rows(registries[definition.id]).length])) as Record<StructureRegistryId, number>, employees: employees.flatMap((employee) => text(employee.id) ? [{ id: text(employee.id), label: label(employee) }] : []).sort((left, right) => left.label.localeCompare(right.label, "ru") || left.id.localeCompare(right.id, "en")), canCreateEdit: capabilities.createEdit === true, canArchive: capabilities.archive === true, canElevate: capabilities.employeeElevation === true, writeUnavailableReason: text(capabilities.writeUnavailableReason) };
}
