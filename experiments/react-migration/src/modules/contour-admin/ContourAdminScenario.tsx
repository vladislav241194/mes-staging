import { useEffect, useMemo, useState } from "react";
import { ActionButton, MetricCard, MetricGrid, ModuleHeader, OperationalPage, Panel, StatusToken, TableWrap } from "../../ui/components";
import { adaptContourAdminPayload, type ContourAdminCommand, type ContourAdminScenario as Scenario } from "./adapter";

export type ContourAdminReactCommand = { type: "execute-ops"; scenarioId: string; actionId: string; confirmed: true };
interface CommandResult { ok?: boolean; label?: string; message?: string; code?: number | string; durationMs?: number; }
interface PendingCommand { scenario: Scenario; command: ContourAdminCommand; }

export function ContourAdminScenario({ payload, onCommand }: { payload: unknown; onCommand?(command: ContourAdminReactCommand): Promise<CommandResult | void>; onRequestLegacy?(scope?: string): void }) {
  const model = useMemo(() => adaptContourAdminPayload(payload), [payload]);
  const [selectedId, setSelectedId] = useState(model.contours[0]?.id || "");
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, CommandResult>>({});
  useEffect(() => { if (!model.contours.some((item) => item.id === selectedId)) setSelectedId(model.contours[0]?.id || ""); }, [model, selectedId]);
  const selected = model.contours.find((item) => item.id === selectedId) || model.contours[0];
  const openCommand = (scenario: Scenario, command?: ContourAdminCommand) => {
    if (!model.canExecuteOps || !command) return;
    setPending({ scenario, command });
  };
  const execute = async () => {
    if (!pending || !onCommand) return;
    setRunning(true);
    try {
      const result = await onCommand({ type: "execute-ops", scenarioId: pending.scenario.id, actionId: pending.command.id, confirmed: true });
      setResults((current) => ({ ...current, [pending.command.id]: result || { ok: false, message: "Ответ операции отсутствует." } }));
      setPending(null);
    } catch (error) {
      setResults((current) => ({ ...current, [pending.command.id]: { ok: false, message: error instanceof Error ? error.message : "Операция завершилась с ошибкой." } }));
      setPending(null);
    } finally { setRunning(false); }
  };
  return <OperationalPage className="contour-admin-react" label="Контуры">
    <ModuleHeader eyebrow="Система" title="Контуры" badge={<span className="lab-badge">{model.canExecuteOps ? "React · protected Ops evaluation" : "read-only React"}</span>} />
    <MetricGrid label="Карта контуров">{model.contours.map((item) => <button aria-pressed={item.id === selected?.id} className="contour-admin-react-card" data-contour-admin-contour={item.id} key={item.id} onClick={() => setSelectedId(item.id)} type="button"><span><b>{item.label}</b><StatusToken label={item.statusLabel} tone={item.statusTone} /></span><strong>{item.domain}</strong><small>{item.title}</small></button>)}</MetricGrid>
    {selected ? <Panel heading={<div className="panel-heading"><div><p>Паспорт контура</p><h2>{selected.label}</h2></div><StatusToken label={selected.statusLabel} tone={selected.statusTone} /></div>}><div className="contour-admin-react-passport" data-contour-admin-passport={selected.id}><MetricCard label="Сейчас" value={selected.domain} /><MetricCard label="Цель" value={selected.targetDomain} /><MetricCard label="Сервис" value={selected.service} meta={`порт ${selected.port}`} /><p>{selected.dataPolicy}</p><small>{selected.releasePolicy}</small></div></Panel> : null}
    <Panel heading={<div className="panel-heading"><div><p>Защищённый Ops API</p><h2>Сценарии управления</h2></div><StatusToken label={model.canExecuteOps ? "ручное подтверждение" : "команды недоступны"} tone="warning" /></div>}><TableWrap><table className="scenario-table"><thead><tr><th>Сценарий</th><th>Направление</th><th>Ответственный</th><th>Риск</th><th>Статус</th><th>Действие</th></tr></thead><tbody>{model.scenarios.map((item) => <tr data-contour-admin-scenario={item.id} key={item.id}><td><strong>{item.label}</strong><small>{item.result}</small></td><td>{item.source} → {item.target}</td><td>{item.owner}</td><td><StatusToken label={item.risk} tone={item.tone} /></td><td>{item.status}{item.commands.map((command) => results[command.id] ? <small className={results[command.id].ok ? "is-ok" : "is-error"} data-contour-admin-command-result={command.id} key={command.id}>{results[command.id].ok ? "Выполнено" : results[command.id].message}</small> : null)}</td><td><div className="contour-admin-react-actions">{item.commands.length ? item.commands.map((command) => <ActionButton disabled={!model.canExecuteOps} key={command.id} onClick={() => openCommand(item, command)} title={model.canExecuteOps ? "Открыть подтверждение Ops-команды" : "Ops API недоступен текущей сессии"} variant="secondary">{command.label}</ActionButton>) : <ActionButton disabled title="Для действия ещё нет серверного владельца" variant="secondary">Недоступно</ActionButton>}</div></td></tr>)}</tbody></table></TableWrap></Panel>
    {pending ? <Panel heading={<div className="panel-heading"><div><p>Ручное подтверждение</p><h2>{pending.command.label}: {pending.scenario.label}</h2></div><StatusToken label={pending.scenario.risk} tone={pending.scenario.tone} /></div>}><div className="contour-admin-react-confirm" data-contour-admin-confirm={pending.command.id} role="alertdialog"><p>{pending.scenario.source} → {pending.scenario.target}. {pending.scenario.result}</p><strong>Операция будет отправлена существующему защищённому Ops API от текущей admin-сессии.</strong><div><ActionButton disabled={running} onClick={() => setPending(null)} variant="secondary">Отмена</ActionButton><button className="action action--danger" data-contour-admin-confirm-execute disabled={running} onClick={() => { void execute(); }} type="button">{running ? "Выполнение…" : "Подтвердить и выполнить"}</button></div></div></Panel> : null}
    <section className="contour-admin-react-lower"><Panel heading={<div className="panel-heading"><div><p>Измерения</p><h2>Скорость итераций</h2></div></div>}><TableWrap><table className="speed-table"><thead><tr><th>Сценарий</th><th>Было</th><th>Стало</th><th>Эффект</th></tr></thead><tbody>{model.speedRows.map((item) => <tr data-contour-admin-speed={item.id} key={item.id}><td><strong>{item.scenario}</strong><small>{item.note}</small></td><td>{item.reference}</td><td>{item.current}</td><td>{item.delta}</td></tr>)}</tbody></table></TableWrap></Panel><Panel heading={<div className="panel-heading"><div><p>Release safety</p><h2>Правила безопасности</h2></div></div>}><ol className="contour-admin-react-guardrails">{model.guardrails.map((item) => <li key={item}>{item}</li>)}</ol></Panel></section>
  </OperationalPage>;
}
