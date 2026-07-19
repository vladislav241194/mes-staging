import { useMemo, useState } from "react";
import { ActionButton, MetricCard, MetricGrid, ModuleHeader, ModulePage, Panel, StatusToken } from "../../ui/components";
import { adaptAuthPickerPayload, type AuthPickerPerson } from "./adapter";

export function AuthPickerScenario({ payload, onRequestLegacy }: { payload: unknown; onRequestLegacy?(scope?: string): void }) {
  const model = useMemo(() => adaptAuthPickerPayload(payload), [payload]);
  const [departmentId, setDepartmentId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [search, setSearch] = useState("");
  const department = model.departments.find((item) => item.id === departmentId) || null;
  const unit = department?.units.find((item) => item.id === unitId) || null;
  const people = unit ? unit.people : department && !department.units.length ? department.directPeople : [];
  const filteredPeople = people.filter((person) => `${person.name} ${person.role}`.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru")));
  const choosePerson = (person: AuthPickerPerson) => onRequestLegacy?.(`person:${encodeURIComponent(person.id)}:${encodeURIComponent(department?.id || "")}:${encodeURIComponent(unit?.id || "")}`);
  return <ModulePage header={<ModuleHeader eyebrow="Вход в систему" title="Авторизация" badge={<span className="lab-badge">PostgreSQL · React picker</span>} />}>
    <section className="auth-picker-react-security"><StatusToken label="PIN остаётся в защищённом legacy-контуре" tone="success" /><span>React получает только имена, должности и оргструктуру. PIN, попытки и сессия сюда не передаются.</span></section>
    <MetricGrid label="Структура входа"><MetricCard label="Отделы" value={model.departments.length} /><MetricCard label="Сотрудники" value={model.employeeCount} /><MetricCard label="PIN в React" value="нет" /></MetricGrid>
    <Panel heading={<div className="panel-heading"><div><p>Шаг {department ? unit || !department.units.length ? "3" : "2" : "1"} из 3</p><h2>{!department ? "Выберите отдел" : unit || !department.units.length ? "Выберите сотрудника" : "Выберите участок"}</h2></div>{department ? <ActionButton variant="secondary" onClick={() => unit ? setUnitId("") : setDepartmentId("")}>Назад</ActionButton> : null}</div>}>
      {!department ? <div className="auth-picker-react-grid">{model.departments.map((item) => <button key={item.id} onClick={() => { setDepartmentId(item.id); setUnitId(""); }} type="button"><strong>{item.name}</strong><span>{item.employeeCount.toLocaleString("ru-RU")} чел.</span><small>{item.caption}</small></button>)}</div> : !unit && department.units.length ? <div className="auth-picker-react-grid">{department.units.map((item) => <button key={item.id} onClick={() => setUnitId(item.id)} type="button"><strong>{item.name}</strong><span>{item.employeeCount.toLocaleString("ru-RU")} чел.</span><small>{item.caption}</small></button>)}</div> : <div className="auth-picker-react-people"><label><span>Поиск сотрудника</span><input onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Фамилия или должность" type="search" value={search} /></label><div>{filteredPeople.map((person) => <button data-auth-picker-person={person.id} key={person.id} onClick={() => choosePerson(person)} type="button"><span><strong>{person.name}</strong><small>{person.role}</small></span>{person.canDistribute || person.personKind === "master" ? <StatusToken label="мастер" tone="neutral" /> : null}</button>)}</div></div>}
    </Panel>
  </ModulePage>;
}
