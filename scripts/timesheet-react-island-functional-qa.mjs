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
async function waitPreview(origin) {
  for (let index = 0; index < 100; index += 1) {
    try { const response = await fetch(`${origin}/?module=timesheet&qa-auth-bypass=1`); if (response.ok && (await response.text()).includes('id="app"')) return; } catch {}
    await delay(120);
  }
  throw new Error(`Timesheet preview did not start at ${origin}`);
}
async function stop(child) {
  if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  await new Promise((resolve) => { if (child.exitCode !== null) return resolve(); const timer = setTimeout(resolve, 1200); child.once("exit", () => { clearTimeout(timer); resolve(); }); });
}
const normalizedTable = () => ({
  headers: [...document.querySelectorAll(".timesheet-table thead th")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()),
  rows: [...document.querySelectorAll(".timesheet-table tbody tr")].map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim())),
});

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-timesheet-react-"));
const sharedStateFile = join(temporaryRoot, "shared-state.json");
const baseline = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS });
const supervisorPosition = baseline.domains.registries.positions.find((position) => position.kind === "supervisor");
const masterId = baseline.domains.registries.employmentAssignments.find((assignment) => assignment.positionId === supervisorPosition?.id)?.employeeId || "";
const executorId = baseline.domains.registries.employmentAssignments.find((assignment) => assignment.employeeId !== masterId)?.employeeId || "";
const migration = migrateLegacySystemDomains({
  matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS,
  legacyUi: {
    accessRoleProfiles: [
      { id: "admin", label: "Администратор QA", scope: "global", defaultModule: "timesheet", modulePermissions: { timesheet: { view: true, edit: true } } },
      { id: "master", label: "Мастер производства", scope: "workCenter", defaultModule: "shiftMasterBoard", modulePermissions: { timesheet: { view: true, edit: true } } },
      { id: "executor", label: "Исполнитель", scope: "self", defaultModule: "authSessionPrototype", modulePermissions: { timesheet: { view: true, edit: false } } },
    ],
    accessRoleAssignments: { [masterId]: "master", [executorId]: "executor" },
  },
  migratedAt: "2026-07-19T00:00:00.000Z",
});
assert(migration.report.validation.valid, "canonical Timesheet System Domains fixture must be valid");
assert(migration.domains.registries.employees.length === 76, "Timesheet fixture must retain 76 employees");
const snapshot = { version: 1, updatedAt: "2026-07-19T00:00:00.000Z", updatedBy: { actor: "timesheet-react-qa" }, values: { [STATE_STORAGE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }), [SYSTEM_DOMAINS_STORAGE_KEY]: serializeSystemDomains(migration.domains) }, sharedUi: {}, events: [] };
await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary state permissions changed");
const original = await readFile(sharedStateFile, "utf8");
const enabledPort = await getFreePort(); const legacyPort = await getFreePort();
const enabledOrigin = `http://127.0.0.1:${enabledPort}`; const legacyOrigin = `http://127.0.0.1:${legacyPort}`;
const start = (port, enabled) => spawn(process.execPath, ["scripts/preview-dist.mjs"], { cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru", MES_SHARED_STATE_FILE: sharedStateFile, ...(enabled ? { MES_REACT_TIMESHEET: "1", MES_REACT_TIMESHEET_READ_ONLY_EVALUATION: "1" } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
const enabledPreview = start(enabledPort, true); const legacyPreview = start(legacyPort, false);
let enabledOutput = ""; let legacyOutput = "";
enabledPreview.stdout.on("data", (chunk) => { enabledOutput += chunk; }); enabledPreview.stderr.on("data", (chunk) => { enabledOutput += chunk; });
legacyPreview.stdout.on("data", (chunk) => { legacyOutput += chunk; }); legacyPreview.stderr.on("data", (chunk) => { legacyOutput += chunk; });
let chrome = null; const consoleProblems = []; let interceptedReads = 0; let apiDomains = structuredClone(migration.domains); let apiRevision = 1; let putAttempts = 0; let successfulWrites = 0; let forceConflictOnce = false; let primaryAuthorityReady = false; const commandRequests = [];
try {
  await Promise.all([waitPreview(enabledOrigin), waitPreview(legacyOrigin)]);
  chrome = await launchChrome("mes-timesheet-react-qa-"); const { client } = chrome;
  const responseBody = (value) => Buffer.from(JSON.stringify(value)).toString("base64");
  const fulfill = (requestId, payload, { statusCode = 200, revision = apiRevision } = {}) => client.send("Fetch.fulfillRequest", { requestId, responseCode: statusCode, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }, { name: "ETag", value: `"${revision}"` }], body: responseBody(payload) }).catch((error) => consoleProblems.push(error.message));
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    if (message.method !== "Fetch.requestPaused") return;
    const requestUrl = new URL(message.params.request.url);
    const method = String(message.params.request.method || "GET").toUpperCase();
    if (requestUrl.pathname === "/api/v1/system-domains/capabilities") { interceptedReads += 1; const consistency = primaryAuthorityReady ? { consistency: { details: { authority: { mode: "postgres-primary" } } } } : {}; void fulfill(message.params.requestId, { ok: true, capabilities: { serverCommandsEnabled: true, serverCommandSurfaces: ["production-structure", "timesheet", "access-control"], ...consistency } }); }
    else if (requestUrl.pathname === "/api/v1/system-domains" && method === "GET") { interceptedReads += 1; void fulfill(message.params.requestId, { ok: true, revision: apiRevision, item: apiDomains }); }
    else if (requestUrl.pathname === "/api/v1/system-domains" && method === "PUT") {
      putAttempts += 1; const headers = message.params.request.headers || {}; const header = (name) => Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] || ""; const body = JSON.parse(message.params.request.postData || "{}"); commandRequests.push({ expectedRevision: Number(body.expectedRevision || 0), ifMatch: String(header("If-Match")), idempotencyKey: String(header("Idempotency-Key")), surface: String(body.surface || "") });
      if (forceConflictOnce) { forceConflictOnce = false; void fulfill(message.params.requestId, { ok: false, conflict: true, revision: apiRevision, error: "System Domains revision conflict" }, { statusCode: 409 }); }
      else if (Number(body.expectedRevision) !== apiRevision || String(header("If-Match")) !== `"${apiRevision}"`) void fulfill(message.params.requestId, { ok: false, conflict: true, revision: apiRevision, error: "stale revision" }, { statusCode: 409 });
      else { apiDomains = structuredClone(body.domains); apiRevision += 1; successfulWrites += 1; void fulfill(message.params.requestId, { ok: true, revision: apiRevision, item: apiDomains, snapshotSync: { queued: true } }); }
    }
    else void client.send("Fetch.continueRequest", { requestId: message.params.requestId }).catch((error) => consoleProblems.push(error.message));
  });
  await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/system-domains*", requestStage: "Request" }] });
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });

  await client.send("Page.navigate", { url: `${legacyOrigin}/?module=timesheet&qa-auth-bypass=1` });
  await waitForCondition(client, () => document.querySelectorAll(".timesheet-employee-row").length === 76, { message: "completed legacy Timesheet employees missing", timeoutMs: 20_000 });
  const legacy = await evaluate(client, normalizedTable);

  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=timesheet&qa-auth-bypass=1` });
  await waitForCondition(client, () => document.querySelectorAll(".timesheet-employee-row").length === 76, { message: "enabled Timesheet legacy default missing", timeoutMs: 20_000 });
  assert(await evaluate(client, () => !document.querySelector("[data-react-timesheet-island]")), "server permission without session request must retain legacy Timesheet");
  await evaluate(client, (key) => sessionStorage.setItem(key, "1"), SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY);

  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=timesheet&qa-auth-bypass=1&react-timesheet-evaluation=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-timesheet-island][data-react-island-state="ready"]')) && document.querySelectorAll(".timesheet-employee-row").length === 76, { message: "Timesheet React island not ready", timeoutMs: 8_000 });
  const react = await evaluate(client, normalizedTable);
  const state = await evaluate(client, () => { const target = document.querySelector("[data-react-timesheet-island]"); const tableWrap = document.querySelector('[data-ui-component="TableWrap"]'); return { revision: target?.dataset.reactIslandRevision, commitMs: Number(target?.dataset.reactIslandCommitMs), pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, tableOwnsOverflow: Boolean(tableWrap && tableWrap.scrollWidth > tableWrap.clientWidth), tableOverflowMode: tableWrap ? getComputedStyle(tableWrap).overflowX : "" }; });
  assert(JSON.stringify(react.headers) === JSON.stringify(legacy.headers), `Timesheet header parity failed\nlegacy=${JSON.stringify(legacy.headers)}\nreact=${JSON.stringify(react.headers)}`);
  const firstRowMismatch = react.rows.findIndex((row, index) => JSON.stringify(row) !== JSON.stringify(legacy.rows[index]));
  assert(firstRowMismatch === -1 && react.rows.length === legacy.rows.length, `Timesheet row parity failed at ${firstRowMismatch}: legacy=${JSON.stringify(legacy.rows[firstRowMismatch])} react=${JSON.stringify(react.rows[firstRowMismatch])}`);
  assert(state.revision === "1" && Number.isFinite(state.commitMs) && state.commitMs < 2000, "Timesheet React commit telemetry failed");
  assert(!state.pageOverflow && (state.tableOwnsOverflow || ["auto", "scroll"].includes(state.tableOverflowMode)), "Timesheet matrix must own horizontal overflow");
  await evaluate(client, () => [...document.querySelectorAll(".timesheet-controls button")].find((button) => button.textContent?.trim() === "Неделя")?.click());
  await waitForCondition(client, () => !document.querySelector("[data-react-timesheet-island]") && document.querySelectorAll(".timesheet-table thead th").length === 12, { message: "Timesheet view action did not return to the seven-day legacy view", timeoutMs: 10_000 });
  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=timesheet&qa-auth-bypass=1&react-timesheet-evaluation=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-timesheet-island][data-react-island-state="ready"]')) && document.querySelectorAll(".timesheet-employee-row").length === 76, { message: "Timesheet React island did not remount for editor fallback", timeoutMs: 10_000 });
  await evaluate(client, () => document.querySelector("[data-timesheet-cell] button")?.click());
  await waitForCondition(client, () => Boolean(document.querySelector(".timesheet-editor-modal")) && !document.querySelector("[data-react-timesheet-island]"), { message: "Timesheet day action did not return to the legacy editor", timeoutMs: 10_000 });
  primaryAuthorityReady = true;
  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=timesheet&qa-auth-bypass=1&react-timesheet=1&react-timesheet-write=1&qa-reload=timesheet-write` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-timesheet-island][data-react-island-state="ready"]')) && Boolean(document.querySelector('[data-timesheet-attendance-editable="true"] [data-timesheet-cell]')), { message: "Timesheet PostgreSQL write evaluation did not become ready", timeoutMs: 15_000 });
  const coordinates = await evaluate(client, () => { const cell = document.querySelector('[data-timesheet-attendance-editable="true"] [data-timesheet-cell]'); const employeeId = cell?.closest("[data-timesheet-employee]")?.getAttribute("data-timesheet-employee") || ""; const dateKey = String(cell?.getAttribute("data-timesheet-cell") || "").split(":").slice(1).join(":"); const baselineText = cell?.textContent?.replace(/\s+/g, " ").trim() || ""; cell?.querySelector("button")?.click(); return { employeeId, dateKey, baselineText }; });
  assert(coordinates.employeeId && coordinates.dateKey && coordinates.baselineText, "Timesheet command fixture coordinates are incomplete");
  await waitForCondition(client, () => Boolean(document.querySelector("[data-react-timesheet-attendance-form]")), { message: "React attendance editor did not open" });
  await evaluate(client, () => { const setControl = (selector, value) => { const control = document.querySelector(selector); const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value); control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }; setControl('select[name="value"]', "sick"); setControl('input[name="overtime"]', "1"); document.querySelector("[data-react-timesheet-attendance-form]")?.requestSubmit(); });
  await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("нельзя указывать сверхурочные"), { message: "absence/overtime conflict was not rejected" });
  assert(apiRevision === 1 && putAttempts === 0, "invalid attendance must be rejected before PostgreSQL mutation");
  await evaluate(client, () => { const overtime = document.querySelector('input[name="overtime"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(overtime, "0"); overtime.dispatchEvent(new Event("input", { bubbles: true })); const comment = document.querySelector('textarea[name="comment"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(comment, "Больничный PostgreSQL QA"); comment.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector("[data-react-timesheet-attendance-form]")?.requestSubmit(); });
  await waitForCondition(client, (value) => document.querySelector(`[data-timesheet-cell="${value.employeeId}:${value.dateKey}"]`)?.textContent?.includes("Б/л"), { arg: coordinates, message: "saved sick attendance did not return through PostgreSQL read model", timeoutMs: 15_000 });
  assert(apiRevision === 2 && successfulWrites === 1 && putAttempts === 1, "attendance save must advance exactly one PostgreSQL revision");
  const savedEvent = apiDomains.registries.attendanceEvents.find((event) => event.employeeId === coordinates.employeeId && event.date === coordinates.dateKey);
  assert(savedEvent?.type === "sick" && savedEvent?.comment === "Больничный PostgreSQL QA", "saved attendance type or comment was not preserved");
  const unrelatedEvent = apiDomains.registries.attendanceEvents.find((event) => event !== savedEvent); if (unrelatedEvent) unrelatedEvent.serverOnlyMarker = "attendance-unrelated-hidden-field";
  await client.send("Page.navigate", { url: `${legacyOrigin}/?module=timesheet&qa-auth-bypass=1&qa-reload=timesheet-saved-readback` });
  await waitForCondition(client, (value) => document.querySelector(`[data-timesheet-cell][data-timesheet-employee-id="${value.employeeId}"][data-timesheet-date="${value.dateKey}"]`)?.getAttribute("data-timesheet-value") === "sick", { arg: coordinates, message: "legacy Timesheet did not read back the React attendance save", timeoutMs: 15_000 });

  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=timesheet&qa-auth-bypass=1&react-timesheet=1&react-timesheet-write=1&qa-reload=timesheet-remove` });
  await waitForCondition(client, (value) => document.querySelector(`[data-timesheet-cell="${value.employeeId}:${value.dateKey}"]`)?.textContent?.includes("Б/л"), { arg: coordinates, message: "saved attendance did not hydrate for reset", timeoutMs: 15_000 });
  await evaluate(client, (value) => document.querySelector(`[data-timesheet-cell="${value.employeeId}:${value.dateKey}"] button`)?.click(), coordinates);
  await waitForCondition(client, () => Boolean([...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Сбросить факт дня" && !button.disabled)), { message: "attendance reset action did not become available" });
  forceConflictOnce = true;
  await evaluate(client, () => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Сбросить факт дня")?.click());
  await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("изменился в другом сеансе"), { message: "attendance reset revision conflict was not visible" });
  assert(apiRevision === 2 && successfulWrites === 1 && putAttempts === 2, "conflicted attendance reset must not mutate System Domains");
  await evaluate(client, () => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Сбросить факт дня")?.click());
  await waitForCondition(client, (value) => { const cell = document.querySelector(`[data-timesheet-cell="${value.employeeId}:${value.dateKey}"]`); return Boolean(cell && !cell.textContent?.includes("Б/л") && cell.textContent?.replace(/\s+/g, " ").trim() === value.baselineText); }, { arg: coordinates, message: "attendance reset did not restore the projected schedule", timeoutMs: 15_000 });
  assert(apiRevision === 3 && successfulWrites === 2 && putAttempts === 3, "attendance reset retry must advance exactly one revision");
  assert(!apiDomains.registries.attendanceEvents.some((event) => event.employeeId === coordinates.employeeId && event.date === coordinates.dateKey), "attendance reset left the selected day event behind");
  assert(!unrelatedEvent || apiDomains.registries.attendanceEvents.find((event) => event.id === unrelatedEvent.id)?.serverOnlyMarker === "attendance-unrelated-hidden-field", "attendance save/reset changed an unrelated hidden event field");
  assert(commandRequests.every((request) => request.surface === "timesheet" && request.ifMatch === `"${request.expectedRevision}"` && request.idempotencyKey), "attendance commands must carry timesheet surface, If-Match and idempotency key");
  assert(interceptedReads >= 3, "legacy and React paths must consume the System Domains API");
  assert(consoleProblems.length === 0, `browser console problems:\n${consoleProblems.join("\n")}`);
  assert(await readFile(sharedStateFile, "utf8") === original, "Timesheet read-only QA changed state");
  console.log("Timesheet React production-shell functional QA: OK");
  console.log(`- exact parity: 76 employees, ${react.headers.length} columns, ${react.rows.length} table rows; first commit ${state.commitMs.toFixed(2)} ms`);
  console.log("- PostgreSQL read, default legacy, editor fallback, table-owned overflow, unchanged state and clean console: pass");
  console.log("- one-day save/reset, validation, conflict retry, unrelated hidden field and legacy read-back: pass");
} catch (error) {
  if (chrome) {
    const debugState = await evaluate(chrome.client, () => ({
      href: location.href,
      config: { enabled: window.MES_APP_CONFIG?.MES_REACT_TIMESHEET, readOnly: window.MES_APP_CONFIG?.MES_REACT_TIMESHEET_READ_ONLY_EVALUATION },
      tombstone: sessionStorage.getItem("mes-planning-prototype-system-domains-primary-tombstone-v1"),
      target: (() => { const target = document.querySelector("[data-react-timesheet-island]"); return target ? { state: target.dataset.reactIslandState, revision: target.dataset.reactIslandRevision } : null; })(),
      employees: document.querySelectorAll(".timesheet-employee-row").length,
      legacy: Boolean(document.querySelector(".timesheet-page:not([data-timesheet-react])")),
      appText: document.querySelector("#app")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 500) || "",
    })).catch((debugError) => ({ debugError: debugError.message }));
    console.error("Timesheet React QA debug:", JSON.stringify({ ...debugState, interceptedReads, consoleProblems }));
  }
  if (enabledOutput.trim()) console.error(enabledOutput.trim()); if (legacyOutput.trim()) console.error(legacyOutput.trim()); throw error;
} finally {
  if (chrome) await cleanupChrome(chrome);
  await Promise.all([stop(enabledPreview), stop(legacyPreview)]);
  await rm(temporaryRoot, { recursive: true, force: true });
}
