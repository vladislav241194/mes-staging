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
const writeSharedStateFile = join(temporaryRoot, "write-shared-state.json");
const snapshot = { version: 1, updatedAt: "2026-07-19T00:00:00.000Z", updatedBy: { actor: "statuses-react-qa" }, values: { [STATE_STORAGE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }), [DIRECTORY_STORAGE_KEY]: JSON.stringify(fixture) }, sharedUi: {}, events: [] };
await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
await writeFile(writeSharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary state permissions changed");
assert(((await stat(writeSharedStateFile)).mode & 0o777) === 0o600, "temporary write state permissions changed");
const original = await readFile(sharedStateFile, "utf8");
const enabledPort = await getFreePort();
const legacyPort = await getFreePort();
const writePort = await getFreePort();
const enabledOrigin = `http://127.0.0.1:${enabledPort}`;
const legacyOrigin = `http://127.0.0.1:${legacyPort}`;
const writeOrigin = `http://127.0.0.1:${writePort}`;
const start = (port, enabled, stateFile = sharedStateFile) => spawn(process.execPath, ["scripts/preview-dist.mjs"], { cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru", MES_SHARED_STATE_FILE: stateFile, ...(enabled ? { MES_REACT_DIRECTORY_STATUSES: "1", MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION: "1" } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
const enabledPreview = start(enabledPort, true);
const legacyPreview = start(legacyPort, false);
const writePreview = start(writePort, false, writeSharedStateFile);
let enabledOutput = ""; let legacyOutput = ""; let writeOutput = "";
enabledPreview.stdout.on("data", (chunk) => { enabledOutput += chunk; }); enabledPreview.stderr.on("data", (chunk) => { enabledOutput += chunk; });
legacyPreview.stdout.on("data", (chunk) => { legacyOutput += chunk; }); legacyPreview.stderr.on("data", (chunk) => { legacyOutput += chunk; });
writePreview.stdout.on("data", (chunk) => { writeOutput += chunk; }); writePreview.stderr.on("data", (chunk) => { writeOutput += chunk; });
let chrome = null;
const consoleProblems = [];
try {
  await Promise.all([waitPreview(enabledOrigin), waitPreview(legacyOrigin), waitPreview(writeOrigin)]);
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
  const initial = await evaluate(client, () => { const target = document.querySelector("[data-react-directory-statuses-island]"); const layout = getComputedStyle(target.querySelector(".module-layout")); const panel = getComputedStyle(target.querySelector(".panel")); const detail = getComputedStyle(target.querySelector(".detail")); const action = getComputedStyle(target.querySelector(".panel-heading .action")); return { rows: [...target.querySelectorAll('[data-ui-component="SelectableRow"]')].map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ")), selected: target.querySelectorAll('[data-ui-component="SelectableRow"].is-selected').length, detail: target.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || "", disabled: [...target.querySelectorAll('[data-ui-component="ActionButton"]')].every((button) => button.disabled), revision: target?.dataset.reactIslandRevision, commitMs: Number(target?.dataset.reactIslandCommitMs), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, layoutDisplay: layout.display, layoutColumns: layout.gridTemplateColumns.split(" ").length, panelRadius: parseFloat(panel.borderRadius), detailRadius: parseFloat(detail.borderRadius), actionRadius: parseFloat(action.borderRadius), panelBackground: panel.backgroundColor }; });
  assert(JSON.stringify(initial.rows) === JSON.stringify(legacyRows), `Statuses visible parity failed\nlegacy=${JSON.stringify(legacyRows)}\nreact=${JSON.stringify(initial.rows)}`);
  assert(initial.selected === 1 && initial.detail && initial.disabled && initial.revision === "1", "Statuses selection/detail/read-only contract failed");
  assert(Number.isFinite(initial.commitMs) && initial.commitMs < 2000 && !initial.overflow, "Statuses commit/overflow gate failed");
  assert(initial.layoutDisplay === "grid" && initial.layoutColumns === 2 && initial.panelRadius >= 16 && initial.detailRadius >= 16 && initial.actionRadius >= 8 && initial.panelBackground !== "rgba(0, 0, 0, 0)", `Statuses production UI contract failed: ${JSON.stringify(initial)}`);
  const filtered = await evaluate(client, async () => { const items = [...document.querySelectorAll('[data-ui-component="SidebarItem"]')]; items.find((item, index) => index > 1 && !item.textContent?.includes("Все справочники"))?.click(); await new Promise((resolve) => setTimeout(resolve, 50)); return [document.querySelectorAll('[data-ui-component="SelectableRow"]').length, document.querySelectorAll('[data-ui-component="SelectableRow"].is-selected').length]; });
  assert(filtered[0] > 0 && filtered[0] < initial.rows.length && filtered[1] === 1, "Statuses group filter failed");
  await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Все справочники"))?.click());
  await waitForCondition(client, () => Boolean(!document.querySelector("[data-react-directory-statuses-island]") && document.querySelector('[data-directory-id="statuses"].is-active')), { message: "Statuses legacy return failed" });
  assert(consoleProblems.length === 0, `browser console problems:\n${consoleProblems.join("\n")}`);
  assert(await readFile(sharedStateFile, "utf8") === original, "Statuses read-only QA changed state");

  await client.send("Page.navigate", { url: `${writeOrigin}/?module=directories&qa-auth-bypass=1&react-directory-statuses=1&react-directory-statuses-write=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-directory-id="statuses"]')), { message: "Statuses write contour navigation missing" });
  await evaluate(client, () => document.querySelector('[data-directory-id="statuses"]')?.click());
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-directory-statuses-island][data-react-island-state="ready"]')), { message: "Statuses write evaluation did not mount", timeoutMs: 15_000 });
  const writeInitial = await evaluate(client, () => ({
    count: document.querySelectorAll('[data-ui-component="SelectableRow"]').length,
    badge: document.querySelector(".lab-badge")?.textContent?.trim() || "",
    addDisabled: [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent.includes("Добавить пользовательский"))?.disabled,
  }));
  assert(writeInitial.badge.includes("custom-status") && writeInitial.addDisabled === false, `custom Status write capability did not reach React: ${JSON.stringify(writeInitial)}`);
  await delay(250);
  const planningBeforeCustomWrite = JSON.parse(JSON.parse(await readFile(writeSharedStateFile, "utf8")).values[STATE_STORAGE_KEY]);

  await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].find((row) => row.textContent.includes("Черновик"))?.click());
  await waitForCondition(client, () => document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent === "Черновик", { message: "system Status row was not selectable" });
  const systemEditVisible = await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent.includes("Редактировать пользовательский")));
  assert(!systemEditVisible, "system Status row must not expose the custom editor");

  await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent.includes("Добавить пользовательский"))?.click());
  await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-editor")), { message: "custom Status create editor did not open" });
  await evaluate(client, () => {
    const form = document.querySelector(".react-nomenclature-editor");
    const setValue = (name, value) => {
      const control = form?.elements.namedItem(name);
      if (!control) throw new Error(`Missing custom Status field: ${name}`);
      const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(control, value);
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setValue("group", "QA / Пользовательские статусы");
    setValue("name", "Ожидает маркировки");
    setValue("type", "Изделие QA");
    setValue("code", "awaiting_label");
    setValue("annotation", "Одноразовый статус из изолированного QA");
    setValue("impact", "Не влияет на системный lifecycle");
    form.requestSubmit();
  });
  await waitForCondition(client, (expectedCount) => document.querySelectorAll('[data-ui-component="SelectableRow"]').length === expectedCount
    && [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].some((row) => row.textContent.includes("Ожидает маркировки")), { arg: writeInitial.count + 1, message: "custom Status create did not return the incremented projection" });

  await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].find((row) => row.textContent.includes("Ожидает маркировки"))?.click());
  await waitForCondition(client, () => document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent === "Ожидает маркировки", { message: "created custom Status was not selectable" });
  await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent.includes("Редактировать пользовательский"))?.click());
  await waitForCondition(client, () => document.querySelector('.react-nomenclature-editor input[name="name"]')?.value === "Ожидает маркировки", { message: "custom Status edit form did not open" });
  await evaluate(client, () => {
    const form = document.querySelector(".react-nomenclature-editor");
    const control = form?.elements.namedItem("name");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(control, "Готов к маркировке");
    control.dispatchEvent(new Event("input", { bubbles: true }));
    form.requestSubmit();
  });
  await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].some((row) => row.textContent.includes("Готов к маркировке")), { message: "custom Status edit did not return the updated projection" });

  let persisted = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const persistedSnapshot = JSON.parse(await readFile(writeSharedStateFile, "utf8"));
    persisted = JSON.parse(persistedSnapshot.values[DIRECTORY_STORAGE_KEY]);
    if (persisted.statuses.some((row) => row.name === "Готов к маркировке")) break;
    await delay(120);
  }
  const customRow = persisted.statuses.find((row) => row.name === "Готов к маркировке");
  assert(customRow?.id.startsWith("custom-status-") && customRow.statusAuthority === "user" && customRow.code === "awaiting_label", `custom Status authority/persistence mismatch: ${JSON.stringify(customRow)}`);
  assert(persisted.statuses.some((row) => row.id === "route-draft" && row.name === "Черновик" && row.code === "draft"), "system Status changed during custom create/edit");
  const persistedPlanning = JSON.parse(JSON.parse(await readFile(writeSharedStateFile, "utf8")).values[STATE_STORAGE_KEY]);
  const planningProjection = (state) => ({ routes: state.routes || [], routeSteps: state.routeSteps || [], slots: state.slots || [] });
  assert(JSON.stringify(planningProjection(persistedPlanning)) === JSON.stringify(planningProjection(planningBeforeCustomWrite)), `custom Status write changed Planning routes/steps/slots\nbefore=${JSON.stringify(planningProjection(planningBeforeCustomWrite))}\nafter=${JSON.stringify(planningProjection(persistedPlanning))}`);

  await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Все справочники"))?.click());
  await waitForCondition(client, () => Boolean(!document.querySelector("[data-react-directory-statuses-island]") && document.querySelector('[data-directory-id="statuses"].is-active')), { message: "custom Status legacy return failed" });
  assert(await evaluate(client, () => [...document.querySelectorAll('[data-directory-row]')].some((row) => row.textContent.includes("Готов к маркировке"))), "legacy Statuses did not read back the custom row");
  assert(consoleProblems.length === 0, `browser console problems after custom write:\n${consoleProblems.join("\n")}`);
  console.log("Directory Statuses React production-shell functional QA: OK");
  console.log(`- exact parity: ${legacyRows.length} rows, seven cells and order; first commit ${initial.commitMs.toFixed(2)} ms`);
  console.log("- default legacy, group filter, selection/detail, legacy return, unchanged state and clean console: pass");
  console.log("- local RBAC-gated custom create/edit, system-row protection, persistence, legacy read-back and unchanged Planning state: pass");
} catch (error) {
  if (enabledOutput.trim()) console.error(enabledOutput.trim()); if (legacyOutput.trim()) console.error(legacyOutput.trim()); if (writeOutput.trim()) console.error(writeOutput.trim()); throw error;
} finally {
  if (chrome) await cleanupChrome(chrome); await Promise.all([stop(enabledPreview), stop(legacyPreview), stop(writePreview)]); await rm(temporaryRoot, { recursive: true, force: true });
}
