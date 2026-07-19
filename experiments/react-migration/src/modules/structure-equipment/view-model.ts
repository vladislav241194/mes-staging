import { STRUCTURE_REGISTRY_DEFINITIONS } from "../structure-employees/adapter";
import type { StructureEquipmentItem, StructureEquipmentReadModel } from "./adapter";
export const STRUCTURE_EQUIPMENT_READ_COLUMNS = ["Оборудование", "Рабочий центр", "Количество", "График", "Статус"] as const;
export function buildEquipmentRegistryOptions(model: StructureEquipmentReadModel) { return STRUCTURE_REGISTRY_DEFINITIONS.map((definition) => ({ ...definition, count: model.counts[definition.id], action: definition.id === "equipment" ? "equipment" as const : "legacy" as const })); }
export function resolveVisibleEquipment(items: StructureEquipmentItem[], selectedId: string) { return items.find((item) => item.id === selectedId) || items[0] || null; }
