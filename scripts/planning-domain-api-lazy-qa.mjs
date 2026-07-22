import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(resolve(process.cwd(), "src/app.js"), "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(!/import\s*\{\s*createWorkOrdersReadModel\s*\}\s*from\s*"\.\/modules\/domain_api\/work_orders_read_model\.(?:js|ts)";/.test(source), "Planning work-order API must not remain a static app import");
expect(!source.includes('import { canApplyPlanningRuntimeProjection, createPlanningRuntimeProjectionReadModel } from "./modules/domain_api/planning_runtime_projection_read_model.ts";'), "Planning runtime projection API must not remain a static app import");
expect(source.includes('import("./modules/domain_api/work_orders_read_model.ts")'), "Planning work-order API must load the typed client dynamically");
expect(source.includes('import("./modules/domain_api/planning_runtime_projection_read_model.ts")'), "Planning runtime projection API must load dynamically");
expect(source.includes("function ensurePlanningDomainApiModule()"), "Planning domain API needs a single-flight lazy loader");
expect(source.includes("if (!await ensurePlanningDomainApiModule()) return requireServerCommand ? false : syncPlanningRouteQuantity(routeId, quantity, options);"), "Quantity changes must retain the local compatibility fallback only outside a server-required command");
expect(source.includes('if (!await ensurePlanningDomainApiModule()) return { applied: false, kind: "server-required" };'), "Slot scheduling must fail closed when the typed domain API module is unavailable");

if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}

console.log("Planning domain API lazy-load QA passed");
