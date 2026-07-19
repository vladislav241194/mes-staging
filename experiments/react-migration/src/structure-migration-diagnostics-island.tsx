import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { StructureMigrationDiagnosticsScenario } from "./modules/structure-migration-diagnostics/StructureMigrationDiagnosticsScenario";
export interface StructureMigrationDiagnosticsIslandOptions extends ReactMigrationIslandOptions { onRequestLegacy?(scope?: string): void }
export function mountStructureMigrationDiagnosticsReactIsland(target: HTMLElement, initialPayload: unknown, options: StructureMigrationDiagnosticsIslandOptions = {}) { const { onRequestLegacy, ...runtimeOptions } = options; return mountReactIsland(target, (payload) => <StructureMigrationDiagnosticsScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtimeOptions); }
