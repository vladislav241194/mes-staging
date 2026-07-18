import { EventEmitter } from "node:events";
import { chmod, mkdtemp, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { handleSharedStateRequest, updateSharedStateSnapshot } from "./shared-state-endpoint.mjs";
import { backupSharedStateFile, withSharedStateFileLock } from "./shared-state-storage.mjs";
import {
  applySharedUiPatch,
  cloneSharedUiSnapshot,
  getSharedUiPatch,
  rebaseSharedUiAfterFullWrite,
} from "../src/modules/runtime_state/shared_ui_delta.js";

const SHARED_STATE_KEYS = {
  state: "mes-planning-prototype-state-v2",
  directories: "mes-planning-prototype-directories-v2",
  directoryDefaults: "mes-planning-prototype-directories-defaults-restored-v1",
  systemDomains: "mes-planning-prototype-system-domains-v1",
  directoryDeleted: "mes-planning-prototype-directories-deleted-entities-v1",
  workCenterSeeded: "mes-planning-prototype-work-center-operations-seeded-v2",
  specifications2: "mes-specifications-2-registry-v1",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeReq(method, body = null, headers = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.body = body;
  req.headers = headers;
  req.destroy = () => {};
  return req;
}

function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    rawBody: Buffer.alloc(0),
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(value = "") {
      this.rawBody = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
      this.body = this.rawBody.toString("utf-8");
    },
    json(payload) {
      this.body = JSON.stringify(payload);
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
  };
}

async function callSharedState(filePath, method, body = null, options = {}) {
  const res = makeRes();
  await handleSharedStateRequest(makeReq(method, body, options.headers), res, {
    filePath,
    auditLogPath: options.auditLogPath,
    backupDir: options.backupDir,
    env: options.env || process.env,
  });
  const json = JSON.parse(res.body || "{}");
  return {
    statusCode: res.statusCode,
    json,
  };
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "mes-shared-state-qa-"));
  const filePath = join(dir, "state.json");
  try {
    const backupSourcePath = join(dir, "backup-permissions-source.json");
    await writeFile(backupSourcePath, `${JSON.stringify({ employee: "permission-fixture" })}\n`, { mode: 0o664 });
    await chmod(backupSourcePath, 0o664);
    const secureBackup = await backupSharedStateFile({
      filePath: backupSourcePath,
      backupDir: join(dir, "secure-backups"),
      reason: "permissions-qa",
      actor: "shared-state-functional-qa",
      env: { APP_ENV: "pilot", MES_SHARED_STATE_KEY: "mes-permissions-qa" },
      allowMissing: false,
    });
    const [secureBackupStat, secureBackupMetaStat] = await Promise.all([
      stat(secureBackup.backupPath),
      stat(secureBackup.metaPath),
    ]);
    assert((secureBackupStat.mode & 0o777) === 0o600, "Shared-state compatibility backups must be owner-readable only");
    assert((secureBackupMetaStat.mode & 0o777) === 0o600, "Shared-state backup metadata must be owner-readable only");

    const unconfiguredCompatibility = await callSharedState("", "GET", null, {
      headers: { "x-mes-system-domains-compatibility": "status" },
    });
    assert(unconfiguredCompatibility.json.configured === false && unconfiguredCompatibility.json.systemDomainsCompatibility?.state === "absent", "An unconfigured shared-state contour must explicitly report compatibility as absent");
    const initial = await callSharedState(filePath, "GET");
    assert(initial.statusCode === 200, "GET empty snapshot should return 200");
    assert(initial.json.version === 0, "Empty snapshot should start with version 0");
    const absentCompatibilityMetadata = await callSharedState(filePath, "GET", null, {
      headers: {
        "x-mes-shared-state-keys": "__none__",
        "x-mes-system-domains-compatibility": "status",
      },
    });
    assert(absentCompatibilityMetadata.json.systemDomainsCompatibility?.state === "absent", "Metadata must distinguish an absent System Domains compatibility key");
    assert(Object.keys(absentCompatibilityMetadata.json.values || {}).length === 0, "Absent compatibility metadata must not synthesize a value");

    const emptyCompactUi = await callSharedState(filePath, "POST", {
      baseVersion: 0,
      clientId: "empty-compact-ui",
      actor: "QA",
      action: "shared-ui",
      responseMode: "ack",
      values: {},
      sharedUi: { ganttDependencyRoutes: { "slot-empty": ["route-empty"] } },
      sharedUiPatch: { maps: { ganttDependencyRoutes: { set: { "slot-empty": ["route-empty"] }, remove: [] } }, replace: {} },
    });
    assert(emptyCompactUi.statusCode === 409 && emptyCompactUi.json.compactAckUnavailable === true, "Empty storage must signal a compact-write fallback instead of failing the UI save");

    const values = {
      [SHARED_STATE_KEYS.state]: JSON.stringify({
        routes: [],
        routeSteps: [],
        slots: [],
        shiftMasterAssignments: {},
        dispatchFacts: {},
        planningCorrections: {},
      }),
      [SHARED_STATE_KEYS.directories]: JSON.stringify({ statuses: [] }),
      [SHARED_STATE_KEYS.directoryDefaults]: "1",
      [SHARED_STATE_KEYS.systemDomains]: JSON.stringify({
        schemaId: "mes.system-domains",
        schemaVersion: 1,
        metadata: {},
        registries: { employees: [{ id: "employee-qa", displayName: "QA" }] },
      }),
      [SHARED_STATE_KEYS.directoryDeleted]: "{}",
      [SHARED_STATE_KEYS.workCenterSeeded]: "1",
      [SHARED_STATE_KEYS.specifications2]: JSON.stringify({ entries: [{ id: "specifications2-qa" }] }),
      "forbidden-key": "must be dropped",
      "mes-planning-prototype-supply-control-v1": JSON.stringify({ rows: { removed: true } }),
    };
    const posted = await callSharedState(filePath, "POST", {
      baseVersion: 0,
      clientId: "shared-state-qa",
      actor: "QA",
      action: "shared-state-functional-qa",
      values,
      sharedUi: {
        ganttDependencyRoutes: { "slot-a": [] },
        productionStructureMatrixOverrides: {
          "D-MANUAL": { "Наименование": "Отдел ручного монтажа QA" },
        },
        timesheetCellOverrides: {
          "employee-qa::2026-06-17": { value: "work", start: "08:00", end: "17:00", overtime: 1 },
        },
        timesheetScheduleOverrides: {
          "employee-qa": { code: "5/2", start: "08:00", end: "17:00", patternOffset: 0 },
        },
        shiftMasterBoardLaneBySlot: { "slot-a": "in_work" },
        shiftMasterBoardAssignments: { "slot-a": { employees: ["employee-qa"], quantity: 12 } },
        shiftMasterBoardFacts: { "slot-a": { good: 10, scrap: 1 } },
        shiftMasterBoardCarryovers: { "carryover-a": { slotId: "slot-a", quantity: 2 } },
        shiftMasterAssignmentMatrix: {
          "master-qa": { mode: "manual", employeeIds: ["employee-qa"], updatedAt: "2026-06-17T00:00:00.000Z" },
        },
        accessRoleProfiles: [
          { id: "master", label: "Мастер QA", scope: "workCenter", defaultModule: "shiftMasterBoard" },
        ],
        accessRoleAssignments: {
          "employee-qa": "master",
        },
        shopMapWidgetLayouts: { widgets: { removed: true } },
        forbiddenUi: { must: "drop" },
      },
    });

    assert(posted.statusCode === 200, "POST snapshot should return 200");
    assert(posted.json.version === 1, "POST snapshot should increment version");
    await chmod(filePath, 0o640);
    assert(!posted.json.values["mes-planning-prototype-supply-control-v1"], "Removed supply control key should be dropped");
    assert(!posted.json.values["forbidden-key"], "Forbidden value key should be dropped");
    assert(posted.json.values[SHARED_STATE_KEYS.systemDomains]?.includes("mes.system-domains"), "System Domains store should be persisted as an allowed value key");
    assert(posted.json.values[SHARED_STATE_KEYS.specifications2]?.includes("specifications2-qa"), "Specifications 2.0 registry should be persisted as an allowed value key");
    assert(!posted.json.sharedUi.shopMapWidgetLayouts, "Removed shop map shared UI should be dropped");
    assert(posted.json.sharedUi.productionStructureMatrixOverrides?.["D-MANUAL"], "Matrix overrides should be persisted");
    assert(posted.json.sharedUi.timesheetCellOverrides?.["employee-qa::2026-06-17"], "Timesheet cell overrides should be persisted");
    assert(posted.json.sharedUi.timesheetScheduleOverrides?.["employee-qa"], "Timesheet schedule overrides should be persisted");
    assert(posted.json.sharedUi.shiftMasterBoardLaneBySlot?.["slot-a"] === "in_work", "Shift master lane map should be persisted");
    assert(posted.json.sharedUi.shiftMasterBoardAssignments?.["slot-a"], "Shift master assignments should be persisted");
    assert(posted.json.sharedUi.shiftMasterBoardFacts?.["slot-a"], "Shift master facts should be persisted");
    assert(posted.json.sharedUi.shiftMasterBoardCarryovers?.["carryover-a"], "Shift master carryovers should be persisted");
    assert(posted.json.sharedUi.shiftMasterAssignmentMatrix?.["master-qa"]?.mode === "manual", "Shift master assignment matrix should be persisted");
    assert(posted.json.sharedUi.accessRoleProfiles?.[0]?.id === "master", "Access role profiles should be persisted");
    assert(posted.json.sharedUi.accessRoleAssignments?.["employee-qa"] === "master", "Access role assignments should be persisted");
    assert(!posted.json.sharedUi.forbiddenUi, "Forbidden shared UI should be dropped");

    const activeCompatibilityMetadata = await callSharedState(filePath, "GET", null, {
      headers: {
        "x-mes-shared-state-keys": "__none__",
        "x-mes-system-domains-compatibility": "status",
      },
    });
    assert(activeCompatibilityMetadata.json.systemDomainsCompatibility?.state === "active", "Metadata must distinguish an active System Domains compatibility snapshot");
    assert(Object.keys(activeCompatibilityMetadata.json.values || {}).length === 0, "Active compatibility metadata must not transfer the large System Domains matrix");

    const compressedRes = makeRes();
    await handleSharedStateRequest(makeReq("GET", null, { "accept-encoding": "gzip" }), compressedRes, {
      filePath,
      env: process.env,
    });
    assert(compressedRes.headers["Content-Encoding"] === "gzip", "Large shared-state GET should use gzip when supported");
    const compressedSnapshot = JSON.parse(gunzipSync(compressedRes.rawBody).toString("utf-8"));
    assert(compressedSnapshot.version === 1, "Compressed shared-state GET should preserve the snapshot payload");

    const olderClientValues = { ...values };
    delete olderClientValues[SHARED_STATE_KEYS.systemDomains];
    const preserved = await callSharedState(filePath, "POST", {
      baseVersion: 1,
      clientId: "older-client",
      actor: "QA",
      action: "older-client-snapshot",
      values: olderClientValues,
    });
    assert(preserved.statusCode === 200, "Second POST should still return 200");
    assert(preserved.json.version === 2, "Second POST should increment version");
    assert((Number((await stat(filePath)).mode) & 0o777) === 0o640, "Atomic shared-state replacement must preserve the existing file mode");
    assert(!preserved.json.values["mes-planning-prototype-supply-control-v1"], "Removed supply control key should remain absent");
    assert(preserved.json.values[SHARED_STATE_KEYS.systemDomains] === values[SHARED_STATE_KEYS.systemDomains], "Client without the new System Domains key should preserve the current store");
    assert(!preserved.json.sharedUi.shopMapWidgetLayouts, "Removed shop map shared UI should remain absent");
    assert(preserved.json.sharedUi.ganttDependencyRoutes, "POST without sharedUi should preserve current shared dependency routes");
    assert(preserved.json.sharedUi.productionStructureMatrixOverrides?.["D-MANUAL"], "POST without sharedUi should preserve matrix overrides");
    assert(preserved.json.sharedUi.timesheetCellOverrides?.["employee-qa::2026-06-17"], "POST without sharedUi should preserve timesheet cell overrides");
    assert(preserved.json.sharedUi.timesheetScheduleOverrides?.["employee-qa"], "POST without sharedUi should preserve timesheet schedule overrides");
    assert(preserved.json.sharedUi.shiftMasterBoardLaneBySlot?.["slot-a"] === "in_work", "POST without sharedUi should preserve shift master lane map");
    assert(preserved.json.sharedUi.shiftMasterBoardAssignments?.["slot-a"], "POST without sharedUi should preserve shift master assignments");
    assert(preserved.json.sharedUi.shiftMasterBoardFacts?.["slot-a"], "POST without sharedUi should preserve shift master facts");
    assert(preserved.json.sharedUi.shiftMasterBoardCarryovers?.["carryover-a"], "POST without sharedUi should preserve shift master carryovers");
    assert(preserved.json.sharedUi.shiftMasterAssignmentMatrix?.["master-qa"]?.mode === "manual", "POST without sharedUi should preserve shift master assignment matrix");
    assert(preserved.json.sharedUi.accessRoleProfiles?.[0]?.id === "master", "POST without sharedUi should preserve access role profiles");
    assert(preserved.json.sharedUi.accessRoleAssignments?.["employee-qa"] === "master", "POST without sharedUi should preserve access role assignments");

    const browserShiftRetirement = await callSharedState(filePath, "POST", {
      baseVersion: 2,
      clientId: "shift-server-authority",
      actor: "QA",
      action: "retire-shift-snapshot-projection",
      values: olderClientValues,
      sharedUi: {
        shiftMasterBoardAssignments: null,
        shiftMasterBoardFacts: null,
        shiftMasterBoardCarryovers: null,
      },
    });
    assert(browserShiftRetirement.statusCode === 403 && browserShiftRetirement.json.shiftExecutionRetirementRequiresControlledCutover === true, "A browser must not retire Shift Execution outside the controlled PostgreSQL cutover");
    const rootShiftRetirement = await updateSharedStateSnapshot({
      filePath,
      expectedVersion: 2,
      allowShiftExecutionCompatibilitySnapshotRetirement: true,
      update: (snapshot) => {
        const sharedUi = { ...snapshot.sharedUi };
        delete sharedUi.shiftMasterBoardAssignments;
        delete sharedUi.shiftMasterBoardFacts;
        delete sharedUi.shiftMasterBoardCarryovers;
        return {
          ...snapshot,
          sharedUi,
          shiftExecutionRetirement: {
            transitionId: "shift-transition-qa",
            sourceDigest: "a".repeat(64),
            sourceSnapshotVersion: 2,
            retiredAt: "2026-07-18T00:00:00.000Z",
          },
        };
      },
    });
    assert(rootShiftRetirement.ok && rootShiftRetirement.snapshot?.version === 3, "The controlled cutover must create the Shift Execution retirement marker");
    const retiredShiftProjection = { json: rootShiftRetirement.snapshot };
    assert(!Object.prototype.hasOwnProperty.call(retiredShiftProjection.json.sharedUi, "shiftMasterBoardAssignments"), "Retired shift assignments must not remain in shared state");
    assert(!Object.prototype.hasOwnProperty.call(retiredShiftProjection.json.sharedUi, "shiftMasterBoardFacts"), "Retired shift facts must not remain in shared state");
    assert(!Object.prototype.hasOwnProperty.call(retiredShiftProjection.json.sharedUi, "shiftMasterBoardCarryovers"), "Retired carryovers must not remain in shared state");

    const staleShiftRestore = await callSharedState(filePath, "POST", {
      baseVersion: 3,
      clientId: "stale-shift-client",
      actor: "QA",
      action: "stale-shift-full-write",
      values: olderClientValues,
      sharedUi: {
        ...retiredShiftProjection.json.sharedUi,
        shiftMasterBoardAssignments: { "slot-a": { quantity: 12 } },
      },
    });
    assert(staleShiftRestore.statusCode === 409 && staleShiftRestore.json.shiftExecutionSnapshotRetired === true, "A stale browser must not revive retired Shift Execution maps");

    const browserSystemDomainsRetirement = await callSharedState(filePath, "POST", {
      baseVersion: 3,
      clientId: "system-domains-server-authority",
      actor: "QA",
      action: "system-domains-server-authority-sync",
      values: {
        ...retiredShiftProjection.json.values,
        [SHARED_STATE_KEYS.systemDomains]: null,
      },
      sharedUi: retiredShiftProjection.json.sharedUi,
    });
    assert(browserSystemDomainsRetirement.statusCode === 403, "A browser POST must not retire System Domains outside the root-controlled cutover");
    assert(browserSystemDomainsRetirement.json.systemDomainsRetirementRequiresRootCutover === true, "Browser tombstone denial must identify the root-only cutover boundary");
    assert(browserSystemDomainsRetirement.json.current?.version === 3, "Rejected browser retirement must not change the shared-state revision");
    const rootSystemDomainsRetirement = await updateSharedStateSnapshot({
      filePath,
      expectedVersion: 3,
      allowSystemDomainsCompatibilitySnapshotRetirement: true,
      update: (snapshot) => ({
        ...snapshot,
        values: { ...snapshot.values, [SHARED_STATE_KEYS.systemDomains]: null },
      }),
    });
    assert(rootSystemDomainsRetirement.ok && rootSystemDomainsRetirement.snapshot?.version === 4, "The internal root-controlled path must be able to create the System Domains tombstone");
    assert(rootSystemDomainsRetirement.snapshot?.values?.[SHARED_STATE_KEYS.systemDomains] === null, "Retired System Domains must be an explicit shared-state tombstone");
    const retiredSystemDomainsProjection = { json: rootSystemDomainsRetirement.snapshot };

    // A stale tab can still hold the old, complete compatibility payload. It
    // must receive a recoverable conflict instead of bringing the retired
    // System Domains projection back into the shared snapshot.
    const staleSystemDomainsRestore = await callSharedState(filePath, "POST", {
      baseVersion: 4,
      clientId: "stale-system-domains-client",
      actor: "QA",
      action: "stale-system-domains-full-write",
      values: {
        ...retiredSystemDomainsProjection.json.values,
        [SHARED_STATE_KEYS.systemDomains]: values[SHARED_STATE_KEYS.systemDomains],
      },
      sharedUi: retiredSystemDomainsProjection.json.sharedUi,
    });
    assert(staleSystemDomainsRestore.statusCode === 409, "A stale full snapshot must not restore retired System Domains");
    assert(staleSystemDomainsRestore.json.systemDomainsSnapshotRetired === true, "The tombstone conflict should tell the browser to reload the server authority state");
    assert(staleSystemDomainsRestore.json.current?.values?.[SHARED_STATE_KEYS.systemDomains] === null, "The tombstone conflict must return the durable null marker");

    const conflict = await callSharedState(filePath, "POST", {
      baseVersion: 0,
      clientId: "stale-client",
      actor: "QA",
      action: "stale-write",
      values,
    });
    assert(conflict.statusCode === 409, "Stale POST should return conflict");
    assert(!conflict.json.current?.values?.["mes-planning-prototype-supply-control-v1"], "Conflict payload should not include removed supply control");

    const deniedDestructiveAction = await callSharedState(filePath, "POST", {
      baseVersion: 4,
      clientId: "protected-env-client",
      actor: "QA",
      action: "initial-bootstrap-snapshot",
      values,
    }, {
      env: {
        ...process.env,
        APP_ENV: "user-testing",
        MES_ALLOW_DESTRUCTIVE_ACTIONS: "false",
      },
      auditLogPath: join(dir, "audit.log"),
      backupDir: join(dir, "backups"),
    });
    assert(deniedDestructiveAction.statusCode === 403, "Protected env destructive action should be denied");
    assert(deniedDestructiveAction.json.destructiveAction === true, "Denied destructive action should be explicit");

    const fetched = await callSharedState(filePath, "GET");
    assert(fetched.json.version === 4, "GET should keep stored version");
    assert(!fetched.json.values["mes-planning-prototype-supply-control-v1"], "GET should not return removed supply control");
    assert(fetched.json.values[SHARED_STATE_KEYS.systemDomains] === null, "GET should retain the System Domains tombstone");
    assert(fetched.json.sharedUi.productionStructureMatrixOverrides?.["D-MANUAL"], "GET should return matrix overrides");
    assert(fetched.json.sharedUi.timesheetCellOverrides?.["employee-qa::2026-06-17"], "GET should return timesheet overrides");
    assert(fetched.json.sharedUi.shiftMasterBoardLaneBySlot?.["slot-a"] === "in_work", "GET should return shift master lane map");
    assert(!Object.prototype.hasOwnProperty.call(fetched.json.sharedUi, "shiftMasterBoardAssignments"), "GET must keep the retired shift assignment projection absent");
    assert(fetched.json.sharedUi.shiftMasterAssignmentMatrix?.["master-qa"]?.employeeIds?.includes("employee-qa"), "GET should return shift master assignment matrix");
    assert(fetched.json.sharedUi.accessRoleProfiles?.[0]?.id === "master", "GET should return access role profiles");
    assert(fetched.json.sharedUi.accessRoleAssignments?.["employee-qa"] === "master", "GET should return access role assignments");

    // Domain repositories use updateSharedStateSnapshot directly, outside the
    // HTTP request parser. Keep the same server-side invariant there so a
    // future repository change cannot resurrect the retired payload either.
    const authorityFilePath = join(dir, "system-domains-primary-authority.json");
    const authoritySeed = await callSharedState(authorityFilePath, "POST", {
      baseVersion: 0,
      clientId: "authority-seed",
      actor: "QA",
      action: "seed",
      values,
      sharedUi: {},
    });
    assert(authoritySeed.statusCode === 200 && authoritySeed.json.version === 1, "Authority guard fixture should seed a normal snapshot");
    const forbiddenInternalTombstone = await updateSharedStateSnapshot({
      filePath: authorityFilePath,
      expectedVersion: 1,
      update: (snapshot) => ({
        ...snapshot,
        values: { ...snapshot.values, [SHARED_STATE_KEYS.systemDomains]: null },
      }),
    });
    assert(forbiddenInternalTombstone.ok !== true && forbiddenInternalTombstone.forbidden === true, "Generic internal snapshot updates must not retire System Domains without an explicit root cutover capability");
    const authorityTombstone = await updateSharedStateSnapshot({
      filePath: authorityFilePath,
      expectedVersion: 1,
      allowSystemDomainsCompatibilitySnapshotRetirement: true,
      update: (snapshot) => ({
        ...snapshot,
        values: { ...snapshot.values, [SHARED_STATE_KEYS.systemDomains]: null },
      }),
    });
    assert(authorityTombstone.ok && authorityTombstone.snapshot?.version === 2, "Authority guard fixture should create the tombstone through the explicit root capability");
    const directRestore = await updateSharedStateSnapshot({
      filePath: authorityFilePath,
      expectedVersion: 2,
      update: (snapshot) => ({
        ...snapshot,
        values: { ...snapshot.values, [SHARED_STATE_KEYS.systemDomains]: values[SHARED_STATE_KEYS.systemDomains] },
      }),
    });
    assert(directRestore.ok && directRestore.snapshot?.values?.[SHARED_STATE_KEYS.systemDomains] === null, "Direct server-side snapshot updates must preserve a retired System Domains tombstone");

    const deferredSpecifications2 = await callSharedState(filePath, "GET", null, {
      headers: { "x-mes-shared-state-keys": SHARED_STATE_KEYS.specifications2 },
    });
    assert(deferredSpecifications2.statusCode === 200, "Projected GET should return 200");
    assert(Object.keys(deferredSpecifications2.json.values || {}).length === 1, "Projected GET should omit unrelated shared-state values");
    assert(deferredSpecifications2.json.values?.[SHARED_STATE_KEYS.specifications2]?.includes("specifications2-qa"), "Projected GET should return the requested Specifications 2.0 registry");

    const metadataOnly = await callSharedState(filePath, "GET", null, {
      headers: {
        "x-mes-shared-state-keys": "__none__",
        "x-mes-system-domains-compatibility": "status",
      },
    });
    assert(metadataOnly.statusCode === 200 && metadataOnly.json.systemDomainsCompatibility?.state === "retired", "Metadata-only GET must expose the durable System Domains retirement state");
    assert(Object.keys(metadataOnly.json.values || {}).length === 1 && metadataOnly.json.values?.[SHARED_STATE_KEYS.systemDomains] === null, "Retired metadata must carry only the narrow System Domains tombstone");

    const unchanged = await callSharedState(filePath, "GET", null, {
      headers: { "x-mes-shared-state-version": String(fetched.json.version) },
    });
    assert(unchanged.statusCode === 200, "Version check should return 200");
    assert(unchanged.json.unchanged === true, "Matching version should return a lightweight unchanged response");
    assert(!Object.prototype.hasOwnProperty.call(unchanged.json, "values"), "Unchanged response should omit the heavy shared-state values");

    const unchangedCompatibility = await callSharedState(filePath, "GET", null, {
      headers: {
        "x-mes-shared-state-version": String(fetched.json.version),
        "x-mes-system-domains-compatibility": "status",
      },
    });
    assert(unchangedCompatibility.json.unchanged === true && unchangedCompatibility.json.systemDomainsCompatibility?.state === "retired", "A matching version must still return the System Domains compatibility state");
    assert(unchangedCompatibility.json.values?.[SHARED_STATE_KEYS.systemDomains] === null, "An unchanged retired response must still clear stale local System Domains");

    // The endpoint caches unchanged file snapshots for revision-only polls,
    // but must still observe writes performed outside its own process path.
    const externallyUpdated = {
      ...fetched.json,
      version: 5,
      updatedAt: "2026-07-17T12:00:00.000Z",
    };
    await writeFile(filePath, `${JSON.stringify(externallyUpdated, null, 2)}\n`, "utf-8");
    const invalidated = await callSharedState(filePath, "GET", null, {
      headers: { "x-mes-shared-state-version": String(fetched.json.version) },
    });
    assert(invalidated.json.version === 5 && invalidated.json.unchanged !== true, "File snapshot cache must invalidate after an external write");

    // Two independent HTTP requests can reach different Node workers. The
    // file lock must turn the shared base revision into one success and one
    // normal conflict instead of allowing two read-check-write sequences.
    const concurrentPayload = {
      baseVersion: 5,
      clientId: "concurrent-client",
      actor: "QA",
      action: "concurrent-shared-state-write",
      values: externallyUpdated.values,
      sharedUi: externallyUpdated.sharedUi,
    };
    const [firstConcurrent, secondConcurrent] = await Promise.all([
      callSharedState(filePath, "POST", concurrentPayload),
      callSharedState(filePath, "POST", concurrentPayload),
    ]);
    const concurrentStatuses = [firstConcurrent.statusCode, secondConcurrent.statusCode].sort();
    assert(JSON.stringify(concurrentStatuses) === JSON.stringify([200, 409]), "Concurrent writes from the same base revision must serialize into one success and one conflict");
    const afterConcurrent = await callSharedState(filePath, "GET");
    assert(afterConcurrent.json.version === 6, "A serialized concurrent write must increment the snapshot exactly once");
    const residualFiles = await readdir(dir);
    assert(!residualFiles.some((name) => name.includes(".tmp-") || name.endsWith(".lock")), "Atomic shared-state writes must not leave temporary files or locks behind");

    // A normal UI preference must not re-send or receive the complete
    // compatibility snapshot. Its server-side merge keeps every domain
    // value, while a conflict intentionally still returns the full current
    // snapshot for the established recovery path.
    const compactBaseUi = cloneSharedUiSnapshot(afterConcurrent.json.sharedUi);
    const firstCompactUiPatch = getSharedUiPatch(
      compactBaseUi,
      applySharedUiPatch(compactBaseUi, { maps: { ganttDependencyRoutes: { set: { "slot-a": ["route-compact-a"] }, remove: [] } }, replace: {} }),
    );
    assert(JSON.stringify(Object.keys(firstCompactUiPatch.maps)) === JSON.stringify(["ganttDependencyRoutes"]), "A UI edit must produce only its changed map entries");
    const firstCompactUi = await callSharedState(filePath, "POST", {
      baseVersion: 6,
      clientId: "compact-ui-a",
      actor: "QA",
      action: "shared-ui",
      responseMode: "ack",
      values: {},
      sharedUi: applySharedUiPatch(compactBaseUi, firstCompactUiPatch),
      sharedUiPatch: firstCompactUiPatch,
    });
    assert(firstCompactUi.statusCode === 200 && firstCompactUi.json.ok, "Compact shared-UI write should return success");
    assert(firstCompactUi.json.version === 7, "Compact shared-UI write should increment the snapshot version");
    assert(!Object.prototype.hasOwnProperty.call(firstCompactUi.json, "values"), "Compact shared-UI acknowledgement must omit values");
    assert(!Object.prototype.hasOwnProperty.call(firstCompactUi.json, "sharedUi"), "Compact shared-UI acknowledgement must omit the full UI projection");

    const secondCompactUiPatch = getSharedUiPatch(
      compactBaseUi,
      applySharedUiPatch(compactBaseUi, { maps: { timesheetCellOverrides: { set: { "employee-qa::2026-06-17": { value: "remote-work", start: "09:00", end: "18:00" } }, remove: [] } }, replace: {} }),
    );
    assert(JSON.stringify(Object.keys(secondCompactUiPatch.maps)) === JSON.stringify(["timesheetCellOverrides"]), "A second tab must keep its own UI patch independent from the first tab");
    const staleCompactUi = await callSharedState(filePath, "POST", {
      baseVersion: 6,
      clientId: "compact-ui-b",
      actor: "QA",
      action: "local-shared-ui",
      responseMode: "ack",
      values: {},
      sharedUi: applySharedUiPatch(compactBaseUi, secondCompactUiPatch),
      sharedUiPatch: secondCompactUiPatch,
    });
    assert(staleCompactUi.statusCode === 409 && staleCompactUi.json.current?.values, "Compact shared-UI conflict must retain the complete recovery snapshot");

    const retriedCompactUi = await callSharedState(filePath, "POST", {
      baseVersion: 7,
      clientId: "compact-ui-b",
      actor: "QA",
      action: "local-shared-ui:conflict-retry",
      responseMode: "ack",
      values: {},
      sharedUi: applySharedUiPatch(compactBaseUi, secondCompactUiPatch),
      sharedUiPatch: secondCompactUiPatch,
    });
    assert(retriedCompactUi.statusCode === 200 && retriedCompactUi.json.version === 8, "Compact shared-UI retry should save against the current revision");
    const afterCompactUi = await callSharedState(filePath, "GET");
    const compactValueKeys = Object.keys(afterConcurrent.json.values || {});
    assert(
      compactValueKeys.length === Object.keys(afterCompactUi.json.values || {}).length
        && compactValueKeys.every((key) => afterCompactUi.json.values[key] === afterConcurrent.json.values[key]),
      "Compact shared-UI writes must preserve every domain value byte-for-byte",
    );
    assert(afterCompactUi.json.sharedUi.ganttDependencyRoutes?.["slot-a"]?.[0] === "route-compact-a", "First compact UI update must survive a conflicting second update");
    assert(afterCompactUi.json.sharedUi.timesheetCellOverrides?.["employee-qa::2026-06-17"]?.value === "remote-work", "Retried compact UI update must merge with the current UI projection");
    assert(afterCompactUi.json.sharedUi.productionStructureMatrixOverrides?.["D-MANUAL"], "Compact UI updates must preserve unrelated UI fields");

    const postCompactPatch = async ({ baseVersion, clientId, action = "shared-ui", baseUi, nextUi }) => {
      const sharedUiPatch = getSharedUiPatch(baseUi, nextUi);
      return callSharedState(filePath, "POST", {
        baseVersion,
        clientId,
        actor: "QA",
        action,
        responseMode: "ack",
        values: {},
        // Compatibility copy for a server being restarted during a release.
        sharedUi: nextUi,
        sharedUiPatch,
      });
    };
    const patchMapEntry = (baseUi, mapKey, entryKey, value) => applySharedUiPatch(baseUi, {
      maps: { [mapKey]: { set: { [entryKey]: value }, remove: [] } },
      replace: {},
    });

    // Same top-level map, different entries: this is the important race that
    // a top-level-only UI diff would still lose.
    const mapRaceBase = cloneSharedUiSnapshot(afterCompactUi.json.sharedUi);
    const mapRaceA = patchMapEntry(mapRaceBase, "timesheetCellOverrides", "employee-a::2026-06-18", { value: "a", start: "08:00", end: "17:00" });
    const mapRaceB = patchMapEntry(mapRaceBase, "timesheetCellOverrides", "employee-b::2026-06-18", { value: "b", start: "09:00", end: "18:00" });
    const mapRaceFirst = await postCompactPatch({ baseVersion: 8, clientId: "map-race-a", baseUi: mapRaceBase, nextUi: mapRaceA });
    assert(mapRaceFirst.statusCode === 200 && mapRaceFirst.json.version === 9, "First same-map compact update should save");
    const mapRaceConflict = await postCompactPatch({ baseVersion: 8, clientId: "map-race-b", baseUi: mapRaceBase, nextUi: mapRaceB });
    assert(mapRaceConflict.statusCode === 409 && mapRaceConflict.json.current?.version === 9, "Second same-map compact update should receive a recoverable conflict");
    const mapRaceRetry = await postCompactPatch({ baseVersion: 9, clientId: "map-race-b", action: "shared-ui:conflict-retry", baseUi: mapRaceBase, nextUi: mapRaceB });
    assert(mapRaceRetry.statusCode === 200 && mapRaceRetry.json.version === 10, "Second same-map compact update should retry safely");
    const afterMapRace = await callSharedState(filePath, "GET");
    assert(afterMapRace.json.sharedUi.timesheetCellOverrides?.["employee-a::2026-06-18"]?.value === "a", "Same-map retry must preserve the first timesheet cell");
    assert(afterMapRace.json.sharedUi.timesheetCellOverrides?.["employee-b::2026-06-18"]?.value === "b", "Same-map retry must add the second timesheet cell");

    const ganttRaceBase = cloneSharedUiSnapshot(afterMapRace.json.sharedUi);
    const ganttRaceA = patchMapEntry(ganttRaceBase, "ganttDependencyRoutes", "slot-gantt-a", ["route-a"]);
    const ganttRaceB = patchMapEntry(ganttRaceBase, "ganttDependencyRoutes", "slot-gantt-b", ["route-b"]);
    const ganttRaceFirst = await postCompactPatch({ baseVersion: 10, clientId: "gantt-race-a", baseUi: ganttRaceBase, nextUi: ganttRaceA });
    assert(ganttRaceFirst.statusCode === 200 && ganttRaceFirst.json.version === 11, "First Gantt map update should save");
    const ganttRaceConflict = await postCompactPatch({ baseVersion: 10, clientId: "gantt-race-b", baseUi: ganttRaceBase, nextUi: ganttRaceB });
    assert(ganttRaceConflict.statusCode === 409, "Second Gantt map update should receive a conflict");
    const ganttRaceRetry = await postCompactPatch({ baseVersion: 11, clientId: "gantt-race-b", action: "shared-ui:conflict-retry", baseUi: ganttRaceBase, nextUi: ganttRaceB });
    assert(ganttRaceRetry.statusCode === 200 && ganttRaceRetry.json.version === 12, "Second Gantt map update should retry safely");
    const afterGanttRace = await callSharedState(filePath, "GET");
    assert(afterGanttRace.json.sharedUi.ganttDependencyRoutes?.["slot-gantt-a"]?.[0] === "route-a", "Same-map retry must preserve the first Gantt dependency");
    assert(afterGanttRace.json.sharedUi.ganttDependencyRoutes?.["slot-gantt-b"]?.[0] === "route-b", "Same-map retry must add the second Gantt dependency");

    const laneRaceBase = cloneSharedUiSnapshot(afterGanttRace.json.sharedUi);
    const laneRaceA = patchMapEntry(laneRaceBase, "shiftMasterBoardLaneBySlot", "slot-lane-a", "in_work");
    const laneRaceB = patchMapEntry(laneRaceBase, "shiftMasterBoardLaneBySlot", "slot-lane-b", "queued");
    const laneRaceFirst = await postCompactPatch({ baseVersion: 12, clientId: "lane-race-a", baseUi: laneRaceBase, nextUi: laneRaceA });
    assert(laneRaceFirst.statusCode === 200 && laneRaceFirst.json.version === 13, "First lane map update should save");
    const laneRaceConflict = await postCompactPatch({ baseVersion: 12, clientId: "lane-race-b", baseUi: laneRaceBase, nextUi: laneRaceB });
    assert(laneRaceConflict.statusCode === 409, "Second lane map update should receive a conflict");
    const laneRaceRetry = await postCompactPatch({ baseVersion: 13, clientId: "lane-race-b", action: "shared-ui:conflict-retry", baseUi: laneRaceBase, nextUi: laneRaceB });
    assert(laneRaceRetry.statusCode === 200 && laneRaceRetry.json.version === 14, "Second lane map update should retry safely");
    const afterLaneRace = await callSharedState(filePath, "GET");
    assert(afterLaneRace.json.sharedUi.shiftMasterBoardLaneBySlot?.["slot-lane-a"] === "in_work", "Same-map retry must preserve the first lane choice");
    assert(afterLaneRace.json.sharedUi.shiftMasterBoardLaneBySlot?.["slot-lane-b"] === "queued", "Same-map retry must add the second lane choice");

    const profileRaceBase = cloneSharedUiSnapshot(afterLaneRace.json.sharedUi);
    const profileRaceA = applySharedUiPatch(profileRaceBase, { maps: {}, profiles: { set: { "role-a": { id: "role-a", label: "Роль A", scope: "workCenter", defaultModule: "shiftMasterBoard" } }, remove: [] }, replace: {} });
    const profileRaceB = applySharedUiPatch(profileRaceBase, { maps: {}, profiles: { set: { "role-b": { id: "role-b", label: "Роль B", scope: "workCenter", defaultModule: "planning" } }, remove: [] }, replace: {} });
    const profileRaceFirst = await postCompactPatch({ baseVersion: 14, clientId: "profile-race-a", baseUi: profileRaceBase, nextUi: profileRaceA });
    assert(profileRaceFirst.statusCode === 200 && profileRaceFirst.json.version === 15, "First profile collection update should save");
    const profileRaceConflict = await postCompactPatch({ baseVersion: 14, clientId: "profile-race-b", baseUi: profileRaceBase, nextUi: profileRaceB });
    assert(profileRaceConflict.statusCode === 409, "Second profile collection update should receive a conflict");
    const profileRaceRetry = await postCompactPatch({ baseVersion: 15, clientId: "profile-race-b", action: "shared-ui:conflict-retry", baseUi: profileRaceBase, nextUi: profileRaceB });
    assert(profileRaceRetry.statusCode === 200 && profileRaceRetry.json.version === 16, "Second profile collection update should retry safely");
    const afterProfileRace = await callSharedState(filePath, "GET");
    const profileIds = new Set((afterProfileRace.json.sharedUi.accessRoleProfiles || []).map((profile) => profile.id));
    assert(profileIds.has("role-a") && profileIds.has("role-b"), "Profile collection retry must preserve distinct role additions");

    // A compact UI patch may race with a normal planning/directory save. The
    // original full writer has no patch on its first request, but its conflict
    // retry must derive one from the saved server baseline instead of sending
    // a stale whole UI object.
    const crossPathBase = cloneSharedUiSnapshot(afterProfileRace.json.sharedUi);
    const compactCrossUi = patchMapEntry(crossPathBase, "timesheetCellOverrides", "employee-compact::2026-06-19", { value: "compact", start: "08:00", end: "17:00" });
    const fullCrossUi = patchMapEntry(crossPathBase, "shiftMasterBoardLaneBySlot", "slot-full-writer", "queued");
    const compactCross = await postCompactPatch({ baseVersion: 16, clientId: "cross-compact", baseUi: crossPathBase, nextUi: compactCrossUi });
    assert(compactCross.statusCode === 200 && compactCross.json.version === 17, "Compact side of a cross-path race should save");
    const fullCrossConflict = await callSharedState(filePath, "POST", {
      baseVersion: 16,
      clientId: "cross-full",
      actor: "QA",
      action: "module-state",
      values: afterConcurrent.json.values,
      sharedUi: fullCrossUi,
    });
    assert(fullCrossConflict.statusCode === 409 && fullCrossConflict.json.current?.version === 17, "Full side of a cross-path race should receive a conflict");
    const fullCrossRetryPatch = getSharedUiPatch(crossPathBase, fullCrossUi);
    const fullCrossRetry = await callSharedState(filePath, "POST", {
      baseVersion: 17,
      clientId: "cross-full",
      actor: "QA",
      action: "module-state:conflict-retry",
      values: afterConcurrent.json.values,
      sharedUi: fullCrossUi,
      sharedUiPatch: fullCrossRetryPatch,
    });
    assert(fullCrossRetry.statusCode === 200 && fullCrossRetry.json.version === 18, "Full writer retry should merge its UI patch");
    const afterCrossPathRace = await callSharedState(filePath, "GET");
    assert(afterCrossPathRace.json.sharedUi.timesheetCellOverrides?.["employee-compact::2026-06-19"]?.value === "compact", "Full writer retry must preserve the compact writer cell");
    assert(afterCrossPathRace.json.sharedUi.shiftMasterBoardLaneBySlot?.["slot-full-writer"] === "queued", "Full writer retry must retain its own lane change");

    // A full-write retry receives a merged server projection. The retrying
    // browser must rebase its local UI to that projection before the next
    // preference edit; otherwise its stale local map would emit a `remove`
    // for the compact writer's entry and undo the preserved update.
    const fullWriterRebasedUi = rebaseSharedUiAfterFullWrite(
      afterCrossPathRace.json.sharedUi,
      fullCrossUi,
      fullCrossUi,
    );
    const fullWriterFollowUpUi = patchMapEntry(
      fullWriterRebasedUi,
      "shiftMasterBoardLaneBySlot",
      "slot-full-writer-follow-up",
      "in_work",
    );
    const fullWriterFollowUpPatch = getSharedUiPatch(
      afterCrossPathRace.json.sharedUi,
      fullWriterFollowUpUi,
    );
    assert(
      !fullWriterFollowUpPatch.maps?.timesheetCellOverrides?.remove?.includes("employee-compact::2026-06-19"),
      "Rebased full writer must not remove a compact writer cell on its next UI save",
    );
    const fullWriterFollowUp = await postCompactPatch({
      baseVersion: 18,
      clientId: "cross-full-follow-up",
      baseUi: afterCrossPathRace.json.sharedUi,
      nextUi: fullWriterFollowUpUi,
    });
    assert(fullWriterFollowUp.statusCode === 200 && fullWriterFollowUp.json.version === 19, "Rebased full writer follow-up should save");
    const afterFullWriterFollowUp = await callSharedState(filePath, "GET");
    assert(afterFullWriterFollowUp.json.sharedUi.timesheetCellOverrides?.["employee-compact::2026-06-19"]?.value === "compact", "Rebased full writer follow-up must retain the compact writer cell");
    assert(afterFullWriterFollowUp.json.sharedUi.shiftMasterBoardLaneBySlot?.["slot-full-writer-follow-up"] === "in_work", "Rebased full writer follow-up must retain the new local preference");

    // A browser can keep a version from before an operator restores an empty
    // store. The first compact write then sees a normal version conflict; the
    // retry discovers the missing domain baseline and must be able to use the
    // legacy full payload instead of dropping the UI preference.
    const resetFilePath = join(dir, "reset-state.json");
    const resetSeed = await callSharedState(resetFilePath, "POST", {
      baseVersion: 0,
      clientId: "reset-seed",
      actor: "QA",
      action: "seed",
      values,
      sharedUi: afterCrossPathRace.json.sharedUi,
    });
    assert(resetSeed.statusCode === 200 && resetSeed.json.version === 1, "Reset recovery fixture should seed a normal snapshot");
    await writeFile(resetFilePath, `${JSON.stringify({ version: 0, updatedAt: "", updatedBy: null, values: null, sharedUi: {}, events: [] })}\n`, "utf-8");
    const resetPatch = { maps: { ganttDependencyRoutes: { set: { "slot-reset": ["route-reset"] }, remove: [] } }, replace: {} };
    const resetFirst = await callSharedState(resetFilePath, "POST", {
      baseVersion: 1,
      clientId: "reset-client",
      actor: "QA",
      action: "shared-ui",
      responseMode: "ack",
      values: {},
      sharedUi: applySharedUiPatch(afterCrossPathRace.json.sharedUi, resetPatch),
      sharedUiPatch: resetPatch,
    });
    assert(resetFirst.statusCode === 409 && resetFirst.json.conflict === true && resetFirst.json.current?.version === 0, "Restored empty store must first expose the stale browser version conflict");
    const resetCompactRetry = await callSharedState(resetFilePath, "POST", {
      baseVersion: 0,
      clientId: "reset-client",
      actor: "QA",
      action: "shared-ui:conflict-retry",
      responseMode: "ack",
      values: {},
      sharedUi: applySharedUiPatch(afterCrossPathRace.json.sharedUi, resetPatch),
      sharedUiPatch: resetPatch,
    });
    assert(resetCompactRetry.statusCode === 409 && resetCompactRetry.json.compactAckUnavailable === true, "Compact retry after a store reset must explicitly request a full fallback");
    const resetFallback = await callSharedState(resetFilePath, "POST", {
      baseVersion: 0,
      clientId: "reset-client",
      actor: "QA",
      action: "shared-ui:compact-fallback",
      values,
      sharedUi: applySharedUiPatch(afterCrossPathRace.json.sharedUi, resetPatch),
    });
    assert(resetFallback.statusCode === 200 && resetFallback.json.version === 1, "Full fallback after a store reset must save the UI preference");
    assert(resetFallback.json.sharedUi.ganttDependencyRoutes?.["slot-reset"]?.[0] === "route-reset", "Full fallback after a store reset must retain the requested UI change");

    const staleLockPath = `${filePath}.lock`;
    await writeFile(staleLockPath, "not-a-lock-directory", "utf8").catch(() => {});
    await rm(staleLockPath, { force: true });
    await (await import("node:fs/promises")).mkdir(staleLockPath);
    await utimes(staleLockPath, new Date(0), new Date(0));
    await withSharedStateFileLock(filePath, async () => {
      throw new Error("A confirmed stale lock must not be stolen");
    }, { timeoutMs: 20, staleMs: 0 }).then(() => {
      throw new Error("A stale lock must block rather than be removed automatically");
    }).catch((error) => {
      assert(error.code === "MES_SHARED_STATE_LOCK_STALE", "Stale locks must fail closed with an explicit code");
    });
    assert((await stat(staleLockPath)).isDirectory(), "A stale lock must remain for controlled operator inspection");
    await rm(staleLockPath, { recursive: true, force: true });

    // The root-only System Domains tombstone carries a compact transition
    // proof outside the rolling event window. Ordinary browser saves must
    // preserve it even after the 50-event audit slice has rolled over.
    const retirementMarkerPath = join(dir, "retirement-marker-state.json");
    const retirementSeed = await callSharedState(retirementMarkerPath, "POST", {
      baseVersion: 0,
      clientId: "retirement-marker-seed",
      actor: "QA",
      action: "seed",
      values,
      sharedUi: {},
    });
    const retirementWrite = await updateSharedStateSnapshot({
      filePath: retirementMarkerPath,
      expectedVersion: retirementSeed.json.version,
      allowSystemDomainsCompatibilitySnapshotRetirement: true,
      update: async (current) => ({
        ...current,
        values: { ...current.values, [SHARED_STATE_KEYS.systemDomains]: null },
        systemDomainsRetirement: {
          transitionId: "shared-state-qa-pending-transition",
          action: "system-domains-retire-compatibility-snapshot",
          createdAt: "2026-07-18T00:00:00.000Z",
        },
      }),
    });
    assert(retirementWrite.ok && retirementWrite.snapshot.systemDomainsRetirement?.transitionId === "shared-state-qa-pending-transition", "Root-only tombstone update must persist its compact transition proof");
    let retirementVersion = retirementWrite.snapshot.version;
    for (let index = 0; index < 51; index += 1) {
      const saved = await callSharedState(retirementMarkerPath, "POST", {
        baseVersion: retirementVersion,
        clientId: `retirement-marker-${index}`,
        actor: "QA",
        action: "shared-ui",
        responseMode: "ack",
        values: {},
        sharedUiPatch: {
          maps: { ganttDependencyRoutes: { set: { [`marker-${index}`]: [`route-${index}`] }, remove: [] } },
          replace: {},
        },
      });
      assert(saved.statusCode === 200, "Ordinary UI saves must remain available after a System Domains tombstone");
      retirementVersion = saved.json.version;
    }
    const retirementAfterRollover = await callSharedState(retirementMarkerPath, "GET");
    assert(retirementAfterRollover.json.events.length === 50 && !retirementAfterRollover.json.events.some((event) => event?.action === "system-domains-retire-compatibility-snapshot"), "The rolling shared-state event window must evict the older retirement event in this fixture");
    assert(retirementAfterRollover.json.systemDomainsRetirement?.transitionId === "shared-state-qa-pending-transition", "The compact System Domains transition proof must survive event rollover and browser writes");

    console.log("Shared State Functional QA");
    console.log("- empty snapshot: pass");
    console.log("- value whitelist: pass");
    console.log("- removed supply key filtering: pass");
    console.log("- optional key preservation: pass");
    console.log("- System Domains value transport: pass");
    console.log("- optional shared UI preservation: pass");
    console.log("- shared UI whitelist: pass");
    console.log("- removed shop-map UI filtering: pass");
    console.log("- production matrix sharing: pass");
    console.log("- timesheet sharing: pass");
    console.log("- shift master board sharing: pass");
    console.log("- server-owned shift projection retirement: pass");
    console.log("- access roles sharing: pass");
    console.log("- version conflict: pass");
    console.log("- compact shared-UI acknowledgement and conflict merge: pass");
    console.log("- unchanged-poll file cache and external invalidation: pass");
    console.log("- atomic cross-process file write lock: pass");
    console.log("- shared-state file mode preservation and stale-lock fail-closed: pass");
    console.log("- protected destructive action guard: pass");
    console.log("- System Domains transition proof survives event rollover: pass");
    console.log("OK: shared-state endpoint preserves whitelisted collaborative data.");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
