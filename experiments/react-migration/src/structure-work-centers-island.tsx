import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { StructureWorkCentersScenario } from "./modules/structure-work-centers/StructureWorkCentersScenario";
export interface StructureWorkCentersIslandOptions extends ReactMigrationIslandOptions { onRequestLegacy?(scope?: string): void }
export function mountStructureWorkCentersReactIsland(target: HTMLElement, initialPayload: unknown, options: StructureWorkCentersIslandOptions = {}) { const { onRequestLegacy, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <StructureWorkCentersScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions); }
