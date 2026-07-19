import { useEffect, useMemo, useState } from "react";
import { ActionButton, MetricCard, MetricGrid, ModuleHeader, OperationalPage, Panel, StatusToken, SystemState } from "../../ui/components";
import { adaptEmployeeDesktopPayload } from "./adapter";

const quantity = (value: number, unit = "шт.") => `${value.toLocaleString("ru-RU")} ${unit}`;
const taskTone = (task: { isDone: boolean; isStarted: boolean }): "success" | "warning" | "neutral" => task.isDone ? "success" : task.isStarted ? "warning" : "neutral";

export function EmployeeDesktopScenario({ payload, onRequestLegacy }: { payload: unknown; onRequestLegacy?(scope?: string): void }) {
  const model = useMemo(() => adaptEmployeeDesktopPayload(payload), [payload]); const [selectedId, setSelectedId] = useState(model.selectedTask?.id || "");
  useEffect(() => { if (!model.tasks.some((task) => task.id === selectedId)) setSelectedId(model.selectedTask?.id || model.tasks[0]?.id || ""); }, [model, selectedId]);
  const selected = model.tasks.find((task) => task.id === selectedId) || model.selectedTask;
  return <OperationalPage className="employee-desktop-react" label="Рабочий стол">
    <ModuleHeader eyebrow="Оперативное управление" title="Рабочий стол" badge={<span className="lab-badge">read-only React</span>} />
    {!selected ? <SystemState title="Заданий нет" text="После распределения в Мастерской здесь появятся сменные задания." tone="neutral" /> : <section className="employee-desktop-react-grid">
      <Panel heading={<div className="panel-heading"><div><p>Рабочая карточка</p><h2>{selected.documentNumber}</h2></div><StatusToken label={selected.status} tone={taskTone(selected)} /></div>}>
        <div className="employee-desktop-react-detail" data-employee-desktop-detail={selected.id}>
          <section className="employee-desktop-react-summary"><article><span>Изделие</span><strong>{selected.orderLabel}</strong></article><article><span>Операция</span><strong>{selected.operationName}</strong></article><article><span>Маршрут</span><strong>{selected.routePartLabel}</strong></article></section>
          <section className="employee-desktop-react-route" aria-label="Маршрут задания"><article><span>До</span><strong>{selected.previousOperation}</strong></article><article className="is-current"><span>Сейчас</span><strong>{selected.operationName}</strong></article><article><span>После</span><strong>{selected.nextOperation}</strong></article></section>
          <MetricGrid label="Факт задания"><MetricCard label="Назначено" value={quantity(selected.assignedQuantity, selected.unit)} meta={selected.laborLabel} /><MetricCard label="Выполнено" value={quantity(selected.actualQuantity, selected.unit)} /><MetricCard label="Брак" value={quantity(selected.defectQuantity, selected.unit)} /><MetricCard label="Годное" value={quantity(selected.goodQuantity, selected.unit)} /></MetricGrid>
          <div className="employee-desktop-react-actions"><ActionButton onClick={() => onRequestLegacy?.(`start:${selected.id}`)}>{selected.isStarted ? "В работе" : "Взять"}</ActionButton><ActionButton onClick={() => onRequestLegacy?.(`fact:${selected.id}`)} variant="secondary">Внести факт</ActionButton><ActionButton onClick={() => onRequestLegacy?.(`report:${selected.id}`)} variant="secondary">Report</ActionButton><ActionButton onClick={() => onRequestLegacy?.(`structure:${selected.id}`)} variant="secondary">Структура</ActionButton><ActionButton onClick={() => onRequestLegacy?.(`route:${selected.id}`)} variant="secondary">Маршрут</ActionButton><ActionButton onClick={() => onRequestLegacy?.(`pdf:${selected.id}`)} variant="secondary">PDF</ActionButton></div>
        </div>
      </Panel>
      <Panel heading={<div className="panel-heading"><div><p>{model.canViewAll ? "Все рабочие столы" : model.personName}</p><h2>Назначенные задания</h2></div>{model.canViewAll ? <button className="employee-desktop-react-viewer" onClick={() => onRequestLegacy?.("person")} type="button">{model.viewedPersonId === "__all" ? "Все сотрудники" : model.personName}</button> : null}</div>}>
        <MetricGrid className="employee-desktop-react-kpis" label="Сводка рабочего стола"><MetricCard label="Задания" value={model.tasks.length} meta={`${model.activeCount} открыто`} /><MetricCard label="Распределено" value={quantity(model.assignedQuantity)} /><MetricCard label="Факт" value={quantity(model.goodQuantity)} meta={`${model.doneCount} закрыто`} /></MetricGrid>
        <div className="employee-desktop-react-tasks" data-employee-desktop-task-list>{model.tasks.map((task) => <button aria-pressed={task.id === selected.id} className={task.id === selected.id ? "is-current" : ""} data-employee-desktop-task={task.id} key={task.id} onClick={() => setSelectedId(task.id)} type="button"><span><strong>{task.operationName}</strong><small>{model.canViewAll ? `${task.employeeName} · ${task.workCenterLabel}` : task.workCenterLabel}</small><em>До: {task.previousOperation} · После: {task.nextOperation}</em></span><b>{quantity(task.assignedQuantity, task.unit)}</b><StatusToken label={task.status} tone={taskTone(task)} /></button>)}</div>
      </Panel>
    </section>}
  </OperationalPage>;
}
