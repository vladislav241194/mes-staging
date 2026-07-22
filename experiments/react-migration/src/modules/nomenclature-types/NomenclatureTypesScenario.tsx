import { useMemo, useState } from "react";
import { ActionButton, DeleteConfirmation, DetailPanel, EmptyState, ModuleHeader, ModulePage, ModuleSidebar, Panel, SelectableRow, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { resolveAvailableFilter } from "../../ui/selection";
import { useCommandRunner } from "../../ui/use-command";
import { DirectorySectionNavigation, type DirectorySectionId } from "../directories/DirectorySectionNavigation";
import { adaptNomenclatureTypesModel, type NomenclatureTypeReadItem } from "./adapter";
import { buildNomenclatureTypeFilters, filterNomenclatureTypes, resolveVisibleNomenclatureType, type NomenclatureTypeFilter } from "./view-model";

export interface NomenclatureTypeDraft {
  isNew: boolean;
  itemId: string;
  name: string;
  code: string;
  description: string;
  status: string;
  expectedRow: Record<string, unknown> | null;
  expectedRevision: number | null;
  idempotencyKey: string;
}

const createDraft = (item: NomenclatureTypeReadItem | undefined, expectedRevision: number | null): NomenclatureTypeDraft => ({
  isNew: !item,
  itemId: item?.id || `nt-${crypto.randomUUID()}`,
  name: item?.name || "",
  code: item?.code === "—" ? "" : item?.code || "",
  description: item?.description === "—" ? "" : item?.description || "",
  status: item?.statusLabel || "Активен",
  expectedRow: item?.baseline || null,
  expectedRevision,
  idempotencyKey: crypto.randomUUID(),
});

export type NomenclatureTypesReactCommand =
  | { type: "save"; payload: NomenclatureTypeDraft }
  | { type: "delete"; payload: NomenclatureTypeDeletePayload };

interface NomenclatureTypeDeletePayload {
    itemId: string;
    expectedRow: Record<string, unknown>;
    expectedRevision: number | null;
    fallbackTypeId: string;
    fallbackExpectedRow: Record<string, unknown>;
    impactFingerprint: string;
    idempotencyKey: string;
}

export function NomenclatureTypesScenario({ payload, onCommand, onNavigateSection, onRequestLegacy }: {
  payload: unknown;
  onCommand?(command: NomenclatureTypesReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
  onNavigateSection?(sectionId: DirectorySectionId): void;
  onRequestLegacy?(): void;
}) {
  const model = useMemo(() => adaptNomenclatureTypesModel(payload), [payload]);
  const filters = useMemo(() => buildNomenclatureTypeFilters(model.items), [model.items]);
  const [filter, setFilter] = useState<NomenclatureTypeFilter>("all");
  const [selectedId, setSelectedId] = useState(model.items[0]?.id || "");
  const [draft, setDraft] = useState<NomenclatureTypeDraft | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [pendingDeletePayload, setPendingDeletePayload] = useState<NomenclatureTypeDeletePayload | null>(null);
  const { clearCommandError, commandError, runCommand, saving } = useCommandRunner(onCommand);
  const activeFilter = resolveAvailableFilter(filters.map((entry) => entry.id), filter, "all");
  const visibleItems = filterNomenclatureTypes(model.items, activeFilter);
  const selected = resolveVisibleNomenclatureType(visibleItems, selectedId);
  const setDraftField = (field: "name" | "code" | "description" | "status", value: string) => setDraft((current) => {
    if (!current || current[field] === value) return current;
    return { ...current, [field]: value, idempotencyKey: crypto.randomUUID() };
  });

  const saveDraft = async () => {
    if (!draft) return;
    const result = await runCommand({ type: "save", payload: draft }, "Не удалось сохранить тип номенклатуры.");
    if (result?.ok === true) setDraft(null);
  };
  const deleteDraft = async () => {
    if (!pendingDeletePayload) return;
    const result = await runCommand({ type: "delete", payload: pendingDeletePayload }, "Не удалось удалить тип номенклатуры.");
    if (result?.ok === true) {
      setDeletePending(false);
      setPendingDeletePayload(null);
      setDraft(null);
    }
  };
  const openDeleteConfirmation = () => {
    if (!draft || draft.isNew || !model.canDelete || !draft.expectedRow) return;
    const usage = model.deleteUsageById[draft.itemId];
    if (model.serverCommandsEnabled && !usage?.serverContractReady) return;
    const expectedRow = model.serverCommandsEnabled ? usage?.expectedRow : draft.expectedRow;
    if (!expectedRow) return;
    setPendingDeletePayload({
      itemId: draft.itemId,
      expectedRow,
      expectedRevision: draft.expectedRevision,
      fallbackTypeId: usage?.fallbackTypeId || "",
      fallbackExpectedRow: usage?.fallbackExpectedRow || {},
      impactFingerprint: usage?.impactFingerprint || "",
      idempotencyKey: `${draft.idempotencyKey}-delete`,
    });
    setDeletePending(true);
    clearCommandError();
  };

  const deleteUsage = draft ? model.deleteUsageById[draft.itemId] : undefined;
  const deleteReady = model.canDelete
    && Boolean(draft?.expectedRow)
    && (!model.serverCommandsEnabled || (deleteUsage?.serverContractReady === true && Boolean(deleteUsage.expectedRow)));
  const writeCapabilityLabel = model.canCreate && model.canEdit
    ? "create/edit"
    : model.canCreate ? "create" : "edit";

  const header = <ModuleHeader eyebrow="Технологии" title="Типы номенклатуры" badge={<span className="lab-badge" data-react-complete-marker>{model.canCreateEdit ? `React TS · ${writeCapabilityLabel}${model.canDelete ? "/delete" : ""}` : "React TS · только чтение"}</span>} />;
  const sidebar = <ModuleSidebar label="Типы номенклатуры по статусу" title="Статусы">
    {onRequestLegacy ? <SidebarItem active={false} count={4} label="Все справочники" meta="Вернуться в legacy-контур" onClick={onRequestLegacy} /> : null}
    <DirectorySectionNavigation activeId="nomenclatureTypes" onNavigate={onNavigateSection} />
    {filters.map((entry) => <SidebarItem active={activeFilter === entry.id} count={entry.count} key={entry.id} label={entry.label} onClick={() => setFilter(entry.id)} />)}
  </ModuleSidebar>;

  return <ModulePage header={header} sidebar={sidebar}>
    <Panel heading={<div className="panel-heading"><div><h2>Типы номенклатуры</h2><p>{visibleItems.length.toLocaleString("ru-RU")} в выбранном статусе</p></div><ActionButton disabled={!model.canCreate} onClick={() => setDraft(createDraft(undefined, model.directoryRevision))} title={model.canCreate ? "Создать через существующую команду справочника" : "Нет права на создание"}>Добавить тип</ActionButton></div>}>
      {visibleItems.length ? <TableWrap><table>
        <thead><tr><th>Тип номенклатуры</th><th>Код</th><th>Описание</th><th>Статус</th></tr></thead>
        <tbody>{visibleItems.map((item) => <SelectableRow key={item.id} onSelect={() => setSelectedId(item.id)} selected={selected?.id === item.id}>
          <td>{item.name}</td><td>{item.code}</td><td>{item.description}</td><td><StatusToken label={item.statusLabel} tone={item.statusTone} /></td>
        </SelectableRow>)}</tbody>
      </table></TableWrap> : <EmptyState title="Типов пока нет" text="В выбранном статусе нет типов номенклатуры." />}
    </Panel>
    {draft ? <Panel heading={<div className="panel-heading"><div><h2>{deletePending ? "Подтверждение удаления" : draft.isNew ? "Новый тип номенклатуры" : "Редактирование типа"}</h2><p>Команда выполняется существующим владельцем справочника</p></div><ActionButton onClick={() => { if (deletePending) { setDeletePending(false); setPendingDeletePayload(null); } else setDraft(null); clearCommandError(); }} variant="secondary">Отмена</ActionButton></div>}>
      {deletePending ? <DeleteConfirmation busy={saving} error={commandError} id="react-nomenclature-type-delete-title" onCancel={() => { setDeletePending(false); setPendingDeletePayload(null); }} onConfirm={() => { void deleteDraft(); }} title="Удалить тип номенклатуры?">
        <p>Тип «{draft.name || "без названия"}» будет удалён.</p>
        <p>Связано: {model.deleteUsageById[draft.itemId]?.nomenclatureCount || 0} позиций, {model.deleteUsageById[draft.itemId]?.specificationRowsCount || 0} строк составов. Новый тип: {model.deleteUsageById[draft.itemId]?.fallbackType || "не задан"}.</p>
      </DeleteConfirmation> : <form className="react-nomenclature-editor" onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
        <label><span>Тип номенклатуры</span><input name="name" onChange={(event) => setDraftField("name", event.currentTarget.value)} required value={draft.name} /></label>
        <label><span>Код</span><input name="code" onChange={(event) => setDraftField("code", event.currentTarget.value)} value={draft.code} /></label>
        <label><span>Описание</span><input name="description" onChange={(event) => setDraftField("description", event.currentTarget.value)} value={draft.description} /></label>
        <label><span>Статус</span><input name="status" onChange={(event) => setDraftField("status", event.currentTarget.value)} value={draft.status} /></label>
        {commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}
        <div className="react-nomenclature-editor-actions">
          {!draft.isNew ? <ActionButton disabled={!deleteReady} onClick={openDeleteConfirmation} title={deleteReady ? "Удалить через существующую команду" : "Для удаления нужен актуальный серверный расчёт связей"} variant="danger">Удалить</ActionButton> : null}
          <button className="action action--primary" disabled={saving || (draft.isNew ? !model.canCreate : !model.canEdit)} type="submit">{saving ? "Сохранение…" : draft.isNew ? "Создать тип" : "Сохранить тип"}</button>
        </div>
      </form>}
    </Panel> : <>
      <DetailPanel emptyText="Тип не выбран" eyebrow="Карточка типа" fields={selected ? [
        { label: "Код", value: selected.code },
        { label: "Описание", value: selected.description },
        { label: "Stable ID", value: selected.id },
        { label: "Статус", value: <StatusToken label={selected.statusLabel} tone={selected.statusTone} /> },
      ] : []} title={selected?.name} />
      {selected && model.canEdit ? <div className="react-nomenclature-detail-actions"><ActionButton onClick={() => setDraft(createDraft(selected, model.directoryRevision))} variant="secondary">Редактировать</ActionButton></div> : null}
    </>}
  </ModulePage>;
}
