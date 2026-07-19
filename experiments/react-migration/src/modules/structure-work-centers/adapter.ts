import { STRUCTURE_REGISTRY_DEFINITIONS, type StructureRegistryId } from "../structure-employees/adapter";

interface EntityDto { id?: unknown; name?: unknown; displayName?: unknown; code?: unknown; orgUnitId?: unknown; parentWorkCenterId?: unknown; participatesInPlanning?: unknown; showInGantt?: unknown; isActive?: unknown }
export interface StructureWorkCenter { id: string; name: string; code: string; orgUnitLabel: string; parentWorkCenterLabel: string; planningLabel: string; planningTone: "success" | "neutral"; ganttLabel: string; statusLabel: string; statusTone: "success" | "warning" }
export interface StructureWorkCentersReadModel { workCenters: StructureWorkCenter[]; counts: Record<StructureRegistryId, number> }
const text = (value: unknown) => String(value ?? "").trim();
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const rows = (value: unknown): EntityDto[] => Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") as EntityDto[] : [];
const label = (entity?: EntityDto) => text(entity?.displayName || entity?.name || entity?.id) || "Без названия";
const referenceLabel = (id: string, index: Map<string, EntityDto>) => !id ? "—" : index.has(id) ? label(index.get(id)) : `${id} · связь не найдена`;

export function adaptStructureWorkCenters(payload: unknown): StructureWorkCentersReadModel {
  const payloadRecord = record(payload); const item = Object.keys(record(payloadRecord.item)).length ? record(payloadRecord.item) : payloadRecord; const registries = Object.keys(record(item.registries)).length ? record(item.registries) : item;
  const orgUnits = rows(registries.orgUnits); const workCenterRows = rows(registries.workCenters);
  const index = (entries: EntityDto[]) => new Map(entries.flatMap((entry) => text(entry.id) ? [[text(entry.id), entry] as const] : []));
  const orgUnitIndex = index(orgUnits); const workCenterIndex = index(workCenterRows);
  const workCenters = workCenterRows.flatMap((entry): StructureWorkCenter[] => {
    const id = text(entry.id); const name = text(entry.name || entry.displayName); if (!id || !name) return [];
    const participatesInPlanning = entry.participatesInPlanning !== false;
    return [{ id, name, code: text(entry.code) || "—", orgUnitLabel: referenceLabel(text(entry.orgUnitId), orgUnitIndex), parentWorkCenterLabel: referenceLabel(text(entry.parentWorkCenterId), workCenterIndex), planningLabel: participatesInPlanning ? "активно" : "архив", planningTone: participatesInPlanning ? "success" : "warning", ganttLabel: entry.showInGantt === false ? "скрыт" : "показывается", statusLabel: entry.isActive === false ? "архив" : "активно", statusTone: entry.isActive === false ? "warning" : "success" }];
  }).sort((left, right) => left.name.localeCompare(right.name, "ru") || left.id.localeCompare(right.id, "en"));
  const diagnosticsCount = Math.max(0, Math.trunc(Number(payloadRecord.migrationDiagnosticsCount ?? item.migrationDiagnosticsCount ?? (Array.isArray(payloadRecord.legacyMatrixRows) ? payloadRecord.legacyMatrixRows.length : 0)) || 0));
  return { workCenters, counts: Object.fromEntries(STRUCTURE_REGISTRY_DEFINITIONS.map((definition) => [definition.id, definition.id === "migrationDiagnostics" ? diagnosticsCount : rows(registries[definition.id]).length])) as Record<StructureRegistryId, number> };
}
