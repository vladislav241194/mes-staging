import { NomenclatureScenario, type NomenclatureReactCommand } from "./modules/nomenclature/NomenclatureScenario";
import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";

export interface NomenclatureReactIslandOptions extends ReactMigrationIslandOptions {
  onRequestBoards?(): void;
  onCommand?(command: NomenclatureReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
}

export function mountNomenclatureReactIsland(target: HTMLElement, initialPayload: unknown, options: NomenclatureReactIslandOptions = {}) {
  const { onCommand, onRequestBoards, ...runtimeOptions } = options;
  return mountReactIsland(target, (payload) => <NomenclatureScenario payload={payload} onCommand={onCommand} onRequestBoards={onRequestBoards} />, initialPayload, runtimeOptions);
}

export type {
  ReactMigrationIslandHandle,
  ReactMigrationIslandOptions,
  ReactMigrationIslandReadyEvent,
} from "./island-runtime";
