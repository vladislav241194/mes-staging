import { readFile } from "node:fs/promises";

function assert(value, message) { if (!value) throw new Error(message); }
const source = await readFile(new URL("./release-rollback.mjs", import.meta.url), "utf8");
const packageSource = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

assert(source.includes('record?.previous') && source.includes('["release-pointer", "legacy-directory"]'), "Rollback must require an activation record with an explicit previous runtime kind");
assert(source.includes("startsWith(`${contour.releasesPath}/`)") && source.includes("legacy-app-pre-"), "Rollback must reject previous targets outside the contour release directory");
assert(source.includes('actual_current') && source.includes('Active runtime does not match active-release.json'), "Rollback must bind the active symlink to the recorded release before switching it");
assert(source.includes("release-verify.mjs") && source.includes("--expected-release-id"), "Rollback must verify a previous commit-derived release before activating it");
assert(source.includes("restore_current") && source.includes("trap 'code=$?; restore_current"), "A failed rollback must restore the current release pointer");
assert(source.includes('check_health "http://localhost:$port/healthz"') && source.includes('check_health "$public_health_url"'), "Rollback must pass local and public health checks");
assert(source.includes("rollback-$timestamp.json") && source.includes("active-release.json.next"), "Rollback must write an audit record and atomically replace the active release record");
assert(packageSource.scripts?.["release:rollback:pilot"]?.includes("release-rollback.mjs --contour=pilot"), "Package scripts must expose pilot release rollback");
assert(packageSource.scripts?.["release:rollback:staging"]?.includes("release-rollback.mjs --contour=staging"), "Package scripts must expose staging release rollback");
console.log("Release rollback QA: OK");
