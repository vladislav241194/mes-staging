import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cleanupChrome, delay, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const DIRECTORY_STORAGE_KEY = "mes-planning-prototype-directories-v2";
const STATE_STORAGE_KEY = "mes-planning-prototype-state-v2";
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const directoryFixture = {
  componentTypes: [], nomenclature: [], bomLists: [], statuses: [],
  nomenclatureTypes: [
    { id: "type-rea", name: "РЭА компоненты", code: "REA", description: "Электронные компоненты", status: "Активен" },
    { id: "type-pcb", name: "Печатные платы", code: "PCB", description: "Печатные платы и заготовки", status: "Активен" },
    { id: "type-mech", name: "Механика", code: "MECH", description: "Корпусные и механические детали", status: "Активен" },
    { id: "type-old", name: "Архивный раздел", code: "OLD", description: "Историческая классификация", status: "Отключен" },
  ],
};

async function waitForPreview(origin) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    try {
      const response = await fetch(`${origin}/?module=directories&qa-auth-bypass=1`, { cache: "no-store" });
      if (response.ok && (await response.text()).includes('id="app"')) return;
    } catch {}
    await delay(120);
  }
  throw new Error(`Nomenclature Types QA preview did not become ready at ${origin}`);
}

async function stopProcess(child) {
  if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(resolve, 1200);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function openLegacySection(client) {
  await waitForCondition(client, () => Boolean(document.querySelector('[data-directory-id="nomenclatureTypes"]')), { message: "legacy directory navigation did not render Nomenclature Types" });
  await evaluate(client, () => document.querySelector('[data-directory-id="nomenclatureTypes"]')?.click());
  await waitForCondition(client, () => document.querySelectorAll('[data-directory-row]').length >= 4, { message: "legacy Nomenclature Types did not render normalized runtime rows" });
}

async function main() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-directory-nomenclature-types-react-"));
  const sharedStateFile = join(temporaryRoot, "shared-state.json");
  const snapshot = {
    version: 1,
    updatedAt: "2026-07-19T00:00:00.000Z",
    updatedBy: { actor: "directory-nomenclature-types-react-functional-qa" },
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
      HOST: "127.0.0.1", PORT: String(port), APP_ENV: "local",
      MES_ADMIN_HOSTS: "admin.mes-line.ru", MES_SHARED_STATE_FILE: sharedStateFile,
      ...(enabled ? {
        MES_REACT_DIRECTORY_NOMENCLATURE_TYPES: "1",
        MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION: "1",
      } : {}),
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
    chrome = await launchChrome("mes-directory-nomenclature-types-react-qa-");
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
    await openLegacySection(client);
    const legacyRows = await evaluate(client, () => [...document.querySelectorAll('[data-directory-row]')].map((row) => (
      [...row.querySelectorAll("td")].slice(0, 4).map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ")
    )));

    await client.send("Page.navigate", { url: `${origin}/?module=directories&qa-auth-bypass=1` });
    await openLegacySection(client);
    const defaultState = await evaluate(client, () => ({
      reactTargets: document.querySelectorAll("[data-react-directory-nomenclature-types-island]").length,
      legacyRows: document.querySelectorAll("[data-directory-row]").length,
      hasAdd: Boolean(document.querySelector("[data-add-directory]")),
    }));
    assert(defaultState.reactTargets === 0 && defaultState.legacyRows === legacyRows.length && defaultState.hasAdd, "server permission without a session request must retain the normalized editable legacy Nomenclature Types rows");

    await client.send("Page.navigate", { url: `${origin}/?module=directories&qa-auth-bypass=1&react-directory-nomenclature-types-evaluation=1` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-directory-id="nomenclatureTypes"]') || document.querySelector('[data-react-directory-nomenclature-types-island]')), { message: "evaluation path exposed neither legacy navigation nor remembered Nomenclature Types scope" });
    await evaluate(client, () => document.querySelector('[data-directory-id="nomenclatureTypes"]')?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-directory-nomenclature-types-island][data-react-island-state="ready"]') && document.querySelectorAll('[data-ui-component="SelectableRow"]').length >= 4), { message: "Nomenclature Types React island did not render normalized runtime rows", timeoutMs: 15_000 });
    const initial = await evaluate(client, () => {
      const target = document.querySelector("[data-react-directory-nomenclature-types-island]");
      return {
        rows: [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ")),
        selectedCount: document.querySelectorAll('[data-ui-component="SelectableRow"].is-selected').length,
        detailTitle: document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || "",
        writeDisabled: [...document.querySelectorAll('[data-ui-component="ActionButton"]')].every((button) => button.disabled),
        legacyReturn: [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].some((item) => item.textContent?.includes("Все справочники")),
        revision: target?.getAttribute("data-react-island-revision"),
        commitMs: Number(target?.getAttribute("data-react-island-commit-ms")),
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    assert(JSON.stringify(initial.rows) === JSON.stringify(legacyRows), `React and legacy must expose the same four cells and row order\nlegacy=${JSON.stringify(legacyRows)}\nreact=${JSON.stringify(initial.rows)}`);
    assert(initial.selectedCount === 1 && initial.detailTitle, "initial row and detail must agree");
    assert(initial.writeDisabled && initial.legacyReturn && initial.revision === "1", "write command must stay disabled and legacy return must remain available");
    assert(Number.isFinite(initial.commitMs) && initial.commitMs >= 0 && initial.commitMs < 2000, `first Nomenclature Types commit must stay below 2000 ms, got ${initial.commitMs}`);
    assert(!initial.pageOverflow, "Nomenclature Types island must not create page-level overflow");

    const filtered = await evaluate(client, async () => {
      [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Отключен"))?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        rows: document.querySelectorAll('[data-ui-component="SelectableRow"]').length,
        selected: document.querySelectorAll('[data-ui-component="SelectableRow"].is-selected').length,
        detailTitle: document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || "",
      };
    });
    assert(filtered.rows === 1 && filtered.selected === 1 && filtered.detailTitle === "Архивный раздел", "status filter must keep one row, selection and matching detail");

    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent?.includes("Все справочники"))?.click());
    await waitForCondition(client, () => Boolean(!document.querySelector("[data-react-directory-nomenclature-types-island]") && document.querySelector('[data-directory-id="nomenclatureTypes"].is-active')), { message: "All directories action did not restore the current full legacy directory section" });
    assert(consoleProblems.length === 0, `browser console must stay clean:\n${consoleProblems.join("\n")}`);
    assert(await readFile(sharedStateFile, "utf8") === originalSnapshot, "read-only Nomenclature Types scenario must not modify state");
    console.log("Directory Nomenclature Types React production-shell functional QA: OK");
    console.log(`- same payload: ${legacyRows.length} legacy rows = ${initial.rows.length} React rows, four cells and order match`);
    console.log(`- first React commit: ${initial.commitMs.toFixed(2)} ms (< 2000 ms local gate)`);
    console.log("- default legacy, status filter, selection, detail, legacy return, unchanged state and clean console: pass");
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
