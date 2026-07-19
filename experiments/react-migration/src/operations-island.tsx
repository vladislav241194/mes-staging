import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { OperationsScenario, type OperationsReactCommand } from "./modules/operations/OperationsScenario";

export interface OperationsIslandOptions extends ReactMigrationIslandOptions {
  onRequestLegacy?(): void;
  onCommand?(command: OperationsReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
}

export function mountOperationsReactIsland(target: HTMLElement, initialPayload: unknown, options: OperationsIslandOptions = {}) {
  const { onCommand, onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <OperationsScenario payload={payload} onCommand={onCommand} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions);
}
