import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { GanttScenario } from "./modules/gantt/GanttScenario";
import type { GanttReactCommand } from "./modules/gantt/GanttScenario";

export function mountGanttReactIsland(target: HTMLElement, initialPayload: unknown, options: ReactMigrationIslandOptions & { onRequestLegacy?(scope?: string): void; onCommand?(command: GanttReactCommand): Promise<{ ok?: boolean; message?: string } | void> } = {}) {
  const { onCommand, onRequestLegacy, ...runtime } = options;
  return mountReactIsland(target, (payload) => <GanttScenario payload={payload} onCommand={onCommand} onRequestLegacy={onRequestLegacy} />, initialPayload, runtime);
}
