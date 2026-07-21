import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  cleanupChrome,
  delay,
  evaluate,
  getFreePort,
  launchChrome,
  waitForCondition,
} from "./browser-cdp-qa-utils.mjs";
import { SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { PRODUCTION_STRUCTURE_MATRIX_ROWS } from "../src/production_structure_matrix_data.js";
import { executeNomenclatureCommand } from "./domain-nomenclature-command.mjs";
import { migrateLegacySystemDomains, serializeSystemDomains } from "../src/modules/system_domains/service.js";
import { NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY } from "./shared-state-endpoint.mjs";

const DIRECTORY_STORAGE_KEY = "mes-planning-prototype-directories-v2";
const STATE_STORAGE_KEY = "mes-planning-prototype-state-v2";
const UI_STORAGE_KEY = "mes-planning-prototype-ui-v1";
const AUTHENTICATED_EMPLOYEE_ID = "ROLE-D-TECH-RUKOVODITEL-TEHNOLOGICHESKOGO-NAPR-1-EMP-01";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const responseBody = (value) => Buffer.from(JSON.stringify(value)).toString("base64");
const employeeActor = Object.freeze({
  id: `employee:${AUTHENTICATED_EMPLOYEE_ID}`,
  employeeId: AUTHENTICATED_EMPLOYEE_ID,
  displayName: "Сотрудник Nomenclature permanent QA",
  personnelNumber: "QA-PERM-001",
});

function employeeSessionPayload(actor = null) {
  return actor
    ? { ok: true, authenticated: true, actor }
    : { ok: true, authenticated: false, actor: null, reason: "employee-session-required" };
}

function nomenclatureCapabilityPayload(actor = null) {
  const authenticated = Boolean(actor);
  return {
    ok: true,
    authenticated,
    actor,
    rbacRevision: 42,
    authorizationReason: authenticated ? "allowed-by-role" : "employee-session-required",
    capabilities: {
      canViewNomenclature: authenticated,
      canEditNomenclature: authenticated,
      canCreateNomenclature: authenticated,
      canDeleteNomenclature: authenticated,
      serverCommandsConfigured: true,
      serverCommandsEnabled: authenticated,
    },
  };
}

function nomenclatureTypesCapabilityPayload(actor = null, directoryRevision = 0) {
  const authenticated = Boolean(actor);
  return {
    ok: true,
    apiVersion: "v1",
    surface: "nomenclature-types",
    authenticated,
    actor,
    rbacRevision: 42,
    directoryRevision,
    authorizationReason: authenticated ? "server-commands-not-configured" : "employee-session-required",
    capabilities: {
      canViewNomenclatureTypes: authenticated,
      canEditNomenclatureTypes: authenticated,
      canCreateNomenclatureTypes: authenticated,
      canDeleteNomenclatureTypes: authenticated,
      serverCommandsConfigured: false,
      serverCommandsEnabled: false,
    },
  };
}

function createDirectoryFixture() {
  return {
    bomLists: [
      { id: "board-control", name: "Плата управления", status: "Черновик", importRows: [] },
      { id: "board-power", name: "Плата питания", status: "Черновик", importRows: [] },
    ],
    nomenclatureTypes: [
      { id: "nom-type-rea", name: "РЭА компоненты", status: "Активен" },
      { id: "nom-type-pcb", name: "Печатные платы", status: "Активен" },
      { id: "nom-type-mech", name: "Механика", status: "Активен" },
      { id: "nom-type-cable", name: "Кабели и жгуты", status: "Активен" },
    ],
    nomenclature: [
      { id: "rea-001", article: "RC0603-10K", name: "Резистор 10 кОм", type: "РЭА компоненты", unit: "шт.", package: "0603", manufacturer: "Yageo", status: "Активен" },
      { id: "rea-002", article: "MCU-STM32", name: "Микроконтроллер STM32", type: "РЭА компоненты", unit: "шт.", package: "LQFP-64", manufacturer: "ST", status: "Черновик" },
      { id: "pcb-001", article: "PCB-CONTROL-01", name: "Плата управления", type: "Печатные платы", unit: "шт.", package: "PCB", manufacturer: "—", status: "Активен" },
      { id: "mech-001", article: "CASE-AL-01", name: "Корпус алюминиевый", type: "Механика", unit: "шт.", package: "120×80", manufacturer: "MES Line", status: "Активен" },
    ],
    componentTypes: [],
    operationMap: [],
    specifications: [],
    statuses: [],
  };
}

function createSystemDomainsFixture() {
  const migrated = migrateLegacySystemDomains({
    matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS,
    legacyUi: {
      accessRoleAssignments: { [AUTHENTICATED_EMPLOYEE_ID]: "admin" },
      accessRoleProfiles: [{
        id: "admin",
        label: "Администратор",
        scope: "factory",
        defaultModule: "nomenclature",
        modulePermissions: {
          directories: { view: true, edit: true },
          nomenclature: { view: true, edit: true },
        },
      }],
    },
    migratedAt: "2026-07-21T00:00:00.000Z",
  });
  assert(migrated.report.canActivate === true, `System Domains auth fixture is not activatable: ${JSON.stringify(migrated.report)}`);
  return migrated.domains;
}

async function waitForPreview(origin, timeoutMs = 12_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${origin}/?module=nomenclature&qa-auth-bypass=1`, { cache: "no-store" });
      if (response.ok && (await response.text()).includes('id="app"')) return;
    } catch {
      // Preview is still starting.
    }
    await delay(120);
  }
  throw new Error(`Permanent Nomenclature preview did not become ready at ${origin}`);
}

async function stopProcess(child) {
  if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(resolve, 1200);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function readPersistedDirectory(sharedStateFile) {
  const persisted = JSON.parse(await readFile(sharedStateFile, "utf8"));
  return {
    persisted,
    directory: JSON.parse(persisted.values?.[DIRECTORY_STORAGE_KEY] || "{}"),
  };
}

async function waitForPersistedDirectory(sharedStateFile, predicate, message, timeoutMs = 15_000) {
  const startedAt = Date.now();
  let latest = null;
  while (Date.now() - startedAt < timeoutMs) {
    latest = await readPersistedDirectory(sharedStateFile);
    if (predicate(latest.directory, latest.persisted)) return latest;
    await delay(120);
  }
  throw new Error(`${message}: ${JSON.stringify(latest?.directory?.nomenclature || [])}`);
}

async function executeExternalNomenclatureCommand({
  sharedStateFile,
  backupDir,
  auditLogPath,
  kind,
  row = null,
  expectedRow = null,
  expectedRevision,
  action,
}) {
  const itemId = String(row?.id || expectedRow?.id || "");
  const result = await executeNomenclatureCommand({
    kind,
    itemId,
    row,
    expectedRow,
    expectedRevision,
    idempotencyKey: `external:${action}`,
  }, {
    env: {
      APP_ENV: "local",
      MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "1",
      MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: "0",
    },
    filePath: sharedStateFile,
    backupDir,
    auditLogPath,
    authorization: {
      allowed: true,
      revision: 43,
      decision: { reason: "current-rbac-grant", roleId: "external-technologist", source: "system-domains" },
      principal: {
        id: "employee:nomenclature-external-writer-qa",
        employeeId: "nomenclature-external-writer-qa",
        displayName: "Nomenclature external writer QA",
        personnelNumber: "QA-EXT-001",
        publicPrincipalId: "public:nomenclature-permanent-qa",
        scope: "employee",
      },
    },
  });
  assert(result.ok === true, `External Nomenclature command failed: ${JSON.stringify(result)}`);
  return result;
}

async function fillEditor(client, values) {
  await evaluate(client, (input) => {
    const form = document.querySelector(".react-nomenclature-editor");
    if (!form) throw new Error("Nomenclature editor is not open");
    const setValue = (name, value) => {
      const control = form.elements.namedItem(name);
      if (!control) throw new Error(`Missing Nomenclature editor field: ${name}`);
      const prototype = control instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : control instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(control, value);
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
    };
    Object.entries(input).forEach(([name, value]) => setValue(name, value));
  }, values);
}

async function submitEditor(client) {
  await evaluate(client, () => document.querySelector(".react-nomenclature-editor")?.requestSubmit());
}

async function main() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-nomenclature-permanent-"));
  const sharedStateFile = join(temporaryRoot, "shared-state.json");
  const commandBackupDir = join(temporaryRoot, "command-backups");
  const commandAuditLog = join(temporaryRoot, "command-audit.jsonl");
  const policyFile = join(temporaryRoot, "nomenclature-permanent-policy.json");
  const fixture = createDirectoryFixture();
  const systemDomainsFixture = createSystemDomainsFixture();
  const snapshot = {
    version: 1,
    updatedAt: "2026-07-21T00:00:00.000Z",
    updatedBy: { actor: "nomenclature-permanent-functional-qa" },
    values: {
      [STATE_STORAGE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
      [DIRECTORY_STORAGE_KEY]: JSON.stringify(fixture),
      [SYSTEM_DOMAINS_STORAGE_KEY]: serializeSystemDomains(systemDomainsFixture),
    },
    sharedUi: {},
    events: [],
  };
  await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
  assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary shared-state file must remain owner-readable only");
  const releasePolicy = JSON.parse(await readFile(join(process.cwd(), "react-runtime-policy.json"), "utf8"));
  await writeFile(policyFile, `${JSON.stringify({
    ...releasePolicy,
    policyId: "qa-nomenclature-permanent",
    surfaces: { ...releasePolicy.surfaces, nomenclature: "react", boards: "legacy" },
  }, null, 2)}\n`, { mode: 0o600 });

  const port = await getFreePort();
  const origin = `http://127.0.0.1:${port}`;
  let previewOutput = "";
  const preview = spawn(process.execPath, ["scripts/preview-dist.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      APP_ENV: "local",
      MES_ADMIN_HOSTS: "admin.mes-line.ru",
      MES_SHARED_STATE_FILE: sharedStateFile,
      MES_REACT_RUNTIME_POLICY_PATH: policyFile,
      MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "1",
      MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: "0",
      MES_ENABLE_EMPLOYEE_AUTH: "1",
      MES_EMPLOYEE_AUTH_SESSION_SECRET: "nomenclature-permanent-browser-qa-session-secret",
      MES_EMPLOYEE_AUTH_HOSTS: "127.0.0.1",
      MES_REQUIRE_EMPLOYEE_AUTH_GATE: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  preview.stdout.on("data", (chunk) => { previewOutput += chunk.toString(); });
  preview.stderr.on("data", (chunk) => { previewOutput += chunk.toString(); });

  let chrome = null;
  const consoleProblems = [];
  const expectedFailureConsole = [];
  const pendingDirectoryReads = [];
  let readMode = "success";
  let writeMode = "success";
  let directoryReads = 0;
  let metadataReads = 0;
  let sharedStateWrites = 0;
  let employeeSessionReads = 0;
  let nomenclatureCapabilityReads = 0;
  let nomenclatureTypesCapabilityReads = 0;
  let serverCommandAttempts = 0;
  let serverCommandFailures = 0;
  let signedSessionActor = null;
  const sharedStateReadSummaries = [];
  const sharedStateWriteSummaries = [];
  const serverCommandSummaries = [];

  try {
    await waitForPreview(origin);
    chrome = await launchChrome("mes-nomenclature-permanent-qa-");
    const { client } = chrome;
    const fulfill = (requestId, payload, responseCode = 200, extraHeaders = []) => client.send("Fetch.fulfillRequest", {
      requestId,
      responseCode,
      responseHeaders: [
        { name: "Content-Type", value: "application/json; charset=utf-8" },
        { name: "Cache-Control", value: "no-store" },
        ...extraHeaders,
      ],
      body: responseBody(payload),
    }).catch((error) => consoleProblems.push(error.message));
    const continueRequest = (requestId) => client.send("Fetch.continueRequest", { requestId }).catch((error) => consoleProblems.push(error.message));
    const serverCommandEnv = {
      APP_ENV: "local",
      MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "1",
      MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: "0",
    };
    const commandAuthorization = {
      allowed: true,
      revision: 42,
      decision: { reason: "current-rbac-grant", roleId: "admin", source: "system-domains" },
      principal: { ...employeeActor, publicPrincipalId: "public:nomenclature-permanent-qa", scope: "employee" },
    };

    client.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) {
        const text = (message.params.args || []).map((arg) => arg.value || arg.description || "").join(" ");
        if (text.startsWith("[MES] Reconciled critical directory entities before save.")) return;
        if (/Deferred shared-state values are not available|Shared state (?:save|push) failed|shared-state request failed/i.test(text)) expectedFailureConsole.push(text);
        else consoleProblems.push(text);
      }
      if (message.method !== "Fetch.requestPaused") return;
      void (async () => {
        const { requestId, request } = message.params;
        const requestUrl = new URL(request.url);
        const method = String(request.method || "GET").toUpperCase();
        const headers = Object.fromEntries(Object.entries(request.headers || {}).map(([name, value]) => [name.toLowerCase(), String(value)]));

        if (requestUrl.pathname === "/api/v1/auth/employee-session") {
          if (method === "GET") {
            employeeSessionReads += 1;
            await fulfill(requestId, employeeSessionPayload(signedSessionActor));
            return;
          }
          if (method === "DELETE") {
            signedSessionActor = null;
            await fulfill(requestId, employeeSessionPayload());
            return;
          }
        }

        if (requestUrl.pathname === "/api/v1/nomenclature/capabilities" && method === "GET") {
          nomenclatureCapabilityReads += 1;
          await fulfill(requestId, nomenclatureCapabilityPayload(signedSessionActor));
          return;
        }

        if (requestUrl.pathname === "/api/v1/directory/nomenclature-types/capabilities" && method === "GET") {
          nomenclatureTypesCapabilityReads += 1;
          const persisted = await readPersistedDirectory(sharedStateFile);
          await fulfill(requestId, nomenclatureTypesCapabilityPayload(signedSessionActor, Number(persisted.persisted.version || 0)));
          return;
        }

        const commandBase = requestUrl.pathname === "/api/v1/nomenclature";
        const commandItemPath = requestUrl.pathname.startsWith("/api/v1/nomenclature/")
          && requestUrl.pathname !== "/api/v1/nomenclature/capabilities";
        const commandKind = commandBase && method === "POST"
          ? "create"
          : commandItemPath && method === "PATCH"
            ? "update"
            : commandItemPath && method === "DELETE"
              ? "delete"
              : "";
        if (commandKind) {
          serverCommandAttempts += 1;
          const body = JSON.parse(request.postData || "{}");
          const pathItemId = commandItemPath
            ? decodeURIComponent(requestUrl.pathname.slice("/api/v1/nomenclature/".length))
            : "";
          const itemId = String(pathItemId || body.row?.id || "");
          serverCommandSummaries.push({
            kind: commandKind,
            itemId,
            expectedRevision: Number(body.expectedRevision || 0),
            hasIfMatch: Boolean(headers["if-match"]),
            hasIdempotencyKey: Boolean(headers["idempotency-key"]),
          });
          if (!signedSessionActor) {
            serverCommandFailures += 1;
            await fulfill(requestId, { ok: false, apiVersion: "v1", code: "employee-principal-required", error: "Signed employee session is required" }, 401);
            return;
          }
          if (writeMode === "error") {
            serverCommandFailures += 1;
            await fulfill(requestId, { ok: false, apiVersion: "v1", code: "qa-nomenclature-command-unavailable", error: "qa-nomenclature-command-unavailable" }, 503);
            return;
          }
          const result = await executeNomenclatureCommand({
            kind: commandKind,
            itemId,
            expectedRevision: body.expectedRevision,
            idempotencyKey: headers["idempotency-key"],
            row: body.row,
            expectedRow: body.expectedRow,
          }, {
            env: serverCommandEnv,
            filePath: sharedStateFile,
            backupDir: commandBackupDir,
            auditLogPath: commandAuditLog,
            authorization: commandAuthorization,
          });
          const statusCode = Number(result.statusCode || (result.ok === true ? 200 : 500));
          const payload = { apiVersion: "v1", ...result };
          delete payload.statusCode;
          if (result.ok !== true) serverCommandFailures += 1;
          const responseHeaders = Number.isSafeInteger(result.revision)
            ? [{ name: "ETag", value: `"${result.revision}"` }]
            : [];
          await fulfill(requestId, payload, statusCode, responseHeaders);
          return;
        }

        if (requestUrl.pathname !== "/api/shared-state") {
          await continueRequest(requestId);
          return;
        }

        const requestedKeys = headers["x-mes-shared-state-keys"] || "";
        const isDirectoryRead = method === "GET" && requestedKeys.split(",").map((value) => value.trim()).includes(DIRECTORY_STORAGE_KEY);
        if (method === "GET") {
          if (requestedKeys === "__none__") metadataReads += 1;
          sharedStateReadSummaries.push({
            requestedKeys,
            knownVersion: Number(headers["x-mes-shared-state-version"] || 0),
            referer: String(headers.referer || ""),
          });
        }
        if (isDirectoryRead) {
          directoryReads += 1;
          if (readMode === "hold") {
            pendingDirectoryReads.push(requestId);
            return;
          }
          if (readMode === "error") {
            await fulfill(requestId, { ok: false, error: "qa-nomenclature-read-unavailable" }, 503);
            return;
          }
        }
        if (method !== "GET") {
          sharedStateWrites += 1;
          try {
            const payload = JSON.parse(request.postData || "{}");
            sharedStateWriteSummaries.push({
              action: String(payload.action || ""),
              baseVersion: Number(payload.baseVersion || 0),
              valueKeys: Object.keys(payload.values || {}),
            });
          } catch {
            sharedStateWriteSummaries.push({ action: "unparseable", baseVersion: 0, valueKeys: [] });
          }
        }
        await continueRequest(requestId);
      })().catch((error) => {
        consoleProblems.push(error?.stack || error?.message || String(error));
        void client.send("Fetch.failRequest", { requestId: message.params.requestId, errorReason: "Failed" }).catch(() => {});
      });
    });

    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        window.__MES_QA_REACT_TELEMETRY__=[];
        window.__MES_QA_SHARED_RESPONSES__=[];
        window.addEventListener("mes:react-island-telemetry",(event)=>window.__MES_QA_REACT_TELEMETRY__.push(event.detail));
        const qaFetch = window.fetch.bind(window);
        window.fetch = async (...args) => {
          const response = await qaFetch(...args);
          const url = String(args[0]?.url || args[0] || "");
          if (url.includes("/api/shared-state")) {
            response.clone().json().then((payload) => window.__MES_QA_SHARED_RESPONSES__.push({
              method: String(args[1]?.method || "GET"),
              requestedKeys: String(args[1]?.headers?.["X-MES-Shared-State-Keys"] || ""),
              knownVersion: Number(args[1]?.headers?.["X-MES-Shared-State-Version"] || 0),
              version: Number(payload?.version || payload?.current?.version || 0),
              unchanged: payload?.unchanged === true,
              configured: payload?.configured !== false,
              valueKeys: Object.keys(payload?.values || payload?.current?.values || {}),
            })).catch(() => {});
          }
          return response;
        };
      `,
    });
    await client.send("Fetch.enable", { patterns: [
      { urlPattern: "*api/shared-state*", requestStage: "Request" },
      { urlPattern: "*api/v1/auth/employee-session*", requestStage: "Request" },
      { urlPattern: "*api/v1/nomenclature*", requestStage: "Request" },
      { urlPattern: "*api/v1/directory/nomenclature-types/capabilities*", requestStage: "Request" },
    ] });
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });

    readMode = "hold";
    await client.send("Page.navigate", { url: `${origin}/?module=nomenclature&qa-auth-bypass=1` });
    await waitForCondition(client, () => Boolean(
      document.querySelector('[data-react-nomenclature-island][data-react-island-runtime-mode="react"][data-react-island-state="loading"] [role="status"]'),
    ) && !document.querySelector("[data-nomenclature-row-open]"), {
      message: "permanent Nomenclature did not own the route while its durable projection was pending",
      timeoutMs: 20_000,
    });
    for (let attempt = 0; attempt < 100 && !pendingDirectoryReads.length; attempt += 1) await delay(50);
    assert(pendingDirectoryReads.length >= 1, "permanent Nomenclature did not request its targeted directory projection");
    const loadingTelemetry = await evaluate(client, () => window.__MES_QA_REACT_TELEMETRY__ || []);
    assert(loadingTelemetry.filter((item) => item.surfaceId === "nomenclature" && item.runtimeMode === "react" && item.state === "loading" && item.stage === "read").length === 1, `Nomenclature loading telemetry must be bounded: ${JSON.stringify(loadingTelemetry)}`);
    readMode = "success";
    while (pendingDirectoryReads.length) await continueRequest(pendingDirectoryReads.shift());
    await waitForCondition(client, () => (
      Boolean(document.querySelector('[data-react-nomenclature-island][data-react-island-runtime-mode="react"][data-react-island-state="ready"]'))
      && document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 4
    ), { message: "permanent Nomenclature did not become ready after durable shared-state hydration", timeoutMs: 20_000 });

    const initial = await evaluate(client, () => {
      const target = document.querySelector("[data-react-nomenclature-island]");
      const createButton = [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent.includes("Добавить позицию"));
      return {
        runtimeMode: target?.dataset.reactIslandRuntimeMode || "",
        state: target?.dataset.reactIslandState || "",
        revision: target?.dataset.reactIslandRevision || "",
        commitMs: Number(target?.dataset.reactIslandCommitMs),
        ariaBusy: target?.getAttribute("aria-busy") || "",
        headers: [...document.querySelectorAll("table thead th")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()),
        rows: [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim())),
        createDisabled: createButton?.disabled !== false,
        legacyRows: document.querySelectorAll("[data-nomenclature-row-open]").length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    assert(
      initial.runtimeMode === "react"
        && initial.state === "ready"
        && Number.isSafeInteger(Number(initial.revision))
        && Number(initial.revision) >= 1,
      `permanent Nomenclature runtime marker failed: ${JSON.stringify(initial)}`,
    );
    assert(Number.isFinite(initial.commitMs) && initial.commitMs < 2000 && initial.ariaBusy === "false", `permanent Nomenclature commit/accessibility gate failed: ${JSON.stringify(initial)}`);
    assert(JSON.stringify(initial.headers) === JSON.stringify(["Наименование", "Артикул", "Раздел", "Корпус", "Ед.", "Производитель", "Статус"]), `Nomenclature columns changed: ${JSON.stringify(initial.headers)}`);
    assert(initial.rows.length === 4 && initial.rows.every((row) => row.length === 7) && initial.rows[0][0] === "Резистор 10 кОм", "permanent Nomenclature lost the exact four-row fixture order");
    assert(initial.createDisabled, "default-role QA bypass must not enable permanent writes without an authenticated employee");
    assert(initial.legacyRows === 0 && !initial.overflow, "permanent Nomenclature exposed legacy rows or page-level overflow");
    const readyTelemetry = await evaluate(client, () => window.__MES_QA_REACT_TELEMETRY__ || []);
    assert(readyTelemetry.some((item) => item.surfaceId === "nomenclature" && item.runtimeMode === "react" && item.state === "ready" && item.stage === "commit" && item.policyId === "qa-nomenclature-permanent"), `permanent Nomenclature ready telemetry is missing: ${JSON.stringify(readyTelemetry)}`);

    const externalRow = { id: "nom-external-refresh", article: "QA-EXTERNAL-REFRESH", name: "Внешнее обновление второго клиента", type: "Механика", unit: "шт.", status: "Активен" };
    const beforeExternal = await readPersistedDirectory(sharedStateFile);
    await executeExternalNomenclatureCommand({
      sharedStateFile,
      backupDir: commandBackupDir,
      auditLogPath: commandAuditLog,
      kind: "create",
      row: externalRow,
      expectedRevision: beforeExternal.persisted.version,
      action: "nomenclature-external-writer-add",
    });
    await evaluate(client, () => window.dispatchEvent(new Event("focus")));
    await waitForCondition(client, () => (
      document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 5
      && [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].some((row) => row.textContent.includes("QA-EXTERNAL-REFRESH"))
    ), { message: "active permanent Nomenclature did not refresh after a second client advanced the shared-state version", timeoutMs: 20_000 });
    const afterExternal = await readPersistedDirectory(sharedStateFile);
    await executeExternalNomenclatureCommand({
      sharedStateFile,
      backupDir: commandBackupDir,
      auditLogPath: commandAuditLog,
      kind: "delete",
      expectedRow: afterExternal.directory.nomenclature.find((item) => item.id === externalRow.id),
      expectedRevision: afterExternal.persisted.version,
      action: "nomenclature-external-writer-cleanup",
    });
    await evaluate(client, () => window.dispatchEvent(new Event("focus")));
    await waitForCondition(client, () => (
      document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 4
      && !document.body.textContent.includes("QA-EXTERNAL-REFRESH")
    ), { message: "active permanent Nomenclature did not remove the external row after the next version watermark", timeoutMs: 20_000 });

    // Install the local half of the employee identity before each following
    // document starts. The harness exposes the matching signed HttpOnly
    // session separately through the intercepted server-session contract.
    // Writing localStorage in the old page immediately before navigation is
    // insufficient: its beforeunload handler persists the old logged-out state.
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        (() => {
          const employeeId = ${JSON.stringify(AUTHENTICATED_EMPLOYEE_ID)};
          const now = new Date();
          const dateKey = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
          const expiresAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
          localStorage.setItem("mes-planning-prototype-auth-session-v1", JSON.stringify({ unlocked: true, userId: employeeId, roleId: "admin", dateKey, expiresAt }));
          const ui = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
          localStorage.setItem("mes-planning-prototype-ui-v1", JSON.stringify({
            ...ui,
            authGateUnlocked: true,
            authCurrentUserId: employeeId,
            activeRole: "admin",
            accessRoleAssignments: { ...(ui.accessRoleAssignments || {}), [employeeId]: "admin" },
          }));
        })();
      `,
    });

    const employeeSessionReadsBeforeSignedReload = employeeSessionReads;
    const capabilityReadsBeforeSignedReload = nomenclatureCapabilityReads;
    signedSessionActor = employeeActor;
    await client.send("Page.navigate", {
      url: `${origin}/?module=nomenclature&qa-auth-bypass=1&react-nomenclature-evaluation=0&react-nomenclature=0&react-nomenclature-readonly=0&react-nomenclature-write=0&react-nomenclature-mode=legacy`,
    });
    await waitForCondition(client, () => (
      Boolean(document.querySelector('[data-react-nomenclature-island][data-react-island-runtime-mode="react"][data-react-island-state="ready"]'))
      && document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 4
      && [...document.querySelectorAll('[data-ui-component="ActionButton"]')]
        .some((button) => button.textContent.includes("Добавить позицию") && button.disabled === false)
    ), {
      message: "signed employee session plus command-owner capability did not enable permanent Nomenclature",
      timeoutMs: 20_000,
    });
    assert(await evaluate(client, () => !document.querySelector("[data-nomenclature-row-open]")), "query isolation exposed normal legacy Nomenclature");
    assert(employeeSessionReads > employeeSessionReadsBeforeSignedReload, "permanent reload did not reconcile the mocked signed employee session");
    assert(nomenclatureCapabilityReads > capabilityReadsBeforeSignedReload, "permanent reload did not obtain command-owner capabilities for the signed employee");

    await evaluate(client, (storageKey) => {
      const persisted = JSON.parse(localStorage.getItem(storageKey) || "{}");
      localStorage.setItem(storageKey, JSON.stringify({
        ...persisted,
        activeModule: "nomenclature",
        activeNomenclaturePane: "items",
      }));
    }, UI_STORAGE_KEY);
    await client.send("Page.navigate", { url: `${origin}/?module=bomLists&qa-auth-bypass=1&qa-reload=boards-from-persisted-items` });
    await waitForCondition(client, (storageKey) => {
      const persisted = JSON.parse(localStorage.getItem(storageKey) || "{}");
      return new URL(location.href).searchParams.get("module") === "bomLists"
        && persisted.activeModule === "nomenclature"
        && persisted.activeNomenclaturePane === "boards"
        && document.querySelectorAll(".bom-lists-page.is-boards-pane").length === 1;
    }, { arg: UI_STORAGE_KEY, message: "canonical Boards reload did not override a persisted Nomenclature items pane", timeoutMs: 20_000 });

    await evaluate(client, (storageKey) => {
      const persisted = JSON.parse(localStorage.getItem(storageKey) || "{}");
      localStorage.setItem(storageKey, JSON.stringify({
        ...persisted,
        activeModule: "nomenclature",
        activeNomenclaturePane: "boards",
      }));
    }, UI_STORAGE_KEY);
    await client.send("Page.navigate", { url: `${origin}/?module=nomenclature&qa-auth-bypass=1&qa-reload=items-from-persisted-boards` });
    await waitForCondition(client, (storageKey) => {
      const persisted = JSON.parse(localStorage.getItem(storageKey) || "{}");
      return new URL(location.href).searchParams.get("module") === "nomenclature"
        && persisted.activeModule === "nomenclature"
        && persisted.activeNomenclaturePane === "items"
        && Boolean(document.querySelector('[data-react-nomenclature-island][data-react-island-state="ready"]'))
        && document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 4;
    }, { arg: UI_STORAGE_KEY, message: "canonical Nomenclature reload did not override a persisted Boards pane", timeoutMs: 20_000 });

    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')]
      .find((item) => item.textContent.includes("Печатные платы"))?.click());
    await waitForCondition(client, () => (
      !document.querySelector("[data-react-nomenclature-island]")
      && document.querySelectorAll(".bom-lists-page.is-boards-pane").length === 1
      && document.querySelectorAll("[data-bom-open]").length === 2
    ), { message: "Nomenclature did not navigate to the separately governed Boards surface", timeoutMs: 20_000 });
    const boardsNavigation = await evaluate(client, () => ({
      module: new URL(location.href).searchParams.get("module"),
      telemetry: window.__MES_QA_REACT_TELEMETRY__ || [],
      boardsPanes: document.querySelectorAll(".bom-lists-page.is-boards-pane").length,
    }));
    assert(boardsNavigation.module === "bomLists" && boardsNavigation.boardsPanes === 1, `Boards navigation did not keep its canonical route: ${JSON.stringify(boardsNavigation)}`);
    assert(!boardsNavigation.telemetry.some((item) => item.surfaceId === "nomenclature" && ["legacy-fallback", "error"].includes(item.state)), "ordinary Boards navigation was incorrectly reported as Nomenclature fallback/error");
    await waitForCondition(client, () => {
      const ready = new URL(location.href).searchParams.get("module") === "nomenclature"
        && Boolean(document.querySelector('[data-react-nomenclature-island][data-react-island-state="ready"]'))
        && document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 4;
      if (ready) return true;
      // The legacy Boards event owner is lazy-loaded. Repeat the user intent
      // until that owner binds, then require the canonical URL and React root.
      document.querySelector('[data-nomenclature-type-filter="all"]')?.click();
      return false;
    }, { message: "Boards did not navigate back to permanent Nomenclature", timeoutMs: 20_000 });

    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')]
      .find((button) => button.textContent.trim() === "Редактировать")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-editor")), { message: "same-row conflict editor did not open" });
    const conflictBaseline = await readPersistedDirectory(sharedStateFile);
    const remotelyChangedRow = {
      ...conflictBaseline.directory.nomenclature[0],
      name: "Изменена вторым клиентом при открытом редакторе",
      updatedAt: "2026-07-21T02:00:00.000Z",
    };
    await executeExternalNomenclatureCommand({
      sharedStateFile,
      backupDir: commandBackupDir,
      auditLogPath: commandAuditLog,
      kind: "update",
      row: remotelyChangedRow,
      expectedRow: conflictBaseline.directory.nomenclature[0],
      expectedRevision: conflictBaseline.persisted.version,
      action: "nomenclature-external-same-row-update",
    });
    await evaluate(client, () => window.dispatchEvent(new Event("focus")));
    await waitForCondition(client, () => (
      Boolean(document.querySelector(".react-nomenclature-editor"))
      && [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].some((row) => row.textContent.includes("Изменена вторым клиентом"))
    ), { message: "open editor did not receive the external same-row projection refresh", timeoutMs: 20_000 });
    await fillEditor(client, { name: "Локальная устаревшая правка не должна победить" });
    const commandsBeforeSameRowConflict = serverCommandAttempts;
    const failuresBeforeSameRowConflict = serverCommandFailures;
    await submitEditor(client);
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-command-error")?.textContent.trim()), {
      message: "server owner did not reject the stale open-editor baseline after an external same-row update",
      timeoutMs: 20_000,
    });
    const sameRowConflictMessage = await evaluate(client, () => document.querySelector(".react-nomenclature-command-error")?.textContent.trim() || "");
    assert(/измен/u.test(sameRowConflictMessage), `same-row conflict did not retain a user-facing stale-write explanation: ${sameRowConflictMessage}`);
    assert(serverCommandAttempts === commandsBeforeSameRowConflict + 1 && serverCommandFailures === failuresBeforeSameRowConflict + 1, "same-row conflict was not rejected by exactly one server command");
    const sameRowPreserved = await readPersistedDirectory(sharedStateFile);
    assert(sameRowPreserved.directory.nomenclature[0].name === remotelyChangedRow.name, "stale editor overwrote the external same-row update");
    await executeExternalNomenclatureCommand({
      sharedStateFile,
      backupDir: commandBackupDir,
      auditLogPath: commandAuditLog,
      kind: "update",
      row: fixture.nomenclature[0],
      expectedRow: sameRowPreserved.directory.nomenclature[0],
      expectedRevision: sameRowPreserved.persisted.version,
      action: "nomenclature-external-same-row-cleanup",
    });
    await evaluate(client, () => window.dispatchEvent(new Event("focus")));
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')]
      .find((button) => button.textContent.trim() === "Отмена")?.click());
    await waitForCondition(client, () => (
      !document.querySelector(".react-nomenclature-editor")
      && [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].some((row) => row.textContent.includes("Резистор 10 кОм"))
    ), { message: "same-row conflict cleanup did not restore the fixture", timeoutMs: 20_000 });

    const runToken = `PERMANENT-QA-${process.pid}-${Date.now()}`;
    const deniedArticle = `${runToken}-DENIED`;
    writeMode = "error";
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')]
      .find((button) => button.textContent.includes("Добавить позицию"))?.click());
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-editor")), { message: "denied-write editor did not open" });
    await fillEditor(client, {
      name: `${runToken} denied`,
      article: deniedArticle,
      type: "Механика",
      package: "QA-DENIED",
      unit: "шт.",
      manufacturer: "MES QA",
      description: "must roll back",
      status: "Активен",
    });
    await submitEditor(client);
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-command-error")) && document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 4, {
      message: "unconfirmed durable write did not fail closed and roll back its optimistic row",
      timeoutMs: 25_000,
    });
    await delay(1000);
    const deniedPersisted = await readPersistedDirectory(sharedStateFile);
    assert(!(deniedPersisted.directory.nomenclature || []).some((item) => item.article === deniedArticle), "failed durable write leaked into authoritative shared state");
    writeMode = "success";
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')]
      .find((button) => button.textContent.trim() === "Отмена")?.click());
    await waitForCondition(client, () => !document.querySelector(".react-nomenclature-editor"), { message: "failed draft did not close before fresh lifecycle" });
    await client.send("Page.navigate", { url: `${origin}/?module=nomenclature&qa-auth-bypass=1&qa-reload=after-denied-write` });
    await waitForCondition(client, () => (
      Boolean(document.querySelector('[data-react-nomenclature-island][data-react-island-state="ready"]'))
      && document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 4
    ), { message: "normal reload did not restore the authoritative four-row projection after a rejected write", timeoutMs: 20_000 });
    const deniedReload = await readPersistedDirectory(sharedStateFile);
    assert(JSON.stringify((deniedReload.directory.nomenclature || []).map((item) => item.id)) === JSON.stringify(fixture.nomenclature.map((item) => item.id)), "rejected write changed authoritative row identity/order after reload");

    const createdArticle = `${runToken}-CREATE`;
    const editedArticle = `${runToken}-EDIT`;
    const createdName = `${runToken} создана`;
    const editedName = `${runToken} изменена`;
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')]
      .find((button) => button.textContent.includes("Добавить позицию"))?.click());
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-editor")), { message: "fresh create editor did not open" });
    await fillEditor(client, {
      name: createdName,
      article: createdArticle,
      type: "Механика",
      package: "QA-CASE",
      unit: "шт.",
      manufacturer: "MES QA",
      description: `fresh disposable lifecycle ${runToken}`,
      status: "Активен",
    });
    await submitEditor(client);
    await waitForCondition(client, (article) => (
      document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 5
      && [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].some((row) => row.textContent.includes(article))
    ), { arg: createdArticle, message: "permanent create did not return the five-row projection", timeoutMs: 20_000 });
    const afterCreate = await waitForPersistedDirectory(sharedStateFile, (directory) => (directory.nomenclature || []).some((item) => item.article === createdArticle), "permanent create was not durably acknowledged");
    const createdId = String(afterCreate.directory.nomenclature.find((item) => item.article === createdArticle)?.id || "");
    assert(createdId, "durable create did not return a stable item id");

    await client.send("Page.navigate", { url: `${origin}/?module=nomenclature&qa-auth-bypass=1&qa-reload=${encodeURIComponent(runToken)}-create-readback` });
    await waitForCondition(client, (article) => Boolean(document.querySelector('[data-react-nomenclature-island][data-react-island-state="ready"]')) && [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].some((row) => row.textContent.includes(article)), {
      arg: createdArticle,
      message: "fresh create did not survive a normal permanent-route reload",
      timeoutMs: 20_000,
    });
    await evaluate(client, (article) => [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].find((row) => row.textContent.includes(article))?.click(), createdArticle);
    await waitForCondition(client, (name) => document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent === name, { arg: createdName, message: "created row did not become selected" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent.trim() === "Редактировать")?.click());
    await waitForCondition(client, (name) => document.querySelector('.react-nomenclature-editor input[name="name"]')?.value === name, { arg: createdName, message: "permanent edit editor did not open" });
    await fillEditor(client, { name: editedName, article: editedArticle });
    await submitEditor(client);
    await waitForCondition(client, (article) => [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].some((row) => row.textContent.includes(article)), { arg: editedArticle, message: "permanent edit did not update the projection", timeoutMs: 20_000 });
    await waitForPersistedDirectory(sharedStateFile, (directory) => (directory.nomenclature || []).some((item) => item.id === createdId && item.article === editedArticle && item.name === editedName), "permanent edit was not durably acknowledged");

    await client.send("Page.navigate", { url: `${origin}/?module=nomenclature&qa-auth-bypass=1&qa-reload=${encodeURIComponent(runToken)}-edit-readback` });
    await waitForCondition(client, (article) => Boolean(document.querySelector('[data-react-nomenclature-island][data-react-island-state="ready"]')) && [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].some((row) => row.textContent.includes(article)), {
      arg: editedArticle,
      message: "fresh edit did not survive a normal permanent-route reload",
      timeoutMs: 20_000,
    });
    await evaluate(client, (article) => [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].find((row) => row.textContent.includes(article))?.click(), editedArticle);
    await waitForCondition(client, (name) => document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent === name, { arg: editedName, message: "edited row did not become selected before cleanup" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent.trim() === "Редактировать")?.click());
    await waitForCondition(client, (name) => document.querySelector('.react-nomenclature-editor input[name="name"]')?.value === name, { arg: editedName, message: "edited row did not reopen before cleanup" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent.trim() === "Удалить")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('.react-nomenclature-delete-confirm[role="alertdialog"]')), { message: "cleanup confirmation did not open" });
    const confirmationText = await evaluate(client, () => document.querySelector(".react-nomenclature-delete-confirm")?.textContent.replace(/\s+/g, " ").trim() || "");
    assert(confirmationText.includes(editedName) && confirmationText.includes("0 составов изделия, 0 строк BOM"), `cleanup confirmation lost identity/usage evidence: ${confirmationText}`);
    await evaluate(client, () => [...document.querySelectorAll('.react-nomenclature-delete-confirm [data-ui-component="ActionButton"]')].find((button) => button.textContent.trim() === "Удалить")?.click());
    await waitForCondition(client, (article) => document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 4 && ![...document.querySelectorAll('[data-ui-component="SelectableRow"]')].some((row) => row.textContent.includes(article)), {
      arg: editedArticle,
      message: "cleanup did not restore the original four-row projection",
      timeoutMs: 20_000,
    });
    const cleaned = await waitForPersistedDirectory(sharedStateFile, (directory, persisted) => (
      (directory.nomenclature || []).length === 4
      && !(directory.nomenclature || []).some((item) => item.id === createdId)
      && !String(persisted.values?.[DIRECTORY_STORAGE_KEY] || "").includes(runToken)
    ), "fresh disposable lifecycle left authoritative residue");
    assert(JSON.stringify((cleaned.directory.nomenclature || []).map((item) => item.id)) === JSON.stringify(fixture.nomenclature.map((item) => item.id)), "cleanup changed original Nomenclature row identity or order");
    assert(cleaned.persisted.values?.[STATE_STORAGE_KEY] === snapshot.values[STATE_STORAGE_KEY], "Nomenclature lifecycle modified Planning state");
    const receiptLedger = JSON.parse(cleaned.persisted.values?.[NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY] || "{}");
    const lifecycleReceipts = Object.values(receiptLedger.entries || {}).filter((receipt) => receipt.itemId === createdId);
    assert(JSON.stringify(lifecycleReceipts.map((receipt) => receipt.kind).sort()) === JSON.stringify(["create", "delete", "update"]), "server-command lifecycle did not retain its required idempotency receipts");
    const deleteReceipt = lifecycleReceipts.find((receipt) => receipt.kind === "delete");
    assert(deleteReceipt?.recoveryArtifact?.kind === "file-backup" && deleteReceipt.recoveryArtifact.artifactName, "destructive cleanup did not retain its required recovery artifact evidence");

    await client.send("Page.navigate", { url: `${origin}/?module=nomenclature&qa-auth-bypass=1&qa-reload=${encodeURIComponent(runToken)}-cleanup-readback` });
    await waitForCondition(client, (token) => (
      Boolean(document.querySelector('[data-react-nomenclature-island][data-react-island-state="ready"]'))
      && document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 4
      && !document.querySelector("#app")?.textContent.includes(token)
    ), { arg: runToken, message: "cleanup did not survive a normal permanent-route reload", timeoutMs: 20_000 });

    const fileAfterCleanup = await readFile(sharedStateFile, "utf8");
    readMode = "error";
    const errorReadSummaryStart = sharedStateReadSummaries.length;
    const errorNavigationUrl = `${origin}/?module=nomenclature&qa-auth-bypass=1&qa-read-error=1`;
    const countErrorRouteDirectoryReads = () => sharedStateReadSummaries
      .slice(errorReadSummaryStart)
      .filter((entry) => {
        if (!String(entry.requestedKeys || "").split(",").map((value) => value.trim()).includes(DIRECTORY_STORAGE_KEY)) return false;
        try { return new URL(entry.referer).searchParams.get("qa-read-error") === "1"; }
        catch { return false; }
      }).length;
    await client.send("Page.navigate", { url: errorNavigationUrl });
    await waitForCondition(client, () => Boolean(
      document.querySelector('[data-react-nomenclature-island][data-react-island-runtime-mode="react"][data-react-island-state="error"] [role="alert"]'),
    ) && !document.querySelector("[data-nomenclature-row-open]"), {
      message: "permanent read failure exposed normal legacy Nomenclature instead of its bounded React error shell",
      timeoutMs: 20_000,
    });
    const errorState = await evaluate(client, () => ({
      text: document.querySelector('[data-react-nomenclature-island] [role="alert"]')?.textContent || "",
      telemetry: window.__MES_QA_REACT_TELEMETRY__ || [],
      legacyRows: document.querySelectorAll("[data-nomenclature-row-open]").length,
    }));
    assert(errorState.text.includes("read-unavailable") && errorState.legacyRows === 0, `permanent read error shell is incomplete: ${JSON.stringify(errorState)}`);
    assert(errorState.telemetry.filter((item) => item.surfaceId === "nomenclature" && item.runtimeMode === "react" && item.state === "error" && item.stage === "read" && item.reason === "read-unavailable").length === 1, `permanent read-error telemetry must be bounded: ${JSON.stringify(errorState.telemetry)}`);
    assert(!errorState.telemetry.some((item) => item.surfaceId === "nomenclature" && item.state === "legacy-fallback"), "permanent read error requested normal legacy fallback");
    const readsAtError = countErrorRouteDirectoryReads();
    assert(readsAtError === 1, `permanent read error did not issue one bounded document read: ${readsAtError}`);
    await delay(500);
    const readsAfterErrorDelay = countErrorRouteDirectoryReads();
    assert(readsAfterErrorDelay === readsAtError, `permanent read error started an immediate hydration/render loop: ${readsAtError} -> ${readsAfterErrorDelay}`);
    assert(await readFile(sharedStateFile, "utf8") === fileAfterCleanup, "read-error verification changed authoritative state after cleanup");
    assert(serverCommandAttempts === 5 && serverCommandFailures === 2, `conflict/failure/create/edit/delete lifecycle did not exercise the exact command transport: ${serverCommandAttempts} attempts, ${serverCommandFailures} failures`);
    assert(serverCommandSummaries.every((entry) => entry.hasIfMatch && entry.hasIdempotencyKey), `server commands lost concurrency/idempotency headers: ${JSON.stringify(serverCommandSummaries)}`);
    assert(sharedStateWrites === 0, `command-primary runtime leaked ${sharedStateWrites} generic browser shared-state writes`);
    assert(employeeSessionReads > 0 && nomenclatureCapabilityReads > 0 && nomenclatureTypesCapabilityReads > 0, "signed session reconciliation did not cover every active capability consumer");
    assert(expectedFailureConsole.length >= 1, "intentional read failure did not exercise its observable failure path");
    assert(consoleProblems.length === 0, `unexpected browser console problems:\n${consoleProblems.join("\n")}`);

    console.log("Nomenclature permanent React production-shell QA: OK");
    console.log(`- normal policy route, query isolation and bounded loading/error ownership: pass (${directoryReads} targeted reads)`);
    console.log("- Boards is a separate canonical navigation surface, not a Nomenclature legacy fallback: pass");
    console.log(`- signed employee session + RBAC command owner, rejected write, fresh create/edit/reload/delete/cleanup: pass (${serverCommandAttempts} command attempts)`);
  } catch (error) {
    if (chrome) {
      const debug = await evaluate(chrome.client, () => ({
        href: location.href,
        text: document.querySelector("#app")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 1200) || "",
        target: document.querySelector("[data-react-nomenclature-island]")?.outerHTML?.slice(0, 1000) || "",
        telemetry: window.__MES_QA_REACT_TELEMETRY__ || [],
        sharedState: window.__MES_SHARED_STATE_DEBUG__ || null,
        sharedResponses: window.__MES_QA_SHARED_RESPONSES__ || [],
      })).catch((debugError) => ({ debugError: debugError.message }));
      console.error("Nomenclature permanent QA debug:", JSON.stringify({
        ...debug,
        directoryReads,
        metadataReads,
        sharedStateWrites,
        employeeSessionReads,
        nomenclatureCapabilityReads,
        nomenclatureTypesCapabilityReads,
        serverCommandAttempts,
        serverCommandFailures,
        readMode,
        writeMode,
        serverCommandSummaries,
        sharedStateWriteSummaries,
        sharedStateReadSummaries,
      }));
    }
    if (previewOutput.trim()) console.error(previewOutput.trim());
    throw error;
  } finally {
    if (chrome) await cleanupChrome(chrome);
    await stopProcess(preview);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
