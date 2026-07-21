import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  cleanupChrome,
  delay,
  evaluate,
  getFreePort,
  launchChrome,
  waitForCondition,
} from "./browser-cdp-qa-utils.mjs";
import {
  applyNomenclatureTypeCommand,
} from "./directory-cluster-type-reducer.mjs";
import {
  prepareNomenclatureTypeDeleteContract,
} from "../src/modules/nomenclature_types/server_owner_client.js";
import {
  DIRECTORY_DEFAULTS_STORAGE_KEY,
  DIRECTORY_STORAGE_KEY,
  STORAGE_KEY,
  SYSTEM_DOMAINS_STORAGE_KEY,
} from "../src/app_constants.js";
import { PRODUCTION_STRUCTURE_MATRIX_ROWS } from "../src/production_structure_matrix_data.js";
import {
  migrateLegacySystemDomains,
  serializeSystemDomains,
} from "../src/modules/system_domains/service.js";

const EMPLOYEE_ID = "ROLE-D-TECH-RUKOVODITEL-TEHNOLOGICHESKOGO-NAPR-1-EMP-01";
const OTHER_EMPLOYEE_ID = "ROLE-D-TECH-RUKOVODITEL-TEHNOLOGICHESKOGO-NAPR-1-EMP-02";
const STALE_DIRECTORY_REVISION = 1;
const AUTHORITATIVE_DIRECTORY_REVISION = 2;

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const jsonBody = (value) => Buffer.from(JSON.stringify(value)).toString("base64");
const actor = (employeeId = EMPLOYEE_ID) => ({
  id: `employee:${employeeId}`,
  employeeId,
  displayName: employeeId === EMPLOYEE_ID ? "Сотрудник Directory QA" : "Другой сотрудник",
  personnelNumber: employeeId === EMPLOYEE_ID ? "QA-DIR-001" : "QA-DIR-002",
});

function createDirectoryFixture() {
  return {
    bomLists: [],
    componentTypes: [],
    nomenclatureTypes: [
      { id: "type-rea", name: "РЭА компоненты", code: "REA", description: "Электронные компоненты", status: "Активен" },
      { id: "type-mech", name: "Механика", code: "MECH", description: "Механические изделия", status: "Активен" },
      { id: "type-pcb", name: "Печатные платы", code: "PCB", description: "Платы и заготовки", status: "Активен" },
    ],
    nomenclature: [
      { id: "nom-mech", name: "Корпус QA", article: "QA-MECH", type: "Механика", status: "Активен" },
      { id: "nom-rea", name: "Резистор QA", article: "QA-REA", type: "РЭА компоненты", status: "Активен" },
    ],
    operationMap: [],
    specifications: [{
      id: "spec-qa",
      name: "Спецификация QA",
      structureItems: [
        { id: "spec-item-mech", parentId: "root", kind: "nomenclature", nomenclatureId: "nom-mech", nomenclatureType: "Механика" },
      ],
    }],
    statuses: [],
  };
}

function createStaleDirectoryFixture(authoritative) {
  const stale = structuredClone(authoritative);
  stale.nomenclatureTypes = stale.nomenclatureTypes.map((row) => row.id === "type-mech"
    ? { ...row, name: "Механика stale", code: "STALE" }
    : row);
  stale.nomenclature = stale.nomenclature.map((row) => row.id === "nom-mech"
    ? { ...row, type: "Механика stale" }
    : row);
  stale.specifications = stale.specifications.map((specification) => ({
    ...specification,
    structureItems: specification.structureItems.map((row) => row.id === "spec-item-mech"
      ? { ...row, nomenclatureType: "Механика stale" }
      : row),
  }));
  return stale;
}

function getStaleDirectoryEvidence(directory = {}) {
  const type = (directory.nomenclatureTypes || []).find((row) => row.id === "type-mech") || null;
  const item = (directory.nomenclature || []).find((row) => row.id === "nom-mech") || null;
  const specificationRow = (directory.specifications || [])
    .find((row) => row.id === "spec-qa")
    ?.structureItems?.find((row) => row.id === "spec-item-mech") || null;
  return {
    type: type ? { id: type.id, name: type.name, code: type.code } : null,
    item: item ? { id: item.id, type: item.type } : null,
    specificationRow: specificationRow
      ? { id: specificationRow.id, nomenclatureType: specificationRow.nomenclatureType }
      : null,
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
        defaultModule: "directories",
        modulePermissions: {
          directories: { view: true, edit: true },
          nomenclature: { view: true, edit: true },
        },
      }],
    },
    migratedAt: "2026-07-21T07:00:00.000Z",
  });
  assert(migrated.report.canActivate === true, `System Domains fixture is invalid: ${JSON.stringify(migrated.report)}`);
  return migrated.domains;
}

function capabilityPayload({ employeeActor, revision }) {
  const authenticated = Boolean(employeeActor);
  return {
    ok: true,
    apiVersion: "v1",
    surface: "nomenclature-types",
    authenticated,
    actor: employeeActor,
    rbacRevision: 81,
    directoryRevision: revision,
    authorizationReason: authenticated ? "allowed-by-role" : "employee-session-required",
    capabilities: {
      canViewNomenclatureTypes: authenticated,
      canEditNomenclatureTypes: authenticated,
      canCreateNomenclatureTypes: authenticated,
      canDeleteNomenclatureTypes: authenticated,
      serverCommandsConfigured: true,
      serverCommandsEnabled: authenticated,
    },
  };
}

function commandSuccessPayload({ body, directory, revision, idempotencyKey, idempotentReplay }) {
  const reduced = applyNomenclatureTypeCommand(directory, body);
  assert(reduced.ok === true, `QA server could not apply ${body.kind}: ${JSON.stringify(reduced)}`);
  const commandRevision = revision + 1;
  return {
    reduced,
    responseCode: idempotentReplay ? 200 : body.kind === "create" ? 201 : 200,
    payload: {
      ok: true,
      apiVersion: "v1",
      surface: "nomenclature-types",
      kind: body.kind,
      entityId: body.itemId,
      itemId: body.itemId,
      row: reduced.row,
      counts: reduced.counts,
      impact: reduced.impact,
      receipt: {
        actorId: `employee:${EMPLOYEE_ID}`,
        commandRevision,
        baseRevision: body.expectedRevision,
        rebased: body.expectedRevision < commandRevision - 1,
        kind: body.kind,
        itemId: body.itemId,
        idempotencyKey,
        destructiveAction: body.kind === "delete",
        recoveryArtifact: null,
      },
      commandRevision,
      revision: commandRevision,
      baseRevision: body.expectedRevision,
      rebased: body.expectedRevision < commandRevision - 1,
      actorId: `employee:${EMPLOYEE_ID}`,
      directory: reduced.directory,
      projection: { revision: commandRevision, directory: reduced.directory },
      idempotentReplay,
      superseded: false,
    },
  };
}

async function waitForPreview(origin, timeoutMs = 12_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${origin}/?module=directories`, { cache: "no-store" });
      if (response.ok && (await response.text()).includes('id="app"')) return;
    } catch {
      // Preview is still starting.
    }
    await delay(120);
  }
  throw new Error(`Directory browser QA preview did not start at ${origin}`);
}

async function stopProcess(child) {
  if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(resolve, 1200);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function waitForNodeCondition(predicate, { timeoutMs = 16_000, message = "Node condition was not met" } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await delay(100);
  }
  throw new Error(message);
}

async function fillEditor(client, values) {
  await evaluate(client, (input) => {
    const form = document.querySelector(".react-nomenclature-editor");
    if (!form) throw new Error("Nomenclature Types editor is not open");
    for (const [name, value] of Object.entries(input)) {
      const control = form.elements.namedItem(name);
      if (!(control instanceof HTMLInputElement)) throw new Error(`Missing editor input: ${name}`);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(control, value);
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, values);
}

async function closeEditor(client) {
  await evaluate(client, () => {
    const panel = document.querySelector(".react-nomenclature-editor")?.closest(".panel")
      || document.querySelector('[role="alertdialog"]')?.closest(".panel");
    [...(panel?.querySelectorAll("button") || [])].find((button) => button.textContent.trim() === "Отмена")?.click();
  });
  await waitForCondition(client, () => !document.querySelector(".react-nomenclature-editor") && !document.querySelector('[role="alertdialog"]'), {
    message: "Nomenclature Types editor did not close",
  });
}

async function openNomenclatureTypes(client, origin, caseId) {
  const url = `${origin}/?module=directories&qa-auth-bypass=1&react-directory-nomenclature-types-evaluation=1&qa-case=${encodeURIComponent(caseId)}`;
  await client.send("Page.navigate", { url });
  await waitForCondition(client, () => Boolean(
    document.querySelector('[data-directory-id="nomenclatureTypes"]')
      || document.querySelector("[data-react-directory-nomenclature-types-island]"),
  ), { message: `Directory navigation did not expose Nomenclature Types for ${caseId}`, timeoutMs: 20_000 });
  await evaluate(client, () => document.querySelector('[data-directory-id="nomenclatureTypes"]')?.click());
  await waitForCondition(client, () => Boolean(
    document.querySelector('[data-react-directory-nomenclature-types-island][data-react-island-state="ready"]'),
  ), { message: `Nomenclature Types React island did not become ready for ${caseId}`, timeoutMs: 20_000 });
}

async function clickButton(client, label, rootSelector = "body") {
  await evaluate(client, ({ text, selector }) => {
    const root = document.querySelector(selector);
    const button = [...(root?.querySelectorAll("button") || [])].find((entry) => entry.textContent.trim() === text);
    if (!button) throw new Error(`Button not found: ${text}`);
    button.click();
  }, { text: label, selector: rootSelector });
}

async function main() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-directory-types-command-browser-"));
  const sharedStateFile = join(temporaryRoot, "shared-state.json");
  const authoritativeDirectory = createDirectoryFixture();
  const staleDirectory = createStaleDirectoryFixture(authoritativeDirectory);
  const systemDomains = serializeSystemDomains(createSystemDomainsFixture());
  const snapshot = {
    version: STALE_DIRECTORY_REVISION,
    updatedAt: "2026-07-21T07:00:01.000Z",
    updatedBy: { actor: "directory-types-command-browser-qa" },
    values: {
      [STORAGE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
      [DIRECTORY_STORAGE_KEY]: JSON.stringify(staleDirectory),
      [DIRECTORY_DEFAULTS_STORAGE_KEY]: "1",
      [SYSTEM_DOMAINS_STORAGE_KEY]: systemDomains,
    },
    sharedUi: {},
    events: [],
  };
  assert(
    staleDirectory.nomenclatureTypes.find((row) => row.id === "type-mech")?.name === "Механика stale"
      && authoritativeDirectory.nomenclatureTypes.find((row) => row.id === "type-mech")?.name === "Механика"
      && !isDeepStrictEqual(staleDirectory, authoritativeDirectory),
    "QA fixture must contain an explicit stale Directory baseline that differs from the authoritative projection",
  );
  await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });

  let deletePreview = await prepareNomenclatureTypeDeleteContract({
    directory: authoritativeDirectory,
    itemId: "type-mech",
    fallbackTypeId: "type-rea",
  });
  assert(deletePreview.ok === true, `Delete preview fixture is invalid: ${JSON.stringify(deletePreview)}`);
  assert(deletePreview.nomenclatureCount === 1 && deletePreview.specificationRowsCount === 1, "Delete preview fixture lost its exact impact counts");

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
      MES_ADMIN_HOSTS: "admin.qa.invalid",
      MES_SHARED_STATE_FILE: sharedStateFile,
      MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: "1",
      MES_REACT_DIRECTORY_NOMENCLATURE_TYPES: "1",
      MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION: "1",
      MES_ENABLE_EMPLOYEE_AUTH: "1",
      MES_EMPLOYEE_AUTH_SESSION_SECRET: "directory-types-browser-qa-session-secret",
      MES_EMPLOYEE_AUTH_HOSTS: "127.0.0.1",
      MES_REQUIRE_EMPLOYEE_AUTH_GATE: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  preview.stdout.on("data", (chunk) => { previewOutput += chunk.toString(); });
  preview.stderr.on("data", (chunk) => { previewOutput += chunk.toString(); });

  let chrome = null;
  let currentDirectory = structuredClone(staleDirectory);
  let currentRevision = STALE_DIRECTORY_REVISION;
  let sessionActor = actor(EMPLOYEE_ID);
  let capabilityActorMode = "match";
  let commandMode = "delete-preview-outage";
  let directorySnapshotWrites = 0;
  let targetedDirectoryReads = 0;
  let capabilityReads = 0;
  let employeeSessionDeletes = 0;
  let pauseTargetedDirectoryReadNumber = 0;
  let mismatchDirectoryHydrationPaused = false;
  let releaseMismatchDirectoryHydration = null;
  let lastFulfilledDirectoryRevision = 0;
  const commandRequests = [];
  const handlerErrors = [];
  const networkOrder = [];
  const recordNetworkEvent = (event, details = {}) => {
    networkOrder.push({ sequence: networkOrder.length + 1, event, ...details });
  };
  let lostCommand = null;

  try {
    await waitForPreview(origin);
    chrome = await launchChrome("mes-directory-types-command-browser-qa-");
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
          if (method === "POST") {
            const body = JSON.parse(request.postData || "{}");
            if (Object.prototype.hasOwnProperty.call(body.values || {}, DIRECTORY_STORAGE_KEY)) {
              directorySnapshotWrites += 1;
              await fulfill(requestId, { ok: false, error: "generic-directory-write-forbidden-in-qa" }, 503);
              return;
            }
            await continueRequest(requestId);
            return;
          }
          const requestedKeys = String(headers["x-mes-shared-state-keys"] || "").split(",").map((key) => key.trim()).filter(Boolean);
          if (requestedKeys.includes(DIRECTORY_STORAGE_KEY)) {
            targetedDirectoryReads += 1;
            const targetedReadNumber = targetedDirectoryReads;
            const responseRevision = currentRevision;
            const responseDirectory = structuredClone(currentDirectory);
            recordNetworkEvent("directory-targeted-request", {
              readNumber: targetedReadNumber,
              responseRevision,
              lastFulfilledDirectoryRevision,
            });
            if (targetedReadNumber === pauseTargetedDirectoryReadNumber) {
              mismatchDirectoryHydrationPaused = true;
              recordNetworkEvent("directory-targeted-paused", { readNumber: targetedReadNumber, responseRevision });
              await new Promise((resolve) => { releaseMismatchDirectoryHydration = resolve; });
            }
            const values = {};
            for (const key of requestedKeys) {
              if (key === DIRECTORY_STORAGE_KEY) values[key] = JSON.stringify(responseDirectory);
              if (key === DIRECTORY_DEFAULTS_STORAGE_KEY) values[key] = "1";
              if (key === SYSTEM_DOMAINS_STORAGE_KEY) values[key] = systemDomains;
              if (key === STORAGE_KEY) values[key] = snapshot.values[STORAGE_KEY];
            }
            await fulfill(requestId, {
              ok: true,
              configured: true,
              version: responseRevision,
              updatedAt: `2026-07-21T07:00:0${responseRevision}.000Z`,
              updatedBy: { actor: "directory-types-owner-qa" },
              values,
              sharedUi: {},
              events: [],
            });
            lastFulfilledDirectoryRevision = responseRevision;
            recordNetworkEvent("directory-targeted-fulfilled", { readNumber: targetedReadNumber, responseRevision });
            return;
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
        }

        if (url.pathname === "/api/v1/directory/nomenclature-types/capabilities" && method === "GET") {
          capabilityReads += 1;
          const capabilityRevision = currentRevision;
          const hydratedRevisionAtRequest = lastFulfilledDirectoryRevision;
          recordNetworkEvent("capability-request", { capabilityRevision, hydratedRevisionAtRequest });
          const capabilityActor = capabilityActorMode === "mismatch"
            ? actor(OTHER_EMPLOYEE_ID)
            : sessionActor;
          await fulfill(requestId, capabilityPayload({ employeeActor: capabilityActor, revision: capabilityRevision }));
          recordNetworkEvent("capability-fulfilled", { capabilityRevision, hydratedRevisionAtRequest });
          if (capabilityRevision !== hydratedRevisionAtRequest) {
            recordNetworkEvent("capability-revision-mismatch", {
              capabilityRevision,
              hydratedRevision: hydratedRevisionAtRequest,
            });
          }
          return;
        }

        if (url.pathname === "/api/v1/directory/nomenclature-types" && method === "POST") {
          const body = JSON.parse(request.postData || "{}");
          const record = { headers, body, postData: request.postData || "", mode: commandMode };
          commandRequests.push(record);

          if (commandMode === "delete-preview-outage") {
            await fulfill(requestId, { ok: false, apiVersion: "v1", code: "directory-owner-unavailable", error: "qa-delete-capture-outage" }, 503);
            return;
          }
          if (commandMode === "conflict") {
            const serverRow = { ...body.expectedRow, code: "SERVER-CONFLICT", description: "Авторитетная серверная правка" };
            const serverMutation = applyNomenclatureTypeCommand(currentDirectory, {
              kind: "update",
              itemId: body.itemId,
              expectedRow: body.expectedRow,
              row: serverRow,
            });
            assert(serverMutation.ok === true, `QA conflict projection is invalid: ${JSON.stringify(serverMutation)}`);
            currentDirectory = serverMutation.directory;
            currentRevision += 1;
            await fulfill(requestId, {
              ok: false,
              apiVersion: "v1",
              code: "revision-conflict",
              error: "Directory changed concurrently in QA",
              conflict: true,
              surface: "nomenclature-types",
              revision: currentRevision,
              directory: currentDirectory,
              projection: { revision: currentRevision, directory: currentDirectory },
            }, 409, [{ name: "ETag", value: `"${currentRevision}"` }]);
            return;
          }
          if (commandMode === "outage") {
            await fulfill(requestId, { ok: false, apiVersion: "v1", code: "directory-owner-unavailable", error: "qa-command-outage" }, 503);
            return;
          }
          if (commandMode === "lost-response") {
            if (!lostCommand) {
              const success = commandSuccessPayload({
                body,
                directory: currentDirectory,
                revision: currentRevision,
                idempotencyKey: headers["idempotency-key"],
                idempotentReplay: false,
              });
              currentDirectory = success.reduced.directory;
              currentRevision += 1;
              lostCommand = { record, success };
              await client.send("Fetch.failRequest", { requestId, errorReason: "ConnectionReset" });
              return;
            }
            const replay = {
              ...lostCommand.success.payload,
              idempotentReplay: true,
              superseded: false,
              revision: currentRevision,
              directory: currentDirectory,
              projection: { revision: currentRevision, directory: currentDirectory },
            };
            await fulfill(requestId, replay, 200, [{ name: "ETag", value: `"${currentRevision}"` }]);
            return;
          }

          await fulfill(requestId, { ok: false, apiVersion: "v1", code: "unexpected-command-mode", error: "unexpected-command-mode" }, 500);
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
      { urlPattern: "*api/v1/directory/nomenclature-types*", requestStage: "Request" },
    ] });
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        (() => {
          const nativeFetch = window.fetch.bind(window);
          window.__MES_DIRECTORY_QA_FETCH_LOG__ = [];
          window.fetch = async (input, init = {}) => {
            const response = await nativeFetch(input, init);
            try {
              const requestUrl = typeof input === "string" ? input : input.url;
              const requestMethod = String(init.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();
              const requestHeaders = new Headers(init.headers || (typeof input === "object" ? input?.headers : undefined));
              if (new URL(requestUrl, location.href).pathname === "/api/shared-state") {
                const payload = await response.clone().json();
                window.__MES_DIRECTORY_QA_FETCH_LOG__.push({
                  method: requestMethod,
                  valueKeys: requestHeaders.get("X-MES-Shared-State-Keys") || "",
                  version: Number(payload?.version || 0),
                });
              }
            } catch {
              // Fetch diagnostics must never alter application behavior.
            }
            return response;
          };
          const employeeId = ${JSON.stringify(EMPLOYEE_ID)};
          const now = new Date();
          const dateKey = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
          const expiresAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
          localStorage.setItem("mes-planning-prototype-auth-session-v1", JSON.stringify({ unlocked: true, userId: employeeId, roleId: "admin", dateKey, expiresAt }));
          localStorage.setItem(${JSON.stringify(DIRECTORY_DEFAULTS_STORAGE_KEY)}, "1");
          localStorage.setItem(${JSON.stringify(DIRECTORY_STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(staleDirectory))});
          const ui = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
          localStorage.setItem("mes-planning-prototype-ui-v1", JSON.stringify({
            ...ui,
            activeModule: "directories",
            activeDirectory: "nomenclatureTypes",
            authGateUnlocked: true,
            authCurrentUserId: employeeId,
            activeRole: "admin",
            accessRoleAssignments: { ...(ui.accessRoleAssignments || {}), [employeeId]: "admin" },
          }));
        })();
      `,
    });

    await openNomenclatureTypes(client, origin, "stale-revision-baseline");
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="SelectableRow"]')]
      .some((row) => row.textContent.includes("Механика stale")), {
      message: "explicit stale Directory revision 1 was not rendered",
      timeoutMs: 20_000,
    });
    await waitForCondition(client, () => [...document.querySelectorAll("button")]
      .some((button) => button.textContent.trim() === "Добавить тип" && !button.disabled), {
      message: "matching capability actor and exact stale Directory revision 1 did not enable commands",
      timeoutMs: 20_000,
    });
    const staleBaseline = await evaluate(client, () => ({
      enabledAdd: [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Добавить тип" && !button.disabled),
      localDirectory: JSON.parse(localStorage.getItem("mes-planning-prototype-directories-v2") || "{}"),
      renderedMechName: [...document.querySelectorAll('[data-ui-component="SelectableRow"]')]
        .find((row) => row.textContent.includes("Механика stale"))?.querySelector("td")?.textContent?.trim() || "",
      publicPrimary: window.MES_APP_CONFIG?.MES_DIRECTORY_CLUSTER_SERVER_COMMANDS_PRIMARY,
    }));
    assert(staleBaseline.enabledAdd === true, `revision 1 did not become an exact writable baseline: ${JSON.stringify(staleBaseline)}`);
    assert(
      isDeepStrictEqual(getStaleDirectoryEvidence(staleBaseline.localDirectory), getStaleDirectoryEvidence(staleDirectory)),
      "rendered revision 1 baseline differs from the declared stale Directory evidence",
    );
    assert(staleBaseline.renderedMechName === "Механика stale", `rendered stale baseline is not explicit: ${JSON.stringify(staleBaseline)}`);
    assert(staleBaseline.publicPrimary === true, `public Directory primary flag was not published: ${JSON.stringify(staleBaseline)}`);
    const baselineCapabilityIndex = networkOrder.findIndex((entry) => entry.event === "capability-fulfilled"
      && entry.capabilityRevision === STALE_DIRECTORY_REVISION);
    const baselineMismatchIndex = networkOrder.findIndex((entry) => entry.event === "capability-revision-mismatch"
      && entry.capabilityRevision === STALE_DIRECTORY_REVISION
      && entry.hydratedRevision === 0);
    const baselineHydrationRequestIndex = networkOrder.findIndex((entry) => entry.event === "directory-targeted-request"
      && entry.responseRevision === STALE_DIRECTORY_REVISION);
    const baselineHydrationFulfilledIndex = networkOrder.findIndex((entry) => entry.event === "directory-targeted-fulfilled"
      && entry.responseRevision === STALE_DIRECTORY_REVISION);
    assert(
      baselineCapabilityIndex >= 0
        && baselineCapabilityIndex < baselineMismatchIndex
        && baselineMismatchIndex < baselineHydrationRequestIndex
        && baselineHydrationRequestIndex < baselineHydrationFulfilledIndex,
      `stale baseline did not follow capability 1 -> mismatch 0/1 -> targeted hydration 1: ${JSON.stringify(networkOrder)}`,
    );

    const revisionTwoMetadataSnapshot = {
      ...snapshot,
      version: AUTHORITATIVE_DIRECTORY_REVISION,
      updatedAt: "2026-07-21T07:00:02.000Z",
      updatedBy: { actor: "directory-types-owner-metadata-advance-qa" },
    };
    await writeFile(sharedStateFile, `${JSON.stringify(revisionTwoMetadataSnapshot)}\n`, { mode: 0o600 });
    await waitForCondition(client, () => (window.__MES_DIRECTORY_QA_FETCH_LOG__ || []).some((entry) => (
      entry.method === "GET"
        && entry.valueKeys === "__none__"
        && entry.version === 2
    )), {
      message: "shared-state metadata did not publish owner revision 2 before the capability refresh",
      timeoutMs: 20_000,
    });
    await delay(120);

    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SelectableRow"]')]
      .find((row) => row.textContent.includes("Механика stale"))?.click());
    await waitForCondition(client, () => document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent === "Механика stale", { message: "stale Mеханика row did not become selected" });
    await clickButton(client, "Редактировать");
    await waitForCondition(client, () => document.querySelector('.react-nomenclature-editor input[name="name"]')?.value === "Механика stale", { message: "stale Mеханика editor did not open" });
    await fillEditor(client, { description: "Локальная правка на устаревшей ревизии" });

    currentDirectory = structuredClone(authoritativeDirectory);
    currentRevision = AUTHORITATIVE_DIRECTORY_REVISION;
    pauseTargetedDirectoryReadNumber = targetedDirectoryReads + 1;
    const mismatchOrderStart = networkOrder.length;
    const commandsBeforeMismatch = commandRequests.length;
    await evaluate(client, () => document.querySelector(".react-nomenclature-editor")?.requestSubmit());
    await waitForNodeCondition(() => mismatchDirectoryHydrationPaused, {
      message: "capability revision 2 did not trigger a targeted Directory hydration request",
      timeoutMs: 20_000,
    });
    const mismatchState = await evaluate(client, () => ({
      enabledWriteActions: [...document.querySelectorAll("button")]
        .filter((button) => ["Добавить тип", "Сохранить тип", "Удалить"].includes(button.textContent.trim()) && !button.disabled)
        .map((button) => button.textContent.trim()),
      localDirectory: JSON.parse(localStorage.getItem("mes-planning-prototype-directories-v2") || "{}"),
    }));
    assert(mismatchState.enabledWriteActions.length === 0, `writes remained enabled across the revision 1/2 mismatch: ${JSON.stringify(mismatchState)}`);
    assert(
      isDeepStrictEqual(getStaleDirectoryEvidence(mismatchState.localDirectory), getStaleDirectoryEvidence(staleDirectory)),
      "authoritative revision 2 was visible before its targeted hydration response completed",
    );
    assert(commandRequests.length === commandsBeforeMismatch, "stale revision 1 editor issued a command before authoritative revision 2 hydration");
    const mismatchEvents = networkOrder.slice(mismatchOrderStart);
    const revisionTwoCapabilityIndex = mismatchEvents.findIndex((entry) => entry.event === "capability-fulfilled"
      && entry.capabilityRevision === AUTHORITATIVE_DIRECTORY_REVISION
      && entry.hydratedRevisionAtRequest === STALE_DIRECTORY_REVISION);
    const revisionMismatchIndex = mismatchEvents.findIndex((entry) => entry.event === "capability-revision-mismatch"
      && entry.capabilityRevision === AUTHORITATIVE_DIRECTORY_REVISION
      && entry.hydratedRevision === STALE_DIRECTORY_REVISION);
    const targetedRevisionTwoIndex = mismatchEvents.findIndex((entry) => entry.event === "directory-targeted-request"
      && entry.responseRevision === AUTHORITATIVE_DIRECTORY_REVISION
      && entry.lastFulfilledDirectoryRevision === STALE_DIRECTORY_REVISION);
    assert(
      revisionTwoCapabilityIndex >= 0
        && revisionTwoCapabilityIndex < revisionMismatchIndex
        && revisionMismatchIndex < targetedRevisionTwoIndex,
      `browser did not prove capability 2 -> mismatch 1/2 -> targeted hydration 2 order: ${JSON.stringify(mismatchEvents)}`,
    );
    releaseMismatchDirectoryHydration();
    releaseMismatchDirectoryHydration = null;
    mismatchDirectoryHydrationPaused = false;
    pauseTargetedDirectoryReadNumber = 0;
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="SelectableRow"]')]
      .some((row) => row.textContent.includes("Механика") && !row.textContent.includes("stale")), {
      message: "authoritative Directory revision 2 did not replace the stale projection",
      timeoutMs: 20_000,
    });
    await waitForCondition(client, () => [...document.querySelectorAll("button")]
      .some((button) => button.textContent.trim() === "Добавить тип" && !button.disabled), {
      message: "matching capability actor and authoritative Directory revision 2 did not restore commands",
      timeoutMs: 20_000,
    });
    const hydratedAuthoritativeDirectory = await evaluate(client, () => JSON.parse(
      localStorage.getItem("mes-planning-prototype-directories-v2") || "{}",
    ));
    deletePreview = await prepareNomenclatureTypeDeleteContract({
      directory: hydratedAuthoritativeDirectory,
      itemId: "type-mech",
      fallbackTypeId: "type-rea",
    });
    assert(
      deletePreview.ok === true
        && deletePreview.nomenclatureCount === 1
        && deletePreview.specificationRowsCount === 1,
      `hydrated delete preview fixture is invalid: ${JSON.stringify(deletePreview)}`,
    );
    assert(commandRequests.length === commandsBeforeMismatch, "revision mismatch probe unexpectedly reached the server command owner");
    await closeEditor(client);

    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SelectableRow"]')]
      .find((row) => row.textContent.includes("Механика") && !row.textContent.includes("stale"))?.click());
    await waitForCondition(client, () => document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent === "Механика", { message: "Mеханика row did not become selected" });
    await clickButton(client, "Редактировать");
    await waitForCondition(client, () => document.querySelector('.react-nomenclature-editor input[name="name"]')?.value === "Механика", { message: "Mеханика editor did not open" });
    await waitForCondition(client, () => [...document.querySelectorAll(".react-nomenclature-editor button")]
      .some((button) => button.textContent.trim() === "Удалить" && !button.disabled), {
      message: "delete stayed disabled without an exact baseline/fingerprint preview",
      timeoutMs: 20_000,
    });
    await clickButton(client, "Удалить", ".react-nomenclature-editor");
    await waitForCondition(client, () => Boolean(document.querySelector('[role="alertdialog"]')), { message: "delete confirmation did not open" });
    const confirmation = await evaluate(client, () => document.querySelector('[role="alertdialog"]')?.textContent.replace(/\s+/g, " ").trim() || "");
    assert(confirmation.includes("1 позиций") && confirmation.includes("1 строк составов") && confirmation.includes("РЭА компоненты"), `delete preview did not expose exact impact and fallback: ${confirmation}`);
    await clickButton(client, "Удалить", '[role="alertdialog"]');
    await waitForCondition(client, () => Boolean(document.querySelector('[role="alertdialog"] .react-nomenclature-command-error')), { message: "captured delete outage did not fail visibly" });
    const deleteRequest = commandRequests.find((request) => request.body.kind === "delete");
    assert(deleteRequest, "delete preview did not issue a server-owner POST");
    assert(deleteRequest.headers["if-match"] === '"2"' && deleteRequest.body.expectedRevision === 2, `delete did not retain the exact hydrated Directory revision: ${JSON.stringify(deleteRequest)}`);
    assert(deleteRequest.body.itemId === deletePreview.itemId
      && isDeepStrictEqual(deleteRequest.body.expectedRow, deletePreview.expectedRow)
      && deleteRequest.body.fallbackTypeId === deletePreview.fallbackTypeId
      && isDeepStrictEqual(deleteRequest.body.fallbackExpectedRow, deletePreview.fallbackExpectedRow)
      && deleteRequest.body.impactFingerprint === deletePreview.impactFingerprint,
    `delete command changed its exact baseline/fallback/fingerprint: ${JSON.stringify({ body: deleteRequest.body, deletePreview })}`);
    await clickButton(client, "Не удалять", '[role="alertdialog"]');
    await closeEditor(client);

    commandMode = "conflict";
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SelectableRow"]')]
      .find((row) => row.textContent.includes("Механика") && !row.textContent.includes("stale"))?.click());
    await clickButton(client, "Редактировать");
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-editor")), { message: "conflict editor did not open" });
    await fillEditor(client, { code: "LOCAL-CONFLICT" });
    await evaluate(client, () => document.querySelector(".react-nomenclature-editor")?.requestSubmit());
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-command-error")), { message: "409 conflict did not remain a visible failure" });
    await waitForCondition(client, () => (JSON.parse(localStorage.getItem("mes-planning-prototype-directories-v2") || "{}").nomenclatureTypes || [])
      .some((row) => row.id === "type-mech" && row.code === "SERVER-CONFLICT"), {
      message: "409 conflict did not refresh the authoritative Directory projection",
      timeoutMs: 20_000,
    });
    const conflictRequest = commandRequests.find((request) => request.mode === "conflict");
    assert(conflictRequest?.headers["if-match"] === '"2"' && conflictRequest.body.expectedRevision === 2, `conflict command did not use the exact revision 2 baseline: ${JSON.stringify(conflictRequest)}`);
    await closeEditor(client);
    await waitForCondition(client, () => [...document.querySelectorAll("button")]
      .some((button) => button.textContent.trim() === "Добавить тип" && !button.disabled), { message: "commands did not recover at conflict revision 3", timeoutMs: 20_000 });

    commandMode = "outage";
    await clickButton(client, "Добавить тип");
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-editor")), { message: "outage create editor did not open" });
    await fillEditor(client, { name: "Не сохранять при outage", code: "OUTAGE" });
    const rowsBeforeOutage = await evaluate(client, () => document.querySelectorAll('[data-ui-component="SelectableRow"]').length);
    await evaluate(client, () => document.querySelector(".react-nomenclature-editor")?.requestSubmit());
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-command-error")), { message: "Directory owner outage did not fail visibly" });
    const outageRequest = [...commandRequests].reverse().find((request) => request.mode === "outage");
    assert(outageRequest?.headers["if-match"] === '"3"' && outageRequest.body.expectedRevision === 3, `post-conflict command did not advance to exact revision 3: ${JSON.stringify(outageRequest)}`);
    assert(await evaluate(client, ({ count, name }) => (
      document.querySelectorAll('[data-ui-component="SelectableRow"]').length === count
      && !(JSON.parse(localStorage.getItem("mes-planning-prototype-directories-v2") || "{}").nomenclatureTypes || []).some((row) => row.name === name)
    ), { count: rowsBeforeOutage, name: "Не сохранять при outage" }), "public Directory-primary outage leaked an optimistic/local row");
    assert(directorySnapshotWrites === 0, `public Directory-primary outage fell back to ${directorySnapshotWrites} generic shared-state Directory writes`);
    await closeEditor(client);

    capabilityActorMode = "mismatch";
    sessionActor = actor(EMPLOYEE_ID);
    const deletesBeforeMismatch = employeeSessionDeletes;
    await openNomenclatureTypes(client, origin, "actor-mismatch");
    await waitForNodeCondition(() => employeeSessionDeletes > deletesBeforeMismatch, { message: "capability actor mismatch did not close the signed server session" });
    assert(await evaluate(client, () => ![...document.querySelectorAll("button")]
      .some((button) => button.textContent.trim() === "Добавить тип" && !button.disabled)), "capability actor mismatch left Directory writes enabled");

    capabilityActorMode = "match";
    sessionActor = actor(EMPLOYEE_ID);
    await openNomenclatureTypes(client, origin, "actor-match-restored");
    await waitForCondition(client, () => [...document.querySelectorAll("button")]
      .some((button) => button.textContent.trim() === "Добавить тип" && !button.disabled), { message: "matching local/server actor did not restore Directory commands", timeoutMs: 20_000 });

    commandMode = "lost-response";
    await clickButton(client, "Добавить тип");
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-editor")), { message: "lost-response create editor did not open" });
    await fillEditor(client, { name: "Тип с потерянным ответом", code: "LOST" });
    await evaluate(client, () => document.querySelector(".react-nomenclature-editor")?.requestSubmit());
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-command-error")), { message: "lost response did not fail closed in the editor", timeoutMs: 20_000 });
    const lostRequestsAfterFirst = commandRequests.filter((request) => request.mode === "lost-response");
    assert(lostRequestsAfterFirst.length === 1, `first lost-response command was not issued exactly once: ${lostRequestsAfterFirst.length}`);
    await evaluate(client, () => document.querySelector(".react-nomenclature-editor")?.requestSubmit());
    await waitForNodeCondition(() => commandRequests.filter((request) => request.mode === "lost-response").length >= 2, {
      message: "unchanged lost-response retry was blocked before the server-owner POST",
      timeoutMs: 8_000,
    });
    const lostRequests = commandRequests.filter((request) => request.mode === "lost-response");
    assert(lostRequests.length === 2, `lost-response retry issued an unexpected POST count: ${lostRequests.length}`);
    assert(lostRequests[0].headers["idempotency-key"] === lostRequests[1].headers["idempotency-key"], "lost-response retry changed Idempotency-Key");
    assert(lostRequests[0].headers["if-match"] === '"3"' && lostRequests[1].headers["if-match"] === '"3"', "lost-response retry changed the original exact If-Match revision");
    assert(lostRequests[0].postData === lostRequests[1].postData, "lost-response retry changed its exact command body");
    await waitForCondition(client, () => (JSON.parse(localStorage.getItem("mes-planning-prototype-directories-v2") || "{}").nomenclatureTypes || [])
      .some((row) => row.name === "Тип с потерянным ответом"), { message: "idempotent replay projection was not applied", timeoutMs: 20_000 });
    assert(directorySnapshotWrites === 0, `server-owner scenarios leaked ${directorySnapshotWrites} generic shared-state Directory writes`);
    assert(handlerErrors.length === 0, `CDP request handler errors:\n${handlerErrors.join("\n")}`);

    console.log("Directory Nomenclature Types server-command browser QA passed:");
    console.log("- explicit stale revision 1 is replaced only after capability 2 -> mismatch 1/2 -> targeted hydration 2");
    console.log("- local/server actors must match and every POST keeps exact If-Match plus Idempotency-Key");
    console.log("- delete preview carries exact baselines, fallback and sha256 impact fingerprint");
    console.log("- conflict projection refreshes authoritatively, outage never falls back, and lost-response retry is byte-identical");
  } catch (error) {
    if (chrome) {
      const debug = await evaluate(chrome.client, () => ({
        href: location.href,
        text: document.querySelector("#app")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 1800) || "",
        alert: document.querySelector("[role=alert]")?.textContent || "",
        directory: JSON.parse(localStorage.getItem("mes-planning-prototype-directories-v2") || "{}"),
        runtime: window.MES_APP_CONFIG || null,
        fetchLog: window.__MES_DIRECTORY_QA_FETCH_LOG__ || [],
      })).catch((debugError) => ({ debugError: debugError.message }));
      console.error("Directory Nomenclature Types command browser QA debug:", JSON.stringify({
        ...debug,
        currentRevision,
        commandMode,
        capabilityActorMode,
        capabilityReads,
        targetedDirectoryReads,
        employeeSessionDeletes,
        directorySnapshotWrites,
        commandRequests,
        handlerErrors,
        networkOrder,
      }));
    }
    if (previewOutput.trim()) console.error(previewOutput.trim());
    throw error;
  } finally {
    if (releaseMismatchDirectoryHydration) releaseMismatchDirectoryHydration();
    if (chrome) await cleanupChrome(chrome);
    await stopProcess(preview);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
