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
      {
        id: "board-control",
        name: "Плата управления",
        boardCode: "АБВГ.469659.001",
        resultItem: "Смонтированная плата управления",
        status: "Активен",
        sourceFileName: "АБВГ.469659.001 Клюшка.xlsx",
        importHeaders: ["№", "Описание", "Обозначение в схеме", "Аритикул производителя", "Производитель", "Корпус", "Кол-во", "Примечание", "Поле I"],
        importRows: [
          { values: [1, "Резистор 10 кОм", "R1-R10", "RC0603-10K", "Yageo", 603, 10, "1%", ""] },
          { values: [2, "Транзистор", "VT1, VT2", "MMBT3904", "onsemi", "SOT-23", 2, "", ""] },
          { values: [3, "Микроконтроллер", "DD1", "STM32G0", "ST", "QFN-32", 1, "Прошивка", ""] },
          { values: [4, "Разъем питания", "XP1-XP3", "HDR-2", "Amphenol", "Connector", 3, "", ""] },
        ],
      },
      {
        id: "board-power",
        name: "Плата питания",
        boardCode: "АБВГ.469659.002",
        resultItem: "Смонтированная плата питания",
        status: "Черновик",
        importRows: [],
      },
    ],
    nomenclatureTypes: [
      { id: "nom-type-rea", name: "РЭА компоненты", status: "Активен" },
      { id: "nom-type-pcb", name: "Печатные платы", status: "Активен" },
    ],
    nomenclature: [
      { id: "rea-001", article: "RC0603-10K", name: "Резистор 10 кОм", type: "РЭА компоненты", unit: "шт.", package: "0603", manufacturer: "Yageo", status: "Активен" },
      { id: "pcb-001", article: "PCB-CONTROL-01", name: "Плата управления", type: "Печатные платы", unit: "шт.", package: "PCB", manufacturer: "—", status: "Активен" },
    ],
    statuses: [],
  };
}

async function waitForPreview(origin, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${origin}/?module=bomLists&qa-auth-bypass=1`, { cache: "no-store" });
      const html = await response.text();
      if (response.ok && html.includes('id="app"') && !html.includes("MES Admin")) return;
    } catch {
      // Preview is still starting.
    }
    await delay(120);
  }
  throw new Error(`Boards QA preview did not become ready at ${origin}`);
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
  const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-boards-react-functional-"));
  const sharedStateFile = join(temporaryRoot, "shared-state.json");
  const directoryFixture = createDirectoryFixture();
  const snapshot = {
    version: 1,
    updatedAt: "2026-07-19T00:00:00.000Z",
    updatedBy: { actor: "boards-react-functional-qa" },
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
      MES_REACT_BOARDS: "1",
      MES_REACT_BOARDS_READ_ONLY_EVALUATION: "1",
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
  const consoleProblems = [];
  try {
    await Promise.all([waitForPreview(origin), waitForPreview(legacyOrigin)]);
    chrome = await launchChrome("mes-boards-react-qa-");
    const { client } = chrome;
    client.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method !== "Runtime.consoleAPICalled") return;
      if (!["error", "warning", "assert"].includes(message.params?.type)) return;
      consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    });
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    await client.send("Page.navigate", { url: `${legacyOrigin}/?module=bomLists&qa-auth-bypass=1` });
    await waitForCondition(client, () => document.querySelectorAll("[data-bom-open]").length === 2, {
      message: "legacy Boards did not render both fixture boards",
    });
    await evaluate(client, () => document.querySelector('[data-bom-open="board-control"]')?.click());
    await waitForCondition(client, () => document.querySelectorAll(".bom-import-table tbody tr").length === 4, {
      message: "legacy Boards did not render the four BOM rows",
    });
    const legacy = await evaluate(client, () => ({
      headers: [...document.querySelectorAll(".bom-import-table thead th")].slice(0, -1).map((cell) => cell.textContent.replace(/\s+/g, " ").trim()),
      rows: [...document.querySelectorAll(".bom-import-table tbody tr")].map((row) => (
        [...row.querySelectorAll("td")].slice(0, -1).map((cell) => cell.querySelector("input")?.value || cell.textContent.replace(/\s+/g, " ").trim())
      )),
    }));

    await client.send("Page.navigate", { url: `${origin}/?module=bomLists&qa-auth-bypass=1` });
    await waitForCondition(client, () => document.querySelectorAll("[data-bom-open]").length === 2, {
      message: "server-enabled Boards without a session request did not preserve legacy",
    });
    const serverEnabledDefault = await evaluate(client, () => ({
      reactTargets: document.querySelectorAll("[data-react-boards-island]").length,
      legacyBoards: document.querySelectorAll("[data-bom-open]").length,
    }));
    assert(serverEnabledDefault.reactTargets === 0 && serverEnabledDefault.legacyBoards === 2, "server rollout permission must remain legacy without a per-session evaluation request");

    await client.send("Page.navigate", { url: `${origin}/?module=bomLists&qa-auth-bypass=1&react-boards-evaluation=1` });
    await waitForCondition(client, () => (
      document.querySelector('[data-react-boards-island][data-react-island-state="ready"]')
      && document.querySelectorAll(".bom-table tbody tr").length === 4
    ), { message: "Boards React island did not render the four-row BOM payload", timeoutMs: 15_000 });

    const initial = await evaluate(client, () => {
      const target = document.querySelector("[data-react-boards-island]");
      const metrics = Object.fromEntries([...document.querySelectorAll('[data-ui-component="MetricCard"]')].map((card) => [
        card.querySelector("span")?.textContent?.trim() || "",
        Number(card.querySelector("strong")?.textContent || 0),
      ]));
      return {
        revision: target?.getAttribute("data-react-island-revision"),
        commitMs: Number(target?.getAttribute("data-react-island-commit-ms")),
        headers: [...document.querySelectorAll(".bom-table thead th")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()),
        rows: [...document.querySelectorAll(".bom-table tbody tr")].map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim())),
        detailTitle: document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || "",
        sidebarItems: document.querySelectorAll('[data-ui-component="SidebarItem"]').length,
        createDisabled: document.querySelector('[data-ui-component="ActionButton"]')?.disabled === true,
        metrics,
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    assert(initial.revision === "1", "initial Boards React commit revision must be 1");
    assert(Number.isFinite(initial.commitMs) && initial.commitMs >= 0 && initial.commitMs < 2000, `initial Boards React commit must stay below 2000 ms, got ${initial.commitMs}`);
    assert(JSON.stringify(initial.headers) === JSON.stringify(legacy.headers), "React and legacy Boards must expose the same nine BOM headers");
    assert(JSON.stringify(initial.rows) === JSON.stringify(legacy.rows), "React and legacy Boards must expose the same normalized BOM cells and order");
    assert(initial.detailTitle === "Плата управления" && initial.rows.length === 4, "initial board selection and detail must agree");
    assert(initial.sidebarItems === 3, "production Boards sidebar must expose return navigation plus both boards");
    assert(initial.createDisabled, "Boards import command must remain disabled");
    assert(initial.metrics["Компонентов"] === 16 && initial.metrics["Типов"] === 4, "Boards component summary must preserve 16 components in four groups");
    assert(!initial.pageOverflow, "Boards React island must not create page-level horizontal overflow");

    const emptyBoard = await evaluate(client, async () => {
      const button = [...document.querySelectorAll('[data-ui-component="SidebarItem"]')]
        .find((entry) => entry.querySelector(".filter-copy > span")?.textContent?.trim() === "Плата питания");
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        detailTitle: document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || "",
        emptyTitle: document.querySelector('[data-ui-component="EmptyState"] strong')?.textContent?.trim() || "",
        selectedCount: document.querySelectorAll('[data-ui-component="SidebarItem"].is-active').length,
      };
    });
    assert(emptyBoard.detailTitle === "Плата питания" && emptyBoard.emptyTitle === "Пока нет импортированных строк", "empty board selection must preserve its card and explicit empty state");
    assert(emptyBoard.selectedCount === 1, "Boards sidebar must keep exactly one selected board");

    await evaluate(client, () => {
      const button = [...document.querySelectorAll('[data-ui-component="SidebarItem"]')]
        .find((entry) => entry.querySelector(".filter-copy > span")?.textContent?.trim() === "Вся номенклатура");
      button?.click();
    });
    await waitForCondition(client, () => (
      !document.querySelector("[data-react-boards-island]")
      && document.querySelectorAll("[data-nomenclature-row-open]").length === 2
    ), { message: "Boards return navigation did not restore the legacy Nomenclature items pane" });
    const returned = await evaluate(client, () => ({
      reactTargets: document.querySelectorAll("[data-react-boards-island]").length,
      legacyRows: document.querySelectorAll("[data-nomenclature-row-open]").length,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    assert(returned.reactTargets === 0 && returned.legacyRows === 2, "return navigation must unmount Boards React and preserve both Nomenclature rows");
    assert(!returned.pageOverflow, "legacy Nomenclature return must not create page-level overflow");
    assert(consoleProblems.length === 0, `browser console must stay clean:\n${consoleProblems.join("\n")}`);

    const finalSnapshot = await readFile(sharedStateFile, "utf8");
    assert(finalSnapshot === originalSnapshot, "read-only Boards scenario must not modify shared state");
    console.log("Boards React production-shell functional QA: OK");
    console.log("- same payload: 9 legacy headers/4 rows = 9 React headers/4 rows");
    console.log("- server-enabled default without session request: legacy");
    console.log("- board selection, empty state and 16-component summary: pass");
    console.log(`- first React commit: ${initial.commitMs.toFixed(2)} ms (< 2000 ms local gate)`);
    console.log("- disabled writes and unchanged state file: pass");
    console.log("- return to legacy Nomenclature with 2 rows: pass");
  } catch (error) {
    if (chrome) {
      const browserState = await evaluate(chrome.client, () => ({
        url: location.href,
        reactTargets: document.querySelectorAll("[data-react-boards-island]").length,
        legacyBoards: document.querySelectorAll("[data-bom-open]").length,
        legacyRows: document.querySelectorAll(".bom-import-table tbody tr").length,
        reactRows: document.querySelectorAll(".bom-table tbody tr").length,
        visibleText: document.querySelector("main")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 800) || "",
      })).catch(() => null);
      if (browserState) console.error(`BROWSER_STATE ${JSON.stringify(browserState)}`);
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
