import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { ShiftMasterBoardScenario } from "./modules/shift-master-board/ShiftMasterBoardScenario";
export interface ShiftMasterBoardIslandOptions extends ReactMigrationIslandOptions { onSelectFocus?(focus: "all" | "mine" | "open" | "attention"): void; onRequestLegacy?(scope?: string): void }
export function mountShiftMasterBoardReactIsland(target: HTMLElement, initialPayload: unknown, options: ShiftMasterBoardIslandOptions = {}) { const { onSelectFocus, onRequestLegacy, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <ShiftMasterBoardScenario payload={payload} onSelectFocus={onSelectFocus} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions); }
