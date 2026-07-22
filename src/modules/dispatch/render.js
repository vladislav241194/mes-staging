export function renderDispatchModulePage({ renderMesModulePatternPage, renderUiModuleHeader, renderUiPanel, renderUiPanelBody, renderUiSystemState }) {
  return renderMesModulePatternPage({
    moduleId: "dispatch",
    header: renderUiModuleHeader({
      eyebrow: "Оперативное управление",
      title: "Диспетчерская",
      description: "Безопасный rollback-экран отключенного модуля.",
      className: "dispatch-placeholder-header",
    }),
    content: `<div class="dispatch-placeholder-page">${renderUiPanel({
      title: "Диспетчерская",
      meta: "модуль отключен",
      className: "dispatch-placeholder-panel",
      body: renderUiPanelBody({
        body: renderUiSystemState({
          iconName: "monitor",
          title: "Диспетчерская временно отключена",
          text: "Модуль ничего не читает, не записывает и не пересчитывает. Факты не принимаются, а новая версия будет спроектирована по отдельному ТЗ.",
          tone: "neutral",
          attributes: "data-dispatch-disabled-state",
        }),
      }),
    })}</div>`,
  });
}
