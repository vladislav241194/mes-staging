import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ActionButton, MetricCard, MetricGrid, ModuleHeader, ModulePage, ModuleSidebar, Panel, SidebarItem, StatusToken, TableWrap, SystemState } from "../../ui/components";
import { adaptSpecifications2Payload } from "./adapter";
import type { Specifications2DraftRow } from "./adapter";

const dateTime = (value: string) => value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const publicationTone = (state: string): "success" | "warning" | "neutral" => state === "released" ? "success" : state === "changed" ? "warning" : "neutral";

interface Specifications2DraftRowValue {
  label: string;
  designation: string;
  type: string;
  quantity: string;
  unitOfMeasure: string;
}

export type Specifications2SelectionCommand = { type: "select-entry"; payload: { entryId: string } };
export type Specifications2DraftCommand = { type: "save-draft-row"; payload: { entryId: string; rowId: string; value: Specifications2DraftRowValue } };
export type Specifications2PublishCommand = { type: "publish-draft"; payload: { entryId: string; confirmEntryId: string; expectedPreviousRevision: number } };
export type Specifications2WorkOrderCommand = { type: "create-work-order"; payload: { entryId: string; revisionId: string; confirmRevisionId: string; routeSourceDraftId: string; quantity: number } };
export type Specifications2ReactCommand = Specifications2SelectionCommand | Specifications2DraftCommand | Specifications2PublishCommand | Specifications2WorkOrderCommand;

const createDraft = (row: Specifications2DraftRow): Specifications2DraftRowValue & { rowId: string } => ({
  rowId: row.id,
  label: row.label,
  designation: row.designation,
  type: row.type,
  quantity: row.quantity,
  unitOfMeasure: row.unitOfMeasure,
});

export function Specifications2Scenario({ payload, onCommand }: { payload: unknown; onCommand?(command: Specifications2ReactCommand): Promise<{ ok?: boolean; message?: string } | void> }) {
  const model = useMemo(() => adaptSpecifications2Payload(payload), [payload]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<(Specifications2DraftRowValue & { rowId: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [commandError, setCommandError] = useState("");
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [workOrderDraft, setWorkOrderDraft] = useState<{ routeId: string; quantity: string } | null>(null);
  const [creatingWorkOrder, setCreatingWorkOrder] = useState(false);
  const [selectingEntryId, setSelectingEntryId] = useState("");
  const [selectionError, setSelectionError] = useState("");
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
    if (!selected || !revision || !workOrderDraft || !onCommand || creatingWorkOrder) return;
    setCreatingWorkOrder(true); setCommandError("");
    try {
      const result = await onCommand({ type: "create-work-order", payload: { entryId: selected.id, revisionId: revision.id, confirmRevisionId: revision.id, routeSourceDraftId: workOrderDraft.routeId, quantity: Number(workOrderDraft.quantity) } });
      if (result?.ok === false) setCommandError(result.message || "Не удалось создать заказ-наряд.");
      else setWorkOrderDraft(null);
    } catch (error) { setCommandError(error instanceof Error ? error.message : "Не удалось создать заказ-наряд."); }
    finally { setCreatingWorkOrder(false); }
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
            <div className="specifications2-react-publication"><StatusToken label={selected.publicationLabel} tone={publicationTone(selected.publicationState)} /><span>PostgreSQL подтвердил ревизию {revision.revisionNo} и неизменяемый состав.</span>{model.canEditDraft && selected.draftRows.length ? <ActionButton onClick={() => { setDraft(createDraft(selected.draftRows[0])); setPublishConfirm(false); }} variant="secondary">Изменить строку черновика</ActionButton> : <ActionButton disabled title="Редактирование разрешается только подписанной роли с доступной командой владельца." variant="secondary">Редактирование · недоступно</ActionButton>}{selected.publicationState === "changed" ? model.canPublish ? <ActionButton onClick={() => { setPublishConfirm(true); setDraft(null); setCommandError(""); }}>Опубликовать ревизию {selected.publicationRevision + 1}</ActionButton> : <ActionButton disabled title="Публикация будет доступна после подтверждения RBAC и server-primary owner." variant="secondary">Публикация · недоступна</ActionButton> : null}<ActionButton disabled title="Добавление, удаление и перенос строк требуют отдельного серверного владельца." variant="secondary">Структура строк · недоступна</ActionButton><ActionButton disabled title="Редактирование маршрутов и норм требует отдельного серверного владельца." variant="secondary">Маршруты и нормы · недоступны</ActionButton></div>
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
        <Panel heading={<div className="panel-heading"><div><p>PostgreSQL read model</p><h2>Дерево опубликованной ревизии</h2></div><StatusToken label={`${visibleRows.length} из ${revision.treeItems.length}`} tone="neutral" /></div>}>
          <TableWrap><table className="specifications2-react-tree" role="treegrid" aria-label="Опубликованная структура спецификации"><thead><tr><th>Объект</th><th>Тип</th><th>Кол-во</th><th>Ед.</th></tr></thead><tbody>{visibleRows.map((row) => <tr aria-level={row.depth + 1} data-specifications2-tree-row={row.id} key={row.id}><td><div className="specifications2-react-object" style={{ "--tree-depth": row.depth } as CSSProperties}>{row.hasChildren ? <button aria-expanded={!collapsed.has(row.id)} onClick={() => toggle(row.id)} type="button">{collapsed.has(row.id) ? "+" : "−"}</button> : <span aria-hidden="true" />}<strong>{row.designation || row.name}</strong>{row.designation && row.name ? <small>{row.name}</small> : null}</div></td><td>{row.kind}</td><td>{row.quantity.toLocaleString("ru-RU")}</td><td>{row.unit}</td></tr>)}</tbody></table></TableWrap>
        </Panel>
      </>}
    </section>
    <aside className="detail specifications2-react-detail"><p>Паспорт ревизии</p><h2>{revision ? `Ревизия ${revision.revisionNo}` : "Нет ревизии"}</h2>{revision ? <dl><div><dt>Источник</dt><dd>PostgreSQL</dd></div><div><dt>Документ</dt><dd>{revision.specificationId}</dd></div><div><dt>Опубликовано</dt><dd>{dateTime(revision.releasedAt)}</dd></div><div><dt>Исходник обновлён</dt><dd>{dateTime(revision.sourceUpdatedAt)}</dd></div></dl> : null}{revision && revision.routes.length ? model.canCreateWorkOrder ? <ActionButton onClick={() => { setWorkOrderDraft({ routeId: revision.routes[0].id, quantity: "1" }); setPublishConfirm(false); setDraft(null); setCommandError(""); }}>Создать заказ-наряд</ActionButton> : <ActionButton disabled title="Команда появится после подтверждения RBAC и PostgreSQL-primary capability." variant="secondary">Заказ-наряд · недоступен</ActionButton> : null}<ActionButton disabled title="Привязка вложений требует отдельного серверного владельца команды." variant="secondary">Вложения · недоступны</ActionButton></aside>
  </ModulePage>;
}
