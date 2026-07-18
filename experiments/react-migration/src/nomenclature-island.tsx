import { NomenclatureScenario } from "./modules/nomenclature/NomenclatureScenario";
import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";

export function mountNomenclatureReactIsland(target: HTMLElement, initialPayload: unknown, options: ReactMigrationIslandOptions = {}) {
  return mountReactIsland(target, (payload) => <NomenclatureScenario payload={payload} />, initialPayload, options);
}

export type {
  ReactMigrationIslandHandle,
  ReactMigrationIslandOptions,
  ReactMigrationIslandReadyEvent,
} from "./island-runtime";
