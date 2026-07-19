import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { WeeklyProductionControlScenario } from "./modules/weekly-production-control/WeeklyProductionControlScenario";

export function mountWeeklyProductionControlReactIsland(target: HTMLElement, initialPayload: unknown, options: ReactMigrationIslandOptions = {}) {
  return mountReactIsland(target, (payload) => <WeeklyProductionControlScenario payload={payload} />, initialPayload, options);
}
