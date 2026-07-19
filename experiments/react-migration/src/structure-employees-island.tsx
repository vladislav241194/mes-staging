import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { StructureEmployeesScenario, type StructureEmployeesReactCommand } from "./modules/structure-employees/StructureEmployeesScenario";

export interface StructureEmployeesIslandOptions extends ReactMigrationIslandOptions {
  onRequestLegacy?(scope?: string): void;
  onCommand?(command: StructureEmployeesReactCommand): Promise<{ ok?: boolean; id?: string; message?: string } | void>;
}

export function mountStructureEmployeesReactIsland(target: HTMLElement, initialPayload: unknown, options: StructureEmployeesIslandOptions = {}) {
  const { onCommand, onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <StructureEmployeesScenario payload={payload} onCommand={onCommand} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions);
}
