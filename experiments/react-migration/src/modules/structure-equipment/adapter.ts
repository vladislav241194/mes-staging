import { STRUCTURE_REGISTRY_DEFINITIONS, type StructureRegistryId } from "../structure-employees/adapter";

interface EntityDto { id?: unknown; name?: unknown; displayName?: unknown; label?: unknown; code?: unknown; orgUnitId?: unknown; workCenterId?: unknown; quantity?: unknown; scheduleTemplateId?: unknown; isActive?: unknown }
export interface StructureEquipmentItem { id: string; name: string; code: string; orgUnitId: string; workCenterId: string; workCenterLabel: string; quantity: number; quantityLabel: string; scheduleTemplateId: string; scheduleLabel: string; isActive: boolean; statusLabel: string; statusTone: "success" | "warning" }
export interface StructureEquipmentOption { id: string; label: string }
export interface StructureEquipmentReadModel { equipment: StructureEquipmentItem[]; counts: Record<StructureRegistryId, number>; orgUnits: StructureEquipmentOption[]; workCenters: StructureEquipmentOption[]; scheduleTemplates: StructureEquipmentOption[]; canCreateEdit: boolean }
const text = (value: unknown) => String(value ?? "").trim();
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const rows = (value: unknown): EntityDto[] => Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") as EntityDto[] : [];
const label = (entity?: EntityDto) => text(entity?.displayName || entity?.name || entity?.label || entity?.code || entity?.id) || "Без названия";
const index = (entries: EntityDto[]) => new Map(entries.flatMap((entry) => text(entry.id) ? [[text(entry.id), entry] as const] : []));
const referenceLabel = (id: string, entries: Map<string, EntityDto>) => !id ? "—" : entries.has(id) ? label(entries.get(id)) : `${id} · связь не найдена`;
const options = (entries: EntityDto[]): StructureEquipmentOption[] => entries.flatMap((entry) => text(entry.id) ? [{ id: text(entry.id), label: label(entry) }] : []).sort((left, right) => left.label.localeCompare(right.label, "ru") || left.id.localeCompare(right.id, "en"));

export function adaptStructureEquipment(payload: unknown): StructureEquipmentReadModel {
  const payloadRecord = record(payload); const item = Object.keys(record(payloadRecord.item)).length ? record(payloadRecord.item) : payloadRecord; const registries = Object.keys(record(item.registries)).length ? record(item.registries) : item;
  const orgUnitRows = rows(registries.orgUnits); const workCenterRows = rows(registries.workCenters); const scheduleRows = rows(registries.scheduleTemplates); const workCenterIndex = index(workCenterRows); const scheduleIndex = index(scheduleRows);
  const equipment = rows(registries.equipment).flatMap((entry): StructureEquipmentItem[] => {
    const id = text(entry.id); const name = text(entry.name || entry.displayName); if (!id || !name) return [];
    const quantity = Number(entry.quantity);
    const orgUnitId = text(entry.orgUnitId); const workCenterId = text(entry.workCenterId); const scheduleTemplateId = text(entry.scheduleTemplateId); const normalizedQuantity = Number.isFinite(quantity) ? quantity : 0;
    return [{ id, name, code: text(entry.code) || "—", orgUnitId, workCenterId, workCenterLabel: referenceLabel(workCenterId, workCenterIndex), quantity: normalizedQuantity, quantityLabel: new Intl.NumberFormat("ru-RU").format(normalizedQuantity), scheduleTemplateId, scheduleLabel: referenceLabel(scheduleTemplateId, scheduleIndex), isActive: entry.isActive !== false, statusLabel: entry.isActive === false ? "архив" : "активно", statusTone: entry.isActive === false ? "warning" : "success" }];
  }).sort((left, right) => left.name.localeCompare(right.name, "ru") || left.id.localeCompare(right.id, "en"));
  const diagnosticsCount = Math.max(0, Math.trunc(Number(payloadRecord.migrationDiagnosticsCount ?? item.migrationDiagnosticsCount ?? (Array.isArray(payloadRecord.legacyMatrixRows) ? payloadRecord.legacyMatrixRows.length : 0)) || 0));
  return { equipment, counts: Object.fromEntries(STRUCTURE_REGISTRY_DEFINITIONS.map((definition) => [definition.id, definition.id === "migrationDiagnostics" ? diagnosticsCount : rows(registries[definition.id]).length])) as Record<StructureRegistryId, number>, orgUnits: options(orgUnitRows), workCenters: options(workCenterRows), scheduleTemplates: options(scheduleRows), canCreateEdit: record(payloadRecord.capabilities).createEdit === true };
}
