import { useMemo, useState } from "react";
import { ActionButton, DetailPanel, EmptyState, ModuleHeader, ModulePage, ModuleSidebar, Panel, SelectableRow, SidebarItem, TableWrap } from "../../ui/components";
import { resolveAvailableFilter } from "../../ui/selection";
import { useCommandRunner } from "../../ui/use-command";
import { adaptStatusesModel, type StatusReadItem } from "./adapter";
import { buildStatusFilters, filterStatuses, resolveVisibleStatus, type StatusFilter } from "./view-model";

interface CustomStatusDraft {
  isNew: boolean;
  itemId: string;
  group: string;
  name: string;
  type: string;
  code: string;
  annotation: string;
  impact: string;
}

const createDraft = (item?: StatusReadItem): CustomStatusDraft => ({
  isNew: !item,
  itemId: item?.id || "",
  group: item?.group === "—" ? "" : item?.group || "",
  name: item?.name || "",
  type: item?.type === "—" ? "Пользовательский статус" : item?.type || "Пользовательский статус",
  code: item?.code === "—" ? "" : item?.code || "",
  annotation: item?.annotation === "—" ? "" : item?.annotation || "",
  impact: item?.impactView === "—" ? "" : item?.impactView || "",
});

export type StatusesReactCommand = { type: "save-custom"; payload: CustomStatusDraft };

export function StatusesScenario({ payload, onCommand, onRequestLegacy }: {
  payload: unknown;
  onCommand?(command: StatusesReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
  onRequestLegacy?(): void;
}) {
  const model = useMemo(() => adaptStatusesModel(payload), [payload]);
  const filters = useMemo(() => buildStatusFilters(model.items), [model.items]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState(model.items[0]?.id || "");
  const [draft, setDraft] = useState<CustomStatusDraft | null>(null);
  const { clearCommandError, commandError, runCommand, saving } = useCommandRunner(onCommand);
  const activeFilter = resolveAvailableFilter(filters.map((entry) => entry.id), filter, "all");
  const visibleItems = filterStatuses(model.items, activeFilter);
  const selected = resolveVisibleStatus(visibleItems, selectedId);
  const setDraftField = (field: keyof CustomStatusDraft, value: string) => setDraft((current) => current ? { ...current, [field]: value } : current);
  const saveDraft = async () => {
    if (!draft) return;
    await runCommand({ type: "save-custom", payload: draft }, "Не удалось сохранить пользовательский статус.");
  };
  const sidebar = <ModuleSidebar label="Статусы по области применения" title="Области">
    {onRequestLegacy ? <SidebarItem active={false} count={4} label="Все справочники" meta="Вернуться в legacy-контур" onClick={onRequestLegacy} /> : null}
    {filters.map((entry) => <SidebarItem active={activeFilter === entry.id} count={entry.count} key={entry.id} label={entry.label} onClick={() => setFilter(entry.id)} />)}
  </ModuleSidebar>;
  return <ModulePage header={<ModuleHeader eyebrow="Мастер-данные" title="Статусы" badge={<span className="lab-badge">{model.canCreateEditCustom ? "React · custom-status evaluation" : "React preview · только чтение"}</span>} />} sidebar={sidebar}>
    <Panel heading={<div className="panel-heading"><div><h2>Единые статусы MES</h2><p>{visibleItems.length.toLocaleString("ru-RU")} в выбранной области</p></div><ActionButton disabled={!model.canCreateEditCustom} onClick={() => setDraft(createDraft())} title={model.canCreateEditCustom ? "Создать пользовательский статус" : "Системные контракты доступны только для чтения"}>Добавить пользовательский</ActionButton></div>}>
      {visibleItems.length ? <TableWrap><table><thead><tr><th>Область применения</th><th>Стартовый модуль</th><th>Где меняется</th><th>Контракт</th><th>Переход</th><th>Статус</th><th>Влияние</th></tr></thead>
        <tbody>{visibleItems.map((item) => <SelectableRow key={item.id} onSelect={() => setSelectedId(item.id)} selected={selected?.id === item.id}><td>{item.group}</td><td>{item.originModule}</td><td>{item.changeModule}</td><td>{item.contractView}</td><td>{item.transitionView}</td><td>{item.name}</td><td>{item.impactTableView}</td></SelectableRow>)}</tbody>
      </table></TableWrap> : <EmptyState title="Статусов пока нет" text="В выбранной области нет записей." />}
    </Panel>
    {draft ? <Panel heading={<div className="panel-heading"><div><h2>{draft.isNew ? "Новый пользовательский статус" : "Редактирование пользовательского статуса"}</h2><p>Системные lifecycle-строки этим редактором не изменяются</p></div><ActionButton onClick={() => { setDraft(null); clearCommandError(); }} variant="secondary">Отмена</ActionButton></div>}>
      <form className="react-nomenclature-editor" onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
        <label><span>Область применения</span><input name="group" onChange={(event) => setDraftField("group", event.currentTarget.value)} required value={draft.group} /></label>
        <label><span>Название статуса</span><input name="name" onChange={(event) => setDraftField("name", event.currentTarget.value)} required value={draft.name} /></label>
        <label><span>Объект</span><input name="type" onChange={(event) => setDraftField("type", event.currentTarget.value)} value={draft.type} /></label>
        <label><span>Код</span><input name="code" onChange={(event) => setDraftField("code", event.currentTarget.value)} required value={draft.code} /></label>
        <label className="full"><span>Аннотация</span><textarea name="annotation" onChange={(event) => setDraftField("annotation", event.currentTarget.value)} rows={3} value={draft.annotation} /></label>
        <label className="full"><span>Влияние</span><textarea name="impact" onChange={(event) => setDraftField("impact", event.currentTarget.value)} rows={3} value={draft.impact} /></label>
        {commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}
        <div className="react-nomenclature-editor-actions"><button className="action action--primary" disabled={saving} type="submit">{saving ? "Сохранение…" : draft.isNew ? "Создать статус" : "Сохранить статус"}</button></div>
      </form>
    </Panel> : <>
      <DetailPanel emptyText="Статус не выбран" eyebrow="Паспорт статуса" fields={selected ? [
        { label: "Стартовый модуль", value: selected.originModule }, { label: "Где меняется", value: selected.changeModule },
        { label: "Где используется", value: selected.usedIn }, { label: "Контракт", value: selected.contractView },
        { label: "Переход", value: selected.transitionView }, { label: "Следующий документ", value: selected.nextDocumentView },
        { label: "Категория", value: selected.registryKind }, { label: "Ревизия", value: selected.audit },
        { label: "Объект", value: selected.type }, { label: "Код", value: selected.code },
        { label: "Аннотация", value: selected.annotation }, { label: "Влияние", value: selected.impactView },
      ] : []} title={selected?.name} />
      {selected && model.canCreateEditCustom && selected.isUserManaged ? <div className="react-nomenclature-detail-actions"><ActionButton onClick={() => setDraft(createDraft(selected))} variant="secondary">Редактировать пользовательский статус</ActionButton></div> : null}
    </>}
  </ModulePage>;
}
