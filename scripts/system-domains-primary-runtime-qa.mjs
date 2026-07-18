import { readFile } from "node:fs/promises";
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

const previousWindow = globalThis.window;
const previousLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const previousFetch = globalThis.fetch;
const localStorage = createStorage();
const sessionStorage = createStorage();
const systemDomainsKey = "qa-system-domains";
const tombstoneKey = "qa-system-domains-primary";
const requests = [];
let retirementNotifications = 0;

try {
  globalThis.window = {
    localStorage,
    sessionStorage,
    crypto: { randomUUID: () => "system-domains-primary-qa" },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance: { now: () => Date.now() },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: localStorage,
  });
  globalThis.fetch = async (_url, request = {}) => {
    requests.push(request);
    const isFirstRead = requests.length === 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        configured: true,
        values: {
          [systemDomainsKey]: isFirstRead ? null : JSON.stringify({ stale: true }),
        },
      }),
    };
  };

  const sharedStateStatus = {
    enabled: false,
    configured: true,
    version: 0,
    pendingReason: "",
    pendingWriteMode: "",
    pendingValues: null,
    pendingSharedUi: null,
    pendingSharedUiFull: null,
    sharedUiBase: null,
    lastSharedUiSignature: "",
    saveTimer: null,
    saveInFlight: false,
  };
  const service = createRuntimeStateServiceModule({
    APP_VERSION: "v.qa",
    BOOTSTRAP_SNAPSHOT_FILE_URL: "",
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
    SHARED_STATE_POLL_INTERVAL_MS: 1_000,
    SHARED_STATE_SAVE_DEBOUNCE_MS: 0,
    SHARED_STATE_VALUE_KEYS: [systemDomainsKey],
    SPECIFICATIONS2_STORAGE_KEY: "qa-specifications2",
    SHARED_UI_LOCAL_DIRTY_KEY: "qa-ui-dirty",
    SHARED_UI_LOCAL_DIRTY_TTL_MS: 60_000,
    STATE_RESET_BACKUP_STORAGE_KEY: "qa-reset-backup",
    STORAGE_KEY: "qa-planning",
    STORAGE_KEYS: [],
    SYSTEM_DOMAINS_STORAGE_KEY: systemDomainsKey,
    SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY: tombstoneKey,
    alignGanttWindowToPlan: () => {},
    appendLocalDataSafetyAudit: () => {},
    createDefaultPlanningState: () => ({ routes: [], routeSteps: [], slots: [] }),
    getActiveInterfaceRole: () => null,
    getBootstrapSnapshotCountsFromState: () => ({}),
    isMeaningfulBootstrapSnapshotCounts: () => false,
    isUsableBootstrapSnapshotPayload: () => false,
    isSystemDomainsServerAuthoritative: () => sessionStorage.getItem(tombstoneKey) === "1",
    loadUiState: () => ({}),
    measureBootStep: (_label, callback) => callback(),
    mergeMesWorkCenters: (workCenters = []) => workCenters,
    normalizeAccessRoleAssignments: (value) => value || {},
    normalizeAccessRoleProfiles: (value) => value || [],
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
    onSystemDomainsSnapshotRetired: () => { retirementNotifications += 1; },
    persistUiState: () => {},
    publishBootPerformance: () => {},
    reloadSystemDomainsState: () => {},
    render: () => {},
    sharedStateStatus,
    shouldPreferBundledBootstrapSnapshotPayload: () => false,
    syncActiveRoleWithAuthorization: () => {},
    syncProductionStructureMatrixToPlanningState: () => false,
    updateClockOnly: () => {},
    getUi: () => ({}),
    setUi: () => {},
    getPlanningState: () => ({ routes: [], routeSteps: [], slots: [] }),
    setPlanningState: () => {},
    getDirectoryState: () => ({ statuses: [] }),
    setDirectoryState: () => {},
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

  localStorage.setItem(systemDomainsKey, JSON.stringify({ old: true }));
  sharedStateStatus.systemDomainsCompatibilityState = "active";
  sharedStateStatus.systemDomainsCompatibilityHydrated = false;
  assert(!Object.prototype.hasOwnProperty.call(service.getSharedStateValues(), systemDomainsKey), "A generic save must suppress System Domains while active compatibility hydration is pending");
  sharedStateStatus.systemDomainsCompatibilityState = "unknown";
  assert(!Object.prototype.hasOwnProperty.call(service.getSharedStateValues(), systemDomainsKey), "A mixed-version unknown state must fail closed and suppress stale System Domains writes");
  sharedStateStatus.systemDomainsCompatibilityState = "active";
  sharedStateStatus.systemDomainsCompatibilityHydrated = true;
  assert(Object.prototype.hasOwnProperty.call(service.getSharedStateValues(), systemDomainsKey), "The exact hydrated active compatibility value may participate in normal shared-state writes");
  sharedStateStatus.systemDomainsCompatibilityHydrated = false;
  const coldRead = await service.hydrateSharedStateValues([systemDomainsKey], { allowBeforeInitialSync: true });
  assert(coldRead === true && requests.length === 1 && requests[0].method === "GET", "Cold boot must fetch the explicit System Domains projection before initial shared-state sync");
  assert(sessionStorage.getItem(tombstoneKey) === "1" && localStorage.getItem(systemDomainsKey) === null, "A cold tombstone must retire the local System Domains projection");
  assert(retirementNotifications === 1, "A newly observed tombstone must trigger the PostgreSQL rehydration hook exactly once");

  const staleActiveRead = await service.hydrateSharedStateValues([systemDomainsKey], { allowBeforeInitialSync: true });
  assert(staleActiveRead === true && requests.length === 2, "The bootstrap reader must remain available for a later projected read");
  assert(sessionStorage.getItem(tombstoneKey) === "1" && localStorage.getItem(systemDomainsKey) === null, "A stale active projection must not clear or recreate the observed primary tombstone");
  assert(retirementNotifications === 1, "A stale active projection must not retrigger the primary transition hook");

  const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert(
    appSource.includes('hydrateSharedStateForModule("authPrototype", [SYSTEM_DOMAINS_STORAGE_KEY])'),
    "The login screen must re-render from PostgreSQL System Domains after the shared-state projection is retired",
  );
  assert(
    appSource.includes('hydrateSharedStateForModule("authSessionPrototype", [SYSTEM_DOMAINS_STORAGE_KEY])'),
    "The authenticated workspace must retain the PostgreSQL System Domains hydration contract",
  );

  console.log("System Domains primary runtime QA: OK");
} finally {
  globalThis.window = previousWindow;
  if (previousLocalStorageDescriptor) Object.defineProperty(globalThis, "localStorage", previousLocalStorageDescriptor);
  else delete globalThis.localStorage;
  globalThis.fetch = previousFetch;
}
