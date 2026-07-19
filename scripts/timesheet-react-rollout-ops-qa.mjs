import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = await readFile(join(root, "ops/frontend/mes-pilot-react-timesheet-evaluation.conf"), "utf8");
const activate = await readFile(join(root, "ops/frontend/activate-react-timesheet-evaluation.sh"), "utf8");
const deactivate = await readFile(join(root, "ops/frontend/deactivate-react-timesheet-evaluation.sh"), "utf8");
assert.match(config, /Environment=MES_REACT_TIMESHEET=1/); assert.match(config, /Environment=MES_REACT_TIMESHEET_READ_ONLY_EVALUATION=1/); assert.doesNotMatch(config, /WRITE/);
for (const source of [activate, deactivate]) { assert.match(source, /set -euo pipefail/); assert.match(source, /EUID/); assert.match(source, /85-react-timesheet-evaluation\.conf/); assert.match(source, /systemctl daemon-reload/); assert.match(source, /systemctl restart/); assert.match(source, /"status":"ok"/); assert.match(source, /MES_REACT_TIMESHEET/); assert.match(source, /restore_on_failure/); }
assert.match(activate, /install -m 0644/); assert.match(deactivate, /rm -f "\$DROPIN_FILE"/); assert.doesNotMatch(`${activate}\n${deactivate}`, /MES_REACT_(?:DIRECTORY|STRUCTURE|ROLES|PLANNING)_/);
console.log("Timesheet React rollout operations QA passed.");
