const MAX_AGE_MS = 30_000;

export function createSpecifications2WorkOrderCommands({ fetchImpl = globalThis.fetch, baseUrl = "/api/v1/specifications2", now = () => Date.now() } = {}) {
  let capability = { enabled: false, primaryPostgres: false, fetchedAt: 0, loading: null, error: "" };
  async function refreshCapability({ force = false } = {}) {
    if (!force && capability.fetchedAt && now() - capability.fetchedAt < MAX_AGE_MS) return { ok: true, changed: false, ...capability };
    if (capability.loading) return capability.loading;
    capability.loading = (async () => {
      try {
        const response = await fetchImpl(`${baseUrl}/capabilities`, { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) throw new Error(`Specifications 2.0 capability API returned ${response.status}`);
        const payload = await response.json();
        if (!payload?.ok || !payload.capabilities) throw new Error(payload?.error || "Specifications 2.0 capability API returned an invalid payload");
        const next = { enabled: payload.capabilities.workOrderCreationEnabled === true, primaryPostgres: payload.capabilities.workOrderPrimaryPostgres === true, fetchedAt: now(), loading: null, error: "" };
        const changed = next.enabled !== capability.enabled || next.primaryPostgres !== capability.primaryPostgres;
        capability = next;
        return { ok: true, changed, ...capability };
      } catch (error) { capability = { ...capability, loading: null, error: error?.message || "Specifications 2.0 capability API is unavailable" }; return { ok: false, changed: false, ...capability }; }
    })();
    return capability.loading;
  }
  async function createWorkOrder({ revisionId, routeSourceDraftId, quantity, idempotencyKey }) {
    const response = await fetchImpl(`${baseUrl}/revisions/${encodeURIComponent(revisionId)}/work-orders`, {
      method: "POST", cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ routeSourceDraftId, quantity, idempotencyKey }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Specifications 2.0 work-order command returned ${response.status}`);
    return payload;
  }
  return { refreshCapability, getCapability: () => ({ ...capability, loading: null }), createWorkOrder };
}
