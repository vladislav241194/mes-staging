import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import type { DirectorySectionId } from "./modules/directories/DirectorySectionNavigation";
import { StatusesScenario, type StatusesReactCommand } from "./modules/statuses/StatusesScenario";

export interface StatusesIslandOptions extends ReactMigrationIslandOptions {
  onNavigateSection?(sectionId: DirectorySectionId): void;
  onCommand?(command: StatusesReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
}

export function mountStatusesReactIsland(target: HTMLElement, initialPayload: unknown, options: StatusesIslandOptions = {}) {
  const { onCommand, onNavigateSection, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <StatusesScenario payload={payload} onCommand={onCommand} onNavigateSection={onNavigateSection} />, initialPayload, runtimeOptions);
}
