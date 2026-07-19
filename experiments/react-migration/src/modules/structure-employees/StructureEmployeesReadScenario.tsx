import { useMemo, useState } from "react";
import { ActionButton, DetailPanel, EmptyState, MetricCard, MetricGrid, ModuleHeader, ModulePage, ModuleSidebar, Panel, SelectableRow, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { formatRecordCount } from "../../ui/format";
import { adaptStructureEmployees } from "./adapter";
import { buildStructureRegistryOptions, resolveVisibleStructureEmployee, STRUCTURE_EMPLOYEE_READ_COLUMNS } from "./view-model";

export function StructureEmployeesReadScenario({ payload, onRequestLegacy }: { payload: unknown; onRequestLegacy?(scope?: string): void }) {
  const model = useMemo(() => adaptStructureEmployees(payload), [payload]);
  const registries = useMemo(() => buildStructureRegistryOptions(model), [model]);
  const [selectedId, setSelectedId] = useState(model.employees[0]?.id ?? "");
  const selected = resolveVisibleStructureEmployee(model.employees, selectedId);
  return <ModulePage header={<ModuleHeader eyebrow="Система · System Domains" title="Сотрудники" badge={<span className="lab-badge">React migration lab</span>} />} sidebar={<ModuleSidebar label="Реестры структуры и сотрудников" title="Структура и сотрудники">{registries.map((registry) => <SidebarItem active={registry.id === "employees"} count={registry.count} key={registry.id} label={registry.label} meta={registry.description} onClick={() => registry.action === "employees" ? undefined : onRequestLegacy?.(registry.id)} />)}</ModuleSidebar>}>
    <section className="workspace-main">
      <MetricGrid className="structure-metrics" label="Сводка структуры и сотрудников"><MetricCard label="Подразделений" value={model.counts.orgUnits} /><MetricCard label="Рабочих центров" value={model.counts.workCenters} /><MetricCard label="Должностей" value={model.counts.positions} /><MetricCard label="Сотрудников" value={model.counts.employees} /><MetricCard label="Оборудования" value={model.counts.equipment} /><MetricCard label="Зон ответственности" value={model.counts.responsibilityPolicies} /></MetricGrid>
      <Panel heading={<div className="panel-heading"><div><h2>Сотрудники</h2><p>{formatRecordCount(model.employees.length)} · stable ID · архивирование без hard delete</p></div><ActionButton disabled title="Команды проверяются только в production-shell QA">Новая запись</ActionButton></div>}>
        {model.employees.length ? <TableWrap><table><thead><tr>{STRUCTURE_EMPLOYEE_READ_COLUMNS.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{model.employees.map((employee) => <SelectableRow key={employee.id} onSelect={() => setSelectedId(employee.id)} selected={selected?.id === employee.id}><td className="primary-cell"><span className="primary-copy"><strong>{employee.displayName}</strong><small>{employee.id}</small></span></td><td>{employee.personnelNumber}</td><td>{employee.employmentLabel}</td><td><StatusToken label={employee.statusLabel} tone={employee.statusTone} /></td></SelectableRow>)}</tbody></table></TableWrap> : <EmptyState title="Сотрудников пока нет" text="Записи появятся после загрузки канонического System Domains read-model." />}
      </Panel>
    </section>
    <DetailPanel emptyText="Сотрудник не выбран" eyebrow="Основное назначение" fields={selected ? [{ label: "Полное ФИО", value: selected.fullName }, { label: "Stable ID", value: selected.id }, { label: "Табельный номер", value: selected.personnelNumber }, { label: "Должность", value: selected.positionLabel }, { label: "Подразделение", value: selected.orgUnitLabel }, { label: "Рабочий центр", value: selected.workCenterLabel }, { label: "Назначение действует", value: `${selected.validFrom} — ${selected.validTo}` }, { label: "Статус", value: <StatusToken label={selected.statusLabel} tone={selected.statusTone} /> }] : []} title={selected?.displayName} />
  </ModulePage>;
}
