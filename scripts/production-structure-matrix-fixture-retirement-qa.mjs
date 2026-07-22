import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  PRODUCTION_STRUCTURE_MATRIX_COLUMNS,
  PRODUCTION_STRUCTURE_MATRIX_ROWS,
} from "./fixtures/production_structure_matrix_data.js";
import {
  PRODUCTION_STRUCTURE_BOOTSTRAP_COLUMNS,
  PRODUCTION_STRUCTURE_BOOTSTRAP_ROWS,
} from "../src/production_structure_bootstrap_data.js";
import {
  migrateLegacySystemDomains,
  serializeSystemDomains,
} from "../src/modules/system_domains/service.js";

const root = process.cwd();
const retiredRuntimePath = join(root, "src", "production_structure_matrix_data.js");
await assert.rejects(
  () => access(retiredRuntimePath),
  (error) => error?.code === "ENOENT",
  "The full legacy matrix must stay outside active frontend source",
);

const appSource = await readFile(join(root, "src", "app.js"), "utf8");
assert.doesNotMatch(appSource, /production_structure_matrix_data/, "Application runtime must not reference the full matrix fixture");
assert.match(appSource, /import\("\.\/production_structure_bootstrap_data\.js"\)/, "React diagnostics must load the compact projection");

assert.equal(PRODUCTION_STRUCTURE_MATRIX_ROWS.length, PRODUCTION_STRUCTURE_BOOTSTRAP_ROWS.length, "Compact diagnostics must retain every source row");
assert.equal(PRODUCTION_STRUCTURE_MATRIX_COLUMNS.length, PRODUCTION_STRUCTURE_BOOTSTRAP_COLUMNS.length, "Compact diagnostics must retain the authoritative source field count");
assert.deepEqual(PRODUCTION_STRUCTURE_BOOTSTRAP_COLUMNS, PRODUCTION_STRUCTURE_MATRIX_COLUMNS, "Compact diagnostics columns must preserve source order");

const diagnosticKeys = ["ID / код", "Тип строки", "Структура", "Родитель", "Активность строки", "Статус активности"];
for (let index = 0; index < PRODUCTION_STRUCTURE_MATRIX_ROWS.length; index += 1) {
  for (const key of diagnosticKeys) {
    assert.equal(
      String(PRODUCTION_STRUCTURE_BOOTSTRAP_ROWS[index]?.cells?.[key] ?? ""),
      String(PRODUCTION_STRUCTURE_MATRIX_ROWS[index]?.cells?.[key] ?? ""),
      `Compact diagnostics changed ${key} for source row ${index + 1}`,
    );
  }
}

const migratedAt = "2026-07-22T00:00:00.000Z";
const fullMigration = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS, migratedAt });
const compactMigration = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_BOOTSTRAP_ROWS, migratedAt });
assert.equal(
  serializeSystemDomains(compactMigration.domains),
  serializeSystemDomains(fullMigration.domains),
  "Compact projection must produce the exact canonical System Domains document",
);
assert.deepEqual(compactMigration.report, fullMigration.report, "Compact projection must preserve the exact migration report");

const chunkDir = join(root, "dist", "src", "chunks");
const chunkEntries = await readdir(chunkDir).catch(() => []);
assert.equal(chunkEntries.some((entry) => entry.startsWith("production_structure_matrix_data-")), false, "Build must not emit a full legacy matrix chunk");
assert.equal(chunkEntries.some((entry) => entry.startsWith("production_structure_bootstrap_data-")), true, "Build must emit the compact diagnostics boundary");

console.log("Production Structure matrix fixture retirement QA: OK");
console.log(`- active frontend removed 9,217 full-matrix lines; parity ${PRODUCTION_STRUCTURE_BOOTSTRAP_ROWS.length} rows + ${PRODUCTION_STRUCTURE_BOOTSTRAP_COLUMNS.length}-column schema + ${diagnosticKeys.length} diagnostics fields`);
