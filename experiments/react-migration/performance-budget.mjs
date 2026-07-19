import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const labRoot = dirname(fileURLToPath(import.meta.url));
const sourceRoot = join(labRoot, "src");

async function measureEntry(entry, budget) {
  const result = await build({
    entryPoints: [join(sourceRoot, entry)],
    bundle: true,
    format: "esm",
    jsx: "automatic",
    minify: true,
    target: "es2020",
    treeShaking: true,
    write: false,
  });
  const bytes = result.outputFiles[0].contents;
  const measurement = { raw: bytes.length, gzip: gzipSync(bytes).length };
  assert.ok(measurement.raw <= budget.raw, `${entry} raw bundle ${measurement.raw} exceeds ${budget.raw}`);
  assert.ok(measurement.gzip <= budget.gzip, `${entry} gzip bundle ${measurement.gzip} exceeds ${budget.gzip}`);
  return { bytes, measurement };
}

const nomenclature = await measureEntry("nomenclature-island.tsx", { raw: 225_000, gzip: 68_000 });
const boards = await measureEntry("boards-island.tsx", { raw: 225_000, gzip: 68_000 });
const structureEmployees = await measureEntry("structure-employees-island.tsx", { raw: 225_000, gzip: 68_000 });
const roles = await measureEntry("roles-island.tsx", { raw: 225_000, gzip: 68_000 });
const lab = await measureEntry("main.tsx", { raw: 280_000, gzip: 85_000 });
const nomenclatureText = new TextDecoder().decode(nomenclature.bytes);
assert.doesNotMatch(nomenclatureText, /Типы компонентов/, "Nomenclature production island must not bundle the Component Types scenario");
const boardsText = new TextDecoder().decode(boards.bytes);
assert.doesNotMatch(boardsText, /Вся номенклатура|Типы компонентов/, "Boards production island must not bundle unrelated scenarios");
const structureEmployeesText = new TextDecoder().decode(structureEmployees.bytes);
assert.doesNotMatch(structureEmployeesText, /Вся номенклатура|Типы компонентов|Подсчет импортированных компонентов/, "Structure Employees production island must not bundle unrelated scenarios");
const rolesText = new TextDecoder().decode(roles.bytes);
assert.doesNotMatch(rolesText, /Вся номенклатура|Типы компонентов|Подсчет импортированных компонентов/, "Roles production island must not bundle unrelated scenarios");

const css = await readFile(join(sourceRoot, "styles.css"));
const cssMeasurement = { raw: css.length, gzip: gzipSync(css).length };
assert.ok(cssMeasurement.raw <= 6_500, `styles raw bundle ${cssMeasurement.raw} exceeds 6500`);
assert.ok(cssMeasurement.gzip <= 2_100, `styles gzip bundle ${cssMeasurement.gzip} exceeds 2100`);

console.log(JSON.stringify({
  nomenclature: nomenclature.measurement,
  boards: boards.measurement,
  structureEmployees: structureEmployees.measurement,
  roles: roles.measurement,
  fullLab: lab.measurement,
  styles: cssMeasurement,
}));
