export function renderDispatchModulePage({ renderUiModulePage, renderUiPanel, renderUiPanelBody, icon }) {
  return renderUiModulePage({
    ariaLabel: "Диспетчерская",
    className: "dispatch-page dispatch-placeholder-page",
    contentClassName: "dispatch-placeholder-content-wrap",
    content: renderUiPanel({
      title: "Диспетчерская",
      meta: "модуль отключен",
      className: "dispatch-placeholder-panel",
      body: renderUiPanelBody({
        body: `
          <div class="dispatch-placeholder-content">
            <span class="dispatch-placeholder-icon" aria-hidden="true">${icon("monitor")}</span>
            <div>
              <span class="eyebrow">Модуль отключен</span>
              <h1>Диспетчерская</h1>
              <p>Функциональность диспетчерской выведена из рабочего контура. Этот экран оставлен как заглушка и ничего не читает, не записывает и не пересчитывает в системе.</p>
            </div>
            <ul>
              <li>Факты диспетчерской не принимаются и не архивируются.</li>
              <li>Гант, заказ-наряды, мастерская и планирование не получают данных из диспетчерской.</li>
              <li>Следующая версия модуля будет спроектирована заново по отдельному ТЗ.</li>
            </ul>
          </div>
        `,
      }),
    }),
  });
}
