import { STRUCTURE_REGISTRY_DEFINITIONS } from "../structure-employees/adapter";
import type { StructureWorkCenter, StructureWorkCentersReadModel } from "./adapter";
export const STRUCTURE_WORK_CENTER_READ_COLUMNS = ["Рабочий центр", "Подразделение", "Родитель", "Планирование", "Статус"] as const;
export function buildWorkCenterRegistryOptions(model: StructureWorkCentersReadModel) { return STRUCTURE_REGISTRY_DEFINITIONS.map((definition) => ({ ...definition, count: model.counts[definition.id], action: definition.id === "workCenters" ? "workCenters" as const : "navigate" as const })); }
export function resolveVisibleWorkCenter(items: StructureWorkCenter[], selectedId: string) { return items.find((item) => item.id === selectedId) || items[0] || null; }
