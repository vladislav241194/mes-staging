import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  History,
  Menu,
  PackageCheck,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  Send,
  Smartphone,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { createInitialState } from "./testData";
import { createKits, event, findCode, makeBatch, taskStats } from "./model";
import { testPrintAdapter } from "./printAdapter";
import type { MarkingTask, PrintBatch, PrintStatus, PrototypeState, TaskStatus } from "./types";

const PAGE_SIZE = 25;
const logoUrl = new URL("../../../assets/brand/mes_logo_high_quality.svg", import.meta.url).href;

const statusLabel: Record<TaskStatus, string> = {
  new: "Новое",
  prepared: "Комплекты созданы",
  printing: "Идёт печать",
  marked: "Маркировка завершена",
  transferred: "Передано",
};

const printStatusLabel: Record<PrintStatus, string> = {
  "not-sent": "Не отправлено",
  sent: "Отправлено",
  awaiting: "Ожидает подтверждения",
  confirmed: "Печать подтверждена",
  error: "Ошибка печати",
  reprinted: "Перепечатано",
};

const formatTime = (value: string) => new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(value));

const number = (value: number) => new Intl.NumberFormat("ru-RU").format(value);

function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`badge badge-${status}`}>{statusLabel[status]}</span>;
}

function App() {
  const [state, setState] = useState<PrototypeState>(createInitialState);
  const [mobileNav, setMobileNav] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [reprintRequest, setReprintRequest] = useState<{ batchId: string; scope: PrintBatch["scope"]; targetCode?: string } | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const task = state.tasks.find((item) => item.id === state.selectedTaskId) ?? state.tasks[0];

  const updateTask = (updater: (current: MarkingTask) => MarkingTask) => {
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((item) => item.id === task.id ? updater(item) : item),
    }));
  };

  const resetPrototype = () => {
    const initial = createInitialState();
    setState(initial);
    setToast("MOCK-состояние восстановлено в памяти");
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand"><img alt="MES Line" src={logoUrl} /><div><b>MES Line</b><span>рабочие места</span></div></div>
        <nav>
          <span className="nav-section">Специализированные модули</span>
          <button className="active"><QrCode size={18} /> Маркировка</button>
          <button disabled><Boxes size={18} /> SMT · отдельный модуль</button>
          <button disabled><PackageCheck size={18} /> Склад · отдельный модуль</button>
          <span className="nav-section">Инструменты</span>
          <button onClick={() => setScannerOpen(true)}><Search size={18} /> Проверить код</button>
        </nav>
        <div className="prototype-stamp"><CircleDot size={15} /><div><b>MOCK · Pilot preview</b><span>Нет API, БД и сохранения</span></div></div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Меню"><Menu /></button>
          <div className="breadcrumbs">Оперативное управление <span>/</span> <b>Маркировка</b></div>
          <div className="top-actions">
            <button className="scan-button" onClick={() => setScannerOpen(true)}><QrCode size={18} /><span>Проверить код</span></button>
            <div className="user"><div className="avatar">АС</div><div><b>Анна Соколова</b><span>Участок маркировки</span></div></div>
          </div>
        </header>

        <div className="page">
          <div className="page-heading">
            <div><div className="eyebrow">Отдельный модуль рабочего места</div><h1>Маркировка</h1><p>Очередь задания → подготовка кодов → печать → передача</p></div>
            <div className="heading-actions">
              <button className="button secondary" onClick={resetPrototype}><RotateCcw size={17} /> Сбросить MOCK</button>
              <div className="test-flag">MOCK · MEMORY ONLY</div>
            </div>
          </div>

          <div className="content-grid">
            <section className="panel task-board">
              <div className="panel-header"><div><h2>Очередь маркировки</h2><span>Активно: {state.tasks.filter((item) => item.status !== "transferred").length} · все данные MOCK</span></div></div>
              <div className="task-list">
                {state.tasks.map((item) => <TaskRow key={item.id} task={item} selected={item.id === task.id} onSelect={() => setState((current) => ({ ...current, selectedTaskId: item.id }))} />)}
              </div>
            </section>

            <section className="panel detail-panel">
              <TaskDetail
                task={task}
                updateTask={updateTask}
                onPrint={() => setPrintOpen(true)}
                onExtra={() => setExtraOpen(true)}
                onTransfer={() => setTransferOpen(true)}
                setToast={setToast}
                onReprint={(batch, scope, targetCode) => { setReprintRequest({ batchId: batch.id, scope, targetCode }); setPrintOpen(true); }}
              />
            </section>
          </div>
        </div>
      </main>

      {scannerOpen && <Scanner state={state} onClose={() => setScannerOpen(false)} />}
      {printOpen && <PrintDialog task={task} sourceBatch={task.batches.find((item) => item.id === reprintRequest?.batchId)} reprintScope={reprintRequest?.scope} targetCode={reprintRequest?.targetCode} onClose={() => { setPrintOpen(false); setReprintRequest(null); }} updateTask={updateTask} setToast={setToast} />}
      {extraOpen && <ExtraDialog task={task} onClose={() => setExtraOpen(false)} updateTask={updateTask} setToast={setToast} />}
      {transferOpen && <TransferDialog task={task} onClose={() => setTransferOpen(false)} updateTask={updateTask} setToast={setToast} />}
      {toast && <div className="toast"><Check size={18} />{toast}</div>}
    </div>
  );
}

function TaskRow({ task, selected, onSelect }: { task: MarkingTask; selected: boolean; onSelect: () => void }) {
  const stats = taskStats(task);
  const configuredKits = task.kits.length || task.multiplicationCount;
  return (
    <button className={`task-row ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className="task-row-top"><b>MOCK · {task.id}</b><StatusBadge status={task.status} /></div>
      <strong>{task.product}</strong><span>{task.workOrder}</span>
      <div className="task-progress"><i style={{ width: `${configuredKits ? Math.min(100, stats.printedKits / configuredKits * 100) : 0}%` }} /></div>
      <div className="task-metrics"><span>{number(stats.printedKits)} из {number(configuredKits)} комплектов напечатано</span></div>
      {stats.overPlan && <div className="row-alert"><AlertTriangle size={14} /> Превышение плана</div>}
    </button>
  );
}

function TaskDetail({ task, updateTask, onPrint, onExtra, onTransfer, onReprint, setToast }: {
  task: MarkingTask;
  updateTask: (updater: (current: MarkingTask) => MarkingTask) => void;
  onPrint: () => void;
  onExtra: () => void;
  onTransfer: () => void;
  onReprint: (batch: PrintBatch, scope: PrintBatch["scope"], targetCode?: string) => void;
  setToast: (value: string) => void;
}) {
  const stats = taskStats(task);
  const [multiplications, setMultiplications] = useState(task.multiplicationCount);
  const [boards, setBoards] = useState(task.boardsPerMultiplication);
  const [tab, setTab] = useState<"kits" | "batches" | "history">("kits");
  const [page, setPage] = useState(1);

  useEffect(() => { setMultiplications(task.multiplicationCount); setBoards(task.boardsPerMultiplication); setPage(1); }, [task.id, task.multiplicationCount, task.boardsPerMultiplication]);

  const generated = task.kits.length > 0;
  const hasPrinted = stats.printedKits > 0;
  const calculatedBoards = multiplications * boards;
  const create = () => {
    if (multiplications < 1 || boards < 1) return;
    updateTask((current) => ({
      ...current,
      multiplicationCount: multiplications,
      boardsPerMultiplication: boards,
      status: "prepared",
      kits: createKits({ ...current, kits: [] }, multiplications, boards, false),
      history: [event("Тестовые комплекты созданы", `${number(multiplications)} мультипликаций · ${number(calculatedBoards)} плат`, "success"), ...current.history],
    }));
    setToast(`Создано ${number(multiplications)} тестовых комплектов`);
  };

  const completeMarking = () => {
    updateTask((current) => ({ ...current, status: "marked", history: [event("Маркировка завершена", `Подтверждено для ${number(taskStats(current).printedKits)} напечатанных комплектов`, "success"), ...current.history] }));
    setToast("Завершение маркировки зафиксировано локально");
  };

  const undoTransfer = () => {
    updateTask((current) => ({ ...current, status: "marked", history: [event("Передача отменена", `Партия возвращена с участка: ${current.nextArea}`, "warning"), ...current.history] }));
    setToast("Передача отменена");
  };

  const visibleKits = task.kits.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(task.kits.length / PAGE_SIZE));

  return <>
    <div className="detail-head">
      <div><div className="task-id">MOCK · {task.id}</div><h2>{task.title}</h2><p>{task.product} · {task.workOrder}</p></div>
      <StatusBadge status={task.status} />
    </div>

    {stats.overPlan && <div className="alert warning"><AlertTriangle /><div><b>Количество выше плана на {number(stats.totalBoards - task.planBoards)} плат</b><span>Продолжение разрешено. Действие будет зафиксировано в журнале.</span></div></div>}

    <section className="configuration">
      <div className="section-title"><div><h3>Подготовка партии</h3><span>План {number(task.planBoards)} плат · {hasPrinted ? "размер группы заблокирован после печати" : "параметры доступны до первой печати"}</span></div></div>
      <div className="configuration-grid">
        <label>Количество мультипликаций<input type="number" min={hasPrinted ? stats.printedKits : 1} max={5000} value={multiplications} disabled={generated} onChange={(e) => setMultiplications(Number(e.target.value))} /></label>
        <label>Плат в мультипликации<input type="number" min={1} max={200} value={boards} disabled={generated || hasPrinted} onChange={(e) => setBoards(Number(e.target.value))} /></label>
        <div className="calculation"><span>Мастер-коды <b>{number(generated ? stats.masterCodes : multiplications)}</b></span><span>Индивидуальные <b>{number(generated ? stats.individualCodes : calculatedBoards)}</b></span><span className="total">Всего этикеток <b>{number(generated ? stats.totalLabels : multiplications + calculatedBoards)}</b></span></div>
      </div>
      <div className="label-sizes"><span><QrCode size={17} /> Мастер-этикетка <b>{task.masterLabel}</b></span><span><QrCode size={15} /> Индивидуальная <b>{task.individualLabel}</b></span></div>
      <div className="action-row">
        {!generated && <button className="button primary" onClick={create}><Boxes size={18} /> Создать тестовые комплекты</button>}
        {generated && <button className="button primary" onClick={onPrint}><Printer size={18} /> Печать</button>}
        {generated && <button className="button secondary" onClick={onExtra}><Boxes size={18} /> Добавить комплекты</button>}
        {stats.printedKits > 0 && task.status !== "marked" && task.status !== "transferred" && <button className="button success" onClick={completeMarking}><Check size={18} /> Завершить маркировку</button>}
        {task.status === "marked" && <button className="button success" onClick={onTransfer}><Send size={18} /> Подтвердить передачу</button>}
        {task.status === "transferred" && <button className="button danger-ghost" onClick={undoTransfer}><RotateCcw size={18} /> Отменить передачу</button>}
      </div>
    </section>

    <div className="tabs"><button className={tab === "kits" ? "active" : ""} onClick={() => setTab("kits")}>Комплекты <span>{number(task.kits.length)}</span></button><button className={tab === "batches" ? "active" : ""} onClick={() => setTab("batches")}>Партии печати <span>{task.batches.length}</span></button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>История <span>{task.history.length}</span></button></div>

    {tab === "kits" && <div className="table-wrap"><table><thead><tr><th>№</th><th>Мастер-код</th><th>Индивидуальные коды</th><th>Создан</th><th>Печать</th></tr></thead><tbody>{visibleKits.map((kit) => <tr key={kit.id}><td>{kit.sequence}</td><td><code>{kit.masterCode}</code></td><td><span className="code-range">{kit.individualCodes[0]} … {kit.individualCodes.at(-1)}</span><small>{kit.individualCodes.length} кодов</small></td><td>{kit.createdAfterStart ? <span className="after-start">После запуска</span> : "Исходный"}</td><td><span className={`print-state ${kit.printStatus}`}>{printStatusLabel[kit.printStatus]}</span></td></tr>)}</tbody></table>{task.kits.length === 0 && <Empty text="Комплекты ещё не созданы" />}{task.kits.length > PAGE_SIZE && <div className="pagination"><span>Показано {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, task.kits.length)} из {number(task.kits.length)}</span><div><button disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft /></button><b>{page} / {pages}</b><button disabled={page === pages} onClick={() => setPage(page + 1)}><ChevronRight /></button></div></div>}</div>}
    {tab === "batches" && <div className="batch-list">{task.batches.map((batch) => {
      const firstKit = task.kits.find((kit) => batch.kitIds.includes(kit.id));
      return <div className="batch-card" key={batch.id}><div className="batch-icon"><Printer /></div><div><b>{batch.id}</b><span>{formatTime(batch.createdAt)} · {batch.kitIds.length} комплектов · попытка {batch.attempt}{batch.targetCode ? ` · ${batch.targetCode}` : ""}</span></div><span className={`print-state ${batch.status}`}>{printStatusLabel[batch.status]}</span><div className="reprint-actions"><button onClick={() => onReprint(batch, "batch")}><RotateCcw /> Партия</button><button disabled={!firstKit} onClick={() => onReprint(batch, "kit")}>Мультипликация</button><button disabled={!firstKit} onClick={() => onReprint(batch, "master", firstKit?.masterCode)}>Мастер-код</button><button disabled={!firstKit} onClick={() => onReprint(batch, "individual", firstKit?.individualCodes[0])}>Код платы</button></div></div>;
    })}{task.batches.length === 0 && <Empty text="Партии печати появятся после тестовой отправки" />}</div>}
    {tab === "history" && <div className="history-list">{task.history.map((item) => <div className={`history-row ${item.tone ?? "info"}`} key={item.id}><div className="history-dot" /><div><b>{item.action}</b><span>{item.detail}</span><small>{formatTime(item.at)} · {item.actor}</small></div></div>)}</div>}
  </>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="fact"><span>{label}</span><b>{value}</b></div>; }
function Empty({ text }: { text: string }) { return <div className="empty"><Boxes /><b>{text}</b><span>Тестовое состояние не влияет на MES</span></div>; }

function Dialog({ children, title, subtitle, onClose, wide = false }: { children: React.ReactNode; title: string; subtitle: string; onClose: () => void; wide?: boolean }) {
  return <div className="overlay" role="dialog" aria-modal="true"><div className={`dialog ${wide ? "dialog-wide" : ""}`}><div className="dialog-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose}><X /></button></div>{children}</div></div>;
}

function PrintDialog({ task, sourceBatch, reprintScope = "batch", targetCode, onClose, updateTask, setToast }: { task: MarkingTask; sourceBatch?: PrintBatch; reprintScope?: PrintBatch["scope"]; targetCode?: string; onClose: () => void; updateTask: (updater: (current: MarkingTask) => MarkingTask) => void; setToast: (value: string) => void }) {
  const available = task.kits.filter((kit) => kit.printStatus !== "confirmed" && kit.printStatus !== "reprinted");
  const [scope, setScope] = useState<"all" | "partial">(sourceBatch ? "all" : "partial");
  const [count, setCount] = useState(sourceBatch?.kitIds.length || Math.min(10, available.length));
  const [pendingBatch, setPendingBatch] = useState<PrintBatch | null>(null);
  const [sending, setSending] = useState(false);
  const selectedIds = sourceBatch
    ? (reprintScope === "batch" ? sourceBatch.kitIds : sourceBatch.kitIds.slice(0, 1))
    : (scope === "all" ? available : available.slice(0, count)).map((kit) => kit.id);
  const selectedKits = task.kits.filter((kit) => selectedIds.includes(kit.id));
  const masterLabels = sourceBatch && reprintScope === "individual" ? 0 : sourceBatch && reprintScope === "master" ? 1 : selectedIds.length;
  const individualLabels = sourceBatch && reprintScope === "master" ? 0 : sourceBatch && reprintScope === "individual" ? 1 : selectedKits.reduce((sum, kit) => sum + kit.individualCodes.length, 0);

  const send = async () => {
    if (!selectedIds.length) return;
    setSending(true);
    const batch = makeBatch(selectedIds, sourceBatch ? reprintScope : scope, sourceBatch?.id, targetCode);
    await testPrintAdapter.send(batch, masterLabels + individualLabels);
    updateTask((current) => ({ ...current, status: "printing", batches: [batch, ...current.batches], history: [event(sourceBatch ? "Перепечать отправлена" : "Печать отправлена", `${batch.id} · ${selectedIds.length} комплектов · тестовый адаптер`, "info"), ...current.history] }));
    setPendingBatch(batch);
    setSending(false);
  };

  const resolve = (success: boolean) => {
    if (!pendingBatch) return;
    updateTask((current) => ({
      ...current,
      batches: current.batches.map((batch) => batch.id === pendingBatch.id ? { ...batch, status: success ? (sourceBatch ? "reprinted" : "confirmed") : "error" } : batch),
      kits: current.kits.map((kit) => pendingBatch.kitIds.includes(kit.id) ? {
        ...kit,
        printStatus: success ? (sourceBatch ? "reprinted" : "confirmed") : "error",
        printCount: success ? kit.printCount + 1 : kit.printCount,
        batchIds: [...kit.batchIds, pendingBatch.id],
      } : kit),
      history: [event(success ? (sourceBatch ? "Перепечать подтверждена" : "Печать подтверждена") : "Ошибка печати", `${pendingBatch.id} · ${pendingBatch.kitIds.length} комплектов`, success ? "success" : "danger"), ...current.history],
    }));
    setToast(success ? "Тестовая печать подтверждена" : "Ошибка тестовой печати зарегистрирована");
    onClose();
  };

  const reprintTitle: Record<string, string> = { batch: "Повторная печать партии", kit: "Перепечать мультипликацию", master: "Перепечать мастер-код", individual: "Перепечать код платы" };
  return <Dialog title={sourceBatch ? reprintTitle[reprintScope] : "Печать этикеток"} subtitle="Локальный тестовый адаптер · физический принтер не используется" onClose={onClose}>
    <div className="simulated-banner"><Printer /><div><b>Имитируемое действие</b><span>Отправка создаёт только локальную запись. Затем отдельно подтвердите результат.</span></div></div>
    {!sourceBatch && <div className="segmented"><button className={scope === "partial" ? "active" : ""} onClick={() => setScope("partial")}>Часть объёма</button><button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>Весь остаток</button></div>}
    {scope === "partial" && !sourceBatch && <label className="field">Количество мультипликаций<input type="number" min={1} max={available.length} value={count} onChange={(e) => setCount(Math.min(available.length, Math.max(1, Number(e.target.value))))} /></label>}
    {targetCode && <div className="target-code"><span>Идентификатор не изменяется</span><code>{targetCode}</code></div>}
    <div className="print-summary"><div><span>Мастер-этикетки</span><b>{number(masterLabels)}</b><small>{task.masterLabel}</small></div><div><span>Индивидуальные</span><b>{number(individualLabels)}</b><small>{task.individualLabel}</small></div><div className="accent"><span>Всего этикеток</span><b>{number(masterLabels + individualLabels)}</b><small>{selectedIds.length} комплектов</small></div></div>
    {!pendingBatch ? <div className="dialog-actions"><button className="button secondary" onClick={onClose}>Отмена</button><button className="button primary" disabled={sending || !selectedIds.length} onClick={send}><Printer size={18} /> {sending ? "Имитация отправки…" : "Отправить в тестовый адаптер"}</button></div> : <div className="print-confirm"><div><Clock3 /><b>Ожидает подтверждения сотрудника</b><span>Отправка не считается успешной печатью</span></div><div className="dialog-actions"><button className="button danger" onClick={() => resolve(false)}><XCircle /> Ошибка печати</button><button className="button success" onClick={() => resolve(true)}><Check /> Печать выполнена</button></div></div>}
  </Dialog>;
}

function ExtraDialog({ task, onClose, updateTask, setToast }: { task: MarkingTask; onClose: () => void; updateTask: (updater: (current: MarkingTask) => MarkingTask) => void; setToast: (value: string) => void }) {
  const [count, setCount] = useState(5);
  const stats = taskStats(task);
  const projected = stats.totalBoards + count * task.boardsPerMultiplication;
  const over = projected > task.planBoards;
  const confirm = () => {
    updateTask((current) => ({ ...current, multiplicationCount: current.multiplicationCount + count, kits: [...current.kits, ...createKits(current, count, current.boardsPerMultiplication, true)], history: [event("Дополнительные комплекты созданы", `${count} комплектов после запуска${over ? ` · превышение плана на ${projected - current.planBoards} плат` : ""}`, over ? "warning" : "info"), ...current.history] }));
    setToast(`Добавлено ${count} комплектов`); onClose();
  };
  return <Dialog title="Дополнительные комплекты" subtitle="Создание после запуска задания фиксируется в журнале" onClose={onClose}><div className="alert warning"><AlertTriangle /><div><b>Подтвердите увеличение объёма</b><span>Новые уникальные тестовые коды будут добавлены к текущему заданию.</span></div></div><label className="field">Количество новых мультипликаций<input type="number" min={1} max={1000} value={count} onChange={(e) => setCount(Math.min(1000, Math.max(1, Number(e.target.value))))} /></label><div className="delta"><span>Было <b>{number(task.kits.length)}</b></span><ChevronRight /><span>Станет <b>{number(task.kits.length + count)}</b></span></div>{over && <div className="plan-over"><AlertTriangle /><div><b>План будет превышен на {number(projected - task.planBoards)} плат</b><span>Это предупреждение не блокирует действие</span></div></div>}<div className="dialog-actions"><button className="button secondary" onClick={onClose}>Отмена</button><button className="button primary" onClick={confirm}>Подтвердить и создать</button></div></Dialog>;
}

function TransferDialog({ task, onClose, updateTask, setToast }: { task: MarkingTask; onClose: () => void; updateTask: (updater: (current: MarkingTask) => MarkingTask) => void; setToast: (value: string) => void }) {
  const confirm = () => { updateTask((current) => ({ ...current, status: "transferred", history: [event("Передача подтверждена", `Следующий участок: ${current.nextArea}`, "success"), ...current.history] })); setToast("Передача подтверждена локально"); onClose(); };
  return <Dialog title="Передача партии" subtitle="Подтверждение принимающего участка не требуется" onClose={onClose}><div className="transfer-card"><span>Следующий участок</span><b>{task.nextArea}</b><small>Передаёт: Анна Соколова · текущая дата и время</small></div><div className="dialog-actions"><button className="button secondary" onClick={onClose}>Отмена</button><button className="button success" onClick={confirm}><Send /> Подтвердить передачу</button></div></Dialog>;
}

function Scanner({ state, onClose }: { state: PrototypeState; onClose: () => void }) {
  const sample = state.tasks.flatMap((task) => task.kits).at(0)?.masterCode ?? "";
  const [query, setQuery] = useState(sample);
  const [searched, setSearched] = useState(true);
  const [camera, setCamera] = useState(false);
  const result = useMemo(() => searched ? findCode(state.tasks, query) : null, [query, searched, state.tasks]);
  return <Dialog title="Проверить код" subtitle="Глобальный просмотр · без изменения производственного состояния" onClose={onClose} wide><div className="scanner-layout"><div className="scanner-input"><label>Уникальный номер<div><Search /><input value={query} onChange={(e) => { setQuery(e.target.value.toUpperCase()); setSearched(false); }} placeholder="Введите или отсканируйте код" /><button className="button primary" onClick={() => setSearched(true)}>Найти</button></div></label><button className="camera-button" onClick={() => setCamera(!camera)}><Camera /><div><b>Сканировать камерой</b><span>Интерактивный макет без распознавания</span></div></button>{camera && <div className="camera-prototype"><div className="scan-frame"><i /><i /><i /><i /><QrCode /></div><b>Прототип камеры</b><span>Наведите камеру на код · распознавание имитируется</span><button className="button secondary" onClick={() => { setQuery(sample); setSearched(true); setCamera(false); }}>Имитировать распознавание</button></div>}<div className="scanner-note"><Smartphone /><span>Поддерживается ручной ввод и внешний сканер как клавиатура.</span></div></div><div className="scan-result">{result ? <><div className="result-head"><div className="result-icon"><QrCode /></div><div><span>{result.type === "master" ? "Мастер-код мультипликации" : "Индивидуальная плата"}</span><code>{result.code}</code></div><span className="read-only">Только просмотр</span></div><div className="result-grid"><Fact label="Изделие" value={result.task.product} /><Fact label="Заказ-наряд" value={result.task.workOrder} /><Fact label="Текущий статус" value={statusLabel[result.task.status]} /><Fact label="Участок" value={result.task.status === "transferred" ? result.task.nextArea : "Участок маркировки"} /></div><section className="related"><h3>{result.type === "master" ? "Состав мультипликации" : "Связанный мастер-код"}</h3>{result.type === "master" ? <><div className="related-summary"><b>{result.kit.individualCodes.length}</b><span>индивидуальных кодов</span></div><div className="code-chips">{result.kit.individualCodes.slice(0, 8).map((code) => <code key={code}>{code}</code>)}{result.kit.individualCodes.length > 8 && <span>+{result.kit.individualCodes.length - 8}</span>}</div></> : <code className="master-link">{result.kit.masterCode}</code>}</section><section className="trace"><h3><History /> История операций</h3>{result.task.history.slice(0, 4).map((item) => <div key={item.id}><b>{item.action}</b><span>{formatTime(item.at)} · {item.actor}</span></div>)}</section><div className="placeholder-grid"><span><b>Дефекты</b>Нет открытых</span><span><b>Ремонты</b>Нет записей</span><span><b>Контроль</b>Не выполнялся</span></div></> : searched ? <div className="not-found"><XCircle /><b>Код не найден в тестовом состоянии</b><span>Производственные источники в фазе 1 не подключены.</span></div> : <div className="search-prompt"><QrCode /><b>Введите код для просмотра</b><span>Поиск ничего не изменяет</span></div>}</div></div></Dialog>;
}

export default App;
