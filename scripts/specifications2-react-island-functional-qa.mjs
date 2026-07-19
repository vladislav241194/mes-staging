import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSpecifications2ReleaseFingerprint } from "../src/modules/specifications2/publication.js";
import { cleanupChrome, delay, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const STORAGE_KEY = "mes-specifications-2-registry-v1";
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const entry = {
  id: "spec-kt7",
  title: "АБВГ.469659.001 Контроллер КТ-7",
  fileName: "Контроллер КТ-7.xlsx",
  importedAt: "2026-07-19T08:00:00.000Z",
  updatedAt: "2026-07-19T08:00:00.000Z",
  stats: { rows: 4 },
  errors: [],
  treeRows: [
    { id: "root", selectionKey: "root", nodeKey: "root", level: 0, label: "Контроллер КТ-7", designation: "АБВГ.469659.001", type: "Изделие", quantity: 1, unitOfMeasure: "шт." },
    { id: "board", selectionKey: "board", nodeKey: "board", parentKey: "root", level: 1, label: "Плата управления", designation: "АБВГ.468332.002", type: "Сборочная единица", quantity: 1, unitOfMeasure: "шт." },
    { id: "resistor", selectionKey: "resistor", nodeKey: "resistor", parentKey: "board", level: 2, label: "Резистор 10 кОм", designation: "RC0603-10K", type: "Покупное", quantity: 8, unitOfMeasure: "шт." },
    { id: "housing", selectionKey: "housing", nodeKey: "housing", parentKey: "root", level: 1, label: "Корпус", designation: "АБВГ.745211.010", type: "Деталь", quantity: 1, unitOfMeasure: "шт." },
  ],
  routeDrafts: [],
};
entry.publication = { revision: 7, fingerprint: buildSpecifications2ReleaseFingerprint(entry), releasedAt: "2026-07-19T08:30:00.000Z", status: "released" };
const serverItem = {
  id: "revision-kt7-7", sourceEntryId: entry.id, specificationId: "document-kt7", title: "Контроллер КТ-7", designation: "АБВГ.469659.001", revisionNo: 7, fingerprint: entry.publication.fingerprint, releasedAt: entry.publication.releasedAt, sourceUpdatedAt: entry.updatedAt,
  treeItems: [
    { sourceRowId: "root", parentSourceRowId: "", designation: "АБВГ.469659.001", name: "Контроллер КТ-7", kind: "Изделие", quantity: 1, unit: "шт." },
    { sourceRowId: "board", parentSourceRowId: "root", designation: "АБВГ.468332.002", name: "Плата управления", kind: "Сборочная единица", quantity: 1, unit: "шт." },
    { sourceRowId: "resistor", parentSourceRowId: "board", designation: "RC0603-10K", name: "Резистор 10 кОм", kind: "Покупное", quantity: 8, unit: "шт." },
    { sourceRowId: "housing", parentSourceRowId: "root", designation: "АБВГ.745211.010", name: "Корпус", kind: "Деталь", quantity: 1, unit: "шт." },
  ],
  routes: [{ sourceDraftId: "route-root", designation: "АБВГ.469659.001", productLabel: "Контроллер КТ-7", status: "released", operations: [{ sourceOperationId: "op-1" }, { sourceOperationId: "op-2" }] }],
};

async function waitPreview(origin) {
  for (let index = 0; index < 100; index += 1) {
    try { const response = await fetch(`${origin}/?module=specifications2&qa-auth-bypass=1`); if (response.ok && (await response.text()).includes('id="app"')) return; } catch {}
    await delay(120);
  }
  throw new Error(`Specifications 2.0 preview did not start at ${origin}`);
}
async function stop(child) {
  if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  await new Promise((resolve) => { if (child.exitCode !== null) return resolve(); const timer = setTimeout(resolve, 1200); child.once("exit", () => { clearTimeout(timer); resolve(); }); });
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-specifications2-react-"));
const sharedStateFile = join(temporaryRoot, "shared-state.json");
const snapshot = { version: 1, updatedAt: "2026-07-19T08:30:00.000Z", updatedBy: { actor: "specifications2-react-qa" }, values: { [STORAGE_KEY]: JSON.stringify({ selectedId: entry.id, registry: [entry] }) }, sharedUi: {}, events: [] };
await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary state permissions changed");
const original = await readFile(sharedStateFile, "utf8");
const port = await getFreePort(); const origin = `http://127.0.0.1:${port}`;
const preview = spawn(process.execPath, ["scripts/preview-dist.mjs"], { cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru", MES_SHARED_STATE_FILE: sharedStateFile, MES_REACT_SPECIFICATIONS2: "1", MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION: "1" }, stdio: ["ignore", "pipe", "pipe"] });
let previewOutput = ""; preview.stdout.on("data", (chunk) => { previewOutput += chunk; }); preview.stderr.on("data", (chunk) => { previewOutput += chunk; });
let chrome = null; const consoleProblems = []; let revisionReads = 0; let specificationWrites = 0;
try {
  await waitPreview(origin); chrome = await launchChrome("mes-specifications2-react-island-qa-"); const { client } = chrome;
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    if (message.method !== "Fetch.requestPaused") return;
    const requestUrl = new URL(message.params.request.url); const method = message.params.request.method;
    if (requestUrl.pathname === `/api/v1/specifications2/revisions/by-source/${entry.id}`) {
      revisionReads += 1;
      void client.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }, { name: "ETag", value: '"spec-kt7-r7"' }], body: Buffer.from(JSON.stringify({ ok: true, item: serverItem })).toString("base64") }).catch((error) => consoleProblems.push(error.message));
      return;
    }
    if (requestUrl.pathname.startsWith("/api/v1/specifications2") && method !== "GET") specificationWrites += 1;
    void client.send("Fetch.continueRequest", { requestId: message.params.requestId }).catch((error) => consoleProblems.push(error.message));
  });
  await client.send("Page.enable"); await client.send("Runtime.enable");
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify({ selectedId: entry.id, registry: [entry] }))}); localStorage.setItem("mes-specifications-2-tab-v1", "tree");` });
  await client.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/specifications2*", requestStage: "Request" }] });
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: `${origin}/?module=specifications2&qa-auth-bypass=1` });
  await waitForCondition(client, () => Boolean(document.querySelector(".specifications2-page")), { message: "Specifications 2.0 legacy page missing", timeoutMs: 20_000 });
  try {
    await waitForCondition(client, () => document.querySelectorAll(".specifications2-table tbody tr[data-specifications2-tree-row]").length === 4, { message: "Specifications 2.0 legacy rows missing", timeoutMs: 20_000 });
  } catch (error) {
    const diagnostic = await evaluate(client, () => ({ rows: document.querySelectorAll(".specifications2-table tbody tr").length, empty: document.querySelector(".specifications2-empty-tree-import")?.textContent?.replace(/\s+/g, " ").trim(), state: localStorage.getItem("mes-specifications-2-registry-v1") }));
    throw new Error(`${error.message}: ${JSON.stringify(diagnostic)}`);
  }
  assert(await evaluate(client, () => !document.querySelector("[data-react-specifications2-island]")), "server permission without evaluation request must retain legacy Specifications 2.0");
  await client.send("Page.navigate", { url: `${origin}/?module=specifications2&qa-auth-bypass=1&react-specifications2-evaluation=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-specifications2-island][data-react-island-state="ready"]')) && document.querySelectorAll("[data-specifications2-tree-row]").length === 4, { message: "Specifications 2.0 React island not ready", timeoutMs: 20_000 });
  const react = await evaluate(client, () => { const target = document.querySelector("[data-react-specifications2-island]"); return { revisionId: document.querySelector("[data-specifications2-revision]")?.getAttribute("data-specifications2-revision"), rows: document.querySelectorAll("[data-specifications2-tree-row]").length, metrics: document.querySelectorAll('[data-ui-component="MetricCard"]').length, source: [...document.querySelectorAll(".specifications2-react-detail dd")].map((item) => item.textContent.trim()), commitMs: Number(target?.getAttribute("data-react-island-commit-ms")), revision: target?.getAttribute("data-react-island-revision"), grid: getComputedStyle(document.querySelector(".module-layout")).display, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }; });
  assert(react.revisionId === serverItem.id && react.rows === 4 && react.metrics === 4 && react.source.includes("PostgreSQL"), `Specifications 2.0 PostgreSQL parity failed: ${JSON.stringify(react)}`);
  assert(react.revision === "1" && react.commitMs < 2000 && react.grid === "grid" && !react.overflow, `Specifications 2.0 production style/telemetry failed: ${JSON.stringify(react)}`);
  await evaluate(client, () => document.querySelector(".specifications2-react-publication .action")?.click());
  await waitForCondition(client, () => !document.querySelector("[data-react-specifications2-island]") && document.querySelectorAll(".specifications2-table tbody tr[data-specifications2-tree-row]").length === 4, { message: "Specifications 2.0 edit action did not return to legacy", timeoutMs: 15_000 });
  assert(revisionReads >= 2, "legacy and React paths must read the PostgreSQL revision projection");
  assert(specificationWrites === 0, "read-only Specifications 2.0 evaluation must never call publication, attachment or work-order writes");
  assert(await readFile(sharedStateFile, "utf8") === original, "Specifications 2.0 read-only QA changed shared state");
  assert(consoleProblems.length === 0, `browser console problems:\n${consoleProblems.join("\n")}`);
  console.log("Specifications 2.0 React production-shell functional QA: OK");
  console.log(`- PostgreSQL revision ${serverItem.revisionNo}, ${react.rows} tree rows, ${react.metrics} metrics; first commit ${react.commitMs.toFixed(2)} ms`);
  console.log("- default legacy, fingerprint parity, write fallback, zero API writes, unchanged state and clean console: pass");
} catch (error) {
  if (previewOutput.trim()) console.error(previewOutput.trim());
  throw error;
} finally {
  if (chrome) await cleanupChrome(chrome); await stop(preview); await rm(temporaryRoot, { recursive: true, force: true });
}
