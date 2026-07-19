import { ComponentTypesScenario } from "./modules/component-types/ComponentTypesScenario";
import { BoardsScenario } from "./modules/boards/BoardsScenario";
import { NomenclatureScenario } from "./modules/nomenclature/NomenclatureScenario";
import { RolesScenario } from "./modules/roles/RolesScenario";
import { OperationsScenario } from "./modules/operations/OperationsScenario";
import { NomenclatureTypesScenario } from "./modules/nomenclature-types/NomenclatureTypesScenario";
import { StatusesScenario } from "./modules/statuses/StatusesScenario";
import { StructureEmployeesScenario } from "./modules/structure-employees/StructureEmployeesScenario";
import { StructurePositionsScenario } from "./modules/structure-positions/StructurePositionsScenario";
import { StructureOrgUnitsScenario } from "./modules/structure-org-units/StructureOrgUnitsScenario";
import { StructureWorkCentersScenario } from "./modules/structure-work-centers/StructureWorkCentersScenario";
import { StructureEquipmentScenario } from "./modules/structure-equipment/StructureEquipmentScenario";
import { StructureResponsibilityPoliciesScenario } from "./modules/structure-responsibility-policies/StructureResponsibilityPoliciesScenario";
import { StructureMigrationDiagnosticsScenario } from "./modules/structure-migration-diagnostics/StructureMigrationDiagnosticsScenario";
import { WeeklyProductionControlScenario } from "./modules/weekly-production-control/WeeklyProductionControlScenario";
import { TimesheetScenario } from "./modules/timesheet/TimesheetScenario";
import { PlanningWorkbenchScenario } from "./modules/planning-workbench/PlanningWorkbenchScenario";
import { ShiftWorkOrdersScenario } from "./modules/shift-work-orders/ShiftWorkOrdersScenario";
import { ShiftMasterBoardScenario } from "./modules/shift-master-board/ShiftMasterBoardScenario";
import { EmployeeDesktopScenario } from "./modules/employee-desktop/EmployeeDesktopScenario";
import { ContourAdminScenario } from "./modules/contour-admin/ContourAdminScenario";
import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";

export type ReactMigrationScenarioId = "nomenclature" | "componentTypes" | "boards" | "structureEmployees" | "structurePositions" | "structureOrgUnits" | "structureWorkCenters" | "structureEquipment" | "structureResponsibilityPolicies" | "structureMigrationDiagnostics" | "weeklyProductionControl" | "timesheet" | "planningWorkbench" | "shiftWorkOrders" | "shiftMasterBoard" | "employeeDesktop" | "contourAdmin" | "roles" | "operations" | "nomenclatureTypes" | "statuses";

export interface ReactMigrationScenarioOptions extends ReactMigrationIslandOptions {
  onRequestLegacy?(scope?: string): void;
}

function ReactMigrationScenario({ onRequestLegacy, payload, scenario }: { onRequestLegacy?(scope?: string): void; payload: unknown; scenario: ReactMigrationScenarioId }) {
  if (scenario === "componentTypes") return <ComponentTypesScenario payload={payload} />;
  if (scenario === "boards") return <BoardsScenario payload={payload} />;
  if (scenario === "structureEmployees") return <StructureEmployeesScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "structurePositions") return <StructurePositionsScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "structureOrgUnits") return <StructureOrgUnitsScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "structureWorkCenters") return <StructureWorkCentersScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "structureEquipment") return <StructureEquipmentScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "structureResponsibilityPolicies") return <StructureResponsibilityPoliciesScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "structureMigrationDiagnostics") return <StructureMigrationDiagnosticsScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "weeklyProductionControl") return <WeeklyProductionControlScenario payload={payload} />;
  if (scenario === "timesheet") return <TimesheetScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "planningWorkbench") return <PlanningWorkbenchScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "shiftWorkOrders") return <ShiftWorkOrdersScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "shiftMasterBoard") return <ShiftMasterBoardScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "employeeDesktop") return <EmployeeDesktopScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "contourAdmin") return <ContourAdminScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "roles") return <RolesScenario payload={payload} />;
  if (scenario === "operations") return <OperationsScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "nomenclatureTypes") return <NomenclatureTypesScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "statuses") return <StatusesScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  return <NomenclatureScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
}

export function mountReactMigrationIsland(
  target: HTMLElement,
  scenario: ReactMigrationScenarioId,
  initialPayload: unknown,
  options: ReactMigrationScenarioOptions = {},
): ReturnType<typeof mountReactIsland> {
  const { onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(
    target,
    (payload) => <ReactMigrationScenario onRequestLegacy={onRequestLegacy} payload={payload} scenario={scenario} />,
    initialPayload,
    runtimeOptions,
  );
}

export { mountNomenclatureReactIsland } from "./nomenclature-island";
export { mountBoardsReactIsland } from "./boards-island";
export { mountStructureEmployeesReactIsland } from "./structure-employees-island";
export { mountStructurePositionsReactIsland } from "./structure-positions-island";
export { mountStructureOrgUnitsReactIsland } from "./structure-org-units-island";
export { mountStructureWorkCentersReactIsland } from "./structure-work-centers-island";
export { mountStructureEquipmentReactIsland } from "./structure-equipment-island";
export { mountStructureResponsibilityPoliciesReactIsland } from "./structure-responsibility-policies-island";
export { mountStructureMigrationDiagnosticsReactIsland } from "./structure-migration-diagnostics-island";
export { mountWeeklyProductionControlReactIsland } from "./weekly-production-control-island";
export { mountTimesheetReactIsland } from "./timesheet-island";
export { mountPlanningWorkbenchReactIsland } from "./planning-workbench-island";
export { mountShiftWorkOrdersReactIsland } from "./shift-work-orders-island";
export { mountShiftMasterBoardReactIsland } from "./shift-master-board-island";
export { mountEmployeeDesktopReactIsland } from "./employee-desktop-island";
export { mountContourAdminReactIsland } from "./contour-admin-island";
export { mountRolesReactIsland } from "./roles-island";
export { mountComponentTypesReactIsland } from "./component-types-island";
export { mountOperationsReactIsland } from "./operations-island";
export { mountNomenclatureTypesReactIsland } from "./nomenclature-types-island";
export { mountStatusesReactIsland } from "./statuses-island";
export type { ReactMigrationIslandHandle, ReactMigrationIslandOptions, ReactMigrationIslandReadyEvent } from "./island-runtime";
