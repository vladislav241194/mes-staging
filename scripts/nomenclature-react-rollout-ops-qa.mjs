#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = await readFile(join(root, "ops/frontend/mes-pilot-react-nomenclature-evaluation.conf"), "utf8");
const activate = await readFile(join(root, "ops/frontend/activate-react-nomenclature-evaluation.sh"), "utf8");
const deactivate = await readFile(join(root, "ops/frontend/deactivate-react-nomenclature-evaluation.sh"), "utf8");
const writeConfig = await readFile(join(root, "ops/frontend/mes-pilot-react-nomenclature-write-evaluation.conf"), "utf8");
const activateWrite = await readFile(join(root, "ops/frontend/activate-react-nomenclature-write-evaluation.sh"), "utf8");
const deactivateWrite = await readFile(join(root, "ops/frontend/deactivate-react-nomenclature-write-evaluation.sh"), "utf8");
const appSource = await readFile(join(root, "src/app.js"), "utf8");

assert.match(config, /^\[Service\]$/m);
assert.match(config, /^Environment=MES_REACT_NOMENCLATURE=1$/m);
assert.match(config, /^Environment=MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION=1$/m);

for (const [name, source] of [["activate", activate], ["deactivate", deactivate]]) {
  assert.match(source, /^set -euo pipefail$/m, `${name} must fail closed`);
  assert.match(source, /\[\[ \$\{EUID\} -ne 0 \]\]/, `${name} must require root`);
  assert.match(source, /70-react-nomenclature-evaluation\.conf/, `${name} must own the isolated drop-in`);
  assert.match(source, /systemctl daemon-reload/, `${name} must reload systemd`);
  assert.match(source, /systemctl restart "\$SERVICE"/, `${name} must restart only the selected service`);
  assert.match(source, /"status":"ok"/, `${name} must require a healthy service`);
  assert.match(source, /restore_on_failure/, `${name} must restore the prior configuration on failure`);
}

assert.match(activate, /"MES_REACT_NOMENCLATURE":true/);
assert.match(activate, /"MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION":true/);
assert.match(deactivate, /"MES_REACT_NOMENCLATURE":false/);
assert.match(deactivate, /"MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION":false/);

assert.match(writeConfig, /^\[Service\]$/m);
assert.match(writeConfig, /^Environment=MES_REACT_NOMENCLATURE=1$/m);
assert.match(writeConfig, /^Environment=MES_REACT_NOMENCLATURE_WRITE_EVALUATION=1$/m);
assert.doesNotMatch(writeConfig, /MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION/);

for (const [name, source] of [["activate-write", activateWrite], ["deactivate-write", deactivateWrite]]) {
  assert.match(source, /^set -euo pipefail$/m, `${name} must fail closed`);
  assert.match(source, /\[\[ \$\{EUID\} -ne 0 \]\]/, `${name} must require root`);
  assert.match(source, /71-react-nomenclature-write-evaluation\.conf/, `${name} must own the isolated write drop-in`);
  assert.match(source, /systemctl daemon-reload/, `${name} must reload systemd`);
  assert.match(source, /systemctl restart "\$SERVICE"/, `${name} must restart only the selected service`);
  assert.match(source, /"status":"ok"/, `${name} must require a healthy service`);
}
assert.match(activateWrite, /restore_on_failure/, "activate-write must restore the prior configuration on failure");
assert.match(deactivateWrite, /report_failure_backup/, "deactivate-write must preserve rollback evidence on failure");
assert.match(deactivateWrite, /Never restore a write-enabling evaluation permission/, "deactivate-write must fail safer with permission OFF");
assert.doesNotMatch(deactivateWrite, /install -m 0644 "\$backup_dir\/previous\.conf"/, "deactivate-write must never restore an enabling drop-in");

assert.match(activateWrite, /Another React evaluation is active/);
assert.match(activateWrite, /request_capabilities/);
assert.match(activateWrite, /\/api\/v1\/nomenclature\/capabilities/);
assert.match(activateWrite, /operatorReadiness/);
assert.match(activateWrite, /employeeAuthStorageConfigured/);
assert.match(activateWrite, /employeeAuthSchemaReady/);
assert.match(activateWrite, /employeeAuthConfigured/);
assert.match(activateWrite, /serverCommandsConfigured/);
assert.match(activateWrite, /"MES_REACT_NOMENCLATURE":true/);
assert.match(activateWrite, /"MES_REACT_NOMENCLATURE_WRITE_EVALUATION":true/);
assert.match(activateWrite, /"MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION":false/);
assert.match(activateWrite, /cmp -s "\$SOURCE_FILE" "\$DROPIN_FILE"/);
assert.match(activateWrite, /operator-modified React Nomenclature write evaluation drop-in/);
assert.match(deactivateWrite, /"MES_REACT_NOMENCLATURE":false/);
assert.match(deactivateWrite, /"MES_REACT_NOMENCLATURE_WRITE_EVALUATION":false/);
assert.match(deactivateWrite, /cmp -s "\$SOURCE_FILE" "\$DROPIN_FILE"/);
assert.match(deactivateWrite, /operator-modified React Nomenclature write evaluation drop-in/);

const writeInstallIndex = activateWrite.indexOf('install -m 0644 "$SOURCE_FILE" "$DROPIN_FILE"');
const writePreflightIndex = activateWrite.indexOf('pre_capabilities="$(request_capabilities)"');
const writeLoopIndex = activateWrite.indexOf("for attempt in $(seq 1 12)");
const writePostCapabilitiesIndex = activateWrite.indexOf('capabilities="$(request_capabilities', writeLoopIndex);
const writePostReadinessIndex = activateWrite.indexOf('assert_command_owner_readiness "$capabilities"', writeLoopIndex);
assert.ok(writePreflightIndex >= 0 && writeInstallIndex > writePreflightIndex, "Write evaluation readiness must be proven before the drop-in is installed");
assert.ok(writeLoopIndex > writeInstallIndex && writePostCapabilitiesIndex > writeLoopIndex && writePostReadinessIndex > writePostCapabilitiesIndex, "Write evaluation readiness must be proven again after restart");

const nomenclatureHostStart = appSource.indexOf("function getNomenclatureReactReadState");
const nomenclatureHostEnd = appSource.indexOf("function getBoardsReactLocalQaOverrides", nomenclatureHostStart);
const nomenclatureHostSource = appSource.slice(nomenclatureHostStart, nomenclatureHostEnd);
assert(nomenclatureHostStart >= 0 && nomenclatureHostEnd > nomenclatureHostStart, "Nomenclature React host boundary must be discoverable");
const writeDecisionStart = nomenclatureHostSource.indexOf("function getNomenclatureReactWriteDecision");
const writeDecisionEnd = nomenclatureHostSource.indexOf("function canRequestNomenclatureEmployeeElevation", writeDecisionStart);
const writeDecisionSource = nomenclatureHostSource.slice(writeDecisionStart, writeDecisionEnd);
assert(writeDecisionStart >= 0 && writeDecisionEnd > writeDecisionStart, "Nomenclature React write decision must be discoverable");
assert.match(writeDecisionSource, /canEditDirectorySection\("nomenclature"\)/, "evaluation write capability must require Nomenclature RBAC");
assert.match(writeDecisionSource, /activation\.accessMode === "react"[^]*activation\.ownerReady !== true/, "permanent write capability must require React ownership and durable owner readiness");
assert.match(writeDecisionSource, /serverCommandsConfigured !== true \|\| capabilities\.serverCommandsEnabled !== true/, "permanent write capability must require the authenticated server command owner");
assert.match(nomenclatureHostSource, /getPayload:[^]*getNomenclatureReactWriteDecision\("create", activation\)[^]*getNomenclatureReactWriteDecision\("edit", activation\)[^]*getNomenclatureReactWriteDecision\("delete", activation\)/, "payload capabilities must use action-specific write decisions");
assert.match(nomenclatureHostSource, /executeCommand:[^]*await getNomenclatureReactWriteDecisionForCommand\("delete"\)[^]*await getNomenclatureReactWriteDecisionForCommand\(input\.isNew === true \? "create" : "edit"\)/, "write dispatch must await and recheck action-specific write decisions");

console.log("React Nomenclature rollout operations QA: OK");
