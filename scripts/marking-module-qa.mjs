#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(join(root, relativePath), "utf8");
const [scenario, model, host, app, registry, contracts, build, styles, previewServer, legacyServer] = await Promise.all([
  read("experiments/react-migration/src/modules/marking/MarkingScenario.tsx"),
  read("experiments/react-migration/src/modules/marking/model.ts"),
  read("src/modules/marking/react_island_host.js"),
  read("src/app.js"),
  read("src/module_registry.js"),
  read("src/mes_contracts.js"),
  read("scripts/build.mjs"),
  read("styles.css"),
  read("scripts/preview-dist.mjs"),
  read("server.js"),
]);

const demoSource = `${scenario}\n${model}`;
for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", "localStorage", "sessionStorage"]) {
  assert(!demoSource.includes(forbidden), `Marking demo must not use ${forbidden}`);
}
for (const component of ["OperationalPage", "ModuleHeader", "Panel", "MetricGrid", "ActionButton", "StatusToken", "TableWrap", "ModalOverlay"]) {
  assert(scenario.includes(component), `Marking must use shared MES component ${component}`);
}
assert(registry.includes('id: "marking", label: "Маркировка"') && registry.includes('groupId: "operations"'), "Marking must be a normal Operations navigation module");
assert(contracts.includes('marking: {') && contracts.includes('Фаза 1 работает только на явно помеченных MOCK-данных'), "Marking flow contract must declare its demo boundary");
assert(app.includes('createMarkingReactIslandHost') && app.includes('marking: {') && app.includes('mode: "mock", persistence: "memory-only"'), "Main MES runtime must own the Marking island");
assert(host.includes('data-react-marking-island') && host.includes('react-islands/marking.js'), "Marking host must provide an isolated React mount and versioned bundle");
assert(build.includes('marking-island.tsx') && build.includes('react-islands", "marking.js'), "Production build must publish the integrated Marking island");
assert(styles.includes('styles/react-marking-island.css'), "Main MES stylesheet must include Marking styles");
assert(!build.includes("bundleMarkingPilotPreview") && !previewServer.includes("/pilot/marking-preview") && !legacyServer.includes("/pilot/marking-preview"), "Standalone Marking preview route must be removed");
assert(demoSource.includes("MOCK") && scenario.includes("DEMO · MEMORY ONLY") && scenario.includes("Нет API, БД и сохранения"), "Visible UI and fixtures must remain explicitly demo-only");

console.log("Integrated Marking module contract passed");
