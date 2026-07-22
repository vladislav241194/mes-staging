import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { GanttScenario } from "./modules/gantt/GanttScenario";
import type { GanttReactCommand, GanttReactNavigation } from "./modules/gantt/GanttScenario";

export function mountGanttReactIsland(target: HTMLElement, initialPayload: unknown, options: ReactMigrationIslandOptions & { onCommand?(command: GanttReactCommand): Promise<{ ok?: boolean; message?: string } | void>; onNavigate?(navigation: GanttReactNavigation): Promise<{ ok?: boolean; message?: string } | void> } = {}) {
  const { onCommand, onNavigate, ...runtime } = options;
  return mountReactIsland(target, (payload) => <GanttScenario payload={payload} onCommand={onCommand} onNavigate={onNavigate} />, initialPayload, runtime);
}
