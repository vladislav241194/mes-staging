import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const labRoot = dirname(fileURLToPath(import.meta.url));
const sourceRoot = join(labRoot, "src");

async function measureEntry(entry, budget) {
  const result = await build({
    entryPoints: [join(sourceRoot, entry)],
    bundle: true,
    format: "esm",
    jsx: "automatic",
    minify: true,
    target: "es2020",
    treeShaking: true,
    write: false,
  });
  const bytes = result.outputFiles[0].contents;
  const measurement = { raw: bytes.length, gzip: gzipSync(bytes).length };
  assert.ok(measurement.raw <= budget.raw, `${entry} raw bundle ${measurement.raw} exceeds ${budget.raw}`);
  assert.ok(measurement.gzip <= budget.gzip, `${entry} gzip bundle ${measurement.gzip} exceeds ${budget.gzip}`);
  return { bytes, measurement };
}

const nomenclature = await measureEntry("nomenclature-island.tsx", { raw: 225_000, gzip: 68_000 });
const boards = await measureEntry("boards-island.tsx", { raw: 225_000, gzip: 68_000 });
const structureEmployees = await measureEntry("structure-employees-island.tsx", { raw: 225_000, gzip: 68_000 });
const structurePositions = await measureEntry("structure-positions-island.tsx", { raw: 225_000, gzip: 68_000 });
const structureOrgUnits = await measureEntry("structure-org-units-island.tsx", { raw: 225_000, gzip: 68_000 });
const structureWorkCenters = await measureEntry("structure-work-centers-island.tsx", { raw: 225_000, gzip: 68_000 });
const structureEquipment = await measureEntry("structure-equipment-island.tsx", { raw: 225_000, gzip: 68_000 });
const structureResponsibilityPolicies = await measureEntry("structure-responsibility-policies-island.tsx", { raw: 225_000, gzip: 68_000 });
const structureMigrationDiagnostics = await measureEntry("structure-migration-diagnostics-island.tsx", { raw: 225_000, gzip: 68_000 });
const weeklyProductionControl = await measureEntry("weekly-production-control-island.tsx", { raw: 225_000, gzip: 68_000 });
const timesheet = await measureEntry("timesheet-island.tsx", { raw: 225_000, gzip: 68_000 });
const planningWorkbench = await measureEntry("planning-workbench-island.tsx", { raw: 225_000, gzip: 68_000 });
const shiftWorkOrders = await measureEntry("shift-work-orders-island.tsx", { raw: 225_000, gzip: 68_000 });
const shiftWorkOrdersPrint = await measureEntry("modules/shift-work-orders/ShiftWorkOrderPrintPreviews.tsx", { raw: 225_000, gzip: 68_000 });
const shiftMasterBoard = await measureEntry("shift-master-board-island.tsx", { raw: 225_000, gzip: 68_000 });
const employeeDesktop = await measureEntry("employee-desktop-island.tsx", { raw: 225_000, gzip: 68_000 });
const authPicker = await measureEntry("auth-picker-island.tsx", { raw: 225_000, gzip: 68_000 });
const contourAdmin = await measureEntry("contour-admin-island.tsx", { raw: 225_000, gzip: 68_000 });
const specifications2 = await measureEntry("specifications2-island.tsx", { raw: 225_000, gzip: 68_000 });
const gantt = await measureEntry("gantt-island.tsx", { raw: 225_000, gzip: 68_000 });
const roles = await measureEntry("roles-island.tsx", { raw: 225_000, gzip: 68_000 });
const componentTypes = await measureEntry("component-types-island.tsx", { raw: 225_000, gzip: 68_000 });
const operations = await measureEntry("operations-island.tsx", { raw: 225_000, gzip: 68_000 });
const nomenclatureTypes = await measureEntry("nomenclature-types-island.tsx", { raw: 225_000, gzip: 68_000 });
const statuses = await measureEntry("statuses-island.tsx", { raw: 225_000, gzip: 68_000 });
// The aggregate lab intentionally contains every scenario; production islands keep their stricter per-entry budgets above.
// Employee Desktop context plus the Shift Master assignment, fact, carryover navigation and lazy SZN trigger add bounded UI over shared contracts while each
// separately loaded production island remains under the unchanged 225/68 KB gate.
const lab = await measureEntry("main.tsx", { raw: 555_000, gzip: 126_000 });
const nomenclatureText = new TextDecoder().decode(nomenclature.bytes);
assert.doesNotMatch(nomenclatureText, /Типы компонентов/, "Nomenclature production island must not bundle the Component Types scenario");
const boardsText = new TextDecoder().decode(boards.bytes);
assert.doesNotMatch(boardsText, /Вся номенклатура|Типы компонентов/, "Boards production island must not bundle unrelated scenarios");
const structureEmployeesText = new TextDecoder().decode(structureEmployees.bytes);
assert.doesNotMatch(structureEmployeesText, /Вся номенклатура|Типы компонентов|Подсчет импортированных компонентов/, "Structure Employees production island must not bundle unrelated scenarios");
const structurePositionsText = new TextDecoder().decode(structurePositions.bytes);
assert.doesNotMatch(structurePositionsText, /Вся номенклатура|Типы компонентов|Подсчет импортированных компонентов/, "Structure Positions production island must not bundle unrelated scenarios");
const structureOrgUnitsText = new TextDecoder().decode(structureOrgUnits.bytes);
assert.doesNotMatch(structureOrgUnitsText, /Вся номенклатура|Типы компонентов|Подсчет импортированных компонентов/, "Structure Org Units production island must not bundle unrelated scenarios");
const structureWorkCentersText = new TextDecoder().decode(structureWorkCenters.bytes);
assert.doesNotMatch(structureWorkCentersText, /Вся номенклатура|Типы компонентов|Подсчет импортированных компонентов/, "Structure Work Centers production island must not bundle unrelated scenarios");
const structureEquipmentText = new TextDecoder().decode(structureEquipment.bytes);
assert.doesNotMatch(structureEquipmentText, /Вся номенклатура|Типы компонентов|Подсчет импортированных компонентов/, "Structure Equipment production island must not bundle unrelated scenarios");
const structureResponsibilityPoliciesText = new TextDecoder().decode(structureResponsibilityPolicies.bytes);
assert.doesNotMatch(structureResponsibilityPoliciesText, /Вся номенклатура|Типы компонентов|Подсчет импортированных компонентов/, "Structure Responsibility Policies production island must not bundle unrelated scenarios");
const structureMigrationDiagnosticsText = new TextDecoder().decode(structureMigrationDiagnostics.bytes);
assert.doesNotMatch(structureMigrationDiagnosticsText, /Вся номенклатура|Типы компонентов|Подсчет импортированных компонентов/, "Structure Migration Diagnostics production island must not bundle unrelated scenarios");
const weeklyProductionControlText = new TextDecoder().decode(weeklyProductionControl.bytes);
assert.doesNotMatch(weeklyProductionControlText, /Вся номенклатура|Типы компонентов|Роли и доступ/, "Weekly Production Control island must not bundle unrelated scenarios");
const timesheetText = new TextDecoder().decode(timesheet.bytes);
assert.doesNotMatch(timesheetText, /Вся номенклатура|Типы компонентов|Роли и доступ/, "Timesheet island must not bundle unrelated scenarios");
const planningWorkbenchText = new TextDecoder().decode(planningWorkbench.bytes);
assert.doesNotMatch(planningWorkbenchText, /Вся номенклатура|Типы компонентов|Роли и доступ/, "Planning Workbench island must not bundle unrelated scenarios");
const shiftWorkOrdersText = new TextDecoder().decode(shiftWorkOrders.bytes);
assert.doesNotMatch(shiftWorkOrdersText, /Вся номенклатура|Типы компонентов|Роли и доступ/, "Shift Work Orders island must not bundle unrelated scenarios");
assert.doesNotMatch(shiftWorkOrdersText, /work-order-print-sheet/, "Shift Work Orders base island must lazy-load print previews");
const shiftWorkOrdersPrintText = new TextDecoder().decode(shiftWorkOrdersPrint.bytes);
assert.match(shiftWorkOrdersPrintText, /work-order-print-sheet/);
const shiftMasterBoardText = new TextDecoder().decode(shiftMasterBoard.bytes);
assert.doesNotMatch(shiftMasterBoardText, /Вся номенклатура|Типы компонентов|Роли и доступ/, "Shift Master Board island must not bundle unrelated scenarios");
const employeeDesktopText = new TextDecoder().decode(employeeDesktop.bytes);
assert.doesNotMatch(employeeDesktopText, /Вся номенклатура|Типы компонентов|Роли и доступ/, "Employee Desktop island must not bundle unrelated scenarios");
const authPickerText = new TextDecoder().decode(authPicker.bytes);
assert.doesNotMatch(authPickerText, /pinDraft|scheduleAuthPrototypePinValidation|completeAuthPrototypeLogin|unlockAuthGate/, "Authorization picker island must not bundle PIN or session authority");
const contourAdminText = new TextDecoder().decode(contourAdmin.bytes);
assert.doesNotMatch(contourAdminText, /Вся номенклатура|Типы компонентов|Рабочий стол/, "Contour Admin island must not bundle unrelated scenarios");
const specifications2Text = new TextDecoder().decode(specifications2.bytes);
assert.doesNotMatch(specifications2Text, /Вся номенклатура|Типы компонентов|Рабочий стол/, "Specifications 2.0 island must not bundle unrelated scenarios");
const ganttText = new TextDecoder().decode(gantt.bytes);
assert.doesNotMatch(ganttText, /Вся номенклатура|Типы компонентов|Рабочий стол/, "Gantt island must not bundle unrelated scenarios");
const rolesText = new TextDecoder().decode(roles.bytes);
assert.doesNotMatch(rolesText, /Вся номенклатура|Типы компонентов|Подсчет импортированных компонентов/, "Roles production island must not bundle unrelated scenarios");
const componentTypesText = new TextDecoder().decode(componentTypes.bytes);
assert.doesNotMatch(componentTypesText, /Вся номенклатура|Подсчет импортированных компонентов|Роли и доступ/, "Component Types production island must not bundle unrelated scenarios");
const operationsText = new TextDecoder().decode(operations.bytes);
assert.doesNotMatch(operationsText, /Вся номенклатура|Типы компонентов|Роли и доступ/, "Operations production island must not bundle unrelated scenarios");
const nomenclatureTypesText = new TextDecoder().decode(nomenclatureTypes.bytes);
assert.doesNotMatch(nomenclatureTypesText, /Вся номенклатура|SMT-монтаж|Роли и доступ/, "Nomenclature Types production island must not bundle unrelated scenarios");
const statusesText = new TextDecoder().decode(statuses.bytes);
assert.doesNotMatch(statusesText, /Вся номенклатура|SMT-монтаж|Роли и доступ/, "Statuses production island must not bundle unrelated scenarios");

const css = await readFile(join(sourceRoot, "styles.css"));
const cssMeasurement = { raw: css.length, gzip: gzipSync(css).length };
assert.ok(cssMeasurement.raw <= 30_000, `styles raw bundle ${cssMeasurement.raw} exceeds 30000`);
assert.ok(cssMeasurement.gzip <= 5_350, `styles gzip bundle ${cssMeasurement.gzip} exceeds 5350`);

console.log(JSON.stringify({
  nomenclature: nomenclature.measurement,
  boards: boards.measurement,
  structureEmployees: structureEmployees.measurement,
  structurePositions: structurePositions.measurement,
  structureOrgUnits: structureOrgUnits.measurement,
  structureWorkCenters: structureWorkCenters.measurement,
  structureEquipment: structureEquipment.measurement,
  structureResponsibilityPolicies: structureResponsibilityPolicies.measurement,
  structureMigrationDiagnostics: structureMigrationDiagnostics.measurement,
  weeklyProductionControl: weeklyProductionControl.measurement,
  timesheet: timesheet.measurement,
  planningWorkbench: planningWorkbench.measurement,
  shiftWorkOrders: shiftWorkOrders.measurement,
  shiftWorkOrdersPrint: shiftWorkOrdersPrint.measurement,
  shiftMasterBoard: shiftMasterBoard.measurement,
  employeeDesktop: employeeDesktop.measurement,
  authPicker: authPicker.measurement,
  contourAdmin: contourAdmin.measurement,
  specifications2: specifications2.measurement,
  gantt: gantt.measurement,
  roles: roles.measurement,
  componentTypes: componentTypes.measurement,
  operations: operations.measurement,
  nomenclatureTypes: nomenclatureTypes.measurement,
  statuses: statuses.measurement,
  fullLab: lab.measurement,
  styles: cssMeasurement,
}));
