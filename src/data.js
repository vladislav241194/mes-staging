import { MES_WORK_CENTERS } from "./mes_org_model.js";

export const workCenters = MES_WORK_CENTERS;

export function createDefaultPlanningState() {
  return {
    version: 1,
    // Legacy compatibility only. Production planning is specification-centered;
    // historical project records are migrated into directoryState.specifications.
    projects: [],
    batches: [],
    workCenters: structuredClone(workCenters),
    routes: [],
    routeSteps: [],
    slots: [],
    warehouseMovements: [],
    warehouseReservations: [],
  };
}
