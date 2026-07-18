const MAX_AGE_MS = 30_000;
const MAX_SOURCE_ROW_IDS = 200;
const MAX_WORK_CENTER_IDS = 100;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isDateKey(value) {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function normalizeScopeIds(value, { label, limit }) {
  if (!Array.isArray(value)) return { error: `Dispatch scope requires ${label}` };
  const normalizedIds = [];
  for (const rawId of value) {
    const id = String(rawId ?? "").trim();
    if (!id) return { error: `Dispatch scope contains an empty ${label.slice(0, -1)}` };
    normalizedIds.push(id);
  }
  const ids = [...new Set(normalizedIds)].sort();
  if (!ids.length) return { error: `Dispatch scope requires at least one ${label.slice(0, -1)}` };
  if (ids.length > limit) return { error: `Dispatch scope supports at most ${limit} ${label}` };
  return { ids };
}

function sameScope(left = {}, right = {}) {
  return left?.dateKey === right?.dateKey
    && Array.isArray(left?.sourceRowIds)
    && Array.isArray(right?.sourceRowIds)
    && left.sourceRowIds.length === right.sourceRowIds.length
    && left.sourceRowIds.every((value, index) => value === right.sourceRowIds[index])
    && Array.isArray(left?.workCenterIds)
    && Array.isArray(right?.workCenterIds)
    && left.workCenterIds.length === right.workCenterIds.length
    && left.workCenterIds.every((value, index) => value === right.workCenterIds[index]);
}

function resolveScope({ sourceRowIds, workCenterIds, dateKey } = {}) {
  const sourceRows = normalizeScopeIds(sourceRowIds, { label: "source row ids", limit: MAX_SOURCE_ROW_IDS });
  if (sourceRows.error) return sourceRows;
  const workCenters = normalizeScopeIds(workCenterIds, { label: "work center ids", limit: MAX_WORK_CENTER_IDS });
  if (workCenters.error) return workCenters;
  const normalizedDateKey = String(dateKey || "").trim();
  if (!isDateKey(normalizedDateKey)) return { error: "Dispatch scope requires a valid YYYY-MM-DD date key" };

  const query = new URLSearchParams();
  query.set("dateKey", normalizedDateKey);
  for (const id of sourceRows.ids) query.append("sourceRowId", id);
  for (const id of workCenters.ids) query.append("workCenterId", id);
  return {
    key: `${normalizedDateKey}\u0000${sourceRows.ids.join("\u0000")}\u0000${workCenters.ids.join("\u0000")}`,
    query: query.toString(),
    scope: { dateKey: normalizedDateKey, sourceRowIds: sourceRows.ids, workCenterIds: workCenters.ids },
  };
}

function emptyResult({ error = "", scope = null } = {}) {
  return {
    ok: false,
    changed: false,
    items: [],
    carryovers: [],
    coveredSourceRowIds: [],
    coverageComplete: false,
    scope,
    error,
  };
}

// Compact, independently cached read projection for one visible dispatch
// board.  It intentionally does not mutate the wider shift-execution store:
// the caller owns the scope merge/delete policy through coveredSourceRowIds.
export function createShiftExecutionDispatchReadModel({
  fetchImpl = globalThis.fetch,
  baseUrl = "/api/v1/workshop/shift-execution/dispatch",
  now = () => Date.now(),
} = {}) {
  const entries = new Map();
  let activeScopeKey = "";

  function getEntry(scope) {
    const existing = entries.get(scope.key);
    if (existing) return existing;
    const entry = {
      ...scope,
      items: [],
      carryovers: [],
      coveredSourceRowIds: [],
      coverageComplete: false,
      serverScope: scope.scope,
      etag: "",
      fetchedAt: 0,
      hasPayload: false,
      loading: null,
      error: "",
    };
    entries.set(scope.key, entry);
    return entry;
  }

  function resultFor(entry, { ok = true, changed = false, error = entry?.error || "" } = {}) {
    if (!entry) return emptyResult({ error });
    return {
      ok,
      changed,
      items: [...entry.items],
      carryovers: [...entry.carryovers],
      coveredSourceRowIds: [...entry.coveredSourceRowIds],
      coverageComplete: entry.coverageComplete,
      scope: entry.serverScope || entry.scope,
      etag: entry.etag,
      fetchedAt: entry.fetchedAt,
      error,
    };
  }

  async function refresh(input = {}) {
    const scope = resolveScope(input);
    if (scope.error) return emptyResult({ error: scope.error });
    const entry = getEntry(scope);
    activeScopeKey = scope.key;
    if (!input.force && entry.hasPayload && now() - entry.fetchedAt < MAX_AGE_MS) {
      return resultFor(entry, { changed: false });
    }
    if (entry.loading) return entry.loading;

    entry.loading = (async () => {
      try {
        const response = await fetchImpl(`${baseUrl}?${entry.query}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: entry.etag ? { "If-None-Match": entry.etag } : {},
        });
        if (response.status === 304) {
          if (!entry.hasPayload) throw new Error("Dispatch read API returned 304 without a cached response");
          entry.fetchedAt = now();
          entry.error = "";
          return resultFor(entry, { changed: false });
        }
        if (!response.ok) throw new Error(`Dispatch read API returned ${response.status}`);
        const payload = await response.json();
        if (!payload?.ok
          || !Array.isArray(payload.items)
          || !Array.isArray(payload.carryovers)
          || !Array.isArray(payload.coveredSourceRowIds)
          || typeof payload.coverageComplete !== "boolean") {
          throw new Error(payload?.error || "Dispatch read API returned an invalid payload");
        }
        const serverScope = resolveScope(payload.scope || {});
        if (serverScope.error || !sameScope(scope.scope, serverScope.scope)) {
          throw new Error("Dispatch read API returned a response for another scope");
        }
        const nextEtag = response.headers?.get?.("ETag") || "";
        // A compact endpoint is expected to return 304 for an unchanged ETag.
        // If a proxy still sends 200, compare only the transport revision and
        // never serialize the potentially large board payload on the client.
        const changed = !entry.hasPayload || !nextEtag || nextEtag !== entry.etag;
        entry.items = payload.items;
        entry.carryovers = payload.carryovers;
        entry.coveredSourceRowIds = payload.coveredSourceRowIds;
        entry.coverageComplete = payload.coverageComplete;
        entry.serverScope = serverScope.scope;
        entry.etag = nextEtag || entry.etag;
        entry.fetchedAt = now();
        entry.hasPayload = true;
        entry.error = "";
        return resultFor(entry, { changed });
      } catch (error) {
        entry.error = error?.message || "Dispatch read API is unavailable";
        return resultFor(entry, { ok: false, changed: false, error: entry.error });
      } finally {
        entry.loading = null;
      }
    })();
    return entry.loading;
  }

  function getActiveEntry() { return activeScopeKey ? entries.get(activeScopeKey) || null : null; }
  function getItems() { return [...(getActiveEntry()?.items || [])]; }
  function getBySourceRowId(sourceRowId = "") {
    const id = String(sourceRowId || "").trim();
    return getActiveEntry()?.items.find((item) => item?.sourceRowId === id) || null;
  }
  function getBySourceSlotId(sourceSlotId = "") {
    const id = String(sourceSlotId || "").trim();
    return getActiveEntry()?.items.find((item) => item?.sourceSlotId === id) || null;
  }
  function getState() {
    const entry = getActiveEntry();
    if (!entry) return { ...emptyResult(), available: false, loading: false, etag: "", fetchedAt: 0 };
    return {
      ...resultFor(entry, { ok: entry.hasPayload }),
      available: entry.hasPayload,
      loading: Boolean(entry.loading),
    };
  }

  return { refresh, getItems, getBySourceRowId, getBySourceSlotId, getState };
}
