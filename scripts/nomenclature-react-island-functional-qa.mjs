import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  cleanupChrome,
  delay,
  evaluate,
  getFreePort,
  launchChrome,
  waitForCondition,
} from "./browser-cdp-qa-utils.mjs";

const DIRECTORY_STORAGE_KEY = "mes-planning-prototype-directories-v2";
const STATE_STORAGE_KEY = "mes-planning-prototype-state-v2";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createDirectoryFixture() {
  return {
    bomLists: [
      { id: "board-control", name: "Плата управления", status: "Черновик", importRows: [] },
      { id: "board-power", name: "Плата питания", status: "Черновик", importRows: [] },
    ],
    nomenclatureTypes: [
      { id: "nom-type-rea", name: "РЭА компоненты", status: "Активен" },
      { id: "nom-type-pcb", name: "Печатные платы", status: "Активен" },
      { id: "nom-type-mech", name: "Механика", status: "Активен" },
      { id: "nom-type-cable", name: "Кабели и жгуты", status: "Активен" },
    ],
    nomenclature: [
      { id: "rea-001", article: "RC0603-10K", name: "Резистор 10 кОм", type: "РЭА компоненты", unit: "шт.", package: "0603", manufacturer: "Yageo", status: "Активен" },
      { id: "rea-002", article: "MCU-STM32", name: "Микроконтроллер STM32", type: "РЭА компоненты", unit: "шт.", package: "LQFP-64", manufacturer: "ST", status: "Черновик" },
      { id: "pcb-001", article: "PCB-CONTROL-01", name: "Плата управления", type: "Печатные платы", unit: "шт.", package: "PCB", manufacturer: "—", status: "Активен" },
      { id: "mech-001", article: "CASE-AL-01", name: "Корпус алюминиевый", type: "Механика", unit: "шт.", package: "120×80", manufacturer: "MES Line", status: "Активен" },
    ],
    statuses: [],
  };
}

async function waitForPreview(origin, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${origin}/?module=nomenclature&qa-auth-bypass=1`, { cache: "no-store" });
      const html = await response.text();
      if (response.ok && html.includes('id="app"') && !html.includes("MES Admin")) return;
    } catch {
      // Preview is still starting.
    }
    await delay(120);
  }
  throw new Error(`Nomenclature QA preview did not become ready at ${origin}`);
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
  const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-nomenclature-react-functional-"));
  const sharedStateFile = join(temporaryRoot, "shared-state.json");
  const directoryFixture = createDirectoryFixture();
  const snapshot = {
    version: 1,
    updatedAt: "2026-07-19T00:00:00.000Z",
    updatedBy: { actor: "nomenclature-react-functional-qa" },
    values: {
      [STATE_STORAGE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
      [DIRECTORY_STORAGE_KEY]: JSON.stringify(directoryFixture),
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
      MES_REACT_NOMENCLATURE: "1",
      MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION: "1",
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
  try {
    await Promise.all([waitForPreview(origin), waitForPreview(legacyOrigin)]);
    chrome = await launchChrome("mes-nomenclature-react-qa-");
    const { client } = chrome;
    const consoleProblems = [];
    client.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method !== "Runtime.consoleAPICalled") return;
      if (!["error", "warning", "assert"].includes(message.params?.type)) return;
      consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    });
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send("Page.navigate", { url: `${legacyOrigin}/?module=nomenclature&qa-auth-bypass=1` });
    await waitForCondition(client, () => document.querySelectorAll("[data-nomenclature-row-open]").length === 4, {
      message: "legacy Nomenclature did not render the four-row server payload",
    });
    const legacyRows = await evaluate(client, () => [...document.querySelectorAll("[data-nomenclature-row-open]")].map((row) => (
      [...row.querySelectorAll("td")].slice(0, -1).map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ")
    )));
    await client.send("Page.navigate", { url: `${origin}/?module=nomenclature&qa-auth-bypass=1` });
    await waitForCondition(client, () => (
      document.querySelector('[data-react-nomenclature-island][data-react-island-state="ready"]')
      && document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 4
    ), { message: "Nomenclature React island did not render the four-row server payload" });

    const initial = await evaluate(client, () => {
      const sidebar = [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].map((button) => ({
        label: button.querySelector(".filter-copy > span")?.textContent?.trim() || "",
        count: Number(button.querySelector("b")?.textContent || 0),
      }));
      const selected = document.querySelector('[data-ui-component="SelectableRow"].is-selected');
      return {
        revision: document.querySelector("[data-react-nomenclature-island]")?.getAttribute("data-react-island-revision"),
        rowIds: [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].map((row) => (
          [...row.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ")
        )),
        selectedText: selected ? [...selected.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).join(" ") : "",
        detailTitle: document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || "",
        createDisabled: document.querySelector('[data-ui-component="ActionButton"]')?.disabled === true,
        sidebar,
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    assert(initial.revision === "1", "initial React commit revision must be 1");
    assert(initial.rowIds.length === 4 && initial.rowIds[0].includes("Резистор 10 кОм"), "React must preserve the four-row payload order");
    assert(
      JSON.stringify(initial.rowIds) === JSON.stringify(legacyRows),
      `React and legacy must expose the same seven cells in the same four-row order\nlegacy=${JSON.stringify(legacyRows)}\nreact=${JSON.stringify(initial.rowIds)}`,
    );
    assert(initial.selectedText.includes("Резистор 10 кОм") && initial.detailTitle === "Резистор 10 кОм", "initial row and detail selection must agree");
    assert(initial.createDisabled, "write command must remain disabled");
    assert(initial.sidebar.find((entry) => entry.label === "Вся номенклатура")?.count === 4, "all-items count must be 4");
    assert(initial.sidebar.find((entry) => entry.label === "РЭА компоненты")?.count === 2, "REA count must be 2");
    assert(initial.sidebar.find((entry) => entry.label === "Печатные платы")?.count === 2, "Boards count must follow bomLists, not item rows");
    assert(!initial.pageOverflow, "React island must not create page-level horizontal overflow");

    const filtered = await evaluate(client, async () => {
      const button = [...document.querySelectorAll('[data-ui-component="SidebarItem"]')]
        .find((entry) => entry.querySelector(".filter-copy > span")?.textContent?.trim() === "Механика");
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        rows: [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].map((row) => row.textContent.replace(/\s+/g, " ").trim()),
        detailTitle: document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || "",
        activeFilter: document.querySelector('[data-ui-component="SidebarItem"].is-active .filter-copy > span')?.textContent?.trim() || "",
      };
    });
    assert(filtered.rows.length === 1 && filtered.rows[0].includes("Корпус алюминиевый"), "Mechanics filter must show exactly its row");
    assert(filtered.detailTitle === "Корпус алюминиевый" && filtered.activeFilter === "Механика", "filter and detail state must remain synchronized");

    await evaluate(client, () => {
      const button = [...document.querySelectorAll('[data-ui-component="SidebarItem"]')]
        .find((entry) => entry.querySelector(".filter-copy > span")?.textContent?.trim() === "Печатные платы");
      button?.click();
    });
    await waitForCondition(client, () => (
      !document.querySelector("[data-react-nomenclature-island]")
      && document.querySelectorAll(".bom-lists-page.is-boards-pane").length === 1
    ), { message: "Boards request did not restore the single legacy Boards/BOM pane" });
    const fallback = await evaluate(client, () => ({
      reactTargets: document.querySelectorAll("[data-react-nomenclature-island]").length,
      boardsPanes: document.querySelectorAll(".bom-lists-page.is-boards-pane").length,
      boardButtons: document.querySelectorAll("[data-bom-open]").length,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    assert(fallback.reactTargets === 0 && fallback.boardsPanes === 1, "fallback must unmount React and render one legacy Boards pane");
    assert(fallback.boardButtons === 2, "legacy Boards pane must receive both fixture boards");
    assert(!fallback.pageOverflow, "legacy fallback must not create page-level overflow");
    assert(consoleProblems.length === 0, `browser console must stay clean:\n${consoleProblems.join("\n")}`);

    const finalSnapshot = await readFile(sharedStateFile, "utf8");
    assert(finalSnapshot === originalSnapshot, "read-only React scenario must not modify the temporary shared-state file");
    console.log("Nomenclature React production-shell functional QA: OK");
    console.log("- same server payload: 4 legacy rows = 4 React rows");
    console.log("- filters, selection and detail: pass");
    console.log("- disabled writes and unchanged state file: pass");
    console.log("- legacy Boards fallback with 2 boards: pass");
  } catch (error) {
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
