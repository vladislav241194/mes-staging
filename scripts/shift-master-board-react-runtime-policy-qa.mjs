import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";
const repositoryRoot = join(import.meta.dirname, "..");
const [policy, ledger, appSource, hostSource, scenarioSource] = await Promise.all([
  readFile(join(repositoryRoot, "react-runtime-policy.json"), "utf8").then(JSON.parse),
  readFile(join(repositoryRoot, "experiments/react-migration/cutover-ledger.json"), "utf8").then(JSON.parse),
  readFile(join(repositoryRoot, "src/app.js"), "utf8"),
  readFile(join(repositoryRoot, "src/modules/shift_master_board/react_island_host.js"), "utf8"),
  readFile(join(repositoryRoot, "experiments/react-migration/src/modules/shift-master-board/ShiftMasterBoardScenario.tsx"), "utf8"),
]);
const disabled = getPublicRuntimeConfig({});
assert.equal(disabled.MES_REACT_SHIFT_MASTER_BOARD, false);
assert.equal(disabled.MES_REACT_SHIFT_MASTER_BOARD_READ_ONLY_EVALUATION, false);
const enabled = getPublicRuntimeConfig({ MES_REACT_SHIFT_MASTER_BOARD: "1", MES_REACT_SHIFT_MASTER_BOARD_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" });
assert.equal(enabled.MES_REACT_SHIFT_MASTER_BOARD, true);
assert.equal(enabled.MES_REACT_SHIFT_MASTER_BOARD_READ_ONLY_EVALUATION, true);
const script = renderRuntimeConfigScript({ MES_REACT_SHIFT_MASTER_BOARD: "1", MES_REACT_SHIFT_MASTER_BOARD_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" });
assert.match(script, /"MES_REACT_SHIFT_MASTER_BOARD":true/);
assert.match(script, /"MES_REACT_SHIFT_MASTER_BOARD_READ_ONLY_EVALUATION":true/);
assert.doesNotMatch(script, /must-not-leak/);
assert.equal(policy.surfaces.shiftMasterBoard, "react", "Shift Master Board normal route must be signed permanent React");
const island = ledger.islands.find((entry) => entry.id === "shiftMasterBoard");
const module = ledger.modules.find((entry) => entry.id === "shiftMasterBoard");
assert.equal(island?.normalActionFallback, false);
assert.deepEqual(island?.commands?.missing, []);
assert(island?.commands?.implemented.includes("manual-lane-move"));
assert.equal(module?.runtimeMode, "react");
assert.equal(module?.visibleLegacyRendererPath, false);
assert.equal(module?.runtimeLegacyModelDependency, false, "permanent Shift Master Board must use the typed production model");
assert.equal(module?.normalLegacyPath, false);
assert.match(hostSource, /canFallbackToLegacy:\s*\(activation\)\s*=>\s*activation\.accessMode !== "react"/);
assert.match(appSource, /createShiftMasterBoardCommandOwner/);
assert.match(appSource, /command\.type === "move-lane"[\s\S]*shiftMasterBoardCommandOwner\.execute/);
assert.match(appSource, /shiftMasterBoard:\s*\{[\s\S]*shiftMasterBoardReactIslandHost\.prepareRender\(\)[\s\S]*if \(reactDecision\.activateReact\)[\s\S]*ensureShiftMasterBoardModule\(\)/, "legacy renderer must load only after React rejection");
const scopeSource = appSource.match(/function getShiftExecutionDispatchScope\(\) \{[\s\S]*?\n\}/)?.[0] || "";
assert.doesNotMatch(scopeSource, /getShiftMasterBoardModel/);
assert.match(appSource, /renderModals:\s*\(\)\s*=>\s*shiftMasterBoardReactIslandHost\.isReactEligible\(\)[\s\S]*\? ""/);
assert.match(scenarioSource, /type:\s*"move-lane"/);
assert.match(scenarioSource, /data-shift-master-board-lane-control/);
assert.doesNotMatch(scenarioSource, /onRequestLegacy/);
console.log("Shift Master Board permanent React runtime policy QA passed.");
