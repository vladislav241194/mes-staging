import { getProductionStructureWorkCenters } from "./production_structure_service.js";

export const workCenters = getProductionStructureWorkCenters();

export function createDefaultPlanningState() {
  return {
    version: 1,
    // Legacy compatibility only. Production planning is specification-centered;
    // historical project records are migrated into directoryState.specifications.
    projects: [],
    workCenters: structuredClone(workCenters),
    routes: [],
    routeSteps: [],
    slots: [],
    // Layer contract: slots store the plan, assignments store the issued shift
    // work snapshot, dispatchFacts store actuals, planningCorrections request
    // future replanning without overwriting the plan.
    shiftMasterAssignments: {},
    dispatchFacts: {},
    planningCorrections: {},
  };
}
