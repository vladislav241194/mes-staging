import { STRUCTURE_REGISTRY_DEFINITIONS, type StructureRegistryId } from "../structure-employees/adapter";

interface EntityDto { id?: unknown; name?: unknown; displayName?: unknown; code?: unknown; kind?: unknown; orgUnitId?: unknown; workCenterId?: unknown; defaultScheduleTemplateId?: unknown; isActive?: unknown }
export interface StructurePosition { id: string; name: string; code: string; kind: string; kindLabel: string; orgUnitId: string; orgUnitLabel: string; workCenterId: string; workCenterLabel: string; scheduleTemplateId: string; scheduleTemplateLabel: string; statusLabel: string; statusTone: "success" | "warning"; isActive: boolean }
export interface StructurePositionOption { id: string; label: string }
export interface StructurePositionsReadModel { positions: StructurePosition[]; counts: Record<StructureRegistryId, number>; orgUnits: StructurePositionOption[]; workCenters: StructurePositionOption[]; scheduleTemplates: StructurePositionOption[]; canCreateEdit: boolean; canArchive: boolean }

const KIND_LABELS: Record<string, string> = { manager: "Руководитель", supervisor: "Мастер", worker: "Исполнитель" };
const text = (value: unknown) => String(value ?? "").trim();
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const rows = (value: unknown): EntityDto[] => Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") as EntityDto[] : [];
const label = (entity?: EntityDto) => text(entity?.displayName || entity?.name || entity?.id) || "Без названия";
const index = (items: EntityDto[]) => new Map(items.flatMap((item) => text(item.id) ? [[text(item.id), item] as const] : []));
const reference = (items: Map<string, EntityDto>, id: string) => !id ? "—" : items.has(id) ? label(items.get(id)) : `${id} · связь не найдена`;
const options = (items: EntityDto[]): StructurePositionOption[] => items.flatMap((item): StructurePositionOption[] => text(item.id) ? [{ id: text(item.id), label: label(item) }] : []).sort((left, right) => left.label.localeCompare(right.label, "ru") || left.id.localeCompare(right.id, "en"));

export function adaptStructurePositions(payload: unknown): StructurePositionsReadModel {
  const payloadRecord = record(payload);
  const item = Object.keys(record(payloadRecord.item)).length ? record(payloadRecord.item) : payloadRecord;
  const registries = Object.keys(record(item.registries)).length ? record(item.registries) : item;
  const orgUnits = rows(registries.orgUnits); const workCenters = rows(registries.workCenters); const schedules = rows(registries.scheduleTemplates); const positionRows = rows(registries.positions);
  const orgUnitIndex = index(orgUnits); const workCenterIndex = index(workCenters); const scheduleIndex = index(schedules);
  const positions = positionRows.flatMap((position): StructurePosition[] => {
    const id = text(position.id); const name = text(position.name || position.displayName);
    if (!id || !name) return [];
    const kind = text(position.kind); const orgUnitId = text(position.orgUnitId); const workCenterId = text(position.workCenterId); const scheduleTemplateId = text(position.defaultScheduleTemplateId);
    return [{ id, name, code: text(position.code) || "—", kind, kindLabel: KIND_LABELS[kind] || kind || "—", orgUnitId, orgUnitLabel: reference(orgUnitIndex, orgUnitId), workCenterId, workCenterLabel: reference(workCenterIndex, workCenterId), scheduleTemplateId, scheduleTemplateLabel: reference(scheduleIndex, scheduleTemplateId), statusLabel: position.isActive === false ? "архив" : "активно", statusTone: position.isActive === false ? "warning" : "success", isActive: position.isActive !== false }];
  }).sort((left, right) => left.name.localeCompare(right.name, "ru") || left.id.localeCompare(right.id, "en"));
  const diagnosticsCount = Math.max(0, Math.trunc(Number(payloadRecord.migrationDiagnosticsCount ?? item.migrationDiagnosticsCount ?? (Array.isArray(payloadRecord.legacyMatrixRows) ? payloadRecord.legacyMatrixRows.length : 0)) || 0));
  return {
    positions,
    counts: Object.fromEntries(STRUCTURE_REGISTRY_DEFINITIONS.map((definition) => [definition.id, definition.id === "migrationDiagnostics" ? diagnosticsCount : rows(registries[definition.id]).length])) as Record<StructureRegistryId, number>,
    orgUnits: options(orgUnits),
    workCenters: options(workCenters),
    scheduleTemplates: options(schedules),
    canCreateEdit: record(payloadRecord.capabilities).createEdit === true,
    canArchive: record(payloadRecord.capabilities).archive === true,
  };
}
