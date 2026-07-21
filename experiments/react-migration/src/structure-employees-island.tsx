import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { StructureEmployeesScenario, type StructureEmployeesReactCommand } from "./modules/structure-employees/StructureEmployeesScenario";
import type { StructureRegistryId } from "./modules/structure-employees/adapter";

export interface StructureEmployeesIslandOptions extends ReactMigrationIslandOptions {
  onNavigateRegistry?(registryId: StructureRegistryId): void;
  onCommand?(command: StructureEmployeesReactCommand): Promise<{ ok?: boolean; id?: string; message?: string } | void>;
}

export function mountStructureEmployeesReactIsland(target: HTMLElement, initialPayload: unknown, options: StructureEmployeesIslandOptions = {}) {
  const { onCommand, onNavigateRegistry, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <StructureEmployeesScenario payload={payload} onCommand={onCommand} onNavigateRegistry={onNavigateRegistry} />, initialPayload, runtimeOptions);
}
