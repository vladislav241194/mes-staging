import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-timesheet-react-model-"));
try {
  const adapterOutput = join(temporaryRoot, "adapter.mjs");
  const commandOutput = join(temporaryRoot, "command.mjs");
  await Promise.all([
    build({ entryPoints: [new URL("../experiments/react-migration/src/modules/timesheet/adapter.ts", import.meta.url).pathname], outfile: adapterOutput, bundle: true, platform: "node", format: "esm", target: "node20" }),
    build({ entryPoints: [new URL("../experiments/react-migration/src/modules/timesheet/command-contract.ts", import.meta.url).pathname], outfile: commandOutput, bundle: true, platform: "node", format: "esm", target: "node20" }),
  ]);
  const { adaptTimesheet } = await import(`${pathToFileURL(adapterOutput).href}?qa=${Date.now()}`);
  const { buildTimesheetAttendanceCommand } = await import(`${pathToFileURL(commandOutput).href}?qa=${Date.now()}`);
  const domains = {
    registries: {
      employees: [
        { id: "employee-a", displayName: "Иванов Иван", isActive: true },
        { id: "employee-b", displayName: "Петров Пётр", isActive: false },
      ],
      employmentAssignments: [{ id: "employment-a", employeeId: "employee-a", positionId: "position-a", orgUnitId: "department-a", isPrimary: true }],
      positions: [{ id: "position-a", name: "Монтажник", defaultScheduleTemplateId: "schedule-5-2", capabilities: { canExecute: true } }],
      orgUnits: [{ id: "department-a", name: "Монтаж", kind: "department", isActive: true }],
      scheduleTemplates: [{ id: "schedule-5-2", code: "5/2", label: "Пятидневка", start: "08:00", end: "17:00", subtractLunch: true, isActive: true }],
      scheduleAssignments: [
        { id: "schedule-assignment:employee-a:current", employeeId: "employee-a", scheduleTemplateId: "schedule-5-2", patternOffset: 0, validFrom: "1970-01-01", validTo: "2026-07-15" },
        { id: "schedule-assignment:employee-a:future", employeeId: "employee-a", scheduleTemplateId: "schedule-5-2", patternOffset: 0, validFrom: "2026-07-16", validTo: "" },
      ],
      attendanceEvents: [
        { id: "attendance:employee-a:2026-07-13", employeeId: "employee-a", date: "2026-07-13", type: "work", start: "08:00", end: "18:00", overtimeHours: 1, comment: "Смена" },
        { id: "attendance:employee-a:2026-07-14", employeeId: "employee-a", date: "2026-07-14", type: "vacation", comment: "Отпуск" },
      ],
    },
  };
  const model = adaptTimesheet({
    productionModel: { domains, view: "week", periodAnchor: "2026-07-15" },
    capabilities: { attendanceEdit: true, scheduleEdit: true, editableEmployeeIds: ["employee-a"], scheduleEditableEmployeeIds: ["employee-a"] },
  });
  assert.equal(model.calendarSource, "canonical");
  assert.equal(model.canActivate, true);
  assert.deepEqual([model.days[0].id, model.days.length, model.employeeCount, model.departmentCount], ["2026-07-13", 7, 1, 1]);
  assert.equal(model.employees[0].role, "Монтажник");
  assert.equal(model.employees[0].cells[0].value, "overtime");
  assert.equal(model.employees[0].cells[0].overtime, 1);
  assert.equal(model.employees[0].cells[0].hasAttendanceEvent, true);
  assert.equal(model.employees[0].cells[1].value, "vacation");
  assert.notEqual(model.employees[0].cells[2].value, "unknown", "validTo must remain effective on its inclusive final day");
  assert.notEqual(model.employees[0].cells[3].value, "unknown", "the next non-overlapping schedule interval must begin on the following day");
  assert.equal(model.employees[0].canEditAttendance, true);

  const validCommand = buildTimesheetAttendanceCommand({ employeeId: "employee-a", employeeName: "Иванов Иван", dateKey: "2026-07-15", value: "overtime", start: "08:00", end: "17:00", overtime: "1.5", comment: "Подмена", hasAttendanceEvent: false });
  assert.equal(validCommand.ok, true);
  assert.equal(validCommand.events.length, 2);
  assert.equal(validCommand.events[1].minutes, 90);
  assert.equal(buildTimesheetAttendanceCommand({ employeeId: "employee-a", employeeName: "Иванов Иван", dateKey: "2026-07-15", value: "vacation", start: "", end: "", overtime: "1", comment: "", hasAttendanceEvent: false }).ok, false);
  assert.equal(buildTimesheetAttendanceCommand({ employeeId: "employee-a", employeeName: "Иванов Иван", dateKey: "2026-07-15", value: "work", start: "08:00", end: "08:00", overtime: "0", comment: "", hasAttendanceEvent: false }).ok, false);

  console.log("Timesheet React production model QA: OK");
  console.log("- canonical System Domains calendar model, inclusive validTo and active employee projection: pass");
  console.log("- typed bounded attendance command validation: pass");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
