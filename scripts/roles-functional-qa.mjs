import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const defaultUrl = new URL("/?module=roles&qa-auth-bypass=1&qa=roles-functional", process.env.MES_QA_URL || "http://localhost:4174/").toString();
const uiStorageKey = "mes-planning-prototype-ui-v1";
const planningStorageKey = "mes-planning-prototype-state-v2";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.onMessage(event));
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    if (!message.id || !this.pending.has(message.id)) return;
    const { resolve, reject } = this.pending.get(message.id);
    this.pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || "CDP error"));
    else resolve(message.result);
  }

  async send(method, params = {}, timeoutMs = 15000) {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
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

async function evaluate(client, pageFunction, arg, timeoutMs = 45000) {
  const source = typeof pageFunction === "function" ? pageFunction.toString() : pageFunction;
  const expression = arg === undefined ? `(${source})()` : `(${source})(${JSON.stringify(arg)})`;
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, timeoutMs);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

async function launchChrome() {
  const chromePath = await findChrome();
  const port = await getFreePort();
  const profileDir = await mkdtemp(join(tmpdir(), "mes-roles-functional-"));
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

async function waitForRolesPage(client) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12000) {
    const ok = await evaluate(client, () => document.querySelector("main.app-shell")?.dataset.layoutPage === "roles");
    if (ok) return;
    await delay(120);
  }
  throw new Error("Roles page did not render.");
}

async function navigate(client, url) {
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Page.navigate", { url });
  await delay(700);
  await waitForRolesPage(client);
}

async function resetRolesUiState(client) {
  await evaluate(client, (payload) => {
    sessionStorage.setItem("mes-planning-prototype-shared-disabled-until-v1", String(Date.now() + 5 * 60 * 1000));
    if (!localStorage.getItem(payload.planningStorageKey)) {
      localStorage.setItem(payload.planningStorageKey, JSON.stringify({
        version: 1,
        projects: [],
        workCenters: [],
        routes: [],
        routeSteps: [],
        slots: [],
        shiftMasterAssignments: {},
        dispatchFacts: {},
        planningCorrections: {},
      }));
    }
    const state = JSON.parse(localStorage.getItem(payload.uiStorageKey) || "{}");
    state.activeRole = "admin";
    state.activeModule = "roles";
    state.accessRoleProfiles = [];
    state.accessRoleAssignments = {};
    state.accessRolesSelectedRoleId = "admin";
    localStorage.setItem(payload.uiStorageKey, JSON.stringify(state));
    window.location.reload();
  }, { uiStorageKey, planningStorageKey });
  await delay(800);
  await waitForRolesPage(client);
}

async function runRolesScenario(client) {
  const result = await evaluate(client, (storageKey) => {
    const event = (name) => new Event(name, { bubbles: true, cancelable: true });
    const masterButton = document.querySelector('[data-access-role-select="master"]');
    if (!masterButton) return { error: "master role button missing" };
    masterButton.click();
    const captionField = document.querySelector('[data-access-role-field="master"][data-access-role-field-name="caption"]');
    if (!captionField) return { error: "master caption field missing" };
    captionField.value = "QA: распределение смены";
    captionField.dispatchEvent(event("change"));
    const rolesViewToggle = document.querySelector('[data-access-role-id="master"][data-access-module-id="roles"][data-access-action-id="view"]');
    if (!rolesViewToggle) return { error: "master roles/view toggle missing" };
    rolesViewToggle.checked = true;
    rolesViewToggle.dispatchEvent(event("change"));
    const assignmentSelect = Array.from(document.querySelectorAll("[data-access-role-assignment]"))
      .find((field) => Array.from(field.options || []).some((option) => option.value === "master"));
    if (!assignmentSelect) return { error: "role assignment select missing" };
    assignmentSelect.value = "master";
    assignmentSelect.dispatchEvent(event("change"));
    const employeeId = assignmentSelect.dataset.accessRoleAssignment || "";
    const state = JSON.parse(localStorage.getItem(storageKey) || "{}");
    const masterRole = (state.accessRoleProfiles || []).find((role) => role.id === "master") || {};
    return {
      pageId: document.querySelector("main.app-shell")?.dataset.layoutPage || "",
      employeeId,
      selectedRole: state.accessRolesSelectedRoleId || "",
      caption: masterRole.caption || "",
      rolesView: Boolean(masterRole.modulePermissions?.roles?.view),
      assignment: state.accessRoleAssignments?.[employeeId] || "",
    };
  }, uiStorageKey);
  assert(!result.error, result.error || "Roles scenario failed.");
  assert(result.pageId === "roles", `Expected roles page, got ${result.pageId}`);
  assert(result.selectedRole === "master", `Expected selected master role, got ${result.selectedRole}`);
  assert(result.caption === "QA: распределение смены", "Master role caption was not persisted.");
  assert(result.rolesView, "Master role roles/view permission was not persisted.");
  assert(result.employeeId && result.assignment === "master", "Employee role assignment was not persisted.");
  return result;
}

async function reloadAndReadState(client, employeeId) {
  await evaluate(client, () => {
    sessionStorage.setItem("mes-planning-prototype-shared-disabled-until-v1", String(Date.now() + 5 * 60 * 1000));
    if (!localStorage.getItem("mes-planning-prototype-state-v2")) {
      localStorage.setItem("mes-planning-prototype-state-v2", JSON.stringify({
        version: 1,
        projects: [],
        workCenters: [],
        routes: [],
        routeSteps: [],
        slots: [],
        shiftMasterAssignments: {},
        dispatchFacts: {},
        planningCorrections: {},
      }));
    }
    window.location.reload();
  });
  await delay(800);
  await waitForRolesPage(client);
  return evaluate(client, (payload) => {
    const state = JSON.parse(localStorage.getItem(payload.storageKey) || "{}");
    const masterRole = (state.accessRoleProfiles || []).find((role) => role.id === "master") || {};
    return {
      pageId: document.querySelector("main.app-shell")?.dataset.layoutPage || "",
      caption: masterRole.caption || "",
      rolesView: Boolean(masterRole.modulePermissions?.roles?.view),
      assignment: state.accessRoleAssignments?.[payload.employeeId] || "",
    };
  }, { storageKey: uiStorageKey, employeeId });
}

async function cleanupChrome(chrome) {
  try {
    chrome.client.close();
  } catch {
    // no-op
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

async function main() {
  const url = defaultUrl;
  const chrome = await launchChrome();
  try {
    await navigate(chrome.client, url);
    await resetRolesUiState(chrome.client);
    const scenario = await runRolesScenario(chrome.client);
    const reload = await reloadAndReadState(chrome.client, scenario.employeeId);
    assert(reload.pageId === "roles", `Expected roles page after reload, got ${reload.pageId}`);
    assert(reload.caption === scenario.caption, `Role caption did not survive reload: ${JSON.stringify({ scenario, reload })}`);
    assert(reload.rolesView === true, `Role permission did not survive reload: ${JSON.stringify({ scenario, reload })}`);
    assert(reload.assignment === "master", `Role assignment did not survive reload: ${JSON.stringify({ scenario, reload })}`);
    console.log("Roles Functional QA OK");
    console.log(JSON.stringify({ scenario, reload }, null, 2));
  } finally {
    await cleanupChrome(chrome);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
