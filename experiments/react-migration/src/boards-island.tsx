import { BoardsScenario, type BoardsReactCommand } from "./modules/boards/BoardsScenario";
import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";

export interface BoardsIslandOptions extends ReactMigrationIslandOptions {
  onRequestItems?(): void;
  onSelectionChange?(boardId: string): void;
  onCommand?(command: BoardsReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
}

export function mountBoardsReactIsland(target: HTMLElement, initialPayload: unknown, options: BoardsIslandOptions = {}) {
  return mountReactIsland(target, (payload) => (
    <BoardsScenario
      onRequestItems={options.onRequestItems}
      onSelectionChange={options.onSelectionChange}
      onCommand={options.onCommand}
      payload={payload}
    />
  ), initialPayload, options);
}
