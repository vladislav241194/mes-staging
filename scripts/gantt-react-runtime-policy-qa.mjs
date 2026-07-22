import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const [app, host, planningCore, appEvents, scenario, adapter, productionModel, completionRegistry] = await Promise.all([
  readFile("src/app.js", "utf8"),
  readFile("src/modules/gantt_runtime/react_island_host.ts", "utf8"),
  readFile("src/modules/planning_core/service.js", "utf8"),
  readFile("src/modules/app_events/service.js", "utf8"),
  readFile("experiments/react-migration/src/modules/gantt/GanttScenario.tsx", "utf8"),
  readFile("experiments/react-migration/src/modules/gantt/adapter.ts", "utf8"),
  readFile("experiments/react-migration/src/modules/gantt/production-model.ts", "utf8"),
  readFile("src/react_completion_registry.js", "utf8"),
]);
const ledger = JSON.parse(await readFile("experiments/react-migration/cutover-ledger.json", "utf8"));
const policy = JSON.parse(await readFile("react-runtime-policy.json", "utf8"));
const { scaleConfig } = await import("../src/time.js");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const ganttLedger = ledger.islands.find((island) => island.id === "gantt");
const adapterScaleIds = JSON.parse(adapter.match(/const GANTT_SCALES = (\[[^\]]+\]) as const/)?.[1] || "[]");

for (const path of ["src/modules/gantt_runtime/render.js", "src/modules/gantt_runtime/lazy_facade.js"]) {
  try {
    await access(path, constants.F_OK);
    failures.push(`Retired same-release Gantt runtime still exists: ${path}`);
  } catch (error) {
    if (error?.code !== "ENOENT") failures.push(error?.message || String(error));
  }
}

expect(policy.surfaces?.gantt === "react", "Gantt normal route must be selected by the signed permanent React policy");
expect(app.includes('surfaceId: "gantt"') && app.includes("resolveReactRuntimeActivation"), "Gantt activation must consume the signed runtime policy");
expect(host.includes("canFallbackToLegacy: () => false"), "React Gantt must fail closed without a same-release legacy renderer");
expect(host.includes('activation.accessMode !== "react"') && host.includes('reason: "react-runtime-required"'), "Non-React activation must remain inside an explicit React error shell");
expect(!host.includes("requestLegacyRender"), "Gantt host must not expose a legacy callback");
expect(!app.includes("createLazyGanttRuntimeModule") && !app.includes("ganttRuntime"), "The application graph must not assemble the retired Gantt runtime");
expect(!app.includes("data-gantt-shell") && !app.includes("GANTT_LEGACY_MUTATION"), "Deleted Gantt DOM and mutation guards must not remain");
expect(/if \(ui\.activeModule !== "gantt"\)[\s\S]*ensureGanttPlanningRuntimeProjection\(\)[\s\S]*ganttReactIslandHost\.prepareRender\(\)[\s\S]*ganttReactIslandHost\.renderTarget\(\)[\s\S]*ganttReactIslandHost\.mount\(\)/.test(app), "The special Gantt route must mount only the React host");
expect(app.includes("getGanttReactProductionInput()") && app.includes("productionModel: ganttReactModel"), "React Gantt must receive the PostgreSQL production input");
expect(app.includes('planningRuntimeProjectionState.status === "server"'), "React Gantt must require the PostgreSQL projection");
expect(app.includes("signedSlotScheduleCapabilityReady") && app.includes("slotScheduleEnabled === true"), "Slot reschedule must require the signed Planning owner capability");
expect(app.includes('command.type !== "reschedule-slot"'), "The host must expose only the typed reschedule command");
expect(app.includes('authorizeSystemDomainAction("planning", "edit")'), "The command owner must retain Planning RBAC");
const ganttHostStart = app.indexOf("const ganttReactIslandHost = createGanttReactIslandHost({");
const ganttHostEnd = app.indexOf("function getRolesReactLocalQaOverrides()", ganttHostStart);
const ganttHostSource = ganttHostStart >= 0 && ganttHostEnd > ganttHostStart ? app.slice(ganttHostStart, ganttHostEnd) : "";
expect(Boolean(ganttHostSource), "Gantt host source must be available");
expect(ganttHostSource.includes("workOrdersReadModel.refreshDetail(routeId, { force: true })") && ganttHostSource.includes("expectedRevision"), "React Gantt must obtain the exact server work-order revision before mutation");
expect(ganttHostSource.includes("changePlanningSlotSchedule(routeId, operationId, slotId, plannedStart.toISOString(), { expectedRevision, renderOnChange: false, renderOnConflict: false, requireDetailReadback: false, requireServerCommand: true })"), "React Gantt must send the exact physical slot and server revision only to the Planning owner");
expect(!ganttHostSource.includes("stateSlot") && !ganttHostSource.includes("planningState?.slots"), "React Gantt command validation must not require the compatibility snapshot");
expect(ganttHostSource.includes("projectedSlot.locked") && ganttHostSource.includes("isGanttSlotCompleted(projectedSlot)"), "React Gantt must validate lock/completion from the PostgreSQL projection");
expect(ganttHostSource.includes("committed: true") && ganttHostSource.includes("noRetry: true") && ganttHostSource.includes('result.kind || "readback-pending"'), "Every committed pending state must explicitly forbid a blind retry");
expect(productionModel.includes("buildGanttProductionModel") && productionModel.includes('contract: "postgres-gantt-read-v1"'), "Gantt must own a strict TypeScript production model");
expect(!/gantt_runtime\/render\.js|getGanttReactModel|buildRows\(/.test(`${adapter}\n${productionModel}`), "Typed Gantt must not call the retired renderer model");
expect(JSON.stringify(adapterScaleIds) === JSON.stringify(Object.keys(scaleConfig)), "Typed Gantt scales must match the shared time contract");
expect(scenario.includes('type: "reschedule-slot"') && scenario.includes("data-gantt-react-schedule-form"), "React Gantt must expose the typed schedule form");
expect(scenario.includes("data-gantt-planning-projection-source={model.projectionSource}"), "React Gantt must expose the exact Planning projection source to boot QA");
expect(scenario.includes("GANTT_SLOT_DRAG_MIME") && scenario.includes('void commitSchedule(slot, plannedStart, "drag")'), "React Gantt must use the typed drag command");
expect(scenario.includes('type: "toggle-expanded-routes"; routeIds: string[]') && scenario.includes('navigate({ type: "toggle-expanded-routes", routeIds: visibleRouteIds })'), "React Gantt must send the exact visible route ids when toggling rows");
expect(["refresh", "set-window-start", "set-scale", "set-zoom", "jump-today", "toggle-expanded-routes", "toggle-quantity"].every((type) => scenario.includes(`type: "${type}"`)), "React Gantt must expose each safe typed navigation command");
expect(["refresh", "edit-dependency", "resize", "optimize"].every((action) => scenario.includes(`data-gantt-react-blocked-action="${action}"`)), "Ownerless Gantt mutations must remain visibly blocked");
expect(scenario.includes("data-react-prototype-marker") && scenario.includes("React TS · прототип"), "Gantt must retain an honest accelerated-prototype marker");
expect(planningCore.includes("function jumpGanttToToday") && planningCore.includes("function toggleGanttQuantityVisibility"), "Date and quantity navigation must remain in the shared Planning owner");
expect(/navigation\.type === "toggle-expanded-routes"[\s\S]*navigation\.routeIds[\s\S]*projectedRouteIds[\s\S]*ui\.expandedProjects[\s\S]*persistUiState\(\{ skipRememberScroll: true \}\)/.test(ganttHostSource), "Route expansion must update only route ids supplied by the React projection");
expect(!ganttHostSource.includes("toggleAllVisibleGanttRoutes()"), "React route expansion must not read legacy Planning routes");
const slotOwnerStart = app.indexOf("async function changePlanningSlotSchedule");
const slotOwnerEnd = app.indexOf("let planningCoreService", slotOwnerStart);
const slotOwnerSource = slotOwnerStart >= 0 && slotOwnerEnd > slotOwnerStart ? app.slice(slotOwnerStart, slotOwnerEnd) : "";
expect(/if \(!requireServerCommand\) return \{ applied: false, kind: isPlanningLegacyWritesQuiesced\(\) \? "evaluation-quiesced" : "server-required" \}/.test(slotOwnerSource), "Slot scheduling must allow the authenticated server owner during legacy-write quiesce and reject local fallback");
expect(slotOwnerSource.includes("workOrdersReadModel.getDetail(routeId)") && slotOwnerSource.includes("serverItem?.concurrencyRevision"), "Slot scheduling must source fallback concurrency only from the server work-order cache");
expect(slotOwnerSource.includes("workOrdersReadModel.refreshDetail(routeId, { force: true })") && slotOwnerSource.includes("hydratePlanningRuntimeProjection({ force: true"), "Committed scheduling must force both detail and PostgreSQL projection readback");
expect(["readback-pending", "projection-pending", "compatibility-pending"].every((kind) => slotOwnerSource.includes(`kind: "${kind}"`)), "Committed pending states must distinguish detail, projection and rollback readiness");
expect(slotOwnerSource.includes("options.requireDetailReadback !== false && !detailReady"), "Gantt must be able to accept exact physical-slot projection readback when Workbench detail collapses split slots");
expect(!slotOwnerSource.includes('notifySaveSuccess("Срок уже изменён'), "A scheduling conflict must not emit a false success toast");
expect(!slotOwnerSource.includes("planningState.routes =") && !slotOwnerSource.includes("planningState.slots =") && !slotOwnerSource.includes("domainConcurrencyRevision"), "Server scheduling must never mutate the legacy fallback model");
expect(appEvents.includes('app.querySelector(".gantt-react-scroll")'), "Gantt scroll persistence must target the React scroll surface");
expect(!appEvents.includes("[data-gantt-shell]") && !appEvents.includes("updateDependencyClip") && !appEvents.includes(".dependencies-layer"), "App events must not retain deleted legacy Gantt scroll or dependency-clip hooks");
expect(planningCore.includes('app.querySelector(".gantt-react-scroll")') && !planningCore.includes("[data-gantt-shell]"), "Planning UI persistence must read the React Gantt scroll surface only");
expect(/function getModuleScrollSnapshot\(\)[\s\S]*?const selectors = \[[\s\S]*?"\.gantt-react-scroll"/.test(app), "Generic rerender scroll restoration must include the React Gantt scroll surface");
expect(ganttLedger?.normalActionFallback === false, "Normal Gantt actions must never switch to the deleted renderer");
expect(["set-window-start", "set-scale", "set-zoom", "toggle-expanded-routes", "toggle-quantity", "jump-today", "refresh-projection", "drag"].every((command) => ganttLedger?.commands?.implemented?.includes(command)), "Ledger must retain the implemented typed command list");
expect(["refresh", "edit-dependency", "resize", "optimize"].every((command) => ganttLedger?.commands?.blocked?.includes(command)), "Ledger must retain explicit deferred owners");
expect(completionRegistry.includes('defineCompletionEntry({ id: "gantt", status: PARTIAL'), "Gantt stays PARTIAL until exact geometry and deferred owners are completed");
expect(!scenario.includes("@blueprintjs") && !host.includes("@blueprintjs"), "Blueprint UI must not enter the React Gantt runtime");
expect(!app.includes("MES_REACT_GANTT_WRITE"), "Gantt React must not add a new Pilot write flag");

if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Gantt React runtime policy QA: OK");
