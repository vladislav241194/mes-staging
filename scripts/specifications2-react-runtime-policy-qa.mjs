import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const refreshSource = appSource.match(/async function refreshSpecifications2PublishedRevision\(sourceEntryId,[\s\S]*?\n\}/)?.[0] || "";
const hydrationSource = appSource.match(/function hydrateSpecifications2PublishedRevision\(entry\) \{[\s\S]*?\n\}/)?.[0] || "";
assert.match(refreshSource, /completionChangesEligibility/);
assert.match(refreshSource, /refreshBySource\?\.\(normalizedSourceEntryId, \{ force \}\)/);
assert.match(refreshSource, /result\.changed \|\| completionChangesEligibility/);
assert.match(hydrationSource, /refreshSpecifications2PublishedRevision\(entry\.id\)/);
assert.match(appSource, /refreshSpecifications2PublishedRevision\(entryId, \{ force: true \}\)/);
console.log("Specifications 2.0 React runtime policy QA: OK");
