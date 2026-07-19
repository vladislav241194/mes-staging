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
const qaConfig = process.env.MES_STRUCTURE_QA_REGISTRY === "migrationDiagnostics" ? {
  label: "Migration Diagnostics", registryId: "migrationDiagnostics", rowCount: 152, cellCount: 5, isDiagnostics: true, target: "data-react-structure-migration-diagnostics-island",
  featureFlag: "MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS", evaluationFlag: "MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS_READ_ONLY_EVALUATION",
  evaluationQuery: "react-structure-migration-diagnostics-evaluation", fallbackLabel: "Сотрудники", fallbackRegistry: "employees", fallbackCount: 76,
} : process.env.MES_STRUCTURE_QA_REGISTRY === "responsibilityPolicies" ? {
  label: "Responsibility Policies", registryId: "responsibilityPolicies", rowCount: 1, cellCount: 4, target: "data-react-structure-responsibility-policies-island",
  featureFlag: "MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES", evaluationFlag: "MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES_READ_ONLY_EVALUATION",
  evaluationQuery: "react-structure-responsibility-policies-evaluation", fallbackLabel: "Сотрудники", fallbackRegistry: "employees", fallbackCount: 76,
} : process.env.MES_STRUCTURE_QA_REGISTRY === "equipment" ? {
  label: "Equipment", registryId: "equipment", rowCount: 6, cellCount: 5, target: "data-react-structure-equipment-island",
  featureFlag: "MES_REACT_STRUCTURE_EQUIPMENT", evaluationFlag: "MES_REACT_STRUCTURE_EQUIPMENT_READ_ONLY_EVALUATION",
  evaluationQuery: "react-structure-equipment-evaluation", fallbackLabel: "Подразделения", fallbackRegistry: "orgUnits", fallbackCount: 19,
} : process.env.MES_STRUCTURE_QA_REGISTRY === "workCenters" ? {
  label: "Work Centers", registryId: "workCenters", rowCount: 19, cellCount: 5, target: "data-react-structure-work-centers-island",
  featureFlag: "MES_REACT_STRUCTURE_WORK_CENTERS", evaluationFlag: "MES_REACT_STRUCTURE_WORK_CENTERS_READ_ONLY_EVALUATION",
  evaluationQuery: "react-structure-work-centers-evaluation", fallbackLabel: "Оборудование", fallbackRegistry: "equipment", fallbackCount: 6,
} : process.env.MES_STRUCTURE_QA_REGISTRY === "orgUnits" ? {
  label: "Org Units", registryId: "orgUnits", rowCount: 19, cellCount: 5, target: "data-react-structure-org-units-island",
  featureFlag: "MES_REACT_STRUCTURE_ORG_UNITS", evaluationFlag: "MES_REACT_STRUCTURE_ORG_UNITS_READ_ONLY_EVALUATION",
  evaluationQuery: "react-structure-org-units-evaluation", fallbackLabel: "Рабочие центры", fallbackRegistry: "workCenters", fallbackCount: 19,
} : {
  label: "Positions", registryId: "positions", rowCount: 49, cellCount: 5, target: "data-react-structure-positions-island",
  featureFlag: "MES_REACT_STRUCTURE_POSITIONS", evaluationFlag: "MES_REACT_STRUCTURE_POSITIONS_READ_ONLY_EVALUATION",
  evaluationQuery: "react-structure-positions-evaluation", fallbackLabel: "Подразделения", fallbackRegistry: "orgUnits", fallbackCount: 19,
};
async function waitPreview(origin) {
  for (let index = 0; index < 80; index += 1) {
    try { const response = await fetch(`${origin}/?module=productionStructureMatrix&qa-auth-bypass=1`, { cache: "no-store" }); const html = await response.text(); if (response.ok && html.includes('id="app"') && !html.includes("MES Admin")) return; } catch {}
    await delay(120);
  }
  throw new Error(`Structure Positions preview did not start at ${origin}`);
}
async function stop(child) { if (child.exitCode === null && !child.killed) child.kill("SIGTERM"); await new Promise((resolve) => { if (child.exitCode !== null) return resolve(); const timer = setTimeout(resolve, 1200); child.once("exit", () => { clearTimeout(timer); resolve(); }); }); }
async function selectRegistry(client, registryId) { await waitForCondition(client, (id) => Boolean(document.querySelector(`[data-system-domain-registry="${id}"]`)), { arg: registryId, message: `registry ${registryId} missing` }); await evaluate(client, (id) => document.querySelector(`[data-system-domain-registry="${id}"]`)?.click(), registryId); }

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-structure-positions-react-"));
const sharedStateFile = join(temporaryRoot, "shared-state.json");
const baseline = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS });
const supervisorPosition = baseline.domains.registries.positions.find((position) => position.kind === "supervisor");
const masterId = baseline.domains.registries.employmentAssignments.find((assignment) => assignment.positionId === supervisorPosition?.id)?.employeeId || "";
const executorId = baseline.domains.registries.employmentAssignments.find((assignment) => assignment.employeeId !== masterId)?.employeeId || "";
assert(masterId && executorId, "canonical fixture must contain access subjects");
const migration = migrateLegacySystemDomains({
  matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS,
  legacyUi: {
    accessRoleProfiles: [
      { id: "admin", label: "Администратор QA", scope: "global", defaultModule: "productionStructureMatrix", modulePermissions: { productionStructureMatrix: { view: true, edit: true } } },
      { id: "master", label: "Мастер производства", scope: "workCenter", defaultModule: "shiftMasterBoard", modulePermissions: { productionStructureMatrix: { view: true, edit: true } } },
      { id: "executor", label: "Исполнитель", scope: "self", defaultModule: "authSessionPrototype", modulePermissions: { productionStructureMatrix: { view: true, edit: false } } },
    ],
    accessRoleAssignments: { [masterId]: "master", [executorId]: "executor" },
  },
  migratedAt: "2026-07-19T00:00:00.000Z",
});
if (qaConfig.registryId === "responsibilityPolicies") {
  migration.domains.registries.responsibilityPolicies = [{ id: "POLICY-QA-001", subjectEmployeeId: masterId, mode: "manual", targetEmployeeIds: [executorId], updatedAt: "2026-07-19T00:00:00.000Z" }];
}
assert(migration.report.validation.valid && (qaConfig.isDiagnostics ? PRODUCTION_STRUCTURE_MATRIX_ROWS.length : migration.domains.registries[qaConfig.registryId].length) === qaConfig.rowCount, `canonical fixture must contain ${qaConfig.rowCount} valid ${qaConfig.label}`);
const snapshot = { version: 1, updatedAt: "2026-07-19T00:00:00.000Z", updatedBy: { actor: "structure-positions-react-functional-qa" }, values: { [STATE_STORAGE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }), [SYSTEM_DOMAINS_STORAGE_KEY]: serializeSystemDomains(migration.domains) }, sharedUi: {}, events: [] };
await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary shared state permissions changed");
const original = await readFile(sharedStateFile, "utf8");
const enabledPort = await getFreePort(); const legacyPort = await getFreePort();
const enabledOrigin = `http://127.0.0.1:${enabledPort}`; const legacyOrigin = `http://127.0.0.1:${legacyPort}`;
const start = (port, enabled) => spawn(process.execPath, ["scripts/preview-dist.mjs"], { cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru", MES_SHARED_STATE_FILE: sharedStateFile, ...(enabled ? { [qaConfig.featureFlag]: "1", [qaConfig.evaluationFlag]: "1" } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
const enabledPreview = start(enabledPort, true); const legacyPreview = start(legacyPort, false);
let enabledOutput = ""; let legacyOutput = "";
enabledPreview.stdout.on("data", (chunk) => { enabledOutput += chunk.toString(); }); enabledPreview.stderr.on("data", (chunk) => { enabledOutput += chunk.toString(); });
legacyPreview.stdout.on("data", (chunk) => { legacyOutput += chunk.toString(); }); legacyPreview.stderr.on("data", (chunk) => { legacyOutput += chunk.toString(); });
let chrome = null; let interceptedReads = 0; const consoleProblems = [];
let apiDomains = structuredClone(migration.domains); let apiRevision = 1; let putAttempts = 0; let successfulWrites = 0; let forceConflictOnce = false; let primaryAuthorityReady = false; const commandRequests = [];
try {
  await Promise.all([waitPreview(enabledOrigin), waitPreview(legacyOrigin)]);
  chrome = await launchChrome("mes-structure-positions-react-qa-"); const { client } = chrome;
  const responseBody = (value) => Buffer.from(JSON.stringify(value)).toString("base64");
  const fulfill = (requestId, payload, { statusCode = 200, revision = apiRevision } = {}) => client.send("Fetch.fulfillRequest", { requestId, responseCode: statusCode, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }, { name: "ETag", value: `"${revision}"` }], body: responseBody(payload) }).catch((error) => consoleProblems.push(error.message));
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Fetch.requestPaused") {
      const requestUrl = new URL(message.params.request.url);
      const method = String(message.params.request.method || "GET").toUpperCase();
      if (requestUrl.pathname === "/api/v1/system-domains/capabilities" && ["positions", "orgUnits", "workCenters", "equipment", "responsibilityPolicies"].includes(qaConfig.registryId)) {
        interceptedReads += 1;
        const consistency = primaryAuthorityReady ? { consistency: { details: { authority: { mode: "postgres-primary" } } } } : {};
        void fulfill(message.params.requestId, { ok: true, capabilities: { serverCommandsEnabled: true, serverCommandSurfaces: ["production-structure", "timesheet", "access-control"], ...consistency } });
      }
      else if (requestUrl.pathname === "/api/v1/system-domains" && method === "GET") { interceptedReads += 1; void fulfill(message.params.requestId, { ok: true, revision: apiRevision, item: apiDomains }); }
      else if (requestUrl.pathname === "/api/v1/system-domains" && method === "PUT" && ["positions", "orgUnits", "workCenters", "equipment", "responsibilityPolicies"].includes(qaConfig.registryId)) {
        putAttempts += 1; const requestHeaders = message.params.request.headers || {}; const header = (name) => Object.entries(requestHeaders).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] || ""; const body = JSON.parse(message.params.request.postData || "{}");
        commandRequests.push({ expectedRevision: Number(body.expectedRevision || 0), ifMatch: String(header("If-Match")), idempotencyKey: String(header("Idempotency-Key")), surface: String(body.surface || "") });
        if (forceConflictOnce) { forceConflictOnce = false; void fulfill(message.params.requestId, { ok: false, conflict: true, revision: apiRevision, error: "System Domains revision conflict" }, { statusCode: 409 }); }
        else if (Number(body.expectedRevision) !== apiRevision || String(header("If-Match")) !== `"${apiRevision}"`) void fulfill(message.params.requestId, { ok: false, conflict: true, revision: apiRevision, error: "stale revision" }, { statusCode: 409 });
        else { apiDomains = structuredClone(body.domains); apiRevision += 1; successfulWrites += 1; void fulfill(message.params.requestId, { ok: true, revision: apiRevision, item: apiDomains, snapshotSync: { queued: true } }); }
      }
      else void client.send("Fetch.continueRequest", { requestId: message.params.requestId }).catch((error) => consoleProblems.push(error.message));
      return;
    }
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
  });
  await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/system-domains*", requestStage: "Request" }] }); await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  await client.send("Page.navigate", { url: `${legacyOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1` });
  await waitForCondition(client, () => document.querySelectorAll('[data-system-domain-table="orgUnits"] [data-system-domain-row]').length === 19, { message: "legacy canonical payload missing" });
  await selectRegistry(client, qaConfig.registryId); await waitForCondition(client, (config) => document.querySelectorAll(config.isDiagnostics ? "[data-migration-source-row]" : `[data-system-domain-table="${config.registryId}"] [data-system-domain-row]`).length === config.rowCount, { arg: qaConfig, message: `legacy ${qaConfig.label} missing` });
  const legacyRows = await evaluate(client, (config) => [...document.querySelectorAll(config.isDiagnostics ? "[data-migration-source-row]" : `[data-system-domain-table="${config.registryId}"] [data-system-domain-row]`)].map((row) => { const cells = [...row.querySelectorAll("td")]; return (config.isDiagnostics ? cells : cells.slice(0, -1)).map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" "); }), qaConfig);
  const legacyMetrics = await evaluate(client, () => Object.fromEntries([...document.querySelectorAll('.production-structure-kpis article')].map((card) => [card.querySelector("span")?.textContent?.trim() || "", Number(card.querySelector("strong")?.textContent || 0)])));
  if (["positions", "orgUnits", "workCenters", "equipment", "responsibilityPolicies"].includes(qaConfig.registryId)) await evaluate(client, (key) => sessionStorage.setItem(key, "1"), SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY);

  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1` });
  await waitForCondition(client, () => document.querySelectorAll('[data-system-domain-table="orgUnits"] [data-system-domain-row]').length === 19, { message: "enabled default canonical payload missing" });
  await selectRegistry(client, qaConfig.registryId); await waitForCondition(client, (config) => document.querySelectorAll(config.isDiagnostics ? "[data-migration-source-row]" : `[data-system-domain-table="${config.registryId}"] [data-system-domain-row]`).length === config.rowCount, { arg: qaConfig, message: `enabled default did not retain legacy ${qaConfig.label}` });
  assert(await evaluate(client, (config) => !document.querySelector(`[${config.target}]`), qaConfig), "server permission without session request must remain legacy");

  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&${qaConfig.evaluationQuery}=1` });
  await waitForCondition(client, (config) => Boolean(document.querySelector(`[${config.target}][data-react-island-state="ready"]`) && document.querySelectorAll(config.isDiagnostics ? "[data-migration-source-row]" : '[data-ui-component="SelectableRow"]').length === config.rowCount), { arg: qaConfig, message: `Structure ${qaConfig.label} React island did not render ${qaConfig.rowCount} rows`, timeoutMs: 15_000 });
  const initial = await evaluate(client, (config) => { const target = document.querySelector(`[${config.target}]`); const selected = document.querySelector('[data-ui-component="SelectableRow"].is-selected'); const metrics = Object.fromEntries([...document.querySelectorAll('[data-ui-component="MetricCard"]')].map((card) => [card.querySelector("span")?.textContent?.trim() || "", Number(card.querySelector("strong")?.textContent || 0)])); const rowSelector = config.isDiagnostics ? "[data-migration-source-row]" : '[data-ui-component="SelectableRow"]'; return { rows: [...document.querySelectorAll(rowSelector)].map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ")), selectedText: selected?.textContent?.replace(/\s+/g, " ").trim() || "", detail: document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || "", disabled: config.isDiagnostics || document.querySelector('[data-ui-component="ActionButton"]')?.disabled === true, sidebarItems: document.querySelectorAll('[data-ui-component="SidebarItem"]').length, metrics, issueTitles: [...document.querySelectorAll('[data-ui-component="Panel"] h2')].map((heading) => heading.textContent?.trim() || ""), revision: target?.dataset.reactIslandRevision, commitMs: Number(target?.dataset.reactIslandCommitMs), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }; }, qaConfig);
  assert(JSON.stringify(initial.rows) === JSON.stringify(legacyRows), `React and legacy ${qaConfig.label} cells/order differ\nlegacy=${JSON.stringify(legacyRows)}\nreact=${JSON.stringify(initial.rows)}`);
  assert(initial.rows.length === qaConfig.rowCount && (qaConfig.isDiagnostics || initial.selectedText.includes(initial.detail)) && initial.disabled && initial.sidebarItems === 7 && initial.revision === "1", `${qaConfig.label} selection/detail/read-only/sidebar contract failed`);
  assert(qaConfig.isDiagnostics ? JSON.stringify(initial.metrics) === JSON.stringify(legacyMetrics) : initial.metrics["Подразделений"] === 19 && initial.metrics["Рабочих центров"] === 19 && initial.metrics["Должностей"] === 49 && initial.metrics["Сотрудников"] === 76 && initial.metrics["Оборудования"] === 6, `${qaConfig.label} metrics differ from legacy/System Domains: legacy=${JSON.stringify(legacyMetrics)} react=${JSON.stringify(initial.metrics)}`);
  if (qaConfig.isDiagnostics) assert(["Потерянные связи", "Дубликаты", "Неприменённые overrides", "Игнорированные legacy-строки"].every((title) => initial.issueTitles.includes(title)), "Migration Diagnostics issue groups are incomplete");
  assert(Number.isFinite(initial.commitMs) && initial.commitMs < 2000 && !initial.overflow, "Positions commit/overflow gate failed");
  if (!qaConfig.isDiagnostics) { const second = await evaluate(client, async () => { const rows = [...document.querySelectorAll('[data-ui-component="SelectableRow"]')]; const target = rows[Math.min(1, rows.length - 1)]; target?.click(); await new Promise((resolve) => setTimeout(resolve, 50)); return [document.querySelectorAll('[data-ui-component="SelectableRow"].is-selected').length, target?.textContent?.replace(/\s+/g, " ").trim() || "", document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || ""]; }); assert(second[0] === 1 && second[1].includes(second[2]), `${qaConfig.label} selection/detail synchronization failed`); }
  await evaluate(client, (config) => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((entry) => entry.textContent?.includes(config.fallbackLabel))?.click(), qaConfig);
  await waitForCondition(client, (config) => Boolean(!document.querySelector(`[${config.target}]`) && document.querySelectorAll(`[data-system-domain-table="${config.fallbackRegistry}"] [data-system-domain-row]`).length === config.fallbackCount), { arg: qaConfig, message: `${qaConfig.label} legacy fallback failed` });
  if (qaConfig.registryId === "positions") {
    primaryAuthorityReady = true;
    await evaluate(client, (key) => sessionStorage.setItem(key, "1"), SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY);
    const writeUrl = `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&react-structure-positions=1&react-structure-positions-write=1&qa-reload=positions-write`;
    await client.send("Page.navigate", { url: writeUrl });
    await waitForCondition(client, () => location.search.includes("qa-reload=positions-write") && document.readyState === "complete", { message: "Positions write page navigation did not complete" });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-structure-positions-island]')) || /Должностей\s*49/.test(document.querySelector(".production-structure-content")?.textContent || ""), { message: "Positions write shell did not hydrate revision 1" });
    await waitForCondition(client, () => { if (document.querySelector('[data-react-structure-positions-island]') || document.querySelector('[data-system-domain-table="positions"]')) return true; document.querySelector('[data-system-domain-registry="positions"]')?.click(); return false; }, { message: "Positions registry did not become active after hydration", timeoutMs: 10_000 });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-structure-positions-island][data-react-island-state="ready"]')) && [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Новая запись" && !button.disabled), { message: "Positions PostgreSQL write evaluation did not become ready", timeoutMs: 15_000 });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Новая запись")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('form.react-nomenclature-editor input[name="name"]')), { message: "new position editor did not open" });
    const references = { orgUnitId: migration.domains.registries.orgUnits[0].id, workCenterId: migration.domains.registries.workCenters[0].id, scheduleTemplateId: migration.domains.registries.scheduleTemplates[0].id };
    await evaluate(client, (values) => { const setControl = (selector, value) => { const control = document.querySelector(selector); if (!control) throw new Error(`missing ${selector}`); const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value); control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }; setControl('input[name="name"]', "Инженер PostgreSQL QA"); setControl('input[name="code"]', "QA-POS-01"); setControl('select[name="kind"]', "supervisor"); setControl('select[name="orgUnitId"]', values.orgUnitId); setControl('select[name="workCenterId"]', values.workCenterId); setControl('select[name="defaultScheduleTemplateId"]', values.scheduleTemplateId); document.querySelector('form.react-nomenclature-editor')?.requestSubmit(); }, references);
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-positions-island] [data-ui-component="SelectableRow"]').length === 50, { message: "created position did not return through PostgreSQL read model", timeoutMs: 15_000 });
    assert(apiRevision === 2 && successfulWrites === 1, "position create must advance one PostgreSQL revision");
    const created = apiDomains.registries.positions.find((position) => position.code === "QA-POS-01");
    assert(created?.id && created.orgUnitId === references.orgUnitId && created.workCenterId === references.workCenterId && created.defaultScheduleTemplateId === references.scheduleTemplateId, "created position references were not preserved");
    created.serverOnlyMarker = "position-hidden-field";

    const editUrl = `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&react-structure-positions=1&react-structure-positions-write=1&qa-reload=positions-revision-2`;
    await client.send("Page.navigate", { url: editUrl });
    await waitForCondition(client, () => location.search.includes("positions-revision-2") && document.readyState === "complete", { message: "Positions revision 2 navigation did not complete" });
    await waitForCondition(client, () => /Должностей\s*50/.test(document.querySelector(".production-structure-content")?.textContent || "") || document.querySelectorAll('[data-react-structure-positions-island] [data-ui-component="SelectableRow"]').length === 50, { message: "Positions revision 2 did not hydrate", timeoutMs: 15_000 });
    await waitForCondition(client, () => { if (document.querySelector('[data-react-structure-positions-island]') || document.querySelector('[data-system-domain-table="positions"]')) return true; document.querySelector('[data-system-domain-registry="positions"]')?.click(); return false; }, { message: "Positions edit registry did not become active", timeoutMs: 10_000 });
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-positions-island] [data-ui-component="SelectableRow"]').length === 50, { message: "Positions edit projection did not mount" });
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-positions-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), created.id);
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Редактировать должность")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('form.react-nomenclature-editor input[name="name"]')), { message: "position edit form did not open" });
    await evaluate(client, () => { const setInput = (selector, value) => { const input = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }; setInput('input[name="name"]', "Инженер PostgreSQL QA обновлён"); setInput('input[name="code"]', "QA-POS-02"); });
    forceConflictOnce = true;
    await evaluate(client, () => document.querySelector('form.react-nomenclature-editor')?.requestSubmit());
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("изменились в другом сеансе"), { message: "position revision conflict was not visible" });
    assert(apiRevision === 2 && successfulWrites === 1 && putAttempts === 2, "conflicted position edit must not mutate System Domains");
    await evaluate(client, () => document.querySelector('form.react-nomenclature-editor')?.requestSubmit());
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-positions-island] [data-ui-component="SelectableRow"]').length === 50 && [...document.querySelectorAll('[data-react-structure-positions-island] [data-ui-component="SelectableRow"]')].some((row) => row.textContent?.includes("Инженер PostgreSQL QA обновлён")), { message: "position edit retry did not return", timeoutMs: 15_000 });
    assert(apiRevision === 3 && successfulWrites === 2 && putAttempts === 3, "position edit retry must advance exactly one revision");
    const edited = apiDomains.registries.positions.find((position) => position.id === created.id);
    assert(edited?.name === "Инженер PostgreSQL QA обновлён" && edited?.serverOnlyMarker === "position-hidden-field", "position edit lost visible or hidden fields");
    const archiveUrl = `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&react-structure-positions=1&react-structure-positions-write=1&qa-reload=positions-archive-revision-3`;
    await client.send("Page.navigate", { url: archiveUrl });
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-positions-island] [data-ui-component="SelectableRow"]').length === 50, { message: "Positions archive projection did not hydrate", timeoutMs: 15_000 });
    const usedPositionId = apiDomains.registries.employmentAssignments.find((assignment) => assignment.positionId && assignment.isActive !== false && !assignment.validTo)?.positionId || "";
    assert(usedPositionId, "Positions archive QA requires one position with an active employment assignment");
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-positions-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), usedPositionId);
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Архивировать"), { message: "Used position archive action did not become available for host rejection proof" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Архивировать")?.click());
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Подтвердить архивирование")?.click());
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("действующим назначением"), { message: "position with active employment assignment was not rejected" });
    assert(apiRevision === 3 && successfulWrites === 2 && putAttempts === 3, "used position archive must fail before PostgreSQL mutation");
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-positions-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), created.id);
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Архивировать"), { message: "Position archive action did not become available" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Архивировать")?.click());
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Подтвердить архивирование"), { message: "Position archive confirmation was not explicit" });
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-positions-island] [data-ui-component="SelectableRow"]')].find((row) => !row.textContent?.includes(id))?.click(), created.id);
    assert(await evaluate(client, () => ![...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Подтвердить архивирование")), "position archive confirmation must not follow another selected row");
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-positions-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), created.id);
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Подтвердить архивирование"), { message: "Position-specific archive confirmation was not retained" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Подтвердить архивирование")?.click());
    await waitForCondition(client, () => [...document.querySelectorAll('[data-react-structure-positions-island] [data-ui-component="SelectableRow"]')].some((row) => row.textContent?.includes("Инженер PostgreSQL QA обновлён") && row.textContent?.includes("архив")), { message: "archived position did not return through PostgreSQL read model", timeoutMs: 15_000 });
    assert(apiRevision === 4 && successfulWrites === 3 && putAttempts === 4, "position archive must advance exactly one revision");
    const archived = apiDomains.registries.positions.find((position) => position.id === created.id);
    assert(archived?.isActive === false && Number.isFinite(Date.parse(archived?.archivedAt || "")), "position archive owner did not persist inactive state and archivedAt");
    assert(archived?.serverOnlyMarker === "position-hidden-field" && archived?.orgUnitId === references.orgUnitId && archived?.workCenterId === references.workCenterId && archived?.defaultScheduleTemplateId === references.scheduleTemplateId, "position archive changed hidden or reference fields");
    assert(commandRequests.every((request) => request.surface === "production-structure" && request.ifMatch === `"${request.expectedRevision}"` && request.idempotencyKey), "position commands must carry surface, If-Match and idempotency key");

    await client.send("Page.navigate", { url: `${legacyOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&qa-reload=positions-legacy-readback` });
    await waitForCondition(client, () => location.search.includes("positions-legacy-readback") && document.readyState === "complete", { message: "legacy Positions read-back navigation did not complete" });
    await waitForCondition(client, () => /Должностей\s*50/.test(document.querySelector(".production-structure-content")?.textContent || ""), { message: "legacy shell did not hydrate revised Positions", timeoutMs: 15_000 });
    await selectRegistry(client, "positions");
    await waitForCondition(client, () => document.querySelectorAll('[data-system-domain-table="positions"] [data-system-domain-row]').length === 50 && [...document.querySelectorAll('[data-system-domain-table="positions"] [data-system-domain-row]')].some((row) => row.textContent?.includes("Инженер PostgreSQL QA обновлён") && row.textContent?.includes("архив")), { message: "legacy Positions did not read back the React archive" });
  } else if (qaConfig.registryId === "orgUnits") {
    primaryAuthorityReady = true;
    await evaluate(client, (key) => sessionStorage.setItem(key, "1"), SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY);
    const writeUrl = `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&react-structure-org-units=1&react-structure-org-units-write=1&qa-reload=org-units-write`;
    await client.send("Page.navigate", { url: writeUrl });
    await waitForCondition(client, () => location.search.includes("qa-reload=org-units-write") && document.readyState === "complete", { message: "Org Units write page navigation did not complete" });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-structure-org-units-island]')) || /Подразделений\s*19/.test(document.querySelector(".production-structure-content")?.textContent || ""), { message: "Org Units write shell did not hydrate revision 1" });
    await waitForCondition(client, () => { if (document.querySelector('[data-react-structure-org-units-island]') || document.querySelector('[data-system-domain-table="orgUnits"]')) return true; document.querySelector('[data-system-domain-registry="orgUnits"]')?.click(); return false; }, { message: "Org Units registry did not become active after hydration", timeoutMs: 10_000 });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-structure-org-units-island][data-react-island-state="ready"]')) && [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Новая запись" && !button.disabled), { message: "Org Units PostgreSQL write evaluation did not become ready", timeoutMs: 15_000 });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Новая запись")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('form.react-nomenclature-editor input[name="name"]')), { message: "new org unit editor did not open" });
    const parentOrgUnitId = migration.domains.registries.orgUnits[0].id;
    await evaluate(client, (parentId) => { const setControl = (selector, value) => { const control = document.querySelector(selector); if (!control) throw new Error(`missing ${selector}`); const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value); control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }; setControl('input[name="name"]', "Участок PostgreSQL QA"); setControl('input[name="code"]', "QA-ORG-01"); setControl('select[name="kind"]', "section"); setControl('select[name="parentOrgUnitId"]', parentId); document.querySelector('form.react-nomenclature-editor')?.requestSubmit(); }, parentOrgUnitId);
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-org-units-island] [data-ui-component="SelectableRow"]').length === 20, { message: "created org unit did not return through PostgreSQL read model", timeoutMs: 15_000 });
    assert(apiRevision === 2 && successfulWrites === 1, "org unit create must advance one PostgreSQL revision");
    const created = apiDomains.registries.orgUnits.find((orgUnit) => orgUnit.code === "QA-ORG-01");
    assert(created?.id && created.kind === "section" && created.parentOrgUnitId === parentOrgUnitId, "created org unit hierarchy was not preserved");
    created.serverOnlyMarker = "org-unit-hidden-field";

    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-org-units-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), parentOrgUnitId);
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Редактировать подразделение")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('form.react-nomenclature-editor select[name="parentOrgUnitId"]')), { message: "parent org unit edit form did not open" });
    await evaluate(client, (childId) => { const select = document.querySelector('select[name="parentOrgUnitId"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, childId); select.dispatchEvent(new Event("change", { bubbles: true })); document.querySelector('form.react-nomenclature-editor')?.requestSubmit(); }, created.id);
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("цикл"), { message: "org unit hierarchy cycle was not rejected" });
    assert(apiRevision === 2 && successfulWrites === 1 && putAttempts === 1, "cycle rejection must occur before PostgreSQL mutation");

    const editUrl = `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&react-structure-org-units=1&react-structure-org-units-write=1&qa-reload=org-units-revision-2`;
    await client.send("Page.navigate", { url: editUrl });
    await waitForCondition(client, () => location.search.includes("org-units-revision-2") && document.readyState === "complete", { message: "Org Units revision 2 navigation did not complete" });
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-org-units-island] [data-ui-component="SelectableRow"]').length === 20, { message: "Org Units revision 2 did not hydrate", timeoutMs: 15_000 });
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-org-units-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), created.id);
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Редактировать подразделение")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('form.react-nomenclature-editor input[name="name"]')), { message: "org unit edit form did not open" });
    await evaluate(client, () => { const setInput = (selector, value) => { const input = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }; setInput('input[name="name"]', "Участок PostgreSQL QA обновлён"); setInput('input[name="code"]', "QA-ORG-02"); });
    forceConflictOnce = true;
    await evaluate(client, () => document.querySelector('form.react-nomenclature-editor')?.requestSubmit());
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("изменились в другом сеансе"), { message: "org unit revision conflict was not visible" });
    assert(apiRevision === 2 && successfulWrites === 1 && putAttempts === 2, "conflicted org unit edit must not mutate System Domains");
    await evaluate(client, () => document.querySelector('form.react-nomenclature-editor')?.requestSubmit());
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-org-units-island] [data-ui-component="SelectableRow"]').length === 20 && [...document.querySelectorAll('[data-react-structure-org-units-island] [data-ui-component="SelectableRow"]')].some((row) => row.textContent?.includes("Участок PostgreSQL QA обновлён")), { message: "org unit edit retry did not return", timeoutMs: 15_000 });
    assert(apiRevision === 3 && successfulWrites === 2 && putAttempts === 3, "org unit edit retry must advance exactly one revision");
    const edited = apiDomains.registries.orgUnits.find((orgUnit) => orgUnit.id === created.id);
    assert(edited?.name === "Участок PostgreSQL QA обновлён" && edited?.serverOnlyMarker === "org-unit-hidden-field", "org unit edit lost visible or hidden fields");
    const archiveUrl = `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&react-structure-org-units=1&react-structure-org-units-write=1&qa-reload=org-units-archive-revision-3`;
    await client.send("Page.navigate", { url: archiveUrl });
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-org-units-island] [data-ui-component="SelectableRow"]').length === 20, { message: "Org Units archive projection did not hydrate", timeoutMs: 15_000 });
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-org-units-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), parentOrgUnitId);
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Архивировать"), { message: "Referenced Org Unit archive action did not become available for host rejection proof" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Архивировать")?.click());
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Подтвердить архивирование")?.click());
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("действующими дочерними"), { message: "referenced Org Unit archive was not rejected" });
    assert(apiRevision === 3 && successfulWrites === 2 && putAttempts === 3, "referenced Org Unit archive must fail before PostgreSQL mutation");
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-org-units-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), created.id);
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Архивировать"), { message: "Leaf Org Unit archive action did not become available" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Архивировать")?.click());
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Подтвердить архивирование"), { message: "Org Unit archive confirmation was not explicit" });
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-org-units-island] [data-ui-component="SelectableRow"]')].find((row) => !row.textContent?.includes(id))?.click(), created.id);
    assert(await evaluate(client, () => ![...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Подтвердить архивирование")), "Org Unit archive confirmation must not follow another selected row");
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-org-units-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), created.id);
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Подтвердить архивирование"), { message: "Org Unit-specific archive confirmation was not retained" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Подтвердить архивирование")?.click());
    await waitForCondition(client, () => [...document.querySelectorAll('[data-react-structure-org-units-island] [data-ui-component="SelectableRow"]')].some((row) => row.textContent?.includes("Участок PostgreSQL QA обновлён") && row.textContent?.includes("архив")), { message: "archived Org Unit did not return through PostgreSQL read model", timeoutMs: 15_000 });
    assert(apiRevision === 4 && successfulWrites === 3 && putAttempts === 4, "Org Unit archive must advance exactly one revision");
    const archived = apiDomains.registries.orgUnits.find((orgUnit) => orgUnit.id === created.id);
    assert(archived?.isActive === false && Number.isFinite(Date.parse(archived?.archivedAt || "")), "Org Unit archive owner did not persist inactive state and archivedAt");
    assert(archived?.serverOnlyMarker === "org-unit-hidden-field" && archived?.parentOrgUnitId === parentOrgUnitId, "Org Unit archive changed hidden or parent fields");
    assert(commandRequests.every((request) => request.surface === "production-structure" && request.ifMatch === `"${request.expectedRevision}"` && request.idempotencyKey), "org unit commands must carry surface, If-Match and idempotency key");

    await client.send("Page.navigate", { url: `${legacyOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&qa-reload=org-units-legacy-readback` });
    await waitForCondition(client, () => /Подразделений\s*20/.test(document.querySelector(".production-structure-content")?.textContent || ""), { message: "legacy shell did not hydrate revised Org Units", timeoutMs: 15_000 });
    await selectRegistry(client, "orgUnits");
    await waitForCondition(client, () => document.querySelectorAll('[data-system-domain-table="orgUnits"] [data-system-domain-row]').length === 20 && [...document.querySelectorAll('[data-system-domain-table="orgUnits"] [data-system-domain-row]')].some((row) => row.textContent?.includes("Участок PostgreSQL QA обновлён") && row.textContent?.includes("архив")), { message: "legacy Org Units did not read back the React archive" });
  } else if (qaConfig.registryId === "workCenters") {
    primaryAuthorityReady = true;
    await evaluate(client, (key) => sessionStorage.setItem(key, "1"), SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY);
    const writeUrl = `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&react-structure-work-centers=1&react-structure-work-centers-write=1&qa-reload=work-centers-write`;
    await client.send("Page.navigate", { url: writeUrl });
    await waitForCondition(client, () => { if (document.querySelector('[data-react-structure-work-centers-island]') || document.querySelector('[data-system-domain-table="workCenters"]')) return true; document.querySelector('[data-system-domain-registry="workCenters"]')?.click(); return false; }, { message: "Work Centers registry did not become active after hydration", timeoutMs: 10_000 });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-structure-work-centers-island][data-react-island-state="ready"]')) && [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Новая запись" && !button.disabled), { message: "Work Centers PostgreSQL write evaluation did not become ready", timeoutMs: 15_000 });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Новая запись")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('form.react-nomenclature-editor input[name="name"]')), { message: "new work center editor did not open" });
    const references = { orgUnitId: migration.domains.registries.orgUnits[0].id, parentWorkCenterId: migration.domains.registries.workCenters[0].id };
    await evaluate(client, (values) => { const setControl = (selector, value) => { const control = document.querySelector(selector); if (!control) throw new Error(`missing ${selector}`); const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value); control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }; setControl('input[name="name"]', "Рабочий центр PostgreSQL QA"); setControl('input[name="code"]', "QA-WC-01"); setControl('select[name="orgUnitId"]', values.orgUnitId); setControl('select[name="parentWorkCenterId"]', values.parentWorkCenterId); setControl('select[name="participatesInPlanning"]', "false"); setControl('select[name="showInGantt"]', "false"); document.querySelector('form.react-nomenclature-editor')?.requestSubmit(); }, references);
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-work-centers-island] [data-ui-component="SelectableRow"]').length === 20, { message: "created work center did not return through PostgreSQL read model", timeoutMs: 15_000 });
    assert(apiRevision === 2 && successfulWrites === 1, "work center create must advance one PostgreSQL revision");
    const created = apiDomains.registries.workCenters.find((center) => center.code === "QA-WC-01");
    assert(created?.id && created.orgUnitId === references.orgUnitId && created.parentWorkCenterId === references.parentWorkCenterId && created.participatesInPlanning === false && created.showInGantt === false, "created work center hierarchy or Planning/Gantt flags were not preserved");
    created.serverOnlyMarker = "work-center-hidden-field";

    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-work-centers-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), references.parentWorkCenterId);
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Редактировать рабочий центр")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('select[name="parentWorkCenterId"]')), { message: "parent work center editor did not open" });
    await evaluate(client, (childId) => { const select = document.querySelector('select[name="parentWorkCenterId"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, childId); select.dispatchEvent(new Event("change", { bubbles: true })); document.querySelector('form.react-nomenclature-editor')?.requestSubmit(); }, created.id);
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("цикл"), { message: "work center hierarchy cycle was not rejected" });
    assert(apiRevision === 2 && putAttempts === 1, "work center hierarchy cycle must be rejected before PostgreSQL mutation");

    const editUrl = `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&react-structure-work-centers=1&react-structure-work-centers-write=1&qa-reload=work-centers-revision-2`;
    await client.send("Page.navigate", { url: editUrl });
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-work-centers-island] [data-ui-component="SelectableRow"]').length === 20, { message: "Work Centers revision 2 did not hydrate", timeoutMs: 15_000 });
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-work-centers-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), created.id);
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Редактировать рабочий центр")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('form.react-nomenclature-editor input[name="name"]')), { message: "work center edit form did not open" });
    await evaluate(client, () => { const setControl = (selector, value) => { const control = document.querySelector(selector); const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value); control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }; setControl('input[name="name"]', "Рабочий центр PostgreSQL QA обновлён"); setControl('input[name="code"]', "QA-WC-02"); setControl('select[name="parentWorkCenterId"]', ""); setControl('select[name="participatesInPlanning"]', "true"); setControl('select[name="showInGantt"]', "true"); });
    forceConflictOnce = true;
    await evaluate(client, () => document.querySelector('form.react-nomenclature-editor')?.requestSubmit());
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("изменились в другом сеансе"), { message: "work center revision conflict was not visible" });
    assert(apiRevision === 2 && successfulWrites === 1 && putAttempts === 2, "conflicted work center edit must not mutate System Domains");
    await evaluate(client, () => document.querySelector('form.react-nomenclature-editor')?.requestSubmit());
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-work-centers-island] [data-ui-component="SelectableRow"]').length === 20 && [...document.querySelectorAll('[data-react-structure-work-centers-island] [data-ui-component="SelectableRow"]')].some((row) => row.textContent?.includes("Рабочий центр PostgreSQL QA обновлён")), { message: "work center edit retry did not return", timeoutMs: 15_000 });
    assert(apiRevision === 3 && successfulWrites === 2 && putAttempts === 3, "work center edit retry must advance exactly one revision");
    const edited = apiDomains.registries.workCenters.find((center) => center.id === created.id);
    assert(edited?.name === "Рабочий центр PostgreSQL QA обновлён" && edited?.parentWorkCenterId === "" && edited?.participatesInPlanning === true && edited?.showInGantt === true && edited?.serverOnlyMarker === "work-center-hidden-field", "work center edit lost hierarchy, flags or hidden fields");
    const archiveUrl = `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&react-structure-work-centers=1&react-structure-work-centers-write=1&qa-reload=work-centers-archive-revision-3`;
    await client.send("Page.navigate", { url: archiveUrl });
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-work-centers-island] [data-ui-component="SelectableRow"]').length === 20, { message: "Work Centers archive projection did not hydrate", timeoutMs: 15_000 });
    const usedWorkCenterId = apiDomains.registries.positions.find((row) => row.workCenterId)?.workCenterId || apiDomains.registries.equipment.find((row) => row.workCenterId)?.workCenterId || apiDomains.registries.employmentAssignments.find((row) => row.workCenterId && !row.validTo)?.workCenterId || "";
    assert(usedWorkCenterId && usedWorkCenterId !== created.id, "Work Centers archive QA requires one referenced baseline center");
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-work-centers-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), usedWorkCenterId);
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Архивировать"), { message: "Referenced Work Center archive action did not become available for rejection proof" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Архивировать")?.click());
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Подтвердить архивирование")?.click());
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("действующими дочерними"), { message: "referenced Work Center archive was not rejected" });
    assert(apiRevision === 3 && successfulWrites === 2 && putAttempts === 3, "referenced Work Center archive must fail before PostgreSQL mutation");
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-work-centers-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), created.id);
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Архивировать"), { message: "Leaf Work Center archive action did not become available" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Архивировать")?.click());
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Подтвердить архивирование"), { message: "Work Center archive confirmation was not explicit" });
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-work-centers-island] [data-ui-component="SelectableRow"]')].find((row) => !row.textContent?.includes(id))?.click(), created.id);
    assert(await evaluate(client, () => ![...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Подтвердить архивирование")), "Work Center archive confirmation must not follow another selected row");
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-work-centers-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), created.id);
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Подтвердить архивирование"), { message: "Work Center-specific archive confirmation was not retained" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Подтвердить архивирование")?.click());
    await waitForCondition(client, () => [...document.querySelectorAll('[data-react-structure-work-centers-island] [data-ui-component="SelectableRow"]')].some((row) => row.textContent?.includes("Рабочий центр PostgreSQL QA обновлён") && row.textContent?.includes("архив")), { message: "archived Work Center did not return through PostgreSQL read model", timeoutMs: 15_000 });
    assert(apiRevision === 4 && successfulWrites === 3 && putAttempts === 4, "Work Center archive must advance exactly one revision");
    const archived = apiDomains.registries.workCenters.find((center) => center.id === created.id);
    assert(archived?.isActive === false && Number.isFinite(Date.parse(archived?.archivedAt || "")), "Work Center archive owner did not persist inactive state and archivedAt");
    assert(archived?.serverOnlyMarker === "work-center-hidden-field" && archived?.orgUnitId === references.orgUnitId && archived?.parentWorkCenterId === "" && archived?.participatesInPlanning === true && archived?.showInGantt === true, "Work Center archive changed hidden, hierarchy or Planning/Gantt fields");
    assert(commandRequests.every((request) => request.surface === "production-structure" && request.ifMatch === `"${request.expectedRevision}"` && request.idempotencyKey), "work center commands must carry surface, If-Match and idempotency key");

    await client.send("Page.navigate", { url: `${legacyOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&qa-reload=work-centers-legacy-readback` });
    await waitForCondition(client, () => /Рабочих центров\s*20/.test(document.querySelector(".production-structure-content")?.textContent || ""), { message: "legacy shell did not hydrate revised Work Centers", timeoutMs: 15_000 });
    await selectRegistry(client, "workCenters");
    await waitForCondition(client, () => document.querySelectorAll('[data-system-domain-table="workCenters"] [data-system-domain-row]').length === 20 && [...document.querySelectorAll('[data-system-domain-table="workCenters"] [data-system-domain-row]')].some((row) => row.textContent?.includes("Рабочий центр PostgreSQL QA обновлён") && row.textContent?.includes("архив")), { message: "legacy Work Centers did not read back the React archive" });
  } else if (qaConfig.registryId === "equipment") {
    primaryAuthorityReady = true;
    await evaluate(client, (key) => sessionStorage.setItem(key, "1"), SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY);
    const writeUrl = `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&react-structure-equipment=1&react-structure-equipment-write=1&qa-reload=equipment-write`;
    await client.send("Page.navigate", { url: writeUrl });
    await waitForCondition(client, () => location.search.includes("qa-reload=equipment-write") && document.readyState === "complete", { message: "Equipment write page navigation did not complete" });
    await waitForCondition(client, () => { if (document.querySelector('[data-react-structure-equipment-island]') || document.querySelector('[data-system-domain-table="equipment"]')) return true; document.querySelector('[data-system-domain-registry="equipment"]')?.click(); return false; }, { message: "Equipment registry did not become active after hydration", timeoutMs: 10_000 });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-structure-equipment-island][data-react-island-state="ready"]')) && [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Новая запись" && !button.disabled), { message: "Equipment PostgreSQL write evaluation did not become ready", timeoutMs: 15_000 });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Новая запись")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('form.react-nomenclature-editor input[name="name"]')), { message: "new equipment editor did not open" });
    const references = { orgUnitId: migration.domains.registries.orgUnits[0].id, workCenterId: migration.domains.registries.workCenters[0].id, scheduleTemplateId: migration.domains.registries.scheduleTemplates[0].id };
    await evaluate(client, (values) => { const setControl = (selector, value) => { const control = document.querySelector(selector); if (!control) throw new Error(`missing ${selector}`); const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value); control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }; setControl('input[name="name"]', "Принтер PostgreSQL QA"); setControl('input[name="code"]', "QA-EQP-01"); setControl('select[name="orgUnitId"]', values.orgUnitId); setControl('select[name="workCenterId"]', values.workCenterId); setControl('select[name="scheduleTemplateId"]', values.scheduleTemplateId); setControl('input[name="quantity"]', "-1"); document.querySelector('form.react-nomenclature-editor')?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }, references);
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("неотрицательным"), { message: "negative equipment quantity was not rejected" });
    assert(apiRevision === 1 && putAttempts === 0, "invalid equipment quantity must be rejected before PostgreSQL mutation");
    await evaluate(client, () => { const input = document.querySelector('input[name="quantity"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "3"); input.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector('form.react-nomenclature-editor')?.requestSubmit(); });
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-equipment-island] [data-ui-component="SelectableRow"]').length === 7, { message: "created equipment did not return through PostgreSQL read model", timeoutMs: 15_000 });
    assert(apiRevision === 2 && successfulWrites === 1, "equipment create must advance one PostgreSQL revision");
    const created = apiDomains.registries.equipment.find((equipment) => equipment.code === "QA-EQP-01");
    assert(created?.id && created.orgUnitId === references.orgUnitId && created.workCenterId === references.workCenterId && created.scheduleTemplateId === references.scheduleTemplateId && created.quantity === 3, "created equipment references or quantity were not preserved");
    created.serverOnlyMarker = "equipment-hidden-field";

    const editUrl = `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&react-structure-equipment=1&react-structure-equipment-write=1&qa-reload=equipment-revision-2`;
    await client.send("Page.navigate", { url: editUrl });
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-equipment-island] [data-ui-component="SelectableRow"]').length === 7, { message: "Equipment revision 2 did not hydrate", timeoutMs: 15_000 });
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-equipment-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), created.id);
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Редактировать оборудование")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('form.react-nomenclature-editor input[name="name"]')), { message: "equipment edit form did not open" });
    await evaluate(client, () => { const setInput = (selector, value) => { const input = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }; setInput('input[name="name"]', "Принтер PostgreSQL QA обновлён"); setInput('input[name="code"]', "QA-EQP-02"); setInput('input[name="quantity"]', "4"); });
    forceConflictOnce = true;
    await evaluate(client, () => document.querySelector('form.react-nomenclature-editor')?.requestSubmit());
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("изменились в другом сеансе"), { message: "equipment revision conflict was not visible" });
    assert(apiRevision === 2 && successfulWrites === 1 && putAttempts === 2, "conflicted equipment edit must not mutate System Domains");
    await evaluate(client, () => document.querySelector('form.react-nomenclature-editor')?.requestSubmit());
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-equipment-island] [data-ui-component="SelectableRow"]').length === 7 && [...document.querySelectorAll('[data-react-structure-equipment-island] [data-ui-component="SelectableRow"]')].some((row) => row.textContent?.includes("Принтер PostgreSQL QA обновлён")), { message: "equipment edit retry did not return", timeoutMs: 15_000 });
    assert(apiRevision === 3 && successfulWrites === 2 && putAttempts === 3, "equipment edit retry must advance exactly one revision");
    const edited = apiDomains.registries.equipment.find((equipment) => equipment.id === created.id);
    assert(edited?.name === "Принтер PostgreSQL QA обновлён" && edited?.quantity === 4 && edited?.serverOnlyMarker === "equipment-hidden-field", "equipment edit lost visible or hidden fields");
    const archiveUrl = `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&react-structure-equipment=1&react-structure-equipment-write=1&qa-reload=equipment-archive-revision-3`;
    await client.send("Page.navigate", { url: archiveUrl });
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-equipment-island] [data-ui-component="SelectableRow"]').length === 7, { message: "Equipment archive projection did not hydrate", timeoutMs: 15_000 });
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-equipment-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), created.id);
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Архивировать"), { message: "Equipment archive action did not become available" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Архивировать")?.click());
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Подтвердить архивирование"), { message: "Equipment archive confirmation was not explicit" });
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-equipment-island] [data-ui-component="SelectableRow"]')].find((row) => !row.textContent?.includes(id))?.click(), created.id);
    assert(await evaluate(client, () => ![...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Подтвердить архивирование")), "archive confirmation must not follow selection to another equipment row");
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-equipment-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), created.id);
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Подтвердить архивирование"), { message: "Equipment-specific archive confirmation was not retained for its original row" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Подтвердить архивирование")?.click());
    await waitForCondition(client, () => [...document.querySelectorAll('[data-react-structure-equipment-island] [data-ui-component="SelectableRow"]')].some((row) => row.textContent?.includes("Принтер PostgreSQL QA обновлён") && row.textContent?.includes("архив")), { message: "archived equipment did not return through PostgreSQL read model", timeoutMs: 15_000 });
    assert(apiRevision === 4 && successfulWrites === 3 && putAttempts === 4, "equipment archive must advance exactly one revision");
    const archived = apiDomains.registries.equipment.find((equipment) => equipment.id === created.id);
    assert(archived?.isActive === false && Number.isFinite(Date.parse(archived?.archivedAt || "")), "equipment archive owner did not persist inactive state and archivedAt");
    assert(archived?.serverOnlyMarker === "equipment-hidden-field" && archived?.orgUnitId === references.orgUnitId && archived?.workCenterId === references.workCenterId && archived?.scheduleTemplateId === references.scheduleTemplateId && archived?.quantity === 4, "equipment archive changed hidden, reference or quantity fields");
    assert(commandRequests.every((request) => request.surface === "production-structure" && request.ifMatch === `"${request.expectedRevision}"` && request.idempotencyKey), "equipment commands must carry surface, If-Match and idempotency key");

    await client.send("Page.navigate", { url: `${legacyOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&qa-reload=equipment-legacy-readback` });
    await waitForCondition(client, () => /Оборудования\s*7/.test(document.querySelector(".production-structure-content")?.textContent || ""), { message: "legacy shell did not hydrate revised Equipment", timeoutMs: 15_000 });
    await selectRegistry(client, "equipment");
    await waitForCondition(client, () => document.querySelectorAll('[data-system-domain-table="equipment"] [data-system-domain-row]').length === 7 && [...document.querySelectorAll('[data-system-domain-table="equipment"] [data-system-domain-row]')].some((row) => row.textContent?.includes("Принтер PostgreSQL QA обновлён") && row.textContent?.includes("архив")), { message: "legacy Equipment did not read back the React archive" });
  } else if (qaConfig.registryId === "responsibilityPolicies") {
    primaryAuthorityReady = true;
    await evaluate(client, (key) => sessionStorage.setItem(key, "1"), SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY);
    const writeUrl = `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&react-structure-responsibility-policies=1&react-structure-responsibility-policies-write=1&qa-reload=responsibility-policies-write`;
    await client.send("Page.navigate", { url: writeUrl });
    await waitForCondition(client, () => { if (document.querySelector('[data-react-structure-responsibility-policies-island]') || document.querySelector('[data-system-domain-table="responsibilityPolicies"]')) return true; document.querySelector('[data-system-domain-registry="responsibilityPolicies"]')?.click(); return false; }, { message: "Responsibility Policies registry did not become active after hydration", timeoutMs: 10_000 });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-structure-responsibility-policies-island][data-react-island-state="ready"]')) && [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Новая запись" && !button.disabled), { message: "Responsibility Policies PostgreSQL write evaluation did not become ready", timeoutMs: 15_000 });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Новая запись")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('form.react-nomenclature-editor select[name="subjectEmployeeId"]')), { message: "new responsibility policy editor did not open" });
    const subjectEmployeeId = migration.domains.registries.employees.find((employee) => ![masterId, executorId].includes(employee.id))?.id || "";
    const targetEmployeeIds = [masterId, executorId].sort();
    assert(subjectEmployeeId, "responsibility command fixture requires a third employee");
    await evaluate(client, (values) => { const setSelect = (selector, value) => { const select = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value); select.dispatchEvent(new Event("change", { bubbles: true })); }; setSelect('select[name="subjectEmployeeId"]', values.subjectEmployeeId); setSelect('select[name="mode"]', "manual"); const targets = document.querySelector('select[name="targetEmployeeIds"]'); [...targets.options].forEach((option) => { option.selected = values.targetEmployeeIds.includes(option.value); }); targets.dispatchEvent(new Event("change", { bubbles: true })); document.querySelector('form.react-nomenclature-editor')?.requestSubmit(); }, { subjectEmployeeId, targetEmployeeIds });
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-responsibility-policies-island] [data-ui-component="SelectableRow"]').length === 2, { message: "created responsibility policy did not return through PostgreSQL read model", timeoutMs: 15_000 });
    assert(apiRevision === 2 && successfulWrites === 1, "responsibility policy create must advance one PostgreSQL revision");
    const created = apiDomains.registries.responsibilityPolicies.find((policy) => policy.subjectEmployeeId === subjectEmployeeId);
    assert(created?.id && created.mode === "manual" && JSON.stringify(created.targetEmployeeIds) === JSON.stringify(targetEmployeeIds), "created responsibility mode or targets were not preserved");
    created.serverOnlyMarker = "responsibility-hidden-field";

    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-responsibility-policies-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), created.id);
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Редактировать зону")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('form.react-nomenclature-editor select[name="subjectEmployeeId"]')), { message: "responsibility policy edit form did not open" });
    await evaluate(client, (duplicateId) => { const select = document.querySelector('select[name="subjectEmployeeId"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, duplicateId); select.dispatchEvent(new Event("change", { bubbles: true })); document.querySelector('form.react-nomenclature-editor')?.requestSubmit(); }, masterId);
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("уже существует"), { message: "duplicate responsibility subject was not rejected" });
    assert(apiRevision === 2 && putAttempts === 1, "duplicate responsibility subject must be rejected before PostgreSQL mutation");

    const editUrl = `${enabledOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&react-structure-responsibility-policies=1&react-structure-responsibility-policies-write=1&qa-reload=responsibility-policies-revision-2`;
    await client.send("Page.navigate", { url: editUrl });
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-responsibility-policies-island] [data-ui-component="SelectableRow"]').length === 2, { message: "Responsibility Policies revision 2 did not hydrate", timeoutMs: 15_000 });
    await evaluate(client, (id) => [...document.querySelectorAll('[data-react-structure-responsibility-policies-island] [data-ui-component="SelectableRow"]')].find((row) => row.textContent?.includes(id))?.click(), created.id);
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === "Редактировать зону")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('form.react-nomenclature-editor select[name="mode"]')), { message: "responsibility policy retry editor did not open" });
    await evaluate(client, () => { const select = document.querySelector('select[name="mode"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, "all"); select.dispatchEvent(new Event("change", { bubbles: true })); });
    forceConflictOnce = true;
    await evaluate(client, () => document.querySelector('form.react-nomenclature-editor')?.requestSubmit());
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("изменились в другом сеансе"), { message: "responsibility policy revision conflict was not visible" });
    assert(apiRevision === 2 && successfulWrites === 1 && putAttempts === 2, "conflicted responsibility edit must not mutate System Domains");
    await evaluate(client, () => document.querySelector('form.react-nomenclature-editor')?.requestSubmit());
    await waitForCondition(client, () => document.querySelectorAll('[data-react-structure-responsibility-policies-island] [data-ui-component="SelectableRow"]').length === 2 && [...document.querySelectorAll('[data-react-structure-responsibility-policies-island] [data-ui-component="SelectableRow"]')].some((row) => row.textContent?.includes("Все сотрудники")), { message: "responsibility policy edit retry did not return", timeoutMs: 15_000 });
    assert(apiRevision === 3 && successfulWrites === 2 && putAttempts === 3, "responsibility policy edit retry must advance exactly one revision");
    const edited = apiDomains.registries.responsibilityPolicies.find((policy) => policy.id === created.id);
    assert(edited?.mode === "all" && JSON.stringify(edited.targetEmployeeIds) === JSON.stringify(targetEmployeeIds) && edited?.serverOnlyMarker === "responsibility-hidden-field", "responsibility edit lost targets or hidden fields");
    assert(commandRequests.every((request) => request.surface === "production-structure" && request.ifMatch === `"${request.expectedRevision}"` && request.idempotencyKey), "responsibility commands must carry surface, If-Match and idempotency key");

    await client.send("Page.navigate", { url: `${legacyOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1&qa-reload=responsibility-policies-legacy-readback` });
    await waitForCondition(client, () => /Зон ответственности\s*2/.test(document.querySelector(".production-structure-content")?.textContent || ""), { message: "legacy shell did not hydrate revised Responsibility Policies", timeoutMs: 15_000 });
    await selectRegistry(client, "responsibilityPolicies");
    await waitForCondition(client, () => document.querySelectorAll('[data-system-domain-table="responsibilityPolicies"] [data-system-domain-row]').length === 2 && [...document.querySelectorAll('[data-system-domain-table="responsibilityPolicies"] [data-system-domain-row]')].some((row) => row.textContent?.includes("Все сотрудники")), { message: "legacy Responsibility Policies did not read back the React write" });
  }
  assert(interceptedReads >= 3, "functional QA must exercise PostgreSQL read-model hydration on all navigations");
  assert(consoleProblems.length === 0, `browser console problems:\n${consoleProblems.join("\n")}`); assert(await readFile(sharedStateFile, "utf8") === original, "read-only Positions scenario changed state");
  console.log(`Structure ${qaConfig.label} React production-shell functional QA: OK`);
  console.log(`- same PostgreSQL payload: ${qaConfig.rowCount} legacy rows = ${qaConfig.rowCount} React rows; first commit ${initial.commitMs.toFixed(2)} ms`);
  console.log(`- ${qaConfig.cellCount} cells/order, ${qaConfig.isDiagnostics ? "four issue groups" : "selection/detail"}, seven registries, six metrics, legacy fallback and unchanged state: pass`);
  if (qaConfig.registryId === "positions") console.log("- PostgreSQL create/edit/archive, explicit confirmation, conflict retry, references, hidden fields, 50-row legacy read-back and unchanged snapshot: pass");
  if (qaConfig.registryId === "orgUnits") console.log("- PostgreSQL create/edit/archive, hierarchy/dependency rejection, ID-bound confirmation, conflict retry, hidden fields, 20-row legacy read-back and unchanged snapshot: pass");
  if (qaConfig.registryId === "workCenters") console.log("- PostgreSQL create/edit/archive, hierarchy/dependency rejection, ID-bound confirmation, Planning/Gantt flags, conflict retry, hidden fields, 20-row legacy read-back and unchanged snapshot: pass");
  if (qaConfig.registryId === "equipment") console.log("- PostgreSQL create/edit/archive, explicit confirmation, quantity/reference validation, conflict retry, hidden fields, 7-row legacy read-back and unchanged snapshot: pass");
  if (qaConfig.registryId === "responsibilityPolicies") console.log("- PostgreSQL create/edit, mode/employee validation, duplicate rejection, conflict retry, hidden fields, 2-row legacy read-back and unchanged snapshot: pass");
} catch (error) { if (chrome) { const browserState = await evaluate(chrome.client, () => ({ url: location.href, headings: [...document.querySelectorAll("h1,h2")].map((node) => node.textContent?.trim()).slice(0, 8), target: Boolean(document.querySelector('[data-react-structure-positions-island]')), targetState: document.querySelector('[data-react-structure-positions-island]')?.getAttribute("data-react-island-state"), registryButtons: [...document.querySelectorAll('[data-system-domain-registry]')].map((button) => ({ id: button.getAttribute("data-system-domain-registry"), text: button.textContent?.replace(/\s+/g, " ").trim().slice(0, 80), connected: button.isConnected, disabled: button.disabled, pointerEvents: getComputedStyle(button).pointerEvents })), buttons: [...document.querySelectorAll("button")].filter((button) => button.offsetParent !== null).map((button) => ({ text: button.textContent?.replace(/\s+/g, " ").trim().slice(0, 80), disabled: button.disabled })).slice(-20), visibleText: document.querySelector("main")?.textContent?.replace(/\s+/g, " ").trim().slice(-1000) })).catch(() => null); if (browserState) console.error(`BROWSER_STATE ${JSON.stringify(browserState)}`); } if (enabledOutput.trim()) console.error(enabledOutput.trim()); if (legacyOutput.trim()) console.error(legacyOutput.trim()); throw error; }
finally { if (chrome) await cleanupChrome(chrome); await Promise.all([stop(enabledPreview), stop(legacyPreview)]); await rm(temporaryRoot, { recursive: true, force: true }); }
