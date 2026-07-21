import assert from "node:assert/strict";

import {
  applyNomenclatureDirectoryMutation,
  parseCompleteDirectoryProjection,
} from "../src/modules/nomenclature/durable_directory_mutation.js";
import { createRuntimeStateServiceModule } from "../src/modules/runtime_state/service.js";

const DIRECTORY_KEY = "qa-directories";
const REQUIRED_SECTIONS = ["operationMap", "nomenclatureTypes", "nomenclature", "bomLists", "specifications", "componentTypes", "statuses"];
const clone = (value) => JSON.parse(JSON.stringify(value));
const fixture = () => ({
  operationMap: [],
  nomenclatureTypes: [{ id: "type-a", name: "Механика" }],
  nomenclature: [{ id: "nom-a", name: "Исходная", article: "A", type: "Механика", updatedAt: "2026-07-21T00:00:00.000Z", serverOnly: { ownerRevision: 41 } }],
  bomLists: [{ id: "bom-a", marker: "remote-bom", importRows: [{ id: "bom-row-a", nomenclatureId: "nom-a", quantity: 2 }] }],
  specifications: [{ id: "spec-a", marker: "remote-spec", structureItems: [{ id: "spec-row-a", nomenclatureId: "nom-a", quantity: 2 }] }],
  componentTypes: [],
  statuses: [{ id: "status-remote", name: "Сохранено другим пользователем" }],
});

for (const raw of [null, { not: "a string" }, "", "null", "[]", "{broken"] ) {
  assert.equal(parseCompleteDirectoryProjection(raw, REQUIRED_SECTIONS).ok, false, `Malformed projection must fail closed: ${String(raw)}`);
}
const missingSection = fixture();
delete missingSection.statuses;
assert.equal(parseCompleteDirectoryProjection(JSON.stringify(missingSection), REQUIRED_SECTIONS).code, "invalid-directory-projection");
const nonArraySection = fixture();
nonArraySection.statuses = null;
assert.equal(parseCompleteDirectoryProjection(JSON.stringify(nonArraySection), REQUIRED_SECTIONS).code, "invalid-directory-projection");
const forwardCompatibleProjection = { ...fixture(), topLevelUnknown: { preserve: true } };
const parsedForwardCompatible = parseCompleteDirectoryProjection(JSON.stringify(forwardCompatibleProjection), REQUIRED_SECTIONS);
assert(parsedForwardCompatible.ok && parsedForwardCompatible.directory.topLevelUnknown.preserve === true,
  "forward-compatible top-level Directory metadata must be preserved without being mistaken for a registry array");
const duplicateRow = fixture();
duplicateRow.nomenclature.push(clone(duplicateRow.nomenclature[0]));
assert.equal(parseCompleteDirectoryProjection(JSON.stringify(duplicateRow), REQUIRED_SECTIONS).code, "invalid-directory-projection");

const expectedRow = clone(fixture().nomenclature[0]);
const updatedRow = { id: expectedRow.id, name: "Изменена этим пользователем", article: expectedRow.article, type: expectedRow.type, updatedAt: "2026-07-21T00:01:00.000Z" };
const unrelatedRemote = fixture();
unrelatedRemote.nomenclature.push({ id: "nom-b", name: "Добавлена вторым пользователем", article: "B" });
const merged = applyNomenclatureDirectoryMutation(unrelatedRemote, {
  kind: "update",
  itemId: "nom-a",
  expectedRow,
  row: updatedRow,
});
assert.equal(merged.ok, true);
assert.deepEqual(merged.directory.statuses, unrelatedRemote.statuses, "Unrelated status changes must survive a Nomenclature intent");
assert.deepEqual(merged.directory.nomenclature[1], unrelatedRemote.nomenclature[1], "A second writer's unrelated Nomenclature row must survive");
assert.equal(merged.directory.nomenclature[0].name, updatedRow.name);
assert.deepEqual(merged.directory.nomenclature[0].serverOnly, { ownerRevision: 41 }, "Unknown server-owned fields must survive an explicit form patch");

const sameRowChanged = fixture();
sameRowChanged.nomenclature[0] = { ...sameRowChanged.nomenclature[0], name: "Изменена вторым пользователем" };
assert.equal(applyNomenclatureDirectoryMutation(sameRowChanged, {
  kind: "update",
  itemId: "nom-a",
  expectedRow,
  row: updatedRow,
}).code, "same-row-conflict", "A same-row two-writer race must fail closed");
assert.equal(applyNomenclatureDirectoryMutation(fixture(), {
  kind: "create",
  row: { id: "nom-new", name: "Новая" },
  typeRow: { id: "type-a", name: "Новый раздел" },
}).code, "type-owner-required", "A Nomenclature command must never create a hidden type row");
assert.equal(applyNomenclatureDirectoryMutation(fixture(), {
  kind: "create",
  row: { id: "nom-new", name: "Новая", type: "Несуществующий раздел" },
}).code, "unknown-nomenclature-type", "A production Nomenclature command must require an existing server-owned type");
const created = applyNomenclatureDirectoryMutation(fixture(), {
  kind: "create",
  row: { id: "nom-new", name: "Новая", type: "Механика" },
});
assert.equal(created.ok, true, "A create command may reference an existing server-owned type");
assert.equal(created.directory.nomenclatureTypes.length, 1, "A Nomenclature command must never mutate the type directory");

const deleted = applyNomenclatureDirectoryMutation(fixture(), { kind: "delete", itemId: "nom-a", expectedRow });
assert.equal(deleted.ok, true);
assert.equal(deleted.directory.nomenclature.length, 0);
assert.equal(deleted.directory.bomLists[0].importRows[0].nomenclatureId, "");
assert.equal(deleted.directory.specifications[0].structureItems[0].nomenclatureId, "");
assert.equal(deleted.directory.bomLists[0].marker, "remote-bom");
assert.equal(deleted.directory.specifications[0].marker, "remote-spec");

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const previousWindow = globalThis.window;
const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const previousFetch = globalThis.fetch;
const localStorage = createStorage();
const sessionStorage = createStorage();
let directoryState = fixture();
directoryState.statuses = [{ id: "status-local-stale", name: "Устаревшая локальная запись" }];
localStorage.setItem(DIRECTORY_KEY, JSON.stringify(directoryState));
let remoteDirectory = JSON.stringify(fixture());
let remoteVersion = 7;
let postMode = "ack";
let transport = [];
let onNextPost = null;
const sharedStateStatus = {
  enabled: true,
  configured: true,
  version: 6,
  pendingReason: "",
  pendingWriteMode: "",
  pendingValues: null,
  pendingSharedUi: null,
  pendingSharedUiFull: null,
  sharedUiBase: {},
  saveTimer: null,
  saveInFlight: false,
  pollInFlight: false,
};

try {
  globalThis.window = {
    localStorage,
    sessionStorage,
    crypto: { randomUUID: () => "nomenclature-safe-qa" },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance: { now: () => Date.now() },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: localStorage });
  globalThis.fetch = async (_url, request = {}) => {
    const method = String(request.method || "GET").toUpperCase();
    if (method === "GET") {
      transport.push({ method, headers: request.headers });
      return { ok: true, status: 200, json: async () => ({ configured: true, version: remoteVersion, values: { [DIRECTORY_KEY]: remoteDirectory }, sharedUi: {} }) };
    }
    const payload = JSON.parse(request.body || "{}");
    transport.push({ method, payload, localDirectoryAtPost: clone(directoryState), localRawAtPost: localStorage.getItem(DIRECTORY_KEY) });
    if (onNextPost) {
      const callback = onNextPost;
      onNextPost = null;
      callback();
    }
    if (postMode === "conflict") {
      return { ok: false, status: 409, json: async () => ({ ok: false, conflict: true, current: { version: remoteVersion + 1, values: {} } }) };
    }
    remoteVersion += 1;
    if (Object.prototype.hasOwnProperty.call(payload.values || {}, DIRECTORY_KEY)) {
      remoteDirectory = payload.values[DIRECTORY_KEY];
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, configured: true, version: remoteVersion }) };
  };

  const baseServiceDependencies = {
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
    DIRECTORY_STORAGE_KEY: DIRECTORY_KEY,
    MES_OPERATION_MAP: [],
    PLANNING_BACKUP_STORAGE_KEY: "qa-planning-backup",
    REMOVED_DIRECTORY_STATUS_ID_PREFIXES: [],
    SHARED_STATE_API_URL: "/api/shared-state",
    SHARED_STATE_CLIENT_ID_KEY: "qa-client-id",
    SHARED_STATE_DISABLED_RECHECK_MS: 1,
    SHARED_STATE_DISABLED_UNTIL_KEY: "qa-disabled-until",
    SHARED_STATE_POLL_INTERVAL_MS: 60_000,
    SHARED_STATE_SAVE_DEBOUNCE_MS: 0,
    SHARED_STATE_VALUE_KEYS: [DIRECTORY_KEY],
    SPECIFICATIONS2_STORAGE_KEY: "qa-specifications2",
    SHARED_UI_LOCAL_DIRTY_KEY: "qa-ui-dirty",
    SHARED_UI_LOCAL_DIRTY_TTL_MS: 60_000,
    STATE_RESET_BACKUP_STORAGE_KEY: "qa-reset-backup",
    STORAGE_KEY: "qa-planning",
    STORAGE_KEYS: [],
    SYSTEM_DOMAINS_STORAGE_KEY: "",
    alignGanttWindowToPlan: () => {}, appendLocalDataSafetyAudit: () => {},
    createDefaultPlanningState: () => ({}), getActiveInterfaceRole: () => ({ label: "QA" }),
    getBootstrapSnapshotCountsFromState: () => ({}), isMeaningfulBootstrapSnapshotCounts: () => false,
    isUsableBootstrapSnapshotPayload: () => false, loadUiState: () => ({}), measureBootStep: (_label, callback) => callback(),
    mergeMesWorkCenters: (rows) => rows, normalizeAccessRoleAssignments: () => ({}), normalizeAccessRoleProfiles: () => [],
    normalizeDirectoryRow: (_section, row) => row, normalizeDirectoryState: (value) => value,
    normalizeDispatchFact: (value) => value, normalizeGanttDependencyRouteStore: () => ({}), normalizePlainRecord: () => ({}),
    normalizePlanningCorrection: (value) => value, normalizePlanningState: (value) => value,
    normalizeShiftMasterAssignment: (value) => value, normalizeShiftMasterAssignmentMatrix: () => ({}), normalizeShiftMasterRecordMap: () => ({}),
    notifySaveSuccess: () => {}, persistUiState: () => {}, publishBootPerformance: () => {}, reloadSystemDomainsState: () => {}, render: () => {},
    sharedStateStatus, shouldPreferBundledBootstrapSnapshotPayload: () => false, syncActiveRoleWithAuthorization: () => {},
    syncProductionStructureMatrixToPlanningState: () => false, updateClockOnly: () => {},
    getUi: () => ({}), setUi: () => {}, getPlanningState: () => ({}), setPlanningState: () => {},
    getDirectoryState: () => directoryState, setDirectoryState: (next) => { directoryState = next; },
    getAppBootstrapped: () => false, setAppBootstrapped: () => {}, getExternalStorageSyncTimer: () => null, setExternalStorageSyncTimer: () => {},
    getSharedStateApplyingRemote: () => false, setSharedStateApplyingRemote: () => {}, getBundledBootstrapSnapshot: () => null, setBundledBootstrapSnapshot: () => {},
    getBootstrapSnapshotLoadStarted: () => false, setBootstrapSnapshotLoadStarted: () => {}, getBootstrapSnapshotLoadPromise: () => null, setBootstrapSnapshotLoadPromise: () => {},
    getDirectoryEntityRemovalAllowed: () => false, setDirectoryEntityRemovalAllowed: () => {}, getPlanningEntityRemovalAllowed: () => false, setPlanningEntityRemovalAllowed: () => {},
  };
  const service = createRuntimeStateServiceModule(baseServiceDependencies);

  const localBeforeAck = clone(directoryState);
  onNextPost = () => service.scheduleSharedStatePush("system-domains");
  const safeSave = await service.persistNomenclatureDirectoryMutationDurably({ kind: "update", itemId: "nom-a", expectedRow, row: updatedRow });
  assert.equal(safeSave.ok, true, JSON.stringify(safeSave));
  assert.equal(transport.length, 2, "A durable command must use exactly one projected GET and one CAS POST");
  assert.equal(transport[0].headers["X-MES-Shared-State-Keys"], DIRECTORY_KEY, "The command must GET the exact DIRECTORY projection");
  assert.equal(transport[1].payload.baseVersion, 7);
  assert.equal(transport[1].payload.responseMode, "ack");
  assert.deepEqual(transport[1].localDirectoryAtPost, localBeforeAck, "Local state must not change before server acknowledgement");
  assert.equal(JSON.parse(transport[1].localRawAtPost).statuses[0].id, "status-local-stale", "Local storage must remain untouched before acknowledgement");
  assert.equal(directoryState.nomenclature[0].name, updatedRow.name);
  assert.equal(directoryState.statuses[0].id, "status-remote", "The acknowledged local state must preserve the fresh unrelated remote change");
  assert.equal(localStorage.getItem("qa-directory-backup"), null, "Acknowledged state must not pass through backup restoration");
  assert.equal(localStorage.getItem("qa-directory-defaults"), null, "Acknowledged state must not synthesize defaults");
  assert.equal(localStorage.getItem("qa-directory-deleted"), null, "Acknowledged state must not apply tombstones");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(transport.length, 3, "A generic write deferred during the command must run only after its acknowledgement");
  assert.equal(Object.prototype.hasOwnProperty.call(transport[2].payload.values || {}, DIRECTORY_KEY), false, "A deferred unrelated generic write must not replay a Directory snapshot");
  assert.equal(JSON.parse(remoteDirectory).nomenclature[0].name, updatedRow.name, "The deferred generic write must preserve acknowledged Nomenclature");

  transport = [];
  postMode = "conflict";
  remoteDirectory = JSON.stringify(directoryState);
  remoteVersion = sharedStateStatus.version;
  const localBeforeConflict = clone(directoryState);
  const conflict = await service.persistNomenclatureDirectoryMutationDurably({
    kind: "update",
    itemId: "nom-a",
    expectedRow: clone(directoryState.nomenclature[0]),
    row: { ...directoryState.nomenclature[0], name: "Не должна сохраниться" },
  });
  assert.equal(conflict.code, "version-conflict");
  assert.equal(transport.length, 2, "CAS conflict must not trigger an automatic stale retry");
  assert.deepEqual(directoryState, localBeforeConflict, "Conflict must leave local state unchanged");

  for (const malformed of [null, { object: true }, JSON.stringify({ ...fixture(), statuses: null })]) {
    transport = [];
    postMode = "ack";
    remoteVersion += 1;
    remoteDirectory = malformed;
    const localBeforeMalformed = clone(directoryState);
    const rejected = await service.persistNomenclatureDirectoryMutationDurably({ kind: "update", itemId: "nom-a", expectedRow, row: updatedRow });
    assert.equal(rejected.code, "invalid-directory-projection");
    assert.equal(transport.length, 1, "Invalid exact projection must never reach POST");
    assert.deepEqual(directoryState, localBeforeMalformed);
  }

  // Server-command primary: no generic shared-state write, stable retry
  // revision after a lost response, and fail-closed superseded receipts.
  directoryState = fixture();
  localStorage.setItem(DIRECTORY_KEY, JSON.stringify(directoryState));
  let authoritativeDirectory = clone(directoryState);
  let authoritativeRevision = 30;
  sharedStateStatus.version = authoritativeRevision;
  sharedStateStatus.latestObservedVersion = authoritativeRevision;
  sharedStateStatus.valueHydrationVersions = { [DIRECTORY_KEY]: authoritativeRevision };
  const commandCalls = [];
  let commandHandler = null;
  const commandResult = (intent, {
    replayed = false,
    superseded = false,
    kind = intent.kind,
  } = {}) => ({
    ok: true,
    status: kind === "create" && !replayed ? 201 : 200,
    kind,
    itemId: intent.itemId || intent.row?.id,
    item: clone(intent.row || intent.expectedRow || {}),
    revision: authoritativeRevision,
    commandRevision: Math.max(1, authoritativeRevision - 1),
    baseRevision: Math.max(0, authoritativeRevision - 2),
    replayed,
    superseded,
    rebased: false,
    actorId: "employee:employee-qa",
    projection: {
      revision: authoritativeRevision,
      updatedAt: "2026-07-21T03:00:00.000Z",
      directory: clone(authoritativeDirectory),
    },
  });
  const primaryService = createRuntimeStateServiceModule({
    ...baseServiceDependencies,
    isNomenclatureServerCommandsPrimary: () => true,
    executeNomenclatureServerCommand: async (intent, expectedRevision) => {
      commandCalls.push({ intent: clone(intent), expectedRevision });
      return commandHandler(intent, expectedRevision);
    },
  });

  transport = [];
  const createIntent = {
    kind: "create",
    itemId: "nom-primary",
    row: { id: "nom-primary", name: "Primary create", article: "PRIMARY", type: "Механика" },
    idempotencyKey: "qa-primary-create",
  };
  commandHandler = (intent) => {
    authoritativeRevision += 1;
    authoritativeDirectory.nomenclature.push(clone(intent.row));
    return commandResult(intent);
  };
  const primaryCreate = await primaryService.persistNomenclatureDirectoryMutationDurably(createIntent);
  assert.equal(primaryCreate.ok, true, JSON.stringify(primaryCreate));
  assert.equal(commandCalls.at(-1).expectedRevision, 30);
  assert.equal(transport.length, 0, "Server-command primary must not use generic /api/shared-state GET or POST for a Nomenclature mutation");
  assert.equal(directoryState.nomenclature.at(-1).id, "nom-primary");
  assert.equal(sharedStateStatus.valueHydrationVersions[DIRECTORY_KEY], 31);

  const lostBaseline = clone(directoryState.nomenclature.find((row) => row.id === "nom-primary"));
  const lostIntent = {
    kind: "update",
    itemId: "nom-primary",
    expectedRow: lostBaseline,
    row: { ...lostBaseline, name: "Lost response applied" },
    idempotencyKey: "qa-primary-lost-response",
  };
  let lostAttempt = 0;
  commandHandler = (intent) => {
    lostAttempt += 1;
    if (lostAttempt === 1) {
      authoritativeRevision += 1;
      authoritativeDirectory.nomenclature = authoritativeDirectory.nomenclature.map((row) => row.id === intent.itemId ? clone(intent.row) : row);
      return { ok: false, status: 0, code: "network-unavailable", unavailable: true, error: "response lost" };
    }
    return commandResult(intent, { replayed: true });
  };
  const lostFirst = await primaryService.persistNomenclatureDirectoryMutationDurably(lostIntent);
  assert.equal(lostFirst.ok, false);
  assert.equal(directoryState.nomenclature.find((row) => row.id === "nom-primary").name, "Primary create", "Lost response must not optimistically change local state");
  const lostRetry = await primaryService.persistNomenclatureDirectoryMutationDurably(lostIntent);
  assert.equal(lostRetry.ok, true, JSON.stringify(lostRetry));
  const lostCalls = commandCalls.filter((call) => call.intent.idempotencyKey === lostIntent.idempotencyKey);
  assert.deepEqual(lostCalls.map((call) => call.expectedRevision), [31, 31], "An unchanged retry must reuse the same expected revision after status=0");
  assert.equal(directoryState.nomenclature.find((row) => row.id === "nom-primary").name, "Lost response applied");

  const supersededBaseline = clone(directoryState.nomenclature.find((row) => row.id === "nom-primary"));
  const supersededIntent = {
    kind: "update",
    itemId: "nom-primary",
    expectedRow: supersededBaseline,
    row: { ...supersededBaseline, name: "Receipt that will be superseded" },
    idempotencyKey: "qa-primary-superseded-update",
  };
  let supersededAttempt = 0;
  commandHandler = (intent) => {
    supersededAttempt += 1;
    if (supersededAttempt === 1) {
      authoritativeRevision += 1;
      authoritativeDirectory.nomenclature = authoritativeDirectory.nomenclature.map((row) => row.id === intent.itemId ? clone(intent.row) : row);
      authoritativeRevision += 1;
      authoritativeDirectory.nomenclature = authoritativeDirectory.nomenclature.map((row) => row.id === intent.itemId ? { ...row, name: "Newer same-ID mutation" } : row);
      return { ok: false, status: 0, code: "network-unavailable", unavailable: true, error: "response lost" };
    }
    return commandResult(intent, { replayed: true, superseded: true });
  };
  assert.equal((await primaryService.persistNomenclatureDirectoryMutationDurably(supersededIntent)).ok, false);
  const supersededRetry = await primaryService.persistNomenclatureDirectoryMutationDurably(supersededIntent);
  assert.equal(supersededRetry.code, "command-superseded");
  assert.equal(directoryState.nomenclature.find((row) => row.id === "nom-primary").name, "Newer same-ID mutation", "Superseded replay must apply the latest projection without reporting save success");

  const deleteBaseline = clone(directoryState.nomenclature.find((row) => row.id === "nom-primary"));
  const deleteIntent = {
    kind: "delete",
    itemId: "nom-primary",
    expectedRow: deleteBaseline,
    idempotencyKey: "qa-primary-superseded-delete",
  };
  let deleteAttempt = 0;
  commandHandler = (intent) => {
    deleteAttempt += 1;
    if (deleteAttempt === 1) {
      authoritativeRevision += 1;
      authoritativeDirectory.nomenclature = authoritativeDirectory.nomenclature.filter((row) => row.id !== intent.itemId);
      authoritativeRevision += 1;
      authoritativeDirectory.nomenclature.push({ ...deleteBaseline, name: "Recreated after lost delete" });
      return { ok: false, status: 0, code: "network-unavailable", unavailable: true, error: "response lost" };
    }
    return commandResult(intent, { replayed: true, superseded: true, kind: "delete" });
  };
  assert.equal((await primaryService.persistNomenclatureDirectoryMutationDurably(deleteIntent)).ok, false);
  const supersededDelete = await primaryService.persistNomenclatureDirectoryMutationDurably(deleteIntent);
  assert.equal(supersededDelete.code, "command-superseded");
  assert.equal(directoryState.nomenclature.find((row) => row.id === "nom-primary").name, "Recreated after lost delete", "Lost delete replay must expose a same-ID recreation without a false delete success");
} finally {
  globalThis.window = previousWindow;
  if (previousLocalStorage) Object.defineProperty(globalThis, "localStorage", previousLocalStorage);
  else delete globalThis.localStorage;
  globalThis.fetch = previousFetch;
}

console.log("Nomenclature durable mutation QA passed: strict CAS rollback plus server-command primary, stable lost-response retry and superseded same-ID/recreation handling.");
