import { STRUCTURE_REGISTRY_DEFINITIONS, type StructureEmployee, type StructureEmployeesReadModel, type StructureRegistryId } from "./adapter";

export const STRUCTURE_EMPLOYEE_READ_COLUMNS = ["Сотрудник", "Табельный номер", "Назначение", "Статус"] as const;

export interface StructureRegistryOption {
  id: StructureRegistryId;
  label: string;
  description: string;
  count: number;
  action: "employees" | "legacy";
}

export function buildStructureRegistryOptions(model: StructureEmployeesReadModel): StructureRegistryOption[] {
  return STRUCTURE_REGISTRY_DEFINITIONS.map((definition) => ({
    ...definition,
    count: model.counts[definition.id],
    action: definition.id === "employees" ? "employees" as const : "legacy" as const,
  }));
}

export function resolveVisibleStructureEmployee(items: StructureEmployee[], selectedId: string): StructureEmployee | null {
  return items.find((item) => item.id === selectedId) ?? items[0] ?? null;
}

export function getStructureEmployeeReadCells(item: StructureEmployee): string[] {
  return [item.displayName, item.personnelNumber, item.employmentLabel, item.statusLabel];
}
