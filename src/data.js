import { DEFAULT_PRODUCTION_WORK_CENTERS } from "./production_structure_default_work_centers.js";

// The default plan must be available before the optional full production
// structure editor is fetched.  The generated projection deliberately keeps
// only the planning contract, not the whole legacy matrix.
export const workCenters = DEFAULT_PRODUCTION_WORK_CENTERS;

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
