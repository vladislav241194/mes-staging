import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { adaptNomenclatureItems, type NomenclatureItem, type NomenclatureKind } from "./contracts";
import { nomenclatureFixture } from "./fixture";

type Filter = "all" | NomenclatureKind;

const filterLabels: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Вся номенклатура" },
  { id: "Материал", label: "Материалы" },
  { id: "РЭА", label: "РЭА" },
  { id: "Печатная плата", label: "Печатные платы" },
];

function Status({ item }: { item: NomenclatureItem }) {
  return <span className={`status status--${item.status}`}>{item.status === "active" ? "Действует" : "Черновик"}</span>;
}

function NomenclatureLab() {
  const items = useMemo(() => adaptNomenclatureItems(nomenclatureFixture), []);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const visibleItems = filter === "all" ? items : items.filter((item) => item.kind === filter);
  const selected = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;

  return (
    <main className="module-page" data-ui-component="ModulePage">
      <header className="module-header" data-ui-component="ModuleHeader">
        <div>
          <p>Технологии</p>
          <h1>Номенклатура</h1>
        </div>
        <span className="lab-badge">React migration lab</span>
      </header>

      <div className="module-layout">
        <aside className="module-sidebar" aria-label="Разделы номенклатуры" data-ui-component="ModuleSidebar">
          <strong>Разделы</strong>
          {filterLabels.map((entry) => {
            const count = entry.id === "all" ? items.length : items.filter((item) => item.kind === entry.id).length;
            return (
              <button
                className={filter === entry.id ? "filter is-active" : "filter"}
                key={entry.id}
                onClick={() => setFilter(entry.id)}
                type="button"
              >
                <span>{entry.label}</span><b>{count}</b>
              </button>
            );
          })}
        </aside>

        <section className="workspace" data-ui-component="ModuleWorkspace">
          <div className="panel" data-ui-component="Panel">
            <div className="panel-heading">
              <div><h2>Позиции</h2><p>{visibleItems.length} записей в выбранном разделе</p></div>
              <button className="action" type="button" disabled title="Команды будут подключены после API checkpoint">Добавить позицию</button>
            </div>
            <div className="table-wrap" data-ui-component="TableWrap">
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
                      <td>{item.article}</td><td>{item.name}</td><td>{item.kind}</td><td>{item.unit}</td><td><Status item={item} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

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
        </section>
      </div>
    </main>
  );
}

const root = document.querySelector<HTMLElement>("#root");
if (!root) throw new Error("React migration lab root is missing");
createRoot(root).render(<NomenclatureLab />);
