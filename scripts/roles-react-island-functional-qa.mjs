import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
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
  try {
    await waitForPreview(origin);
    chrome = await launchChrome("mes-roles-react-qa-");
    const { client } = chrome;
    const responseBody = Buffer.from(JSON.stringify({ ok: true, revision: 1, item: migration.domains })).toString("base64");
    client.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Fetch.requestPaused") {
        const requestUrl = new URL(message.params.request.url);
        if (requestUrl.pathname === "/api/v1/system-domains") {
          void client.send("Fetch.fulfillRequest", {
            requestId: message.params.requestId,
            responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "ETag", value: '"1"' }],
            body: responseBody,
          }).catch((error) => consoleProblems.push(error.message));
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
    assert(consoleProblems.length === 0, `browser console must stay clean:\n${consoleProblems.join("\n")}`);
    assert(await readFile(sharedStateFile, "utf8") === originalSnapshot, "read-only Roles scenario must not modify state");
    console.log("Roles React production-shell functional QA: OK");
    console.log(`- ${initial.roles} canonical roles, ${initial.modules} modules, explicit assignments: pass`);
    console.log("- server-enabled default without session request: legacy");
    console.log(`- first React commit: ${initial.commitMs.toFixed(2)} ms (< 2000 ms local gate)`);
    console.log("- disabled writes, unchanged state and clean console: pass");
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
