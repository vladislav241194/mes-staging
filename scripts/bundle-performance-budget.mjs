import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { brotliCompress, constants as zlibConstants } from "node:zlib";
import { promisify } from "node:util";

const brotli = promisify(brotliCompress);
const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist", "src");
const reportPath = join(root, "reports", "bundle-performance-budget.json");
const appBudget = Number(process.env.MES_APP_BROTLI_BUDGET || 350_000);
const bootstrapBudget = Number(process.env.MES_BOOTSTRAP_BROTLI_BUDGET || 4_000);

async function compressedSize(path) {
  const source = await readFile(path);
  const compressed = await brotli(source, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } });
  return { rawBytes: source.length, brotliBytes: compressed.length };
}

async function existing(path) {
  try { await stat(path); return true; } catch { return false; }
}

const appPath = join(dist, "app.js");
const bootstrapPath = join(dist, "production_structure_default_work_centers.js");
if (!(await existing(appPath)) || !(await existing(bootstrapPath))) {
  throw new Error("Bundle budget requires a fresh dist build (app.js and compact production bootstrap)");
}
const [app, bootstrap, entries, chunkEntries] = await Promise.all([
  compressedSize(appPath),
  compressedSize(bootstrapPath),
  readdir(dist),
  readdir(join(dist, "chunks")),
]);
const appSource = await readFile(appPath, "utf-8");
const fullMatrixChunk = chunkEntries.find((entry) => /^production_structure_matrix_data-[\w-]+\.js$/.test(entry)) || "";
const compactStructureChunk = chunkEntries.find((entry) => /^production_structure_bootstrap_data-[\w-]+\.js$/.test(entry)) || "";
const planningWorkbenchLegacyChunk = (await Promise.all(chunkEntries
  .filter((entry) => /^render-[\w-]+\.js$/.test(entry))
  .map(async (entry) => ((await readFile(join(dist, "chunks", entry), "utf-8")).includes("createPlanningWorkbenchModule") ? entry : ""))))
  .find(Boolean) || "";
const ganttRuntimeChunk = (await Promise.all(chunkEntries
  .filter((entry) => /^render-[\w-]+\.js$/.test(entry))
  .map(async (entry) => ((await readFile(join(dist, "chunks", entry), "utf-8")).includes("createGanttRuntimeModule") ? entry : ""))))
  .find(Boolean) || "";
const result = {
  checkedAt: new Date().toISOString(),
  budgets: { appBrotliBytes: appBudget, bootstrapBrotliBytes: bootstrapBudget },
  app,
  bootstrap,
  dynamicChunksPresent: entries.some((entry) => entry.startsWith("chunks")),
  fullMatrixChunk,
  fullMatrixRetired: !fullMatrixChunk && !appSource.includes("production_structure_matrix_data"),
  compactStructureChunk,
  compactStructureIsDynamic: Boolean(compactStructureChunk) && appSource.includes(compactStructureChunk),
  planningWorkbenchLegacyChunk,
  planningWorkbenchLegacyRetired: !planningWorkbenchLegacyChunk,
  ganttRuntimeChunk,
  ganttRuntimeLegacyRetired: !ganttRuntimeChunk,
};
await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`);
if (app.brotliBytes > appBudget) throw new Error(`Startup app bundle is ${app.brotliBytes} B Brotli; budget is ${appBudget} B`);
if (bootstrap.brotliBytes > bootstrapBudget) throw new Error(`Compact production bootstrap is ${bootstrap.brotliBytes} B Brotli; budget is ${bootstrapBudget} B`);
if (!result.dynamicChunksPresent) throw new Error("No dynamic chunks were emitted; lazy module loading was lost");
if (!result.fullMatrixRetired) throw new Error("Full legacy production structure matrix returned to the browser build");
if (!result.compactStructureIsDynamic) throw new Error("Compact production structure projection lost its lazy chunk boundary");
if (!result.planningWorkbenchLegacyRetired) throw new Error("Retired Planning Workbench legacy renderer is still emitted");
if (!result.ganttRuntimeLegacyRetired) throw new Error("Retired Gantt legacy renderer is still emitted");
console.log(`Bundle performance budget: OK (app ${app.brotliBytes} B, bootstrap ${bootstrap.brotliBytes} B Brotli)`);
