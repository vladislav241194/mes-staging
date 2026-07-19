import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupChrome, delay, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const compactRows = [{
  id: "weekly-react-slot-1",
  routeId: "weekly-react-route-1",
  routeStepId: "weekly-react-step-1",
  plannedStart: "2026-07-15T06:00:00.000Z",
  plannedEnd: "2026-07-15T08:00:00.000Z",
  quantity: 20,
  unit: "шт.",
  workCenterId: "D3",
  resourceId: "",
  status: "planned",
  locked: false,
  sourceWorkCenterId: "D3",
  sourceResourceId: "",
  sourceUnit: "шт.",
  sourceComment: "Weekly React parity QA",
  sourceOperationName: "Монтаж",
  sourceSpecificationId: "spec-weekly-react",
  sourceProjectId: "spec-weekly-react",
  sourcePlanningOrderId: "weekly-react-route-1",
  sourceBatchId: "weekly-react-route-1",
  sourceRouteId: "weekly-react-route-1",
}];
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
const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-weekly-production-control-react-"));
const sharedStateFile = join(temporaryRoot, "shared-state.json");
const snapshot = { version: 1, updatedAt: "2026-07-19T00:00:00.000Z", updatedBy: { actor: "weekly-react-qa" }, values: {}, sharedUi: {}, events: [] };
await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary state permissions changed");
const original = await readFile(sharedStateFile, "utf8");
const enabledPort = await getFreePort();
const legacyPort = await getFreePort();
const enabledOrigin = `http://127.0.0.1:${enabledPort}`;
const legacyOrigin = `http://127.0.0.1:${legacyPort}`;
const start = (port, enabled) => spawn(process.execPath, ["scripts/preview-dist.mjs"], { cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru", MES_SHARED_STATE_FILE: sharedStateFile, ...(enabled ? { MES_REACT_WEEKLY_PRODUCTION_CONTROL: "1", MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION: "1" } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
const enabledPreview = start(enabledPort, true);
const legacyPreview = start(legacyPort, false);
let enabledOutput = ""; let legacyOutput = "";
enabledPreview.stdout.on("data", (chunk) => { enabledOutput += chunk; }); enabledPreview.stderr.on("data", (chunk) => { enabledOutput += chunk; });
legacyPreview.stdout.on("data", (chunk) => { legacyOutput += chunk; }); legacyPreview.stderr.on("data", (chunk) => { legacyOutput += chunk; });
let chrome = null;
const consoleProblems = [];
let interceptedReads = 0;
try {
  await Promise.all([waitPreview(enabledOrigin), waitPreview(legacyOrigin)]);
  chrome = await launchChrome("mes-weekly-production-control-react-qa-");
  const { client } = chrome;
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    if (message.method !== "Fetch.requestPaused") return;
    const requestUrl = new URL(message.params.request.url);
    if (requestUrl.pathname === "/api/v1/planning/period") {
      interceptedReads += 1;
      void client.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }, { name: "ETag", value: '"weekly-react-1"' }], body: responseBody }).catch((error) => consoleProblems.push(error.message));
    } else void client.send("Fetch.continueRequest", { requestId: message.params.requestId }).catch((error) => consoleProblems.push(error.message));
  });
  await client.send("Page.enable"); await client.send("Runtime.enable");
  await client.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/planning/period*", requestStage: "Request" }] });
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });

  await client.send("Page.navigate", { url: `${legacyOrigin}/?module=weeklyProductionControl&qa-auth-bypass=1` });
  await waitForCondition(client, () => document.querySelectorAll(".weekly-production-control-table tbody tr").length >= 25, { message: "completed legacy Weekly Control rows missing", timeoutMs: 15_000 });
  const legacy = await evaluate(client, normalizedTable);

  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=weeklyProductionControl&qa-auth-bypass=1` });
  await waitForCondition(client, () => document.querySelectorAll(".weekly-production-control-table tbody tr").length >= 25, { message: "completed enabled Weekly legacy default missing", timeoutMs: 15_000 });
  assert(await evaluate(client, () => !document.querySelector("[data-react-weekly-production-control-island]")), "server permission without session request must retain legacy Weekly Control");

  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=weeklyProductionControl&qa-auth-bypass=1&react-weekly-production-control-evaluation=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-weekly-production-control-island][data-react-island-state="ready"]')), { message: "Weekly Control React island not ready", timeoutMs: 15_000 });
  const react = await evaluate(client, normalizedTable);
  const state = await evaluate(client, () => { const target = document.querySelector("[data-react-weekly-production-control-island]"); const tableWrap = document.querySelector('[data-ui-component="TableWrap"]'); return { revision: target?.dataset.reactIslandRevision, commitMs: Number(target?.dataset.reactIslandCommitMs), pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, tableOwnsOverflow: Boolean(tableWrap && tableWrap.scrollWidth > tableWrap.clientWidth), tableOverflowMode: tableWrap ? getComputedStyle(tableWrap).overflowX : "" }; });
  assert(JSON.stringify(react.headers) === JSON.stringify(legacy.headers), `Weekly header parity failed\nlegacy=${JSON.stringify(legacy.headers)}\nreact=${JSON.stringify(react.headers)}`);
  assert(JSON.stringify(react.rows) === JSON.stringify(legacy.rows), `Weekly row parity failed\nlegacy=${JSON.stringify(legacy.rows)}\nreact=${JSON.stringify(react.rows)}`);
  assert(state.revision === "1" && Number.isFinite(state.commitMs) && state.commitMs < 2000, "Weekly React commit telemetry failed");
  assert(!state.pageOverflow && (state.tableOwnsOverflow || ["auto", "scroll"].includes(state.tableOverflowMode)), "Weekly dense matrix must retain table-owned horizontal overflow policy");
  assert(interceptedReads >= 3, "both legacy and React paths must consume the bounded planning period API");
  assert(consoleProblems.length === 0, `browser console problems:\n${consoleProblems.join("\n")}`);
  assert(await readFile(sharedStateFile, "utf8") === original, "Weekly read-only QA changed state");
  console.log("Weekly Production Control React production-shell functional QA: OK");
  console.log(`- exact parity: ${react.rows.length} groups, ${react.headers.length} columns; first commit ${state.commitMs.toFixed(2)} ms`);
  console.log("- compact PostgreSQL read, default legacy, table-owned overflow, unchanged state and clean console: pass");
} catch (error) {
  if (enabledOutput.trim()) console.error(enabledOutput.trim()); if (legacyOutput.trim()) console.error(legacyOutput.trim()); throw error;
} finally {
  if (chrome) await cleanupChrome(chrome);
  await Promise.all([stop(enabledPreview), stop(legacyPreview)]);
  await rm(temporaryRoot, { recursive: true, force: true });
}
