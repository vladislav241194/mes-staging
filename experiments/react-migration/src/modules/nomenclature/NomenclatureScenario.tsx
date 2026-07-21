import { useMemo, useState } from "react";
import { ActionButton, DeleteConfirmation, DetailPanel, EmptyState, ModuleHeader, ModulePage, ModuleSidebar, Panel, SelectableRow, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { resolveAvailableFilter } from "../../ui/selection";
import { useCommandRunner } from "../../ui/use-command";
import { adaptNomenclatureReadModel, type NomenclatureItem } from "./adapter";
import { buildNomenclatureFilters, filterNomenclatureItems, formatRecordCount, NOMENCLATURE_READ_COLUMNS, resolveVisibleSelection, type NomenclatureFilter } from "./view-model";

interface NomenclatureDraft {
  isNew: boolean;
  itemId: string;
  name: string;
  article: string;
  type: string;
  package: string;
  unit: string;
  manufacturer: string;
  description: string;
  status: string;
  updatedAt: string;
  expectedRow: Record<string, unknown> | null;
  idempotencyKey: string;
}

const createDraft = (item?: NomenclatureItem): NomenclatureDraft => {
  const itemId = item?.id || `nom-${crypto.randomUUID()}`;
  return {
    isNew: !item,
    itemId,
    name: item?.name || "",
    article: item?.articleValue || "",
    type: item?.type || "РЭА компоненты",
    package: item?.packageValue || "",
    unit: item?.unit || "шт.",
    manufacturer: item?.manufacturerValue || "",
    description: item?.description || "",
    status: item?.statusLabel || "Активен",
    updatedAt: new Date().toISOString(),
    expectedRow: item?.baseline || null,
    idempotencyKey: crypto.randomUUID(),
  };
};

const EDITOR_FIELDS = [
  ["name", "Наименование"],
  ["article", "Артикул"],
  ["type", "Раздел"],
  ["package", "Корпус / размер"],
  ["unit", "Ед. изм."],
  ["manufacturer", "Производитель"],
  ["status", "Статус"],
] as const;

export type NomenclatureReactCommand =
  | { type: "save"; payload: NomenclatureDraft }
  | { type: "delete"; payload: { itemId: string; expectedRow: Record<string, unknown>; idempotencyKey: string } }
  | { type: "request-elevation" };

export function NomenclatureScenario({ payload, onCommand, onRequestBoards }: { payload: unknown; onCommand?(command: NomenclatureReactCommand): Promise<{ ok?: boolean; message?: string } | void>; onRequestBoards?(): void }) {
  const model = useMemo(() => adaptNomenclatureReadModel(payload), [payload]);
  const filters = useMemo(() => buildNomenclatureFilters(model), [model]);
  const [filter, setFilter] = useState<NomenclatureFilter>("all");
  const [selectedId, setSelectedId] = useState(model.items[0]?.id ?? "");
  const [draft, setDraft] = useState<NomenclatureDraft | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const { clearCommandError, commandError, runCommand, saving } = useCommandRunner(onCommand);
  const activeFilter = resolveAvailableFilter(filters.map((entry) => entry.id), filter, "all");
  const visibleItems = filterNomenclatureItems(model.items, activeFilter);
  const selected = resolveVisibleSelection(visibleItems, selectedId);
  const setDraftField = (field: keyof NomenclatureDraft, value: string) => setDraft((current) => {
    if (!current || current[field] === value) return current;
    return {
      ...current,
      [field]: value,
      updatedAt: new Date().toISOString(),
      idempotencyKey: crypto.randomUUID(),
    };
  });
  const saveDraft = async () => {
    if (!draft) return;
    await runCommand({ type: "save", payload: draft }, "Не удалось сохранить позицию.");
  };
  const deleteDraft = async () => {
    if (!draft || draft.isNew || !model.canDelete || !draft.expectedRow) return;
    await runCommand({ type: "delete", payload: { itemId: draft.itemId, expectedRow: draft.expectedRow, idempotencyKey: `${draft.idempotencyKey}-delete` } }, "Не удалось удалить позицию.");
  };
  const header = <ModuleHeader eyebrow="Технологии" title="Номенклатура" badge={<span className="lab-badge">React</span>} />;
  const sidebar = (
    <ModuleSidebar label="Разделы номенклатуры" title="Разделы">
      {filters.map((entry) => (
        <SidebarItem
          active={activeFilter === entry.id}
          count={entry.count}
          key={entry.id}
          label={entry.label}
          onClick={() => entry.action === "boards" ? onRequestBoards?.() : setFilter(entry.id)}
        />
      ))}
    </ModuleSidebar>
  );

  return (
    <ModulePage header={header} sidebar={sidebar}>
      <Panel heading={
        <div className="panel-heading">
          <div><h2>Позиции</h2><p>{formatRecordCount(visibleItems.length)} в выбранном разделе</p></div>
          <div className="react-nomenclature-editor-actions">
            {model.canElevate ? <ActionButton disabled={saving} onClick={() => void runCommand({ type: "request-elevation" }, "PIN не подтверждён.")} variant="secondary">Подтвердить PIN</ActionButton> : null}
            <ActionButton disabled={!model.canCreate} onClick={() => setDraft(createDraft())} title={model.canCreate ? undefined : model.createReason || model.unavailableReason || "Нет права на создание"}>Добавить позицию</ActionButton>
          </div>
        </div>
      }>
        {!model.canCreate && !model.canEdit && model.unavailableReason ? <p className="react-nomenclature-command-error" role="status">{model.unavailableReason}</p> : null}
        {visibleItems.length ? <TableWrap>
          <table>
            <thead><tr>{NOMENCLATURE_READ_COLUMNS.map((column) => <th key={column}>{column}</th>)}</tr></thead>
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

      {draft ? <Panel heading={<div className="panel-heading"><div><h2>{deletePending ? "Подтверждение удаления" : draft.isNew ? "Новая позиция" : "Редактирование позиции"}</h2><p>Серверная команда</p></div><ActionButton onClick={() => { if (deletePending) setDeletePending(false); else setDraft(null); clearCommandError(); }} variant="secondary">Отмена</ActionButton></div>}>
        {deletePending ? <DeleteConfirmation busy={saving} error={commandError} id="react-nomenclature-delete-title" onCancel={() => setDeletePending(false)} onConfirm={() => { void deleteDraft(); }} title="Удалить позицию номенклатуры?">
          <p>Позиция «{draft.name || "без названия"}» будет удалена из номенклатуры.</p>
          <p>Ссылки будут очищены: {model.deleteUsageById[draft.itemId]?.specificationsCount || 0} составов изделия, {model.deleteUsageById[draft.itemId]?.bomRowsCount || 0} строк BOM.</p>
        </DeleteConfirmation> : <form className="react-nomenclature-editor" onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
          {EDITOR_FIELDS.map(([field, label]) => <label key={field}><span>{label}</span>{field === "type"
            ? <select name={field} onChange={(event) => setDraftField(field, event.currentTarget.value)} value={draft[field]}>{model.types.map((entry) => <option key={entry.id} value={entry.label}>{entry.label}</option>)}</select>
            : <input name={field} onChange={(event) => setDraftField(field, event.currentTarget.value)} required={field === "name"} value={draft[field]} />}</label>)}
          <label className="full"><span>Описание</span><textarea name="description" onChange={(event) => setDraftField("description", event.currentTarget.value)} rows={3} value={draft.description} /></label>
          {commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}
          <div className="react-nomenclature-editor-actions">
            {!draft.isNew ? <ActionButton disabled={!model.canDelete} onClick={() => { setDeletePending(true); clearCommandError(); }} title={model.canDelete ? undefined : model.deleteReason || model.unavailableReason || "Нет права на удаление"} variant="danger">Удалить</ActionButton> : null}
            <button className="action action--primary" disabled={saving || (draft.isNew ? !model.canCreate : !model.canEdit)} title={draft.isNew ? model.createReason : model.editReason} type="submit">{saving ? "Сохранение…" : draft.isNew ? "Создать позицию" : "Сохранить позицию"}</button>
          </div>
        </form>}
      </Panel> : <DetailPanel
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
      />}
      {!draft && selected && model.canEdit ? <div className="react-nomenclature-detail-actions"><ActionButton onClick={() => setDraft(createDraft(selected))} variant="secondary">Редактировать</ActionButton></div> : null}
    </ModulePage>
  );
}
