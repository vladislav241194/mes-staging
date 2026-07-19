import { ComponentTypesScenario } from "./modules/component-types/ComponentTypesScenario";
import { BoardsScenario } from "./modules/boards/BoardsScenario";
import { NomenclatureScenario } from "./modules/nomenclature/NomenclatureScenario";
import { RolesReadScenario } from "./modules/roles/RolesReadScenario";
import { OperationsScenario } from "./modules/operations/OperationsScenario";
import { NomenclatureTypesScenario } from "./modules/nomenclature-types/NomenclatureTypesScenario";
import { StatusesScenario } from "./modules/statuses/StatusesScenario";
import { StructureEmployeesReadScenario } from "./modules/structure-employees/StructureEmployeesReadScenario";
import { StructurePositionsReadScenario } from "./modules/structure-positions/StructurePositionsReadScenario";
import { StructureOrgUnitsReadScenario } from "./modules/structure-org-units/StructureOrgUnitsReadScenario";
import { StructureWorkCentersReadScenario } from "./modules/structure-work-centers/StructureWorkCentersReadScenario";
import { StructureEquipmentReadScenario } from "./modules/structure-equipment/StructureEquipmentReadScenario";
import { StructureResponsibilityPoliciesReadScenario } from "./modules/structure-responsibility-policies/StructureResponsibilityPoliciesReadScenario";
import { StructureMigrationDiagnosticsScenario } from "./modules/structure-migration-diagnostics/StructureMigrationDiagnosticsScenario";
import { WeeklyProductionControlScenario } from "./modules/weekly-production-control/WeeklyProductionControlScenario";
import { TimesheetReadScenario } from "./modules/timesheet/TimesheetReadScenario";
import { PlanningWorkbenchReadScenario } from "./modules/planning-workbench/PlanningWorkbenchReadScenario";
import { ShiftWorkOrdersScenario } from "./modules/shift-work-orders/ShiftWorkOrdersScenario";
import { ShiftMasterBoardScenario, type ShiftMasterBoardAssignmentCommand } from "./modules/shift-master-board/ShiftMasterBoardScenario";
import { EmployeeDesktopScenario, type EmployeeDesktopReactCommand } from "./modules/employee-desktop/EmployeeDesktopScenario";
import { ContourAdminScenario } from "./modules/contour-admin/ContourAdminScenario";
import { Specifications2Scenario } from "./modules/specifications2/Specifications2Scenario";
import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";

export type ReactMigrationScenarioId = "nomenclature" | "componentTypes" | "boards" | "structureEmployees" | "structurePositions" | "structureOrgUnits" | "structureWorkCenters" | "structureEquipment" | "structureResponsibilityPolicies" | "structureMigrationDiagnostics" | "weeklyProductionControl" | "timesheet" | "planningWorkbench" | "shiftWorkOrders" | "shiftMasterBoard" | "employeeDesktop" | "contourAdmin" | "specifications2" | "roles" | "operations" | "nomenclatureTypes" | "statuses";

export interface ReactMigrationScenarioOptions extends ReactMigrationIslandOptions {
  onLoadShiftWorkOrderPrintPackage?(rowId: string): Promise<unknown>;
  onLoadShiftWorkOrderPrintRenderer?(): Promise<typeof import("./modules/shift-work-orders/ShiftWorkOrderPrintPreviews")>;
  onPrintDocument?(title: string): void;
  onSelectShiftMasterBoardFocus?(focus: "all" | "mine" | "open" | "attention"): void;
  onShiftMasterBoardCommand?(command: ShiftMasterBoardAssignmentCommand): Promise<{ ok?: boolean; message?: string } | void>;
  onEmployeeDesktopCommand?(command: EmployeeDesktopReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
  onRequestLegacy?(scope?: string): void;
}

function ReactMigrationScenario({ onLoadShiftWorkOrderPrintPackage, onLoadShiftWorkOrderPrintRenderer, onPrintDocument, onSelectShiftMasterBoardFocus, onShiftMasterBoardCommand, onEmployeeDesktopCommand, onRequestLegacy, payload, scenario }: { onLoadShiftWorkOrderPrintPackage?(rowId: string): Promise<unknown>; onLoadShiftWorkOrderPrintRenderer?(): Promise<typeof import("./modules/shift-work-orders/ShiftWorkOrderPrintPreviews")>; onPrintDocument?(title: string): void; onSelectShiftMasterBoardFocus?(focus: "all" | "mine" | "open" | "attention"): void; onShiftMasterBoardCommand?(command: ShiftMasterBoardAssignmentCommand): Promise<{ ok?: boolean; message?: string } | void>; onEmployeeDesktopCommand?(command: EmployeeDesktopReactCommand): Promise<{ ok?: boolean; message?: string } | void>; onRequestLegacy?(scope?: string): void; payload: unknown; scenario: ReactMigrationScenarioId }) {
  if (scenario === "componentTypes") return <ComponentTypesScenario payload={payload} />;
  if (scenario === "boards") return <BoardsScenario payload={payload} />;
  if (scenario === "structureEmployees") return <StructureEmployeesReadScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "structurePositions") return <StructurePositionsReadScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "structureOrgUnits") return <StructureOrgUnitsReadScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "structureWorkCenters") return <StructureWorkCentersReadScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "structureEquipment") return <StructureEquipmentReadScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "structureResponsibilityPolicies") return <StructureResponsibilityPoliciesReadScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "structureMigrationDiagnostics") return <StructureMigrationDiagnosticsScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "weeklyProductionControl") return <WeeklyProductionControlScenario payload={payload} />;
  if (scenario === "timesheet") return <TimesheetReadScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "planningWorkbench") return <PlanningWorkbenchReadScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "shiftWorkOrders") return <ShiftWorkOrdersScenario onLoadPrintPackage={onLoadShiftWorkOrderPrintPackage} onLoadPrintRenderer={onLoadShiftWorkOrderPrintRenderer} onPrintDocument={onPrintDocument} payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "shiftMasterBoard") return <ShiftMasterBoardScenario payload={payload} onCommand={onShiftMasterBoardCommand} onSelectFocus={onSelectShiftMasterBoardFocus} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "employeeDesktop") return <EmployeeDesktopScenario payload={payload} onCommand={onEmployeeDesktopCommand} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "contourAdmin") return <ContourAdminScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "specifications2") return <Specifications2Scenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "roles") return <RolesReadScenario payload={payload} />;
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
  const { onLoadShiftWorkOrderPrintPackage, onLoadShiftWorkOrderPrintRenderer, onPrintDocument, onSelectShiftMasterBoardFocus, onShiftMasterBoardCommand, onEmployeeDesktopCommand, onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(
    target,
    (payload) => <ReactMigrationScenario onLoadShiftWorkOrderPrintPackage={onLoadShiftWorkOrderPrintPackage} onLoadShiftWorkOrderPrintRenderer={onLoadShiftWorkOrderPrintRenderer} onPrintDocument={onPrintDocument} onSelectShiftMasterBoardFocus={onSelectShiftMasterBoardFocus} onShiftMasterBoardCommand={onShiftMasterBoardCommand} onEmployeeDesktopCommand={onEmployeeDesktopCommand} onRequestLegacy={onRequestLegacy} payload={payload} scenario={scenario} />,
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
export { mountSpecifications2ReactIsland } from "./specifications2-island";
export { mountRolesReactIsland } from "./roles-island";
export { mountComponentTypesReactIsland } from "./component-types-island";
export { mountOperationsReactIsland } from "./operations-island";
export { mountNomenclatureTypesReactIsland } from "./nomenclature-types-island";
export { mountStatusesReactIsland } from "./statuses-island";
export type { ReactMigrationIslandHandle, ReactMigrationIslandOptions, ReactMigrationIslandReadyEvent } from "./island-runtime";
