import { spawn } from "node:child_process";
import { PRODUCTION_STRUCTURE_MATRIX_ROWS } from "../src/production_structure_matrix_data.js";
import { migrateLegacySystemDomains } from "../src/modules/system_domains/service.js";
import { cleanupChrome, delay, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const baseline = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS }).domains;
const employeeId = baseline.registries.employees[0]?.id || "qa-employee";
const adminProfile = { id: "admin", label: "Администратор", scope: "factory", defaultModule: "gantt", modulePermissions: { gantt: { view: true, edit: true, print: true, assign: true, approve: true, configure: true } } };
const domains = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS, legacyUi: { accessRoleProfiles: [adminProfile], accessRoleAssignments: { [employeeId]: "admin" } }, defaultAccessRoleProfiles: [adminProfile] }).domains;
async function waitPreview(origin) { for (let index = 0; index < 100; index += 1) { try { const response = await fetch(`${origin}/?module=authPrototype&qa=auth-functional`); if (response.ok && (await response.text()).includes('id="app"')) return; } catch {} await delay(120); } throw new Error(`Authorization preview did not start at ${origin}`); }
async function stop(child) { if (child.exitCode === null && !child.killed) child.kill("SIGTERM"); await new Promise((resolve) => { if (child.exitCode !== null) return resolve(); const timer = setTimeout(resolve, 1200); child.once("exit", () => { clearTimeout(timer); resolve(); }); }); }

const port = await getFreePort(); const origin = `http://127.0.0.1:${port}`;
const preview = spawn(process.execPath, ["scripts/preview-dist.mjs"], { cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru" }, stdio: ["ignore", "pipe", "pipe"] });
let previewOutput = ""; preview.stdout.on("data", (chunk) => { previewOutput += chunk; }); preview.stderr.on("data", (chunk) => { previewOutput += chunk; });
let chrome = null; const consoleProblems = []; let reads = 0; let writes = 0;
try {
  await waitPreview(origin); chrome = await launchChrome("mes-auth-picker-react-qa-"); const { client } = chrome;
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    if (message.method !== "Fetch.requestPaused") return;
    const url = new URL(message.params.request.url); const method = message.params.request.method;
    if (url.pathname === "/api/v1/system-domains/capabilities") {
      void client.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ ok: true, capabilities: { serverCommandsEnabled: true, serverCommandSurfaces: ["production-structure", "timesheet", "access-control"], consistency: { details: { authority: { mode: "postgres-primary" } } } } })).toString("base64") }); return;
    }
    if (url.pathname === "/api/v1/system-domains" && method === "GET") {
      reads += 1; void client.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "ETag", value: '"auth-picker-r11"' }], body: Buffer.from(JSON.stringify({ ok: true, revision: 11, item: domains })).toString("base64") }); return;
    }
    if (url.pathname.startsWith("/api/v1/system-domains") && method !== "GET") writes += 1;
    void client.send("Fetch.continueRequest", { requestId: message.params.requestId });
  });
  await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Page.addScriptToEvaluateOnNewDocument", { source: 'sessionStorage.setItem("mes-planning-prototype-system-domains-primary-tombstone-v1", "1");' }); await client.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/system-domains*", requestStage: "Request" }] }); await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: `${origin}/?module=authPrototype&qa=auth-functional` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-auth-step="department"]')), { message: "legacy Authorization picker must remain default", timeoutMs: 20_000 });
  assert(!await evaluate(client, () => Boolean(document.querySelector("[data-react-auth-picker-island]"))), "Authorization React picker activated without flags");
  await client.send("Page.navigate", { url: `${origin}/?module=authPrototype&qa=auth-functional&react-auth-picker=1&react-auth-picker-readonly=1` });
  try {
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-auth-picker-island][data-react-island-state="ready"]')) && document.querySelectorAll(".auth-picker-react-grid > button").length > 0, { message: "Authorization React picker not ready", timeoutMs: 20_000 });
  } catch (error) {
    const diagnostic = await evaluate(client, () => ({ href: location.href, page: document.querySelector("main.app-shell")?.dataset.layoutPage, react: document.querySelector("[data-react-auth-picker-island]")?.getAttribute("data-react-island-state"), legacyStep: document.querySelector("[data-auth-step]")?.getAttribute("data-auth-step"), activation: window.__MES_AUTH_PICKER_ACTIVATION__, text: document.body.innerText.replace(/\s+/g, " ").slice(0, 500) }));
    throw new Error(`${error.message}: ${JSON.stringify(diagnostic)} reads=${reads} writes=${writes} console=${JSON.stringify(consoleProblems)}`);
  }
  const initial = await evaluate(client, () => ({ departments: document.querySelectorAll(".auth-picker-react-grid > button").length, metrics: document.querySelectorAll('[data-ui-component="MetricCard"]').length, hasPinPad: Boolean(document.querySelector("[data-auth-pin-digit]")), text: document.body.innerText.includes("PIN остаётся в защищённом legacy-контуре"), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
  assert(initial.departments > 0 && initial.metrics === 3 && !initial.hasPinPad && initial.text && !initial.overflow, `Authorization picker boundary failed: ${JSON.stringify(initial)}`);
  await evaluate(client, () => document.querySelector(".auth-picker-react-grid > button")?.click());
  await waitForCondition(client, () => document.querySelectorAll(".auth-picker-react-grid > button, [data-auth-picker-person]").length > 0, { message: "department selection did not advance", timeoutMs: 5_000 });
  if (await evaluate(client, () => !document.querySelector("[data-auth-picker-person]"))) await evaluate(client, () => document.querySelector(".auth-picker-react-grid > button")?.click());
  await waitForCondition(client, () => Boolean(document.querySelector("[data-auth-picker-person]")), { message: "employee selection step missing", timeoutMs: 5_000 });
  await evaluate(client, () => document.querySelector("[data-auth-picker-person]")?.click());
  try {
    await waitForCondition(client, () => Boolean(document.querySelector('[data-auth-step="pin"]')) && !document.querySelector("[data-react-auth-picker-island]"), { message: "employee selection did not hand off to legacy PIN", timeoutMs: 10_000 });
  } catch (error) {
    const diagnostic = await evaluate(client, () => ({ react: Boolean(document.querySelector("[data-react-auth-picker-island]")), step: document.querySelector("[data-auth-step]")?.getAttribute("data-auth-step"), text: document.body.innerText.replace(/\s+/g, " ").slice(0, 400), ui: JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}") }));
    throw new Error(`${error.message}: ${JSON.stringify({ ...diagnostic, ui: { department: diagnostic.ui.authPrototypeDepartment, unit: diagnostic.ui.authPrototypeUnit, person: diagnostic.ui.authPrototypePersonId, result: diagnostic.ui.authPrototypeResult } })}`);
  }
  const handoff = await evaluate(client, () => ({ page: document.querySelector("main.app-shell")?.dataset.layoutPage, pinDigits: document.querySelectorAll("[data-auth-pin-digit]").length, filled: document.querySelectorAll(".auth-prototype-pin-display .is-filled").length, attemptsText: document.querySelector(".auth-prototype-pin-note")?.textContent || "" }));
  assert(handoff.page === "authPrototype" && handoff.pinDigits === 10 && handoff.filled === 0 && /Осталось попыток/.test(handoff.attemptsText), `legacy PIN handoff failed: ${JSON.stringify(handoff)}`);
  assert(reads >= 1 && writes === 0, `Authorization picker must be read-only: reads=${reads}, writes=${writes}`);
  assert(consoleProblems.length === 0, `browser console problems:\n${consoleProblems.join("\n")}`);
  console.log("Authorization picker React production-shell functional QA: OK");
  console.log(`- ${initial.departments} departments; React has no PIN keypad; employee handoff opens clean legacy PIN`);
  console.log("- PostgreSQL System Domains gate, zero writes and clean console: pass");
} catch (error) { if (previewOutput.trim()) console.error(previewOutput.trim()); throw error; } finally { if (chrome) await cleanupChrome(chrome); await stop(preview); }
