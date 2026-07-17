const DEFAULT_MAX_AGE_MS = 30_000;

function normalizeItems(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && item.id) : [];
}

// Projection cache: a failed request never mutates snapshot-backed planning data.
export function createWorkOrdersReadModel({ fetchImpl = globalThis.fetch, url = "/api/v1/planning/work-orders", now = () => Date.now() } = {}) {
  const state = { items: [], etag: "", fetchedAt: 0, loading: null, error: "", details: new Map(), summary: null, summaryEtag: "", summaryFetchedAt: 0, summaryLoading: null, summaryError: "" };
  async function refresh({ force = false } = {}) {
    if (!force && state.items.length && now() - state.fetchedAt < DEFAULT_MAX_AGE_MS) return { ok: true, changed: false, items: state.items };
    if (state.loading) return state.loading;
    state.loading = (async () => {
      try {
        const response = await fetchImpl(url, { headers: state.etag ? { "If-None-Match": state.etag } : {}, cache: "no-store", credentials: "same-origin" });
        if (response.status === 304) { state.fetchedAt = now(); return { ok: true, changed: false, items: state.items }; }
        if (!response.ok) throw new Error(`Work-order read API returned ${response.status}`);
        const payload = await response.json();
        if (!payload?.ok) throw new Error(payload?.error || "Work-order read API returned an invalid payload");
        const items = normalizeItems(payload.items);
        const changed = JSON.stringify(items) !== JSON.stringify(state.items);
        state.items = items;
        state.etag = response.headers?.get?.("ETag") || state.etag;
        state.fetchedAt = now();
        state.error = "";
        return { ok: true, changed, items };
      } catch (error) {
        state.error = error?.message || "Work-order read API is unavailable";
        return { ok: false, changed: false, items: state.items, error: state.error };
      } finally { state.loading = null; }
    })();
    return state.loading;
  }
  async function refreshDetail(id, { force = false } = {}) {
    const key = String(id || "");
    if (!key) return { ok: false, changed: false, item: null };
    const cached = state.details.get(key) || { item: null, etag: "", fetchedAt: 0, loading: null, error: "" };
    if (!force && cached.item && now() - cached.fetchedAt < DEFAULT_MAX_AGE_MS) return { ok: true, changed: false, item: cached.item };
    if (cached.loading) return cached.loading;
    cached.loading = (async () => {
      try {
        const response = await fetchImpl(`${url}/${encodeURIComponent(key)}?view=workbench`, { headers: cached.etag ? { "If-None-Match": cached.etag } : {}, cache: "no-store", credentials: "same-origin" });
        if (response.status === 304) { cached.fetchedAt = now(); return { ok: true, changed: false, item: cached.item }; }
        if (!response.ok) throw new Error(`Work-order detail API returned ${response.status}`);
        const payload = await response.json();
        if (!payload?.ok || !payload.item?.id) throw new Error(payload?.error || "Work-order detail API returned an invalid payload");
        const changed = JSON.stringify(payload.item) !== JSON.stringify(cached.item);
        cached.item = payload.item;
        cached.etag = response.headers?.get?.("ETag") || cached.etag;
        cached.fetchedAt = now();
        cached.error = "";
        return { ok: true, changed, item: cached.item };
      } catch (error) {
        cached.error = error?.message || "Work-order detail API is unavailable";
        return { ok: false, changed: false, item: cached.item, error: cached.error };
      } finally { cached.loading = null; }
    })();
    state.details.set(key, cached);
    return cached.loading;
  }
  async function refreshSummary({ force = false } = {}) {
    if (!force && state.summary && now() - state.summaryFetchedAt < DEFAULT_MAX_AGE_MS) return { ok: true, changed: false, summary: state.summary };
    if (state.summaryLoading) return state.summaryLoading;
    state.summaryLoading = (async () => {
      try {
        const response = await fetchImpl(`${url}/summary`, { headers: state.summaryEtag ? { "If-None-Match": state.summaryEtag } : {}, cache: "no-store", credentials: "same-origin" });
        if (response.status === 304) { state.summaryFetchedAt = now(); return { ok: true, changed: false, summary: state.summary }; }
        if (!response.ok) throw new Error(`Work-order summary API returned ${response.status}`);
        const payload = await response.json();
        if (!payload?.ok || !payload.summary || typeof payload.summary !== "object") throw new Error(payload?.error || "Work-order summary API returned an invalid payload");
        const changed = JSON.stringify(payload.summary) !== JSON.stringify(state.summary);
        state.summary = payload.summary;
        state.summaryEtag = response.headers?.get?.("ETag") || state.summaryEtag;
        state.summaryFetchedAt = now();
        state.summaryError = "";
        return { ok: true, changed, summary: state.summary };
      } catch (error) {
        state.summaryError = error?.message || "Work-order summary API is unavailable";
        return { ok: false, changed: false, summary: state.summary, error: state.summaryError };
      } finally { state.summaryLoading = null; }
    })();
    return state.summaryLoading;
  }
  async function changeQuantity(id, quantity, expectedRevision) {
    const key = String(id || "");
    const revision = Number(expectedRevision);
    if (!key || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0 || !Number.isInteger(revision)) return { ok: false, kind: "invalid", error: "Invalid work-order quantity command" };
    try {
      const response = await fetchImpl(`${url}/${encodeURIComponent(key)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": `"${revision}"` },
        body: JSON.stringify({ quantity: Number(quantity), expectedRevision: revision }),
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409) return { ok: false, kind: "conflict", item: payload.item || null, error: payload.error || "Work order changed by another client" };
      if (!response.ok || !payload?.ok || !payload.item) return { ok: false, kind: "unavailable", error: payload?.error || `Work-order write API returned ${response.status}` };
      const item = payload.item;
      state.items = state.items.map((existing) => String(existing.id) === String(item.id) ? { ...existing, ...item } : existing);
      state.etag = response.headers?.get?.("ETag") || state.etag;
      state.fetchedAt = now();
      const cached = state.details.get(key);
      if (cached?.item) {
        cached.item = { ...cached.item, ...item, operations: cached.item.operations };
        // A PATCH response has the aggregate ETag but not the recalculated
        // operations. Do not send that new ETag for the next detail fetch or
        // the server may legitimately return 304 for stale slot data.
        cached.etag = "";
        cached.fetchedAt = 0;
      }
      return { ok: true, item };
    } catch (error) {
      return { ok: false, kind: "unavailable", error: error?.message || "Work-order write API is unavailable" };
    }
  }
  async function changeSlotSchedule(id, operationId, plannedStart, expectedRevision) {
    const key = String(id || "");
    const operationKey = String(operationId || "");
    const revision = Number(expectedRevision);
    const start = new Date(plannedStart);
    if (!key || !operationKey || Number.isNaN(start.getTime()) || !Number.isInteger(revision)) {
      return { ok: false, kind: "invalid", error: "Invalid planning slot schedule command" };
    }
    try {
      const response = await fetchImpl(`${url}/${encodeURIComponent(key)}/operations/${encodeURIComponent(operationKey)}/slot`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": `"${revision}"` },
        body: JSON.stringify({ plannedStart: start.toISOString(), expectedRevision: revision }),
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409) return { ok: false, kind: "conflict", item: payload.item || null, error: payload.error || "Work order changed by another client" };
      if (!response.ok || !payload?.ok || !payload.item) return { ok: false, kind: "unavailable", error: payload?.error || `Work-order schedule API returned ${response.status}` };
      const item = payload.item;
      state.items = state.items.map((existing) => String(existing.id) === String(item.id) ? { ...existing, ...item } : existing);
      state.etag = response.headers?.get?.("ETag") || state.etag;
      state.fetchedAt = now();
      const cached = state.details.get(key);
      if (cached) { cached.etag = ""; cached.fetchedAt = 0; }
      return { ok: true, item };
    } catch (error) {
      return { ok: false, kind: "unavailable", error: error?.message || "Work-order schedule API is unavailable" };
    }
  }
  return { refresh, refreshSummary, refreshDetail, changeQuantity, changeSlotSchedule, getItems: () => state.items.map((item) => ({ ...item })), getSummary: () => state.summary ? { ...state.summary } : null, getDetail: (id) => state.details.get(String(id || ""))?.item || null, getStatus: () => ({ available: Boolean(state.items.length), loading: Boolean(state.loading), error: state.error, fetchedAt: state.fetchedAt, summaryAvailable: Boolean(state.summary), summaryLoading: Boolean(state.summaryLoading), summaryError: state.summaryError, summaryFetchedAt: state.summaryFetchedAt }) };
}
