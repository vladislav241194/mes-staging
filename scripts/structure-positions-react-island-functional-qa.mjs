import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { PRODUCTION_STRUCTURE_MATRIX_ROWS } from "../src/production_structure_matrix_data.js";
import { migrateLegacySystemDomains, serializeSystemDomains } from "../src/modules/system_domains/service.js";
import { cleanupChrome, delay, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const STATE_STORAGE_KEY = "mes-planning-prototype-state-v2";
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const qaConfig = process.env.MES_STRUCTURE_QA_REGISTRY === "migrationDiagnostics" ? {
  label: "Migration Diagnostics", registryId: "migrationDiagnostics", rowCount: 152, cellCount: 5, isDiagnostics: true, target: "data-react-structure-migration-diagnostics-island",
  featureFlag: "MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS", evaluationFlag: "MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS_READ_ONLY_EVALUATION",
  evaluationQuery: "react-structure-migration-diagnostics-evaluation", fallbackLabel: "Сотрудники", fallbackRegistry: "employees", fallbackCount: 76,
} : process.env.MES_STRUCTURE_QA_REGISTRY === "responsibilityPolicies" ? {
  label: "Responsibility Policies", registryId: "responsibilityPolicies", rowCount: 1, cellCount: 4, target: "data-react-structure-responsibility-policies-island",
  featureFlag: "MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES", evaluationFlag: "MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES_READ_ONLY_EVALUATION",
  evaluationQuery: "react-structure-responsibility-policies-evaluation", fallbackLabel: "Сотрудники", fallbackRegistry: "employees", fallbackCount: 76,
} : process.env.MES_STRUCTURE_QA_REGISTRY === "equipment" ? {
  label: "Equipment", registryId: "equipment", rowCount: 6, cellCount: 5, target: "data-react-structure-equipment-island",
  featureFlag: "MES_REACT_STRUCTURE_EQUIPMENT", evaluationFlag: "MES_REACT_STRUCTURE_EQUIPMENT_READ_ONLY_EVALUATION",
  evaluationQuery: "react-structure-equipment-evaluation", fallbackLabel: "Подразделения", fallbackRegistry: "orgUnits", fallbackCount: 19,
} : process.env.MES_STRUCTURE_QA_REGISTRY === "workCenters" ? {
  label: "Work Centers", registryId: "workCenters", rowCount: 19, cellCount: 5, target: "data-react-structure-work-centers-island",
  featureFlag: "MES_REACT_STRUCTURE_WORK_CENTERS", evaluationFlag: "MES_REACT_STRUCTURE_WORK_CENTERS_READ_ONLY_EVALUATION",
  evaluationQuery: "react-structure-work-centers-evaluation", fallbackLabel: "Оборудование", fallbackRegistry: "equipment", fallbackCount: 6,
} : process.env.MES_STRUCTURE_QA_REGISTRY === "orgUnits" ? {
  label: "Org Units", registryId: "orgUnits", rowCount: 19, cellCount: 5, target: "data-react-structure-org-units-island",
  featureFlag: "MES_REACT_STRUCTURE_ORG_UNITS", evaluationFlag: "MES_REACT_STRUCTURE_ORG_UNITS_READ_ONLY_EVALUATION",
  evaluationQuery: "react-structure-org-units-evaluation", fallbackLabel: "Рабочие центры", fallbackRegistry: "workCenters", fallbackCount: 19,
} : {
  label: "Positions", registryId: "positions", rowCount: 49, cellCount: 5, target: "data-react-structure-positions-island",
  featureFlag: "MES_REACT_STRUCTURE_POSITIONS", evaluationFlag: "MES_REACT_STRUCTURE_POSITIONS_READ_ONLY_EVALUATION",
  evaluationQuery: "react-structure-positions-evaluation", fallbackLabel: "Подразделения", fallbackRegistry: "orgUnits", fallbackCount: 19,
};
async function waitPreview(origin) {
  for (let index = 0; index < 80; index += 1) {
    try { const response = await fetch(`${origin}/?module=productionStructureMatrix&qa-auth-bypass=1`, { cache: "no-store" }); const html = await response.text(); if (response.ok && html.includes('id="app"') && !html.includes("MES Admin")) return; } catch {}
    await delay(120);
  }
  throw new Error(`Structure Positions preview did not start at ${origin}`);
}
async function stop(child) { if (child.exitCode === null && !child.killed) child.kill("SIGTERM"); await new Promise((resolve) => { if (child.exitCode !== null) return resolve(); const timer = setTimeout(resolve, 1200); child.once("exit", () => { clearTimeout(timer); resolve(); }); }); }
async function selectRegistry(client, registryId) { await waitForCondition(client, (id) => Boolean(document.querySelector(`[data-system-domain-registry="${id}"]`)), { arg: registryId, message: `registry ${registryId} missing` }); await evaluate(client, (id) => document.querySelector(`[data-system-domain-registry="${id}"]`)?.click(), registryId); }

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-structure-positions-react-"));
const sharedStateFile = join(temporaryRoot, "shared-state.json");
const baseline = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS });
const supervisorPosition = baseline.domains.registries.positions.find((position) => position.kind === "supervisor");
const masterId = baseline.domains.registries.employmentAssignments.find((assignment) => assignment.positionId === supervisorPosition?.id)?.employeeId || "";
const executorId = baseline.domains.registries.employmentAssignments.find((assignment) => assignment.employeeId !== masterId)?.employeeId || "";
assert(masterId && executorId, "canonical fixture must contain access subjects");
const migration = migrateLegacySystemDomains({
  matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS,
  legacyUi: {
    accessRoleProfiles: [
      { id: "master", label: "Мастер производства", scope: "workCenter", defaultModule: "shiftMasterBoard", modulePermissions: { productionStructureMatrix: { view: true, edit: true } } },
      { id: "executor", label: "Исполнитель", scope: "self", defaultModule: "authSessionPrototype", modulePermissions: { productionStructureMatrix: { view: true, edit: false } } },
    ],
    accessRoleAssignments: { [masterId]: "master", [executorId]: "executor" },
  },
  migratedAt: "2026-07-19T00:00:00.000Z",
});
if (qaConfig.registryId === "responsibilityPolicies") {
  migration.domains.registries.responsibilityPolicies = [{ id: "POLICY-QA-001", subjectEmployeeId: masterId, mode: "manual", targetEmployeeIds: [executorId], updatedAt: "2026-07-19T00:00:00.000Z" }];
}
assert(migration.report.validation.valid && (qaConfig.isDiagnostics ? PRODUCTION_STRUCTURE_MATRIX_ROWS.length : migration.domains.registries[qaConfig.registryId].length) === qaConfig.rowCount, `canonical fixture must contain ${qaConfig.rowCount} valid ${qaConfig.label}`);
const snapshot = { version: 1, updatedAt: "2026-07-19T00:00:00.000Z", updatedBy: { actor: "structure-positions-react-functional-qa" }, values: { [STATE_STORAGE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }), [SYSTEM_DOMAINS_STORAGE_KEY]: serializeSystemDomains(migration.domains) }, sharedUi: {}, events: [] };
await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary shared state permissions changed");
const original = await readFile(sharedStateFile, "utf8");
const enabledPort = await getFreePort(); const legacyPort = await getFreePort();
const enabledOrigin = `http://127.0.0.1:${enabledPort}`; const legacyOrigin = `http://127.0.0.1:${legacyPort}`;
const start = (port, enabled) => spawn(process.execPath, ["scripts/preview-dist.mjs"], { cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru", MES_SHARED_STATE_FILE: sharedStateFile, ...(enabled ? { [qaConfig.featureFlag]: "1", [qaConfig.evaluationFlag]: "1" } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
const enabledPreview = start(enabledPort, true); const legacyPreview = start(legacyPort, false);
let enabledOutput = ""; let legacyOutput = "";
enabledPreview.stdout.on("data", (chunk) => { enabledOutput += chunk.toString(); }); enabledPreview.stderr.on("data", (chunk) => { enabledOutput += chunk.toString(); });
legacyPreview.stdout.on("data", (chunk) => { legacyOutput += chunk.toString(); }); legacyPreview.stderr.on("data", (chunk) => { legacyOutput += chunk.toString(); });
let chrome = null; let interceptedReads = 0; const consoleProblems = [];
try {
  await Promise.all([waitPreview(enabledOrigin), waitPreview(legacyOrigin)]);
  chrome = await launchChrome("mes-structure-positions-react-qa-"); const { client } = chrome;
  const responseBody = Buffer.from(JSON.stringify({ ok: true, revision: 1, item: migration.domains })).toString("base64");
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Fetch.requestPaused") {
      const requestUrl = new URL(message.params.request.url);
      if (requestUrl.pathname === "/api/v1/system-domains") { interceptedReads += 1; void client.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }, { name: "ETag", value: '"1"' }], body: responseBody }).catch((error) => consoleProblems.push(error.message)); }
      else void client.send("Fetch.continueRequest", { requestId: message.params.requestId }).catch((error) => consoleProblems.push(error.message));
      return;
    }
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
  });
  await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/system-domains*", requestStage: "Request" }] }); await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  await client.send("Page.navigate", { url: `${legacyOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1` });
  await waitForCondition(client, () => document.querySelectorAll('[data-system-domain-table="orgUnits"] [data-system-domain-row]').length === 19, { message: "legacy canonical payload missing" });
  await selectRegistry(client, qaConfig.registryId); await waitForCondition(client, (config) => document.querySelectorAll(config.isDiagnostics ? "[data-migration-source-row]" : `[data-system-domain-table="${config.registryId}"] [data-system-domain-row]`).length === config.rowCount, { arg: qaConfig, message: `legacy ${qaConfig.label} missing` });
  const legacyRows = await evaluate(client, (config) => [...document.querySelectorAll(config.isDiagnostics ? "[data-migration-source-row]" : `[data-system-domain-table="${config.registryId}"] [data-system-domain-row]`)].map((row) => { const cells = [...row.querySelectorAll("td")]; return (config.isDiagnostics ? cells : cells.slice(0, -1)).map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" "); }), qaConfig);
  const legacyMetrics = await evaluate(client, () => Object.fromEntries([...document.querySelectorAll('.production-structure-kpis article')].map((card) => [card.querySelector("span")?.textContent?.trim() || "", Number(card.querySelector("strong")?.textContent || 0)])));

  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1` });
  await waitForCondition(client, () => document.querySelectorAll('[data-system-domain-table="orgUnits"] [data-system-domain-row]').length === 19, { message: "enabled default canonical payload missing" });
  await selectRegistry(client, qaConfig.registryId); await waitForCondition(client, (config) => document.querySelectorAll(config.isDiagnostics ? "[data-migration-source-row]" : `[data-system-domain-table="${config.registryId}"] [data-system-domain-row]`).length === config.rowCount, { arg: qaConfig, message: `enabled default did not retain legacy ${qaConfig.label}` });
  assert(await evaluate(client, (config) => !document.querySelector(`[${config.target}]`), qaConfig), "server permission without session request must remain legacy");

  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&${qaConfig.evaluationQuery}=1` });
  await waitForCondition(client, (config) => Boolean(document.querySelector(`[${config.target}][data-react-island-state="ready"]`) && document.querySelectorAll(config.isDiagnostics ? "[data-migration-source-row]" : '[data-ui-component="SelectableRow"]').length === config.rowCount), { arg: qaConfig, message: `Structure ${qaConfig.label} React island did not render ${qaConfig.rowCount} rows`, timeoutMs: 15_000 });
  const initial = await evaluate(client, (config) => { const target = document.querySelector(`[${config.target}]`); const selected = document.querySelector('[data-ui-component="SelectableRow"].is-selected'); const metrics = Object.fromEntries([...document.querySelectorAll('[data-ui-component="MetricCard"]')].map((card) => [card.querySelector("span")?.textContent?.trim() || "", Number(card.querySelector("strong")?.textContent || 0)])); const rowSelector = config.isDiagnostics ? "[data-migration-source-row]" : '[data-ui-component="SelectableRow"]'; return { rows: [...document.querySelectorAll(rowSelector)].map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ")), selectedText: selected?.textContent?.replace(/\s+/g, " ").trim() || "", detail: document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || "", disabled: config.isDiagnostics || document.querySelector('[data-ui-component="ActionButton"]')?.disabled === true, sidebarItems: document.querySelectorAll('[data-ui-component="SidebarItem"]').length, metrics, issueTitles: [...document.querySelectorAll('[data-ui-component="Panel"] h2')].map((heading) => heading.textContent?.trim() || ""), revision: target?.dataset.reactIslandRevision, commitMs: Number(target?.dataset.reactIslandCommitMs), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }; }, qaConfig);
  assert(JSON.stringify(initial.rows) === JSON.stringify(legacyRows), `React and legacy ${qaConfig.label} cells/order differ\nlegacy=${JSON.stringify(legacyRows)}\nreact=${JSON.stringify(initial.rows)}`);
  assert(initial.rows.length === qaConfig.rowCount && (qaConfig.isDiagnostics || initial.selectedText.includes(initial.detail)) && initial.disabled && initial.sidebarItems === 7 && initial.revision === "1", `${qaConfig.label} selection/detail/read-only/sidebar contract failed`);
  assert(qaConfig.isDiagnostics ? JSON.stringify(initial.metrics) === JSON.stringify(legacyMetrics) : initial.metrics["Подразделений"] === 19 && initial.metrics["Рабочих центров"] === 19 && initial.metrics["Должностей"] === 49 && initial.metrics["Сотрудников"] === 76 && initial.metrics["Оборудования"] === 6, `${qaConfig.label} metrics differ from legacy/System Domains: legacy=${JSON.stringify(legacyMetrics)} react=${JSON.stringify(initial.metrics)}`);
  if (qaConfig.isDiagnostics) assert(["Потерянные связи", "Дубликаты", "Неприменённые overrides", "Игнорированные legacy-строки"].every((title) => initial.issueTitles.includes(title)), "Migration Diagnostics issue groups are incomplete");
  assert(Number.isFinite(initial.commitMs) && initial.commitMs < 2000 && !initial.overflow, "Positions commit/overflow gate failed");
  if (!qaConfig.isDiagnostics) { const second = await evaluate(client, async () => { const rows = [...document.querySelectorAll('[data-ui-component="SelectableRow"]')]; const target = rows[Math.min(1, rows.length - 1)]; target?.click(); await new Promise((resolve) => setTimeout(resolve, 50)); return [document.querySelectorAll('[data-ui-component="SelectableRow"].is-selected').length, target?.textContent?.replace(/\s+/g, " ").trim() || "", document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || ""]; }); assert(second[0] === 1 && second[1].includes(second[2]), `${qaConfig.label} selection/detail synchronization failed`); }
  await evaluate(client, (config) => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((entry) => entry.textContent?.includes(config.fallbackLabel))?.click(), qaConfig);
  await waitForCondition(client, (config) => Boolean(!document.querySelector(`[${config.target}]`) && document.querySelectorAll(`[data-system-domain-table="${config.fallbackRegistry}"] [data-system-domain-row]`).length === config.fallbackCount), { arg: qaConfig, message: `${qaConfig.label} legacy fallback failed` });
  assert(interceptedReads >= 3, "functional QA must exercise PostgreSQL read-model hydration on all navigations");
  assert(consoleProblems.length === 0, `browser console problems:\n${consoleProblems.join("\n")}`); assert(await readFile(sharedStateFile, "utf8") === original, "read-only Positions scenario changed state");
  console.log(`Structure ${qaConfig.label} React production-shell functional QA: OK`);
  console.log(`- same PostgreSQL payload: ${qaConfig.rowCount} legacy rows = ${qaConfig.rowCount} React rows; first commit ${initial.commitMs.toFixed(2)} ms`);
  console.log(`- ${qaConfig.cellCount} cells/order, ${qaConfig.isDiagnostics ? "four issue groups" : "selection/detail"}, seven registries, six metrics, legacy fallback and unchanged state: pass`);
} catch (error) { if (enabledOutput.trim()) console.error(enabledOutput.trim()); if (legacyOutput.trim()) console.error(legacyOutput.trim()); throw error; }
finally { if (chrome) await cleanupChrome(chrome); await Promise.all([stop(enabledPreview), stop(legacyPreview)]); await rm(temporaryRoot, { recursive: true, force: true }); }
