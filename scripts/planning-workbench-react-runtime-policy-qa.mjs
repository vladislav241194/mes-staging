import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const disabled = getPublicRuntimeConfig({});
assert.equal(disabled.MES_REACT_PLANNING_WORKBENCH, false);
assert.equal(disabled.MES_REACT_PLANNING_WORKBENCH_READ_ONLY_EVALUATION, false);
assert.equal(disabled.MES_REACT_PLANNING_WORKBENCH_WRITE_EVALUATION, false);
assert.equal(disabled.MES_PLANNING_START_DATE_SERVER_COMMANDS_PRIMARY, false);
assert.equal(disabled.MES_LEGACY_DOMAIN_WRITES_QUIESCED, false);
assert.equal(disabled.MES_PLANNING_LEGACY_WRITES_QUIESCED, false);

const exactEnv = {
  MES_DOMAIN_STORAGE: "postgres",
  MES_ENABLE_PLANNING_START_DATE_COMMANDS: "1",
  MES_REACT_PLANNING_WORKBENCH: "1",
  MES_REACT_PLANNING_WORKBENCH_WRITE_EVALUATION: "1",
  MES_ENABLE_EMPLOYEE_AUTH: "1",
  MES_EMPLOYEE_AUTH_SESSION_SECRET: "must-not-leak",
  MES_EMPLOYEE_AUTH_HOSTS: "pilot.mes-line.ru",
};
const enabled = getPublicRuntimeConfig(exactEnv);
assert.equal(enabled.MES_REACT_PLANNING_WORKBENCH, true);
assert.equal(enabled.MES_REACT_PLANNING_WORKBENCH_WRITE_EVALUATION, true);
assert.equal(enabled.MES_REACT_PLANNING_WORKBENCH_READ_ONLY_EVALUATION, false);
assert.equal(enabled.MES_PLANNING_START_DATE_SERVER_COMMANDS_PRIMARY, true);
assert.equal(enabled.MES_LEGACY_DOMAIN_WRITES_QUIESCED, true);
assert.equal(enabled.MES_PLANNING_LEGACY_WRITES_QUIESCED, true);
assert.equal(enabled.MES_EMPLOYEE_AUTH_AVAILABLE, true);
assert.equal(enabled.MES_EMPLOYEE_AUTH_REQUIRED, false);
assert.equal(Object.hasOwn(enabled, "MES_PLANNING_SERVER_COMMANDS_PRIMARY"), false,
  "the narrow slice must not publish the former global Planning owner flag");

for (const env of [
  { ...exactEnv, MES_DOMAIN_STORAGE: "Postgres" },
  { ...exactEnv, MES_ENABLE_PLANNING_START_DATE_COMMANDS: "true" },
  { ...exactEnv, MES_ENABLE_PLANNING_START_DATE_COMMANDS: "0" },
]) {
  const config = getPublicRuntimeConfig(env);
  assert.equal(config.MES_PLANNING_START_DATE_SERVER_COMMANDS_PRIMARY, false);
  assert.equal(config.MES_LEGACY_DOMAIN_WRITES_QUIESCED, false);
  assert.equal(config.MES_PLANNING_LEGACY_WRITES_QUIESCED, false);
}
assert.equal(getPublicRuntimeConfig({ ...exactEnv, MES_ENABLE_PLANNING_SERVER_COMMANDS: "1" }).MES_LEGACY_DOMAIN_WRITES_QUIESCED, false,
  "the complete Planning command owner must end the temporary all-domain quiesce");
assert.equal(getPublicRuntimeConfig({ ...exactEnv, MES_ENABLE_PLANNING_SERVER_COMMANDS: "1" }).MES_PLANNING_LEGACY_WRITES_QUIESCED, false,
  "the complete Planning command owner must end the temporary legacy quiesce");

const script = renderRuntimeConfigScript(exactEnv);
assert.match(script, /"MES_REACT_PLANNING_WORKBENCH_WRITE_EVALUATION":true/);
assert.match(script, /"MES_PLANNING_START_DATE_SERVER_COMMANDS_PRIMARY":true/);
assert.match(script, /"MES_LEGACY_DOMAIN_WRITES_QUIESCED":true/);
assert.match(script, /"MES_PLANNING_LEGACY_WRITES_QUIESCED":true/);
assert.doesNotMatch(script, /must-not-leak/);

const [app, host, routes, events, appInteractions, gantt, scenario, runtimeState, visualStyles] = await Promise.all([
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/planning_workbench/react_island_host.js", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/planning_routes/service.js", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/app_events/service.js", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/app_interactions/render.js", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/gantt_runtime/render.js", import.meta.url), "utf8"),
  readFile(new URL("../experiments/react-migration/src/modules/planning-workbench/PlanningWorkbenchScenario.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/runtime_state/service.js", import.meta.url), "utf8"),
  readFile(new URL("../styles/visual-overrides.live.css", import.meta.url), "utf8"),
]);

assert.match(app, /react-planning-workbench-write-evaluation/,
  "live evaluation must require an explicit session URL request");
assert.match(app, /serverWriteEvaluationAllowed[\s\S]*writeEvaluationRequested[\s\S]*isPlanningStartDateServerCommandsPrimary\(\)/,
  "query request must be additive to the root flag and narrow server owner, never authority by itself");
assert.match(app, /employeeServerSessionState\.authenticated === true[\s\S]*signedServerActor\.employeeId/);
assert.match(app, /signedPlanningCapabilityReady/);
assert.match(app, /signedPlanningQuantityCapabilityReady[\s\S]*quantityEnabled === true/,
  "quantity edit must require the signed Planning owner capability");
assert.match(app, /signedPlanningSlotCapabilityReady[\s\S]*slotScheduleEnabled === true/,
  "selected-slot edit must require the signed Planning owner capability");
assert.match(app, /await reconcileEmployeeServerSession\(\{ force: true \}\);[\s\S]*await ensurePlanningCommandCapabilities\(\{ force: true \}\)/,
  "the first save after PIN must refresh both the signed session and exact server capability before gating");
assert.match(app, /quantityEdit: canEditQuantity/);
assert.match(app, /startDateEdit: canEditStartDate/);
assert.match(app, /slotScheduleEdit: canEditSlotSchedule/);
assert.match(app, /permanentWriteEligible = runtimeActivation\.runtimeMode === "react"[\s\S]*isPlanningStartDateServerCommandsPrimary\(\)/,
  "permanent React start-date edit must retain its narrow public owner gate");
assert.match(app, /permanentCommandSurfaceEligible = runtimeActivation\.runtimeMode === "react"[\s\S]*signedWriteSurfaceEligible/,
  "permanent React must discover signed command capabilities without assuming that quantity is enabled");
assert.match(app, /signedWriteSurfaceEligible[\s\S]*ensurePlanningCommandCapabilities/,
  "permanent React must refresh the exact server capability after employee elevation");
assert.match(app, /command\.type === "request-elevation"/);
assert.match(app, /beginPlanningEmployeeElevation/);
assert.match(app, /\["change-start-date", "change-quantity", "change-slot"\]\.includes\(command\.type\)/);
const planningProductionPayload = app.slice(
  app.indexOf("function getPlanningWorkbenchProductionReadState"),
  app.indexOf("function ensurePlanningCommandCapabilities"),
);
assert.match(planningProductionPayload, /getDomainWorkOrderProjections\(\)/);
assert.match(planningProductionPayload, /getDomainWorkOrderDetail\(activeRouteId\)/);
assert.match(planningProductionPayload, /planningRuntimeProjectionState\.status === "server"[\s\S]*planningRuntimeProjectionReadModel\?\.getProjection/,
  "React Planning must consume only an already-confirmed PostgreSQL runtime projection");
assert.match(planningProductionPayload, /productionModel:[\s\S]*bootstrap:[\s\S]*storageMode: "postgres"[\s\S]*items: state\.items[\s\S]*item: state\.item/,
  "the island payload must pass raw PostgreSQL bootstrap/detail data into the typed adapter");
assert.doesNotMatch(planningProductionPayload, /getPlanningWorkbenchModel|ensurePlanningWorkbenchModule|planning_workbench\/render\.js/,
  "the permanent React payload must not derive through the legacy Planning renderer/model");
const planningReactHost = app.slice(
  app.indexOf("const planningWorkbenchReactIslandHost"),
  app.indexOf("async function executeShiftExecutionAssignmentCommand"),
);
assert.match(planningReactHost, /getPayload: getPlanningWorkbenchProductionPayload/);
assert.doesNotMatch(planningReactHost, /getPlanningWorkbenchModel\(/,
  "React navigation and owner commands must validate against the PostgreSQL production state");
assert.match(app, /result\.kind === "superseded"[\s\S]*planningWorkbenchReactIslandHost\.update\(\)/,
  "a superseded replay must refresh the mounted React payload without unmounting its explanation state");
assert.match(app, /result\.kind === "conflict"[\s\S]*planningWorkbenchReactIslandHost\.update\(\)/,
  "an ordinary conflict must publish the canonical revision into the mounted React payload before a deliberate retry");
const startDateOwnerCommand = app.slice(
  app.indexOf("async function changePlanningRouteStartDate"),
  app.indexOf("async function changePlanningSlotSchedule"),
);
assert.equal(
  startDateOwnerCommand.match(/hydratePlanningRuntimeProjection\(\{ force: true, renderOnChange: false \}\)/g)?.length,
  2,
  "start-date success and superseded reconciliation must refresh the owner projection without replacing the mounted Scenario",
);
assert.match(app, /Дата сохранена, но подтверждённое значение пока не загружено[\s\S]*planningWorkbenchReactIslandHost\.update\(\)[\s\S]*rollbackReady !== true/,
  "a committed command must keep the mounted root and exact retained request available while rollback mirroring is pending");
assert.doesNotMatch(app, /!localQa\.writeEvaluation && result\.rollbackReady !== true/,
  "local browser evaluation must exercise the same confirmed legacy-mirror receipt gate as the live path");
assert.doesNotMatch(app, /planningWorkbenchReactIslandHost\.update\(\) && ui\.activeModule === "planning"/,
  "a failed host update must not schedule a shell render that can erase in-flight Scenario reconciliation state");
assert.match(app, /PLANNING_START_DATE_RECONCILIATION_STORAGE_KEY = "mes-planning-start-date-reconciliation-v1"/);
assert.match(app, /PLANNING_START_DATE_RECONCILIATION_TTL_MS = 15 \* 60 \* 1000/,
  "the retained request must not outlive the root-controlled fifteen-minute evaluation window");
assert.match(app, /planningCapability\.capabilities\?\.startDateOwnerConfigured === false/,
  "only a definitive owner-off capability may clear an unresolved request");
assert.doesNotMatch(app, /planningCapabilityProvesStartDateDisabled[\s\S]*startDateEnabled !== true/,
  "transient parity or schema readiness must not erase an unknown command outcome");
assert.match(app, /schemaVersion[\s\S]*appVersion !== APP_VERSION[\s\S]*expiresAt <= now/,
  "the session record must fail closed across schema, release and expiry boundaries");
assert.match(app, /PLANNING_START_DATE_RECONCILIATION_SCHEMA_VERSION = 2/);
assert.match(app, /ownsPlanningStartDate[\s\S]*intent === "clear" \? planningStartDate !== null/,
  "durable reconciliation must distinguish explicit nullable clear from a missing value");
assert.match(app, /startDateReconciliationSessionRequested[\s\S]*startDateReconciliationScopeEnabled = isPlanningStartDateServerCommandsPrimary\(\)[\s\S]*activation\.startDateReconciliationSessionRequested !== true/,
  "transient owner bootstrap must not erase a requested session's exact retry key");
assert.match(app, /readCanonicalPlanningStartDate\(readBack\)[\s\S]*!canonicalReadBack\.available[\s\S]*canonicalReadBack\.value !== planningStartDate/,
  "missing canonical read-back must never be accepted as an explicit null clear");
assert.match(app, /existingReconciliation[\s\S]*idempotencyKey !== idempotencyKey[\s\S]*return \{ ok: false[\s\S]*const retainedReconciliation[\s\S]*changePlanningRouteStartDate/,
  "a different unresolved intent must be rejected before any owner PATCH can leave the browser");
assert.match(app, /store\.setItem\(PLANNING_START_DATE_RECONCILIATION_STORAGE_KEY[\s\S]*store\.getItem\(PLANNING_START_DATE_RECONCILIATION_STORAGE_KEY[\s\S]*return null/,
  "the browser must verify the exact session record before allowing a live owner PATCH");
assert.match(app, /if \(!retainedReconciliation\) return \{ ok: false[\s\S]*changePlanningRouteStartDate/,
  "an unavailable or unwritable session store must fail closed before the owner command");
assert.match(app, /hydratePlanningWorkbenchBootstrap[\s\S]*retainedStartDateReconciliation[\s\S]*ui\.activeRouteId = retainedStartDateReconciliation\.routeId[\s\S]*requestedActiveRouteId/,
  "a direct reload must restore the retained aggregate before the first Planning bootstrap request");
assert.match(appInteractions, /previousModule === "planning"[\s\S]*startDateReconciliation[\s\S]*Сначала проверьте незавершённую команду/,
  "normal module navigation must not hide an unresolved command outcome");
assert.match(appInteractions, /moduleId === "planning"[\s\S]*startDateReconciliation\?\.routeId/,
  "normal Planning re-entry must reopen the retained aggregate instead of an unrelated persisted selection");
assert.match(app, /result\.kind === "superseded"\) \{[\s\S]*clearPlanningStartDateReconciliation\(\)/);
assert.match(app, /result\.kind === "conflict"\) \{[\s\S]*clearPlanningStartDateReconciliation\(\)/);
assert.match(app, /result\.rollbackReady !== true[\s\S]*retainPlanningStartDateReconciliation[\s\S]*clearPlanningStartDateReconciliation\(\)[\s\S]*planningWorkbenchReactIslandHost\.update\(\)/,
  "pending mirror receipts must retain, while confirmed success must clear, the durable request");
assert.match(planningReactHost, /command\.type === "change-quantity"[\s\S]*Number\.isInteger\(quantity\)[\s\S]*Number\.isInteger\(expectedRevision\)[\s\S]*canPlanningWorkbenchReactQuantityWrite[\s\S]*activeRoute\?\.concurrencyRevision[\s\S]*changePlanningRouteQuantity\(routeId, quantity,[\s\S]*expectedRevision,[\s\S]*requireServerCommand: true[\s\S]*planningWorkbenchReactIslandHost\.update\(\)/,
  "quantity edit must validate quantity and displayed revision, require the signed capability, use only the server owner and update React in place");
assert.match(planningReactHost, /command\.type === "change-quantity"[\s\S]*readPlanningStartDateReconciliation\(\)[\s\S]*Сначала проверьте незавершённую команду даты старта/,
  "quantity must not advance the aggregate while a start-date outcome is unresolved");
assert.match(planningReactHost, /command\.type === "change-slot"[\s\S]*readPlanningStartDateReconciliation\(\)[\s\S]*operationId[\s\S]*slotId[\s\S]*expectedRevision[\s\S]*ui\?\.planningWorkItem[\s\S]*projectedSlot[\s\S]*canPlanningWorkbenchReactSlotWrite[\s\S]*changePlanningSlotSchedule\(routeId, operationId, slotId, plannedStart\.toISOString\(\), \{ expectedRevision, renderOnChange: false, renderOnConflict: false, requireServerCommand: true \}\)[\s\S]*planningWorkbenchReactIslandHost\.update\(\)/,
  "selected-slot edit must verify the displayed row/revision against both PostgreSQL projections and call only the existing server owner");
assert.match(planningReactHost, /result\?\.committed && result\?\.rollbackReady === false[\s\S]*code: "compatibility-pending"[\s\S]*Не повторяйте перенос/,
  "a committed slot with a pending rollback mirror must not be reported as plain success or invite a blind retry");
assert.match(planningReactHost, /slot\.locked \|\| slot\.isLocked \|\| projectedSlot\.locked \|\| projectedSlot\.isLocked \|\| isGanttSlotCompleted\(slot\)/,
  "selected-slot edit must reject locked or completed slots before the owner command");
const quantityOwnerCommand = app.slice(
  app.indexOf("async function changePlanningRouteQuantity"),
  app.indexOf("async function changePlanningRouteStartDate"),
);
assert.match(quantityOwnerCommand, /requireServerCommand = options\.requireServerCommand === true[\s\S]*return requireServerCommand \? false : syncPlanningRouteQuantity/,
  "a missing quantity owner must fail closed instead of invoking the legacy writer");
assert.match(quantityOwnerCommand, /requestedRevision = Number\(options\.expectedRevision\)[\s\S]*workOrdersReadModel\.changeQuantity\(routeId, quantity, expectedRevision\)/,
  "the server owner must receive the revision displayed by the typed React model");
const slotOwnerCommand = app.slice(
  app.indexOf("async function changePlanningSlotSchedule"),
  app.indexOf("let planningCoreService", app.indexOf("async function changePlanningSlotSchedule")),
);
assert.match(slotOwnerCommand, /requireServerCommand = options\.requireServerCommand === true[\s\S]*requestedRevision = Number\(options\.expectedRevision\)[\s\S]*exactSlotId[\s\S]*workOrdersReadModel\.changeSlotSchedule\(routeId, operationId, exactSlotId, plannedStart, expectedRevision\)[\s\S]*String\(authoritativeSlot\.id\) !== exactSlotId/,
  "the slot owner must accept the displayed revision and fail closed when the server client is unavailable");
assert.match(slotOwnerCommand, /rollbackReady = result\.compatibilityReady === true[\s\S]*applied: false, committed: true, rollbackReady: false, kind: "compatibility-pending"/,
  "slot owner must distinguish a committed PostgreSQL mutation from rollback readiness");
assert.match(slotOwnerCommand, /hydratePlanningRuntimeProjection\(\{ force: true, renderOnChange: options\.renderOnChange !== false \}\)/,
  "slot read-back must update the PostgreSQL projection without forcing the mounted React Scenario to unmount");
const planningRuntimeAdapter = app.slice(
  app.indexOf("    planning: {\n      render: () => {"),
  app.indexOf("    shiftMasterBoard:", app.indexOf("    planning: {\n      render: () => {")),
);
assert.ok(planningRuntimeAdapter.indexOf("planningWorkbenchReactIslandHost.prepareRender()") >= 0);
assert.match(planningRuntimeAdapter, /planningWorkbenchReactIslandHost\.prepareRender\(\);[\s\S]*return planningWorkbenchReactIslandHost\.renderTarget\(\);[\s\S]*bind: \(\) => \{\}/,
  "Planning must always render and bind through the React host");
assert.doesNotMatch(planningRuntimeAdapter, /ensurePlanningWorkbenchModule|renderPlanningWorkbenchPage|bindPlanningEvents|getReactRuntimeMode/,
  "Planning must not retain a same-release legacy UI branch");
assert.doesNotMatch(app, /planning_workbench\/(?:render|work_items)\.js|ensurePlanningWorkbenchModule|renderPlanningWorkbenchPage/,
  "the normal application graph must not contain the retired Planning rollback renderer");

assert.match(host, /\["read-only-evaluation", "write-evaluation"\]/);
assert.match(host, /canFallbackToLegacy:\s*\(\)\s*=>\s*false/,
  "every Planning runtime mode must stay inside the React fail-closed shell");
assert.doesNotMatch(host, /requestLegacyRender|onRequestLegacy/,
  "Planning host must not expose a same-release legacy callback");
assert.match(host, /if \(activation\.accessMode === "react"\) return ""/,
  "the signed runtime policy must activate Planning without an evaluation URL");
assert.match(host, /getShellState:[\s\S]*serverReadFailure[\s\S]*server-read-pending/,
  "permanent Planning must show loading/error React shells instead of legacy");
assert.match(host, /runtime-policy-disabled[\s\S]*evaluation-disabled/,
  "an inactive runtime must render an explicit disabled React shell rather than legacy");
assert.match(routes, /isPlanningStartDateServerCommandsPrimary\(\) && options\.persist !== false/);
const quantityFunction = routes.slice(routes.indexOf("function syncPlanningRouteQuantity"), routes.indexOf("function syncPlanningRouteStartDate"));
assert.match(quantityFunction, /isPlanningLegacyWritesQuiesced\(\).*options\.persist !== false/,
  "the temporary monolith guard must block legacy quantity persistence but still allow trusted projection");
assert.match(events, /isPlanningStartDateServerCommandsPrimary\(\)/,
  "legacy start-date input must stand down while the narrow owner is active");
assert.doesNotMatch(app, /PLANNING_WORKBENCH_LEGACY_MUTATION_SELECTOR/);
assert.doesNotMatch(host, /PLANNING_WORKBENCH_LEGACY_MUTATION_SELECTOR|data-planning-start-date|data-planning-route-quantity-form/,
  "React-only Planning must not retain legacy mutation selectors");
assert.match(app, /GANTT_LEGACY_MUTATION_SELECTOR/);
assert.match(app, /dataset\.legacyDomainWritesQuiesced/);
assert.match(app, /dataset\.planningLegacyWritesQuiesced/);
assert.match(app, /Изменения legacy-данных приостановлены/);
assert.match(app, /const active = isLegacyDomainWritesQuiesced\(\)/,
  "the truthful pause banner must be active on every module, not only Planning and Gantt");
assert.match(app, /topbar\.after\(banner\)/,
  "the global safety banner must be a shell sibling outside React-owned island roots");
assert.doesNotMatch(app, /surface\.prepend\(banner\)/,
  "the runtime must never insert an unmanaged banner inside a React root");
assert.match(app, /#slotForm/);
assert.match(app, /event\.type === "click"[\s\S]*target\.closest\("\.operation-slot"\)[\s\S]*!target\.closest\(GANTT_LEGACY_MUTATION_CONTROL_SELECTOR\)/,
  "single-click slot focus/read must remain available while pointer/double-click mutations are blocked");
assert.match(runtimeState, /response\.legacyDomainWritesQuiesced === true/);
assert.match(runtimeState, /applySharedStateSnapshot\(response\.current/);
assert.match(runtimeState, /isPlanningLegacyWritesQuiesced\(\) && !sharedStateApplyingRemote/);
assert.match(runtimeState, /restoreAuthoritativeLegacyDomainSnapshot/);
assert.match(runtimeState, /window\.localStorage\?\.removeItem\(SHARED_UI_LOCAL_DIRTY_KEY\)/,
  "a blocked domain intent must discard its dirty marker even when its signature changed in flight");
assert.match(runtimeState, /legacyDomainRestoreRequiresRefresh = true/,
  "a failed canonical restore must disable deferred writes until a real page refresh");
assert.match(visualStyles, /#app\[data-legacy-domain-writes-quiesced="true"\] \.legacy-domain-write-pause\s*\{[\s\S]*position:\s*fixed;/,
  "the all-module banner must stay outside module and React-owned grid geometry");
assert.doesNotMatch(gantt, /Blueprint/,
  "the temporary Gantt read-only contract must not introduce Blueprint UI");
assert.match(scenario, /employeeElevationAvailable/);
assert.match(scenario, /Подтвердить PIN/);
assert.match(scenario, /React TS · MVP/);
assert.match(scenario, /type: "change-quantity"; routeId: string; quantity: number; expectedRevision: number/,
  "the typed React command must carry quantity and the displayed owner revision");
assert.match(scenario, /type: "change-slot"; routeId: string; operationId: string; slotId: string; plannedStart: string; expectedRevision: number/,
  "the typed React slot command must carry exact owner identifiers, time and displayed revision");
assert.match(scenario, /data-react-planning-slot-form[\s\S]*data-react-planning-slot-start[\s\S]*selectedSlotRow\.locked[\s\S]*model\.canEditSlotSchedule/,
  "the selected-operation slot form must remain disabled without capability or when PostgreSQL marks the slot locked");
assert.match(scenario, /data-react-prototype-marker/,
  "Planning must remain visibly marked as an MVP rather than implementation-complete");
assert.match(scenario, /Серверный владелец тиража не подтверждён/);
assert.match(scenario, /PostgreSQL owner готов/);
assert.match(scenario, /Операции без серверного владельца заблокированы/);
assert.match(scenario, /не вызывают legacy-код/,
  "unsafe actions must be visibly fail-closed rather than delegated to legacy");
assert.match(scenario, /startDateReconcilePending/);
assert.match(scenario, /Проверить legacy-зеркало/);
assert.match(scenario, /data-react-planning-start-date-clear/);
assert.match(scenario, /saveStartDate\(null\)/,
  "the React surface must expose an explicit nullable clear intent");
assert.match(scenario, /model\.startDateReconciliation/);
assert.match(scenario, /useRef<StartDateRequest \| null>\(retainedStartDateRequest/,
  "a remounted Scenario must restore the exact key and revision from the bounded app payload");
assert.match(scenario, /disabled=\{!model\.canEditStartDate \|\| savingStartDate \|\| startDateReconcilePending\}/,
  "an unresolved command must allow only its exact reconciliation submit, never a new date intent");

console.log("Planning Workbench React runtime policy QA: signed start-date and quantity owners, fail-closed MVP commands, legacy browser domain-value quiesce, capability refresh and elevation CTA passed.");
