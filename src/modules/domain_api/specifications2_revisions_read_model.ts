const MAX_AGE_MS = 30_000;

type UnknownRecord = Record<string, unknown>;
type FetchLike = typeof globalThis.fetch;

export interface Specifications2RevisionsReadModelOptions {
  fetchImpl?: FetchLike;
  url?: string;
  now?: () => number;
}

export interface Specifications2RevisionReadState {
  item: UnknownRecord | null;
  etag: string;
  fetchedAt: number;
  loading: Promise<Specifications2RevisionRefreshResult> | null;
  error: string;
}

export interface Specifications2RevisionRefreshResult extends UnknownRecord {
  ok: boolean;
  changed: boolean;
  item: UnknownRecord | null;
  error?: string;
  notModified?: boolean;
}

export interface Specifications2RevisionsReadModel {
  refreshBySource(sourceEntryId: unknown, options?: { force?: boolean }): Promise<Specifications2RevisionRefreshResult>;
  getBySource(sourceEntryId: unknown): Specifications2RevisionReadState;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function errorMessage(error: unknown, fallback: string): string {
  return String(record(error).message || fallback);
}

export function createSpecifications2RevisionsReadModel({
  fetchImpl = globalThis.fetch,
  url = "/api/v1/specifications2/revisions",
  now = () => Date.now(),
}: Specifications2RevisionsReadModelOptions = {}): Specifications2RevisionsReadModel {
  const state: { bySource: Map<string, Specifications2RevisionReadState> } = { bySource: new Map() };
  const getBySource = (sourceEntryId: unknown): Specifications2RevisionReadState => state.bySource.get(String(sourceEntryId || "")) || {
    item: null,
    etag: "",
    fetchedAt: 0,
    loading: null,
    error: "",
  };

  async function refreshBySource(sourceEntryId: unknown, { force = false }: { force?: boolean } = {}): Promise<Specifications2RevisionRefreshResult> {
    const key = String(sourceEntryId || "");
    if (!key) return { ok: false, changed: false, item: null, error: "Missing source entry id" };
    const cached = getBySource(key);
    // A confirmed 404 is also a valid projection. Cache it for the same
    // short TTL so an unpublished local draft does not issue a request on
    // every render.
    if (!force && cached.fetchedAt && now() - cached.fetchedAt < MAX_AGE_MS) return { ok: true, changed: false, item: cached.item };
    if (cached.loading) return cached.loading;
    cached.loading = (async (): Promise<Specifications2RevisionRefreshResult> => {
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
        if (response.status === 404) {
          cached.item = null;
          cached.error = "";
          cached.fetchedAt = now();
          return { ok: true, changed: false, item: null };
        }
        if (!response.ok) throw new Error(`Specifications 2.0 read API returned ${response.status}`);
        const payload = record(await response.json());
        const item = record(payload.item);
        if (!payload.ok || !item.id) throw new Error(String(payload.error || "Specifications 2.0 read API returned an invalid payload"));
        const changed = JSON.stringify(cached.item) !== JSON.stringify(item);
        cached.item = item;
        cached.etag = response.headers?.get?.("ETag") || cached.etag;
        cached.error = "";
        cached.fetchedAt = now();
        return { ok: true, changed, item: cached.item };
      } catch (error: unknown) {
        cached.error = errorMessage(error, "Specifications 2.0 read API is unavailable");
        return { ok: false, changed: false, item: cached.item, error: cached.error };
      } finally {
        cached.loading = null;
      }
    })();
    state.bySource.set(key, cached);
    return cached.loading;
  }

  return { refreshBySource, getBySource };
}
