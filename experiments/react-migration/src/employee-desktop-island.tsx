import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { EmployeeDesktopScenario, type EmployeeDesktopReactCommand, type EmployeeDesktopReactCommandResult } from "./modules/employee-desktop/EmployeeDesktopScenario";
export interface EmployeeDesktopIslandOptions extends ReactMigrationIslandOptions { onCommand?(command: EmployeeDesktopReactCommand): Promise<EmployeeDesktopReactCommandResult | void> }
export function mountEmployeeDesktopReactIsland(target: HTMLElement, initialPayload: unknown, options: EmployeeDesktopIslandOptions = {}) { const { onCommand, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <EmployeeDesktopScenario payload={payload} onCommand={onCommand} />, initialPayload, runtimeOptions); }
