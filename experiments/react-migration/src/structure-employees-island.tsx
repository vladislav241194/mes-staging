import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { StructureEmployeesScenario } from "./modules/structure-employees/StructureEmployeesScenario";

export interface StructureEmployeesIslandOptions extends ReactMigrationIslandOptions {
  onRequestLegacy?(): void;
}

export function mountStructureEmployeesReactIsland(target: HTMLElement, initialPayload: unknown, options: StructureEmployeesIslandOptions = {}) {
  const { onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <StructureEmployeesScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions);
}
