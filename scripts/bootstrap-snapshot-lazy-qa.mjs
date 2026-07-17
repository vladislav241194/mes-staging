import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const appSource = await readFile(resolve(root, "src/app.js"), "utf8");
const runtimeSource = await readFile(resolve(root, "src/modules/runtime_state/service.js"), "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

// The bundled snapshot is a recovery asset, not startup data. Fetching it on
// every normal boot added a 24 KB request even when the domain API was healthy.
expect(
  !appSource.includes("ensureInitialBootstrapSnapshot();"),
  "app.js не должен заранее загружать bootstrap-snapshot при обычном запуске",
);
expect(
  runtimeSource.includes("if (snapshot.configured === false)")
    && runtimeSource.includes("await startBootstrapSnapshotBootstrap();"),
  "при отключённом shared state должен сохраниться recovery через bootstrap-snapshot",
);
expect(
  runtimeSource.includes("const restoredSnapshot = restoreBootstrapSnapshotIfCurrentPlanningEmpty(getBootstrapSnapshot());"),
  "при пустом shared state должен сохраниться recovery через bootstrap-snapshot",
);

if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}

console.log("bootstrap snapshot lazy-load QA passed");
