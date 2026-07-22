import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionButton, MetricCard, MetricGrid, ModuleHeader, OperationalPage, Panel, StatusToken, SystemState } from "../../ui/components";
import { ModalOverlay } from "../../ui/ModalOverlay";
import { adaptEmployeeDesktopPayload } from "./adapter";

const quantity = (value: number, unit = "шт.") => `${value.toLocaleString("ru-RU")} ${unit}`;
const taskTone = (task: { isDone: boolean; isStarted: boolean }): "success" | "warning" | "neutral" => task.isDone ? "success" : task.isStarted ? "warning" : "neutral";
export type EmployeeDesktopReactCommand =
  | { type: "select-person"; personId: string | null }
  | { type: "select-task"; taskId: string }
  | { type: "start-task"; taskId: string }
  | { type: "save-fact"; taskId: string; actualQuantity: number; defectQuantity: number; deviationComment: string }
  | { type: "prepare-report-photo"; taskId: string; file: File; source: "camera" | "file" }
  | { type: "save-report"; taskId: string; text: string; photo: EmployeeDesktopReportPhoto | null };
export interface EmployeeDesktopReportPhoto { id: string; name: string; type: string; size: number; source: string; dataUrl: string; storageNote: string }
export interface EmployeeDesktopReactCommandResult { ok?: boolean; message?: string; id?: string; photo?: EmployeeDesktopReportPhoto }

const factInput = (value: string) => value.replace(/[^\d]/g, "").slice(0, 7);
const RETURN_TO_USER_SELECTION = "__user-selection";

export function EmployeeDesktopScenario({ payload, onCommand }: { payload: unknown; onCommand?(command: EmployeeDesktopReactCommand): Promise<EmployeeDesktopReactCommandResult | void>; onRequestLegacy?(scope?: string): void }) {
  const model = useMemo(() => adaptEmployeeDesktopPayload(payload), [payload]); const [selectedId, setSelectedId] = useState(model.selectedTask?.id || "");
  const [commandError, setCommandError] = useState(""); const [startingTaskId, setStartingTaskId] = useState("");
  const [savingFact, setSavingFact] = useState(false); const [actualQuantity, setActualQuantity] = useState(""); const [defectQuantity, setDefectQuantity] = useState(""); const [deviationComment, setDeviationComment] = useState("");
  const [reportOpen, setReportOpen] = useState(false); const [reportText, setReportText] = useState(""); const [reportPhoto, setReportPhoto] = useState<EmployeeDesktopReportPhoto | null>(null); const [preparingPhoto, setPreparingPhoto] = useState(false); const [savingReport, setSavingReport] = useState(false); const cameraInput = useRef<HTMLInputElement>(null); const fileInput = useRef<HTMLInputElement>(null);
  const [contextView, setContextView] = useState<"" | "structure" | "route" | "pdf">(""); const closeContext = useCallback(() => setContextView(""), []);
  useEffect(() => { if (!model.tasks.some((task) => task.id === selectedId)) setSelectedId(model.selectedTask?.id || model.tasks[0]?.id || ""); }, [model, selectedId]);
  const selected = model.tasks.find((task) => task.id === selectedId) || model.selectedTask;
  useEffect(() => { setCommandError(""); setStartingTaskId(""); setSavingFact(false); }, [model]);
  useEffect(() => { setActualQuantity(String(selected?.actualQuantity ?? 0)); setDefectQuantity(String(selected?.defectQuantity ?? 0)); setDeviationComment(""); setReportOpen(false); setReportText(""); setReportPhoto(null); setPreparingPhoto(false); setSavingReport(false); setContextView(""); setCommandError(""); }, [selected?.id, selected?.actualQuantity, selected?.defectQuantity]);
  const actualValue = /^\d{1,7}$/.test(actualQuantity) ? Number(actualQuantity) : null;
  const defectValue = /^\d{1,7}$/.test(defectQuantity) ? Number(defectQuantity) : null;
  const goodValue = actualValue === null || defectValue === null ? 0 : Math.max(0, actualValue - defectValue);
  const needsDeviationComment = Boolean(selected && selected.assignedQuantity > 0 && goodValue < selected.assignedQuantity * .95);
  const canSaveSelectedFact = Boolean(selected && model.canSaveFact && selected.isStarted && !selected.isDone);
  const selectPerson = async (personId: string) => {
    const returnToSelection = personId === RETURN_TO_USER_SELECTION;
    if (!onCommand || (returnToSelection ? !model.canReturnToUserSelection : !model.canSwitchPerson)) return;
    setCommandError("");
    try { const result = await onCommand({ type: "select-person", personId: returnToSelection ? null : personId }); if (result?.ok === false) setCommandError(result.message || "Не удалось сменить рабочий стол."); }
    catch (error) { setCommandError(error instanceof Error ? error.message : "Не удалось сменить рабочий стол."); }
  };
  const startTask = async () => {
    if (!selected || !onCommand || !model.canStartTask || selected.isDone || selected.isStarted || startingTaskId) return;
    setStartingTaskId(selected.id); setCommandError("");
    try { const result = await onCommand({ type: "start-task", taskId: selected.id }); if (result && result.ok === false) setCommandError(result.message || "Не удалось взять задание в работу."); }
    catch (error) { setCommandError(error instanceof Error ? error.message : "Не удалось взять задание в работу."); }
    finally { setStartingTaskId(""); }
  };
  const saveFact = async () => {
    if (!selected || !onCommand || !canSaveSelectedFact || savingFact) return;
    if (actualValue === null || defectValue === null) { setCommandError("Введите выполненное количество и брак."); return; }
    if (defectValue > actualValue) { setCommandError("Количество брака не может превышать выполненное количество."); return; }
    if (needsDeviationComment && !deviationComment.trim()) { setCommandError("Укажите причину отклонения: годное количество ниже плана больше чем на 5%."); return; }
    setSavingFact(true); setCommandError("");
    try {
      const result = await onCommand({ type: "save-fact", taskId: selected.id, actualQuantity: actualValue, defectQuantity: defectValue, deviationComment: deviationComment.trim() });
      if (result && result.ok === false) setCommandError(result.message || "Не удалось записать факт.");
    } catch (error) { setCommandError(error instanceof Error ? error.message : "Не удалось записать факт."); }
    finally { setSavingFact(false); }
  };
  const prepareReportPhoto = async (file: File | undefined, source: "camera" | "file") => {
    if (!selected || !file || !onCommand || !model.canSaveReport || preparingPhoto) return;
    setPreparingPhoto(true); setCommandError("");
    try { const result = await onCommand({ type: "prepare-report-photo", taskId: selected.id, file, source }); if (result?.ok === false) setCommandError(result.message || "Не удалось подготовить фото."); else if (result?.photo) setReportPhoto(result.photo); }
    catch (error) { setCommandError(error instanceof Error ? error.message : "Не удалось подготовить фото."); }
    finally { setPreparingPhoto(false); }
  };
  const saveReport = async () => {
    if (!selected || !onCommand || !model.canSaveReport || savingReport || (!reportText.trim() && !reportPhoto)) return;
    setSavingReport(true); setCommandError("");
    try { const result = await onCommand({ type: "save-report", taskId: selected.id, text: reportText.trim(), photo: reportPhoto }); if (result?.ok === false) setCommandError(result.message || "Не удалось сохранить Report."); else { setReportOpen(false); setReportText(""); setReportPhoto(null); } }
    catch (error) { setCommandError(error instanceof Error ? error.message : "Не удалось сохранить Report."); }
    finally { setSavingReport(false); }
  };
  return <OperationalPage className="employee-desktop-react" label="Рабочий стол">
    <ModuleHeader eyebrow="Оперативное управление" title="Рабочий стол" badge={<><span className="lab-badge">{model.canStartTask || model.canSaveFact || model.canSaveReport ? "React · запись" : "read-only React"}</span>{model.canSwitchPerson || model.canReturnToUserSelection ? <select aria-label="Рабочий стол сотрудника" className="employee-desktop-react-viewer" data-employee-desktop-view-person onChange={(event) => void selectPerson(event.currentTarget.value)} value={model.viewedPersonId}>{model.canSwitchPerson ? <><option value="__all">Все сотрудники</option>{model.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</> : <option value={model.viewedPersonId}>{model.personName}</option>}{model.canReturnToUserSelection ? <option value={RETURN_TO_USER_SELECTION}>← К выбору пользователя</option> : null}</select> : null}</>} />
    {!selected ? <SystemState title="Заданий нет" text="Сменные задания ещё не назначены." tone="neutral" /> : <section className="employee-desktop-react-grid">
      <Panel heading={<div className="panel-heading"><div><p>Рабочая карточка</p><h2>{selected.documentNumber}</h2></div><StatusToken label={selected.status} tone={taskTone(selected)} /></div>}>
        <div className="employee-desktop-react-detail" data-employee-desktop-detail={selected.id}>
          <section className="employee-desktop-react-summary"><article><span>Изделие</span><strong>{selected.orderLabel}</strong></article><article><span>Операция</span><strong>{selected.operationName}</strong></article><article><span>Маршрут</span><strong>{selected.routePartLabel}</strong></article></section>
          <section className="employee-desktop-react-route" aria-label="Маршрут задания"><article><span>До</span><strong>{selected.previousOperation}</strong></article><article className="is-current"><span>Сейчас</span><strong>{selected.operationName}</strong></article><article><span>После</span><strong>{selected.nextOperation}</strong></article></section>
          <MetricGrid label="Факт задания"><MetricCard label="Назначено" value={quantity(selected.assignedQuantity, selected.unit)} meta={selected.laborLabel} /><MetricCard label="Выполнено" value={quantity(selected.actualQuantity, selected.unit)} /><MetricCard label="Брак" value={quantity(selected.defectQuantity, selected.unit)} /><MetricCard label="Годное" value={quantity(selected.goodQuantity, selected.unit)} /></MetricGrid>
          <div className="employee-desktop-react-actions"><ActionButton disabled={!model.canStartTask || selected.isDone || selected.isStarted || Boolean(startingTaskId)} onClick={() => void startTask()} title={selected.isDone ? "Задание уже завершено" : selected.isStarted ? "Задание уже находится в работе" : model.canStartTask ? "Взять через существующего владельца рабочей сессии" : "Запуск задания недоступен текущей роли или серверному владельцу"}>{selected.isStarted ? "В работе" : startingTaskId === selected.id ? "Запуск…" : "Взять"}</ActionButton>{!model.canSaveFact ? <ActionButton disabled title="Ввод факта недоступен текущей роли или серверному владельцу" variant="secondary">Внести факт</ActionButton> : null}<ActionButton disabled={!model.canSaveReport} onClick={() => { if (model.canSaveReport) setReportOpen((open) => !open); }} title={model.canSaveReport ? "Создать Report" : "Сохранение Report ждёт постоянного серверного владельца"} variant="secondary">{selected.reportCount ? `Report · ${selected.reportCount}` : "Report"}</ActionButton><ActionButton onClick={() => { setReportOpen(false); setContextView("structure"); }} variant="secondary">Структура</ActionButton><ActionButton onClick={() => { setReportOpen(false); setContextView("route"); }} variant="secondary">Маршрут</ActionButton><ActionButton onClick={() => { setReportOpen(false); setContextView("pdf"); }} variant="secondary">PDF</ActionButton></div>
          {selected.isStarted && !selected.isDone ? <section className="employee-desktop-react-fact" data-employee-desktop-fact-form={selected.id}>
            <header><div><span>Завершение задания</span><strong>Ввод факта</strong></div><StatusToken label={`Годное: ${quantity(goodValue, selected.unit)}`} tone={needsDeviationComment ? "warning" : "success"} /></header>
            <div className="employee-desktop-react-fact-fields"><label><span>Выполнено</span><input aria-label="Выполнено" data-employee-desktop-fact-actual disabled={!canSaveSelectedFact || savingFact} inputMode="numeric" maxLength={7} onChange={(event) => setActualQuantity(factInput(event.currentTarget.value))} value={actualQuantity} /></label><label><span>Брак</span><input aria-label="Брак" data-employee-desktop-fact-defect disabled={!canSaveSelectedFact || savingFact} inputMode="numeric" maxLength={7} onChange={(event) => setDefectQuantity(factInput(event.currentTarget.value))} value={defectQuantity} /></label></div>
            {needsDeviationComment ? <label className="employee-desktop-react-fact-comment"><span>Причина отклонения</span><textarea data-employee-desktop-fact-comment disabled={!canSaveSelectedFact || savingFact} maxLength={500} onChange={(event) => setDeviationComment(event.currentTarget.value)} placeholder="Почему факт ниже плана" rows={3} value={deviationComment} /></label> : null}
            <footer><ActionButton disabled={!canSaveSelectedFact || savingFact || actualValue === null || defectValue === null || defectValue > actualValue || (needsDeviationComment && !deviationComment.trim())} onClick={() => void saveFact()}>{savingFact ? "Сохранение…" : "Записать факт"}</ActionButton><small>Закрытие — после фактов всех исполнителей.</small></footer>
          </section> : null}
          {reportOpen ? <section className="employee-desktop-react-report" data-employee-desktop-report-form={selected.id}>
            <header><div><span>Сообщение о проблеме</span><strong>{selected.documentNumber} · {selected.operationName}</strong></div><StatusToken label={`${selected.reportCount} записей · ${selected.photoCount} фото`} tone={selected.reportCount ? "warning" : "neutral"} /></header>
            <div className={`employee-desktop-react-report-preview${reportPhoto ? " has-photo" : ""}`}>{reportPhoto?.dataUrl ? <img alt={reportPhoto.name || "Фото проблемы"} data-employee-desktop-report-photo src={reportPhoto.dataUrl} /> : <div><strong>{preparingPhoto ? "Подготовка фото…" : reportPhoto?.name || "Фото не прикреплено"}</strong><small>{reportPhoto?.storageNote || "Снимите или выберите фото."}</small></div>}{reportPhoto ? <small>{reportPhoto.name} · {Math.round(reportPhoto.size / 1024).toLocaleString("ru-RU")} КБ</small> : null}</div>
            <div className="employee-desktop-react-report-pickers"><ActionButton disabled={preparingPhoto || savingReport} onClick={() => cameraInput.current?.click()}>Фото с планшета</ActionButton><ActionButton disabled={preparingPhoto || savingReport} onClick={() => fileInput.current?.click()} variant="secondary">Прикрепить фото</ActionButton>{reportPhoto ? <ActionButton disabled={savingReport} onClick={() => setReportPhoto(null)} variant="secondary">Убрать фото</ActionButton> : null}<input accept="image/*" capture="environment" data-employee-desktop-report-camera hidden onChange={(event) => { void prepareReportPhoto(event.currentTarget.files?.[0], "camera"); event.currentTarget.value = ""; }} ref={cameraInput} type="file" /><input accept="image/*" data-employee-desktop-report-file hidden onChange={(event) => { void prepareReportPhoto(event.currentTarget.files?.[0], "file"); event.currentTarget.value = ""; }} ref={fileInput} type="file" /></div>
            <label><span>Описание проблемы</span><textarea data-employee-desktop-report-text disabled={savingReport} onChange={(event) => setReportText(event.currentTarget.value)} placeholder="Опишите проблему" rows={4} value={reportText} /></label>
            <footer><ActionButton disabled={savingReport || preparingPhoto || (!reportText.trim() && !reportPhoto)} onClick={() => void saveReport()}>{savingReport ? "Сохранение…" : "Сохранить Report"}</ActionButton></footer>
          </section> : null}
          {commandError ? <p className="react-nomenclature-command-error" role="alert">{commandError}</p> : null}
        </div>
      </Panel>
      <Panel heading={<div className="panel-heading"><div><p>{model.canSwitchPerson ? "Все рабочие столы" : model.personName}</p><h2>Назначенные задания</h2></div></div>}>
        <MetricGrid className="employee-desktop-react-kpis" label="Сводка рабочего стола"><MetricCard label="Задания" value={model.tasks.length} meta={`${model.activeCount} открыто`} /><MetricCard label="Распределено" value={quantity(model.assignedQuantity)} /><MetricCard label="Факт" value={quantity(model.goodQuantity)} meta={`${model.doneCount} закрыто`} /></MetricGrid>
        <div className="employee-desktop-react-tasks" data-employee-desktop-task-list>{model.tasks.map((task) => <button aria-pressed={task.id === selected.id} className={task.id === selected.id ? "is-current" : ""} data-employee-desktop-task={task.id} key={task.id} onClick={() => { setSelectedId(task.id); void onCommand?.({ type: "select-task", taskId: task.id }); }} type="button"><span><strong>{task.operationName}</strong><small>{model.canSwitchPerson ? `${task.employeeName} · ${task.workCenterLabel}` : task.workCenterLabel}</small><em>До: {task.previousOperation} · После: {task.nextOperation}</em></span><b>{quantity(task.assignedQuantity, task.unit)}</b><StatusToken label={task.status} tone={taskTone(task)} /></button>)}</div>
      </Panel>
    </section>}
    {selected && contextView ? <ModalOverlay className="employee-desktop-react-context-modal" eyebrow="Контекст задания" label={contextView === "structure" ? "Структура изделия" : contextView === "route" ? "Маршрут задания" : "PDF-инструкция"} onClose={closeContext} title={contextView === "structure" ? "Структура изделия" : contextView === "route" ? "Маршрут задания" : `Инструкция_${selected.operationName}.pdf`}>
      {contextView === "structure" ? <div className="employee-desktop-react-context-rows" data-employee-desktop-context="structure">{[["Заказ-наряд", selected.orderLabel], ["Маршрут", selected.routePartLabel], ["Операция", selected.operationName], ["Участок", selected.workCenterLabel], ["Результат операции", selected.nextOperation === "финиш" ? "закрыть маршрут" : `передать в ${selected.nextOperation}`]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div> : null}
      {contextView === "route" ? <div className="employee-desktop-react-context-route" data-employee-desktop-context="route">{selected.routeNodes.map((node) => <article className={node.current ? "is-current" : ""} key={node.label}><span>{node.label}</span><strong>{node.operationName}</strong><small>{[node.workCenterLabel, node.routePartLabel].filter(Boolean).join(" · ")}</small></article>)}</div> : null}
      {contextView === "pdf" ? <div className="employee-desktop-react-context-pdf" data-employee-desktop-context="pdf"><header><strong>Инструкция_{selected.operationName}.pdf</strong><small>Предпросмотр инструкции</small></header><section aria-label="Предпросмотр PDF"><strong>{selected.operationName}</strong><span>{selected.orderLabel}</span><p>1. Сверить изделие.</p><p>2. Выполнить операцию.</p><p>3. Записать факт и брак.</p></section></div> : null}
    </ModalOverlay> : null}
  </OperationalPage>;
}
