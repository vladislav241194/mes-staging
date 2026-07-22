import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const result = await build({
  entryPoints: { app: join(root, "src/app.js") },
  outdir: join(root, ".employee-desktop-command-owner-lazy-qa"),
  bundle: true,
  splitting: true,
  format: "esm",
  target: "es2020",
  write: false,
  metafile: true,
  logLevel: "silent",
});

const outputs = Object.values(result.metafile.outputs);
const appOutput = outputs.find((output) => String(output.entryPoint || "").endsWith("src/app.js"));
const ownerInput = Object.keys(result.metafile.inputs)
  .find((input) => input.endsWith("src/modules/employee_desktop/command_owner.js"));
const ownerOutput = outputs.find((output) => String(output.entryPoint || "").endsWith("src/modules/employee_desktop/command_owner.js"));

assert(appOutput, "app entry output must be present in the bundle graph");
assert(ownerInput, "Employee Desktop command owner must remain available as a source module");
assert.equal(Boolean(appOutput.inputs?.[ownerInput]), false, "Employee Desktop command owner must not be part of the startup app output");
assert(ownerOutput, "Employee Desktop command owner must be emitted as a lazy command chunk");

console.log("Employee Desktop command owner lazy import graph QA passed.");
