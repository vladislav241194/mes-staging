const days = ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19"];
const workCell = (dateKey: string, overtime = 0) => ({ dateKey, value: overtime ? "overtime" : "work", code: overtime ? "work-overtime" : "work", display: ["08:00", "17:00"], label: "08:00-17:00", title: overtime ? "Рабочий день; сверхурочно" : "Рабочий день", availabilityStatus: "available", hours: 8, plannedHours: 8, overtime });
const offCell = (dateKey: string) => ({ dateKey, value: "off", code: "off", display: ["Вых"], label: "Вых", title: "Выходной день", availabilityStatus: "absent", hours: 0, plannedHours: 0, overtime: 0 });
const employee = (id: string, name: string, role: string, overtime = 0) => ({ id, timesheetId: id, name, role, personKind: "employee", schedule: { code: "5/2", mode: "08:00-17:00" }, cells: days.map((day, index) => index < 5 ? workCell(day, index === 2 ? overtime : 0) : offCell(day)), totalHours: 40, plannedHours: 40, overtimeHours: overtime });
const groups = [
  { department: "Отдел ручного монтажа", employees: [employee("employee-1", "Иванов Сергей Петрович", "Монтажник", 2), employee("employee-2", "Орлова Марина", "Контролёр")] },
  { department: "Склад", employees: [employee("employee-3", "Петров Алексей", "Кладовщик")] },
];
export const timesheetFixture = { model: { view: "week", periodAnchor: "2026-07-13", periodLabel: "13.07.2026-19.07.2026", days, groups, departmentCount: 2, plannedHours: 120, overtimeHours: 2, unknownDayCount: 0, calendarSource: "canonical" } };
export const timesheetUpdateFixture = { model: { ...timesheetFixture.model, plannedHours: 120, overtimeHours: 3, groups: [{ ...groups[0], employees: [{ ...groups[0].employees[0], overtimeHours: 3 }, groups[0].employees[1]] }, groups[1]] } };

type FixtureRecord = Record<string, unknown>;
type FixtureNavigationCommand = { type: "set-view"; payload: { view: "week" | "month" } } | { type: "move-period"; payload: { direction: -1 | 1 } };
const asRecord = (value: unknown): FixtureRecord => value && typeof value === "object" ? value as FixtureRecord : {};
const fromDateKey = (value: unknown) => { const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(2026, 6, 13); };
const toDateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const addDays = (value: Date, amount: number) => new Date(value.getFullYear(), value.getMonth(), value.getDate() + amount);
const startOfFixtureWeek = (value: Date) => addDays(value, -((value.getDay() + 6) % 7));
const getFixtureDays = (view: "week" | "month", anchor: Date) => { const first = view === "week" ? startOfFixtureWeek(anchor) : new Date(anchor.getFullYear(), anchor.getMonth(), 1); const count = view === "week" ? 7 : new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(); return Array.from({ length: count }, (_, index) => toDateKey(addDays(first, index))); };
const getFixturePeriodLabel = (periodDays: string[], view: "week" | "month") => { const first = fromDateKey(periodDays[0]); if (view === "month") return first.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }); const format = (value: string) => fromDateKey(value).toLocaleDateString("ru-RU"); return `${format(periodDays[0])}-${format(periodDays[periodDays.length - 1])}`; };

export function createTimesheetNavigationFixture(payload: unknown, command: FixtureNavigationCommand) {
  const root = asRecord(payload); const source = asRecord(root.model || payload); const currentView = source.view === "month" ? "month" : "week"; const view = command.type === "set-view" ? command.payload.view : currentView; const currentAnchor = fromDateKey(source.periodAnchor || (Array.isArray(source.days) ? source.days[0] : ""));
  const direction = command.type === "move-period" ? command.payload.direction : 0;
  const anchor = !direction ? currentAnchor : currentView === "week" ? addDays(currentAnchor, direction * 7) : new Date(currentAnchor.getFullYear(), currentAnchor.getMonth() + direction, 1);
  const periodDays = getFixtureDays(view, anchor); const sourceDays = Array.isArray(source.days) ? source.days.map((value) => String(value)) : []; const sourceGroups = Array.isArray(source.groups) ? source.groups : [];
  const nextGroups = sourceGroups.map((groupValue) => { const group = asRecord(groupValue); const sourceEmployees = Array.isArray(group.employees) ? group.employees : []; return { ...group, employees: sourceEmployees.map((employeeValue) => { const sourceEmployee = asRecord(employeeValue); const sourceCells = Array.isArray(sourceEmployee.cells) ? sourceEmployee.cells.map(asRecord) : []; const templateByWeekday = new Map(sourceCells.map((cell, index) => [fromDateKey(cell.dateKey || sourceDays[index]).getDay(), cell])); const cells: FixtureRecord[] = periodDays.map((dateKey) => { const template = templateByWeekday.get(fromDateKey(dateKey).getDay()) || {}; return { ...template, dateKey }; }); return { ...sourceEmployee, cells, totalHours: cells.reduce((sum, cell) => sum + Number(cell.hours || 0), 0), overtimeHours: cells.reduce((sum, cell) => sum + Number(cell.overtime || 0), 0) }; }) }; });
  const nextEmployees = nextGroups.flatMap((group) => group.employees); return { ...root, model: { ...source, view, periodAnchor: toDateKey(anchor), periodLabel: getFixturePeriodLabel(periodDays, view), days: periodDays, groups: nextGroups, plannedHours: nextEmployees.reduce((sum, item) => sum + Number(item.totalHours || 0), 0), overtimeHours: nextEmployees.reduce((sum, item) => sum + Number(item.overtimeHours || 0), 0) } };
}
