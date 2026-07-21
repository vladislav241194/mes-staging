import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupChrome, delay, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const makeItem = (id, number, name, quantity, revision) => ({
  id, number, name, designation: `QA.${number}`, quantity, unit: "шт.", lifecycleStatus: "released", planningStatus: "scheduled", planningStartDate: id.endsWith("2") ? "2026-07-18" : "2026-07-19", revision, concurrencyRevision: revision, source: "specifications2", updatedAt: "2026-07-19T08:00:00.000Z", operationCount: 1, scheduledOperationCount: 1,
  metadata: { id, name, planningQuantity: quantity, planningStartDate: id.endsWith("2") ? "2026-07-18" : "2026-07-19", sourceSpecifications2EntryId: `spec-${id}`, documentRevisionSnapshot: { specificationRevision: revision }, workOrderSnapshot: { id: number, quantity } },
  operations: [{ id: `${id}-step-1`, operationId: "OP-ASSEMBLY", name: "Монтаж", workCenterId: "D3", nextWorkCenterId: "D4", quantityMultiplier: 1, executionContext: { calculationType: "productivity", unitsPerHour: 40 }, labor: { unitsPerHour: 40 }, metadata: { id: `${id}-step-1`, routeId: id, specTaskId: `${id}-task-main`, specTaskName: name, specTaskQuantity: 1, specTaskUnit: "шт.", specTaskLevel: 0, sourceSpecificationId: `spec-${id}` }, slot: { id: `${id}-slot-1`, plannedStart: "2026-07-20T08:00:00.000Z", plannedEnd: "2026-07-20T11:00:00.000Z", status: "planned", quantity, isLocked: false } }],
});
const items = [makeItem("route-qa-1", "WO-QA-1", "Контроллер QA", 120, 7), makeItem("route-qa-2", "WO-QA-2", "Модуль QA", 80, 4)];
const compactItems = () => items.map(({ operations, ...item }) => structuredClone(item));
const responseFor = (url) => { const active = url.searchParams.get("active") || items[0].id; const item = items.find((entry) => entry.id === active || entry.number === active) || items[0]; return Buffer.from(JSON.stringify({ ok: true, storageMode: "postgres", storageBackend: "postgresql", revision: 9, items: compactItems(), activeId: item.id, item })).toString("base64"); };
const runtimeProjection = () => ({
  routes: items.map((item) => ({ ...structuredClone(item.metadata), id: item.id, name: item.name, planningQuantity: item.quantity, domainConcurrencyRevision: item.concurrencyRevision })),
  routeSteps: items.flatMap((item) => item.operations.map((operation) => ({ ...structuredClone(operation.metadata), id: operation.id, routeId: item.id, operationId: operation.operationId, name: operation.name, workCenterId: operation.workCenterId, nextWorkCenterId: operation.nextWorkCenterId, quantityMultiplier: operation.quantityMultiplier, executionContext: structuredClone(operation.executionContext), labor: structuredClone(operation.labor) }))),
  slots: items.flatMap((item) => item.operations.map((operation) => ({ ...structuredClone(operation.slot), routeId: item.id, planningOrderId: item.id, routeStepId: operation.id, quantity: item.quantity }))),
});
async function waitPreview(origin) { for (let index = 0; index < 100; index += 1) { try { const response = await fetch(`${origin}/?module=planning&qa-auth-bypass=1`); if (response.ok && (await response.text()).includes('id="app"')) return; } catch {} await delay(120); } throw new Error(`Planning preview did not start at ${origin}`); }
async function stop(child) { if (child.exitCode === null && !child.killed) child.kill("SIGTERM"); await new Promise((resolve) => { if (child.exitCode !== null) return resolve(); const timer = setTimeout(resolve, 1200); child.once("exit", () => { clearTimeout(timer); resolve(); }); }); }
const normalizedPlanning = () => ({
  queue: [...document.querySelectorAll(".planning-order-route-list button")].map((item) => item.textContent.replace(/\s+/g, " ").trim()),
  metrics: Object.fromEntries([...document.querySelectorAll('[data-visual-qa-target^="planning-order-decision-"]')].filter((item) => item.matches('[data-visual-qa-target$="-value"]')).map((item) => [item.dataset.visualQaTarget.replace("planning-order-decision-", "").replace("-value", ""), item.textContent.trim()])),
  rows: [...document.querySelectorAll(".planning-order-table tbody tr[data-planning-order-row]")].map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim().replace(/^↳\s*/, ""))),
});

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-planning-workbench-react-")); const sharedStateFile = join(temporaryRoot, "shared-state.json");
const snapshot = { version: 1, updatedAt: "2026-07-19T00:00:00.000Z", updatedBy: { actor: "planning-workbench-react-qa" }, values: { "mes-planning-prototype-state-v2": JSON.stringify(runtimeProjection()) }, sharedUi: {}, events: [] };
await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 }); assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary state permissions changed"); const original = await readFile(sharedStateFile, "utf8");
const enabledPort = await getFreePort(); const legacyPort = await getFreePort(); const enabledOrigin = `http://127.0.0.1:${enabledPort}`; const legacyOrigin = `http://127.0.0.1:${legacyPort}`;
const start = (port, enabled) => spawn(process.execPath, ["scripts/preview-dist.mjs"], { cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru", MES_SHARED_STATE_FILE: sharedStateFile, ...(enabled ? { MES_DOMAIN_STORAGE: "postgres", MES_REACT_PLANNING_WORKBENCH: "1", MES_REACT_PLANNING_WORKBENCH_READ_ONLY_EVALUATION: "1", MES_ENABLE_PLANNING_START_DATE_COMMANDS: "1" } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
const enabledPreview = start(enabledPort, true); const legacyPreview = start(legacyPort, false); let enabledOutput = ""; let legacyOutput = ""; enabledPreview.stdout.on("data", (chunk) => { enabledOutput += chunk; }); enabledPreview.stderr.on("data", (chunk) => { enabledOutput += chunk; }); legacyPreview.stdout.on("data", (chunk) => { legacyOutput += chunk; }); legacyPreview.stderr.on("data", (chunk) => { legacyOutput += chunk; });
let chrome = null; const consoleProblems = []; const interceptedPaths = []; let interceptedReads = 0; let unexpectedPlanningPatchAttempts = 0;
let startDatePatchAttempts = 0; let successfulStartDateWrites = 0; let forceStartDateConflictOnce = false; let loseStartDateResponseOnce = false; let returnCompatibilityPendingOnce = false; let returnStartDateParityConflictOnce = false;
const startDateReceipts = new Map(); const observedStartDateKeys = []; const observedStartDateIfMatches = [];
let lastCompatibilityReceipt = null;
const compatibilityProof = (ready = true) => {
  const proof = {
    snapshotSync: { total: 1, applied: ready ? 1 : 0, failed: 0, conflicts: 0, skipped: 0 },
    compatibilityReceipt: { found: true, exact: true, ready, state: ready ? "applied" : "pending", unresolvedCount: ready ? 0 : 1 },
  };
  lastCompatibilityReceipt = proof.compatibilityReceipt;
  return proof;
};
try {
  await Promise.all([waitPreview(enabledOrigin), waitPreview(legacyOrigin)]); chrome = await launchChrome("mes-planning-workbench-react-qa-"); const { client } = chrome;
  const fulfill = (requestId, payload, statusCode = 200, etag = "planning-qa") => client.send("Fetch.fulfillRequest", { requestId, responseCode: statusCode, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }, { name: "ETag", value: `"${etag}"` }], body: Buffer.from(JSON.stringify(payload)).toString("base64") }).catch((error) => consoleProblems.push(error.message));
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data); if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" ")); if (message.method !== "Fetch.requestPaused") return;
    const requestUrl = new URL(message.params.request.url); const method = String(message.params.request.method || "GET").toUpperCase(); const requestId = message.params.requestId;
    interceptedPaths.push(`${method} ${requestUrl.pathname}${requestUrl.search}`);
    if (requestUrl.pathname === "/api/v1/planning/work-orders/bootstrap") { interceptedReads += 1; const body = JSON.parse(Buffer.from(responseFor(requestUrl), "base64").toString("utf8")); void fulfill(requestId, body, 200, `planning-${requestUrl.searchParams.get("active") || "default"}`); }
    else if (requestUrl.pathname === "/api/v1/planning/work-orders/projection") { interceptedReads += 1; void fulfill(requestId, { ok: true, projection: runtimeProjection() }, 200, `projection-${successfulStartDateWrites}`); }
    else if (requestUrl.pathname === "/api/v1/planning/work-orders" && method === "GET") { interceptedReads += 1; void fulfill(requestId, { ok: true, items: compactItems() }, 200, `list-${successfulStartDateWrites}`); }
    else if (/^\/api\/v1\/planning\/work-orders\/[^/]+\/start-date$/.test(requestUrl.pathname) && method === "PATCH") {
      startDatePatchAttempts += 1;
      const parts = requestUrl.pathname.split("/"); const id = decodeURIComponent(parts.at(-2) || ""); const item = items.find((entry) => entry.id === id);
      const body = JSON.parse(message.params.request.postData || "{}"); const headers = message.params.request.headers || {};
      const header = (name) => Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1] || "";
      const ifMatch = header("if-match"); const idempotencyKey = header("idempotency-key"); observedStartDateKeys.push(idempotencyKey);
      observedStartDateIfMatches.push(ifMatch);
      const ownsPlanningStartDate = Object.prototype.hasOwnProperty.call(body, "planningStartDate");
      const planningStartDateValid = body.planningStartDate === null
        || (typeof body.planningStartDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.planningStartDate));
      const receipt = startDateReceipts.get(idempotencyKey);
      if (!item) void fulfill(requestId, { ok: false, error: "not found" }, 404);
      else if (!idempotencyKey) void fulfill(requestId, { ok: false, error: "missing idempotency key" }, 400);
      else if (!ownsPlanningStartDate || !planningStartDateValid) void fulfill(requestId, { ok: false, error: "invalid planningStartDate" }, 400);
      else if (returnStartDateParityConflictOnce) {
        returnStartDateParityConflictOnce = false;
        void fulfill(requestId, {
          ok: false,
          fallbackReason: "postgres-snapshot-parity-mismatch",
          error: "Planning write is temporarily unavailable while parity converges",
        }, 409, "start-date-parity-pending");
      }
      else if (receipt) {
        const sameRequest = receipt.id === item.id && receipt.planningStartDate === body.planningStartDate && receipt.expectedRevision === Number(body.expectedRevision);
        const superseded = sameRequest && item.planningStartDate !== receipt.planningStartDate;
        const { operations, ...compact } = item;
        void fulfill(requestId, superseded
          ? { ok: false, conflict: true, superseded: true, code: "superseded-idempotent-replay", item: compact, canonicalPlanningStartDate: item.planningStartDate, error: "committed date was superseded" }
          : sameRequest
            ? { ok: true, item: compact, idempotentReplay: true, ...compatibilityProof(true) }
          : { ok: false, conflict: true, idempotencyConflict: true, item: compact, error: "idempotency conflict" },
        sameRequest && !superseded ? 200 : 409, `start-date-${item.concurrencyRevision}`);
      } else if (forceStartDateConflictOnce) {
        forceStartDateConflictOnce = false;
        // A definitive 409 represents a different actor advancing the owner.
        // The browser must refresh that canonical revision, discard the old
        // key, and require an explicit new intent before it retries.
        item.planningStartDate = "2026-07-21"; item.metadata.planningStartDate = "2026-07-21";
        item.revision += 1; item.concurrencyRevision += 1; item.updatedAt = "2026-07-19T08:01:00.000Z";
        const { operations, ...compact } = item;
        void fulfill(requestId, { ok: false, conflict: true, item: compact, error: "revision conflict" }, 409, `start-date-${item.concurrencyRevision}`);
      } else if (Number(body.expectedRevision) !== item.concurrencyRevision || ifMatch !== `"${item.concurrencyRevision}"`) {
        const { operations, ...compact } = item;
        void fulfill(requestId, { ok: false, conflict: true, item: compact, error: "stale revision" }, 409, `start-date-${item.concurrencyRevision}`);
      } else {
        item.planningStartDate = body.planningStartDate;
        if (body.planningStartDate === null) delete item.metadata.planningStartDate;
        else item.metadata.planningStartDate = body.planningStartDate;
        item.revision += 1; item.concurrencyRevision += 1; successfulStartDateWrites += 1;
        startDateReceipts.set(idempotencyKey, { id: item.id, planningStartDate: item.planningStartDate, expectedRevision: Number(body.expectedRevision) });
        const { operations, ...compact } = item;
        if (loseStartDateResponseOnce) { loseStartDateResponseOnce = false; void fulfill(requestId, { ok: false, error: "simulated lost response after commit" }, 503); }
        else {
          const compatibilityReady = !returnCompatibilityPendingOnce;
          returnCompatibilityPendingOnce = false;
          void fulfill(requestId, { ok: true, item: compact, idempotentReplay: false, ...compatibilityProof(compatibilityReady) }, 200, `start-date-${item.concurrencyRevision}`);
        }
      }
    }
    else if (requestUrl.pathname.startsWith("/api/v1/planning/work-orders/") && method === "GET") { interceptedReads += 1; const id = decodeURIComponent(requestUrl.pathname.split("/").at(-1) || ""); const item = items.find((entry) => entry.id === id); void fulfill(requestId, item ? { ok: true, item } : { ok: false, error: "not found" }, item ? 200 : 404, `detail-${id}-${item?.concurrencyRevision || 0}`); }
    else if (requestUrl.pathname.startsWith("/api/v1/planning/work-orders/") && method === "PATCH") {
      unexpectedPlanningPatchAttempts += 1;
      void fulfill(requestId, { ok: false, error: "quantity and slot writes are not part of the narrow evaluation" }, 503);
    } else void client.send("Fetch.continueRequest", { requestId }).catch((error) => consoleProblems.push(error.message));
  });
  await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/planning/work-orders*", requestStage: "Request" }] }); await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: `${legacyOrigin}/?module=planning&qa-auth-bypass=1` });
  try { await waitForCondition(client, () => document.querySelectorAll(".planning-order-table tbody tr[data-planning-order-row]").length === 2, { message: "legacy Planning bootstrap needs one cached module re-entry", timeoutMs: 3_000 }); }
  catch {
    await evaluate(client, () => window.__mesRuntime?.navigateToModule?.("timesheet"));
    await waitForCondition(client, () => window.__mesRuntime?.getActiveModule?.() === "timesheet", { message: "legacy Planning recovery did not leave module", timeoutMs: 10_000 });
    await delay(500);
    await evaluate(client, () => window.__mesRuntime?.navigateToModule?.("planning"));
    await waitForCondition(client, () => window.__mesRuntime?.getActiveModule?.() === "planning", { message: "legacy Planning recovery did not re-enter module", timeoutMs: 10_000 });
  }
  try { await waitForCondition(client, () => document.querySelectorAll(".planning-order-table tbody tr[data-planning-order-row]").length === 2, { message: "legacy Planning Workbench did not render PostgreSQL bootstrap", timeoutMs: 15_000 }); }
  catch (error) { const debug = await evaluate(client, () => ({ title: document.title, body: document.body?.innerText?.slice(0, 1200) || "", rows: document.querySelectorAll(".planning-order-table tbody tr[data-planning-order-row]").length, page: Boolean(document.querySelector(".planning-order-page")), app: document.querySelector("#app")?.innerHTML?.slice(0, 500) || "" })); throw new Error(`${error.message}: ${JSON.stringify({ interceptedReads, interceptedPaths, debug })}`); }
  const legacy = await evaluate(client, normalizedPlanning);
  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=planning&qa-auth-bypass=1` }); await waitForCondition(client, () => document.querySelectorAll(".planning-order-table tbody tr[data-planning-order-row]").length === 2, { message: "enabled Planning legacy default missing", timeoutMs: 15_000 }); assert(await evaluate(client, () => !document.querySelector("[data-react-planning-workbench-island]")), "server permission without session request must retain legacy Planning");
  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=planning&qa-auth-bypass=1&react-planning-workbench-evaluation=1` }); await waitForCondition(client, () => Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]')) && document.querySelectorAll("[data-planning-order-row]").length === 2, { message: "Planning Workbench React island not ready", timeoutMs: 15_000 });
  await evaluate(client, () => window.__mesRuntime?.navigateToModule?.("timesheet"));
  await waitForCondition(client, () => window.__mesRuntime?.getActiveModule?.() === "timesheet", { message: "Planning warm-cache QA did not leave the module", timeoutMs: 15_000 });
  assert(await evaluate(client, () => {
    const banner = document.querySelector("[data-legacy-domain-write-pause]");
    return Boolean(banner)
      && banner?.textContent?.includes("Изменения legacy-данных приостановлены")
      && banner?.textContent?.includes("единственная запись — дата старта в React-блоке");
  }), "system-wide legacy-domain pause banner must remain visible outside Planning");
  await evaluate(client, () => window.__mesRuntime?.navigateToModule?.("planning"));
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]')) && document.querySelectorAll("[data-planning-order-row]").length === 2, { message: "Planning Workbench React island did not remount after warm-cache navigation", timeoutMs: 15_000 });
  assert(await evaluate(client, () => {
    const banner = document.querySelector("[data-legacy-domain-write-pause]");
    return banner?.parentElement?.matches("main.app-shell") === true
      && !document.querySelector("[data-react-planning-workbench-island] [data-legacy-domain-write-pause]");
  }), "global pause banner must be a shell sibling and never enter the React island root");
  const react = await evaluate(client, () => ({ queue: [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].map((item) => item.textContent.replace(/\s+/g, " ").trim()), metrics: Object.fromEntries([...document.querySelectorAll('[data-ui-component="MetricCard"]')].map((item) => [item.querySelector("span")?.textContent?.trim(), item.querySelector("strong")?.textContent?.trim()])), rows: [...document.querySelectorAll(".planning-order-table tbody tr[data-planning-order-row]")].map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim().replace(/^↳\s*/, ""))), state: (() => { const target = document.querySelector("[data-react-planning-workbench-island]"); const layout = getComputedStyle(target.querySelector(".module-layout")); const workspace = getComputedStyle(target.querySelector('[data-ui-component="ModuleWorkspace"]')); const panel = getComputedStyle(target.querySelector(".panel")); const metrics = getComputedStyle(target.querySelector(".metric-grid")); return { revision: target?.dataset.reactIslandRevision, commitMs: Number(target?.dataset.reactIslandCommitMs), pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, layoutColumns: layout.gridTemplateColumns.split(" ").length, workspaceColumns: workspace.gridTemplateColumns.split(" ").length, panelRadius: Number.parseFloat(panel.borderRadius), metricColumns: metrics.gridTemplateColumns.split(" ").length }; })() }));
  assert(react.queue.length === legacy.queue.length && react.rows.length === legacy.rows.length, "Planning queue/structure density must match legacy"); assert(react.metrics["Ревизия"] === legacy.metrics.duration && react.metrics["Гант"] === legacy.metrics.schedule, "Planning readiness must match legacy"); assert(react.state.revision === "1" && react.state.commitMs < 2000 && !react.state.pageOverflow, "Planning React telemetry/overflow failed"); assert(react.state.layoutColumns === 2 && react.state.workspaceColumns === 1 && react.state.panelRadius >= 6 && react.state.metricColumns === 5, `Planning production UI contract failed: ${JSON.stringify(react.state)}`);
  await client.send("Emulation.setDeviceMetricsOverride", { width: 487, height: 844, deviceScaleFactor: 1, mobile: false });
  const compact = await evaluate(client, () => { const target = document.querySelector("[data-react-planning-workbench-island]"); const tableWrap = target.querySelector('[data-ui-component="TableWrap"]'); return { layoutColumns: getComputedStyle(target.querySelector(".module-layout")).gridTemplateColumns.split(" ").length, sidebarColumns: getComputedStyle(target.querySelector(".module-sidebar")).gridTemplateColumns.split(" ").length, metricColumns: getComputedStyle(target.querySelector(".metric-grid")).gridTemplateColumns.split(" ").length, pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, tableScroll: tableWrap.scrollWidth > tableWrap.clientWidth }; });
  assert(compact.layoutColumns === 1 && compact.sidebarColumns >= 2 && compact.metricColumns === 2 && !compact.pageOverflow, `Planning compact UI contract failed: ${JSON.stringify(compact)}`);
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });
  await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].at(-1)?.click());
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]')) && [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].at(-1)?.classList.contains("is-active") && document.querySelectorAll("[data-planning-order-row]").length === 2, { message: "Planning route selection did not stay inside React", timeoutMs: 15_000 });
  const routeState = await evaluate(client, () => ({ active: document.querySelector('[data-ui-component="SidebarItem"].is-active')?.textContent?.replace(/\s+/g, " ").trim() || "", rows: [...document.querySelectorAll("[data-planning-order-row]")].map((row) => row.textContent?.replace(/\s+/g, " ").trim() || "") }));
  assert(routeState.rows.some((row) => row.includes("Модуль QA") && row.includes("80 шт.")), `React route selection projected the wrong detail: ${JSON.stringify(routeState)}`);
  const selectedRowId = await evaluate(client, () => { const row = [...document.querySelectorAll("[data-planning-order-row]")].at(-1); row?.querySelector("button")?.click(); return row?.getAttribute("data-planning-order-row") || ""; });
  await waitForCondition(client, (id) => document.querySelector(`[data-planning-order-row="${CSS.escape(id)}"]`)?.classList.contains("is-selected") === true && Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]')), { arg: selectedRowId, message: "Planning structure selection did not stay inside React", timeoutMs: 15_000 });
  assert(await evaluate(client, () => !document.querySelector(".planning-order-page") && [...document.querySelectorAll('[data-ui-component="ActionButton"]')].every((button) => button.disabled)), "React navigation must not expose Planning mutations or mount legacy");
  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=planning&qa-auth-bypass=1&qa-reload=planning-legacy-readback` });
  await waitForCondition(client, () => document.querySelector('.planning-order-page')?.dataset.planningActiveRouteId === "route-qa-2", { message: "legacy Planning did not read back React route selection", timeoutMs: 15_000 });
  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=planning&qa-auth-bypass=1&react-planning-workbench=1&react-planning-workbench-write=1&react-planning-workbench-write-evaluation=1&qa-reload=planning-start-date-write` });
  try {
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]'))
      && document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.disabled === false
      && document.querySelector('[data-react-planning-quantity-form] input[name="quantity"]')?.disabled === true,
    { message: "Planning start-date-only write evaluation did not become ready", timeoutMs: 15_000 });
  } catch (error) {
    const debug = await evaluate(client, () => ({ url: location.href, activeModule: window.__mesRuntime?.getActiveModule?.() || "", activeSidebar: document.querySelector('[data-ui-component="SidebarItem"].is-active')?.textContent?.replace(/\s+/g, " ").trim() || "", reactState: document.querySelector('[data-react-planning-workbench-island]')?.getAttribute("data-react-island-state") || "", reactFailure: document.querySelector('[data-react-planning-workbench-island]')?.getAttribute("data-react-island-failure") || "", startForm: Boolean(document.querySelector("[data-react-planning-start-date-form]")), startInput: document.querySelector('[data-react-planning-start-date-form] input[type="date"]') ? { value: document.querySelector('[data-react-planning-start-date-form] input[type="date"]').value, disabled: document.querySelector('[data-react-planning-start-date-form] input[type="date"]').disabled } : null, startButton: document.querySelector('[data-react-planning-start-date-form] button') ? { text: document.querySelector('[data-react-planning-start-date-form] button').textContent?.trim() || "", disabled: document.querySelector('[data-react-planning-start-date-form] button').disabled } : null, quantityInputDisabled: document.querySelector('[data-react-planning-quantity-form] input[name="quantity"]')?.disabled, alerts: [...document.querySelectorAll('[role="alert"]')].map((item) => item.textContent?.trim() || ""), legacy: Boolean(document.querySelector(".planning-order-page")), body: document.body?.innerText?.slice(0, 1000) || "" }));
    throw new Error(`${error.message}: ${JSON.stringify({ interceptedReads, interceptedPaths, consoleProblems, debug })}`);
  }
  assert(await evaluate(client, () => document.querySelector('[data-react-planning-quantity-form]')?.textContent?.includes("Только чтение в этой проверке") === true),
    "quantity must remain visibly read-only in the narrow start-date evaluation");
  const startDateInitial = await evaluate(client, () => ({ value: document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value || "", context: document.querySelector('[data-react-planning-start-date-form] small')?.textContent?.trim() || "", react: Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]')) }));
  assert(startDateInitial.value === "2026-07-18" && startDateInitial.context === "Гант: 2026-07-20" && startDateInitial.react, `React must distinguish the owner anchor from the existing slot: ${JSON.stringify(startDateInitial)}`);
  const slotBeforeStartDate = structuredClone(items[1].operations[0].slot);
  await evaluate(client, () => { const input = document.querySelector('[data-react-planning-start-date-form] input[type="date"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "2026-02-31"); input.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector("[data-react-planning-start-date-form]")?.requestSubmit(); });
  await delay(150); assert(startDatePatchAttempts === 0, "an impossible calendar date must not leave the React date control");
  // A live command is forbidden unless the browser can durably retain its
  // exact idempotency key before PATCH. Simulate a policy/privacy failure and
  // prove the owner endpoint is never reached.
  await evaluate(client, () => {
    window.__qaOriginalStorageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === "mes-planning-start-date-reconciliation-v1") throw new Error("QA sessionStorage denied");
      return window.__qaOriginalStorageSetItem.call(this, key, value);
    };
    const input = document.querySelector('[data-react-planning-start-date-form] input[type="date"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "2026-07-22");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("[data-react-planning-start-date-form]")?.requestSubmit();
  });
  await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("sessionStorage") === true,
    { message: "sessionStorage failure did not fail closed visibly", timeoutMs: 15_000 });
  assert(startDatePatchAttempts === 0, "sessionStorage failure must block the owner PATCH before dispatch");
  await evaluate(client, () => {
    if (window.__qaOriginalStorageSetItem) Storage.prototype.setItem = window.__qaOriginalStorageSetItem;
    delete window.__qaOriginalStorageSetItem;
  });
  await evaluate(client, () => { const input = document.querySelector('[data-react-planning-start-date-form] input[type="date"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "2026-07-24"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  forceStartDateConflictOnce = true;
  await evaluate(client, () => document.querySelector("[data-react-planning-start-date-form]")?.requestSubmit());
  try { await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("Дата не сохранена"), { message: "Planning start-date revision conflict was not visible", timeoutMs: 15_000 }); }
  catch (error) { const debug = await evaluate(client, () => ({ url: location.href, activeModule: window.__mesRuntime?.getActiveModule?.() || "", value: document.querySelector('[data-react-planning-start-date-form] input')?.value || "", buttonDisabled: document.querySelector('[data-react-planning-start-date-form] button')?.disabled, buttonText: document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() || "", alerts: [...document.querySelectorAll('[role="alert"]')].map((item) => item.textContent?.trim() || ""), reactState: document.querySelector('[data-react-planning-workbench-island]')?.getAttribute("data-react-island-state") || "", legacy: Boolean(document.querySelector(".planning-order-page")), body: document.body?.innerText?.slice(0, 800) || "" })); throw new Error(`${error.message}: ${JSON.stringify({ startDatePatchAttempts, observedStartDateKeys, consoleProblems, debug })}`); }
  await waitForCondition(client, () => document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "2026-07-21"
    && document.querySelector('[data-react-planning-start-date-form] button')?.disabled === true,
  { message: "definitive conflict did not restore the refreshed canonical owner value", timeoutMs: 15_000 });
  await delay(150);
  assert(await evaluate(client, () => Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]'))
    && document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "2026-07-21"
    && document.querySelector('[role="alert"]')?.textContent?.includes("актуаль") === true
    && Boolean(document.querySelector("[data-legacy-domain-write-pause]"))),
  "ordinary conflict alert, canonical value, React island and global pause banner must survive host.update");
  assert(startDatePatchAttempts === 1 && successfulStartDateWrites === 0 && items[1].planningStartDate === "2026-07-21" && items[1].concurrencyRevision === 5,
    "conflicted start-date command must refresh, but not apply the rejected intent to, the owner projection");
  await evaluate(client, () => { const input = document.querySelector('[data-react-planning-start-date-form] input[type="date"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "2026-07-24"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await evaluate(client, () => document.querySelector("[data-react-planning-start-date-form]")?.requestSubmit());
  await waitForCondition(client, () => document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "2026-07-24"
    && document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() === "Сохранить дату"
    && document.querySelector('[data-react-planning-start-date-form] button')?.disabled === true
    && !document.querySelector('[role="alert"]'), { message: "Planning start-date conflict retry did not return through React", timeoutMs: 15_000 });
  assert(startDatePatchAttempts === 2 && successfulStartDateWrites === 1 && items[1].concurrencyRevision === 6, "explicit start-date command after conflict must advance exactly one server revision");
  assert(observedStartDateKeys[0] && observedStartDateKeys[1] && observedStartDateKeys[0] !== observedStartDateKeys[1], "a definitive revision conflict must rotate the idempotency key for the next explicit intent");
  assert(observedStartDateIfMatches[0] === '"4"' && observedStartDateIfMatches[1] === '"5"',
    `conflict retry must use the refreshed canonical If-Match revision: ${JSON.stringify(observedStartDateIfMatches.slice(0, 2))}`);
  assert(items[1].operations[0].slot.plannedStart === slotBeforeStartDate.plannedStart && items[1].operations[0].slot.plannedEnd === slotBeforeStartDate.plannedEnd, "changing the pre-placement anchor must not reschedule an existing slot");

  // Live-like compatibility delay: PostgreSQL has committed, but the exact
  // legacy mirror receipt is not ready yet. React must retain the original
  // expectedRevision/key and reconcile that command rather than inventing a
  // second owner write or replacing the island root.
  await evaluate(client, () => { const input = document.querySelector('[data-react-planning-start-date-form] input[type="date"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "2026-07-23"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  returnCompatibilityPendingOnce = true;
  await evaluate(client, () => document.querySelector("[data-react-planning-start-date-form]")?.requestSubmit());
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]'))
    && document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "2026-07-23"
    && document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() === "Проверить legacy-зеркало"
    && document.querySelector('[role="alert"]')?.textContent?.includes("legacy-зеркало") === true,
  { message: "committed start-date without an exact compatibility receipt did not retain reconciliation mode", timeoutMs: 15_000 });
  assert(startDatePatchAttempts === 3 && successfulStartDateWrites === 2 && items[1].concurrencyRevision === 7,
    "compatibility-pending response must represent exactly one committed owner command");
  assert(observedStartDateKeys[2] && observedStartDateIfMatches[2] === '"6"',
    "compatibility-pending command must expose its original key/revision for exact replay");
  await evaluate(client, () => document.querySelector("[data-react-planning-start-date-form]")?.requestSubmit());
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]'))
    && document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "2026-07-23"
    && document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() === "Сохранить дату"
    && document.querySelector('[data-react-planning-start-date-form] button')?.disabled === true
    && !document.querySelector('[role="alert"]'),
  { message: "same-key compatibility replay did not resolve the committed command in React", timeoutMs: 15_000 });
  assert(startDatePatchAttempts === 4 && successfulStartDateWrites === 2 && items[1].concurrencyRevision === 7,
    "compatibility receipt replay must not apply a second owner write");
  assert(observedStartDateKeys[2] === observedStartDateKeys[3]
    && observedStartDateIfMatches[2] === observedStartDateIfMatches[3],
  "compatibility reconciliation must retain the exact key and expected revision");
  assert(await evaluate(client, () => sessionStorage.getItem("mes-planning-start-date-reconciliation-v1") === null),
    "confirmed compatibility-ready success must clear the durable reconciliation record");

  await evaluate(client, () => { const input = document.querySelector('[data-react-planning-start-date-form] input[type="date"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "2026-07-25"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  loseStartDateResponseOnce = true;
  await evaluate(client, () => document.querySelector("[data-react-planning-start-date-form]")?.requestSubmit());
  try {
    await waitForCondition(client, () => document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "2026-07-25"
      && document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.disabled === true
      && document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() === "Проверить legacy-зеркало"
      && document.querySelector('[role="alert"]')?.textContent?.includes("не подтверждена сервером"), { message: "lost start-date response was not retained visibly", timeoutMs: 15_000 });
  } catch (error) {
    const debug = await evaluate(client, () => ({ value: document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value || "", button: document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() || "", disabled: document.querySelector('[data-react-planning-start-date-form] button')?.disabled, alerts: [...document.querySelectorAll('[role="alert"]')].map((item) => item.textContent?.trim() || ""), reactState: document.querySelector('[data-react-planning-workbench-island]')?.getAttribute("data-react-island-state") || "", legacy: Boolean(document.querySelector(".planning-order-page")) }));
    throw new Error(`${error.message}: ${JSON.stringify({ startDatePatchAttempts, successfulStartDateWrites, observedStartDateKeys, observedStartDateIfMatches, consoleProblems, debug })}`);
  }
  assert(items[1].planningStartDate === "2026-07-25" && items[1].concurrencyRevision === 8 && successfulStartDateWrites === 3, "simulated lost response must represent one committed owner command");
  const retainedAfterLoss = await evaluate(client, () => JSON.parse(sessionStorage.getItem("mes-planning-start-date-reconciliation-v1") || "null"));
  assert(retainedAfterLoss?.routeId === "route-qa-2"
    && retainedAfterLoss?.planningStartDate === "2026-07-25"
    && retainedAfterLoss?.expectedRevision === 7
    && retainedAfterLoss?.idempotencyKey === observedStartDateKeys[4]
    && retainedAfterLoss?.status === "transport-unknown"
    && retainedAfterLoss?.expiresAt - retainedAfterLoss?.createdAt <= 15 * 60 * 1000,
  `lost response did not retain the exact bounded command: ${JSON.stringify(retainedAfterLoss)}`);
  const attemptsBeforeBlockedNavigation = startDatePatchAttempts;
  await evaluate(client, () => window.__mesRuntime?.navigateToModule?.("timesheet"));
  await delay(150);
  assert(await evaluate(client, () => window.__mesRuntime?.getActiveModule?.() === "planning"),
    "normal module departure must be blocked while a command outcome is unknown");
  await evaluate(client, () => document.querySelector('[data-ui-component="SidebarItem"]:not(.is-active)')?.click());
  await waitForCondition(client, () => [...document.querySelectorAll('[role="alert"]')].some((item) => item.textContent?.includes("Сначала проверьте незавершённую команду")),
    { message: "route change was not visibly blocked while reconciliation is pending", timeoutMs: 15_000 });
  assert(startDatePatchAttempts === attemptsBeforeBlockedNavigation
    && await evaluate(client, () => document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.disabled === true),
  "pending reconciliation must block a new route/date intent without another PATCH");
  await evaluate(client, () => window.__mesRuntime?.setFocusMode?.(window.__mesRuntime?.getFocusMode?.()));
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]'))
    && document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "2026-07-25"
    && document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() === "Проверить legacy-зеркало",
  { message: "full shell render lost the durable reconciliation CTA", timeoutMs: 15_000 });
  await evaluate(client, () => {
    const key = "mes-planning-prototype-ui-v1";
    const persistedUi = JSON.parse(localStorage.getItem(key) || "{}");
    persistedUi.activeRouteId = "route-qa-1";
    localStorage.setItem(key, JSON.stringify(persistedUi));
  });
  await client.send("Page.reload", { ignoreCache: true });
  try {
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]'))
      && document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "2026-07-25"
      && document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() === "Проверить legacy-зеркало"
      && document.querySelector('[data-react-planning-start-date-form] button')?.disabled === false,
    { message: "page reload did not restore the retained route and exact reconciliation CTA", timeoutMs: 15_000 });
  } catch (error) {
    const debug = await evaluate(client, () => ({ url: location.href, activeModule: window.__mesRuntime?.getActiveModule?.() || "", reconciliation: sessionStorage.getItem("mes-planning-start-date-reconciliation-v1"), activeSidebar: document.querySelector('[data-ui-component="SidebarItem"].is-active')?.textContent?.replace(/\s+/g, " ").trim() || "", input: document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value || "", button: document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() || "", alerts: [...document.querySelectorAll('[role="alert"]')].map((item) => item.textContent?.trim() || ""), reactState: document.querySelector('[data-react-planning-workbench-island]')?.getAttribute("data-react-island-state") || "", legacy: Boolean(document.querySelector(".planning-order-page")) }));
    throw new Error(`${error.message}: ${JSON.stringify({ startDatePatchAttempts, successfulStartDateWrites, consoleProblems, debug })}`);
  }
  assert(await evaluate(client, (expectedKey) => JSON.parse(sessionStorage.getItem("mes-planning-start-date-reconciliation-v1") || "null")?.idempotencyKey === expectedKey, observedStartDateKeys[4]),
    "page reload replaced or lost the retained idempotency key");
  assert(interceptedPaths.some((path) => path.includes("/api/v1/planning/work-orders/bootstrap?active=route-qa-2")),
    "page reload must bootstrap the retained aggregate instead of the conflicting localStorage selection");
  returnStartDateParityConflictOnce = true;
  await waitForCondition(client, () => {
    const button = document.querySelector('[data-react-planning-start-date-form] button');
    if (!button || button.disabled || button.textContent?.trim() !== "Проверить legacy-зеркало") return false;
    button.click();
    return true;
  }, { message: "retained parity replay button was not available after reload", timeoutMs: 15_000 });
  for (let index = 0; index < 100 && startDatePatchAttempts < 6; index += 1) await delay(20);
  try {
    await waitForCondition(client, () => document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() === "Проверить legacy-зеркало"
      && document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "2026-07-25"
      && [...document.querySelectorAll('[role="alert"]')].some((item) => item.textContent?.includes("не подтверждена сервером")),
    { message: "transient parity 409 discarded the retained command", timeoutMs: 15_000 });
  } catch (error) {
    const debug = await evaluate(client, () => ({ reconciliation: sessionStorage.getItem("mes-planning-start-date-reconciliation-v1"), input: document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value || "", button: document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() || "", buttonDisabled: document.querySelector('[data-react-planning-start-date-form] button')?.disabled, alerts: [...document.querySelectorAll('[role="alert"]')].map((item) => item.textContent?.trim() || ""), reactState: document.querySelector('[data-react-planning-workbench-island]')?.getAttribute("data-react-island-state") || "", legacy: Boolean(document.querySelector(".planning-order-page")) }));
    throw new Error(`${error.message}: ${JSON.stringify({ startDatePatchAttempts, successfulStartDateWrites, observedStartDateKeys, observedStartDateIfMatches, debug })}`);
  }
  assert(startDatePatchAttempts === 6
    && successfulStartDateWrites === 3
    && observedStartDateKeys[5] === observedStartDateKeys[4]
    && observedStartDateIfMatches[5] === observedStartDateIfMatches[4]
    && await evaluate(client, (expectedKey) => JSON.parse(sessionStorage.getItem("mes-planning-start-date-reconciliation-v1") || "null")?.idempotencyKey === expectedKey, observedStartDateKeys[4]),
  `pre-receipt parity 409 must preserve the exact unknown-outcome key without another owner write: ${JSON.stringify({ startDatePatchAttempts, successfulStartDateWrites, observedStartDateKeys, observedStartDateIfMatches })}`);
  // Simulate a server-side metadata revision/read refresh without invoking a
  // forbidden quantity or slot write. The retained retry must keep the exact
  // original expectedRevision + idempotency key and reconcile the committed
  // start-date receipt against the now-newer aggregate.
  items[1].revision += 1; items[1].concurrencyRevision += 1; items[1].updatedAt = "2026-07-19T08:05:00.000Z";
  await evaluate(client, () => document.querySelector("[data-react-planning-start-date-form]")?.requestSubmit());
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]'))
    && document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "2026-07-25"
    && document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() === "Сохранить дату"
    && document.querySelector('[data-react-planning-start-date-form] button')?.disabled === true
    && !document.querySelector('[role="alert"]'), { message: "idempotent start-date replay did not restore owner read-back", timeoutMs: 15_000 });
  assert(startDatePatchAttempts === 7 && successfulStartDateWrites === 3 && items[1].concurrencyRevision === 9, "same-key replay after a lost response and unrelated owner revision must not apply a fourth owner write");
  assert(observedStartDateKeys[4] && observedStartDateKeys[4] === observedStartDateKeys[5] && observedStartDateKeys[4] === observedStartDateKeys[6] && observedStartDateKeys[4] !== observedStartDateKeys[3], "React must retain a key through parity delay and rotate it for the next date");
  assert(await evaluate(client, () => sessionStorage.getItem("mes-planning-start-date-reconciliation-v1") === null),
    "receipt-ready replay after reload must clear the durable command record");
  assert(items[1].operations[0].slot.plannedStart === slotBeforeStartDate.plannedStart && items[1].operations[0].slot.plannedEnd === slotBeforeStartDate.plannedEnd, "idempotent anchor replay must leave physical slot coordinates stable");
  await evaluate(client, () => { const input = document.querySelector('[data-react-planning-start-date-form] input[type="date"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "2026-07-26"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  loseStartDateResponseOnce = true;
  await evaluate(client, () => document.querySelector("[data-react-planning-start-date-form]")?.requestSubmit());
  try {
    await waitForCondition(client, () => document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() === "Проверить legacy-зеркало", { message: "second lost response did not enter retained-request mode", timeoutMs: 15_000 });
  } catch (error) {
    const debug = await evaluate(client, () => ({ value: document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value || "", button: document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() || "", disabled: document.querySelector('[data-react-planning-start-date-form] button')?.disabled, alerts: [...document.querySelectorAll('[role="alert"]')].map((item) => item.textContent?.trim() || ""), reactState: document.querySelector('[data-react-planning-workbench-island]')?.getAttribute("data-react-island-state") || "", legacy: Boolean(document.querySelector(".planning-order-page")), banner: Boolean(document.querySelector("[data-legacy-domain-write-pause]")) }));
    throw new Error(`${error.message}: ${JSON.stringify({ startDatePatchAttempts, successfulStartDateWrites, observedStartDateKeys, observedStartDateIfMatches, consoleProblems, debug })}`);
  }
  assert(items[1].planningStartDate === "2026-07-26" && items[1].concurrencyRevision === 10 && successfulStartDateWrites === 4, "second lost response must commit A exactly once");
  items[1].planningStartDate = "2026-07-27"; items[1].metadata.planningStartDate = "2026-07-27"; items[1].revision += 1; items[1].concurrencyRevision += 1;
  await evaluate(client, () => document.querySelector("[data-react-planning-start-date-form]")?.requestSubmit());
  try {
    await waitForCondition(client, () => document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "2026-07-27"
      && document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() === "Сохранить дату"
      && document.querySelector('[data-react-planning-start-date-form] button')?.disabled === true
      && document.querySelector('[role="alert"]')?.textContent?.includes("актуаль"), { message: "superseded replay did not end retained mode or show canonical B", timeoutMs: 15_000 });
  } catch (error) {
    const debug = await evaluate(client, () => ({ value: document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value || "", button: document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() || "", disabled: document.querySelector('[data-react-planning-start-date-form] button')?.disabled, alerts: [...document.querySelectorAll('[role="alert"]')].map((item) => item.textContent?.trim() || ""), reactState: document.querySelector('[data-react-planning-workbench-island]')?.getAttribute("data-react-island-state") || "", legacy: Boolean(document.querySelector(".planning-order-page")), banner: Boolean(document.querySelector("[data-legacy-domain-write-pause]")) }));
    throw new Error(`${error.message}: ${JSON.stringify({ startDatePatchAttempts, observedStartDateKeys, observedStartDateIfMatches, consoleProblems, debug })}`);
  }
  await delay(150);
  assert(await evaluate(client, () => document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "2026-07-27"
    && document.querySelector('[role="alert"]')?.textContent?.includes("актуаль") === true),
  "superseded explanation must survive the canonical B payload rerender");
  assert(startDatePatchAttempts === 9 && successfulStartDateWrites === 4 && items[1].planningStartDate === "2026-07-27" && items[1].concurrencyRevision === 11,
    "replaying committed A after actor B superseded it must never overwrite canonical B");
  assert(observedStartDateKeys[7] && observedStartDateKeys[7] === observedStartDateKeys[8], "superseded reconciliation must use the exact retained A key");
  await evaluate(client, () => { const input = document.querySelector('[data-react-planning-start-date-form] input[type="date"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "2026-07-26"); input.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector("[data-react-planning-start-date-form]")?.requestSubmit(); });
  await waitForCondition(client, () => document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "2026-07-26"
    && document.querySelector('[data-react-planning-start-date-form] button')?.disabled === true
    && !document.querySelector('[role="alert"]'), { message: "explicit A after superseded B did not create a new command", timeoutMs: 15_000 });
  assert(startDatePatchAttempts === 10 && successfulStartDateWrites === 5 && items[1].planningStartDate === "2026-07-26" && items[1].concurrencyRevision === 12,
    "an explicit post-supersede A command must apply once against canonical B");
  assert(observedStartDateKeys[9] && observedStartDateKeys[9] !== observedStartDateKeys[8], "post-supersede A must use a new idempotency key");
  const attemptsBeforeStaleRecordQa = startDatePatchAttempts;
  await evaluate(client, () => {
    const now = Date.now();
    sessionStorage.setItem("mes-planning-start-date-reconciliation-v1", JSON.stringify({ schemaVersion: 1, appVersion: "v.0.000.00", routeId: "route-qa-2", planningStartDate: "2026-07-26", expectedRevision: 12, idempotencyKey: "planning-start-date:stale-version-qa", status: "transport-unknown", message: "stale version", createdAt: now, updatedAt: now, expiresAt: now + 15 * 60 * 1000 }));
  });
  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=planning&qa-auth-bypass=1&react-planning-workbench=1&react-planning-workbench-write=1&qa-reload=planning-start-date-clear-reconcile` });
  await waitForCondition(client, () => location.search.includes("qa-reload=planning-start-date-clear-reconcile")
    && Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]'))
    && document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "2026-07-26"
    && sessionStorage.getItem("mes-planning-start-date-reconciliation-v1") === null
    && document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() === "Сохранить дату",
  { message: "version-mismatch reconciliation cleanup did not return to React", timeoutMs: 15_000 });
  assert(await evaluate(client, () => sessionStorage.getItem("mes-planning-start-date-reconciliation-v1") === null
    && document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() === "Сохранить дату"),
  "a reconciliation record from another release must be discarded without a CTA");
  await evaluate(client, () => {
    const now = Date.now();
    const appVersion = String(window.__MES_DEPLOY_VERSION__ || "v.1.500.26");
    sessionStorage.setItem("mes-planning-start-date-reconciliation-v1", JSON.stringify({ schemaVersion: 1, appVersion, routeId: "route-qa-2", planningStartDate: "2026-07-26", expectedRevision: 12, idempotencyKey: "planning-start-date:expired-qa", status: "transport-unknown", message: "expired", createdAt: now - (16 * 60 * 1000), updatedAt: now - (16 * 60 * 1000), expiresAt: now - 1000 }));
  });
  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=planning&qa-auth-bypass=1&react-planning-workbench=1&react-planning-workbench-write=1&qa-reload=planning-start-date-clear-react-readback` });
  await waitForCondition(client, () => location.search.includes("qa-reload=planning-start-date-clear-react-readback")
    && Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]'))
    && document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "2026-07-26"
    && sessionStorage.getItem("mes-planning-start-date-reconciliation-v1") === null
    && document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() === "Сохранить дату",
  { message: "expired reconciliation cleanup did not return to React", timeoutMs: 15_000 });
  assert(await evaluate(client, () => sessionStorage.getItem("mes-planning-start-date-reconciliation-v1") === null
    && document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() === "Сохранить дату"),
  "an expired reconciliation record must be discarded without a CTA");
  await evaluate(client, () => {
    const now = Date.now();
    const appVersion = String(window.__MES_DEPLOY_VERSION__ || "v.1.500.26");
    sessionStorage.setItem("mes-planning-start-date-reconciliation-v1", JSON.stringify({ schemaVersion: 1, appVersion, routeId: "route-qa-2", planningStartDate: "2026-07-26", expectedRevision: 12, idempotencyKey: "planning-start-date:owner-off-qa", status: "transport-unknown", message: "owner off", createdAt: now, updatedAt: now, expiresAt: now + 15 * 60 * 1000 }));
  });
  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=planning&qa-auth-bypass=1&qa-reload=planning-reconciliation-off` });
  await waitForCondition(client, () => Boolean(document.querySelector(".planning-order-page")), { message: "owner-off reconciliation QA did not return to legacy", timeoutMs: 15_000 });
  assert(await evaluate(client, () => sessionStorage.getItem("mes-planning-start-date-reconciliation-v1") === null
    && !document.querySelector('[data-react-planning-start-date-form]')),
  "owner/evaluation OFF must remove the latent reconciliation CTA and record");
  assert(startDatePatchAttempts === attemptsBeforeStaleRecordQa, "version, TTL and OFF cleanup must never issue an owner PATCH");
  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=planning&qa-auth-bypass=1&react-planning-workbench=1&react-planning-workbench-write=1&qa-reload=planning-start-date-react-readback` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]')) && document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "2026-07-26", { message: "React reload did not read back the canonical Planning start date", timeoutMs: 15_000 });
  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=planning&qa-auth-bypass=1&qa-reload=planning-start-date-legacy-readback` });
  await waitForCondition(client, () => document.querySelector('.planning-order-page')?.dataset.planningActiveRouteId === "route-qa-2" && document.querySelector('[data-planning-start-date="route-qa-2"]')?.value === "2026-07-26", { message: "legacy rollback view did not read back the React owner start date", timeoutMs: 15_000 });
  // A disposable Pilot fixture may start with canonical NULL. Prove the full
  // reversible lifecycle through the real React shell: set was read above,
  // then explicit clear survives a lost response/reload and is reconciled by
  // the same idempotency key before both React and legacy read back empty.
  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=planning&qa-auth-bypass=1&react-planning-workbench=1&react-planning-workbench-write=1&qa-reload=planning-start-date-clear` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]'))
    && document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "2026-07-26"
    && document.querySelector('[data-react-planning-start-date-clear]')?.disabled === false,
  { message: "React clear control was not available for the canonical set date", timeoutMs: 15_000 });
  loseStartDateResponseOnce = true;
  await evaluate(client, () => document.querySelector('[data-react-planning-start-date-clear]')?.click());
  await waitForCondition(client, () => document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === ""
    && document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() === "Проверить legacy-зеркало"
    && document.querySelector('[data-react-planning-start-date-form] button')?.disabled === false,
  { message: "lost nullable-clear response did not enter durable reconciliation mode", timeoutMs: 15_000 });
  assert(startDatePatchAttempts === 11 && successfulStartDateWrites === 6
    && items[1].planningStartDate === null && !Object.prototype.hasOwnProperty.call(items[1].metadata, "planningStartDate"),
  "explicit clear must commit once, remove compatibility metadata and preserve unknown-outcome reconciliation");
  const retainedClear = await evaluate(client, () => JSON.parse(sessionStorage.getItem("mes-planning-start-date-reconciliation-v1") || "null"));
  assert(retainedClear?.schemaVersion === 2
    && retainedClear?.intent === "clear"
    && Object.prototype.hasOwnProperty.call(retainedClear, "planningStartDate")
    && retainedClear.planningStartDate === null,
  "durable reconciliation must retain explicit nullable clear intent rather than missing/empty");
  const clearKey = retainedClear.idempotencyKey;
  const clearIfMatch = observedStartDateIfMatches[10];
  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=planning&qa-auth-bypass=1&react-planning-workbench=1&react-planning-workbench-write=1&qa-reload=planning-start-date-clear-reconcile` });
  await waitForCondition(client, () => location.search.includes("qa-reload=planning-start-date-clear-reconcile")
    && Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]'))
    && document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === ""
    && document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() === "Проверить legacy-зеркало",
  { message: "reload did not restore the exact nullable-clear reconciliation CTA", timeoutMs: 15_000 });
  assert(await evaluate(client, (expectedKey) => JSON.parse(sessionStorage.getItem("mes-planning-start-date-reconciliation-v1") || "null")?.idempotencyKey === expectedKey, clearKey),
    "reload must retain the exact clear idempotency key");
  await waitForCondition(client, () => {
    const button = document.querySelector('[data-react-planning-start-date-form] button[type="submit"]');
    if (!button || button.disabled || button.textContent?.trim() !== "Проверить legacy-зеркало") return false;
    button.click();
    return true;
  }, { message: "nullable-clear reconciliation button was not interactable after reload", timeoutMs: 15_000 });
  try {
    await waitForCondition(client, () => document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === ""
      && document.querySelector('[data-react-planning-start-date-form] button')?.textContent?.trim() === "Сохранить дату"
      && document.querySelector('[data-react-planning-start-date-form] button')?.disabled === true
      && sessionStorage.getItem("mes-planning-start-date-reconciliation-v1") === null,
    { message: "same-key nullable-clear replay did not close the durable receipt", timeoutMs: 15_000 });
  } catch (error) {
    const debug = await evaluate(client, () => ({
      input: document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value,
      inputRequired: document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.required,
      formValid: document.querySelector('[data-react-planning-start-date-form]')?.checkValidity?.(),
      buttons: [...document.querySelectorAll('[data-react-planning-start-date-form] button')].map((button) => ({ text: button.textContent?.trim(), disabled: button.disabled })),
      reconciliation: sessionStorage.getItem("mes-planning-start-date-reconciliation-v1"),
      alerts: [...document.querySelectorAll('[role="alert"]')].map((item) => item.textContent?.trim()),
      island: document.querySelector('[data-react-planning-workbench-island]')?.getAttribute("data-react-island-state"),
    }));
    throw new Error(`${error.message}: ${JSON.stringify({ startDatePatchAttempts, successfulStartDateWrites, observedStartDateKeys, observedStartDateIfMatches, lastCompatibilityReceipt, debug })}`);
  }
  assert(startDatePatchAttempts === 12 && successfulStartDateWrites === 6
    && observedStartDateKeys[10] === clearKey && observedStartDateKeys[11] === clearKey
    && observedStartDateIfMatches[10] === clearIfMatch && observedStartDateIfMatches[11] === clearIfMatch,
  "lost-response clear replay must use the exact key/revision without a second owner write");
  assert(lastCompatibilityReceipt?.ready === true && lastCompatibilityReceipt?.unresolvedCount === 0,
    "nullable clear must close with an exact applied compatibility receipt and zero unresolved rows");
  assert(items[1].operations[0].slot.plannedStart === slotBeforeStartDate.plannedStart
    && items[1].operations[0].slot.plannedEnd === slotBeforeStartDate.plannedEnd,
  "nullable start-date clear must not move physical Gantt slots");
  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=planning&qa-auth-bypass=1&react-planning-workbench=1&react-planning-workbench-write=1&qa-reload=planning-start-date-clear-react-readback` });
  await waitForCondition(client, () => location.search.includes("qa-reload=planning-start-date-clear-react-readback")
    && Boolean(document.querySelector('[data-react-planning-workbench-island][data-react-island-state="ready"]'))
    && document.querySelector('[data-react-planning-start-date-form] input[type="date"]')?.value === "",
  { message: "React reload did not read back the canonical cleared start date", timeoutMs: 15_000 });
  await client.send("Page.navigate", { url: `${enabledOrigin}/?module=planning&qa-auth-bypass=1&qa-reload=planning-start-date-clear-legacy-readback` });
  await waitForCondition(client, () => document.querySelector('.planning-order-page')?.dataset.planningActiveRouteId === "route-qa-2"
    && document.querySelector('[data-planning-start-date="route-qa-2"]')?.value === "",
  { message: "legacy rollback view did not read back the canonical cleared start date", timeoutMs: 15_000 });
  assert(unexpectedPlanningPatchAttempts === 0, "narrow start-date evaluation must never issue quantity or slot PATCH requests");
  assert(items[1].quantity === 80, "narrow start-date evaluation must not alter quantity");
  assert(interceptedReads >= 4, "legacy and React paths must consume PostgreSQL work-order bootstrap"); assert(consoleProblems.length === 0, `browser console problems:\n${consoleProblems.join("\n")}`); assert(await readFile(sharedStateFile, "utf8") === original, "Planning read-only QA changed state");
  console.log("Planning Workbench React production-shell functional QA: OK"); console.log(`- parity: ${react.queue.length} work orders, 5 readiness metrics, ${react.rows.length} structure rows; first commit ${react.state.commitMs.toFixed(2)} ms`); console.log("- production/compact UI, React navigation, start-date-only conflict/lost-response/superseded replay, canonical React/legacy read-back, read-only quantity, stable Gantt slot, unchanged snapshot and clean console: pass");
} catch (error) { if (enabledOutput.trim()) console.error(enabledOutput.trim()); if (legacyOutput.trim()) console.error(legacyOutput.trim()); throw error; } finally { if (chrome) await cleanupChrome(chrome); await Promise.all([stop(enabledPreview), stop(legacyPreview)]); await rm(temporaryRoot, { recursive: true, force: true }); }
