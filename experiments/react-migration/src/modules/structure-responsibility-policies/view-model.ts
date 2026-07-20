import { STRUCTURE_REGISTRY_DEFINITIONS } from "../structure-employees/adapter";
import type { StructureResponsibilityPolicy, StructureResponsibilityPoliciesReadModel } from "./adapter";
export const STRUCTURE_RESPONSIBILITY_POLICY_READ_COLUMNS = ["Мастер", "Режим", "Разрешённые сотрудники", "Обновлено", "Статус"] as const;
export function buildResponsibilityPolicyRegistryOptions(model: StructureResponsibilityPoliciesReadModel) { return STRUCTURE_REGISTRY_DEFINITIONS.map((definition) => ({ ...definition, count: model.counts[definition.id], action: definition.id === "responsibilityPolicies" ? "responsibilityPolicies" as const : "legacy" as const })); }
export function resolveVisibleResponsibilityPolicy(items: StructureResponsibilityPolicy[], selectedId: string) { return items.find((item) => item.id === selectedId) || items[0] || null; }
