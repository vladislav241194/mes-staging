import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { DispatchScenario } from "./modules/dispatch/DispatchScenario";

export function mountDispatchReactIsland(target: HTMLElement, initialPayload: unknown, options: ReactMigrationIslandOptions = {}) {
  return mountReactIsland(target, () => <DispatchScenario />, initialPayload, options);
}
