import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function assert(value, message) {
  if (!value) throw new Error(message);
}

const source = await readFile(resolve(process.cwd(), "scripts/release-activate.mjs"), "utf8");
const newlineWritePattern = /writeFile\(activePath, JSON\.stringify\(record, null, 2\) \+ "\\n"\);[\s\S]*?writeFile\(activationPath, JSON\.stringify\(record, null, 2\) \+ "\\n"\);/;
assert(newlineWritePattern.test(source), "activation records must end with a real JSON whitespace newline");
assert(!source.includes('JSON.stringify(record, null, 2) + "\\\\n"'), "activation records must not append literal backslash-n text after JSON");
assert(source.includes("schemaVersion: 2"), "new activation records must use schema 2");
assert(source.includes("legacyBaseline"), "activation records must pin and carry a legacy baseline");
assert(source.includes("pin-legacy-baseline"), "the first permanent cutover must require an explicit legacy-baseline pin");
assert(source.includes("runtimePolicy: runtimePolicyFromVerification(verification)"), "activation records must bind the verified runtime policy");
assert(source.includes("active_react_evaluation"), "permanent activation must reject an active React evaluation");
assert(source.includes("health?.reactRuntime?.sha256"), "activation health must verify the packaged runtime-policy digest");
assert(source.includes('fail_activation 1 "release_already_active"'), "activation must reject a candidate that is already active");
assert(source.includes('rm -f "$releases_path/active-release.json.next" "$release_path/activation.json.next"'), "failed record writes must remove uncommitted record files during rollback");
assert(source.includes('mv -f "$activation_record_backup_path" "$activation_record_path"'), "failed record commits must restore a prior candidate activation record");
assert(source.includes('previous_target" = "$release_app_target'), "same-release rejection must compare canonical runtime targets");
console.log("Release activation record QA: OK");
