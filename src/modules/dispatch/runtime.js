import { renderDispatchModulePage } from "./render.js";

export function createModuleRuntimeAdapter(context = {}) {
  return {
    render: () => renderDispatchModulePage({
      renderMesModulePatternPage: context.renderMesModulePatternPage,
      renderUiPanel: context.renderUiPanel,
      renderUiPanelBody: context.renderUiPanelBody,
      renderUiSystemState: context.renderUiSystemState,
    }),
  };
}

