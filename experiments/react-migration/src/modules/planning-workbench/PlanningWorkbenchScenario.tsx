import { useMemo, useState } from "react";
import { ActionButton, EmptyState, MetricCard, MetricGrid, ModuleHeader, ModulePage, ModuleSidebar, Panel, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { adaptPlanningWorkbench } from "./adapter";

export type PlanningWorkbenchReactNavigation = { type: "select-route" | "select-item"; id: string };

export function PlanningWorkbenchScenario({ payload, onNavigate }: { payload: unknown; onNavigate?(navigation: PlanningWorkbenchReactNavigation): Promise<{ ok?: boolean; message?: string } | void> }) {
  const model = useMemo(() => adaptPlanningWorkbench(payload), [payload]);
  const [navigationError, setNavigationError] = useState("");
  const [navigating, setNavigating] = useState(false);
  const navigate = async (navigation: PlanningWorkbenchReactNavigation) => {
    if (!onNavigate || navigating) return;
    setNavigating(true); setNavigationError("");
    try { const result = await onNavigate(navigation); if (result && result.ok === false) setNavigationError(result.message || "Не удалось изменить выбор."); }
    catch (error) { setNavigationError(error instanceof Error ? error.message : "Не удалось изменить выбор."); }
    finally { setNavigating(false); }
  };
  const header = <ModuleHeader eyebrow="Планирование" title="Заказ-наряды" badge={<StatusToken label={model.projectionSource === "server" ? "PostgreSQL read" : "snapshot fallback"} tone={model.projectionSource === "server" ? "success" : "warning"} />} />;
  const sidebar = <ModuleSidebar label="Список заказ-нарядов" title="Заказ-наряды">{model.queue.map((item) => <SidebarItem active={item.active} count={item.operationCount} key={item.id} label={item.title} meta={<>{item.meta} · {item.statusLabel}</>} onClick={() => void navigate({ type: "select-route", id: item.id })} />)}</ModuleSidebar>;
  return <ModulePage header={header} sidebar={sidebar}><section className="workspace-main planning-order-workspace" data-planning-workbench-react>
    {model.canActivate ? <>
      <Panel heading={<div className="panel-heading"><div><StatusToken label={model.decision.title} tone={model.decision.tone} /><h2>{model.headerDescription}</h2><p>{model.decision.subtitle}</p></div><div><ActionButton disabled title="Изменение тиража остаётся в legacy">Сохранить тираж</ActionButton>{" "}<ActionButton disabled title="Передача в Гант остаётся в legacy">Передать в планирование</ActionButton></div></div>}>
        <MetricGrid label="Готовность заказ-наряда">{model.metrics.map((metric) => <MetricCard key={metric.id} label={metric.label} value={metric.value} meta={metric.meta} />)}</MetricGrid>
      </Panel>
      <Panel heading={<div><h2>Дерево заказ-наряда</h2><p>{model.quantity.toLocaleString("ru-RU")} шт. · только чтение</p></div>}>
        {navigationError ? <p className="react-nomenclature-command-error" role="alert">{navigationError}</p> : null}
        <TableWrap><table aria-busy={navigating} className="planning-order-table"><thead><tr><th>Объект / операция</th><th>Плановая длительность</th><th>Контекст</th><th>Кол-во</th><th>Состояние</th></tr></thead><tbody>{model.rows.map((row) => <tr className={`${row.kind === "task" ? "planning-order-object-row" : "planning-order-step-row"}${row.selected ? " is-selected" : ""}`} data-planning-order-row={row.id} key={row.id}><td><button disabled={navigating} onClick={() => void navigate({ type: "select-item", id: row.id })} type="button"><strong>{row.level ? "↳ " : ""}{row.title}</strong>{" "}<small>{row.meta}</small></button></td><td><strong>{row.labor}</strong>{" "}<small>{row.laborMeta}</small></td><td><strong>{row.context}</strong>{" "}<small>{row.contextMeta}</small></td><td><strong>{row.quantity.toLocaleString("ru-RU")}</strong>{" "}<small>{row.unit}</small></td><td><StatusToken label={row.statusLabel} tone={row.statusTone} /></td></tr>)}</tbody></table></TableWrap>
      </Panel>
    </> : <EmptyState title={model.detailLoading ? "Загружаем состав заказ-наряда" : "Заказ-наряд не выбран"} text="React подключается только к завершённой PostgreSQL read-модели." />}
  </section></ModulePage>;
}
