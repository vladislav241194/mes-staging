import { MetricCard, MetricGrid, ModuleHeader, ModulePage, Panel, StatusToken } from "../../ui/components";

export function DispatchScenario() {
  return <ModulePage
    className="dispatch-react"
    label="Диспетчерская"
    header={<ModuleHeader eyebrow="Оперативное управление" title="Диспетчерская" badge={<span className="lab-badge">React · scope pending</span>} />}
  >
    <MetricGrid label="Статус модуля">
      <MetricCard label="Интерфейс" value="React + TS" meta="legacy UI отключён" />
      <MetricCard label="Данные" value="Не подключены" meta="ожидается утверждённый read owner" />
      <MetricCard label="Команды" value="Заблокированы" meta="до отдельного ТЗ и RBAC-контракта" />
    </MetricGrid>
    <Panel heading={<div className="panel-heading"><div><p>Граница прототипа</p><h2>Модуль ждёт отдельное ТЗ</h2></div><StatusToken label="без записей" tone="neutral" /></div>}>
      <section data-dispatch-react-placeholder role="status">
        <p>Диспетчерская уже не использует legacy-вёрстку, но пока намеренно ничего не читает и не изменяет.</p>
        <p>Следующий этап: определить рабочие сценарии диспетчера, источник данных, права и серверные команды.</p>
      </section>
    </Panel>
  </ModulePage>;
}
