import { useMemo, useState } from "react";
import { ActionButton, MetricCard, MetricGrid, ModuleHeader, ModulePage, Panel, StatusToken } from "../../ui/components";
import { adaptAuthPickerPayload, type AuthPickerElevationTarget, type AuthPickerPerson } from "./adapter";

export type AuthPickerReactCommand =
  | { type: "submit-pin"; personId: string; pin: string }
  | { type: "cancel-elevation" };
interface AuthPickerCommandResult { ok?: boolean; authenticated?: boolean; attemptsLeft?: number; locked?: boolean; message?: string; }

const ELEVATION_COPY: Record<AuthPickerElevationTarget, { eyebrow: string; description: string }> = {
  nomenclature: {
    eyebrow: "Номенклатура",
    description: "Подтверждение временно разрешит серверные команды Номенклатуры. Обычный вход в MES не изменяется.",
  },
  planning: {
    eyebrow: "Планирование",
    description: "Подтверждение временно разрешит серверные команды планирования. Обычный вход в MES не изменяется.",
  },
  "production-structure": {
    eyebrow: "Структура и сотрудники",
    description: "Подтверждение временно разрешит серверные команды производственной структуры. Обычный вход в MES не изменяется.",
  },
};

const shuffleDigits = () => {
  const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  for (let index = digits.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [digits[index], digits[target]] = [digits[target], digits[index]];
  }
  return digits;
};

export function AuthPickerScenario({ payload, onCommand }: { payload: unknown; onCommand?(command: AuthPickerReactCommand): Promise<AuthPickerCommandResult | void> }) {
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
  const elevationCopy = ELEVATION_COPY[model.elevationTarget];
  const choosePerson = (person: AuthPickerPerson) => {
    if (!model.canEnterPin) return;
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
  return <ModulePage header={<ModuleHeader eyebrow={model.elevation ? elevationCopy.eyebrow : "Вход в систему"} title={model.elevation ? "Подтверждение изменений" : "Авторизация"} badge={<span className="lab-badge" data-react-complete-marker title="UI-код переведён на React + TypeScript; приёмка отложена">React TS · {model.elevation ? "PIN elevation" : model.canEnterPin ? "PIN evaluation" : "PostgreSQL picker"}</span>} />}>
    <section className="auth-picker-react-security"><StatusToken label={model.elevation ? "Только текущий сотрудник" : model.canEnterPin ? "PIN проверяет сервер" : "PIN недоступен"} tone="success" /><span>{model.elevation ? elevationCopy.description : model.canEnterPin ? "React хранит ввод только в памяти компонента. Проверку и создание подписанной сессии выполняет серверный auth-владелец." : "В режиме просмотра React показывает только сотрудников и оргструктуру; ввод PIN отключён."}</span></section>
    <MetricGrid label="Структура входа"><MetricCard label="Отделы" value={model.departments.length} /><MetricCard label="Сотрудники" value={model.employeeCount} /><MetricCard label="PIN в React" value={model.canEnterPin ? "серверная проверка" : "нет"} /></MetricGrid>
    <Panel heading={<div className="panel-heading"><div><p>{model.elevation ? "Подтверждение права" : `Шаг ${step} из ${model.canEnterPin ? "4" : "3"}`}</p><h2>{selectedPerson ? "Введите PIN" : !department ? "Выберите отдел" : unit || !department.units.length ? "Выберите сотрудника" : "Выберите участок"}</h2></div>{model.elevation ? <ActionButton variant="secondary" onClick={() => { void onCommand?.({ type: "cancel-elevation" }); }}>Отмена</ActionButton> : department ? <ActionButton variant="secondary" onClick={() => selectedPerson ? (setSelectedPerson(null), setPin(""), setFeedback("")) : unit ? setUnitId("") : setDepartmentId("")}>Назад</ActionButton> : null}</div>}>
      {selectedPerson ? <div className="auth-picker-react-pin" data-auth-picker-pin-step>
        <div><strong>{selectedPerson.name}</strong><small>{selectedPerson.role}</small></div>
        <div aria-label="Введённый PIN" className={`auth-picker-react-pin-display${feedback ? " is-error" : ""}`}>{Array.from({ length: 5 }, (_, index) => <span className={index < pin.length ? "is-filled" : ""} key={index} />)}</div>
        <div aria-label="Цифровая клавиатура PIN" className="auth-picker-react-keypad">{digits.map((digit) => <button data-auth-picker-pin-digit={digit} disabled={checking || locked} key={digit} onClick={() => enterDigit(digit)} type="button">{digit}</button>)}<button data-auth-picker-pin-backspace disabled={checking || locked || !pin} onClick={() => setPin((current) => current.slice(0, -1))} type="button">⌫</button></div>
        <p className="auth-picker-react-pin-note">{checking ? "Проверяем PIN…" : locked ? "Вход заблокирован." : `После пятой цифры PIN проверяется автоматически. Осталось попыток: ${attemptsLeft}.`}</p>
        {feedback ? <p className="auth-picker-react-pin-error" role="alert">{feedback}</p> : null}
      </div> : !department ? <div className="auth-picker-react-grid">{model.departments.map((item) => <button key={item.id} onClick={() => { setDepartmentId(item.id); setUnitId(""); }} type="button"><strong>{item.name}</strong><span>{item.employeeCount.toLocaleString("ru-RU")} чел.</span><small>{item.caption}</small></button>)}</div> : !unit && department.units.length ? <div className="auth-picker-react-grid">{department.units.map((item) => <button key={item.id} onClick={() => setUnitId(item.id)} type="button"><strong>{item.name}</strong><span>{item.employeeCount.toLocaleString("ru-RU")} чел.</span><small>{item.caption}</small></button>)}</div> : <div className="auth-picker-react-people"><label><span>Поиск сотрудника</span><input onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Фамилия или должность" type="search" value={search} /></label><div>{filteredPeople.map((person) => <button data-auth-picker-person={person.id} disabled={!model.canEnterPin} key={person.id} onClick={() => choosePerson(person)} type="button"><span><strong>{person.name}</strong><small>{person.role}</small></span>{person.canDistribute || person.personKind === "master" ? <StatusToken label="мастер" tone="neutral" /> : null}</button>)}</div></div>}
    </Panel>
  </ModulePage>;
}
