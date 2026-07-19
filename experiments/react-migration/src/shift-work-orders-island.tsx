import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { ShiftWorkOrdersScenario } from "./modules/shift-work-orders/ShiftWorkOrdersScenario";
export interface ShiftWorkOrdersIslandOptions extends ReactMigrationIslandOptions { onRequestLegacy?(scope?: string): void }
export function mountShiftWorkOrdersReactIsland(target: HTMLElement, initialPayload: unknown, options: ShiftWorkOrdersIslandOptions = {}) { const { onRequestLegacy, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <ShiftWorkOrdersScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions); }
