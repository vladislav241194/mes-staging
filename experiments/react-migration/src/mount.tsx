import { ComponentTypesScenario } from "./modules/component-types/ComponentTypesScenario";
import { BoardsReadScenario } from "./modules/boards/BoardsReadScenario";
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
import type { StructureRegistryId } from "./modules/structure-employees/adapter";
import { WeeklyProductionControlScenario } from "./modules/weekly-production-control/WeeklyProductionControlScenario";
import { TimesheetReadScenario } from "./modules/timesheet/TimesheetReadScenario";
import type { TimesheetNavigationCommand } from "./modules/timesheet/TimesheetScenario";
import { PlanningWorkbenchReadScenario } from "./modules/planning-workbench/PlanningWorkbenchReadScenario";
import { ShiftWorkOrdersScenario, type ShiftWorkOrdersReactNavigation } from "./modules/shift-work-orders/ShiftWorkOrdersScenario";
import { ShiftMasterBoardScenario, type ShiftMasterBoardCommand } from "./modules/shift-master-board/ShiftMasterBoardScenario";
import { EmployeeDesktopScenario, type EmployeeDesktopReactCommand } from "./modules/employee-desktop/EmployeeDesktopScenario";
import { ContourAdminScenario } from "./modules/contour-admin/ContourAdminScenario";
import { Specifications2Scenario } from "./modules/specifications2/Specifications2Scenario";
import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";

export type ReactMigrationScenarioId = "nomenclature" | "componentTypes" | "boards" | "structureEmployees" | "structurePositions" | "structureOrgUnits" | "structureWorkCenters" | "structureEquipment" | "structureResponsibilityPolicies" | "structureMigrationDiagnostics" | "weeklyProductionControl" | "timesheet" | "planningWorkbench" | "shiftWorkOrders" | "shiftMasterBoard" | "employeeDesktop" | "contourAdmin" | "specifications2" | "roles" | "operations" | "nomenclatureTypes" | "statuses";

export interface ReactMigrationScenarioOptions extends ReactMigrationIslandOptions {
  onLoadShiftWorkOrderPrintPackage?(rowId: string): Promise<unknown>;
  onLoadShiftWorkOrderPrintRenderer?(): Promise<typeof import("./modules/shift-work-orders/ShiftWorkOrderPrintPreviews")>;
  onTimesheetNavigate?(command: TimesheetNavigationCommand): Promise<{ ok?: boolean; message?: string } | void>;
  onShiftWorkOrdersNavigate?(navigation: ShiftWorkOrdersReactNavigation): Promise<{ ok?: boolean; message?: string } | void>;
  onPrintDocument?(title: string): void;
  onSelectShiftMasterBoardDate?(dateKey: string): void;
  onSelectShiftMasterBoardFocus?(focus: "all" | "mine" | "open" | "attention"): void;
  onSelectShiftMasterBoardMaster?(masterId: string): void;
  onOpenShiftMasterBoardCarryover?(dateKey: string, carryoverId: string): void;
  onOpenShiftMasterBoardSource?(dateKey: string, sourceRowId: string): void;
  onShiftMasterBoardCommand?(command: ShiftMasterBoardCommand): Promise<{ ok?: boolean; message?: string } | void>;
  onEmployeeDesktopCommand?(command: EmployeeDesktopReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
  onNavigateRegistry?(registryId: StructureRegistryId): void;
  onRequestLegacy?(scope?: string): void;
}

function ReactMigrationScenario({ onLoadShiftWorkOrderPrintPackage, onLoadShiftWorkOrderPrintRenderer, onPrintDocument, onOpenShiftMasterBoardCarryover, onOpenShiftMasterBoardSource, onSelectShiftMasterBoardDate, onSelectShiftMasterBoardFocus, onSelectShiftMasterBoardMaster, onTimesheetNavigate, onShiftWorkOrdersNavigate, onShiftMasterBoardCommand, onEmployeeDesktopCommand, onNavigateRegistry, onRequestLegacy, payload, scenario }: { onLoadShiftWorkOrderPrintPackage?(rowId: string): Promise<unknown>; onLoadShiftWorkOrderPrintRenderer?(): Promise<typeof import("./modules/shift-work-orders/ShiftWorkOrderPrintPreviews")>; onPrintDocument?(title: string): void; onOpenShiftMasterBoardCarryover?(dateKey: string, carryoverId: string): void; onOpenShiftMasterBoardSource?(dateKey: string, sourceRowId: string): void; onSelectShiftMasterBoardDate?(dateKey: string): void; onSelectShiftMasterBoardFocus?(focus: "all" | "mine" | "open" | "attention"): void; onSelectShiftMasterBoardMaster?(masterId: string): void; onTimesheetNavigate?(command: TimesheetNavigationCommand): Promise<{ ok?: boolean; message?: string } | void>; onShiftWorkOrdersNavigate?(navigation: ShiftWorkOrdersReactNavigation): Promise<{ ok?: boolean; message?: string } | void>; onShiftMasterBoardCommand?(command: ShiftMasterBoardCommand): Promise<{ ok?: boolean; message?: string } | void>; onEmployeeDesktopCommand?(command: EmployeeDesktopReactCommand): Promise<{ ok?: boolean; message?: string } | void>; onNavigateRegistry?(registryId: StructureRegistryId): void; onRequestLegacy?(scope?: string): void; payload: unknown; scenario: ReactMigrationScenarioId }) {
  if (scenario === "componentTypes") return <ComponentTypesScenario payload={payload} />;
  if (scenario === "boards") return <BoardsReadScenario payload={payload} />;
  if (scenario === "structureEmployees") return <StructureEmployeesReadScenario payload={payload} onNavigateRegistry={onNavigateRegistry} />;
  if (scenario === "structurePositions") return <StructurePositionsReadScenario payload={payload} onNavigateRegistry={onNavigateRegistry} />;
  if (scenario === "structureOrgUnits") return <StructureOrgUnitsReadScenario payload={payload} onNavigateRegistry={onNavigateRegistry} />;
  if (scenario === "structureWorkCenters") return <StructureWorkCentersReadScenario payload={payload} onNavigateRegistry={onNavigateRegistry} />;
  if (scenario === "structureEquipment") return <StructureEquipmentReadScenario payload={payload} onNavigateRegistry={onNavigateRegistry} />;
  if (scenario === "structureResponsibilityPolicies") return <StructureResponsibilityPoliciesReadScenario payload={payload} onNavigateRegistry={onNavigateRegistry} />;
  if (scenario === "structureMigrationDiagnostics") return <StructureMigrationDiagnosticsScenario payload={payload} onNavigateRegistry={onNavigateRegistry} />;
  if (scenario === "weeklyProductionControl") return <WeeklyProductionControlScenario payload={payload} />;
  if (scenario === "timesheet") return <TimesheetReadScenario payload={payload} onNavigate={onTimesheetNavigate} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "planningWorkbench") return <PlanningWorkbenchReadScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "shiftWorkOrders") return <ShiftWorkOrdersScenario onLoadPrintPackage={onLoadShiftWorkOrderPrintPackage} onLoadPrintRenderer={onLoadShiftWorkOrderPrintRenderer} onNavigate={onShiftWorkOrdersNavigate} onPrintDocument={onPrintDocument} payload={payload} />;
  if (scenario === "shiftMasterBoard") return <ShiftMasterBoardScenario payload={payload} onCommand={onShiftMasterBoardCommand} onLoadPrintRenderer={onLoadShiftWorkOrderPrintRenderer} onOpenCarryover={onOpenShiftMasterBoardCarryover} onOpenSource={onOpenShiftMasterBoardSource} onPrintDocument={(_rowId, _employeeId, title) => onPrintDocument?.(title)} onSelectDate={onSelectShiftMasterBoardDate} onSelectFocus={onSelectShiftMasterBoardFocus} onSelectMaster={onSelectShiftMasterBoardMaster} />;
  if (scenario === "employeeDesktop") return <EmployeeDesktopScenario payload={payload} onCommand={onEmployeeDesktopCommand} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "contourAdmin") return <ContourAdminScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "specifications2") return <Specifications2Scenario payload={payload} />;
  if (scenario === "roles") return <RolesReadScenario payload={payload} />;
  if (scenario === "operations") return <OperationsScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "nomenclatureTypes") return <NomenclatureTypesScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "statuses") return <StatusesScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  return <NomenclatureScenario payload={payload} onRequestBoards={() => { location.search = "?scenario=boards"; }} />;
}

export function mountReactMigrationIsland(
  target: HTMLElement,
  scenario: ReactMigrationScenarioId,
  initialPayload: unknown,
  options: ReactMigrationScenarioOptions = {},
): ReturnType<typeof mountReactIsland> {
  const { onLoadShiftWorkOrderPrintPackage, onLoadShiftWorkOrderPrintRenderer, onPrintDocument, onOpenShiftMasterBoardCarryover, onOpenShiftMasterBoardSource, onSelectShiftMasterBoardDate, onSelectShiftMasterBoardFocus, onSelectShiftMasterBoardMaster, onTimesheetNavigate, onShiftWorkOrdersNavigate, onShiftMasterBoardCommand, onEmployeeDesktopCommand, onNavigateRegistry, onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(
    target,
    (payload) => <ReactMigrationScenario onLoadShiftWorkOrderPrintPackage={onLoadShiftWorkOrderPrintPackage} onLoadShiftWorkOrderPrintRenderer={onLoadShiftWorkOrderPrintRenderer} onPrintDocument={onPrintDocument} onOpenShiftMasterBoardCarryover={onOpenShiftMasterBoardCarryover} onOpenShiftMasterBoardSource={onOpenShiftMasterBoardSource} onSelectShiftMasterBoardDate={onSelectShiftMasterBoardDate} onSelectShiftMasterBoardFocus={onSelectShiftMasterBoardFocus} onSelectShiftMasterBoardMaster={onSelectShiftMasterBoardMaster} onTimesheetNavigate={onTimesheetNavigate} onShiftWorkOrdersNavigate={onShiftWorkOrdersNavigate} onShiftMasterBoardCommand={onShiftMasterBoardCommand} onEmployeeDesktopCommand={onEmployeeDesktopCommand} onNavigateRegistry={onNavigateRegistry} onRequestLegacy={onRequestLegacy} payload={payload} scenario={scenario} />,
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
