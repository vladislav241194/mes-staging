import assert from "node:assert/strict";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";
const disabled = getPublicRuntimeConfig({}); assert.equal(disabled.MES_REACT_STRUCTURE_ORG_UNITS, false); assert.equal(disabled.MES_REACT_STRUCTURE_ORG_UNITS_READ_ONLY_EVALUATION, false);
const enabled = getPublicRuntimeConfig({ MES_REACT_STRUCTURE_ORG_UNITS: "1", MES_REACT_STRUCTURE_ORG_UNITS_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" }); assert.equal(enabled.MES_REACT_STRUCTURE_ORG_UNITS, true); assert.equal(enabled.MES_REACT_STRUCTURE_ORG_UNITS_READ_ONLY_EVALUATION, true);
const nonExact = getPublicRuntimeConfig({ MES_REACT_STRUCTURE_ORG_UNITS: "true", MES_REACT_STRUCTURE_ORG_UNITS_READ_ONLY_EVALUATION: "yes" }); assert.equal(nonExact.MES_REACT_STRUCTURE_ORG_UNITS, false); assert.equal(nonExact.MES_REACT_STRUCTURE_ORG_UNITS_READ_ONLY_EVALUATION, false);
const script = renderRuntimeConfigScript({ MES_REACT_STRUCTURE_ORG_UNITS: "1", MES_REACT_STRUCTURE_ORG_UNITS_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" }); assert.match(script, /"MES_REACT_STRUCTURE_ORG_UNITS":true/); assert.match(script, /"MES_REACT_STRUCTURE_ORG_UNITS_READ_ONLY_EVALUATION":true/); assert.doesNotMatch(script, /must-not-leak/);
console.log("Structure Org Units React runtime policy QA passed.");
