import { useEffect, useMemo, useState } from "react";
import { ActionButton, MetricCard, MetricGrid, OperationalPage, Panel, StatusToken, SystemState } from "../../ui/components";
import { adaptShiftMasterBoardPayload } from "./adapter";

const quantity = (value: number, unit = "шт.") => `${value.toLocaleString("ru-RU")} ${unit}`;
const focusOptions = [{ id: "all", label: "Все" }, { id: "mine", label: "Мои" }, { id: "open", label: "Незакрытые" }, { id: "attention", label: "Требуют внимания" }] as const;

export function ShiftMasterBoardScenario({ payload, onSelectFocus, onRequestLegacy }: { payload: unknown; onSelectFocus?(focus: "all" | "mine" | "open" | "attention"): void; onRequestLegacy?(scope?: string): void }) {
  const model = useMemo(() => adaptShiftMasterBoardPayload(payload), [payload]);
  const [selectedId, setSelectedId] = useState(model.selectedRow?.id || "");
  useEffect(() => { if (!model.rows.some((row) => row.id === selectedId)) setSelectedId(model.selectedRow?.id || model.rows[0]?.id || ""); }, [model, selectedId]);
  const toolbar = <header className="shift-master-board-react-toolbar" data-shift-master-board-toolbar>
      <button className="shift-master-board-react-date" onClick={() => onRequestLegacy?.("date")} type="button"><span>Смена</span><strong>{model.windowLabel}</strong></button>
      <MetricGrid className="shift-master-board-react-kpis" label="Сводка смены"><MetricCard label="План" value={quantity(model.plannedQuantity)} /><MetricCard label="Распределено" value={quantity(model.assignedQuantity)} /><MetricCard label="Факт" value={quantity(model.factQuantity)} /></MetricGrid>
      <button className="shift-master-board-react-master" onClick={() => onRequestLegacy?.("master")} type="button"><strong>{model.activeMasterName}</strong><span>{model.activeMasterDepartment}</span></button>
      <nav aria-label="Фокус доски" className="shift-master-board-react-focus">{focusOptions.map((option) => <button aria-pressed={model.focus === option.id} className={model.focus === option.id ? "is-active" : ""} data-shift-master-board-focus={option.id} disabled={!onSelectFocus} key={option.id} onClick={() => onSelectFocus?.(option.id)} type="button">{option.label}</button>)}</nav>
    </header>;
  if (!model.rows.length) return <OperationalPage className="shift-master-board-react" label="Мастерская">{toolbar}<SystemState title="В этом фокусе задач нет" text="Выберите другой фокус или смену, чтобы вернуть карточки на доску." tone="neutral" /></OperationalPage>;
  const selected = model.rows.find((row) => row.id === selectedId) || model.selectedRow || model.rows[0];
  return <OperationalPage className="shift-master-board-react" label="Мастерская">
    {toolbar}
    <section className="shift-master-board-react-grid">
      <Panel heading={<div className="panel-heading"><div><p>Рабочая карточка</p><h2>{selected.documentNumber}</h2></div><StatusToken label={selected.signal.label} tone={selected.signal.tone} /></div>}>
        <div className="shift-master-board-react-detail" data-shift-master-board-detail={selected.id}>
          <div className="shift-master-board-react-title"><span>Изделие</span><strong>{selected.orderLabel}</strong><small>{selected.routePartLabel} · {selected.operationName}</small></div>
          <MetricGrid label="Покрытие сменной задачи"><MetricCard label="План" value={quantity(selected.plannedQuantity, selected.unit)} meta={selected.workCenterLabel} /><MetricCard label="Распределено" value={quantity(selected.assignedQuantity, selected.unit)} meta={selected.masterName} /><MetricCard label="Факт" value={quantity(selected.factQuantity, selected.unit)} meta={selected.factUpdatedAt} /><MetricCard label="Остаток" value={quantity(selected.remainingQuantity, selected.unit)} meta={selected.riskLabel || "без риска"} /></MetricGrid>
          <section className="shift-master-board-react-executors"><header><strong>Исполнители</strong><span>{selected.executors.length}</span></header>{selected.executors.length ? selected.executors.map((executor) => <div key={executor.id}><span>{executor.name}</span><strong>{quantity(executor.quantity, selected.unit)}</strong></div>) : <p>Исполнитель ещё не назначен.</p>}</section>
          <div className="shift-master-board-react-actions"><ActionButton onClick={() => onRequestLegacy?.(`assign:${selected.id}`)}>Распределить</ActionButton><ActionButton onClick={() => onRequestLegacy?.(`fact:${selected.id}`)} variant="secondary">Внести факт</ActionButton><ActionButton onClick={() => onRequestLegacy?.(`print:${selected.id}`)} variant="secondary">Печать СЗН</ActionButton></div>
        </div>
      </Panel>
      <Panel heading={<div className="panel-heading"><div><p>{model.windowLabel}</p><h2>Доска сменных задач</h2></div><span>{model.rows.length} карточки</span></div>}>
        <div className="shift-master-board-react-lanes" data-shift-master-board-lanes>{model.lanes.map((lane) => <section className={`shift-master-board-react-lane is-${lane.tone}`} data-shift-master-board-lane={lane.id} key={lane.id}><header><strong>{lane.label}</strong><span>{lane.rows.length}</span><small>{lane.caption}</small></header><div>{lane.rows.length ? lane.rows.map((row) => <button aria-pressed={row.id === selected.id} className={row.id === selected.id ? "is-active" : ""} data-shift-master-board-card={row.id} key={row.id} onClick={() => setSelectedId(row.id)} type="button"><strong>{row.operationName}</strong><small>{row.workCenterLabel} · {row.timeLabel}</small><span>{quantity(row.assignedQuantity, row.unit)} / {quantity(row.plannedQuantity, row.unit)}</span><StatusToken label={row.signal.label} tone={row.signal.tone} /></button>) : <p>нет карточек</p>}</div></section>)}</div>
      </Panel>
    </section>
  </OperationalPage>;
}
