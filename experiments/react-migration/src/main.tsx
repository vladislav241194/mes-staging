import { resolveNomenclatureActivation, resolveReadOnlyScenarioActivation } from "./activation-policy";
import { createReactIslandFeatureGate, type LegacyFallbackContext } from "./feature-gate";
import { componentTypesFixture, componentTypesUpdateFixture } from "./modules/component-types/fixture";
import { boardsFixture, boardsUpdateFixture } from "./modules/boards/fixture";
import { nomenclatureFixture, nomenclatureUpdateFixture } from "./modules/nomenclature/fixture";
import { structureEmployeesFixture, structureEmployeesUpdateFixture } from "./modules/structure-employees/fixture";
import { rolesFixture, rolesUpdateFixture } from "./modules/roles/fixture";
import { operationsFixture, operationsUpdateFixture } from "./modules/operations/fixture";
import { nomenclatureTypesFixture, nomenclatureTypesUpdateFixture } from "./modules/nomenclature-types/fixture";
import { statusesFixture, statusesUpdateFixture } from "./modules/statuses/fixture";
import { structurePositionsFixture, structurePositionsUpdateFixture } from "./modules/structure-positions/fixture";
import { structureOrgUnitsFixture, structureOrgUnitsUpdateFixture } from "./modules/structure-org-units/fixture";
import { structureWorkCentersFixture, structureWorkCentersUpdateFixture } from "./modules/structure-work-centers/fixture";
import { structureEquipmentFixture, structureEquipmentUpdateFixture } from "./modules/structure-equipment/fixture";
import { structureResponsibilityPoliciesFixture, structureResponsibilityPoliciesUpdateFixture } from "./modules/structure-responsibility-policies/fixture";
import { structureMigrationDiagnosticsFixture, structureMigrationDiagnosticsUpdateFixture } from "./modules/structure-migration-diagnostics/fixture";
import { weeklyProductionControlFixture, weeklyProductionControlUpdateFixture } from "./modules/weekly-production-control/fixture";
import { createTimesheetNavigationFixture, timesheetFixture, timesheetUpdateFixture } from "./modules/timesheet/fixture";
import { planningWorkbenchFixture, planningWorkbenchUpdateFixture } from "./modules/planning-workbench/fixture";
import { shiftWorkOrdersFixture, shiftWorkOrdersPrintPackageFixture, shiftWorkOrdersUpdateFixture } from "./modules/shift-work-orders/fixture";
import { createShiftMasterBoardAssignmentFixture, createShiftMasterBoardCarryoverFixture, createShiftMasterBoardDateFixture, createShiftMasterBoardFactFixture, createShiftMasterBoardFocusFixture, createShiftMasterBoardMasterFixture, shiftMasterBoardFixture, shiftMasterBoardUpdateFixture } from "./modules/shift-master-board/fixture";
import { createEmployeeDesktopFactFixture, createEmployeeDesktopPersonFixture, createEmployeeDesktopReportFixture, createEmployeeDesktopStartedFixture, employeeDesktopFixture, employeeDesktopUpdateFixture } from "./modules/employee-desktop/fixture";
import { contourAdminFixture, contourAdminUpdateFixture } from "./modules/contour-admin/fixture";
import { specifications2Fixture, specifications2UpdateFixture } from "./modules/specifications2/fixture";
import { mountReactMigrationIsland, type ReactMigrationScenarioId } from "./mount";

const root = document.querySelector<HTMLElement>("#root");
if (!root) throw new Error("React migration lab root is missing");
const searchParams = new URL(window.location.href).searchParams;
const scenarioParam = searchParams.get("scenario");
const scenario: ReactMigrationScenarioId = scenarioParam === "component-types" ? "componentTypes" : scenarioParam === "boards" ? "boards" : scenarioParam === "structure-employees" ? "structureEmployees" : scenarioParam === "structure-positions" ? "structurePositions" : scenarioParam === "structure-org-units" ? "structureOrgUnits" : scenarioParam === "structure-work-centers" ? "structureWorkCenters" : scenarioParam === "structure-equipment" ? "structureEquipment" : scenarioParam === "structure-responsibility-policies" ? "structureResponsibilityPolicies" : scenarioParam === "structure-migration-diagnostics" ? "structureMigrationDiagnostics" : scenarioParam === "weekly-production-control" ? "weeklyProductionControl" : scenarioParam === "timesheet" ? "timesheet" : scenarioParam === "planning-workbench" ? "planningWorkbench" : scenarioParam === "shift-work-orders" ? "shiftWorkOrders" : scenarioParam === "shift-master-board" ? "shiftMasterBoard" : scenarioParam === "employee-desktop" ? "employeeDesktop" : scenarioParam === "contour-admin" ? "contourAdmin" : scenarioParam === "specifications2" ? "specifications2" : scenarioParam === "roles" ? "roles" : scenarioParam === "operations" ? "operations" : scenarioParam === "nomenclature-types" ? "nomenclatureTypes" : scenarioParam === "statuses" ? "statuses" : "nomenclature";
const initialPayload = scenario === "componentTypes" ? componentTypesFixture : scenario === "boards" ? boardsFixture : scenario === "structureEmployees" ? structureEmployeesFixture : scenario === "structurePositions" ? structurePositionsFixture : scenario === "structureOrgUnits" ? structureOrgUnitsFixture : scenario === "structureWorkCenters" ? structureWorkCentersFixture : scenario === "structureEquipment" ? structureEquipmentFixture : scenario === "structureResponsibilityPolicies" ? structureResponsibilityPoliciesFixture : scenario === "structureMigrationDiagnostics" ? structureMigrationDiagnosticsFixture : scenario === "weeklyProductionControl" ? weeklyProductionControlFixture : scenario === "timesheet" ? timesheetFixture : scenario === "planningWorkbench" ? planningWorkbenchFixture : scenario === "shiftWorkOrders" ? shiftWorkOrdersFixture : scenario === "shiftMasterBoard" ? shiftMasterBoardFixture : scenario === "employeeDesktop" ? employeeDesktopFixture : scenario === "contourAdmin" ? contourAdminFixture : scenario === "specifications2" ? specifications2Fixture : scenario === "roles" ? rolesFixture : scenario === "operations" ? operationsFixture : scenario === "nomenclatureTypes" ? nomenclatureTypesFixture : scenario === "statuses" ? statusesFixture : nomenclatureFixture;
const updatePayload = scenario === "componentTypes" ? componentTypesUpdateFixture : scenario === "boards" ? boardsUpdateFixture : scenario === "structureEmployees" ? structureEmployeesUpdateFixture : scenario === "structurePositions" ? structurePositionsUpdateFixture : scenario === "structureOrgUnits" ? structureOrgUnitsUpdateFixture : scenario === "structureWorkCenters" ? structureWorkCentersUpdateFixture : scenario === "structureEquipment" ? structureEquipmentUpdateFixture : scenario === "structureResponsibilityPolicies" ? structureResponsibilityPoliciesUpdateFixture : scenario === "structureMigrationDiagnostics" ? structureMigrationDiagnosticsUpdateFixture : scenario === "weeklyProductionControl" ? weeklyProductionControlUpdateFixture : scenario === "timesheet" ? timesheetUpdateFixture : scenario === "planningWorkbench" ? planningWorkbenchUpdateFixture : scenario === "shiftWorkOrders" ? shiftWorkOrdersUpdateFixture : scenario === "shiftMasterBoard" ? shiftMasterBoardUpdateFixture : scenario === "employeeDesktop" ? employeeDesktopUpdateFixture : scenario === "contourAdmin" ? contourAdminUpdateFixture : scenario === "specifications2" ? specifications2UpdateFixture : scenario === "roles" ? rolesUpdateFixture : scenario === "operations" ? operationsUpdateFixture : scenario === "nomenclatureTypes" ? nomenclatureTypesUpdateFixture : scenario === "statuses" ? statusesUpdateFixture : nomenclatureUpdateFixture;
let timesheetLabPayload: unknown = timesheetFixture;
const featureFlagEnabled = searchParams.get("react") !== "0";
const accessMode = searchParams.get("access") === "editor" ? "editor" : "read-only-evaluation";
const nomenclatureActivation = resolveNomenclatureActivation({
  featureFlagEnabled,
  activePane: searchParams.get("pane") === "boards" ? "boards" : "items",
  accessMode,
});
const activationDecision = scenario === "nomenclature"
  ? nomenclatureActivation
  : resolveReadOnlyScenarioActivation({ featureFlagEnabled, accessMode });
let lifecycleStatus: HTMLElement | null = null;
const performancePrefix = `mes-react-island:${scenario}`;
let nextExpectedRevision = 1;
const markRevisionStart = (revision: number) => {
  const markName = `${performancePrefix}:start:${revision}`;
  performance.clearMarks(markName);
  performance.mark(markName);
};
const recordRevisionCommit = (revision: number) => {
  const startName = `${performancePrefix}:start:${revision}`;
  const commitName = `${performancePrefix}:commit:${revision}`;
  const measureName = `${performancePrefix}:duration:${revision}`;
  performance.mark(commitName);
  performance.clearMeasures(measureName);
  if (performance.getEntriesByName(startName, "mark").length) performance.measure(measureName, startName, commitName);
  const duration = performance.getEntriesByName(measureName, "measure").at(-1)?.duration;
  root.dataset.reactIslandScenario = scenario;
  root.dataset.reactIslandRevision = String(revision);
  if (typeof duration === "number") root.dataset.reactIslandCommitMs = duration.toFixed(2);
  nextExpectedRevision = revision + 1;
};
const renderLegacyFallback = (context: LegacyFallbackContext) => {
  const fallback = document.createElement("section");
  fallback.className = "legacy-fallback";
  fallback.dataset.legacyFallback = context.reason;
  fallback.setAttribute("role", context.error ? "alert" : "status");
  const title = document.createElement("strong");
  title.textContent = "Legacy-интерфейс восстановлен";
  const text = document.createElement("p");
  text.textContent = context.reason === "disabled"
    ? "React-сценарий выключен feature flag."
    : context.reason === "unsupported-scope"
      ? "Выбранный раздел остаётся в прежнем интерфейсе до отдельной миграции."
      : context.reason === "write-parity-incomplete"
        ? "Редактирование остаётся в прежнем интерфейсе до миграции команд."
    : "React-сценарий остановлен; пользователь может продолжить в прежнем интерфейсе.";
  fallback.append(title, text);
  root.replaceChildren(fallback);
  if (lifecycleStatus) lifecycleStatus.textContent = context.error ? `legacy: ${context.error.message}` : `legacy: ${context.reason}`;
};
const featureGate = createReactIslandFeatureGate({
  enabled: activationDecision.activateReact,
  disabledReason: activationDecision.reason === "eligible" ? "disabled" : activationDecision.reason,
  target: root,
  mount(target, payload, onError) {
    return mountReactMigrationIsland(target, scenario, payload, {
      onError,
      onReady: ({ revision }) => recordRevisionCommit(revision),
      onLoadShiftWorkOrderPrintPackage: async () => shiftWorkOrdersPrintPackageFixture,
      onLoadShiftWorkOrderPrintRenderer: async () => import("./modules/shift-work-orders/ShiftWorkOrderPrintPreviews"),
      onTimesheetNavigate: async (command) => { timesheetLabPayload = createTimesheetNavigationFixture(timesheetLabPayload, command); markRevisionStart(nextExpectedRevision); featureGate.update(timesheetLabPayload); return { ok: true }; },
      onShiftWorkOrdersNavigate: async (navigation) => {
        root.dataset.shiftWorkOrdersNavigation = JSON.stringify(navigation);
        if (searchParams.get("shift-work-orders-navigation-failure") === "stale") return { ok: false, message: "Исходная задача изменилась или больше не входит в текущий журнал." };
        if (searchParams.get("shift-work-orders-navigation-failure") === "rbac") return { ok: false, message: "Нет права открывать Мастерскую." };
        return { ok: true };
      },
      onPrintDocument: (title) => { root.dataset.printDocumentTitle = title; },
      onSelectShiftMasterBoardDate: (dateKey) => { markRevisionStart(nextExpectedRevision); featureGate.update(createShiftMasterBoardDateFixture(dateKey)); },
      onSelectShiftMasterBoardFocus: (focus) => { markRevisionStart(nextExpectedRevision); featureGate.update(createShiftMasterBoardFocusFixture(focus)); },
      onSelectShiftMasterBoardMaster: (masterId) => { markRevisionStart(nextExpectedRevision); featureGate.update(createShiftMasterBoardMasterFixture(masterId)); },
      onOpenShiftMasterBoardCarryover: (dateKey, carryoverId) => { markRevisionStart(nextExpectedRevision); featureGate.update(createShiftMasterBoardCarryoverFixture(dateKey, carryoverId)); },
      onOpenShiftMasterBoardSource: () => { markRevisionStart(nextExpectedRevision); featureGate.update(createShiftMasterBoardFactFixture("assigned", { actualQuantity: 100, defectQuantity: 4, laborMinutes: 240, executorCount: 2, comment: "", deviationComment: "" })); },
      onShiftMasterBoardCommand: async (command) => { markRevisionStart(nextExpectedRevision); featureGate.update(command.type === "save-assignment" ? createShiftMasterBoardAssignmentFixture(command.rowId, command.executors) : createShiftMasterBoardFactFixture(command.rowId, command)); return { ok: true }; },
      onEmployeeDesktopCommand: async (command) => {
        if (command.type === "select-person") { if (command.personId === null) { root.dataset.employeeDesktopReturnToUserSelection = "requested"; return { ok: true }; } markRevisionStart(nextExpectedRevision); featureGate.update(createEmployeeDesktopPersonFixture(command.personId)); return { ok: true }; }
        if (command.type === "prepare-report-photo") { const dataUrl = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => resolve(""); reader.readAsDataURL(command.file); }); return { ok: true, photo: { id: "photo-lab", name: command.file.name, type: command.file.type, size: command.file.size, source: command.source, dataUrl, storageNote: "" } }; }
        markRevisionStart(nextExpectedRevision);
        if (command.type === "start-task") featureGate.update(createEmployeeDesktopStartedFixture(command.taskId));
        else if (command.type === "save-fact") featureGate.update(createEmployeeDesktopFactFixture(command.taskId, command.actualQuantity, command.defectQuantity));
        else featureGate.update(createEmployeeDesktopReportFixture(command.taskId, Boolean(command.photo)));
        return { ok: true };
      },
      onNavigateRegistry: () => featureGate.requestLegacy("unsupported-scope"),
      onRequestLegacy: () => featureGate.requestLegacy("unsupported-scope"),
    });
  },
  renderLegacy: renderLegacyFallback,
});
markRevisionStart(nextExpectedRevision);
featureGate.activate(initialPayload);

const lifecycleQaEnabled = searchParams.get("lifecycle_qa") === "1";
if (lifecycleQaEnabled) {
  const controls = document.querySelector<HTMLElement>("[data-lifecycle-controls]");
  const updateButton = document.querySelector<HTMLButtonElement>("[data-lifecycle-update]");
  const errorButton = document.querySelector<HTMLButtonElement>("[data-lifecycle-error]");
  const unmountButton = document.querySelector<HTMLButtonElement>("[data-lifecycle-unmount]");
  const status = document.querySelector<HTMLElement>("[data-lifecycle-status]");
  if (!controls || !updateButton || !errorButton || !unmountButton || !status) throw new Error("Lifecycle QA controls are missing");

  lifecycleStatus = status;
  controls.hidden = false;
  updateButton.addEventListener("click", () => {
    try {
      markRevisionStart(nextExpectedRevision);
      if (scenario === "timesheet") timesheetLabPayload = updatePayload;
      status.textContent = featureGate.update(updatePayload) ? "updated" : `rejected: ${featureGate.getState()}`;
    } catch (error) {
      status.textContent = error instanceof Error ? `rejected: ${error.message}` : "rejected";
    }
  });
  errorButton.addEventListener("click", () => {
    const crashingPayload = new Proxy({}, {
      get() {
        throw new Error("Lifecycle QA render failure");
      },
    });
    featureGate.update(crashingPayload);
  });
  unmountButton.addEventListener("click", () => {
    featureGate.dispose();
    errorButton.disabled = true;
    updateButton.disabled = true;
    unmountButton.disabled = true;
    status.textContent = "unmounted";
  });
  if (featureGate.getState() === "legacy") status.textContent = `legacy: ${activationDecision.reason}`;
}
