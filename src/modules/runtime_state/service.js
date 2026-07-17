export function createRuntimeStateServiceModule(dependencies = {}) {
  const {
    APP_VERSION,
    BOOTSTRAP_SNAPSHOT_FILE_URL,
    BOOTSTRAP_SNAPSHOT_RESTORE_ENABLED,
    BOOTSTRAP_SNAPSHOT_STORAGE_KEY,
    BOOTSTRAP_SNAPSHOT_VALUE_KEYS,
    CRITICAL_DIRECTORY_SECTION_IDS,
    DEFAULT_BOM_LISTS,
    DEFAULT_COMPONENT_TYPES,
    DEFAULT_NOMENCLATURE_TYPES,
    DEFAULT_SPECIFICATIONS,
    DEFAULT_STATUSES,
    DIRECTORY_BACKUP_STORAGE_KEY,
    DIRECTORY_DEFAULTS_STORAGE_KEY,
    DIRECTORY_DELETED_ENTITIES_STORAGE_KEY,
    DIRECTORY_STORAGE_KEY,
    MES_OPERATION_MAP,
    PLANNING_BACKUP_STORAGE_KEY,
    REMOVED_DIRECTORY_STATUS_ID_PREFIXES,
    SHARED_STATE_API_URL,
    SHARED_STATE_CLIENT_ID_KEY,
    SHARED_STATE_DISABLED_RECHECK_MS,
    SHARED_STATE_DISABLED_UNTIL_KEY,
    SHARED_STATE_POLL_INTERVAL_MS,
    SHARED_STATE_SAVE_DEBOUNCE_MS,
    SHARED_STATE_VALUE_KEYS,
    SPECIFICATIONS2_STORAGE_KEY,
    SHARED_UI_LOCAL_DIRTY_KEY,
    SHARED_UI_LOCAL_DIRTY_TTL_MS,
    STATE_RESET_BACKUP_STORAGE_KEY,
    STORAGE_KEY,
    STORAGE_KEYS,
    SYSTEM_DOMAINS_STORAGE_KEY,
    alignGanttWindowToPlan,
    appendLocalDataSafetyAudit,
    createDefaultPlanningState,
    getActiveInterfaceRole,
    getBootstrapSnapshotCountsFromState,
    isMeaningfulBootstrapSnapshotCounts,
    isUsableBootstrapSnapshotPayload,
    isShiftExecutionServerAuthoritative = () => false,
    isSystemDomainsServerAuthoritative = () => false,
    loadUiState,
    measureBootStep,
    mergeMesWorkCenters,
    normalizeAccessRoleAssignments,
    normalizeAccessRoleProfiles,
    normalizeDirectoryRow,
    normalizeDirectoryState,
    normalizeDispatchFact,
    normalizeGanttDependencyRouteStore,
    normalizePlainRecord,
    normalizePlanningCorrection,
    normalizePlanningState,
    normalizeShiftMasterAssignment,
    normalizeShiftMasterAssignmentMatrix,
    normalizeShiftMasterRecordMap,
    notifySaveSuccess,
    onPlanningBootstrap = async () => false,
    onPlanningSnapshotSynchronized = () => {},
    persistUiState,
    publishBootPerformance,
    reloadSystemDomainsState,
    render,
    sharedStateStatus,
    shouldPreferBundledBootstrapSnapshotPayload,
    syncActiveRoleWithAuthorization,
    syncProductionStructureMatrixToPlanningState,
    updateClockOnly,
  } = dependencies;

  let ui = dependencies.getUi?.() ?? {};
  let planningState = dependencies.getPlanningState?.() ?? {};
  let directoryState = dependencies.getDirectoryState?.() ?? {};
  let appBootstrapped = dependencies.getAppBootstrapped?.() ?? false;
  let externalStorageSyncTimer = dependencies.getExternalStorageSyncTimer?.() ?? null;
  let sharedStateApplyingRemote = dependencies.getSharedStateApplyingRemote?.() ?? false;
  let bundledBootstrapSnapshot = dependencies.getBundledBootstrapSnapshot?.() ?? null;
  let bootstrapSnapshotLoadStarted = dependencies.getBootstrapSnapshotLoadStarted?.() ?? false;
  let bootstrapSnapshotLoadPromise = dependencies.getBootstrapSnapshotLoadPromise?.() ?? null;
  let directoryEntityRemovalAllowed = dependencies.getDirectoryEntityRemovalAllowed?.() ?? false;
  let planningEntityRemovalAllowed = dependencies.getPlanningEntityRemovalAllowed?.() ?? false;

  function syncRuntimeState() {
    ui = dependencies.getUi?.() ?? ui ?? {};
    planningState = dependencies.getPlanningState?.() ?? planningState ?? {};
    directoryState = dependencies.getDirectoryState?.() ?? directoryState ?? {};
    appBootstrapped = dependencies.getAppBootstrapped?.() ?? appBootstrapped ?? false;
    externalStorageSyncTimer = dependencies.getExternalStorageSyncTimer?.() ?? externalStorageSyncTimer ?? null;
    sharedStateApplyingRemote = dependencies.getSharedStateApplyingRemote?.() ?? sharedStateApplyingRemote ?? false;
    bundledBootstrapSnapshot = dependencies.getBundledBootstrapSnapshot?.() ?? bundledBootstrapSnapshot ?? null;
    bootstrapSnapshotLoadStarted = dependencies.getBootstrapSnapshotLoadStarted?.() ?? bootstrapSnapshotLoadStarted ?? false;
    bootstrapSnapshotLoadPromise = dependencies.getBootstrapSnapshotLoadPromise?.() ?? bootstrapSnapshotLoadPromise ?? null;
    directoryEntityRemovalAllowed = dependencies.getDirectoryEntityRemovalAllowed?.() ?? directoryEntityRemovalAllowed ?? false;
    planningEntityRemovalAllowed = dependencies.getPlanningEntityRemovalAllowed?.() ?? planningEntityRemovalAllowed ?? false;
  }

  function commitRuntimeState() {
    dependencies.setUi?.(ui);
    dependencies.setPlanningState?.(planningState);
    dependencies.setDirectoryState?.(directoryState);
    dependencies.setAppBootstrapped?.(appBootstrapped);
    dependencies.setExternalStorageSyncTimer?.(externalStorageSyncTimer);
    dependencies.setSharedStateApplyingRemote?.(sharedStateApplyingRemote);
    dependencies.setBundledBootstrapSnapshot?.(bundledBootstrapSnapshot);
    dependencies.setBootstrapSnapshotLoadStarted?.(bootstrapSnapshotLoadStarted);
    dependencies.setBootstrapSnapshotLoadPromise?.(bootstrapSnapshotLoadPromise);
    dependencies.setDirectoryEntityRemovalAllowed?.(directoryEntityRemovalAllowed);
    dependencies.setPlanningEntityRemovalAllowed?.(planningEntityRemovalAllowed);
  }

function handleDevResetParams() {
  const params = new URLSearchParams(window.location.search);
  let shouldReplaceUrl = false;

  if (params.has("state-reset")) {
    backupLocalStateBeforeReset();
    console.warn("[MES] state-reset ignored to protect saved BOM lists and specifications.");
    params.delete("state-reset");
    shouldReplaceUrl = true;
  }

  if (shouldReplaceUrl) {
    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash || ""}`;
    window.history.replaceState(null, "", nextUrl);
  }
}

function backupLocalStateBeforeReset() {
  const values = Object.fromEntries(STORAGE_KEYS.map((key) => [key, localStorage.getItem(key)]));
  if (Object.values(values).every((value) => value === null)) return;
  localStorage.setItem(STATE_RESET_BACKUP_STORAGE_KEY, JSON.stringify({
    createdAt: new Date().toISOString(),
    version: APP_VERSION,
    url: window.location.href,
    values,
  }));
}

function parseJsonObject(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function getSharedStateClientId() {
  const existing = localStorage.getItem(SHARED_STATE_CLIENT_ID_KEY);
  if (existing) return existing;
  const id = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `tester-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(SHARED_STATE_CLIENT_ID_KEY, id);
  return id;
}

function getSharedStateActorLabel() {
  const role = getActiveInterfaceRole();
  return role?.label || "Тестировщик";
}

  function getSharedUiSnapshot() {
    if (!ui) return {};
    const serverOwnsShiftExecution = Boolean(isShiftExecutionServerAuthoritative());
    return {
    ganttDependencyRoutes: normalizeGanttDependencyRouteStore(ui.ganttDependencyRoutes),
    productionStructureMatrixOverrides: normalizePlainRecord(ui.productionStructureMatrixOverrides),
    timesheetCellOverrides: normalizePlainRecord(ui.timesheetCellOverrides),
    timesheetScheduleOverrides: normalizePlainRecord(ui.timesheetScheduleOverrides),
    shiftMasterBoardLaneBySlot: normalizePlainRecord(ui.shiftMasterBoardLaneBySlot),
    // Explicit nulls are safe tombstones at the shared-state boundary.  They
    // delete only the legacy compatibility copies after the server aggregate
    // has become authoritative; lane placement remains a UI-only preference.
    shiftMasterBoardAssignments: serverOwnsShiftExecution ? null : normalizePlainRecord(ui.shiftMasterBoardAssignments),
    shiftMasterBoardFacts: serverOwnsShiftExecution ? null : normalizePlainRecord(ui.shiftMasterBoardFacts),
    shiftMasterBoardCarryovers: serverOwnsShiftExecution ? null : normalizePlainRecord(ui.shiftMasterBoardCarryovers),
    shiftMasterAssignmentMatrix: normalizeShiftMasterAssignmentMatrix(ui.shiftMasterAssignmentMatrix),
    accessRoleProfiles: normalizeAccessRoleProfiles(ui.accessRoleProfiles),
    accessRoleAssignments: normalizeAccessRoleAssignments(ui.accessRoleAssignments),
  };
}

function getSharedUiSignature() {
  return JSON.stringify(getSharedUiSnapshot());
}

function rememberSharedUiSignature() {
  sharedStateStatus.lastSharedUiSignature = getSharedUiSignature();
}

function getSharedUiDirtyMarker() {
  const marker = parseJsonObject(window.localStorage?.getItem(SHARED_UI_LOCAL_DIRTY_KEY));
  if (!marker?.signature || !marker.updatedAt) return null;
  if (marker.version && marker.version !== APP_VERSION) {
    window.localStorage?.removeItem(SHARED_UI_LOCAL_DIRTY_KEY);
    return null;
  }
  const updatedAtMs = Date.parse(marker.updatedAt);
  if (!Number.isFinite(updatedAtMs) || Date.now() - updatedAtMs > SHARED_UI_LOCAL_DIRTY_TTL_MS) {
    window.localStorage?.removeItem(SHARED_UI_LOCAL_DIRTY_KEY);
    return null;
  }
  return {
    signature: String(marker.signature || ""),
    updatedAt: marker.updatedAt,
  };
}

function markSharedUiDirty(signature = getSharedUiSignature()) {
  if (!signature) return;
  window.localStorage?.setItem(SHARED_UI_LOCAL_DIRTY_KEY, JSON.stringify({
    signature,
    updatedAt: new Date().toISOString(),
    version: APP_VERSION,
  }));
}

function clearSharedUiDirty(signature = getSharedUiSignature()) {
  const marker = getSharedUiDirtyMarker();
  if (!marker || marker.signature !== signature) return;
  window.localStorage?.removeItem(SHARED_UI_LOCAL_DIRTY_KEY);
}

function shouldPreserveLocalSharedUi() {
  const marker = getSharedUiDirtyMarker();
  return Boolean(marker && marker.signature === getSharedUiSignature());
}

  function applySharedUiSnapshot(sharedUi = {}) {
    const source = sharedUi && typeof sharedUi === "object" && !Array.isArray(sharedUi) ? sharedUi : {};
    const serverOwnsShiftExecution = Boolean(isShiftExecutionServerAuthoritative());
  ui.ganttDependencyRoutes = normalizeGanttDependencyRouteStore(source.ganttDependencyRoutes);
  if (Object.prototype.hasOwnProperty.call(source, "productionStructureMatrixOverrides")) {
    ui.productionStructureMatrixOverrides = normalizePlainRecord(source.productionStructureMatrixOverrides);
    syncProductionStructureMatrixToPlanningState({ persist: true });
  }
  if (Object.prototype.hasOwnProperty.call(source, "timesheetCellOverrides")) {
    ui.timesheetCellOverrides = normalizePlainRecord(source.timesheetCellOverrides);
  }
  if (Object.prototype.hasOwnProperty.call(source, "timesheetScheduleOverrides")) {
    ui.timesheetScheduleOverrides = normalizePlainRecord(source.timesheetScheduleOverrides);
  }
  if (Object.prototype.hasOwnProperty.call(source, "shiftMasterBoardLaneBySlot")) {
    ui.shiftMasterBoardLaneBySlot = normalizePlainRecord(source.shiftMasterBoardLaneBySlot);
  }
  if (!serverOwnsShiftExecution && Object.prototype.hasOwnProperty.call(source, "shiftMasterBoardAssignments")) {
    ui.shiftMasterBoardAssignments = normalizePlainRecord(source.shiftMasterBoardAssignments);
  }
  if (!serverOwnsShiftExecution && Object.prototype.hasOwnProperty.call(source, "shiftMasterBoardFacts")) {
    ui.shiftMasterBoardFacts = normalizePlainRecord(source.shiftMasterBoardFacts);
  }
  if (!serverOwnsShiftExecution && Object.prototype.hasOwnProperty.call(source, "shiftMasterBoardCarryovers")) {
    ui.shiftMasterBoardCarryovers = normalizePlainRecord(source.shiftMasterBoardCarryovers);
  }
  if (Object.prototype.hasOwnProperty.call(source, "shiftMasterAssignmentMatrix")) {
    ui.shiftMasterAssignmentMatrix = normalizeShiftMasterAssignmentMatrix(source.shiftMasterAssignmentMatrix);
  }
  if (Object.prototype.hasOwnProperty.call(source, "accessRoleProfiles")) {
    ui.accessRoleProfiles = normalizeAccessRoleProfiles(source.accessRoleProfiles);
  }
  if (Object.prototype.hasOwnProperty.call(source, "accessRoleAssignments")) {
    ui.accessRoleAssignments = normalizeAccessRoleAssignments(source.accessRoleAssignments);
  }
}

function isSharedStateTemporarilyDisabled() {
  const disabledUntil = Number(window.sessionStorage?.getItem(SHARED_STATE_DISABLED_UNTIL_KEY) || 0);
  return Number.isFinite(disabledUntil) && disabledUntil > Date.now();
}

function rememberSharedStateDisabled() {
  window.sessionStorage?.setItem(
    SHARED_STATE_DISABLED_UNTIL_KEY,
    String(Date.now() + SHARED_STATE_DISABLED_RECHECK_MS),
  );
}

function forgetSharedStateDisabled() {
  window.sessionStorage?.removeItem(SHARED_STATE_DISABLED_UNTIL_KEY);
}

function getSharedStateValues() {
  const values = Object.fromEntries(SHARED_STATE_VALUE_KEYS.flatMap((key) => {
    const value = localStorage.getItem(key);
    return value === null ? [] : [[key, value]];
  }));
  if (hasMeaningfulPlanningState(planningState)) {
    values[STORAGE_KEY] = JSON.stringify(planningState);
  }
  values[DIRECTORY_STORAGE_KEY] = JSON.stringify(directoryState);
  // The server-side System Domains projection is now authoritative once all
  // command surfaces are enabled. Keep the browser cache for fast local
  // startup, but retire its shared-state copy so it cannot become a second
  // cross-browser source of truth.
  if (SYSTEM_DOMAINS_STORAGE_KEY && isSystemDomainsServerAuthoritative()) {
    values[SYSTEM_DOMAINS_STORAGE_KEY] = null;
  }
  if (!values[DIRECTORY_DEFAULTS_STORAGE_KEY]) values[DIRECTORY_DEFAULTS_STORAGE_KEY] = "1";
  return values;
}

function writeSharedStateValues(values = {}) {
  SHARED_STATE_VALUE_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return;
    const value = values[key];
    if (value === null || typeof value === "undefined") {
      localStorage.removeItem(key);
    } else if (typeof value === "string") {
      localStorage.setItem(key, value);
    }
  });
}

function applySharedStateSnapshot(snapshot, options = {}) {
  const values = snapshot?.values || {};
  const hasPlanningState = Object.prototype.hasOwnProperty.call(values, STORAGE_KEY);
  const hasDirectoryState = Object.prototype.hasOwnProperty.call(values, DIRECTORY_STORAGE_KEY);
  // Initial boot deliberately requests only the planning projection.  A
  // A module can hydrate its directory/domain projection when it is opened.
  // Server-first planning boot deliberately requests no legacy values but
  // still needs the shared UI metadata (Gantt preferences, role overrides).
  // Treat that explicitly as a valid metadata-only projection; an accidental
  // empty response remains rejected everywhere else.
  if (!hasPlanningState && !hasDirectoryState && options.allowSharedUiOnly !== true) return false;
  const preserveLocalSharedUi = options.preserveLocalSharedUi === true && shouldPreserveLocalSharedUi();
  const localSharedUi = preserveLocalSharedUi ? getSharedUiSnapshot() : null;
  sharedStateApplyingRemote = true;
  try {
    writeSharedStateValues(values);
    if (!isSystemDomainsServerAuthoritative()
      && SYSTEM_DOMAINS_STORAGE_KEY
      && Object.prototype.hasOwnProperty.call(values, SYSTEM_DOMAINS_STORAGE_KEY)) {
      reloadSystemDomainsState?.({
        source: "shared-snapshot",
        storageKey: SYSTEM_DOMAINS_STORAGE_KEY,
        snapshotVersion: Number(snapshot.version || 0),
      });
    }
    if (hasDirectoryState) {
      directoryState = loadDirectoryState();
      ensureStatusDirectoryDefaults();
    }
    if (hasPlanningState) {
      planningState = loadState();
      alignGanttWindowToPlan({ onlyWhenFar: true });
    }

    // Shared UI overrides may update the production-structure matrix and
    // persist planning state through the planning-core service. Publish the
    // just-loaded remote planning snapshot first: otherwise that service
    // observes the stale pre-sync application state and can attempt to save an
    // empty plan over a populated shared snapshot.
    commitRuntimeState();
    applySharedUiSnapshot(localSharedUi || snapshot.sharedUi || {});
    syncActiveRoleWithAuthorization();
    ui.ganttDependencyRouteDrafts = null;
    ui.ganttDependencyDrag = null;

    sharedStateStatus.version = Number(snapshot.version || 0);
    rememberSharedUiSignature();
    persistUiState({ skipRememberScroll: true });

    // The shared snapshot lives inside this service closure until it is committed.
    // Commit before rendering so the application renderer sees the fresh state.
    commitRuntimeState();
    if (appBootstrapped) {
      render({ skipRememberScroll: true });
      if (options.notify === true && !options.silent) notifySaveSuccess("Общее состояние стейджа обновлено");
    }
    return true;
  } finally {
    sharedStateApplyingRemote = false;
  }
}

function syncExternalStorageState(key = "") {
  let shouldRender = false;
  if (key === STORAGE_KEY) {
    planningState = loadState();
    shouldRender = true;
  }
  if ([DIRECTORY_STORAGE_KEY, DIRECTORY_DEFAULTS_STORAGE_KEY, DIRECTORY_DELETED_ENTITIES_STORAGE_KEY].includes(key)) {
    directoryState = loadDirectoryState();
    ensureStatusDirectoryDefaults();
    shouldRender = true;
  }
  if (key === SYSTEM_DOMAINS_STORAGE_KEY && !isSystemDomainsServerAuthoritative()) {
    reloadSystemDomainsState?.({
      source: "external-storage",
      storageKey: SYSTEM_DOMAINS_STORAGE_KEY,
      snapshotVersion: null,
    });
    shouldRender = true;
  }
  if (!shouldRender || !appBootstrapped) return;
  render({ skipRememberScroll: true });
}

function bindExternalStorageSync() {
  window.__MES_SCHEDULE_SHARED_STATE_PUSH__ = scheduleSharedStatePush;
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== localStorage || sharedStateApplyingRemote) return;
    if (![STORAGE_KEY, DIRECTORY_STORAGE_KEY, DIRECTORY_DEFAULTS_STORAGE_KEY, DIRECTORY_DELETED_ENTITIES_STORAGE_KEY, SYSTEM_DOMAINS_STORAGE_KEY]
      .filter(Boolean)
      .includes(event.key)) return;
    window.clearTimeout(externalStorageSyncTimer);
    externalStorageSyncTimer = window.setTimeout(() => syncExternalStorageState(event.key), 120);
  });
  window.addEventListener("mes:shared-state-change", (event) => {
    scheduleSharedStatePush(event?.detail?.reason || "module-state");
  });
  // Background tabs may have their interval timers throttled by the browser.
  // Pull immediately when the user returns so a previously opened module does
  // not keep rendering an obsolete work-order revision or labor estimate.
  window.addEventListener("focus", () => {
    void pollSharedState();
  });
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void pollSharedState();
  });
}

async function requestSharedState(method = "GET", payload = null, options = {}) {
  const controller = new AbortController();
  const timeoutMs = 8000;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const request = {
    method,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: controller.signal,
  };
  const knownVersion = Number(options.knownVersion || 0);
  if (method === "GET" && knownVersion > 0) {
    request.headers["X-MES-Shared-State-Version"] = String(knownVersion);
  }
  const valueKeys = Array.isArray(options.valueKeys)
    ? [...new Set(options.valueKeys.filter((key) => SHARED_STATE_VALUE_KEYS.includes(key)))]
    : [];
  if (method === "GET" && valueKeys.length) {
    request.headers["X-MES-Shared-State-Keys"] = valueKeys.join(",");
  }
  if (method === "GET" && options.emptyProjection === true) {
    request.headers["X-MES-Shared-State-Keys"] = "__none__";
  }
  if (payload) request.body = JSON.stringify(payload);
  try {
    const response = await fetch(SHARED_STATE_API_URL, request);
    const data = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 409) {
      throw new Error(data?.error || `Shared state request failed with status ${response.status}`);
    }
    return data;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function hydrateSharedStateValues(valueKeys = []) {
  const requestedKeys = [...new Set((valueKeys || []).filter((key) => SHARED_STATE_VALUE_KEYS.includes(key)))];
  if (!requestedKeys.length || !sharedStateStatus.enabled) return false;
  try {
    const snapshot = await requestSharedState("GET", null, { valueKeys: requestedKeys });
    if (snapshot.configured === false || !snapshot.values) return false;
    writeSharedStateValues(snapshot.values);
    // This is intentionally not a revision acknowledgement: a projected read
    // may race with a complete snapshot update, which the next normal poll
    // must still reconcile in full.
    return requestedKeys.some((key) => Object.prototype.hasOwnProperty.call(snapshot.values, key));
  } catch (error) {
    console.warn("[MES] Deferred shared-state values are not available", error);
    return false;
  }
}

function scheduleSharedStatePush(reason = "snapshot") {
  if (sharedStateApplyingRemote) return;
  // Initial module renders may emit persistence events before the first GET
  // completes. Queuing that bootstrap-local payload would overwrite the newer
  // server snapshot immediately after it is applied. Real user interaction is
  // available only after boot, while the initial GET completes first.
  if (!sharedStateStatus.configured && !sharedStateStatus.enabled) return;
  sharedStateStatus.pendingReason = reason || sharedStateStatus.pendingReason || "snapshot";
  // Capture now: another same-origin tab may overwrite localStorage with an older
  // polled snapshot before this tab's debounce expires.
  sharedStateStatus.pendingValues = getSharedStateValues();
  sharedStateStatus.pendingSharedUi = getSharedUiSnapshot();
  window.__MES_SHARED_STATE_DEBUG__ = {
    phase: "queued",
    reason: sharedStateStatus.pendingReason,
    enabled: sharedStateStatus.enabled,
    at: new Date().toISOString(),
  };
  if (!sharedStateStatus.enabled) return;
  if (String(reason || "").startsWith("system-domains:attendanceEvents")) {
    void pushSharedState(reason, { silent: true });
    return;
  }
  window.clearTimeout(sharedStateStatus.saveTimer);
  sharedStateStatus.saveTimer = window.setTimeout(async () => {
    sharedStateStatus.saveTimer = null;
    syncRuntimeState();
    try {
      await pushSharedState(sharedStateStatus.pendingReason || "snapshot");
    } finally {
      commitRuntimeState();
    }
  }, SHARED_STATE_SAVE_DEBOUNCE_MS);
}

function mergeSystemDomainsAttendanceConflict(remoteValue, localValue) {
  let remote = null;
  let local = null;
  try {
    remote = JSON.parse(remoteValue || "null");
    local = JSON.parse(localValue || "null");
  } catch (_error) {
    return remoteValue;
  }
  const mutationKeys = local?.metadata?.lastMutationRegistry === "attendanceEvents"
    ? new Set((local.metadata.lastMutationKeys || []).map((key) => String(key || "")))
    : new Set();
  if (!remote?.registries || !local?.registries || !mutationKeys.size) return remoteValue;
  const keyOf = (event = {}) => `${String(event.employeeId || "").trim()}|${String(event.date || "").trim()}`;
  const localEvents = (local.registries.attendanceEvents || []).filter((event) => mutationKeys.has(keyOf(event)));
  remote.registries.attendanceEvents = [
    ...(remote.registries.attendanceEvents || []).filter((event) => !mutationKeys.has(keyOf(event))),
    ...localEvents,
  ];
  remote.metadata = {
    ...(remote.metadata || {}),
    updatedAt: local.metadata.updatedAt || remote.metadata?.updatedAt,
    lastMutationRegistry: "attendanceEvents",
    lastMutationKeys: [...mutationKeys],
  };
  return JSON.stringify(remote);
}

function mergeSharedStateConflictValues(remoteValues = {}, localValues = {}) {
  const merged = { ...remoteValues, ...localValues };
  const getSpecifications2PlanningFreshness = (raw = "") => {
    try {
      const state = JSON.parse(raw || "null");
      const routes = (state?.routes || []).filter((route) => route?.sourceSpecifications2EntryId);
      const routeIds = new Set(routes.map((route) => route.id));
      return {
        revision: routes.reduce((maxRevision, route) => Math.max(
          maxRevision,
          Number(route?.documentRevisionSnapshot?.specificationRevision || route?.revision || 0),
        ), 0),
        updatedAt: routes.reduce((latest, route) => Math.max(
          latest,
          Date.parse(route?.updatedAt || route?.createdAt || "") || 0,
        ), 0),
        scheduledSlots: (state?.slots || []).filter((slot) => routeIds.has(slot?.routeId || slot?.planningOrderId)).length,
      };
    } catch {
      return { revision: 0, updatedAt: 0, scheduledSlots: 0 };
    }
  };
  const remotePlanning = getSpecifications2PlanningFreshness(remoteValues[STORAGE_KEY]);
  const localPlanning = getSpecifications2PlanningFreshness(localValues[STORAGE_KEY]);
  const remotePlanningIsNewer = remotePlanning.revision > localPlanning.revision
    || (
      remotePlanning.revision === localPlanning.revision
      && remotePlanning.updatedAt > localPlanning.updatedAt
    )
    || (
      remotePlanning.revision === localPlanning.revision
      && remotePlanning.updatedAt === localPlanning.updatedAt
      && remotePlanning.scheduledSlots > localPlanning.scheduledSlots
    );
  if (remotePlanningIsNewer) {
    merged[STORAGE_KEY] = remoteValues[STORAGE_KEY];
  }
  if (!isSystemDomainsServerAuthoritative()
    && SYSTEM_DOMAINS_STORAGE_KEY
    && Object.prototype.hasOwnProperty.call(remoteValues, SYSTEM_DOMAINS_STORAGE_KEY)) {
    merged[SYSTEM_DOMAINS_STORAGE_KEY] = mergeSystemDomainsAttendanceConflict(
      remoteValues[SYSTEM_DOMAINS_STORAGE_KEY],
      localValues[SYSTEM_DOMAINS_STORAGE_KEY],
    );
  }
  return merged;
}

async function pushSharedState(reason = "snapshot", options = {}) {
  if (!sharedStateStatus.enabled || sharedStateApplyingRemote) return false;
  if (sharedStateStatus.saveInFlight) {
    sharedStateStatus.pendingReason = reason;
    return false;
  }

  window.clearTimeout(sharedStateStatus.saveTimer);
  sharedStateStatus.saveTimer = null;
  sharedStateStatus.pendingReason = "";
  sharedStateStatus.saveInFlight = true;
  const pendingValues = sharedStateStatus.pendingValues || getSharedStateValues();
  const pendingSharedUi = sharedStateStatus.pendingSharedUi || getSharedUiSnapshot();

  try {
    let response = await requestSharedState("POST", {
      baseVersion: sharedStateStatus.version,
      clientId: getSharedStateClientId(),
      actor: getSharedStateActorLabel(),
      action: reason,
      values: pendingValues,
      sharedUi: pendingSharedUi,
    });

    if (response.conflict && response.current) {
      // The local payload was captured before debounce and is still the user's
      // intended mutation. Retry once against the server's current version
      // instead of immediately replacing it with the older remote snapshot.
      sharedStateStatus.version = Number(response.current.version || sharedStateStatus.version);
      const retryValues = mergeSharedStateConflictValues(response.current.values || {}, pendingValues);
      response = await requestSharedState("POST", {
        baseVersion: sharedStateStatus.version,
        clientId: getSharedStateClientId(),
        actor: getSharedStateActorLabel(),
        action: `${reason}:conflict-retry`,
        values: retryValues,
        sharedUi: pendingSharedUi,
      });
      if (response.conflict && response.current) {
        applySharedStateSnapshot(response.current, { silent: true });
        if (options.notifyConflict === true && !options.silent) {
          notifySaveSuccess("Общее состояние изменилось повторно. Обновите данные и повторите сохранение.");
        }
        return false;
      }
    }

    if (response.configured === false) {
      sharedStateStatus.enabled = false;
      sharedStateStatus.configured = false;
      return false;
    }

    if (response.ok) {
      sharedStateStatus.configured = true;
      sharedStateStatus.version = Number(response.version || sharedStateStatus.version);
      rememberSharedUiSignature();
      clearSharedUiDirty();
      window.__MES_SHARED_STATE_DEBUG__ = {
        phase: "saved",
        reason,
        version: sharedStateStatus.version,
        at: new Date().toISOString(),
      };
      return true;
    }
  } catch (error) {
    console.warn("[MES] Shared state push failed", error);
    window.__MES_SHARED_STATE_DEBUG__ = {
      phase: "failed",
      reason,
      message: error?.message || String(error),
      at: new Date().toISOString(),
    };
  } finally {
    if (sharedStateStatus.pendingValues === pendingValues) sharedStateStatus.pendingValues = null;
    if (sharedStateStatus.pendingSharedUi === pendingSharedUi) sharedStateStatus.pendingSharedUi = null;
    sharedStateStatus.saveInFlight = false;
    if (sharedStateStatus.pendingReason) scheduleSharedStatePush(sharedStateStatus.pendingReason);
  }
  return false;
}

async function pollSharedState() {
  const pendingReason = String(sharedStateStatus.pendingReason || "");
  const onlySharedUiPending = pendingReason === "shared-ui" || pendingReason === "local-shared-ui";
  if (
    !sharedStateStatus.enabled
    || sharedStateStatus.pollInFlight
    || sharedStateStatus.saveInFlight
    || (sharedStateStatus.saveTimer && !onlySharedUiPending)
    || (pendingReason && !onlySharedUiPending)
  ) return;
  sharedStateStatus.pollInFlight = true;
  try {
    // Planning is server-first after bootstrap. On a changed shared revision,
    // retain only the revision and shared UI metadata instead of restoring the
    // full compatibility snapshot; the compact domain read model refreshes
    // planning data independently.
    const metadataOnly = sharedStateStatus.valueProjection === "metadata";
    const snapshot = await requestSharedState("GET", null, {
      knownVersion: sharedStateStatus.version,
      ...(metadataOnly ? { emptyProjection: true } : {}),
    });
    if (snapshot.configured === false) {
      sharedStateStatus.enabled = false;
      sharedStateStatus.configured = false;
      rememberSharedStateDisabled();
      window.clearInterval(sharedStateStatus.pollTimer);
      return;
    }
    const version = Number(snapshot.version || 0);
    if (!snapshot.unchanged && version > sharedStateStatus.version) {
      const preserveLocalSharedUi = shouldPreserveLocalSharedUi();
      applySharedStateSnapshot(snapshot, {
        silent: true,
        preserveLocalSharedUi,
        allowSharedUiOnly: metadataOnly,
      });
      if (preserveLocalSharedUi) scheduleSharedStatePush("local-shared-ui");
    }
  } catch (error) {
    console.warn("[MES] Shared state poll failed", error);
  } finally {
    sharedStateStatus.pollInFlight = false;
  }
}

async function startSharedStateSync() {
  if (!window.fetch) return;
  const startedAt = window.performance?.now?.() ?? Date.now();
  let syncReport = {
    status: "started",
    startedAt: new Date().toISOString(),
  };
  const publishSharedStateSyncPerformance = (details = {}) => {
    const finishedAt = window.performance?.now?.() ?? Date.now();
    const report = {
      ...syncReport,
      ...details,
      durationMs: Math.round((finishedAt - startedAt) * 10) / 10,
      finishedAt: new Date().toISOString(),
    };
    window.__MES_SHARED_STATE_SYNC_PERFORMANCE__ = report;
    try {
      window.sessionStorage?.setItem("mes-shared-state-sync-last", JSON.stringify(report));
    } catch {
      // Diagnostics must never prevent the application from synchronizing.
    }
  };
  // QA, recovery and explicitly isolated sessions can deliberately suspend
  // the shared contour. Previously this flag was only considered by the
  // bootstrap-snapshot fallback, while the initial GET still replaced local
  // state. Respect it before any remote request so an intentional local
  // snapshot cannot be overwritten during application startup.
  if (isSharedStateTemporarilyDisabled()) {
    sharedStateStatus.enabled = false;
    sharedStateStatus.configured = false;
    publishSharedStateSyncPerformance({ status: "skipped", reason: "temporarily-disabled" });
    return;
  }
  try {
    // Planning is the only projection needed for the first frame.  Heavy
    // directories, System Domains and Specifications 2.0 are hydrated by
    // their modules on first use.
    const serverPlanningApplied = await onPlanningBootstrap().catch(() => false);
    sharedStateStatus.valueProjection = serverPlanningApplied ? "metadata" : "planning";
    const initialValueKeys = serverPlanningApplied ? [] : [STORAGE_KEY];
    const snapshot = await requestSharedState("GET", null, serverPlanningApplied
      ? { emptyProjection: true }
      : { valueKeys: initialValueKeys });
    if (snapshot.configured === false) {
      rememberSharedStateDisabled();
      await startBootstrapSnapshotBootstrap();
      restoreBootstrapSnapshotIfCurrentPlanningEmpty(getBootstrapSnapshot());
      console.info("[MES] Shared staging state is disabled: storage is not configured.");
      publishSharedStateSyncPerformance({ status: "unconfigured" });
      return;
    }

    forgetSharedStateDisabled();
    sharedStateStatus.configured = true;
    sharedStateStatus.enabled = true;
    sharedStateStatus.version = Number(snapshot.version || 0);

    if (snapshot.version > 0 && snapshot.values) {
      const preserveLocalSharedUi = shouldPreserveLocalSharedUi();
      const applyStartedAt = window.performance?.now?.() ?? Date.now();
      const applied = applySharedStateSnapshot(snapshot, {
        silent: true,
        preserveLocalSharedUi,
        allowSharedUiOnly: serverPlanningApplied,
      });
      const applyFinishedAt = window.performance?.now?.() ?? Date.now();
      syncReport = {
        status: applied ? "synchronized" : "ignored",
        version: sharedStateStatus.version,
        values: Object.keys(snapshot.values || {}).length,
        applyMs: Math.round((applyFinishedAt - applyStartedAt) * 10) / 10,
      };
      if (sharedStateStatus.pendingValues) {
        await pushSharedState(sharedStateStatus.pendingReason || "startup-local-mutation", { silent: true });
      } else if (preserveLocalSharedUi) {
        scheduleSharedStatePush("local-shared-ui");
      }
      // PostgreSQL can now supply the three large planning collections. Run
      // this only after the compatibility snapshot is fully applied so the
      // caller can perform an exact parity gate instead of racing bootstrap.
      void onPlanningSnapshotSynchronized();
    } else {
      await startBootstrapSnapshotBootstrap();
      const restoredSnapshot = restoreBootstrapSnapshotIfCurrentPlanningEmpty(getBootstrapSnapshot());
      if (restoredSnapshot) {
        await pushSharedState("initial-bootstrap-snapshot", { silent: true });
        publishSharedStateSyncPerformance({ status: "bootstrapped", version: sharedStateStatus.version });
        return;
      }

      rememberSharedUiSignature();
      const counts = getBootstrapSnapshotCountsFromState();
      if (isMeaningfulBootstrapSnapshotCounts(counts)) {
        await pushSharedState("initial-state", { silent: true });
      }
      syncReport = { status: "initialized", version: sharedStateStatus.version };
    }

    window.clearInterval(sharedStateStatus.pollTimer);
    sharedStateStatus.pollTimer = window.setInterval(async () => {
      syncRuntimeState();
      try {
        await pollSharedState();
      } finally {
        commitRuntimeState();
      }
    }, SHARED_STATE_POLL_INTERVAL_MS);
    publishSharedStateSyncPerformance();
  } catch (error) {
    console.warn("[MES] Shared state sync is not available", error);
    publishSharedStateSyncPerformance({
      status: "failed",
      message: error?.message || String(error),
    });
  }
}

function scheduleSharedStateSyncBootstrap() {
  const start = async () => {
    syncRuntimeState();
    try {
      await startSharedStateSync();
    } finally {
      commitRuntimeState();
    }
  };
  void start();
}

function hasMeaningfulPlanningState(sourcePlanning = planningState) {
  return Boolean(
    sourcePlanning?.routes?.length
    || sourcePlanning?.routeSteps?.length
    || sourcePlanning?.slots?.length
  );
}

function getBootstrapSnapshotCountsFromValues(values = {}) {
  return getBootstrapSnapshotCountsFromState(
    parsePlanningStateSnapshot(values[STORAGE_KEY]) || createDefaultPlanningState(),
    parseDirectoryStateSnapshot(values[DIRECTORY_STORAGE_KEY]) || createDefaultDirectoryState(),
  );
}

function isUsableBootstrapSnapshot(snapshot) {
  return isUsableBootstrapSnapshotPayload(snapshot, {
    getCountsFromValues: getBootstrapSnapshotCountsFromValues,
  });
}

function shouldPreferBundledBootstrapSnapshot(bundledSnapshot, savedSnapshot) {
  return shouldPreferBundledBootstrapSnapshotPayload(bundledSnapshot, savedSnapshot, {
    getCountsFromValues: getBootstrapSnapshotCountsFromValues,
  });
}

function getBootstrapSnapshot() {
  const savedSnapshot = parseJsonObject(localStorage.getItem(BOOTSTRAP_SNAPSHOT_STORAGE_KEY));
  if (shouldPreferBundledBootstrapSnapshot(bundledBootstrapSnapshot, savedSnapshot)) return bundledBootstrapSnapshot;
  if (isUsableBootstrapSnapshot(savedSnapshot)) return savedSnapshot;
  if (isUsableBootstrapSnapshot(bundledBootstrapSnapshot)) return bundledBootstrapSnapshot;
  return null;
}

function ensureInitialBootstrapSnapshot() {
  const snapshot = getBootstrapSnapshot();
  if (snapshot && bundledBootstrapSnapshot) return;
  void startBootstrapSnapshotBootstrap();
}

async function startBootstrapSnapshotBootstrap() {
  if (bootstrapSnapshotLoadPromise) return bootstrapSnapshotLoadPromise;
  bootstrapSnapshotLoadPromise = loadBootstrapSnapshotBootstrap();
  return bootstrapSnapshotLoadPromise;
}

async function loadBootstrapSnapshotBootstrap() {
  if (bootstrapSnapshotLoadStarted || typeof fetch !== "function") return getBootstrapSnapshot();
  bootstrapSnapshotLoadStarted = true;

  try {
    const response = await fetch(`${BOOTSTRAP_SNAPSHOT_FILE_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return getBootstrapSnapshot();
    const snapshot = await response.json();
    if (!isUsableBootstrapSnapshot(snapshot)) return getBootstrapSnapshot();
    bundledBootstrapSnapshot = snapshot;
    const savedSnapshot = parseJsonObject(localStorage.getItem(BOOTSTRAP_SNAPSHOT_STORAGE_KEY));
    const hadSavedSnapshot = isUsableBootstrapSnapshot(savedSnapshot);
    const shouldRefreshSavedSnapshot = !hadSavedSnapshot || shouldPreferBundledBootstrapSnapshot(snapshot, savedSnapshot);
    if (shouldRefreshSavedSnapshot) {
      localStorage.setItem(BOOTSTRAP_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
    }
    const restored = isSharedStateTemporarilyDisabled()
      ? restoreBootstrapSnapshotIfCurrentPlanningEmpty(snapshot)
      : false;
    // Caching a fallback snapshot does not change the active state.  Rendering
    // the whole module here created a second expensive paint immediately after
    // startup, most visible on data-dense planning and specification screens.
    // A render is already performed by the restoration path when the snapshot
    // actually supplies missing state.
    return snapshot;
  } catch {
    // File bootstrap snapshots are optional in static deployments.
    return getBootstrapSnapshot();
  }
}

function applyBootstrapSnapshotValues(snapshot, options = {}) {
  if (!isUsableBootstrapSnapshot(snapshot)) return false;
  if (options.backup !== false) backupLocalStateBeforeReset();

  BOOTSTRAP_SNAPSHOT_VALUE_KEYS.forEach((key) => {
    const value = snapshot.values[key];
    if (value === null || typeof value === "undefined") {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  });

  directoryState = loadDirectoryState();
  ensureStatusDirectoryDefaults();
  planningState = loadState();
  ui = loadUiState();
  ui.activeModule = "gantt";
  ui.confirmDialog = null;
  ui.selectedSlotId = null;
  ui.expandedProjects = new Set([
    ...ui.expandedProjects,
    ...(planningState.routes || []).map((route) => route.id),
  ]);
  alignGanttWindowToPlan({ force: true });
  persistUiState();

  if (appBootstrapped) render({ skipRememberScroll: true });
  return true;
}

function restoreBootstrapSnapshotIfCurrentPlanningEmpty(snapshot) {
  if (!BOOTSTRAP_SNAPSHOT_RESTORE_ENABLED) {
    appendLocalDataSafetyAudit("restoreBootstrapSnapshotIfCurrentPlanningEmpty", { status: "skipped" });
    return false;
  }
  if (!snapshot || localStorage.getItem(STORAGE_KEY) || hasMeaningfulPlanningState()) return false;
  return applyBootstrapSnapshotValues(snapshot, { backup: false, silent: true });
}

function createDefaultDirectoryState() {
  return {
    operationMap: MES_OPERATION_MAP,
    nomenclatureTypes: DEFAULT_NOMENCLATURE_TYPES,
    nomenclature: [],
    bomLists: DEFAULT_BOM_LISTS,
    specifications: DEFAULT_SPECIFICATIONS,
    componentTypes: DEFAULT_COMPONENT_TYPES,
    statuses: DEFAULT_STATUSES,
  };
}

function startRuntimeApplication() {
  if (appBootstrapped) return;
  let bootFailed = false;
  try {
    measureBootStep("first render", () => render());
  } catch (error) {
    bootFailed = true;
    console.error("MES startup render failed", error);
    const app = document.querySelector("#app");
    if (app) {
      app.innerHTML = `
        <section class="planning-empty-page" data-layout="main-content" role="alert">
          <section class="planning-empty-panel">
            <div class="planning-empty-icon">!</div>
            <div>
              <h2>Не удалось открыть модуль</h2>
              <p>Обновите страницу. Если ошибка повторится, передайте время её появления в поддержку.</p>
            </div>
          </section>
        </section>
      `;
    }
  }
  appBootstrapped = true;
  const bootOverlay = document.querySelector("[data-mes-boot-overlay]");
  if (bootOverlay) {
    bootOverlay.classList.remove("is-visible");
    bootOverlay.setAttribute("aria-hidden", "true");
    window.setTimeout(() => bootOverlay.remove(), 220);
  }
  publishBootPerformance();
  if (bootFailed) {
    commitRuntimeState();
    return;
  }
  bindExternalStorageSync();
  scheduleSharedStateSyncBootstrap();
  setInterval(() => {
    ui.now = new Date();
    updateClockOnly();
  }, 30000);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const restored = restorePlanningStateFromBackups("missing-planning-storage");
      if (restored) return restored;
      return normalizePlanningState(createDefaultPlanningState());
    }
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1) {
      const restored = restorePlanningStateFromBackups("invalid-planning-version");
      if (restored) return restored;
      return normalizePlanningState(createDefaultPlanningState());
    }
    const normalized = normalizePlanningState(parsed);
    const normalizedRaw = JSON.stringify(normalized);
    if (normalizedRaw !== raw) {
      localStorage.setItem(STORAGE_KEY, normalizedRaw);
    }
    return normalized;
  } catch {
    const restored = restorePlanningStateFromBackups("broken-planning-storage");
    if (restored) return restored;
    return normalizePlanningState(createDefaultPlanningState());
  }
}

function persistState() {
  const previousRaw = localStorage.getItem(STORAGE_KEY);
  const previousState = parsePlanningStateSnapshot(previousRaw);
  if (previousRaw) backupRawPlanningState("before-planning-persist", previousRaw);
  if (previousState && !planningEntityRemovalAllowed) {
    planningState = preserveCriticalPlanningEntities(previousState, planningState);
  }
  const nextRaw = JSON.stringify(planningState);
  try {
    localStorage.setItem(STORAGE_KEY, nextRaw);
  } catch (error) {
    if (error?.name !== "QuotaExceededError") throw error;
    // Backups are recoverability aids, never a reason to block a valid
    // production revision. Free duplicated snapshots and retry the primary
    // state atomically; shared-state synchronization follows after success.
    localStorage.removeItem(PLANNING_BACKUP_STORAGE_KEY);
    localStorage.removeItem(STATE_RESET_BACKUP_STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, nextRaw);
  }
  scheduleSharedStatePush("planning-state");
}

function recoverPlanningStateFromStorageIfRuntimeEmpty(reason = "runtime-empty") {
  const storedState = parsePlanningStateSnapshot(localStorage.getItem(STORAGE_KEY));
  if (!storedState || !hasMeaningfulPlanningState(storedState) || hasMeaningfulPlanningState(planningState)) return false;
  const restored = recoverPlanningRuntimeSnapshot(storedState);
  if (!hasMeaningfulPlanningState(restored)) return false;
  planningState = restored;
  console.info(`[MES] Planning state restored from storage after ${reason}.`);
  return true;
}

function recoverPlanningRuntimeSnapshot(snapshot = {}) {
  return {
    ...createDefaultPlanningState(),
    ...snapshot,
    version: 1,
    projects: Array.isArray(snapshot.projects) ? snapshot.projects : [],
    workCenters: mergeMesWorkCenters(Array.isArray(snapshot.workCenters) ? snapshot.workCenters : []),
    routes: Array.isArray(snapshot.routes) ? snapshot.routes : [],
    routeSteps: Array.isArray(snapshot.routeSteps) ? snapshot.routeSteps : [],
    slots: Array.isArray(snapshot.slots) ? snapshot.slots : [],
    shiftMasterAssignments: normalizeShiftMasterRecordMap(snapshot.shiftMasterAssignments, normalizeShiftMasterAssignment),
    dispatchFacts: normalizeShiftMasterRecordMap(snapshot.dispatchFacts, normalizeDispatchFact),
    planningCorrections: normalizeShiftMasterRecordMap(snapshot.planningCorrections, normalizePlanningCorrection),
  };
}

function parsePlanningStateSnapshot(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function backupRawPlanningState(reason, raw = localStorage.getItem(STORAGE_KEY)) {
  if (!raw) return;
  // A browser quota is commonly 5–10 MB. Keeping multiple complete copies of
  // a large planning graph prevents the graph itself from being saved.
  if (raw.length > 750_000) return;
  try {
    const currentHistory = JSON.parse(localStorage.getItem(PLANNING_BACKUP_STORAGE_KEY) || "[]");
    const history = Array.isArray(currentHistory) ? currentHistory : [];
    history.unshift({
      createdAt: new Date().toISOString(),
      reason,
      version: APP_VERSION,
      raw,
    });
    localStorage.setItem(PLANNING_BACKUP_STORAGE_KEY, JSON.stringify(history.slice(0, 2)));
  } catch {
    try {
      localStorage.removeItem(PLANNING_BACKUP_STORAGE_KEY);
    } catch {}
  }
}

function collectPlanningRecoverySnapshots() {
  const snapshots = [];
  try {
    const history = JSON.parse(localStorage.getItem(PLANNING_BACKUP_STORAGE_KEY) || "[]");
    if (Array.isArray(history)) {
      history.forEach((entry) => {
        const parsed = parsePlanningStateSnapshot(entry?.raw);
        if (!parsed) return;
        snapshots.push({
          state: parsed,
          reason: entry.reason || "planning-backup",
          createdAt: entry.createdAt || "",
        });
      });
    }
  } catch {}

  try {
    const resetBackup = JSON.parse(localStorage.getItem(STATE_RESET_BACKUP_STORAGE_KEY) || "null");
    const raw = resetBackup?.values?.[STORAGE_KEY];
    const parsed = parsePlanningStateSnapshot(raw);
    if (parsed) {
      snapshots.push({
        state: parsed,
        reason: "state-reset-backup",
        createdAt: resetBackup.createdAt || "",
      });
    }
  } catch {}

  return snapshots;
}

function getCriticalPlanningCounts(state) {
  return {
    routes: Array.isArray(state?.routes) ? state.routes.length : 0,
    routeSteps: Array.isArray(state?.routeSteps) ? state.routeSteps.length : 0,
    slots: Array.isArray(state?.slots) ? state.slots.length : 0,
  };
}

function getPlanningRecoveryScore(snapshot) {
  const counts = getCriticalPlanningCounts(snapshot?.state);
  return counts.routes * 10 + counts.routeSteps + counts.slots;
}

function restorePlanningStateFromBackups(reason) {
  const candidates = collectPlanningRecoverySnapshots()
    .filter((snapshot) => getPlanningRecoveryScore(snapshot) > 0)
    .sort((left, right) => (
      getPlanningRecoveryScore(right) - getPlanningRecoveryScore(left)
      || String(right.createdAt || "").localeCompare(String(left.createdAt || ""))
    ));
  const best = candidates[0];
  if (!best) return null;

  const normalized = normalizePlanningState(best.state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  console.warn("[MES] Restored planning state from local backup.", {
    reason,
    source: best.reason,
    counts: getCriticalPlanningCounts(normalized),
  });
  return normalized;
}

function preserveCriticalPlanningEntities(previousState, nextState) {
  if (!previousState || !nextState) return nextState;
  const previousCounts = getCriticalPlanningCounts(previousState);
  const nextCounts = getCriticalPlanningCounts(nextState);
  let changed = false;
  const mergedState = { ...nextState };

  if (previousCounts.routes > 0 && nextCounts.routes === 0) {
    mergedState.routes = previousState.routes || [];
    changed = true;
  }
  if (previousCounts.routeSteps > 0 && nextCounts.routeSteps === 0) {
    mergedState.routeSteps = previousState.routeSteps || [];
    changed = true;
  }

  if (!changed) return nextState;

  console.warn("[MES] Prevented critical planning wipe before save.", {
    previousCounts,
    nextCounts,
    mergedCounts: getCriticalPlanningCounts(mergedState),
  });
  return mergedState;
}

function parseDirectoryStateSnapshot(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function backupRawDirectoryState(reason, raw = localStorage.getItem(DIRECTORY_STORAGE_KEY)) {
  if (!raw) return;
  try {
    const currentHistory = JSON.parse(localStorage.getItem(DIRECTORY_BACKUP_STORAGE_KEY) || "[]");
    const history = Array.isArray(currentHistory) ? currentHistory : [];
    history.unshift({
      createdAt: new Date().toISOString(),
      reason,
      version: APP_VERSION,
      raw,
    });
    localStorage.setItem(DIRECTORY_BACKUP_STORAGE_KEY, JSON.stringify(history.slice(0, 10)));
  } catch {
    localStorage.setItem(DIRECTORY_BACKUP_STORAGE_KEY, JSON.stringify([{
      createdAt: new Date().toISOString(),
      reason,
      version: APP_VERSION,
      raw,
    }]));
  }
}

function collectDirectoryRecoverySnapshots() {
  const snapshots = [];
  try {
    const history = JSON.parse(localStorage.getItem(DIRECTORY_BACKUP_STORAGE_KEY) || "[]");
    if (Array.isArray(history)) {
      history.forEach((entry) => {
        const parsed = parseDirectoryStateSnapshot(entry?.raw);
        if (!parsed) return;
        snapshots.push({
          state: parsed,
          reason: entry.reason || "directory-backup",
          createdAt: entry.createdAt || "",
        });
      });
    }
  } catch {}

  try {
    const resetBackup = JSON.parse(localStorage.getItem(STATE_RESET_BACKUP_STORAGE_KEY) || "null");
    const raw = resetBackup?.values?.[DIRECTORY_STORAGE_KEY];
    const parsed = parseDirectoryStateSnapshot(raw);
    if (parsed) {
      snapshots.push({
        state: parsed,
        reason: "state-reset-backup",
        createdAt: resetBackup.createdAt || "",
      });
    }
  } catch {}

  return snapshots;
}

function getDirectoryRecoveryScore(snapshot) {
  const counts = getCriticalDirectoryCounts(snapshot?.state);
  return counts.bomLists + counts.specifications;
}

function restoreDirectoryStateFromBackups(reason) {
  const candidates = collectDirectoryRecoverySnapshots()
    .filter((snapshot) => getDirectoryRecoveryScore(snapshot) > 0)
    .sort((left, right) => (
      getDirectoryRecoveryScore(right) - getDirectoryRecoveryScore(left)
      || String(right.createdAt || "").localeCompare(String(left.createdAt || ""))
    ));
  const best = candidates[0];
  if (!best) return null;

  const normalized = omitDeletedCriticalDirectoryEntities(normalizeDirectoryState(best.state, { mergeFallback: false }));
  localStorage.setItem(DIRECTORY_STORAGE_KEY, JSON.stringify(normalized));
  localStorage.setItem(DIRECTORY_DEFAULTS_STORAGE_KEY, "1");
  console.warn("[MES] Restored directory state from local backup.", {
    reason,
    source: best.reason,
    counts: getCriticalDirectoryCounts(normalized),
  });
  return normalized;
}

function getCriticalDirectoryCounts(state) {
  return {
    bomLists: Array.isArray(state?.bomLists) ? state.bomLists.length : 0,
    specifications: Array.isArray(state?.specifications) ? state.specifications.length : 0,
  };
}

function getDirectoryRowTimestamp(row) {
  const candidates = [row?.updatedAt, row?.importedAt, row?.createdAt]
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  return candidates.length ? Math.max(...candidates) : 0;
}

function readDirectoryDeletedEntities() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DIRECTORY_DELETED_ENTITIES_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDirectoryDeletedEntities(tombstones) {
  try {
    localStorage.setItem(DIRECTORY_DELETED_ENTITIES_STORAGE_KEY, JSON.stringify(tombstones));
  } catch {}
}

function recordDirectoryEntityDeletion(sectionId, rowId) {
  if (!CRITICAL_DIRECTORY_SECTION_IDS.includes(sectionId) || !rowId) return;
  const tombstones = readDirectoryDeletedEntities();
  tombstones[sectionId] = {
    ...(tombstones[sectionId] || {}),
    [rowId]: Date.now(),
  };
  writeDirectoryDeletedEntities(tombstones);
}

function wasDirectoryEntityDeletedAfter(sectionId, row) {
  const rowId = row?.id;
  if (!rowId) return false;
  const deletedAt = Number(readDirectoryDeletedEntities()?.[sectionId]?.[rowId] || 0);
  return deletedAt > 0 && deletedAt >= getDirectoryRowTimestamp(row);
}

function omitDeletedCriticalDirectoryEntities(state) {
  if (!state) return state;
  let changed = false;
  const nextState = { ...state };
  CRITICAL_DIRECTORY_SECTION_IDS.forEach((sectionId) => {
    const rows = Array.isArray(nextState[sectionId]) ? nextState[sectionId] : [];
    const filteredRows = rows.filter((row) => !wasDirectoryEntityDeletedAfter(sectionId, row));
    if (filteredRows.length !== rows.length) {
      nextState[sectionId] = filteredRows;
      changed = true;
    }
  });
  return changed ? nextState : state;
}

function mergeCriticalDirectorySection(sectionId, previousRows = [], nextRows = []) {
  const canKeepRow = (row) => {
    if (!row) return false;
    if (sectionId === "statuses" && REMOVED_DIRECTORY_STATUS_ID_PREFIXES.some((prefix) => String(row.id || "").startsWith(prefix))) return false;
    return true;
  };
  const previousMaxTimestamp = previousRows
    .filter((row) => canKeepRow(row))
    .reduce((max, row) => Math.max(max, getDirectoryRowTimestamp(row)), 0);
  const merged = [];
  const indexById = new Map();
  let changed = false;

  const remember = (row) => {
    if (!row?.id || !canKeepRow(row)) {
      changed = true;
      return;
    }
    const existingIndex = indexById.get(row.id);
    if (existingIndex === undefined) {
      indexById.set(row.id, merged.length);
      merged.push(row);
      return;
    }
    if (getDirectoryRowTimestamp(row) > getDirectoryRowTimestamp(merged[existingIndex])) {
      merged[existingIndex] = row;
      changed = true;
    }
  };

  previousRows.forEach((row) => {
    if (!canKeepRow(row)) {
      changed = true;
      return;
    }
    if (wasDirectoryEntityDeletedAfter(sectionId, row)) {
      changed = true;
      return;
    }
    remember(row);
  });

  nextRows.forEach((row) => {
    if (!row?.id || !canKeepRow(row)) {
      changed = true;
      return;
    }
    if (wasDirectoryEntityDeletedAfter(sectionId, row)) {
      changed = true;
      return;
    }
    if (indexById.has(row.id)) {
      remember(row);
      return;
    }
    if (!previousRows.length || getDirectoryRowTimestamp(row) > previousMaxTimestamp) {
      remember(row);
      return;
    }
    changed = true;
  });

  if (merged.length !== nextRows.length) changed = true;
  return { rows: merged, changed };
}

function preserveCriticalDirectoryEntities(previousState, nextState) {
  if (!previousState || !nextState) return nextState;
  const mergedState = { ...nextState };
  const changedSections = [];

  CRITICAL_DIRECTORY_SECTION_IDS.forEach((sectionId) => {
    const previousRows = Array.isArray(previousState?.[sectionId]) ? previousState[sectionId] : [];
    const nextRows = Array.isArray(nextState?.[sectionId]) ? nextState[sectionId] : [];
    const merged = mergeCriticalDirectorySection(sectionId, previousRows, nextRows);
    if (merged.changed) {
      mergedState[sectionId] = merged.rows;
      changedSections.push(sectionId);
    }
  });

  if (!changedSections.length) return nextState;

  console.warn("[MES] Reconciled critical directory entities before save.", {
    changedSections,
    previousCounts: getCriticalDirectoryCounts(previousState),
    nextCounts: getCriticalDirectoryCounts(nextState),
    mergedCounts: getCriticalDirectoryCounts(mergedState),
  });

  return mergedState;
}

function withDirectoryEntityRemovalAllowed(callback) {
  const previousValue = directoryEntityRemovalAllowed;
  directoryEntityRemovalAllowed = true;
  try {
    return callback();
  } finally {
    directoryEntityRemovalAllowed = previousValue;
  }
}

function withPlanningEntityRemovalAllowed(callback) {
  const previousValue = planningEntityRemovalAllowed;
  planningEntityRemovalAllowed = true;
  try {
    return callback();
  } finally {
    planningEntityRemovalAllowed = previousValue;
  }
}

function loadDirectoryState() {
  try {
    const raw = localStorage.getItem(DIRECTORY_STORAGE_KEY);
    if (!raw) {
      const restored = restoreDirectoryStateFromBackups("missing-directory-storage");
      if (restored) return restored;
      const fallback = normalizeDirectoryState(createDefaultDirectoryState());
      localStorage.setItem(DIRECTORY_STORAGE_KEY, JSON.stringify(fallback));
      localStorage.setItem(DIRECTORY_DEFAULTS_STORAGE_KEY, "1");
      return fallback;
    }
    const shouldRestoreDefaults = localStorage.getItem(DIRECTORY_DEFAULTS_STORAGE_KEY) !== "1";
    const parsed = JSON.parse(raw);
    let normalized = preserveCriticalDirectoryEntities(
      parsed,
      normalizeDirectoryState(parsed, { mergeFallback: shouldRestoreDefaults }),
    );
    normalized = omitDeletedCriticalDirectoryEntities(normalized);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw || shouldRestoreDefaults) {
      backupRawDirectoryState("before-directory-load-normalize", raw);
      localStorage.setItem(DIRECTORY_STORAGE_KEY, serialized);
    }
    localStorage.setItem(DIRECTORY_DEFAULTS_STORAGE_KEY, "1");
    return normalized;
  } catch {
    const restored = restoreDirectoryStateFromBackups("broken-directory-storage");
    if (restored) return restored;
    return createDefaultDirectoryState();
  }
}

function ensureStatusDirectoryDefaults() {
  if (!directoryState) return;
  const rows = Array.isArray(directoryState.statuses) ? directoryState.statuses : [];
  const existingIds = new Set(rows.map((row) => row?.id).filter(Boolean));
  const missingRows = DEFAULT_STATUSES.filter((row) => row?.id && !existingIds.has(row.id));
  if (!missingRows.length) return;
  directoryState.statuses = [
    ...rows,
    ...missingRows.map((row) => normalizeDirectoryRow("statuses", row)),
  ];
  persistDirectoryState();
}

function isSameNumericValue(left, right, precision = 0.000001) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  return Number.isFinite(leftNumber)
    && Number.isFinite(rightNumber)
    && Math.abs(leftNumber - rightNumber) <= precision;
}

function persistDirectoryState() {
  const previousRaw = localStorage.getItem(DIRECTORY_STORAGE_KEY);
  const previousState = parseDirectoryStateSnapshot(previousRaw);
  if (previousRaw) backupRawDirectoryState("before-directory-persist", previousRaw);
  if (previousState && !directoryEntityRemovalAllowed) {
    directoryState = preserveCriticalDirectoryEntities(previousState, directoryState);
  }
  directoryState = omitDeletedCriticalDirectoryEntities(directoryState);
  localStorage.setItem(DIRECTORY_STORAGE_KEY, JSON.stringify(directoryState));
  scheduleSharedStatePush("directory-state");
}

let planningCoreService = {};

  const api = {
    handleDevResetParams,
    backupLocalStateBeforeReset,
    parseJsonObject,
    getSharedStateClientId,
    getSharedStateActorLabel,
    getSharedUiSnapshot,
    getSharedUiSignature,
    rememberSharedUiSignature,
    getSharedUiDirtyMarker,
    markSharedUiDirty,
    clearSharedUiDirty,
    shouldPreserveLocalSharedUi,
    applySharedUiSnapshot,
    isSharedStateTemporarilyDisabled,
    rememberSharedStateDisabled,
    forgetSharedStateDisabled,
    getSharedStateValues,
    writeSharedStateValues,
    applySharedStateSnapshot,
    syncExternalStorageState,
    bindExternalStorageSync,
    scheduleSharedStatePush,
    hydrateSharedStateValues,
    scheduleSharedStateSyncBootstrap,
    hasMeaningfulPlanningState,
    getBootstrapSnapshotCountsFromValues,
    isUsableBootstrapSnapshot,
    shouldPreferBundledBootstrapSnapshot,
    getBootstrapSnapshot,
    ensureInitialBootstrapSnapshot,
    applyBootstrapSnapshotValues,
    restoreBootstrapSnapshotIfCurrentPlanningEmpty,
    createDefaultDirectoryState,
    loadState,
    persistState,
    recoverPlanningStateFromStorageIfRuntimeEmpty,
    recoverPlanningRuntimeSnapshot,
    parsePlanningStateSnapshot,
    backupRawPlanningState,
    collectPlanningRecoverySnapshots,
    getCriticalPlanningCounts,
    getPlanningRecoveryScore,
    restorePlanningStateFromBackups,
    preserveCriticalPlanningEntities,
    parseDirectoryStateSnapshot,
    backupRawDirectoryState,
    collectDirectoryRecoverySnapshots,
    getDirectoryRecoveryScore,
    restoreDirectoryStateFromBackups,
    getCriticalDirectoryCounts,
    getDirectoryRowTimestamp,
    readDirectoryDeletedEntities,
    writeDirectoryDeletedEntities,
    recordDirectoryEntityDeletion,
    wasDirectoryEntityDeletedAfter,
    omitDeletedCriticalDirectoryEntities,
    mergeCriticalDirectorySection,
    preserveCriticalDirectoryEntities,
    withDirectoryEntityRemovalAllowed,
    withPlanningEntityRemovalAllowed,
    loadDirectoryState,
    ensureStatusDirectoryDefaults,
    isSameNumericValue,
    persistDirectoryState,
    startRuntimeApplication,
  };

  return Object.fromEntries(Object.entries(api).map(([name, fn]) => [name, function runtimeStateServiceEntry(...args) {
    syncRuntimeState();
    try {
      const result = fn(...args);
      commitRuntimeState();
      return result;
    } catch (error) {
      commitRuntimeState();
      throw error;
    }
  }]));
}
