import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import { ActionButton, MetricCard, MetricGrid, ModuleHeader, ModulePage, Panel, StatusToken } from "../../ui/components";
import { adaptGanttPayload, type GanttDependencyModel, type GanttSlotModel } from "./adapter";
import type { GanttScale } from "./adapter";

export type GanttReactCommand = { type: "reschedule-slot"; slotId: string; routeId: string; operationId: string; plannedStart: string; source?: "form" | "drag" };
export type GanttReactNavigation =
  | { type: "refresh" }
  | { type: "set-window-start"; value: string }
  | { type: "set-scale"; scale: GanttScale }
  | { type: "set-zoom"; action: "out" | "reset" | "in" }
  | { type: "jump-today" }
  | { type: "toggle-expanded-routes"; routeIds: string[] }
  | { type: "toggle-quantity" };

const dateTime = (value: string) => value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const dateTimeInput = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const gapLabel = (dependency: GanttDependencyModel) => dependency.gapMinutes < 0 ? `Пересечение ${Math.abs(dependency.gapMinutes)} мин` : dependency.gapMinutes === 0 ? "Без разрыва" : `Разрыв ${dependency.gapMinutes} мин`;
const GANTT_SLOT_DRAG_MIME = "application/x-mes-gantt-slot";
const dragSnapMs = (scale: GanttScale) => scale === "hours" ? 15 * 60_000 : scale === "days" ? 60 * 60_000 : 4 * 60 * 60_000;

export function GanttScenario({ payload, onCommand, onNavigate }: { payload: unknown; onCommand?(command: GanttReactCommand): Promise<{ ok?: boolean; message?: string } | void>; onNavigate?(navigation: GanttReactNavigation): Promise<{ ok?: boolean; message?: string } | void> }) {
  const model = useMemo(() => adaptGanttPayload(payload), [payload]);
  const slots = model.rows.flatMap((row) => row.slots);
  const modelActiveRouteId = "activeRouteId" in model ? String(model.activeRouteId || "") : "";
  const modelSelectedSlotId = "selectedSlotId" in model ? String(model.selectedSlotId || "") : "";
  const preferredSelectedId = slots.find((slot) => !slot.aggregate && slot.id === modelSelectedSlotId)?.id
    || slots.find((slot) => !slot.aggregate && slot.routeId === modelActiveRouteId)?.id
    || slots.find((slot) => !slot.aggregate)?.id
    || model.rows[0]?.slots[0]?.id
    || "";
  const activeRouteRowId = modelActiveRouteId ? `route:${modelActiveRouteId}` : "";
  const visibleRouteIds = model.rows
    .filter((row) => row.type === "route" && row.id.startsWith("route:"))
    .map((row) => row.id.slice("route:".length));
  const reactScrollRef = useRef<HTMLDivElement>(null);
  const focusedRouteRowRef = useRef("");
  const [selectedId, setSelectedId] = useState(preferredSelectedId);
  const selected = slots.find((slot) => slot.id === selectedId) || null;
  const [dependencyMode, setDependencyMode] = useState(false);
  const [selectedDependencyId, setSelectedDependencyId] = useState(model.dependencies[0]?.id || "");
  const [plannedStartDraft, setPlannedStartDraft] = useState(() => dateTimeInput(selected?.plannedStart || ""));
  const [commandError, setCommandError] = useState("");
  const [saving, setSaving] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  const [navigating, setNavigating] = useState(false);
  const selectedDependency = model.dependencies.find((dependency) => dependency.id === selectedDependencyId) || model.dependencies[0] || null;

  useEffect(() => {
    setSelectedId((current) => current === preferredSelectedId ? current : preferredSelectedId);
  }, [modelActiveRouteId, modelSelectedSlotId, preferredSelectedId]);
  useEffect(() => {
    setPlannedStartDraft(dateTimeInput(selected?.plannedStart || ""));
    setCommandError("");
  }, [selected?.id, selected?.plannedStart]);
  useEffect(() => {
    const shell = reactScrollRef.current;
    const focusKey = `${activeRouteRowId}:${model.windowStart}`;
    if (!shell || !activeRouteRowId || focusedRouteRowRef.current === focusKey) return;
    const row = [...shell.querySelectorAll<HTMLElement>("[data-row-id]")]
      .find((candidate) => candidate.dataset.rowId === activeRouteRowId);
    if (!row) return;
    if (shell.dataset.ganttFocusedRouteRow !== focusKey) {
      row.scrollIntoView({ block: "center", inline: "nearest" });
      shell.scrollLeft = Math.max(0, Number(shell.scrollLeft || 0) - model.leftWidth / 2);
      shell.dataset.ganttFocusedRouteRow = focusKey;
    }
    focusedRouteRowRef.current = focusKey;
  }, [activeRouteRowId, model.leftWidth, model.rows, model.windowStart]);

  const selectDependency = (dependencyId: string) => {
    const dependency = model.dependencies.find((item) => item.id === dependencyId);
    if (!dependency) return;
    setSelectedDependencyId(dependency.id);
    const target = model.rows.flatMap((row) => row.slots).find((slot) => slot.id === dependency.toSlotId && !slot.aggregate);
    if (target) setSelectedId(target.id);
  };
  const navigate = async (navigation: GanttReactNavigation) => {
    if (!onNavigate || navigating) return;
    setNavigating(true); setNavigationError("");
    try {
      const result = await onNavigate(navigation);
      if (result && result.ok === false) setNavigationError(result.message || "Не удалось изменить параметры графика.");
    } catch (error) {
      setNavigationError(error instanceof Error ? error.message : "Не удалось изменить параметры графика.");
    } finally {
      setNavigating(false);
    }
  };
  const commitSchedule = async (slot: GanttSlotModel, plannedStart: string, source: "form" | "drag") => {
    if (!onCommand || !slot.canReschedule || saving) return;
    setSaving(true); setCommandError("");
    try {
      const result = await onCommand({ type: "reschedule-slot", slotId: slot.id, routeId: slot.routeId, operationId: slot.operationId, plannedStart, source });
      if (result && result.ok === false) setCommandError(result.message || "Начало операции не сохранено.");
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : "Начало операции не сохранено.");
    } finally {
      setSaving(false);
    }
  };
  const reschedule = async () => { if (selected) await commitSchedule(selected, plannedStartDraft, "form"); };
  const dropSlot = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!model.canDrag || saving) return;
    let dragData: { slotId?: string; grabOffsetPx?: number } = {};
    try { dragData = JSON.parse(event.dataTransfer.getData(GANTT_SLOT_DRAG_MIME) || "{}"); } catch { return; }
    const slot = slots.find((candidate) => candidate.id === dragData.slotId && !candidate.aggregate);
    if (!slot || slot.rowId !== event.currentTarget.dataset.ganttReactDropLane) return;
    const windowStart = Date.parse(model.windowStart); const windowEnd = Date.parse(model.windowEnd);
    if (!slot?.canReschedule || !Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const rawX = event.clientX - rect.left - Math.max(0, Number(dragData.grabOffsetPx) || 0);
    const x = Math.max(0, Math.min(model.timelineWidth, rawX));
    const rawStart = windowStart + (x / model.timelineWidth) * (windowEnd - windowStart);
    const snap = dragSnapMs(model.scale); const plannedStart = new Date(Math.round(rawStart / snap) * snap).toISOString();
    setSelectedId(slot.id); setPlannedStartDraft(dateTimeInput(plannedStart));
    void commitSchedule(slot, plannedStart, "drag");
  };

  return <ModulePage header={<ModuleHeader eyebrow="Планирование" title="Диаграмма Ганта" badge={<><span className="lab-badge" data-react-prototype-marker title="Обычный интерфейс переведён на React + TypeScript; точная геометрия и отложенные команды ещё не приняты">React TS · прототип</span><span className="lab-badge">PostgreSQL · {model.canEditSchedule ? "command" : "read-only"}</span></>} />}>
    <section
      aria-busy={navigating}
      className="gantt-react-toolbar"
      data-gantt-planning-projection-source={model.projectionSource}
    >
      <label className="gantt-react-period" data-gantt-react-period><span>Период</span><input disabled={!onNavigate || navigating} onChange={(event) => void navigate({ type: "set-window-start", value: event.currentTarget.value })} type="date" value={model.windowStartDate} /><small>до {model.windowEndDate}</small></label>
      <div className="gantt-react-scale" data-gantt-react-scale-group role="group" aria-label="Масштаб времени">{model.scaleOptions.map((option) => <button aria-pressed={model.scale === option.id} className={model.scale === option.id ? "is-active" : ""} data-gantt-react-scale={option.id} disabled={!onNavigate || navigating} key={option.id} onClick={() => void navigate({ type: "set-scale", scale: option.id })} type="button">{option.label}</button>)}</div>
      <div className="gantt-react-zoom" data-gantt-react-zoom-group role="group" aria-label="Масштаб Ганта"><button aria-label="Уменьшить масштаб Ганта" data-gantt-react-zoom="out" disabled={!onNavigate || navigating} onClick={() => void navigate({ type: "set-zoom", action: "out" })} type="button">−</button><button aria-label="Сбросить масштаб Ганта" data-gantt-react-zoom="reset" disabled={!onNavigate || navigating} onClick={() => void navigate({ type: "set-zoom", action: "reset" })} type="button">{model.zoomLabel}</button><button aria-label="Увеличить масштаб Ганта" data-gantt-react-zoom="in" disabled={!onNavigate || navigating} onClick={() => void navigate({ type: "set-zoom", action: "in" })} type="button">+</button></div>
      <StatusToken label={model.projectionSource === "server" ? "PostgreSQL projection" : model.projectionSource} tone={model.projectionSource === "server" ? "success" : "warning"} />
      <div className="gantt-react-scale gantt-react-toolbar-actions" role="group" aria-label="Действия отображения"><button data-gantt-react-refresh disabled={!model.canRefresh || !onNavigate || navigating} onClick={() => void navigate({ type: "refresh" })} title={model.canRefresh ? "Обновить PostgreSQL-проекцию" : "Owner обновления не подключён"} type="button">Обновить</button><button aria-pressed={model.allRoutesExpanded} data-gantt-react-toggle-expanded-routes disabled={!onNavigate || navigating || !visibleRouteIds.length} onClick={() => void navigate({ type: "toggle-expanded-routes", routeIds: visibleRouteIds })} type="button">{model.allRoutesExpanded ? "Свернуть" : "Развернуть"}</button><button aria-pressed={model.showQuantity} data-gantt-react-toggle-quantity disabled={!onNavigate || navigating} onClick={() => void navigate({ type: "toggle-quantity" })} type="button">Кол-во</button><button data-gantt-react-jump-today disabled={!onNavigate || navigating} onClick={() => void navigate({ type: "jump-today" })} type="button">Сегодня</button><ActionButton variant="secondary" onClick={() => setDependencyMode((current) => !current)}>Зависимости ({model.dependencyCount})</ActionButton></div>
    </section>
    {navigationError ? <p className="react-nomenclature-command-error gantt-react-navigation-error" role="alert">{navigationError}</p> : null}
    <section aria-label="Команды без серверного владельца" className="gantt-react-blocked-actions" data-gantt-react-blocked-actions>
      <p>Пока недоступно без подтверждённого серверного владельца:</p>
      <ActionButton disabled title="Требуется серверный владелец пересчёта производственных календарей" variant="secondary"><span data-gantt-react-blocked-action="refresh">Пересчитать по календарям</span></ActionButton>
      <ActionButton disabled title="Требуется серверный владелец маршрутов зависимостей" variant="secondary"><span data-gantt-react-blocked-action="edit-dependency">Редактировать связи</span></ActionButton>
      {!model.canDrag ? <ActionButton disabled title="Требуется серверный владелец перемещения слота" variant="secondary"><span data-gantt-react-blocked-action="drag">Перетаскивание</span></ActionButton> : null}
      <ActionButton disabled title="Требуется серверный владелец длительности слота" variant="secondary"><span data-gantt-react-blocked-action="resize">Изменить длительность</span></ActionButton>
      <ActionButton disabled title="Требуется серверный владелец оптимизации плана" variant="secondary"><span data-gantt-react-blocked-action="optimize">Оптимизировать</span></ActionButton>
    </section>
    <MetricGrid label="Сводка графика"><MetricCard label="Маршруты" value={model.routeCount} /><MetricCard label="Строки" value={model.rows.length} /><MetricCard label="Слоты" value={model.slotCount} /><MetricCard label="Зависимости" value={model.dependencyCount} /></MetricGrid>
    <section className="gantt-react-grid">
      <Panel heading={<div className="panel-heading"><div><p>Упрощённая геометрия React TS</p><h2>Производственный план</h2></div><StatusToken label={model.canEditSchedule ? "Изменение старта" : "Только просмотр"} tone={model.canEditSchedule ? "success" : "neutral"} /></div>}>
        <div className="gantt-react-scroll" data-ui-component="GanttRuntime" ref={reactScrollRef}>
          <div className="gantt-react-canvas" data-ui-component="GanttCanvas" style={{ "--gantt-left": `${model.leftWidth}px`, "--gantt-width": `${model.timelineWidth}px`, "--gantt-height": `${model.totalHeight}px`, "--gantt-timeline-height": `${model.timelineHeight}px` } as CSSProperties}>
            <div className="gantt-react-timeline" data-ui-component="GanttTimeline"><div className="gantt-react-corner">Маршруты и ресурсы</div><div className="gantt-react-ticks">{model.ticks.map((tick) => <div className={tick.weekend ? "is-weekend" : ""} key={tick.id} style={{ left: tick.left, width: tick.width }}><strong>{tick.label}</strong><small>{tick.sublabel}</small></div>)}</div></div>
            <div className="gantt-react-rows" data-ui-component="GanttRowsLayer">{model.rows.map((row) => <div className={`gantt-react-row is-${row.type}${row.id === activeRouteRowId ? " is-active-route" : ""}`} data-active-route={row.id === activeRouteRowId ? "true" : undefined} data-row-id={row.id} key={row.id} style={{ top: row.top, height: row.height }}><div className="gantt-react-label"><strong>{row.label}</strong><small>{row.meta}</small></div><div className="gantt-react-lane" data-gantt-react-drop-lane={row.id} onDragOver={(event) => { if (model.canDrag) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }} onDrop={dropSlot}>{row.slots.map((slot) => <button aria-pressed={selected?.id === slot.id} className={slot.aggregate ? "is-aggregate" : ""} data-slot-id={slot.id} data-ui-component="GanttSlot" draggable={model.canDrag && slot.canReschedule && !saving} key={slot.id} onClick={() => setSelectedId(slot.id)} onDragStart={(event) => { const rect = event.currentTarget.getBoundingClientRect(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData(GANTT_SLOT_DRAG_MIME, JSON.stringify({ slotId: slot.id, grabOffsetPx: event.clientX - rect.left })); event.dataTransfer.setData("text/plain", slot.id); }} style={{ left: slot.x, top: slot.top, width: slot.width, height: slot.height }} title={`${slot.title} · ${dateTime(slot.plannedStart)} — ${dateTime(slot.plannedEnd)}`} type="button">{model.showQuantity ? <span data-gantt-react-slot-quantity>{slot.quantity.toLocaleString("ru-RU")}</span> : null}</button>)}</div></div>)}</div>
          </div>
        </div>
      </Panel>
      <aside className="detail gantt-react-detail">{dependencyMode ? <><p>Зависимости маршрута</p><h2>{selectedDependency ? `${selectedDependency.fromTitle} → ${selectedDependency.toTitle}` : "Зависимостей нет"}</h2>{selectedDependency ? <><label><span>Связь</span><select data-gantt-dependency-list onChange={(event) => selectDependency(event.currentTarget.value)} value={selectedDependency.id}>{model.dependencies.map((dependency) => <option key={dependency.id} value={dependency.id}>{dependency.fromTitle} → {dependency.toTitle}</option>)}</select></label><dl data-gantt-dependency-detail={selectedDependency.id}><div><dt>Тип</dt><dd>{selectedDependency.kind === "transfer" ? "Передаточная партия" : "Окончание → начало"}</dd></div><div><dt>Источник</dt><dd>{selectedDependency.fromRowLabel}</dd></div><div><dt>Приёмник</dt><dd>{selectedDependency.toRowLabel}</dd></div><div><dt>Окончание</dt><dd>{dateTime(selectedDependency.fromEnd)}</dd></div><div><dt>Следующий старт</dt><dd>{dateTime(selectedDependency.toStart)}</dd></div><div><dt>Интервал</dt><dd>{gapLabel(selectedDependency)}</dd></div></dl></> : null}<ActionButton variant="secondary" onClick={() => setDependencyMode(false)}>Вернуться к слоту</ActionButton></> : <><p>Паспорт слота</p><h2>{selected?.title || "Выберите слот"}</h2>{selected ? <dl><div><dt>Статус</dt><dd>{selected.statusLabel}</dd></div><div><dt>Количество</dt><dd>{selected.quantity.toLocaleString("ru-RU")} шт.</dd></div><div><dt>Начало</dt><dd>{dateTime(selected.plannedStart)}</dd></div><div><dt>Окончание</dt><dd>{dateTime(selected.plannedEnd)}</dd></div><div><dt>Контекст</dt><dd>{selected.meta || "—"}</dd></div></dl> : null}{model.canEditSchedule ? <form data-gantt-react-schedule-form onSubmit={(event) => { event.preventDefault(); void reschedule(); }}><label><span>Новое начало операции</span><input disabled={!selected?.canReschedule || saving} name="plannedStart" onChange={(event) => setPlannedStartDraft(event.currentTarget.value)} required type="datetime-local" value={plannedStartDraft} /></label><button className="action action--primary" disabled={!selected?.canReschedule || saving} type="submit">{saving ? "Сохранение…" : "Сохранить начало"}</button></form> : <><ActionButton disabled title="Сохранение появится после подтверждения серверного владельца Planning" variant="secondary">Изменение старта недоступно</ActionButton><p className="react-nomenclature-command-error" data-gantt-react-schedule-blocked>Слот показан в React без перехода в legacy. Для сохранения старта нужна подтверждённая серверная команда Planning.</p></>}{selected?.locked ? <p className="react-nomenclature-command-error" role="alert">Завершённый или заблокированный слот нельзя переносить.</p> : commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}</>}</aside>
    </section>
  </ModulePage>;
}
