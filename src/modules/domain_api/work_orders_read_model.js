import { isExactIsoCalendarDate, isExactIsoInstantWithOffset } from "../../domain/calendar_date.js";

const DEFAULT_MAX_AGE_MS = 30_000;

function makePlanningIdempotencyKey(prefix = "planning") {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${random}`;
}

function normalizeItems(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && item.id) : [];
}

export function inspectPlanningCompatibilityResult(payload = {}) {
  const snapshotSync = payload?.snapshotSync && typeof payload.snapshotSync === "object" && !Array.isArray(payload.snapshotSync)
    ? payload.snapshotSync
    : null;
  const total = Number(snapshotSync?.total || 0);
  const applied = Number(snapshotSync?.applied || 0);
  const failed = Number(snapshotSync?.failed || 0);
  const conflicts = Number(snapshotSync?.conflicts || 0);
  const skipped = Number(snapshotSync?.skipped || 0);
  const compatibilityReceipt = payload?.compatibilityReceipt
    && typeof payload.compatibilityReceipt === "object"
    && !Array.isArray(payload.compatibilityReceipt)
    ? payload.compatibilityReceipt
    : null;
  // Aggregate counters can omit this command because the worker is bounded,
  // or report total=0 after its row became a terminal conflict. Rollback is
  // ready only when the server returns the durable receipt for this exact
  // actor/idempotency/aggregate revision and no unresolved row remains for
  // the aggregate.
  const compatibilityReady = compatibilityReceipt?.found === true
    && compatibilityReceipt?.exact === true
    && compatibilityReceipt?.ready === true
    && String(compatibilityReceipt?.state || "") === "applied"
    && Number(compatibilityReceipt?.unresolvedCount) === 0;
  return Object.freeze({ snapshotSync, compatibilityReceipt, compatibilityReady });
}

// Projection cache: a failed request never mutates snapshot-backed planning data.
export function createWorkOrdersReadModel({ fetchImpl = globalThis.fetch, url = "/api/v1/planning/work-orders", now = () => Date.now() } = {}) {
  const state = {
    items: [], etag: "", fetchedAt: 0, loading: null, error: "", details: new Map(),
    summary: null, summaryEtag: "", summaryFetchedAt: 0, summaryLoading: null, summaryError: "",
    bootstrapEntries: new Map(), bootstrapLoading: new Map(), bootstrapError: "", bootstrapActiveId: "", bootstrapCapability: "unknown", bootstrapRequestSequence: 0, bootstrapDataEpoch: 0,
  };

  function findItemByIdOrNumber(id) {
    const key = String(id || "");
    return state.items.find((item) => String(item?.id || "") === key)
      || state.items.find((item) => String(item?.number || "") === key)
      || null;
  }

  function invalidateWorkbenchBootstrap() {
    // A write or direct detail refresh is newer than every in-flight
    // bootstrap response. Its epoch is checked before such a response may
    // update either the selected aggregate or the compact list cache.
    state.bootstrapDataEpoch += 1;
    state.bootstrapEntries.clear();
    state.bootstrapActiveId = "";
  }

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
        invalidateWorkbenchBootstrap();
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
        invalidateWorkbenchBootstrap();
        return { ok: true, changed, item: cached.item };
      } catch (error) {
        cached.error = error?.message || "Work-order detail API is unavailable";
        return { ok: false, changed: false, item: cached.item, error: cached.error };
      } finally { cached.loading = null; }
    })();
    state.details.set(key, cached);
    return cached.loading;
  }

  async function refreshLegacyWorkbenchBootstrap(requestedId, { force = false } = {}) {
    const listResult = await refresh({ force });
    if (!listResult.ok) return { ok: false, changed: false, items: state.items, activeId: "", item: null, error: listResult.error };
    const selected = findItemByIdOrNumber(requestedId) || state.items[0] || null;
    if (!selected) return { ok: true, changed: listResult.changed, items: state.items, activeId: "", item: null };
    const detailResult = await refreshDetail(selected.id, { force });
    return {
      ok: detailResult.ok,
      changed: Boolean(listResult.changed || detailResult.changed),
      items: state.items,
      activeId: detailResult.item?.id || "",
      item: detailResult.item || null,
      error: detailResult.error || "",
    };
  }

  async function refreshWorkbenchBootstrap(activeId = "", { force = false } = {}) {
    const requestedId = String(activeId || "").trim();
    const requestedItem = requestedId ? findItemByIdOrNumber(requestedId) : null;
    const requestKey = requestedItem?.id || requestedId || "__default__";
    const cached = state.bootstrapEntries.get(requestKey) || null;
    const cachedDetail = cached?.activeId ? state.details.get(cached.activeId)?.item || null : null;
    if (!force && cached && now() - cached.fetchedAt < DEFAULT_MAX_AGE_MS && ((cached.activeId && cachedDetail) || (!state.items.length && !cached.activeId))) {
      // A cache hit is still the newest visible selection. Invalidate an
      // older in-flight response so it cannot replace this selection's
      // shared list state after the caller has already moved on.
      state.bootstrapRequestSequence += 1;
      return { ok: true, changed: false, items: state.items, activeId: cached.activeId, item: cachedDetail };
    }
    if (state.bootstrapCapability === "unsupported") return refreshLegacyWorkbenchBootstrap(requestedId, { force });
    const inFlight = state.bootstrapLoading.get(requestKey);
    if (inFlight) return inFlight;
    const requestSequence = ++state.bootstrapRequestSequence;
    const dataEpoch = state.bootstrapDataEpoch;
    let request;
    request = (async () => {
      try {
        const params = requestedId ? `?active=${encodeURIComponent(requestedId)}` : "";
        const response = await fetchImpl(`${url}/bootstrap${params}`, {
          headers: cached?.etag ? { "If-None-Match": cached.etag } : {},
          cache: "no-store",
          credentials: "same-origin",
        });
        // The endpoint is additive. During a mixed-version release an older
        // server can safely retain the established list + detail path without
        // repeatedly probing a capability it already proved unavailable.
        if (response.status === 404 || response.status === 405) {
          state.bootstrapCapability = "unsupported";
          return refreshLegacyWorkbenchBootstrap(requestedId, { force });
        }
        if (response.status === 304) {
          if (dataEpoch !== state.bootstrapDataEpoch) {
            const selected = findItemByIdOrNumber(requestedId) || null;
            return { ok: true, changed: false, items: state.items, activeId: selected?.id || "", item: selected ? state.details.get(String(selected.id))?.item || null : null };
          }
          if (!cached) throw new Error("Work-order bootstrap API returned 304 without a cached response");
          cached.fetchedAt = now();
          return { ok: true, changed: false, items: state.items, activeId: cached.activeId, item: cached.activeId ? state.details.get(cached.activeId)?.item || null : null };
        }
        if (!response.ok) throw new Error(`Work-order bootstrap API returned ${response.status}`);
        const payload = await response.json();
        if (!payload?.ok) throw new Error(payload?.error || "Work-order bootstrap API returned an invalid payload");
        const items = normalizeItems(payload.items);
        const selectedId = String(payload.activeId || "");
        const item = payload.item?.id ? payload.item : null;
        if ((selectedId && !item) || (item && String(item.id) !== selectedId)) {
          throw new Error("Work-order bootstrap API returned an inconsistent selected aggregate");
        }
        if (dataEpoch !== state.bootstrapDataEpoch) {
          const selected = findItemByIdOrNumber(requestedId) || null;
          return { ok: true, changed: false, items: state.items, activeId: selected?.id || "", item: selected ? state.details.get(String(selected.id))?.item || null : null };
        }
        const fetchedAt = now();
        const existingDetail = selectedId ? state.details.get(selectedId)?.item || null : null;
        const changed = JSON.stringify(items) !== JSON.stringify(state.items)
          || JSON.stringify(item) !== JSON.stringify(existingDetail);
        const entry = {
          activeId: selectedId,
          etag: response.headers?.get?.("ETag") || "",
          fetchedAt,
        };
        state.bootstrapEntries.set(requestKey, entry);
        if (selectedId) state.bootstrapEntries.set(selectedId, entry);
        if (selectedId && item) state.details.set(selectedId, { item, etag: "", fetchedAt, loading: null, error: "" });
        // Different selections can be in flight on a slow link. Keep their
        // individual detail caches, but only the most recently requested one
        // may replace the shared list/current bootstrap state.
        const isCurrentRequest = requestSequence === state.bootstrapRequestSequence;
        if (isCurrentRequest) {
          state.items = items;
          // A combined response ETag must never be presented to the narrower
          // list/detail endpoints. They maintain their own validators.
          state.etag = "";
          state.fetchedAt = fetchedAt;
          state.bootstrapActiveId = selectedId;
          state.bootstrapCapability = "supported";
          state.bootstrapError = "";
        }
        return { ok: true, changed: isCurrentRequest && changed, items: state.items, activeId: selectedId, item };
      } catch (error) {
        state.bootstrapError = error?.message || "Work-order bootstrap API is unavailable";
        return { ok: false, changed: false, items: state.items, activeId: "", item: null, error: state.bootstrapError };
      } finally {
        if (state.bootstrapLoading.get(requestKey) === request) state.bootstrapLoading.delete(requestKey);
      }
    })();
    state.bootstrapLoading.set(requestKey, request);
    return request;
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
  async function getCommandCapabilities() {
    try {
      const response = await fetchImpl(`${url}/capabilities`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok !== true) {
        return {
          ok: false,
          status: Number(response.status || 0),
          authenticated: response.status !== 401,
          authorizationDenied: response.status === 403,
          unavailable: response.status >= 500 || response.status === 0,
          error: String(payload?.error || `Planning command capabilities returned ${response.status}`),
        };
      }
      return { ...payload, ok: true, status: response.status };
    } catch (error) {
      return { ok: false, status: 0, unavailable: true, error: error?.message || "Planning command capabilities are unavailable" };
    }
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
      if (response.status === 409) {
        const item = payload.item || null;
        if (item) {
          state.items = state.items.map((existing) => String(existing.id) === String(item.id) ? { ...existing, ...item } : existing);
          state.etag = response.headers?.get?.("ETag") || state.etag;
          state.fetchedAt = now();
          invalidateWorkbenchBootstrap();
          const cached = state.details.get(key);
          if (cached?.item) {
            cached.item = { ...cached.item, ...item, operations: cached.item.operations };
            cached.etag = "";
            cached.fetchedAt = 0;
          }
        }
        return { ok: false, kind: "conflict", item, error: payload.error || "Work order changed by another client" };
      }
      if (!response.ok || !payload?.ok || !payload.item) return { ok: false, kind: "unavailable", error: payload?.error || `Work-order write API returned ${response.status}` };
      const item = payload.item;
      state.items = state.items.map((existing) => String(existing.id) === String(item.id) ? { ...existing, ...item } : existing);
      state.etag = response.headers?.get?.("ETag") || state.etag;
      state.fetchedAt = now();
      invalidateWorkbenchBootstrap();
      const cached = state.details.get(key);
      if (cached?.item) {
        cached.item = { ...cached.item, ...item, operations: cached.item.operations };
        // A PATCH response has the aggregate ETag but not the recalculated
        // operations. Do not send that new ETag for the next detail fetch or
        // the server may legitimately return 304 for stale slot data.
        cached.etag = "";
        cached.fetchedAt = 0;
      }
      return { ok: true, item, ...inspectPlanningCompatibilityResult(payload) };
    } catch (error) {
      return { ok: false, kind: "unavailable", error: error?.message || "Work-order write API is unavailable" };
    }
  }
  async function changeStartDate(id, planningStartDate, expectedRevision, { idempotencyKey = makePlanningIdempotencyKey("planning-start-date") } = {}) {
    const key = String(id || "");
    const date = planningStartDate === null
      ? null
      : typeof planningStartDate === "string" ? planningStartDate.trim() : undefined;
    const revision = Number(expectedRevision);
    const requestKey = String(idempotencyKey || "").trim();
    if (!key || (date !== null && !isExactIsoCalendarDate(date))
      || !Number.isInteger(revision) || !requestKey || requestKey.length > 160) {
      return { ok: false, kind: "invalid", error: "Invalid work-order start-date command" };
    }
    try {
      const response = await fetchImpl(`${url}/${encodeURIComponent(key)}/start-date`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${revision}"`,
          "Idempotency-Key": requestKey,
        },
        body: JSON.stringify({ planningStartDate: date, expectedRevision: revision }),
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409
        && (payload?.code === "superseded-idempotent-replay" || payload?.superseded === true)) {
        const item = payload.item || null;
        if (item) {
          state.items = state.items.map((existing) => String(existing.id) === String(item.id) ? { ...existing, ...item } : existing);
          state.etag = response.headers?.get?.("ETag") || state.etag;
          state.fetchedAt = now();
          invalidateWorkbenchBootstrap();
          const cached = state.details.get(key);
          if (cached?.item) {
            cached.item = { ...cached.item, ...item, operations: cached.item.operations };
            cached.etag = "";
            cached.fetchedAt = 0;
          }
        }
        return {
          ok: false,
          kind: "superseded",
          code: "superseded-idempotent-replay",
          superseded: true,
          item,
          error: payload?.error || "The original start-date command has been superseded",
          ...inspectPlanningCompatibilityResult(payload),
        };
      }
      if (response.status === 409) {
        const item = payload.item || null;
        const definitiveConflict = payload?.conflict === true && Boolean(item);
        if (!definitiveConflict) {
          // Parity/schema readiness responses are emitted before the owner can
          // inspect its idempotency receipt. They do not prove that the
          // retained command lost an aggregate race and must never discard its
          // exact retry key.
          return {
            ok: false,
            kind: "unavailable",
            code: String(payload?.code || (payload?.fallbackReason ? "planning-parity-not-ready" : "planning-start-date-not-ready")),
            reconciliationPending: true,
            error: payload?.error || "Planning start-date owner is temporarily unavailable",
          };
        }
        if (item) {
          state.items = state.items.map((existing) => String(existing.id) === String(item.id) ? { ...existing, ...item } : existing);
          state.etag = response.headers?.get?.("ETag") || state.etag;
          state.fetchedAt = now();
          invalidateWorkbenchBootstrap();
          const cached = state.details.get(key);
          if (cached?.item) {
            cached.item = { ...cached.item, ...item, operations: cached.item.operations };
            cached.etag = "";
            cached.fetchedAt = 0;
          }
        }
        return { ok: false, kind: "conflict", item, error: payload.error || "Work order changed by another client" };
      }
      if (!response.ok || !payload?.ok || !payload.item) return { ok: false, kind: "unavailable", error: payload?.error || `Work-order start-date API returned ${response.status}` };
      const item = payload.item;
      state.items = state.items.map((existing) => String(existing.id) === String(item.id) ? { ...existing, ...item } : existing);
      state.etag = response.headers?.get?.("ETag") || state.etag;
      state.fetchedAt = now();
      invalidateWorkbenchBootstrap();
      const cached = state.details.get(key);
      if (cached?.item) {
        cached.item = { ...cached.item, ...item, operations: cached.item.operations };
        cached.etag = "";
        cached.fetchedAt = 0;
      }
      return {
        ok: true,
        item,
        idempotentReplay: payload.idempotentReplay === true,
        superseded: payload.superseded === true,
        ...inspectPlanningCompatibilityResult(payload),
      };
    } catch (error) {
      return { ok: false, kind: "unavailable", error: error?.message || "Work-order start-date API is unavailable" };
    }
  }
  async function changeSlotSchedule(id, operationId, slotId, plannedStart, expectedRevision) {
    const key = String(id || "");
    const operationKey = String(operationId || "");
    const slotKey = String(slotId || "");
    const revision = Number(expectedRevision);
    if (!key || !operationKey || !slotKey || !isExactIsoInstantWithOffset(plannedStart) || !Number.isInteger(revision)) {
      return { ok: false, kind: "invalid", error: "Invalid planning slot schedule command" };
    }
    const start = new Date(plannedStart);
    try {
      const response = await fetchImpl(`${url}/${encodeURIComponent(key)}/operations/${encodeURIComponent(operationKey)}/slot`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": `"${revision}"` },
        body: JSON.stringify({ slotId: slotKey, plannedStart: start.toISOString(), expectedRevision: revision }),
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409) return { ok: false, kind: "conflict", item: payload.item || null, error: payload.error || "Work order changed by another client" };
      if (!response.ok || !payload?.ok || !payload.item) return { ok: false, kind: "unavailable", error: payload?.error || `Work-order schedule API returned ${response.status}` };
      if (!payload.slot?.id || String(payload.slot.id) !== slotKey) return { ok: false, kind: "unavailable", error: "Planning owner returned another physical slot" };
      const item = payload.item;
      state.items = state.items.map((existing) => String(existing.id) === String(item.id) ? { ...existing, ...item } : existing);
      state.etag = response.headers?.get?.("ETag") || state.etag;
      state.fetchedAt = now();
      invalidateWorkbenchBootstrap();
      const cached = state.details.get(key);
      if (cached) { cached.etag = ""; cached.fetchedAt = 0; }
      return { ok: true, item, slot: payload.slot, ...inspectPlanningCompatibilityResult(payload) };
    } catch (error) {
      return { ok: false, kind: "unavailable", error: error?.message || "Work-order schedule API is unavailable" };
    }
  }
  return { refresh, refreshWorkbenchBootstrap, refreshSummary, refreshDetail, getCommandCapabilities, changeQuantity, changeStartDate, changeSlotSchedule, getItems: () => state.items.map((item) => ({ ...item })), getSummary: () => state.summary ? { ...state.summary } : null, getDetail: (id) => state.details.get(String(id || ""))?.item || null, getStatus: () => ({ available: Boolean(state.items.length), loading: Boolean(state.loading), error: state.error, fetchedAt: state.fetchedAt, bootstrapAvailable: state.bootstrapEntries.size > 0, bootstrapLoading: state.bootstrapLoading.size > 0, bootstrapError: state.bootstrapError, bootstrapCapability: state.bootstrapCapability, summaryAvailable: Boolean(state.summary), summaryLoading: Boolean(state.summaryLoading), summaryError: state.summaryError, summaryFetchedAt: state.summaryFetchedAt }) };
}
