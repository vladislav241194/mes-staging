import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { GanttScenario } from "./modules/gantt/GanttScenario";

export function mountGanttReactIsland(target: HTMLElement, initialPayload: unknown, options: ReactMigrationIslandOptions & { onRequestLegacy?(scope?: string): void } = {}) {
  const { onRequestLegacy, ...runtime } = options;
  return mountReactIsland(target, (payload) => <GanttScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtime);
}
