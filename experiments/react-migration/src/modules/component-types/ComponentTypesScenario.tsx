import { useMemo, useState } from "react";
import { ActionButton, DetailPanel, EmptyState, ModuleHeader, ModulePage, ModuleSidebar, Panel, SelectableRow, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { formatRecordCount } from "../../ui/format";
import { resolveAvailableFilter } from "../../ui/selection";
import { adaptComponentTypes } from "./adapter";
import { buildComponentTypeFilters, filterComponentTypes, formatDecimal, formatInteger, resolveVisibleComponentType, type ComponentTypeFilter } from "./view-model";

export function ComponentTypesScenario({ payload, onRequestLegacy }: { payload: unknown; onRequestLegacy?(): void }) {
  const items = useMemo(() => adaptComponentTypes(payload), [payload]);
  const filters = useMemo(() => buildComponentTypeFilters(items), [items]);
  const [filter, setFilter] = useState<ComponentTypeFilter>("all");
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const activeFilter = resolveAvailableFilter(filters.map((entry) => entry.id), filter, "all");
  const visibleItems = filterComponentTypes(items, activeFilter);
  const selected = resolveVisibleComponentType(visibleItems, selectedId);

  const header = <ModuleHeader eyebrow="Технологии" title="Типы компонентов" badge={<span className="lab-badge">React preview · только чтение</span>} />;
  const sidebar = (
    <ModuleSidebar label="Семейства компонентов" title="Семейства">
      {onRequestLegacy ? <SidebarItem active={false} count={4} key="directories" label="Все справочники" meta="Вернуться в legacy-контур" onClick={onRequestLegacy} /> : null}
      {filters.map((entry) => <SidebarItem active={activeFilter === entry.id} count={entry.count} key={entry.id} label={entry.label} onClick={() => setFilter(entry.id)} />)}
    </ModuleSidebar>
  );

  return (
    <ModulePage header={header} sidebar={sidebar}>
      <Panel heading={<div className="panel-heading"><div><h2>Типы</h2><p>{formatRecordCount(visibleItems.length)} в выбранном семействе</p></div><ActionButton disabled title="Команды будут подключены после API checkpoint">Добавить тип</ActionButton></div>}>
        {visibleItems.length ? <TableWrap><table>
          <thead><tr><th>Тип</th><th>Корпус</th><th>Семейство</th><th>Коэф.</th><th>Комп./ч</th><th>Setup, сек</th><th>По умолч.</th><th>Статус</th></tr></thead>
          <tbody>{visibleItems.map((item) => <SelectableRow key={item.id} onSelect={() => setSelectedId(item.id)} selected={selected?.id === item.id}>
            <td>{item.name}</td><td>{item.packageName}</td><td>{item.family}</td><td>{formatDecimal(item.coefficient)}</td><td>{formatInteger(item.placementsPerHour)} комп./ч</td><td>{item.setupSeconds} сек</td><td>{item.defaultCount} шт.</td><td><StatusToken label={item.statusLabel} tone={item.statusTone} /></td>
          </SelectableRow>)}</tbody>
        </table></TableWrap> : <EmptyState title="Типов пока нет" text="В выбранном семействе ещё нет типов компонентов." />}
      </Panel>

      <DetailPanel
        emptyText="В семействе нет типов компонентов"
        eyebrow="Карточка типа"
        fields={selected ? [
          { label: "Корпус", value: selected.packageName },
          { label: "Семейство", value: selected.family },
          { label: "Коэффициент", value: formatDecimal(selected.coefficient) },
          { label: "Производительность", value: `${formatInteger(selected.placementsPerHour)} комп./ч` },
          { label: "Setup", value: `${selected.setupSeconds} сек` },
          { label: "Количество по умолчанию", value: `${selected.defaultCount} шт.` },
        ] : []}
        title={selected?.name}
      />
    </ModulePage>
  );
}
