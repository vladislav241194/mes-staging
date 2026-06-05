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
  };
}

export function createProductionBundle({ specificationId, name, orderNumber, customer, totalQuantity, dueDate, status }) {
  const stamp = new Date().toISOString();
  const productionId = specificationId || `spec-${crypto.randomUUID().slice(0, 8)}`;
  const routeId = `r-${productionId}`;

  return {
    batch: {
      id: `b-${routeId}-1`,
      routeId,
      specificationId: productionId,
      // projectId remains as a storage alias for older Gantt and validation code.
      projectId: productionId,
      batchNumber: "1",
      quantity: totalQuantity,
      status: "planned",
      createdAt: stamp,
      updatedAt: stamp,
    },
    route: {
      id: routeId,
      specificationId: productionId,
      specificationName: name || "",
      // projectId remains as a storage alias for older Gantt and validation code.
      projectId: productionId,
      name: "Основной маршрут",
      isDefault: true,
    },
    routeSteps: [],
  };
}
