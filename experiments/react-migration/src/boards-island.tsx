import { BoardsScenario } from "./modules/boards/BoardsScenario";
import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";

export function mountBoardsReactIsland(target: HTMLElement, initialPayload: unknown, options: ReactMigrationIslandOptions = {}) {
  return mountReactIsland(target, (payload) => <BoardsScenario payload={payload} />, initialPayload, options);
}
