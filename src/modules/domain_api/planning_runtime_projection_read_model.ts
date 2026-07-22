const DEFAULT_MAX_AGE_MS = 30_000;

type UnknownRecord = Record<string, unknown>;
type FetchLike = typeof globalThis.fetch;

export interface PlanningRuntimeProjection extends UnknownRecord {
  routes: UnknownRecord[];
  routeSteps: UnknownRecord[];
  slots: UnknownRecord[];
}

type ProjectionCandidate = Partial<Record<"routes" | "routeSteps" | "slots", unknown>>;

interface PlanningRuntimeRefreshResult extends UnknownRecord {
  ok: boolean;
  changed: boolean;
  projection: PlanningRuntimeProjection | null;
  error?: string;
}

interface PlanningRuntimeState {
  projection: PlanningRuntimeProjection | null;
  etag: string;
  fetchedAt: number;
  loading: Promise<PlanningRuntimeRefreshResult> | null;
  error: string;
}

export interface PlanningRuntimeProjectionReadModelOptions {
  fetchImpl?: FetchLike;
  url?: string;
  now?: () => number;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function errorMessage(error: unknown, fallback: string): string {
  return String(record(error).message || fallback);
}

function asArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value : [];
}

export function hasExactPlanningRuntimeProjection(local: ProjectionCandidate = {}, server: ProjectionCandidate = {}): boolean {
  const equalIds = (left: UnknownRecord[] = [], right: UnknownRecord[] = []): boolean => {
    const leftIds = new Set(left.map((item) => String(item?.id || "")).filter(Boolean));
    const rightIds = new Set(right.map((item) => String(item?.id || "")).filter(Boolean));
    return left.length === right.length
      && leftIds.size === left.length
      && rightIds.size === right.length
      && [...leftIds].every((id) => rightIds.has(id));
  };
  return equalIds(asArray(local.routes), asArray(server.routes))
    && equalIds(asArray(local.routeSteps), asArray(server.routeSteps))
    && equalIds(asArray(local.slots), asArray(server.slots));
}

// A first-time browser has no planning runtime collections yet. In that case
// the PostgreSQL projection is the safer source than downloading the legacy
// shared-state blob. A non-empty incompatible local projection is different:
// it may contain unsynchronised compatibility data, so it must keep using the
// fallback until parity is restored.
export function canApplyPlanningRuntimeProjection(local: ProjectionCandidate = {}, server: ProjectionCandidate = {}): boolean {
  if (hasExactPlanningRuntimeProjection(local, server)) return true;
  const localCount = [local.routes, local.routeSteps, local.slots]
    .map(asArray)
    .reduce((count, collection) => count + collection.length, 0);
  return localCount === 0;
}

export function createPlanningRuntimeProjectionReadModel({
  fetchImpl = globalThis.fetch,
  url = "/api/v1/planning/work-orders/projection",
  now = () => Date.now(),
}: PlanningRuntimeProjectionReadModelOptions = {}) {
  const state: PlanningRuntimeState = { projection: null, etag: "", fetchedAt: 0, loading: null, error: "" };
  async function refresh({ force = false }: { force?: boolean } = {}): Promise<PlanningRuntimeRefreshResult> {
    if (!force && state.projection && now() - state.fetchedAt < DEFAULT_MAX_AGE_MS) return { ok: true, changed: false, projection: state.projection };
    if (state.loading) return state.loading;
    state.loading = (async () => {
      try {
        const response = await fetchImpl(url, { headers: state.etag ? { "If-None-Match": state.etag } : {}, cache: "no-store", credentials: "same-origin" });
        if (response.status === 304) { state.fetchedAt = now(); return { ok: true, changed: false, projection: state.projection }; }
        if (!response.ok) throw new Error(`Planning runtime projection API returned ${response.status}`);
        const payload = record(await response.json());
        const projection = record(payload.projection);
        if (!payload.ok || !Array.isArray(projection.routes) || !Array.isArray(projection.routeSteps) || !Array.isArray(projection.slots)) throw new Error(String(payload.error || "Planning runtime projection API returned an invalid payload"));
        const verifiedProjection = projection as PlanningRuntimeProjection;
        const changed = JSON.stringify(verifiedProjection) !== JSON.stringify(state.projection);
        state.projection = verifiedProjection;
        state.etag = response.headers?.get?.("ETag") || state.etag;
        state.fetchedAt = now();
        state.error = "";
        return { ok: true, changed, projection: verifiedProjection };
      } catch (error: unknown) {
        state.error = errorMessage(error, "Planning runtime projection API is unavailable");
        return { ok: false, changed: false, projection: state.projection, error: state.error };
      } finally { state.loading = null; }
    })();
    return state.loading;
  }
  return { refresh, getProjection: () => state.projection, getStatus: () => ({ available: Boolean(state.projection), loading: Boolean(state.loading), error: state.error, fetchedAt: state.fetchedAt }) };
}
