import assert from "node:assert/strict";

import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const disabled = getPublicRuntimeConfig({});
assert.equal(disabled.MES_REACT_DIRECTORY_NOMENCLATURE_TYPES, false, "Directory Nomenclature Types rollout must be disabled by default");
assert.equal(disabled.MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION, false, "Directory Nomenclature Types evaluation must be disabled by default");

const enabled = getPublicRuntimeConfig({
  MES_REACT_DIRECTORY_NOMENCLATURE_TYPES: "1",
  MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert.equal(enabled.MES_REACT_DIRECTORY_NOMENCLATURE_TYPES, true, "explicit Nomenclature Types rollout must reach browser bootstrap");
assert.equal(enabled.MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION, true, "explicit Nomenclature Types evaluation must reach browser bootstrap");

const nonExact = getPublicRuntimeConfig({
  MES_REACT_DIRECTORY_NOMENCLATURE_TYPES: "true",
  MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION: "yes",
});
assert.equal(nonExact.MES_REACT_DIRECTORY_NOMENCLATURE_TYPES, false, "non-exact Nomenclature Types rollout must fail closed");
assert.equal(nonExact.MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION, false, "non-exact Nomenclature Types evaluation must fail closed");

const script = renderRuntimeConfigScript({
  MES_REACT_DIRECTORY_NOMENCLATURE_TYPES: "1",
  MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert.match(script, /"MES_REACT_DIRECTORY_NOMENCLATURE_TYPES":true/);
assert.match(script, /"MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION":true/);
assert.doesNotMatch(script, /must-not-leak/);

console.log("Directory Nomenclature Types React runtime policy QA passed.");
