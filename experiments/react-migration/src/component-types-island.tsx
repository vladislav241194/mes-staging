import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { ComponentTypesScenario, type ComponentTypesReactCommand } from "./modules/component-types/ComponentTypesScenario";

export interface ComponentTypesIslandOptions extends ReactMigrationIslandOptions {
  onRequestLegacy?(scope?: string): void;
  onCommand?(command: ComponentTypesReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
}

export function mountComponentTypesReactIsland(target: HTMLElement, initialPayload: unknown, options: ComponentTypesIslandOptions = {}) {
  const { onCommand, onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <ComponentTypesScenario payload={payload} onCommand={onCommand} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions);
}
