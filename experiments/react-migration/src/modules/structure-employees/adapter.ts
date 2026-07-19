export const STRUCTURE_REGISTRY_DEFINITIONS = [
  { id: "orgUnits", label: "Подразделения", description: "Отделы и участки в единой иерархии" },
  { id: "workCenters", label: "Рабочие центры", description: "Производственные центры и их связь с оргструктурой" },
  { id: "positions", label: "Должности", description: "Производственные должности отдельно от ролей доступа" },
  { id: "employees", label: "Сотрудники", description: "Личности сотрудников; должность и подразделение задаются назначением" },
  { id: "equipment", label: "Оборудование", description: "Оборудование и его производственная принадлежность" },
  { id: "responsibilityPolicies", label: "Зоны ответственности", description: "Кого мастер может распределять в Мастерской" },
  { id: "migrationDiagnostics", label: "Диагностика миграции", description: "Read-only контроль переноса legacy Excel-матрицы" },
] as const;

export type StructureRegistryId = typeof STRUCTURE_REGISTRY_DEFINITIONS[number]["id"];

interface RegistryEntityDto {
  id?: unknown;
  name?: unknown;
  displayName?: unknown;
  personnelNumber?: unknown;
  employeeId?: unknown;
  positionId?: unknown;
  orgUnitId?: unknown;
  workCenterId?: unknown;
  isPrimary?: unknown;
  isActive?: unknown;
  validFrom?: unknown;
  validTo?: unknown;
}

export interface StructureEmployee {
  id: string;
  displayName: string;
  fullName: string;
  personnelNumber: string;
  positionId: string;
  positionLabel: string;
  orgUnitId: string;
  orgUnitLabel: string;
  workCenterId: string;
  workCenterLabel: string;
  employmentLabel: string;
  validFrom: string;
  validTo: string;
  statusLabel: string;
  statusTone: "success" | "warning";
  isActive: boolean;
}

export interface StructureReferenceOption {
  id: string;
  label: string;
}

export interface StructureEmployeesReadModel {
  employees: StructureEmployee[];
  counts: Record<StructureRegistryId, number>;
  positions: StructureReferenceOption[];
  orgUnits: StructureReferenceOption[];
  workCenters: StructureReferenceOption[];
  canCreateEdit: boolean;
  canArchive: boolean;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function rows(value: unknown): RegistryEntityDto[] {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") as RegistryEntityDto[] : [];
}

function isRussianPersonNamePart(value: string): boolean {
  return /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?$/.test(value.trim());
}

function isRussianPatronymicPart(value: string): boolean {
  return isRussianPersonNamePart(value) && /(вич|ич|вна|чна|инич|инична|оглы|кызы)$/i.test(value.trim());
}

export function formatStructurePersonName(value: unknown, fallback = ""): string {
  const parts = text(value).replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (!parts.length) return fallback;
  if (parts.length < 3) return parts.join(" ");
  const [lastName, firstName, middleName] = parts;
  if (!isRussianPersonNamePart(lastName) || !isRussianPersonNamePart(firstName) || !isRussianPatronymicPart(middleName)) return parts.join(" ");
  return `${lastName} ${firstName}`;
}

function entityLabel(entity: RegistryEntityDto | undefined, fallback = "Без названия"): string {
  const label = text(entity?.displayName || entity?.name || entity?.id);
  return formatStructurePersonName(label, label || fallback);
}

function referenceLabel(index: Map<string, RegistryEntityDto>, id: string): string {
  if (!id) return "—";
  const entity = index.get(id);
  return entity ? entityLabel(entity) : `${id} · связь не найдена`;
}

function indexById(items: RegistryEntityDto[]): Map<string, RegistryEntityDto> {
  return new Map(items.flatMap((item) => text(item.id) ? [[text(item.id), item] as const] : []));
}

function referenceOptions(items: RegistryEntityDto[]): StructureReferenceOption[] {
  return items.flatMap((item): StructureReferenceOption[] => {
    const id = text(item.id);
    if (!id) return [];
    return [{ id, label: entityLabel(item, id) }];
  }).sort((left, right) => left.label.localeCompare(right.label, "ru") || left.id.localeCompare(right.id, "en"));
}

function getRegistries(payload: unknown): { registries: Record<string, unknown>; diagnosticsCount: number } {
  const payloadRecord = record(payload);
  const item = Object.keys(record(payloadRecord.item)).length ? record(payloadRecord.item) : payloadRecord;
  const registries = Object.keys(record(item.registries)).length ? record(item.registries) : item;
  const diagnosticsCount = Math.max(0, Math.trunc(Number(
    payloadRecord.migrationDiagnosticsCount
      ?? item.migrationDiagnosticsCount
      ?? (Array.isArray(payloadRecord.legacyMatrixRows) ? payloadRecord.legacyMatrixRows.length : 0),
  ) || 0));
  return { registries, diagnosticsCount };
}

export function adaptStructureEmployees(payload: unknown): StructureEmployeesReadModel {
  const { registries, diagnosticsCount } = getRegistries(payload);
  const capabilities = record(record(payload).capabilities);
  const orgUnits = rows(registries.orgUnits);
  const workCenters = rows(registries.workCenters);
  const positions = rows(registries.positions);
  const employeeRows = rows(registries.employees);
  const assignments = rows(registries.employmentAssignments).sort((left, right) => text(left.id).localeCompare(text(right.id), "en"));
  const orgUnitIndex = indexById(orgUnits);
  const workCenterIndex = indexById(workCenters);
  const positionIndex = indexById(positions);

  const employees = employeeRows.flatMap((employee): StructureEmployee[] => {
    const id = text(employee.id);
    const fullName = text(employee.displayName || employee.name);
    if (!id || !fullName) return [];
    const assignment = assignments.find((item) => text(item.employeeId) === id && item.isPrimary !== false)
      || assignments.find((item) => text(item.employeeId) === id)
      || {};
    const positionId = text(assignment.positionId);
    const orgUnitId = text(assignment.orgUnitId);
    const workCenterId = text(assignment.workCenterId);
    const positionLabel = referenceLabel(positionIndex, positionId);
    const orgUnitLabel = referenceLabel(orgUnitIndex, orgUnitId);
    const employmentParts = [positionLabel, orgUnitLabel].filter((value) => value !== "—");
    return [{
      id,
      displayName: formatStructurePersonName(fullName, fullName),
      fullName,
      personnelNumber: text(employee.personnelNumber) || "—",
      positionId,
      positionLabel,
      orgUnitId,
      orgUnitLabel,
      workCenterId,
      workCenterLabel: referenceLabel(workCenterIndex, workCenterId),
      employmentLabel: employmentParts.join(" · ") || (Object.keys(assignment).length ? "Назначение без связей" : "Назначение не задано"),
      validFrom: text(assignment.validFrom) || "—",
      validTo: text(assignment.validTo) || "—",
      statusLabel: employee.isActive === false ? "архив" : "активно",
      statusTone: employee.isActive === false ? "warning" : "success",
      isActive: employee.isActive !== false,
    }];
  }).sort((left, right) => left.displayName.localeCompare(right.displayName, "ru") || left.id.localeCompare(right.id, "en"));

  return {
    employees,
    counts: {
      orgUnits: orgUnits.length,
      workCenters: workCenters.length,
      positions: positions.length,
      employees: employeeRows.length,
      equipment: rows(registries.equipment).length,
      responsibilityPolicies: rows(registries.responsibilityPolicies).length,
      migrationDiagnostics: diagnosticsCount,
    },
    positions: referenceOptions(positions),
    orgUnits: referenceOptions(orgUnits),
    workCenters: referenceOptions(workCenters),
    canCreateEdit: capabilities.createEdit === true,
    canArchive: capabilities.archive === true,
  };
}
