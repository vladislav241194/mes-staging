import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactIslandHandle } from "./feature-gate";
import { SystemState } from "./ui/components";

export interface ReactMigrationIslandReadyEvent {
  revision: number;
}

export interface ReactMigrationIslandOptions {
  onError?(error: Error): void;
  onReady?(event: ReactMigrationIslandReadyEvent): void;
}

export type ReactMigrationIslandHandle = ReactIslandHandle;

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

function CommitReporter({ onReady, revision }: { onReady?: ReactMigrationIslandOptions["onReady"]; revision: number }) {
  useEffect(() => onReady?.({ revision }), [onReady, revision]);
  return null;
}

export function mountReactIsland(
  target: HTMLElement,
  renderScenario: (payload: unknown) => ReactNode,
  initialPayload: unknown,
  options: ReactMigrationIslandOptions = {},
): ReactMigrationIslandHandle {
  if (!(target instanceof HTMLElement)) throw new TypeError("React migration island requires an HTMLElement target");

  const reportError = (error: unknown) => options.onError?.(error instanceof Error ? error : new Error(String(error)));
  const root: Root = createRoot(target, {
    onCaughtError: reportError,
    onUncaughtError: reportError,
  });
  let mounted = true;
  let revision = 0;

  const render = (payload: unknown) => {
    if (!mounted) throw new Error("React migration island is already unmounted");
    revision += 1;
    root.render(
      <IslandErrorBoundary>
        <CommitReporter onReady={options.onReady} revision={revision} />
        {renderScenario(payload)}
      </IslandErrorBoundary>,
    );
  };

  try {
    render(initialPayload);
  } catch (error) {
    mounted = false;
    root.unmount();
    throw error;
  }

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
