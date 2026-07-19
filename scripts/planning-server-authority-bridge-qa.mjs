import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

function assert(value, message) {
  if (!value) throw new Error(message);
}

assert(app.includes("async function hydratePlanningRuntimeProjection({ force = false } = {})"),
  "Planning projection hydration must support a forced post-command refresh.");
assert(app.includes("hydratePlanningRuntimeProjection({ force: true })"),
  "Successful planning commands must request a fresh server projection.");
assert(app.includes("if (serverProjectionApplied) return true;"),
  "Quantity changes must stop before the compatibility recalculation after server projection succeeds.");
assert(app.includes("if (serverProjectionApplied) return { applied: true, slot: authoritativeSlot };"),
  "Schedule changes must stop before the compatibility mutation after server projection succeeds.");
assert(app.includes("async function hydratePlanningWorkbenchBootstrap"),
  "Planning must have a compact list and selected-detail bootstrap.");
assert(app.includes("async function hydrateInitialPlanningServerBootstrap()"),
  "Startup must choose the narrowest server projection for the active module.");
assert(app.includes('["gantt", "shiftMasterBoard", "shiftWorkOrders", "authSessionPrototype"].includes(ui?.activeModule)') && /const applied = await hydratePlanningRuntimeProjection\(\);/.test(app),
  "Direct Gantt and Shift Execution consumers, including Employee Desktop, must use the complete PostgreSQL projection instead of the shared snapshot.");
assert(app.includes("return hydratePlanningWorkbenchBootstrap();"),
  "Planning startup must retain the compact workbench bootstrap outside full-runtime consumers.");
assert(app.includes("planningRuntimeProjectionForceRefreshRequested"),
  "A command that joins an in-flight projection must retain one forced follow-up refresh.");

console.log("Planning server authority bridge QA: OK");
