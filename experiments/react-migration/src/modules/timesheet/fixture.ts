const days = ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19"];
const workCell = (dateKey: string, overtime = 0) => ({ dateKey, value: overtime ? "overtime" : "work", code: overtime ? "work-overtime" : "work", display: ["08:00", "17:00"], label: "08:00-17:00", title: overtime ? "Рабочий день; сверхурочно" : "Рабочий день", availabilityStatus: "available", hours: 8, plannedHours: 8, overtime });
const offCell = (dateKey: string) => ({ dateKey, value: "off", code: "off", display: ["Вых"], label: "Вых", title: "Выходной день", availabilityStatus: "absent", hours: 0, plannedHours: 0, overtime: 0 });
const employee = (id: string, name: string, role: string, overtime = 0) => ({ id, timesheetId: id, name, role, personKind: "employee", schedule: { code: "5/2", mode: "08:00-17:00" }, cells: days.map((day, index) => index < 5 ? workCell(day, index === 2 ? overtime : 0) : offCell(day)), totalHours: 40, plannedHours: 40, overtimeHours: overtime });
const groups = [
  { department: "Отдел ручного монтажа", employees: [employee("employee-1", "Иванов Сергей Петрович", "Монтажник", 2), employee("employee-2", "Орлова Марина", "Контролёр")] },
  { department: "Склад", employees: [employee("employee-3", "Петров Алексей", "Кладовщик")] },
];
export const timesheetFixture = { model: { view: "week", periodLabel: "13.07.2026-19.07.2026", days, groups, departmentCount: 2, plannedHours: 120, overtimeHours: 2, unknownDayCount: 0, calendarSource: "canonical" } };
export const timesheetUpdateFixture = { model: { ...timesheetFixture.model, plannedHours: 120, overtimeHours: 3, groups: [{ ...groups[0], employees: [{ ...groups[0].employees[0], overtimeHours: 3 }, groups[0].employees[1]] }, groups[1]] } };
