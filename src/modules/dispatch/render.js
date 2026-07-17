export function renderDispatchModulePage({ renderMesModulePatternPage, renderUiPanel, renderUiPanelBody, renderUiSystemState }) {
  return renderMesModulePatternPage({
    moduleId: "dispatch",
    content: renderUiPanel({
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
    }),
  });
}
