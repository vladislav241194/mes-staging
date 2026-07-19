import { useMemo, useState } from "react";
import { ActionButton, DetailPanel, EmptyState, MetricCard, MetricGrid, ModuleHeader, ModulePage, ModuleSidebar, Panel, SelectableRow, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { formatRecordCount } from "../../ui/format";
import { adaptStructureEmployees, type StructureEmployee } from "./adapter";
import { buildStructureRegistryOptions, resolveVisibleStructureEmployee, STRUCTURE_EMPLOYEE_READ_COLUMNS } from "./view-model";

export interface StructureEmployeeDraft {
  isNew: boolean;
  employeeId: string;
  displayName: string;
  personnelNumber: string;
  positionId: string;
  orgUnitId: string;
  workCenterId: string;
  validFrom: string;
  validTo: string;
  isActive: boolean;
}

export type StructureEmployeesReactCommand = { type: "save"; payload: StructureEmployeeDraft } | { type: "archive"; payload: { employeeId: string } };

const draftValue = (value: string) => value === "—" ? "" : value;
const createEmployeeDraft = (employee?: StructureEmployee): StructureEmployeeDraft => ({
  isNew: !employee,
  employeeId: employee?.id || "",
  displayName: employee?.fullName || "",
  personnelNumber: draftValue(employee?.personnelNumber || ""),
  positionId: employee?.positionId || "",
  orgUnitId: employee?.orgUnitId || "",
  workCenterId: employee?.workCenterId || "",
  validFrom: draftValue(employee?.validFrom || ""),
  validTo: draftValue(employee?.validTo || ""),
  isActive: employee?.isActive ?? true,
});

export function StructureEmployeesScenario({ payload, onCommand, onRequestLegacy }: {
  payload: unknown;
  onCommand?(command: StructureEmployeesReactCommand): Promise<{ ok?: boolean; id?: string; message?: string } | void>;
  onRequestLegacy?(scope?: string): void;
}) {
  const model = useMemo(() => adaptStructureEmployees(payload), [payload]);
  const registries = useMemo(() => buildStructureRegistryOptions(model), [model]);
  const [selectedId, setSelectedId] = useState(model.employees[0]?.id ?? "");
  const [draft, setDraft] = useState<StructureEmployeeDraft | null>(null);
  const [commandError, setCommandError] = useState("");
  const [saving, setSaving] = useState(false);
  const [archiveArmedId, setArchiveArmedId] = useState("");
  const selected = resolveVisibleStructureEmployee(model.employees, selectedId);
  const setDraftField = <K extends keyof StructureEmployeeDraft>(field: K, value: StructureEmployeeDraft[K]) => setDraft((current) => current ? { ...current, [field]: value } : current);
  const saveDraft = async () => {
    if (!draft || !onCommand) return;
    setSaving(true);
    setCommandError("");
    try {
      const result = await onCommand({ type: "save", payload: draft });
      if (result && result.ok === false) setCommandError(result.message || "Не удалось сохранить сотрудника.");
      else if (result?.id) setSelectedId(result.id);
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : "Не удалось сохранить сотрудника.");
    } finally {
      setSaving(false);
    }
  };
  const archiveSelected = async () => {
    if (!selected || !onCommand || archiveArmedId !== selected.id) return;
    setSaving(true); setCommandError("");
    try {
      const result = await onCommand({ type: "archive", payload: { employeeId: selected.id } });
      if (result && result.ok === false) setCommandError(result.message || "Не удалось архивировать сотрудника.");
      else setArchiveArmedId("");
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : "Не удалось архивировать сотрудника.");
    } finally { setSaving(false); }
  };

  const header = <ModuleHeader eyebrow="Система · System Domains" title="Сотрудники" badge={<span className="lab-badge">{model.canCreateEdit ? "React · PostgreSQL create/edit/archive evaluation" : "React preview · только чтение"}</span>} />;
  const sidebar = (
    <ModuleSidebar label="Реестры структуры и сотрудников" title="Структура и сотрудники">
      {registries.map((registry) => (
        <SidebarItem
          active={registry.id === "employees"}
          count={registry.count}
          key={registry.id}
          label={registry.label}
          meta={registry.description}
          onClick={() => registry.action === "employees" ? undefined : onRequestLegacy?.(registry.id)}
        />
      ))}
    </ModuleSidebar>
  );

  return (
    <ModulePage header={header} sidebar={sidebar}>
      <section className="workspace-main">
        <MetricGrid className="structure-metrics" label="Сводка структуры и сотрудников">
          <MetricCard label="Подразделений" value={model.counts.orgUnits} />
          <MetricCard label="Рабочих центров" value={model.counts.workCenters} />
          <MetricCard label="Должностей" value={model.counts.positions} />
          <MetricCard label="Сотрудников" value={model.counts.employees} />
          <MetricCard label="Оборудования" value={model.counts.equipment} />
          <MetricCard label="Зон ответственности" value={model.counts.responsibilityPolicies} />
        </MetricGrid>
        <Panel heading={<div className="panel-heading"><div><h2>Сотрудники</h2><p>{formatRecordCount(model.employees.length)} · stable ID · архивирование без hard delete</p></div><ActionButton disabled={!model.canCreateEdit} onClick={() => setDraft(createEmployeeDraft())} title={model.canCreateEdit ? "Создать сотрудника и основное назначение" : "Write evaluation выключен или PostgreSQL-команда недоступна"}>Новая запись</ActionButton></div>}>
          {model.employees.length ? <TableWrap><table>
            <thead><tr>{STRUCTURE_EMPLOYEE_READ_COLUMNS.map((column) => <th key={column}>{column}</th>)}</tr></thead>
            <tbody>{model.employees.map((employee) => (
              <SelectableRow key={employee.id} onSelect={() => setSelectedId(employee.id)} selected={selected?.id === employee.id}>
                <td className="primary-cell"><span className="primary-copy"><strong>{employee.displayName}</strong><small>{employee.id}</small></span></td>
                <td>{employee.personnelNumber}</td><td>{employee.employmentLabel}</td><td><StatusToken label={employee.statusLabel} tone={employee.statusTone} /></td>
              </SelectableRow>
            ))}</tbody>
          </table></TableWrap> : <EmptyState title="Сотрудников пока нет" text="Записи появятся после загрузки канонического System Domains read-model." />}
        </Panel>
      </section>

      {draft ? <Panel heading={<div className="panel-heading"><div><h2>{draft.isNew ? "Новый сотрудник" : "Редактирование сотрудника"}</h2><p>Сотрудник и основное назначение сохраняются одной PostgreSQL-командой</p></div><ActionButton onClick={() => { setDraft(null); setCommandError(""); }} variant="secondary">Отмена</ActionButton></div>}>
        <form className="react-nomenclature-editor" onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
          <label className="full"><span>ФИО</span><input name="displayName" onChange={(event) => setDraftField("displayName", event.currentTarget.value)} required value={draft.displayName} /></label>
          <label><span>Табельный номер</span><input name="personnelNumber" onChange={(event) => setDraftField("personnelNumber", event.currentTarget.value)} value={draft.personnelNumber} /></label>
          <label><span>Статус · меняется отдельной lifecycle-командой</span><select disabled name="isActive" value={String(draft.isActive)}><option value="true">Активно</option><option value="false">В архиве</option></select></label>
          <label><span>Должность</span><select name="positionId" onChange={(event) => setDraftField("positionId", event.currentTarget.value)} required value={draft.positionId}><option value="">Не выбрано</option>{model.positions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          <label><span>Подразделение</span><select name="orgUnitId" onChange={(event) => setDraftField("orgUnitId", event.currentTarget.value)} required value={draft.orgUnitId}><option value="">Не выбрано</option>{model.orgUnits.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          <label><span>Рабочий центр</span><select name="workCenterId" onChange={(event) => setDraftField("workCenterId", event.currentTarget.value)} value={draft.workCenterId}><option value="">Не выбран</option>{model.workCenters.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          <label><span>Назначение действует с</span><input name="validFrom" onChange={(event) => setDraftField("validFrom", event.currentTarget.value)} type="date" value={draft.validFrom} /></label>
          <label><span>Назначение действует до</span><input name="validTo" onChange={(event) => setDraftField("validTo", event.currentTarget.value)} type="date" value={draft.validTo} /></label>
          {commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}
          <div className="react-nomenclature-editor-actions"><button className="action action--primary" disabled={saving} type="submit">{saving ? "Сохранение…" : draft.isNew ? "Создать сотрудника" : "Сохранить сотрудника"}</button></div>
        </form>
      </Panel> : <><DetailPanel
        emptyText="Сотрудник не выбран"
        eyebrow="Основное назначение"
        fields={selected ? [
          { label: "Полное ФИО", value: selected.fullName },
          { label: "Stable ID", value: selected.id },
          { label: "Табельный номер", value: selected.personnelNumber },
          { label: "Должность", value: selected.positionLabel },
          { label: "Подразделение", value: selected.orgUnitLabel },
          { label: "Рабочий центр", value: selected.workCenterLabel },
          { label: "Назначение действует", value: `${selected.validFrom} — ${selected.validTo}` },
          { label: "Статус", value: <StatusToken label={selected.statusLabel} tone={selected.statusTone} /> },
        ] : []}
        title={selected?.displayName}
      />{selected && model.canCreateEdit ? <div className="react-nomenclature-detail-actions"><ActionButton onClick={() => { setArchiveArmedId(""); setDraft(createEmployeeDraft(selected)); }} variant="secondary">Редактировать сотрудника</ActionButton>{selected.isActive && model.canArchive ? <ActionButton disabled={saving} onClick={() => archiveArmedId === selected.id ? void archiveSelected() : setArchiveArmedId(selected.id)} variant="secondary">{archiveArmedId === selected.id ? "Подтвердить архивирование" : "Архивировать"}</ActionButton> : null}{archiveArmedId === selected.id ? <ActionButton onClick={() => setArchiveArmedId("")} variant="secondary">Отмена</ActionButton> : null}</div> : null}{commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}</>}
    </ModulePage>
  );
}
