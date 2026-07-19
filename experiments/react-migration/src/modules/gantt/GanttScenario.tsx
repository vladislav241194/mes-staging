import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ActionButton, MetricCard, MetricGrid, ModuleHeader, ModulePage, Panel, StatusToken } from "../../ui/components";
import { adaptGanttPayload, type GanttSlotModel } from "./adapter";

const dateTime = (value: string) => value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";

export function GanttScenario({ payload, onRequestLegacy }: { payload: unknown; onRequestLegacy?(scope?: string): void }) {
  const model = useMemo(() => adaptGanttPayload(payload), [payload]);
  const [selected, setSelected] = useState<GanttSlotModel | null>(() => model.rows.flatMap((row) => row.slots).find((slot) => !slot.aggregate) || model.rows[0]?.slots[0] || null);
  return <ModulePage header={<ModuleHeader eyebrow="Планирование" title="Диаграмма Ганта" badge={<span className="lab-badge">PostgreSQL · read-only React</span>} />}>
    <section className="gantt-react-toolbar">
      <div><span>Окно плана</span><strong>{dateTime(model.windowStart)} — {dateTime(model.windowEnd)}</strong></div>
      <div><span>Масштаб</span><strong>{model.scale}</strong></div>
      <StatusToken label={model.projectionSource === "server" ? "PostgreSQL projection" : model.projectionSource} tone={model.projectionSource === "server" ? "success" : "warning"} />
      <ActionButton variant="secondary" onClick={() => onRequestLegacy?.("toolbar")}>Фильтры и масштаб</ActionButton>
    </section>
    <MetricGrid label="Сводка графика"><MetricCard label="Маршруты" value={model.routeCount} /><MetricCard label="Строки" value={model.rows.length} /><MetricCard label="Слоты" value={model.slotCount} /><MetricCard label="Зависимости" value={model.dependencyCount} /></MetricGrid>
    <section className="gantt-react-grid">
      <Panel heading={<div className="panel-heading"><div><p>Готовая геометрия legacy-runtime</p><h2>Производственный план</h2></div><StatusToken label="Только просмотр" tone="neutral" /></div>}>
        <div className="gantt-react-scroll" data-ui-component="GanttRuntime">
          <div className="gantt-react-canvas" data-ui-component="GanttCanvas" style={{ "--gantt-left": `${model.leftWidth}px`, "--gantt-width": `${model.timelineWidth}px`, "--gantt-height": `${model.totalHeight}px`, "--gantt-timeline-height": `${model.timelineHeight}px` } as CSSProperties}>
            <div className="gantt-react-timeline" data-ui-component="GanttTimeline"><div className="gantt-react-corner">Маршруты и ресурсы</div><div className="gantt-react-ticks">{model.ticks.map((tick) => <div className={tick.weekend ? "is-weekend" : ""} key={tick.id} style={{ left: tick.left, width: tick.width }}><strong>{tick.label}</strong><small>{tick.sublabel}</small></div>)}</div></div>
            <div className="gantt-react-rows" data-ui-component="GanttRowsLayer">{model.rows.map((row) => <div className={`gantt-react-row is-${row.type}`} data-row-id={row.id} key={row.id} style={{ top: row.top, height: row.height }}><div className="gantt-react-label"><strong>{row.label}</strong><small>{row.meta}</small></div><div className="gantt-react-lane">{row.slots.map((slot) => <button aria-pressed={selected?.id === slot.id} className={slot.aggregate ? "is-aggregate" : ""} data-slot-id={slot.id} data-ui-component="GanttSlot" key={slot.id} onClick={() => setSelected(slot)} style={{ left: slot.x, top: slot.top, width: slot.width, height: slot.height }} title={`${slot.title} · ${dateTime(slot.plannedStart)} — ${dateTime(slot.plannedEnd)}`} type="button"><span>{slot.quantity.toLocaleString("ru-RU")}</span></button>)}</div></div>)}</div>
          </div>
        </div>
      </Panel>
      <aside className="detail gantt-react-detail"><p>Паспорт слота</p><h2>{selected?.title || "Выберите слот"}</h2>{selected ? <dl><div><dt>Статус</dt><dd>{selected.statusLabel}</dd></div><div><dt>Количество</dt><dd>{selected.quantity.toLocaleString("ru-RU")} шт.</dd></div><div><dt>Начало</dt><dd>{dateTime(selected.plannedStart)}</dd></div><div><dt>Окончание</dt><dd>{dateTime(selected.plannedEnd)}</dd></div><div><dt>Контекст</dt><dd>{selected.meta || "—"}</dd></div></dl> : null}<ActionButton variant="secondary" onClick={() => onRequestLegacy?.(`slot:${selected?.id || ""}`)}>Открыть редактирование</ActionButton><ActionButton variant="secondary" onClick={() => onRequestLegacy?.("dependencies")}>Зависимости в legacy</ActionButton></aside>
    </section>
  </ModulePage>;
}
