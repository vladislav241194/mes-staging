import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cleanupChrome, delay, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const DIRECTORY_STORAGE_KEY = "mes-planning-prototype-directories-v2";
const STATE_STORAGE_KEY = "mes-planning-prototype-state-v2";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function waitForPreview(origin) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    try {
      const response = await fetch(`${origin}/?module=directories&qa-auth-bypass=1`, { cache: "no-store" });
      if (response.ok && (await response.text()).includes('id="app"')) return;
    } catch {
      // Preview is still starting.
    }
    await delay(120);
  }
  throw new Error(`Directory Operations QA preview did not become ready at ${origin}`);
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
  const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-directory-operations-react-"));
  const sharedStateFile = join(temporaryRoot, "shared-state.json");
  const directoryFixture = {
    operationMap: [
      { id: "QA_OP_SMT", name: "QA SMT-монтаж", code: "QA-SMT", workCenterId: "D3", unitsPerHour: 55, status: "Активен" },
      { id: "QA_OP_WASH", name: "QA Отмывка", code: "QA-UW", workCenterId: "D3_UW", unitsPerHour: 150, status: "Активен" },
      { id: "QA_OP_DISABLED", name: "QA Архивная операция", code: "QA-OFF", workCenterId: "D3", unitsPerHour: 10, status: "Отключен" },
    ],
    componentTypes: [], nomenclatureTypes: [], nomenclature: [], bomLists: [], statuses: [],
  };
  const snapshot = {
    version: 1,
    updatedAt: "2026-07-19T00:00:00.000Z",
    updatedBy: { actor: "directory-operations-react-functional-qa" },
    values: {
      [STATE_STORAGE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
      [DIRECTORY_STORAGE_KEY]: JSON.stringify(directoryFixture),
    },
    sharedUi: {}, events: [],
  };
  await writeFile(sharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
  assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary state must be owner-readable only");
  const originalSnapshot = await readFile(sharedStateFile, "utf8");
  const previewPort = await getFreePort();
  const legacyPort = await getFreePort();
  const origin = `http://127.0.0.1:${previewPort}`;
  const legacyOrigin = `http://127.0.0.1:${legacyPort}`;
  const spawnPreview = (port, enabled) => spawn(process.execPath, ["scripts/preview-dist.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru", MES_SHARED_STATE_FILE: sharedStateFile,
      ...(enabled ? { MES_REACT_DIRECTORY_OPERATIONS: "1", MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION: "1" } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const preview = spawnPreview(previewPort, true);
  const legacyPreview = spawnPreview(legacyPort, false);
  let previewOutput = "";
  let legacyOutput = "";
  preview.stdout.on("data", (chunk) => { previewOutput += chunk.toString(); });
  preview.stderr.on("data", (chunk) => { previewOutput += chunk.toString(); });
  legacyPreview.stdout.on("data", (chunk) => { legacyOutput += chunk.toString(); });
  legacyPreview.stderr.on("data", (chunk) => { legacyOutput += chunk.toString(); });
  let chrome = null;
  const consoleProblems = [];
  try {
    await Promise.all([waitForPreview(origin), waitForPreview(legacyOrigin)]);
    chrome = await launchChrome("mes-directory-operations-react-qa-");
    const { client } = chrome;
    client.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method !== "Runtime.consoleAPICalled" || !["error", "warning", "assert"].includes(message.params?.type)) return;
      consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    });
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    await client.send("Page.navigate", { url: `${legacyOrigin}/?module=directories&qa-auth-bypass=1` });
    await waitForCondition(client, () => document.querySelectorAll('[data-directory-row]').length >= 3, { message: "legacy Operations did not render runtime rows" });
    const legacyRows = await evaluate(client, () => [...document.querySelectorAll('[data-directory-row]')].map((row) => (
      [...row.querySelectorAll("td")].slice(0, 3).map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ")
    )));
    assert(legacyRows.some((row) => row.includes("QA SMT-монтаж")), "legacy Operations must contain the QA runtime row");

    await client.send("Page.navigate", { url: `${origin}/?module=directories&qa-auth-bypass=1` });
    await waitForCondition(client, (expectedRows) => document.querySelectorAll('[data-directory-row]').length === expectedRows, { arg: legacyRows.length, message: "server permission without session request did not retain legacy Operations" });
    const defaultState = await evaluate(client, () => ({
      reactTargets: document.querySelectorAll("[data-react-directory-operations-island]").length,
      hasAdd: Boolean(document.querySelector("[data-add-directory]")),
    }));
    assert(defaultState.reactTargets === 0 && defaultState.hasAdd, "default Operations path must retain editable legacy commands");

    await client.send("Page.navigate", { url: `${origin}/?module=directories&qa-auth-bypass=1&react-directory-operations-evaluation=1` });
    await waitForCondition(client, (expectedRows) => Boolean(
      document.querySelector('[data-react-directory-operations-island][data-react-island-state="ready"]')
      && document.querySelectorAll('[data-ui-component="SelectableRow"]').length === expectedRows
    ), { arg: legacyRows.length, message: "Operations React island did not render the runtime rows", timeoutMs: 15_000 });
    const initial = await evaluate(client, () => {
      const target = document.querySelector("[data-react-directory-operations-island]");
      return {
        rows: [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].map((row) => (
          [...row.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ")
        )),
        filters: document.querySelectorAll('[data-ui-component="SidebarItem"]').length,
        selectedCount: document.querySelectorAll('[data-ui-component="SelectableRow"].is-selected').length,
        detailTitle: document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || "",
        writeDisabled: [...document.querySelectorAll('[data-ui-component="ActionButton"]')].every((button) => button.disabled),
        revision: target?.getAttribute("data-react-island-revision"),
        commitMs: Number(target?.getAttribute("data-react-island-commit-ms")),
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    assert(JSON.stringify(initial.rows) === JSON.stringify(legacyRows), `React and legacy Operations must expose the same three cells and order\nlegacy=${JSON.stringify(legacyRows)}\nreact=${JSON.stringify(initial.rows)}`);
    assert(initial.filters > 2 && initial.selectedCount === 1 && initial.detailTitle, "operation filters, selection and detail must render");
    assert(initial.writeDisabled && initial.revision === "1", "Operations React commands must stay disabled and report first revision");
    assert(Number.isFinite(initial.commitMs) && initial.commitMs >= 0 && initial.commitMs < 2000, `first Operations commit must stay below 2000 ms, got ${initial.commitMs}`);
    assert(!initial.pageOverflow, "Operations island must not create page-level overflow");

    const filtered = await evaluate(client, async () => {
      const filter = [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => {
        const label = item.querySelector(".filter-copy > span")?.textContent?.trim() || "";
        return !["Все справочники", "Все операции"].includes(label) && Number(item.querySelector("b")?.textContent || 0) > 1;
      });
      filter?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        chosen: filter?.querySelector(".filter-copy > span")?.textContent?.trim() || "",
        rows: document.querySelectorAll('[data-ui-component="SelectableRow"]').length,
        selected: document.querySelectorAll('[data-ui-component="SelectableRow"].is-selected').length,
      };
    });
    assert(filtered.chosen && filtered.rows > 1 && filtered.selected === 1, "work-center filter must preserve its rows and one selection");
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Все справочники"))?.click());
    await waitForCondition(client, () => Boolean(!document.querySelector("[data-react-directory-operations-island]") && document.querySelector('[data-directory-id="operations"].is-active')), { message: "Operations legacy return did not restore the current full directory navigation" });
    assert(consoleProblems.length === 0, `browser console must stay clean:\n${consoleProblems.join("\n")}`);
    assert(await readFile(sharedStateFile, "utf8") === originalSnapshot, "read-only Operations scenario must not modify state");
    console.log("Directory Operations React production-shell functional QA: OK");
    console.log(`- same payload: ${legacyRows.length} legacy rows = ${initial.rows.length} React rows, three cells and order match`);
    console.log("- resolved work-center labels, filtering, selection/detail and legacy return: pass");
    console.log(`- first React commit: ${initial.commitMs.toFixed(2)} ms (< 2000 ms local gate)`);
    console.log("- editable legacy default, disabled React writes, unchanged state and clean console: pass");
  } catch (error) {
    if (previewOutput.trim()) console.error(previewOutput.trim());
    if (legacyOutput.trim()) console.error(legacyOutput.trim());
    throw error;
  } finally {
    if (chrome) await cleanupChrome(chrome);
    await Promise.all([stopProcess(preview), stopProcess(legacyPreview)]);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
