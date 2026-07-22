import { buildEmployeeDesktopProductionModel } from "./production-model";

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value)
  ? value as UnknownRecord
  : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const number = (value: unknown): number => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const personName = (value: unknown, fallback = "Исполнитель"): string => {
  const parts = text(value).split(/\s+/).filter(Boolean);
  return (parts.length > 2 ? parts.slice(0, 2) : parts).join(" ") || fallback;
};

export interface EmployeeDesktopTask {
  id: string;
  rowId: string;
  employeeId: string;
  employeeName: string;
  operationName: string;
  workCenterLabel: string;
  orderLabel: string;
  routePartLabel: string;
  documentNumber: string;
  assignedQuantity: number;
  actualQuantity: number;
  defectQuantity: number;
  goodQuantity: number;
  unit: string;
  laborLabel: string;
  status: string;
  isStarted: boolean;
  isDone: boolean;
  previousOperation: string;
  nextOperation: string;
  routeNodes: EmployeeDesktopRouteNode[];
  reportCount: number;
  photoCount: number;
}

export interface EmployeeDesktopRouteNode {
  label: string;
  operationName: string;
  workCenterLabel: string;
  routePartLabel: string;
  current: boolean;
}

export interface EmployeeDesktopPerson {
  id: string;
  name: string;
}

export interface EmployeeDesktopModel {
  tasks: EmployeeDesktopTask[];
  selectedTask: EmployeeDesktopTask | null;
  people: EmployeeDesktopPerson[];
  viewedPersonId: string;
  personName: string;
  canSwitchPerson: boolean;
  canReturnToUserSelection: boolean;
  canStartTask: boolean;
  canSaveFact: boolean;
  canSaveReport: boolean;
  assignedQuantity: number;
  goodQuantity: number;
  activeCount: number;
  doneCount: number;
}

function adaptTask(value: unknown, reportSummaries: UnknownRecord): EmployeeDesktopTask | null {
  const source = record(value);
  const chain = record(source.chain);
  const previous = record(chain.previous);
  const next = record(chain.next);
  const id = text(source.id);
  if (!id) return null;
  const reportSummary = record(reportSummaries[id]);
  const operationName = text(source.operationName, "Операция");
  const workCenterLabel = text(source.workCenterLabel, "Участок не задан");
  const routePartLabel = text(source.routePartLabel, "Основной маршрут");
  const routeNodes: EmployeeDesktopRouteNode[] = [
    { label: "До", node: previous, current: false, fallback: "старт" },
    { label: "Сейчас", node: record(chain.current), current: true, fallback: operationName },
    { label: "После", node: next, current: false, fallback: "финиш" },
  ].map(({ label, node, current, fallback }) => ({
    label,
    operationName: text(node.operationName, fallback),
    workCenterLabel: text(node.workCenterLabel, current ? workCenterLabel : "вне текущего окна"),
    routePartLabel: text(node.routePartLabel, current ? routePartLabel : ""),
    current,
  }));
  return {
    id,
    rowId: text(source.rowId),
    employeeId: text(source.employeeId),
    employeeName: personName(source.employeeName),
    operationName,
    workCenterLabel,
    orderLabel: text(source.orderLabel, "Заказ-наряд"),
    routePartLabel,
    documentNumber: text(source.documentNumber, "СЗН не сформирован"),
    assignedQuantity: number(source.assignedQuantity),
    actualQuantity: number(source.actualQuantity),
    defectQuantity: number(source.defectQuantity),
    goodQuantity: number(source.goodQuantity),
    unit: text(source.unit, "шт."),
    laborLabel: text(source.laborLabel, "трудозатраты не заданы"),
    status: text(source.status, "назначено"),
    isStarted: source.isStarted === true,
    isDone: source.isDone === true,
    previousOperation: routeNodes[0].operationName,
    nextOperation: routeNodes[2].operationName,
    routeNodes,
    reportCount: number(reportSummary.reportCount),
    photoCount: number(reportSummary.photoCount),
  };
}

function isProductionPayload(source: UnknownRecord): boolean {
  return ["boardRows", "storedAssignments", "factDrafts", "planning", "employees", "workCenters", "session"]
    .some((key) => Object.prototype.hasOwnProperty.call(source, key));
}

export function adaptEmployeeDesktopPayload(payload: unknown): EmployeeDesktopModel {
  const source = record(payload);
  const productionModel = record(source.productionModel);
  if (Object.keys(productionModel).length || isProductionPayload(source)) {
    return buildEmployeeDesktopProductionModel(Object.keys(productionModel).length ? productionModel : source, source.capabilities);
  }

  const model = record(source.model);
  const capabilities = record(source.capabilities);
  const reportSummaries = record(source.reportSummaries);
  const tasks = list(model.tasks).map((value) => adaptTask(value, reportSummaries)).filter(Boolean) as EmployeeDesktopTask[];
  const selectedId = text(record(model.selectedTask).id);
  const person = record(model.person);
  const people = list(model.taskPeople).map((value): EmployeeDesktopPerson | null => {
    const source = record(value);
    const id = text(source.id);
    return id ? { id, name: personName(source.name) } : null;
  }).filter(Boolean) as EmployeeDesktopPerson[];
  return {
    tasks,
    selectedTask: tasks.find((task) => task.id === selectedId) || tasks[0] || null,
    people,
    viewedPersonId: text(model.viewedPersonId, "__all"),
    personName: personName(person.name),
    canSwitchPerson: capabilities.sessionNavigation === true && model.canViewAll === true,
    canReturnToUserSelection: capabilities.sessionNavigation === true,
    canStartTask: capabilities.taskStart === true,
    canSaveFact: capabilities.factSave === true,
    canSaveReport: capabilities.reportSave === true,
    assignedQuantity: number(model.assignedQuantity),
    goodQuantity: number(model.goodQuantity),
    activeCount: list(model.activeTasks).length,
    doneCount: list(model.doneTasks).length,
  };
}
