import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import type { DirectorySectionId } from "./modules/directories/DirectorySectionNavigation";
import { OperationsScenario, type OperationsReactCommand } from "./modules/operations/OperationsScenario";

export interface OperationsIslandOptions extends ReactMigrationIslandOptions {
  onNavigateSection?(sectionId: DirectorySectionId): void;
  onRequestLegacy?(): void;
  onCommand?(command: OperationsReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
}

export function mountOperationsReactIsland(target: HTMLElement, initialPayload: unknown, options: OperationsIslandOptions = {}) {
  const { onCommand, onNavigateSection, onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <OperationsScenario payload={payload} onCommand={onCommand} onNavigateSection={onNavigateSection} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions);
}
