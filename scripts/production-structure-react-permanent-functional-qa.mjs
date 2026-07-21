import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY, SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { PRODUCTION_STRUCTURE_MATRIX_ROWS } from "../src/production_structure_matrix_data.js";
import { migrateLegacySystemDomains, serializeSystemDomains } from "../src/modules/system_domains/service.js";
import { cleanupChrome, delay, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const STATE_STORAGE_KEY = "mes-planning-prototype-state-v2";
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const responseBody = (value) => Buffer.from(JSON.stringify(value)).toString("base64");
async function waitPreview(origin) { for (let index = 0; index < 100; index += 1) { try { const response = await fetch(`${origin}/?module=productionStructureMatrix&structureRegistry=employees&qa-auth-bypass=1`, { cache: "no-store" }); if (response.ok && (await response.text()).includes('id="app"')) return; } catch {} await delay(120); } throw new Error(`Production Structure preview did not start at ${origin}`); }
async function stop(child) { if (child.exitCode === null && !child.killed) child.kill("SIGTERM"); await new Promise((resolve) => { if (child.exitCode !== null) return resolve(); const timer = setTimeout(resolve, 1200); child.once("exit", () => { clearTimeout(timer); resolve(); }); }); }

const registries = [
  { id: "orgUnits", index: 0, target: "[data-react-structure-org-units-island]" },
  { id: "workCenters", index: 1, target: "[data-react-structure-work-centers-island]" },
  { id: "positions", index: 2, target: "[data-react-structure-positions-island]" },
  { id: "employees", index: 3, target: "[data-react-structure-employees-island]" },
  { id: "equipment", index: 4, target: "[data-react-structure-equipment-island]" },
  { id: "responsibilityPolicies", index: 5, target: "[data-react-structure-responsibility-policies-island]" },
];
const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-production-structure-permanent-"));
const sharedStateFile = join(temporaryRoot, "shared-state.json");
const seed = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS });
const employeeId = String(seed.domains.registries.employees[0]?.id || "");
const migration = migrateLegacySystemDomains({
  matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS,
  legacyUi: {
    accessRoleProfiles: [{ id: "admin", label: "Администратор QA", scope: "global", defaultModule: "productionStructureMatrix", modulePermissions: { productionStructureMatrix: { view: true, edit: true } } }],
    accessRoleAssignments: { [employeeId]: "admin" },
  },
  migratedAt: "2026-07-22T00:00:00.000Z",
});
assert(migration.report.validation.valid && migration.report.canActivate, "canonical System Domains fixture must be activatable");
const snapshot = { version: 1, updatedAt: "2026-07-22T00:00:00.000Z", updatedBy: { actor: "production-structure-permanent-qa" }, values: { [STATE_STORAGE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }), [SYSTEM_DOMAINS_STORAGE_KEY]: serializeSystemDomains(migration.domains) }, sharedUi: {}, events: [] };
await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary shared state must stay private");
const original = await readFile(sharedStateFile, "utf8");
const port = await getFreePort();
const origin = `http://127.0.0.1:${port}`;
const preview = spawn(process.execPath, ["scripts/preview-dist.mjs"], { cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru", MES_SHARED_STATE_FILE: sharedStateFile }, stdio: ["ignore", "pipe", "pipe"] });
let previewOutput = "";
preview.stdout.on("data", (chunk) => { previewOutput += chunk; });
preview.stderr.on("data", (chunk) => { previewOutput += chunk; });
let chrome = null;
let legacyMatrixRequests = 0;
let systemDomainWrites = 0;
const consoleProblems = [];

try {
  await waitPreview(origin);
  chrome = await launchChrome("mes-production-structure-permanent-qa-");
  const { client } = chrome;
  const fulfill = (requestId, payload, responseCode = 200) => client.send("Fetch.fulfillRequest", { requestId, responseCode, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }, { name: "ETag", value: '"1"' }], body: responseBody(payload) }).catch((error) => consoleProblems.push(error.message));
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    if (message.method !== "Fetch.requestPaused") return;
    const requestUrl = new URL(message.params.request.url); const method = String(message.params.request.method || "GET").toUpperCase();
    if (requestUrl.pathname.includes("production_structure_matrix_data")) { legacyMatrixRequests += 1; void client.send("Fetch.continueRequest", { requestId: message.params.requestId }); return; }
    if (requestUrl.pathname === "/api/v1/system-domains/capabilities") { void fulfill(message.params.requestId, { ok: true, capabilities: { serverCommandsConfigured: true, serverCommandsEnabled: true, configuredServerCommandSurfaces: ["production-structure", "timesheet", "access-control"], serverCommandSurfaces: ["production-structure", "timesheet", "access-control"], actorAuthorization: { policyConfigured: true, authorized: true, reason: "" }, consistency: { matches: true, details: { authority: { mode: "postgres-primary" } } } } }); return; }
    if (requestUrl.pathname === "/api/v1/system-domains" && method === "GET") { void fulfill(message.params.requestId, { ok: true, revision: 1, item: migration.domains }); return; }
    if (requestUrl.pathname === "/api/v1/system-domains") { systemDomainWrites += 1; void fulfill(message.params.requestId, { ok: false, error: "writes forbidden in navigation QA" }, 405); return; }
    void client.send("Fetch.continueRequest", { requestId: message.params.requestId });
  });
  await client.send("Page.enable"); await client.send("Runtime.enable");
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `try { sessionStorage.setItem(${JSON.stringify(SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY)}, "1"); } catch {}` });
  await client.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/system-domains*", requestStage: "Request" }, { urlPattern: "*production_structure_matrix_data*", requestStage: "Request" }] });
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: `${origin}/?module=productionStructureMatrix&structureRegistry=employees&qa-auth-bypass=1` });

  const visited = [];
  for (const registry of [registries[3], registries[0], registries[1], registries[2], registries[4], registries[5]]) {
    if (registry.id !== "employees" || visited.length) await evaluate(client, (index) => document.querySelectorAll('[data-ui-component="SidebarItem"]')[index]?.click(), registry.index);
    await waitForCondition(client, ({ id, target }) => (new URL(location.href).searchParams.get("structureRegistry") || "orgUnits") === id && Boolean(document.querySelector(`${target}[data-react-island-runtime-mode="react"][data-react-island-state="ready"]`)), { arg: registry, message: `${registry.id}: permanent React registry did not own the route`, timeoutMs: 20_000 });
    const state = await evaluate(client, ({ id, target }) => ({ registry: new URL(location.href).searchParams.get("structureRegistry") || "orgUnits", targetCount: document.querySelectorAll(target).length, readyTargets: document.querySelectorAll('[data-react-island-state="ready"][data-react-island-runtime-mode="react"]').length, legacyRows: document.querySelectorAll("[data-system-domain-row]").length, sidebarItems: document.querySelectorAll('[data-ui-component="SidebarItem"]').length, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, id }), registry);
    assert(state.registry === registry.id && state.targetCount === 1 && state.readyTargets === 1, `${registry.id}: mixed or missing React renderer: ${JSON.stringify(state)}`);
    assert(state.legacyRows === 0 && state.sidebarItems === 7 && !state.overflow, `${registry.id}: legacy DOM, sidebar or overflow regression: ${JSON.stringify(state)}`);
    visited.push(registry.id);
  }
  assert(new Set(visited).size === 6, `typed navigation did not visit all six registries: ${JSON.stringify(visited)}`);
  assert(legacyMatrixRequests === 0, `normal six-registry path loaded legacy matrix ${legacyMatrixRequests} time(s)`);
  assert(systemDomainWrites === 0, `navigation QA performed ${systemDomainWrites} write(s)`);
  assert(consoleProblems.length === 0, `browser console errors: ${JSON.stringify(consoleProblems)}`);
  assert(await readFile(sharedStateFile, "utf8") === original, "functional navigation QA mutated shared state");
  console.log(`Production Structure permanent functional QA passed: ${visited.join(" -> ")}; no legacy data and no writes.`);
} catch (error) {
  if (chrome) console.error("Production Structure permanent QA debug:", JSON.stringify(await evaluate(chrome.client, () => ({ href: location.href, text: document.querySelector("#app")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 1400), resources: performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => name.includes("structure")) })).catch((debugError) => ({ error: debugError.message }))));
  if (previewOutput.trim()) console.error(previewOutput.trim());
  throw error;
} finally {
  if (chrome) await cleanupChrome(chrome);
  await stop(preview);
  await rm(temporaryRoot, { recursive: true, force: true });
}
