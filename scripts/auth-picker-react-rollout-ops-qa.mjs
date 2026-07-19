import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = await readFile(join(root, "ops/frontend/mes-pilot-react-auth-picker-evaluation.conf"), "utf8");
const activate = await readFile(join(root, "ops/frontend/activate-react-auth-picker-evaluation.sh"), "utf8");
const deactivate = await readFile(join(root, "ops/frontend/deactivate-react-auth-picker-evaluation.sh"), "utf8");
assert.match(config, /Environment=MES_REACT_AUTH_PICKER=1/);
assert.match(config, /Environment=MES_REACT_AUTH_PICKER_READ_ONLY_EVALUATION=1/);
assert.doesNotMatch(config, /WRITE|PIN/);
for (const [name, source] of [["activate", activate], ["deactivate", deactivate]]) {
  assert.match(source, /set -euo pipefail/, `${name} must fail closed`);
  assert.match(source, /EUID/, `${name} must require root`);
  assert.match(source, /88-react-auth-picker-evaluation\.conf/);
  assert.match(source, /systemctl daemon-reload/);
  assert.match(source, /systemctl restart/);
  assert.match(source, /"status":"ok"/);
  assert.match(source, /MES_REACT_AUTH_PICKER/);
  assert.match(source, /MES_REACT_AUTH_PICKER_READ_ONLY_EVALUATION/);
  assert.match(source, /restore_on_failure/);
}
assert.match(activate, /install -m 0644/);
assert.match(activate, /MES_DOMAIN_STORAGE=postgres/);
assert.match(deactivate, /rm -f "\$DROPIN_FILE"/);
assert.doesNotMatch(`${activate}\n${deactivate}`, /MES_REACT_(?:SYSTEM|STRUCTURE|ROLES|EMPLOYEE_DESKTOP|AUTH_PICKER_WRITE)/);
console.log("Authorization picker React rollout operations QA passed.");
