import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleSharedStateRequest } from "./shared-state-endpoint.mjs";

const SHARED_STATE_KEYS = {
  state: "mes-planning-prototype-state-v2",
  directories: "mes-planning-prototype-directories-v2",
  directoryDefaults: "mes-planning-prototype-directories-defaults-restored-v1",
  directoryDeleted: "mes-planning-prototype-directories-deleted-entities-v1",
  supplyControl: "mes-planning-prototype-supply-control-v1",
  workCenterSeeded: "mes-planning-prototype-work-center-operations-seeded-v2",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeReq(method, body = null) {
  const req = new EventEmitter();
  req.method = method;
  req.body = body;
  req.destroy = () => {};
  return req;
}

function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(value = "") {
      this.body = String(value);
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
  await handleSharedStateRequest(makeReq(method, body), res, {
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
      [SHARED_STATE_KEYS.directoryDeleted]: "{}",
      [SHARED_STATE_KEYS.supplyControl]: JSON.stringify({
        rows: {
          "route-1::component-1": {
            status: "ordered",
            erpDoc: "ERP-1",
            supplier: "Поставщик",
            purchasedQuantity: 12,
          },
        },
      }),
      [SHARED_STATE_KEYS.workCenterSeeded]: "1",
      "forbidden-key": "must be dropped",
    };
    const posted = await callSharedState(filePath, "POST", {
      baseVersion: 0,
      clientId: "shared-state-qa",
      actor: "QA",
      action: "shared-state-functional-qa",
      values,
      sharedUi: {
        shopMapWidgetLayouts: { widgets: {} },
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
        forbiddenUi: { must: "drop" },
      },
    });

    assert(posted.statusCode === 200, "POST snapshot should return 200");
    assert(posted.json.version === 1, "POST snapshot should increment version");
    assert(posted.json.values[SHARED_STATE_KEYS.supplyControl], "Supply control key should be persisted");
    assert(!posted.json.values["forbidden-key"], "Forbidden value key should be dropped");
    assert(posted.json.sharedUi.shopMapWidgetLayouts, "Allowed shared UI should be persisted");
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

    const olderClientValues = { ...values };
    delete olderClientValues[SHARED_STATE_KEYS.supplyControl];
    const preserved = await callSharedState(filePath, "POST", {
      baseVersion: 1,
      clientId: "older-client-without-supply-key",
      actor: "QA",
      action: "older-client-snapshot",
      values: olderClientValues,
    });
    assert(preserved.statusCode === 200, "POST without optional supply key should still return 200");
    assert(preserved.json.version === 2, "Second POST should increment version");
    assert(
      preserved.json.values[SHARED_STATE_KEYS.supplyControl] === posted.json.values[SHARED_STATE_KEYS.supplyControl],
      "POST without optional supply key should preserve current supply control",
    );
    assert(preserved.json.sharedUi.shopMapWidgetLayouts, "POST without sharedUi should preserve current shared UI layouts");
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

    const conflict = await callSharedState(filePath, "POST", {
      baseVersion: 0,
      clientId: "stale-client",
      actor: "QA",
      action: "stale-write",
      values,
    });
    assert(conflict.statusCode === 409, "Stale POST should return conflict");
    assert(conflict.json.current?.values?.[SHARED_STATE_KEYS.supplyControl], "Conflict payload should include current supply control");

    const deniedDestructiveAction = await callSharedState(filePath, "POST", {
      baseVersion: 2,
      clientId: "protected-env-client",
      actor: "QA",
      action: "initial-preset",
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
    assert(fetched.json.version === 2, "GET should keep stored version");
    assert(fetched.json.values[SHARED_STATE_KEYS.supplyControl] === posted.json.values[SHARED_STATE_KEYS.supplyControl], "GET should return stored supply control");
    assert(fetched.json.sharedUi.productionStructureMatrixOverrides?.["D-MANUAL"], "GET should return matrix overrides");
    assert(fetched.json.sharedUi.timesheetCellOverrides?.["employee-qa::2026-06-17"], "GET should return timesheet overrides");
    assert(fetched.json.sharedUi.shiftMasterBoardLaneBySlot?.["slot-a"] === "in_work", "GET should return shift master lane map");
    assert(fetched.json.sharedUi.shiftMasterBoardAssignments?.["slot-a"], "GET should return shift master assignments");
    assert(fetched.json.sharedUi.shiftMasterAssignmentMatrix?.["master-qa"]?.employeeIds?.includes("employee-qa"), "GET should return shift master assignment matrix");
    assert(fetched.json.sharedUi.accessRoleProfiles?.[0]?.id === "master", "GET should return access role profiles");
    assert(fetched.json.sharedUi.accessRoleAssignments?.["employee-qa"] === "master", "GET should return access role assignments");

    console.log("Shared State Functional QA");
    console.log("- empty snapshot: pass");
    console.log("- value whitelist: pass");
    console.log("- supply control persistence: pass");
    console.log("- optional key preservation: pass");
    console.log("- optional shared UI preservation: pass");
    console.log("- shared UI whitelist: pass");
    console.log("- production matrix sharing: pass");
    console.log("- timesheet sharing: pass");
    console.log("- shift master board sharing: pass");
    console.log("- access roles sharing: pass");
    console.log("- version conflict: pass");
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
