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

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasCanonicalInstant(value) {
  if (!hasText(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function isValidWeeklyRow(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!["id", "routeId", "routeStepId", "plannedStart", "plannedEnd", "status"].every((key) => hasText(value[key]))) return false;
  if (!hasCanonicalInstant(value.plannedStart) || !hasCanonicalInstant(value.plannedEnd)) return false;
  if (Date.parse(value.plannedEnd) <= Date.parse(value.plannedStart)) return false;
  if (!Number.isFinite(Number(value.quantity)) || Number(value.quantity) <= 0) return false;
  // A slot can intentionally be unresolved to a particular resource or
  // planning work centre. Keep that proven legacy behaviour, but reject
  // shape-corrupt values before they can clear the Weekly screen.
  if (typeof value.unit !== "string" || typeof value.workCenterId !== "string" || typeof value.resourceId !== "string") return false;
  return typeof value.locked === "boolean";
}

function hasWeeklyRows(value) {
  // An empty week is a valid answer. Every non-empty record must satisfy the
  // compact transport contract, otherwise preserve the last verified cache
  // rather than rendering a silently empty dashboard.
  return Array.isArray(value) && value.every(isValidWeeklyRow);
}

// A period cache is intentionally independent from the full planning runtime
// projection. Weekly Control is a read-only consumer: it must never hydrate or
// replace the global planning state just to draw one visible calendar week.
export function createPlanningPeriodReadModel({
  fetchImpl = globalThis.fetch,
  baseUrl = "/api/v1/planning/period",
  now = () => Date.now(),
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  view = "projection",
} = {}) {
  const readView = String(view || "projection").trim().toLowerCase() === "weekly" ? "weekly" : "projection";
  const entries = new Map();

  const getEntryPayload = (entry) => readView === "weekly"
    ? entry?.rows || entry?.projection || null
    : entry?.projection || null;

  function getEntry(bounds) {
    const key = bounds.key;
    const current = entries.get(key);
    if (current) return current;
    const entry = {
      ...bounds,
      projection: null,
      rows: null,
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
      return { ok: false, changed: false, projection: null, rows: null, error: "Planning period bounds are invalid" };
    }
    const entry = getEntry(bounds);
    if (!force && getEntryPayload(entry) && now() - entry.fetchedAt < maxAgeMs) {
      return { ok: true, changed: false, projection: entry.projection, rows: entry.rows, fallbackReason: entry.fallbackReason };
    }
    if (entry.loading) return entry.loading;

    entry.loading = (async () => {
      try {
        const query = new URLSearchParams(entry.query);
        if (readView !== "projection") query.set("view", readView);
        const response = await fetchImpl(`${baseUrl}?${query}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: entry.etag ? { "If-None-Match": entry.etag } : {},
        });
        if (response.status === 304) {
          if (!getEntryPayload(entry)) throw new Error("Planning period API returned 304 without a cached response");
          entry.fetchedAt = now();
          entry.error = "";
          return { ok: true, changed: false, projection: entry.projection, rows: entry.rows, fallbackReason: entry.fallbackReason };
        }
        if (!response.ok) throw new Error(`Planning period API returned ${response.status}`);
        const payload = await response.json();
        const projection = hasProjection(payload?.projection) ? payload.projection : null;
        const rows = hasWeeklyRows(payload?.rows) ? payload.rows : null;
        const supported = readView === "weekly"
          ? Boolean(rows || projection)
          : Boolean(projection);
        if (!payload?.ok || !supported) {
          throw new Error(payload?.error || "Planning period API returned an invalid response");
        }
        const current = getEntryPayload(entry);
        const next = readView === "weekly" ? rows || projection : projection;
        const changed = JSON.stringify(next) !== JSON.stringify(current);
        entry.projection = projection;
        entry.rows = rows;
        entry.etag = response.headers?.get?.("ETag") || entry.etag;
        entry.fetchedAt = now();
        entry.error = "";
        entry.fallbackReason = String(payload?.fallbackReason || "");
        return { ok: true, changed, projection, rows, fallbackReason: entry.fallbackReason };
      } catch (error) {
        entry.error = error?.message || "Planning period API is unavailable";
        return { ok: false, changed: false, projection: entry.projection, rows: entry.rows, error: entry.error, fallbackReason: entry.fallbackReason };
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

  function getRows(input = {}) {
    const bounds = resolveBounds(input);
    return bounds ? entries.get(bounds.key)?.rows || null : null;
  }

  function shouldRefresh(input = {}) {
    const bounds = resolveBounds(input);
    if (!bounds) return false;
    const entry = entries.get(bounds.key);
    return !getEntryPayload(entry) || now() - entry.fetchedAt >= maxAgeMs;
  }

  function getStatus(input = {}) {
    const bounds = resolveBounds(input);
    const entry = bounds ? entries.get(bounds.key) : null;
    return {
      available: Boolean(getEntryPayload(entry)),
      loading: Boolean(entry?.loading),
      error: entry?.error || "",
      fallbackReason: entry?.fallbackReason || "",
      fetchedAt: Number(entry?.fetchedAt || 0),
      freshUntil: Number(entry?.fetchedAt || 0) + maxAgeMs,
    };
  }

  return { refresh, getProjection, getRows, getStatus, shouldRefresh };
}
