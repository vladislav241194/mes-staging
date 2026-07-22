const MAX_AGE_MS = 30_000;

type UnknownRecord = Record<string, unknown>;
type FetchLike = typeof globalThis.fetch;

export interface Specifications2WorkOrderCommandsOptions {
  fetchImpl?: FetchLike;
  baseUrl?: string;
  now?: () => number;
}

export interface Specifications2WorkOrderRequest {
  revisionId: string;
  routeSourceDraftId: string;
  quantity: number;
  idempotencyKey: string;
}

export interface Specifications2WorkOrderCommandsClient {
  refreshCapability(options?: { force?: boolean }): Promise<UnknownRecord>;
  getCapability(): UnknownRecord;
  createWorkOrder(request: Specifications2WorkOrderRequest): Promise<UnknownRecord>;
}

interface WorkOrderCapability {
  enabled: boolean;
  primaryPostgres: boolean;
  fetchedAt: number;
  loading: Promise<UnknownRecord> | null;
  error: string;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function errorMessage(error: unknown, fallback: string): string {
  return String(record(error).message || fallback);
}

export function createSpecifications2WorkOrderCommands({
  fetchImpl = globalThis.fetch,
  baseUrl = "/api/v1/specifications2",
  now = () => Date.now(),
}: Specifications2WorkOrderCommandsOptions = {}): Specifications2WorkOrderCommandsClient {
  let capability: WorkOrderCapability = {
    enabled: false,
    primaryPostgres: false,
    fetchedAt: 0,
    loading: null,
    error: "",
  };

  async function refreshCapability({ force = false }: { force?: boolean } = {}): Promise<UnknownRecord> {
    if (!force && capability.fetchedAt && now() - capability.fetchedAt < MAX_AGE_MS) return { ok: true, changed: false, ...capability };
    if (capability.loading) return capability.loading;
    capability.loading = (async (): Promise<UnknownRecord> => {
      try {
        const response = await fetchImpl(`${baseUrl}/capabilities`, { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) throw new Error(`Specifications 2.0 capability API returned ${response.status}`);
        const payload = record(await response.json());
        const capabilities = record(payload.capabilities);
        if (!payload.ok || !payload.capabilities) throw new Error(String(payload.error || "Specifications 2.0 capability API returned an invalid payload"));
        const next: WorkOrderCapability = {
          enabled: capabilities.workOrderCreationEnabled === true,
          primaryPostgres: capabilities.workOrderPrimaryPostgres === true,
          fetchedAt: now(),
          loading: null,
          error: "",
        };
        const changed = next.enabled !== capability.enabled || next.primaryPostgres !== capability.primaryPostgres;
        capability = next;
        return { ok: true, changed, ...capability };
      } catch (error: unknown) {
        capability = {
          ...capability,
          loading: null,
          error: errorMessage(error, "Specifications 2.0 capability API is unavailable"),
        };
        return { ok: false, changed: false, ...capability };
      }
    })();
    return capability.loading;
  }

  async function createWorkOrder({
    revisionId,
    routeSourceDraftId,
    quantity,
    idempotencyKey,
  }: Specifications2WorkOrderRequest): Promise<UnknownRecord> {
    const response = await fetchImpl(`${baseUrl}/revisions/${encodeURIComponent(revisionId)}/work-orders`, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ routeSourceDraftId, quantity, idempotencyKey }),
    });
    const payload = record(await response.json());
    if (!response.ok || !payload.ok) throw new Error(String(payload.error || `Specifications 2.0 work-order command returned ${response.status}`));
    return payload;
  }

  return {
    refreshCapability,
    getCapability: () => ({ ...capability, loading: null }),
    createWorkOrder,
  };
}
