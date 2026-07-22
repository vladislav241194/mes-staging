import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const [scenario, adapter, readModel, domainApi] = await Promise.all([
  readFile(new URL("../experiments/react-migration/src/modules/planning-workbench/PlanningWorkbenchScenario.tsx", import.meta.url), "utf8"),
  readFile(new URL("../experiments/react-migration/src/modules/planning-workbench/adapter.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/domain_api/work_orders_read_model.js", import.meta.url), "utf8"),
  readFile(new URL("./domain-api.mjs", import.meta.url), "utf8"),
]);

assert.match(scenario, /type: "change-labor"; routeId: string; operationId: string; labor: PlanningWorkbenchLaborSetting; expectedRevision: number/);
assert.match(scenario, /type: "transfer-to-gantt"; routeId: string; expectedRevision: number/);
assert.match(scenario, /type: "cancel"; routeId: string; expectedRevision: number/);
assert.match(scenario, /data-react-planning-labor-form/);
assert.match(scenario, /disabled=\{!model\.canEditLabor/);
assert.match(scenario, /disabled=\{!model\.canTransferToGantt/);
assert.match(scenario, /disabled=\{!model\.canCancel/);
assert.match(scenario, /не вызывают legacy-код/);
assert.doesNotMatch(scenario, /planning_routes\/service|schedulePlanningRouteToGantt|cancelPlanningRoute|setPlanningOrderLaborSetting/);

assert.match(adapter, /canEditLabor: capabilities\.laborEdit === true/);
assert.match(adapter, /canTransferToGantt: capabilities\.transferToGantt === true/);
assert.match(adapter, /canCancel: capabilities\.cancel === true/);
assert.match(adapter, /Нет PostgreSQL owner\/API\/capability для изменения трудозатрат/);
assert.match(adapter, /Нет PostgreSQL owner\/API\/capability для первичного размещения/);
assert.match(adapter, /Нет PostgreSQL owner\/API\/capability для отмены/);

const readModelExports = readModel.slice(readModel.lastIndexOf("return {"));
assert.doesNotMatch(readModelExports, /changeLabor|transferToGantt|cancelWorkOrder|cancelPlanning/);
assert.match(readModelExports, /changeQuantity, changeStartDate, changeSlotSchedule/);
const planningRouteDeclaration = domainApi.slice(
  domainApi.indexOf("const orderMatch ="),
  domainApi.indexOf("const specifications2RevisionMatch ="),
);
assert.match(planningRouteDeclaration, /orderMatch/);
assert.match(planningRouteDeclaration, /startDateMatch/);
assert.match(planningRouteDeclaration, /slotMatch/);
assert.doesNotMatch(planningRouteDeclaration, /labor|transfer|cancel/i);

await Promise.all([
  transform(scenario, { loader: "tsx", format: "esm", target: "es2022" }),
  transform(adapter, { loader: "ts", format: "esm", target: "es2022" }),
]);

console.log("Planning Workbench deferred command ports QA passed");
console.log("- change-labor / transfer-to-gantt / cancel typed commands: pass");
console.log("- strict fail-closed capabilities and explicit blockers: pass");
console.log("- no legacy owner invocation from React scenario: pass");
console.log("- current PostgreSQL owner absence proved from API/read-model contracts: pass");
