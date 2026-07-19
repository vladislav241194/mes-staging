import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { Specifications2Scenario } from "./modules/specifications2/Specifications2Scenario";

export function mountSpecifications2ReactIsland(target: HTMLElement, initialPayload: unknown, options: ReactMigrationIslandOptions & { onRequestLegacy?(scope?: string): void } = {}) {
  const { onRequestLegacy, ...runtime } = options;
  return mountReactIsland(target, (payload) => <Specifications2Scenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtime);
}
