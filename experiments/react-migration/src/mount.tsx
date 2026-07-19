import { ComponentTypesScenario } from "./modules/component-types/ComponentTypesScenario";
import { BoardsScenario } from "./modules/boards/BoardsScenario";
import { NomenclatureScenario } from "./modules/nomenclature/NomenclatureScenario";
import { RolesScenario } from "./modules/roles/RolesScenario";
import { OperationsScenario } from "./modules/operations/OperationsScenario";
import { NomenclatureTypesScenario } from "./modules/nomenclature-types/NomenclatureTypesScenario";
import { StructureEmployeesScenario } from "./modules/structure-employees/StructureEmployeesScenario";
import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";

export type ReactMigrationScenarioId = "nomenclature" | "componentTypes" | "boards" | "structureEmployees" | "roles" | "operations" | "nomenclatureTypes";

export interface ReactMigrationScenarioOptions extends ReactMigrationIslandOptions {
  onRequestLegacy?(): void;
}

function ReactMigrationScenario({ onRequestLegacy, payload, scenario }: { onRequestLegacy?(): void; payload: unknown; scenario: ReactMigrationScenarioId }) {
  if (scenario === "componentTypes") return <ComponentTypesScenario payload={payload} />;
  if (scenario === "boards") return <BoardsScenario payload={payload} />;
  if (scenario === "structureEmployees") return <StructureEmployeesScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "roles") return <RolesScenario payload={payload} />;
  if (scenario === "operations") return <OperationsScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
  if (scenario === "nomenclatureTypes") return <NomenclatureTypesScenario payload={payload} onRequestLegacy={onRequestLegacy} />;
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
export { mountBoardsReactIsland } from "./boards-island";
export { mountStructureEmployeesReactIsland } from "./structure-employees-island";
export { mountRolesReactIsland } from "./roles-island";
export { mountComponentTypesReactIsland } from "./component-types-island";
export { mountOperationsReactIsland } from "./operations-island";
export { mountNomenclatureTypesReactIsland } from "./nomenclature-types-island";
export type { ReactMigrationIslandHandle, ReactMigrationIslandOptions, ReactMigrationIslandReadyEvent } from "./island-runtime";
