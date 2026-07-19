import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { TimesheetScenario, type TimesheetReactCommand } from "./modules/timesheet/TimesheetScenario";
export interface TimesheetIslandOptions extends ReactMigrationIslandOptions { onCommand?(command: TimesheetReactCommand): Promise<{ ok?: boolean; message?: string } | void>; onRequestLegacy?(scope?: string): void }
export function mountTimesheetReactIsland(target: HTMLElement, initialPayload: unknown, options: TimesheetIslandOptions = {}) { const { onCommand, onRequestLegacy, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <TimesheetScenario payload={payload} onCommand={onCommand} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions); }
