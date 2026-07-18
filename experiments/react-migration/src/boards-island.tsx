import { BoardsScenario } from "./modules/boards/BoardsScenario";
import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";

export interface BoardsIslandOptions extends ReactMigrationIslandOptions {
  onRequestItems?(): void;
  onSelectionChange?(boardId: string): void;
}

export function mountBoardsReactIsland(target: HTMLElement, initialPayload: unknown, options: BoardsIslandOptions = {}) {
  return mountReactIsland(target, (payload) => (
    <BoardsScenario
      onRequestItems={options.onRequestItems}
      onSelectionChange={options.onSelectionChange}
      payload={payload}
    />
  ), initialPayload, options);
}
