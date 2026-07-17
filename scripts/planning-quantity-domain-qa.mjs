import {
  calculateOperationPlannedQuantity,
  normalizeOperationQuantityMultiplier,
  normalizePlannedQuantity,
} from "../src/domain/planning_quantity.js";

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(normalizePlannedQuantity("12.4") === 12, "Planned quantity must use the same integer normalization as planning");
assert(normalizePlannedQuantity(0, 7) === 7, "Invalid planned quantity must use a positive fallback");
assert(normalizeOperationQuantityMultiplier("4") === 4, "Operation multiplier must be a positive integer");
assert(calculateOperationPlannedQuantity(1000, 4) === 4000, "Operation quantity must preserve the route multiplier");
assert(calculateOperationPlannedQuantity(0, 3) === 3, "Invalid order quantity must safely fall back to one unit");
console.log("Planning quantity domain QA: OK");
