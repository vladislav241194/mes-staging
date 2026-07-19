import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { TimesheetScenario } from "./modules/timesheet/TimesheetScenario";
export interface TimesheetIslandOptions extends ReactMigrationIslandOptions { onRequestLegacy?(scope?: string): void }
export function mountTimesheetReactIsland(target: HTMLElement, initialPayload: unknown, options: TimesheetIslandOptions = {}) { const { onRequestLegacy, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <TimesheetScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions); }
