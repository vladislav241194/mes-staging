import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { StructureOrgUnitsScenario } from "./modules/structure-org-units/StructureOrgUnitsScenario";
export interface StructureOrgUnitsIslandOptions extends ReactMigrationIslandOptions { onRequestLegacy?(scope?: string): void }
export function mountStructureOrgUnitsReactIsland(target: HTMLElement, initialPayload: unknown, options: StructureOrgUnitsIslandOptions = {}) { const { onRequestLegacy, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <StructureOrgUnitsScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions); }
