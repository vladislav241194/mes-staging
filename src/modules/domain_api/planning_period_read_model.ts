const DEFAULT_MAX_AGE_MS = 30_000;

type UnknownRecord = Record<string, unknown>;
type FetchLike = typeof globalThis.fetch;

export interface PlanningPeriodProjection extends UnknownRecord {
  routes: unknown[];
  routeSteps: unknown[];
  slots: unknown[];
}

export interface PlanningPeriodWeeklyRow extends UnknownRecord {
  id: string;
  routeId: string;
  routeStepId: string;
  plannedStart: string;
  plannedEnd: string;
  status: string;
  quantity: unknown;
  unit: string;
  workCenterId: string;
  resourceId: string;
  locked: boolean;
}

export interface PlanningPeriodInput {
  from?: unknown;
  to?: unknown;
  fromAt?: unknown;
  toAt?: unknown;
  force?: boolean;
}

interface ResolvedBounds {
  from: string;
  to: string;
  query: Record<string, string>;
  key: string;
}

interface PlanningPeriodRefreshResult extends UnknownRecord {
  ok: boolean;
  changed: boolean;
  projection: PlanningPeriodProjection | null;
  rows: PlanningPeriodWeeklyRow[] | null;
  fallbackReason?: string;
  error?: string;
}

interface PlanningPeriodEntry extends ResolvedBounds {
  projection: PlanningPeriodProjection | null;
  rows: PlanningPeriodWeeklyRow[] | null;
  etag: string;
  fetchedAt: number;
  loading: Promise<PlanningPeriodRefreshResult> | null;
  error: string;
  fallbackReason: string;
}

export interface PlanningPeriodReadModelOptions {
  fetchImpl?: FetchLike;
  baseUrl?: string;
  now?: () => number;
  maxAgeMs?: number;
  view?: string;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function errorMessage(error: unknown, fallback: string): string {
  return String(record(error).message || fallback);
}

function normalizedDate(value: unknown): string {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function normalizedInstant(value: unknown): string {
  const instant = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(instant)) return "";
  const date = new Date(instant);
  return Number.isFinite(date.getTime()) && date.toISOString() === instant ? instant : "";
}

function resolveBounds({ from, to, fromAt, toAt }: PlanningPeriodInput = {}): ResolvedBounds | null {
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

function hasProjection(value: unknown): value is PlanningPeriodProjection {
  const projection = record(value);
  return Array.isArray(projection.routes)
    && Array.isArray(projection.routeSteps)
    && Array.isArray(projection.slots);
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasCanonicalInstant(value: unknown): value is string {
  if (!hasText(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function isValidWeeklyRow(value: unknown): value is PlanningPeriodWeeklyRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as UnknownRecord;
  if (!["id", "routeId", "routeStepId", "plannedStart", "plannedEnd", "status"].every((key) => hasText(row[key]))) return false;
  if (!hasCanonicalInstant(row.plannedStart) || !hasCanonicalInstant(row.plannedEnd)) return false;
  if (Date.parse(row.plannedEnd) <= Date.parse(row.plannedStart)) return false;
  if (!Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0) return false;
  // A slot can intentionally be unresolved to a particular resource or
  // planning work centre. Keep that proven legacy behaviour, but reject
  // shape-corrupt values before they can clear the Weekly screen.
  if (typeof row.unit !== "string" || typeof row.workCenterId !== "string" || typeof row.resourceId !== "string") return false;
  return typeof row.locked === "boolean";
}

function hasWeeklyRows(value: unknown): value is PlanningPeriodWeeklyRow[] {
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
}: PlanningPeriodReadModelOptions = {}) {
  const readView = String(view || "projection").trim().toLowerCase() === "weekly" ? "weekly" : "projection";
  const entries = new Map<string, PlanningPeriodEntry>();

  const getEntryPayload = (entry: PlanningPeriodEntry | null | undefined): PlanningPeriodWeeklyRow[] | PlanningPeriodProjection | null => readView === "weekly"
    ? entry?.rows || entry?.projection || null
    : entry?.projection || null;

  function getEntry(bounds: ResolvedBounds): PlanningPeriodEntry {
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

  async function refresh(input: PlanningPeriodInput = {}): Promise<PlanningPeriodRefreshResult> {
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
        const payload = record(await response.json());
        const projection = hasProjection(payload.projection) ? payload.projection : null;
        const rows = hasWeeklyRows(payload.rows) ? payload.rows : null;
        const supported = readView === "weekly"
          ? Boolean(rows || projection)
          : Boolean(projection);
        if (!payload.ok || !supported) {
          throw new Error(String(payload.error || "Planning period API returned an invalid response"));
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
      } catch (error: unknown) {
        entry.error = errorMessage(error, "Planning period API is unavailable");
        return { ok: false, changed: false, projection: entry.projection, rows: entry.rows, error: entry.error, fallbackReason: entry.fallbackReason };
      } finally {
        entry.loading = null;
      }
    })();
    return entry.loading;
  }

  function getProjection(input: PlanningPeriodInput = {}): PlanningPeriodProjection | null {
    const bounds = resolveBounds(input);
    return bounds ? entries.get(bounds.key)?.projection || null : null;
  }

  function getRows(input: PlanningPeriodInput = {}): PlanningPeriodWeeklyRow[] | null {
    const bounds = resolveBounds(input);
    return bounds ? entries.get(bounds.key)?.rows || null : null;
  }

  function shouldRefresh(input: PlanningPeriodInput = {}): boolean {
    const bounds = resolveBounds(input);
    if (!bounds) return false;
    const entry = entries.get(bounds.key);
    return !entry || !getEntryPayload(entry) || now() - entry.fetchedAt >= maxAgeMs;
  }

  function getStatus(input: PlanningPeriodInput = {}) {
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
