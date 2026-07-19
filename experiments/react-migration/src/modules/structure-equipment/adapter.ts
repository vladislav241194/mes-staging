import { STRUCTURE_REGISTRY_DEFINITIONS, type StructureRegistryId } from "../structure-employees/adapter";

interface EntityDto { id?: unknown; name?: unknown; displayName?: unknown; label?: unknown; code?: unknown; workCenterId?: unknown; quantity?: unknown; scheduleTemplateId?: unknown; isActive?: unknown }
export interface StructureEquipmentItem { id: string; name: string; code: string; workCenterLabel: string; quantityLabel: string; scheduleLabel: string; statusLabel: string; statusTone: "success" | "warning" }
export interface StructureEquipmentReadModel { equipment: StructureEquipmentItem[]; counts: Record<StructureRegistryId, number> }
const text = (value: unknown) => String(value ?? "").trim();
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const rows = (value: unknown): EntityDto[] => Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") as EntityDto[] : [];
const label = (entity?: EntityDto) => text(entity?.displayName || entity?.name || entity?.label || entity?.code || entity?.id) || "Без названия";
const index = (entries: EntityDto[]) => new Map(entries.flatMap((entry) => text(entry.id) ? [[text(entry.id), entry] as const] : []));
const referenceLabel = (id: string, entries: Map<string, EntityDto>) => !id ? "—" : entries.has(id) ? label(entries.get(id)) : `${id} · связь не найдена`;

export function adaptStructureEquipment(payload: unknown): StructureEquipmentReadModel {
  const payloadRecord = record(payload); const item = Object.keys(record(payloadRecord.item)).length ? record(payloadRecord.item) : payloadRecord; const registries = Object.keys(record(item.registries)).length ? record(item.registries) : item;
  const workCenterIndex = index(rows(registries.workCenters)); const scheduleIndex = index(rows(registries.scheduleTemplates));
  const equipment = rows(registries.equipment).flatMap((entry): StructureEquipmentItem[] => {
    const id = text(entry.id); const name = text(entry.name || entry.displayName); if (!id || !name) return [];
    const quantity = Number(entry.quantity);
    return [{ id, name, code: text(entry.code) || "—", workCenterLabel: referenceLabel(text(entry.workCenterId), workCenterIndex), quantityLabel: Number.isFinite(quantity) ? new Intl.NumberFormat("ru-RU").format(quantity) : "0", scheduleLabel: referenceLabel(text(entry.scheduleTemplateId), scheduleIndex), statusLabel: entry.isActive === false ? "архив" : "активно", statusTone: entry.isActive === false ? "warning" : "success" }];
  }).sort((left, right) => left.name.localeCompare(right.name, "ru") || left.id.localeCompare(right.id, "en"));
  const diagnosticsCount = Math.max(0, Math.trunc(Number(payloadRecord.migrationDiagnosticsCount ?? item.migrationDiagnosticsCount ?? (Array.isArray(payloadRecord.legacyMatrixRows) ? payloadRecord.legacyMatrixRows.length : 0)) || 0));
  return { equipment, counts: Object.fromEntries(STRUCTURE_REGISTRY_DEFINITIONS.map((definition) => [definition.id, definition.id === "migrationDiagnostics" ? diagnosticsCount : rows(registries[definition.id]).length])) as Record<StructureRegistryId, number> };
}
