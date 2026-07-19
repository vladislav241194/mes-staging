import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getProductionStructureEmployees } from "../src/production_structure_service.js";
import { SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY } from "../src/app_constants.js";
import { PRODUCTION_STRUCTURE_MATRIX_ROWS } from "../src/production_structure_matrix_data.js";
import { migrateLegacySystemDomains } from "../src/modules/system_domains/service.js";

const defaultUrl = new URL("/?module=timesheet&qa=timesheet-functional&qa-auth-bypass=1", process.env.MES_QA_URL || "http://localhost:4174/").toString();
const UI_STORAGE_KEY = "mes-planning-prototype-ui-v1";

function getArg(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withQuery(url, params = {}) {
  const next = new URL(url);
  Object.entries(params).forEach(([key, value]) => next.searchParams.set(key, String(value)));
  return next.toString();
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function findChrome() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new Error("Chrome/Chromium executable was not found in /Applications.");
}

async function getFreePort() {
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForJson(url, options = {}, timeoutMs = 10000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return await response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await delay(120);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.onMessage(event));
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || "CDP error"));
      else resolve(message.result);
      return;
    }
    if (message.method && this.listeners.has(message.method)) {
      this.listeners.get(message.method).forEach((listener) => listener(message.params || {}));
    }
  }

  async send(method, params = {}, timeoutMs = 15000) {
    await this.ready;
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, pageFunction, arg) {
  const source = typeof pageFunction === "function" ? pageFunction.toString() : pageFunction;
  const expression = arg === undefined ? `(${source})()` : `(${source})(${JSON.stringify(arg)})`;
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, 45000);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

async function launchChrome() {
  const chromePath = await findChrome();
  const port = await getFreePort();
  const profileDir = await mkdtemp(join(tmpdir(), "mes-timesheet-qa-"));
  const child = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ], { stdio: "ignore" });
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const target = await waitForJson(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    return { child, client: new CdpClient(target.webSocketDebuggerUrl), profileDir };
  } catch (error) {
    child.kill("SIGTERM");
    await rm(profileDir, { recursive: true, force: true });
    throw error;
  }
}

async function cleanupChrome(chrome) {
  try {
    chrome.client.close();
  } catch {
    // Browser may already be closed.
  }
  if (chrome.child.exitCode === null && !chrome.child.killed) chrome.child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (chrome.child.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, 1200);
    chrome.child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await rm(chrome.profileDir, { recursive: true, force: true }).catch(() => {});
}

async function waitForTimesheet(client) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 16000) {
    const ok = await evaluate(client, () => document.querySelector("main.app-shell")?.dataset.layoutPage === "timesheet");
    if (ok) return;
    await delay(120);
  }
  throw new Error("Timesheet page did not render.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const employees = getProductionStructureEmployees().filter((employee) => employee.name);
  const baseline = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS }); const supervisorPosition = baseline.domains.registries.positions.find((position) => position.kind === "supervisor"); const masterId = baseline.domains.registries.employmentAssignments.find((assignment) => assignment.positionId === supervisorPosition?.id)?.employeeId || ""; const executorId = baseline.domains.registries.employmentAssignments.find((assignment) => assignment.employeeId !== masterId)?.employeeId || "";
  const migration = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS, legacyUi: { accessRoleProfiles: [{ id: "admin", label: "Администратор QA", scope: "global", defaultModule: "timesheet", modulePermissions: { timesheet: { view: true, edit: true } } }, { id: "master", label: "Мастер QA", scope: "workCenter", defaultModule: "timesheet", modulePermissions: { timesheet: { view: true, edit: true } } }, { id: "executor", label: "Исполнитель QA", scope: "self", defaultModule: "timesheet", modulePermissions: { timesheet: { view: true, edit: false } } }], accessRoleAssignments: { [masterId]: "master", [executorId]: "executor" } }, migratedAt: "2026-07-19T00:00:00.000Z" });
  let apiDomains = structuredClone(migration.domains); let apiRevision = 1; let putCount = 0;
  const url = withQuery(getArg("--url", defaultUrl), {
    module: "timesheet",
    qa: "timesheet-functional",
    "qa-auth-bypass": "1",
  });
  const chrome = await launchChrome();
  const consoleProblems = [];
  try {
    const { client } = chrome;
    client.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method !== "Runtime.consoleAPICalled") return;
      if (!["error", "warning", "assert"].includes(message.params?.type)) return;
      consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    });
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    const responseBody = (value) => Buffer.from(JSON.stringify(value)).toString("base64");
    const fulfill = (requestId, payload, { statusCode = 200, revision = apiRevision } = {}) => client.send("Fetch.fulfillRequest", { requestId, responseCode: statusCode, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }, { name: "ETag", value: `"${revision}"` }], body: responseBody(payload) });
    client.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data); if (message.method !== "Fetch.requestPaused") return; const requestUrl = new URL(message.params.request.url); const method = String(message.params.request.method || "GET").toUpperCase();
      if (requestUrl.pathname === "/api/v1/system-domains/capabilities") void fulfill(message.params.requestId, { ok: true, capabilities: { serverCommandsEnabled: true, serverCommandSurfaces: ["timesheet"], consistency: { details: { authority: { mode: "postgres-primary" } } } } });
      else if (requestUrl.pathname === "/api/v1/system-domains" && method === "GET") void fulfill(message.params.requestId, { ok: true, revision: apiRevision, item: apiDomains });
      else if (requestUrl.pathname === "/api/v1/system-domains" && method === "PUT") { const body = JSON.parse(message.params.request.postData || "{}"); if (Number(body.expectedRevision) !== apiRevision) void fulfill(message.params.requestId, { ok: false, conflict: true, revision: apiRevision }, { statusCode: 409 }); else { apiDomains = structuredClone(body.domains); apiRevision += 1; putCount += 1; void fulfill(message.params.requestId, { ok: true, revision: apiRevision, item: apiDomains, snapshotSync: { queued: true } }); } }
      else void client.send("Fetch.continueRequest", { requestId: message.params.requestId });
    });
    await client.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/system-domains*", requestStage: "Request" }] });
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `sessionStorage.setItem('mes-planning-prototype-shared-disabled-until-v1', String(Date.now() + 60 * 60 * 1000)); sessionStorage.setItem(${JSON.stringify(SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY)}, '1');`,
    });
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1710,
      height: 1112,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send("Page.navigate", { url });
    await delay(900);
    await waitForTimesheet(client);

    const initial = await evaluate(client, (expectedEmployees) => {
      const scheduleButtons = [...document.querySelectorAll("[data-timesheet-schedule-button]")];
      const employeeIds = new Set(scheduleButtons.map((button) => button.dataset.timesheetEmployeeId).filter(Boolean));
      const dayButtons = [...document.querySelectorAll("[data-timesheet-day-button]")];
      const firstDayButton = dayButtons[0];
      const rect = firstDayButton?.getBoundingClientRect();
      return {
        employeeCount: employeeIds.size,
        expectedEmployees,
        departmentRows: document.querySelectorAll(".timesheet-department-row").length,
        dayButtonCount: dayButtons.length,
        firstDayButtonRect: rect ? { width: rect.width, height: rect.height } : null,
        firstEmployeeId: scheduleButtons[0]?.dataset.timesheetEmployeeId || "",
        firstDateKey: document.querySelector("[data-timesheet-cell]")?.dataset.timesheetDate || "",
      };
    }, employees.length);

    assert(initial.employeeCount === employees.length, `Timesheet employee count mismatch: ${initial.employeeCount} !== ${employees.length}`);
    assert(initial.departmentRows > 0, "Timesheet has no department rows.");
    assert(initial.dayButtonCount >= employees.length * 28, "Timesheet does not render a full monthly grid.");
    assert(initial.firstDayButtonRect?.width >= 28 && initial.firstDayButtonRect?.height >= 28, "Timesheet day button is below touch target.");
    assert(initial.firstEmployeeId && initial.firstDateKey, "Timesheet first editable cell was not found.");

    const editedAttendance = await evaluate(client, async ({ employeeId, dateKey, uiStorageKey }) => {
      const cell = document.querySelector(`[data-timesheet-cell][data-timesheet-employee-id="${CSS.escape(employeeId)}"][data-timesheet-date="${CSS.escape(dateKey)}"]`);
      cell?.querySelector("[data-timesheet-day-button]")?.click();
      const form = document.querySelector("[data-timesheet-attendance-form]");
      const scheduleForm = document.querySelector("[data-timesheet-schedule-form]");
      if (!form) return { opened: false };
      const setField = (name, value) => {
        const field = form.querySelector(`[name="${name}"]`);
        if (!field) return false;
        field.value = String(value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      };
      setField("value", "sick");
      setField("start", "09:00");
      setField("end", "18:00");
      setField("overtime", "0");
      setField("comment", "QA табель");
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 120));
      const ui = JSON.parse(localStorage.getItem(uiStorageKey) || "{}");
      return {
        opened: true,
        editable: !form.querySelector("fieldset")?.disabled,
        formsSeparated: Boolean(scheduleForm && !form.querySelector("[name='scheduleCode']") && !scheduleForm.querySelector("[name='value']")),
        legacyCellOverride: ui.timesheetCellOverrides?.[`${employeeId}::${dateKey}`] || null,
      };
    }, {
      employeeId: initial.firstEmployeeId,
      dateKey: initial.firstDateKey,
      uiStorageKey: UI_STORAGE_KEY,
    });
    await delay(700);
    const savedAttendanceEvent = (apiDomains.registries?.attendanceEvents || []).find((event) => event.employeeId === initial.firstEmployeeId && event.date === initial.firstDateKey) || null;

    assert(editedAttendance.opened, "Timesheet editor modal did not open.");
    assert(editedAttendance.editable, "Timesheet command fixture did not receive edit permission.");
    assert(editedAttendance.formsSeparated, "Attendance fact and permanent schedule are not separated into independent forms.");
    assert(savedAttendanceEvent?.type === "sick", `Canonical sick attendance event was not saved: ${JSON.stringify(savedAttendanceEvent)}; puts=${putCount}; console=${consoleProblems.slice(0, 3).join(" | ")}`);
    assert(!editedAttendance.legacyCellOverride, "Attendance save wrote back to legacy timesheetCellOverrides.");

    const editedSchedule = await evaluate(client, async ({ employeeId, dateKey, uiStorageKey }) => {
      const scheduleButton = document.querySelector(`[data-timesheet-schedule-button][data-timesheet-employee-id="${CSS.escape(employeeId)}"]`);
      scheduleButton?.click();
      const form = document.querySelector("[data-timesheet-schedule-form]");
      if (!form) return { opened: false };
      const setField = (name, value) => {
        const field = form.querySelector(`[name="${name}"]`);
        if (!field) return false;
        field.value = String(value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      };
      setField("effectiveFrom", dateKey);
      setField("scheduleCode", "2/2");
      setField("patternOffset", "2");
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 120));
      const ui = JSON.parse(localStorage.getItem(uiStorageKey) || "{}");
      return {
        opened: true,
        legacyScheduleOverride: ui.timesheetScheduleOverrides?.[employeeId] || null,
      };
    }, {
      employeeId: initial.firstEmployeeId,
      dateKey: initial.firstDateKey,
      uiStorageKey: UI_STORAGE_KEY,
    });
    await delay(700);
    const savedScheduleAssignment = (apiDomains.registries?.scheduleAssignments || []).find((assignment) => assignment.employeeId === initial.firstEmployeeId && assignment.validFrom === initial.firstDateKey) || null;
    const savedScheduleTemplate = (apiDomains.registries?.scheduleTemplates || []).find((template) => template.id === savedScheduleAssignment?.scheduleTemplateId) || null;

    assert(editedSchedule.opened, "Independent schedule editor did not open.");
    assert(savedScheduleTemplate?.code === "2/2", `Canonical 2/2 assignment was not saved: ${JSON.stringify({ savedScheduleAssignment, savedScheduleTemplate })}`);
    assert(Number(savedScheduleAssignment?.patternOffset) === 2, "Canonical schedule cycle offset was not saved.");
    assert(!editedSchedule.legacyScheduleOverride, "Schedule save wrote back to legacy timesheetScheduleOverrides.");

    const reflected = await evaluate(client, ({ employeeId, dateKey }) => {
      const cell = document.querySelector(`[data-timesheet-cell][data-timesheet-employee-id="${CSS.escape(employeeId)}"][data-timesheet-date="${CSS.escape(dateKey)}"]`);
      const schedule = document.querySelector(`[data-timesheet-schedule-button][data-timesheet-employee-id="${CSS.escape(employeeId)}"]`);
      return {
        cellValue: cell?.dataset.timesheetValue || "",
        cellAvailability: cell?.dataset.timesheetAvailability || "",
        cellText: cell?.textContent?.trim().replace(/\s+/g, " ") || "",
        scheduleText: schedule?.textContent?.trim().replace(/\s+/g, " ") || "",
        editorStillOpen: Boolean(document.querySelector("[data-timesheet-editor-form]")),
      };
    }, { employeeId: initial.firstEmployeeId, dateKey: initial.firstDateKey });

    assert(!reflected.editorStillOpen, "Timesheet editor stayed open after save.");
    assert(reflected.cellValue === "sick", `Timesheet cell did not reflect saved state: ${JSON.stringify(reflected)}`);
    assert(reflected.cellText.includes("Б/л"), `Timesheet sick cell text is missing: ${reflected.cellText}`);
    assert(reflected.scheduleText.includes("2/2") && reflected.scheduleText.includes("08:00-20:00"), `Timesheet schedule did not reflect canonical template: ${reflected.scheduleText}`);
    assert(putCount === 2 && apiRevision === 3, `Timesheet commands must advance two PostgreSQL revisions: puts=${putCount} revision=${apiRevision}`);
    const unexpectedConsoleProblems = consoleProblems.filter((message) => !message.includes("PostgreSQL-primary proof is unavailable; local compatibility write is blocked"));
    assert(!unexpectedConsoleProblems.length, `Console problems: ${unexpectedConsoleProblems.slice(0, 5).join("; ")}`);

    console.log("Timesheet Functional QA OK");
    console.log(JSON.stringify({
      employees: initial.employeeCount,
      departmentRows: initial.departmentRows,
      dayButtonCount: initial.dayButtonCount,
      firstDayButtonRect: initial.firstDayButtonRect,
      editedCell: reflected.cellText,
      editedSchedule: reflected.scheduleText,
    }, null, 2));
  } finally {
    await cleanupChrome(chrome);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
