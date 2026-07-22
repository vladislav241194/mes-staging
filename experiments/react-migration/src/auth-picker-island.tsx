import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { AuthPickerScenario, type AuthPickerReactCommand } from "./modules/auth-picker/AuthPickerScenario";

export function mountAuthPickerReactIsland(target: HTMLElement, initialPayload: unknown, options: ReactMigrationIslandOptions & { onCommand?(command: AuthPickerReactCommand): Promise<{ ok?: boolean; authenticated?: boolean; attemptsLeft?: number; locked?: boolean; message?: string } | void> } = {}) {
  const { onCommand, ...runtime } = options;
  return mountReactIsland(target, (payload) => <AuthPickerScenario payload={payload} onCommand={onCommand} />, initialPayload, runtime);
}
