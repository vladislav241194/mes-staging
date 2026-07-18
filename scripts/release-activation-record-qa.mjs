import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function assert(value, message) {
  if (!value) throw new Error(message);
}

const source = await readFile(resolve(process.cwd(), "scripts/release-activate.mjs"), "utf8");
const newlineWritePattern = /writeFile\(activePath, JSON\.stringify\(record, null, 2\) \+ "\\n"\);[\s\S]*?writeFile\(activationPath, JSON\.stringify\(record, null, 2\) \+ "\\n"\);/;
assert(newlineWritePattern.test(source), "activation records must end with a real JSON whitespace newline");
assert(!source.includes('JSON.stringify(record, null, 2) + "\\\\n"'), "activation records must not append literal backslash-n text after JSON");
console.log("Release activation record QA: OK");
