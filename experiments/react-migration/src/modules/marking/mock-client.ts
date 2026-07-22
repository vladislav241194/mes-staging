import type { MarkingClient, MarkingTaskActionInput } from "./api";
import type { MarkingBatch, MarkingCodeRecord, MarkingHistoryItem, MarkingKit, MarkingTask } from "./model";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const now = () => new Date().toISOString();
const id = (prefix: string) => `MOCK-${prefix}-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
const code = (taskId: string, kit: number, item: number) => `${taskId}:${kit}:${item}`.split("").reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0;
const history = (action: string, detail: string): MarkingHistoryItem => ({ id: id("EVT"), at: now(), action, detail });
const refresh = (task: MarkingTask): MarkingTask => {
  const printed = task.kits.filter((kit) => ["confirmed", "reprinted"].includes(kit.printStatus));
  const boardCount = task.kits.reduce((sum, kit) => sum + kit.individualCodes.length, 0);
  return { ...task, kitCount: task.kits.length, printedKitCount: printed.length, boardCount, printedBoardCount: printed.reduce((sum, kit) => sum + kit.individualCodes.length, 0), labelCount: task.kits.length + boardCount, remainingKitCount: task.kits.length - printed.length, additionalKitCount: task.kits.filter((kit) => kit.createdAfterStart).length, overPlan: boardCount > task.planBoards };
};
const kits = (task: MarkingTask, amount: number): MarkingKit[] => Array.from({ length: amount }, (_, offset) => {
  const sequence = task.kits.length + offset + 1;
  const makeCode = (item: number) => code(task.id, sequence, item).toString(36).toUpperCase().padStart(8, "0");
  return { id: id(`KIT-${sequence}`), sequence, masterCode: makeCode(0), individualCodes: Array.from({ length: task.boardsPerKit }, (_, index) => makeCode(index + 1)), printStatus: "not-sent", createdAfterStart: task.kits.length > 0 };
});
const task = (source: Partial<MarkingTask> & Pick<MarkingTask, "id" | "title" | "product" | "workOrder" | "planBoards" | "plannedKits">): MarkingTask => refresh({
  revision: 1, nextArea: "Линия поверхностного монтажа", nextWorkCenterId: "MOCK-SMT", boardsPerKit: 20, status: "new", printStatus: "not-sent", masterLabelSize: "100 × 60 мм", individualLabelSize: "30 × 20 мм", masterLabelWidthMm: 100, masterLabelHeightMm: 60, individualLabelWidthMm: 30, individualLabelHeightMm: 20, kitCount: 0, printedKitCount: 0, boardCount: 0, printedBoardCount: 0, labelCount: 0, remainingKitCount: 0, additionalKitCount: 0, overPlan: false, kits: [], batches: [], history: [history("Задание назначено", "MOCK · тестовый контур")], ...source,
});

export function createMarkingMockClient(): MarkingClient {
  let tasks = [task({ id: "MOCK-MKG-01", title: "Маркировка партии контроллеров", product: "Плата контроллера НУ70-2+2 F", workOrder: "MOCK-СЗН-018", planBoards: 2000, plannedKits: 100 }), task({ id: "MOCK-MKG-02", title: "Маркировка модулей питания", product: "Модуль питания МП-24 rev.6", workOrder: "MOCK-СЗН-021", planBoards: 24000, plannedKits: 1200 })];
  tasks[0].kits = kits(tasks[0], 12); tasks[0].status = "prepared"; tasks[0].history.unshift(history("MOCK-комплекты созданы", "12 мультипликаций")); tasks[0] = refresh(tasks[0]);
  const find = (taskId: string) => { const current = tasks.find((item) => item.id === taskId); if (!current) throw new Error("MOCK-задание не найдено."); return current; };
  const replace = (next: MarkingTask) => { tasks = tasks.map((item) => item.id === next.id ? refresh(next) : item); return find(next.id); };
  return {
    async getTasks() { return clone(tasks); },
    async getTask(taskId) { return clone(find(taskId)); },
    async runTaskAction(taskId: string, input: MarkingTaskActionInput) {
      let current = find(taskId);
      if (input.expectedRevision !== current.revision) throw new Error("MOCK-ревизия задания изменилась.");
      if (input.action === "configure") current = { ...current, boardsPerKit: input.boardsPerKit, plannedKits: input.configuredKitCount, planBoards: input.configuredKitCount * input.boardsPerKit, masterLabelWidthMm: input.masterLabelWidthMm, masterLabelHeightMm: input.masterLabelHeightMm, individualLabelWidthMm: input.individualLabelWidthMm, individualLabelHeightMm: input.individualLabelHeightMm, masterLabelSize: `${input.masterLabelWidthMm} × ${input.masterLabelHeightMm} мм`, individualLabelSize: `${input.individualLabelWidthMm} × ${input.individualLabelHeightMm} мм`, status: "prepared", history: [history("Параметры настроены", `${input.configuredKitCount} × ${input.boardsPerKit}`), ...current.history] };
      if (input.action === "add-kits") current = { ...current, status: "prepared", kits: [...current.kits, ...kits(current, input.count)], history: [history("MOCK-комплекты созданы", `${input.count} мультипликаций`), ...current.history] };
      if (input.action === "create-print-batch") { const requestedIds = new Set(input.kitIds); const selected = current.kits.filter((kit) => requestedIds.has(kit.id) && (kit.printStatus === "not-sent" || kit.printStatus === "error")); const batch: MarkingBatch = { id: id("PB"), createdAt: now(), kitCount: selected.length, labelCount: selected.reduce((sum, kit) => sum + kit.individualCodes.length + 1, 0), status: "awaiting-confirmation", kitIds: selected.map((kit) => kit.id), error: "" }; const selectedIds = new Set(batch.kitIds); current = { ...current, status: "printing", printStatus: "awaiting-confirmation", kits: current.kits.map((kit) => selectedIds.has(kit.id) ? { ...kit, printStatus: "awaiting-confirmation" } : kit), batches: [batch, ...current.batches], history: [history("Партия отправлена на печать", `${batch.kitCount} комплектов`), ...current.history] }; }
      if (input.action === "confirm-print") { const batch = current.batches.find((item) => item.id === input.batchId); if (!batch) throw new Error("Партия печати не найдена."); const status = input.result === "confirmed" ? "confirmed" : "error"; const kitIds = new Set(batch.kitIds); current = { ...current, status: input.result === "confirmed" ? "prepared" : "error", printStatus: status, kits: current.kits.map((kit) => kitIds.has(kit.id) ? { ...kit, printStatus: status } : kit), batches: current.batches.map((item) => item.id === batch.id ? { ...item, status, error: input.result === "error" ? input.errorMessage || "Ошибка тестовой печати" : "" } : item), history: [history(input.result === "confirmed" ? "Печать подтверждена" : "Ошибка печати", batch.id), ...current.history] }; }
      if (input.action === "reprint") { const batch = current.batches.find((item) => item.id === input.targetId); if (!batch) throw new Error("Партия печати не найдена."); const kitIds = new Set(batch.kitIds); current = { ...current, status: "prepared", printStatus: "reprinted", kits: current.kits.map((kit) => kitIds.has(kit.id) ? { ...kit, printStatus: "reprinted" } : kit), batches: current.batches.map((item) => item.id === batch.id ? { ...item, status: "reprinted", error: "" } : item), history: [history("Перепечать подтверждена", batch.id), ...current.history] }; }
      if (input.action === "complete") current = { ...current, status: "marked", history: [history("Маркировка завершена", `${current.kits.length} комплектов`), ...current.history] };
      if (input.action === "transfer") current = { ...current, status: "transferred", nextWorkCenterId: input.nextWorkCenterId, history: [history("Партия передана", input.nextWorkCenterId), ...current.history] };
      if (input.action === "cancel-transfer") current = { ...current, status: "marked", history: [history("Передача отменена", current.nextArea), ...current.history] };
      current = { ...current, revision: current.revision + 1 };
      current = replace(current);
      return { requestId: id("REQ"), message: "MOCK-действие выполнено.", task: clone(current) };
    },
    async getCode(value): Promise<MarkingCodeRecord> { for (const current of tasks) for (const kit of current.kits) { const kind = kit.masterCode === value ? "master" : kit.individualCodes.includes(value) ? "individual" : null; if (kind) return { code: value, kind, taskId: current.id, kitId: kit.id, kitSequence: kit.sequence, product: current.product, workOrder: current.workOrder, status: current.status, currentArea: "Участок маркировки", lastOperation: current.history[0]?.action || "", masterCode: kit.masterCode, individualCodes: kit.individualCodes, history: current.history }; } throw new Error("Код не найден в MOCK-состоянии."); },
  };
}
