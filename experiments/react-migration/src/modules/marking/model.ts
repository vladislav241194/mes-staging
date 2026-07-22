export type MarkingStatus = "new" | "prepared" | "printing" | "marked" | "transferred" | "error";
export type MarkingPrintStatus = "not-sent" | "sent" | "awaiting-confirmation" | "confirmed" | "error" | "reprinted";
export type MarkingTab = "kits" | "batches" | "history";

export interface MarkingKit {
  id: string;
  sequence: number;
  masterCode: string;
  individualCodes: string[];
  printStatus: MarkingPrintStatus;
  createdAfterStart: boolean;
}

export interface MarkingBatch {
  id: string;
  createdAt: string;
  kitCount: number;
  labelCount: number;
  status: MarkingPrintStatus;
  kitIds: string[];
  error: string;
}

export interface MarkingHistoryItem {
  id: string;
  at: string;
  action: string;
  detail: string;
}

export interface MarkingTask {
  id: string;
  revision: number;
  title: string;
  product: string;
  workOrder: string;
  nextArea: string;
  nextWorkCenterId: string;
  planBoards: number;
  boardsPerKit: number;
  plannedKits: number;
  status: MarkingStatus;
  printStatus: MarkingPrintStatus;
  masterLabelSize: string;
  individualLabelSize: string;
  masterLabelWidthMm: number;
  masterLabelHeightMm: number;
  individualLabelWidthMm: number;
  individualLabelHeightMm: number;
  kitCount: number;
  printedKitCount: number;
  boardCount: number;
  printedBoardCount: number;
  labelCount: number;
  remainingKitCount: number;
  additionalKitCount: number;
  overPlan: boolean;
  kits: MarkingKit[];
  batches: MarkingBatch[];
  history: MarkingHistoryItem[];
}

export interface MarkingCodeRecord {
  code: string;
  kind: "master" | "individual" | "unknown";
  taskId: string;
  kitId: string;
  kitSequence: number;
  product: string;
  workOrder: string;
  status: string;
  currentArea: string;
  lastOperation: string;
  masterCode: string;
  individualCodes: string[];
  history: MarkingHistoryItem[];
}

type UnknownRecord = Record<string, unknown>;
export const record = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
export const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const text = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
export const count = (value: unknown, fallback = 0): number => Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : fallback;
const flag = (value: unknown, fallback = false): boolean => typeof value === "boolean" ? value : value === "true" ? true : value === "false" ? false : fallback;
const firstCount = (fallback: number, ...values: unknown[]) => {
  const value = values.find((item) => item !== undefined && item !== null && item !== "");
  return value === undefined ? fallback : count(value, fallback);
};

export function normalizeMarkingPrintStatus(value: unknown): MarkingPrintStatus {
  const status = text(value).toLowerCase().replace(/_/g, "-");
  if (["sent", "submitted"].includes(status)) return "sent";
  if (["awaiting-confirmation", "pending-confirmation", "pending"].includes(status)) return "awaiting-confirmation";
  if (["confirmed", "printed", "success"].includes(status)) return "confirmed";
  if (["error", "failed"].includes(status)) return "error";
  if (["reprinted", "reprint"].includes(status)) return "reprinted";
  return "not-sent";
}

export function normalizeMarkingStatus(value: unknown): MarkingStatus {
  const status = text(value).toLowerCase().replace(/_/g, "-");
  if (["prepared", "configured", "kits-created"].includes(status)) return "prepared";
  if (["printing", "print-pending", "in-progress"].includes(status)) return "printing";
  if (["marked", "completed", "complete"].includes(status)) return "marked";
  if (["transferred", "transfer-confirmed"].includes(status)) return "transferred";
  if (["error", "failed"].includes(status)) return "error";
  return "new";
}

export function adaptMarkingHistoryItem(value: unknown, index = 0): MarkingHistoryItem | null {
  const source = record(value);
  const action = text(source.action || source.title || source.type);
  if (!action) return null;
  const payload = record(source.payload);
  const payloadDetail = Object.keys(payload).length ? Object.entries(payload).map(([key, item]) => `${key}: ${text(item)}`).join(" · ") : "";
  return { id: text(source.id, `history-${index + 1}`), at: text(source.at || source.createdAt || source.timestamp), action, detail: text(source.detail || source.description || source.message || payloadDetail) };
}

export function adaptMarkingKit(value: unknown, index = 0): MarkingKit | null {
  const source = record(value);
  const id = text(source.id);
  if (!id) return null;
  return {
    id,
    sequence: count(source.sequence || source.number, index + 1),
    masterCode: text(source.masterCode || record(source.master).code),
    individualCodes: list(source.individualCodes || source.codes).map((item) => text(record(item).code || record(item).value || item)).filter(Boolean),
    printStatus: normalizeMarkingPrintStatus(source.printStatus || source.printState || source.state || source.status || (source.printed === true ? "confirmed" : "not-sent")),
    createdAfterStart: flag(source.createdAfterStart ?? source.addedAfterStart ?? source.additional),
  };
}

export function adaptMarkingBatch(value: unknown, index = 0): MarkingBatch | null {
  const source = record(value);
  const id = text(source.id, `batch-${index + 1}`);
  return {
    id,
    createdAt: text(source.createdAt || source.requestedAt || source.at),
    kitCount: count(source.kitCount || source.count),
    labelCount: count(source.labelCount || source.itemCount || source.labels),
    status: normalizeMarkingPrintStatus(source.printStatus || source.printState || source.state || source.status),
    kitIds: list(source.kitIds).map((item) => text(item)).filter(Boolean),
    error: text(source.error || source.errorMessage),
  };
}

export function adaptMarkingTask(value: unknown): MarkingTask | null {
  const source = record(value);
  const metrics = record(source.metrics || source.counts);
  const labels = record(source.labelSizes || source.labels);
  const masterLabel = record(labels.master);
  const individualLabel = record(labels.individual);
  const product = record(source.product);
  const workOrder = record(source.workOrder);
  const id = text(source.id || source.taskId);
  if (!id) return null;
  const kits = list(source.kits || source.codeKits).map(adaptMarkingKit).filter(Boolean) as MarkingKit[];
  const batches = list(source.batches || source.printBatches).map(adaptMarkingBatch).filter(Boolean) as MarkingBatch[];
  const history = list(source.history || source.events).map(adaptMarkingHistoryItem).filter(Boolean) as MarkingHistoryItem[];
  const kitCount = firstCount(kits.length, source.kitCount, metrics.kitCount, metrics.kits);
  const printedKitsFromRows = kits.filter((kit) => ["confirmed", "reprinted"].includes(kit.printStatus)).length;
  const boardCountFromRows = kits.reduce((sum, kit) => sum + kit.individualCodes.length, 0);
  const printedBoardCountFromRows = kits.filter((kit) => ["confirmed", "reprinted"].includes(kit.printStatus)).reduce((sum, kit) => sum + kit.individualCodes.length, 0);
  const printedKitCount = firstCount(printedKitsFromRows, source.printedKitCount, metrics.confirmedKitCount, metrics.printedKitCount, metrics.printedKits);
  const boardCount = firstCount(boardCountFromRows, source.boardCount, metrics.boardCount, metrics.boards, source.individualCodeCount);
  const planBoards = firstCount(0, source.planBoards, source.plannedBoardQuantity, source.plannedBoardCount, metrics.planBoards);
  const boardsPerKit = firstCount(0, source.boardsPerKit, source.boardsPerPanel, metrics.boardsPerKit);
  const plannedKits = firstCount(boardsPerKit > 0 ? Math.ceil(planBoards / boardsPerKit) : 0, source.plannedKits, source.configuredKitCount, source.plannedKitCount, metrics.plannedKits);
  const nextWorkCenterId = text(source.nextWorkCenterId || record(source.transfer).nextWorkCenterId);
  const size = (label: UnknownRecord, fallback: string) => {
    const width = Number(label.widthMm); const height = Number(label.heightMm);
    return width > 0 && height > 0 ? `${width} × ${height} мм` : fallback;
  };
  const latestPrintStatus = batches[0]?.status || kits.find((kit) => kit.printStatus === "awaiting-confirmation")?.printStatus || kits.find((kit) => kit.printStatus === "error")?.printStatus || "not-sent";
  const masterLabelWidthMm = firstCount(100, masterLabel.widthMm, source.masterLabelWidthMm);
  const masterLabelHeightMm = firstCount(60, masterLabel.heightMm, source.masterLabelHeightMm);
  const individualLabelWidthMm = firstCount(30, individualLabel.widthMm, source.individualLabelWidthMm);
  const individualLabelHeightMm = firstCount(20, individualLabel.heightMm, source.individualLabelHeightMm);
  return {
    id,
    revision: count(source.revision),
    title: text(source.title || source.name, "Задание маркировки"),
    product: text(product.name || product.title || source.productName || source.product, "Изделие не указано"),
    workOrder: text(workOrder.number || workOrder.name || source.workOrderNumber || source.workOrder, "Заказ-наряд не указан"),
    nextArea: text(source.nextArea || source.nextWorkCenter || nextWorkCenterId || record(source.transfer).nextArea, "Следующий участок не указан"),
    nextWorkCenterId,
    planBoards,
    boardsPerKit,
    plannedKits,
    status: normalizeMarkingStatus(source.status || source.state || source.phase1State),
    printStatus: normalizeMarkingPrintStatus(source.printStatus || metrics.printStatus || latestPrintStatus),
    masterLabelSize: text(typeof labels.master === "string" ? labels.master : source.masterLabelSize, size({ widthMm: masterLabelWidthMm, heightMm: masterLabelHeightMm }, "100 × 60 мм")),
    individualLabelSize: text(typeof labels.individual === "string" ? labels.individual : source.individualLabelSize, size({ widthMm: individualLabelWidthMm, heightMm: individualLabelHeightMm }, "30 × 20 мм")),
    masterLabelWidthMm,
    masterLabelHeightMm,
    individualLabelWidthMm,
    individualLabelHeightMm,
    kitCount,
    printedKitCount,
    boardCount,
    printedBoardCount: firstCount(printedBoardCountFromRows, source.printedBoardCount, metrics.printedBoardCount, metrics.printedBoards),
    labelCount: firstCount(kitCount + boardCount, source.labelCount, metrics.labelCount, metrics.labels),
    remainingKitCount: firstCount(Math.max(0, kitCount - printedKitCount), source.remainingKitCount, metrics.remainingKitCount, metrics.remainingKits),
    additionalKitCount: firstCount(kits.filter((kit) => kit.createdAfterStart).length, source.additionalKitCount, metrics.additionalKitCount),
    overPlan: flag(source.overPlan ?? metrics.overPlan, planBoards > 0 && boardCount > planBoards),
    kits,
    batches,
    history,
  };
}

export function adaptMarkingCodeRecord(value: unknown): MarkingCodeRecord | null {
  const source = record(value);
  const codeSource = record(source.code);
  const task = record(source.task);
  const kit = record(source.kit);
  const rawKind = text(source.kind || source.type || codeSource.type).toLowerCase();
  const code = text(codeSource.value || source.codeValue || (typeof source.code === "string" ? source.code : "") || source.id);
  if (!code) return null;
  const linkedCodes = list(kit.codes);
  return {
    code,
    kind: rawKind === "master" ? "master" : ["individual", "board"].includes(rawKind) ? "individual" : "unknown",
    taskId: text(source.taskId || task.id),
    kitId: text(source.kitId || kit.id),
    kitSequence: count(source.kitSequence || kit.sequence),
    product: text(source.product || task.product || task.productName || source.productName, "Изделие не указано"),
    workOrder: text(source.workOrder || task.workOrder || task.workOrderNumber || source.workOrderNumber, "Заказ-наряд не указан"),
    status: text(source.status || task.state, "Статус не указан"),
    currentArea: text(source.currentArea || source.workCenter || task.sourceWorkCenterId, "Участок не указан"),
    lastOperation: text(source.lastOperation || source.operation, "Операция не указана"),
    masterCode: text(source.masterCode || kit.masterCode || record(linkedCodes.find((item) => text(record(item).type) === "master")).value),
    individualCodes: list(source.individualCodes || kit.individualCodes || linkedCodes.filter((item) => text(record(item).type) === "individual")).map((item) => text(record(item).code || record(item).value || item)).filter(Boolean),
    history: list(source.history || source.events || source.printHistory).map((item, index) => {
      const row = record(item);
      return adaptMarkingHistoryItem({ ...row, action: row.action || row.type || `Печать · ${text(row.mode)}`, at: row.at || row.requestedAt, detail: row.detail || row.state }, index);
    }).filter(Boolean) as MarkingHistoryItem[],
  };
}

export const taskMetrics = (task: MarkingTask) => ({
  boards: task.boardCount,
  printedKits: task.printedKitCount,
  printedBoards: task.printedBoardCount,
  labels: task.labelCount,
  remainingKits: task.remainingKitCount,
});
