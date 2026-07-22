import { buildAuthPickerProductionModel, isAuthPickerProductionInput } from "./production-model";

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const number = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;

export interface AuthPickerPerson { id: string; name: string; role: string; department: string; personKind: string; canDistribute: boolean; canExecute: boolean; }
export interface AuthPickerUnit { id: string; name: string; caption: string; employeeCount: number; people: AuthPickerPerson[]; }
export interface AuthPickerDepartment { id: string; name: string; caption: string; employeeCount: number; directPeople: AuthPickerPerson[]; units: AuthPickerUnit[]; }
export type AuthPickerElevationTarget = "nomenclature" | "planning" | "production-structure";
export interface AuthPickerModel { departments: AuthPickerDepartment[]; employeeCount: number; canEnterPin: boolean; attemptsLeft: number; result: string; forcedPersonId: string; elevation: boolean; elevationTarget: AuthPickerElevationTarget; }

const adaptPerson = (value: unknown, index: number): AuthPickerPerson => { const item = record(value); return { id: text(item.id, `person-${index + 1}`), name: text(item.name, "Сотрудник"), role: text(item.role, "Роль не задана"), department: text(item.department), personKind: text(item.personKind, "employee"), canDistribute: Boolean(item.canDistribute), canExecute: item.canExecute !== false }; };

export function adaptAuthPickerPayload(payload: unknown): AuthPickerModel {
  const root = record(payload);
  const productionModel = record(root.productionModel);
  if (Object.keys(productionModel).length || isAuthPickerProductionInput(root)) {
    const productionInput = Object.keys(productionModel).length ? { ...root, ...productionModel } : root;
    return buildAuthPickerProductionModel(productionInput, root.capabilities, root.authState);
  }
  const model = record(root.model || payload); const capabilities = record(root.capabilities); const authState = record(root.authState);
  const rawElevationTarget = text(model.elevationTarget);
  const elevationTarget: AuthPickerElevationTarget = rawElevationTarget === "planning" || rawElevationTarget === "production-structure" ? rawElevationTarget : "nomenclature";
  const departments = list(model.departments).map((raw, departmentIndex): AuthPickerDepartment => {
    const department = record(raw);
    return { id: text(department.id, `department-${departmentIndex + 1}`), name: text(department.name, "Отдел"), caption: text(department.caption), employeeCount: number(department.employeeCount), directPeople: list(department.directPeople).map(adaptPerson), units: list(department.units).map((unitRaw, unitIndex) => { const unit = record(unitRaw); return { id: text(unit.id, `unit-${unitIndex + 1}`), name: text(unit.name, "Участок"), caption: text(unit.caption), employeeCount: number(unit.employeeCount), people: list(unit.people).map(adaptPerson) }; }) };
  }).filter((department) => department.id);
  return {
    departments,
    employeeCount: new Set(departments.flatMap((department) => [...department.directPeople, ...department.units.flatMap((unit) => unit.people)]).map((person) => person.id)).size,
    canEnterPin: Boolean(capabilities.pinEntry),
    attemptsLeft: Math.max(0, number(authState.attemptsLeft)),
    result: text(authState.result),
    forcedPersonId: text(model.forcedPersonId),
    elevation: model.elevation === true,
    elevationTarget,
  };
}
