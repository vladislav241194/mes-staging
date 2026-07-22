import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { Specifications2Scenario } from "./modules/specifications2/Specifications2Scenario";
import type { Specifications2ReactCommand } from "./modules/specifications2/Specifications2Scenario";

export function mountSpecifications2ReactIsland(target: HTMLElement, initialPayload: unknown, options: ReactMigrationIslandOptions & { onCommand?(command: Specifications2ReactCommand): Promise<{ ok?: boolean; message?: string } | void> } = {}) {
  const { onCommand, ...runtime } = options;
  return mountReactIsland(target, (payload) => <Specifications2Scenario payload={payload} onCommand={onCommand} />, initialPayload, runtime);
}
