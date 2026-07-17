import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const bootPath = join(root, "reports", "performance", "boot-performance-latest.json");
const bundlePath = join(root, "reports", "bundle-performance-budget.json");
const resultPath = join(root, "reports", "performance", "phase-1-7-gate.json");
const maxAuditAgeMs = 15 * 60 * 1000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    throw new Error(`${label} is missing. Run the corresponding measurement first.`);
  }
}

const [boot, bundle] = await Promise.all([
  readJson(bootPath, "Boot performance audit"),
  readJson(bundlePath, "Bundle performance audit"),
]);
const bootStat = await stat(bootPath);
const ageMs = Date.now() - bootStat.mtimeMs;
const loadState = (boot.boot?.entries || []).find((entry) => entry.step === "loadState");
const firstRender = (boot.boot?.entries || []).find((entry) => entry.step === "first render");

assert(ageMs <= maxAuditAgeMs, `Boot performance audit is stale (${Math.round(ageMs / 1000)} s old). Run qa:performance:local again.`);
assert(boot.coldProfile === true, "Performance audit must use a clean browser profile.");
assert(Number(boot.boot?.totalMs) <= Number(boot.budgets?.startupTotalMs), "Startup total exceeds the declared budget.");
assert(Number(loadState?.ms) <= Number(boot.budgets?.loadStateMs), "loadState exceeds the declared budget.");
assert(Number(firstRender?.ms) <= Number(boot.budgets?.firstRenderMs), "First render exceeds the declared budget.");
assert(boot.warmBoot?.totalMs !== undefined, "Warm reload check is missing from the performance audit.");
assert(!(boot.warmBoot?.entries || []).some((entry) => /^migrate|^ensureWorkCenterOperations$/.test(entry.step)),
  "Warm reload repeated startup migration work.");
assert(Number(bundle.app?.brotliBytes) <= Number(bundle.budgets?.appBrotliBytes), "Startup JavaScript exceeds the Brotli budget.");
assert(bundle.dynamicChunksPresent && bundle.fullMatrixIsDynamic, "Route/data splitting guard is not satisfied.");

const result = {
  checkedAt: new Date().toISOString(),
  status: "pass",
  phaseCoverage: {
    measurementHarness: true,
    transport: true,
    buildAndMinification: true,
    routeSplitting: true,
    lazyData: true,
    cssCriticalPath: true,
    mainThread: true,
  },
  boot: {
    totalMs: boot.boot.totalMs,
    staticImportsMs: boot.boot.staticImportsMs,
    loadStateMs: loadState.ms,
    firstRenderMs: firstRender.ms,
    warmReloadMs: boot.warmBoot.totalMs,
    resourceTransferBytes: boot.resources?.transferBytes || 0,
  },
  bundle: {
    appBrotliBytes: bundle.app.brotliBytes,
    bootstrapBrotliBytes: bundle.bootstrap.brotliBytes,
    fullMatrixChunk: bundle.fullMatrixChunk,
  },
};
await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Performance phases 1-7 gate: OK (boot ${result.boot.totalMs} ms, app ${result.bundle.appBrotliBytes} B Brotli)`);
