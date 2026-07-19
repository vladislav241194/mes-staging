import { STRUCTURE_REGISTRY_DEFINITIONS, type StructureRegistryId } from "../structure-employees/adapter";

interface EntityDto { id?: unknown; name?: unknown; displayName?: unknown; code?: unknown; kind?: unknown; parentOrgUnitId?: unknown; isActive?: unknown }
export interface StructureOrgUnit { id: string; name: string; code: string; kind: string; kindLabel: string; parentOrgUnitId: string; parentOrgUnitLabel: string; isActive: boolean; statusLabel: string; statusTone: "success" | "warning" }
export interface StructureOrgUnitsReadModel { orgUnits: StructureOrgUnit[]; counts: Record<StructureRegistryId, number>; canCreateEdit: boolean }
const KIND_LABELS: Record<string, string> = { department: "Отдел", section: "Участок" };
const text = (value: unknown) => String(value ?? "").trim();
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const rows = (value: unknown): EntityDto[] => Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") as EntityDto[] : [];
const label = (entity?: EntityDto) => text(entity?.displayName || entity?.name || entity?.id) || "Без названия";

export function adaptStructureOrgUnits(payload: unknown): StructureOrgUnitsReadModel {
  const payloadRecord = record(payload); const item = Object.keys(record(payloadRecord.item)).length ? record(payloadRecord.item) : payloadRecord; const registries = Object.keys(record(item.registries)).length ? record(item.registries) : item;
  const orgUnitRows = rows(registries.orgUnits); const orgUnitIndex = new Map(orgUnitRows.flatMap((entry) => text(entry.id) ? [[text(entry.id), entry] as const] : []));
  const orgUnits = orgUnitRows.flatMap((entry): StructureOrgUnit[] => {
    const id = text(entry.id); const name = text(entry.name || entry.displayName); if (!id || !name) return [];
    const kind = text(entry.kind); const parentOrgUnitId = text(entry.parentOrgUnitId); const parent = parentOrgUnitId ? orgUnitIndex.get(parentOrgUnitId) : undefined;
    return [{ id, name, code: text(entry.code) || "—", kind, kindLabel: KIND_LABELS[kind] || kind || "—", parentOrgUnitId, parentOrgUnitLabel: !parentOrgUnitId ? "—" : parent ? label(parent) : `${parentOrgUnitId} · связь не найдена`, isActive: entry.isActive !== false, statusLabel: entry.isActive === false ? "архив" : "активно", statusTone: entry.isActive === false ? "warning" : "success" }];
  }).sort((left, right) => left.name.localeCompare(right.name, "ru") || left.id.localeCompare(right.id, "en"));
  const diagnosticsCount = Math.max(0, Math.trunc(Number(payloadRecord.migrationDiagnosticsCount ?? item.migrationDiagnosticsCount ?? (Array.isArray(payloadRecord.legacyMatrixRows) ? payloadRecord.legacyMatrixRows.length : 0)) || 0));
  return { orgUnits, counts: Object.fromEntries(STRUCTURE_REGISTRY_DEFINITIONS.map((definition) => [definition.id, definition.id === "migrationDiagnostics" ? diagnosticsCount : rows(registries[definition.id]).length])) as Record<StructureRegistryId, number>, canCreateEdit: record(payloadRecord.capabilities).createEdit === true };
}
