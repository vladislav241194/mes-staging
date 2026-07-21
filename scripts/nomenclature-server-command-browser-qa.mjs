import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import { migrateLegacySystemDomains, serializeSystemDomains } from "../src/modules/system_domains/service.js";

const DIRECTORY_STORAGE_KEY = "mes-planning-prototype-directories-v2";
const STATE_STORAGE_KEY = "mes-planning-prototype-state-v2";
const EMPLOYEE_ID = "ROLE-D-TECH-RUKOVODITEL-TEHNOLOGICHESKOGO-NAPR-1-EMP-01";
const OTHER_EMPLOYEE_ID = "ROLE-D-TECH-RUKOVODITEL-TEHNOLOGICHESKOGO-NAPR-1-EMP-02";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const jsonBody = (value) => Buffer.from(JSON.stringify(value)).toString("base64");
const actor = (employeeId = EMPLOYEE_ID) => ({
  id: `employee:${employeeId}`,
  employeeId,
  displayName: employeeId === EMPLOYEE_ID ? "Сотрудник Nomenclature QA" : "Другой сотрудник",
  personnelNumber: employeeId === EMPLOYEE_ID ? "QA-001" : "QA-002",
});

function createDirectoryFixture() {
  return {
    bomLists: [],
    componentTypes: [],
    nomenclatureTypes: [
      { id: "nom-type-rea", name: "РЭА компоненты", status: "Активен" },
      { id: "nom-type-mech", name: "Механика", status: "Активен" },
    ],
    nomenclature: [
      { id: "rea-001", article: "RC0603-10K", name: "Резистор 10 кОм", type: "РЭА компоненты", unit: "шт.", package: "0603", manufacturer: "Yageo", status: "Активен" },
      { id: "mech-001", article: "CASE-AL-01", name: "Корпус алюминиевый", type: "Механика", unit: "шт.", package: "120x80", manufacturer: "MES Line", status: "Активен" },
    ],
    operationMap: [],
    specifications: [],
    statuses: [],
  };
}

function createSystemDomainsFixture() {
  const migrated = migrateLegacySystemDomains({
    matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS,
    legacyUi: {
      accessRoleAssignments: { [EMPLOYEE_ID]: "admin" },
      accessRoleProfiles: [{
        id: "admin",
        label: "Администратор",
        scope: "factory",
        defaultModule: "nomenclature",
        modulePermissions: { directories: { edit: true } },
      }],
    },
    migratedAt: "2026-07-21T00:00:00.000Z",
  });
  assert(migrated.report.canActivate === true, `System Domains fixture is invalid: ${JSON.stringify(migrated.report)}`);
  return migrated.domains;
}

function capabilityPayload(mode, sessionActor) {
  const configured = mode !== "command-off";
  if (mode === "rbac-denied") {
    return {
      ok: true,
      authenticated: true,
      actor: actor(EMPLOYEE_ID),
      rbacRevision: 41,
      authorizationReason: "missing-edit-grant",
      capabilities: {
        canViewNomenclature: true,
        canEditNomenclature: false,
        canCreateNomenclature: false,
        canDeleteNomenclature: false,
        serverCommandsConfigured: true,
        serverCommandsEnabled: false,
      },
    };
  }
  if (sessionActor?.employeeId === EMPLOYEE_ID && mode === "enabled") {
    return {
      ok: true,
      authenticated: true,
      actor: sessionActor,
      rbacRevision: 42,
      authorizationReason: "allowed-by-role",
      capabilities: {
        canViewNomenclature: true,
        canEditNomenclature: true,
        canCreateNomenclature: true,
        canDeleteNomenclature: true,
        serverCommandsConfigured: true,
        serverCommandsEnabled: true,
      },
    };
  }
  return {
    ok: true,
    authenticated: false,
    actor: null,
    rbacRevision: 42,
    authorizationReason: configured ? "employee-session-required" : "server-commands-not-configured",
    capabilities: {
      canViewNomenclature: false,
      canEditNomenclature: false,
      canCreateNomenclature: false,
      canDeleteNomenclature: false,
      serverCommandsConfigured: configured,
      serverCommandsEnabled: false,
    },
  };
}

function nomenclatureTypesCapabilityPayload(sessionActor, directoryRevision = 1) {
  const authenticated = Boolean(sessionActor);
  return {
    ok: true,
    apiVersion: "v1",
    surface: "nomenclature-types",
    authenticated,
    actor: sessionActor,
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

function commandPayload({ item, directory, revision, commandRevision, baseRevision, replayed, superseded }) {
  return {
    apiVersion: "v1",
    ok: true,
    kind: "update",
    itemId: item.id,
    item,
    revision,
    commandRevision,
    baseRevision,
    replayed,
    superseded,
    rebased: baseRevision < commandRevision - 1,
    unlinkedReferences: { bom: 0, specifications: 0 },
    actorId: `employee:${EMPLOYEE_ID}`,
    projection: {
      revision,
      updatedAt: `2026-07-21T06:00:0${revision}.000Z`,
      directory,
    },
  };
}

async function waitForPreview(origin, timeoutMs = 12_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${origin}/?module=nomenclature`, { cache: "no-store" });
      if (response.ok && (await response.text()).includes('id="app"')) return;
    } catch {
      // Preview is still starting.
    }
    await delay(120);
  }
  throw new Error(`Nomenclature browser QA preview did not start at ${origin}`);
}

async function stopProcess(child) {
  if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(resolve, 1200);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function enterPin(client, pin) {
  for (const digit of pin) {
    await evaluate(client, (value) => document.querySelector(`[data-auth-picker-pin-digit="${value}"]`)?.click(), digit);
    await delay(80);
  }
}

async function waitForNodeCondition(predicate, { timeoutMs = 16_000, message = "Node condition was not met" } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await delay(120);
  }
  throw new Error(message);
}

async function fillEditor(client, values) {
  await evaluate(client, (input) => {
    const form = document.querySelector(".react-nomenclature-editor");
    if (!form) throw new Error("Nomenclature editor is not open");
    for (const [name, value] of Object.entries(input)) {
      const control = form.elements.namedItem(name);
      if (!control) throw new Error(`Missing editor control: ${name}`);
      const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(control, value);
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, values);
}

async function main() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-nomenclature-command-browser-"));
  const sharedStateFile = join(temporaryRoot, "shared-state.json");
  const policyFile = join(temporaryRoot, "react-policy.json");
  const initialDirectory = createDirectoryFixture();
  const snapshot = {
    version: 1,
    updatedAt: "2026-07-21T06:00:01.000Z",
    updatedBy: { actor: "nomenclature-command-browser-qa" },
    values: {
      [STATE_STORAGE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
      [DIRECTORY_STORAGE_KEY]: JSON.stringify(initialDirectory),
      [SYSTEM_DOMAINS_STORAGE_KEY]: serializeSystemDomains(createSystemDomainsFixture()),
    },
    sharedUi: {},
    events: [],
  };
  await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
  const basePolicy = JSON.parse(await readFile(join(process.cwd(), "react-runtime-policy.json"), "utf8"));
  await writeFile(policyFile, `${JSON.stringify({
    ...basePolicy,
    policyId: "qa-nomenclature-server-command",
    surfaces: { ...basePolicy.surfaces, nomenclature: "react", boards: "legacy" },
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
      // Localhost is an admin host by default. This QA exercises the normal
      // employee MES shell, so keep the admin perimeter on a non-test host.
      MES_ADMIN_HOSTS: "admin.qa.invalid",
      MES_SHARED_STATE_FILE: sharedStateFile,
      MES_REACT_RUNTIME_POLICY_PATH: policyFile,
      MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "1",
      MES_ENABLE_EMPLOYEE_AUTH: "1",
      MES_EMPLOYEE_AUTH_SESSION_SECRET: "nomenclature-browser-qa-session-secret",
      MES_EMPLOYEE_AUTH_HOSTS: "127.0.0.1",
      MES_REQUIRE_EMPLOYEE_AUTH_GATE: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  preview.stdout.on("data", (chunk) => { previewOutput += chunk.toString(); });
  preview.stderr.on("data", (chunk) => { previewOutput += chunk.toString(); });

  let chrome = null;
  let sessionActor = null;
  let capabilityMode = "enabled";
  let sharedReadMode = "success";
  let commandMode = "outage";
  let currentDirectory = structuredClone(initialDirectory);
  let employeeSessionDeletes = 0;
  let nomenclatureTypesCapabilityReads = 0;
  let directorySnapshotWrites = 0;
  const employeeSessionPosts = [];
  const commandRequests = [];
  const handlerErrors = [];
  let lostReceipt = null;

  try {
    await waitForPreview(origin);
    chrome = await launchChrome("mes-nomenclature-command-browser-qa-");
    const { client } = chrome;
    const fulfill = (requestId, payload, responseCode = 200, extraHeaders = []) => client.send("Fetch.fulfillRequest", {
      requestId,
      responseCode,
      responseHeaders: [
        { name: "Content-Type", value: "application/json; charset=utf-8" },
        { name: "Cache-Control", value: "no-store" },
        ...extraHeaders,
      ],
      body: jsonBody(payload),
    });
    const continueRequest = (requestId) => client.send("Fetch.continueRequest", { requestId });

    client.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method !== "Fetch.requestPaused") return;
      void (async () => {
        const { requestId, request } = message.params;
        const url = new URL(request.url);
        const method = String(request.method || "GET").toUpperCase();
        const headers = Object.fromEntries(Object.entries(request.headers || {}).map(([name, value]) => [name.toLowerCase(), String(value)]));

        if (url.pathname === "/api/shared-state") {
          if (method === "GET" && sharedReadMode === "error") {
            await fulfill(requestId, { ok: false, error: "qa-owner-unavailable" }, 503);
            return;
          }
          if (method !== "GET") {
            const body = JSON.parse(request.postData || "{}");
            if (Object.prototype.hasOwnProperty.call(body.values || {}, DIRECTORY_STORAGE_KEY)) directorySnapshotWrites += 1;
          }
          await continueRequest(requestId);
          return;
        }

        if (url.pathname === "/api/v1/auth/employee-session") {
          if (method === "GET") {
            await fulfill(requestId, sessionActor
              ? { ok: true, authenticated: true, actor: sessionActor }
              : { ok: true, authenticated: false, reason: "employee-session-required" });
            return;
          }
          if (method === "DELETE") {
            employeeSessionDeletes += 1;
            sessionActor = null;
            await fulfill(requestId, { ok: true, authenticated: false });
            return;
          }
          if (method === "POST") {
            const body = JSON.parse(request.postData || "{}");
            employeeSessionPosts.push({ body, headers });
            if (body.pin === "11111") {
              await fulfill(requestId, { ok: false, code: "invalid-credentials", error: "invalid-credentials" }, 401);
              return;
            }
            sessionActor = body.pin === "22222" ? actor(OTHER_EMPLOYEE_ID) : actor(EMPLOYEE_ID);
            await fulfill(requestId, { ok: true, authenticated: true, actor: sessionActor });
            return;
          }
        }

        if (url.pathname === "/api/v1/nomenclature/capabilities" && method === "GET") {
          if (capabilityMode === "infra-error") {
            await fulfill(requestId, { ok: false, code: "capabilities-unavailable", error: "capabilities-unavailable" }, 503);
            return;
          }
          await fulfill(requestId, capabilityPayload(capabilityMode, sessionActor));
          return;
        }

        if (url.pathname === "/api/v1/directory/nomenclature-types/capabilities" && method === "GET") {
          nomenclatureTypesCapabilityReads += 1;
          await fulfill(requestId, nomenclatureTypesCapabilityPayload(sessionActor, snapshot.version));
          return;
        }

        if (url.pathname === "/api/v1/nomenclature" || url.pathname.startsWith("/api/v1/nomenclature/")) {
          const body = JSON.parse(request.postData || "{}");
          const record = { method, url: url.pathname, headers, body, postData: request.postData || "" };
          commandRequests.push(record);
          if (commandMode === "outage") {
            await fulfill(requestId, { ok: false, code: "owner-unavailable", error: "qa-command-outage" }, 503);
            return;
          }
          if (commandMode === "lost-superseded" && method === "PATCH") {
            if (!lostReceipt) {
              lostReceipt = record;
              const itemId = String(body.row?.id || "");
              const intervening = {
                ...body.row,
                name: "Серверная более новая правка",
                article: "SERVER-NEWER",
                updatedAt: "2026-07-21T06:00:03.000Z",
              };
              currentDirectory = {
                ...currentDirectory,
                nomenclature: currentDirectory.nomenclature.map((row) => row.id === itemId ? intervening : row),
              };
              await client.send("Fetch.failRequest", { requestId, errorReason: "ConnectionReset" });
              return;
            }
            await fulfill(requestId, commandPayload({
              item: lostReceipt.body.row,
              directory: currentDirectory,
              revision: 3,
              commandRevision: 2,
              baseRevision: 1,
              replayed: true,
              superseded: true,
            }), 200, [{ name: "ETag", value: '"3"' }]);
            return;
          }
          await fulfill(requestId, { ok: false, code: "unexpected-command-mode", error: "unexpected-command-mode" }, 500);
          return;
        }

        await continueRequest(requestId);
      })().catch((error) => {
        handlerErrors.push(error?.stack || error?.message || String(error));
        void client.send("Fetch.failRequest", { requestId: message.params.requestId, errorReason: "Failed" }).catch(() => {});
      });
    });

    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Fetch.enable", { patterns: [
      { urlPattern: "*api/shared-state*", requestStage: "Request" },
      { urlPattern: "*api/v1/auth/employee-session*", requestStage: "Request" },
      { urlPattern: "*api/v1/nomenclature*", requestStage: "Request" },
      { urlPattern: "*api/v1/directory/nomenclature-types/capabilities*", requestStage: "Request" },
    ] });
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        (() => {
          const employeeId = ${JSON.stringify(EMPLOYEE_ID)};
          const now = new Date();
          const dateKey = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
          const expiresAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
          localStorage.setItem("mes-planning-prototype-auth-session-v1", JSON.stringify({ unlocked: true, userId: employeeId, roleId: "admin", dateKey, expiresAt }));
          const ui = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
          localStorage.setItem("mes-planning-prototype-ui-v1", JSON.stringify({
            ...ui,
            activeModule: "nomenclature",
            activeNomenclaturePane: "items",
            authGateUnlocked: true,
            authCurrentUserId: employeeId,
            activeRole: "admin",
            accessRoleAssignments: { ...(ui.accessRoleAssignments || {}), [employeeId]: "admin" },
          }));
        })();
      `,
    });

    const navigateNomenclature = async (suffix) => {
      await client.send("Page.navigate", { url: `${origin}/?module=nomenclature&qa-case=${encodeURIComponent(suffix)}` });
      await waitForCondition(client, () => Boolean(document.querySelector('[data-react-nomenclature-island][data-react-island-state="ready"]')), {
        message: `Nomenclature did not become ready for ${suffix}`,
        timeoutMs: 20_000,
      });
    };
    const elevationVisible = () => evaluate(client, () => [...document.querySelectorAll("button")]
      .some((button) => button.textContent.trim().startsWith("Подтвердить PIN")));

    await navigateNomenclature("normal-user-missing-command-session");
    assert(await elevationVisible(), "missing employee command session must expose scoped elevation");
    const normalUser = await evaluate(client, () => ({
      module: new URL(location.href).searchParams.get("module"),
      authPicker: Boolean(document.querySelector("[data-auth-picker-pin-step]")),
      createDisabled: [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Добавить позицию")?.disabled,
      required: window.MES_APP_CONFIG?.MES_EMPLOYEE_AUTH_REQUIRED,
      available: window.MES_APP_CONFIG?.MES_EMPLOYEE_AUTH_AVAILABLE,
    }));
    assert(normalUser.module === "nomenclature" && !normalUser.authPicker && normalUser.createDisabled === true, `normal user was globally PIN-blocked or write-enabled: ${JSON.stringify(normalUser)}`);
    assert(normalUser.required === false && normalUser.available === true, `Stage 1 auth publication must be AVAILABLE, not REQUIRED: ${JSON.stringify(normalUser)}`);

    sessionActor = actor(EMPLOYEE_ID);
    capabilityMode = "rbac-denied";
    await navigateNomenclature("authenticated-rbac-denied");
    assert(!(await elevationVisible()), "elevation CTA must stay hidden for an authenticated RBAC denial");

    sessionActor = null;
    capabilityMode = "command-off";
    await navigateNomenclature("command-owner-off");
    assert(!(await elevationVisible()), "elevation CTA must stay hidden when server commands are not configured");

    capabilityMode = "infra-error";
    await navigateNomenclature("capabilities-infrastructure-error");
    assert(!(await elevationVisible()), "elevation CTA must stay hidden for a capability infrastructure failure");

    capabilityMode = "enabled";
    sharedReadMode = "error";
    await client.send("Page.navigate", { url: `${origin}/?module=nomenclature&qa-case=owner-read-off` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-nomenclature-island][data-react-island-state="error"]')), {
      message: "owner read outage did not fail closed into the permanent React error shell",
      timeoutMs: 20_000,
    });
    assert(!(await elevationVisible()), "elevation CTA must stay hidden while the authoritative read owner is unavailable");
    sharedReadMode = "success";

    await navigateNomenclature("scoped-elevation-cancel");
    await waitForCondition(client, () => [...document.querySelectorAll("button")]
      .some((button) => button.textContent.trim().startsWith("Подтвердить PIN")), {
      message: "scoped elevation CTA did not become ready after owner recovery",
    });
    await evaluate(client, () => [...document.querySelectorAll("button")].find((button) => button.textContent.trim().startsWith("Подтвердить PIN"))?.click());
    await waitForCondition(client, () => Boolean(document.querySelector("[data-auth-picker-pin-step]")), { message: "scoped elevation did not open the React PIN step" });
    assert(employeeSessionDeletes >= 1, "opening scoped elevation must clear any stale signed employee session first");
    await evaluate(client, () => [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Отмена")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-nomenclature-island][data-react-island-state="ready"]')), { message: "elevation cancel did not return to Nomenclature" });

    await waitForCondition(client, () => [...document.querySelectorAll("button")].some((button) => button.textContent.trim().startsWith("Подтвердить PIN")), { message: "elevation CTA did not return after cancel" });
    await evaluate(client, () => [...document.querySelectorAll("button")].find((button) => button.textContent.trim().startsWith("Подтвердить PIN"))?.click());
    await waitForCondition(client, () => Boolean(document.querySelector("[data-auth-picker-pin-step]")), { message: "second scoped elevation did not open" });
    await enterPin(client, "11111");
    await waitForCondition(client, () => document.querySelector(".auth-picker-react-pin-note")?.textContent.includes("Осталось попыток: 4"), { message: "HTTP 401 did not consume exactly one local PIN attempt" });

    const deletesBeforeMismatch = employeeSessionDeletes;
    await enterPin(client, "22222");
    await waitForCondition(client, () => document.querySelector(".auth-picker-react-pin-error")?.textContent.includes("другого сотрудника"), { message: "employee actor mismatch did not fail closed" });
    await waitForNodeCondition(() => employeeSessionDeletes > deletesBeforeMismatch, { message: "employee actor mismatch did not delete the mismatched signed session" });
    assert(await evaluate(client, () => document.querySelector(".auth-picker-react-pin-note")?.textContent.includes("Осталось попыток: 4")), "actor mismatch must not be misclassified as a bad credential attempt");

    await enterPin(client, "55555");
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-nomenclature-island][data-react-island-state="ready"]'))
      && [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Добавить позицию" && button.disabled === false), {
      message: "matching signed employee session did not enable permanent server commands",
      timeoutMs: 20_000,
    });
    assert(employeeSessionPosts.length === 3, `unexpected employee login request count: ${employeeSessionPosts.length}`);
    for (const request of employeeSessionPosts) {
      assert(JSON.stringify(Object.keys(request.body).sort()) === JSON.stringify(["employeeId", "pin"]), `login body leaked authority fields: ${JSON.stringify(request.body)}`);
      assert(request.body.employeeId === EMPLOYEE_ID, `scoped elevation selected a different local employee: ${JSON.stringify(request.body)}`);
      assert(request.headers.accept === "application/json" && /^application\/json/.test(request.headers["content-type"] || ""), "employee login request lost its JSON protocol headers");
    }

    const nomenclatureTypesReadsBeforeReload = nomenclatureTypesCapabilityReads;
    await navigateNomenclature("signed-session-reload");
    await waitForNodeCondition(() => nomenclatureTypesCapabilityReads > nomenclatureTypesReadsBeforeReload, {
      message: "reload reconciliation did not re-check the shared signed session for Nomenclature Types",
    });
    assert(await evaluate(client, () => [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Добавить позицию" && button.disabled === false)), "signed employee session did not survive normal reload reconciliation");

    const rowCountBeforeOutage = await evaluate(client, () => document.querySelectorAll('[data-ui-component="SelectableRow"]').length);
    const directoryWritesBeforeOutage = directorySnapshotWrites;
    commandMode = "outage";
    await evaluate(client, () => [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Добавить позицию")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-editor")), { message: "create editor did not open for command outage" });
    await fillEditor(client, { name: "Не должна сохраниться", article: "OUTAGE-QA", type: "Механика" });
    await evaluate(client, () => document.querySelector(".react-nomenclature-editor")?.requestSubmit());
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-command-error[role=alert]")), { message: "command outage did not return an inline failure" });
    assert(await evaluate(client, (count) => document.querySelectorAll('[data-ui-component="SelectableRow"]').length === count, rowCountBeforeOutage), "failed command leaked an optimistic Nomenclature row");
    assert(directorySnapshotWrites === directoryWritesBeforeOutage, "command-primary outage fell back to a generic directory snapshot POST");
    await evaluate(client, () => [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Отмена")?.click());
    await waitForCondition(client, () => !document.querySelector(".react-nomenclature-editor"), { message: "failed create editor did not close" });

    commandMode = "lost-superseded";
    await evaluate(client, () => [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Редактировать")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-editor")), { message: "edit editor did not open for lost-response retry" });
    await fillEditor(client, { name: "Локальная команда с потерянным ответом", article: "LOCAL-LOST" });
    await evaluate(client, () => document.querySelectorAll(".global-save-toast").forEach((node) => node.remove()));
    await evaluate(client, () => document.querySelector(".react-nomenclature-editor")?.requestSubmit());
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-command-error")?.textContent.trim()), { message: "lost command response did not fail closed in the editor", timeoutMs: 20_000 });
    assert(commandRequests.filter((request) => request.method === "PATCH").length === 1, "first lost-response update was not issued exactly once");

    await evaluate(client, () => document.querySelector(".react-nomenclature-editor")?.requestSubmit());
    await waitForCondition(client, () => (
      document.querySelector(".react-nomenclature-command-error")?.textContent.includes("уже снова изменилась")
      && (JSON.parse(localStorage.getItem("mes-planning-prototype-directories-v2") || "{}").nomenclature || [])
        .some((row) => row.name === "Серверная более новая правка")
    ), { message: "superseded replay did not apply the current authoritative row and remain an error", timeoutMs: 20_000 });
    const patchRequests = commandRequests.filter((request) => request.method === "PATCH");
    assert(patchRequests.length === 2, `unchanged retry did not issue exactly two PATCH attempts: ${patchRequests.length}`);
    assert(patchRequests[0].headers["idempotency-key"] === patchRequests[1].headers["idempotency-key"], "lost-response retry changed Idempotency-Key");
    assert(patchRequests[0].headers["if-match"] === '"1"' && patchRequests[1].headers["if-match"] === '"1"', "lost-response retry changed the original If-Match revision");
    assert(patchRequests[0].postData === patchRequests[1].postData, "unchanged retry changed its command body (including updatedAt)");
    assert(!await evaluate(client, () => Boolean(document.querySelector(".global-save-toast"))), "superseded replay was incorrectly announced as a successful save");
    assert(directorySnapshotWrites === 0, `server-command-primary leaked ${directorySnapshotWrites} generic directory snapshot writes`);

    const deletesBeforeLogout = employeeSessionDeletes;
    await evaluate(client, () => document.querySelector("[data-auth-logout]")?.click());
    await waitForCondition(client, () => new URL(location.href).searchParams.get("module") === "authPrototype", { message: "global logout did not lock the local MES session" });
    await waitForNodeCondition(() => employeeSessionDeletes > deletesBeforeLogout, { message: "global logout did not delete the signed employee server session" });
    const logoutState = await evaluate(client, () => ({
      storedSession: localStorage.getItem("mes-planning-prototype-auth-session-v1"),
      activeModule: JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}").activeModule,
      authGateUnlocked: JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}").authGateUnlocked,
    }));
    assert(!logoutState.storedSession && logoutState.activeModule === "authPrototype" && logoutState.authGateUnlocked !== true, `logout left local authority behind: ${JSON.stringify(logoutState)}`);
    assert(handlerErrors.length === 0, `CDP request handler errors:\n${handlerErrors.join("\n")}`);

    console.log("Nomenclature server-command browser QA passed:");
    console.log("- normal MES login remains available while scoped employee elevation is optional");
    console.log("- RBAC denial, command-off, read-owner outage and infrastructure failure never masquerade as a PIN problem");
    console.log("- exact employee actor, reload reconciliation, command outage and global logout fail closed");
    console.log("- unchanged lost-response retry preserves body/key/revision and a superseded replay is never reported as success");
  } catch (error) {
    if (chrome) {
      const debug = await evaluate(chrome.client, () => ({
        href: location.href,
        text: document.querySelector("#app")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 1800) || "",
        alert: document.querySelector("[role=alert]")?.textContent || "",
        localSession: localStorage.getItem("mes-planning-prototype-auth-session-v1"),
        runtime: window.MES_APP_CONFIG || null,
      })).catch((debugError) => ({ debugError: debugError.message }));
      console.error("Nomenclature command browser QA debug:", JSON.stringify({
        ...debug,
        capabilityMode,
        commandMode,
        sharedReadMode,
        employeeSessionDeletes,
        nomenclatureTypesCapabilityReads,
        employeeSessionPosts: employeeSessionPosts.map((entry) => entry.body),
        commandRequests,
        directorySnapshotWrites,
        handlerErrors,
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
