import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { validateDomainExport } from "./domain-postgres-import.mjs";

function assert(condition, message) { if (!condition) throw new Error(message); }
const payload = {
  schemaVersion: "006_production_resources",
  workOrders: [{ id: "wo-1", planning_start_date: "2028-02-29" }],
  workOrderOperations: [{ id: "op-1", work_order_id: "wo-1", quantity_multiplier: 1, execution_context: {} }],
  planningSlots: [{ id: "slot-1", work_order_operation_id: "op-1", quantity: 1, is_locked: false }],
  workCenterCalendars: [{ work_center_id: "D1", work_schedule: "24/7", work_mode: "00:00-24:00", timezone: "Europe/Moscow", is_active: true }],
  productionResources: [{ id: "D1_MATRIX", work_center_id: "D1", name: "Склад", resource_type: "staff", capacity_hours: 8, units_per_hour: 100, participates_in_calculation: true, participates_in_planning: true, is_active: true, source_kind: "matrixWorkCenter" }],
};
const counts = validateDomainExport(payload);
assert(counts.workOrders === 1 && counts.operations === 1 && counts.planningSlots === 1 && counts.workCenterCalendars === 1 && counts.productionResources === 1, "Validator must return a complete import plan");
let orphan = "";
try { validateDomainExport({ ...payload, planningSlots: [{ id: "slot-1", work_order_operation_id: "missing" }] }); } catch (error) { orphan = String(error.message); }
assert(/unknown operation/.test(orphan), "Validator must reject orphan planning slots");
let invalidMultiplier = "";
try { validateDomainExport({ ...payload, workOrderOperations: [{ id: "op-1", work_order_id: "wo-1", quantity_multiplier: 0 }] }); } catch (error) { invalidMultiplier = String(error.message); }
assert(/positive quantity multiplier/.test(invalidMultiplier), "Validator must reject an invalid operation quantity multiplier");
let invalidContext = "";
try { validateDomainExport({ ...payload, workOrderOperations: [{ id: "op-1", work_order_id: "wo-1", quantity_multiplier: 1, execution_context: null }] }); } catch (error) { invalidContext = String(error.message); }
assert(/execution context/.test(invalidContext), "Validator must reject a missing operation execution context");
let invalidCalendar = "";
try { validateDomainExport({ ...payload, workCenterCalendars: [{ work_center_id: "D1", work_schedule: "", work_mode: "", timezone: "" }] }); } catch (error) { invalidCalendar = String(error.message); }
assert(/calendar .* incomplete/.test(invalidCalendar), "Validator must reject an incomplete work-center calendar");
let invalidResource = "";
try { validateDomainExport({ ...payload, productionResources: [{ id: "D1_MATRIX", work_center_id: "", name: "", resource_type: "", capacity_hours: -1, units_per_hour: -1 }] }); } catch (error) { invalidResource = String(error.message); }
assert(/Production resource .* incomplete/.test(invalidResource), "Validator must reject an incomplete production resource");
let invalidQuantity = "";
try { validateDomainExport({ ...payload, planningSlots: [{ id: "slot-1", work_order_operation_id: "op-1", quantity: 0 }] }); } catch (error) { invalidQuantity = String(error.message); }
assert(/positive quantity/.test(invalidQuantity), "Validator must reject an invalid planning slot quantity");
let invalidStartDate = "";
try { validateDomainExport({ ...payload, workOrders: [{ id: "wo-1", planning_start_date: "2026-02-31" }] }); } catch (error) { invalidStartDate = String(error.message); }
assert(/invalid planning start date/.test(invalidStartDate), "Validator must reject impossible planning start dates before PostgreSQL import");

const directory = await mkdtemp(join(tmpdir(), "mes-domain-import-qa-"));
const file = join(directory, "export.json");
try {
  await writeFile(file, JSON.stringify(payload), "utf-8");
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/domain-postgres-import.mjs", file], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    let result = "";
    child.stdout.on("data", (chunk) => { result += chunk; });
    child.stderr.on("data", (chunk) => { result += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve(result) : reject(new Error(result)));
  });
  assert(String(output).includes("DRY RUN"), "Default import must not mutate PostgreSQL");
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log("PostgreSQL domain import QA: OK");
