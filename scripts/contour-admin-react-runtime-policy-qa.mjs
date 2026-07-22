import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";
const disabled = getPublicRuntimeConfig({});
assert.equal(disabled.MES_REACT_CONTOUR_ADMIN, false);
assert.equal(disabled.MES_REACT_CONTOUR_ADMIN_READ_ONLY_EVALUATION, false);
const enabled = getPublicRuntimeConfig({ MES_REACT_CONTOUR_ADMIN: "1", MES_REACT_CONTOUR_ADMIN_READ_ONLY_EVALUATION: "1", ADMIN_PASSWORD: "must-not-leak" });
assert.equal(enabled.MES_REACT_CONTOUR_ADMIN, true);
assert.equal(enabled.MES_REACT_CONTOUR_ADMIN_READ_ONLY_EVALUATION, true);
const script = renderRuntimeConfigScript({ MES_REACT_CONTOUR_ADMIN: "1", MES_REACT_CONTOUR_ADMIN_READ_ONLY_EVALUATION: "1", ADMIN_PASSWORD: "must-not-leak" });
assert.match(script, /"MES_REACT_CONTOUR_ADMIN":true/);
assert.match(script, /"MES_REACT_CONTOUR_ADMIN_READ_ONLY_EVALUATION":true/);
assert.doesNotMatch(script, /must-not-leak/);
const [app, host, owner, scenario] = await Promise.all([
  readFile("src/app.js", "utf8"),
  readFile("src/modules/contour_admin/react_island_host.js", "utf8"),
  readFile("src/modules/contour_admin/render.js", "utf8"),
  readFile("experiments/react-migration/src/modules/contour-admin/ContourAdminScenario.tsx", "utf8"),
]);
assert.match(app, /react-contour-admin-write/);
assert.match(app, /surfaceId: "contourAdmin"/);
assert.match(app, /activation\.accessMode === "react" \|\| getContourAdminReactLocalQaOverrides\(\)\.writeEvaluation/);
assert.match(app, /command\.confirmed !== true/);
assert.match(app, /\[scenario\.actionId, scenario\.precheckActionId\]/);
assert.match(host, /write-evaluation/);
assert.match(host, /canFallbackToLegacy: \(activation\) => activation\.accessMode !== "react"/);
assert.match(host, /if \(activation\.accessMode === "react"\) return ""/);
assert.match(host, /executeCommand/);
assert.match(owner, /async function executeContourAdminAction/);
assert.match(owner, /fetch\("\/api\/contour-admin\/action"/);
assert.doesNotMatch(scenario, /fetch\(|\/api\/contour-admin\/action|backup-shared-state\.mjs|promote-contour\.mjs/);
assert.doesNotMatch(scenario, /onRequestLegacy\?\./);
assert.match(scenario, /data-contour-admin-confirm-execute/);
console.log("Contour Admin React runtime policy QA passed.");
