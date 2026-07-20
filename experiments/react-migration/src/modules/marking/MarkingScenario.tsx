import { useMemo, useState } from "react";
import { ActionButton, MetricCard, MetricGrid, ModuleHeader, ModulePage, Panel, StatusToken, TableWrap } from "../../ui/components";
import { ModalOverlay } from "../../ui/ModalOverlay";
import { createKits, createMarkingDemoState, historyItem, taskMetrics, type MarkingDemoState, type MarkingTab, type MarkingTask } from "./model";

const number = (value: number) => value.toLocaleString("ru-RU");
const time = (value: string) => new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const statusView = {
  new: { label: "Новое", tone: "neutral" as const },
  prepared: { label: "Комплекты созданы", tone: "warning" as const },
  marked: { label: "Маркировка завершена", tone: "success" as const },
  transferred: { label: "Передано", tone: "success" as const },
};

export function MarkingScenario({ payload }: { payload: unknown }) {
  const contract = payload && typeof payload === "object" ? payload as { mode?: string; persistence?: string } : {};
  const [state, setState] = useState<MarkingDemoState>(() => createMarkingDemoState());
  const [tab, setTab] = useState<MarkingTab>("kits");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const selected = state.tasks.find((task) => task.id === state.selectedTaskId) || state.tasks[0];
  const metrics = useMemo(() => taskMetrics(selected), [selected]);

  const updateTask = (updater: (task: MarkingTask) => MarkingTask) => {
    setState((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === current.selectedTaskId ? updater(task) : task) }));
  };
  const addKits = (count: number) => updateTask((task) => {
    const kits = createKits(task, count, task.kits.length > 0);
    return { ...task, status: "prepared", kits: [...task.kits, ...kits], history: [historyItem("MOCK-комплекты созданы", `${count} мультипликаций · ${number(count * task.boardsPerKit)} плат`), ...task.history] };
  });
  const printRemaining = () => updateTask((task) => {
    const remaining = task.kits.filter((kit) => !kit.printed);
    if (!remaining.length) return task;
    const batch = { id: `MOCK-PB-${task.batches.length + 1}`, createdAt: new Date().toISOString(), kitCount: remaining.length, labelCount: remaining.reduce((sum, kit) => sum + kit.individualCodes.length + 1, 0), status: "confirmed" as const };
    return { ...task, kits: task.kits.map((kit) => ({ ...kit, printed: true })), batches: [batch, ...task.batches], history: [historyItem("Печать подтверждена", `${batch.kitCount} комплектов · ${number(batch.labelCount)} этикеток · тестовый адаптер`), ...task.history] };
  });
  const complete = () => updateTask((task) => ({ ...task, status: "marked", history: [historyItem("Маркировка завершена", `${number(task.kits.length)} комплектов подготовлено к передаче`), ...task.history] }));
  const transfer = () => updateTask((task) => ({ ...task, status: "transferred", history: [historyItem("Партия передана", `Следующий участок: ${task.nextArea}`), ...task.history] }));
  const reset = () => { setState(createMarkingDemoState()); setTab("kits"); setQuery(""); setSearched(false); };
  const normalizedQuery = query.trim().toUpperCase();
  const searchResult = searched ? state.tasks.flatMap((task) => task.kits.map((kit) => ({ task, kit }))).find(({ kit }) => kit.masterCode === normalizedQuery || kit.individualCodes.includes(normalizedQuery)) : undefined;

  return <ModulePage className="marking-react" label="Маркировка" header={<ModuleHeader eyebrow="Оперативное управление" title="Маркировка" badge={<span className="marking-demo-badge">DEMO · MEMORY ONLY</span>} />}>
    <div className="marking-demo-boundary" role="note"><strong>Демонстрационный модуль</strong><span>Все данные и действия — MOCK. Нет API, БД и сохранения; перезагрузка сбрасывает их.</span><code>{contract.mode || "mock"} · {contract.persistence || "memory-only"}</code></div>
    <section className="marking-react-layout">
      <Panel heading={<div className="panel-heading"><div><p>Рабочая очередь</p><h2>Задания маркировки</h2></div><StatusToken label={`${state.tasks.length} MOCK`} tone="neutral" /></div>}>
        <div className="marking-task-list" data-marking-task-list>{state.tasks.map((task) => {
          const taskState = taskMetrics(task); const view = statusView[task.status];
          return <button aria-pressed={task.id === selected.id} className={task.id === selected.id ? "is-current" : ""} data-marking-task={task.id} key={task.id} onClick={() => { setState((current) => ({ ...current, selectedTaskId: task.id })); setTab("kits"); }} type="button">
            <span><small>{task.id} · {task.workOrder}</small><strong>{task.product}</strong><em>{number(taskState.printedKits)} из {number(task.kits.length || task.plannedKits)} комплектов напечатано</em></span>
            <StatusToken label={view.label} tone={view.tone} />
          </button>;
        })}</div>
      </Panel>

      <Panel heading={<div className="panel-heading marking-detail-heading"><div><p>{selected.id} · {selected.workOrder}</p><h2>{selected.title}</h2><small>{selected.product}</small></div><StatusToken label={statusView[selected.status].label} tone={statusView[selected.status].tone} /></div>}>
        <div className="marking-detail" data-marking-detail={selected.id}>
          <MetricGrid label="Параметры маркировки"><MetricCard label="Комплекты" value={number(selected.kits.length)} meta={`план ${number(selected.plannedKits)}`} /><MetricCard label="Платы" value={number(metrics.boards)} meta={`план ${number(selected.planBoards)}`} /><MetricCard label="Напечатано" value={number(metrics.printedBoards)} meta={`${number(metrics.remainingKits)} комплектов осталось`} /><MetricCard label="Этикетки" value={number(metrics.labels)} meta="мастер + индивидуальные" /></MetricGrid>
          <section className="marking-parameters"><div><span>Плат в мультипликации</span><strong>{selected.boardsPerKit}</strong></div><div><span>Мастер-этикетка</span><strong>30 × 20 мм</strong></div><div><span>Индивидуальная</span><strong>12 × 8 мм</strong></div><div><span>Следующий участок</span><strong>{selected.nextArea}</strong></div></section>
          <div className="marking-actions" data-ui-action-scope="domain:marking">
            {!selected.kits.length ? <ActionButton onClick={() => addKits(Math.min(selected.plannedKits, 20))}>Создать тестовые комплекты</ActionButton> : null}
            {selected.kits.length ? <ActionButton onClick={() => addKits(5)} variant="secondary">Добавить 5 комплектов</ActionButton> : null}
            {metrics.remainingKits ? <ActionButton onClick={printRemaining}>Печать · тестовый адаптер</ActionButton> : null}
            {selected.kits.length > 0 && metrics.remainingKits === 0 && selected.status === "prepared" ? <ActionButton onClick={complete}>Завершить маркировку</ActionButton> : null}
            {selected.status === "marked" ? <ActionButton onClick={transfer}>Подтвердить передачу</ActionButton> : null}
            <ActionButton onClick={() => { setSearchOpen(true); setSearched(false); }} variant="secondary"><span data-marking-code-search>Проверить код</span></ActionButton>
            <ActionButton onClick={reset} variant="secondary">Сбросить DEMO</ActionButton>
          </div>
          <nav className="marking-tabs" aria-label="Данные задания">{(["kits", "batches", "history"] as MarkingTab[]).map((item) => <button aria-pressed={tab === item} key={item} onClick={() => setTab(item)} type="button">{item === "kits" ? `Комплекты · ${selected.kits.length}` : item === "batches" ? `Партии печати · ${selected.batches.length}` : `История · ${selected.history.length}`}</button>)}</nav>
          {tab === "kits" ? <TableWrap><table className="ui-table marking-table"><thead><tr><th>№</th><th>Мастер-код</th><th>Индивидуальные коды</th><th>Создание</th><th>Печать</th></tr></thead><tbody>{selected.kits.slice(0, 25).map((kit) => <tr key={kit.id}><td>{kit.sequence}</td><td><code>{kit.masterCode}</code></td><td><code>{kit.individualCodes[0]} … {kit.individualCodes.at(-1)}</code><small>{kit.individualCodes.length} кодов</small></td><td>{kit.createdAfterStart ? "После запуска" : "Исходный"}</td><td><StatusToken label={kit.printed ? "Подтверждено" : "Не отправлено"} tone={kit.printed ? "success" : "neutral"} /></td></tr>)}</tbody></table>{!selected.kits.length ? <div className="marking-empty"><strong>Комплекты ещё не созданы</strong><span>Используйте демонстрационное действие выше.</span></div> : null}</TableWrap> : null}
          {tab === "batches" ? <div className="marking-batches">{selected.batches.map((batch) => <article key={batch.id}><div><small>{time(batch.createdAt)}</small><strong>{batch.id}</strong></div><span>{batch.kitCount} комплектов · {number(batch.labelCount)} этикеток</span><StatusToken label="Подтверждено" tone="success" /></article>)}{!selected.batches.length ? <div className="marking-empty"><strong>Печатей ещё нет</strong><span>Партия появится после тестовой печати.</span></div> : null}</div> : null}
          {tab === "history" ? <div className="marking-history">{selected.history.map((item) => <article key={item.id}><time>{time(item.at)}</time><div><strong>{item.action}</strong><span>{item.detail}</span></div></article>)}</div> : null}
        </div>
      </Panel>
    </section>
    {searchOpen ? <ModalOverlay className="marking-search-modal" eyebrow="Только просмотр · MOCK" label="Проверка кода маркировки" onClose={() => setSearchOpen(false)} title="Проверить код">
      <div className="marking-search"><label><span>Мастер-код или код платы</span><div><input onChange={(event) => { setQuery(event.currentTarget.value.toUpperCase()); setSearched(false); }} placeholder={selected.kits[0]?.masterCode || "Введите код"} value={query} /><ActionButton disabled={!query.trim()} onClick={() => setSearched(true)}>Найти</ActionButton></div></label>{searchResult ? <section className="marking-search-result"><StatusToken label="Найдено" tone="success" /><strong>{searchResult.task.product}</strong><span>{searchResult.task.workOrder} · комплект № {searchResult.kit.sequence}</span><code>{normalizedQuery}</code></section> : searched ? <div className="marking-empty"><strong>Код не найден в MOCK-состоянии</strong><span>Производственные источники в фазе 1 не подключены.</span></div> : <p>Можно вставить один из кодов выбранного задания. Поиск не изменяет состояние MES.</p>}</div>
    </ModalOverlay> : null}
  </ModulePage>;
}
