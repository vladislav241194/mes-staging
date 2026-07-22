import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import type { DirectorySectionId } from "./modules/directories/DirectorySectionNavigation";
import { NomenclatureTypesScenario, type NomenclatureTypesReactCommand } from "./modules/nomenclature-types/NomenclatureTypesScenario";

export interface NomenclatureTypesIslandOptions extends ReactMigrationIslandOptions {
  onNavigateSection?(sectionId: DirectorySectionId): void;
  onRequestLegacy?(): void;
  onCommand?(command: NomenclatureTypesReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
}

export function mountNomenclatureTypesReactIsland(target: HTMLElement, initialPayload: unknown, options: NomenclatureTypesIslandOptions = {}) {
  const { onCommand, onNavigateSection, onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <NomenclatureTypesScenario payload={payload} onCommand={onCommand} onNavigateSection={onNavigateSection} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions);
}
