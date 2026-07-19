import { useMemo, useState } from "react";
import { ActionButton, DetailPanel, EmptyState, MetricCard, MetricGrid, ModuleHeader, ModulePage, ModuleSidebar, Panel, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { adaptBoardsModel, BOM_COMPONENT_FIELDS } from "./adapter";
import { formatBomCell, formatComponentCount, getBoardSidebarMeta, getVisibleComponentTotal, resolveVisibleBoard } from "./view-model";

export function BoardsReadScenario({ payload, onRequestItems, onSelectionChange }: { payload: unknown; onRequestItems?(): void; onSelectionChange?(boardId: string): void }) {
  const model = useMemo(() => adaptBoardsModel(payload), [payload]);
  const [selectedId, setSelectedId] = useState(model.boards[0]?.id || "");
  const selected = resolveVisibleBoard(model.boards, selectedId);
  return <ModulePage header={<ModuleHeader eyebrow="Материалы и компоненты" title="Номенклатура · Платы" badge={<span className="lab-badge">React preview · только чтение</span>} />} sidebar={<ModuleSidebar label="Печатные платы" title="Платы">
    {onRequestItems ? <SidebarItem active={false} count={Array.isArray((payload as { nomenclature?: unknown })?.nomenclature) ? (payload as { nomenclature: unknown[] }).nomenclature.length : 0} label="Вся номенклатура" meta="вернуться к позициям" onClick={onRequestItems} /> : null}
    {model.boards.map((board) => <SidebarItem active={selected?.id === board.id} count={getVisibleComponentTotal(board)} key={board.id} label={board.name} meta={getBoardSidebarMeta(board)} onClick={() => { setSelectedId(board.id); onSelectionChange?.(board.id); }} />)}
  </ModuleSidebar>}>
    <Panel heading={<div className="panel-heading"><div><h2>{selected?.name || "Плата не выбрана"}</h2><p>{selected ? `${selected.rows.length} строк · покомпонентный расчет платы` : "Выберите плату в перечне"}</p></div><ActionButton disabled title="Excel-импорт остаётся в legacy">Импортировать *.xlsx</ActionButton></div>}>
      {selected ? selected.rows.length ? <><MetricGrid className="board-summary" label="Подсчет импортированных компонентов">
        <MetricCard label="Компонентов" meta="на одну плату" value={formatComponentCount(selected.componentTotal)} />
        <MetricCard label="Типов" meta="заполненных категорий" value={formatComponentCount(selected.activeComponentTypes)} />
        {BOM_COMPONENT_FIELDS.map((field) => <MetricCard key={field.key} label={field.label} meta="шт." value={formatComponentCount(selected.componentCounts[field.key])} />)}
      </MetricGrid><TableWrap><table className="bom-table"><thead><tr>{selected.headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead><tbody>{selected.rows.map((row, rowIndex) => <tr key={`${selected.id}-${rowIndex}`}>{row.values.map((value, columnIndex) => <td className={columnIndex === 1 ? "primary-cell" : ""} key={columnIndex}>{formatBomCell(value)}</td>)}</tr>)}</tbody></table></TableWrap></> : <EmptyState title="Пока нет импортированных строк" text="Карточка платы сохранена, но компонентный состав ещё не импортирован." /> : <EmptyState title="Платы пока не созданы" text="Записи появятся после загрузки Boards/BOM." />}
    </Panel>
    <DetailPanel emptyText="Плата не выбрана" eyebrow="Карточка платы" fields={selected ? [
      { label: "Децимальный номер", value: selected.boardCode }, { label: "Результат производства", value: selected.resultItem },
      { label: "Источник BOM", value: selected.sourceFileName || "Файл не импортирован" }, { label: "Строк BOM", value: selected.rows.length },
      { label: "Компонентов", value: formatComponentCount(getVisibleComponentTotal(selected)) }, { label: "Статус", value: <StatusToken label={selected.statusLabel} tone={selected.statusTone} /> },
    ] : []} title={selected?.name} />
  </ModulePage>;
}
