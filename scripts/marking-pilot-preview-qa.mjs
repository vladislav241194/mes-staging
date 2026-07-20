#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(root, "experiments", "marking-phase-1", "src");
const [app, fixture, buildScript, previewServer, legacyServer, publicAuth] = await Promise.all([
  readFile(join(sourceRoot, "App.tsx"), "utf8"),
  readFile(join(sourceRoot, "testData.ts"), "utf8"),
  readFile(join(root, "scripts", "build.mjs"), "utf8"),
  readFile(join(root, "scripts", "preview-dist.mjs"), "utf8"),
  readFile(join(root, "server.js"), "utf8"),
  readFile(join(root, "scripts", "public-auth-guard.mjs"), "utf8"),
]);

const source = `${app}\n${fixture}`;
for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", "localStorage", "sessionStorage"]) {
  assert(!source.includes(forbidden), `Marking Pilot preview must not use ${forbidden}`);
}
assert(fixture.includes('id: "MOCK-MKG-01"') && fixture.includes('workOrder: "MOCK-СЗН-018"'), "Pilot preview fixtures must stay explicitly MOCK-labelled");
assert(app.includes("MOCK · MEMORY ONLY") && app.includes("Нет API, БД и сохранения"), "Pilot preview must display its isolation boundary");
assert(app.includes("MOCK · Pilot preview") && !app.includes("MOCK · локальный прототип"), "Published preview must identify itself as a Pilot surface");
assert(buildScript.includes("bundleMarkingPilotPreview") && buildScript.includes('"prototypes", "marking"'), "Production build must publish the isolated marking preview");
assert(previewServer.includes('decodedPath === "/pilot/marking-preview"') && previewServer.includes('"/prototypes/marking/index.html"'), "Pilot server must map only the explicit preview route");
assert(legacyServer.includes('decoded === "/pilot/marking-preview"') && legacyServer.includes('"/dist/prototypes/marking/index.html"'), "Legacy server must preserve the same explicit preview route");
assert(publicAuth.includes('url.pathname === "/pilot/marking-preview"'), "Unauthenticated Pilot preview visits must reach the normal login flow");

console.log("Marking Pilot preview contract passed");
