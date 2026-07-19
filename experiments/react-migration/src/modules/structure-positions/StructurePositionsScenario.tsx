import { useMemo, useState } from "react";
import { ActionButton, DetailPanel, EmptyState, MetricCard, MetricGrid, ModuleHeader, ModulePage, ModuleSidebar, Panel, SelectableRow, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { formatRecordCount } from "../../ui/format";
import { adaptStructurePositions } from "./adapter";
import { buildPositionRegistryOptions, resolveVisiblePosition, STRUCTURE_POSITION_READ_COLUMNS } from "./view-model";

export function StructurePositionsScenario({ payload, onRequestLegacy }: { payload: unknown; onRequestLegacy?(scope?: string): void }) {
  const model = useMemo(() => adaptStructurePositions(payload), [payload]);
  const registries = useMemo(() => buildPositionRegistryOptions(model), [model]);
  const [selectedId, setSelectedId] = useState(model.positions[0]?.id || "");
  const selected = resolveVisiblePosition(model.positions, selectedId);
  return <ModulePage header={<ModuleHeader eyebrow="Система · System Domains" title="Должности" badge={<span className="lab-badge">React preview · только чтение</span>} />} sidebar={<ModuleSidebar label="Реестры структуры и сотрудников" title="Структура и сотрудники">{registries.map((registry) => <SidebarItem active={registry.id === "positions"} count={registry.count} key={registry.id} label={registry.label} meta={registry.description} onClick={() => registry.action === "positions" ? undefined : onRequestLegacy?.(registry.id)} />)}</ModuleSidebar>}>
    <section className="workspace-main">
      <MetricGrid className="structure-metrics" label="Сводка структуры и сотрудников"><MetricCard label="Подразделений" value={model.counts.orgUnits} /><MetricCard label="Рабочих центров" value={model.counts.workCenters} /><MetricCard label="Должностей" value={model.counts.positions} /><MetricCard label="Сотрудников" value={model.counts.employees} /><MetricCard label="Оборудования" value={model.counts.equipment} /><MetricCard label="Зон ответственности" value={model.counts.responsibilityPolicies} /></MetricGrid>
      <Panel heading={<div className="panel-heading"><div><h2>Должности</h2><p>{formatRecordCount(model.positions.length)} · stable ID · архивирование без hard delete</p></div><ActionButton disabled title="Создание и архивирование остаются в legacy до миграции команд">Новая запись</ActionButton></div>}>
        {model.positions.length ? <TableWrap><table><thead><tr>{STRUCTURE_POSITION_READ_COLUMNS.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{model.positions.map((position) => <SelectableRow key={position.id} onSelect={() => setSelectedId(position.id)} selected={selected?.id === position.id}><td className="primary-cell"><span className="primary-copy"><strong>{position.name}</strong><small>{position.id}</small></span></td><td>{position.kindLabel}</td><td>{position.orgUnitLabel}</td><td>{position.workCenterLabel}</td><td><StatusToken label={position.statusLabel} tone={position.statusTone} /></td></SelectableRow>)}</tbody></table></TableWrap> : <EmptyState title="Должностей пока нет" text="Записи появятся после загрузки канонического System Domains read-model." />}
      </Panel>
    </section>
    <DetailPanel emptyText="Должность не выбрана" eyebrow="Паспорт должности" fields={selected ? [{ label: "Stable ID", value: selected.id }, { label: "Код", value: selected.code }, { label: "Категория", value: selected.kindLabel }, { label: "Подразделение", value: selected.orgUnitLabel }, { label: "Рабочий центр", value: selected.workCenterLabel }, { label: "Базовый график", value: selected.scheduleTemplateLabel }, { label: "Статус", value: <StatusToken label={selected.statusLabel} tone={selected.statusTone} /> }] : []} title={selected?.name} />
  </ModulePage>;
}
