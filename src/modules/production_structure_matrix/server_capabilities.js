const PRODUCTION_STRUCTURE_SURFACE = "production-structure";
const ELEVATABLE_EMPLOYEE_SESSION_REASONS = new Set([
  "employee-session-required",
  "employee-session-missing",
  "employee-session-expired",
  "revoked-session",
]);

function normalizeEmployeeActor(value = null) {
  const employeeId = String(value?.employeeId || "").trim();
  const id = String(value?.id || "").trim();
  if (value?.scope !== "employee" || !employeeId || id !== `employee:${employeeId}`) return null;
  return Object.freeze({
    id,
    employeeId,
    displayName: String(value?.displayName || ""),
    personnelNumber: String(value?.personnelNumber || ""),
    scope: "employee",
  });
}

export function normalizeProductionStructureAuthorization(value = null) {
  const actor = normalizeEmployeeActor(value?.actor);
  return Object.freeze({
    authenticated: value?.authenticated === true && Boolean(actor),
    authorized: value?.authorized === true && Boolean(actor),
    canEdit: value?.canEdit === true && Boolean(actor),
    actor,
    reason: String(value?.reason || (actor ? "production-structure-write-forbidden" : "employee-session-required")),
    revision: Number.isSafeInteger(Number(value?.revision)) && Number(value.revision) > 0 ? Number(value.revision) : 0,
    infrastructureUnavailable: value?.infrastructureUnavailable === true,
  });
}

export function createEmptySystemDomainsServerCommandState({ status = "idle", primaryAuthority = false, error = "" } = {}) {
  return {
    status,
    configured: false,
    configuredSurfaces: [],
    enabled: false,
    surfaces: [],
    primaryAuthority: primaryAuthority === true,
    consistencyMatches: false,
    consistencyRevision: 0,
    actorAuthorized: false,
    actorAuthorizationReason: "",
    productionStructureWriteEnabled: false,
    productionStructureAuthorization: normalizeProductionStructureAuthorization(),
    error: String(error || ""),
  };
}

export function isSystemDomainsCapabilitiesResponseCurrent({
  requestEpoch = 0,
  currentEpoch = 0,
  requestSessionIdentity = "",
  currentSessionIdentity = "",
} = {}) {
  return Number(requestEpoch) === Number(currentEpoch)
    && String(requestSessionIdentity) === String(currentSessionIdentity);
}

export function projectSystemDomainsServerCommandState(result = null, { primaryAuthorityHint = false } = {}) {
  const capabilities = result?.ok === true && result?.capabilities && typeof result.capabilities === "object"
    ? result.capabilities
    : {};
  const ok = result?.ok === true;
  return {
    status: "ready",
    configured: ok && capabilities.serverCommandsConfigured === true,
    configuredSurfaces: ok && Array.isArray(capabilities.configuredServerCommandSurfaces)
      ? [...capabilities.configuredServerCommandSurfaces]
      : [],
    // Retained for non-Structure consumers. Production Structure decisions
    // must use the dedicated capability below, never this umbrella flag.
    enabled: ok && result?.enabled === true && capabilities.serverCommandsEnabled === true,
    surfaces: ok && Array.isArray(capabilities.serverCommandSurfaces)
      ? [...capabilities.serverCommandSurfaces]
      : [],
    primaryAuthority: ok
      ? capabilities.consistency?.details?.authority?.mode === "postgres-primary"
      : primaryAuthorityHint === true,
    consistencyMatches: ok && capabilities.consistency?.matches === true,
    consistencyRevision: ok && Number.isSafeInteger(Number(capabilities.consistency?.revision))
      ? Number(capabilities.consistency.revision)
      : 0,
    actorAuthorized: ok && capabilities.actorAuthorization?.authorized === true,
    actorAuthorizationReason: ok
      ? String(capabilities.actorAuthorization?.reason || "")
      : "capabilities-unavailable",
    productionStructureWriteEnabled: ok && capabilities.productionStructureWriteEnabled === true,
    productionStructureAuthorization: normalizeProductionStructureAuthorization(capabilities.productionStructureAuthorization),
    error: ok ? "" : String(result?.error || "System Domains command capabilities are unavailable"),
  };
}

function hasProductionStructurePerimeter(state = null) {
  return state?.status === "ready"
    && state.configured === true
    && Array.isArray(state.configuredSurfaces)
    && state.configuredSurfaces.includes(PRODUCTION_STRUCTURE_SURFACE)
    && state.primaryAuthority === true
    && Number.isSafeInteger(Number(state.consistencyRevision))
    && Number(state.consistencyRevision) > 0
    && state.actorAuthorized === true;
}

export function getProductionStructureWriteDecision({
  state = null,
  currentRevision = 0,
  currentEmployeeId = "",
  sessionActor = null,
  localCanEdit = true,
} = {}) {
  if (state?.status !== "ready") return { allowed: false, code: "capabilities-pending" };
  if (state.configured !== true || !state.configuredSurfaces?.includes(PRODUCTION_STRUCTURE_SURFACE)) {
    return { allowed: false, code: "command-not-configured" };
  }
  if (state.primaryAuthority !== true) return { allowed: false, code: "primary-unavailable" };
  if (state.actorAuthorized !== true) return { allowed: false, code: "public-perimeter-denied" };

  const authorization = normalizeProductionStructureAuthorization(state.productionStructureAuthorization);
  if (authorization.infrastructureUnavailable) return { allowed: false, code: "auth-infrastructure-unavailable" };
  if (!authorization.authenticated || !authorization.actor) return { allowed: false, code: "employee-session-required" };

  const employeeId = String(currentEmployeeId || "").trim();
  const signedSessionActor = normalizeEmployeeActor(sessionActor);
  if (!employeeId || !signedSessionActor || signedSessionActor.employeeId !== employeeId) {
    return { allowed: false, code: "employee-session-unconfirmed" };
  }
  if (authorization.actor.employeeId !== employeeId || authorization.actor.id !== `employee:${employeeId}`) {
    return { allowed: false, code: "employee-actor-mismatch" };
  }
  if (!authorization.authorized || !authorization.canEdit) return { allowed: false, code: "rbac-denied" };
  if (state.productionStructureWriteEnabled !== true) return { allowed: false, code: "dedicated-command-disabled" };

  const revision = Number(currentRevision || 0);
  if (!Number.isSafeInteger(revision) || revision < 1
    || authorization.revision !== revision
    || state.consistencyRevision !== revision) {
    return { allowed: false, code: "authorization-revision-stale" };
  }
  if (localCanEdit !== true) return { allowed: false, code: "local-rbac-denied" };
  return { allowed: true, code: "ready" };
}

export function getProductionStructureElevationDecision({
  state = null,
  currentRevision = 0,
  currentEmployeeId = "",
  sessionAuthenticated = false,
} = {}) {
  if (!hasProductionStructurePerimeter(state)) return { allowed: false, code: "perimeter-unavailable" };
  if (Number(state.consistencyRevision) !== Number(currentRevision) || Number(currentRevision) < 1) {
    return { allowed: false, code: "authorization-revision-stale" };
  }
  if (!String(currentEmployeeId || "").trim()) return { allowed: false, code: "local-employee-missing" };
  if (sessionAuthenticated === true) return { allowed: false, code: "employee-session-present" };

  const authorization = normalizeProductionStructureAuthorization(state.productionStructureAuthorization);
  if (authorization.infrastructureUnavailable) return { allowed: false, code: "auth-infrastructure-unavailable" };
  // PIN elevation solves only an absent nested employee session. An
  // authenticated actor (including canEdit=false) is an RBAC decision and
  // must never be disguised as another PIN prompt.
  if (authorization.authenticated || authorization.actor) return { allowed: false, code: "nested-actor-present" };
  if (!ELEVATABLE_EMPLOYEE_SESSION_REASONS.has(authorization.reason)) return { allowed: false, code: "employee-session-not-requested" };
  return { allowed: true, code: "employee-session-required" };
}
