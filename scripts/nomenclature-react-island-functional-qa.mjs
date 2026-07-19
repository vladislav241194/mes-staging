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
  const writePreviewPort = await getFreePort();
  const origin = `http://127.0.0.1:${previewPort}`;
  const legacyOrigin = `http://127.0.0.1:${legacyPreviewPort}`;
  const writeOrigin = `http://127.0.0.1:${writePreviewPort}`;
  let previewOutput = "";
  let legacyPreviewOutput = "";
  let writePreviewOutput = "";
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
  const writePreview = spawn(process.execPath, ["scripts/preview-dist.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(writePreviewPort),
      APP_ENV: "local",
      MES_ADMIN_HOSTS: "admin.mes-line.ru",
      MES_SHARED_STATE_FILE: sharedStateFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  writePreview.stdout.on("data", (chunk) => { writePreviewOutput += chunk.toString(); });
  writePreview.stderr.on("data", (chunk) => { writePreviewOutput += chunk.toString(); });
  let chrome = null;
  try {
    await Promise.all([waitForPreview(origin), waitForPreview(legacyOrigin), waitForPreview(writeOrigin)]);
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
    await waitForCondition(client, () => document.querySelectorAll("[data-nomenclature-row-open]").length === 4, {
      message: "server-enabled contour without a session evaluation request did not preserve legacy",
    });
    const serverEnabledDefault = await evaluate(client, () => ({
      reactTargets: document.querySelectorAll("[data-react-nomenclature-island]").length,
      legacyRows: document.querySelectorAll("[data-nomenclature-row-open]").length,
    }));
    assert(serverEnabledDefault.reactTargets === 0 && serverEnabledDefault.legacyRows === 4, "server rollout permission must remain legacy without a per-session evaluation request");

    await client.send("Page.navigate", { url: `${origin}/?module=nomenclature&qa-auth-bypass=1&react-nomenclature-evaluation=1` });
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
        commitMs: Number(document.querySelector("[data-react-nomenclature-island]")?.getAttribute("data-react-island-commit-ms")),
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
    assert(Number.isFinite(initial.commitMs) && initial.commitMs >= 0 && initial.commitMs < 2000, `initial React commit must stay below the 2000 ms local gate, got ${initial.commitMs}`);
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

    await client.send("Page.navigate", { url: `${writeOrigin}/?module=nomenclature&qa-auth-bypass=1&react-nomenclature=1&react-nomenclature-write=1` });
    await delay(800);
    const writeMountDebug = await evaluate(client, () => ({
      url: window.location.href,
      targetState: document.querySelector("[data-react-nomenclature-island]")?.getAttribute("data-react-island-state") || "",
      legacyRows: document.querySelectorAll("[data-nomenclature-row-open]").length,
      boardPanes: document.querySelectorAll(".bom-lists-page.is-boards-pane").length,
      appText: document.querySelector("#app")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 240) || "",
    }));
    assert(writeMountDebug.targetState === "ready", `write-evaluation Nomenclature island did not mount: ${JSON.stringify(writeMountDebug)}`);
    const writeActivation = await evaluate(client, () => ({
      url: window.location.href,
      badge: document.querySelector(".lab-badge")?.textContent || "",
      actions: [...document.querySelectorAll('[data-ui-component="ActionButton"]')].map((button) => ({ text: button.textContent.trim(), disabled: button.disabled })),
      targets: document.querySelectorAll("[data-react-nomenclature-island]").length,
    }));
    assert(writeActivation.actions.some((button) => button.text.includes("Добавить позицию") && !button.disabled), `write-evaluation Nomenclature island did not expose create/edit: ${JSON.stringify(writeActivation)}`);
    await evaluate(client, () => {
      const addButton = [...document.querySelectorAll('[data-ui-component="ActionButton"]')]
        .find((button) => button.textContent.includes("Добавить позицию"));
      addButton?.click();
    });
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-editor")), { message: "React create editor did not open" });
    await evaluate(client, () => {
      const form = document.querySelector(".react-nomenclature-editor");
      const setValue = (name, value) => {
        const control = form?.elements.namedItem(name);
        if (!control) throw new Error(`Missing React editor field: ${name}`);
        const prototype = control instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : control instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, "value").set.call(control, value);
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
      };
      setValue("name", "Тестовая позиция React");
      setValue("article", "REACT-WRITE-001");
      setValue("type", "Механика");
      setValue("package", "QA-CASE");
      setValue("unit", "шт.");
      setValue("manufacturer", "MES QA");
      setValue("description", "Временная запись из изолированного write QA");
      setValue("status", "Активен");
      form.requestSubmit();
    });
    await waitForCondition(client, () => (
      document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 5
      && [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].some((row) => row.textContent.includes("Тестовая позиция React"))
    ), { message: "React create command did not return the five-row persisted projection" });
    await evaluate(client, () => {
      const row = [...document.querySelectorAll('[data-ui-component="SelectableRow"]')]
        .find((entry) => entry.textContent.includes("Тестовая позиция React"));
      row?.click();
    });
    await waitForCondition(client, () => document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent === "Тестовая позиция React", { message: "created row did not become the active React detail" });
    await evaluate(client, () => {
      const editButton = [...document.querySelectorAll('[data-ui-component="ActionButton"]')]
        .find((button) => button.textContent.includes("Редактировать"));
      editButton?.click();
    });
    await waitForCondition(client, () => document.querySelector('.react-nomenclature-editor input[name="name"]')?.value === "Тестовая позиция React", { message: "React edit editor did not open the created row" });
    await evaluate(client, () => {
      const form = document.querySelector(".react-nomenclature-editor");
      const name = form?.elements.namedItem("name");
      const article = form?.elements.namedItem("article");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(name, "Тестовая позиция React изменена");
      name.dispatchEvent(new Event("input", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(article, "REACT-WRITE-002");
      article.dispatchEvent(new Event("input", { bubbles: true }));
      form.requestSubmit();
    });
    await waitForCondition(client, () => (
      document.querySelectorAll('[data-ui-component="SelectableRow"]').length === 5
      && [...document.querySelectorAll('[data-ui-component="SelectableRow"]')].some((row) => row.textContent.includes("Тестовая позиция React изменена") && row.textContent.includes("REACT-WRITE-002"))
    ), { message: "React edit command did not return the updated persisted projection" });
    await evaluate(client, () => {
      const row = [...document.querySelectorAll('[data-ui-component="SelectableRow"]')]
        .find((entry) => entry.textContent.includes("Тестовая позиция React изменена"));
      row?.click();
    });
    await waitForCondition(client, () => document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent === "Тестовая позиция React изменена", { message: "updated row did not become the active React detail" });
    await evaluate(client, () => {
      const editButton = [...document.querySelectorAll('[data-ui-component="ActionButton"]')]
        .find((button) => button.textContent.includes("Редактировать"));
      editButton?.click();
    });
    await waitForCondition(client, () => document.querySelector('.react-nomenclature-editor input[name="name"]')?.value === "Тестовая позиция React изменена", { message: "updated row editor did not open before legacy fallback" });
    await evaluate(client, () => {
      const deleteButton = [...document.querySelectorAll('[data-ui-component="ActionButton"]')]
        .find((button) => button.textContent.includes("Удалить в legacy"));
      deleteButton?.click();
    });
    await waitForCondition(client, () => (
      !document.querySelector("[data-react-nomenclature-island]")
      && document.querySelector('#nomenclatureForm input[name="name"]')?.value === "Тестовая позиция React изменена"
    ), { message: "unsupported delete scope did not restore the exact legacy editor" });
    await evaluate(client, () => {
      const form = document.querySelector("#nomenclatureForm");
      const description = form?.elements.namedItem("description");
      description.value = "Legacy и React используют один command owner";
      form.requestSubmit();
    });
    await waitForCondition(client, () => document.querySelector('#nomenclatureForm textarea[name="description"]')?.value === "Legacy и React используют один command owner", { message: "legacy form did not preserve its save path after command extraction" });
    let writeSnapshot = null;
    let persistedDirectory = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      writeSnapshot = JSON.parse(await readFile(sharedStateFile, "utf8"));
      persistedDirectory = JSON.parse(writeSnapshot.values[DIRECTORY_STORAGE_KEY]);
      if (persistedDirectory.nomenclature.length === 5 && persistedDirectory.nomenclature.some((item) => item.article === "REACT-WRITE-002")) break;
      await delay(120);
    }
    const persistedState = writeSnapshot.values[STATE_STORAGE_KEY];
    const created = persistedDirectory.nomenclature.find((item) => item.article === "REACT-WRITE-002");
    assert(persistedDirectory.nomenclature.length === 5, `write evaluation must create exactly one position, got ${persistedDirectory.nomenclature.length}`);
    assert(created?.name === "Тестовая позиция React изменена" && created?.type === "Механика", "create/edit must preserve the typed command values");
    assert(created?.package === "QA-CASE" && created?.manufacturer === "MES QA", "create/edit must preserve all legacy editor fields");
    assert(created?.description === "Legacy и React используют один command owner", "legacy form and React must delegate to the same save contract");
    assert(persistedState === snapshot.values[STATE_STORAGE_KEY], "Nomenclature command must not modify Planning state");
    assert(consoleProblems.length === 0, `write-evaluation browser console must stay clean:\n${consoleProblems.join("\n")}`);
    console.log("Nomenclature React production-shell functional QA: OK");
    console.log("- same server payload: 4 legacy rows = 4 React rows");
    console.log("- server-enabled default without session request: legacy");
    console.log("- filters, selection and detail: pass");
    console.log(`- first React commit: ${initial.commitMs.toFixed(2)} ms (< 2000 ms local gate)`);
    console.log("- disabled writes and unchanged state file: pass");
    console.log("- legacy Boards fallback with 2 boards: pass");
    console.log("- React create + edit through the legacy command owner: pass");
    console.log("- legacy edit through the extracted command owner: pass");
    console.log("- delete scope returns to the exact legacy editor: pass");
  } catch (error) {
    if (previewOutput.trim()) console.error(previewOutput.trim());
    if (legacyPreviewOutput.trim()) console.error(legacyPreviewOutput.trim());
    if (writePreviewOutput.trim()) console.error(writePreviewOutput.trim());
    throw error;
  } finally {
    if (chrome) await cleanupChrome(chrome);
    await Promise.all([stopProcess(preview), stopProcess(legacyPreview), stopProcess(writePreview)]);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
