import { Fragment, useMemo } from "react";
import { MetricCard, MetricGrid, Panel, StatusToken, TableWrap } from "../../ui/components";
import { adaptTimesheet, formatTimesheetHours } from "./adapter";

export function TimesheetScenario({ payload, onRequestLegacy }: { payload: unknown; onRequestLegacy?(scope?: string): void }) {
  const model = useMemo(() => adaptTimesheet(payload), [payload]);
  return <main className={`module-page timesheet-page is-${model.view}`} data-timesheet-react>
    <section className="workspace"><section className="workspace-main">
      <Panel heading={<div><StatusToken label="Календарь и факты" tone={model.canActivate ? "success" : "warning"} /><h2>Табель · {model.periodLabel}</h2><p>Плановый календарь и факты рабочего времени отображаются раздельно. Редактирование остаётся в legacy.</p></div>}>
        <div className="timesheet-controls"><div role="group" aria-label="Режим отображения"><button className={model.view === "week" ? "is-active" : ""} onClick={() => onRequestLegacy?.("view:week")} type="button">Неделя</button><button className={model.view === "month" ? "is-active" : ""} onClick={() => onRequestLegacy?.("view:month")} type="button">Месяц</button></div><div><button aria-label="Предыдущий период" onClick={() => onRequestLegacy?.("period:-1")} type="button">‹</button><strong>{model.periodLabel}</strong><button aria-label="Следующий период" onClick={() => onRequestLegacy?.("period:1")} type="button">›</button></div></div>
        <MetricGrid label="Итоги табеля"><MetricCard label="Сотрудников" value={model.employeeCount} /><MetricCard label="Отделов" value={model.departmentCount} /><MetricCard label="План часов" value={formatTimesheetHours(model.plannedHours)} /><MetricCard label="Сверхурочно" value={formatTimesheetHours(model.overtimeHours)} /></MetricGrid>
      </Panel>
      <Panel heading={<div><h2>Календарь и факты рабочего времени</h2><p>{model.calendarSource === "canonical" ? "System Domains · Personnel Calendar" : "Источник календаря требует проверки"}</p></div>}>
        <TableWrap><table className="timesheet-table"><thead><tr><th>Сотрудник</th><th>Должность</th><th>График</th>{model.days.map((day) => <th className={day.isWeekend ? "is-weekend" : ""} key={day.id}><b>{day.day}</b><span>{day.weekday}</span></th>)}<th>Итого</th><th>Сверх</th></tr></thead><tbody>{model.groups.map((group) => <Fragment key={group.department}>
          <tr className="timesheet-department-row" data-timesheet-department={group.department}><th colSpan={5 + model.days.length}><span>{group.department}</span><small>{group.employees.length} чел.</small></th></tr>
          {group.employees.map((employee) => <tr className="timesheet-employee-row" data-timesheet-employee={employee.id} key={employee.id}><th className="timesheet-person-cell"><strong>{employee.name}</strong><small>{employee.personKind === "master" ? "мастер" : "исполнитель"}</small></th><td>{employee.role}</td><td><button onClick={() => onRequestLegacy?.(`schedule:${employee.id}:${model.days[0]?.id || ""}`)} title="Открыть график в legacy" type="button"><strong>{employee.scheduleCode}</strong><small>{employee.scheduleMode}</small></button></td>{employee.cells.map((cell) => <td className={`timesheet-day-cell is-${cell.code}`} data-timesheet-cell={`${employee.id}:${cell.dateKey}`} key={cell.dateKey} title={cell.title}><button onClick={() => onRequestLegacy?.(`day:${employee.id}:${cell.dateKey}`)} type="button">{cell.display.map((line) => <span key={line}>{line}</span>)}</button>{cell.overtime ? <span className="timesheet-overtime-layer">+{formatTimesheetHours(cell.overtime)}</span> : null}</td>)}<td><strong>{formatTimesheetHours(employee.totalHours)}</strong><small>ч</small></td><td><strong>{formatTimesheetHours(employee.overtimeHours)}</strong><small>ч</small></td></tr>)}
        </Fragment>)}</tbody></table></TableWrap>
      </Panel>
    </section></section>
  </main>;
}
