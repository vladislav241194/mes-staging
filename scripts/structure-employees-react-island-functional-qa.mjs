import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { PRODUCTION_STRUCTURE_MATRIX_ROWS } from "../src/production_structure_matrix_data.js";
import { migrateLegacySystemDomains, serializeSystemDomains } from "../src/modules/system_domains/service.js";
import {
  cleanupChrome,
  delay,
  evaluate,
  getFreePort,
  launchChrome,
  waitForCondition,
} from "./browser-cdp-qa-utils.mjs";

const STATE_STORAGE_KEY = "mes-planning-prototype-state-v2";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForPreview(origin, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${origin}/?module=productionStructureMatrix&qa-auth-bypass=1`, { cache: "no-store" });
      const html = await response.text();
      if (response.ok && html.includes('id="app"') && !html.includes("MES Admin")) return;
    } catch {
      // Preview is still starting.
    }
    await delay(120);
  }
  throw new Error(`Structure Employees QA preview did not become ready at ${origin}`);
}

async function stopProcess(child) {
  if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(resolve, 1200);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function selectLegacyRegistry(client, registryId) {
  await waitForCondition(client, (targetRegistryId) => Boolean(document.querySelector(`[data-system-domain-registry="${targetRegistryId}"]`)), {
    arg: registryId,
    message: `legacy registry navigation did not expose ${registryId}`,
  });
  await evaluate(client, (targetRegistryId) => document.querySelector(`[data-system-domain-registry="${targetRegistryId}"]`)?.click(), registryId);
}

async function main() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-structure-employees-react-functional-"));
  const sharedStateFile = join(temporaryRoot, "shared-state.json");
  const baseline = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS });
  const supervisorPosition = baseline.domains.registries.positions.find((position) => position.kind === "supervisor");
  const masterAssignment = baseline.domains.registries.employmentAssignments.find((assignment) => assignment.positionId === supervisorPosition?.id);
  const masterId = masterAssignment?.employeeId || "";
  const executorId = baseline.domains.registries.employmentAssignments.find((assignment) => assignment.employeeId !== masterId)?.employeeId || "";
  assert(masterId && executorId, "canonical System Domains fixture must contain access subjects");
  const migration = migrateLegacySystemDomains({
    matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS,
    legacyUi: {
      accessRoleProfiles: [
        { id: "master", label: "Мастер производства", scope: "workCenter", defaultModule: "shiftMasterBoard", modulePermissions: { productionStructureMatrix: { view: true, edit: true } } },
        { id: "executor", label: "Исполнитель", scope: "self", defaultModule: "authSessionPrototype", modulePermissions: { productionStructureMatrix: { view: true, edit: false } } },
      ],
      accessRoleAssignments: { [masterId]: "master", [executorId]: "executor" },
    },
    migratedAt: "2026-07-19T00:00:00.000Z",
  });
  assert(migration.report.validation.valid, "canonical System Domains fixture must be valid");
  assert(migration.domains.registries.employees.length === 76, "canonical System Domains fixture must contain 76 employees");
  const snapshot = {
    version: 1,
    updatedAt: "2026-07-19T00:00:00.000Z",
    updatedBy: { actor: "structure-employees-react-functional-qa" },
    values: {
      [STATE_STORAGE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
      [SYSTEM_DOMAINS_STORAGE_KEY]: serializeSystemDomains(migration.domains),
    },
    sharedUi: {},
    events: [],
  };
  await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
  assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary shared-state file must be owner-readable only");
  const originalSnapshot = await readFile(sharedStateFile, "utf8");
  const previewPort = await getFreePort();
  const legacyPreviewPort = await getFreePort();
  const origin = `http://127.0.0.1:${previewPort}`;
  const legacyOrigin = `http://127.0.0.1:${legacyPreviewPort}`;
  let previewOutput = "";
  let legacyPreviewOutput = "";
  const preview = spawn(process.execPath, ["scripts/preview-dist.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(previewPort),
      APP_ENV: "local",
      MES_ADMIN_HOSTS: "admin.mes-line.ru",
      MES_SHARED_STATE_FILE: sharedStateFile,
      MES_REACT_STRUCTURE_EMPLOYEES: "1",
      MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  preview.stdout.on("data", (chunk) => { previewOutput += chunk.toString(); });
  preview.stderr.on("data", (chunk) => { previewOutput += chunk.toString(); });
  const legacyPreview = spawn(process.execPath, ["scripts/preview-dist.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(legacyPreviewPort),
      APP_ENV: "local",
      MES_ADMIN_HOSTS: "admin.mes-line.ru",
      MES_SHARED_STATE_FILE: sharedStateFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  legacyPreview.stdout.on("data", (chunk) => { legacyPreviewOutput += chunk.toString(); });
  legacyPreview.stderr.on("data", (chunk) => { legacyPreviewOutput += chunk.toString(); });
  let chrome = null;
  let interceptedReads = 0;
  const consoleProblems = [];
  try {
    await Promise.all([waitForPreview(origin), waitForPreview(legacyOrigin)]);
    chrome = await launchChrome("mes-structure-employees-react-qa-");
    const { client } = chrome;
    const systemDomainsResponseBody = Buffer.from(JSON.stringify({
      ok: true,
      revision: 1,
      item: migration.domains,
    })).toString("base64");
    client.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Fetch.requestPaused") {
        const requestUrl = new URL(message.params.request.url);
        if (requestUrl.pathname === "/api/v1/system-domains") {
          interceptedReads += 1;
          void client.send("Fetch.fulfillRequest", {
            requestId: message.params.requestId,
            responseCode: 200,
            responseHeaders: [
              { name: "Content-Type", value: "application/json; charset=utf-8" },
              { name: "Cache-Control", value: "no-store" },
              { name: "ETag", value: '"1"' },
            ],
            body: systemDomainsResponseBody,
          }).catch((error) => consoleProblems.push(`System Domains QA response failed: ${error.message}`));
        } else {
          void client.send("Fetch.continueRequest", { requestId: message.params.requestId })
            .catch((error) => consoleProblems.push(`Structure QA request continuation failed: ${error.message}`));
        }
        return;
      }
      if (message.method !== "Runtime.consoleAPICalled") return;
      if (!["error", "warning", "assert"].includes(message.params?.type)) return;
      consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    });
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Fetch.enable", {
      patterns: [{ urlPattern: "*api/v1/system-domains*", requestStage: "Request" }],
    });
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    await client.send("Page.navigate", { url: `${legacyOrigin}/?module=productionStructureMatrix&qa-auth-bypass=1` });
    await waitForCondition(client, () => document.querySelectorAll('[data-system-domain-table="orgUnits"] [data-system-domain-row]').length === 19, {
      message: "legacy Structure module did not receive the canonical server payload",
    });
    await selectLegacyRegistry(client, "employees");
    await waitForCondition(client, () => document.querySelectorAll('[data-system-domain-table="employees"] [data-system-domain-row]').length === 76, {
      message: "legacy Employees did not render the 76-row server payload",
    });
    const legacyRows = await evaluate(client, () => [...document.querySelectorAll('[data-system-domain-table="employees"] [data-system-domain-row]')].map((row) => (
      [...row.querySelectorAll("td")].slice(0, -1).map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ")
    )));

    await client.send("Page.navigate", { url: `${origin}/?module=productionStructureMatrix&qa-auth-bypass=1` });
    await waitForCondition(client, () => document.querySelectorAll('[data-system-domain-table="orgUnits"] [data-system-domain-row]').length === 19, {
      message: "server-enabled Structure module did not receive the canonical server payload",
    });
    await selectLegacyRegistry(client, "employees");
    await waitForCondition(client, () => document.querySelectorAll('[data-system-domain-table="employees"] [data-system-domain-row]').length === 76, {
      message: "server-enabled contour without a session request did not preserve legacy Employees",
    });
    const serverEnabledDefault = await evaluate(client, () => ({
      reactTargets: document.querySelectorAll("[data-react-structure-employees-island]").length,
      legacyRows: document.querySelectorAll('[data-system-domain-table="employees"] [data-system-domain-row]').length,
    }));
    assert(serverEnabledDefault.reactTargets === 0 && serverEnabledDefault.legacyRows === 76, "server rollout permission must remain legacy without a per-session evaluation request");

    await client.send("Page.navigate", { url: `${origin}/?module=productionStructureMatrix&qa-auth-bypass=1&react-structure-employees-evaluation=1` });
    await waitForCondition(client, () => (
      document.querySelector('[data-react-structure-employees-island][data-react-island-state="ready"]')
      && document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 76
    ), { message: "Structure Employees React island did not render the 76-row server payload", timeoutMs: 15_000 });

    const initial = await evaluate(client, () => {
      const target = document.querySelector("[data-react-structure-employees-island]");
      const selected = document.querySelector('[data-ui-component="SelectableRow"].is-selected');
      const metrics = Object.fromEntries([...document.querySelectorAll('[data-ui-component="MetricCard"]')].map((card) => [
        card.querySelector("span")?.textContent?.trim() || "",
        Number(card.querySelector("strong")?.textContent || 0),
      ]));
      return {
        revision: target?.getAttribute("data-react-island-revision"),
        commitMs: Number(target?.getAttribute("data-react-island-commit-ms")),
        rows: [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].map((row) => (
          [...row.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ")
        )),
        selectedText: selected?.textContent?.replace(/\s+/g, " ").trim() || "",
        detailTitle: document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || "",
        createDisabled: document.querySelector('[data-ui-component="ActionButton"]')?.disabled === true,
        sidebarItems: document.querySelectorAll('[data-ui-component="SidebarItem"]').length,
        metrics,
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    assert(initial.revision === "1", "initial Structure Employees React commit revision must be 1");
    assert(Number.isFinite(initial.commitMs) && initial.commitMs >= 0 && initial.commitMs < 2000, `initial React commit must stay below 2000 ms, got ${initial.commitMs}`);
    assert(JSON.stringify(initial.rows) === JSON.stringify(legacyRows), "React and legacy must expose the same four employee cells in the same 76-row order");
    assert(initial.rows.length === 76 && initial.selectedText && initial.detailTitle, "initial employee selection and detail must be populated");
    assert(initial.selectedText.includes(initial.detailTitle), "selected employee row and detail title must agree");
    assert(initial.createDisabled, "Structure Employees write command must remain disabled");
    assert(initial.sidebarItems === 7, "all seven Structure registry entries must remain visible");
    assert(initial.metrics["Подразделений"] === 19, "organization unit metric must be 19");
    assert(initial.metrics["Рабочих центров"] === 19, "work center metric must be 19");
    assert(initial.metrics["Должностей"] === 49, "position metric must be 49");
    assert(initial.metrics["Сотрудников"] === 76, "employee metric must be 76");
    assert(initial.metrics["Оборудования"] === 6, "equipment metric must be 6");
    assert(!initial.pageOverflow, "Structure Employees React island must not create page-level horizontal overflow");

    const selectedSecond = await evaluate(client, async () => {
      const rows = [...document.querySelectorAll('[data-ui-component="SelectableRow"]')];
      rows[1]?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        selectedCount: document.querySelectorAll('[data-ui-component="SelectableRow"].is-selected').length,
        rowText: rows[1]?.textContent?.replace(/\s+/g, " ").trim() || "",
        detailTitle: document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || "",
      };
    });
    assert(selectedSecond.selectedCount === 1 && selectedSecond.rowText.includes(selectedSecond.detailTitle), "row selection and detail must stay synchronized");

    await evaluate(client, () => {
      const button = [...document.querySelectorAll('[data-ui-component="SidebarItem"]')]
        .find((entry) => entry.querySelector(".filter-copy > span")?.textContent?.trim() === "Подразделения");
      button?.click();
    });
    await waitForCondition(client, () => (
      !document.querySelector("[data-react-structure-employees-island]")
      && document.querySelectorAll('[data-system-domain-table="orgUnits"] [data-system-domain-row]').length === 19
    ), { message: "Structure registry request did not restore the requested legacy Org Units view" });
    const fallback = await evaluate(client, () => ({
      reactTargets: document.querySelectorAll("[data-react-structure-employees-island]").length,
      orgUnitRows: document.querySelectorAll('[data-system-domain-table="orgUnits"] [data-system-domain-row]').length,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    assert(fallback.reactTargets === 0 && fallback.orgUnitRows === 19, "fallback must unmount React and render the requested legacy registry");
    assert(!fallback.pageOverflow, "legacy fallback must not create page-level overflow");
    assert(consoleProblems.length === 0, `browser console must stay clean:\n${consoleProblems.join("\n")}`);

    const finalSnapshot = await readFile(sharedStateFile, "utf8");
    assert(finalSnapshot === originalSnapshot, "read-only Structure Employees scenario must not modify shared state");
    console.log("Structure Employees React production-shell functional QA: OK");
    console.log("- same server payload: 76 legacy rows = 76 React rows");
    console.log("- server-enabled default without session request: legacy");
    console.log("- selection, detail, seven registries and six metrics: pass");
    console.log(`- first React commit: ${initial.commitMs.toFixed(2)} ms (< 2000 ms local gate)`);
    console.log("- disabled writes and unchanged state file: pass");
    console.log("- requested Org Units legacy fallback with 19 rows: pass");
  } catch (error) {
    if (chrome) {
      const browserState = await evaluate(chrome.client, () => ({
        url: location.href,
        headings: [...document.querySelectorAll("h1,h2")].slice(0, 8).map((node) => node.textContent?.trim()),
        tables: [...document.querySelectorAll("[data-system-domain-table]")].map((table) => ({
          registry: table.getAttribute("data-system-domain-table"),
          rows: table.querySelectorAll("[data-system-domain-row]").length,
        })),
        reactTargets: document.querySelectorAll("[data-react-structure-employees-island]").length,
        structureText: document.querySelector(".production-structure-content")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 800) || "",
        visibleText: document.querySelector("main")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 600) || "",
      })).catch(() => null);
      if (browserState) console.error(`BROWSER_STATE ${JSON.stringify(browserState)}`);
      console.error(`INTERCEPTED_SYSTEM_DOMAINS_READS ${interceptedReads}`);
      if (consoleProblems.length) console.error(`CONSOLE_PROBLEMS ${JSON.stringify(consoleProblems)}`);
    }
    if (previewOutput.trim()) console.error(previewOutput.trim());
    if (legacyPreviewOutput.trim()) console.error(legacyPreviewOutput.trim());
    throw error;
  } finally {
    if (chrome) await cleanupChrome(chrome);
    await Promise.all([stopProcess(preview), stopProcess(legacyPreview)]);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
