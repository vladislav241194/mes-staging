import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = await readFile(join(root, "ops/frontend/mes-pilot-react-directory-component-types-evaluation.conf"), "utf8");
const activate = await readFile(join(root, "ops/frontend/activate-react-directory-component-types-evaluation.sh"), "utf8");
const deactivate = await readFile(join(root, "ops/frontend/deactivate-react-directory-component-types-evaluation.sh"), "utf8");

assert.match(config, /Environment=MES_REACT_DIRECTORY_COMPONENT_TYPES=1/);
assert.match(config, /Environment=MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION=1/);
assert.doesNotMatch(config, /WRITE/);

for (const [name, source] of [["activate", activate], ["deactivate", deactivate]]) {
  assert.match(source, /set -euo pipefail/, `${name} must fail closed`);
  assert.match(source, /EUID/, `${name} must require root`);
  assert.match(source, /76-react-directory-component-types-evaluation\.conf/, `${name} must own the isolated drop-in`);
  assert.match(source, /systemctl daemon-reload/);
  assert.match(source, /systemctl restart/);
  assert.match(source, /"status":"ok"/);
  assert.match(source, /MES_REACT_DIRECTORY_COMPONENT_TYPES/);
  assert.match(source, /MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION/);
  assert.match(source, /restore_on_failure/);
}

assert.match(activate, /install -m 0644/);
assert.match(deactivate, /rm -f "\$DROPIN_FILE"/);
assert.doesNotMatch(`${activate}\n${deactivate}`, /MES_REACT_DIRECTORY_(OPERATIONS|NOMENCLATURE_TYPES|STATUSES)/);

console.log("Directory Component Types React rollout operations QA passed.");
