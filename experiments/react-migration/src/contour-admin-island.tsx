import { mountReactIsland, type ReactMigrationIslandOptions } from "./island-runtime";
import { ContourAdminScenario } from "./modules/contour-admin/ContourAdminScenario";
export function mountContourAdminReactIsland(target: HTMLElement, initialPayload: unknown, options: ReactMigrationIslandOptions & { onRequestLegacy?(scope?: string): void } = {}) { const { onRequestLegacy, ...runtime } = options; return mountReactIsland(target, (payload) => <ContourAdminScenario payload={payload} onRequestLegacy={onRequestLegacy} />, initialPayload, runtime); }
