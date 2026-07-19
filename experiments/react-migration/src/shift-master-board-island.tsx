import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { ShiftMasterBoardScenario } from "./modules/shift-master-board/ShiftMasterBoardScenario";
export interface ShiftMasterBoardIslandOptions extends ReactMigrationIslandOptions { onRequestLegacy?(scope?: string): void }
export function mountShiftMasterBoardReactIsland(target: HTMLElement, initialPayload: unknown, options: ShiftMasterBoardIslandOptions = {}) { const { onRequestLegacy, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <ShiftMasterBoardScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions); }
