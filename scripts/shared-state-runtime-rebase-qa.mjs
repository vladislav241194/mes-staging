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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? clone(value) : {};
}

function sharedUiFixture({ remoteCell = false, terminalRemoteCell = false, followUpLane = false, terminalLocalLane = false } = {}) {
  return {
    ganttDependencyRoutes: {},
    productionStructureMatrixOverrides: {},
    timesheetCellOverrides: {
      ...(remoteCell ? { "employee-remote::2026-07-18": { value: "work", start: "08:00", end: "17:00" } } : {}),
      ...(terminalRemoteCell ? { "employee-terminal-remote::2026-07-18": { value: "remote", start: "10:00", end: "19:00" } } : {}),
    },
    timesheetScheduleOverrides: {},
    shiftMasterBoardLaneBySlot: {
      "slot-local": "queued",
      ...(followUpLane ? { "slot-follow-up": "in_work" } : {}),
      ...(terminalLocalLane ? { "slot-terminal-local": "queued" } : {}),
    },
    shiftMasterBoardAssignments: {},
    shiftMasterBoardFacts: {},
    shiftMasterBoardCarryovers: {},
    shiftMasterAssignmentMatrix: {},
    accessRoleProfiles: [],
    accessRoleAssignments: {},
  };
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(message);
}

const previousWindow = globalThis.window;
const previousLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const previousFetch = globalThis.fetch;
const localStorage = createStorage();
const sessionStorage = createStorage();
const requests = [];
let durableMetadataReads = 0;
let ui = sharedUiFixture();
let planningState = { routes: [], routeSteps: [], slots: [], workCenters: [] };
let directoryState = { statuses: [] };
const sharedStateStatus = {
  enabled: true,
  configured: true,
  version: 1,
  pendingReason: "",
  pendingWriteMode: "",
  pendingValues: null,
  pendingSharedUi: null,
  pendingSharedUiFull: null,
  sharedUiBase: sharedUiFixture({ remoteCell: false }),
  lastSharedUiSignature: "",
  saveTimer: null,
  saveInFlight: false,
};

try {
  globalThis.window = {
    localStorage,
    sessionStorage,
    crypto: { randomUUID: () => "runtime-rebase-client" },
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
    const body = JSON.parse(request.body || "{}");
    if (String(request.method || "GET").toUpperCase() === "GET") {
      durableMetadataReads += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          configured: true,
          version: sharedStateStatus.version,
          values: {},
          sharedUi: clone(sharedStateStatus.sharedUiBase || {}),
        }),
      };
    }
    requests.push(body);
    const index = requests.length;
    let payload;
    if (index === 1) {
      payload = {
        ok: false,
        conflict: true,
        current: {
          version: 2,
          values: {},
          sharedUi: sharedUiFixture({ remoteCell: true }),
        },
      };
    } else if (index === 2) {
      payload = {
        ok: true,
        configured: true,
        version: 3,
        values: {},
        // This is the full-writer retry response after the server merged an
        // independent compact UI cell from another browser.
        sharedUi: sharedUiFixture({ remoteCell: true }),
      };
    } else if (index === 3) {
      payload = { ok: true, configured: true, version: 4, updatedAt: "2026-07-18T00:00:00.000Z" };
    } else if (index === 4) {
      payload = {
        ok: false,
        conflict: true,
        current: {
          version: 5,
          values: {},
          sharedUi: sharedUiFixture({ remoteCell: true, terminalRemoteCell: true, followUpLane: true }),
        },
      };
    } else if (index === 5) {
      payload = {
        ok: false,
        conflict: true,
        current: {
          version: 6,
          values: {},
          sharedUi: sharedUiFixture({ remoteCell: true, terminalRemoteCell: true, followUpLane: true }),
        },
      };
    } else if (index === 6) {
      payload = { ok: true, configured: true, version: 7, updatedAt: "2026-07-18T00:00:00.000Z" };
    } else if (index === 7) {
      payload = { ok: false, conflict: true, current: { version: 8, values: {}, sharedUi: sharedUiFixture({ remoteCell: true }) } };
    } else if (index === 8) {
      payload = { ok: false, conflict: true, current: { version: 9, values: {}, sharedUi: sharedUiFixture({ remoteCell: true }) } };
    } else if (index === 9) {
      payload = { ok: false, conflict: true, current: { version: 10, values: {}, sharedUi: sharedUiFixture({ remoteCell: true }) } };
    } else if (index === 10) {
      payload = { ok: true, configured: true, version: 11, values: {}, sharedUi: sharedUiFixture({ remoteCell: true }) };
    } else {
      throw new Error(`Unexpected shared-state request ${index}`);
    }
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    };
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
    SHARED_STATE_VALUE_KEYS: [],
    SPECIFICATIONS2_STORAGE_KEY: "qa-specifications2",
    SHARED_UI_LOCAL_DIRTY_KEY: "qa-ui-dirty",
    SHARED_UI_LOCAL_DIRTY_TTL_MS: 60_000,
    STATE_RESET_BACKUP_STORAGE_KEY: "qa-reset-backup",
    STORAGE_KEY: "qa-planning",
    STORAGE_KEYS: [],
    SYSTEM_DOMAINS_STORAGE_KEY: "",
    alignGanttWindowToPlan: () => {},
    appendLocalDataSafetyAudit: () => {},
    createDefaultPlanningState: () => ({ routes: [], routeSteps: [], slots: [] }),
    getActiveInterfaceRole: () => null,
    getBootstrapSnapshotCountsFromState: () => ({}),
    isMeaningfulBootstrapSnapshotCounts: () => false,
    isUsableBootstrapSnapshotPayload: () => false,
    loadUiState: () => ({}),
    measureBootStep: (_label, callback) => callback(),
    mergeMesWorkCenters: (workCenters = []) => workCenters,
    normalizeAccessRoleAssignments: normalizeRecord,
    normalizeAccessRoleProfiles: (value) => Array.isArray(value) ? clone(value) : [],
    normalizeDirectoryRow: (_section, row) => row,
    normalizeDirectoryState: (value) => value || { statuses: [] },
    normalizeDispatchFact: (value) => value,
    normalizeGanttDependencyRouteStore: normalizeRecord,
    normalizePlainRecord: normalizeRecord,
    normalizePlanningCorrection: (value) => value,
    normalizePlanningState: (value) => value || {},
    normalizeShiftMasterAssignment: (value) => value,
    normalizeShiftMasterAssignmentMatrix: normalizeRecord,
    normalizeShiftMasterRecordMap: normalizeRecord,
    notifySaveSuccess: () => {},
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

  // The migration accepts compact, pre-envelope planning projections only
  // when their route graph is complete. This preserves older browser state
  // without turning a truncated local value into a new source of truth.
  const compactProjection = {
    routes: [{ id: "legacy-route" }],
    routeSteps: [{ id: "legacy-step", routeId: "legacy-route" }],
    slots: [{ id: "legacy-slot", routeStepId: "legacy-step" }],
  };
  localStorage.setItem("qa-planning", JSON.stringify(compactProjection));
  const normalizedLegacyProjection = service.loadState();
  assert(normalizedLegacyProjection.version === 1, "A complete compact projection must regain the compatibility envelope");
  assert(normalizedLegacyProjection.slots[0]?.id === "legacy-slot", "A complete compact projection must retain slot identities");

  const backupPlanningState = {
    version: 1,
    routes: [{ id: "backup-route" }],
    routeSteps: [{ id: "backup-step", routeId: "backup-route" }],
    slots: [{ id: "backup-slot", routeStepId: "backup-step" }],
  };
  localStorage.setItem("qa-planning-backup", JSON.stringify([{
    createdAt: "2026-07-18T00:00:00.000Z",
    reason: "qa-backup",
    raw: JSON.stringify(backupPlanningState),
  }]));
  localStorage.setItem("qa-planning", JSON.stringify({ slots: [{ id: "truncated-slot" }] }));
  const recoveredPlanningState = service.loadState();
  assert(recoveredPlanningState.routes[0]?.id === "backup-route", "A truncated no-version state must recover the complete backup instead of being promoted");

  // A normal domain write is stale after browser A commits an independent
  // compact timesheet edit. Its retry receives the merged full projection.
  service.scheduleSharedStatePush("module-state");
  await waitFor(() => requests.length === 2 && !sharedStateStatus.saveInFlight, "Full conflict retry did not complete");
  assert(ui.timesheetCellOverrides["employee-remote::2026-07-18"], "Full retry response must rebase the remote compact cell into local UI");
  assert(sharedStateStatus.sharedUiBase.timesheetCellOverrides["employee-remote::2026-07-18"], "Full retry response must become the shared UI baseline");

  // The next local preference change must produce a delta against the merged
  // baseline, not a stale removal of the remote compact cell.
  ui.shiftMasterBoardLaneBySlot["slot-follow-up"] = "in_work";
  service.scheduleSharedStatePush("shared-ui");
  await waitFor(() => requests.length === 3 && !sharedStateStatus.saveInFlight, "Follow-up compact save did not complete");
  const followUpPatch = requests[2].sharedUiPatch;
  assert(
    !followUpPatch?.maps?.timesheetCellOverrides?.remove?.includes("employee-remote::2026-07-18"),
    "Follow-up UI patch must not remove a remote compact cell preserved by the full retry",
  );
  assert(followUpPatch?.maps?.shiftMasterBoardLaneBySlot?.set?.["slot-follow-up"] === "in_work", "Follow-up UI patch must include the actual local preference");

  // A third writer can also make the automatic conflict retry stale. The
  // terminal branch must rebase rather than replace the still-local UI, then
  // queue a compact retry. In particular, it must not delete the new remote
  // cell that arrived in the terminal conflict response.
  ui.shiftMasterBoardLaneBySlot["slot-terminal-local"] = "queued";
  service.scheduleSharedStatePush("module-state");
  await waitFor(() => requests.length === 6 && !sharedStateStatus.saveInFlight, "Terminal conflict recovery did not complete");
  assert(ui.timesheetCellOverrides["employee-terminal-remote::2026-07-18"], "Terminal conflict must rebase the newest remote cell into local UI");
  const terminalRecoveryPatch = requests[5].sharedUiPatch;
  assert(
    !terminalRecoveryPatch?.maps?.timesheetCellOverrides?.remove?.includes("employee-terminal-remote::2026-07-18"),
    "Terminal conflict recovery must not delete a remote entry unseen by the local writer",
  );
  assert(terminalRecoveryPatch?.maps?.shiftMasterBoardLaneBySlot?.set?.["slot-terminal-local"] === "queued", "Terminal conflict recovery must retry the local UI preference");

  // A user-facing directory command must survive two consecutive CAS conflict
  // pairs rather than reporting success from browser-only state. The bounded
  // durable wrapper starts a fresh full write after the generic push exhausts
  // its one internal retry, while retaining the exact local directory value.
  directoryState = { statuses: [], nomenclature: [{ id: "nom-durable", article: "QA-DURABLE" }] };
  const durableDirectorySaved = await service.persistDirectoryStateDurably("nomenclature-save");
  assert(durableDirectorySaved === true, "Durable directory save must recover from consecutive shared-UI writer conflicts");
  assert(durableMetadataReads >= 2, "Every durable retry must refresh the compact CAS baseline before writing");
  assert(requests.length === 10, `Durable directory save must use two bounded narrow-write attempts, got ${requests.length - 6}`);
  assert(JSON.parse(requests[9].values["qa-directories"]).nomenclature[0]?.id === "nom-durable", "Durable retry must retain the exact intended directory projection");
  assert(
    requests.slice(6).every((request) => request.responseMode === "ack"
      && request.sharedUiPatch
      && !Object.prototype.hasOwnProperty.call(request, "sharedUi")
      && Object.keys(request.values || {}).every((key) => ["qa-directories", "qa-directory-defaults", "qa-directory-deleted"].includes(key))
      && !Object.prototype.hasOwnProperty.call(request.values || {}, "qa-planning")),
    "Durable directory retries must use only a narrow directory-value payload, a UI patch and compact acknowledgement",
  );

  console.log("Shared-state runtime rebase QA: OK");
} finally {
  globalThis.window = previousWindow;
  if (previousLocalStorageDescriptor) Object.defineProperty(globalThis, "localStorage", previousLocalStorageDescriptor);
  else delete globalThis.localStorage;
  globalThis.fetch = previousFetch;
}
