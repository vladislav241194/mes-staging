import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActionButton, MetricCard, MetricGrid, OperationalPage, Panel, StatusToken, TableWrap } from "../../ui/components";
import { adaptShiftWorkOrders, adaptWorkOrderPrintPackage, type ShiftWorkOrderDocumentGroup, type ShiftWorkOrderOperationGroup, type ShiftWorkOrderRow, type WorkOrderPrintPackage } from "./adapter";
import type * as ShiftWorkOrderFactEditorModule from "./ShiftWorkOrderFactEditor";
import type { ShiftWorkOrdersCommand } from "./ShiftWorkOrderFactEditor";
import type * as ShiftWorkOrderPrintRenderer from "./ShiftWorkOrderPrintPreviews";

export type { ShiftWorkOrdersCommand } from "./ShiftWorkOrderFactEditor";
export type ShiftWorkOrdersReactNavigation = { type: "open-workshop"; journalRowId: string; sourceRowId: string; shiftDateKey: string; intent: "inspect" | "assign" | "fact" };

const quantity = (value: number, unit = "") => `${value.toLocaleString("ru-RU")}${unit ? ` ${unit}` : ""}`;
const operationStatus = (operation: ShiftWorkOrderOperationGroup) => operation.plannedQuantity > 0 && operation.factQuantity >= operation.plannedQuantity ? "закрыта" : operation.plannedQuantity > 0 && operation.assignedQuantity >= operation.plannedQuantity ? "распределена" : operation.assignedQuantity > 0 ? "частично" : "план";
const workshopNavigationError = "Не удалось открыть исходную задачу Мастерской.";
export function ShiftWorkOrdersScenario({ payload, onCommand, onLoadAssignmentContext, onLoadFactEditor, onLoadPrintPackage, onLoadPrintRenderer, onNavigate, onPrintDocument }: { payload: unknown; onCommand?(command: ShiftWorkOrdersCommand): Promise<{ ok?: boolean; message?: string } | void>; onLoadAssignmentContext?(rowId: string): Promise<unknown>; onLoadFactEditor?(): Promise<typeof ShiftWorkOrderFactEditorModule>; onLoadPrintPackage?(rowId: string): Promise<unknown>; onLoadPrintRenderer?(): Promise<typeof ShiftWorkOrderPrintRenderer>; onNavigate?(navigation: ShiftWorkOrdersReactNavigation): Promise<{ ok?: boolean; message?: string } | void>; onPrintDocument?(title: string): void }) {
  const model = useMemo(() => adaptShiftWorkOrders(payload), [payload]);
  const [selectedId, setSelectedId] = useState(model.selectedRow?.id || "");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [activePhotoId, setActivePhotoId] = useState("");
  const [printPreview, setPrintPreview] = useState<{ type: "shift"; row: ShiftWorkOrderRow } | { type: "package"; model: WorkOrderPrintPackage } | null>(null);
  const [printRenderer, setPrintRenderer] = useState<typeof ShiftWorkOrderPrintRenderer | null>(null);
  const [printError, setPrintError] = useState("");
  const [printLoading, setPrintLoading] = useState(false);
  const [factOpen, setFactOpen] = useState(false);
  const [factLoading, setFactLoading] = useState(false);
  const [factLoadError, setFactLoadError] = useState("");
  const [FactEditor, setFactEditor] = useState<ReturnType<typeof ShiftWorkOrderFactEditorModule.createShiftWorkOrderFactEditor> | null>(null);
  const [assignmentOpen, setAssignmentOpen] = useState(false); const [assignmentLoading, setAssignmentLoading] = useState(false); const [assignmentContext, setAssignmentContext] = useState<unknown>(null);
  const [AssignmentEditor, setAssignmentEditor] = useState<ReturnType<typeof ShiftWorkOrderFactEditorModule.createShiftWorkOrderAssignmentEditor> | null>(null);
  useEffect(() => { if (!model.rows.some((row) => row.id === selectedId)) setSelectedId(model.selectedRow?.id || ""); }, [model, selectedId]);
  const selected = model.rows.find((row) => row.id === selectedId) || model.selectedRow;
  const photoReports = selected?.issueReports.filter((report) => Boolean(report.photoUrl)) || [];
  const activePhotoIndex = Math.max(0, photoReports.findIndex((report) => report.photoId === activePhotoId));
  const activePhoto = activePhotoId ? photoReports[activePhotoIndex] || null : null;
  const openWorkshop = async (intent: ShiftWorkOrdersReactNavigation["intent"]) => {
    if (!selected || !onNavigate || !selected.sourceRowId) { setFactLoadError("Исходная задача Мастерской недоступна."); return; }
    setFactLoadError("");
    const result = await onNavigate({ type: "open-workshop", journalRowId: selected.id, sourceRowId: selected.sourceRowId, shiftDateKey: selected.shiftDateKey, intent }).catch((error: unknown) => ({ ok: false, message: error instanceof Error ? error.message : workshopNavigationError }));
    if (result?.ok === false) setFactLoadError(result.message || workshopNavigationError);
  };
  useEffect(() => { if (activePhotoId && !photoReports.some((report) => report.photoId === activePhotoId)) setActivePhotoId(""); }, [activePhotoId, photoReports]);
  useEffect(() => {
    if (!activePhoto && !printPreview) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setActivePhotoId(""); setPrintPreview(null); } };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activePhoto, printPreview]);
  const navigatePhoto = (delta: number) => {
    if (photoReports.length < 2) return;
    setActivePhotoId(photoReports[(activePhotoIndex + delta + photoReports.length) % photoReports.length].photoId);
  };
  const loadRenderer = async () => { const renderer = printRenderer || await onLoadPrintRenderer?.(); if (!renderer?.ShiftWorkOrderPrintPreview || !renderer.WorkOrderPackagePrintPreview) throw new Error("Печатное представление недоступно."); if (!printRenderer) setPrintRenderer(renderer); return renderer; };
  const openShiftPrint = async () => {
    if (!selected || printLoading) return;
    setPrintLoading(true); setPrintError("");
    try { await loadRenderer(); setPrintPreview({ type: "shift", row: selected }); }
    catch (error) { setPrintError(error instanceof Error ? error.message : "Печатная форма недоступна."); }
    finally { setPrintLoading(false); }
  };
  const openPackage = async () => {
    if (!selected || !onLoadPrintPackage || printLoading) return;
    setPrintLoading(true); setPrintError("");
    try { const [, source] = await Promise.all([loadRenderer(), onLoadPrintPackage(selected.id)]); const model = adaptWorkOrderPrintPackage(source); if (!model.canActivate) throw new Error("Печатный пакет заказ-наряда не сформирован."); setPrintPreview({ type: "package", model }); }
    catch (error) { setPrintError(error instanceof Error ? error.message : "Печатный пакет недоступен."); }
    finally { setPrintLoading(false); }
  };
  const openFact = async () => {
    if (!selected) return;
    if (!model.canSaveFact || !selected.factEditable || !onCommand || !onLoadFactEditor) { await openWorkshop("fact"); return; }
    if (factLoading) return;
    setFactLoading(true); setFactLoadError("");
    try {
      if (!FactEditor) { const editor = await onLoadFactEditor(); if (!editor?.createShiftWorkOrderFactEditor) throw new Error("Редактор факта недоступен."); setFactEditor(() => editor.createShiftWorkOrderFactEditor(useState, useEffect, useRef)); }
      setFactOpen(true);
    } catch (error) {
      setFactLoadError(error instanceof Error ? error.message : "Редактор факта недоступен.");
    } finally {
      setFactLoading(false);
    }
  };
  const openAssignment = async () => {
    if (!selected) return;
    if (!model.canSaveAssignment || !onCommand || !onLoadAssignmentContext || !onLoadFactEditor) { await openWorkshop("assign"); return; }
    if (assignmentLoading) return; setAssignmentLoading(true); setFactLoadError("");
    try { const [editor, context] = await Promise.all([onLoadFactEditor(), onLoadAssignmentContext(selected.id)]); if (!editor?.createShiftWorkOrderAssignmentEditor || !context) throw new Error("Редактор распределения недоступен."); if (!AssignmentEditor) setAssignmentEditor(() => editor.createShiftWorkOrderAssignmentEditor(useState, useEffect, useRef)); setAssignmentContext(context); setAssignmentOpen(true); }
    catch (error) { setFactLoadError(error instanceof Error ? error.message : "Редактор распределения недоступен."); }
    finally { setAssignmentLoading(false); }
  };
  const toggle = (id: string) => setCollapsed((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  if (!model.canActivate) return <OperationalPage label="Журнал сменных заданий"><div className="empty-state"><strong>Сменные задания не найдены</strong><p>React подключается только к завершённой read-модели журнала.</p></div></OperationalPage>;
  const cells = (planned: number, assigned: number, fact: number, remaining: number, unit: string, status: ReactNode, latest: string) => <><td>{quantity(planned, unit)}</td><td>{quantity(assigned)}</td><td>{quantity(fact)}</td><td>{quantity(remaining)}</td><td>{status}</td><td>{latest}</td></>;
  const documentRow = (document: ShiftWorkOrderDocumentGroup) => <tr className="shift-work-orders-tree-parent" data-shift-work-order-package-row={document.id} key={`document:${document.id}`} onClick={() => toggle(`document:${document.id}`)} tabIndex={0}><td><strong>{collapsed.has(`document:${document.id}`) ? "▸" : "▾"} {document.label}</strong><small>печатный пакет заказ-наряда</small></td><td><strong>{document.operations.length} операций</strong><small>{document.rows.length} заданий · {document.meta}</small></td>{cells(document.plannedQuantity, document.assignedQuantity, document.factQuantity, document.remainingQuantity, document.unit, "заказ-наряд", document.latestLabel)}</tr>;
  const operationRow = (document: ShiftWorkOrderDocumentGroup, operation: ShiftWorkOrderOperationGroup) => <tr className="shift-work-orders-tree-operation" data-shift-work-order-operation-row={operation.id} key={`operation:${document.id}:${operation.id}`} onClick={() => toggle(`operation:${document.id}:${operation.id}`)} tabIndex={0}><td><strong>↳ {collapsed.has(`operation:${document.id}:${operation.id}`) ? "▸" : "▾"} {operation.operationName}</strong><small>операция · {operation.rows.length} заданий</small></td><td><strong>{operation.workCenterLabel}</strong><small>{operation.routePartLabel}</small></td>{cells(operation.plannedQuantity, operation.assignedQuantity, operation.factQuantity, operation.remainingQuantity, operation.unit, operationStatus(operation), operation.latestLabel)}</tr>;
  const assignmentRow = (document: ShiftWorkOrderDocumentGroup, operation: ShiftWorkOrderOperationGroup, row: ShiftWorkOrderRow) => <tr className={`shift-work-orders-tree-child${row.id === selected?.id ? " is-selected is-active" : ""}`} data-shift-work-order-row={row.id} key={`row:${row.id}`} onClick={() => setSelectedId(row.id)} tabIndex={0}><td><strong>↳↳ {row.documentNumber}</strong><small>{row.stageLabel}</small></td><td><strong>{row.executors.map((executor) => executor.name).join(", ") || row.masterName}</strong><small>{row.shiftDateKey || row.dateLabel}</small></td>{cells(row.plannedQuantity, row.assignedQuantity, row.factQuantity, row.remainingQuantity, row.unit, <StatusToken label={row.status.label} tone={row.status.tone} />, row.dateLabel)}</tr>;
  const treeRows = model.documents.flatMap((document) => {
    const rows: ReactNode[] = [documentRow(document)];
    if (collapsed.has(`document:${document.id}`)) return rows;
    document.operations.forEach((operation) => {
      rows.push(operationRow(document, operation));
      if (!collapsed.has(`operation:${document.id}:${operation.id}`)) rows.push(...operation.rows.map((row) => assignmentRow(document, operation, row)));
    });
    return rows;
  });
  return <OperationalPage className="shift-work-orders-page" label="Журнал сменных заданий"><section className="shift-work-orders-main-grid">
    <Panel heading={<div className="panel-heading"><div><h2>Дерево документов</h2><p>{model.documents.length} заказ-нарядов · {model.operationCount} операций · {model.rows.length} заданий · окно {model.sourceWindowLabel}</p></div></div>}><TableWrap><table className="directory-table shift-work-orders-table ui-table ui-document-tree-table"><thead><tr><th>Документы</th><th>Состав</th><th>План</th><th>Распр.</th><th>Факт</th><th>Ост.</th><th>Статус</th><th>Обновлено</th></tr></thead><tbody>{treeRows}</tbody></table></TableWrap></Panel>
    {selected ? <Panel heading={<div className="panel-heading"><div><p>Сменное задание</p><h2>{selected.documentNumber}</h2></div><div><ActionButton disabled={assignmentLoading} onClick={() => void openAssignment()}>{assignmentLoading ? "Загрузка…" : "Распределить"}</ActionButton>{" "}<ActionButton disabled={factLoading} onClick={() => void openFact()}>{factLoading ? "Загрузка…" : selected.hasFact ? "Скорректировать факт" : "Внести факт"}</ActionButton>{" "}<ActionButton disabled={!onLoadPrintRenderer || printLoading} onClick={() => void openShiftPrint()}>{printLoading ? "Загрузка…" : "Печать СЗН"}</ActionButton>{" "}<ActionButton disabled={!onLoadPrintPackage || !onLoadPrintRenderer || printLoading} onClick={() => void openPackage()} variant="secondary">{printLoading ? "Загрузка…" : "Пакет ЗН"}</ActionButton>{" "}<ActionButton onClick={() => void openWorkshop("inspect")} variant="secondary">Мастерская</ActionButton></div></div>}>
      {factLoadError ? <p className="react-nomenclature-command-error" role="alert">{factLoadError}</p> : null}
      {printError ? <p className="react-nomenclature-command-error" role="alert">{printError}</p> : null}
      <section className="shift-work-orders-issue-list" data-visual-qa-target="shift-work-orders-issue-reports"><header><strong>Проблемы / Report</strong><span>{selected.issueReportCount} записей · {selected.issuePhotoCount} фото</span></header>{selected.issueReports.length ? selected.issueReports.map((report) => <article className="shift-work-orders-issue-card" key={report.id}><button aria-label={report.photoUrl ? `Открыть фото ${report.photoName}` : "Фото не приложено"} className={`shift-work-orders-issue-photo ${report.photoUrl ? "has-photo" : "is-empty"}`} disabled={!report.photoUrl} onClick={() => setActivePhotoId(report.photoId)} type="button">{report.photoUrl ? <img alt={report.photoName} src={report.photoUrl} /> : "!"}</button><div className="shift-work-orders-issue-copy"><header><strong>{report.employeeName}</strong><span>{report.createdAt}</span></header><p>{report.text}</p><small>{[report.operationName, report.workCenterLabel, report.photoName ? `фото: ${report.photoName}` : ""].filter(Boolean).join(" · ")}</small>{report.storageNote ? <small>{report.storageNote}</small> : null}</div></article>) : <p className="shift-work-orders-issue-empty">Проблемы по этому СЗН не зафиксированы.</p>}</section>
      <MetricGrid className="shift-work-orders-detail-summary" label="Паспорт сменного задания"><MetricCard label="Заказ-наряд" value={selected.orderLabel} meta={selected.routePartLabel} /><MetricCard label="Операция" value={selected.operationName} meta={selected.workCenterLabel} /><MetricCard label="Мастер" value={selected.masterName} meta={selected.resourceLabel || selected.workCenterLabel} /></MetricGrid>
      <MetricGrid className="shift-work-orders-detail-volume-grid" label="Объёмы сменного задания"><MetricCard label="Распределено" value={quantity(selected.assignedQuantity, selected.unit)} /><MetricCard label="Факт" value={quantity(selected.factQuantity, selected.unit)} meta={selected.status.id === "closed" || selected.status.id === "carryover" ? "внесен с рабочего стола" : "ожидает рабочего стола"} /><MetricCard label="Остаток" value={quantity(selected.remainingQuantity, selected.unit)} /><MetricCard label="Брак" value={quantity(selected.defectQuantity, selected.unit)} /><MetricCard label="Report" value={`${selected.issueReportCount} проблем`} meta={`${selected.issuePhotoCount} фото`} /></MetricGrid>
      <section className="shift-work-orders-transfer"><article><span>До</span><strong>{selected.transfer.fromOperationName}</strong><small>{selected.transfer.fromWorkCenterLabel}</small></article><span aria-hidden="true" className="shift-work-orders-transfer-link" /><article className="is-current"><span>Сейчас</span><strong>{selected.operationName}</strong><small>{selected.workCenterLabel} · текущий шаг</small></article><span aria-hidden="true" className="shift-work-orders-transfer-link" /><article><span>После</span><strong>{selected.transfer.toOperationName}</strong><small>{selected.transfer.toWorkCenterLabel}</small></article></section>
      <section className="shift-work-orders-executors"><header><strong>Исполнители</strong><span>{selected.executors.length} назначений</span></header>{selected.executors.map((executor) => <article key={executor.id}><strong>{executor.name}</strong><span>{quantity(executor.quantity, selected.unit)}</span></article>)}</section>
    </Panel> : null}
  </section>{assignmentOpen && AssignmentEditor && assignmentContext && onCommand ? <AssignmentEditor context={assignmentContext} key={`${selected?.id}:${selected?.assignedQuantity}`} onClose={() => setAssignmentOpen(false)} onCommand={onCommand} /> : null}{factOpen && selected && FactEditor && onCommand ? <FactEditor key={`${selected.id}:${selected.actualQuantity}:${selected.defectQuantity}`} onClose={() => setFactOpen(false)} onCommand={onCommand} row={selected} /> : null}{activePhoto ? <div className="modal-backdrop shift-work-orders-photo-backdrop" data-react-shift-work-order-photo-viewer><section aria-label="Фото report" aria-modal="true" className="modal ui-modal large-modal shift-work-orders-photo-modal" data-ui-component="Modal" data-ui-size="large" role="dialog"><header className="modal-header"><div><span className="eyebrow">Report · {activePhotoIndex + 1} из {photoReports.length}</span><h2>{activePhoto.photoName}</h2></div><button aria-label="Закрыть" className="action action--secondary" onClick={() => setActivePhotoId("")} type="button">Закрыть</button></header><div className="ui-modal-body"><div className="shift-work-orders-photo-viewer"><button aria-label="Предыдущее фото" className="action action--secondary shift-work-orders-photo-nav" disabled={photoReports.length < 2} onClick={() => navigatePhoto(-1)} type="button">←</button><figure className="shift-work-orders-photo-stage"><img alt={activePhoto.photoName} src={activePhoto.photoUrl} /><figcaption><strong>{activePhoto.text}</strong><span>{[activePhoto.operationName, activePhoto.workCenterLabel, activePhoto.employeeName, activePhoto.createdAt].filter(Boolean).join(" · ")}</span></figcaption></figure><button aria-label="Следующее фото" className="action action--secondary shift-work-orders-photo-nav" disabled={photoReports.length < 2} onClick={() => navigatePhoto(1)} type="button">→</button></div></div></section></div> : null}{printPreview?.type === "shift" && printRenderer ? <printRenderer.ShiftWorkOrderPrintPreview onClose={() => setPrintPreview(null)} onPrint={(title) => onPrintDocument?.(title)} row={printPreview.row} /> : null}{printPreview?.type === "package" && printRenderer ? <printRenderer.WorkOrderPackagePrintPreview model={printPreview.model} onClose={() => setPrintPreview(null)} onPrint={(title) => onPrintDocument?.(title)} /> : null}</OperationalPage>;
}
