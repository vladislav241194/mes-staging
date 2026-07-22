import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { PRODUCTION_STRUCTURE_MATRIX_ROWS } from "./fixtures/production_structure_matrix_data.js";
import { migrateLegacySystemDomains, serializeSystemDomains } from "../src/modules/system_domains/service.js";
import { cleanupChrome, delay, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const STATE_STORAGE_KEY = "mes-planning-prototype-state-v2";
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const responseBody = (value) => Buffer.from(JSON.stringify(value)).toString("base64");
async function waitPreview(origin) { for (let index = 0; index < 100; index += 1) { try { const response = await fetch(`${origin}/?module=productionStructureMatrix&structureRegistry=migrationDiagnostics&qa-auth-bypass=1`, { cache: "no-store" }); if (response.ok && (await response.text()).includes('id="app"')) return; } catch {} await delay(120); } throw new Error(`Diagnostics preview did not start at ${origin}`); }
async function stop(child) { if (child.exitCode === null && !child.killed) child.kill("SIGTERM"); await new Promise((resolve) => { if (child.exitCode !== null) return resolve(); const timer = setTimeout(resolve, 1200); child.once("exit", () => { clearTimeout(timer); resolve(); }); }); }
const captureLegacyDiagnostics = () => ({
  headers: [...document.querySelectorAll("table thead th")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()),
  rows: [...document.querySelectorAll("[data-migration-source-row]")].map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim())),
  metrics: Object.fromEntries([...document.querySelectorAll(".production-structure-kpis article")].map((card) => [card.querySelector("span")?.textContent?.trim() || "", Number((card.querySelector("strong")?.textContent || "0").replace(/\s+/g, ""))])),
});
const capturePermanentDiagnostics = () => {
  const target = document.querySelector("[data-react-structure-migration-diagnostics-island]");
  const panels = [...document.querySelectorAll('[data-ui-component="Panel"]')];
  return {
    headers: [...document.querySelectorAll("table thead th")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()),
    rows: [...document.querySelectorAll("[data-migration-source-row]")].map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim())),
    metrics: Object.fromEntries([...document.querySelectorAll('[data-ui-component="MetricCard"]')].map((card) => [card.querySelector("span")?.textContent?.trim() || "", Number((card.querySelector("strong")?.textContent || "0").replace(/\s+/g, ""))])),
    issuePanels: panels.map((panel) => panel.textContent?.replace(/\s+/g, " ").trim() || ""),
    sidebar: [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].map((item) => item.textContent?.replace(/\s+/g, " ").trim() || ""),
    buttons: [...document.querySelectorAll("button")].map((button) => button.textContent?.replace(/\s+/g, " ").trim() || ""),
    sourceMeta: panels.find((panel) => panel.querySelector("h2")?.textContent?.includes("Legacy Excel"))?.textContent?.replace(/\s+/g, " ").trim() || "",
    revision: target?.dataset.reactIslandRevision,
    commitMs: Number(target?.dataset.reactIslandCommitMs),
    ariaBusy: target?.getAttribute("aria-busy") || "",
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    registry: new URL(location.href).searchParams.get("structureRegistry"),
  };
};

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-structure-diagnostics-permanent-"));
const sharedStateFile = join(temporaryRoot, "shared-state.json");
const migration = migrateLegacySystemDomains({
  matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS,
  legacyUi: {
    accessRoleProfiles: [{ id: "admin", label: "Администратор QA", scope: "global", defaultModule: "productionStructureMatrix", modulePermissions: { productionStructureMatrix: { view: true, edit: true } } }],
    accessRoleAssignments: { [migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS }).domains.registries.employees[0].id]: "admin" },
  },
  migratedAt: "2026-07-21T00:00:00.000Z",
});
assert(migration.report.validation.valid && migration.report.canActivate && migration.report.targetCounts.employees === 76 && migration.report.targetCounts.orgUnits === 19 && migration.report.targetCounts.positions === 49, "Diagnostics fixture is not canonical");
const snapshot = { version: 1, updatedAt: "2026-07-21T00:00:00.000Z", updatedBy: { actor: "diagnostics-permanent-qa" }, values: { [STATE_STORAGE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }), [SYSTEM_DOMAINS_STORAGE_KEY]: serializeSystemDomains(migration.domains) }, sharedUi: {}, events: [] };
await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary shared state permissions changed");
const original = await readFile(sharedStateFile, "utf8");

const releasePolicy = JSON.parse(await readFile(join(process.cwd(), "react-runtime-policy.json"), "utf8"));
const permanentPolicyFile = join(temporaryRoot, "diagnostics-permanent-policy.json");
const legacyPolicyFile = join(temporaryRoot, "diagnostics-legacy-policy.json");
await writeFile(permanentPolicyFile, `${JSON.stringify({ ...releasePolicy, policyId: "qa-diagnostics-permanent", surfaces: { ...releasePolicy.surfaces, structureMigrationDiagnostics: "react", weeklyProductionControl: "react" } }, null, 2)}\n`, { mode: 0o600 });
await writeFile(legacyPolicyFile, `${JSON.stringify({ ...releasePolicy, policyId: "qa-diagnostics-legacy", surfaces: { ...releasePolicy.surfaces, structureMigrationDiagnostics: "legacy", weeklyProductionControl: "react" } }, null, 2)}\n`, { mode: 0o600 });

const permanentPort = await getFreePort(); const legacyPort = await getFreePort();
const permanentOrigin = `http://127.0.0.1:${permanentPort}`; const legacyOrigin = `http://127.0.0.1:${legacyPort}`;
const start = (port, policyPath) => spawn(process.execPath, ["scripts/preview-dist.mjs"], { cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru", MES_SHARED_STATE_FILE: sharedStateFile, MES_REACT_RUNTIME_POLICY_PATH: policyPath }, stdio: ["ignore", "pipe", "pipe"] });
const permanentPreview = start(permanentPort, permanentPolicyFile); const legacyPreview = start(legacyPort, legacyPolicyFile);
let permanentOutput = ""; let legacyOutput = "";
permanentPreview.stdout.on("data", (chunk) => { permanentOutput += chunk; }); permanentPreview.stderr.on("data", (chunk) => { permanentOutput += chunk; });
legacyPreview.stdout.on("data", (chunk) => { legacyOutput += chunk; }); legacyPreview.stderr.on("data", (chunk) => { legacyOutput += chunk; });

let chrome = null; const consoleProblems = []; let interceptedReads = 0; let systemDomainWrites = 0;
let permanentReadMode = "success"; let holdMatrix = false; const pendingReadIds = []; const pendingMatrixIds = [];
try {
  await Promise.all([waitPreview(permanentOrigin), waitPreview(legacyOrigin)]);
  chrome = await launchChrome("mes-structure-diagnostics-permanent-qa-"); const { client } = chrome;
  const fulfill = (requestId, payload, responseCode = 200) => client.send("Fetch.fulfillRequest", { requestId, responseCode, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }, { name: "ETag", value: '"diagnostics-qa-1"' }], body: responseBody(payload) }).catch((error) => consoleProblems.push(error.message));
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    if (message.method !== "Fetch.requestPaused") return;
    const requestUrl = new URL(message.params.request.url); const method = String(message.params.request.method || "GET").toUpperCase();
    if (requestUrl.pathname.endsWith("/production_structure_bootstrap_data.js") || requestUrl.pathname.includes("/production_structure_bootstrap_data-")) {
      if (requestUrl.port === String(permanentPort) && holdMatrix) { pendingMatrixIds.push(message.params.requestId); return; }
      void client.send("Fetch.continueRequest", { requestId: message.params.requestId }).catch((error) => consoleProblems.push(error.message)); return;
    }
    if (requestUrl.pathname === "/api/v1/system-domains/capabilities") { void fulfill(message.params.requestId, { ok: true, capabilities: { serverCommandsEnabled: false, serverCommandSurfaces: [] } }); return; }
    if (requestUrl.pathname === "/api/v1/system-domains" && method === "GET") {
      interceptedReads += 1;
      if (requestUrl.port === String(permanentPort) && permanentReadMode === "hold") { pendingReadIds.push(message.params.requestId); return; }
      if (requestUrl.port === String(permanentPort) && permanentReadMode === "error") { void fulfill(message.params.requestId, { ok: false, error: "qa-diagnostics-read-unavailable" }, 503); return; }
      void fulfill(message.params.requestId, { ok: true, revision: 1, item: migration.domains }); return;
    }
    if (requestUrl.pathname === "/api/v1/system-domains" && method !== "GET") { systemDomainWrites += 1; void fulfill(message.params.requestId, { ok: false, error: "writes forbidden" }, 405); return; }
    void client.send("Fetch.continueRequest", { requestId: message.params.requestId }).catch((error) => consoleProblems.push(error.message));
  });
  await client.send("Page.enable"); await client.send("Runtime.enable");
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: 'window.__MES_QA_REACT_TELEMETRY__=[];window.addEventListener("mes:react-island-telemetry",(event)=>window.__MES_QA_REACT_TELEMETRY__.push(event.detail));' });
  await client.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/system-domains*", requestStage: "Request" }, { urlPattern: "*production_structure_bootstrap_data*", requestStage: "Request" }] });
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });

  await client.send("Page.navigate", { url: `${legacyOrigin}/?module=productionStructureMatrix&structureRegistry=migrationDiagnostics&qa-auth-bypass=1` });
  await waitForCondition(client, () => document.querySelectorAll("[data-migration-source-row]").length === 152 && !document.querySelector("[data-react-structure-migration-diagnostics-island]"), { message: "legacy Diagnostics baseline missing", timeoutMs: 20_000 });
  const legacy = await evaluate(client, captureLegacyDiagnostics);

  permanentReadMode = "hold"; holdMatrix = true;
  await client.send("Page.navigate", { url: `${permanentOrigin}/?module=productionStructureMatrix&structureRegistry=migrationDiagnostics&qa-auth-bypass=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-structure-migration-diagnostics-island][data-react-island-runtime-mode="react"][data-react-island-state="loading"] [role="status"]')) && ![...document.querySelectorAll("[data-migration-source-row]")].some((row) => !row.closest("[data-react-structure-migration-diagnostics-island]")), { message: "permanent Diagnostics did not own its loading route", timeoutMs: 20_000 });
  for (let index = 0; index < 100 && (!pendingReadIds.length || !pendingMatrixIds.length); index += 1) await delay(50);
  assert(pendingReadIds.length >= 1 && pendingMatrixIds.length >= 1, `permanent sources were not independently held: ${JSON.stringify({ reads: pendingReadIds.length, matrix: pendingMatrixIds.length })}`);
  const loadingTelemetry = await evaluate(client, () => window.__MES_QA_REACT_TELEMETRY__ || []);
  assert(loadingTelemetry.filter((item) => item.surfaceId === "structureMigrationDiagnostics" && item.runtimeMode === "react" && item.state === "loading" && item.stage === "read").length === 1, `Diagnostics loading telemetry is not bounded: ${JSON.stringify(loadingTelemetry)}`);
  permanentReadMode = "success";
  while (pendingReadIds.length) await fulfill(pendingReadIds.shift(), { ok: true, revision: 1, item: migration.domains });
  await delay(150);
  assert(await evaluate(client, () => Boolean(document.querySelector('[data-react-structure-migration-diagnostics-island][data-react-island-state="loading"]')) && !document.querySelector('[data-react-structure-migration-diagnostics-island][data-react-island-state="ready"]')), "Diagnostics committed before the matrix source was ready");
  holdMatrix = false;
  while (pendingMatrixIds.length) await client.send("Fetch.continueRequest", { requestId: pendingMatrixIds.shift() });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-structure-migration-diagnostics-island][data-react-island-runtime-mode="react"][data-react-island-state="ready"]')) && document.querySelectorAll("[data-migration-source-row]").length === 152, { message: "permanent Diagnostics did not become ready after both sources", timeoutMs: 20_000 });
  const permanent = await evaluate(client, capturePermanentDiagnostics);
  assert(JSON.stringify(permanent.headers) === JSON.stringify(["ID / код", "Тип строки", "Структура", "Родитель", "Активность"]), `Diagnostics headers changed: ${JSON.stringify(permanent.headers)}`);
  assert(JSON.stringify(permanent.rows) === JSON.stringify(legacy.rows) && permanent.rows.every((row) => row.length === 5), "permanent Diagnostics lost exact 152x5 legacy parity");
  assert(JSON.stringify(permanent.metrics) === JSON.stringify(legacy.metrics), `permanent Diagnostics metrics differ from legacy: ${JSON.stringify({ legacy: legacy.metrics, permanent: permanent.metrics })}`);
  assert(JSON.stringify(permanent.metrics) === JSON.stringify({ "Исходных строк": 152, "Сотрудников": 76, "Подразделений": 19, "Должностей": 49, "Потерянных связей": 0, "Дубликатов": 0 }), `Diagnostics canonical metrics failed: ${JSON.stringify(permanent.metrics)}`);
  assert(permanent.sourceMeta.includes("152 строк") && permanent.sourceMeta.includes("51 исходных полей"), `Diagnostics source contract failed: ${permanent.sourceMeta}`);
  assert(["Потерянные связи", "Дубликаты", "Неприменённые overrides", "Игнорированные legacy-строки"].every((title) => permanent.issuePanels.some((panel) => panel.includes(title))) && permanent.issuePanels.some((panel) => panel.includes("Игнорированные legacy-строки") && panel.includes("2 записей")), "Diagnostics issue groups/counts failed");
  assert(["Подразделения", "Рабочие центры", "Должности", "Сотрудники", "Оборудование", "Зоны ответственности", "Диагностика миграции"].every((label) => permanent.sidebar.some((item) => item.includes(label))), "Diagnostics sidebar registry coverage failed");
  assert(!permanent.buttons.some((label) => /создать|сохранить|удалить|архивировать|редактировать/i.test(label)) && systemDomainWrites === 0, `read-only Diagnostics exposed or called a write: ${JSON.stringify({ buttons: permanent.buttons, systemDomainWrites })}`);
  assert(permanent.revision === "1" && Number.isFinite(permanent.commitMs) && permanent.commitMs < 2000 && permanent.ariaBusy === "false" && !permanent.overflow && permanent.registry === "migrationDiagnostics", `Diagnostics ready/route/accessibility/overflow telemetry failed: ${JSON.stringify(permanent)}`);
  const readyTelemetry = await evaluate(client, () => window.__MES_QA_REACT_TELEMETRY__ || []);
  assert(readyTelemetry.some((item) => item.surfaceId === "structureMigrationDiagnostics" && item.runtimeMode === "react" && item.state === "ready" && item.stage === "commit" && item.policyId === "qa-diagnostics-permanent" && Number.isFinite(item.durationMs)), `Diagnostics ready telemetry missing: ${JSON.stringify(readyTelemetry)}`);

  await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Сотрудники"))?.click());
  await waitForCondition(client, () => !document.querySelector("[data-react-structure-migration-diagnostics-island]") && document.querySelectorAll('[data-system-domain-table="employees"] [data-system-domain-row]').length === 76, { message: "Diagnostics -> Employees navigation failed", timeoutMs: 15_000 });
  assert(await evaluate(client, () => new URL(location.href).searchParams.get("structureRegistry") === "employees" && !(window.__MES_QA_REACT_TELEMETRY__ || []).some((item) => ["legacy-fallback", "error"].includes(item.state))), "ordinary Diagnostics -> Employees navigation was treated as fallback/error");
  await client.send("Page.reload", { ignoreCache: true });
  await waitForCondition(client, () => !document.querySelector("[data-react-structure-migration-diagnostics-island]") && document.querySelectorAll('[data-system-domain-table="employees"] [data-system-domain-row]').length === 76, { message: "Employees nested-route reload was not stable", timeoutMs: 20_000 });
  await waitForCondition(client, () => {
    if (new URL(location.href).searchParams.get("structureRegistry") === "migrationDiagnostics") return true;
    document.querySelector('[data-system-domain-registry="migrationDiagnostics"]')?.click();
    return false;
  }, { message: "legacy registry binding did not accept Diagnostics navigation", timeoutMs: 15_000 });
  await waitForCondition(client, () => new URL(location.href).searchParams.get("structureRegistry") === "migrationDiagnostics" && document.querySelectorAll("[data-migration-source-row]").length === 152 && Boolean(document.querySelector('[data-react-structure-migration-diagnostics-island][data-react-island-state="ready"]')), { message: "legacy Employees -> permanent Diagnostics navigation failed", timeoutMs: 20_000 });
  await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Подразделения"))?.click());
  await waitForCondition(client, () => !new URL(location.href).searchParams.has("structureRegistry") && document.querySelectorAll('[data-system-domain-table="orgUnits"] [data-system-domain-row]').length === 19, { message: "Diagnostics -> canonical Org Units navigation/bind failed", timeoutMs: 15_000 });

  await client.send("Page.navigate", { url: `${permanentOrigin}/?module=productionStructureMatrix&structureRegistry=migrationDiagnostics&qa-auth-bypass=1&react-structure-migration-diagnostics-evaluation=0&react-structure-migration-diagnostics=0&react-structure-migration-diagnostics-readonly=0&react-structure-migration-diagnostics-mode=legacy` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-structure-migration-diagnostics-island][data-react-island-runtime-mode="react"][data-react-island-state="ready"]')), { message: "query parameters downgraded permanent Diagnostics", timeoutMs: 20_000 });
  await client.send("Page.navigate", { url: `${permanentOrigin}/?module=productionStructureMatrix&structureRegistry=employees&qa-auth-bypass=1&react-structure-migration-diagnostics-evaluation=1` });
  await waitForCondition(client, () => !document.querySelector("[data-react-structure-migration-diagnostics-island]") && document.querySelectorAll('[data-system-domain-table="employees"] [data-system-domain-row]').length === 76, { message: "stale evaluation query overrode the Employees nested route", timeoutMs: 20_000 });
  await client.send("Page.navigate", { url: `${permanentOrigin}/?module=productionStructureMatrix&structureRegistry=unknown&qa-auth-bypass=1` });
  await waitForCondition(client, () => !new URL(location.href).searchParams.has("structureRegistry") && document.querySelectorAll('[data-system-domain-table="orgUnits"] [data-system-domain-row]').length === 19, { message: "unknown nested registry did not canonicalize to the legacy Org Units default", timeoutMs: 20_000 });

  permanentReadMode = "error";
  await client.send("Page.navigate", { url: `${permanentOrigin}/?module=productionStructureMatrix&structureRegistry=migrationDiagnostics&qa-auth-bypass=1&qa-read-error=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-structure-migration-diagnostics-island][data-react-island-runtime-mode="react"][data-react-island-state="error"] [role="alert"]')) && ![...document.querySelectorAll("[data-migration-source-row]")].some((row) => !row.closest("[data-react-structure-migration-diagnostics-island]")), { message: "permanent Diagnostics read failure exposed live legacy", timeoutMs: 20_000 });
  const errorState = await evaluate(client, () => ({ telemetry: window.__MES_QA_REACT_TELEMETRY__ || [], failure: document.querySelector("[data-react-structure-migration-diagnostics-island]")?.dataset.reactIslandState, text: document.querySelector('[role="alert"]')?.textContent || "" }));
  assert(errorState.failure === "error" && errorState.text.includes("read-unavailable") && errorState.telemetry.filter((item) => item.surfaceId === "structureMigrationDiagnostics" && item.runtimeMode === "react" && item.state === "error" && item.stage === "read" && item.reason === "read-unavailable").length === 1, `Diagnostics error ownership/telemetry failed: ${JSON.stringify(errorState)}`);
  const readsAtError = interceptedReads;
  await delay(300);
  assert(interceptedReads === readsAtError, `Diagnostics read failure started an immediate render/fetch loop: ${readsAtError} -> ${interceptedReads}`);

  assert(interceptedReads === 7, `each full navigation must share exactly one bounded System Domains read, got ${interceptedReads}`);
  assert(systemDomainWrites === 0 && await readFile(sharedStateFile, "utf8") === original, "Diagnostics permanent QA changed authoritative or compatibility state");
  assert(consoleProblems.length === 0, `browser console problems:\n${consoleProblems.join("\n")}`);
  console.log("Structure Migration Diagnostics permanent production-shell QA: OK");
  console.log(`- exact parity: ${permanent.rows.length} rows x ${permanent.headers.length} columns, 51 source fields, four issue groups; first commit ${permanent.commitMs.toFixed(2)} ms`);
  console.log("- dual-source loading, canonical nested route, sibling legacy navigation, query isolation, read-only ownership, bounded telemetry/error and clean console: pass");
} catch (error) {
  if (chrome) { const debug = await evaluate(chrome.client, () => ({ href: location.href, text: document.querySelector("#app")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 1200), telemetry: window.__MES_QA_REACT_TELEMETRY__ || [], target: document.querySelector("[data-react-structure-migration-diagnostics-island]")?.outerHTML?.slice(0, 800) || "" })).catch((debugError) => ({ debugError: debugError.message })); console.error("Diagnostics permanent QA debug:", JSON.stringify(debug)); }
  if (permanentOutput.trim()) console.error(permanentOutput.trim()); if (legacyOutput.trim()) console.error(legacyOutput.trim()); throw error;
} finally {
  if (chrome) await cleanupChrome(chrome);
  await Promise.all([stop(permanentPreview), stop(legacyPreview)]);
  await rm(temporaryRoot, { recursive: true, force: true });
}
