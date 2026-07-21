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
const notifications = [];
let durableMetadataReads = 0;
let canonicalGetSnapshot = null;
let canonicalGetFailure = false;
let clientLegacyDomainQuiesced = false;
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
      if (canonicalGetFailure) throw new Error("canonical GET unavailable");
      if (canonicalGetSnapshot) {
        return {
          ok: true,
          status: 200,
          json: async () => clone(canonicalGetSnapshot),
        };
      }
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
    } else if (index === 11) {
      payload = {
        ok: false,
        configured: true,
        conflict: true,
        legacyDomainWritesQuiesced: true,
        planningLegacyWritesQuiesced: true,
        code: "legacy-domain-writes-quiesced",
        current: {
          version: 12,
          values: {
            "qa-planning": JSON.stringify({
              version: 1,
              routes: [{ id: "route-quiesce", planningStartDate: "2026-07-22" }],
              routeSteps: [],
              slots: [],
            }),
            "qa-directories": JSON.stringify(directoryState),
          },
          sharedUi: sharedUiFixture({ remoteCell: true }),
        },
      };
    } else if (index === 12) {
      payload = {
        ok: false,
        configured: true,
        conflict: true,
        current: {
          version: 13,
          values: {
            "qa-planning": JSON.stringify({
              version: 1,
              routes: [{ id: "route-quiesce", planningStartDate: "2026-07-22" }],
              routeSteps: [],
              slots: [],
            }),
            "qa-directories": JSON.stringify(directoryState),
          },
          sharedUi: sharedUiFixture({ remoteCell: true }),
        },
      };
    } else if (index === 13) {
      payload = {
        ok: false,
        configured: true,
        conflict: true,
        legacyDomainWritesQuiesced: true,
        planningLegacyWritesQuiesced: true,
        code: "legacy-domain-writes-quiesced",
        current: {
          version: 14,
          values: {
            "qa-planning": JSON.stringify({
              version: 1,
              routes: [{ id: "route-quiesce", planningStartDate: "2026-07-23" }],
              routeSteps: [],
              slots: [],
            }),
            "qa-directories": JSON.stringify(directoryState),
          },
          sharedUi: sharedUiFixture({ remoteCell: true }),
        },
      };
    } else if ([14, 15].includes(index)) {
      payload = {
        ok: false,
        configured: false,
        conflict: true,
        legacyDomainWritesQuiesced: true,
        planningLegacyWritesQuiesced: true,
        code: "legacy-domain-writes-quiesced",
        currentVersion: index + 1,
        changedSharedUiKeys: ["timesheetCellOverrides"],
      };
    } else {
      throw new Error(`Unexpected shared-state request ${index}`);
    }
    return {
      ok: ![11, 12, 13, 14, 15].includes(index),
      status: [11, 12, 13, 14, 15].includes(index) ? 409 : 200,
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
    SHARED_STATE_VALUE_KEYS: ["qa-planning", "qa-directories", "qa-directory-defaults", "qa-directory-deleted"],
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
    isPlanningLegacyWritesQuiesced: () => clientLegacyDomainQuiesced,
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
    notifySaveSuccess: (message) => { notifications.push(String(message || "")); },
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

  // A current tab must consume the dedicated quiesce marker before the
  // generic conflict retry. Its optimistic Planning copy is replaced by the
  // authoritative response in one request, and the UI receives an explicit
  // read-only notice instead of a save acknowledgement.
  planningState = {
    version: 1,
    routes: [{ id: "route-quiesce", planningStartDate: "2026-07-29" }],
    routeSteps: [],
    slots: [],
  };
  localStorage.setItem("qa-planning", JSON.stringify(planningState));
  service.scheduleSharedStatePush("planning-state");
  await waitFor(() => requests.length === 11 && !sharedStateStatus.saveInFlight, "Planning quiesce marker recovery did not complete");
  assert(requests.length === 11, "Planning quiesce marker must suppress the generic conflict retry");
  assert(planningState.routes[0]?.planningStartDate === "2026-07-22", "Planning quiesce marker must restore the authoritative aggregate in memory");
  assert(JSON.parse(localStorage.getItem("qa-planning") || "{}").routes?.[0]?.planningStartDate === "2026-07-22", "Planning quiesce marker must restore the authoritative local cache");
  assert(notifications.some((message) => message.includes("изменения данных") && message.includes("приостановлены")), "The all-domain quiesce marker must show a truthful pause notice");

  // Activation can race between a normal stale-version response and the
  // automatic retry. The second response's authority marker must terminate
  // that retry chain, restore its newer canonical Planning value and never
  // emit a third write.
  planningState = {
    version: 1,
    routes: [{ id: "route-quiesce", planningStartDate: "2026-07-30" }],
    routeSteps: [],
    slots: [],
  };
  localStorage.setItem("qa-planning", JSON.stringify(planningState));
  const noticesBeforeRetryRace = notifications.length;
  service.scheduleSharedStatePush("planning-state");
  await waitFor(() => requests.length === 13 && !sharedStateStatus.saveInFlight, "Planning quiesce activation-during-retry recovery did not complete");
  assert(requests.length === 13, "A quiesce marker on conflict retry must terminate after exactly two requests");
  assert(planningState.routes[0]?.planningStartDate === "2026-07-23", "Retry-time quiesce must restore the newest authoritative Planning response");
  assert(JSON.parse(localStorage.getItem("qa-planning") || "{}").routes?.[0]?.planningStartDate === "2026-07-23", "Retry-time quiesce must restore the canonical local cache");
  assert(notifications.slice(noticesBeforeRetryRace).some((message) => message.includes("изменения данных") && message.includes("приостановлены")), "Retry-time quiesce must show the same truthful all-domain notice");

  // Domain-backed sharedUi denials intentionally omit `current` so an old
  // bundle cannot preserve and replay a dirty Timesheet/Shift/access intent.
  // The current bundle must perform one exact GET, apply the full canonical
  // snapshot, discard even a signature-mismatched dirty marker and remain
  // enabled without issuing a generic POST retry.
  canonicalGetSnapshot = {
    ok: true,
    configured: true,
    version: 15,
    values: {
      "qa-planning": JSON.stringify({
        version: 1,
        routes: [{ id: "route-quiesce", planningStartDate: "2026-07-24" }],
        routeSteps: [],
        slots: [],
      }),
      "qa-directories": JSON.stringify({ statuses: [{ id: "canonical-directory" }] }),
      "qa-directory-defaults": "1",
      "qa-directory-deleted": "{}",
    },
    sharedUi: sharedUiFixture({ remoteCell: true, terminalRemoteCell: true }),
  };
  ui.timesheetCellOverrides["employee-denied::2026-07-21"] = { value: "absence" };
  localStorage.setItem("qa-ui-dirty", JSON.stringify({ signature: "mismatched-in-flight-signature" }));
  service.scheduleSharedStatePush("shared-ui");
  await waitFor(() => requests.length === 14 && !sharedStateStatus.saveInFlight, "Domain sharedUi marker canonical GET did not complete");
  assert(requests.length === 14, "A domain sharedUi marker without current must not enter the generic POST retry");
  assert(!ui.timesheetCellOverrides["employee-denied::2026-07-21"]
    && ui.timesheetCellOverrides["employee-terminal-remote::2026-07-18"], "the exact GET must replace optimistic sharedUi with the canonical projection");
  assert(localStorage.getItem("qa-ui-dirty") === null, "a blocked dirty marker must be discarded unconditionally despite a signature mismatch");
  assert(sharedStateStatus.enabled === true && sharedStateStatus.configured === true, "a successful canonical restore must keep the current client transport enabled");

  // A current bundle also fails closed before transport when it already knows
  // the all-domain evaluation flag. A durable Directory command must return a
  // pause, restore its prior canonical row and issue zero POST/retry attempts.
  const requestsBeforeQuiescedDirectory = requests.length;
  clientLegacyDomainQuiesced = true;
  directoryState = { statuses: [{ id: "optimistic-directory" }] };
  localStorage.setItem("qa-ui-dirty", JSON.stringify({
    signature: "blocked-known-flag-domain-intent",
    updatedAt: new Date().toISOString(),
    version: "qa-version",
  }));
  const quiescedDirectoryResult = await service.persistDirectoryStateDurably("directory-state");
  await waitFor(() => directoryState.statuses?.[0]?.id === "canonical-directory", "Quiesced Directory state was not restored");
  assert(quiescedDirectoryResult !== true && String(quiescedDirectoryResult).includes("приостановлены"), "a quiesced durable Directory command must never report success");
  assert(requests.length === requestsBeforeQuiescedDirectory, "a known-quiesced durable Directory command must issue zero POST or retry attempts");
  assert(localStorage.getItem("qa-ui-dirty") === null, "a known-quiesced domain command must discard its dirty replay marker before evaluation OFF");
  clientLegacyDomainQuiesced = false;

  // If that exact GET is unavailable, no optimistic dirty state may remain
  // replayable. Disable this tab until a real page refresh, then simulate the
  // root evaluation turning OFF and prove the denied intent still cannot POST.
  canonicalGetFailure = true;
  ui.timesheetCellOverrides["employee-denied-outage::2026-07-21"] = { value: "absence" };
  localStorage.setItem("qa-ui-dirty", JSON.stringify({ signature: "another-mismatch" }));
  service.scheduleSharedStatePush("shared-ui");
  await waitFor(() => requests.length === 15 && !sharedStateStatus.saveInFlight, "Failed canonical GET fail-closed path did not complete");
  assert(sharedStateStatus.enabled === false && sharedStateStatus.configured === false, "a failed canonical GET must disable shared-state for this tab until refresh");
  assert(sharedStateStatus.pendingReason === "" && sharedStateStatus.pendingValues === null
    && sharedStateStatus.pendingSharedUi === null && localStorage.getItem("qa-ui-dirty") === null,
  "failed restore must discard every pending/dirty replay channel");
  assert(notifications.some((message) => message.includes("обновите страницу")), "failed restore must require a page refresh explicitly");
  canonicalGetFailure = false;
  clientLegacyDomainQuiesced = false;
  service.scheduleSharedStatePush("local-shared-ui");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert(requests.length === 15 && sharedStateStatus.pendingReason === "", "turning evaluation OFF must not replay a denied dirty intent in the unrefreshed tab");

  // Pilot .25 does not know the new marker; configured=false still stops its
  // transport until refresh, but its dirty marker can remain in localStorage.
  // A refreshed .26 bundle must drop that prior-version marker before it can
  // schedule any POST, even when root has already turned evaluation OFF.
  const requestsBeforeVersionCleanup = requests.length;
  localStorage.setItem("qa-ui-dirty", JSON.stringify({
    signature: "pilot-25-denied-intent",
    updatedAt: new Date().toISOString(),
    version: "v.1.500.25",
  }));
  assert(service.getSharedUiDirtyMarker() === null, "a refreshed bundle must reject a dirty marker created by the blocked prior bundle version");
  assert(localStorage.getItem("qa-ui-dirty") === null, "prior-version dirty intent must be removed before any post-refresh scheduling");
  assert(requests.length === requestsBeforeVersionCleanup, "dirty-marker version cleanup must happen locally before any POST");

  console.log("Shared-state runtime rebase QA: OK");
} finally {
  globalThis.window = previousWindow;
  if (previousLocalStorageDescriptor) Object.defineProperty(globalThis, "localStorage", previousLocalStorageDescriptor);
  else delete globalThis.localStorage;
  globalThis.fetch = previousFetch;
}
