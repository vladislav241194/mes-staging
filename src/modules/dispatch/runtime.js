import { renderDispatchModulePage } from "./render.js";
import { createDispatchReactIslandHost } from "./react_island_host.js";

export function createModuleRuntimeAdapter(context = {}) {
  const reactHost = createDispatchReactIslandHost({ getTargetRoot: context.getApp });
  return {
    render: () => {
      const decision = reactHost.prepareRender();
      if (decision.activateReact) return reactHost.renderTarget();
      return renderDispatchModulePage({
        renderMesModulePatternPage: context.renderMesModulePatternPage,
        renderUiPanel: context.renderUiPanel,
        renderUiPanelBody: context.renderUiPanelBody,
        renderUiSystemState: context.renderUiSystemState,
      });
    },
    bind: () => {},
    afterRender: () => { void reactHost.mount(); },
  };
}
