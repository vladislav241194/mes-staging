type UnknownRecord = Record<string, unknown>;
type FetchLike = typeof globalThis.fetch;

export interface SystemDomainsCommandsOptions {
  fetchImpl?: FetchLike;
  url?: string;
}

export interface SystemDomainsReplaceOptions {
  expectedRevision?: unknown;
  surface?: unknown;
  idempotencyKey?: string;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function errorMessage(error: unknown, fallback: string): string {
  return String(record(error).message || fallback);
}

function makeIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() || `system-domains-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSystemDomainsCommands({ fetchImpl = globalThis.fetch, url = "/api/v1/system-domains" }: SystemDomainsCommandsOptions = {}) {
  async function getCapabilities() {
    try {
      const response = await fetchImpl(`${url}/capabilities`, {
        method: "GET", credentials: "same-origin", cache: "no-store",
      });
      const payload = record(await response.json().catch(() => ({})));
      if (!response.ok || !payload.ok) return { ok: false, enabled: false, error: payload.error || `System Domains capabilities returned ${response.status}` };
      const capabilities = record(payload.capabilities);
      return { ok: true, enabled: capabilities.serverCommandsEnabled === true, capabilities: payload.capabilities || {} };
    } catch (error: unknown) { return { ok: false, enabled: false, error: errorMessage(error, "System Domains capabilities are unavailable") }; }
  }

  async function replace(domains: unknown, { expectedRevision, surface = "", idempotencyKey = makeIdempotencyKey() }: SystemDomainsReplaceOptions = {}) {
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
      const payload = record(await response.json().catch(() => ({})));
      if (response.status === 409) return { ok: false, status: response.status, code: String(payload.code || "revision-conflict"), conflict: Boolean(payload.conflict), error: payload.error || "System Domains revision conflict", revision: Number(payload.revision || 0) };
      if (!response.ok || !payload.ok || !payload.item) return {
        ok: false,
        conflict: false,
        status: response.status,
        code: String(payload.code || "system-domains-command-rejected"),
        authenticationRequired: response.status === 401,
        authorizationDenied: response.status === 403,
        error: payload.error || `System Domains command returned ${response.status}`,
      };
      return { ok: true, item: payload.item, revision: Number(payload.revision || 0), snapshotSync: payload.snapshotSync || null };
    } catch (error: unknown) { return { ok: false, conflict: false, error: errorMessage(error, "System Domains command is unavailable") }; }
  }
  return { getCapabilities, replace };
}
