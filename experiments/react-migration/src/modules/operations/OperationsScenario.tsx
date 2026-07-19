import { useMemo, useState } from "react";
import { ActionButton, DetailPanel, EmptyState, ModuleHeader, ModulePage, ModuleSidebar, Panel, SelectableRow, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { resolveAvailableFilter } from "../../ui/selection";
import { adaptOperations } from "./adapter";
import { buildOperationFilters, filterOperations, resolveVisibleOperation, type OperationFilter } from "./view-model";

export function OperationsScenario({ payload, onRequestLegacy }: { payload: unknown; onRequestLegacy?(): void }) {
  const items = useMemo(() => adaptOperations(payload), [payload]);
  const filters = useMemo(() => buildOperationFilters(items), [items]);
  const [filter, setFilter] = useState<OperationFilter>("all");
  const [selectedId, setSelectedId] = useState(items[0]?.id || "");
  const activeFilter = resolveAvailableFilter(filters.map((entry) => entry.id), filter, "all");
  const visibleItems = filterOperations(items, activeFilter);
  const selected = resolveVisibleOperation(visibleItems, selectedId);
  const header = <ModuleHeader eyebrow="Технологии" title="Операции" badge={<span className="lab-badge">React preview · только чтение</span>} />;
  const sidebar = <ModuleSidebar label="Операции по рабочим центрам" title="Рабочие центры">
    {onRequestLegacy ? <SidebarItem active={false} count={4} label="Все справочники" meta="Вернуться в legacy-контур" onClick={onRequestLegacy} /> : null}
    {filters.map((entry) => <SidebarItem active={activeFilter === entry.id} count={entry.count} key={entry.id} label={entry.label} onClick={() => setFilter(entry.id)} />)}
  </ModuleSidebar>;
  return <ModulePage header={header} sidebar={sidebar}>
    <Panel heading={<div className="panel-heading"><div><h2>Операции</h2><p>{visibleItems.length.toLocaleString("ru-RU")} в выбранном рабочем центре</p></div><ActionButton disabled title="Команды остаются в legacy до миграции записи">Добавить операцию</ActionButton></div>}>
      {visibleItems.length ? <TableWrap><table>
        <thead><tr><th>Операция</th><th>Отдел</th><th>Статус</th></tr></thead>
        <tbody>{visibleItems.map((item) => <SelectableRow key={item.id} onSelect={() => setSelectedId(item.id)} selected={selected?.id === item.id}>
          <td>{item.name}</td><td>{item.workCenterLabel}</td><td><StatusToken label={item.statusLabel} tone={item.statusTone} /></td>
        </SelectableRow>)}</tbody>
      </table></TableWrap> : <EmptyState title="Операций пока нет" text="В выбранном рабочем центре нет операций." />}
    </Panel>
    <DetailPanel
      emptyText="Операция не выбрана"
      eyebrow="Карточка операции"
      fields={selected ? [
        { label: "Код", value: selected.code },
        { label: "Рабочий центр", value: selected.workCenterLabel },
        { label: "Stable ID", value: selected.id },
        { label: "Норматив", value: `${selected.unitsPerHour.toLocaleString("ru-RU")} ед./ч` },
      ] : []}
      title={selected?.name}
    />
  </ModulePage>;
}
