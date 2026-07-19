import { useMemo, useState, type FocusEvent, type MouseEvent } from "react";
import { EmptyState, MetricCard, MetricGrid, ModuleHeader, Panel, StatusToken, TableWrap } from "../../ui/components";
import { adaptWeeklyProductionControl, formatWeeklyControlPercent, formatWeeklyControlQuantity, type WeeklyControlDayNote } from "./adapter";

interface VisibleNote {
  left: number;
  note: WeeklyControlDayNote;
  top: number;
}

function positionNote(target: HTMLElement, note: WeeklyControlDayNote): VisibleNote {
  const rect = target.getBoundingClientRect();
  const margin = 14;
  const width = Math.min(390, window.innerWidth - margin * 2);
  const estimatedHeight = 220;
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
  const preferredTop = rect.bottom + 10;
  const top = Math.max(margin, preferredTop + estimatedHeight <= window.innerHeight - margin ? preferredTop : rect.top - estimatedHeight - 10);
  return { left: Math.round(left), note, top: Math.round(top) };
}

export function WeeklyProductionControlScenario({ payload }: { payload: unknown }) {
  const model = useMemo(() => adaptWeeklyProductionControl(payload), [payload]);
  const [visibleNote, setVisibleNote] = useState<VisibleNote | null>(null);
  const showNote = (target: HTMLElement, note: WeeklyControlDayNote | null) => {
    if (note) setVisibleNote(positionNote(target, note));
  };
  const showMouseNote = (event: MouseEvent<HTMLTableCellElement>, note: WeeklyControlDayNote | null) => showNote(event.currentTarget, note);
  const showFocusNote = (event: FocusEvent<HTMLTableCellElement>, note: WeeklyControlDayNote | null) => showNote(event.currentTarget, note);

  return <main className="module-page weekly-production-control-page" data-weekly-production-control-react>
    <ModuleHeader eyebrow="Планирование нагрузки" title="Контроль недели" badge={<StatusToken label={`Неделя · ${model.weekLabel}`} tone={model.canActivate ? "success" : "warning"} />} />
    <section className="workspace"><section className="workspace-main">
      {model.groups.length ? <Panel heading={<div><h2>План / факт по дням</h2><p>{model.days.length} дней · отклонение считается от плана дня</p></div>}>
        <TableWrap><table className="weekly-production-control-table"><thead><tr><th>Участок / оборудование</th>{model.days.map((day) => <th key={day.id}><strong>{day.weekday}</strong><span>{day.label}</span></th>)}<th>Итого</th><th>Откл.</th><th>Report</th></tr></thead><tbody>{model.groups.map((group) => <tr data-weekly-control-group={group.id} key={group.id}><td className="primary-cell"><strong>{group.workCenterLabel}</strong>{group.resourceLabel !== group.workCenterLabel ? <> <small>{group.resourceLabel}</small></> : null}</td>{group.days.map((day) => <td
          aria-label={day.note ? `${day.note.title}. ${day.note.plan}. ${day.note.fact}. ${day.note.text}` : undefined}
          className={`weekly-production-control-day-cell is-${day.tone}${day.isWeekend ? " is-weekend" : ""}${day.isDeviation ? " has-deviation" : ""}`}
          data-weekly-control-day={day.id}
          data-weekly-production-note={day.note ? "yes" : undefined}
          key={day.id}
          onBlur={() => setVisibleNote(null)}
          onFocus={(event) => showFocusNote(event, day.note)}
          onMouseEnter={(event) => showMouseNote(event, day.note)}
          onMouseLeave={() => setVisibleNote(null)}
          tabIndex={day.note ? 0 : undefined}
          title={day.note ? undefined : day.noteCount || day.reportCount ? `${day.noteCount} заметок · ${day.reportCount} report` : undefined}
        ><span>План <strong>{Math.round(day.planQuantity).toLocaleString("ru-RU")}</strong></span>{" "}<span>Факт <strong>{Math.round(day.factQuantity).toLocaleString("ru-RU")}</strong></span></td>)}<td><strong>{formatWeeklyControlQuantity(group.totalPlan, group.unit)}</strong><span>факт {formatWeeklyControlQuantity(group.totalFact, group.unit)}</span></td><td><StatusToken label={formatWeeklyControlPercent(group.deviationPercent)} tone={group.statusTone} /></td><td><strong>{group.reportCount} report</strong><span>{group.deviationCount ? `${group.deviationCount} откл.` : "без отклонений"}</span></td></tr>)}</tbody></table></TableWrap>
      </Panel> : <Panel heading={<div><h2>Нет данных недели</h2><p>{model.weekLabel}</p></div>}><EmptyState title="В выбранной неделе нет плановых операций" text="Проверь дату недели или передай заказ-наряды в планирование." /></Panel>}
      <Panel heading={<div><h2>Сводка недельного контроля</h2><p>информативно · без записи в систему</p></div>}><MetricGrid label="Сводка недельного контроля"><MetricCard label="Неделя" value={model.weekLabel} meta={`${model.groups.length} участков / ресурсов`} /><MetricCard label="План" value={formatWeeklyControlQuantity(model.totals.plan)} meta={`${model.operationCount} операций`} /><MetricCard label="Факт" value={formatWeeklyControlQuantity(model.totals.fact)} meta={`${formatWeeklyControlPercent(model.totals.deviationPercent)} к плану`} /><MetricCard label="Отклонения >5%" value={model.totals.deviationCount} meta={`${model.totals.reportCount} report из рабочего места`} /></MetricGrid></Panel>
    </section></section>
    {visibleNote ? <section className="weekly-production-control-note-popover" data-weekly-react-note-popover role="note" style={{ left: visibleNote.left, top: visibleNote.top }}>
      <header><strong>{visibleNote.note.title}</strong><span>{[visibleNote.note.plan, visibleNote.note.fact].filter(Boolean).join(" · ")}</span></header>
      <div><em>{visibleNote.note.author}</em><p>{visibleNote.note.text}</p>{visibleNote.note.extraNotes ? <small>{visibleNote.note.extraNotes}</small> : null}{visibleNote.note.reportText ? <small>Report: {visibleNote.note.reportText}</small> : null}{visibleNote.note.extraReports ? <small>{visibleNote.note.extraReports}</small> : null}</div>
    </section> : null}
  </main>;
}
