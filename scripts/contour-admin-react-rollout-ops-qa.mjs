import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const config = await readFile(join(root, "ops/frontend/mes-pilot-react-contour-admin-evaluation.conf"), "utf8");
const activate = await readFile(join(root, "ops/frontend/activate-react-contour-admin-evaluation.sh"), "utf8");
const deactivate = await readFile(join(root, "ops/frontend/deactivate-react-contour-admin-evaluation.sh"), "utf8");

assert.deepEqual(config.trim().split("\n"), [
  "[Service]",
  "Environment=MES_REACT_CONTOUR_ADMIN=1",
  "Environment=MES_REACT_CONTOUR_ADMIN_READ_ONLY_EVALUATION=1",
]);
assert.match(activate, /91-react-contour-admin-evaluation\.conf/);
assert.match(deactivate, /91-react-contour-admin-evaluation\.conf/);
assert.match(activate, /Host: admin\.mes-line\.ru/);
assert.match(activate, /<title>MES Admin<\/title>/);
assert.match(activate, /restore_on_failure/);
assert.match(deactivate, /restore_on_failure/);
assert.doesNotMatch(`${config}\n${activate}\n${deactivate}`, /contour-admin\/action|MES_REACT_CONTOUR_ADMIN_WRITE|MES_ALLOW_DESTRUCTIVE_ACTIONS/);

console.log("Contour Admin React rollout operations QA passed.");
