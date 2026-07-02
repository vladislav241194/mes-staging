import { toDate } from "./time.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function byId(items) {
  return Object.fromEntries(asArray(items).map((item) => [item.id, item]));
}

function getValidationProductionId(entity = {}) {
  return entity?.specificationId || entity?.projectId || "";
}

function validationEntityMatchesProduction(entity = {}, productionId = "") {
  return Boolean(productionId) && (entity?.specificationId === productionId || entity?.projectId === productionId);
}

function getValidationPlanningOrderId(slot = {}) {
  return slot?.planningOrderId || slot?.routeId || slot?.batchId || "";
}

function getValidationSlotStatusValue(slot = {}) {
  return String(slot?.status || "planned").trim() || "planned";
}

function validationSlotHasStatus(slot = {}, status = "") {
  return getValidationSlotStatusValue(slot) === status;
}

function getValidationSlotRouteId(slot = {}, state = {}, stepById = byId(state?.routeSteps || [])) {
  const step = stepById?.[slot?.routeStepId];
  return slot?.routeId || step?.routeId || getValidationPlanningOrderId(slot) || getValidationProductionId(slot) || "";
}

// These names are retained for older Gantt callers. "Project" now means the
// product-centered production context, with projectId as the legacy alias.
export function getProjectRoute(project, state) {
  const routes = asArray(state?.routes);
  return routes.find((route) => validationEntityMatchesProduction(route, project.id) && route.isDefault)
    || routes.find((route) => validationEntityMatchesProduction(route, project.id));
}

export function getProjectRouteSteps(productionId, state) {
  const routes = asArray(state?.routes);
  const routeSteps = asArray(state?.routeSteps);
  const route = routes.find((item) => validationEntityMatchesProduction(item, productionId) && item.isDefault)
    || routes.find((item) => validationEntityMatchesProduction(item, productionId));
  if (!route) return [];
  return routeSteps
    .filter((step) => step.routeId === route.id)
    .sort((a, b) => a.stepOrder - b.stepOrder);
}

export function getStepOrder(slot, state) {
  const step = asArray(state?.routeSteps).find((item) => item.id === slot.routeStepId);
  return step?.stepOrder ?? Number.MAX_SAFE_INTEGER;
}

function getValidationRouteTaskId(step) {
  return step?.specTaskId || "__main__";
}

function getValidationProductionMap(state) {
  const map = byId(state?.projects || []);
  for (const route of asArray(state?.routes)) {
    const productionId = getValidationProductionId(route);
    const production = {
      id: productionId,
      name: route.specificationName || route.name || "Изделие",
      totalQuantity: route.planningQuantity || 1,
    };
    if (production.id && !map[production.id]) map[production.id] = production;
  }
  return map;
}

function getValidationRouteForSlot(slot, state, stepById = byId(state?.routeSteps || [])) {
  const routes = asArray(state?.routes);
  const slotRouteId = getValidationSlotRouteId(slot, state, stepById);
  return routes.find((route) => route.id === slotRouteId)
    || routes.find((route) => validationEntityMatchesProduction(route, getValidationProductionId(slot)))
    || null;
}

function normalizeValidationFlowLaunchMode(route, taskSlots = []) {
  if (route?.flowLaunchMode === "complete" || route?.flowLaunchMode === "transfer_batch") return route.flowLaunchMode;
  const taskIds = new Set(taskSlots.map((slot) => slot.taskId || "__main__").filter((taskId) => taskId !== "__main__"));
  return taskIds.size > 1 ? "transfer_batch" : "complete";
}

function getValidationTransferBatchQuantity(route, batch, taskSlots = []) {
  const explicitQuantity = Math.max(0, Math.round(Number(route?.transferBatchQuantity || 0)));
  const batchQuantity = Math.max(1, Math.round(Number(batch?.quantity || route?.planningQuantity || taskSlots[0]?.quantity || 1)));
  return Math.max(1, Math.min(explicitQuantity || Math.min(50, batchQuantity), batchQuantity));
}

function getValidationSlotReadyAtQuantity(slot, quantity) {
  const slotQuantity = Math.max(1, Math.round(Number(slot?.quantity || 1)));
  const requiredQuantity = Math.max(1, Math.min(slotQuantity, Math.round(Number(quantity || 1))));
  const start = toDate(slot.plannedStart);
  const end = toDate(slot.plannedEnd);
  const durationMs = Math.max(0, end - start);
  return new Date(start.getTime() + durationMs * (requiredQuantity / slotQuantity));
}

function getValidationBranchCompletionSlots(taskSlots, stepById) {
  const taskSlotsWithIds = taskSlots
    .map((slot) => ({ ...slot, taskId: getValidationRouteTaskId(stepById[slot.routeStepId]) }))
    .filter((slot) => slot.taskId !== "__main__");
  const groups = groupBy(taskSlotsWithIds, (slot) => slot.taskId);
  return Object.values(groups).map((slots) => slots
    .filter((slot) => stepById[slot.routeStepId])
    .sort((left, right) => (
      stepById[right.routeStepId].stepOrder - stepById[left.routeStepId].stepOrder
      || toDate(right.plannedEnd) - toDate(left.plannedEnd)
    ))[0])
    .filter(Boolean);
}

function getValidationMainDependencyReadyAt(route, batch, taskSlots, stepById) {
  const branchSlots = getValidationBranchCompletionSlots(taskSlots, stepById);
  if (!branchSlots.length) return null;
  const mode = normalizeValidationFlowLaunchMode(route, branchSlots);
  const transferBatchQuantity = getValidationTransferBatchQuantity(route, batch, branchSlots);
  const readyDates = branchSlots.map((slot) => (
    mode === "transfer_batch"
      ? getValidationSlotReadyAtQuantity(slot, transferBatchQuantity)
      : toDate(slot.plannedEnd)
  ));
  return readyDates.reduce((latest, date) => (
    new Date(Math.max(latest.getTime(), toDate(date).getTime()))
  ), readyDates[0]);
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
  const slots = [...asArray(state?.slots)].sort((a, b) => toDate(a.plannedStart) - toDate(b.plannedStart));
  const workCenterById = byId(state?.workCenters);
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
          productionId: getValidationProductionId(left),
          workCenterId: left.workCenterId,
          message: `${workCenterById[left.workCenterId]?.name || "Отдел"} перегружен: ${overlappingSlots.length} операций при емкости ${capacity}. ${projectById[getValidationProductionId(left)]?.name || "Задание"} пересекается с ${projectById[getValidationProductionId(right)]?.name || "заданием"}.`,
        });
      }
    }
  }

  return warnings;
}

export function detectRouteWarnings(state) {
  const warnings = [];
  const projectById = getValidationProductionMap(state);
  const slots = asArray(state?.slots);
  const routeStepsState = asArray(state?.routeSteps);
  const stepById = byId(routeStepsState);
  const workCenterById = byId(state?.workCenters);

  for (const slot of slots) {
    const start = toDate(slot.plannedStart).getTime();
    const end = toDate(slot.plannedEnd).getTime();
    const step = stepById[slot.routeStepId];

    if (end <= start) {
      warnings.push({
        id: `duration-${slot.id}`,
        type: "duration",
        severity: "critical",
        slotIds: [slot.id],
        productionId: getValidationProductionId(slot),
        planningOrderId: getValidationPlanningOrderId(slot),
        message: `${slot.operationName}: окончание должно быть позже начала.`,
      });
    }

    if (!step) {
      warnings.push({
        id: `route-step-missing-${slot.id}`,
        type: "route",
        severity: "warning",
        slotIds: [slot.id],
        productionId: getValidationProductionId(slot),
        planningOrderId: getValidationPlanningOrderId(slot),
        message: `${slot.operationName}: шаг маршрута не найден.`,
      });
      continue;
    }

    const routeWorkCenter = workCenterById[step.workCenterId];
    const slotWorkCenter = workCenterById[slot.workCenterId];
    const slotMatchesRouteWorkCenter = step.workCenterId === slot.workCenterId
      || slot.routeWorkCenterId === step.workCenterId
      || slotWorkCenter?.parentWorkCenterId === step.workCenterId
      || routeWorkCenter?.parentWorkCenterId === slot.workCenterId;
    if (!slotMatchesRouteWorkCenter) {
      warnings.push({
        id: `wrong-workcenter-${slot.id}`,
        type: "route",
        severity: "critical",
        slotIds: [slot.id],
        productionId: getValidationProductionId(slot),
        planningOrderId: getValidationPlanningOrderId(slot),
        message: `${slot.operationName}: операция маршрута ожидает отдел ${workCenterById[step.workCenterId]?.name || step.workCenterId}, а слот стоит в отделе ${workCenterById[slot.workCenterId]?.name || slot.workCenterId}.`,
      });
    }
  }

  const slotsByProjectBatch = groupBy(slots, (slot) => {
    const step = stepById[slot.routeStepId];
    const route = getValidationRouteForSlot(slot, state, stepById);
    return `${route?.id || getValidationSlotRouteId(slot, state, stepById)}:${getValidationPlanningOrderId(slot)}:${getValidationRouteTaskId(step)}`;
  });

  for (const slots of Object.values(slotsByProjectBatch)) {
    if (!slots.length) continue;

    const productionId = getValidationProductionId(slots[0]);
    const project = projectById[productionId];
    const taskId = getValidationRouteTaskId(stepById[slots[0].routeStepId]);
    const route = getValidationRouteForSlot(slots[0], state, stepById);
    const routeSteps = (route ? routeStepsState.filter((step) => step.routeId === route.id) : getProjectRouteSteps(productionId, state))
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
          productionId: getValidationProductionId(current),
          planningOrderId: getValidationPlanningOrderId(current),
          message: `Заказ-наряд: ${currentStep.operationName} начинается раньше завершения ${previousStep.operationName}.`,
        });
      }

      if (current.quantity > previous.quantity) {
        warnings.push({
          id: `quantity-${previous.id}-${current.id}`,
          type: "quantity",
          severity: "warning",
          slotIds: [current.id],
          productionId: getValidationProductionId(current),
          planningOrderId: getValidationPlanningOrderId(current),
          message: `Заказ-наряд: на шаге ${currentStep.operationName} запланировано больше изделий, чем на предыдущем шаге.`,
        });
      }

      if (currentStep.stepOrder - previousStep.stepOrder > 1) {
        const missing = routeSteps.filter((step) => (
          step.isRequired
          && step.stepOrder > previousStep.stepOrder
          && step.stepOrder < currentStep.stepOrder
        ));

        for (const step of missing) {
          const currentProductionId = getValidationProductionId(current);
          const currentPlanningOrderId = getValidationPlanningOrderId(current);
          warnings.push({
            id: `missing-${currentProductionId}-${currentPlanningOrderId}-${step.id}`,
            type: "route",
            severity: "warning",
            slotIds: [previous.id, current.id],
            productionId: currentProductionId,
            planningOrderId: currentPlanningOrderId,
            message: `${project?.name || "Задание"}: между операциями пропущен обязательный шаг ${step.operationName}.`,
          });
        }
      }
    }

    if (sorted.length > 1) {
      const minOrder = Math.min(...sorted.map((slot) => stepById[slot.routeStepId].stepOrder));
      const maxOrder = Math.max(...sorted.map((slot) => stepById[slot.routeStepId].stepOrder));
      for (const step of routeSteps) {
        if (step.isRequired && step.stepOrder >= minOrder && step.stepOrder <= maxOrder && !plannedByOrder.has(step.stepOrder)) {
          const firstProductionId = getValidationProductionId(slots[0]);
          const firstPlanningOrderId = getValidationPlanningOrderId(slots[0]);
          warnings.push({
            id: `required-${firstProductionId}-${firstPlanningOrderId}-${step.id}`,
            type: "route",
            severity: "warning",
            slotIds: sorted.map((slot) => slot.id),
            productionId: firstProductionId,
            planningOrderId: firstPlanningOrderId,
            message: `${project?.name || "Задание"}: отсутствует обязательный шаг ${step.operationName}.`,
          });
        }
      }
    }
  }

  const slotsByRouteBatch = groupBy(slots, (slot) => {
    const route = getValidationRouteForSlot(slot, state, stepById);
    return `${route?.id || getValidationSlotRouteId(slot, state, stepById)}:${getValidationPlanningOrderId(slot)}`;
  });

  for (const slots of Object.values(slotsByRouteBatch)) {
    const mainSlots = slots.filter((slot) => getValidationRouteTaskId(stepById[slot.routeStepId]) === "__main__");
    const taskSlots = slots.filter((slot) => getValidationRouteTaskId(stepById[slot.routeStepId]) !== "__main__");
    if (!mainSlots.length || !taskSlots.length) continue;

    const earliestMainSlot = mainSlots
      .sort((left, right) => toDate(left.plannedStart) - toDate(right.plannedStart))[0];
    const route = getValidationRouteForSlot(earliestMainSlot, state, stepById);
    const dependencyReadyAt = getValidationMainDependencyReadyAt(route, null, taskSlots, stepById);
    const branchCompletionSlots = getValidationBranchCompletionSlots(taskSlots, stepById);
    const latestTaskSlot = branchCompletionSlots
      .sort((left, right) => toDate(right.plannedEnd) - toDate(left.plannedEnd))[0]
      || taskSlots.sort((left, right) => toDate(right.plannedEnd) - toDate(left.plannedEnd))[0];
    if (!latestTaskSlot || !earliestMainSlot) continue;
    if (dependencyReadyAt && toDate(earliestMainSlot.plannedStart) >= toDate(dependencyReadyAt)) continue;

    const taskStep = stepById[latestTaskSlot.routeStepId];
    const mainStep = stepById[earliestMainSlot.routeStepId];
    warnings.push({
      id: `sequence-main-${latestTaskSlot.id}-${earliestMainSlot.id}`,
      type: "route",
      severity: "critical",
      slotIds: [latestTaskSlot.id, earliestMainSlot.id],
      productionId: getValidationProductionId(earliestMainSlot),
      planningOrderId: getValidationPlanningOrderId(earliestMainSlot),
      message: `Заказ-наряд: ${mainStep?.operationName || earliestMainSlot.operationName} начинается раньше завершения ${taskStep?.operationName || latestTaskSlot.operationName}.`,
    });
  }

  return dedupeWarnings(warnings);
}

export function getDependencyPairs(state) {
  const slots = asArray(state?.slots);
  const stepById = byId(state?.routeSteps);
  const grouped = groupBy(slots, (slot) => (
    `${getValidationSlotRouteId(slot, state, stepById)}:${getValidationPlanningOrderId(slot)}:${getValidationRouteTaskId(stepById[slot.routeStepId])}`
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

  const byRouteBatch = groupBy(slots, (slot) => {
    return `${getValidationSlotRouteId(slot, state, stepById)}:${getValidationPlanningOrderId(slot)}`;
  });

  for (const slots of Object.values(byRouteBatch)) {
    const mainSlots = slots
      .filter((slot) => getValidationRouteTaskId(stepById[slot.routeStepId]) === "__main__")
      .sort((left, right) => toDate(left.plannedStart) - toDate(right.plannedStart));
    if (!mainSlots[0]) continue;

    const taskSlotsByTask = groupBy(
      slots.filter((slot) => getValidationRouteTaskId(stepById[slot.routeStepId]) !== "__main__"),
      (slot) => getValidationRouteTaskId(stepById[slot.routeStepId]),
    );
    Object.values(taskSlotsByTask).forEach((taskSlots) => {
      const lastTaskSlot = taskSlots
        .filter((slot) => stepById[slot.routeStepId])
        .sort((left, right) => (
          stepById[right.routeStepId].stepOrder - stepById[left.routeStepId].stepOrder
          || toDate(right.plannedEnd) - toDate(left.plannedEnd)
        ))[0];
      if (lastTaskSlot) pairs.push({ fromSlotId: lastTaskSlot.id, toSlotId: mainSlots[0].id });
    });
  }

  return pairs;
}

export function calculateProjectProgress(project, state) {
  const allRouteSteps = getProjectRouteSteps(project.id, state).filter((step) => step.isRequired);
  const routeSteps = allRouteSteps;
  if (!routeSteps.length || !project.totalQuantity) return 0;

  const requiredStepIds = new Set(routeSteps.map((step) => step.id));
  const completedQuantity = asArray(state?.slots)
    .filter((slot) => validationEntityMatchesProduction(slot, project.id) && validationSlotHasStatus(slot, "completed") && requiredStepIds.has(slot.routeStepId))
    .reduce((sum, slot) => sum + Number(slot.quantity || 0), 0);

  return Math.min(100, Math.round((completedQuantity / (project.totalQuantity * routeSteps.length)) * 100));
}

export function getPlanningOrderTotalPlanned(planningOrderId, state, excludeSlotId = null) {
  return asArray(state?.slots)
    .filter((slot) => getValidationPlanningOrderId(slot) === planningOrderId && slot.id !== excludeSlotId)
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
