function makeIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `system-domains-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSystemDomainsCommands({ fetchImpl = globalThis.fetch, url = "/api/v1/system-domains" } = {}) {
  async function getCapabilities() {
    try {
      const response = await fetchImpl(`${url}/capabilities`, {
        method: "GET", credentials: "same-origin", cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) return { ok: false, enabled: false, error: payload?.error || `System Domains capabilities returned ${response.status}` };
      return { ok: true, enabled: payload.capabilities?.serverCommandsEnabled === true, capabilities: payload.capabilities || {} };
    } catch (error) { return { ok: false, enabled: false, error: error?.message || "System Domains capabilities are unavailable" }; }
  }

  async function replace(domains, { expectedRevision, surface = "", idempotencyKey = makeIdempotencyKey() } = {}) {
    const revision = Number(expectedRevision);
    const commandSurface = String(surface || "").trim();
    if (!domains || typeof domains !== "object" || !Number.isInteger(revision) || revision < 1 || !commandSurface) {
      return { ok: false, conflict: false, error: "System Domains payload, surface and current revision are required" };
    }
    try {
      const response = await fetchImpl(url, {
        method: "PUT", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", "If-Match": `"${revision}"`, "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ domains, surface: commandSurface, expectedRevision: revision }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409) return { ok: false, conflict: Boolean(payload?.conflict), error: payload?.error || "System Domains revision conflict", revision: Number(payload?.revision || 0) };
      if (!response.ok || !payload?.ok || !payload?.item) return { ok: false, conflict: false, error: payload?.error || `System Domains command returned ${response.status}` };
      return { ok: true, item: payload.item, revision: Number(payload.revision || 0), snapshotSync: payload.snapshotSync || null };
    } catch (error) { return { ok: false, conflict: false, error: error?.message || "System Domains command is unavailable" }; }
  }
  return { getCapabilities, replace };
}
