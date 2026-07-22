import { useMemo, useState } from "react";
import { ActionButton, DetailPanel, EmptyState, MetricCard, MetricGrid, ModuleHeader, ModulePage, ModuleSidebar, Panel, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { adaptRoles, ROLE_ACTIONS, roleAllows } from "./adapter";
import { canExecuteRolesDeferredCommand, ROLE_RESPONSIBILITY_SCOPE_TYPES, type RoleAssignmentDraft, type RolesDeferredCommand } from "./ports";
import { getAssignedEmployeeSummary, getRoleScopeLabel, resolveVisibleRole } from "./view-model";

interface RoleMetadataDraft {
  roleId: string;
  label: string;
  description: string;
  defaultModuleId: string;
}

export type RolesReactCommand = { type: "save-metadata"; payload: RoleMetadataDraft };
export type RoleGrantCommand = { type: "set-grant"; payload: { roleId: string; moduleId: string; action: typeof ROLE_ACTIONS[number]["id"]; allowed: boolean } };
export type RoleDefaultScopeCommand = { type: "set-default-scope"; payload: { roleId: string; scope: "factory" | "department" | "workCenter" | "self" } };
export type RoleLifecycleCommand = { type: "deactivate-role" | "reactivate-role"; payload: { roleId: string; confirmRoleId: string } };
export type RoleAssignmentCommand = { type: "set-assignment"; payload: { employeeId: string; confirmEmployeeId: string; expectedPreviousRoleId: string; roleId: string } };
export type RolesCommand = RolesReactCommand | RoleGrantCommand | RoleDefaultScopeCommand | RoleLifecycleCommand | RoleAssignmentCommand | RolesDeferredCommand;

interface AdvancedAssignmentDraft extends RoleAssignmentDraft {
  assignmentId: string;
}

const EMPTY_ADVANCED_ASSIGNMENT: AdvancedAssignmentDraft = {
  assignmentId: "",
  employeeId: "",
  roleId: "",
  validFrom: "",
  validTo: "",
  responsibilityScope: { type: "factory", targetId: "" },
};

function responsibilityScopeLabel(scope: RoleAssignmentDraft["responsibilityScope"] | null): string {
  if (!scope) return "—";
  const typeLabel = scope.type === "factory" ? "Фабрика" : scope.type === "department" ? "Отдел" : scope.type === "workCenter" ? "Участок" : "Свои записи";
  return scope.targetId ? `${typeLabel}: ${scope.targetId}` : typeLabel;
}

export function RolesScenario({ payload, onCommand }: {
  payload: unknown;
  onCommand?(command: RolesCommand): Promise<{ ok?: boolean; message?: string } | void>;
}) {
  const model = useMemo(() => adaptRoles(payload), [payload]);
  const [selectedId, setSelectedId] = useState(model.roles[0]?.id || "");
  const [draft, setDraft] = useState<RoleMetadataDraft | null>(null);
  const [commandError, setCommandError] = useState("");
  const [saving, setSaving] = useState(false);
  const [grantSavingKey, setGrantSavingKey] = useState("");
  const [scopeSaving, setScopeSaving] = useState(false);
  const [lifecycleIntent, setLifecycleIntent] = useState<"deactivate" | "reactivate" | "">("");
  const [lifecycleSaving, setLifecycleSaving] = useState(false);
  const [assignmentDraft, setAssignmentDraft] = useState<{ employeeId: string; expectedPreviousRoleId: string; roleId: string } | null>(null);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [advancedAssignmentDraft, setAdvancedAssignmentDraft] = useState<AdvancedAssignmentDraft>(EMPTY_ADVANCED_ASSIGNMENT);
  const [deferredSavingType, setDeferredSavingType] = useState<RolesDeferredCommand["type"] | "">("");
  const selected = resolveVisibleRole(model.roles, selectedId);
  const advancedEmployee = model.employees.find((employee) => employee.id === advancedAssignmentDraft.employeeId);
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
  const setGrant = async (moduleId: string, action: typeof ROLE_ACTIONS[number]["id"], allowed: boolean) => {
    if (!selected || !onCommand || grantSavingKey) return;
    const key = `${selected.id}:${moduleId}:${action}`; setGrantSavingKey(key); setCommandError("");
    try { const result = await onCommand({ type: "set-grant", payload: { roleId: selected.id, moduleId, action, allowed } }); if (result && result.ok === false) setCommandError(result.message || "Изменение grant отклонено."); }
    catch (error) { setCommandError(error instanceof Error ? error.message : "Изменение grant отклонено."); }
    finally { setGrantSavingKey(""); }
  };
  const setDefaultScope = async (scope: RoleDefaultScopeCommand["payload"]["scope"]) => {
    if (!selected || !onCommand || scopeSaving) return;
    setScopeSaving(true); setCommandError("");
    try { const result = await onCommand({ type: "set-default-scope", payload: { roleId: selected.id, scope } }); if (result && result.ok === false) setCommandError(result.message || "Изменение области роли отклонено."); }
    catch (error) { setCommandError(error instanceof Error ? error.message : "Изменение области роли отклонено."); }
    finally { setScopeSaving(false); }
  };
  const commitLifecycle = async () => {
    if (!selected || !onCommand || !lifecycleIntent || lifecycleSaving) return;
    setLifecycleSaving(true); setCommandError("");
    try {
      const result = await onCommand({ type: lifecycleIntent === "reactivate" ? "reactivate-role" : "deactivate-role", payload: { roleId: selected.id, confirmRoleId: selected.id } });
      if (result && result.ok === false) setCommandError(result.message || "Изменение статуса роли отклонено.");
      else setLifecycleIntent("");
    } catch (error) { setCommandError(error instanceof Error ? error.message : "Изменение статуса роли отклонено."); }
    finally { setLifecycleSaving(false); }
  };
  const commitAssignment = async () => {
    if (!assignmentDraft || !onCommand || assignmentSaving) return;
    setAssignmentSaving(true); setCommandError("");
    try {
      const result = await onCommand({ type: "set-assignment", payload: { ...assignmentDraft, confirmEmployeeId: assignmentDraft.employeeId } });
      if (result && result.ok === false) setCommandError(result.message || "Изменение назначения отклонено."); else setAssignmentDraft(null);
    } catch (error) { setCommandError(error instanceof Error ? error.message : "Изменение назначения отклонено."); }
    finally { setAssignmentSaving(false); }
  };
  const chooseAdvancedEmployee = (employeeId: string) => {
    const employee = model.employees.find((item) => item.id === employeeId);
    const assignment = employee?.assignments[0];
    setAdvancedAssignmentDraft({
      assignmentId: assignment?.id || "",
      employeeId,
      roleId: assignment?.roleId || selected?.id || "",
      validFrom: assignment?.validFrom || "",
      validTo: assignment?.validTo || "",
      responsibilityScope: assignment?.responsibilityScope || employee?.subjectResponsibilityScope || { type: "factory", targetId: "" },
    });
    setCommandError("");
  };
  const runDeferredCommand = async (command: RolesDeferredCommand) => {
    if (!onCommand || deferredSavingType || canExecuteRolesDeferredCommand(model.deferredCapabilities, command) !== true) return;
    if ((command.type === "add-assignment" || command.type === "update-assignment-window")
      && command.payload.validFrom && command.payload.validTo && command.payload.validFrom > command.payload.validTo) {
      setCommandError("Дата окончания назначения не может быть раньше даты начала.");
      return;
    }
    setDeferredSavingType(command.type);
    setCommandError("");
    try {
      const result = await onCommand(command);
      if (result && result.ok === false) setCommandError(result.message || "Серверный owner отклонил команду роли.");
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : "Серверный owner отклонил команду роли.");
    } finally {
      setDeferredSavingType("");
    }
  };
  const header = <ModuleHeader eyebrow="Система · System Domains" title="Роли и доступ" badge={<span className="lab-badge">{model.canEditMetadata ? "React · owner writes ready" : "React · только чтение"}</span>} />;
  const sidebar = (
    <ModuleSidebar label="Роли доступа" title="Роли и доступ">
      {model.roles.map((role) => (
        <SidebarItem
          active={selected?.id === role.id}
          count={role.allowedModuleCount}
          key={role.id}
          label={role.label}
          meta={`${getRoleScopeLabel(role.scope)} · ${role.active ? role.readOnly ? "read-only" : "операционная" : "деактивирована"}`}
          onClick={() => { setSelectedId(role.id); setDraft(null); setLifecycleIntent(""); setCommandError(""); }}
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
          <Panel heading={<div className="panel-heading"><div><h2>Паспорт роли</h2><p>Название, описание и стартовый модуль · lifecycle отдельно от обычного сохранения</p></div>{draft ? <ActionButton onClick={() => { setDraft(null); setCommandError(""); }} variant="secondary">Отмена</ActionButton> : <div className="react-nomenclature-editor-actions"><ActionButton disabled={!model.canEditMetadata} onClick={openMetadataEditor} title={model.canEditMetadata ? "Изменить метаданные через access-control" : "Серверная команда или право configure недоступны"}>Редактировать паспорт</ActionButton><ActionButton disabled={!model.canEditLifecycle || (selected.active && selected.assignedEmployees.length > 0)} onClick={() => { setLifecycleIntent(selected.active ? "deactivate" : "reactivate"); setCommandError(""); }} title={selected.active && selected.assignedEmployees.length > 0 ? "Сначала переназначьте сотрудников" : "Отдельная lifecycle-команда access-control"} variant={selected.active ? "danger" : "secondary"}>{selected.active ? "Деактивировать" : "Активировать"}</ActionButton></div>}</div>}>
            {draft ? <form className="react-nomenclature-editor" data-react-role-metadata-form onSubmit={(event) => { event.preventDefault(); void saveMetadata(); }}>
              <label><span>Название роли</span><input name="label" onChange={(event) => setDraftField("label", event.currentTarget.value)} required value={draft.label} /></label>
              <label><span>Описание полномочий</span><input name="description" onChange={(event) => setDraftField("description", event.currentTarget.value)} value={draft.description} /></label>
              <label><span>Стартовый модуль</span><select name="defaultModuleId" onChange={(event) => setDraftField("defaultModuleId", event.currentTarget.value)} value={draft.defaultModuleId}><option value="">Не выбран</option>{visibleDefaultModules.map((moduleItem) => <option key={moduleItem.id} value={moduleItem.id}>{moduleItem.label}</option>)}</select></label>
              {commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}
              <div className="react-nomenclature-editor-actions"><button className="action action--primary" disabled={saving} type="submit">{saving ? "Сохранение…" : "Сохранить паспорт"}</button></div>
            </form> : lifecycleIntent ? <div className="react-nomenclature-delete-confirm" data-react-role-lifecycle-confirm={selected.id} role="alertdialog"><h3>{lifecycleIntent === "deactivate" ? "Деактивировать роль?" : "Активировать роль?"}</h3><p>Подтверждается роль <strong>{selected.label}</strong> со stable ID <code>{selected.id}</code>. Grants и назначения не удаляются.</p>{commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}<div className="react-nomenclature-editor-actions"><ActionButton disabled={lifecycleSaving} onClick={() => { setLifecycleIntent(""); setCommandError(""); }} variant="secondary">Отмена</ActionButton><ActionButton disabled={lifecycleSaving} onClick={() => void commitLifecycle()} variant={lifecycleIntent === "deactivate" ? "danger" : "primary"}>{lifecycleSaving ? "Сохранение…" : lifecycleIntent === "deactivate" ? "Подтвердить деактивацию" : "Подтвердить активацию"}</ActionButton></div></div> : <div className="ui-inline-statuses"><StatusToken label={selected.label} tone={selected.active ? "success" : "neutral"} /><StatusToken label={selected.defaultModuleLabel} tone="neutral" /><label title="Default scope роли; персональные области и области назначения заблокированы до появления серверного owner-контракта"><span className="sr-only">Область роли</span><select data-react-role-default-scope={selected.id} disabled={!model.canEditDefaultScope || scopeSaving} onChange={(event) => void setDefaultScope(event.currentTarget.value as RoleDefaultScopeCommand["payload"]["scope"])} value={selected.scope}><option value="factory">Вся фабрика</option><option value="department">Свой отдел</option><option value="workCenter">Свои участки</option><option value="self">Только свои записи</option></select></label><button className="action action--secondary" data-react-role-read-only-control={selected.id} disabled={model.deferredCapabilities.canEditReadOnlyRole !== true || Boolean(deferredSavingType)} onClick={() => void runDeferredCommand({ type: "set-role-read-only", payload: { roleId: selected.id, confirmRoleId: selected.id, readOnly: !selected.readOnly } })} title={model.deferredCapabilities.canEditReadOnlyRole === true ? "Изменить признак через typed owner-команду" : "Серверный owner признака read-only пока недоступен"} type="button">{selected.readOnly ? "Снять read-only" : "Сделать read-only"}</button></div>}
          </Panel>
          <Panel heading={<div className="panel-heading"><div><h2>Матрица grants</h2><p>Шесть исполняемых действий · должность не является ролью</p></div><StatusToken label={model.canEditGrants ? "PostgreSQL owner ready" : "только чтение"} tone={model.canEditGrants ? "success" : "neutral"} /></div>}>
            {commandError && !draft ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}
            <TableWrap><table className="roles-grant-table">
              <thead><tr><th>Модуль</th><th>Группа</th>{ROLE_ACTIONS.map((action) => <th key={action.id}>{action.label}</th>)}</tr></thead>
              <tbody>{model.modules.map((moduleItem) => <tr key={moduleItem.id}>
                <td className="primary-cell">{moduleItem.label}</td><td>{moduleItem.group}</td>
                {ROLE_ACTIONS.map((action) => { const checked = roleAllows(selected, moduleItem.id, action.id); const dependent = action.id === "view" && ROLE_ACTIONS.some((candidate) => candidate.id !== "view" && roleAllows(selected, moduleItem.id, candidate.id)); const readOnlyBlocked = selected.readOnly && !["view", "print"].includes(action.id); const key = `${selected.id}:${moduleItem.id}:${action.id}`; const disabled = !model.canEditGrants || readOnlyBlocked || (checked && dependent) || Boolean(grantSavingKey); return <td className="access-role-check-cell" key={action.id}><label title={readOnlyBlocked ? "Read-only роль не может получить изменяющее действие" : dependent ? "Сначала отключите зависящие от view действия" : `${selected.label}: ${moduleItem.label} · ${action.label}`}><input checked={checked} data-react-role-grant={key} disabled={disabled} onChange={(event) => void setGrant(moduleItem.id, action.id, event.currentTarget.checked)} type="checkbox" /></label></td>; })}
              </tr>)}</tbody>
            </table></TableWrap>
          </Panel>
          <Panel heading={<div className="panel-heading"><div><h2>Явные назначения</h2><p>{selected.assignedEmployees.length || "Нет"} сотрудников с этой ролью</p></div>{!assignmentDraft ? <ActionButton disabled={!model.canEditAssignments || model.writableEmployeeCount === 0} onClick={() => { const assignedId = selected.assignedEmployees[0]?.id; const option = model.employees.find((item) => item.id === assignedId && !item.assignmentBlockedReason) || model.employees.find((item) => !item.assignmentBlockedReason); if (option) setAssignmentDraft({ employeeId: option.id, expectedPreviousRoleId: option.currentRoleId, roleId: option.currentRoleId }); setCommandError(""); }} title={model.writableEmployeeCount === 0 ? "Все назначения требуют ещё не реализованного серверного owner-контракта" : "Изменить одиночное назначение без периода действия"}>Изменить назначение</ActionButton> : null}</div>}>
            {assignmentDraft ? <div className="react-nomenclature-delete-confirm" data-react-role-assignment-confirm={assignmentDraft.employeeId} role="alertdialog"><label><span>Сотрудник</span><select data-react-role-assignment-employee value={assignmentDraft.employeeId} onChange={(event) => { const option = model.employees.find((item) => item.id === event.currentTarget.value && !item.assignmentBlockedReason); if (option) setAssignmentDraft({ employeeId: option.id, expectedPreviousRoleId: option.currentRoleId, roleId: option.currentRoleId }); }}>{model.employees.map((employee) => <option disabled={Boolean(employee.assignmentBlockedReason)} key={employee.id} title={employee.assignmentBlockedReason} value={employee.id}>{employee.name} · {employee.personnelNumber}{employee.assignmentBlockedReason ? " · заблокировано" : ""}</option>)}</select></label><label><span>Новая явная роль</span><select data-react-role-assignment-role value={assignmentDraft.roleId} onChange={(event) => { const roleId = event.currentTarget.value; setAssignmentDraft((current) => current ? { ...current, roleId } : current); }}><option value="">Снять явное назначение</option>{model.roles.filter((role) => role.active).map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label><p>Подтверждается stable employee ID <code>{assignmentDraft.employeeId}</code>; прежняя роль: <code>{assignmentDraft.expectedPreviousRoleId || "none"}</code>.</p>{commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}<div className="react-nomenclature-editor-actions"><ActionButton disabled={assignmentSaving} onClick={() => { setAssignmentDraft(null); setCommandError(""); }} variant="secondary">Отмена</ActionButton><ActionButton disabled={assignmentSaving || assignmentDraft.roleId === assignmentDraft.expectedPreviousRoleId} onClick={() => void commitAssignment()}>{assignmentSaving ? "Сохранение…" : "Подтвердить назначение"}</ActionButton></div></div> : null}
            {selected.assignedEmployees.length ? <TableWrap><table className="roles-assignment-table">
              <thead><tr><th>Сотрудник</th><th>Табельный номер</th><th>Период</th><th>Scope назначения</th><th>Подразделение</th></tr></thead>
              <tbody>{selected.assignedEmployees.map((employee, index) => <tr key={`${employee.id}:${employee.assignmentId || index}`}><td className="primary-cell">{employee.name}</td><td>{employee.personnelNumber}</td><td>{employee.validFrom || "—"} → {employee.validTo || "—"}</td><td>{responsibilityScopeLabel(employee.responsibilityScope)}</td><td>{employee.orgUnitLabel}</td></tr>)}</tbody>
            </table></TableWrap> : <EmptyState title="Явных назначений нет" text="Эффективная роль может определяться отдельным точным правилом positionId в серверном Access Control." />}
          </Panel>
          <Panel heading={<div className="panel-heading"><div><h2>Расширенные назначения · React prototype</h2><p>Несколько ролей, период действия и scope ответственности; запись включается только точной capability.</p></div><StatusToken label="fail-closed" tone="warning" /></div>}>
            <div className="react-nomenclature-editor" data-react-roles-deferred-controls>
              <label><span>Сотрудник</span><select data-react-role-advanced-employee onChange={(event) => chooseAdvancedEmployee(event.currentTarget.value)} value={advancedAssignmentDraft.employeeId}><option value="">Выберите сотрудника</option>{model.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.personnelNumber}</option>)}</select></label>
              <label><span>Назначение</span><select data-react-role-advanced-assignment disabled={!advancedEmployee?.assignments.length} onChange={(event) => { const assignment = advancedEmployee?.assignments.find((item) => item.id === event.currentTarget.value); if (assignment) setAdvancedAssignmentDraft((current) => ({ ...current, assignmentId: assignment.id, roleId: assignment.roleId, validFrom: assignment.validFrom, validTo: assignment.validTo, responsibilityScope: assignment.responsibilityScope || current.responsibilityScope })); }} value={advancedAssignmentDraft.assignmentId}><option value="">Новое назначение</option>{advancedEmployee?.assignments.map((assignment, index) => <option disabled={!assignment.id} key={assignment.id || index} value={assignment.id}>{model.roles.find((role) => role.id === assignment.roleId)?.label || assignment.roleId}{assignment.id ? "" : " · нет stable ID"}</option>)}</select></label>
              <label><span>Роль</span><select data-react-role-advanced-role onChange={(event) => setAdvancedAssignmentDraft((current) => ({ ...current, roleId: event.currentTarget.value }))} value={advancedAssignmentDraft.roleId}><option value="">Выберите роль</option>{model.roles.filter((role) => role.active).map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>
              <label><span>Действует с</span><input data-react-role-effective-from onChange={(event) => setAdvancedAssignmentDraft((current) => ({ ...current, validFrom: event.currentTarget.value }))} type="date" value={advancedAssignmentDraft.validFrom} /></label>
              <label><span>Действует до</span><input data-react-role-effective-to onChange={(event) => setAdvancedAssignmentDraft((current) => ({ ...current, validTo: event.currentTarget.value }))} type="date" value={advancedAssignmentDraft.validTo} /></label>
              <label><span>Тип scope</span><select data-react-role-responsibility-scope onChange={(event) => setAdvancedAssignmentDraft((current) => ({ ...current, responsibilityScope: { ...current.responsibilityScope, type: event.currentTarget.value as RoleAssignmentDraft["responsibilityScope"]["type"] } }))} value={advancedAssignmentDraft.responsibilityScope.type}>{ROLE_RESPONSIBILITY_SCOPE_TYPES.map((scopeType) => <option key={scopeType} value={scopeType}>{getRoleScopeLabel(scopeType)}</option>)}</select></label>
              <label><span>ID области</span><input data-react-role-responsibility-target onChange={(event) => setAdvancedAssignmentDraft((current) => ({ ...current, responsibilityScope: { ...current.responsibilityScope, targetId: event.currentTarget.value } }))} placeholder="Для фабрики можно не указывать" value={advancedAssignmentDraft.responsibilityScope.targetId} /></label>
              <div className="react-nomenclature-editor-actions">
                <button className="action action--primary" data-react-role-add-assignment disabled={model.deferredCapabilities.canEditMultipleAssignments !== true || !advancedAssignmentDraft.employeeId || !advancedAssignmentDraft.roleId || Boolean(deferredSavingType)} onClick={() => void runDeferredCommand({ type: "add-assignment", payload: { employeeId: advancedAssignmentDraft.employeeId, roleId: advancedAssignmentDraft.roleId, validFrom: advancedAssignmentDraft.validFrom, validTo: advancedAssignmentDraft.validTo, responsibilityScope: advancedAssignmentDraft.responsibilityScope } })} type="button">Добавить назначение</button>
                <button className="action action--secondary" data-react-role-update-effective-window disabled={model.deferredCapabilities.canEditEffectiveWindow !== true || !advancedAssignmentDraft.assignmentId || Boolean(deferredSavingType)} onClick={() => void runDeferredCommand({ type: "update-assignment-window", payload: { assignmentId: advancedAssignmentDraft.assignmentId, employeeId: advancedAssignmentDraft.employeeId, validFrom: advancedAssignmentDraft.validFrom, validTo: advancedAssignmentDraft.validTo } })} type="button">Сохранить период</button>
                <button className="action action--secondary" data-react-role-subject-scope disabled={model.deferredCapabilities.canEditSubjectResponsibilityScope !== true || !advancedAssignmentDraft.employeeId || Boolean(deferredSavingType)} onClick={() => void runDeferredCommand({ type: "set-subject-responsibility-scope", payload: { employeeId: advancedAssignmentDraft.employeeId, responsibilityScope: advancedAssignmentDraft.responsibilityScope } })} type="button">Scope сотрудника</button>
                <button className="action action--secondary" data-react-role-assignment-scope disabled={model.deferredCapabilities.canEditAssignmentResponsibilityScope !== true || !advancedAssignmentDraft.assignmentId || Boolean(deferredSavingType)} onClick={() => void runDeferredCommand({ type: "set-assignment-responsibility-scope", payload: { assignmentId: advancedAssignmentDraft.assignmentId, employeeId: advancedAssignmentDraft.employeeId, responsibilityScope: advancedAssignmentDraft.responsibilityScope } })} type="button">Scope назначения</button>
              </div>
              {commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}
            </div>
          </Panel>
          <Panel heading={<div className="panel-heading"><div><h2>Операции, ожидающие серверный контракт</h2><p>Интерфейс не подменяет их локальным сохранением и не переводит пользователя в другой рендерер.</p></div><StatusToken label={`${model.blockedOperations.length} заблокировано`} tone="warning" /></div>}>
            <TableWrap><table className="roles-blocked-operations-table"><thead><tr><th>Операция</th><th>Причина</th><th>Статус</th></tr></thead><tbody>{model.blockedOperations.map((operation) => <tr key={operation.id}><td className="primary-cell">{operation.label}</td><td>{operation.reason}</td><td><StatusToken label="Заблокировано" tone="warning" /></td></tr>)}</tbody></table></TableWrap>
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
          { label: "Статус", value: <StatusToken label={selected.active ? selected.readOnly ? "read-only" : "активна" : "деактивирована"} tone={selected.active ? selected.readOnly ? "warning" : "success" : "neutral"} /> },
        ] : []}
        title={selected?.label}
      />
    </ModulePage>
  );
}
