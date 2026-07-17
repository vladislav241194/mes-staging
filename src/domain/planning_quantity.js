// Shared quantity rule for planning. It intentionally has no UI, storage, or
// calendar dependencies so the browser, import pipeline, and future command
// worker calculate the same executable amount for an operation.

export function normalizePlannedQuantity(value, fallback = 1) {
  const quantity = Math.round(Number(value));
  if (Number.isFinite(quantity) && quantity > 0) return quantity;
  const normalizedFallback = Math.round(Number(fallback));
  return Number.isFinite(normalizedFallback) && normalizedFallback > 0 ? normalizedFallback : 1;
}

export function normalizeOperationQuantityMultiplier(value, fallback = 1) {
  return normalizePlannedQuantity(value, fallback);
}

export function calculateOperationPlannedQuantity(orderQuantity, quantityMultiplier = 1) {
  return normalizePlannedQuantity(orderQuantity) * normalizeOperationQuantityMultiplier(quantityMultiplier);
}
