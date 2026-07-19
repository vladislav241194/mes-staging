import { useEffect, useMemo, useState } from "react";
import { ActionButton, DeleteConfirmation, DetailPanel, EmptyState, MetricCard, MetricGrid, ModuleHeader, ModulePage, ModuleSidebar, Panel, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { useCommandRunner } from "../../ui/use-command";
import { adaptBoardsModel, BOM_COMPONENT_FIELDS, type BoardItem } from "./adapter";
import { formatBomCell, formatComponentCount, getBoardSidebarMeta, getVisibleComponentTotal, resolveVisibleBoard } from "./view-model";

export function BoardsScenario({
  payload,
  onCommand,
  onRequestItems,
  onSelectionChange,
}: {
  payload: unknown;
  onCommand?(command: BoardsReactCommand): Promise<BoardsCommandResult | void>;
  onRequestItems?(): void;
  onSelectionChange?(boardId: string): void;
}) {
  const model = useMemo(() => adaptBoardsModel(payload), [payload]);
  const boards = model.boards;
  const [selectedId, setSelectedId] = useState(model.selectedBoardId);
  const [draft, setDraft] = useState<BoardDraft | null>(null);
  const [nomenclatureId, setNomenclatureId] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [rowDeletePending, setRowDeletePending] = useState<BomRowDeleteTarget | null>(null);
  const { clearCommandError, commandError, runCommand, saving } = useCommandRunner(onCommand);
  const selected = resolveVisibleBoard(boards, selectedId);
  const setDraftField = (field: "name" | "boardCode" | "resultItem", value: string) => setDraft((current) => current ? { ...current, [field]: value } : current);
  const header = <ModuleHeader eyebrow="Материалы и компоненты" title="Номенклатура · Платы" badge={<span className="lab-badge">{model.canCreateEdit ? `React · create/edit${model.canDelete ? "/delete" : ""} evaluation` : "React migration lab"}</span>} />;
  const sidebar = (
    <ModuleSidebar label="Печатные платы" title="Платы">
      {onRequestItems ? (
        <SidebarItem
          active={false}
          count={Array.isArray((payload as { nomenclature?: unknown })?.nomenclature) ? (payload as { nomenclature: unknown[] }).nomenclature.length : 0}
          label="Вся номенклатура"
          meta="вернуться к позициям"
          onClick={onRequestItems}
        />
      ) : null}
      {boards.map((board) => (
        <SidebarItem
          active={selected?.id === board.id}
          count={getVisibleComponentTotal(board)}
          key={board.id}
          label={board.name}
          meta={getBoardSidebarMeta(board)}
          onClick={() => {
            setSelectedId(board.id);
            setNomenclatureId("");
            setRowDeletePending(null);
            clearCommandError();
            onSelectionChange?.(board.id);
          }}
        />
      ))}
    </ModuleSidebar>
  );

  const saveDraft = async () => {
    if (!draft) return;
    await runCommand({ type: "save", payload: draft }, "Не удалось сохранить плату.");
  };
  const deleteDraft = async () => {
    if (!draft || draft.isNew || !model.canDelete) return;
    await runCommand({ type: "delete", payload: { bomId: draft.bomId } }, "Не удалось удалить плату.");
  };
  const deleteBomRow = async () => {
    if (!rowDeletePending || !model.canDeleteBomRows) return;
    const result = await runCommand({ type: "delete-bom-row", payload: rowDeletePending }, "Не удалось удалить строку BOM.");
    if (result && result.ok !== false) setRowDeletePending(null);
  };
  const addBomNomenclatureRow = async () => {
    if (!selected || !model.canAddBomRows || !nomenclatureId) return;
    const result = await runCommand({ type: "add-bom-nomenclature-row", payload: { bomId: selected.id, nomenclatureId, expectedRows: selected.rows.map((item) => [...item.values]) } }, "Не удалось добавить строку BOM.");
    if (result && result.ok !== false) setNomenclatureId("");
  };
  const importBom = async (file: File) => runCommand({ type: "import-bom-xlsx", payload: { file, expectedBoardIds: boards.map((board) => board.id) } }, "Не удалось импортировать BOM из Excel.");

  return (
    <ModulePage header={header} sidebar={sidebar}>
      <Panel heading={<div className="panel-heading"><div><h2>{selected?.name || "Плата не выбрана"}</h2><p>{selected ? `${selected.rows.length} строк · покомпонентный расчет платы` : "Выберите плату в перечне"}</p></div><div className="react-nomenclature-detail-actions"><ActionButton disabled={!model.canCreateEdit} onClick={() => setDraft(createBoardDraft())} title={model.canCreateEdit ? "Создать карточку платы" : "Write evaluation выключен"}>Новая плата</ActionButton>{model.canImportBom ? <label className="react-bom-import-action">{saving ? "Импорт…" : "Импортировать *.xlsx"}<input accept=".xlsx,.xls" aria-label="Импортировать BOM из Excel" disabled={saving} onChange={(event) => { const input = event.currentTarget; const file = input.files?.[0]; if (!file) return; void importBom(file).finally(() => { input.value = ""; }); }} type="file" /></label> : <ActionButton disabled title="Excel-импорт доступен только в write evaluation">Импортировать *.xlsx</ActionButton>}</div></div>}>
        {selected && model.canAddBomRows ? <form className="react-bom-nomenclature-add" data-react-bom-nomenclature-add={selected.id} onSubmit={(event) => { event.preventDefault(); void addBomNomenclatureRow(); }}>
          <label><span>Добавить строку из номенклатуры</span><select aria-label="РЭА-компонент для BOM" disabled={saving || !model.bomNomenclatureOptions.length} onChange={(event) => setNomenclatureId(event.currentTarget.value)} value={nomenclatureId}><option value="">Выберите РЭА-компонент</option>{model.bomNomenclatureOptions.map((option) => <option key={option.id} value={option.id}>{option.label}{option.meta ? ` · ${option.meta}` : ""}</option>)}</select></label>
          <button disabled={saving || !nomenclatureId} type="submit">Добавить строку</button>
        </form> : null}
        {selected ? selected.rows.length ? <>
          <MetricGrid className="board-summary" label="Подсчет импортированных компонентов">
            <MetricCard label="Компонентов" meta="на одну плату" value={formatComponentCount(selected.componentTotal)} />
            <MetricCard label="Типов" meta="заполненных категорий" value={formatComponentCount(selected.activeComponentTypes)} />
            {BOM_COMPONENT_FIELDS.map((field) => <MetricCard key={field.key} label={field.label} meta="шт." value={formatComponentCount(selected.componentCounts[field.key])} />)}
          </MetricGrid>
          <TableWrap><table className="bom-table">
            <thead><tr>{selected.headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}{model.canDeleteBomRows ? <th>Действия</th> : null}</tr></thead>
            <tbody>{selected.rows.map((row, rowIndex) => <tr key={`${selected.id}-${rowIndex}`}>
              {row.values.map((value, columnIndex) => <td className={columnIndex === 1 ? "primary-cell" : ""} key={columnIndex}>{columnIndex === 6 && model.canEditBomRows ? <form data-react-bom-quantity-form={`${selected.id}:${rowIndex}`} onSubmit={(event) => { event.preventDefault(); const quantity = String(new FormData(event.currentTarget).get("quantity") ?? ""); void runCommand({ type: "update-bom-quantity", payload: { bomId: selected.id, rowIndex, expectedValues: [...row.values], quantity } }, "Количество BOM не сохранено."); }}><input aria-label={`Количество BOM, строка ${rowIndex + 1}`} defaultValue={String(row.quantity)} disabled={saving} min="0" name="quantity" required step="1" type="number" /><button disabled={saving} type="submit">Сохранить</button></form> : model.canEditBomRows ? <BomTextCellEditor ariaLabel={`${selected.headers[columnIndex]}, строка ${rowIndex + 1}`} disabled={saving} id={`${selected.id}:${rowIndex}:${columnIndex}`} onCommit={(nextValue) => runCommand({ type: "update-bom-cell", payload: { bomId: selected.id, rowIndex, columnIndex, expectedValues: [...row.values], value: nextValue } }, "Поле BOM не сохранено.")} value={value} /> : formatBomCell(value)}</td>)}
              {model.canDeleteBomRows ? <td><button aria-label={`Удалить строку BOM ${rowIndex + 1}`} className="react-bom-row-delete" data-react-bom-row-delete={`${selected.id}:${rowIndex}`} disabled={saving} onClick={() => { setRowDeletePending({ bomId: selected.id, rowIndex, expectedRows: selected.rows.map((item) => [...item.values]), label: row.description || row.manufacturerPart || `строка ${rowIndex + 1}` }); clearCommandError(); }} type="button">Удалить</button></td> : null}
            </tr>)}</tbody>
          </table></TableWrap>
          {rowDeletePending ? <DeleteConfirmation busy={saving} error={commandError} id="react-bom-row-delete-title" onCancel={() => { setRowDeletePending(null); clearCommandError(); }} onConfirm={() => { void deleteBomRow(); }} title="Удалить строку BOM?">
            <p>Строка {rowDeletePending.rowIndex + 1} «{rowDeletePending.label}» будет удалена только из выбранной платы.</p>
            <p>Связанная номенклатура останется независимо доступной.</p>
          </DeleteConfirmation> : null}
        </> : <EmptyState title="Пока нет импортированных строк" text="Карточка платы сохранена, но компонентный состав ещё не импортирован." /> : <EmptyState title="Платы пока не созданы" text="Read-only сценарий покажет платы после появления данных BOM." />}
        {commandError && !rowDeletePending ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}
      </Panel>

      {draft ? <Panel heading={<div className="panel-heading"><div><h2>{deletePending ? "Подтверждение удаления" : draft.isNew ? "Новая плата" : "Редактирование платы"}</h2><p>Существующий владелец Boards/BOM</p></div><ActionButton onClick={() => { if (deletePending) setDeletePending(false); else setDraft(null); clearCommandError(); }} variant="secondary">Отмена</ActionButton></div>}>
        {deletePending ? <DeleteConfirmation busy={saving} error={commandError} id="react-board-delete-title" onCancel={() => setDeletePending(false)} onConfirm={() => { void deleteDraft(); }} title="Удалить плату и её BOM?">
          <p>Плата «{draft.name || "без названия"}» и её BOM будут удалены.</p>
          <p>Связано с составами: {model.deleteUsageById[draft.bomId]?.specificationsCount || 0}. Строк BOM: {model.deleteUsageById[draft.bomId]?.bomRowsCount || 0}.</p>
        </DeleteConfirmation> : <form className="react-nomenclature-editor" onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
          <label><span>Название платы</span><input name="name" onChange={(event) => setDraftField("name", event.currentTarget.value)} required value={draft.name} /></label>
          <label><span>Децимальный номер</span><input name="boardCode" onChange={(event) => setDraftField("boardCode", event.currentTarget.value)} value={draft.boardCode} /></label>
          <label className="full"><span>Результат производства</span><input name="resultItem" onChange={(event) => setDraftField("resultItem", event.currentTarget.value)} value={draft.resultItem} /></label>
          {commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}
          <div className="react-nomenclature-editor-actions">
            {!draft.isNew ? <ActionButton disabled={!model.canDelete} onClick={() => { setDeletePending(true); clearCommandError(); }} title={model.canDelete ? "Удалить через существующую команду" : "Delete evaluation выключен"} variant="danger">Удалить</ActionButton> : null}
            <button className="action action--primary" disabled={saving} type="submit">{saving ? "Сохранение…" : draft.isNew ? "Создать плату" : "Сохранить плату"}</button>
          </div>
        </form>}
      </Panel> : <><DetailPanel
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
      />{selected && model.canCreateEdit ? <div className="react-nomenclature-detail-actions"><ActionButton onClick={() => setDraft(createBoardDraft(selected))} variant="secondary">Редактировать плату</ActionButton></div> : null}</>}
    </ModulePage>
  );
}

function BomTextCellEditor({ ariaLabel, disabled, id, onCommit, value }: { ariaLabel: string; disabled: boolean; id: string; onCommit(value: string): Promise<BoardsCommandResult | void | undefined>; value: string | number }) {
  const ownerValue = String(value ?? "");
  const [draft, setDraft] = useState(ownerValue);
  useEffect(() => setDraft(ownerValue), [ownerValue]);
  const commit = async () => {
    if (draft === ownerValue) return;
    const result = await onCommit(draft);
    if (result && result.ok !== false && result.value !== undefined) setDraft(String(result.value));
  };
  return <input aria-label={ariaLabel} className="react-bom-cell-input" data-react-bom-cell={id} disabled={disabled} onBlur={() => { void commit(); }} onChange={(event) => setDraft(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} type="text" value={draft} />;
}

interface BoardDraft { isNew: boolean; bomId: string; name: string; boardCode: string; resultItem: string }
interface BomRowDeleteTarget { bomId: string; rowIndex: number; expectedRows: readonly (readonly (string | number)[])[]; label: string }
interface BoardsCommandResult { ok?: boolean; message?: string; value?: string | number; rowCount?: number }
const createBoardDraft = (board?: BoardItem): BoardDraft => ({ isNew: !board, bomId: board?.id || "", name: board?.name || "", boardCode: board?.boardCode === "-" ? "" : board?.boardCode || "", resultItem: board?.resultItem === "-" ? "" : board?.resultItem || "" });
export type BoardsReactCommand =
  | { type: "save"; payload: BoardDraft }
  | { type: "delete"; payload: { bomId: string } }
  | { type: "import-bom-xlsx"; payload: { file: File; expectedBoardIds: readonly string[] } }
  | { type: "add-bom-nomenclature-row"; payload: { bomId: string; nomenclatureId: string; expectedRows: readonly (readonly (string | number)[])[] } }
  | { type: "update-bom-quantity"; payload: { bomId: string; rowIndex: number; expectedValues: readonly (string | number)[]; quantity: string } }
  | { type: "update-bom-cell"; payload: { bomId: string; rowIndex: number; columnIndex: number; expectedValues: readonly (string | number)[]; value: string } }
  | { type: "delete-bom-row"; payload: BomRowDeleteTarget };
