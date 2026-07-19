import assert from "node:assert/strict";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";
const disabled = getPublicRuntimeConfig({}); assert.equal(disabled.MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS, false); assert.equal(disabled.MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS_READ_ONLY_EVALUATION, false);
const enabled = getPublicRuntimeConfig({ MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS: "1", MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" }); assert.equal(enabled.MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS, true); assert.equal(enabled.MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS_READ_ONLY_EVALUATION, true);
const script = renderRuntimeConfigScript({ MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS: "1", MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" }); assert.match(script, /"MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS":true/); assert.doesNotMatch(script, /must-not-leak/);
console.log("Structure Migration Diagnostics React runtime policy QA passed.");
