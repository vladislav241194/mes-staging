import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ActionButton, MetricCard, MetricGrid, ModuleHeader, ModulePage, ModuleSidebar, Panel, SidebarItem, StatusToken, TableWrap, SystemState } from "../../ui/components";
import { adaptSpecifications2Payload } from "./adapter";
import type { Specifications2DraftRoute, Specifications2DraftRow } from "./adapter";
import type { Specifications2AttachmentKind, Specifications2CommandResult, Specifications2DraftRowValue, Specifications2ReactCommand, Specifications2RouteValue } from "./ports";

export type { Specifications2ReactCommand } from "./ports";

const dateTime = (value: string) => value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const publicationTone = (state: string): "success" | "warning" | "neutral" => state === "released" ? "success" : state === "changed" ? "warning" : "neutral";

type StructureDraft = {
  mode: "add" | "reparent" | "remove";
  rowId: string;
  parentId: string;
  value: Specifications2DraftRowValue;
};

type AttachmentDraft = {
  routeId: string;
  operationId: string;
  kind: Specifications2AttachmentKind;
  file: File | null;
};

const createDraft = (row: Specifications2DraftRow): Specifications2DraftRowValue & { rowId: string } => ({
  rowId: row.id,
  label: row.label,
  designation: row.designation,
  type: row.type,
  quantity: row.quantity,
  unitOfMeasure: row.unitOfMeasure,
});

const createRouteDraft = (route: Specifications2DraftRoute): Specifications2RouteValue & { routeId: string } => ({
  routeId: route.id,
  productLabel: route.productLabel,
  designation: route.designation,
  status: route.status,
});

const emptyRowValue = (): Specifications2DraftRowValue => ({ label: "", designation: "", type: "Компонент", quantity: "1", unitOfMeasure: "шт." });

const fileDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
  reader.onerror = () => reject(reader.error || new Error("Не удалось прочитать файл."));
  reader.readAsDataURL(file);
});

export function Specifications2Scenario({ payload, onCommand }: { payload: unknown; onCommand?(command: Specifications2ReactCommand): Promise<Specifications2CommandResult | void> }) {
  const model = useMemo(() => adaptSpecifications2Payload(payload), [payload]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<(Specifications2DraftRowValue & { rowId: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [commandError, setCommandError] = useState("");
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [workOrderDraft, setWorkOrderDraft] = useState<{ routeId: string; quantity: string } | null>(null);
  const [creatingWorkOrder, setCreatingWorkOrder] = useState(false);
  const creatingWorkOrderRef = useRef(false);
  const [selectingEntryId, setSelectingEntryId] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [structureDraft, setStructureDraft] = useState<StructureDraft | null>(null);
  const [structureSaving, setStructureSaving] = useState(false);
  const [routeDraft, setRouteDraft] = useState<(Specifications2RouteValue & { routeId: string }) | null>(null);
  const [routeSaving, setRouteSaving] = useState(false);
  const [attachmentDraft, setAttachmentDraft] = useState<AttachmentDraft | null>(null);
  const [attachmentSaving, setAttachmentSaving] = useState(false);
  const selected = model.selectedEntry;
  const revision = selected?.serverRevision;
  const attachmentRoute = selected?.routeDrafts.find((route) => route.id === attachmentDraft?.routeId) || selected?.routeDrafts[0] || null;
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
  const setDraftField = (field: keyof Specifications2DraftRowValue, value: string) => setDraft((current) => current ? { ...current, [field]: value } : current);
  const selectEntry = async (entryId: string) => {
    if (!entryId || !onCommand || selectingEntryId) return;
    setSelectingEntryId(entryId);
    setSelectionError("");
    try {
      const result = await onCommand({ type: "select-entry", payload: { entryId } });
      if (result?.ok === false) setSelectionError(result.message || "Не удалось выбрать спецификацию.");
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "Не удалось выбрать спецификацию.");
    } finally {
      setSelectingEntryId("");
    }
  };
  const selectDraftRow = (rowId: string) => {
    const row = selected?.draftRows.find((item) => item.id === rowId);
    if (row) setDraft(createDraft(row));
    setCommandError("");
  };
  const saveDraft = async () => {
    if (!draft || !selected || !onCommand) return;
    setSaving(true);
    setCommandError("");
    try {
      const { rowId, ...value } = draft;
      const result = await onCommand({ type: "save-draft-row", payload: { entryId: selected.id, rowId, value } });
      if (result?.ok === false) setCommandError(result.message || "Не удалось сохранить строку черновика.");
      else setDraft(null);
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : "Не удалось сохранить строку черновика.");
    } finally {
      setSaving(false);
    }
  };
  const publishDraft = async () => {
    if (!selected || !onCommand || publishing) return;
    setPublishing(true); setCommandError("");
    try {
      const result = await onCommand({ type: "publish-draft", payload: { entryId: selected.id, confirmEntryId: selected.id, expectedPreviousRevision: selected.publicationRevision } });
      if (result?.ok === false) setCommandError(result.message || "Не удалось опубликовать ревизию.");
      else setPublishConfirm(false);
    } catch (error) { setCommandError(error instanceof Error ? error.message : "Не удалось опубликовать ревизию."); }
    finally { setPublishing(false); }
  };
  const createWorkOrder = async () => {
    if (!selected || !revision || !workOrderDraft || !onCommand || creatingWorkOrderRef.current) return;
    creatingWorkOrderRef.current = true;
    setCreatingWorkOrder(true); setCommandError("");
    try {
      const result = await onCommand({ type: "create-work-order", payload: { entryId: selected.id, revisionId: revision.id, confirmRevisionId: revision.id, routeSourceDraftId: workOrderDraft.routeId, quantity: Number(workOrderDraft.quantity) } });
      if (result?.ok === false) setCommandError(result.message || "Не удалось создать заказ-наряд.");
      else setWorkOrderDraft(null);
    } catch (error) { setCommandError(error instanceof Error ? error.message : "Не удалось создать заказ-наряд."); }
    finally { creatingWorkOrderRef.current = false; setCreatingWorkOrder(false); }
  };
  const runStructureCommand = async () => {
    if (!selected || !structureDraft || !onCommand || structureSaving) return;
    setStructureSaving(true); setCommandError("");
    try {
      const command: Specifications2ReactCommand = structureDraft.mode === "add"
        ? { type: "add-row", payload: { entryId: selected.id, parentId: structureDraft.parentId, value: structureDraft.value } }
        : structureDraft.mode === "reparent"
          ? { type: "reparent-row", payload: { entryId: selected.id, rowId: structureDraft.rowId, parentId: structureDraft.parentId } }
          : { type: "remove-row", payload: { entryId: selected.id, rowId: structureDraft.rowId, confirmRowId: structureDraft.rowId } };
      const result = await onCommand(command);
      if (result?.ok === false) setCommandError(result.message || "Не удалось изменить структуру.");
      else setStructureDraft(null);
    } catch (error) { setCommandError(error instanceof Error ? error.message : "Не удалось изменить структуру."); }
    finally { setStructureSaving(false); }
  };
  const saveRoute = async () => {
    if (!selected || !routeDraft || !onCommand || routeSaving) return;
    setRouteSaving(true); setCommandError("");
    try {
      const { routeId, ...value } = routeDraft;
      const result = await onCommand({ type: "edit-route", payload: { entryId: selected.id, routeId, value } });
      if (result?.ok === false) setCommandError(result.message || "Не удалось изменить маршрут.");
      else setRouteDraft(null);
    } catch (error) { setCommandError(error instanceof Error ? error.message : "Не удалось изменить маршрут."); }
    finally { setRouteSaving(false); }
  };
  const bindAttachment = async () => {
    if (!selected || !attachmentDraft?.file || !onCommand || attachmentSaving) return;
    setAttachmentSaving(true); setCommandError("");
    try {
      const inlineDataUrl = await fileDataUrl(attachmentDraft.file);
      const result = await onCommand({ type: "bind-attachment", payload: { entryId: selected.id, routeId: attachmentDraft.routeId, operationId: attachmentDraft.operationId, kind: attachmentDraft.kind, fileName: attachmentDraft.file.name, mediaType: attachmentDraft.file.type, size: attachmentDraft.file.size, inlineDataUrl } });
      if (result?.ok === false) setCommandError(result.message || "Не удалось привязать вложение.");
      else setAttachmentDraft(null);
    } catch (error) { setCommandError(error instanceof Error ? error.message : "Не удалось привязать вложение."); }
    finally { setAttachmentSaving(false); }
  };
  return <ModulePage
    header={<ModuleHeader eyebrow="Технологии" title="Спецификации 2.0" badge={<span className="lab-badge">React + TypeScript · основной UI</span>} />}
    sidebar={<ModuleSidebar label="Реестр Спецификаций 2.0" title="Реестр 2.0">
      {model.registry.map((item) => <SidebarItem active={item.selected} count={item.rowCount} key={item.id} label={item.title} meta={<>{selectingEntryId === item.id ? "Открываем…" : item.errorCount ? `Ошибки: ${item.errorCount}` : item.publicationLabel}</>} onClick={() => { if (!item.selected) void selectEntry(item.id); }} />)}
      {selectionError ? <small role="alert">{selectionError}</small> : null}
      <ActionButton disabled title="Импорт XLSX будет включён после подключения серверного владельца команды." variant="secondary">Загрузить XLSX · недоступно</ActionButton>
    </ModuleSidebar>}
  >
    <section className="workspace-main specifications2-react">
      {!selected || !revision || model.serverStatus !== "ready" ? <Panel heading={<div className="panel-heading"><div><p>Опубликованная ревизия</p><h2>Серверная проекция не готова</h2></div></div>}><SystemState title="React-интерфейс ожидает данные" text={model.serverError || "Опубликованная ревизия появится после подтверждения того же номера и fingerprint в PostgreSQL. Legacy-интерфейс автоматически не открывается."} tone="neutral" /></Panel> : <>
        <Panel heading={<div className="panel-heading"><div><p>{revision.designation || "Опубликованная спецификация"}</p><h2>{revision.title}</h2></div><StatusToken label={`Ревизия ${revision.revisionNo}`} tone="success" /></div>}>
          <div className="specifications2-react-summary" data-specifications2-revision={revision.id}>
            <MetricGrid label="Сводка опубликованной ревизии"><MetricCard label="Позиции" value={revision.treeItems.length} /><MetricCard label="Маршруты" value={revision.routes.length} /><MetricCard label="Операции" value={revision.operationCount} /><MetricCard label="Опубликовано" value={dateTime(revision.releasedAt)} /></MetricGrid>
            <div className="specifications2-react-publication"><StatusToken label={selected.publicationLabel} tone={publicationTone(selected.publicationState)} /><span>PostgreSQL подтвердил ревизию {revision.revisionNo} и неизменяемый состав.</span>{model.canEditDraft && selected.draftRows.length ? <ActionButton onClick={() => { setDraft(createDraft(selected.draftRows[0])); setPublishConfirm(false); }} variant="secondary">Изменить строку черновика</ActionButton> : <ActionButton disabled title="Редактирование разрешается только подписанной роли с доступной командой владельца." variant="secondary">Редактирование · недоступно</ActionButton>}{selected.publicationState !== "released" ? model.canPublish ? <ActionButton onClick={() => { setPublishConfirm(true); setDraft(null); setCommandError(""); }}>Опубликовать ревизию {selected.publicationRevision + 1}</ActionButton> : <ActionButton disabled title="Публикация будет доступна после подтверждения RBAC и server-primary owner." variant="secondary">Публикация · недоступна</ActionButton> : null}{model.canEditStructure && selected.draftRows.length ? <ActionButton onClick={() => { const parentId = selected.draftRows[0]?.id || ""; setStructureDraft({ mode: "add", rowId: selected.draftRows.find((row) => row.parentId)?.id || "", parentId, value: emptyRowValue() }); setRouteDraft(null); setAttachmentDraft(null); setCommandError(""); }} variant="secondary">Структура строк</ActionButton> : <ActionButton disabled title="Владелец структуры черновика недоступен." variant="secondary">Структура строк · недоступна</ActionButton>}{model.canEditRoutes && selected.routeDrafts.length ? <ActionButton onClick={() => { setRouteDraft(createRouteDraft(selected.routeDrafts[0])); setStructureDraft(null); setAttachmentDraft(null); setCommandError(""); }} variant="secondary">Маршруты и нормы</ActionButton> : <ActionButton disabled title="Маршрутные черновики отсутствуют или недоступны." variant="secondary">Маршруты и нормы · недоступны</ActionButton>}</div>
          </div>
        </Panel>
        {publishConfirm ? <Panel heading={<div className="panel-heading"><div><p>Server-primary publication</p><h2>Подтвердить публикацию ревизии {selected.publicationRevision + 1}</h2></div></div>}><div className="react-nomenclature-delete-confirm" data-specifications2-publish-confirm={selected.id} role="alertdialog"><p>Публикуется черновик <strong>{selected.title}</strong> со stable ID <code>{selected.id}</code>. Предыдущая неизменяемая ревизия: {selected.publicationRevision}.</p>{commandError ? <p className="specifications2-react-command-error" role="alert">{commandError}</p> : null}<div className="specifications2-react-editor-actions"><ActionButton disabled={publishing} onClick={() => { setPublishConfirm(false); setCommandError(""); }} variant="secondary">Отмена</ActionButton><ActionButton disabled={publishing} onClick={() => void publishDraft()}>{publishing ? "Публикация…" : `Подтвердить ревизию ${selected.publicationRevision + 1}`}</ActionButton></div></div></Panel> : null}
        {workOrderDraft ? <Panel heading={<div className="panel-heading"><div><p>PostgreSQL work order</p><h2>Создать заказ-наряд из ревизии {revision.revisionNo}</h2></div></div>}><div className="react-nomenclature-delete-confirm" data-specifications2-work-order-confirm={revision.id} role="alertdialog"><label><span>Маршрут</span><select data-specifications2-work-order-route value={workOrderDraft.routeId} onChange={(event) => setWorkOrderDraft((current) => current ? { ...current, routeId: event.currentTarget.value } : current)}>{revision.routes.map((route) => <option key={route.id} value={route.id}>{route.productLabel || route.designation}</option>)}</select></label><label><span>Количество</span><input data-specifications2-work-order-quantity min="1" step="1" type="number" value={workOrderDraft.quantity} onChange={(event) => setWorkOrderDraft((current) => current ? { ...current, quantity: event.currentTarget.value } : current)} /></label><p>Источник: immutable revision ID <code>{revision.id}</code>.</p>{commandError ? <p className="specifications2-react-command-error" role="alert">{commandError}</p> : null}<div className="specifications2-react-editor-actions"><ActionButton disabled={creatingWorkOrder} onClick={() => { setWorkOrderDraft(null); setCommandError(""); }} variant="secondary">Отмена</ActionButton><ActionButton disabled={creatingWorkOrder || !Number.isInteger(Number(workOrderDraft.quantity)) || Number(workOrderDraft.quantity) < 1} onClick={() => void createWorkOrder()}>{creatingWorkOrder ? "Создание…" : "Подтвердить заказ-наряд"}</ActionButton></div></div></Panel> : null}
        {draft ? <Panel heading={<div className="panel-heading"><div><p>Черновик до публикации</p><h2>Редактирование существующей строки</h2></div><ActionButton onClick={() => { setDraft(null); setCommandError(""); }} variant="secondary">Отмена</ActionButton></div>}>
          <form className="specifications2-react-editor" data-specifications2-draft-editor onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
            <label className="full"><span>Строка черновика</span><select data-specifications2-draft-row onChange={(event) => selectDraftRow(event.currentTarget.value)} value={draft.rowId}>{selected.draftRows.map((row) => <option key={row.id} value={row.id}>{row.designation ? `${row.designation} — ` : ""}{row.label}</option>)}</select></label>
            <label><span>Наименование</span><input data-specifications2-draft-label onChange={(event) => setDraftField("label", event.currentTarget.value)} required value={draft.label} /></label>
            <label><span>Обозначение</span><input onChange={(event) => setDraftField("designation", event.currentTarget.value)} value={draft.designation} /></label>
            <label><span>Тип</span><input onChange={(event) => setDraftField("type", event.currentTarget.value)} required value={draft.type} /></label>
            <label><span>Количество</span><input inputMode="decimal" onChange={(event) => setDraftField("quantity", event.currentTarget.value)} value={draft.quantity} /></label>
            <label><span>Единица измерения</span><input onChange={(event) => setDraftField("unitOfMeasure", event.currentTarget.value)} value={draft.unitOfMeasure} /></label>
            {commandError ? <p className="specifications2-react-command-error full" role="alert">{commandError}</p> : null}
            <div className="specifications2-react-editor-actions full"><button className="action action--primary" data-specifications2-draft-save disabled={saving} type="submit">{saving ? "Сохранение…" : "Сохранить строку"}</button></div>
          </form>
        </Panel> : null}
        {structureDraft ? <Panel heading={<div className="panel-heading"><div><p>Черновик структуры</p><h2>Добавление, перенос и удаление строк</h2></div><ActionButton onClick={() => { setStructureDraft(null); setCommandError(""); }} variant="secondary">Закрыть</ActionButton></div>}>
          <form className="specifications2-react-editor" data-specifications2-structure-editor onSubmit={(event) => { event.preventDefault(); void runStructureCommand(); }}>
            <label><span>Действие</span><select value={structureDraft.mode} onChange={(event) => setStructureDraft((current) => current ? { ...current, mode: event.currentTarget.value as StructureDraft["mode"] } : current)}><option value="add">Добавить строку</option><option value="reparent">Перенести строку</option><option value="remove">Удалить ветку</option></select></label>
            {structureDraft.mode !== "add" ? <label><span>Строка</span><select value={structureDraft.rowId} onChange={(event) => setStructureDraft((current) => current ? { ...current, rowId: event.currentTarget.value } : current)}>{selected.draftRows.filter((row) => row.parentId).map((row) => <option key={row.id} value={row.id}>{row.designation || row.label}</option>)}</select></label> : null}
            {structureDraft.mode !== "remove" ? <label><span>Родитель</span><select value={structureDraft.parentId} onChange={(event) => setStructureDraft((current) => current ? { ...current, parentId: event.currentTarget.value } : current)}>{selected.draftRows.filter((row) => row.id !== structureDraft.rowId).map((row) => <option key={row.id} value={row.id}>{row.designation || row.label}</option>)}</select></label> : null}
            {structureDraft.mode === "add" ? <><label><span>Наименование</span><input required value={structureDraft.value.label} onChange={(event) => setStructureDraft((current) => current ? { ...current, value: { ...current.value, label: event.currentTarget.value } } : current)} /></label><label><span>Обозначение</span><input value={structureDraft.value.designation} onChange={(event) => setStructureDraft((current) => current ? { ...current, value: { ...current.value, designation: event.currentTarget.value } } : current)} /></label><label><span>Тип</span><input required value={structureDraft.value.type} onChange={(event) => setStructureDraft((current) => current ? { ...current, value: { ...current.value, type: event.currentTarget.value } } : current)} /></label><label><span>Количество</span><input value={structureDraft.value.quantity} onChange={(event) => setStructureDraft((current) => current ? { ...current, value: { ...current.value, quantity: event.currentTarget.value } } : current)} /></label><label><span>Единица</span><input value={structureDraft.value.unitOfMeasure} onChange={(event) => setStructureDraft((current) => current ? { ...current, value: { ...current.value, unitOfMeasure: event.currentTarget.value } } : current)} /></label></> : null}
            {structureDraft.mode === "remove" ? <p className="full">Будет удалена выбранная строка и вся её дочерняя ветка. Опубликованная ревизия останется неизменной.</p> : null}
            {commandError ? <p className="specifications2-react-command-error full" role="alert">{commandError}</p> : null}
            <div className="specifications2-react-editor-actions full"><ActionButton disabled={structureSaving || (structureDraft.mode !== "add" && !structureDraft.rowId)}>{structureSaving ? "Сохраняем…" : structureDraft.mode === "remove" ? "Подтвердить удаление ветки" : "Сохранить структуру"}</ActionButton></div>
          </form>
        </Panel> : null}
        {routeDraft ? <Panel heading={<div className="panel-heading"><div><p>Черновик маршрута</p><h2>Основные параметры маршрута</h2></div><ActionButton onClick={() => { setRouteDraft(null); setCommandError(""); }} variant="secondary">Закрыть</ActionButton></div>}>
          <form className="specifications2-react-editor" data-specifications2-route-editor onSubmit={(event) => { event.preventDefault(); void saveRoute(); }}>
            <label className="full"><span>Маршрут</span><select value={routeDraft.routeId} onChange={(event) => { const route = selected.routeDrafts.find((item) => item.id === event.currentTarget.value); if (route) setRouteDraft(createRouteDraft(route)); }}>{selected.routeDrafts.map((route) => <option key={route.id} value={route.id}>{route.designation || route.productLabel}</option>)}</select></label>
            <label><span>Изделие</span><input required value={routeDraft.productLabel} onChange={(event) => setRouteDraft((current) => current ? { ...current, productLabel: event.currentTarget.value } : current)} /></label>
            <label><span>Обозначение</span><input required value={routeDraft.designation} onChange={(event) => setRouteDraft((current) => current ? { ...current, designation: event.currentTarget.value } : current)} /></label>
            <label><span>Статус</span><select value={routeDraft.status} onChange={(event) => setRouteDraft((current) => current ? { ...current, status: event.currentTarget.value as Specifications2RouteValue["status"] } : current)}><option value="draft">Черновик</option><option value="ready-for-norming">Готов к нормированию</option></select></label>
            {commandError ? <p className="specifications2-react-command-error full" role="alert">{commandError}</p> : null}
            <div className="specifications2-react-editor-actions full"><ActionButton disabled={routeSaving}>{routeSaving ? "Сохраняем…" : "Сохранить маршрут"}</ActionButton></div>
          </form>
        </Panel> : null}
        {attachmentDraft && attachmentRoute ? <Panel heading={<div className="panel-heading"><div><p>Server attachment</p><h2>Загрузить и привязать файл к операции</h2></div><ActionButton onClick={() => { setAttachmentDraft(null); setCommandError(""); }} variant="secondary">Закрыть</ActionButton></div>}>
          <form className="specifications2-react-editor" data-specifications2-attachment-editor onSubmit={(event) => { event.preventDefault(); void bindAttachment(); }}>
            <label><span>Маршрут</span><select value={attachmentRoute.id} onChange={(event) => { const route = selected.routeDrafts.find((item) => item.id === event.currentTarget.value); setAttachmentDraft((current) => current && route ? { ...current, routeId: route.id, operationId: route.operations[0]?.id || "" } : current); }}>{selected.routeDrafts.filter((route) => route.operations.length).map((route) => <option key={route.id} value={route.id}>{route.designation || route.productLabel}</option>)}</select></label>
            <label><span>Операция</span><select value={attachmentDraft.operationId} onChange={(event) => setAttachmentDraft((current) => current ? { ...current, operationId: event.currentTarget.value } : current)}>{attachmentRoute.operations.map((operation) => <option key={operation.id} value={operation.id}>{operation.name} · {operation.workCenterId || "без участка"} · файлов {operation.attachmentCount}</option>)}</select></label>
            <label><span>Назначение файла</span><select value={attachmentDraft.kind} onChange={(event) => setAttachmentDraft((current) => current ? { ...current, kind: event.currentTarget.value as Specifications2AttachmentKind } : current)}><option value="pnp">Pick-and-place TXT</option><option value="gerber">Gerber ZIP</option><option value="instructionDoc">Инструкция DOC/DOCX</option><option value="instructionPdf">Инструкция PDF</option></select></label>
            <label><span>Файл</span><input required type="file" onChange={(event) => setAttachmentDraft((current) => current ? { ...current, file: event.currentTarget.files?.[0] || null } : current)} /></label>
            <p className="full">Бинарный файл загружается существующему PostgreSQL-владельцу; в черновике сохраняется только server attachment ID и метаданные.</p>
            {commandError ? <p className="specifications2-react-command-error full" role="alert">{commandError}</p> : null}
            <div className="specifications2-react-editor-actions full"><ActionButton disabled={attachmentSaving || !attachmentDraft.file || !attachmentDraft.operationId}>{attachmentSaving ? "Загружаем…" : "Загрузить и привязать"}</ActionButton></div>
          </form>
        </Panel> : null}
        <Panel heading={<div className="panel-heading"><div><p>PostgreSQL read model</p><h2>Дерево опубликованной ревизии</h2></div><StatusToken label={`${visibleRows.length} из ${revision.treeItems.length}`} tone="neutral" /></div>}>
          <TableWrap><table className="specifications2-react-tree" role="treegrid" aria-label="Опубликованная структура спецификации"><thead><tr><th>Объект</th><th>Тип</th><th>Кол-во</th><th>Ед.</th></tr></thead><tbody>{visibleRows.map((row) => <tr aria-level={row.depth + 1} data-specifications2-tree-row={row.id} key={row.id}><td><div className="specifications2-react-object" style={{ "--tree-depth": row.depth } as CSSProperties}>{row.hasChildren ? <button aria-expanded={!collapsed.has(row.id)} onClick={() => toggle(row.id)} type="button">{collapsed.has(row.id) ? "+" : "−"}</button> : <span aria-hidden="true" />}<strong>{row.designation || row.name}</strong>{row.designation && row.name ? <small>{row.name}</small> : null}</div></td><td>{row.kind}</td><td>{row.quantity.toLocaleString("ru-RU")}</td><td>{row.unit}</td></tr>)}</tbody></table></TableWrap>
        </Panel>
      </>}
    </section>
    <aside className="detail specifications2-react-detail"><p>Паспорт ревизии</p><h2>{revision ? `Ревизия ${revision.revisionNo}` : "Нет ревизии"}</h2>{revision ? <dl><div><dt>Источник</dt><dd>PostgreSQL</dd></div><div><dt>Документ</dt><dd>{revision.specificationId}</dd></div><div><dt>Опубликовано</dt><dd>{dateTime(revision.releasedAt)}</dd></div><div><dt>Исходник обновлён</dt><dd>{dateTime(revision.sourceUpdatedAt)}</dd></div></dl> : null}{revision && revision.routes.length ? model.canCreateWorkOrder ? <ActionButton onClick={() => { setWorkOrderDraft({ routeId: revision.routes[0].id, quantity: "1" }); setPublishConfirm(false); setDraft(null); setCommandError(""); }}>Создать заказ-наряд</ActionButton> : <ActionButton disabled title="Команда появится после подтверждения RBAC и PostgreSQL-primary capability." variant="secondary">Заказ-наряд · недоступен</ActionButton> : null}{model.canBindAttachments && selected?.routeDrafts.some((route) => route.operations.length) ? <ActionButton onClick={() => { const route = selected.routeDrafts.find((item) => item.operations.length)!; setAttachmentDraft({ routeId: route.id, operationId: route.operations[0]?.id || "", kind: "instructionPdf", file: null }); setStructureDraft(null); setRouteDraft(null); setCommandError(""); }} variant="secondary">Вложения</ActionButton> : <ActionButton disabled title="Нет операции или серверный владелец вложений недоступен." variant="secondary">Вложения · недоступны</ActionButton>}</aside>
  </ModulePage>;
}
