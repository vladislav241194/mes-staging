import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { StructureOrgUnitsScenario, type StructureOrgUnitsReactCommand } from "./modules/structure-org-units/StructureOrgUnitsScenario";
import type { StructureRegistryId } from "./modules/structure-employees/adapter";
export interface StructureOrgUnitsIslandOptions extends ReactMigrationIslandOptions { onCommand?(command: StructureOrgUnitsReactCommand): Promise<{ ok?: boolean; id?: string; message?: string } | void>; onNavigateRegistry?(registryId: StructureRegistryId): void }
export function mountStructureOrgUnitsReactIsland(target: HTMLElement, initialPayload: unknown, options: StructureOrgUnitsIslandOptions = {}) { const { onCommand, onNavigateRegistry, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <StructureOrgUnitsScenario payload={payload} onCommand={onCommand} onNavigateRegistry={onNavigateRegistry} />, initialPayload, runtimeOptions); }
