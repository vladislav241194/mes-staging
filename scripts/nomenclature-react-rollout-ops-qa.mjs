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
  assert.match(source, /restore_on_failure/, `${name} must restore the prior configuration on failure`);
}

assert.match(activateWrite, /Another React evaluation is active/);
assert.match(activateWrite, /"MES_REACT_NOMENCLATURE":true/);
assert.match(activateWrite, /"MES_REACT_NOMENCLATURE_WRITE_EVALUATION":true/);
assert.match(activateWrite, /"MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION":false/);
assert.match(deactivateWrite, /"MES_REACT_NOMENCLATURE":false/);
assert.match(deactivateWrite, /"MES_REACT_NOMENCLATURE_WRITE_EVALUATION":false/);

const nomenclatureHostStart = appSource.indexOf("const nomenclatureReactIslandHost");
const nomenclatureHostEnd = appSource.indexOf("function getBoardsReactLocalQaOverrides", nomenclatureHostStart);
const nomenclatureHostSource = appSource.slice(nomenclatureHostStart, nomenclatureHostEnd);
assert(nomenclatureHostStart >= 0 && nomenclatureHostEnd > nomenclatureHostStart, "Nomenclature React host boundary must be discoverable");
assert.match(nomenclatureHostSource, /canCreateEdit[^]*canEditDirectorySection\("nomenclature"\)/, "write capability must require Nomenclature RBAC");
assert.match(nomenclatureHostSource, /writeAllowed[^]*canEditDirectorySection\("nomenclature"\)/, "write dispatch must recheck Nomenclature RBAC");

console.log("React Nomenclature rollout operations QA: OK");
