import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = await readFile(join(root, "ops/frontend/mes-pilot-react-directory-operations-evaluation.conf"), "utf8");
const activate = await readFile(join(root, "ops/frontend/activate-react-directory-operations-evaluation.sh"), "utf8");
const deactivate = await readFile(join(root, "ops/frontend/deactivate-react-directory-operations-evaluation.sh"), "utf8");

assert.match(config, /Environment=MES_REACT_DIRECTORY_OPERATIONS=1/);
assert.match(config, /Environment=MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION=1/);
assert.doesNotMatch(config, /WRITE/);

for (const [name, source] of [["activate", activate], ["deactivate", deactivate]]) {
  assert.match(source, /set -euo pipefail/, `${name} must fail closed`);
  assert.match(source, /EUID/, `${name} must require root`);
  assert.match(source, /77-react-directory-operations-evaluation\.conf/, `${name} must own the isolated drop-in`);
  assert.match(source, /systemctl daemon-reload/);
  assert.match(source, /systemctl restart/);
  assert.match(source, /"status":"ok"/);
  assert.match(source, /MES_REACT_DIRECTORY_OPERATIONS/);
  assert.match(source, /MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION/);
  assert.match(source, /restore_on_failure/);
}

assert.match(activate, /install -m 0644/);
assert.match(deactivate, /rm -f "\$DROPIN_FILE"/);
assert.doesNotMatch(`${activate}\n${deactivate}`, /MES_REACT_DIRECTORY_(COMPONENT_TYPES|NOMENCLATURE_TYPES|STATUSES)/);

console.log("Directory Operations React rollout operations QA passed.");
