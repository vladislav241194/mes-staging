import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { StructurePositionsScenario, type StructurePositionsReactCommand } from "./modules/structure-positions/StructurePositionsScenario";
import type { StructureRegistryId } from "./modules/structure-employees/adapter";
export interface StructurePositionsIslandOptions extends ReactMigrationIslandOptions { onNavigateRegistry?(registryId: StructureRegistryId): void; onCommand?(command: StructurePositionsReactCommand): Promise<{ ok?: boolean; id?: string; message?: string } | void> }
export function mountStructurePositionsReactIsland(target: HTMLElement, initialPayload: unknown, options: StructurePositionsIslandOptions = {}) { const { onCommand, onNavigateRegistry, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <StructurePositionsScenario payload={payload} onCommand={onCommand} onNavigateRegistry={onNavigateRegistry} />, initialPayload, runtimeOptions); }
