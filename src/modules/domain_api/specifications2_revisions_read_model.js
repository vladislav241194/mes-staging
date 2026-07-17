const MAX_AGE_MS = 30_000;

export function createSpecifications2RevisionsReadModel({ fetchImpl = globalThis.fetch, url = "/api/v1/specifications2/revisions", now = () => Date.now() } = {}) {
  const state = { bySource: new Map() };
  const getBySource = (sourceEntryId) => state.bySource.get(String(sourceEntryId || "")) || { item: null, etag: "", fetchedAt: 0, loading: null, error: "" };
  async function refreshBySource(sourceEntryId, { force = false } = {}) {
    const key = String(sourceEntryId || "");
    if (!key) return { ok: false, changed: false, item: null, error: "Missing source entry id" };
    const cached = getBySource(key);
    // A confirmed 404 is also a valid projection.  Cache it for the same
    // short TTL so an unpublished local draft does not issue a request on
    // every render.
    if (!force && cached.fetchedAt && now() - cached.fetchedAt < MAX_AGE_MS) return { ok: true, changed: false, item: cached.item };
    if (cached.loading) return cached.loading;
    cached.loading = (async () => {
      try {
        const response = await fetchImpl(`${url}/by-source/${encodeURIComponent(key)}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: cached.etag ? { "If-None-Match": cached.etag } : {},
        });
        if (response.status === 304) {
          cached.error = "";
          cached.fetchedAt = now();
          return { ok: true, changed: false, item: cached.item, notModified: true };
        }
        if (response.status === 404) { cached.item = null; cached.error = ""; cached.fetchedAt = now(); return { ok: true, changed: false, item: null }; }
        if (!response.ok) throw new Error(`Specifications 2.0 read API returned ${response.status}`);
        const payload = await response.json();
        if (!payload?.ok || !payload.item?.id) throw new Error(payload?.error || "Specifications 2.0 read API returned an invalid payload");
        const changed = JSON.stringify(cached.item) !== JSON.stringify(payload.item);
        cached.item = payload.item;
        cached.etag = response.headers?.get?.("ETag") || cached.etag;
        cached.error = "";
        cached.fetchedAt = now();
        return { ok: true, changed, item: cached.item };
      } catch (error) { cached.error = error?.message || "Specifications 2.0 read API is unavailable"; return { ok: false, changed: false, item: cached.item, error: cached.error }; }
      finally { cached.loading = null; }
    })();
    state.bySource.set(key, cached);
    return cached.loading;
  }
  return { refreshBySource, getBySource: (id) => getBySource(id) };
}
