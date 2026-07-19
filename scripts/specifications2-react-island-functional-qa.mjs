import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
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
  routeDrafts: [{
    id: "route-root", productKey: "root", productLabel: "Контроллер КТ-7", designation: "АБВГ.469659.001", status: "ready",
    operations: [{ id: "op-root", operationId: "OP-ASSEMBLY", name: "Сборка", workCenterId: "D3", nextWorkCenterId: "D4", changesProperty: true, inputState: "Комплект", outputState: "Собрано", laborNorm: { calculationMode: "rate", unitsPerHour: 40, activeRevisionId: "norm-root" } }],
  }, {
    id: "route-board", productKey: "board", productLabel: "Плата управления", designation: "АБВГ.468332.002", status: "ready",
    operations: [{ id: "op-board", operationId: "OP-SMT", name: "SMT-монтаж", workCenterId: "D3", nextWorkCenterId: "D4", changesProperty: true, inputState: "Плата", outputState: "Смонтировано", laborNorm: { calculationMode: "fixed", fixedMinutes: 30, activeRevisionId: "norm-board" } }],
  }, {
    id: "route-resistor", productKey: "resistor", productLabel: "Резистор 10 кОм", designation: "RC0603-10K", status: "ready",
    operations: [{ id: "op-resistor", operationId: "OP-INCOMING", name: "Входной контроль", workCenterId: "D4", changesProperty: false, laborNorm: { calculationMode: "fixed", fixedMinutes: 5, activeRevisionId: "norm-resistor" } }],
  }, {
    id: "route-housing", productKey: "housing", productLabel: "Корпус", designation: "АБВГ.745211.010", status: "ready",
    operations: [{ id: "op-housing", operationId: "OP-MECHANICAL", name: "Механическая подготовка", workCenterId: "D5", nextWorkCenterId: "D3", changesProperty: true, inputState: "Заготовка", outputState: "Готово", laborNorm: { calculationMode: "fixed", fixedMinutes: 20, activeRevisionId: "norm-housing" } }],
  }],
};
entry.publication = { revision: 7, fingerprint: buildSpecifications2ReleaseFingerprint(entry), releasedAt: "2026-07-19T08:30:00.000Z", status: "released" };
let serverItem = {
  id: "revision-kt7-7", sourceEntryId: entry.id, specificationId: "document-kt7", title: "Контроллер КТ-7", designation: "АБВГ.469659.001", revisionNo: 7, fingerprint: `sha256:${createHash("sha256").update(entry.publication.fingerprint).digest("hex")}`, releasedAt: entry.publication.releasedAt, sourceUpdatedAt: entry.updatedAt,
  treeItems: [
    { sourceRowId: "root", parentSourceRowId: "", designation: "АБВГ.469659.001", name: "Контроллер КТ-7", kind: "Изделие", quantity: 1, unit: "шт." },
    { sourceRowId: "board", parentSourceRowId: "root", designation: "АБВГ.468332.002", name: "Плата управления", kind: "Сборочная единица", quantity: 1, unit: "шт." },
    { sourceRowId: "resistor", parentSourceRowId: "board", designation: "RC0603-10K", name: "Резистор 10 кОм", kind: "Покупное", quantity: 8, unit: "шт." },
    { sourceRowId: "housing", parentSourceRowId: "root", designation: "АБВГ.745211.010", name: "Корпус", kind: "Деталь", quantity: 1, unit: "шт." },
  ],
  routes: [{ sourceDraftId: "route-root", designation: "АБВГ.469659.001", productLabel: "Контроллер КТ-7", status: "released", operations: [{ sourceOperationId: "op-root" }] }, { sourceDraftId: "route-board", designation: "АБВГ.468332.002", productLabel: "Плата управления", status: "released", operations: [{ sourceOperationId: "op-board" }] }, { sourceDraftId: "route-resistor", designation: "RC0603-10K", productLabel: "Резистор 10 кОм", status: "released", operations: [{ sourceOperationId: "op-resistor" }] }, { sourceDraftId: "route-housing", designation: "АБВГ.745211.010", productLabel: "Корпус", status: "released", operations: [{ sourceOperationId: "op-housing" }] }],
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
const preview = spawn(process.execPath, ["scripts/preview-dist.mjs"], { cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru", MES_SHARED_STATE_FILE: sharedStateFile, MES_REACT_SPECIFICATIONS2: "1", MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION: "1", MES_SPECIFICATIONS2_SERVER_PUBLICATION_PRIMARY: "1" }, stdio: ["ignore", "pipe", "pipe"] });
let previewOutput = ""; preview.stdout.on("data", (chunk) => { previewOutput += chunk; }); preview.stderr.on("data", (chunk) => { previewOutput += chunk; });
let chrome = null; const consoleProblems = []; let revisionReads = 0; let specificationWrites = 0; let sharedStateWrites = 0; let publishAttempts = 0; let forcePublishConflictOnce = false; const publishRequests = [];
try {
  await waitPreview(origin); chrome = await launchChrome("mes-specifications2-react-island-qa-"); const { client } = chrome;
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    if (message.method !== "Fetch.requestPaused") return;
    const requestUrl = new URL(message.params.request.url); const method = message.params.request.method;
    if (requestUrl.pathname === "/api/shared-state" && method !== "GET") {
      sharedStateWrites += 1;
      void client.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }], body: Buffer.from(JSON.stringify({ ok: true, version: 2 })).toString("base64") }).catch((error) => consoleProblems.push(error.message));
      return;
    }
    if (requestUrl.pathname === `/api/v1/specifications2/revisions/by-source/${entry.id}`) {
      revisionReads += 1;
      void client.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }, { name: "ETag", value: `"spec-kt7-r${serverItem.revisionNo}"` }], body: Buffer.from(JSON.stringify({ ok: true, item: serverItem })).toString("base64") }).catch((error) => consoleProblems.push(error.message));
      return;
    }
    if (requestUrl.pathname === "/api/v1/specifications2/capabilities" && method === "GET") {
      void client.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }], body: Buffer.from(JSON.stringify({ ok: true, capabilities: { revisionPublicationEnabled: true, revisionPublicationServerPrimary: true } })).toString("base64") }).catch((error) => consoleProblems.push(error.message));
      return;
    }
    if (requestUrl.pathname === "/api/v1/specifications2/revisions" && method === "POST") {
      specificationWrites += 1;
      publishAttempts += 1;
      const body = JSON.parse(message.params.request.postData || "{}");
      const headers = message.params.request.headers || {};
      const idempotencyKey = Object.entries(headers).find(([key]) => key.toLowerCase() === "idempotency-key")?.[1] || "";
      publishRequests.push({ expectedPreviousRevision: Number(body.expectedPreviousRevision), entryId: String(body.entry?.id || ""), idempotencyKey: String(idempotencyKey) });
      if (forcePublishConflictOnce) {
        forcePublishConflictOnce = false;
        void client.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 409, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }], body: Buffer.from(JSON.stringify({ ok: false, conflict: true, currentRevision: 7, error: "revision conflict" })).toString("base64") }).catch((error) => consoleProblems.push(error.message));
        return;
      }
      const releasedAt = "2026-07-20T10:00:00.000Z";
      const sourceFingerprint = String(body.entry?.publication?.fingerprint || "");
      const boardLabel = body.entry?.editorRows?.find((row) => row.id === "board")?.label || "Плата управления КТ-7";
      serverItem = { ...serverItem, id: "revision-kt7-8", revisionNo: 8, releasedAt, sourceUpdatedAt: body.entry?.updatedAt || releasedAt, fingerprint: `sha256:${createHash("sha256").update(sourceFingerprint).digest("hex")}`, treeItems: serverItem.treeItems.map((row) => row.sourceRowId === "board" ? { ...row, name: boardLabel } : row) };
      void client.send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 201, responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }], body: Buffer.from(JSON.stringify({ ok: true, created: true, item: serverItem, publication: { revision: 8, releasedAt, status: "released" }, snapshotSync: { applied: 1 } })).toString("base64") }).catch((error) => consoleProblems.push(error.message));
      return;
    }
    if (requestUrl.pathname.startsWith("/api/v1/specifications2") && method !== "GET") specificationWrites += 1;
    void client.send("Fetch.continueRequest", { requestId: message.params.requestId }).catch((error) => consoleProblems.push(error.message));
  });
  await client.send("Page.enable"); await client.send("Runtime.enable");
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `if (!localStorage.getItem(${JSON.stringify(STORAGE_KEY)})) localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify({ selectedId: entry.id, registry: [entry] }))}); localStorage.setItem("mes-specifications-2-tab-v1", "tree");` });
  await client.send("Fetch.enable", { patterns: [{ urlPattern: "*api/v1/specifications2*", requestStage: "Request" }, { urlPattern: "*api/shared-state*", requestStage: "Request" }] });
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
  const react = await evaluate(client, () => { const target = document.querySelector("[data-react-specifications2-island]"); const layout = getComputedStyle(document.querySelector(".module-layout")); const panel = getComputedStyle(document.querySelector(".specifications2-react .panel")); const publication = getComputedStyle(document.querySelector(".specifications2-react-publication")); const object = getComputedStyle(document.querySelector(".specifications2-react-object")); const action = getComputedStyle(document.querySelector(".specifications2-react-publication .action")); return { revisionId: document.querySelector("[data-specifications2-revision]")?.getAttribute("data-specifications2-revision"), rows: document.querySelectorAll("[data-specifications2-tree-row]").length, metrics: document.querySelectorAll('[data-ui-component="MetricCard"]').length, source: [...document.querySelectorAll(".specifications2-react-detail dd")].map((item) => item.textContent.trim()), commitMs: Number(target?.getAttribute("data-react-island-commit-ms")), revision: target?.getAttribute("data-react-island-revision"), grid: layout.display, columns: layout.gridTemplateColumns.split(" ").length, panelRadius: parseFloat(panel.borderRadius), publicationRadius: parseFloat(publication.borderRadius), publicationBackground: publication.backgroundColor, objectDisplay: object.display, actionRadius: parseFloat(action.borderRadius), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }; });
  assert(react.revisionId === serverItem.id && react.rows === 4 && react.metrics === 4 && react.source.includes("PostgreSQL"), `Specifications 2.0 PostgreSQL parity failed: ${JSON.stringify(react)}`);
  assert(react.revision === "1" && react.commitMs < 2000 && react.grid === "grid" && react.columns === 2 && react.panelRadius >= 6 && react.publicationRadius >= 10 && !["", "rgba(0, 0, 0, 0)", "transparent"].includes(react.publicationBackground) && react.objectDisplay === "grid" && react.actionRadius >= 8 && !react.overflow, `Specifications 2.0 production style/telemetry failed: ${JSON.stringify(react)}`);
  await client.send("Emulation.setDeviceMetricsOverride", { width: 487, height: 844, deviceScaleFactor: 1, mobile: false });
  const compact = await evaluate(client, () => { const target = document.querySelector("[data-react-specifications2-island]"); const tableWrap = target.querySelector('[data-ui-component="TableWrap"]'); return { layoutColumns: getComputedStyle(target.querySelector(".module-layout")).gridTemplateColumns.split(" ").length, sidebarColumns: getComputedStyle(target.querySelector(".module-sidebar")).gridTemplateColumns.split(" ").length, metricColumns: getComputedStyle(target.querySelector(".metric-grid")).gridTemplateColumns.split(" ").length, pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, tableScroll: tableWrap.scrollWidth > tableWrap.clientWidth }; });
  assert(compact.layoutColumns === 1 && compact.sidebarColumns === 2 && compact.metricColumns === 2 && !compact.pageOverflow, `Specifications 2.0 compact UI contract failed: ${JSON.stringify(compact)}`);
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });
  await evaluate(client, () => document.querySelector(".specifications2-react-publication .action")?.click());
  await waitForCondition(client, () => !document.querySelector("[data-react-specifications2-island]") && document.querySelectorAll(".specifications2-table tbody tr[data-specifications2-tree-row]").length === 4, { message: "Specifications 2.0 edit action did not return to legacy", timeoutMs: 15_000 });
  assert(revisionReads >= 2, "legacy and React paths must read the PostgreSQL revision projection");
  assert(specificationWrites === 0, "read-only Specifications 2.0 evaluation must never call publication, attachment or work-order writes");
  assert(await readFile(sharedStateFile, "utf8") === original, "Specifications 2.0 read-only QA changed shared state");

  await client.send("Page.navigate", { url: `${origin}/?module=specifications2&qa-auth-bypass=1&react-specifications2=1&react-specifications2-write=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-specifications2-island][data-react-island-state="ready"]')), { message: "Specifications 2.0 write-evaluation island not ready", timeoutMs: 20_000 });
  await evaluate(client, () => [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Изменить строку черновика"))?.click());
  await waitForCondition(client, () => Boolean(document.querySelector("[data-specifications2-draft-editor]")), { message: "Specifications 2.0 draft editor did not open", timeoutMs: 10_000 });
  await evaluate(client, () => {
    const select = document.querySelector("[data-specifications2-draft-row]");
    select.value = "board";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitForCondition(client, () => document.querySelector("[data-specifications2-draft-label]")?.value === "Плата управления", { message: "Specifications 2.0 draft row selection did not hydrate", timeoutMs: 10_000 });
  await evaluate(client, () => {
    const input = document.querySelector("[data-specifications2-draft-label]");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "Плата управления КТ-7");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector("[data-specifications2-draft-editor]")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await waitForCondition(client, () => {
    const store = JSON.parse(localStorage.getItem("mes-specifications-2-registry-v1") || "{}");
    return store.registry?.[0]?.editorRows?.find((row) => row.id === "board")?.label === "Плата управления КТ-7";
  }, { message: "Specifications 2.0 owner did not persist the edited draft row", timeoutMs: 10_000 });
  for (let index = 0; index < 80 && sharedStateWrites !== 1; index += 1) await delay(100);
  assert(sharedStateWrites === 1, `draft save must emit one compatibility persistence, received ${sharedStateWrites}`);
  const writeResult = await evaluate(client, () => {
    const store = JSON.parse(localStorage.getItem("mes-specifications-2-registry-v1") || "{}");
    const selected = store.registry?.[0];
    return {
      publicationRevision: selected?.publication?.revision,
      publicationFingerprint: selected?.publication?.fingerprint,
      draftLabel: selected?.editorRows?.find((row) => row.id === "board")?.label,
      publishedLabel: [...document.querySelectorAll("[data-specifications2-tree-row] strong")].map((node) => node.textContent?.trim()).find((label) => label === "АБВГ.468332.002"),
      badge: document.querySelector(".lab-badge")?.textContent?.trim(),
    };
  });
  assert(writeResult.publicationRevision === 7 && writeResult.publicationFingerprint === entry.publication.fingerprint, `published revision metadata changed during draft edit: ${JSON.stringify(writeResult)}`);
  assert(writeResult.draftLabel === "Плата управления КТ-7" && writeResult.publishedLabel === "АБВГ.468332.002", `draft/published separation failed: ${JSON.stringify(writeResult)}`);
  assert(writeResult.badge === "React · draft edit evaluation", `write-evaluation badge missing: ${JSON.stringify(writeResult)}`);
  assert(specificationWrites === 0, "draft editor must not call publication, attachment or work-order APIs");

  await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Опубликовать ревизию 8"), { message: "changed draft did not expose typed publication action", timeoutMs: 10_000 });
  const clickPublicationAction = async (label) => evaluate(client, (text) => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.trim() === text)?.click(), label);
  await clickPublicationAction("Опубликовать ревизию 8");
  await waitForCondition(client, () => document.querySelector('[data-specifications2-publish-confirm="spec-kt7"]')?.textContent?.includes("stable ID spec-kt7"), { message: "publication confirmation was not bound to exact specification ID" });
  await clickPublicationAction("Отмена");
  await waitForCondition(client, () => !document.querySelector("[data-specifications2-publish-confirm]"), { message: "publication confirmation did not cancel" });
  assert(specificationWrites === 0, "cancelled publication reached the server API");

  await clickPublicationAction("Опубликовать ревизию 8");
  await waitForCondition(client, () => Boolean(document.querySelector('[data-specifications2-publish-confirm="spec-kt7"]')), { message: "publication confirmation did not reopen" });
  forcePublishConflictOnce = true;
  await clickPublicationAction("Подтвердить ревизию 8");
  try {
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("другом сеансе"), { message: "publication revision conflict was not visible" });
  } catch (error) {
    const diagnostic = await evaluate(client, () => ({ alert: document.querySelector('[role="alert"]')?.textContent?.replace(/\s+/g, " ").trim() || "", confirmation: document.querySelector("[data-specifications2-publish-confirm]")?.textContent?.replace(/\s+/g, " ").trim() || "", publication: document.querySelector(".specifications2-react-publication")?.textContent?.replace(/\s+/g, " ").trim() || "" }));
    throw new Error(`${error.message}: ${JSON.stringify({ specificationWrites, publishAttempts, publishRequests, diagnostic })}`);
  }
  assert(specificationWrites === 1 && publishAttempts === 1 && serverItem.revisionNo === 7, "conflicted publication must not advance the server revision");
  await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].some((button) => button.textContent?.trim() === "Подтвердить ревизию 8" && !button.disabled), { message: "publication confirmation did not unlock after conflict" });
  await clickPublicationAction("Подтвердить ревизию 8");
  try {
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-specifications2-island][data-react-island-state="ready"]')) && document.querySelector('[data-specifications2-revision="revision-kt7-8"]') && [...document.querySelectorAll("[data-specifications2-tree-row]")].some((row) => row.textContent?.includes("Плата управления КТ-7")), { message: "published revision 8 did not return through PostgreSQL read model", timeoutMs: 20_000 });
  } catch (error) {
    const diagnostic = await evaluate(client, () => ({ store: JSON.parse(localStorage.getItem("mes-specifications-2-registry-v1") || "{}"), reactState: document.querySelector("[data-react-specifications2-island]")?.getAttribute("data-react-island-state") || "", legacy: Boolean(document.querySelector(".specifications2-page")), page: document.body.textContent?.replace(/\s+/g, " ").slice(0, 1000) || "" }));
    throw new Error(`${error.message}: ${JSON.stringify({ specificationWrites, publishAttempts, revisionReads, serverItem, diagnostic })}`);
  }
  const publicationResult = await evaluate(client, () => {
    const store = JSON.parse(localStorage.getItem("mes-specifications-2-registry-v1") || "{}");
    const selected = store.registry?.[0];
    return { revision: selected?.publication?.revision, fingerprint: selected?.publication?.fingerprint, state: document.querySelector(".specifications2-react-publication")?.textContent?.replace(/\s+/g, " ").trim() || "" };
  });
  assert(specificationWrites === 2 && publishAttempts === 2 && serverItem.revisionNo === 8, "publication retry must create exactly one next server revision");
  assert(publishRequests.length === 2 && publishRequests.every((request) => request.entryId === entry.id && request.expectedPreviousRevision === 7 && request.idempotencyKey.startsWith("specifications2-publish:")), `publication requests lost exact owner coordinates: ${JSON.stringify(publishRequests)}`);
  assert(publicationResult.revision === 8 && publicationResult.fingerprint !== entry.publication.fingerprint && publicationResult.state.toLowerCase().includes("ревизия 8"), `publication acknowledgement did not preserve the next immutable revision: ${JSON.stringify(publicationResult)}`);
  assert(sharedStateWrites === 1, "server-primary publication must not add a browser compatibility write");

  await client.send("Page.navigate", { url: `${origin}/?module=specifications2&qa-auth-bypass=1&qa-reload=specifications2-publication-legacy-readback` });
  try {
    await waitForCondition(client, () => Boolean(document.querySelector(".specifications2-page")) && document.querySelector(".specifications2-publication-bar")?.textContent?.toLowerCase().includes("ревизия 8") && [...document.querySelectorAll(".specifications2-table tbody tr")].some((row) => row.textContent?.includes("Плата управления КТ-7")), { message: "legacy Specifications 2.0 did not read back revision 8", timeoutMs: 20_000 });
  } catch (error) {
    const diagnostic = await evaluate(client, () => ({ publication: document.querySelector(".specifications2-publication-bar")?.textContent?.replace(/\s+/g, " ").trim() || "", rows: [...document.querySelectorAll(".specifications2-table tbody tr")].map((row) => row.textContent?.replace(/\s+/g, " ").trim()), state: localStorage.getItem("mes-specifications-2-registry-v1"), page: document.body.textContent?.replace(/\s+/g, " ").slice(0, 700) || "" }));
    throw new Error(`${error.message}: ${JSON.stringify({ revisionReads, serverItem, diagnostic })}`);
  }
  assert(await readFile(sharedStateFile, "utf8") === original, "intercepted draft QA changed the disposable server snapshot");
  assert(consoleProblems.length === 0, `browser console problems:\n${consoleProblems.join("\n")}`);
  console.log("Specifications 2.0 React production-shell functional QA: OK");
  console.log(`- PostgreSQL revision ${serverItem.revisionNo}, ${react.rows} tree rows, ${react.metrics} metrics; first commit ${react.commitMs.toFixed(2)} ms`);
  console.log("- one existing draft row saved through the legacy owner; published revision 7 stayed immutable until exact-ID publication");
  console.log("- cancel, publication conflict/retry, server revision 8, PostgreSQL and legacy read-back, one compatibility persistence and clean console: pass");
} catch (error) {
  if (previewOutput.trim()) console.error(previewOutput.trim());
  throw error;
} finally {
  if (chrome) await cleanupChrome(chrome); await stop(preview); await rm(temporaryRoot, { recursive: true, force: true });
}
