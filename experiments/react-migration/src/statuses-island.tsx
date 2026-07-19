import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { StatusesScenario } from "./modules/statuses/StatusesScenario";

export interface StatusesIslandOptions extends ReactMigrationIslandOptions { onRequestLegacy?(): void }

export function mountStatusesReactIsland(target: HTMLElement, initialPayload: unknown, options: StatusesIslandOptions = {}) {
  const { onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <StatusesScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions);
}
