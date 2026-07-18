import { useMemo, useState } from "react";
import { ActionButton, DetailPanel, EmptyState, ModuleHeader, ModulePage, ModuleSidebar, Panel, SelectableRow, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { resolveAvailableFilter } from "../../ui/selection";
import { adaptNomenclatureReadModel } from "./adapter";
import { buildNomenclatureFilters, filterNomenclatureItems, formatRecordCount, resolveVisibleSelection, type NomenclatureFilter } from "./view-model";

export function NomenclatureScenario({ payload, onRequestLegacy }: { payload: unknown; onRequestLegacy?(): void }) {
  const model = useMemo(() => adaptNomenclatureReadModel(payload), [payload]);
  const filters = useMemo(() => buildNomenclatureFilters(model), [model]);
  const [filter, setFilter] = useState<NomenclatureFilter>("all");
  const [selectedId, setSelectedId] = useState(model.items[0]?.id ?? "");
  const activeFilter = resolveAvailableFilter(filters.map((entry) => entry.id), filter, "all");
  const visibleItems = filterNomenclatureItems(model.items, activeFilter);
  const selected = resolveVisibleSelection(visibleItems, selectedId);

  const header = <ModuleHeader eyebrow="Технологии" title="Номенклатура" badge={<span className="lab-badge">React migration lab</span>} />;
  const sidebar = (
    <ModuleSidebar label="Разделы номенклатуры" title="Разделы">
      {filters.map((entry) => (
        <SidebarItem
          active={activeFilter === entry.id}
          count={entry.count}
          key={entry.id}
          label={entry.label}
          onClick={() => entry.action === "legacy" ? onRequestLegacy?.() : setFilter(entry.id)}
        />
      ))}
    </ModuleSidebar>
  );

  return (
    <ModulePage header={header} sidebar={sidebar}>
      <Panel heading={
        <div className="panel-heading">
          <div><h2>Позиции</h2><p>{formatRecordCount(visibleItems.length)} в выбранном разделе</p></div>
          <ActionButton disabled title="Команды будут подключены после API checkpoint">Добавить позицию</ActionButton>
        </div>
      }>
        {visibleItems.length ? <TableWrap>
          <table>
            <thead><tr><th>Наименование</th><th>Артикул</th><th>Раздел</th><th>Корпус</th><th>Ед.</th><th>Производитель</th><th>Статус</th></tr></thead>
            <tbody>
              {visibleItems.map((item) => (
                <SelectableRow key={item.id} onSelect={() => setSelectedId(item.id)} selected={selected?.id === item.id}>
                  <td>{item.name}</td><td>{item.article}</td><td>{item.type}</td><td>{item.packageName}</td><td>{item.unit}</td><td>{item.manufacturer}</td>
                  <td><StatusToken label={item.statusLabel} tone={item.statusTone} /></td>
                </SelectableRow>
              ))}
            </tbody>
          </table>
        </TableWrap> : <EmptyState title="Позиций пока нет" text="В выбранном разделе ещё нет позиций номенклатуры." />}
      </Panel>

      <DetailPanel
        emptyText="В разделе нет позиций"
        eyebrow="Карточка позиции"
        fields={selected ? [
          { label: "Артикул", value: selected.article },
          { label: "Раздел", value: selected.type },
          { label: "Корпус", value: selected.packageName },
          { label: "Единица", value: selected.unit },
          { label: "Производитель", value: selected.manufacturer },
        ] : []}
        title={selected?.name}
      />
    </ModulePage>
  );
}
