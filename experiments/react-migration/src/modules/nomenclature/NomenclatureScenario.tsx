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
  customType: string;
  package: string;
  unit: string;
  manufacturer: string;
  description: string;
  status: string;
}

const createDraft = (item?: NomenclatureItem): NomenclatureDraft => ({
  isNew: !item,
  itemId: item?.id || "",
  name: item?.name || "",
  article: item?.articleValue || "",
  type: item?.type || "РЭА компоненты",
  customType: "",
  package: item?.packageValue || "",
  unit: item?.unit || "шт.",
  manufacturer: item?.manufacturerValue || "",
  description: item?.description || "",
  status: item?.statusLabel || "Активен",
});

export type NomenclatureReactCommand =
  | { type: "save"; payload: NomenclatureDraft }
  | { type: "delete"; payload: { itemId: string } };

export function NomenclatureScenario({ payload, onCommand, onRequestLegacy }: { payload: unknown; onCommand?(command: NomenclatureReactCommand): Promise<{ ok?: boolean; message?: string } | void>; onRequestLegacy?(scope?: string): void }) {
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
  const setDraftField = (field: keyof NomenclatureDraft, value: string) => setDraft((current) => current ? { ...current, [field]: value } : current);
  const saveDraft = async () => {
    if (!draft) return;
    await runCommand({ type: "save", payload: draft }, "Не удалось сохранить позицию.");
  };
  const deleteDraft = async () => {
    if (!draft || draft.isNew || !model.canDelete) return;
    await runCommand({ type: "delete", payload: { itemId: draft.itemId } }, "Не удалось удалить позицию.");
  };

  const header = <ModuleHeader eyebrow="Технологии" title="Номенклатура" badge={<span className="lab-badge">{model.canCreateEdit ? `React · create/edit${model.canDelete ? "/delete" : ""} evaluation` : "React preview · только чтение"}</span>} />;
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
          <ActionButton disabled={!model.canCreateEdit} onClick={() => setDraft(createDraft())} title={model.canCreateEdit ? "Создать позицию через существующую команду" : "Write evaluation выключен"}>Добавить позицию</ActionButton>
        </div>
      }>
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

      {draft ? <Panel heading={<div className="panel-heading"><div><h2>{deletePending ? "Подтверждение удаления" : draft.isNew ? "Новая позиция" : "Редактирование позиции"}</h2><p>Команда выполняется существующим legacy-владельцем данных</p></div><ActionButton onClick={() => { if (deletePending) setDeletePending(false); else setDraft(null); clearCommandError(); }} variant="secondary">Отмена</ActionButton></div>}>
        {deletePending ? <DeleteConfirmation busy={saving} error={commandError} id="react-nomenclature-delete-title" onCancel={() => setDeletePending(false)} onConfirm={() => { void deleteDraft(); }} title="Удалить позицию номенклатуры?">
          <p>Позиция «{draft.name || "без названия"}» будет удалена из номенклатуры.</p>
          <p>Ссылки будут очищены: {model.deleteUsageById[draft.itemId]?.specificationsCount || 0} составов изделия, {model.deleteUsageById[draft.itemId]?.bomRowsCount || 0} строк BOM.</p>
        </DeleteConfirmation> : <form className="react-nomenclature-editor" onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
          <label><span>Наименование</span><input name="name" onChange={(event) => setDraftField("name", event.currentTarget.value)} required value={draft.name} /></label>
          <label><span>Артикул</span><input name="article" onChange={(event) => setDraftField("article", event.currentTarget.value)} value={draft.article} /></label>
          <label><span>Раздел</span><select name="type" onChange={(event) => setDraftField("type", event.currentTarget.value)} value={draft.type}>{model.types.map((entry) => <option key={entry.id} value={entry.label}>{entry.label}</option>)}</select></label>
          <label><span>Новый раздел</span><input name="customType" onChange={(event) => setDraftField("customType", event.currentTarget.value)} value={draft.customType} /></label>
          <label><span>Корпус / размер</span><input name="package" onChange={(event) => setDraftField("package", event.currentTarget.value)} value={draft.package} /></label>
          <label><span>Ед. изм.</span><input name="unit" onChange={(event) => setDraftField("unit", event.currentTarget.value)} value={draft.unit} /></label>
          <label><span>Производитель</span><input name="manufacturer" onChange={(event) => setDraftField("manufacturer", event.currentTarget.value)} value={draft.manufacturer} /></label>
          <label><span>Статус</span><input name="status" onChange={(event) => setDraftField("status", event.currentTarget.value)} value={draft.status} /></label>
          <label className="full"><span>Описание</span><textarea name="description" onChange={(event) => setDraftField("description", event.currentTarget.value)} rows={3} value={draft.description} /></label>
          {commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}
          <div className="react-nomenclature-editor-actions">
            {!draft.isNew ? <ActionButton disabled={!model.canDelete} onClick={() => { setDeletePending(true); clearCommandError(); }} title={model.canDelete ? "Удалить через существующую команду" : "Delete evaluation выключен"} variant="danger">Удалить</ActionButton> : null}
            <button className="action action--primary" disabled={saving} type="submit">{saving ? "Сохранение…" : draft.isNew ? "Создать позицию" : "Сохранить позицию"}</button>
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
      {!draft && selected && model.canCreateEdit ? <div className="react-nomenclature-detail-actions"><ActionButton onClick={() => setDraft(createDraft(selected))} variant="secondary">Редактировать</ActionButton></div> : null}
    </ModulePage>
  );
}
