import { STRUCTURE_REGISTRY_DEFINITIONS } from "../structure-employees/adapter";
import type { StructureOrgUnit, StructureOrgUnitsReadModel } from "./adapter";
export const STRUCTURE_ORG_UNIT_READ_COLUMNS = ["Подразделение", "Тип", "Родитель", "Код", "Статус"] as const;
export function buildOrgUnitRegistryOptions(model: StructureOrgUnitsReadModel) { return STRUCTURE_REGISTRY_DEFINITIONS.map((definition) => ({ ...definition, count: model.counts[definition.id], action: definition.id === "orgUnits" ? "orgUnits" as const : "navigate" as const })); }
export function resolveVisibleOrgUnit(items: StructureOrgUnit[], selectedId: string) { return items.find((item) => item.id === selectedId) || items[0] || null; }
