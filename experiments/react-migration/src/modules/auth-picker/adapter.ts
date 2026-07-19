const record = (value: unknown): Record<string, any> => value && typeof value === "object" ? value as Record<string, any> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const number = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;

export interface AuthPickerPerson { id: string; name: string; role: string; department: string; personKind: string; canDistribute: boolean; canExecute: boolean; }
export interface AuthPickerUnit { id: string; name: string; caption: string; employeeCount: number; people: AuthPickerPerson[]; }
export interface AuthPickerDepartment { id: string; name: string; caption: string; employeeCount: number; directPeople: AuthPickerPerson[]; units: AuthPickerUnit[]; }

const adaptPerson = (value: unknown, index: number): AuthPickerPerson => { const item = record(value); return { id: text(item.id, `person-${index + 1}`), name: text(item.name, "Сотрудник"), role: text(item.role, "Роль не задана"), department: text(item.department), personKind: text(item.personKind, "employee"), canDistribute: Boolean(item.canDistribute), canExecute: item.canExecute !== false }; };

export function adaptAuthPickerPayload(payload: unknown) {
  const root = record(payload); const model = record(root.model || payload);
  const departments = list(model.departments).map((raw, departmentIndex): AuthPickerDepartment => {
    const department = record(raw);
    return { id: text(department.id, `department-${departmentIndex + 1}`), name: text(department.name, "Отдел"), caption: text(department.caption), employeeCount: number(department.employeeCount), directPeople: list(department.directPeople).map(adaptPerson), units: list(department.units).map((unitRaw, unitIndex) => { const unit = record(unitRaw); return { id: text(unit.id, `unit-${unitIndex + 1}`), name: text(unit.name, "Участок"), caption: text(unit.caption), employeeCount: number(unit.employeeCount), people: list(unit.people).map(adaptPerson) }; }) };
  }).filter((department) => department.id);
  return { departments, employeeCount: new Set(departments.flatMap((department) => [...department.directPeople, ...department.units.flatMap((unit) => unit.people)]).map((person) => person.id)).size };
}
