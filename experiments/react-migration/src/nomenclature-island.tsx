import { NomenclatureScenario, type NomenclatureReactCommand } from "./modules/nomenclature/NomenclatureScenario";
import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";

export interface NomenclatureReactIslandOptions extends ReactMigrationIslandOptions {
  onRequestLegacy?(scope?: string): void;
  onCommand?(command: NomenclatureReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
}

export function mountNomenclatureReactIsland(target: HTMLElement, initialPayload: unknown, options: NomenclatureReactIslandOptions = {}) {
  const { onCommand, onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <NomenclatureScenario payload={payload} onCommand={onCommand} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions);
}

export type {
  ReactMigrationIslandHandle,
  ReactMigrationIslandOptions,
  ReactMigrationIslandReadyEvent,
} from "./island-runtime";
