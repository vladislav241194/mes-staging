import { useMemo, useState } from "react";
import { ActionButton, DetailPanel, EmptyState, ModuleHeader, ModulePage, ModuleSidebar, Panel, SelectableRow, SidebarItem, TableWrap } from "../../ui/components";
import { resolveAvailableFilter } from "../../ui/selection";
import { adaptStatuses } from "./adapter";
import { buildStatusFilters, filterStatuses, resolveVisibleStatus, type StatusFilter } from "./view-model";

export function StatusesScenario({ payload, onRequestLegacy }: { payload: unknown; onRequestLegacy?(): void }) {
  const items = useMemo(() => adaptStatuses(payload), [payload]);
  const filters = useMemo(() => buildStatusFilters(items), [items]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState(items[0]?.id || "");
  const activeFilter = resolveAvailableFilter(filters.map((entry) => entry.id), filter, "all");
  const visibleItems = filterStatuses(items, activeFilter);
  const selected = resolveVisibleStatus(visibleItems, selectedId);
  const sidebar = <ModuleSidebar label="Статусы по области применения" title="Области">
    {onRequestLegacy ? <SidebarItem active={false} count={4} label="Все справочники" meta="Вернуться в legacy-контур" onClick={onRequestLegacy} /> : null}
    {filters.map((entry) => <SidebarItem active={activeFilter === entry.id} count={entry.count} key={entry.id} label={entry.label} onClick={() => setFilter(entry.id)} />)}
  </ModuleSidebar>;
  return <ModulePage header={<ModuleHeader eyebrow="Мастер-данные" title="Статусы" badge={<span className="lab-badge">React preview · только чтение</span>} />} sidebar={sidebar}>
    <Panel heading={<div className="panel-heading"><div><h2>Единые статусы MES</h2><p>{visibleItems.length.toLocaleString("ru-RU")} в выбранной области</p></div><ActionButton disabled title="Системный контракт остаётся только для чтения">Только чтение</ActionButton></div>}>
      {visibleItems.length ? <TableWrap><table><thead><tr><th>Область применения</th><th>Стартовый модуль</th><th>Где меняется</th><th>Контракт</th><th>Переход</th><th>Статус</th><th>Влияние</th></tr></thead>
        <tbody>{visibleItems.map((item) => <SelectableRow key={item.id} onSelect={() => setSelectedId(item.id)} selected={selected?.id === item.id}><td>{item.group}</td><td>{item.originModule}</td><td>{item.changeModule}</td><td>{item.contractView}</td><td>{item.transitionView}</td><td>{item.name}</td><td>{item.impactTableView}</td></SelectableRow>)}</tbody>
      </table></TableWrap> : <EmptyState title="Статусов пока нет" text="В выбранной области нет записей." />}
    </Panel>
    <DetailPanel emptyText="Статус не выбран" eyebrow="Паспорт статуса" fields={selected ? [
      { label: "Стартовый модуль", value: selected.originModule }, { label: "Где меняется", value: selected.changeModule },
      { label: "Где используется", value: selected.usedIn }, { label: "Контракт", value: selected.contractView },
      { label: "Переход", value: selected.transitionView }, { label: "Следующий документ", value: selected.nextDocumentView },
      { label: "Категория", value: selected.registryKind }, { label: "Ревизия", value: selected.audit },
      { label: "Объект", value: selected.type }, { label: "Код", value: selected.code },
      { label: "Аннотация", value: selected.annotation }, { label: "Влияние", value: selected.impactView },
    ] : []} title={selected?.name} />
  </ModulePage>;
}
