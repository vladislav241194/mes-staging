#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(join(root, relativePath), "utf8");
const [scenario, model, apiAdapter, transport, host, app, registry, contracts, features, build, styles, previewServer, legacyServer, endpoint, repository, migration, cleanup] = await Promise.all([
  read("experiments/react-migration/src/modules/marking/MarkingScenario.tsx"),
  read("experiments/react-migration/src/modules/marking/model.ts"),
  read("experiments/react-migration/src/modules/marking/api.ts"),
  read("src/modules/marking/api_client.ts"),
  read("src/modules/marking/react_island_host.js"),
  read("src/app.js"),
  read("src/module_registry.js"),
  read("src/mes_contracts.js"),
  read("src/feature_registry.js"),
  read("scripts/build.mjs"),
  read("styles.css"),
  read("scripts/preview-dist.mjs"),
  read("server.js"),
  read("scripts/domain-marking-phase1-endpoint.mjs"),
  read("scripts/domain-marking-phase1-repository.mjs"),
  read("db/migrations/035_marking_phase1_prototype.sql"),
  read("scripts/marking-phase1-cleanup.mjs"),
]);

const reactSource = `${scenario}\n${model}\n${apiAdapter}`;
for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", "localStorage", "sessionStorage"]) {
  assert(!reactSource.includes(forbidden), `Marking React code must use typed host ports, not ${forbidden}`);
}
for (const component of ["ModulePage", "ModuleHeader", "Panel", "MetricGrid", "ActionButton", "StatusToken", "TableWrap", "ModalOverlay"]) {
  assert(scenario.includes(component), `Marking must use shared MES component ${component}`);
}

assert(registry.includes('id: "marking", label: "Маркировка"') && registry.includes('groupId: "operations"'), "Marking must remain a normal Operations navigation module");
assert(contracts.includes('marking: {') && contracts.includes("отдельных PostgreSQL-таблицах Marking"), "Marking flow contract must declare the isolated durable Phase 1 boundary");
assert(features.includes('storage: ["PostgreSQL: marking_phase1_*"]') && features.includes('api: ["/api/v1/marking"]'), "Feature registry must expose Marking PostgreSQL and API ownership");
assert(app.includes("createMarkingApiClient") && app.includes('mode: "production"') && app.includes('persistence: "postgresql-isolated-phase-1"'), "Main MES runtime must provide the production Marking API port");
assert(host.includes("activation.productionEnabled === true") && host.includes("canFallbackToLegacy: () => false"), "Marking normal path must be React-only and fail closed");
assert(transport.includes('baseUrl = "/api/v1/marking"') && transport.includes('"Idempotency-Key": requestId'), "Shell transport must use the versioned idempotent API");
assert(apiAdapter.includes("createMarkingProductionClient") && apiAdapter.includes('mode: "production" | "mock"'), "React adapter must keep production and explicit mock modes separate");
assert(previewServer.includes("handleMarkingPhase1Request") && previewServer.includes('stateScope: "test-state"'), "Production preview server must mount the isolated Marking handler");
assert(endpoint.includes('const BASE_PATH = "/api/v1/marking"') && endpoint.includes('testData: true'), "Marking endpoint must label every response as Phase 1 test data");
assert(repository.includes("marking_phase1_tasks") && repository.includes("MOK-MARKING-"), "Repository must use isolated durable tables and visibly marked seed data");
assert(migration.includes("035_marking_phase1_prototype") && migration.includes("prototype_scope = 'isolated-test'"), "Additive migration must enforce the isolated test scope");
assert(cleanup.includes("DELETE-ALL-MARKING-PHASE1-TEST-DATA") && cleanup.includes('mode: "dry-run"') && cleanup.includes("process.getuid() !== 0"), "Test-state cleanup must default to dry-run and require root plus explicit confirmation");
assert(!/UPDATE\s+(?:shift_|work_orders|production_)/i.test(`${repository}\n${migration}`), "Marking Phase 1 must not mutate production owners");

assert(host.includes("data-react-marking-island") && host.includes("react-islands/marking.js"), "Marking host must provide an isolated React mount and versioned bundle");
assert(build.includes("marking-island.tsx") && build.includes('react-islands", "marking.js'), "Production build must publish the integrated Marking island");
assert(styles.includes("styles/react-marking-island.css"), "Main MES stylesheet must include Marking styles");
assert(!build.includes("bundleMarkingPilotPreview") && !previewServer.includes("/pilot/marking-preview") && !legacyServer.includes("/pilot/marking-preview"), "Standalone Marking preview route must stay removed");
assert(scenario.includes("REACT + TS · PHASE 1") && scenario.includes('host.mode === "mock"'), "UI must show an honest Phase 1 marker and reserve MOCK for explicit mock mode");

console.log("Integrated Marking Phase 1 contract passed");
console.log("- React + TypeScript production port: pass");
console.log("- isolated PostgreSQL/API test-state owner: pass");
console.log("- normal-path legacy fallback removed: pass");
