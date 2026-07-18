import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ComponentTypesScenario } from "./modules/component-types/ComponentTypesScenario";
import { NomenclatureScenario } from "./modules/nomenclature/NomenclatureScenario";
import { SystemState } from "./ui/components";

export type ReactMigrationScenarioId = "nomenclature" | "componentTypes";

export interface NomenclatureReactIslandOptions {
  onError?(error: Error): void;
}

export interface NomenclatureReactIslandHandle {
  update(payload: unknown): void;
  unmount(): void;
}

function ReactMigrationScenario({ payload, scenario }: { payload: unknown; scenario: ReactMigrationScenarioId }) {
  if (scenario === "componentTypes") return <ComponentTypesScenario payload={payload} />;
  return <NomenclatureScenario payload={payload} />;
}

interface IslandErrorBoundaryState {
  error: Error | null;
}

class IslandErrorBoundary extends Component<{ children: ReactNode }, IslandErrorBoundaryState> {
  state: IslandErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): IslandErrorBoundaryState {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {}

  render() {
    if (this.state.error) {
      return <SystemState title="Интерфейс временно недоступен" text="Вернитесь к предыдущему интерфейсу и повторите действие." />;
    }
    return this.props.children;
  }
}

export function mountReactMigrationIsland(
  target: HTMLElement,
  scenario: ReactMigrationScenarioId,
  initialPayload: unknown,
  options: NomenclatureReactIslandOptions = {},
): NomenclatureReactIslandHandle {
  if (!(target instanceof HTMLElement)) throw new TypeError("React migration island requires an HTMLElement target");

  const reportError = (error: unknown) => options.onError?.(error instanceof Error ? error : new Error(String(error)));
  const root: Root = createRoot(target, {
    onCaughtError: reportError,
    onUncaughtError: reportError,
  });
  let mounted = true;

  const render = (payload: unknown) => {
    if (!mounted) throw new Error("Nomenclature React island is already unmounted");
    root.render(
      <IslandErrorBoundary>
        <ReactMigrationScenario payload={payload} scenario={scenario} />
      </IslandErrorBoundary>,
    );
  };

  render(initialPayload);
  return {
    update(payload) {
      render(payload);
    },
    unmount() {
      if (!mounted) return;
      mounted = false;
      root.unmount();
    },
  };
}


export function mountNomenclatureReactIsland(target: HTMLElement, initialPayload: unknown, options: NomenclatureReactIslandOptions = {}) {
  return mountReactMigrationIsland(target, "nomenclature", initialPayload, options);
}
