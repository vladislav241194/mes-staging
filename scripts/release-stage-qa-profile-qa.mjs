import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  listReleaseQaProfileIds,
  resolveReleaseQaProfile,
} from "./release-stage-qa-profile.mjs";

assert.deepEqual(listReleaseQaProfileIds(), ["standard", "accelerated"]);

const standard = resolveReleaseQaProfile();
assert.equal(standard.id, "standard");
assert.deepEqual(standard.workspaceSteps, [
  { command: "npm", args: ["run", "qa:stabilize"] },
]);
assert.equal(standard.verifyBuiltRuntimePolicy, false);

const accelerated = resolveReleaseQaProfile("accelerated");
assert.equal(accelerated.id, "accelerated");
assert.deepEqual(accelerated.workspaceSteps, [
  { command: "npm", args: ["run", "qa:syntax"] },
  { command: "npm", args: ["run", "typecheck:react"] },
  { command: "npm", args: ["run", "qa:react-cutover"] },
  { command: "npm", args: ["run", "qa:react-runtime-policy"] },
  { command: "git", args: ["diff", "--check"] },
]);
assert.equal(accelerated.verifyBuiltRuntimePolicy, true);

assert.throws(
  () => resolveReleaseQaProfile("visual"),
  /Unknown release QA profile: visual\. Expected one of: standard, accelerated/,
);

const stageSource = await readFile(new URL("./release-stage.mjs", import.meta.url), "utf8");
assert.match(stageSource, /qa-profile/);
assert.match(stageSource, /resolveReleaseQaProfile\(args\.qaProfile\)/);
assert.match(stageSource, /qaProfile\.workspaceSteps/);
assert.match(stageSource, /qaProfile\.verifyBuiltRuntimePolicy/);
assert.match(stageSource, /--require-dist/);
assert.match(stageSource, /buildPilotReleaseSealCommand/);
assert.match(stageSource, /buildPilotReleaseTrustVerificationCommand/);
assert.match(stageSource, /server:preflight/);
assert.match(stageSource, /two dist digests differ/);

console.log("Release stage QA profiles: OK");
