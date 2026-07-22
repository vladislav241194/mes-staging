import { useEffect, useMemo, useState } from "react";
import { ActionButton, MetricCard, MetricGrid, ModuleHeader, ModulePage, Panel, StatusToken, SystemState, TableWrap } from "../../ui/components";
import { ModalOverlay } from "../../ui/ModalOverlay";
import { adaptMarkingHostContract, createMarkingProductionClient, type MarkingClient, type MarkingTaskActionInput } from "./api";
import { taskMetrics, type MarkingBatch, type MarkingCodeRecord, type MarkingPrintStatus, type MarkingTab, type MarkingTask } from "./model";

const number = (value: number) => value.toLocaleString("ru-RU");
const time = (value: string) => { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date) : "—"; };
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const taskStatusView: Record<MarkingTask["status"], { label: string; tone: "success" | "warning" | "neutral" }> = {
  new: { label: "Новое", tone: "neutral" }, prepared: { label: "Комплекты созданы", tone: "warning" }, printing: { label: "Печать", tone: "warning" }, marked: { label: "Маркировка завершена", tone: "success" }, transferred: { label: "Передано", tone: "success" }, error: { label: "Требует внимания", tone: "warning" },
};
const printStatusView: Record<MarkingPrintStatus, { label: string; tone: "success" | "warning" | "neutral" }> = {
  "not-sent": { label: "Не отправлено", tone: "neutral" }, sent: { label: "Отправлено", tone: "warning" }, "awaiting-confirmation": { label: "Ожидает подтверждения", tone: "warning" }, confirmed: { label: "Подтверждено", tone: "success" }, error: { label: "Ошибка печати", tone: "warning" }, reprinted: { label: "Перепечатано", tone: "success" },
};

const upsert = (tasks: MarkingTask[], next: MarkingTask) => tasks.some((task) => task.id === next.id) ? tasks.map((task) => task.id === next.id ? next : task) : [...tasks, next];

export function MarkingScenario({ payload }: { payload: unknown }) {
  const host = useMemo(() => adaptMarkingHostContract(payload), [payload]);
  const client = useMemo<MarkingClient | null>(() => host.mode === "production" && host.api ? createMarkingProductionClient(host.api) : null, [host.api, host.mode]);
  const [tasks, setTasks] = useState<MarkingTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [taskDetail, setTaskDetail] = useState<MarkingTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [commandError, setCommandError] = useState("");
  const [commandMessage, setCommandMessage] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [tab, setTab] = useState<MarkingTab>("kits");
  const [kitCountDraft, setKitCountDraft] = useState("0");
  const [boardsPerKitDraft, setBoardsPerKitDraft] = useState("0");
  const [printCountDraft, setPrintCountDraft] = useState("0");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResult, setSearchResult] = useState<MarkingCodeRecord | null>(null);

  useEffect(() => {
    setTasks([]); setTaskDetail(null); setLoadError(""); setSelectedTaskId("");
    if (!client) return undefined;
    const controller = new AbortController(); setLoading(true);
    client.getTasks(controller.signal).then((next) => {
      setTasks(next);
      setSelectedTaskId((current) => next.some((task) => task.id === current) ? current : next.find((task) => task.id === host.selectedTaskId)?.id || next[0]?.id || "");
    }).catch((error) => { if (!controller.signal.aborted) setLoadError(message(error, "Не удалось загрузить задания маркировки.")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [client, host.selectedTaskId]);

  useEffect(() => {
    setTaskDetail(null); setCommandError(""); setCommandMessage("");
    if (!client || !selectedTaskId) return undefined;
    const controller = new AbortController(); setDetailLoading(true);
    client.getTask(selectedTaskId, controller.signal).then((task) => { setTaskDetail(task); setTasks((current) => upsert(current, task)); }).catch((error) => { if (!controller.signal.aborted) setCommandError(message(error, "Не удалось загрузить карточку задания.")); }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [client, selectedTaskId]);

  const selected = taskDetail?.id === selectedTaskId ? taskDetail : tasks.find((task) => task.id === selectedTaskId) || tasks[0] || null;
  const metrics = useMemo(() => selected ? taskMetrics(selected) : null, [selected]);
  const latestBatch: MarkingBatch | null = selected?.batches[0] || null;

  useEffect(() => {
    if (!selected) return;
    setKitCountDraft(String(selected.plannedKits || selected.kitCount || 0));
    setBoardsPerKitDraft(String(selected.boardsPerKit || 0));
    setPrintCountDraft(String(selected.remainingKitCount || 0));
  }, [selected?.id, selected?.plannedKits, selected?.boardsPerKit, selected?.remainingKitCount]);

  const runAction = async (input: MarkingTaskActionInput) => {
    if (!client || !selected || pendingAction) return;
    const taskId = selected.id; setPendingAction(input.action); setCommandError(""); setCommandMessage("");
    try {
      const result = await client.runTaskAction(taskId, input);
      if (result.task) { setTaskDetail(result.task); setTasks((current) => upsert(current, result.task!)); }
      const refreshed = await Promise.allSettled([client.getTasks(), client.getTask(taskId)]);
      const listResult = refreshed[0]; const detailResult = refreshed[1];
      if (listResult.status === "fulfilled") setTasks(listResult.value);
      if (detailResult.status === "fulfilled") { const nextTask = detailResult.value; setTaskDetail(nextTask); setTasks((current) => upsert(current, nextTask)); }
      setCommandMessage(refreshed.every((item) => item.status === "rejected") ? "Действие выполнено, но обновить данные не удалось." : result.message);
    } catch (error) { setCommandError(message(error, "Сервер не выполнил действие маркировки.")); }
    finally { setPendingAction(""); }
  };

  const lookupCode = async () => {
    if (!client || !query.trim() || searchLoading) return;
    setSearchLoading(true); setSearchError(""); setSearchResult(null);
    try { setSearchResult(await client.getCode(query.trim().toUpperCase())); }
    catch (error) { setSearchError(message(error, "Код маркировки не найден.")); }
    finally { setSearchLoading(false); }
  };

  const header = <ModuleHeader eyebrow="Оперативное управление" title="Маркировка" badge={<span className="marking-demo-badge" data-react-phase-marker>REACT + TS · PHASE 1</span>} />;
  if (!client) return <ModulePage className="marking-react" label="Маркировка" header={header}><SystemState title="API маркировки не подключён" text={host.contractError || "Production mode работает только через typed payload.api; автоматический переход на MOCK запрещён."} /></ModulePage>;
  if (loading && !tasks.length) return <ModulePage className="marking-react" label="Маркировка" header={header}><SystemState title="Загружаем задания" text="Получаем назначенные задания маркировки." tone="neutral" /></ModulePage>;
  if (loadError && !tasks.length) return <ModulePage className="marking-react" label="Маркировка" header={header}><SystemState title="Задания недоступны" text={loadError} /></ModulePage>;
  if (!selected || !metrics) return <ModulePage className="marking-react" label="Маркировка" header={header}><SystemState title="Назначенных заданий нет" text="Мастерская ещё не назначила задания маркировки." tone="neutral" /></ModulePage>;

  const view = taskStatusView[selected.status];
  const configKitCount = Math.max(0, Number(kitCountDraft) || 0); const configBoards = Math.max(0, Number(boardsPerKitDraft) || 0); const printCandidates = selected.kits.filter((kit) => ["not-sent", "error"].includes(kit.printStatus)); const printCount = Math.max(0, Math.min(printCandidates.length, Number(printCountDraft) || 0)); const busy = Boolean(pendingAction); const revisionReady = selected.revision >= 1 && !detailLoading;
  return <ModulePage className="marking-react" label="Маркировка" header={header}>
    <section className="marking-react-layout">
      <Panel heading={<div className="panel-heading"><div><p>Рабочая очередь</p><h2>Задания маркировки</h2></div><StatusToken label={`${tasks.length} заданий`} tone="neutral" /></div>}>
        <div className="marking-task-list" data-marking-task-list>{tasks.map((task) => { const taskState = taskMetrics(task); const status = taskStatusView[task.status]; return <button aria-pressed={task.id === selected.id} className={task.id === selected.id ? "is-current" : ""} data-marking-task={task.id} key={task.id} onClick={() => { setSelectedTaskId(task.id); setTab("kits"); }} type="button"><span><small>{task.id} · {task.workOrder}</small><strong>{task.product}</strong><em>{number(taskState.printedKits)} из {number(task.kitCount || task.plannedKits)} комплектов напечатано</em></span><StatusToken label={status.label} tone={status.tone} /></button>; })}</div>
      </Panel>
      <Panel heading={<div className="panel-heading marking-detail-heading"><div><p>{selected.id} · {selected.workOrder}</p><h2>{selected.title}</h2><small>{selected.product}</small></div><StatusToken label={view.label} tone={view.tone} /></div>}>
        <div className="marking-detail" data-marking-detail={selected.id}>
          {detailLoading ? <p role="status">Обновляем карточку…</p> : null}{commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}{commandMessage ? <p role="status">{commandMessage}</p> : null}
          <MetricGrid label="Параметры маркировки"><MetricCard label="Комплекты" value={number(selected.kitCount)} meta={`план ${number(selected.plannedKits)}`} /><MetricCard label="Платы" value={number(metrics.boards)} meta={`план ${number(selected.planBoards)}`} /><MetricCard label="Напечатано" value={number(metrics.printedBoards)} meta={`${number(metrics.remainingKits)} комплектов осталось`} /><MetricCard label="Этикетки" value={number(metrics.labels)} meta="мастер + индивидуальные" /></MetricGrid>
          <section className="marking-parameters"><label><span>Количество мультипликаций</span><input disabled={busy} min="1" onChange={(event) => setKitCountDraft(event.currentTarget.value)} type="number" value={kitCountDraft} /></label><label><span>Плат в мультипликации</span><input disabled={busy || selected.printedKitCount > 0} min="1" onChange={(event) => setBoardsPerKitDraft(event.currentTarget.value)} type="number" value={boardsPerKitDraft} /></label><div><span>Мастер-этикетка</span><strong>{selected.masterLabelSize}</strong></div><div><span>Индивидуальная</span><strong>{selected.individualLabelSize}</strong></div><div><span>Следующий участок</span><strong>{selected.nextArea}</strong></div></section>
          {selected.overPlan ? <SystemState title="План превышен" text={`Создано ${number(selected.boardCount)} плат при плане ${number(selected.planBoards)}. Продолжение разрешено и должно журналироваться сервером.`} tone="neutral" /> : null}
          <div className="marking-actions" data-ui-action-scope="domain:marking">
            <ActionButton disabled={busy || !revisionReady || configKitCount < 1 || configBoards < 1} onClick={() => void runAction({ action: "configure", expectedRevision: selected.revision, configuredKitCount: configKitCount, boardsPerKit: configBoards, masterLabelWidthMm: selected.masterLabelWidthMm, masterLabelHeightMm: selected.masterLabelHeightMm, individualLabelWidthMm: selected.individualLabelWidthMm, individualLabelHeightMm: selected.individualLabelHeightMm })}>{pendingAction === "configure" ? "Сохраняем…" : "Сохранить параметры"}</ActionButton>
            <ActionButton disabled={busy || !revisionReady || selected.boardsPerKit < 1} onClick={() => void runAction({ action: "add-kits", expectedRevision: selected.revision, count: 5 })} variant="secondary">Добавить 5 комплектов</ActionButton>
            {printCandidates.length > 0 ? <><input aria-label="Комплектов в партии печати" disabled={busy || !revisionReady} max={printCandidates.length} min="1" onChange={(event) => setPrintCountDraft(event.currentTarget.value)} type="number" value={printCountDraft} /><ActionButton disabled={busy || !revisionReady || printCount < 1} onClick={() => void runAction({ action: "create-print-batch", expectedRevision: selected.revision, kitIds: printCandidates.slice(0, printCount).map((kit) => kit.id) })}>Создать партию печати</ActionButton></> : null}
            {latestBatch?.status === "awaiting-confirmation" ? <><ActionButton disabled={busy || !revisionReady} onClick={() => void runAction({ action: "confirm-print", expectedRevision: selected.revision, batchId: latestBatch.id, result: "confirmed" })}>Печать выполнена</ActionButton><ActionButton disabled={busy || !revisionReady} onClick={() => void runAction({ action: "confirm-print", expectedRevision: selected.revision, batchId: latestBatch.id, result: "error", errorMessage: "Оператор отметил ошибку печати" })} variant="secondary">Ошибка печати</ActionButton></> : null}
            {latestBatch && ["confirmed", "reprinted"].includes(latestBatch.status) ? <ActionButton disabled={busy || !revisionReady} onClick={() => void runAction({ action: "reprint", expectedRevision: selected.revision, scopeType: "batch", targetId: latestBatch.id })} variant="secondary">Перепечатать партию</ActionButton> : null}
            {selected.kitCount > 0 && metrics.remainingKits === 0 && selected.status !== "marked" && selected.status !== "transferred" ? <ActionButton disabled={busy || !revisionReady} onClick={() => void runAction({ action: "complete", expectedRevision: selected.revision })}>Завершить маркировку</ActionButton> : null}
            {selected.status === "marked" ? <ActionButton disabled={busy || !revisionReady || !selected.nextWorkCenterId} onClick={() => void runAction({ action: "transfer", expectedRevision: selected.revision, nextWorkCenterId: selected.nextWorkCenterId })}>Подтвердить передачу</ActionButton> : null}
            {selected.status === "transferred" ? <ActionButton disabled={busy || !revisionReady} onClick={() => void runAction({ action: "cancel-transfer", expectedRevision: selected.revision })} variant="secondary">Отменить передачу</ActionButton> : null}
            <ActionButton onClick={() => { setSearchOpen(true); setSearchResult(null); setSearchError(""); }} variant="secondary"><span data-marking-code-search>Проверить код</span></ActionButton>
          </div>
          <nav className="marking-tabs" aria-label="Данные задания">{(["kits", "batches", "history"] as MarkingTab[]).map((item) => <button aria-pressed={tab === item} key={item} onClick={() => setTab(item)} type="button">{item === "kits" ? `Комплекты · ${selected.kitCount}` : item === "batches" ? `Партии печати · ${selected.batches.length}` : `История · ${selected.history.length}`}</button>)}</nav>
          {tab === "kits" ? <TableWrap><table className="ui-table marking-table"><thead><tr><th>№</th><th>Мастер-код</th><th>Индивидуальные коды</th><th>Создание</th><th>Печать</th></tr></thead><tbody>{selected.kits.slice(0, 25).map((kit) => { const status = printStatusView[kit.printStatus]; return <tr key={kit.id}><td>{kit.sequence}</td><td><code>{kit.masterCode}</code></td><td><code>{kit.individualCodes[0]} … {kit.individualCodes.at(-1)}</code><small>{kit.individualCodes.length} кодов</small></td><td>{kit.createdAfterStart ? "После запуска" : "Исходный"}</td><td><StatusToken label={status.label} tone={status.tone} /></td></tr>; })}</tbody></table>{!selected.kits.length ? <div className="marking-empty"><strong>Комплекты ещё не созданы</strong><span>Настройте количество и создайте комплекты.</span></div> : null}</TableWrap> : null}
          {tab === "batches" ? <div className="marking-batches">{selected.batches.map((batch) => { const status = printStatusView[batch.status]; return <article key={batch.id}><div><small>{time(batch.createdAt)}</small><strong>{batch.id}</strong></div><span>{batch.kitCount} комплектов · {number(batch.labelCount)} этикеток</span><StatusToken label={status.label} tone={status.tone} /></article>; })}{!selected.batches.length ? <div className="marking-empty"><strong>Печатей ещё нет</strong><span>Создайте партию печати.</span></div> : null}</div> : null}
          {tab === "history" ? <div className="marking-history">{selected.history.map((item) => <article key={item.id}><time>{time(item.at)}</time><div><strong>{item.action}</strong><span>{item.detail}</span></div></article>)}</div> : null}
        </div>
      </Panel>
    </section>
    {searchOpen ? <ModalOverlay className="marking-search-modal" eyebrow="Только просмотр" label="Проверка кода маркировки" onClose={() => setSearchOpen(false)} title="Проверить код"><div className="marking-search"><label><span>Мастер-код или код платы</span><div><input onChange={(event) => { setQuery(event.currentTarget.value.toUpperCase()); setSearchResult(null); setSearchError(""); }} placeholder={selected.kits[0]?.masterCode || "Введите код"} value={query} /><ActionButton disabled={!query.trim() || searchLoading} onClick={() => void lookupCode()}>{searchLoading ? "Ищем…" : "Найти"}</ActionButton></div></label>{searchResult ? <section className="marking-search-result"><StatusToken label={searchResult.kind === "master" ? "Мастер-код" : searchResult.kind === "individual" ? "Код платы" : "Код"} tone="success" /><strong>{searchResult.product}</strong><span>{searchResult.workOrder} · комплект № {searchResult.kitSequence || "—"}</span><span>{searchResult.currentArea} · {searchResult.lastOperation}</span><code>{searchResult.code}</code></section> : searchError ? <div className="marking-empty" role="alert"><strong>Код не найден</strong><span>{searchError}</span></div> : <p>Поиск работает через read-only API и не изменяет производственное состояние.</p>}</div></ModalOverlay> : null}
  </ModulePage>;
}
