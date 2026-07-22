import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { ComponentTypesScenario, type ComponentTypesReactCommand } from "./modules/component-types/ComponentTypesScenario";
import type { DirectorySectionId } from "./modules/directories/DirectorySectionNavigation";

export interface ComponentTypesIslandOptions extends ReactMigrationIslandOptions {
  onNavigateSection?(sectionId: DirectorySectionId): void;
  onRequestLegacy?(scope?: string): void;
  onCommand?(command: ComponentTypesReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
}

export function mountComponentTypesReactIsland(target: HTMLElement, initialPayload: unknown, options: ComponentTypesIslandOptions = {}) {
  const { onCommand, onNavigateSection, onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <ComponentTypesScenario payload={payload} onCommand={onCommand} onNavigateSection={onNavigateSection} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions);
}
