import { useMemo, useState } from "react";
import { ActionButton, DetailPanel, EmptyState, ModuleHeader, ModulePage, ModuleSidebar, Panel, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { adaptBoards, BOM_COMPONENT_FIELDS } from "./adapter";
import { formatBomCell, formatComponentCount, getBoardSidebarMeta, getVisibleComponentTotal, resolveVisibleBoard } from "./view-model";

export function BoardsScenario({ payload }: { payload: unknown }) {
  const boards = useMemo(() => adaptBoards(payload), [payload]);
  const [selectedId, setSelectedId] = useState(boards[0]?.id ?? "");
  const selected = resolveVisibleBoard(boards, selectedId);
  const header = <ModuleHeader eyebrow="Материалы и компоненты" title="Номенклатура · Платы" badge={<span className="lab-badge">React migration lab</span>} />;
  const sidebar = (
    <ModuleSidebar label="Печатные платы" title="Платы">
      {boards.map((board) => (
        <SidebarItem
          active={selected?.id === board.id}
          count={getVisibleComponentTotal(board)}
          key={board.id}
          label={board.name}
          meta={getBoardSidebarMeta(board)}
          onClick={() => setSelectedId(board.id)}
        />
      ))}
    </ModuleSidebar>
  );

  return (
    <ModulePage header={header} sidebar={sidebar}>
      <Panel heading={<div className="panel-heading"><div><h2>{selected?.name || "Плата не выбрана"}</h2><p>{selected ? `${selected.rows.length} строк · покомпонентный расчет платы` : "Выберите плату в перечне"}</p></div><ActionButton disabled title="Создание и импорт остаются в legacy до миграции команд">Импортировать *.xlsx</ActionButton></div>}>
        {selected ? selected.rows.length ? <>
          <div className="board-summary" aria-label="Подсчет импортированных компонентов">
            <article><span>Компонентов</span><strong>{formatComponentCount(selected.componentTotal)}</strong><small>на одну плату</small></article>
            <article><span>Типов</span><strong>{formatComponentCount(selected.activeComponentTypes)}</strong><small>заполненных категорий</small></article>
            {BOM_COMPONENT_FIELDS.map((field) => <article key={field.key}><span>{field.label}</span><strong>{formatComponentCount(selected.componentCounts[field.key])}</strong><small>шт.</small></article>)}
          </div>
          <TableWrap><table className="bom-table">
            <thead><tr>{selected.headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead>
            <tbody>{selected.rows.map((row, rowIndex) => <tr key={`${selected.id}-${rowIndex}`}>
              {row.values.map((value, columnIndex) => <td className={columnIndex === 1 ? "primary-cell" : ""} key={columnIndex}>{formatBomCell(value)}</td>)}
            </tr>)}</tbody>
          </table></TableWrap>
        </> : <EmptyState title="Пока нет импортированных строк" text="Карточка платы сохранена, но компонентный состав ещё не импортирован." /> : <EmptyState title="Платы пока не созданы" text="Read-only сценарий покажет платы после появления данных BOM." />}
      </Panel>

      <DetailPanel
        emptyText="Плата не выбрана"
        eyebrow="Карточка платы"
        fields={selected ? [
          { label: "Децимальный номер", value: selected.boardCode },
          { label: "Результат производства", value: selected.resultItem },
          { label: "Источник BOM", value: selected.sourceFileName || "Файл не импортирован" },
          { label: "Строк BOM", value: selected.rows.length },
          { label: "Компонентов", value: formatComponentCount(getVisibleComponentTotal(selected)) },
          { label: "Статус", value: <StatusToken label={selected.statusLabel} tone={selected.statusTone} /> },
        ] : []}
        title={selected?.name}
      />
    </ModulePage>
  );
}
