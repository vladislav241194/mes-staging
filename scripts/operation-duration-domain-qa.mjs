import { calculateOperationDurationMs, getCalculationCapacity, MIN_OPERATION_DURATION_MS } from "../src/domain/operation_duration.js";

function assert(condition, message) { if (!condition) throw new Error(message); }

const resources = [
  { capacity_hours: 8, participates_in_calculation: true, is_active: true },
  { capacity_hours: 8, participates_in_calculation: true, is_active: true },
];
assert(getCalculationCapacity(resources) === 16, "Calculation capacity must aggregate active participating resources");
assert(calculateOperationDurationMs({ calculationType: "manual", setupMin: 5, secondsPerPanel: 60 }, 160, resources) === 15 * 60 * 1000, "Manual duration must include setup and concurrent resource capacity");
assert(calculateOperationDurationMs({ workCenterId: "D3", calculationType: "normative", boardsPerPanel: 4, secondsPerPanel: 30, setupMin: 1 }, 10) === MIN_OPERATION_DURATION_MS, "Normative SMT duration must use panel count, setup, and the minimum duration floor");
assert(calculateOperationDurationMs({ workCenterId: "D5", calculationType: "rate", unitsPerHour: 60 }, 120) === 2 * 60 * 60 * 1000, "Rate duration must use units per hour");
assert(calculateOperationDurationMs({}, 1) === MIN_OPERATION_DURATION_MS, "Duration must preserve the minimum operation floor");
console.log("Operation duration domain QA: OK");
