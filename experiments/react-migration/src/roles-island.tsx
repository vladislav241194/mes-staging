import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { RolesScenario, type RolesReactCommand } from "./modules/roles/RolesScenario";

export interface RolesIslandOptions extends ReactMigrationIslandOptions {
  onCommand?(command: RolesReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
}

export function mountRolesReactIsland(target: HTMLElement, initialPayload: unknown, options: RolesIslandOptions = {}) {
  const { onCommand, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <RolesScenario payload={payload} onCommand={onCommand} />, initialPayload, runtimeOptions);
}
