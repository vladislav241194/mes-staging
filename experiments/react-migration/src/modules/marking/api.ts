import { adaptMarkingCodeRecord, adaptMarkingTask, list, record, text, type MarkingCodeRecord, type MarkingTask } from "./model";

export const MARKING_API_ENDPOINTS = Object.freeze({
  base: "/api/v1/marking",
  tasks: "/api/v1/marking/tasks",
  task: (taskId: string) => `/api/v1/marking/tasks/${encodeURIComponent(taskId)}`,
  taskActions: (taskId: string) => `/api/v1/marking/tasks/${encodeURIComponent(taskId)}/actions`,
  code: (code: string) => `/api/v1/marking/codes/${encodeURIComponent(code)}`,
});

export interface MarkingPortOptions { signal?: AbortSignal }
export type MarkingTaskActionInput =
  | { action: "configure"; expectedRevision: number; configuredKitCount: number; boardsPerKit: number; masterLabelWidthMm: number; masterLabelHeightMm: number; individualLabelWidthMm: number; individualLabelHeightMm: number }
  | { action: "add-kits"; expectedRevision: number; count: number }
  | { action: "create-print-batch"; expectedRevision: number; kitIds: string[] }
  | { action: "confirm-print"; expectedRevision: number; batchId: string; result: "confirmed" | "error"; errorMessage?: string }
  | { action: "reprint"; expectedRevision: number; scopeType: "batch" | "kit" | "master" | "individual"; targetId: string }
  | { action: "complete"; expectedRevision: number }
  | { action: "transfer"; expectedRevision: number; nextWorkCenterId: string }
  | { action: "cancel-transfer"; expectedRevision: number };
export type MarkingTaskActionRequest = MarkingTaskActionInput & { requestId: string };

export interface MarkingApiPort {
  getTasks(options?: MarkingPortOptions): Promise<unknown>;
  getTask(taskId: string, options?: MarkingPortOptions): Promise<unknown>;
  postTaskAction(taskId: string, request: MarkingTaskActionRequest, options?: MarkingPortOptions): Promise<unknown>;
  getCode(code: string, options?: MarkingPortOptions): Promise<unknown>;
}

export interface MarkingActionResult { requestId: string; message: string; task: MarkingTask | null }
export interface MarkingClient {
  getTasks(signal?: AbortSignal): Promise<MarkingTask[]>;
  getTask(taskId: string, signal?: AbortSignal): Promise<MarkingTask>;
  runTaskAction(taskId: string, input: MarkingTaskActionInput, signal?: AbortSignal): Promise<MarkingActionResult>;
  getCode(code: string, signal?: AbortSignal): Promise<MarkingCodeRecord>;
}

export interface MarkingHostContract { mode: "production" | "mock"; api: MarkingApiPort | null; selectedTaskId: string }

const requestId = () => globalThis.crypto?.randomUUID?.() || `marking-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const errorMessage = (value: unknown, fallback: string) => text(record(value).message || record(value).error, fallback);
const assertOk = (value: unknown, fallback: string) => { if (record(value).ok === false) throw new Error(errorMessage(value, fallback)); return value; };
const taskSource = (value: unknown) => {
  const root = record(value); const data = record(root.data);
  const core = record(root.task || root.item || data.task || data.item || root.data || value);
  return {
    ...core,
    ...(Array.isArray(root.kits) ? { kits: root.kits } : {}),
    ...(Array.isArray(root.batches) ? { batches: root.batches } : {}),
    ...(Array.isArray(root.history) ? { history: root.history } : {}),
  };
};
const actionTaskSource = (value: unknown): unknown | null => {
  const root = record(value); const data = record(root.data);
  return root.task || root.item || data.task || data.item || null;
};
const tasksSource = (value: unknown): unknown[] | null => { if (Array.isArray(value)) return value; const root = record(value); if (Array.isArray(root.tasks)) return root.tasks; if (Array.isArray(root.items)) return root.items; if (Array.isArray(root.data)) return root.data; const data = record(root.data); if (Array.isArray(data.tasks)) return data.tasks; if (Array.isArray(data.items)) return data.items; return null; };

export function adaptMarkingHostContract(payload: unknown): MarkingHostContract {
  const root = record(payload);
  const api = record(root.api);
  const candidate: MarkingApiPort | null = [api.getTasks, api.getTask, api.postTaskAction, api.getCode].every((method) => typeof method === "function") ? api as unknown as MarkingApiPort : null;
  return { mode: root.mode === "mock" ? "mock" : "production", api: candidate, selectedTaskId: text(root.selectedTaskId || root.taskId) };
}

export function createMarkingProductionClient(port: MarkingApiPort): MarkingClient {
  return {
    async getTasks(signal) {
      const raw = assertOk(await port.getTasks({ signal }), "Не удалось загрузить задания маркировки.");
      const source = tasksSource(raw);
      if (!source) throw new Error("API маркировки вернул неподдерживаемый список заданий.");
      return source.map(adaptMarkingTask).filter(Boolean) as MarkingTask[];
    },
    async getTask(taskId, signal) {
      const raw = assertOk(await port.getTask(taskId, { signal }), "Не удалось загрузить задание маркировки.");
      const task = adaptMarkingTask(taskSource(raw));
      if (!task) throw new Error("API маркировки не вернул задание.");
      return task;
    },
    async runTaskAction(taskId, input, signal) {
      const commandRequestId = requestId();
      const raw = assertOk(await port.postTaskAction(taskId, { ...input, requestId: commandRequestId } as MarkingTaskActionRequest, { signal }), "Сервер не выполнил действие маркировки.");
      const actionTask = actionTaskSource(raw);
      return { requestId: commandRequestId, message: errorMessage(raw, "Действие выполнено."), task: actionTask ? adaptMarkingTask(actionTask) : null };
    },
    async getCode(code, signal) {
      const raw = assertOk(await port.getCode(code, { signal }), "Код маркировки не найден.");
      const root = record(raw); const data = record(root.data);
      const result = adaptMarkingCodeRecord(root.codeRecord || root.item || data.codeRecord || data.item || root.data || raw);
      if (!result) throw new Error("API маркировки не вернул карточку кода.");
      return result;
    },
  };
}

export const markingTaskListFromUnknown = (value: unknown) => list(value).map(adaptMarkingTask).filter(Boolean) as MarkingTask[];
