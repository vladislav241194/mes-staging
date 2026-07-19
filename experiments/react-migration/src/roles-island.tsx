import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { RolesScenario } from "./modules/roles/RolesScenario";

export function mountRolesReactIsland(target: HTMLElement, initialPayload: unknown, options: ReactMigrationIslandOptions = {}) {
  return mountReactIsland(target, (payload) => <RolesScenario payload={payload} />, initialPayload, options);
}
