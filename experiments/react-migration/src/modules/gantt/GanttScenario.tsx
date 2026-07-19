import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ActionButton, MetricCard, MetricGrid, ModuleHeader, ModulePage, Panel, StatusToken } from "../../ui/components";
import { adaptGanttPayload, type GanttDependencyModel, type GanttSlotModel } from "./adapter";

export type GanttReactCommand = { type: "reschedule-slot"; slotId: string; routeId: string; operationId: string; plannedStart: string };

const dateTime = (value: string) => value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const dateTimeInput = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const gapLabel = (dependency: GanttDependencyModel) => dependency.gapMinutes < 0 ? `Пересечение ${Math.abs(dependency.gapMinutes)} мин` : dependency.gapMinutes === 0 ? "Без разрыва" : `Разрыв ${dependency.gapMinutes} мин`;

export function GanttScenario({ payload, onCommand, onRequestLegacy }: { payload: unknown; onCommand?(command: GanttReactCommand): Promise<{ ok?: boolean; message?: string } | void>; onRequestLegacy?(scope?: string): void }) {
  const model = useMemo(() => adaptGanttPayload(payload), [payload]);
  const initialSelectedId = model.rows.flatMap((row) => row.slots).find((slot) => !slot.aggregate)?.id || model.rows[0]?.slots[0]?.id || "";
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const selected = model.rows.flatMap((row) => row.slots).find((slot) => slot.id === selectedId) || null;
  const [dependencyMode, setDependencyMode] = useState(false);
  const [selectedDependencyId, setSelectedDependencyId] = useState(model.dependencies[0]?.id || "");
  const [plannedStartDraft, setPlannedStartDraft] = useState(() => dateTimeInput(selected?.plannedStart || ""));
  const [commandError, setCommandError] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedDependency = model.dependencies.find((dependency) => dependency.id === selectedDependencyId) || model.dependencies[0] || null;

  useEffect(() => {
    if (!selected && initialSelectedId) setSelectedId(initialSelectedId);
  }, [initialSelectedId, selected]);
  useEffect(() => {
    setPlannedStartDraft(dateTimeInput(selected?.plannedStart || ""));
    setCommandError("");
  }, [selected?.id, selected?.plannedStart]);

  const selectDependency = (dependencyId: string) => {
    const dependency = model.dependencies.find((item) => item.id === dependencyId);
    if (!dependency) return;
    setSelectedDependencyId(dependency.id);
    const target = model.rows.flatMap((row) => row.slots).find((slot) => slot.id === dependency.toSlotId && !slot.aggregate);
    if (target) setSelectedId(target.id);
  };
  const reschedule = async () => {
    if (!onCommand || !selected?.canReschedule || saving) return;
    setSaving(true); setCommandError("");
    try {
      const result = await onCommand({ type: "reschedule-slot", slotId: selected.id, routeId: selected.routeId, operationId: selected.operationId, plannedStart: plannedStartDraft });
      if (result && result.ok === false) setCommandError(result.message || "Начало операции не сохранено.");
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : "Начало операции не сохранено.");
    } finally {
      setSaving(false);
    }
  };

  return <ModulePage header={<ModuleHeader eyebrow="Планирование" title="Диаграмма Ганта" badge={<span className="lab-badge">PostgreSQL · {model.canEditSchedule ? "command" : "read-only React"}</span>} />}>
    <section className="gantt-react-toolbar">
      <div><span>Окно плана</span><strong>{dateTime(model.windowStart)} — {dateTime(model.windowEnd)}</strong></div>
      <div><span>Масштаб</span><strong>{model.scale}</strong></div>
      <StatusToken label={model.projectionSource === "server" ? "PostgreSQL projection" : model.projectionSource} tone={model.projectionSource === "server" ? "success" : "warning"} />
      <ActionButton variant="secondary" onClick={() => setDependencyMode((current) => !current)}>Зависимости ({model.dependencyCount})</ActionButton>
      <ActionButton variant="secondary" onClick={() => onRequestLegacy?.("toolbar")}>Фильтры и масштаб</ActionButton>
    </section>
    <MetricGrid label="Сводка графика"><MetricCard label="Маршруты" value={model.routeCount} /><MetricCard label="Строки" value={model.rows.length} /><MetricCard label="Слоты" value={model.slotCount} /><MetricCard label="Зависимости" value={model.dependencyCount} /></MetricGrid>
    <section className="gantt-react-grid">
      <Panel heading={<div className="panel-heading"><div><p>Готовая геометрия legacy-runtime</p><h2>Производственный план</h2></div><StatusToken label={model.canEditSchedule ? "Изменение старта" : "Только просмотр"} tone={model.canEditSchedule ? "success" : "neutral"} /></div>}>
        <div className="gantt-react-scroll" data-ui-component="GanttRuntime">
          <div className="gantt-react-canvas" data-ui-component="GanttCanvas" style={{ "--gantt-left": `${model.leftWidth}px`, "--gantt-width": `${model.timelineWidth}px`, "--gantt-height": `${model.totalHeight}px`, "--gantt-timeline-height": `${model.timelineHeight}px` } as CSSProperties}>
            <div className="gantt-react-timeline" data-ui-component="GanttTimeline"><div className="gantt-react-corner">Маршруты и ресурсы</div><div className="gantt-react-ticks">{model.ticks.map((tick) => <div className={tick.weekend ? "is-weekend" : ""} key={tick.id} style={{ left: tick.left, width: tick.width }}><strong>{tick.label}</strong><small>{tick.sublabel}</small></div>)}</div></div>
            <div className="gantt-react-rows" data-ui-component="GanttRowsLayer">{model.rows.map((row) => <div className={`gantt-react-row is-${row.type}`} data-row-id={row.id} key={row.id} style={{ top: row.top, height: row.height }}><div className="gantt-react-label"><strong>{row.label}</strong><small>{row.meta}</small></div><div className="gantt-react-lane">{row.slots.map((slot) => <button aria-pressed={selected?.id === slot.id} className={slot.aggregate ? "is-aggregate" : ""} data-slot-id={slot.id} data-ui-component="GanttSlot" key={slot.id} onClick={() => setSelectedId(slot.id)} style={{ left: slot.x, top: slot.top, width: slot.width, height: slot.height }} title={`${slot.title} · ${dateTime(slot.plannedStart)} — ${dateTime(slot.plannedEnd)}`} type="button"><span>{slot.quantity.toLocaleString("ru-RU")}</span></button>)}</div></div>)}</div>
          </div>
        </div>
      </Panel>
      <aside className="detail gantt-react-detail">{dependencyMode ? <><p>Зависимости маршрута</p><h2>{selectedDependency ? `${selectedDependency.fromTitle} → ${selectedDependency.toTitle}` : "Зависимостей нет"}</h2>{selectedDependency ? <><label><span>Связь</span><select data-gantt-dependency-list onChange={(event) => selectDependency(event.currentTarget.value)} value={selectedDependency.id}>{model.dependencies.map((dependency) => <option key={dependency.id} value={dependency.id}>{dependency.fromTitle} → {dependency.toTitle}</option>)}</select></label><dl data-gantt-dependency-detail={selectedDependency.id}><div><dt>Тип</dt><dd>{selectedDependency.kind === "transfer" ? "Передаточная партия" : "Окончание → начало"}</dd></div><div><dt>Источник</dt><dd>{selectedDependency.fromRowLabel}</dd></div><div><dt>Приёмник</dt><dd>{selectedDependency.toRowLabel}</dd></div><div><dt>Окончание</dt><dd>{dateTime(selectedDependency.fromEnd)}</dd></div><div><dt>Следующий старт</dt><dd>{dateTime(selectedDependency.toStart)}</dd></div><div><dt>Интервал</dt><dd>{gapLabel(selectedDependency)}</dd></div></dl></> : null}<ActionButton variant="secondary" onClick={() => setDependencyMode(false)}>Вернуться к слоту</ActionButton></> : <><p>Паспорт слота</p><h2>{selected?.title || "Выберите слот"}</h2>{selected ? <dl><div><dt>Статус</dt><dd>{selected.statusLabel}</dd></div><div><dt>Количество</dt><dd>{selected.quantity.toLocaleString("ru-RU")} шт.</dd></div><div><dt>Начало</dt><dd>{dateTime(selected.plannedStart)}</dd></div><div><dt>Окончание</dt><dd>{dateTime(selected.plannedEnd)}</dd></div><div><dt>Контекст</dt><dd>{selected.meta || "—"}</dd></div></dl> : null}{model.canEditSchedule ? <form data-gantt-react-schedule-form onSubmit={(event) => { event.preventDefault(); void reschedule(); }}><label><span>Новое начало операции</span><input disabled={!selected?.canReschedule || saving} name="plannedStart" onChange={(event) => setPlannedStartDraft(event.currentTarget.value)} required type="datetime-local" value={plannedStartDraft} /></label><button className="action action--primary" disabled={!selected?.canReschedule || saving} type="submit">{saving ? "Сохранение…" : "Сохранить начало"}</button></form> : <ActionButton variant="secondary" onClick={() => onRequestLegacy?.(`slot:${selected?.id || ""}`)}>Открыть редактирование</ActionButton>}{selected?.locked ? <p className="react-nomenclature-command-error" role="alert">Завершённый или заблокированный слот нельзя переносить.</p> : commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}</>}</aside>
    </section>
  </ModulePage>;
}
