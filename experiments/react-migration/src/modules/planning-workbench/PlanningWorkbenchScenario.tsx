import { useEffect, useMemo, useRef, useState } from "react";
import { ActionButton, EmptyState, MetricCard, MetricGrid, ModuleHeader, ModulePage, ModuleSidebar, Panel, SidebarItem, StatusToken, TableWrap } from "../../ui/components";
import { adaptPlanningWorkbench } from "./adapter";

export type PlanningWorkbenchReactNavigation = { type: "select-route" | "select-item"; id: string };
export type PlanningWorkbenchReactCommand =
  | { type: "request-elevation" }
  | { type: "change-quantity"; routeId: string; quantity: number; expectedRevision: number }
  | { type: "change-slot"; routeId: string; operationId: string; slotId: string; plannedStart: string; expectedRevision: number }
  | { type: "change-start-date"; routeId: string; planningStartDate: string | null; expectedRevision: number; idempotencyKey: string };

type PlanningWorkbenchCommandResult = { ok?: boolean; message?: string; preserveRequest?: boolean; committed?: boolean; code?: string; canonicalPlanningStartDate?: string | null; canonicalRevision?: number };
type StartDateRequest = { routeId: string; planningStartDate: string | null; expectedRevision: number; idempotencyKey: string };

function makeStartDateIdempotencyKey(): string {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `planning-start-date:${random}`;
}

function dateTimeInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function PlanningWorkbenchScenario({ payload, onCommand, onNavigate }: { payload: unknown; onCommand?(command: PlanningWorkbenchReactCommand): Promise<PlanningWorkbenchCommandResult | void>; onNavigate?(navigation: PlanningWorkbenchReactNavigation): Promise<{ ok?: boolean; message?: string } | void> }) {
  const model = useMemo(() => adaptPlanningWorkbench(payload), [payload]);
  const selectedSlotRow = model.rows.find((row) => row.kind === "step" && row.selected && row.slotId) || null;
  const retainedStartDateRequest = model.startDateReconciliation;
  const [navigationError, setNavigationError] = useState("");
  const [navigating, setNavigating] = useState(false);
  const [quantityDraft, setQuantityDraft] = useState(String(model.quantity || 1));
  const [startDateDraft, setStartDateDraft] = useState(retainedStartDateRequest
    ? retainedStartDateRequest.planningStartDate ?? ""
    : model.planningStartDate);
  const [commandError, setCommandError] = useState("");
  const [startDateError, setStartDateError] = useState(retainedStartDateRequest?.message || "");
  const [saving, setSaving] = useState(false);
  const [savingStartDate, setSavingStartDate] = useState(false);
  const [slotStartDraft, setSlotStartDraft] = useState(() => dateTimeInput(selectedSlotRow?.plannedStart || ""));
  const [slotError, setSlotError] = useState("");
  const [savingSlot, setSavingSlot] = useState(false);
  const [startDateReconcilePending, setStartDateReconcilePending] = useState(Boolean(retainedStartDateRequest));
  const [elevating, setElevating] = useState(false);
  const startDateRequest = useRef<StartDateRequest | null>(retainedStartDateRequest ? {
    routeId: retainedStartDateRequest.routeId,
    planningStartDate: retainedStartDateRequest.planningStartDate,
    expectedRevision: retainedStartDateRequest.expectedRevision,
    idempotencyKey: retainedStartDateRequest.idempotencyKey,
  } : null);
  const startDateRouteId = useRef(model.activeRouteId);
  useEffect(() => {
    setQuantityDraft(String(model.quantity || 1));
    setCommandError("");
  }, [model.activeRouteId, model.quantity]);
  useEffect(() => {
    const routeChanged = startDateRouteId.current !== model.activeRouteId;
    startDateRouteId.current = model.activeRouteId;
    if (routeChanged) {
      startDateRequest.current = retainedStartDateRequest ? {
        routeId: retainedStartDateRequest.routeId,
        planningStartDate: retainedStartDateRequest.planningStartDate,
        expectedRevision: retainedStartDateRequest.expectedRevision,
        idempotencyKey: retainedStartDateRequest.idempotencyKey,
      } : null;
      setStartDateDraft(retainedStartDateRequest ? retainedStartDateRequest.planningStartDate ?? "" : model.planningStartDate);
      setStartDateError(retainedStartDateRequest?.message || "");
      setStartDateReconcilePending(Boolean(retainedStartDateRequest));
      return;
    }
    if (retainedStartDateRequest) {
      startDateRequest.current = {
        routeId: retainedStartDateRequest.routeId,
        planningStartDate: retainedStartDateRequest.planningStartDate,
        expectedRevision: retainedStartDateRequest.expectedRevision,
        idempotencyKey: retainedStartDateRequest.idempotencyKey,
      };
      setStartDateDraft(retainedStartDateRequest.planningStartDate ?? "");
      setStartDateError(retainedStartDateRequest.message);
      setStartDateReconcilePending(true);
      return;
    }
    // Do not replace an unresolved user intent with a background owner refresh:
    // its exact expectedRevision/key must survive until reconciliation. Once the
    // retained request is explicitly resolved (including superseded A -> B), the
    // canonical model may safely drive the draft again. In particular, a
    // pending true -> false render must not erase the superseded explanation.
    if (!startDateRequest.current) setStartDateDraft(model.planningStartDate);
  }, [
    model.activeRouteId,
    model.planningStartDate,
    retainedStartDateRequest?.idempotencyKey,
    retainedStartDateRequest?.message,
    retainedStartDateRequest?.planningStartDate,
    retainedStartDateRequest?.status,
  ]);
  useEffect(() => {
    setSlotStartDraft(dateTimeInput(selectedSlotRow?.plannedStart || ""));
    setSlotError("");
  }, [selectedSlotRow?.operationId, selectedSlotRow?.plannedStart]);
  const navigate = async (navigation: PlanningWorkbenchReactNavigation) => {
    if (!onNavigate || navigating) return;
    setNavigating(true); setNavigationError("");
    try { const result = await onNavigate(navigation); if (result && result.ok === false) setNavigationError(result.message || "Не удалось изменить выбор."); }
    catch (error) { setNavigationError(error instanceof Error ? error.message : "Не удалось изменить выбор."); }
    finally { setNavigating(false); }
  };
  const saveQuantity = async () => {
    if (!onCommand || saving) return;
    const quantity = Number(quantityDraft);
    if (!Number.isInteger(quantity) || quantity <= 0) { setCommandError("Тираж должен быть положительным целым числом."); return; }
    setSaving(true); setCommandError("");
    try { const result = await onCommand({ type: "change-quantity", routeId: model.activeRouteId, quantity, expectedRevision: model.concurrencyRevision }); if (result && result.ok === false) setCommandError(result.message || "Тираж не сохранён."); }
    catch (error) { setCommandError(error instanceof Error ? error.message : "Тираж не сохранён."); }
    finally { setSaving(false); }
  };
  const saveStartDate = async (requestedPlanningStartDate: string | null) => {
    if (!onCommand || savingStartDate) return;
    setSavingStartDate(true); setStartDateError("");
    try {
      const request = startDateRequest.current?.routeId === model.activeRouteId
        && startDateRequest.current?.planningStartDate === requestedPlanningStartDate
        ? startDateRequest.current
        : { routeId: model.activeRouteId, planningStartDate: requestedPlanningStartDate, expectedRevision: model.concurrencyRevision, idempotencyKey: makeStartDateIdempotencyKey() };
      startDateRequest.current = request;
      const result = await onCommand({
        type: "change-start-date",
        routeId: model.activeRouteId,
        planningStartDate: request.planningStartDate,
        expectedRevision: request.expectedRevision,
        idempotencyKey: request.idempotencyKey,
      });
      if (result && ["superseded-idempotent-replay", "superseded"].includes(String(result.code || ""))) {
        // A committed A may have been replaced by another actor's canonical B
        // while this browser was reconciling a lost response. Replaying the old
        // key must never overwrite B. End the retained-request mode and show B;
        // a later explicit choice of A starts a genuinely new command/key.
        startDateRequest.current = null;
        setStartDateReconcilePending(false);
        if (Object.prototype.hasOwnProperty.call(result, "canonicalPlanningStartDate")) setStartDateDraft(result.canonicalPlanningStartDate ?? "");
        setStartDateError(result.message || "Дата уже заменена другим сотрудником. Показано текущее значение.");
      }
      else if (result && result.ok === false) {
        setStartDateError(result.message || "Дата старта не сохранена.");
        if (result.preserveRequest === true) setStartDateReconcilePending(true);
        else {
          startDateRequest.current = null;
          setStartDateReconcilePending(false);
          if (Object.prototype.hasOwnProperty.call(result, "canonicalPlanningStartDate")) setStartDateDraft(result.canonicalPlanningStartDate ?? "");
        }
      }
      else {
        startDateRequest.current = null;
        setStartDateReconcilePending(false);
        setStartDateDraft(request.planningStartDate ?? "");
      }
    } catch (error) {
      // A transport loss has an unknown commit outcome. Keep the exact
      // expectedRevision + idempotency key for the safe replay.
      setStartDateReconcilePending(true);
      setStartDateError(error instanceof Error ? error.message : "Дата старта не сохранена.");
    }
    finally { setSavingStartDate(false); }
  };
  const saveSlot = async () => {
    if (!onCommand || !selectedSlotRow || savingSlot) return;
    const plannedStart = new Date(slotStartDraft);
    if (!slotStartDraft || Number.isNaN(plannedStart.getTime())) { setSlotError("Укажите корректное начало операции."); return; }
    setSavingSlot(true); setSlotError("");
    try {
      const result = await onCommand({ type: "change-slot", routeId: model.activeRouteId, operationId: selectedSlotRow.operationId, slotId: selectedSlotRow.slotId, plannedStart: slotStartDraft, expectedRevision: model.concurrencyRevision });
      if (result && result.ok === false) setSlotError(result.message || "Начало операции не сохранено.");
    } catch (error) { setSlotError(error instanceof Error ? error.message : "Начало операции не сохранено."); }
    finally { setSavingSlot(false); }
  };
  const requestElevation = async () => {
    if (!onCommand || elevating) return;
    setElevating(true); setStartDateError("");
    try {
      const result = await onCommand({ type: "request-elevation" });
      if (result && result.ok === false) setStartDateError(result.message || "Не удалось открыть подтверждение PIN.");
    } catch (error) { setStartDateError(error instanceof Error ? error.message : "Не удалось открыть подтверждение PIN."); }
    finally { setElevating(false); }
  };
  const header = <ModuleHeader eyebrow="Планирование" title="Заказ-наряды" badge={<><span className="lab-badge" data-react-prototype-marker title="React + TypeScript MVP; трудозатраты, размещение и отмена ожидают server owner">React TS · MVP</span><StatusToken label={model.projectionSource === "server" ? "PostgreSQL read" : "snapshot fallback"} tone={model.projectionSource === "server" ? "success" : "warning"} /></>} />;
  const sidebar = <ModuleSidebar label="Список заказ-нарядов" title="Заказ-наряды">{model.queue.map((item) => <SidebarItem active={item.active} count={item.operationCount} key={item.id} label={item.title} meta={<>{item.meta} · {item.statusLabel}</>} onClick={() => void navigate({ type: "select-route", id: item.id })} />)}</ModuleSidebar>;
  return <ModulePage header={header} sidebar={sidebar}><section className="workspace-main planning-order-workspace" data-planning-workbench-react>
    {model.canActivate ? <>
      <Panel heading={<div className="panel-heading"><div><StatusToken label={model.decision.title} tone={model.decision.tone} /><h2>{model.headerDescription}</h2><p>{model.decision.subtitle}</p></div><ActionButton disabled title="Серверная команда размещения в Гант ещё не подключена">Передать в планирование</ActionButton></div>}>
        {model.employeeElevationAvailable ? <div className="planning-order-command-auth" data-react-planning-employee-elevation><div><strong>Подтвердите текущего сотрудника</strong><p>Для изменения даты старта нужна подписанная серверная сессия и право planning:edit.</p></div><ActionButton disabled={elevating} onClick={() => void requestElevation()}>{elevating ? "Открываем…" : "Подтвердить PIN"}</ActionButton></div> : null}
        {!model.canEditStartDate && !model.employeeElevationAvailable && model.employeeAuthMessage ? <p className="react-nomenclature-command-error" role="status">{model.employeeAuthMessage}</p> : null}
        <MetricGrid label="Готовность заказ-наряда">{model.metrics.map((metric) => <MetricCard key={metric.id} label={metric.label} value={metric.value} meta={metric.meta} />)}</MetricGrid>
        <div className="planning-order-decision-actions" data-react-planning-decision-actions>
          <form className="planning-order-decision-start-date" data-react-planning-start-date-form onSubmit={(event) => { event.preventDefault(); void saveStartDate(startDateReconcilePending && startDateRequest.current ? startDateRequest.current.planningStartDate : startDateDraft); }}>
            <label className="planning-order-start-date-control planning-order-decision-date" title="Плановый старт сохраняется в заказ-наряде. Уже размещённые слоты меняются отдельно в Ганте."><span>Старт первой операции</span><input aria-label="Старт первой операции" disabled={!model.canEditStartDate || savingStartDate || startDateReconcilePending} onChange={(event) => { if (startDateReconcilePending) return; setStartDateDraft(event.currentTarget.value); setStartDateError(""); }} type="date" value={startDateDraft} /><small>{startDateReconcilePending ? "Ожидает подтверждения legacy-зеркала" : model.serverScheduledStartDateSource === "server-slot" ? `Гант: ${model.serverScheduledStartDate}` : "До размещения в Ганте"}</small></label>
            <button className="action" disabled={!model.canEditStartDate || savingStartDate || (!startDateReconcilePending && (!startDateDraft || startDateDraft === model.planningStartDate))} type="submit">{savingStartDate ? "Проверка…" : startDateReconcilePending ? "Проверить legacy-зеркало" : "Сохранить дату"}</button>
            <button className="action" data-react-planning-start-date-clear disabled={!model.canEditStartDate || savingStartDate || startDateReconcilePending || !model.planningStartDate} onClick={() => void saveStartDate(null)} type="button">Очистить дату</button>
          </form>
          <form className="planning-order-decision-quantity" data-react-planning-quantity-form onSubmit={(event) => { event.preventDefault(); void saveQuantity(); }}><label><span>Тираж, шт.</span><input disabled={!model.canEditQuantity || saving} min="1" name="quantity" onChange={(event) => setQuantityDraft(event.currentTarget.value)} required step="1" type="number" value={quantityDraft} /><small>{model.startDateReconciliation ? "Сначала проверьте дату старта" : model.canEditQuantity ? "PostgreSQL owner готов" : "Серверный владелец тиража не подтверждён"}</small></label><button className="action action--primary" disabled={!model.canEditQuantity || saving} type="submit">{saving ? "Сохранение…" : "Сохранить тираж"}</button></form>
        </div>
        {selectedSlotRow ? <form className="planning-order-decision-start-date" data-react-planning-slot-form onSubmit={(event) => { event.preventDefault(); void saveSlot(); }}><label className="planning-order-start-date-control"><span>Начало выбранной операции</span><input data-react-planning-slot-start disabled={!model.canEditSlotSchedule || selectedSlotRow.locked || savingSlot} onChange={(event) => { setSlotStartDraft(event.currentTarget.value); setSlotError(""); }} required type="datetime-local" value={slotStartDraft} /><small>{selectedSlotRow.locked ? "Слот заблокирован" : model.canEditSlotSchedule ? `PostgreSQL slot ${selectedSlotRow.slotId}` : "Серверный владелец слота не подтверждён"}</small></label><button className="action action--primary" disabled={!model.canEditSlotSchedule || selectedSlotRow.locked || savingSlot || !slotStartDraft || slotStartDraft === dateTimeInput(selectedSlotRow.plannedStart)} type="submit">{savingSlot ? "Сохранение…" : "Сохранить начало операции"}</button></form> : null}
        <div className="planning-order-command-auth" data-react-planning-deferred-actions role="status"><div><strong>Операции без серверного владельца заблокированы</strong><p>Трудозатраты, первичное размещение и отмена не вызывают legacy-код. Они будут включены после подключения owner-команд.</p></div></div>
        {startDateError ? <p className="react-nomenclature-command-error" role="alert">{startDateError}</p> : null}
        {commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}
        {slotError ? <p className="react-nomenclature-command-error" role="alert">{slotError}</p> : null}
      </Panel>
      <Panel heading={<div><h2>Дерево заказ-наряда</h2><p>{model.quantity.toLocaleString("ru-RU")} шт. · только чтение</p></div>}>
        {navigationError ? <p className="react-nomenclature-command-error" role="alert">{navigationError}</p> : null}
        <TableWrap><table aria-busy={navigating} className="planning-order-table"><thead><tr><th>Объект / операция</th><th>Плановая длительность</th><th>Контекст</th><th>Кол-во</th><th>Состояние</th></tr></thead><tbody>{model.rows.map((row) => <tr className={`${row.kind === "task" ? "planning-order-object-row" : "planning-order-step-row"}${row.selected ? " is-selected" : ""}`} data-planning-order-row={row.id} key={row.id}><td><button disabled={navigating} onClick={() => void navigate({ type: "select-item", id: row.id })} type="button"><strong>{row.level ? "↳ " : ""}{row.title}</strong>{" "}<small>{row.meta}</small></button></td><td><strong>{row.labor}</strong>{" "}<small>{row.laborMeta}</small></td><td><strong>{row.context}</strong>{" "}<small>{row.contextMeta}</small></td><td><strong>{row.quantity.toLocaleString("ru-RU")}</strong>{" "}<small>{row.unit}</small></td><td><StatusToken label={row.statusLabel} tone={row.statusTone} /></td></tr>)}</tbody></table></TableWrap>
      </Panel>
    </> : <EmptyState title={model.detailLoading ? "Загружаем состав заказ-наряда" : "Заказ-наряд не выбран"} text="React подключается только к завершённой PostgreSQL read-модели." />}
  </section></ModulePage>;
}
