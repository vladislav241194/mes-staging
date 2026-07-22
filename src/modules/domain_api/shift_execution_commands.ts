const MAX_AGE_MS = 30_000;

type UnknownRecord = Record<string, unknown>;
type FetchLike = typeof globalThis.fetch;
type CommandPayload = Record<string, unknown>;

interface ShiftCapabilityState {
  enabled: boolean;
  reportEnabled: boolean;
  primaryPostgres: boolean;
  schemaReady: boolean;
  fetchedAt: number;
  loading: Promise<ShiftCapabilityResult> | null;
  error: string;
}

interface ShiftCapabilityResult extends ShiftCapabilityState {
  ok: boolean;
  changed: boolean;
}

export interface ShiftExecutionCommandsOptions {
  fetchImpl?: FetchLike;
  baseUrl?: string;
  now?: () => number;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function errorMessage(error: unknown, fallback: string): string {
  return String(record(error).message || fallback);
}

// Browser adapter for the future server-owned workshop flow. It deliberately
// exposes capability state first: existing snapshot UI must not send a write
// until the server reports PostgreSQL plus the command migration as ready.
export function createShiftExecutionCommands({
  fetchImpl = globalThis.fetch,
  baseUrl = "/api/v1/workshop/shift-execution",
  now = () => Date.now(),
}: ShiftExecutionCommandsOptions = {}) {
  let capability: ShiftCapabilityState = { enabled: false, reportEnabled: false, primaryPostgres: false, schemaReady: false, fetchedAt: 0, loading: null, error: "" };

  async function refreshCapability({ force = false }: { force?: boolean } = {}): Promise<ShiftCapabilityResult> {
    if (!force && capability.fetchedAt && now() - capability.fetchedAt < MAX_AGE_MS) return { ok: true, changed: false, ...capability };
    if (capability.loading) return capability.loading;
    capability.loading = (async () => {
      try {
        const response = await fetchImpl(`${baseUrl}/capabilities`, { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) throw new Error(`Shift execution capability API returned ${response.status}`);
        const payload = record(await response.json());
        const capabilities = record(payload.capabilities);
        if (!payload.ok || !payload.capabilities) throw new Error(String(payload.error || "Shift execution capability API returned an invalid payload"));
        const next = {
          enabled: capabilities.assignmentCreationEnabled === true,
          reportEnabled: capabilities.issueReportCreationEnabled === true,
          primaryPostgres: capabilities.primaryPostgres === true,
          schemaReady: capabilities.schemaReady === true,
          fetchedAt: now(), loading: null, error: "",
        };
        const changed = next.enabled !== capability.enabled || next.reportEnabled !== capability.reportEnabled || next.primaryPostgres !== capability.primaryPostgres || next.schemaReady !== capability.schemaReady;
        capability = next;
        return { ok: true, changed, ...capability };
      } catch (error: unknown) {
        capability = { ...capability, loading: null, error: errorMessage(error, "Shift execution capability API is unavailable") };
        return { ok: false, changed: false, ...capability };
      }
    })();
    return capability.loading;
  }

  async function createAssignment(payload: CommandPayload = {}) {
    const idempotencyKey = String(payload.idempotencyKey || "").trim();
    if (!idempotencyKey) throw new Error("Idempotency key is required to create a shift assignment");
    const response = await fetchImpl(`${baseUrl}/assignments`, {
      method: "POST", cache: "no-store", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ ...payload, idempotencyKey }),
    });
    const result = record(await response.json());
    if (!response.ok || !result.ok) throw new Error(String(result.error || `Shift execution command returned ${response.status}`));
    return result;
  }

  async function updateAssignment(assignmentId: unknown, payload: CommandPayload = {}) {
    const id = String(assignmentId || "").trim();
    const idempotencyKey = String(payload.idempotencyKey || "").trim();
    if (!id || !idempotencyKey) throw new Error("Assignment id and idempotency key are required to update a shift assignment");
    const response = await fetchImpl(`${baseUrl}/assignments/${encodeURIComponent(id)}`, {
      method: "PATCH", cache: "no-store", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ ...payload, idempotencyKey }),
    });
    const result = record(await response.json());
    if (response.status === 409) return { ok: false, conflict: true, item: result.item || null, error: result.error || "Shift assignment changed by another user" };
    if (!response.ok || !result.ok) throw new Error(String(result.error || `Shift execution update returned ${response.status}`));
    return { ok: true, conflict: false, ...result };
  }

  async function recordFact(assignmentId: unknown, payload: CommandPayload = {}) {
    const id = String(assignmentId || "").trim();
    const idempotencyKey = String(payload.idempotencyKey || "").trim();
    if (!id || !idempotencyKey) throw new Error("Assignment id and idempotency key are required to record a shift fact");
    const response = await fetchImpl(`${baseUrl}/assignments/${encodeURIComponent(id)}/facts`, {
      method: "POST", cache: "no-store", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ ...payload, idempotencyKey }),
    });
    const result = record(await response.json());
    if (!response.ok || !result.ok) throw new Error(String(result.error || `Shift fact command returned ${response.status}`));
    return result;
  }

  async function recordIssueReport(assignmentId: unknown, payload: CommandPayload = {}) {
    const id = String(assignmentId || "").trim();
    const idempotencyKey = String(payload.idempotencyKey || "").trim();
    const expectedRevision = Number(payload.expectedRevision);
    if (!id || !idempotencyKey || !Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error("Assignment id, revision and idempotency key are required to record an issue report");
    const response = await fetchImpl(`${baseUrl}/assignments/${encodeURIComponent(id)}/reports`, {
      method: "POST", cache: "no-store", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ ...payload, idempotencyKey }),
    });
    const result = record(await response.json());
    if (!response.ok || !result.ok) throw new Error(String(result.error || `Shift issue report command returned ${response.status}`));
    return result;
  }

  async function readIssueReports(assignmentId: unknown) {
    const id = String(assignmentId || "").trim();
    if (!id) throw new Error("Assignment id is required to read issue reports");
    const response = await fetchImpl(`${baseUrl}/assignments/${encodeURIComponent(id)}/reports`, {
      cache: "no-store", credentials: "same-origin",
    });
    const result = record(await response.json());
    if (!response.ok || !result.ok || !Array.isArray(result.items)) throw new Error(String(result.error || `Shift issue report read returned ${response.status}`));
    return result;
  }

  async function createCarryover(payload: CommandPayload = {}) {
    const idempotencyKey = String(payload.idempotencyKey || "").trim();
    if (!idempotencyKey) throw new Error("Idempotency key is required to create a shift carryover");
    const response = await fetchImpl(`${baseUrl}/carryovers`, { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ ...payload, idempotencyKey }) });
    const result = record(await response.json());
    if (!response.ok || !result.ok) throw new Error(String(result.error || `Shift carryover command returned ${response.status}`));
    return result;
  }

  async function cancelCarryover(carryoverId: unknown, payload: CommandPayload = {}) {
    const id = String(carryoverId || "").trim();
    const idempotencyKey = String(payload.idempotencyKey || "").trim();
    if (!id || !idempotencyKey) throw new Error("Carryover id and idempotency key are required to cancel a shift carryover");
    const response = await fetchImpl(`${baseUrl}/carryovers/${encodeURIComponent(id)}`, {
      method: "PATCH", cache: "no-store", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ ...payload, idempotencyKey }),
    });
    const result = record(await response.json());
    if (!response.ok || !result.ok) throw new Error(String(result.error || `Shift carryover cancellation returned ${response.status}`));
    return result;
  }

  return { refreshCapability, getCapability: () => ({ ...capability, loading: null }), createAssignment, updateAssignment, recordFact, recordIssueReport, readIssueReports, createCarryover, cancelCarryover };
}
