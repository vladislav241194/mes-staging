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
        { id: "admin", label: "Администратор QA", scope: "factory", defaultModule: "roles", modulePermissions: { roles: { view: true, print: true, assign: true, configure: true } } },
        { id: "master", label: "Мастер QA", scope: "workCenter", defaultModule: "shiftMasterBoard", modulePermissions: { shiftMasterBoard: { view: true, edit: true, assign: true }, timesheet: { view: true } } },
        { id: "auditor", label: "Аудитор QA", scope: "factory", defaultModule: "roles", readOnly: true, modulePermissions: { roles: { view: true, print: true }, gantt: { view: true, print: true } } },
        { id: "reserve", label: "Резервная роль QA", scope: "factory", defaultModule: "roles", modulePermissions: { roles: { view: true, print: true } } },
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
  assert(migration.domains.registries.accessRoles.find((role) => role.id === "auditor")?.readOnly === true, "System Domains migration must preserve the read-only role contract");
  const adminRole = migration.domains.registries.accessRoles.find((role) => role.id === "admin");
  const reserveRole = migration.domains.registries.accessRoles.find((role) => role.id === "reserve");
  assert(adminRole, "canonical Roles fixture must contain admin");
  assert(reserveRole, "canonical Roles fixture must contain an unassigned lifecycle role");
  adminRole.serverOnlyMarker = "role-hidden-field";
  reserveRole.serverOnlyMarker = "role-lifecycle-hidden-field";
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
      const layout = getComputedStyle(target.querySelector(".module-layout"));
      const sidebar = getComputedStyle(target.querySelector(".module-sidebar"));
      const panel = getComputedStyle(target.querySelector(".panel"));
      const metrics = getComputedStyle(target.querySelector(".metric-grid"));
      const token = getComputedStyle(target.querySelector(".status"));
      const canonicalRadius = Number.parseFloat(
        getComputedStyle(target).getPropertyValue("--mes-ui-radius-md"),
      );
      return {
        roles: document.querySelectorAll('[data-ui-component="SidebarItem"]').length,
        modules: document.querySelectorAll(".roles-grant-table tbody tr").length,
        assignments: document.querySelectorAll(".roles-assignment-table tbody tr").length,
        writeDisabled: document.querySelector('[data-ui-component="ActionButton"]')?.disabled === true,
        revision: target?.getAttribute("data-react-island-revision"),
        commitMs: Number(target?.getAttribute("data-react-island-commit-ms")),
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        layoutDisplay: layout.display,
        layoutColumns: layout.gridTemplateColumns.split(" ").length,
        sidebarMinHeight: Number.parseFloat(sidebar.minHeight),
        sidebarHeight: target.querySelector(".module-sidebar").getBoundingClientRect().height,
        panelRadius: Number.parseFloat(panel.borderRadius),
        canonicalRadius,
        metricsDisplay: metrics.display,
        tokenBackground: token.backgroundColor,
      };
    });
    assert(initial.roles >= 3 && initial.modules > 0, "canonical roles and module definitions must render");
    assert(initial.assignments >= 1, "explicit PostgreSQL role assignment must render");
    assert(initial.writeDisabled && initial.revision === "1", "production island must remain read-only and report its first commit");
    assert(Number.isFinite(initial.commitMs) && initial.commitMs >= 0 && initial.commitMs < 2000, `first Roles commit must stay below 2000 ms, got ${initial.commitMs}`);
    assert(!initial.pageOverflow, "Roles island must not create page-level overflow");
    assert(
      initial.layoutDisplay === "grid"
        && initial.layoutColumns === 2
        && initial.sidebarMinHeight === 0
        && initial.sidebarHeight >= 600
        && initial.panelRadius === initial.canonicalRadius
        && initial.metricsDisplay === "grid"
        && initial.tokenBackground !== "rgba(0, 0, 0, 0)",
      `Roles production UI contract failed: ${JSON.stringify(initial)}`,
    );

    await client.send("Emulation.setDeviceMetricsOverride", { width: 487, height: 844, deviceScaleFactor: 1, mobile: false });
    await waitForCondition(client, () => Boolean(
      document.querySelector('[data-react-roles-island][data-react-island-state="ready"] .module-layout')
      && document.querySelector('[data-react-roles-island] [data-ui-component="ModuleWorkspace"]')
      && document.querySelector("[data-react-roles-island] .metric-grid"),
    ), { message: "Roles React island did not settle after compact viewport change", timeoutMs: 15_000 });
    const compact = await evaluate(client, () => {
      const target = document.querySelector("[data-react-roles-island]");
      const layout = getComputedStyle(target.querySelector(".module-layout"));
      const workspace = getComputedStyle(target.querySelector('[data-ui-component="ModuleWorkspace"]'));
      const sidebar = getComputedStyle(target.querySelector(".module-sidebar"));
      const metrics = getComputedStyle(target.querySelector(".metric-grid"));
      const tableWrap = target.querySelector(".roles-grant-table")?.parentElement;
      const gridTrackCount = (template) => {
        const repeat = template.match(/^repeat\((\d+),/);
        return repeat ? Number(repeat[1]) : template.trim().split(/\s+/).length;
      };
      return {
        layoutColumns: gridTrackCount(layout.gridTemplateColumns),
        workspaceColumns: gridTrackCount(workspace.gridTemplateColumns),
        sidebarColumns: gridTrackCount(sidebar.gridTemplateColumns),
        sidebarTemplate: sidebar.gridTemplateColumns,
        sidebarMinHeight: Number.parseFloat(sidebar.minHeight),
        metricColumns: gridTrackCount(metrics.gridTemplateColumns),
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        tableScroll: tableWrap.scrollWidth > tableWrap.clientWidth,
      };
    });
    assert(compact.layoutColumns === 1 && compact.workspaceColumns === 1 && compact.sidebarColumns === 2 && compact.sidebarMinHeight === 0 && compact.metricColumns === 2 && !compact.pageOverflow && compact.tableScroll, `Roles compact UI contract failed: ${JSON.stringify(compact)}`);
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    const grantsBeforeRows = structuredClone(apiDomains.registries.grants);
    const grantsBefore = JSON.stringify(grantsBeforeRows);
    const assignmentsBefore = JSON.stringify(apiDomains.registries.roleAssignments);
    const adminBefore = structuredClone(apiDomains.registries.accessRoles.find((role) => role.id === "admin"));
    const reserveBefore = structuredClone(apiDomains.registries.accessRoles.find((role) => role.id === "reserve"));
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
    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&react-roles=1&react-roles-write=1&qa-reload=roles-grant-write` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-roles-island][data-react-island-state="ready"]')) && [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].some((item) => item.textContent?.includes("Аудитор QA")), { message: "Roles grant write evaluation did not become ready", timeoutMs: 15_000 });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Аудитор QA"))?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-role-grant="auditor:timesheet:edit"]')), { message: "auditor grant matrix did not render" });
    assert(await evaluate(client, () => document.querySelector('[data-react-role-grant="auditor:timesheet:edit"]')?.disabled === true), "read-only role must fail closed for mutating grants");
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Мастер QA"))?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-role-grant="master:timesheet:print"]')), { message: "master grant matrix did not render" });
    assert(await evaluate(client, () => document.querySelector('[data-react-role-grant="master:shiftMasterBoard:view"]')?.disabled === true), "view grant with dependent actions must fail closed until dependencies are removed");
    assert(await evaluate(client, () => document.querySelector('[data-react-role-grant="master:timesheet:print"]')?.checked === false), "grant QA target must start disabled");
    forceConflictOnce = true;
    await evaluate(client, () => document.querySelector('[data-react-role-grant="master:timesheet:print"]')?.click());
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("изменились в другом сеансе"), { message: "grant revision conflict was not visible" });
    assert(apiRevision === 2 && successfulWrites === 1 && putAttempts === 3, "conflicted grant must not mutate System Domains");
    await waitForCondition(client, () => document.querySelector('[data-react-role-grant="master:timesheet:print"]')?.disabled === false, { message: "grant control did not unlock after conflict" });
    await evaluate(client, () => document.querySelector('[data-react-role-grant="master:timesheet:print"]')?.click());
    for (let attempt = 0; attempt < 100 && apiRevision !== 3; attempt += 1) await delay(100);
    assert(apiRevision === 3 && successfulWrites === 2 && putAttempts === 4, "grant retry must advance exactly one PostgreSQL revision");
    const masterPrintGrant = apiDomains.registries.grants.find((grant) => grant.roleId === "master" && grant.resourceId === "timesheet" && grant.actionId === "print");
    assert(masterPrintGrant?.effect === "allow" && masterPrintGrant?.sourceRef?.system === "access-control", "grant owner did not persist the canonical allow row");
    assert(JSON.stringify(apiDomains.registries.roleAssignments) === assignmentsBefore, "grant edit changed role assignments");
    assert(apiDomains.registries.accessRoles.find((role) => role.id === "admin")?.serverOnlyMarker === "role-hidden-field", "grant edit changed a hidden role field");
    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&react-roles=1&react-roles-write=1&qa-reload=roles-grant-react-readback` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-roles-island][data-react-island-state="ready"]')), { message: "Roles React did not return for grant read-back", timeoutMs: 15_000 });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Мастер QA"))?.click());
    await waitForCondition(client, () => document.querySelector('[data-react-role-grant="master:timesheet:print"]')?.checked === true, { message: "grant retry did not hydrate through React", timeoutMs: 15_000 });
    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&qa-reload=roles-grant-legacy-readback` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-access-role-select="master"]')), { message: "legacy Roles did not return for grant read-back" });
    await evaluate(client, () => document.querySelector('[data-access-role-select="master"]')?.click());
    await waitForCondition(client, () => document.querySelector('[data-access-role-permission][data-access-role-id="master"][data-access-module-id="timesheet"][data-access-action-id="print"]')?.checked === true, { message: "legacy Roles did not read back React grant" });
    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&react-roles=1&react-roles-write=1&qa-reload=roles-grant-cleanup` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-roles-island][data-react-island-state="ready"]')), { message: "Roles React did not return for grant cleanup", timeoutMs: 15_000 });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Мастер QA"))?.click());
    await waitForCondition(client, () => document.querySelector('[data-react-role-grant="master:timesheet:print"]')?.checked === true, { message: "saved grant did not hydrate for cleanup" });
    await evaluate(client, () => document.querySelector('[data-react-role-grant="master:timesheet:print"]')?.click());
    for (let attempt = 0; attempt < 100 && apiRevision !== 4; attempt += 1) await delay(100);
    assert(apiRevision === 4 && successfulWrites === 3 && putAttempts === 5, "grant cleanup must advance exactly one PostgreSQL revision");
    const isTargetGrant = (grant) => grant.roleId === "master" && grant.resourceId === "timesheet" && grant.actionId === "print";
    const originalTargetGrant = grantsBeforeRows.find(isTargetGrant);
    const cleanedTargetGrant = apiDomains.registries.grants.find(isTargetGrant);
    assert(originalTargetGrant?.effect !== "allow" && cleanedTargetGrant?.effect === "deny", "grant cleanup did not restore the original denied permission");
    assert(JSON.stringify(apiDomains.registries.grants.filter((grant) => !isTargetGrant(grant))) === JSON.stringify(grantsBeforeRows.filter((grant) => !isTargetGrant(grant))), "grant command changed unrelated grant rows");
    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&react-roles=1&react-roles-write=1&qa-reload=roles-grant-cleanup-readback` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-roles-island][data-react-island-state="ready"]')), { message: "Roles React did not return after grant cleanup", timeoutMs: 15_000 });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Мастер QA"))?.click());
    await waitForCondition(client, () => document.querySelector('[data-react-role-grant="master:timesheet:print"]')?.checked === false, { message: "grant cleanup did not hydrate through React", timeoutMs: 15_000 });
    assert(await evaluate(client, () => document.querySelector('[data-react-role-default-scope="master"]')?.value === "workCenter"), "default-scope QA target must start at workCenter");
    const changeMasterScope = async (value) => evaluate(client, (nextValue) => {
      const control = document.querySelector('[data-react-role-default-scope="master"]');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(control, nextValue);
      control.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    forceConflictOnce = true;
    await changeMasterScope("self");
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("изменились в другом сеансе"), { message: "default-scope revision conflict was not visible" });
    assert(apiRevision === 4 && successfulWrites === 3 && putAttempts === 6, "conflicted default scope must not mutate System Domains");
    await waitForCondition(client, () => document.querySelector('[data-react-role-default-scope="master"]')?.disabled === false, { message: "default-scope control did not unlock after conflict" });
    await changeMasterScope("self");
    for (let attempt = 0; attempt < 100 && apiRevision !== 5; attempt += 1) await delay(100);
    assert(apiRevision === 5 && successfulWrites === 4 && putAttempts === 7, "default-scope retry must advance exactly one PostgreSQL revision");
    assert(apiDomains.registries.accessRoles.find((role) => role.id === "master")?.scope === "self", "default-scope owner did not persist the selected scope");
    assert(JSON.stringify(apiDomains.registries.roleAssignments) === assignmentsBefore, "default-scope edit changed role assignments");
    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&qa-reload=roles-scope-legacy-readback` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-access-role-select="master"]')), { message: "legacy Roles did not return for default-scope read-back" });
    await evaluate(client, () => document.querySelector('[data-access-role-select="master"]')?.click());
    await waitForCondition(client, () => document.querySelector('[data-access-role-field="master"][data-access-role-field-name="scope"]')?.value === "self", { message: "legacy Roles did not read back React default scope" });
    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&react-roles=1&react-roles-write=1&qa-reload=roles-scope-cleanup` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-roles-island][data-react-island-state="ready"]')), { message: "Roles React did not return for default-scope cleanup", timeoutMs: 15_000 });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Мастер QA"))?.click());
    await waitForCondition(client, () => document.querySelector('[data-react-role-default-scope="master"]')?.value === "self", { message: "saved default scope did not hydrate for cleanup" });
    await changeMasterScope("workCenter");
    for (let attempt = 0; attempt < 100 && apiRevision !== 6; attempt += 1) await delay(100);
    assert(apiRevision === 6 && successfulWrites === 5 && putAttempts === 8, "default-scope cleanup must advance exactly one PostgreSQL revision");
    assert(apiDomains.registries.accessRoles.find((role) => role.id === "master")?.scope === "workCenter", "default-scope cleanup did not restore the original role scope");
    assert(JSON.stringify(apiDomains.registries.roleAssignments) === assignmentsBefore && apiDomains.registries.accessRoles.find((role) => role.id === "admin")?.serverOnlyMarker === "role-hidden-field", "default-scope command changed assignments or a hidden role field");
    const grantsLifecycleBefore = JSON.stringify(apiDomains.registries.grants);

    const assignmentAction = async (label) => evaluate(client, (text) => { const button = [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((item) => item.textContent?.trim() === text); button?.click(); return Boolean(button); }, label);
    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&react-roles=1&react-roles-write=1&qa-reload=roles-assignment-write` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-roles-island][data-react-island-state="ready"]')), { message: "Roles React did not stabilize before assignment evaluation", timeoutMs: 15_000 });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Мастер QA"))?.click());
    await waitForCondition(client, () => document.querySelector('[data-react-role-default-scope="master"]')?.value === "workCenter", { message: "master role was not selected before assignment evaluation" });
    assert(await assignmentAction("Изменить назначение"), "assignment editor action was not available for the selected role");
    try {
      await waitForCondition(client, (employeeId) => document.querySelector(`[data-react-role-assignment-confirm="${employeeId}"]`)?.textContent?.includes(`stable employee ID ${employeeId}`), { arg: employeeIds[1], message: "assignment confirmation was not bound to exact employee ID" });
    } catch (error) {
      const diagnostic = await evaluate(client, () => ({ confirmId: document.querySelector("[data-react-role-assignment-confirm]")?.getAttribute("data-react-role-assignment-confirm") || "", text: document.querySelector("[data-react-role-assignment-confirm]")?.textContent?.replace(/\s+/g, " ").trim() || "", selected: [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.getAttribute("aria-current") === "true")?.textContent?.trim() || "" }));
      throw new Error(`${error.message}: ${JSON.stringify({ expected: employeeIds[1], diagnostic })}`);
    }
    await assignmentAction("Отмена");
    await waitForCondition(client, () => !document.querySelector("[data-react-role-assignment-confirm]"), { message: "assignment confirmation did not cancel" });
    assert(apiRevision === 6 && successfulWrites === 5 && putAttempts === 8, "cancelled assignment must not reach PUT");
    await assignmentAction("Изменить назначение");
    await waitForCondition(client, () => Boolean(document.querySelector("[data-react-role-assignment-role]")), { message: "assignment editor did not reopen" });
    await evaluate(client, () => { const field = document.querySelector("[data-react-role-assignment-role]"); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(field, "reserve"); field.dispatchEvent(new Event("change", { bubbles: true })); });
    forceConflictOnce = true;
    assert(await assignmentAction("Подтвердить назначение"), "assignment confirmation action disappeared before conflict");
    try {
      await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("Назначения изменились"), { message: "assignment revision conflict was not visible" });
    } catch (error) {
      const alert = await evaluate(client, () => document.querySelector('[role="alert"]')?.textContent?.trim() || "");
      throw new Error(`${error.message}: ${alert}`);
    }
    assert(apiRevision === 6 && successfulWrites === 5 && putAttempts === 9, "conflicted assignment must not mutate System Domains");
    assert(await assignmentAction("Подтвердить назначение"), "assignment confirmation action disappeared before retry");
    for (let attempt = 0; attempt < 100 && apiRevision !== 7; attempt += 1) await delay(100);
    assert(apiRevision === 7 && successfulWrites === 6 && putAttempts === 10, "assignment retry must advance exactly one PostgreSQL revision");
    assert(apiDomains.registries.roleAssignments.find((row) => row.employeeId === employeeIds[1])?.roleId === "reserve", "assignment owner did not persist the replacement role");
    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&qa-reload=roles-assignment-legacy-readback` });
    try {
      await waitForCondition(client, (employeeId) => document.querySelector(`[data-access-role-assignment="${employeeId}"]`)?.value === "reserve", { arg: employeeIds[1], message: "legacy Roles did not read back the replacement assignment", timeoutMs: 15_000 });
    } catch (error) {
      const diagnostic = await evaluate(client, () => [...document.querySelectorAll("[data-access-role-assignment]")].slice(0, 6).map((field) => ({ id: field.getAttribute("data-access-role-assignment"), value: field.value })));
      throw new Error(`${error.message}: ${JSON.stringify({ expected: employeeIds[1], diagnostic })}`);
    }
    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&react-roles=1&react-roles-write=1&qa-reload=roles-assignment-cleanup` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-roles-island][data-react-island-state="ready"]')), { message: "Roles React did not return for assignment cleanup", timeoutMs: 15_000 });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Резервная роль QA"))?.click());
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((item) => item.textContent?.trim() === "Изменить назначение" && !item.disabled), { message: "replacement assignment did not hydrate through React" });
    await assignmentAction("Изменить назначение");
    await waitForCondition(client, () => document.querySelector("[data-react-role-assignment-role]")?.value === "reserve", { message: "assignment cleanup editor lost the authoritative previous role" });
    await evaluate(client, () => { const field = document.querySelector("[data-react-role-assignment-role]"); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(field, "master"); field.dispatchEvent(new Event("change", { bubbles: true })); });
    await assignmentAction("Подтвердить назначение");
    for (let attempt = 0; attempt < 100 && apiRevision !== 8; attempt += 1) await delay(100);
    assert(apiRevision === 8 && successfulWrites === 7 && putAttempts === 11, "assignment cleanup must advance exactly one PostgreSQL revision");
    const restoredAssignment = apiDomains.registries.roleAssignments.filter((row) => row.employeeId === employeeIds[1]);
    assert(restoredAssignment.length === 1 && restoredAssignment[0].roleId === "master" && apiDomains.registries.roleAssignments.length === JSON.parse(assignmentsBefore).length, "assignment cleanup did not restore the original effective role coordinates");
    restoredAssignment[0].validFrom = "2099-01-01";
    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&react-roles=1&react-roles-write=1&qa-reload=roles-assignment-dated-guard` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-roles-island][data-react-island-state="ready"]')), { message: "Roles React did not return for dated-assignment guard", timeoutMs: 15_000 });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Мастер QA"))?.click());
    await assignmentAction("Изменить назначение");
    await waitForCondition(client, () => Boolean(document.querySelector("[data-react-role-assignment-role]")), { message: "dated-assignment editor did not open" });
    await evaluate(client, () => { const field = document.querySelector("[data-react-role-assignment-role]"); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(field, "reserve"); field.dispatchEvent(new Event("change", { bubbles: true })); });
    await assignmentAction("Подтвердить назначение");
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("период действия"), { message: "dated assignment did not fail closed before PUT" });
    assert(apiRevision === 8 && successfulWrites === 7 && putAttempts === 11, "dated assignment guard must reject before PUT");
    delete restoredAssignment[0].validFrom;
    const assignmentsAfterCleanup = JSON.stringify(apiDomains.registries.roleAssignments);
    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&react-roles=1&react-roles-write=1&qa-reload=roles-lifecycle-write` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-roles-island][data-react-island-state="ready"]')), { message: "Roles React did not return for lifecycle evaluation", timeoutMs: 15_000 });

    const lifecycleAction = async (label) => evaluate(client, (text) => {
      const button = [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((item) => item.textContent?.trim() === text);
      button?.click();
    }, label);
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Мастер QA"))?.click());
    await waitForCondition(client, () => document.querySelector('[data-react-role-default-scope="master"]')?.value === "workCenter", { message: "master role was not selected before lifecycle guard" });
    assert(await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((item) => item.textContent?.trim() === "Деактивировать")?.disabled === true), "assigned role deactivation must be disabled in React");
    await lifecycleAction("Деактивировать");
    await delay(100);
    assert(!await evaluate(client, () => Boolean(document.querySelector('[data-react-role-lifecycle-confirm="master"]'))), "disabled assigned-role action must not open lifecycle confirmation");
    assert(apiRevision === 8 && successfulWrites === 7 && putAttempts === 11, "assigned role rejection must happen before PUT");

    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Резервная роль QA"))?.click());
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((item) => item.textContent?.trim() === "Деактивировать" && !item.disabled), { message: "unassigned role lifecycle action did not become available" });
    await lifecycleAction("Деактивировать");
    await waitForCondition(client, () => document.querySelector('[data-react-role-lifecycle-confirm="reserve"]')?.textContent?.includes("stable ID reserve"), { message: "reserve role lifecycle confirmation did not show exact stable ID" });
    forceConflictOnce = true;
    await lifecycleAction("Подтвердить деактивацию");
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("изменились в другом сеансе"), { message: "role lifecycle revision conflict was not visible" });
    assert(apiRevision === 8 && successfulWrites === 7 && putAttempts === 12 && apiDomains.registries.accessRoles.find((role) => role.id === "reserve")?.isActive !== false, "conflicted role deactivation must not mutate System Domains");
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((item) => item.textContent?.trim() === "Подтвердить деактивацию" && !item.disabled), { message: "role lifecycle confirmation did not unlock after conflict" });
    await lifecycleAction("Подтвердить деактивацию");
    for (let attempt = 0; attempt < 100 && apiRevision !== 9; attempt += 1) await delay(100);
    assert(apiRevision === 9 && successfulWrites === 8 && putAttempts === 13, "role deactivation retry must advance exactly one PostgreSQL revision");
    const reserveInactive = apiDomains.registries.accessRoles.find((role) => role.id === "reserve");
    assert(reserveInactive?.isActive === false && reserveInactive?.serverOnlyMarker === "role-lifecycle-hidden-field", "role owner did not persist inactive state or preserve hidden fields");
    assert(JSON.stringify(apiDomains.registries.grants) === grantsLifecycleBefore && JSON.stringify(apiDomains.registries.roleAssignments) === assignmentsAfterCleanup, "role deactivation changed grants or assignments");

    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&qa-reload=roles-lifecycle-legacy-inactive` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-access-role-select="reserve"]')), { message: "legacy Roles did not return for inactive role read-back" });
    await evaluate(client, () => document.querySelector('[data-access-role-select="reserve"]')?.click());
    await waitForCondition(client, () => document.querySelectorAll('[data-access-role-permission][data-access-role-id="reserve"]:checked').length === 0, { message: "legacy access enforcement did not deny grants for inactive role" });

    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&react-roles=1&react-roles-write=1&qa-reload=roles-lifecycle-reactivate` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-roles-island][data-react-island-state="ready"]')), { message: "Roles React did not return for reactivation", timeoutMs: 15_000 });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Резервная роль QA"))?.click());
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((item) => item.textContent?.trim() === "Активировать" && !item.disabled), { message: "inactive role did not expose reactivation" });
    assert(await evaluate(client, () => document.querySelectorAll('[data-react-role-grant^="reserve:"]:checked').length === 0), "inactive role must fail closed in the React grants projection");
    await lifecycleAction("Активировать");
    await waitForCondition(client, () => document.querySelector('[data-react-role-lifecycle-confirm="reserve"]')?.textContent?.includes("stable ID reserve"), { message: "role reactivation confirmation did not remain ID-bound" });
    await lifecycleAction("Подтвердить активацию");
    for (let attempt = 0; attempt < 100 && apiRevision !== 10; attempt += 1) await delay(100);
    assert(apiRevision === 10 && successfulWrites === 9 && putAttempts === 14, "role reactivation must advance exactly one PostgreSQL revision");
    const reserveActive = apiDomains.registries.accessRoles.find((role) => role.id === "reserve");
    assert(reserveActive?.isActive === true && reserveActive?.serverOnlyMarker === "role-lifecycle-hidden-field", "role owner did not restore active state or preserve hidden fields");
    assert(reserveActive?.label === reserveBefore?.label && reserveActive?.scope === reserveBefore?.scope && reserveActive?.defaultModuleId === reserveBefore?.defaultModuleId, "role lifecycle changed ordinary metadata");
    assert(JSON.stringify(apiDomains.registries.grants) === grantsLifecycleBefore && JSON.stringify(apiDomains.registries.roleAssignments) === assignmentsAfterCleanup, "role reactivation changed grants or assignments");
    await client.send("Page.navigate", { url: `${origin}/?module=roles&qa-auth-bypass=1&qa-reload=roles-lifecycle-legacy-active` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-access-role-select="reserve"]')), { message: "legacy Roles did not return after reactivation" });
    await evaluate(client, () => document.querySelector('[data-access-role-select="reserve"]')?.click());
    await waitForCondition(client, () => document.querySelector('[data-access-role-permission][data-access-role-id="reserve"][data-access-module-id="roles"][data-access-action-id="view"]')?.checked === true, { message: "legacy Roles did not read back restored active grants" });
    assert(commandRequests.every((request) => request.surface === "access-control" && request.ifMatch === `"${request.expectedRevision}"` && request.idempotencyKey), "all role commands must carry access-control surface, If-Match and idempotency key");
    assert(consoleProblems.length === 0, `browser console must stay clean:\n${consoleProblems.join("\n")}`);
    assert(await readFile(sharedStateFile, "utf8") === originalSnapshot, "read-only Roles scenario must not modify state");
    console.log("Roles React production-shell functional QA: OK");
    console.log(`- ${initial.roles} canonical roles, ${initial.modules} modules, explicit assignments: pass`);
    console.log("- server-enabled default without session request: legacy");
    console.log(`- first React commit: ${initial.commitMs.toFixed(2)} ms (< 2000 ms local gate)`);
    console.log("- metadata, grant, default-scope, exact-employee assignment and unassigned-role lifecycle save/cleanup, conflict retry, dated-window/read-only/dependency guards, hidden field and legacy read-back: pass");
    console.log("- production and compact UI contracts, unchanged compatibility snapshot and clean console: pass");
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
