import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { StructureEquipmentScenario, type StructureEquipmentReactCommand } from "./modules/structure-equipment/StructureEquipmentScenario";
import type { StructureRegistryId } from "./modules/structure-employees/adapter";
export interface StructureEquipmentIslandOptions extends ReactMigrationIslandOptions { onCommand?(command: StructureEquipmentReactCommand): Promise<{ ok?: boolean; id?: string; message?: string } | void>; onNavigateRegistry?(registryId: StructureRegistryId): void }
export function mountStructureEquipmentReactIsland(target: HTMLElement, initialPayload: unknown, options: StructureEquipmentIslandOptions = {}) { const { onCommand, onNavigateRegistry, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <StructureEquipmentScenario payload={payload} onCommand={onCommand} onNavigateRegistry={onNavigateRegistry} />, initialPayload, runtimeOptions); }
