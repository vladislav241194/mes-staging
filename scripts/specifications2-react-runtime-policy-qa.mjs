import assert from "node:assert/strict";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const disabled = getPublicRuntimeConfig({});
assert.equal(disabled.MES_REACT_SPECIFICATIONS2, false);
assert.equal(disabled.MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION, false);
const enabled = getPublicRuntimeConfig({ MES_REACT_SPECIFICATIONS2: "1", MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION: "1", ADMIN_PASSWORD: "must-not-leak" });
assert.equal(enabled.MES_REACT_SPECIFICATIONS2, true);
assert.equal(enabled.MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION, true);
const script = renderRuntimeConfigScript({ MES_REACT_SPECIFICATIONS2: "1", MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION: "1", ADMIN_PASSWORD: "must-not-leak" });
assert.match(script, /"MES_REACT_SPECIFICATIONS2":true/);
assert.match(script, /"MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION":true/);
assert.doesNotMatch(script, /must-not-leak|ADMIN_PASSWORD/);
console.log("Specifications 2.0 React runtime policy QA: OK");
