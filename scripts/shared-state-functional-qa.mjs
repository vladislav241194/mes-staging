import { EventEmitter } from "node:events";
import { chmod, mkdtemp, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { handleSharedStateRequest } from "./shared-state-endpoint.mjs";
import { withSharedStateFileLock } from "./shared-state-storage.mjs";

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
    const initial = await callSharedState(filePath, "GET");
    assert(initial.statusCode === 200, "GET empty snapshot should return 200");
    assert(initial.json.version === 0, "Empty snapshot should start with version 0");

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

    const retiredShiftProjection = await callSharedState(filePath, "POST", {
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
    assert(retiredShiftProjection.statusCode === 200 && retiredShiftProjection.json.version === 3, "Server authority tombstone must create a new shared-state revision");
    assert(!Object.prototype.hasOwnProperty.call(retiredShiftProjection.json.sharedUi, "shiftMasterBoardAssignments"), "Retired shift assignments must not remain in shared state");
    assert(!Object.prototype.hasOwnProperty.call(retiredShiftProjection.json.sharedUi, "shiftMasterBoardFacts"), "Retired shift facts must not remain in shared state");
    assert(!Object.prototype.hasOwnProperty.call(retiredShiftProjection.json.sharedUi, "shiftMasterBoardCarryovers"), "Retired carryovers must not remain in shared state");

    const retiredSystemDomainsProjection = await callSharedState(filePath, "POST", {
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
    assert(retiredSystemDomainsProjection.statusCode === 200 && retiredSystemDomainsProjection.json.version === 4, "System Domains authority tombstone must create a new shared-state revision");
    assert(retiredSystemDomainsProjection.json.values[SHARED_STATE_KEYS.systemDomains] === null, "Retired System Domains must be an explicit shared-state tombstone");

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

    const deferredSpecifications2 = await callSharedState(filePath, "GET", null, {
      headers: { "x-mes-shared-state-keys": SHARED_STATE_KEYS.specifications2 },
    });
    assert(deferredSpecifications2.statusCode === 200, "Projected GET should return 200");
    assert(Object.keys(deferredSpecifications2.json.values || {}).length === 1, "Projected GET should omit unrelated shared-state values");
    assert(deferredSpecifications2.json.values?.[SHARED_STATE_KEYS.specifications2]?.includes("specifications2-qa"), "Projected GET should return the requested Specifications 2.0 registry");

    const metadataOnly = await callSharedState(filePath, "GET", null, {
      headers: { "x-mes-shared-state-keys": "__none__" },
    });
    assert(metadataOnly.statusCode === 200 && Object.keys(metadataOnly.json.values || {}).length === 0, "Metadata-only GET must omit every legacy value while retaining the shared snapshot revision");

    const unchanged = await callSharedState(filePath, "GET", null, {
      headers: { "x-mes-shared-state-version": String(fetched.json.version) },
    });
    assert(unchanged.statusCode === 200, "Version check should return 200");
    assert(unchanged.json.unchanged === true, "Matching version should return a lightweight unchanged response");
    assert(!Object.prototype.hasOwnProperty.call(unchanged.json, "values"), "Unchanged response should omit the heavy shared-state values");

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
    console.log("- unchanged-poll file cache and external invalidation: pass");
    console.log("- atomic cross-process file write lock: pass");
    console.log("- shared-state file mode preservation and stale-lock fail-closed: pass");
    console.log("- protected destructive action guard: pass");
    console.log("OK: shared-state endpoint preserves whitelisted collaborative data.");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
