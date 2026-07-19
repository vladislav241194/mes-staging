import { useMemo, useState } from "react";
import { ActionButton, DetailPanel, EmptyState, ModuleHeader, ModulePage, ModuleSidebar, Panel, SelectableRow, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { resolveAvailableFilter } from "../../ui/selection";
import { adaptOperationsModel, type OperationReadItem } from "./adapter";
import { buildOperationFilters, filterOperations, resolveVisibleOperation, type OperationFilter } from "./view-model";

interface OperationDraft {
  isNew: boolean;
  itemId: string;
  name: string;
  workCenterId: string;
  status: string;
}

const createDraft = (defaultWorkCenterId: string, item?: OperationReadItem): OperationDraft => ({
  isNew: !item,
  itemId: item?.id || "",
  name: item?.name || "",
  workCenterId: item?.workCenterId || defaultWorkCenterId,
  status: item?.statusLabel || "Активен",
});

export type OperationsReactCommand = { type: "save"; payload: OperationDraft };

export function OperationsScenario({ payload, onCommand, onRequestLegacy }: {
  payload: unknown;
  onCommand?(command: OperationsReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
  onRequestLegacy?(): void;
}) {
  const model = useMemo(() => adaptOperationsModel(payload), [payload]);
  const filters = useMemo(() => buildOperationFilters(model.items), [model.items]);
  const [filter, setFilter] = useState<OperationFilter>("all");
  const [selectedId, setSelectedId] = useState(model.items[0]?.id || "");
  const [draft, setDraft] = useState<OperationDraft | null>(null);
  const [commandError, setCommandError] = useState("");
  const [saving, setSaving] = useState(false);
  const activeFilter = resolveAvailableFilter(filters.map((entry) => entry.id), filter, "all");
  const visibleItems = filterOperations(model.items, activeFilter);
  const selected = resolveVisibleOperation(visibleItems, selectedId);
  const defaultWorkCenterId = model.workCenters[0]?.id || "";
  const setDraftField = (field: keyof OperationDraft, value: string) => setDraft((current) => current ? { ...current, [field]: value } : current);

  const saveDraft = async () => {
    if (!draft || !onCommand) return;
    setSaving(true);
    setCommandError("");
    try {
      const result = await onCommand({ type: "save", payload: draft });
      if (result && result.ok === false) setCommandError(result.message || "Не удалось сохранить операцию.");
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : "Не удалось сохранить операцию.");
    } finally {
      setSaving(false);
    }
  };

  const header = <ModuleHeader eyebrow="Технологии" title="Операции" badge={<span className="lab-badge">{model.canCreateEdit ? "React · create/edit evaluation" : "React preview · только чтение"}</span>} />;
  const sidebar = <ModuleSidebar label="Операции по рабочим центрам" title="Рабочие центры">
    {onRequestLegacy ? <SidebarItem active={false} count={4} label="Все справочники" meta="Вернуться в legacy-контур" onClick={onRequestLegacy} /> : null}
    {filters.map((entry) => <SidebarItem active={activeFilter === entry.id} count={entry.count} key={entry.id} label={entry.label} onClick={() => setFilter(entry.id)} />)}
  </ModuleSidebar>;
  return <ModulePage header={header} sidebar={sidebar}>
    <Panel heading={<div className="panel-heading"><div><h2>Операции</h2><p>{visibleItems.length.toLocaleString("ru-RU")} в выбранном рабочем центре</p></div><ActionButton disabled={!model.canCreateEdit || !defaultWorkCenterId} onClick={() => setDraft(createDraft(defaultWorkCenterId))} title={model.canCreateEdit ? "Создать через существующую команду справочника" : "Write evaluation выключен"}>Добавить операцию</ActionButton></div>}>
      {visibleItems.length ? <TableWrap><table>
        <thead><tr><th>Операция</th><th>Отдел</th><th>Статус</th></tr></thead>
        <tbody>{visibleItems.map((item) => <SelectableRow key={item.id} onSelect={() => setSelectedId(item.id)} selected={selected?.id === item.id}>
          <td>{item.name}</td><td>{item.workCenterLabel}</td><td><StatusToken label={item.statusLabel} tone={item.statusTone} /></td>
        </SelectableRow>)}</tbody>
      </table></TableWrap> : <EmptyState title="Операций пока нет" text="В выбранном рабочем центре нет операций." />}
    </Panel>

    {draft ? <Panel heading={<div className="panel-heading"><div><h2>{draft.isNew ? "Новая операция" : "Редактирование операции"}</h2><p>Команда выполняется существующим владельцем справочника и связей планирования</p></div><ActionButton onClick={() => { setDraft(null); setCommandError(""); }} variant="secondary">Отмена</ActionButton></div>}>
      <form className="react-nomenclature-editor" onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
        <label><span>Операция</span><input name="name" onChange={(event) => setDraftField("name", event.currentTarget.value)} required value={draft.name} /></label>
        <label><span>Рабочий центр</span><select name="workCenterId" onChange={(event) => setDraftField("workCenterId", event.currentTarget.value)} required value={draft.workCenterId}>
          {model.workCenters.map((center) => <option key={center.id} value={center.id}>{center.label}{center.code ? ` · ${center.code}` : ""}</option>)}
        </select></label>
        <label><span>Статус</span><input name="status" onChange={(event) => setDraftField("status", event.currentTarget.value)} value={draft.status} /></label>
        {commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}
        <div className="react-nomenclature-editor-actions">
          <button className="action action--primary" disabled={saving} type="submit">{saving ? "Сохранение…" : draft.isNew ? "Создать операцию" : "Сохранить операцию"}</button>
        </div>
      </form>
    </Panel> : <>
      <DetailPanel
        emptyText="Операция не выбрана"
        eyebrow="Карточка операции"
        fields={selected ? [
          { label: "Код", value: selected.code },
          { label: "Рабочий центр", value: selected.workCenterLabel },
          { label: "Stable ID", value: selected.id },
          { label: "Норматив", value: `${selected.unitsPerHour.toLocaleString("ru-RU")} ед./ч` },
        ] : []}
        title={selected?.name}
      />
      {selected && model.canCreateEdit ? <div className="react-nomenclature-detail-actions"><ActionButton onClick={() => setDraft(createDraft(defaultWorkCenterId, selected))} variant="secondary">Редактировать</ActionButton></div> : null}
    </>}
  </ModulePage>;
}
