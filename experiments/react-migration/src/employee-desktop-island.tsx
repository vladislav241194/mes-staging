import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { EmployeeDesktopScenario } from "./modules/employee-desktop/EmployeeDesktopScenario";
export interface EmployeeDesktopIslandOptions extends ReactMigrationIslandOptions { onRequestLegacy?(scope?: string): void }
export function mountEmployeeDesktopReactIsland(target: HTMLElement, initialPayload: unknown, options: EmployeeDesktopIslandOptions = {}) { const { onRequestLegacy, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <EmployeeDesktopScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions); }
