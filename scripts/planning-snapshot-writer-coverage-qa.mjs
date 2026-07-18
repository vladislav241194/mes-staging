import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));

function assert(value, message) {
  if (!value) throw new Error(message);
}

function assertOrdered(source, label, fragments) {
  let cursor = -1;
  for (const fragment of fragments) {
    const index = source.indexOf(fragment, cursor + 1);
    assert(index >= 0, `${label}: missing ${JSON.stringify(fragment)}`);
    assert(index > cursor, `${label}: ${JSON.stringify(fragment)} must follow the preceding lifecycle step`);
    cursor = index;
  }
}

async function source(name) {
  return readFile(join(scriptsDir, name), "utf-8");
}

const endpoint = await source("shared-state-endpoint.mjs");
const genericStart = endpoint.indexOf("const planningObservation = await beginPlanningSnapshotObservation({");
const genericEnd = endpoint.indexOf("return { ok: true, configured: true, snapshot, planningObservation: planningObservationResult };");
assert(genericStart >= 0 && genericEnd > genericStart, "Shared-state endpoint generic writer lifecycle must be present");
const generic = endpoint.slice(genericStart, genericEnd);
assertOrdered(generic, "Shared-state endpoint generic writer", [
  "const planningObservation = await beginPlanningSnapshotObservation({",
  "await store.write(snapshot);",
  "const planningObservationResult = await recordPlanningSnapshotObservation({",
]);

const browserStart = endpoint.indexOf("const planningObservationSource = `browser-shared-state:${action}`;");
const browserEnd = endpoint.indexOf("await appendSharedStateAudit({", browserStart);
assert(browserStart >= 0 && browserEnd > browserStart, "Shared-state endpoint browser writer lifecycle must be present");
const browser = endpoint.slice(browserStart, browserEnd);
assertOrdered(browser, "Shared-state endpoint browser writer", [
  "const planningObservation = await beginPlanningSnapshotObservation({",
  "await store.write(snapshot);",
  "const planningObservationResult = await recordPlanningSnapshotObservation({",
]);

const restore = await source("restore-shared-state.mjs");
assert(restore.includes("withSharedStateFileLock(paths.filePath"), "Restore must serialize with normal shared-state writers");
assertOrdered(restore, "Shared-state restore", [
  "const observation = await beginPlanningSnapshotObservation({",
  "await copyFile(backupPath, paths.filePath);",
  "planningObservation = await recordPlanningSnapshotObservation({",
]);
assert(restore.includes("resolvePlanningSnapshotObservationEnvironment"), "Restore must resolve the target-pilot guard environment");

const sync = await source("sync-shared-state-contours.mjs");
assert(sync.includes("withSharedStateFileLock(targetConfig.filePath"), "Stage-to-pilot sync must serialize with normal shared-state writers");
assertOrdered(sync, "Stage-to-pilot sync", [
  "const observation = await beginPlanningSnapshotObservation({",
  "await writeJsonAtomic(targetConfig.filePath, targetSnapshot);",
  "const recorded = await recordPlanningSnapshotObservation({",
]);
assert(sync.includes("resolvePlanningSnapshotObservationEnvironment"), "Stage-to-pilot sync must resolve a target-pilot guard environment");

const seed = await source("specifications2-pilot-chain-seed.mjs");
assert(seed.includes("withSharedStateFileLock(statePath"), "Specifications 2.0 pilot-chain seed must serialize with normal shared-state writers");
assertOrdered(seed, "Specifications 2.0 pilot-chain seed", [
  "const observation = await beginPlanningSnapshotObservation({",
  "await rename(temporaryPath, statePath);",
  "planningObservation = await recordPlanningSnapshotObservation({",
]);
assert(seed.includes("resolvePlanningSnapshotObservationEnvironment"), "Specifications 2.0 pilot-chain seed must resolve the target-pilot guard environment");

console.log("Planning snapshot managed-writer coverage QA: OK");
