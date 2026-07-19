import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupChrome, delay, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const DIRECTORY_STORAGE_KEY = "mes-planning-prototype-directories-v2";
const STATE_STORAGE_KEY = "mes-planning-prototype-state-v2";
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const fixture = { componentTypes: [], nomenclatureTypes: [], nomenclature: [], bomLists: [], statuses: [
  { id: "route-draft", group: "Маршруты", originModule: "Маршрутные карты", changeModule: "Маршрутные карты", usedIn: "Маршруты", contractView: "Сохранён", transitionView: "Черновик -> Активен", nextDocumentView: "Заказ-наряд", registryKind: "Бизнес-статус", name: "Черновик", audit: "Проверено", type: "Маршрут", code: "draft", annotation: "Маршрут редактируется", impactView: "Не передаётся в планирование" },
  { id: "route-active", group: "Маршруты", originModule: "Маршрутные карты", changeModule: "Маршрутные карты", usedIn: "Маршруты, планирование", contractView: "Опубликован", transitionView: "Черновик -> Активен", nextDocumentView: "Заказ-наряд", registryKind: "Бизнес-статус", name: "Активен", audit: "Проверено", type: "Маршрут", code: "active", annotation: "Рабочий маршрут", impactView: "Доступен планированию" },
  { id: "resource-check", group: "Ресурсы", originModule: "Структура", changeModule: "Структура", usedIn: "Планирование", contractView: "Системный", transitionView: "Работает -> Проверка", nextDocumentView: "—", registryKind: "Системный сигнал", name: "Проверка", audit: "Проверить", type: "Оборудование", code: "check", annotation: "Требует внимания", impactView: "Ограничивает использование" },
] };

async function waitPreview(origin) {
  for (let i = 0; i < 80; i += 1) {
    try { const response = await fetch(`${origin}/?module=directories&qa-auth-bypass=1`); if (response.ok && (await response.text()).includes('id="app"')) return; } catch {}
    await delay(120);
  }
  throw new Error(`Statuses preview did not start at ${origin}`);
}
async function stop(child) {
  if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  await new Promise((resolve) => { if (child.exitCode !== null) return resolve(); const timer = setTimeout(resolve, 1200); child.once("exit", () => { clearTimeout(timer); resolve(); }); });
}
async function openStatuses(client) {
  await waitForCondition(client, () => Boolean(document.querySelector('[data-directory-id="statuses"]')), { message: "Statuses navigation missing" });
  await evaluate(client, () => document.querySelector('[data-directory-id="statuses"]')?.click());
  await waitForCondition(client, () => document.querySelectorAll('[data-directory-row]').length >= 3, { message: "legacy Statuses rows missing" });
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-directory-statuses-react-"));
const sharedStateFile = join(temporaryRoot, "shared-state.json");
const snapshot = { version: 1, updatedAt: "2026-07-19T00:00:00.000Z", updatedBy: { actor: "statuses-react-qa" }, values: { [STATE_STORAGE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }), [DIRECTORY_STORAGE_KEY]: JSON.stringify(fixture) }, sharedUi: {}, events: [] };
await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary state permissions changed");
const original = await readFile(sharedStateFile, "utf8");
const enabledPort = await getFreePort();
const legacyPort = await getFreePort();
const enabledOrigin = `http://127.0.0.1:${enabledPort}`;
const legacyOrigin = `http://127.0.0.1:${legacyPort}`;
const start = (port, enabled) => spawn(process.execPath, ["scripts/preview-dist.mjs"], { cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru", MES_SHARED_STATE_FILE: sharedStateFile, ...(enabled ? { MES_REACT_DIRECTORY_STATUSES: "1", MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION: "1" } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
const enabledPreview = start(enabledPort, true);
const legacyPreview = start(legacyPort, false);
let enabledOutput = ""; let legacyOutput = "";
enabledPreview.stdout.on("data", (chunk) => { enabledOutput += chunk; }); enabledPreview.stderr.on("data", (chunk) => { enabledOutput += chunk; });
legacyPreview.stdout.on("data", (chunk) => { legacyOutput += chunk; }); legacyPreview.stderr.on("data", (chunk) => { legacyOutput += chunk; });
let chrome = null;
const consoleProblems = [];
try {
  await Promise.all([waitPreview(enabledOrigin), waitPreview(legacyOrigin)]);
  chrome = await launchChrome("mes-directory-statuses-react-qa-");
  const { client } = chrome;
  client.socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" ")); });
  await client.send("Page.enable"); await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  await client.send("Page.navigate", { url: `${legacyOrigin}/?module=directories&qa-auth-bypass=1` });
  await openStatuses(client);
  const legacyRows = await evaluate(client, () => [...document.querySelectorAll('[data-directory-row]')].map((row) => [...row.querySelectorAll("td")].slice(0, 7).map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ")));

  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=directories&qa-auth-bypass=1` }); await openStatuses(client);
  assert(await evaluate(client, () => !document.querySelector("[data-react-directory-statuses-island]")), "server permission without session request must retain legacy Statuses");

  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=directories&qa-auth-bypass=1&react-directory-statuses-evaluation=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-directory-id="statuses"]') || document.querySelector('[data-react-directory-statuses-island]')), { message: "Statuses evaluation route missing" });
  await evaluate(client, () => document.querySelector('[data-directory-id="statuses"]')?.click());
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-directory-statuses-island][data-react-island-state="ready"]')), { message: "Statuses React island not ready", timeoutMs: 15_000 });
  const initial = await evaluate(client, () => { const target = document.querySelector("[data-react-directory-statuses-island]"); return { rows: [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ")), selected: document.querySelectorAll('[data-ui-component="SelectableRow"].is-selected').length, detail: document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || "", disabled: [...document.querySelectorAll('[data-ui-component="ActionButton"]')].every((button) => button.disabled), revision: target?.dataset.reactIslandRevision, commitMs: Number(target?.dataset.reactIslandCommitMs), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }; });
  assert(JSON.stringify(initial.rows) === JSON.stringify(legacyRows), `Statuses visible parity failed\nlegacy=${JSON.stringify(legacyRows)}\nreact=${JSON.stringify(initial.rows)}`);
  assert(initial.selected === 1 && initial.detail && initial.disabled && initial.revision === "1", "Statuses selection/detail/read-only contract failed");
  assert(Number.isFinite(initial.commitMs) && initial.commitMs < 2000 && !initial.overflow, "Statuses commit/overflow gate failed");
  const filtered = await evaluate(client, async () => { const items = [...document.querySelectorAll('[data-ui-component="SidebarItem"]')]; items.find((item, index) => index > 1 && !item.textContent?.includes("Все справочники"))?.click(); await new Promise((resolve) => setTimeout(resolve, 50)); return [document.querySelectorAll('[data-ui-component="SelectableRow"]').length, document.querySelectorAll('[data-ui-component="SelectableRow"].is-selected').length]; });
  assert(filtered[0] > 0 && filtered[0] < initial.rows.length && filtered[1] === 1, "Statuses group filter failed");
  await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Все справочники"))?.click());
  await waitForCondition(client, () => Boolean(!document.querySelector("[data-react-directory-statuses-island]") && document.querySelector('[data-directory-id="statuses"].is-active')), { message: "Statuses legacy return failed" });
  assert(consoleProblems.length === 0, `browser console problems:\n${consoleProblems.join("\n")}`);
  assert(await readFile(sharedStateFile, "utf8") === original, "Statuses read-only QA changed state");
  console.log("Directory Statuses React production-shell functional QA: OK");
  console.log(`- exact parity: ${legacyRows.length} rows, seven cells and order; first commit ${initial.commitMs.toFixed(2)} ms`);
  console.log("- default legacy, group filter, selection/detail, legacy return, unchanged state and clean console: pass");
} catch (error) {
  if (enabledOutput.trim()) console.error(enabledOutput.trim()); if (legacyOutput.trim()) console.error(legacyOutput.trim()); throw error;
} finally {
  if (chrome) await cleanupChrome(chrome); await Promise.all([stop(enabledPreview), stop(legacyPreview)]); await rm(temporaryRoot, { recursive: true, force: true });
}
