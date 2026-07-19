import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { OperationsScenario } from "./modules/operations/OperationsScenario";

export interface OperationsIslandOptions extends ReactMigrationIslandOptions {
  onRequestLegacy?(): void;
}

export function mountOperationsReactIsland(target: HTMLElement, initialPayload: unknown, options: OperationsIslandOptions = {}) {
  const { onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <OperationsScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions);
}
