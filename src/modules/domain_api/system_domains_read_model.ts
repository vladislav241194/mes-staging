const MAX_AGE_MS = 30_000;

type UnknownRecord = Record<string, unknown>;
type FetchLike = typeof globalThis.fetch;

interface SystemDomainsItem extends UnknownRecord {
  registries: unknown;
}

interface SystemDomainsRefreshResult extends UnknownRecord {
  ok: boolean;
  changed: boolean;
  item: SystemDomainsItem | null;
  revision?: number;
  notModified?: boolean;
  error?: string;
}

interface SystemDomainsReadState {
  item: SystemDomainsItem | null;
  etag: string;
  revision: number;
  fetchedAt: number;
  loading: Promise<SystemDomainsRefreshResult> | null;
  error: string;
}

export interface SystemDomainsReadModelOptions {
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

// Read model for the normalized server projection.  It intentionally does not
// overwrite a browser snapshot by itself: callers must verify parity first,
// because System Domains still has compatibility writes during the migration.
export function createSystemDomainsReadModel({ fetchImpl = globalThis.fetch, url = "/api/v1/system-domains", now = () => Date.now() }: SystemDomainsReadModelOptions = {}) {
  const state: SystemDomainsReadState = { item: null, etag: "", revision: 0, fetchedAt: -1, loading: null, error: "" };
  async function refresh({ force = false }: { force?: boolean } = {}): Promise<SystemDomainsRefreshResult> {
    if (!force && state.fetchedAt >= 0 && now() - state.fetchedAt < MAX_AGE_MS) {
      return {
        ok: true,
        changed: false,
        notModified: true,
        item: state.item,
        revision: state.revision,
      };
    }
    if (state.loading) return state.loading;
    state.loading = (async () => {
      try {
        const headers: Record<string, string> = state.etag ? { "If-None-Match": state.etag } : {};
        const response = await fetchImpl(url, { cache: "no-store", credentials: "same-origin", headers });
        if (response.status === 304) {
          state.error = ""; state.fetchedAt = now();
          return {
            ok: true,
            changed: false,
            notModified: true,
            item: state.item,
            revision: state.revision,
          };
        }
        if (!response.ok) throw new Error(`System Domains read API returned ${response.status}`);
        const payload = record(await response.json());
        const item = record(payload.item);
        if (!payload.ok || !item.registries) throw new Error(String(payload.error || "System Domains read API returned an invalid payload"));
        const changed = JSON.stringify(state.item) !== JSON.stringify(item);
        state.item = item as SystemDomainsItem;
        state.etag = response.headers?.get?.("ETag") || state.etag;
        state.revision = Number.isInteger(Number(payload.revision)) && Number(payload.revision) > 0
          ? Number(payload.revision)
          : state.revision;
        state.fetchedAt = now(); state.error = "";
        return { ok: true, changed, notModified: false, item: state.item, revision: state.revision };
      } catch (error: unknown) {
        state.error = errorMessage(error, "System Domains read API is unavailable");
        return { ok: false, changed: false, item: state.item, error: state.error };
      } finally { state.loading = null; }
    })();
    return state.loading;
  }
  return {
    refresh,
    get: () => ({
      item: state.item,
      etag: state.etag,
      revision: state.revision,
      fetchedAt: state.fetchedAt,
      error: state.error,
    }),
  };
}
