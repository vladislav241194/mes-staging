import { useMemo, useState } from "react";
import { ActionButton, MetricCard, MetricGrid, ModuleHeader, ModulePage, Panel, StatusToken } from "../../ui/components";
import { adaptAuthPickerPayload, type AuthPickerPerson } from "./adapter";

export type AuthPickerReactCommand =
  | { type: "submit-pin"; personId: string; pin: string }
  | { type: "cancel-elevation" };
interface AuthPickerCommandResult { ok?: boolean; authenticated?: boolean; attemptsLeft?: number; locked?: boolean; message?: string; }

const shuffleDigits = () => {
  const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  for (let index = digits.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [digits[index], digits[target]] = [digits[target], digits[index]];
  }
  return digits;
};

export function AuthPickerScenario({ payload, onCommand, onRequestLegacy }: { payload: unknown; onCommand?(command: AuthPickerReactCommand): Promise<AuthPickerCommandResult | void>; onRequestLegacy?(scope?: string): void }) {
  const model = useMemo(() => adaptAuthPickerPayload(payload), [payload]);
  const forcedPerson = useMemo(() => model.departments.flatMap((department) => [
    ...department.directPeople,
    ...department.units.flatMap((unit) => unit.people),
  ]).find((person) => person.id === model.forcedPersonId) || null, [model]);
  const [departmentId, setDepartmentId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [search, setSearch] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<AuthPickerPerson | null>(forcedPerson);
  const [pin, setPin] = useState("");
  const [digits, setDigits] = useState(shuffleDigits);
  const [attemptsLeft, setAttemptsLeft] = useState(model.attemptsLeft || 5);
  const [feedback, setFeedback] = useState("");
  const [checking, setChecking] = useState(false);
  const department = model.departments.find((item) => item.id === departmentId) || null;
  const unit = department?.units.find((item) => item.id === unitId) || null;
  const people = unit ? unit.people : department && !department.units.length ? department.directPeople : [];
  const filteredPeople = people.filter((person) => `${person.name} ${person.role}`.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru")));
  const locked = attemptsLeft <= 0;
  const choosePerson = (person: AuthPickerPerson) => {
    if (!model.canEnterPin) {
      onRequestLegacy?.(`person:${encodeURIComponent(person.id)}:${encodeURIComponent(department?.id || "")}:${encodeURIComponent(unit?.id || "")}`);
      return;
    }
    setSelectedPerson(person); setPin(""); setFeedback(""); setDigits(shuffleDigits());
  };
  const submitPin = async (nextPin: string) => {
    if (!selectedPerson || !onCommand || checking || locked) return;
    setChecking(true); setFeedback("");
    try {
      const result = await onCommand({ type: "submit-pin", personId: selectedPerson.id, pin: nextPin });
      if (result?.authenticated) return;
      if (Number.isFinite(result?.attemptsLeft)) setAttemptsLeft(Number(result?.attemptsLeft));
      setFeedback(result?.message || "Не удалось проверить PIN.");
      setPin(""); setDigits(shuffleDigits());
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Не удалось проверить PIN.");
      setPin("");
    } finally { setChecking(false); }
  };
  const enterDigit = (digit: string) => {
    if (checking || locked) return;
    const next = `${pin}${digit}`.slice(0, 5);
    setPin(next); setFeedback("");
    if (next.length === 5) void submitPin(next);
  };
  const step = selectedPerson ? 4 : department ? unit || !department.units.length ? 3 : 2 : 1;
  return <ModulePage header={<ModuleHeader eyebrow={model.elevation ? "Номенклатура" : "Вход в систему"} title={model.elevation ? "Подтверждение изменений" : "Авторизация"} badge={<span className="lab-badge">{model.elevation ? "PIN elevation" : model.canEnterPin ? "React · PIN evaluation" : "PostgreSQL · React picker"}</span>} />}>
    <section className="auth-picker-react-security"><StatusToken label={model.elevation ? "Только текущий сотрудник" : model.canEnterPin ? "PIN проверяет сервер" : "PIN остаётся в защищённом legacy-контуре"} tone="success" /><span>{model.elevation ? "Подтверждение временно разрешит серверные команды Номенклатуры. Обычный вход в MES не изменяется." : model.canEnterPin ? "React хранит ввод только в памяти компонента. Проверку и создание подписанной сессии выполняет серверный auth-владелец." : "React получает только имена, должности и оргструктуру. PIN, попытки и сессия сюда не передаются."}</span></section>
    <MetricGrid label="Структура входа"><MetricCard label="Отделы" value={model.departments.length} /><MetricCard label="Сотрудники" value={model.employeeCount} /><MetricCard label="PIN в React" value={model.canEnterPin ? "серверная проверка" : "нет"} /></MetricGrid>
    <Panel heading={<div className="panel-heading"><div><p>{model.elevation ? "Подтверждение права" : `Шаг ${step} из ${model.canEnterPin ? "4" : "3"}`}</p><h2>{selectedPerson ? "Введите PIN" : !department ? "Выберите отдел" : unit || !department.units.length ? "Выберите сотрудника" : "Выберите участок"}</h2></div>{model.elevation ? <ActionButton variant="secondary" onClick={() => { void onCommand?.({ type: "cancel-elevation" }); }}>Отмена</ActionButton> : department ? <ActionButton variant="secondary" onClick={() => selectedPerson ? (setSelectedPerson(null), setPin(""), setFeedback("")) : unit ? setUnitId("") : setDepartmentId("")}>Назад</ActionButton> : null}</div>}>
      {selectedPerson ? <div className="auth-picker-react-pin" data-auth-picker-pin-step>
        <div><strong>{selectedPerson.name}</strong><small>{selectedPerson.role}</small></div>
        <div aria-label="Введённый PIN" className={`auth-picker-react-pin-display${feedback ? " is-error" : ""}`}>{Array.from({ length: 5 }, (_, index) => <span className={index < pin.length ? "is-filled" : ""} key={index} />)}</div>
        <div aria-label="Цифровая клавиатура PIN" className="auth-picker-react-keypad">{digits.map((digit) => <button data-auth-picker-pin-digit={digit} disabled={checking || locked} key={digit} onClick={() => enterDigit(digit)} type="button">{digit}</button>)}<button data-auth-picker-pin-backspace disabled={checking || locked || !pin} onClick={() => setPin((current) => current.slice(0, -1))} type="button">⌫</button></div>
        <p className="auth-picker-react-pin-note">{checking ? "Проверяем PIN…" : locked ? "Вход заблокирован." : `После пятой цифры PIN проверяется автоматически. Осталось попыток: ${attemptsLeft}.`}</p>
        {feedback ? <p className="auth-picker-react-pin-error" role="alert">{feedback}</p> : null}
      </div> : !department ? <div className="auth-picker-react-grid">{model.departments.map((item) => <button key={item.id} onClick={() => { setDepartmentId(item.id); setUnitId(""); }} type="button"><strong>{item.name}</strong><span>{item.employeeCount.toLocaleString("ru-RU")} чел.</span><small>{item.caption}</small></button>)}</div> : !unit && department.units.length ? <div className="auth-picker-react-grid">{department.units.map((item) => <button key={item.id} onClick={() => setUnitId(item.id)} type="button"><strong>{item.name}</strong><span>{item.employeeCount.toLocaleString("ru-RU")} чел.</span><small>{item.caption}</small></button>)}</div> : <div className="auth-picker-react-people"><label><span>Поиск сотрудника</span><input onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Фамилия или должность" type="search" value={search} /></label><div>{filteredPeople.map((person) => <button data-auth-picker-person={person.id} key={person.id} onClick={() => choosePerson(person)} type="button"><span><strong>{person.name}</strong><small>{person.role}</small></span>{person.canDistribute || person.personKind === "master" ? <StatusToken label="мастер" tone="neutral" /> : null}</button>)}</div></div>}
    </Panel>
  </ModulePage>;
}
