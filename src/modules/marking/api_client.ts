export interface MarkingRequestOptions {
  signal?: AbortSignal;
}

export interface MarkingTaskActionRequest {
  action: string;
  requestId: string;
  [key: string]: unknown;
}

export interface MarkingApiClient {
  getTasks(options?: MarkingRequestOptions): Promise<unknown>;
  getTask(taskId: string, options?: MarkingRequestOptions): Promise<unknown>;
  postTaskAction(taskId: string, request: MarkingTaskActionRequest, options?: MarkingRequestOptions): Promise<unknown>;
  getCode(code: string, options?: MarkingRequestOptions): Promise<unknown>;
}

export class MarkingApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, { status = 0, code = "marking-api-error" } = {}) {
    super(message);
    this.name = "MarkingApiError";
    this.status = status;
    this.code = code;
  }
}

type FetchLike = typeof globalThis.fetch;

const text = (value: unknown): string => String(value ?? "").trim();

function requiredPathPart(value: unknown, label: string): string {
  const result = text(value);
  if (!result) throw new MarkingApiError(`${label} is required`, { code: "marking-request-invalid" });
  return encodeURIComponent(result);
}

export function createMarkingApiClient({
  fetchImpl = globalThis.fetch,
  baseUrl = "/api/v1/marking",
}: {
  fetchImpl?: FetchLike;
  baseUrl?: string;
} = {}): MarkingApiClient {
  if (typeof fetchImpl !== "function") throw new MarkingApiError("Marking transport is unavailable", { code: "marking-transport-unavailable" });
  const root = baseUrl.replace(/\/$/, "");

  const requestJson = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        cache: "no-store",
        credentials: "same-origin",
        ...init,
        headers: {
          Accept: "application/json",
          ...(init.headers || {}),
        },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new MarkingApiError(error instanceof Error ? error.message : "Marking API is unavailable", {
        code: "marking-transport-failed",
      });
    }
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || payload.ok === false) {
      throw new MarkingApiError(text(payload.error) || `Marking API returned ${response.status}`, {
        status: response.status,
        code: text(payload.code) || "marking-command-failed",
      });
    }
    return payload;
  };

  return Object.freeze({
    getTasks: (options: MarkingRequestOptions = {}) => requestJson("/tasks", { signal: options.signal }),
    getTask: (taskId: string, options: MarkingRequestOptions = {}) => requestJson(`/tasks/${requiredPathPart(taskId, "taskId")}`, { signal: options.signal }),
    postTaskAction: (taskId: string, request: MarkingTaskActionRequest, options: MarkingRequestOptions = {}) => {
      const action = text(request?.action);
      const requestId = text(request?.requestId);
      if (!action || !requestId) throw new MarkingApiError("action and requestId are required", { code: "marking-request-invalid" });
      return requestJson(`/tasks/${requiredPathPart(taskId, "taskId")}/actions`, {
        method: "POST",
        signal: options.signal,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestId,
        },
        body: JSON.stringify({ ...request, action, requestId }),
      });
    },
    getCode: (code: string, options: MarkingRequestOptions = {}) => requestJson(`/codes/${requiredPathPart(code, "code")}`, { signal: options.signal }),
  });
}
