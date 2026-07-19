import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { NomenclatureTypesScenario } from "./modules/nomenclature-types/NomenclatureTypesScenario";

export interface NomenclatureTypesIslandOptions extends ReactMigrationIslandOptions { onRequestLegacy?(): void }

export function mountNomenclatureTypesReactIsland(target: HTMLElement, initialPayload: unknown, options: NomenclatureTypesIslandOptions = {}) {
  const { onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <NomenclatureTypesScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions);
}
