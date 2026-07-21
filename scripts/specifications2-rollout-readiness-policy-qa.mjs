import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { specifications2RolloutReadinessSatisfied } from "./specifications2-rollout-readiness-policy.mjs";

const ready = {
  ok: true,
  readiness: {
    workOrders: { ready: true },
    commands: {
      specifications2WorkOrderCreation: { enabled: true, schemaReady: true },
      specifications2RevisionPublication: { enabled: true, schemaReady: true },
      specifications2AttachmentUpload: { enabled: true, schemaReady: true },
    },
  },
};
assert.equal(specifications2RolloutReadinessSatisfied("publication-ready", ready), true);
assert.equal(specifications2RolloutReadinessSatisfied("publication-schema-ready", ready), true);
assert.equal(specifications2RolloutReadinessSatisfied("work-orders-ready", ready), true);
assert.equal(specifications2RolloutReadinessSatisfied("work-orders-schema-ready", ready), true);
assert.equal(specifications2RolloutReadinessSatisfied("attachments-ready", ready), true);
assert.equal(specifications2RolloutReadinessSatisfied("attachments-schema-ready", ready), true);
assert.equal(specifications2RolloutReadinessSatisfied("publication-disabled", { ...ready, readiness: { ...ready.readiness, commands: { ...ready.readiness.commands, specifications2RevisionPublication: { enabled: false } } } }), true);
assert.equal(specifications2RolloutReadinessSatisfied("work-orders-disabled", { ...ready, readiness: { ...ready.readiness, commands: { ...ready.readiness.commands, specifications2WorkOrderCreation: { enabled: false } } } }), true);
assert.equal(specifications2RolloutReadinessSatisfied("attachments-disabled", { ...ready, readiness: { ...ready.readiness, commands: { ...ready.readiness.commands, specifications2AttachmentUpload: { enabled: false } } } }), true);
for (const payload of [null, {}, { ok: false, readiness: ready.readiness }, { ok: true, readiness: { commands: {} } }]) {
  assert.equal(specifications2RolloutReadinessSatisfied("publication-disabled", payload), false, "missing/failed readiness must never be interpreted as publication OFF");
  assert.equal(specifications2RolloutReadinessSatisfied("work-orders-disabled", payload), false, "missing/failed readiness must never be interpreted as Work Orders OFF");
  assert.equal(specifications2RolloutReadinessSatisfied("attachments-disabled", payload), false, "missing/failed readiness must never be interpreted as attachments OFF");
}
assert.equal(specifications2RolloutReadinessSatisfied("publication-disabled", ready), false, "old enabled publication readiness must be rejected");
assert.equal(specifications2RolloutReadinessSatisfied("work-orders-disabled", ready), false, "old enabled Work Order readiness must be rejected");
assert.equal(specifications2RolloutReadinessSatisfied("attachments-disabled", ready), false, "old enabled attachment readiness must be rejected");
const cli = fileURLToPath(new URL("./specifications2-rollout-readiness-policy.mjs", import.meta.url));
assert.notEqual(spawnSync(process.execPath, [cli, "publication-disabled", "not-json"]).status, 0, "a malformed/503-style missing payload must fail closed in the Ops CLI");
console.log("Specifications 2.0 rollout readiness policy QA: OK");
