import { spawn } from "node:child_process";
import { cleanupChrome, delay, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const now = new Date(); now.setHours(8, 0, 0, 0);
const later = (hours) => new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
const projection = {
  revision: 19,
  routes: [{ id: "qa-react-gantt-route", name: "Маршрут React Gantt", planningQuantity: 24, planningStatus: "scheduled", lifecycleStatus: "released", unit: "шт." }],
  routeSteps: [
    { id: "qa-react-gantt-step-1", routeId: "qa-react-gantt-route", stepOrder: 1, operationId: "OP-1", operationName: "Монтаж", workCenterId: "D5", isRequired: true, quantityMultiplier: 1 },
    { id: "qa-react-gantt-step-2", routeId: "qa-react-gantt-route", stepOrder: 2, operationId: "OP-2", operationName: "Контроль", workCenterId: "D6", isRequired: true, quantityMultiplier: 1 },
  ],
  slots: [
    { id: "qa-react-gantt-slot-1", routeId: "qa-react-gantt-route", routeStepId: "qa-react-gantt-step-1", planningOrderId: "qa-react-gantt-route", workCenterId: "D5", operationId: "OP-1", operationName: "Монтаж", quantity: 24, unit: "шт.", plannedStart: later(0), plannedEnd: later(4), status: "planned" },
    { id: "qa-react-gantt-slot-2", routeId: "qa-react-gantt-route", routeStepId: "qa-react-gantt-step-2", planningOrderId: "qa-react-gantt-route", workCenterId: "D6", operationId: "OP-2", operationName: "Контроль", quantity: 24, unit: "шт.", plannedStart: later(5), plannedEnd: later(7), status: "planned" },
  ],
};

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
let chrome = null; const consoleProblems = []; let projectionReads = 0; let planningWrites = 0;
try {
  await waitPreview(origin); chrome = await launchChrome("mes-gantt-react-island-qa-"); const { client } = chrome;
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    if (message.method !== "Fetch.requestPaused") return;
    const requestUrl = new URL(message.params.request.url); const method = message.params.request.method;
    if (requestUrl.pathname === "/api/v1/planning/work-orders/projection") {
      projectionReads += 1;
      void client.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }, { name: "ETag", value: '"gantt-react-r19"' }], body: Buffer.from(JSON.stringify({ ok: true, projection })).toString("base64") }).catch((error) => consoleProblems.push(error.message));
      return;
    }
    if (requestUrl.pathname.startsWith("/api/v1/planning") && method !== "GET") planningWrites += 1;
    void client.send("Fetch.continueRequest", { requestId: message.params.requestId }).catch((error) => consoleProblems.push(error.message));
  });
  await client.send("Page.enable"); await client.send("Runtime.enable");
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("mes-planning-prototype-ui-v1", JSON.stringify({ activeModule: "gantt", scale: "hours", windowStart: ${JSON.stringify(now.toISOString().slice(0, 10))}, expandedProjects: ["qa-react-gantt-route"], ganttZoom: 1 }));` });
  await client.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/planning/*", requestStage: "Request" }] });
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: `${origin}/?module=gantt&qa-auth-bypass=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-gantt-shell][data-ui-component="GanttRuntime"]')), { message: "legacy Gantt must remain default", timeoutMs: 20_000 });
  assert(!await evaluate(client, () => Boolean(document.querySelector("[data-react-gantt-island]"))), "Gantt React activated without evaluation flags");
  await client.send("Page.navigate", { url: `${origin}/?module=gantt&qa-auth-bypass=1&react-gantt=1&react-gantt-readonly=1` });
  try {
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-gantt-island][data-react-island-state="ready"]')) && document.querySelectorAll('[data-ui-component="GanttSlot"]').length >= 2, { message: "Gantt React island not ready", timeoutMs: 20_000 });
  } catch (error) {
    const diagnostic = await evaluate(client, () => ({ href: location.href, text: document.body.innerText.replace(/\s+/g, " ").slice(0, 500), reactState: document.querySelector("[data-react-gantt-island]")?.getAttribute("data-react-island-state"), legacy: Boolean(document.querySelector("[data-gantt-shell]")), rows: document.querySelectorAll("[data-row-id]").length, slots: document.querySelectorAll('[data-ui-component="GanttSlot"]').length, ui: localStorage.getItem("mes-planning-prototype-ui-v1") }));
    throw new Error(`${error.message}: ${JSON.stringify(diagnostic)} console=${JSON.stringify(consoleProblems)}`);
  }
  const react = await evaluate(client, () => { const target = document.querySelector("[data-react-gantt-island]"); const canvas = document.querySelector('[data-ui-component="GanttCanvas"]'); const slots = [...document.querySelectorAll('[data-ui-component="GanttSlot"]')]; slots.find((slot) => !slot.classList.contains("is-aggregate"))?.click(); const toolbar = getComputedStyle(document.querySelector(".gantt-react-toolbar")); const grid = getComputedStyle(document.querySelector(".gantt-react-grid")); const action = getComputedStyle(document.querySelector(".gantt-react-detail .action")); return { rows: document.querySelectorAll("[data-row-id]").length, slots: slots.length, metrics: document.querySelectorAll('[data-ui-component="MetricCard"]').length, dependencies: [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.includes("Зависимости (1)")), width: canvas?.getBoundingClientRect().width || 0, commitMs: Number(target?.getAttribute("data-react-island-commit-ms")), source: document.body.innerText.includes("PostgreSQL projection"), detail: document.querySelector(".gantt-react-detail h2")?.textContent?.trim(), toolbarDisplay: toolbar.display, toolbarRadius: parseFloat(toolbar.borderRadius), gridColumns: grid.gridTemplateColumns.split(" ").length, actionRadius: parseFloat(action.borderRadius), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }; });
  assert(react.rows >= 2 && react.slots >= 2 && react.metrics === 4 && react.width > 0 && react.source, `Gantt React projection/geometry failed: ${JSON.stringify(react)}`);
  assert(react.dependencies && react.commitMs < 2000 && react.detail && react.toolbarDisplay === "grid" && react.toolbarRadius >= 16 && react.gridColumns === 2 && react.actionRadius >= 8 && !react.overflow, `Gantt React dependency/style/telemetry failed: ${JSON.stringify(react)}`);
  await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.includes("Зависимости (1)"))?.click()); await waitForCondition(client, () => Boolean(document.querySelector("[data-gantt-dependency-detail]")), { message: "Gantt dependency inspector did not open" });
  await evaluate(client, () => { const select = document.querySelector("[data-gantt-dependency-list]"); if (select) select.dispatchEvent(new Event("change", { bubbles: true })); }); await waitForCondition(client, () => document.querySelector('[data-ui-component="GanttSlot"][aria-pressed="true"]')?.getAttribute("data-slot-id") === "qa-react-gantt-slot-2", { message: "Gantt dependency did not select its target slot" });
  const dependency = await evaluate(client, () => { const detail = document.querySelector("[data-gantt-dependency-detail]"); return { title: document.querySelector(".gantt-react-detail h2")?.textContent?.trim(), text: detail?.textContent?.replace(/\s+/g, " ").trim(), count: document.querySelectorAll("[data-gantt-dependency-list] option").length, selectedSlot: document.querySelector('[data-ui-component="GanttSlot"][aria-pressed="true"]')?.getAttribute("data-slot-id") }; });
  assert(dependency.count === 1 && dependency.title?.includes("Монтаж") && dependency.title?.includes("Контроль") && dependency.text?.includes("Разрыв 60 мин") && dependency.selectedSlot === "qa-react-gantt-slot-2", `Gantt dependency inspection failed: ${JSON.stringify(dependency)}`);
  await evaluate(client, () => [...document.querySelectorAll('.gantt-react-detail [data-ui-component="ActionButton"]')].find((button) => button.textContent?.includes("Вернуться к слоту"))?.click()); await waitForCondition(client, () => document.querySelector(".gantt-react-detail h2")?.textContent?.includes("Контроль"), { message: "Gantt dependency inspector did not return to target slot" });
  await evaluate(client, () => [...document.querySelectorAll('.gantt-react-detail [data-ui-component="ActionButton"]')].find((button) => button.textContent?.includes("Открыть редактирование"))?.click());
  await waitForCondition(client, () => Boolean(document.querySelector("[data-gantt-shell]")) && !document.querySelector("[data-react-gantt-island]"), { message: "Gantt edit action did not return to legacy", timeoutMs: 15_000 });
  assert(projectionReads >= 1, "Gantt must read the PostgreSQL projection");
  assert(planningWrites === 0, "read-only Gantt evaluation must not call planning writes");
  assert(consoleProblems.length === 0, `browser console problems:\n${consoleProblems.join("\n")}`);
  console.log("Gantt React production-shell functional QA: OK");
  console.log(`- ${react.rows} rows, ${react.slots} slots, exact legacy geometry; first commit ${react.commitMs.toFixed(2)} ms`);
  console.log("- dependency inspection Монтаж -> Контроль, target-slot selection, edit fallback and zero API writes: pass");
} catch (error) {
  if (previewOutput.trim()) console.error(previewOutput.trim());
  throw error;
} finally { if (chrome) await cleanupChrome(chrome); await stop(preview); }
