import { spawn } from "node:child_process";
import { cleanupChrome, delay, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const now = new Date(); now.setHours(8, 0, 0, 0);
const later = (hours) => new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
const projection = {
  revision: 19,
  routes: [{ id: "qa-react-gantt-route", name: "Маршрут React Gantt", planningQuantity: 24, planningStatus: "scheduled", lifecycleStatus: "released", unit: "шт.", domainConcurrencyRevision: 19 }],
  routeSteps: [
    { id: "qa-react-gantt-step-1", routeId: "qa-react-gantt-route", stepOrder: 1, operationId: "OP-1", operationName: "Монтаж", workCenterId: "D5", isRequired: true, quantityMultiplier: 1 },
    { id: "qa-react-gantt-step-2", routeId: "qa-react-gantt-route", stepOrder: 2, operationId: "OP-2", operationName: "Контроль", workCenterId: "D6", isRequired: true, quantityMultiplier: 1 },
  ],
  slots: [
    { id: "qa-react-gantt-slot-1", routeId: "qa-react-gantt-route", routeStepId: "qa-react-gantt-step-1", planningOrderId: "qa-react-gantt-route", workCenterId: "D5", operationId: "OP-1", operationName: "Монтаж", quantity: 24, unit: "шт.", plannedStart: later(0), plannedEnd: later(4), status: "planned" },
    { id: "qa-react-gantt-slot-2", routeId: "qa-react-gantt-route", routeStepId: "qa-react-gantt-step-2", planningOrderId: "qa-react-gantt-route", workCenterId: "D6", operationId: "OP-2", operationName: "Контроль", quantity: 24, unit: "шт.", plannedStart: later(5), plannedEnd: later(7), status: "planned", isLocked: true },
  ],
};
const workOrderItem = () => ({
  id: projection.routes[0].id,
  number: "WO-GANTT-QA",
  name: projection.routes[0].name,
  quantity: 24,
  concurrencyRevision: projection.routes[0].domainConcurrencyRevision,
  revision: projection.routes[0].domainConcurrencyRevision,
  metadata: { id: projection.routes[0].id, name: projection.routes[0].name, planningQuantity: 24 },
  operations: projection.routeSteps.map((step) => ({ ...step, slot: { ...projection.slots.find((slot) => slot.routeStepId === step.id) } })),
});

async function waitPreview(origin) {
  for (let index = 0; index < 100; index += 1) {
    try { const response = await fetch(`${origin}/?module=gantt&qa-auth-bypass=1`); if (response.ok && (await response.text()).includes('id="app"')) return; } catch {}
    await delay(120);
  }
  throw new Error(`Gantt preview did not start at ${origin}`);
}
async function stop(child) {
  if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  await new Promise((resolve) => { if (child.exitCode !== null) return resolve(); const timer = setTimeout(resolve, 1200); child.once("exit", () => { clearTimeout(timer); resolve(); }); });
}

const port = await getFreePort(); const origin = `http://127.0.0.1:${port}`;
const preview = spawn(process.execPath, ["scripts/preview-dist.mjs"], { cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru" }, stdio: ["ignore", "pipe", "pipe"] });
let previewOutput = ""; preview.stdout.on("data", (chunk) => { previewOutput += chunk; }); preview.stderr.on("data", (chunk) => { previewOutput += chunk; });
let chrome = null; let mountFailureChrome = null; const consoleProblems = []; let projectionReads = 0; let planningWrites = 0; let schedulePatchAttempts = 0; let successfulScheduleWrites = 0; let forceScheduleConflict = false;
try {
  await waitPreview(origin); chrome = await launchChrome("mes-gantt-react-island-qa-"); const { client } = chrome;
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    if (message.method !== "Fetch.requestPaused") return;
    const requestUrl = new URL(message.params.request.url); const method = message.params.request.method;
    const fulfill = (payload, responseCode = 200, etag = "gantt-react-r19") => client.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }, { name: "ETag", value: `"${etag}"` }], body: Buffer.from(JSON.stringify(payload)).toString("base64") }).catch((error) => consoleProblems.push(error.message));
    if (requestUrl.pathname === "/api/v1/planning/work-orders/projection") {
      projectionReads += 1;
      void fulfill({ ok: true, projection }, 200, `gantt-react-r${projection.routes[0].domainConcurrencyRevision}`);
      return;
    }
    const scheduleMatch = requestUrl.pathname.match(/^\/api\/v1\/planning\/work-orders\/([^/]+)\/operations\/([^/]+)\/slot$/);
    if (scheduleMatch && method === "PATCH") {
      planningWrites += 1; schedulePatchAttempts += 1;
      const routeId = decodeURIComponent(scheduleMatch[1]); const operationId = decodeURIComponent(scheduleMatch[2]); const body = JSON.parse(message.params.request.postData || "{}");
      const revision = projection.routes[0].domainConcurrencyRevision; const ifMatch = Object.entries(message.params.request.headers || {}).find(([key]) => key.toLowerCase() === "if-match")?.[1] || "";
      if (routeId !== projection.routes[0].id || !projection.routeSteps.some((step) => step.id === operationId)) void fulfill({ ok: false, error: "not found" }, 404);
      else if (forceScheduleConflict || Number(body.expectedRevision) !== revision || ifMatch !== `"${revision}"`) { forceScheduleConflict = false; void fulfill({ ok: false, conflict: true, item: workOrderItem(), error: "revision conflict" }, 409, `gantt-react-r${revision}`); }
      else {
        const slot = projection.slots.find((entry) => entry.routeStepId === operationId); const nextStart = new Date(body.plannedStart); const duration = new Date(slot.plannedEnd).getTime() - new Date(slot.plannedStart).getTime();
        slot.plannedStart = nextStart.toISOString(); slot.plannedEnd = new Date(nextStart.getTime() + duration).toISOString(); projection.routes[0].domainConcurrencyRevision += 1; projection.revision += 1; successfulScheduleWrites += 1;
        const { operations, ...compact } = workOrderItem(); void fulfill({ ok: true, item: compact }, 200, `gantt-react-r${projection.routes[0].domainConcurrencyRevision}`);
      }
      return;
    }
    if (requestUrl.pathname === "/api/v1/planning/work-orders" && method === "GET") { const { operations, ...compact } = workOrderItem(); void fulfill({ ok: true, items: [compact] }, 200, `gantt-react-r${projection.routes[0].domainConcurrencyRevision}`); return; }
    if (requestUrl.pathname === `/api/v1/planning/work-orders/${projection.routes[0].id}` && method === "GET") { void fulfill({ ok: true, item: workOrderItem() }, 200, `gantt-react-r${projection.routes[0].domainConcurrencyRevision}`); return; }
    if (requestUrl.pathname.startsWith("/api/v1/planning") && method !== "GET") planningWrites += 1;
    void client.send("Fetch.continueRequest", { requestId: message.params.requestId }).catch((error) => consoleProblems.push(error.message));
  });
  await client.send("Page.enable"); await client.send("Runtime.enable");
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `if (!localStorage.getItem("mes-planning-prototype-ui-v1")) localStorage.setItem("mes-planning-prototype-ui-v1", JSON.stringify({ activeModule: "gantt", scale: "hours", windowStart: ${JSON.stringify(now.toISOString().slice(0, 10))}, expandedProjects: ["qa-react-gantt-route"], ganttZoom: 1 }));` });
  await client.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/planning/*", requestStage: "Request" }] });
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: `${origin}/?module=gantt&qa-auth-bypass=1` });
  try {
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-gantt-island][data-react-island-state="ready"]')) && document.querySelectorAll('[data-ui-component="GanttSlot"]').length >= 2, { message: "Gantt React island not ready", timeoutMs: 20_000 });
  } catch (error) {
    const diagnostic = await evaluate(client, () => ({ href: location.href, text: document.body.innerText.replace(/\s+/g, " ").slice(0, 500), reactState: document.querySelector("[data-react-gantt-island]")?.getAttribute("data-react-island-state"), legacy: Boolean(document.querySelector("[data-gantt-shell]")), rows: document.querySelectorAll("[data-row-id]").length, slots: document.querySelectorAll('[data-ui-component="GanttSlot"]').length, ui: localStorage.getItem("mes-planning-prototype-ui-v1") }));
    throw new Error(`${error.message}: ${JSON.stringify(diagnostic)} console=${JSON.stringify(consoleProblems)}`);
  }
  const react = await evaluate(client, () => { const target = document.querySelector("[data-react-gantt-island]"); const canvas = document.querySelector('[data-ui-component="GanttCanvas"]'); const slots = [...document.querySelectorAll('[data-ui-component="GanttSlot"]')]; slots.find((slot) => !slot.classList.contains("is-aggregate"))?.click(); const toolbar = getComputedStyle(document.querySelector(".gantt-react-toolbar")); const grid = getComputedStyle(document.querySelector(".gantt-react-grid")); const action = getComputedStyle(document.querySelector(".gantt-react-detail .action")); const metric = getComputedStyle(document.querySelector(".metric-card")); const detailPanel = getComputedStyle(document.querySelector(".gantt-react-detail")); return { rows: document.querySelectorAll("[data-row-id]").length, slots: slots.length, metrics: document.querySelectorAll('[data-ui-component="MetricCard"]').length, dependencies: [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.includes("Зависимости (1)")), width: canvas?.getBoundingClientRect().width || 0, commitMs: Number(target?.getAttribute("data-react-island-commit-ms")), source: document.body.innerText.includes("PostgreSQL projection"), detail: document.querySelector(".gantt-react-detail h2")?.textContent?.trim(), toolbarDisplay: toolbar.display, toolbarRadius: parseFloat(toolbar.borderRadius), gridColumns: grid.gridTemplateColumns.split(" ").length, actionRadius: parseFloat(action.borderRadius), metricDisplay: metric.display, metricRadius: parseFloat(metric.borderRadius), metricBackground: metric.backgroundColor, detailRadius: parseFloat(detailPanel.borderRadius), detailBackground: detailPanel.backgroundColor, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }; });
  assert(react.rows >= 2 && react.slots >= 2 && react.metrics === 4 && react.width > 0 && react.source, `Gantt React projection/geometry failed: ${JSON.stringify(react)}`);
  assert(react.dependencies && react.commitMs < 2000 && react.detail && react.toolbarDisplay === "grid" && react.toolbarRadius >= 16 && react.gridColumns === 2 && react.actionRadius >= 8 && react.metricDisplay === "grid" && react.metricRadius >= 5 && react.metricBackground !== "rgba(0, 0, 0, 0)" && react.detailRadius >= 16 && react.detailBackground !== "rgba(0, 0, 0, 0)" && !react.overflow, `Gantt React dependency/style/telemetry failed: ${JSON.stringify(react)}`);
  const toolbarCenterSpread = await evaluate(client, () => { const centers = [...document.querySelectorAll(".gantt-react-toolbar > *")].map((element) => { const rect = element.getBoundingClientRect(); return rect.top + rect.height / 2; }); return Math.max(...centers) - Math.min(...centers); });
  assert(toolbarCenterSpread < 2, `Gantt toolbar controls must stay on one row; center spread ${toolbarCenterSpread}`);
  const persistedWindowStart = new Date(now); persistedWindowStart.setDate(persistedWindowStart.getDate() + 2); const persistedWindowStartValue = persistedWindowStart.toISOString().slice(0, 10);
  await evaluate(client, () => document.querySelector('[data-gantt-react-scale="weeks"]')?.click());
  await waitForCondition(client, () => document.querySelector('[data-gantt-react-scale="weeks"]')?.getAttribute("aria-pressed") === "true" && Boolean(document.querySelector('[data-react-gantt-island][data-react-island-state="ready"]')) && !document.querySelector("[data-gantt-shell]"), { message: "React Gantt scale navigation returned to legacy or did not select weeks", timeoutMs: 15_000 });
  await evaluate(client, () => document.querySelector('[data-gantt-react-zoom="in"]')?.click());
  await waitForCondition(client, () => document.querySelector('[data-gantt-react-zoom="reset"]')?.textContent?.trim() === "150%" && !document.querySelector("[data-gantt-shell]"), { message: "React Gantt zoom did not advance inside React", timeoutMs: 15_000 });
  await evaluate(client, (value) => { const input = document.querySelector("[data-gantt-react-period] input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); }, persistedWindowStartValue);
  try {
    await waitForCondition(client, (value) => document.querySelector("[data-gantt-react-period] input")?.value === value && !document.querySelector("[data-gantt-shell]"), { arg: persistedWindowStartValue, message: "React Gantt period filter did not stay in React", timeoutMs: 15_000 });
  } catch (error) {
    const diagnostic = await evaluate(client, () => ({ input: document.querySelector("[data-gantt-react-period] input")?.value, state: localStorage.getItem("mes-planning-prototype-ui-v1"), react: document.querySelector("[data-react-gantt-island]")?.getAttribute("data-react-island-state"), legacy: Boolean(document.querySelector("[data-gantt-shell]")), alert: document.querySelector('[role="alert"]')?.textContent }));
    throw new Error(`${error.message}: ${JSON.stringify(diagnostic)}`);
  }
  assert(planningWrites === 0, "React Gantt toolbar navigation must not call planning writes");

  await client.send("Page.navigate", { url: `${origin}/?module=gantt&qa-auth-bypass=1&qa-reload=gantt-toolbar-deep-link` });
  await waitForCondition(client, (value) => Boolean(document.querySelector('[data-react-gantt-island][data-react-island-state="ready"]')) && document.querySelector("[data-gantt-react-period] input")?.value === value && document.querySelector('[data-gantt-react-scale="weeks"]')?.getAttribute("aria-pressed") === "true" && document.querySelector('[data-gantt-react-zoom="reset"]')?.textContent?.trim() === "150%" && !document.querySelector("[data-gantt-shell]"), { arg: persistedWindowStartValue, message: "React Gantt toolbar state did not survive reload/deep-link", timeoutMs: 20_000 });
  const persistedToolbarState = await evaluate(client, () => { const state = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}"); return { activeModule: state.activeModule, scale: state.scale, windowStart: state.windowStart, zoom: state.ganttZoom, href: location.href }; });
  assert(persistedToolbarState.activeModule === "gantt" && persistedToolbarState.scale === "weeks" && persistedToolbarState.windowStart === persistedWindowStartValue && persistedToolbarState.zoom === 1.5 && persistedToolbarState.href.includes("module=gantt") && persistedToolbarState.href.includes("qa-reload=gantt-toolbar-deep-link"), `Gantt toolbar owner-state/deep-link persistence failed: ${JSON.stringify(persistedToolbarState)}`);

  await evaluate(client, () => document.querySelector("[data-gantt-react-toggle-quantity]")?.click());
  await waitForCondition(client, () => document.querySelector("[data-gantt-react-toggle-quantity]")?.getAttribute("aria-pressed") === "false" && !document.querySelector("[data-gantt-react-slot-quantity]") && !document.querySelector("[data-gantt-shell]"), { message: "React Gantt quantity toggle returned to legacy or left quantity visible", timeoutMs: 15_000 });
  // The previous toolbar check deliberately moved the window beyond the QA
  // slots. Return to a visible window before testing route collapse; a route
  // that is outside the projection window is correctly not toggleable.
  await evaluate(client, () => document.querySelector("[data-gantt-react-jump-today]")?.click());
  await waitForCondition(client, (value) => document.querySelector("[data-gantt-react-period] input")?.value === value && document.querySelector("[data-gantt-react-toggle-expanded-routes]")?.getAttribute("aria-pressed") === "true" && !document.querySelector("[data-gantt-shell]"), { arg: now.toISOString().slice(0, 10), message: "React Gantt jump-to-today did not restore the visible expanded route", timeoutMs: 15_000 });
  await evaluate(client, () => document.querySelector("[data-gantt-react-toggle-expanded-routes]")?.click());
  await waitForCondition(client, (expandedRowCount) => document.querySelector("[data-gantt-react-toggle-expanded-routes]")?.getAttribute("aria-pressed") === "false" && document.querySelectorAll("[data-row-id]").length < expandedRowCount && !document.querySelector("[data-gantt-shell]"), { arg: react.rows, message: "React Gantt collapse-all returned to legacy or kept all resource rows", timeoutMs: 15_000 });
  const collapsedUi = await evaluate(client, () => JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}"));
  assert(Array.isArray(collapsedUi.expandedProjects) && !collapsedUi.expandedProjects.includes("qa-react-gantt-route"), `React Gantt collapse was not persisted: ${JSON.stringify(collapsedUi.expandedProjects)}`);
  assert(await evaluate(client, () => Boolean(document.querySelector("[data-gantt-react-refresh]"))), "read-only PostgreSQL projection refresh must appear separately from calendar recalculation");
  assert(planningWrites === 0, "safe React Gantt display actions must not call planning writes");

  await client.send("Page.navigate", { url: `${origin}/?module=gantt&qa-auth-bypass=1&qa-reload=gantt-safe-toolbar-deep-link` });
  try {
    await waitForCondition(client, (value) => Boolean(document.querySelector('[data-react-gantt-island][data-react-island-state="ready"]')) && document.querySelector("[data-gantt-react-period] input")?.value === value && document.querySelector("[data-gantt-react-toggle-expanded-routes]")?.getAttribute("aria-pressed") === "false" && document.querySelector("[data-gantt-react-toggle-quantity]")?.getAttribute("aria-pressed") === "false" && !document.querySelector("[data-gantt-react-slot-quantity]") && !document.querySelector("[data-gantt-shell]"), { arg: now.toISOString().slice(0, 10), message: "safe React Gantt display state did not survive reload/deep-link", timeoutMs: 20_000 });
  } catch (error) {
    const diagnostic = await evaluate(client, () => ({
      ready: document.querySelector('[data-react-gantt-island]')?.getAttribute("data-react-island-state"),
      period: document.querySelector("[data-gantt-react-period] input")?.value,
      expanded: document.querySelector("[data-gantt-react-toggle-expanded-routes]")?.getAttribute("aria-pressed"),
      quantity: document.querySelector("[data-gantt-react-toggle-quantity]")?.getAttribute("aria-pressed"),
      quantitySlots: document.querySelectorAll("[data-gantt-react-slot-quantity]").length,
      state: localStorage.getItem("mes-planning-prototype-ui-v1"),
    }));
    throw new Error(`${error.message}: ${JSON.stringify(diagnostic)}`);
  }
  const safeToolbarState = await evaluate(client, () => { const state = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}"); return { expandedProjects: state.expandedProjects, showQuantity: state.ganttShowQuantity, windowStart: state.windowStart, href: location.href }; });
  assert(Array.isArray(safeToolbarState.expandedProjects) && !safeToolbarState.expandedProjects.includes("qa-react-gantt-route") && safeToolbarState.showQuantity === false && safeToolbarState.windowStart === now.toISOString().slice(0, 10) && safeToolbarState.href.includes("qa-reload=gantt-safe-toolbar-deep-link"), `safe Gantt toolbar owner-state persistence failed: ${JSON.stringify(safeToolbarState)}`);

  await evaluate(client, () => document.querySelector("[data-gantt-react-toggle-expanded-routes]")?.click());
  await waitForCondition(client, (expandedRowCount) => document.querySelector("[data-gantt-react-toggle-expanded-routes]")?.getAttribute("aria-pressed") === "true" && document.querySelectorAll("[data-row-id]").length >= expandedRowCount, { arg: react.rows, message: "React Gantt did not restore expanded routes before command QA", timeoutMs: 15_000 });
  await evaluate(client, () => document.querySelector("[data-gantt-react-toggle-quantity]")?.click());
  await waitForCondition(client, () => document.querySelector("[data-gantt-react-toggle-quantity]")?.getAttribute("aria-pressed") === "true" && Boolean(document.querySelector("[data-gantt-react-slot-quantity]")), { message: "React Gantt did not restore quantity visibility before command QA", timeoutMs: 15_000 });

  await evaluate(client, () => document.querySelector('[data-gantt-react-scale="hours"]')?.click());
  await waitForCondition(client, () => document.querySelector('[data-gantt-react-scale="hours"]')?.getAttribute("aria-pressed") === "true", { message: "React Gantt did not restore hourly scale before command QA", timeoutMs: 15_000 });
  await evaluate(client, () => document.querySelector('[data-gantt-react-zoom="reset"]')?.click());
  await waitForCondition(client, () => document.querySelector('[data-gantt-react-zoom="reset"]')?.textContent?.trim() === "100%", { message: "React Gantt did not reset zoom before command QA", timeoutMs: 15_000 });
  await evaluate(client, (value) => { const input = document.querySelector("[data-gantt-react-period] input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); }, now.toISOString().slice(0, 10));
  await waitForCondition(client, (value) => document.querySelector("[data-gantt-react-period] input")?.value === value, { arg: now.toISOString().slice(0, 10), message: "React Gantt did not restore period before command QA", timeoutMs: 15_000 });
  await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.includes("Зависимости (1)"))?.click()); await waitForCondition(client, () => Boolean(document.querySelector("[data-gantt-dependency-detail]")), { message: "Gantt dependency inspector did not open" });
  await evaluate(client, () => { const select = document.querySelector("[data-gantt-dependency-list]"); if (select) select.dispatchEvent(new Event("change", { bubbles: true })); }); await waitForCondition(client, () => document.querySelector('[data-ui-component="GanttSlot"][aria-pressed="true"]')?.getAttribute("data-slot-id") === "qa-react-gantt-slot-2", { message: "Gantt dependency did not select its target slot" });
  const dependency = await evaluate(client, () => { const detail = document.querySelector("[data-gantt-dependency-detail]"); return { title: document.querySelector(".gantt-react-detail h2")?.textContent?.trim(), text: detail?.textContent?.replace(/\s+/g, " ").trim(), count: document.querySelectorAll("[data-gantt-dependency-list] option").length, selectedSlot: document.querySelector('[data-ui-component="GanttSlot"][aria-pressed="true"]')?.getAttribute("data-slot-id") }; });
  assert(dependency.count === 1 && dependency.title?.includes("Монтаж") && dependency.title?.includes("Контроль") && dependency.text?.includes("Разрыв 60 мин") && dependency.selectedSlot === "qa-react-gantt-slot-2", `Gantt dependency inspection failed: ${JSON.stringify(dependency)}`);
  await evaluate(client, () => [...document.querySelectorAll('.gantt-react-detail [data-ui-component="ActionButton"]')].find((button) => button.textContent?.includes("Вернуться к слоту"))?.click()); await waitForCondition(client, () => document.querySelector(".gantt-react-detail h2")?.textContent?.includes("Контроль"), { message: "Gantt dependency inspector did not return to target slot" });
  const blockedActions = await evaluate(client, () => [...document.querySelectorAll("[data-gantt-react-blocked-action]")].map((entry) => entry.getAttribute("data-gantt-react-blocked-action")));
  assert(JSON.stringify(blockedActions.sort()) === JSON.stringify(["drag", "edit-dependency", "optimize", "refresh", "resize"]), `ownerless commands must stay explicitly blocked: ${JSON.stringify(blockedActions)}`);
  assert(await evaluate(client, () => Boolean(document.querySelector("[data-gantt-react-schedule-blocked]")) && !document.querySelector("[data-gantt-shell]") && !document.querySelector("[data-gantt-react-schedule-form]")), "unsigned schedule editing must fail closed inside React");
  assert(projectionReads >= 1, "Gantt must read the PostgreSQL projection");
  assert(planningWrites === 0 && schedulePatchAttempts === 0 && successfulScheduleWrites === 0, "unsigned Gantt must not call the Planning write owner");

  mountFailureChrome = await launchChrome("mes-gantt-react-mount-failure-qa-");
  const failureClient = mountFailureChrome.client; let bundleFailureCount = 0; const expectedMountErrors = [];
  failureClient.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") expectedMountErrors.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    if (message.method !== "Fetch.requestPaused") return;
    const requestUrl = new URL(message.params.request.url);
    if (requestUrl.pathname.endsWith("/react-islands/gantt.js")) { bundleFailureCount += 1; void failureClient.send("Fetch.failRequest", { requestId: message.params.requestId, errorReason: "Failed" }); return; }
    if (requestUrl.pathname === "/api/v1/planning/work-orders/projection") { void failureClient.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }], body: Buffer.from(JSON.stringify({ ok: true, projection })).toString("base64") }); return; }
    void failureClient.send("Fetch.continueRequest", { requestId: message.params.requestId });
  });
  await failureClient.send("Page.enable"); await failureClient.send("Runtime.enable"); await failureClient.send("Network.enable"); await failureClient.send("Network.setCacheDisabled", { cacheDisabled: true });
  await failureClient.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("mes-planning-prototype-ui-v1", JSON.stringify({ activeModule: "gantt", scale: "days", windowStart: ${JSON.stringify(now.toISOString().slice(0, 10))}, expandedProjects: ["qa-react-gantt-route"], ganttZoom: 1 }));` });
  await failureClient.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/planning/work-orders/projection*", requestStage: "Request" }, { urlPattern: "*react-islands/gantt.js*", requestStage: "Request" }] });
  await failureClient.send("Page.navigate", { url: `${origin}/?module=gantt&qa-auth-bypass=1&qa-mount-failure=1` });
  for (let index = 0; index < 100 && bundleFailureCount === 0; index += 1) await delay(120);
  assert(bundleFailureCount === 1, `Gantt mount-failure QA expected one failed bundle request, got ${bundleFailureCount}`);
  await waitForCondition(failureClient, () => document.querySelector('[data-react-gantt-island][data-react-island-state="error"]')?.textContent?.includes("mount-error") === true && !document.querySelector("[data-gantt-shell]"), { message: "permanent Gantt mount failure did not fail closed in React", timeoutMs: 20_000 });
  assert(expectedMountErrors.some((entry) => entry.includes("Gantt React island failed")), `Gantt mount failure must be reported once: ${JSON.stringify(expectedMountErrors)}`);
  assert(consoleProblems.length === 0, `browser console problems:\n${consoleProblems.join("\n")}`);
  console.log("Gantt React production-shell functional QA: OK");
  console.log(`- ${react.rows} rows, ${react.slots} slots, React projection geometry; first commit ${react.commitMs.toFixed(2)} ms`);
  console.log("- period/scale/zoom, expand/quantity/today persistence, dependency inspection, ownerless command blocking and fail-closed mount: pass");
} catch (error) {
  if (previewOutput.trim()) console.error(previewOutput.trim());
  throw error;
} finally { if (mountFailureChrome) await cleanupChrome(mountFailureChrome); if (chrome) await cleanupChrome(chrome); await stop(preview); }
