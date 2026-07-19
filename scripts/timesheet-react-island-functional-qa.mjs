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
let chrome = null; const consoleProblems = []; let interceptedReads = 0;
try {
  await Promise.all([waitPreview(enabledOrigin), waitPreview(legacyOrigin)]);
  chrome = await launchChrome("mes-timesheet-react-qa-"); const { client } = chrome;
  const responseBody = Buffer.from(JSON.stringify({ ok: true, revision: 1, item: migration.domains })).toString("base64");
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    if (message.method !== "Fetch.requestPaused") return;
    const requestUrl = new URL(message.params.request.url);
    if (requestUrl.pathname === "/api/v1/system-domains") { interceptedReads += 1; void client.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }, { name: "ETag", value: '"timesheet-react-1"' }], body: responseBody }).catch((error) => consoleProblems.push(error.message)); }
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
  assert(interceptedReads >= 3, "legacy and React paths must consume the System Domains API");
  assert(consoleProblems.length === 0, `browser console problems:\n${consoleProblems.join("\n")}`);
  assert(await readFile(sharedStateFile, "utf8") === original, "Timesheet read-only QA changed state");
  console.log("Timesheet React production-shell functional QA: OK");
  console.log(`- exact parity: 76 employees, ${react.headers.length} columns, ${react.rows.length} table rows; first commit ${state.commitMs.toFixed(2)} ms`);
  console.log("- PostgreSQL read, default legacy, editor fallback, table-owned overflow, unchanged state and clean console: pass");
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
