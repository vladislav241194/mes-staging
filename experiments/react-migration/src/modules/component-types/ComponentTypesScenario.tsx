import { useMemo, useState } from "react";
import { ActionButton, DeleteConfirmation, DetailPanel, EmptyState, ModuleHeader, ModulePage, ModuleSidebar, Panel, SelectableRow, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { formatRecordCount } from "../../ui/format";
import { resolveAvailableFilter } from "../../ui/selection";
import { useCommandRunner } from "../../ui/use-command";
import { DirectorySectionNavigation, type DirectorySectionId } from "../directories/DirectorySectionNavigation";
import { adaptComponentTypesModel, type ComponentTypeItem } from "./adapter";
import { buildComponentTypeFilters, filterComponentTypes, formatDecimal, formatInteger, resolveVisibleComponentType, type ComponentTypeFilter } from "./view-model";

interface ComponentTypeDraft {
  isNew: boolean;
  itemId: string;
  name: string;
  package: string;
  family: string;
  coefficient: string;
  placementsPerHour: string;
  setupSeconds: string;
  defaultCount: string;
  status: string;
}

const createDraft = (item?: ComponentTypeItem): ComponentTypeDraft => ({
  isNew: !item,
  itemId: item?.id || "",
  name: item?.name || "",
  package: item?.packageName === "—" ? "" : item?.packageName || "",
  family: item?.family === "Без семейства" ? "" : item?.family || "",
  coefficient: String(item?.coefficient ?? 0),
  placementsPerHour: String(item?.placementsPerHour ?? 0),
  setupSeconds: String(item?.setupSeconds ?? 0),
  defaultCount: String(item?.defaultCount ?? 0),
  status: item?.statusLabel || "Активен",
});

export type ComponentTypesReactCommand =
  | { type: "save"; payload: ComponentTypeDraft }
  | { type: "delete"; payload: { itemId: string } };

export function ComponentTypesScenario({ payload, onCommand, onNavigateSection, onRequestLegacy }: {
  payload: unknown;
  onCommand?(command: ComponentTypesReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
  onNavigateSection?(sectionId: DirectorySectionId): void;
  onRequestLegacy?(scope?: string): void;
}) {
  const model = useMemo(() => adaptComponentTypesModel(payload), [payload]);
  const filters = useMemo(() => buildComponentTypeFilters(model.items), [model.items]);
  const [filter, setFilter] = useState<ComponentTypeFilter>("all");
  const [selectedId, setSelectedId] = useState(model.items[0]?.id ?? "");
  const [draft, setDraft] = useState<ComponentTypeDraft | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const { clearCommandError, commandError, runCommand, saving } = useCommandRunner(onCommand);
  const activeFilter = resolveAvailableFilter(filters.map((entry) => entry.id), filter, "all");
  const visibleItems = filterComponentTypes(model.items, activeFilter);
  const selected = resolveVisibleComponentType(visibleItems, selectedId);
  const setDraftField = (field: keyof ComponentTypeDraft, value: string) => setDraft((current) => current ? { ...current, [field]: value } : current);

  const header = <ModuleHeader eyebrow="Технологии" title="Типы компонентов" badge={<span className="lab-badge" data-react-complete-marker>{model.canCreateEdit ? `React TS · create/edit${model.canDelete ? "/delete" : ""}` : "React TS · только чтение"}</span>} />;
  const sidebar = (
    <ModuleSidebar label="Семейства компонентов" title="Семейства">
      {onRequestLegacy ? <SidebarItem active={false} count={4} key="directories" label="Все справочники" meta="Вернуться в legacy-контур" onClick={() => onRequestLegacy("legacy-directory")} /> : null}
      <DirectorySectionNavigation activeId="componentTypes" onNavigate={onNavigateSection} />
      {filters.map((entry) => <SidebarItem active={activeFilter === entry.id} count={entry.count} key={entry.id} label={entry.label} onClick={() => setFilter(entry.id)} />)}
    </ModuleSidebar>
  );

  return (
    <ModulePage header={header} sidebar={sidebar}>
      <Panel heading={<div className="panel-heading"><div><h2>Типы</h2><p>{formatRecordCount(visibleItems.length)} в выбранном семействе</p></div><ActionButton disabled={!model.canCreateEdit} onClick={() => setDraft(createDraft())} title={model.canCreateEdit ? "Создать через существующую команду справочника" : "Нет права на создание"}>Добавить тип</ActionButton></div>}>
        {visibleItems.length ? <TableWrap><table>
          <thead><tr><th>Тип</th><th>Корпус</th><th>Семейство</th><th>Коэф.</th><th>Комп./ч</th><th>Setup, сек</th><th>По умолч.</th><th>Статус</th></tr></thead>
          <tbody>{visibleItems.map((item) => <SelectableRow key={item.id} onSelect={() => setSelectedId(item.id)} selected={selected?.id === item.id}>
            <td>{item.name}</td><td>{item.packageName}</td><td>{item.family}</td><td>{formatDecimal(item.coefficient)}</td><td>{formatInteger(item.placementsPerHour)} комп./ч</td><td>{item.setupSeconds} сек</td><td>{item.defaultCount} шт.</td><td><StatusToken label={item.statusLabel} tone={item.statusTone} /></td>
          </SelectableRow>)}</tbody>
        </table></TableWrap> : <EmptyState title="Типов пока нет" text="В выбранном семействе ещё нет типов компонентов." />}
      </Panel>

      {draft ? <Panel heading={<div className="panel-heading"><div><h2>{deletePending ? "Подтверждение удаления" : draft.isNew ? "Новый тип" : "Редактирование типа"}</h2><p>Команда выполняется существующим владельцем справочника</p></div><ActionButton onClick={() => { if (deletePending) setDeletePending(false); else setDraft(null); clearCommandError(); }} variant="secondary">Отмена</ActionButton></div>}>
        {deletePending ? <DeleteConfirmation busy={saving} error={commandError} id="react-component-type-delete-title" onCancel={() => setDeletePending(false)} onConfirm={() => { void runCommand({ type: "delete", payload: { itemId: draft.itemId } }, "Не удалось удалить тип."); }} title="Удалить тип компонента?">
          <p>Тип «{draft.name || "без названия"}» будет удалён владельцем данных справочника.</p>
        </DeleteConfirmation> : <form className="react-nomenclature-editor" onSubmit={(event) => { event.preventDefault(); void runCommand({ type: "save", payload: draft }, "Не удалось сохранить тип."); }}>
          <label><span>Тип</span><input name="name" onChange={(event) => setDraftField("name", event.currentTarget.value)} required value={draft.name} /></label>
          <label><span>Корпус</span><input name="package" onChange={(event) => setDraftField("package", event.currentTarget.value)} value={draft.package} /></label>
          <label><span>Семейство</span><input name="family" onChange={(event) => setDraftField("family", event.currentTarget.value)} value={draft.family} /></label>
          <label><span>Коэффициент</span><input min="0" name="coefficient" onChange={(event) => setDraftField("coefficient", event.currentTarget.value)} step="0.01" type="number" value={draft.coefficient} /></label>
          <label><span>Компонентов в час</span><input min="0" name="placementsPerHour" onChange={(event) => setDraftField("placementsPerHour", event.currentTarget.value)} step="1" type="number" value={draft.placementsPerHour} /></label>
          <label><span>Setup, сек</span><input min="0" name="setupSeconds" onChange={(event) => setDraftField("setupSeconds", event.currentTarget.value)} step="1" type="number" value={draft.setupSeconds} /></label>
          <label><span>По умолчанию, шт.</span><input min="0" name="defaultCount" onChange={(event) => setDraftField("defaultCount", event.currentTarget.value)} step="1" type="number" value={draft.defaultCount} /></label>
          <label><span>Статус</span><input name="status" onChange={(event) => setDraftField("status", event.currentTarget.value)} value={draft.status} /></label>
          {commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}
          <div className="react-nomenclature-editor-actions">
            {!draft.isNew ? <ActionButton disabled={!model.canDelete} onClick={() => { setDeletePending(true); clearCommandError(); }} title={model.canDelete ? "Удалить через существующую команду" : "Нет права на удаление"} variant="danger">Удалить</ActionButton> : null}
            <button className="action action--primary" disabled={saving} type="submit">{saving ? "Сохранение…" : draft.isNew ? "Создать тип" : "Сохранить тип"}</button>
          </div>
        </form>}
      </Panel> : <>
        <DetailPanel
          emptyText="В семействе нет типов компонентов"
          eyebrow="Карточка типа"
          fields={selected ? [
            { label: "Корпус", value: selected.packageName },
            { label: "Семейство", value: selected.family },
            { label: "Коэффициент", value: formatDecimal(selected.coefficient) },
            { label: "Производительность", value: `${formatInteger(selected.placementsPerHour)} комп./ч` },
            { label: "Setup", value: `${selected.setupSeconds} сек` },
            { label: "Количество по умолчанию", value: `${selected.defaultCount} шт.` },
          ] : []}
          title={selected?.name}
        />
        {selected && model.canCreateEdit ? <div className="react-nomenclature-detail-actions"><ActionButton onClick={() => setDraft(createDraft(selected))} variant="secondary">Редактировать</ActionButton></div> : null}
      </>}
    </ModulePage>
  );
}
