import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NomenclatureScenario } from "./modules/nomenclature/NomenclatureScenario";
import { SystemState } from "./ui/components";

export interface NomenclatureReactIslandOptions {
  onError?(error: Error): void;
}

export interface NomenclatureReactIslandHandle {
  update(payload: unknown): void;
  unmount(): void;
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

export function mountNomenclatureReactIsland(
  target: HTMLElement,
  initialPayload: unknown,
  options: NomenclatureReactIslandOptions = {},
): NomenclatureReactIslandHandle {
  if (!(target instanceof HTMLElement)) throw new TypeError("Nomenclature React island requires an HTMLElement target");

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
        <NomenclatureScenario payload={payload} />
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
