import { useMemo, useState } from "react";
import { ActionButton, DetailPanel, EmptyState, MetricCard, MetricGrid, ModuleHeader, ModulePage, ModuleSidebar, Panel, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { adaptRoles, ROLE_ACTIONS, roleAllows } from "./adapter";
import { getAssignedEmployeeSummary, getRoleScopeLabel, resolveVisibleRole } from "./view-model";

interface RoleMetadataDraft {
  roleId: string;
  label: string;
  description: string;
  defaultModuleId: string;
}

export type RolesReactCommand = { type: "save-metadata"; payload: RoleMetadataDraft };

export function RolesScenario({ payload, onCommand }: {
  payload: unknown;
  onCommand?(command: RolesReactCommand): Promise<{ ok?: boolean; message?: string } | void>;
}) {
  const model = useMemo(() => adaptRoles(payload), [payload]);
  const [selectedId, setSelectedId] = useState(model.roles[0]?.id || "");
  const [draft, setDraft] = useState<RoleMetadataDraft | null>(null);
  const [commandError, setCommandError] = useState("");
  const [saving, setSaving] = useState(false);
  const selected = resolveVisibleRole(model.roles, selectedId);
  const visibleDefaultModules = selected ? model.modules.filter((moduleItem) => roleAllows(selected, moduleItem.id, "view")) : [];
  const openMetadataEditor = () => {
    if (!selected || !model.canEditMetadata) return;
    setDraft({ roleId: selected.id, label: selected.label, description: selected.description, defaultModuleId: selected.defaultModuleId });
    setCommandError("");
  };
  const setDraftField = (field: keyof RoleMetadataDraft, value: string) => setDraft((current) => current ? { ...current, [field]: value } : current);
  const saveMetadata = async () => {
    if (!draft || !onCommand) return;
    setSaving(true);
    setCommandError("");
    try {
      const result = await onCommand({ type: "save-metadata", payload: draft });
      if (result && result.ok === false) setCommandError(result.message || "Изменение паспорта роли отклонено.");
      else setDraft(null);
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : "Изменение паспорта роли отклонено.");
    } finally {
      setSaving(false);
    }
  };
  const header = <ModuleHeader eyebrow="Система · System Domains" title="Роли и доступ" badge={<span className="lab-badge">{model.canEditMetadata ? "React · metadata evaluation" : "React migration lab"}</span>} />;
  const sidebar = (
    <ModuleSidebar label="Роли доступа" title="Роли и доступ">
      {model.roles.map((role) => (
        <SidebarItem
          active={selected?.id === role.id}
          count={role.allowedModuleCount}
          key={role.id}
          label={role.label}
          meta={`${getRoleScopeLabel(role.scope)} · ${role.readOnly ? "read-only" : "операционная"}`}
          onClick={() => { setSelectedId(role.id); setDraft(null); setCommandError(""); }}
        />
      ))}
    </ModuleSidebar>
  );

  return (
    <ModulePage header={header} sidebar={sidebar}>
      <section className="workspace-main">
        {selected ? <>
          <MetricGrid className="structure-metrics" label="Сводка роли доступа">
            <MetricCard label="Доступных модулей" value={selected.allowedModuleCount} />
            <MetricCard label="Явных grants" value={selected.explicitGrantCount} />
            <MetricCard label="Назначений" value={selected.assignedEmployees.length} />
            <MetricCard label="Область" value={getRoleScopeLabel(selected.scope)} />
          </MetricGrid>
          <Panel heading={<div className="panel-heading"><div><h2>Паспорт роли</h2><p>Название, описание и стартовый модуль · без изменения grants, scope и назначений</p></div>{draft ? <ActionButton onClick={() => { setDraft(null); setCommandError(""); }} variant="secondary">Отмена</ActionButton> : <ActionButton disabled={!model.canEditMetadata} onClick={openMetadataEditor} title={model.canEditMetadata ? "Изменить метаданные через access-control" : "Write evaluation выключен"}>Редактировать паспорт</ActionButton>}</div>}>
            {draft ? <form className="react-nomenclature-editor" data-react-role-metadata-form onSubmit={(event) => { event.preventDefault(); void saveMetadata(); }}>
              <label><span>Название роли</span><input name="label" onChange={(event) => setDraftField("label", event.currentTarget.value)} required value={draft.label} /></label>
              <label><span>Описание полномочий</span><input name="description" onChange={(event) => setDraftField("description", event.currentTarget.value)} value={draft.description} /></label>
              <label><span>Стартовый модуль</span><select name="defaultModuleId" onChange={(event) => setDraftField("defaultModuleId", event.currentTarget.value)} value={draft.defaultModuleId}><option value="">Не выбран</option>{visibleDefaultModules.map((moduleItem) => <option key={moduleItem.id} value={moduleItem.id}>{moduleItem.label}</option>)}</select></label>
              {commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}
              <div className="react-nomenclature-editor-actions"><button className="action action--primary" disabled={saving} type="submit">{saving ? "Сохранение…" : "Сохранить паспорт"}</button></div>
            </form> : <div className="ui-inline-statuses"><StatusToken label={selected.label} tone="success" /><StatusToken label={selected.defaultModuleLabel} tone="neutral" /><StatusToken label={getRoleScopeLabel(selected.scope)} tone="neutral" /></div>}
          </Panel>
          <Panel heading={<div className="panel-heading"><div><h2>Матрица grants</h2><p>Шесть исполняемых действий · должность не является ролью</p></div><ActionButton disabled title="Изменение grants остаётся в legacy до миграции команд">Изменить права</ActionButton></div>}>
            <TableWrap><table className="roles-grant-table">
              <thead><tr><th>Модуль</th><th>Группа</th>{ROLE_ACTIONS.map((action) => <th key={action.id}>{action.label}</th>)}</tr></thead>
              <tbody>{model.modules.map((moduleItem) => <tr key={moduleItem.id}>
                <td className="primary-cell">{moduleItem.label}</td><td>{moduleItem.group}</td>
                {ROLE_ACTIONS.map((action) => <td key={action.id}><StatusToken label={roleAllows(selected, moduleItem.id, action.id) ? "да" : "нет"} tone={roleAllows(selected, moduleItem.id, action.id) ? "success" : "neutral"} /></td>)}
              </tr>)}</tbody>
            </table></TableWrap>
          </Panel>
          <Panel heading={<div className="panel-heading"><div><h2>Явные назначения</h2><p>{selected.assignedEmployees.length || "Нет"} сотрудников с этой ролью</p></div></div>}>
            {selected.assignedEmployees.length ? <TableWrap><table className="roles-assignment-table">
              <thead><tr><th>Сотрудник</th><th>Табельный номер</th><th>Должность</th><th>Подразделение</th></tr></thead>
              <tbody>{selected.assignedEmployees.map((employee) => <tr key={employee.id}><td className="primary-cell">{employee.name}</td><td>{employee.personnelNumber}</td><td>{employee.positionLabel}</td><td>{employee.orgUnitLabel}</td></tr>)}</tbody>
            </table></TableWrap> : <EmptyState title="Явных назначений нет" text="Эффективная роль может определяться отдельным точным правилом positionId в legacy-контуре." />}
          </Panel>
        </> : <EmptyState title="Роли пока недоступны" text="Read-only сценарий появится после загрузки канонического System Domains read-model." />}
      </section>
      <DetailPanel
        emptyText="Роль не выбрана"
        eyebrow="Паспорт роли"
        fields={selected ? [
          { label: "Stable ID", value: selected.id },
          { label: "Описание", value: selected.description || "—" },
          { label: "Область", value: getRoleScopeLabel(selected.scope) },
          { label: "Стартовый модуль", value: selected.defaultModuleLabel },
          { label: "Назначенные сотрудники", value: getAssignedEmployeeSummary(selected) },
          { label: "Статус", value: <StatusToken label={selected.active ? selected.readOnly ? "read-only" : "активна" : "архив"} tone={selected.active ? selected.readOnly ? "warning" : "success" : "neutral"} /> },
        ] : []}
        title={selected?.label}
      />
    </ModulePage>
  );
}
