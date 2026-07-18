import { useMemo, useState } from "react";
import { ModuleHeader, ModulePage, ModuleSidebar, Panel, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { adaptNomenclatureItems, type NomenclatureItemDto } from "./adapter";
import { filterNomenclatureItems, formatRecordCount, nomenclatureFilters, resolveVisibleSelection, type NomenclatureFilter } from "./view-model";

export function NomenclatureScenario({ payload }: { payload: NomenclatureItemDto[] }) {
  const items = useMemo(() => adaptNomenclatureItems(payload), [payload]);
  const [filter, setFilter] = useState<NomenclatureFilter>("all");
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const visibleItems = filterNomenclatureItems(items, filter);
  const selected = resolveVisibleSelection(visibleItems, selectedId);

  const header = <ModuleHeader eyebrow="Технологии" title="Номенклатура" badge={<span className="lab-badge">React migration lab</span>} />;
  const sidebar = (
    <ModuleSidebar label="Разделы номенклатуры" title="Разделы">
      {nomenclatureFilters.map((entry) => (
        <SidebarItem
          active={filter === entry.id}
          count={entry.id === "all" ? items.length : items.filter((item) => item.kind === entry.id).length}
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
            <thead><tr><th>Артикул</th><th>Наименование</th><th>Тип</th><th>Ед.</th><th>Статус</th></tr></thead>
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
                  <td>{item.article}</td><td>{item.name}</td><td>{item.kind}</td><td>{item.unit}</td>
                  <td><StatusToken label={item.status === "active" ? "Действует" : "Черновик"} tone={item.status === "active" ? "success" : "warning"} /></td>
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
            <div><dt>Тип</dt><dd>{selected.kind}</dd></div>
            <div><dt>Корпус</dt><dd>{selected.packageName}</dd></div>
            <div><dt>Единица</dt><dd>{selected.unit}</dd></div>
          </dl>
        </> : <p>В разделе нет позиций</p>}
      </aside>
    </ModulePage>
  );
}
