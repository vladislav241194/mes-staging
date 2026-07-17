import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const bootPath = join(root, "reports", "performance", "boot-performance-latest.json");
const reportPath = join(root, "reports", "performance", "asset-lazy-load-gate.json");
const protectedPaths = [
  "production-floor-plan.svg",
  "/src/icons/registry.js",
  "/src/icons/runtime_custom_svg_registry.js",
  "/src/production_structure_matrix_data.js",
];
// This gate intentionally runs against the built dist preview. It prevents a
// regression to the former source-style waterfall (91 initial resources / ~
// 610 KB) even if every individual asset still appears valid in isolation.
const maxInitialResourceCount = 20;
const maxInitialTransferBytes = 150 * 1024;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const audit = JSON.parse(await readFile(bootPath, "utf-8"));
const entries = Array.isArray(audit.resources?.entries) ? audit.resources.entries : [];
assert(entries.length > 0, "Boot audit does not include a network waterfall. Run qa:performance:local again.");
const loadedProtectedAssets = entries.filter((entry) => protectedPaths.some((path) => entry.path.endsWith(path)));
assert(loadedProtectedAssets.length === 0,
  `Heavy assets were loaded on the initial route: ${loadedProtectedAssets.map((entry) => entry.path).join(", ")}`);
assert(entries.length <= maxInitialResourceCount,
  `Initial route loaded ${entries.length} resources, exceeding the ${maxInitialResourceCount}-resource waterfall budget.`);
assert(Number(audit.resources?.transferBytes || 0) <= maxInitialTransferBytes,
  `Initial route transferred ${audit.resources?.transferBytes || 0} B, exceeding the ${maxInitialTransferBytes} B budget.`);

const result = {
  checkedAt: new Date().toISOString(),
  initialRoute: audit.url,
  resourceCount: entries.length,
  transferBytes: audit.resources?.transferBytes || 0,
  protectedPaths,
  budgets: { maxInitialResourceCount, maxInitialTransferBytes },
  loadedProtectedAssets,
  status: "pass",
};
await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Asset lazy-load gate: OK (${result.resourceCount} resources; no floor plan, custom production SVG registry, full icon registry or full matrix on initial route)`);
