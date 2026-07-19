import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ActionButton, MetricCard, MetricGrid, ModuleHeader, ModulePage, ModuleSidebar, Panel, SidebarItem, StatusToken, TableWrap, SystemState } from "../../ui/components";
import { adaptSpecifications2Payload } from "./adapter";

const dateTime = (value: string) => value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const publicationTone = (state: string): "success" | "warning" | "neutral" => state === "released" ? "success" : state === "changed" ? "warning" : "neutral";

export function Specifications2Scenario({ payload, onRequestLegacy }: { payload: unknown; onRequestLegacy?(scope?: string): void }) {
  const model = useMemo(() => adaptSpecifications2Payload(payload), [payload]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const selected = model.selectedEntry;
  const revision = selected?.serverRevision;
  const visibleRows = useMemo(() => {
    const hiddenDepths: number[] = [];
    return (revision?.treeItems || []).filter((row) => {
      while (hiddenDepths.length && hiddenDepths.at(-1)! >= row.depth) hiddenDepths.pop();
      const hidden = hiddenDepths.length > 0;
      if (collapsed.has(row.id)) hiddenDepths.push(row.depth);
      return !hidden;
    });
  }, [collapsed, revision]);
  const toggle = (id: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return <ModulePage
    header={<ModuleHeader eyebrow="Технологии" title="Спецификации 2.0" badge={<span className="lab-badge">PostgreSQL · read-only React</span>} />}
    sidebar={<ModuleSidebar label="Реестр Спецификаций 2.0" title="Реестр 2.0">
      {model.registry.map((item) => <SidebarItem active={item.selected} count={item.rowCount} key={item.id} label={item.title} meta={<>{item.errorCount ? `Ошибки: ${item.errorCount}` : item.publicationLabel}</>} onClick={() => item.selected ? undefined : onRequestLegacy?.(`select:${item.id}`)} />)}
      <ActionButton onClick={() => onRequestLegacy?.("upload")} variant="secondary">Загрузить XLSX</ActionButton>
    </ModuleSidebar>}
  >
    <section className="workspace-main specifications2-react">
      {!selected || !revision || model.serverStatus !== "ready" ? <Panel heading={<div className="panel-heading"><div><p>Опубликованная ревизия</p><h2>Серверная проекция не готова</h2></div></div>}><SystemState title="Открываем legacy-интерфейс" text={model.serverError || "React-срез доступен только после подтверждения той же опубликованной ревизии и fingerprint в PostgreSQL."} tone="neutral" /></Panel> : <>
        <Panel heading={<div className="panel-heading"><div><p>{revision.designation || "Опубликованная спецификация"}</p><h2>{revision.title}</h2></div><StatusToken label={`Ревизия ${revision.revisionNo}`} tone="success" /></div>}>
          <div className="specifications2-react-summary" data-specifications2-revision={revision.id}>
            <MetricGrid label="Сводка опубликованной ревизии"><MetricCard label="Позиции" value={revision.treeItems.length} /><MetricCard label="Маршруты" value={revision.routes.length} /><MetricCard label="Операции" value={revision.operationCount} /><MetricCard label="Опубликовано" value={dateTime(revision.releasedAt)} /></MetricGrid>
            <div className="specifications2-react-publication"><StatusToken label={selected.publicationLabel} tone={publicationTone(selected.publicationState)} /><span>PostgreSQL подтвердил ревизию {revision.revisionNo} и неизменяемый состав.</span><ActionButton onClick={() => onRequestLegacy?.("edit")} variant="secondary">Редактирование и публикация</ActionButton><ActionButton onClick={() => onRequestLegacy?.("routes")} variant="secondary">Маршруты и нормы</ActionButton></div>
          </div>
        </Panel>
        <Panel heading={<div className="panel-heading"><div><p>PostgreSQL read model</p><h2>Дерево опубликованной ревизии</h2></div><StatusToken label={`${visibleRows.length} из ${revision.treeItems.length}`} tone="neutral" /></div>}>
          <TableWrap><table className="specifications2-react-tree" role="treegrid" aria-label="Опубликованная структура спецификации"><thead><tr><th>Объект</th><th>Тип</th><th>Кол-во</th><th>Ед.</th></tr></thead><tbody>{visibleRows.map((row) => <tr aria-level={row.depth + 1} data-specifications2-tree-row={row.id} key={row.id}><td><div className="specifications2-react-object" style={{ "--tree-depth": row.depth } as CSSProperties}>{row.hasChildren ? <button aria-expanded={!collapsed.has(row.id)} onClick={() => toggle(row.id)} type="button">{collapsed.has(row.id) ? "+" : "−"}</button> : <span aria-hidden="true" />}<strong>{row.designation || row.name}</strong>{row.designation && row.name ? <small>{row.name}</small> : null}</div></td><td>{row.kind}</td><td>{row.quantity.toLocaleString("ru-RU")}</td><td>{row.unit}</td></tr>)}</tbody></table></TableWrap>
        </Panel>
      </>}
    </section>
    <aside className="detail specifications2-react-detail"><p>Паспорт ревизии</p><h2>{revision ? `Ревизия ${revision.revisionNo}` : "Нет ревизии"}</h2>{revision ? <dl><div><dt>Источник</dt><dd>PostgreSQL</dd></div><div><dt>Документ</dt><dd>{revision.specificationId}</dd></div><div><dt>Опубликовано</dt><dd>{dateTime(revision.releasedAt)}</dd></div><div><dt>Исходник обновлён</dt><dd>{dateTime(revision.sourceUpdatedAt)}</dd></div></dl> : null}<ActionButton onClick={() => onRequestLegacy?.("attachments")} variant="secondary">Вложения в legacy</ActionButton></aside>
  </ModulePage>;
}
