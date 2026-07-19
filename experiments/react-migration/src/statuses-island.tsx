import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { StatusesScenario, type StatusesReactCommand } from "./modules/statuses/StatusesScenario";

export interface StatusesIslandOptions extends ReactMigrationIslandOptions {
  onRequestLegacy?(): void;
  onCommand?(command: StatusesReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
}

export function mountStatusesReactIsland(target: HTMLElement, initialPayload: unknown, options: StatusesIslandOptions = {}) {
  const { onCommand, onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <StatusesScenario payload={payload} onCommand={onCommand} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions);
}
