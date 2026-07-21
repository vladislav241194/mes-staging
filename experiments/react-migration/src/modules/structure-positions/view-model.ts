import { STRUCTURE_REGISTRY_DEFINITIONS, type StructureRegistryId } from "../structure-employees/adapter";
import type { StructurePosition, StructurePositionsReadModel } from "./adapter";

export const STRUCTURE_POSITION_READ_COLUMNS = ["Должность", "Категория", "Подразделение", "Рабочий центр", "Статус"] as const;
export function buildPositionRegistryOptions(model: StructurePositionsReadModel) { return STRUCTURE_REGISTRY_DEFINITIONS.map((definition) => ({ ...definition, count: model.counts[definition.id], action: definition.id === "positions" ? "positions" as const : "navigate" as const })); }
export function resolveVisiblePosition(items: StructurePosition[], selectedId: string) { return items.find((item) => item.id === selectedId) || items[0] || null; }
export function getPositionReadCells(item: StructurePosition) { return [`${item.name} ${item.id}`, item.kindLabel, item.orgUnitLabel, item.workCenterLabel, item.statusLabel]; }
export type PositionRegistryId = StructureRegistryId;
