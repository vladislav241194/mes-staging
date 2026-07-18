import { useMemo, useState } from "react";
import { ModuleHeader, ModulePage, ModuleSidebar, Panel, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { adaptNomenclatureReadModel } from "./adapter";
import { buildNomenclatureFilters, filterNomenclatureItems, formatRecordCount, resolveVisibleSelection, type NomenclatureFilter } from "./view-model";

export function NomenclatureScenario({ payload }: { payload: unknown }) {
  const model = useMemo(() => adaptNomenclatureReadModel(payload), [payload]);
  const filters = useMemo(() => buildNomenclatureFilters(model), [model]);
  const [filter, setFilter] = useState<NomenclatureFilter>("all");
  const [selectedId, setSelectedId] = useState(model.items[0]?.id ?? "");
  const visibleItems = filterNomenclatureItems(model.items, filter);
  const selected = resolveVisibleSelection(visibleItems, selectedId);

  const header = <ModuleHeader eyebrow="Технологии" title="Номенклатура" badge={<span className="lab-badge">React migration lab</span>} />;
  const sidebar = (
    <ModuleSidebar label="Разделы номенклатуры" title="Разделы">
      {filters.map((entry) => (
        <SidebarItem
          active={filter === entry.id}
          count={entry.count}
          key={entry.id}
          label={entry.label}
          onClick={() => setFilter(entry.id)}
        />
      ))}
    </ModuleSidebar>
  );

  return (
    <ModulePage header={header} sidebar={sidebar}>
      <Panel heading={
        <div className="panel-heading">
          <div><h2>Позиции</h2><p>{formatRecordCount(visibleItems.length)} в выбранном разделе</p></div>
          <button className="action" type="button" disabled title="Команды будут подключены после API checkpoint">Добавить позицию</button>
        </div>
      }>
        <TableWrap>
          <table>
            <thead><tr><th>Наименование</th><th>Артикул</th><th>Раздел</th><th>Корпус</th><th>Ед.</th><th>Производитель</th><th>Статус</th></tr></thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr
                  aria-selected={selected?.id === item.id}
                  className={selected?.id === item.id ? "is-selected" : ""}
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(item.id);
                    }
                  }}
                  tabIndex={0}
                >
                  <td>{item.name}</td><td>{item.article}</td><td>{item.type}</td><td>{item.packageName}</td><td>{item.unit}</td><td>{item.manufacturer}</td>
                  <td><StatusToken label={item.statusLabel} tone={item.statusTone} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Panel>

      <aside className="detail" aria-live="polite">
        {selected ? <>
          <p>Карточка позиции</p><h2>{selected.name}</h2>
          <dl>
            <div><dt>Артикул</dt><dd>{selected.article}</dd></div>
            <div><dt>Раздел</dt><dd>{selected.type}</dd></div>
            <div><dt>Корпус</dt><dd>{selected.packageName}</dd></div>
            <div><dt>Единица</dt><dd>{selected.unit}</dd></div>
            <div><dt>Производитель</dt><dd>{selected.manufacturer}</dd></div>
          </dl>
        </> : <p>В разделе нет позиций</p>}
      </aside>
    </ModulePage>
  );
}
