import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY, SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { PRODUCTION_STRUCTURE_MATRIX_ROWS } from "../src/production_structure_matrix_data.js";
import { migrateLegacySystemDomains, serializeSystemDomains } from "../src/modules/system_domains/service.js";
import { cleanupChrome, delay, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const STATE_STORAGE_KEY = "mes-planning-prototype-state-v2";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function waitForPreview(origin) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    try {
      const response = await fetch(`${origin}/?module=roles&qa-auth-bypass=1`, { cache: "no-store" });
      if (response.ok && (await response.text()).includes('id="app"')) return;
    } catch {
      // Preview is still starting.
    }
    await delay(120);
  }
  throw new Error(`Roles QA preview did not become ready at ${origin}`);
}

async function stopProcess(child) {
  if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(resolve, 1200);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function main() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-roles-react-functional-"));
  const sharedStateFile = join(temporaryRoot, "shared-state.json");
  const baseline = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS });
  const employeeIds = baseline.domains.registries.employees.slice(0, 3).map((employee) => employee.id);
  assert(employeeIds.length === 3, "canonical System Domains fixture must contain three employees");
  const migration = migrateLegacySystemDomains({
    matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS,
    legacyUi: {
      accessRoleProfiles: [
        { id: "admin", label: "Администратор QA", scope: "factory", defaultModule: "roles", modulePermissions: { roles: { view: true, print: true, configure: true } } },
        { id: "master", label: "Мастер QA", scope: "workCenter", defaultModule: "shiftMasterBoard", modulePermissions: { shiftMasterBoard: { view: true, edit: true, assign: true }, timesheet: { view: true } } },
        { id: "auditor", label: "Аудитор QA", scope: "factory", defaultModule: "roles", readOnly: true, modulePermissions: { roles: { view: true, print: true }, gantt: { view: true, print: true } } },
      ],
      accessRoleAssignments: {
        [employeeIds[0]]: "admin",
        [employeeIds[1]]: "master",
        [employeeIds[2]]: "auditor",
      },
    },
    migratedAt: "2026-07-19T00:00:00.000Z",
  });
  assert(migration.report.validation.valid, "canonical Roles fixture must be valid");
  const adminRole = migration.domains.registries.accessRoles.find((role) => role.id === "admin");
  assert(adminRole, "canonical Roles fixture must contain admin");
  adminRole.serverOnlyMarker = "role-hidden-field";
  const snapshot = {
    version: 1,
    updatedAt: "2026-07-19T00:00:00.000Z",
    updatedBy: { actor: "roles-react-functional-qa" },
    values: {
      [STATE_STORAGE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
      [SYSTEM_DOMAINS_STORAGE_KEY]: serializeSystemDomains(migration.domains),
    },
    sharedUi: {},
    events: [],
  };
  await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
  assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary state must be owner-readable only");
  const originalSnapshot = await readFile(sharedStateFile, "utf8");
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
      MES_REACT_ROLES: "1",
      MES_REACT_ROLES_READ_ONLY_EVALUATION: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  preview.stdout.on("data", (chunk) => { previewOutput += chunk.toString(); });
  preview.stderr.on("data", (chunk) => { previewOutput += chunk.toString(); });
  let chrome = null;
  const consoleProblems = [];
  let apiDomains = structuredClone(migration.domains);
  let apiRevision = 1;
  let putAttempts = 0;
  let successfulWrites = 0;
  let forceConflictOnce = false;
  let primaryAuthorityReady = false;
  const commandRequests = [];
  try {
    await waitForPreview(origin);
    chrome = await launchChrome("mes-roles-react-qa-");
    const { client } = chrome;
    const responseBody = (value) => Buffer.from(JSON.stringify(value)).toString("base64");
    const fulfill = (requestId, payload, { statusCode = 200, revision = apiRevision } = {}) => client.send("Fetch.fulfillRequest", {
      requestId,
      responseCode: statusCode,
      responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }, { name: "ETag", value: `"${revision}"` }],
      body: responseBody(payload),
    }).catch((error) => consoleProblems.push(error.message));
    client.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Fetch.requestPaused") {
        const requestUrl = new URL(message.params.request.url);
        const method = String(message.params.request.method || "GET").toUpperCase();
        if (requestUrl.pathname === "/api/v1/system-domains/capabilities") {
          const consistency = primaryAuthorityReady ? { consistency: { details: { authority: { mode: "postgres-primary" } } } } : {};
          void fulfill(message.params.requestId, { ok: true, capabilities: { serverCommandsEnabled: true, serverCommandSurfaces: ["production-structure", "timesheet", "access-control"], ...consistency } });
        } else if (requestUrl.pathname === "/api/v1/system-domains" && method === "GET") {
          void fulfill(message.params.requestId, { ok: true, revision: apiRevision, item: apiDomains });
        } else if (requestUrl.pathname === "/api/v1/system-domains" && method === "PUT") {
          putAttempts += 1;
          const headers = message.params.request.headers || {};
          const header = (name) => Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] || "";
          const body = JSON.parse(message.params.request.postData || "{}");
          commandRequests.push({ expectedRevision: Number(body.expectedRevision || 0), ifMatch: String(header("If-Match")), idempotencyKey: String(header("Idempotency-Key")), surface: String(body.surface || "") });
          if (forceConflictOnce) {
            forceConflictOnce = false;
            void fulfill(message.params.requestId, { ok: false, conflict: true, revision: apiRevision, error: "System Domains revision conflict" }, { statusCode: 409 });
          } else if (Number(body.expectedRevision) !== apiRevision || String(header("If-Match")) !== `"${apiRevision}"`) {
            void fulfill(message.params.requestId, { ok: false, conflict: true, revision: apiRevision, error: "stale revision" }, { statusCode: 409 });
          } else {
            apiDomains = structuredClone(body.domains);
            apiRevision += 1;
            successfulWrites += 1;
            void fulfill(message.params.requestId, { ok: true, revision: apiRevision, item: apiDomains, snapshotSync: { queued: true } });
          }
        } else {
          void client.send("Fetch.continueRequest", { requestId: message.params.requestId }).catch((error) => consoleProblems.push(error.message));
        }
        return;
      }
      if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) {
        consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
      }
    });
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/system-domains*", requestStage: "Request" }] });
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1` });
    await waitForCondition(client, () => Boolean(document.querySelector(".access-roles-page")), { message: "server permission without session request did not retain legacy Roles" });
    const defaultState = await evaluate(client, () => ({
      reactTargets: document.querySelectorAll("[data-react-roles-island]").length,
      legacyRoles: document.querySelectorAll("[data-access-role-select]").length,
    }));
    assert(defaultState.reactTargets === 0 && defaultState.legacyRoles >= 3, "default-on server permission must remain legacy without a session request");

    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&react-roles-evaluation=1` });
    await waitForCondition(client, () => Boolean(
      document.querySelector('[data-react-roles-island][data-react-island-state="ready"]')
      && document.querySelectorAll('[data-ui-component="SidebarItem"]').length >= 3
    ), { message: "Roles React island did not render the PostgreSQL-hydrated payload", timeoutMs: 15_000 });
    const initial = await evaluate(client, () => {
      const target = document.querySelector("[data-react-roles-island]");
      return {
        roles: document.querySelectorAll('[data-ui-component="SidebarItem"]').length,
        modules: document.querySelectorAll(".roles-grant-table tbody tr").length,
        assignments: document.querySelectorAll(".roles-assignment-table tbody tr").length,
        writeDisabled: document.querySelector('[data-ui-component="ActionButton"]')?.disabled === true,
        revision: target?.getAttribute("data-react-island-revision"),
        commitMs: Number(target?.getAttribute("data-react-island-commit-ms")),
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    assert(initial.roles >= 3 && initial.modules > 0, "canonical roles and module definitions must render");
    assert(initial.assignments >= 1, "explicit PostgreSQL role assignment must render");
    assert(initial.writeDisabled && initial.revision === "1", "production island must remain read-only and report its first commit");
    assert(Number.isFinite(initial.commitMs) && initial.commitMs >= 0 && initial.commitMs < 2000, `first Roles commit must stay below 2000 ms, got ${initial.commitMs}`);
    assert(!initial.pageOverflow, "Roles island must not create page-level overflow");

    const grantsBefore = JSON.stringify(apiDomains.registries.grants);
    const assignmentsBefore = JSON.stringify(apiDomains.registries.roleAssignments);
    const adminBefore = structuredClone(apiDomains.registries.accessRoles.find((role) => role.id === "admin"));
    primaryAuthorityReady = true;
    await evaluate(client, (key) => sessionStorage.setItem(key, "1"), SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY);
    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&react-roles=1&react-roles-write=1&qa-reload=roles-write` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-roles-island][data-react-island-state="ready"]')) && [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Редактировать паспорт" && !button.disabled), { message: "Roles PostgreSQL metadata write evaluation did not become ready", timeoutMs: 15_000 });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Редактировать паспорт")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector("[data-react-role-metadata-form]")), { message: "React role metadata editor did not open" });
    await evaluate(client, () => {
      const setControl = (selector, value) => { const control = document.querySelector(selector); const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value); control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); };
      setControl('input[name="label"]', "Администратор PostgreSQL QA");
      setControl('input[name="description"]', "Метаданные изменены React-сценарием");
      setControl('select[name="defaultModuleId"]', "");
    });
    forceConflictOnce = true;
    await evaluate(client, () => document.querySelector("[data-react-role-metadata-form]")?.requestSubmit());
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("изменились в другом сеансе"), { message: "role metadata revision conflict was not visible" });
    assert(apiRevision === 1 && successfulWrites === 0 && putAttempts === 1, "conflicted role metadata edit must not mutate System Domains");
    await evaluate(client, () => document.querySelector("[data-react-role-metadata-form]")?.requestSubmit());
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].some((item) => item.textContent?.includes("Администратор PostgreSQL QA")) && !document.querySelector("[data-react-role-metadata-form]"), { message: "role metadata retry did not return through React", timeoutMs: 15_000 });
    assert(apiRevision === 2 && successfulWrites === 1 && putAttempts === 2, "role metadata retry must advance exactly one PostgreSQL revision");
    const adminAfter = apiDomains.registries.accessRoles.find((role) => role.id === "admin");
    assert(adminAfter?.label === "Администратор PostgreSQL QA" && adminAfter?.description === "Метаданные изменены React-сценарием" && adminAfter?.defaultModuleId === "", "React role metadata fields were not persisted");
    assert(adminAfter?.scope === adminBefore.scope && adminAfter?.readOnly === adminBefore.readOnly && adminAfter?.isActive === adminBefore.isActive && adminAfter?.serverOnlyMarker === "role-hidden-field", "role metadata edit changed protected or hidden fields");
    assert(JSON.stringify(apiDomains.registries.grants) === grantsBefore && JSON.stringify(apiDomains.registries.roleAssignments) === assignmentsBefore, "role metadata edit changed grants or assignments");
    assert(commandRequests.every((request) => request.surface === "access-control" && request.ifMatch === `"${request.expectedRevision}"` && request.idempotencyKey), "role metadata commands must carry access-control surface, If-Match and idempotency key");

    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&qa-reload=roles-legacy-readback` });
    await waitForCondition(client, () => Boolean(document.querySelector(".access-roles-page")), { message: "legacy Roles did not return after React write" });
    await evaluate(client, () => document.querySelector('[data-access-role-select="admin"]')?.click());
    await waitForCondition(client, () => document.querySelector('[data-access-role-field="admin"][data-access-role-field-name="label"]')?.value === "Администратор PostgreSQL QA", { message: "legacy Roles did not read back React metadata" });
    assert(consoleProblems.length === 0, `browser console must stay clean:\n${consoleProblems.join("\n")}`);
    assert(await readFile(sharedStateFile, "utf8") === originalSnapshot, "read-only Roles scenario must not modify state");
    console.log("Roles React production-shell functional QA: OK");
    console.log(`- ${initial.roles} canonical roles, ${initial.modules} modules, explicit assignments: pass`);
    console.log("- server-enabled default without session request: legacy");
    console.log(`- first React commit: ${initial.commitMs.toFixed(2)} ms (< 2000 ms local gate)`);
    console.log("- metadata save, conflict retry, protected registries, hidden field and legacy read-back: pass");
    console.log("- unchanged compatibility snapshot and clean console: pass");
  } catch (error) {
    if (previewOutput.trim()) console.error(previewOutput.trim());
    throw error;
  } finally {
    if (chrome) await cleanupChrome(chrome);
    await stopProcess(preview);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
