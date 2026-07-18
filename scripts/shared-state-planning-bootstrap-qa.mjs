import { createRuntimeStateServiceModule } from "../src/modules/runtime_state/service.js";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function jsonResponse(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(message);
}

const planningSnapshot = {
  version: 1,
  routes: [{ id: "route-qa", name: "Заказ QA" }],
  routeSteps: [{ id: "step-qa", routeId: "route-qa" }],
  slots: [{ id: "slot-qa", routeStepId: "step-qa" }],
};

async function withHarness({
  mode = "required",
  onPlanningBootstrap = async () => true,
  shouldHydrate = () => false,
  responseForRequest = null,
}, verify) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const previousSetInterval = globalThis.setInterval;
  const previousClearInterval = globalThis.clearInterval;
  const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  const requests = [];
  const pollCallbacks = [];
  let ui = { expandedProjects: new Set() };
  let planningState = { version: 1, routes: [], routeSteps: [], slots: [] };
  let directoryState = { statuses: [] };
  const sharedStateStatus = {
    configured: false,
    enabled: false,
    version: 0,
    saveTimer: null,
    pollTimer: null,
    saveInFlight: false,
    pollInFlight: false,
    pendingReason: "",
    pendingWriteMode: "",
    pendingValues: null,
    pendingSharedUi: null,
    pendingSharedUiFull: null,
    sharedUiBase: null,
    lastSharedUiSignature: "",
  };
  let synchronizedCalls = 0;

  try {
    globalThis.window = {
      localStorage,
      sessionStorage,
      crypto: { randomUUID: () => "planning-bootstrap-qa" },
      fetch: () => globalThis.fetch(),
      // The service timeout protects real browser fetches. These deterministic
      // in-memory responses do not need a live eight-second timer per read.
      setTimeout: () => null,
      clearTimeout: () => {},
      setInterval: (callback) => {
        pollCallbacks.push(callback);
        return pollCallbacks.length;
      },
      clearInterval: () => {},
      performance: { now: () => Date.now() },
      addEventListener: () => {},
    };
    globalThis.document = { querySelector: () => null, visibilityState: "visible" };
    // startRuntimeApplication owns a clock timer through the global timer
    // API. It is unrelated to this deterministic startup test and would keep
    // the Node process alive for its first 30-second tick.
    globalThis.setInterval = () => 0;
    globalThis.clearInterval = () => {};
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: localStorage,
    });
    globalThis.fetch = async (_url, request = {}) => {
      const entry = { headers: { ...(request.headers || {}) } };
      requests.push(entry);
      const response = responseForRequest
        ? await responseForRequest(entry, requests)
        : entry.headers["X-MES-Shared-State-Keys"] === "qa-planning"
          ? { ok: true, configured: true, version: 2, values: { "qa-planning": JSON.stringify(planningSnapshot) }, sharedUi: {} }
          : { ok: true, configured: true, version: 1, values: {}, sharedUi: {} };
      return jsonResponse(response);
    };

    const service = createRuntimeStateServiceModule({
      APP_VERSION: "v.qa",
      BOOTSTRAP_SNAPSHOT_FILE_URL: "/bootstrap.json",
      BOOTSTRAP_SNAPSHOT_RESTORE_ENABLED: false,
      BOOTSTRAP_SNAPSHOT_STORAGE_KEY: "qa-bootstrap",
      BOOTSTRAP_SNAPSHOT_VALUE_KEYS: [],
      CRITICAL_DIRECTORY_SECTION_IDS: [],
      DEFAULT_BOM_LISTS: [],
      DEFAULT_COMPONENT_TYPES: [],
      DEFAULT_NOMENCLATURE_TYPES: [],
      DEFAULT_SPECIFICATIONS: [],
      DEFAULT_STATUSES: [],
      DIRECTORY_BACKUP_STORAGE_KEY: "qa-directory-backup",
      DIRECTORY_DEFAULTS_STORAGE_KEY: "qa-directory-defaults",
      DIRECTORY_DELETED_ENTITIES_STORAGE_KEY: "qa-directory-deleted",
      DIRECTORY_STORAGE_KEY: "qa-directories",
      MES_OPERATION_MAP: {},
      PLANNING_BACKUP_STORAGE_KEY: "qa-planning-backup",
      REMOVED_DIRECTORY_STATUS_ID_PREFIXES: [],
      SHARED_STATE_API_URL: "/api/shared-state",
      SHARED_STATE_CLIENT_ID_KEY: "qa-client-id",
      SHARED_STATE_DISABLED_RECHECK_MS: 1,
      SHARED_STATE_DISABLED_UNTIL_KEY: "qa-disabled-until",
      SHARED_STATE_POLL_INTERVAL_MS: 60_000,
      SHARED_STATE_SAVE_DEBOUNCE_MS: 0,
      SHARED_STATE_VALUE_KEYS: ["qa-planning", "qa-directories"],
      SPECIFICATIONS2_STORAGE_KEY: "qa-specifications2",
      SHARED_UI_LOCAL_DIRTY_KEY: "qa-ui-dirty",
      SHARED_UI_LOCAL_DIRTY_TTL_MS: 60_000,
      STATE_RESET_BACKUP_STORAGE_KEY: "qa-reset-backup",
      STORAGE_KEY: "qa-planning",
      STORAGE_KEYS: ["qa-planning", "qa-directories"],
      SYSTEM_DOMAINS_STORAGE_KEY: "",
      SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY: "",
      alignGanttWindowToPlan: () => {},
      appendLocalDataSafetyAudit: () => {},
      createDefaultPlanningState: () => ({ version: 1, routes: [], routeSteps: [], slots: [] }),
      getActiveInterfaceRole: () => null,
      getBootstrapSnapshotCountsFromState: () => ({}),
      isMeaningfulBootstrapSnapshotCounts: () => false,
      isUsableBootstrapSnapshotPayload: () => false,
      loadUiState: () => ui,
      measureBootStep: (_label, callback) => callback(),
      mergeMesWorkCenters: (workCenters = []) => workCenters,
      normalizeAccessRoleAssignments: (value) => value || {},
      normalizeAccessRoleProfiles: (value) => Array.isArray(value) ? value : [],
      normalizeDirectoryRow: (_section, row) => row,
      normalizeDirectoryState: (value) => value || { statuses: [] },
      normalizeDispatchFact: (value) => value,
      normalizeGanttDependencyRouteStore: (value) => value || {},
      normalizePlainRecord: (value) => value || {},
      normalizePlanningCorrection: (value) => value,
      normalizePlanningState: (value) => value || {},
      normalizeShiftMasterAssignment: (value) => value,
      normalizeShiftMasterAssignmentMatrix: (value) => value || {},
      normalizeShiftMasterRecordMap: (value) => value || {},
      notifySaveSuccess: () => {},
      getInitialPlanningBootstrapMode: () => mode,
      onPlanningBootstrap,
      onPlanningSnapshotSynchronized: () => { synchronizedCalls += 1; },
      shouldHydratePlanningAfterSharedSync: shouldHydrate,
      persistUiState: () => {},
      publishBootPerformance: () => {},
      reloadSystemDomainsState: () => {},
      render: () => {},
      sharedStateStatus,
      shouldPreferBundledBootstrapSnapshotPayload: () => false,
      syncActiveRoleWithAuthorization: () => {},
      syncProductionStructureMatrixToPlanningState: () => false,
      updateClockOnly: () => {},
      getUi: () => ui,
      setUi: (next) => { ui = next; },
      getPlanningState: () => planningState,
      setPlanningState: (next) => { planningState = next; },
      getDirectoryState: () => directoryState,
      setDirectoryState: (next) => { directoryState = next; },
      getAppBootstrapped: () => false,
      setAppBootstrapped: () => {},
      getExternalStorageSyncTimer: () => null,
      setExternalStorageSyncTimer: () => {},
      getSharedStateApplyingRemote: () => false,
      setSharedStateApplyingRemote: () => {},
      getBundledBootstrapSnapshot: () => null,
      setBundledBootstrapSnapshot: () => {},
      getBootstrapSnapshotLoadStarted: () => false,
      setBootstrapSnapshotLoadStarted: () => {},
      getBootstrapSnapshotLoadPromise: () => null,
      setBootstrapSnapshotLoadPromise: () => {},
      getDirectoryEntityRemovalAllowed: () => false,
      setDirectoryEntityRemovalAllowed: () => {},
      getPlanningEntityRemovalAllowed: () => false,
      setPlanningEntityRemovalAllowed: () => {},
    });

    service.startRuntimeApplication();
    await verify({
      requests,
      pollCallbacks,
      service,
      sharedStateStatus,
      getPlanningState: () => planningState,
      getSynchronizedCalls: () => synchronizedCalls,
    });
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
    globalThis.setInterval = previousSetInterval;
    globalThis.clearInterval = previousClearInterval;
    if (previousLocalStorage) Object.defineProperty(globalThis, "localStorage", previousLocalStorage);
    else delete globalThis.localStorage;
  }
}

let resolvePlanningBootstrap;
let planningBootstrapCalls = 0;
const planningBootstrapPromise = new Promise((resolve) => { resolvePlanningBootstrap = resolve; });
await withHarness({
  mode: "required",
  onPlanningBootstrap: () => {
    planningBootstrapCalls += 1;
    return planningBootstrapPromise;
  },
}, async ({ requests, sharedStateStatus, getSynchronizedCalls }) => {
  await waitFor(() => requests.length === 1, "Metadata read must start before the Planning BFF settles");
  assert(planningBootstrapCalls === 1, "Planning startup must begin exactly one BFF bootstrap");
  assert(requests[0].headers["X-MES-Shared-State-Keys"] === "__none__", "Healthy Planning startup must start with a metadata-only shared-state read");
  resolvePlanningBootstrap(true);
  await waitFor(() => sharedStateStatus.enabled, "Planning startup did not complete after its BFF resolved");
  assert(sharedStateStatus.valueProjection === "metadata", "Healthy Planning bootstrap must retain metadata-only polling");
  assert(getSynchronizedCalls() === 1, "Healthy Planning boot must preserve the post-sync parity hook");
});

let deferredBootstrapCalls = 0;
await withHarness({
  mode: "deferred",
  onPlanningBootstrap: () => { deferredBootstrapCalls += 1; return true; },
}, async ({ requests, sharedStateStatus, getSynchronizedCalls }) => {
  await waitFor(() => sharedStateStatus.enabled, "Deferred-module startup did not complete");
  assert(deferredBootstrapCalls === 0, "A non-Planning startup must not request the Planning BFF");
  assert(requests.length === 1 && requests[0].headers["X-MES-Shared-State-Keys"] === "__none__", "A non-Planning startup must use just the metadata shared-state read");
  assert(sharedStateStatus.valueProjection === "metadata", "Deferred-module polling must remain metadata-only");
  assert(getSynchronizedCalls() === 0, "A non-Planning startup must not schedule a Planning rehydration");
});

await withHarness({ mode: "required", onPlanningBootstrap: async () => false }, async ({ requests, sharedStateStatus }) => {
  await waitFor(() => sharedStateStatus.enabled, "Legacy Planning fallback did not complete");
  assert(requests.some((request) => request.headers["X-MES-Shared-State-Keys"] === "qa-planning"), "An unavailable Planning BFF must retain the narrow legacy planning-snapshot fallback");
  assert(sharedStateStatus.valueProjection === "planning", "Legacy fallback must retain full planning polling semantics");
});

await withHarness({
  mode: "deferred",
  responseForRequest: async (request) => {
    if (request.headers["X-MES-Shared-State-Keys"] === "qa-planning") {
      return {
        ok: true,
        configured: true,
        version: 7,
        values: { "qa-planning": JSON.stringify(planningSnapshot) },
        sharedUi: { ganttDependencyRoutes: { "slot-qa": "route-qa" } },
      };
    }
    return { ok: true, configured: true, version: 6, unchanged: true, values: {}, sharedUi: {} };
  },
}, async ({ requests, pollCallbacks, service, sharedStateStatus, getPlanningState }) => {
  await waitFor(() => sharedStateStatus.enabled, "Deferred startup did not complete before Planning fallback");
  const promoted = await service.hydratePlanningSnapshotFallback();
  assert(promoted, "Deferred-to-Planning fallback must apply the full planning snapshot through runtime state");
  assert(sharedStateStatus.valueProjection === "planning", "Deferred-to-Planning fallback must promote future polling to the full planning projection");
  assert(sharedStateStatus.version === 7, "Deferred-to-Planning fallback must retain the full snapshot revision");
  assert(getPlanningState().routes?.[0]?.id === "route-qa", "Deferred-to-Planning fallback must apply routes to runtime state, not only localStorage");
  assert(pollCallbacks.length === 1, "Startup must register exactly one shared-state polling callback");
  await pollCallbacks[0]();
  const lastRequest = requests.at(-1);
  assert(lastRequest.headers["X-MES-Shared-State-Keys"] !== "__none__", "After fallback promotion the next poll must not remain metadata-only");
});

let resolveLateMetadataPoll;
let lateMetadataPollStarted = false;
const lateMetadataPoll = new Promise((resolve) => { resolveLateMetadataPoll = resolve; });
await withHarness({
  mode: "deferred",
  responseForRequest: async (request) => {
    const keys = request.headers["X-MES-Shared-State-Keys"];
    const knownVersion = request.headers["X-MES-Shared-State-Version"];
    if (keys === "qa-planning") {
      return { ok: true, configured: true, version: 11, values: { "qa-planning": JSON.stringify(planningSnapshot) }, sharedUi: {} };
    }
    if (keys === "__none__" && knownVersion === "10") {
      lateMetadataPollStarted = true;
      return lateMetadataPoll;
    }
    return { ok: true, configured: true, version: Number(knownVersion || 10), unchanged: true, values: {}, sharedUi: {} };
  },
}, async ({ requests, pollCallbacks, service, sharedStateStatus, getPlanningState }) => {
  await waitFor(() => sharedStateStatus.enabled && sharedStateStatus.version === 10, "Deferred startup did not establish the metadata revision");
  const stalePoll = pollCallbacks[0]();
  await waitFor(() => lateMetadataPollStarted, "The metadata poll did not begin before fallback promotion");
  const promoted = await service.hydratePlanningSnapshotFallback();
  assert(promoted && sharedStateStatus.version === 11, "Full fallback must win over the older in-flight metadata poll");
  resolveLateMetadataPoll({ ok: true, configured: true, version: 12, values: {}, sharedUi: { ganttDependencyRoutes: { stale: "metadata-only" } } });
  await stalePoll;
  assert(sharedStateStatus.version === 11, "A late metadata response must not advance the revision after a full Planning fallback");
  assert(getPlanningState().routeSteps?.[0]?.id === "step-qa", "A late metadata response must not replace the full Planning projection");
  await pollCallbacks[0]();
  const lastRequest = requests.at(-1);
  assert(lastRequest.headers["X-MES-Shared-State-Keys"] !== "__none__", "The post-race poll must use the promoted full Planning contract");
});

console.log("Shared-state Planning bootstrap QA: OK");
