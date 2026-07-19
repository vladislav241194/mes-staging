import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { ComponentTypesScenario } from "./modules/component-types/ComponentTypesScenario";

export interface ComponentTypesIslandOptions extends ReactMigrationIslandOptions {
  onRequestLegacy?(): void;
}

export function mountComponentTypesReactIsland(target: HTMLElement, initialPayload: unknown, options: ComponentTypesIslandOptions = {}) {
  const { onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <ComponentTypesScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions);
}
