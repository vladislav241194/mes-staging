import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupChrome, delay, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";
import { createWeeklyProductionControlModule } from "../src/modules/weekly_production_control/render.js";
import { PRODUCTION_STRUCTURE_MATRIX_ROWS } from "../src/production_structure_matrix_data.js";
import { SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { migrateLegacySystemDomains, serializeSystemDomains } from "../src/modules/system_domains/service.js";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const startOfDay = (value) => { const date = new Date(value); date.setHours(0, 0, 0, 0); return date; };
const startOfWeek = (value) => { const date = startOfDay(value); const day = date.getDay() || 7; date.setDate(date.getDate() - day + 1); return date; };
const toDateInput = (value) => { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const shortDate = (value) => { const date = new Date(value); return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`; };

function verifyOwnerPreparedNoteContract() {
  const weekStart = startOfWeek(new Date());
  const plannedStart = new Date(weekStart.getTime() + 8 * 60 * 60 * 1000);
  const plannedEnd = new Date(weekStart.getTime() + 10 * 60 * 60 * 1000);
  const factAt = plannedEnd.toISOString();
  const row = { id: "weekly-note-slot", slot: { id: "weekly-note-slot" }, plannedStart, plannedEnd, quantity: 20, unit: "шт.", workCenterId: "D3", workCenterLabel: "SMT", resourceLabel: "Линия SMT" };
  const module = createWeeklyProductionControlModule({
    DAY_MS: 24 * 60 * 60 * 1000,
    addMs: (value, ms) => new Date(new Date(value).getTime() + ms),
    formatDate: (value) => `${shortDate(value)}.${new Date(value).getFullYear()}`,
    formatDateTimeShort: (value) => `${shortDate(value)} ${new Date(value).toTimeString().slice(0, 5)}`,
    formatShiftWorkOrderPersonName: (value) => String(value || "Исполнитель"),
    formatShortDate: shortDate,
    getAuthSessionFactEntriesForGanttSlot: () => [],
    getGanttLinkedRecordEntries: () => [["weekly-note-slot", { actualQuantity: 10, defectQuantity: 0, updatedAt: factAt, deviationNotes: [{ employeeName: "QA Исполнитель", text: "QA причина отклонения", createdAt: factAt }] }]],
    getPlanningState: () => ({}),
    getPlanningTableSlotRows: () => [row],
    getProductionStructureMatrixRuntimeOverrides: () => ({}),
    getProductionStructureResources: () => [{ id: "line-smt", name: "Линия SMT", workCenterId: "D3", participatesInPlanning: "yes" }],
    getProductionStructureWorkCenters: () => [{ id: "D3", name: "SMT", isActive: true, showInGantt: true }],
    getShiftMasterAssignmentsForGanttSlot: () => [],
    getShiftMasterBoardFactEntriesForGanttSlot: () => [],
    getShiftWorkOrderIssueReports: () => [{ id: "weekly-note-report", employeeName: "QA Исполнитель", text: "QA report", createdAt: factAt }],
    getUi: () => ({ weeklyProductionControlWeekAnchor: toDateInput(weekStart) }),
    getWeekNumber: () => 1,
    isGanttFactRecordReported: () => true,
    mapLegacyWorkCenterId: (value) => String(value || ""),
    normalizeLookupText: (value) => String(value || "").trim().toLocaleLowerCase("ru-RU"),
    normalizePlainRecord: (value) => value && typeof value === "object" ? value : {},
    normalizeShiftMasterBoardQuantity: (value) => Math.max(0, Number(value || 0) || 0),
    normalizeShiftMasterFactQuantity: (value) => Math.max(0, Number(value || 0) || 0),
    startOfDay,
    startOfWeek,
    toDate: (value) => new Date(value),
    toDateInput,
  });
  const model = module.getWeeklyProductionControlModel();
  const note = model.groups.flatMap((group) => group.days).find((day) => day.note)?.note;
  assert(note?.title === "Отклонение -50%" && note.text === "QA причина отклонения" && note.reportText === "QA report", `Weekly owner-prepared note contract failed: ${JSON.stringify(note)}`);
}

verifyOwnerPreparedNoteContract();
const baselineDomains = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS }).domains;
const weeklyEmployeeId = baselineDomains.registries.employees[0]?.id || "weekly-react-qa-employee";
const weeklyRole = { id: "weekly-production-head", label: "Начальник производства QA", scope: "factory", defaultModule: "weeklyProductionControl", modulePermissions: { weeklyProductionControl: { view: true } } };
const canonicalDomains = migrateLegacySystemDomains({
  matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS,
  legacyUi: { accessRoleProfiles: [weeklyRole], accessRoleAssignments: { [weeklyEmployeeId]: weeklyRole.id } },
  defaultAccessRoleProfiles: [weeklyRole],
  migratedAt: "2026-07-19T00:00:00.000Z",
}).domains;
const compactWeekStart = startOfWeek(new Date());
const compactRows = ["D5", "D9", "D3_UW", "D3_AOI", "D4", "D3"].map((workCenterId, index) => {
  const plannedStart = new Date(compactWeekStart.getTime() + index * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000);
  return {
    id: `weekly-react-slot-${workCenterId}`,
    routeId: `weekly-react-route-${workCenterId}`,
    routeStepId: `weekly-react-step-${workCenterId}`,
    plannedStart: plannedStart.toISOString(),
    plannedEnd: new Date(plannedStart.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    quantity: 20 + index,
    unit: "шт.",
    workCenterId,
    resourceId: "",
    status: "planned",
    locked: false,
    sourceWorkCenterId: workCenterId,
    sourceResourceId: "",
    sourceUnit: "шт.",
    sourceComment: "Weekly React canonical work-center identity parity QA",
    sourceOperationName: "Монтаж",
    sourceSpecificationId: "spec-weekly-react",
    sourceProjectId: "spec-weekly-react",
    sourcePlanningOrderId: `weekly-react-route-${workCenterId}`,
    sourceBatchId: `weekly-react-route-${workCenterId}`,
    sourceRouteId: `weekly-react-route-${workCenterId}`,
  };
});
const responseBody = Buffer.from(JSON.stringify({ ok: true, view: "weekly", rows: compactRows, fallbackReason: "" })).toString("base64");

async function waitPreview(origin) {
  for (let index = 0; index < 80; index += 1) {
    try { const response = await fetch(`${origin}/?module=weeklyProductionControl&qa-auth-bypass=1`); if (response.ok && (await response.text()).includes('id="app"')) return; } catch {}
    await delay(120);
  }
  throw new Error(`Weekly Control preview did not start at ${origin}`);
}
async function stop(child) {
  if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  await new Promise((resolve) => { if (child.exitCode !== null) return resolve(); const timer = setTimeout(resolve, 1200); child.once("exit", () => { clearTimeout(timer); resolve(); }); });
}
const normalizedTable = () => ({
  headers: [...document.querySelectorAll(".weekly-production-control-table thead th")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()),
  rows: [...document.querySelectorAll(".weekly-production-control-table tbody tr")].map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim())),
});
const assertCanonicalAliasRows = (table, runtimeLabel) => {
  const expectedPlans = new Map([
    ["Отдел ручного монтажа", 20],
    ["Слесарный участок 1", 21],
    ["Участок отмывки", 22],
    ["Участок оптической инспекции", 23],
    ["Отдел технического контроля", 24],
    ["Отдел поверхностного монтажа", 25],
  ]);
  expectedPlans.forEach((quantity, label) => {
    const row = table.rows.find((candidate) => candidate[0] === label);
    assert(row && row[8]?.startsWith(`${quantity} шт.`), `${runtimeLabel} did not merge ${label} into its canonical owner row: ${JSON.stringify(row)}`);
  });
};
const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-weekly-production-control-react-"));
const sharedStateFile = join(temporaryRoot, "shared-state.json");
const snapshot = { version: 1, updatedAt: "2026-07-19T00:00:00.000Z", updatedBy: { actor: "weekly-react-qa" }, values: { [SYSTEM_DOMAINS_STORAGE_KEY]: serializeSystemDomains(canonicalDomains) }, sharedUi: {}, events: [] };
await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary state permissions changed");
const original = await readFile(sharedStateFile, "utf8");
const releasePolicy = JSON.parse(await readFile(join(process.cwd(), "react-runtime-policy.json"), "utf8"));
const evaluationPolicyFile = join(temporaryRoot, "weekly-evaluation-policy.json");
await writeFile(evaluationPolicyFile, `${JSON.stringify({
  ...releasePolicy,
  policyId: "qa-weekly-evaluation",
  surfaces: Object.fromEntries(Object.keys(releasePolicy.surfaces).map((surfaceId) => [surfaceId, "evaluation"])),
}, null, 2)}\n`, { mode: 0o600 });
const permanentPolicyFile = join(temporaryRoot, "weekly-react-policy.json");
await writeFile(permanentPolicyFile, `${JSON.stringify({ ...releasePolicy, policyId: "qa-weekly-permanent-react", surfaces: { ...releasePolicy.surfaces, weeklyProductionControl: "react" } }, null, 2)}\n`, { mode: 0o600 });
const enabledPort = await getFreePort();
const legacyPort = await getFreePort();
const permanentPort = await getFreePort();
const enabledOrigin = `http://127.0.0.1:${enabledPort}`;
const legacyOrigin = `http://127.0.0.1:${legacyPort}`;
const permanentOrigin = `http://127.0.0.1:${permanentPort}`;
const start = (port, mode) => spawn(process.execPath, ["scripts/preview-dist.mjs"], { cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru", MES_SHARED_STATE_FILE: sharedStateFile, MES_REACT_RUNTIME_POLICY_PATH: mode === "react" ? permanentPolicyFile : evaluationPolicyFile, ...(mode === "evaluation" ? { MES_REACT_WEEKLY_PRODUCTION_CONTROL: "1", MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION: "1" } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
const enabledPreview = start(enabledPort, "evaluation");
const legacyPreview = start(legacyPort, "legacy");
const permanentPreview = start(permanentPort, "react");
let enabledOutput = ""; let legacyOutput = ""; let permanentOutput = "";
enabledPreview.stdout.on("data", (chunk) => { enabledOutput += chunk; }); enabledPreview.stderr.on("data", (chunk) => { enabledOutput += chunk; });
legacyPreview.stdout.on("data", (chunk) => { legacyOutput += chunk; }); legacyPreview.stderr.on("data", (chunk) => { legacyOutput += chunk; });
permanentPreview.stdout.on("data", (chunk) => { permanentOutput += chunk; }); permanentPreview.stderr.on("data", (chunk) => { permanentOutput += chunk; });
let chrome = null;
const consoleProblems = [];
let interceptedReads = 0;
let systemDomainReads = 0;
let permanentReadMode = "success";
let pendingPermanentReadRequestId = "";
try {
  await Promise.all([waitPreview(enabledOrigin), waitPreview(legacyOrigin), waitPreview(permanentOrigin)]);
  chrome = await launchChrome("mes-weekly-production-control-react-qa-");
  const { client } = chrome;
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    if (message.method !== "Fetch.requestPaused") return;
    const requestUrl = new URL(message.params.request.url);
    if (requestUrl.pathname === "/api/v1/system-domains/capabilities") {
      const capabilityBody = Buffer.from(JSON.stringify({ ok: true, capabilities: { serverCommandsEnabled: false, serverCommandSurfaces: [], consistency: { details: { authority: { mode: "postgres-primary" } } } } })).toString("base64");
      void client.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }], body: capabilityBody }).catch((error) => consoleProblems.push(error.message));
    } else if (requestUrl.pathname === "/api/v1/system-domains" && message.params.request.method === "GET") {
      systemDomainReads += 1;
      const domainsBody = Buffer.from(JSON.stringify({ ok: true, revision: 1, item: canonicalDomains })).toString("base64");
      void client.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "ETag", value: '"weekly-system-domains-1"' }], body: domainsBody }).catch((error) => consoleProblems.push(error.message));
    } else if (requestUrl.pathname === "/api/v1/planning/period") {
      interceptedReads += 1;
      if (requestUrl.port === String(permanentPort) && permanentReadMode === "hold") {
        pendingPermanentReadRequestId = message.params.requestId;
        return;
      }
      if (requestUrl.port === String(permanentPort) && permanentReadMode === "error") {
        const errorBody = Buffer.from(JSON.stringify({ ok: false, error: "qa-weekly-read-unavailable" })).toString("base64");
        void client.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 503, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }], body: errorBody }).catch((error) => consoleProblems.push(error.message));
        return;
      }
      void client.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }, { name: "ETag", value: '"weekly-react-1"' }], body: responseBody }).catch((error) => consoleProblems.push(error.message));
    } else void client.send("Fetch.continueRequest", { requestId: message.params.requestId }).catch((error) => consoleProblems.push(error.message));
  });
  await client.send("Page.enable"); await client.send("Runtime.enable");
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: 'sessionStorage.setItem("mes-planning-prototype-system-domains-primary-tombstone-v1","1");window.__MES_QA_REACT_TELEMETRY__=[];window.addEventListener("mes:react-island-telemetry",(event)=>window.__MES_QA_REACT_TELEMETRY__.push(event.detail));' });
  await client.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/planning/period*", requestStage: "Request" }, { urlPattern: "*api/v1/system-domains*", requestStage: "Request" }] });
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });

  await client.send("Page.navigate", { url: `${legacyOrigin}/?module=weeklyProductionControl&qa-auth-bypass=1` });
  await waitForCondition(client, () => document.querySelectorAll(".weekly-production-control-table tbody tr").length >= 25, { message: "completed legacy Weekly Control rows missing", timeoutMs: 15_000 });
  const legacy = await evaluate(client, normalizedTable);
  assert(legacy.rows.length === 25 && legacy.headers.length === 11, `legacy Weekly fixture must expose exactly 25 rows/11 headers, got ${legacy.rows.length}/${legacy.headers.length}`);
  assertCanonicalAliasRows(legacy, "legacy Weekly");

  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=weeklyProductionControl&qa-auth-bypass=1` });
  await waitForCondition(client, () => document.querySelectorAll(".weekly-production-control-table tbody tr").length >= 25, { message: "completed enabled Weekly legacy default missing", timeoutMs: 15_000 });
  assert(await evaluate(client, () => !document.querySelector("[data-react-weekly-production-control-island]")), "server permission without session request must retain legacy Weekly Control");

  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=weeklyProductionControl&qa-auth-bypass=1&react-weekly-production-control-evaluation=1` });
  try {
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-weekly-production-control-island][data-react-island-state="ready"]')), { message: "Weekly Control React island not ready", timeoutMs: 15_000 });
  } catch (error) {
    const diagnostic = await evaluate(client, () => ({
      islandState: document.querySelector("[data-react-weekly-production-control-island]")?.getAttribute("data-react-island-state") || "missing",
      runtimeMode: document.querySelector("[data-react-weekly-production-control-island]")?.getAttribute("data-react-island-runtime-mode") || "",
      legacyRows: document.querySelectorAll(".weekly-production-control-table tbody tr").length,
      activation: window.__MES_WEEKLY_PRODUCTION_CONTROL_ACTIVATION__ || null,
      text: document.body.innerText.replace(/\s+/g, " ").slice(0, 600),
      telemetry: window.__MES_QA_REACT_TELEMETRY__ || [],
    }));
    throw new Error(`${error.message}: ${JSON.stringify(diagnostic)} systemDomainReads=${systemDomainReads} planningReads=${interceptedReads} console=${JSON.stringify(consoleProblems)}`);
  }
  const react = await evaluate(client, normalizedTable);
  const state = await evaluate(client, () => { const target = document.querySelector("[data-react-weekly-production-control-island]"); const tableWrap = document.querySelector('[data-ui-component="TableWrap"]'); return { revision: target?.dataset.reactIslandRevision, commitMs: Number(target?.dataset.reactIslandCommitMs), pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, tableOwnsOverflow: Boolean(tableWrap && tableWrap.scrollWidth > tableWrap.clientWidth), tableOverflowMode: tableWrap ? getComputedStyle(tableWrap).overflowX : "" }; });
  assert(JSON.stringify(react.headers) === JSON.stringify(legacy.headers), `Weekly header parity failed\nlegacy=${JSON.stringify(legacy.headers)}\nreact=${JSON.stringify(react.headers)}`);
  assert(JSON.stringify(react.rows) === JSON.stringify(legacy.rows), `Weekly row parity failed\nlegacy=${JSON.stringify(legacy.rows)}\nreact=${JSON.stringify(react.rows)}`);
  assert(react.rows.length === 25 && react.headers.length === 11, `React Weekly canonical bridge must expose exactly 25 rows/11 headers, got ${react.rows.length}/${react.headers.length}`);
  assertCanonicalAliasRows(react, "evaluation React Weekly");
  assert(state.revision === "1" && Number.isFinite(state.commitMs) && state.commitMs < 2000, "Weekly React commit telemetry failed");
  assert(!state.pageOverflow && (state.tableOwnsOverflow || ["auto", "scroll"].includes(state.tableOverflowMode)), "Weekly dense matrix must retain table-owned horizontal overflow policy");

  permanentReadMode = "hold";
  pendingPermanentReadRequestId = "";
  await client.send("Page.navigate", { url: `${permanentOrigin}/?module=weeklyProductionControl&qa-auth-bypass=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-weekly-production-control-island][data-react-island-runtime-mode="react"][data-react-island-state="loading"]')) && ![...document.querySelectorAll(".weekly-production-control-page")].some((page) => !page.closest("[data-react-weekly-production-control-island]")), { message: "permanent Weekly did not own the loading route", timeoutMs: 15_000 });
  for (let index = 0; index < 80 && !pendingPermanentReadRequestId; index += 1) await delay(50);
  assert(Boolean(pendingPermanentReadRequestId), "permanent Weekly planning read was not held for loading ownership QA");
  const loadingTelemetry = await evaluate(client, () => window.__MES_QA_REACT_TELEMETRY__ || []);
  assert(loadingTelemetry.filter((event) => event.surfaceId === "weeklyProductionControl" && event.runtimeMode === "react" && event.state === "loading" && event.stage === "read").length === 1, `permanent Weekly loading telemetry is not bounded: ${JSON.stringify(loadingTelemetry)}`);
  permanentReadMode = "success";
  await client.send("Fetch.fulfillRequest", { requestId: pendingPermanentReadRequestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }, { name: "ETag", value: '"weekly-react-permanent-1"' }], body: responseBody });
  pendingPermanentReadRequestId = "";
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-weekly-production-control-island][data-react-island-runtime-mode="react"][data-react-island-state="ready"]')), { message: "permanent Weekly React did not become ready after its PostgreSQL read", timeoutMs: 15_000 });
  const permanent = await evaluate(client, normalizedTable);
  assert(JSON.stringify(permanent.headers) === JSON.stringify(legacy.headers) && JSON.stringify(permanent.rows) === JSON.stringify(legacy.rows), "permanent Weekly lost exact legacy read parity");
  assert(permanent.rows.length === 25 && permanent.headers.length === 11, `permanent React Weekly canonical bridge must expose exactly 25 rows/11 headers, got ${permanent.rows.length}/${permanent.headers.length}`);
  assertCanonicalAliasRows(permanent, "permanent React Weekly");
  const permanentResources = await evaluate(client, () => performance.getEntriesByType("resource").map((entry) => new URL(entry.name).pathname));
  assert(!permanentResources.some((path) => path.endsWith("/modules/weekly_production_control/render.js")), `permanent Weekly fetched its legacy renderer: ${JSON.stringify(permanentResources)}`);
  assert(!permanentResources.some((path) => path.endsWith("/modules/production_structure_matrix/render.js")), `permanent Weekly fetched the legacy Structure renderer: ${JSON.stringify(permanentResources)}`);
  const readyTelemetry = await evaluate(client, () => window.__MES_QA_REACT_TELEMETRY__ || []);
  assert(readyTelemetry.some((event) => event.surfaceId === "weeklyProductionControl" && event.runtimeMode === "react" && event.state === "ready" && event.stage === "commit" && Number.isFinite(event.durationMs)), `permanent Weekly ready telemetry missing: ${JSON.stringify(readyTelemetry)}`);

  await client.send("Page.navigate", { url: `${permanentOrigin}/?module=weeklyProductionControl&qa-auth-bypass=1&react-weekly-production-control-evaluation=0&react-weekly-production-control=0&react-weekly-production-control-readonly=0&react-weekly-production-control-mode=legacy` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-weekly-production-control-island][data-react-island-runtime-mode="react"][data-react-island-state="ready"]')), { message: "query parameters downgraded permanent Weekly React", timeoutMs: 15_000 });
  assert(await evaluate(client, () => ![...document.querySelectorAll(".weekly-production-control-page")].some((page) => !page.closest("[data-react-weekly-production-control-island]"))), "query parameters exposed the permanent Weekly legacy renderer");

  permanentReadMode = "error";
  await client.send("Page.navigate", { url: `${permanentOrigin}/?module=weeklyProductionControl&qa-auth-bypass=1&qa-read-error=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-weekly-production-control-island][data-react-island-runtime-mode="react"][data-react-island-state="error"] [role="alert"]')) && ![...document.querySelectorAll(".weekly-production-control-page")].some((page) => !page.closest("[data-react-weekly-production-control-island]")), { message: "permanent Weekly read failure did not remain in its React error surface", timeoutMs: 15_000 });
  const errorTelemetry = await evaluate(client, () => window.__MES_QA_REACT_TELEMETRY__ || []);
  assert(errorTelemetry.filter((event) => event.surfaceId === "weeklyProductionControl" && event.runtimeMode === "react" && event.state === "error" && event.stage === "read" && event.reason === "read-unavailable").length === 1, `permanent Weekly read-error telemetry is not bounded: ${JSON.stringify(errorTelemetry)}`);

  assert(interceptedReads >= 3, "both legacy and React paths must consume the bounded planning period API");
  assert(systemDomainReads >= 1, "permanent Weekly must consume the canonical System Domains owner projection");
  assert(consoleProblems.length === 0, `browser console problems:\n${consoleProblems.join("\n")}`);
  assert(await readFile(sharedStateFile, "utf8") === original, "Weekly read-only QA changed state");
  console.log("Weekly Production Control React production-shell functional QA: OK");
  console.log(`- exact parity: ${react.rows.length} groups, ${react.headers.length} columns; first commit ${state.commitMs.toFixed(2)} ms`);
  console.log("- canonical System Domains + compact Planning read, isolated import graph, evaluation rollback, permanent loading/error ownership, query isolation, bounded telemetry and clean console: pass");
} catch (error) {
  if (enabledOutput.trim()) console.error(enabledOutput.trim()); if (legacyOutput.trim()) console.error(legacyOutput.trim()); if (permanentOutput.trim()) console.error(permanentOutput.trim()); throw error;
} finally {
  if (chrome) await cleanupChrome(chrome);
  await Promise.all([stop(enabledPreview), stop(legacyPreview), stop(permanentPreview)]);
  await rm(temporaryRoot, { recursive: true, force: true });
}
