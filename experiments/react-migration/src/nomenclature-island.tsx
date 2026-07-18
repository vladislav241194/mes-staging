import { NomenclatureScenario } from "./modules/nomenclature/NomenclatureScenario";
import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";

export interface NomenclatureReactIslandOptions extends ReactMigrationIslandOptions {
  onRequestLegacy?(): void;
}

export function mountNomenclatureReactIsland(target: HTMLElement, initialPayload: unknown, options: NomenclatureReactIslandOptions = {}) {
  const { onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <NomenclatureScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions);
}

export type {
  ReactMigrationIslandHandle,
  ReactMigrationIslandOptions,
  ReactMigrationIslandReadyEvent,
} from "./island-runtime";
