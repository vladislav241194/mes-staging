import assert from "node:assert/strict";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const disabled = getPublicRuntimeConfig({});
assert.equal(disabled.MES_REACT_DIRECTORY_STATUSES, false);
assert.equal(disabled.MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION, false);
const enabled = getPublicRuntimeConfig({ MES_REACT_DIRECTORY_STATUSES: "1", MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" });
assert.equal(enabled.MES_REACT_DIRECTORY_STATUSES, true);
assert.equal(enabled.MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION, true);
const nonExact = getPublicRuntimeConfig({ MES_REACT_DIRECTORY_STATUSES: "true", MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION: "yes" });
assert.equal(nonExact.MES_REACT_DIRECTORY_STATUSES, false);
assert.equal(nonExact.MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION, false);
const script = renderRuntimeConfigScript({ MES_REACT_DIRECTORY_STATUSES: "1", MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" });
assert.match(script, /"MES_REACT_DIRECTORY_STATUSES":true/);
assert.match(script, /"MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION":true/);
assert.doesNotMatch(script, /must-not-leak/);
console.log("Directory Statuses React runtime policy QA passed.");
