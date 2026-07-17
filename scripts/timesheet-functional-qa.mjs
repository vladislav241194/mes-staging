import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getProductionStructureEmployees } from "../src/production_structure_service.js";

const defaultUrl = new URL("/?module=timesheet&qa=timesheet-functional&qa-auth-bypass=1", process.env.MES_QA_URL || "http://localhost:4174/").toString();
const UI_STORAGE_KEY = "mes-planning-prototype-ui-v1";
const SYSTEM_DOMAINS_STORAGE_KEY = "mes-planning-prototype-system-domains-v1";

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
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: "sessionStorage.setItem('mes-planning-prototype-shared-disabled-until-v1', String(Date.now() + 60 * 60 * 1000));",
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

    const editedAttendance = await evaluate(client, async ({ employeeId, dateKey, uiStorageKey, systemDomainsStorageKey }) => {
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
      const domains = JSON.parse(localStorage.getItem(systemDomainsStorageKey) || "{}");
      return {
        opened: true,
        formsSeparated: Boolean(scheduleForm && !form.querySelector("[name='scheduleCode']") && !scheduleForm.querySelector("[name='value']")),
        legacyCellOverride: ui.timesheetCellOverrides?.[`${employeeId}::${dateKey}`] || null,
        attendanceEvent: (domains.registries?.attendanceEvents || []).find((event) => event.employeeId === employeeId && event.date === dateKey) || null,
      };
    }, {
      employeeId: initial.firstEmployeeId,
      dateKey: initial.firstDateKey,
      uiStorageKey: UI_STORAGE_KEY,
      systemDomainsStorageKey: SYSTEM_DOMAINS_STORAGE_KEY,
    });
    await delay(700);

    assert(editedAttendance.opened, "Timesheet editor modal did not open.");
    assert(editedAttendance.formsSeparated, "Attendance fact and permanent schedule are not separated into independent forms.");
    assert(editedAttendance.attendanceEvent?.type === "sick", `Canonical sick attendance event was not saved: ${JSON.stringify(editedAttendance.attendanceEvent)}`);
    assert(!editedAttendance.legacyCellOverride, "Attendance save wrote back to legacy timesheetCellOverrides.");

    const editedSchedule = await evaluate(client, async ({ employeeId, dateKey, uiStorageKey, systemDomainsStorageKey }) => {
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
      const domains = JSON.parse(localStorage.getItem(systemDomainsStorageKey) || "{}");
      const scheduleAssignment = (domains.registries?.scheduleAssignments || []).find((assignment) => (
        assignment.employeeId === employeeId && assignment.validFrom === dateKey
      )) || null;
      return {
        opened: true,
        legacyScheduleOverride: ui.timesheetScheduleOverrides?.[employeeId] || null,
        scheduleAssignment,
        scheduleTemplate: (domains.registries?.scheduleTemplates || []).find((template) => template.id === scheduleAssignment?.scheduleTemplateId) || null,
      };
    }, {
      employeeId: initial.firstEmployeeId,
      dateKey: initial.firstDateKey,
      uiStorageKey: UI_STORAGE_KEY,
      systemDomainsStorageKey: SYSTEM_DOMAINS_STORAGE_KEY,
    });
    await delay(700);

    assert(editedSchedule.opened, "Independent schedule editor did not open.");
    assert(editedSchedule.scheduleTemplate?.code === "2/2", `Canonical 2/2 assignment was not saved: ${JSON.stringify(editedSchedule)}`);
    assert(Number(editedSchedule.scheduleAssignment?.patternOffset) === 2, "Canonical schedule cycle offset was not saved.");
    assert(!editedSchedule.legacyScheduleOverride, "Schedule save wrote back to legacy timesheetScheduleOverrides.");

    const reflected = await evaluate(client, ({ employeeId, dateKey, systemDomainsStorageKey }) => {
      const cell = document.querySelector(`[data-timesheet-cell][data-timesheet-employee-id="${CSS.escape(employeeId)}"][data-timesheet-date="${CSS.escape(dateKey)}"]`);
      const schedule = document.querySelector(`[data-timesheet-schedule-button][data-timesheet-employee-id="${CSS.escape(employeeId)}"]`);
      const domains = JSON.parse(localStorage.getItem(systemDomainsStorageKey) || "{}");
      return {
        cellValue: cell?.dataset.timesheetValue || "",
        cellAvailability: cell?.dataset.timesheetAvailability || "",
        cellText: cell?.textContent?.trim().replace(/\s+/g, " ") || "",
        scheduleText: schedule?.textContent?.trim().replace(/\s+/g, " ") || "",
        editorStillOpen: Boolean(document.querySelector("[data-timesheet-editor-form]")),
        attendanceEvents: (domains.registries?.attendanceEvents || []).filter((event) => event.employeeId === employeeId && event.date === dateKey),
      };
    }, { employeeId: initial.firstEmployeeId, dateKey: initial.firstDateKey, systemDomainsStorageKey: SYSTEM_DOMAINS_STORAGE_KEY });

    assert(!reflected.editorStillOpen, "Timesheet editor stayed open after save.");
    assert(reflected.cellValue === "sick", `Timesheet cell did not reflect saved state: ${JSON.stringify(reflected)}`);
    assert(reflected.cellText.includes("Б/л"), `Timesheet sick cell text is missing: ${reflected.cellText}`);
    assert(reflected.scheduleText.includes("2/2") && reflected.scheduleText.includes("08:00-20:00"), `Timesheet schedule did not reflect canonical template: ${reflected.scheduleText}`);
    assert(!consoleProblems.length, `Console problems: ${consoleProblems.slice(0, 5).join("; ")}`);

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
