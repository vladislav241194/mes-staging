import {
  createReactIslandHost,
  type ReactIslandHandle,
  type ReactIslandMountContext,
} from "../react_island_host.ts";

const MARKING_REACT_TARGET = "[data-react-marking-island]";
const MARKING_REACT_BUNDLE_VERSION = "__MES_MARKING_REACT_BUNDLE_VERSION__";

interface MarkingActivation {
  productionEnabled?: boolean;
}

interface MarkingHostOptions {
  getActivation?: () => MarkingActivation;
  getPayload?: () => unknown;
  getTargetRoot?: () => ParentNode | null | undefined;
  reportError?: (error: Error) => void;
}

interface MarkingLoadedModule {
  mountMarkingReactIsland(
    target: HTMLElement,
    payload: unknown,
    options: {
      onError: (error: unknown) => void;
      onReady: (event: { revision: unknown }) => void;
    },
  ): ReactIslandHandle<unknown>;
}

export function createMarkingReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  reportError = (error: Error) => console.error("[MES] Marking React island failed", error),
}: MarkingHostOptions = {}) {
  return createReactIslandHost<MarkingActivation, unknown, MarkingLoadedModule>({
    getActivation,
    getPayload,
    getTargetRoot,
    reportError,
    targetSelector: MARKING_REACT_TARGET,
    renderTarget: '<div class="mes-react-marking-island" data-react-marking-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => activation.productionEnabled === true ? "" : "disabled",
    canFallbackToLegacy: () => false,
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/marking.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = MARKING_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : MARKING_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href) as Promise<MarkingLoadedModule>;
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }: ReactIslandMountContext<MarkingLoadedModule, unknown>) => loadedIsland!.mountMarkingReactIsland(target, payload, { onError, onReady }),
  });
}
