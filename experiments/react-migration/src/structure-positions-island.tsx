import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { StructurePositionsScenario } from "./modules/structure-positions/StructurePositionsScenario";
export interface StructurePositionsIslandOptions extends ReactMigrationIslandOptions { onRequestLegacy?(scope?: string): void }
export function mountStructurePositionsReactIsland(target: HTMLElement, initialPayload: unknown, options: StructurePositionsIslandOptions = {}) { const { onRequestLegacy, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <StructurePositionsScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions); }
