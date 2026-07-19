import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { PlanningWorkbenchScenario, type PlanningWorkbenchReactNavigation } from "./modules/planning-workbench/PlanningWorkbenchScenario";
export interface PlanningWorkbenchIslandOptions extends ReactMigrationIslandOptions { onNavigate?(navigation: PlanningWorkbenchReactNavigation): Promise<{ ok?: boolean; message?: string } | void> }
export function mountPlanningWorkbenchReactIsland(target: HTMLElement, initialPayload: unknown, options: PlanningWorkbenchIslandOptions = {}) { const { onNavigate, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <PlanningWorkbenchScenario payload={payload} onNavigate={onNavigate} />, initialPayload, runtimeOptions); }
