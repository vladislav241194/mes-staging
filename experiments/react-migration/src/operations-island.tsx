import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import type { DirectorySectionId } from "./modules/directories/DirectorySectionNavigation";
import { OperationsScenario, type OperationsReactCommand } from "./modules/operations/OperationsScenario";

export interface OperationsIslandOptions extends ReactMigrationIslandOptions {
  onNavigateSection?(sectionId: DirectorySectionId): void;
  onCommand?(command: OperationsReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
}

export function mountOperationsReactIsland(target: HTMLElement, initialPayload: unknown, options: OperationsIslandOptions = {}) {
  const { onCommand, onNavigateSection, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <OperationsScenario payload={payload} onCommand={onCommand} onNavigateSection={onNavigateSection} />, initialPayload, runtimeOptions);
}
