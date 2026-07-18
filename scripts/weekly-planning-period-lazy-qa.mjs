import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const app = await readFile(resolve(process.cwd(), "src/app.js"), "utf8");
const weekly = await readFile(resolve(process.cwd(), "src/modules/weekly_production_control/render.js"), "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(app.includes('import("./modules/domain_api/planning_period_read_model.js")'), "Weekly planning period read model must load lazily");
expect(app.includes('import("./modules/weekly_production_control/planning_period_rows.js")'), "Weekly period row adapter must load lazily");
expect(app.includes("function hydrateWeeklyPlanningPeriod()"), "Weekly Control needs a bounded period hydration path");
expect(app.includes("return getPlanningTableSlotRows();"), "Weekly period API must retain the local planning fallback");
expect(app.includes("fromAt = weekStart.toISOString()"), "Weekly local calendar bounds must be transported as exact UTC instants");
expect(app.includes("scheduleWeeklyPlanningPeriodRefresh(bounds)"), "Weekly period cache must revalidate while the screen remains open");
expect(app.includes("function invalidateWeeklyPlanningPeriod()"), "planning changes must invalidate the Weekly period cache");
expect(!app.includes('import("./modules/gantt_runtime/render.js")'), "Weekly period API must not load the Gantt runtime");
expect(weekly.includes("getPlanningTableSlotRows({ weekStart, weekEnd })"), "Weekly model must request only its visible date range");

if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}
console.log("Weekly planning period lazy QA: OK");
