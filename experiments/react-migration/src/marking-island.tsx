import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { MarkingScenario } from "./modules/marking/MarkingScenario";

export function mountMarkingReactIsland(target: HTMLElement, initialPayload: unknown, options: ReactMigrationIslandOptions = {}) {
  return mountReactIsland(target, (payload) => <MarkingScenario payload={payload} />, initialPayload, options);
}
