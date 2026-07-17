import { normalizePlannedQuantity } from "./planning_quantity.js";

export const MIN_OPERATION_DURATION_MS = 5 * 60 * 1000;

function positive(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function panelWorkCenter(workCenterId = "") {
  return ["D3", "D3_L1", "D3_L2", "D3_AOI", "D3_UW", "D3_CC"].includes(String(workCenterId || ""));
}

export function getCalculationCapacity(resources = []) {
  const capacity = (resources || [])
    .filter((resource) => resource?.is_active !== false && resource?.participates_in_calculation !== false)
    .reduce((sum, resource) => sum + positive(resource.capacity_hours), 0);
  return Math.max(1, Math.round(capacity || 1));
}

export function calculateOperationDurationMs(executionContext = {}, quantity = 1, resources = []) {
  const normalizedQuantity = normalizePlannedQuantity(quantity);
  const workCenterId = String(executionContext.workCenterId || executionContext.work_center_id || "");
  const calculationType = String(executionContext.calculationType || executionContext.calculation_type || "");
  const setupMs = Math.max(0, positive(executionContext.setupMin ?? executionContext.setup_min) * 60 * 1000);
  const boardsPerPanel = normalizePlannedQuantity(executionContext.boardsPerPanel ?? executionContext.boards_per_panel, 1);
  const secondsPerPanel = positive(executionContext.secondsPerPanel ?? executionContext.seconds_per_panel);
  const unitsPerHour = positive(executionContext.unitsPerHour ?? executionContext.units_per_hour, 40);
  let durationMs;

  if (calculationType === "manual" || calculationType === "components") {
    durationMs = setupMs + normalizedQuantity * Math.max(1, secondsPerPanel || 60) * 1000 / getCalculationCapacity(resources);
  } else if (calculationType === "normative") {
    const batches = panelWorkCenter(workCenterId) ? Math.max(1, Math.ceil(normalizedQuantity / boardsPerPanel)) : normalizedQuantity;
    durationMs = setupMs + batches * Math.max(1, secondsPerPanel || 60) * 1000;
  } else if (panelWorkCenter(workCenterId) && boardsPerPanel > 1) {
    const panelCount = Math.max(1, Math.ceil(normalizedQuantity / boardsPerPanel));
    durationMs = panelCount / Math.max(1 / 60, unitsPerHour / boardsPerPanel) * 60 * 60 * 1000;
  } else {
    durationMs = normalizedQuantity / unitsPerHour * 60 * 60 * 1000;
  }
  return Math.max(MIN_OPERATION_DURATION_MS, Math.ceil(durationMs / 60_000) * 60_000);
}
