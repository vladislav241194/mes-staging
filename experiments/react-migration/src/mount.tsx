import { ComponentTypesScenario } from "./modules/component-types/ComponentTypesScenario";
import { NomenclatureScenario } from "./modules/nomenclature/NomenclatureScenario";
import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";

export type ReactMigrationScenarioId = "nomenclature" | "componentTypes";

function ReactMigrationScenario({ payload, scenario }: { payload: unknown; scenario: ReactMigrationScenarioId }) {
  if (scenario === "componentTypes") return <ComponentTypesScenario payload={payload} />;
  return <NomenclatureScenario payload={payload} />;
}

export function mountReactMigrationIsland(
  target: HTMLElement,
  scenario: ReactMigrationScenarioId,
  initialPayload: unknown,
  options: ReactMigrationIslandOptions = {},
): ReturnType<typeof mountReactIsland> {
  return mountReactIsland(
    target,
    (payload) => <ReactMigrationScenario payload={payload} scenario={scenario} />,
    initialPayload,
    options,
  );
}

export { mountNomenclatureReactIsland } from "./nomenclature-island";
export type { ReactMigrationIslandHandle, ReactMigrationIslandOptions, ReactMigrationIslandReadyEvent } from "./island-runtime";
