import { useMemo } from "react";

import { EmptyState, MetricCard, MetricGrid, ModuleHeader, ModulePage, Panel, StatusToken, TableWrap } from "../../ui/components";
import { adaptDispatchPayload } from "./adapter";

function quantity(value: number, unit = ""): string {
  const formatted = value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
}

export function DispatchScenario({ payload }: { payload: unknown }) {
  const model = useMemo(() => adaptDispatchPayload(payload), [payload]);
  const marker = model.productionBacked
    ? <span className="lab-badge" data-react-production-marker="dispatch">React TS · read-only</span>
    : null;

  return <ModulePage
    className="dispatch-react"
    label="Диспетчерская"
    header={<ModuleHeader eyebrow="Оперативное управление" title="Диспетчерская" badge={marker} />}
  >
    {!model.productionBacked ? <EmptyState title="Производственные данные недоступны" text="Обновите страницу после восстановления PostgreSQL-проекций Planning и Shift Execution." /> : <>
      <MetricGrid label="Сводка смены">
        <MetricCard label="Операции в плане" value={model.counts.planned} meta={model.windowLabel} />
        <MetricCard label="Назначено" value={model.counts.assigned} meta={`${quantity(model.totals.assigned)} из ${quantity(model.totals.planned)}`} />
        <MetricCard label="Факт" value={quantity(model.totals.fact)} meta={`брак ${quantity(model.totals.defects)}`} />
        <MetricCard label="Остаток" value={quantity(model.totals.remaining)} meta={`переносов ${model.counts.carryovers}`} />
      </MetricGrid>
      <Panel heading={<div className="panel-heading"><div><p>{model.windowLabel}</p><h2>Оперативный план и исполнение</h2></div><StatusToken label="только просмотр" tone="neutral" /></div>}>
        {model.rows.length ? <TableWrap><table className="directory-table ui-table" data-dispatch-production-table>
          <thead><tr><th>Заказ-наряд / изделие</th><th>Операция</th><th>Участок</th><th>Время</th><th>План</th><th>Назначено</th><th>Факт / брак</th><th>Исполнители</th><th>Статус</th></tr></thead>
          <tbody>{model.rows.map((row) => <tr key={row.id} data-dispatch-production-row={row.id}>
            <td><strong>{row.documentNumber}</strong><small>{row.orderLabel}</small></td>
            <td><strong>{row.operationName}</strong>{row.carryoverReason ? <small>{row.carryoverReason}</small> : null}</td>
            <td>{row.workCenterLabel}</td>
            <td>{row.timeLabel}</td>
            <td>{quantity(row.plannedQuantity, row.unit)}</td>
            <td>{quantity(row.assignedQuantity, row.unit)}</td>
            <td><strong>{quantity(row.factQuantity, row.unit)}</strong><small>брак {quantity(row.defectQuantity, row.unit)}</small></td>
            <td>{row.executors.length ? row.executors.map((executor) => executor.name).join(", ") : "Не назначены"}</td>
            <td><StatusToken label={row.status.label} tone={row.status.tone} /></td>
          </tr>)}</tbody>
        </table></TableWrap> : <EmptyState title="На смену нет операций" text="PostgreSQL Planning не вернул размещённых операций для выбранного окна." />}
      </Panel>
    </>}
  </ModulePage>;
}
