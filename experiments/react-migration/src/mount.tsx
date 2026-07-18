import { ComponentTypesScenario } from "./modules/component-types/ComponentTypesScenario";
import { NomenclatureScenario } from "./modules/nomenclature/NomenclatureScenario";
import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";

export type ReactMigrationScenarioId = "nomenclature" | "componentTypes";

export interface ReactMigrationScenarioOptions extends ReactMigrationIslandOptions {
  onRequestLegacy?(): void;
}

function ReactMigrationScenario({ onRequestLegacy, payload, scenario }: { onRequestLegacy?(): void; payload: unknown; scenario: ReactMigrationScenarioId }) {
  if (scenario === "componentTypes") return <ComponentTypesScenario payload={payload} />;
  return <NomenclatureScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
}

export function mountReactMigrationIsland(
  target: HTMLElement,
  scenario: ReactMigrationScenarioId,
  initialPayload: unknown,
  options: ReactMigrationScenarioOptions = {},
): ReturnType<typeof mountReactIsland> {
  const { onRequestLegacy, ...runtimeOptions } = options;
  return mountReactIsland(
    target,
    (payload) => <ReactMigrationScenario onRequestLegacy={onRequestLegacy} payload={payload} scenario={scenario} />,
    initialPayload,
    runtimeOptions,
  );
}

export { mountNomenclatureReactIsland } from "./nomenclature-island";
export type { ReactMigrationIslandHandle, ReactMigrationIslandOptions, ReactMigrationIslandReadyEvent } from "./island-runtime";
