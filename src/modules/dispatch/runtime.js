import { createDispatchReactIslandHost } from "./react_island_host.js";

export function createModuleRuntimeAdapter(context = {}) {
  const reactHost = createDispatchReactIslandHost({
    getActivation: context.getDispatchReactActivation,
    getPayload: context.getDispatchReactProductionPayload,
    getTargetRoot: context.getApp,
  });
  return {
    render: () => {
      void context.ensureDispatchReactProduction?.();
      reactHost.prepareRender();
      return reactHost.renderTarget();
    },
    bind: () => {},
    afterRender: () => { void reactHost.mount(); },
  };
}
