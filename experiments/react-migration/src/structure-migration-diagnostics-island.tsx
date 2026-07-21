import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { StructureMigrationDiagnosticsScenario } from "./modules/structure-migration-diagnostics/StructureMigrationDiagnosticsScenario";
import type { StructureRegistryId } from "./modules/structure-employees/adapter";
export interface StructureMigrationDiagnosticsIslandOptions extends ReactMigrationIslandOptions { onNavigateRegistry?(registryId: StructureRegistryId): void }
export function mountStructureMigrationDiagnosticsReactIsland(target: HTMLElement, initialPayload: unknown, options: StructureMigrationDiagnosticsIslandOptions = {}) { const { onNavigateRegistry, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <StructureMigrationDiagnosticsScenario payload={payload} onNavigateRegistry={onNavigateRegistry} />, initialPayload, runtimeOptions); }
