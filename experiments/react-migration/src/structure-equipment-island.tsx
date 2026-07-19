import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { StructureEquipmentScenario } from "./modules/structure-equipment/StructureEquipmentScenario";
export interface StructureEquipmentIslandOptions extends ReactMigrationIslandOptions { onRequestLegacy?(scope?: string): void }
export function mountStructureEquipmentReactIsland(target: HTMLElement, initialPayload: unknown, options: StructureEquipmentIslandOptions = {}) { const { onRequestLegacy, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <StructureEquipmentScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions); }
