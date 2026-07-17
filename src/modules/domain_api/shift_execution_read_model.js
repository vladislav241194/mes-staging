const MAX_AGE_MS = 30_000;

// Thin browser projection for the future server-owned workshop. It never
// mutates the current UI snapshot: callers explicitly decide when the server
// projection is authoritative for a particular board surface.
export function createShiftExecutionReadModel({
  fetchImpl = globalThis.fetch,
  baseUrl = "/api/v1/workshop/shift-execution",
  now = () => Date.now(),
} = {}) {
  let state = { items: [], etag: "", fetchedAt: 0, loading: null, error: "" };

  async function refresh({ force = false, limit = 250 } = {}) {
    if (!force && state.fetchedAt && now() - state.fetchedAt < MAX_AGE_MS) {
      return { ok: true, changed: false, items: state.items, ...state };
    }
    if (state.loading) return state.loading;
    state.loading = (async () => {
      try {
        const query = new URLSearchParams({ limit: String(Math.max(1, Math.min(500, Number(limit) || 250))) });
        const response = await fetchImpl(`${baseUrl}?${query}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: state.etag ? { "If-None-Match": state.etag } : {},
        });
        if (response.status === 304) {
          state = { ...state, fetchedAt: now(), loading: null, error: "" };
          return { ok: true, changed: false, items: state.items, ...state };
        }
        if (!response.ok) throw new Error(`Shift execution read API returned ${response.status}`);
        const payload = await response.json();
        if (!payload?.ok || !Array.isArray(payload.items)) throw new Error(payload?.error || "Shift execution read API returned an invalid payload");
        const previous = JSON.stringify(state.items);
        const items = payload.items;
        state = {
          items,
          etag: response.headers?.get?.("ETag") || state.etag,
          fetchedAt: now(),
          loading: null,
          error: "",
        };
        return { ok: true, changed: JSON.stringify(items) !== previous, items, ...state };
      } catch (error) {
        state = { ...state, loading: null, error: error?.message || "Shift execution read API is unavailable" };
        return { ok: false, changed: false, items: state.items, ...state };
      }
    })();
    return state.loading;
  }

  function getItems() { return [...state.items]; }
  function getBySourceRowId(sourceRowId = "") {
    const id = String(sourceRowId || "").trim();
    return state.items.find((item) => item.sourceRowId === id) || null;
  }
  function getBySourceSlotId(sourceSlotId = "") {
    const id = String(sourceSlotId || "").trim();
    return state.items.find((item) => item.sourceSlotId === id) || null;
  }
  function getState() { return { ...state, items: getItems(), loading: null }; }

  return { refresh, getItems, getBySourceRowId, getBySourceSlotId, getState };
}
