import { useMemo, useState } from "react";
import { ActionButton, DetailPanel, EmptyState, ModuleHeader, ModulePage, ModuleSidebar, Panel, SelectableRow, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { resolveAvailableFilter } from "../../ui/selection";
import { adaptNomenclatureTypes } from "./adapter";
import { buildNomenclatureTypeFilters, filterNomenclatureTypes, resolveVisibleNomenclatureType, type NomenclatureTypeFilter } from "./view-model";

export function NomenclatureTypesScenario({ payload, onRequestLegacy }: { payload: unknown; onRequestLegacy?(): void }) {
  const items = useMemo(() => adaptNomenclatureTypes(payload), [payload]);
  const filters = useMemo(() => buildNomenclatureTypeFilters(items), [items]);
  const [filter, setFilter] = useState<NomenclatureTypeFilter>("all");
  const [selectedId, setSelectedId] = useState(items[0]?.id || "");
  const activeFilter = resolveAvailableFilter(filters.map((entry) => entry.id), filter, "all");
  const visibleItems = filterNomenclatureTypes(items, activeFilter);
  const selected = resolveVisibleNomenclatureType(visibleItems, selectedId);
  const header = <ModuleHeader eyebrow="Технологии" title="Типы номенклатуры" badge={<span className="lab-badge">React preview · только чтение</span>} />;
  const sidebar = <ModuleSidebar label="Типы номенклатуры по статусу" title="Статусы">
    {onRequestLegacy ? <SidebarItem active={false} count={4} label="Все справочники" meta="Вернуться в legacy-контур" onClick={onRequestLegacy} /> : null}
    {filters.map((entry) => <SidebarItem active={activeFilter === entry.id} count={entry.count} key={entry.id} label={entry.label} onClick={() => setFilter(entry.id)} />)}
  </ModuleSidebar>;
  return <ModulePage header={header} sidebar={sidebar}>
    <Panel heading={<div className="panel-heading"><div><h2>Типы номенклатуры</h2><p>{visibleItems.length.toLocaleString("ru-RU")} в выбранном статусе</p></div><ActionButton disabled title="Команды остаются в legacy до миграции записи">Добавить тип</ActionButton></div>}>
      {visibleItems.length ? <TableWrap><table>
        <thead><tr><th>Тип номенклатуры</th><th>Код</th><th>Описание</th><th>Статус</th></tr></thead>
        <tbody>{visibleItems.map((item) => <SelectableRow key={item.id} onSelect={() => setSelectedId(item.id)} selected={selected?.id === item.id}>
          <td>{item.name}</td><td>{item.code}</td><td>{item.description}</td><td><StatusToken label={item.statusLabel} tone={item.statusTone} /></td>
        </SelectableRow>)}</tbody>
      </table></TableWrap> : <EmptyState title="Типов пока нет" text="В выбранном статусе нет типов номенклатуры." />}
    </Panel>
    <DetailPanel emptyText="Тип не выбран" eyebrow="Карточка типа" fields={selected ? [
      { label: "Код", value: selected.code },
      { label: "Описание", value: selected.description },
      { label: "Stable ID", value: selected.id },
      { label: "Статус", value: <StatusToken label={selected.statusLabel} tone={selected.statusTone} /> },
    ] : []} title={selected?.name} />
  </ModulePage>;
}
