const DEFAULT_MAX_AGE_MS = 30_000;

function normalizedDate(value) {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function normalizedInstant(value) {
  const instant = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(instant)) return "";
  const date = new Date(instant);
  return Number.isFinite(date.getTime()) && date.toISOString() === instant ? instant : "";
}

function resolveBounds({ from, to, fromAt, toAt } = {}) {
  const normalizedFromAt = normalizedInstant(fromAt);
  const normalizedToAt = normalizedInstant(toAt);
  if (normalizedFromAt || normalizedToAt) {
    if (!normalizedFromAt || !normalizedToAt || normalizedToAt <= normalizedFromAt) return null;
    return {
      from: normalizedFromAt,
      to: normalizedToAt,
      query: { fromAt: normalizedFromAt, toAt: normalizedToAt },
      key: `instant:${normalizedFromAt}|${normalizedToAt}`,
    };
  }
  const normalizedFrom = normalizedDate(from);
  const normalizedTo = normalizedDate(to);
  if (!normalizedFrom || !normalizedTo || normalizedTo <= normalizedFrom) return null;
  return {
    from: normalizedFrom,
    to: normalizedTo,
    query: { from: normalizedFrom, to: normalizedTo },
    key: `date:${normalizedFrom}|${normalizedTo}`,
  };
}

function hasProjection(value) {
  return Boolean(value && typeof value === "object"
    && Array.isArray(value.routes)
    && Array.isArray(value.routeSteps)
    && Array.isArray(value.slots));
}

// A period cache is intentionally independent from the full planning runtime
// projection. Weekly Control is a read-only consumer: it must never hydrate or
// replace the global planning state just to draw one visible calendar week.
export function createPlanningPeriodReadModel({
  fetchImpl = globalThis.fetch,
  baseUrl = "/api/v1/planning/period",
  now = () => Date.now(),
  maxAgeMs = DEFAULT_MAX_AGE_MS,
} = {}) {
  const entries = new Map();

  function getEntry(bounds) {
    const key = bounds.key;
    const current = entries.get(key);
    if (current) return current;
    const entry = {
      ...bounds,
      projection: null,
      etag: "",
      fetchedAt: 0,
      loading: null,
      error: "",
      fallbackReason: "",
    };
    entries.set(key, entry);
    return entry;
  }

  async function refresh(input = {}) {
    const { force = false } = input;
    const bounds = resolveBounds(input);
    if (!bounds) {
      return { ok: false, changed: false, projection: null, error: "Planning period bounds are invalid" };
    }
    const entry = getEntry(bounds);
    if (!force && entry.projection && now() - entry.fetchedAt < maxAgeMs) {
      return { ok: true, changed: false, projection: entry.projection, fallbackReason: entry.fallbackReason };
    }
    if (entry.loading) return entry.loading;

    entry.loading = (async () => {
      try {
        const query = new URLSearchParams(entry.query);
        const response = await fetchImpl(`${baseUrl}?${query}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: entry.etag ? { "If-None-Match": entry.etag } : {},
        });
        if (response.status === 304) {
          if (!entry.projection) throw new Error("Planning period API returned 304 without a cached projection");
          entry.fetchedAt = now();
          entry.error = "";
          return { ok: true, changed: false, projection: entry.projection, fallbackReason: entry.fallbackReason };
        }
        if (!response.ok) throw new Error(`Planning period API returned ${response.status}`);
        const payload = await response.json();
        const projection = payload?.projection;
        if (!payload?.ok || !hasProjection(projection)) {
          throw new Error(payload?.error || "Planning period API returned an invalid projection");
        }
        const changed = JSON.stringify(projection) !== JSON.stringify(entry.projection);
        entry.projection = projection;
        entry.etag = response.headers?.get?.("ETag") || entry.etag;
        entry.fetchedAt = now();
        entry.error = "";
        entry.fallbackReason = String(payload?.fallbackReason || "");
        return { ok: true, changed, projection, fallbackReason: entry.fallbackReason };
      } catch (error) {
        entry.error = error?.message || "Planning period API is unavailable";
        return { ok: false, changed: false, projection: entry.projection, error: entry.error, fallbackReason: entry.fallbackReason };
      } finally {
        entry.loading = null;
      }
    })();
    return entry.loading;
  }

  function getProjection(input = {}) {
    const bounds = resolveBounds(input);
    return bounds ? entries.get(bounds.key)?.projection || null : null;
  }

  function shouldRefresh(input = {}) {
    const bounds = resolveBounds(input);
    if (!bounds) return false;
    const entry = entries.get(bounds.key);
    return !entry?.projection || now() - entry.fetchedAt >= maxAgeMs;
  }

  function getStatus(input = {}) {
    const bounds = resolveBounds(input);
    const entry = bounds ? entries.get(bounds.key) : null;
    return {
      available: Boolean(entry?.projection),
      loading: Boolean(entry?.loading),
      error: entry?.error || "",
      fallbackReason: entry?.fallbackReason || "",
      fetchedAt: Number(entry?.fetchedAt || 0),
      freshUntil: Number(entry?.fetchedAt || 0) + maxAgeMs,
    };
  }

  return { refresh, getProjection, getStatus, shouldRefresh };
}
