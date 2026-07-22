import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runtimePath = join(root, "src/modules/products/compatibility_runtime.js");
const actionPath = join(root, "src/modules/products/boards_xlsx_import_action.js");
const [runtimeSource, actionSource, appSource] = await Promise.all([
  readFile(runtimePath, "utf8"),
  readFile(actionPath, "utf8"),
  readFile(join(root, "src/app.js"), "utf8"),
]);

assert.doesNotMatch(
  runtimeSource,
  /^import[^\n]*boards_xlsx_import_action\.js/m,
  "Legacy Boards XLSX action must not remain a static Products compatibility runtime import",
);
const importFunctionStart = runtimeSource.indexOf("async function importBomFromXlsxFile");
const importFunctionEnd = runtimeSource.indexOf("function getResourcesForWorkCenter", importFunctionStart);
const importFunctionSource = runtimeSource.slice(importFunctionStart, importFunctionEnd);
assert(importFunctionStart >= 0 && importFunctionEnd > importFunctionStart, "Legacy Boards XLSX action boundary must remain discoverable");
assert(
  runtimeSource.includes('loadBoardsXlsxImportAction = () => import("./boards_xlsx_import_action.js")'),
  "Legacy Boards XLSX action must retain a lazy default loader",
);
assert(
  importFunctionSource.includes("await loadBoardsXlsxImportAction()"),
  "Legacy Boards XLSX action must load only through the injected lazy boundary",
);
assert(
  importFunctionSource.indexOf("isLegacyDirectoryWriteBlocked()") < importFunctionSource.indexOf("await loadBoardsXlsxImportAction()"),
  "Read-only legacy Boards must fail before loading the XLSX action chunk",
);
for (const parserToken of ["xl/workbook.xml", "readZipEntries", "DecompressionStream", "parseWorksheetMatrix"]) {
  assert.equal(runtimeSource.includes(parserToken), false, `Products compatibility runtime must not retain XLSX parser token: ${parserToken}`);
  assert.equal(actionSource.includes(parserToken), true, `Lazy XLSX action must own parser token: ${parserToken}`);
}
assert(appSource.includes("bomImport: false"), "Permanent React Boards must keep XLSX import disabled");
assert(appSource.includes('code: "deferred-import"'), "Permanent React Boards must keep the explicit deferred XLSX response");

const result = await build({
  entryPoints: { products: runtimePath },
  outdir: join(root, ".products-xlsx-import-lazy-qa"),
  bundle: true,
  splitting: true,
  format: "esm",
  target: "es2020",
  write: false,
  metafile: true,
  logLevel: "silent",
});
const outputs = Object.values(result.metafile.outputs);
const runtimeOutput = outputs.find((output) => String(output.entryPoint || "").endsWith("src/modules/products/compatibility_runtime.js"));
const actionInput = Object.keys(result.metafile.inputs)
  .find((input) => input.endsWith("src/modules/products/boards_xlsx_import_action.js"));
const actionOutput = outputs.find((output) => String(output.entryPoint || "").endsWith("src/modules/products/boards_xlsx_import_action.js"));

assert(runtimeOutput, "Products compatibility runtime entry output must be present in the bundle graph");
assert(actionInput, "Legacy Boards XLSX action must remain available as a lazy source module");
assert.equal(Boolean(runtimeOutput.inputs?.[actionInput]), false, "XLSX parser/action must not be part of the Products compatibility runtime entry chunk");
assert(actionOutput, "Legacy Boards XLSX parser/action must be emitted as a dynamic action chunk");

console.log("Products legacy Boards XLSX action lazy import graph QA passed");
