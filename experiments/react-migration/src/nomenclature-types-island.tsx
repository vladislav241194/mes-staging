import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { NomenclatureTypesScenario, type NomenclatureTypesReactCommand } from "./modules/nomenclature-types/NomenclatureTypesScenario";

export interface NomenclatureTypesIslandOptions extends ReactMigrationIslandOptions {
  onRequestLegacy?(): void;
  onCommand?(command: NomenclatureTypesReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
}

export function mountNomenclatureTypesReactIsland(target: HTMLElement, initialPayload: unknown, options: NomenclatureTypesIslandOptions = {}) {
  const { onCommand, onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <NomenclatureTypesScenario payload={payload} onCommand={onCommand} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions);
}
