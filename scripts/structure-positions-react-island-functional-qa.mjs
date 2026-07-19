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
assert(migration.report.validation.valid && migration.domains.registries.positions.length === 49, "canonical fixture must contain 49 valid positions");
const snapshot = { version: 1, updatedAt: "2026-07-19T00:00:00.000Z", updatedBy: { actor: "structure-positions-react-functional-qa" }, values: { [STATE_STORAGE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }), [SYSTEM_DOMAINS_STORAGE_KEY]: serializeSystemDomains(migration.domains) }, sharedUi: {}, events: [] };
await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary shared state permissions changed");
const original = await readFile(sharedStateFile, "utf8");
const enabledPort = await getFreePort(); const legacyPort = await getFreePort();
const enabledOrigin = `http://127.0.0.1:${enabledPort}`; const legacyOrigin = `http://127.0.0.1:${legacyPort}`;
const start = (port, enabled) => spawn(process.execPath, ["scripts/preview-dist.mjs"], { cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru", MES_SHARED_STATE_FILE: sharedStateFile, ...(enabled ? { MES_REACT_STRUCTURE_POSITIONS: "1", MES_REACT_STRUCTURE_POSITIONS_READ_ONLY_EVALUATION: "1" } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
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
  await selectRegistry(client, "positions"); await waitForCondition(client, () => document.querySelectorAll('[data-system-domain-table="positions"] [data-system-domain-row]').length === 49, { message: "legacy positions missing" });
  const legacyRows = await evaluate(client, () => [...document.querySelectorAll('[data-system-domain-table="positions"] [data-system-domain-row]')].map((row) => [...row.querySelectorAll("td")].slice(0, -1).map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ")));

  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1` });
  await waitForCondition(client, () => document.querySelectorAll('[data-system-domain-table="orgUnits"] [data-system-domain-row]').length === 19, { message: "enabled default canonical payload missing" });
  await selectRegistry(client, "positions"); await waitForCondition(client, () => document.querySelectorAll('[data-system-domain-table="positions"] [data-system-domain-row]').length === 49, { message: "enabled default did not retain legacy positions" });
  assert(await evaluate(client, () => !document.querySelector("[data-react-structure-positions-island]")), "server permission without session request must remain legacy");

  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&react-structure-positions-evaluation=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-structure-positions-island][data-react-island-state="ready"]') && document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 49), { message: "Structure Positions React island did not render 49 rows", timeoutMs: 15_000 });
  const initial = await evaluate(client, () => { const target = document.querySelector("[data-react-structure-positions-island]"); const selected = document.querySelector('[data-ui-component="SelectableRow"].is-selected'); const metrics = Object.fromEntries([...document.querySelectorAll('[data-ui-component="MetricCard"]')].map((card) => [card.querySelector("span")?.textContent?.trim() || "", Number(card.querySelector("strong")?.textContent || 0)])); return { rows: [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ")), selectedText: selected?.textContent?.replace(/\s+/g, " ").trim() || "", detail: document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || "", disabled: document.querySelector('[data-ui-component="ActionButton"]')?.disabled === true, sidebarItems: document.querySelectorAll('[data-ui-component="SidebarItem"]').length, metrics, revision: target?.dataset.reactIslandRevision, commitMs: Number(target?.dataset.reactIslandCommitMs), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }; });
  assert(JSON.stringify(initial.rows) === JSON.stringify(legacyRows), "React and legacy position cells/order differ");
  assert(initial.rows.length === 49 && initial.selectedText.includes(initial.detail) && initial.disabled && initial.sidebarItems === 7 && initial.revision === "1", "Positions selection/detail/read-only/sidebar contract failed");
  assert(initial.metrics["Подразделений"] === 19 && initial.metrics["Рабочих центров"] === 19 && initial.metrics["Должностей"] === 49 && initial.metrics["Сотрудников"] === 76 && initial.metrics["Оборудования"] === 6, "Positions metrics differ from System Domains");
  assert(Number.isFinite(initial.commitMs) && initial.commitMs < 2000 && !initial.overflow, "Positions commit/overflow gate failed");
  const second = await evaluate(client, async () => { const rows = [...document.querySelectorAll('[data-ui-component="SelectableRow"]')]; rows[1]?.click(); await new Promise((resolve) => setTimeout(resolve, 50)); return [document.querySelectorAll('[data-ui-component="SelectableRow"].is-selected').length, rows[1]?.textContent?.replace(/\s+/g, " ").trim() || "", document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || ""]; });
  assert(second[0] === 1 && second[1].includes(second[2]), "Positions selection/detail synchronization failed");
  await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((entry) => entry.textContent?.includes("Подразделения"))?.click());
  await waitForCondition(client, () => Boolean(!document.querySelector("[data-react-structure-positions-island]") && document.querySelectorAll('[data-system-domain-table="orgUnits"] [data-system-domain-row]').length === 19), { message: "Positions legacy fallback failed" });
  assert(interceptedReads >= 3, "functional QA must exercise PostgreSQL read-model hydration on all navigations");
  assert(consoleProblems.length === 0, `browser console problems:\n${consoleProblems.join("\n")}`); assert(await readFile(sharedStateFile, "utf8") === original, "read-only Positions scenario changed state");
  console.log("Structure Positions React production-shell functional QA: OK");
  console.log(`- same PostgreSQL payload: 49 legacy rows = 49 React rows; first commit ${initial.commitMs.toFixed(2)} ms`);
  console.log("- five cells/order, selection/detail, seven registries, six metrics, legacy fallback and unchanged state: pass");
} catch (error) { if (enabledOutput.trim()) console.error(enabledOutput.trim()); if (legacyOutput.trim()) console.error(legacyOutput.trim()); throw error; }
finally { if (chrome) await cleanupChrome(chrome); await Promise.all([stop(enabledPreview), stop(legacyPreview)]); await rm(temporaryRoot, { recursive: true, force: true }); }
