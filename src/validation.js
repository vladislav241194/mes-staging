import { toDate } from "./time.js";

export function byId(items) {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

// These names are retained for older Gantt callers. "Project" now means the
// specification-centered production context, with projectId as specificationId alias.
export function getProjectRoute(project, state) {
  return state.routes.find((route) => (route.specificationId === project.id || route.projectId === project.id) && route.isDefault)
    || state.routes.find((route) => route.specificationId === project.id || route.projectId === project.id);
}

export function getProjectRouteSteps(projectId, state) {
  const route = state.routes.find((item) => (item.specificationId === projectId || item.projectId === projectId) && item.isDefault)
    || state.routes.find((item) => item.specificationId === projectId || item.projectId === projectId);
  if (!route) return [];
  return state.routeSteps
    .filter((step) => step.routeId === route.id)
    .sort((a, b) => a.stepOrder - b.stepOrder);
}

export function getStepOrder(slot, state) {
  const step = state.routeSteps.find((item) => item.id === slot.routeStepId);
  return step?.stepOrder ?? Number.MAX_SAFE_INTEGER;
}

function getValidationRouteTaskId(step) {
  return step?.specTaskId || "__main__";
}

function getValidationProductionMap(state) {
  const map = byId(state.projects || []);
  for (const route of state.routes || []) {
    const production = {
      id: route.specificationId || route.projectId,
      name: route.specificationName || route.name || "Спецификация",
      totalQuantity: route.planningQuantity || 1,
    };
    if (production.id && !map[production.id]) map[production.id] = production;
  }
  return map;
}

function getValidationRouteForSlot(slot, state, stepById = byId(state.routeSteps || [])) {
  const step = stepById[slot.routeStepId];
  return (state.routes || []).find((route) => route.id === (slot.routeId || step?.routeId))
    || (state.routes || []).find((route) => route.specificationId === slot.specificationId || route.projectId === slot.projectId)
    || null;
}

export function getSlotWarnings(state) {
  const conflictWarnings = detectWorkCenterConflicts(state);
  const routeWarnings = detectRouteWarnings(state);
  const warnings = [...conflictWarnings, ...routeWarnings];

  return {
    warnings,
    slotWarningMap: warnings.reduce((map, warning) => {
      for (const slotId of warning.slotIds || []) {
        if (!map[slotId]) map[slotId] = [];
        map[slotId].push(warning);
      }
      return map;
    }, {}),
  };
}

export function detectWorkCenterConflicts(state) {
  const warnings = [];
  const slots = [...state.slots].sort((a, b) => toDate(a.plannedStart) - toDate(b.plannedStart));
  const workCenterById = byId(state.workCenters);
  const projectById = getValidationProductionMap(state);

  for (let index = 0; index < slots.length; index += 1) {
    const left = slots[index];
    const leftStart = toDate(left.plannedStart).getTime();
    const leftEnd = toDate(left.plannedEnd).getTime();

    for (let compare = index + 1; compare < slots.length; compare += 1) {
      const right = slots[compare];
      if (left.workCenterId !== right.workCenterId) continue;
      const capacity = Math.max(1, Number(workCenterById[left.workCenterId]?.capacity || 1));

      const rightStart = toDate(right.plannedStart).getTime();
      const rightEnd = toDate(right.plannedEnd).getTime();
      const overlappingSlots = slots.filter((slot) => (
        slot.workCenterId === left.workCenterId
        && leftStart < toDate(slot.plannedEnd).getTime()
        && leftEnd > toDate(slot.plannedStart).getTime()
      ));
      if (leftStart < rightEnd && leftEnd > rightStart && overlappingSlots.length > capacity) {
        warnings.push({
          id: `conflict-${left.id}-${right.id}`,
          type: "capacity",
          severity: "critical",
          slotIds: [left.id, right.id],
          projectId: left.projectId,
          workCenterId: left.workCenterId,
          message: `${workCenterById[left.workCenterId]?.name || "Подразделение"} перегружено: ${overlappingSlots.length} операций при емкости ${capacity}. ${projectById[left.specificationId || left.projectId]?.name || "Задание"} пересекается с ${projectById[right.specificationId || right.projectId]?.name || "заданием"}.`,
        });
      }
    }
  }

  return warnings;
}

export function detectRouteWarnings(state) {
  const warnings = [];
  const batchById = byId(state.batches);
  const projectById = getValidationProductionMap(state);
  const stepById = byId(state.routeSteps);
  const workCenterById = byId(state.workCenters);

  for (const slot of state.slots) {
    const start = toDate(slot.plannedStart).getTime();
    const end = toDate(slot.plannedEnd).getTime();
    const step = stepById[slot.routeStepId];

    if (end <= start) {
      warnings.push({
        id: `duration-${slot.id}`,
        type: "duration",
        severity: "critical",
        slotIds: [slot.id],
        projectId: slot.projectId,
        batchId: slot.batchId,
        message: `${slot.operationName}: окончание должно быть позже начала.`,
      });
    }

    if (!step) {
      warnings.push({
        id: `route-step-missing-${slot.id}`,
        type: "route",
        severity: "warning",
        slotIds: [slot.id],
        projectId: slot.projectId,
        batchId: slot.batchId,
        message: `${slot.operationName}: шаг маршрута не найден.`,
      });
      continue;
    }

    if (step.workCenterId !== slot.workCenterId) {
      warnings.push({
        id: `wrong-workcenter-${slot.id}`,
        type: "route",
        severity: "critical",
        slotIds: [slot.id],
        projectId: slot.projectId,
        batchId: slot.batchId,
        message: `${slot.operationName}: операция маршрута ожидает подразделение ${workCenterById[step.workCenterId]?.name || step.workCenterId}, а слот стоит на ${workCenterById[slot.workCenterId]?.name || slot.workCenterId}.`,
      });
    }
  }

  const slotsByProjectBatch = groupBy(state.slots, (slot) => {
    const step = stepById[slot.routeStepId];
    const route = getValidationRouteForSlot(slot, state, stepById);
    return `${route?.id || slot.routeId || slot.specificationId || slot.projectId}:${slot.batchId}:${getValidationRouteTaskId(step)}`;
  });

  for (const slots of Object.values(slotsByProjectBatch)) {
    if (!slots.length) continue;

    const productionId = slots[0].specificationId || slots[0].projectId;
    const project = projectById[productionId];
    const batch = batchById[slots[0].batchId];
    const taskId = getValidationRouteTaskId(stepById[slots[0].routeStepId]);
    const route = getValidationRouteForSlot(slots[0], state, stepById);
    const routeSteps = (route ? state.routeSteps.filter((step) => step.routeId === route.id) : getProjectRouteSteps(productionId, state))
      .filter((step) => getValidationRouteTaskId(step) === taskId);
    const plannedByOrder = new Map();

    for (const slot of slots) {
      const step = stepById[slot.routeStepId];
      if (step) plannedByOrder.set(step.stepOrder, slot);
    }

    const sorted = [...slots]
      .filter((slot) => stepById[slot.routeStepId])
      .sort((a, b) => stepById[a.routeStepId].stepOrder - stepById[b.routeStepId].stepOrder);

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      const previousStep = stepById[previous.routeStepId];
      const currentStep = stepById[current.routeStepId];

      if (toDate(current.plannedStart) < toDate(previous.plannedEnd)) {
        warnings.push({
          id: `sequence-${previous.id}-${current.id}`,
          type: "route",
          severity: "critical",
          slotIds: [previous.id, current.id],
          projectId: current.projectId,
          batchId: current.batchId,
          message: `Партия ${batch?.batchNumber || ""}: ${currentStep.operationName} начинается раньше завершения ${previousStep.operationName}.`,
        });
      }

      if (current.quantity > previous.quantity) {
        warnings.push({
          id: `quantity-${previous.id}-${current.id}`,
          type: "quantity",
          severity: "warning",
          slotIds: [current.id],
          projectId: current.projectId,
          batchId: current.batchId,
          message: `Партия ${batch?.batchNumber || ""}: на шаге ${currentStep.operationName} запланировано больше изделий, чем на предыдущем шаге.`,
        });
      }

      if (currentStep.stepOrder - previousStep.stepOrder > 1) {
        const missing = routeSteps.filter((step) => (
          step.isRequired
          && step.stepOrder > previousStep.stepOrder
          && step.stepOrder < currentStep.stepOrder
        ));

        for (const step of missing) {
          warnings.push({
            id: `missing-${current.projectId}-${current.batchId}-${step.id}`,
            type: "route",
            severity: "warning",
            slotIds: [previous.id, current.id],
            projectId: current.projectId,
            batchId: current.batchId,
            message: `${project?.name || "Задание"}, партия ${batch?.batchNumber || ""}: между операциями пропущен обязательный шаг ${step.operationName}.`,
          });
        }
      }
    }

    if (sorted.length > 1) {
      const minOrder = Math.min(...sorted.map((slot) => stepById[slot.routeStepId].stepOrder));
      const maxOrder = Math.max(...sorted.map((slot) => stepById[slot.routeStepId].stepOrder));
      for (const step of routeSteps) {
        if (step.isRequired && step.stepOrder >= minOrder && step.stepOrder <= maxOrder && !plannedByOrder.has(step.stepOrder)) {
          warnings.push({
            id: `required-${slots[0].projectId}-${slots[0].batchId}-${step.id}`,
            type: "route",
            severity: "warning",
            slotIds: sorted.map((slot) => slot.id),
            projectId: slots[0].projectId,
            batchId: slots[0].batchId,
            message: `${project?.name || "Задание"}, партия ${batch?.batchNumber || ""}: отсутствует обязательный шаг ${step.operationName}.`,
          });
        }
      }
    }
  }

  return dedupeWarnings(warnings);
}

export function getDependencyPairs(state) {
  const stepById = byId(state.routeSteps);
  const grouped = groupBy(state.slots, (slot) => (
    `${slot.routeId || stepById[slot.routeStepId]?.routeId || slot.specificationId || slot.projectId}:${slot.batchId}:${getValidationRouteTaskId(stepById[slot.routeStepId])}`
  ));
  const pairs = [];

  for (const slots of Object.values(grouped)) {
    const sorted = slots
      .filter((slot) => stepById[slot.routeStepId])
      .sort((a, b) => {
        const order = stepById[a.routeStepId].stepOrder - stepById[b.routeStepId].stepOrder;
        if (order !== 0) return order;
        return toDate(a.plannedStart) - toDate(b.plannedStart);
      });

    for (let index = 1; index < sorted.length; index += 1) {
      pairs.push({ fromSlotId: sorted[index - 1].id, toSlotId: sorted[index].id });
    }
  }

  return pairs;
}

export function calculateProjectProgress(project, state) {
  const allRouteSteps = getProjectRouteSteps(project.id, state).filter((step) => step.isRequired);
  const taskRouteSteps = allRouteSteps.filter((step) => getValidationRouteTaskId(step) !== "__main__");
  const routeSteps = taskRouteSteps.length ? taskRouteSteps : allRouteSteps;
  if (!routeSteps.length || !project.totalQuantity) return 0;

  const requiredStepIds = new Set(routeSteps.map((step) => step.id));
  const completedQuantity = state.slots
    .filter((slot) => (slot.specificationId === project.id || slot.projectId === project.id) && slot.status === "completed" && requiredStepIds.has(slot.routeStepId))
    .reduce((sum, slot) => sum + Number(slot.quantity || 0), 0);

  return Math.min(100, Math.round((completedQuantity / (project.totalQuantity * routeSteps.length)) * 100));
}

export function getBatchTotalPlanned(batchId, state, excludeSlotId = null) {
  return state.slots
    .filter((slot) => slot.batchId === batchId && slot.id !== excludeSlotId)
    .reduce((sum, slot) => sum + Number(slot.quantity || 0), 0);
}

function groupBy(items, keyGetter) {
  return items.reduce((groups, item) => {
    const key = keyGetter(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}

function dedupeWarnings(warnings) {
  const seen = new Set();
  return warnings.filter((warning) => {
    if (seen.has(warning.id)) return false;
    seen.add(warning.id);
    return true;
  });
}
