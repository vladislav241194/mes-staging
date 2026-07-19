import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { AuthPickerScenario } from "./modules/auth-picker/AuthPickerScenario";

export function mountAuthPickerReactIsland(target: HTMLElement, initialPayload: unknown, options: ReactMigrationIslandOptions & { onRequestLegacy?(scope?: string): void } = {}) {
  const { onRequestLegacy, ...runtime } = options;
  return mountReactIsland(target, (payload) => <AuthPickerScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtime);
}
