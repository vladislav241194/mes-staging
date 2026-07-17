const DEFAULT_MAX_AGE_MS = 30_000;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function hasExactPlanningRuntimeProjection(local = {}, server = {}) {
  const equalIds = (left = [], right = []) => {
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
export function canApplyPlanningRuntimeProjection(local = {}, server = {}) {
  if (hasExactPlanningRuntimeProjection(local, server)) return true;
  const localCount = [local.routes, local.routeSteps, local.slots]
    .reduce((count, collection) => count + asArray(collection).length, 0);
  return localCount === 0;
}

export function createPlanningRuntimeProjectionReadModel({
  fetchImpl = globalThis.fetch,
  url = "/api/v1/planning/work-orders/projection",
  now = () => Date.now(),
} = {}) {
  const state = { projection: null, etag: "", fetchedAt: 0, loading: null, error: "" };
  async function refresh({ force = false } = {}) {
    if (!force && state.projection && now() - state.fetchedAt < DEFAULT_MAX_AGE_MS) return { ok: true, changed: false, projection: state.projection };
    if (state.loading) return state.loading;
    state.loading = (async () => {
      try {
        const response = await fetchImpl(url, { headers: state.etag ? { "If-None-Match": state.etag } : {}, cache: "no-store", credentials: "same-origin" });
        if (response.status === 304) { state.fetchedAt = now(); return { ok: true, changed: false, projection: state.projection }; }
        if (!response.ok) throw new Error(`Planning runtime projection API returned ${response.status}`);
        const payload = await response.json();
        const projection = payload?.projection;
        if (!payload?.ok || !projection || !Array.isArray(projection.routes) || !Array.isArray(projection.routeSteps) || !Array.isArray(projection.slots)) throw new Error(payload?.error || "Planning runtime projection API returned an invalid payload");
        const changed = JSON.stringify(projection) !== JSON.stringify(state.projection);
        state.projection = projection;
        state.etag = response.headers?.get?.("ETag") || state.etag;
        state.fetchedAt = now();
        state.error = "";
        return { ok: true, changed, projection };
      } catch (error) {
        state.error = error?.message || "Planning runtime projection API is unavailable";
        return { ok: false, changed: false, projection: state.projection, error: state.error };
      } finally { state.loading = null; }
    })();
    return state.loading;
  }
  return { refresh, getProjection: () => state.projection, getStatus: () => ({ available: Boolean(state.projection), loading: Boolean(state.loading), error: state.error, fetchedAt: state.fetchedAt }) };
}
