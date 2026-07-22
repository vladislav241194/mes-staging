import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";
const repositoryRoot = join(import.meta.dirname, "..");
const retiredRendererPath = join(repositoryRoot, "src/modules/shift_master_board/render.js");
const retiredRendererIsAbsent = await access(retiredRendererPath).then(() => false, () => true);
const [policy, ledger, appSource, hostSource, scenarioSource, operationalRuntimeSource] = await Promise.all([
  readFile(join(repositoryRoot, "react-runtime-policy.json"), "utf8").then(JSON.parse),
  readFile(join(repositoryRoot, "experiments/react-migration/cutover-ledger.json"), "utf8").then(JSON.parse),
  readFile(join(repositoryRoot, "src/app.js"), "utf8"),
  readFile(join(repositoryRoot, "src/modules/shift_master_board/react_island_host.js"), "utf8"),
  readFile(join(repositoryRoot, "experiments/react-migration/src/modules/shift-master-board/ShiftMasterBoardScenario.tsx"), "utf8"),
  readFile(join(repositoryRoot, "src/modules/operational_runtime/service.js"), "utf8"),
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
assert.equal(retiredRendererIsAbsent, true, "retired Shift Master Board renderer must be physically absent");
assert.match(hostSource, /canFallbackToLegacy:\s*\(\)\s*=>\s*false/);
assert.doesNotMatch(hostSource, /requestLegacyRender/);
assert.doesNotMatch(hostSource, /runtimeMode[^\n]*"legacy"/,
  "fail-closed Shift Master Board target must never advertise a same-release legacy runtime");
assert.match(appSource, /createShiftMasterBoardCommandOwner/);
assert.doesNotMatch(appSource, /modules\/shift_master_board\/render\.js|initializeShiftMasterBoardModule|ensureShiftMasterBoardModule/,
  "current app must not retain the retired Shift Master Board renderer or loader");
assert.match(appSource, /function getShiftMasterBoardModel\(\) \{\s*return shiftMasterBoardCommandOwner\.getModel\(\);\s*\}/,
  "shared consumers must use the command-owner production model");
assert.match(appSource, /command\.type === "move-lane"[\s\S]*shiftMasterBoardCommandOwner\.execute/);
const routeSource = appSource.match(/shiftMasterBoard:\s*\{[\s\S]*?\n    shiftWorkOrders:\s*\{/)?.[0] || "";
assert.match(routeSource, /shiftMasterBoardReactIslandHost\.prepareRender\(\);\s*return shiftMasterBoardReactIslandHost\.renderTarget\(\)/,
  "current Shift Master Board route must always return its fail-closed React target");
assert.doesNotMatch(routeSource, /ensureShiftMasterBoardModule|renderShiftMasterBoardPage|renderShiftMasterBoardSheetModal|renderShiftMasterBoardActionModal|bindShiftMasterBoardEvents|isReactEligible/,
  "current Shift Master Board route must expose no same-release legacy UI edge");
assert.doesNotMatch(appSource.match(/const shiftMasterBoardReactIslandHost[\s\S]*?\n\}\);/)?.[0] || "", /requestLegacyRender/,
  "current Shift Master Board host wiring must expose no legacy-render bridge");
const scopeSource = appSource.match(/function getShiftExecutionDispatchScope\(\) \{[\s\S]*?\n\}/)?.[0] || "";
assert.doesNotMatch(scopeSource, /getShiftMasterBoardModel/);
const badgeSource = operationalRuntimeSource.match(/function getShiftMasterBoardUnassignedTaskCount\(\) \{[\s\S]*?\n\}/)?.[0] || "";
assert.match(badgeSource, /model\?\.allRows/,
  "sidebar badge must read the command-owner production model rows");
assert.match(badgeSource, /row\?\.boardLaneId === "intake"/,
  "sidebar badge must count intake rows from the production model");
assert.doesNotMatch(badgeSource, /model\?\.lanes|\.find\(\(lane\)/,
  "sidebar badge must not depend on the retired renderer lane projection");
assert.match(routeSource, /renderModals:\s*\(\)\s*=>\s*""/);
assert.match(routeSource, /bind:\s*\(\)\s*=>\s*\{\}/);
assert.match(scenarioSource, /type:\s*"move-lane"/);
assert.match(scenarioSource, /data-shift-master-board-lane-control/);
assert.doesNotMatch(scenarioSource, /onRequestLegacy/);
console.log("Shift Master Board permanent React runtime policy QA passed.");
