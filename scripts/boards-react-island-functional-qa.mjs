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
        projectId: "spec-board-control",
        customMetadata: "preserve-me",
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
      { id: "rea-001", article: "RC0603-10K", name: "Резистор 10 кОм", type: "РЭА компоненты", unit: "шт.", package: "0603", manufacturer: "Yageo", status: "Активен", hiddenMarker: "preserve-existing-nomenclature" },
      { id: "rea-add", article: "CAP0603-1U", name: "Конденсатор 1 мкФ", type: "РЭА компоненты", unit: "шт.", package: "0603", manufacturer: "Murata", status: "Активен", hiddenMarker: "preserve-added-nomenclature" },
      { id: "rea-xp", article: "HDR-2", name: "Разъем питания", type: "РЭА компоненты", unit: "шт.", package: "Connector", manufacturer: "Amphenol", status: "Активен", sourceBomIds: ["board-control"], hiddenMarker: "preserve-row-nomenclature" },
      { id: "pcb-001", article: "АБВГ.469659.001", name: "Смонтированная плата управления", type: "Печатные платы", unit: "шт.", package: "PCB", manufacturer: "—", status: "Активен", sourceBomResultId: "board-control" },
    ],
    specifications: [{ id: "spec-board-control", name: "Изделие с платой", bomListA: "board-control", bomQtyA: 2, structureItems: [{ id: "spec-board-item", type: "bom", bomId: "board-control", quantity: 2 }] }],
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
  const writeSharedStateFile = join(temporaryRoot, "write-shared-state.json");
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
  await writeFile(writeSharedStateFile, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
  assert(((await stat(sharedStateFile)).mode & 0o777) === 0o600, "temporary shared-state file must be owner-readable only");
  assert(((await stat(writeSharedStateFile)).mode & 0o777) === 0o600, "temporary write shared-state file must be owner-readable only");
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
  const writePreview = spawn(process.execPath, ["scripts/preview-dist.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(writePreviewPort), APP_ENV: "local", MES_ADMIN_HOSTS: "admin.mes-line.ru", MES_SHARED_STATE_FILE: writeSharedStateFile },
    stdio: ["ignore", "pipe", "pipe"],
  });
  writePreview.stdout.on("data", (chunk) => { writePreviewOutput += chunk.toString(); });
  writePreview.stderr.on("data", (chunk) => { writePreviewOutput += chunk.toString(); });
  let chrome = null;
  const consoleProblems = [];
  try {
    await Promise.all([waitForPreview(origin), waitForPreview(legacyOrigin), waitForPreview(writeOrigin)]);
    chrome = await launchChrome("mes-boards-react-qa-");
    const { client } = chrome;
    client.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method !== "Runtime.consoleAPICalled") return;
      if (!["error", "warning", "assert"].includes(message.params?.type)) return;
      const text = (message.params.args || []).map((arg) => arg.value || arg.description || "").join(" ");
      if (text.startsWith("[MES] Reconciled critical directory entities before save.")) return;
      consoleProblems.push(text);
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

    await evaluate(client, () => {
      const button = [...document.querySelectorAll('[data-ui-component="SidebarItem"]')]
        .find((entry) => entry.querySelector(".filter-copy > span")?.textContent?.trim() === "Плата питания");
      button?.click();
    });
    await waitForCondition(client, () => document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() === "Плата питания", { message: "empty Board selection did not settle" });
    const emptyBoard = await evaluate(client, () => ({
        detailTitle: document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || "",
        emptyTitle: document.querySelector('[data-ui-component="EmptyState"] strong')?.textContent?.trim() || "",
        selectedCount: document.querySelectorAll('[data-ui-component="SidebarItem"].is-active').length,
    }));
    assert(emptyBoard.detailTitle === "Плата питания" && emptyBoard.emptyTitle === "Пока нет импортированных строк", "empty board selection must preserve its card and explicit empty state");
    assert(emptyBoard.selectedCount === 1, "Boards sidebar must keep exactly one selected board");

    await evaluate(client, () => {
      const button = [...document.querySelectorAll('[data-ui-component="SidebarItem"]')]
        .find((entry) => entry.querySelector(".filter-copy > span")?.textContent?.trim() === "Вся номенклатура");
      button?.click();
    });
    await waitForCondition(client, () => (
      !document.querySelector("[data-react-boards-island]")
      && document.querySelectorAll("[data-nomenclature-row-open]").length >= 2
    ), { message: "Boards return navigation did not restore the legacy Nomenclature items pane" });
    const returned = await evaluate(client, () => ({
      reactTargets: document.querySelectorAll("[data-react-boards-island]").length,
      legacyRows: document.querySelectorAll("[data-nomenclature-row-open]").length,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    assert(returned.reactTargets === 0 && returned.legacyRows >= 2, "return navigation must unmount Boards React and preserve the normalized Nomenclature projection");
    assert(!returned.pageOverflow, "legacy Nomenclature return must not create page-level overflow");
    assert(consoleProblems.length === 0, `browser console must stay clean:\n${consoleProblems.join("\n")}`);

    const finalSnapshot = await readFile(sharedStateFile, "utf8");
    assert(finalSnapshot === originalSnapshot, "read-only Boards scenario must not modify shared state");

    await client.send("Page.navigate", { url: `${writeOrigin}/?module=bomLists&qa-auth-bypass=1&react-boards=1&react-boards-write=1` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-boards-island][data-react-island-state="ready"] .lab-badge')), { message: "Boards write evaluation did not mount its React content", timeoutMs: 15_000 });
    const writeInitial = await evaluate(client, () => ({
      badge: document.querySelector(".lab-badge")?.textContent?.trim() || "",
      boards: document.querySelectorAll('[data-ui-component="SidebarItem"]').length - 1,
      newDisabled: [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent.includes("Новая плата"))?.disabled,
      importDisabled: [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent.includes("Импортировать"))?.disabled,
      addForm: document.querySelectorAll('[data-react-bom-nomenclature-add="board-control"]').length,
      addOptionValues: [...document.querySelectorAll('[data-react-bom-nomenclature-add="board-control"] option')].map((option) => option.value).filter(Boolean),
    }));
    assert(writeInitial.badge.includes("create/edit") && writeInitial.boards === 2 && writeInitial.newDisabled === false && writeInitial.importDisabled === true && writeInitial.addForm === 1, `Boards write capability boundary failed: ${JSON.stringify(writeInitial)}`);
    assert(writeInitial.addOptionValues.includes("rea-add") && !writeInitial.addOptionValues.includes("pcb-001"), `Boards add options must expose owner-eligible REA only: ${JSON.stringify(writeInitial.addOptionValues)}`);
    await delay(250);
    const planningBeforeWrite = JSON.parse(JSON.parse(await readFile(writeSharedStateFile, "utf8")).values[STATE_STORAGE_KEY]);

    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent.includes("Плата питания"))?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-bom-nomenclature-add="board-power"]')), { message: "empty Board did not expose the bounded Nomenclature row-add form" });
    const beforeBomRowAdd = await readFile(writeSharedStateFile, "utf8");
    const emptyAddState = await evaluate(client, () => ({
      rows: document.querySelectorAll(".bom-table tbody tr").length,
      buttonDisabled: document.querySelector('[data-react-bom-nomenclature-add="board-power"] button')?.disabled,
    }));
    assert(emptyAddState.rows === 0 && emptyAddState.buttonDisabled === true, `empty row-add selection must fail closed: ${JSON.stringify(emptyAddState)}`);
    assert(await readFile(writeSharedStateFile, "utf8") === beforeBomRowAdd, "empty BOM row-add selection mutated the disposable state");
    await evaluate(client, () => {
      const form = document.querySelector('[data-react-bom-nomenclature-add="board-power"]');
      const select = form?.querySelector("select");
      if (!form || !select) throw new Error("Missing React BOM Nomenclature row-add controls");
      select.value = "rea-add";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await delay(80);
    await evaluate(client, () => document.querySelector('[data-react-bom-nomenclature-add="board-power"]')?.requestSubmit());
    await waitForCondition(client, () => document.querySelectorAll(".bom-table tbody tr").length === 1 && !document.querySelector('[role="alert"]'), { message: "BOM Nomenclature row owner result did not return to React", timeoutMs: 10_000 });
    let afterBomRowAdd = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const persistedSnapshot = JSON.parse(await readFile(writeSharedStateFile, "utf8"));
      afterBomRowAdd = JSON.parse(persistedSnapshot.values[DIRECTORY_STORAGE_KEY]);
      if (afterBomRowAdd.bomLists.find((board) => board.id === "board-power")?.importRows?.length === 1) break;
      await delay(120);
    }
    const addedRowBoard = afterBomRowAdd.bomLists.find((board) => board.id === "board-power");
    assert(JSON.stringify(addedRowBoard.importRows[0].values) === JSON.stringify([1, "Конденсатор 1 мкФ", "", "CAP0603-1U", "Murata", "0603", 1, "Добавлено из номенклатуры", ""]), `owner-created BOM row mismatch: ${JSON.stringify(addedRowBoard.importRows[0])}`);
    assert(addedRowBoard.importRows[0].nomenclatureId === "rea-add" && addedRowBoard.c0603 === 1, "BOM row add lost Nomenclature identity or component totals");
    assert(afterBomRowAdd.nomenclature.some((item) => item.id === "rea-add" && item.hiddenMarker === "preserve-added-nomenclature" && item.sourceBomIds?.includes("board-power")), "BOM row add did not preserve and synchronize the existing Nomenclature item");
    assert(JSON.stringify(JSON.parse(JSON.parse(await readFile(writeSharedStateFile, "utf8")).values[STATE_STORAGE_KEY])) === JSON.stringify(planningBeforeWrite), "BOM row add changed Planning state");
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent.includes("Плата управления"))?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-bom-quantity-form="board-control:0"]')), { message: "Boards row-add QA did not restore the control board" });

    const beforeInvalidBomQuantity = await readFile(writeSharedStateFile, "utf8");
    await evaluate(client, () => {
      const form = document.querySelector('[data-react-bom-quantity-form="board-control:0"]');
      const input = form?.elements.namedItem("quantity");
      if (!input) throw new Error("Missing React BOM quantity field");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "-1");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      form.noValidate = true;
      form.requestSubmit();
    });
    await waitForCondition(client, () => document.querySelector('[role="alert"]')?.textContent?.includes("неотрицательным"), { message: "invalid BOM quantity was not rejected" });
    await delay(180);
    assert(await readFile(writeSharedStateFile, "utf8") === beforeInvalidBomQuantity, "invalid BOM quantity mutated the disposable state");

    await evaluate(client, () => {
      const form = document.querySelector('[data-react-bom-quantity-form="board-control:0"]');
      const input = form?.elements.namedItem("quantity");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "12");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      form.requestSubmit();
    });
    await waitForCondition(client, () => document.querySelector('[data-react-bom-quantity-form="board-control:0"] input[name="quantity"]')?.value === "12" && !document.querySelector('[role="alert"]'), { message: "BOM quantity owner result did not return to React", timeoutMs: 10_000 });
    let afterBomQuantity = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const persistedSnapshot = JSON.parse(await readFile(writeSharedStateFile, "utf8"));
      afterBomQuantity = JSON.parse(persistedSnapshot.values[DIRECTORY_STORAGE_KEY]);
      if (afterBomQuantity.bomLists.find((board) => board.id === "board-control")?.importRows?.[0]?.quantity === 12) break;
      await delay(120);
    }
    const quantityBoard = afterBomQuantity.bomLists.find((board) => board.id === "board-control");
    assert(quantityBoard.importRows[0].quantity === 12 && quantityBoard.importRows[0].description === "Резистор 10 кОм" && quantityBoard.importRows[0].manufacturerPart === "RC0603-10K", "BOM quantity edit changed row identity fields");
    assert(quantityBoard.importRows.slice(1).length === 3 && quantityBoard.customMetadata === "preserve-me", "BOM quantity edit changed unrelated rows or hidden board metadata");
    const planningAfterBomQuantity = JSON.parse(JSON.parse(await readFile(writeSharedStateFile, "utf8")).values[STATE_STORAGE_KEY]);
    assert(JSON.stringify(planningAfterBomQuantity) === JSON.stringify(planningBeforeWrite), "BOM quantity edit changed Planning state");

    const bomCellEdits = [
      { columnIndex: 0, value: "10", expected: "10" },
      { columnIndex: 1, value: "Резистор 12 кОм React", expected: "Резистор 12 кОм React" },
      { columnIndex: 2, value: "R1-R12", expected: "R1-R12" },
      { columnIndex: 3, value: "RC0603-12K", expected: "RC0603-12K" },
      { columnIndex: 4, value: "Yageo React", expected: "Yageo React" },
      { columnIndex: 5, value: "805", expected: "0805" },
      { columnIndex: 7, value: "0.5% React", expected: "0.5% React" },
      { columnIndex: 8, value: "QA-extra", expected: "QA-extra" },
    ];
    for (const edit of bomCellEdits) {
      await evaluate(client, ({ columnIndex, value }) => {
        const input = document.querySelector(`[data-react-bom-cell="board-control:0:${columnIndex}"]`);
        if (!input) throw new Error(`Missing React BOM cell ${columnIndex}`);
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, edit);
      await delay(80);
      await evaluate(client, ({ columnIndex }) => {
        const input = document.querySelector(`[data-react-bom-cell="board-control:0:${columnIndex}"]`);
        if (!input) throw new Error(`Missing React BOM cell ${columnIndex} before commit`);
        input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      }, edit);
      let persistedCell = "";
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const persistedSnapshot = JSON.parse(await readFile(writeSharedStateFile, "utf8"));
        const persistedDirectory = JSON.parse(persistedSnapshot.values[DIRECTORY_STORAGE_KEY]);
        persistedCell = String(persistedDirectory.bomLists.find((board) => board.id === "board-control")?.importRows?.[0]?.values?.[edit.columnIndex] ?? "");
        if (persistedCell === edit.expected) break;
        await delay(120);
      }
      assert(persistedCell === edit.expected, `BOM field ${edit.columnIndex} did not persist through the owner: ${persistedCell}`);
      await waitForCondition(client, ({ columnIndex, expected }) => document.querySelector(`[data-react-bom-cell="board-control:0:${columnIndex}"]`)?.value === expected && !document.querySelector('[role="alert"]'), { arg: edit, message: `BOM field ${edit.columnIndex} owner result did not return to React` });
    }
    const afterBomCellSnapshot = JSON.parse(await readFile(writeSharedStateFile, "utf8"));
    const afterBomCells = JSON.parse(afterBomCellSnapshot.values[DIRECTORY_STORAGE_KEY]);
    const cellEditedBoard = afterBomCells.bomLists.find((board) => board.id === "board-control");
    assert(JSON.stringify(cellEditedBoard.importRows[0].values) === JSON.stringify(["10", "Резистор 12 кОм React", "R1-R12", "RC0603-12K", "Yageo React", "0805", 12, "0.5% React", "QA-extra"]), `all eight BOM field values were not owner-normalized: ${JSON.stringify(cellEditedBoard.importRows[0].values)}`);
    assert(JSON.stringify(cellEditedBoard.importRows.slice(1)) === JSON.stringify(quantityBoard.importRows.slice(1)) && cellEditedBoard.customMetadata === "preserve-me", "BOM field edits changed unrelated rows or hidden board metadata");
    assert(afterBomCells.nomenclature.some((item) => item.id === "rea-001" && item.hiddenMarker === "preserve-existing-nomenclature") && afterBomCells.nomenclature.some((item) => item.article === "RC0603-12K"), "BOM identity-field owner side effects did not preserve existing and create the newly keyed Nomenclature projection");
    const planningAfterBomCells = JSON.parse(afterBomCellSnapshot.values[STATE_STORAGE_KEY]);
    assert(JSON.stringify(planningAfterBomCells) === JSON.stringify(planningBeforeWrite), "BOM field edits changed Planning state");

    await evaluate(client, () => document.querySelector('[data-react-bom-row-delete="board-control:3"]')?.click());
    await waitForCondition(client, () => document.querySelector('[role="alertdialog"] h3')?.textContent?.trim() === "Удалить строку BOM?", { message: "BOM row delete confirmation did not open" });
    const rowDeleteConfirmation = await evaluate(client, () => document.querySelector('[role="alertdialog"]')?.textContent?.replace(/\s+/g, " ").trim() || "");
    assert(rowDeleteConfirmation.includes("Строка 4") && rowDeleteConfirmation.includes("Разъем питания") && rowDeleteConfirmation.includes("номенклатура останется"), `BOM row delete confirmation mismatch: ${rowDeleteConfirmation}`);
    const beforeRowDeleteCancel = await readFile(writeSharedStateFile, "utf8");
    await evaluate(client, () => [...document.querySelectorAll('[role="alertdialog"] [data-ui-component="ActionButton"]')].find((button) => button.textContent.trim() === "Не удалять")?.click());
    await waitForCondition(client, () => !document.querySelector('[role="alertdialog"]'), { message: "BOM row delete cancel did not close confirmation" });
    await delay(180);
    assert(await readFile(writeSharedStateFile, "utf8") === beforeRowDeleteCancel, "BOM row delete cancel mutated the disposable state");

    await evaluate(client, () => document.querySelector('[data-react-bom-row-delete="board-control:3"]')?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('[role="alertdialog"]')), { message: "BOM row delete confirmation did not reopen" });
    await evaluate(client, () => [...document.querySelectorAll('[role="alertdialog"] [data-ui-component="ActionButton"]')].find((button) => button.textContent.trim() === "Удалить")?.click());
    await waitForCondition(client, () => document.querySelectorAll(".bom-table tbody tr").length === 3 && !document.querySelector('[role="alertdialog"]'), { message: "BOM row owner result did not return to React", timeoutMs: 10_000 });
    let afterBomRowDelete = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const persistedSnapshot = JSON.parse(await readFile(writeSharedStateFile, "utf8"));
      afterBomRowDelete = JSON.parse(persistedSnapshot.values[DIRECTORY_STORAGE_KEY]);
      if (afterBomRowDelete.bomLists.find((board) => board.id === "board-control")?.importRows?.length === 3) break;
      await delay(120);
    }
    const rowDeletedBoard = afterBomRowDelete.bomLists.find((board) => board.id === "board-control");
    assert(rowDeletedBoard.importRows.length === 3 && !rowDeletedBoard.importRows.some((row) => row.manufacturerPart === "HDR-2"), "BOM row delete did not remove exactly the confirmed row");
    assert(rowDeletedBoard.importRows[0].quantity === 12 && rowDeletedBoard.importRows[0].manufacturerPart === "RC0603-12K" && rowDeletedBoard.customMetadata === "preserve-me", "BOM row delete changed the retained rows or hidden board metadata");
    assert(afterBomRowDelete.nomenclature.some((item) => item.id === "rea-xp" && item.article === "HDR-2" && item.hiddenMarker === "preserve-row-nomenclature"), "BOM row delete silently removed independently addressable Nomenclature");
    const planningAfterBomRowDelete = JSON.parse(JSON.parse(await readFile(writeSharedStateFile, "utf8")).values[STATE_STORAGE_KEY]);
    assert(JSON.stringify(planningAfterBomRowDelete) === JSON.stringify(planningBeforeWrite), "BOM row delete changed Planning state");

    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent.includes("Новая плата"))?.click());
    await waitForCondition(client, () => Boolean(document.querySelector(".react-nomenclature-editor")), { message: "Boards create editor did not open" });
    await evaluate(client, () => {
      const form = document.querySelector(".react-nomenclature-editor");
      const setValue = (name, value) => {
        const control = form?.elements.namedItem(name);
        if (!control) throw new Error(`Missing Boards editor field: ${name}`);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(control, value);
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
      };
      setValue("name", "Плата маркировки QA");
      setValue("boardCode", "QA.469659.003");
      setValue("resultItem", "Смонтированная плата маркировки QA");
      form.requestSubmit();
    });
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].some((item) => item.textContent.includes("Плата маркировки QA")), { message: "Boards create did not return the new board projection" });

    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent.includes("Плата управления"))?.click());
    await waitForCondition(client, () => document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent === "Плата управления", { message: "existing Board did not become selectable for edit" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent.includes("Редактировать плату"))?.click());
    await waitForCondition(client, () => document.querySelector('.react-nomenclature-editor input[name="name"]')?.value === "Плата управления", { message: "Boards edit form did not open" });
    await evaluate(client, () => {
      const form = document.querySelector(".react-nomenclature-editor");
      const setValue = (name, value) => {
        const control = form?.elements.namedItem(name);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(control, value);
        control.dispatchEvent(new Event("input", { bubbles: true }));
      };
      setValue("name", "Плата управления React");
      setValue("boardCode", "АБВГ.469659.001-R");
      setValue("resultItem", "Смонтированная плата управления React");
      form.requestSubmit();
    });
    await waitForCondition(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].some((item) => item.textContent.includes("Плата управления React")), { message: "Boards edit did not return the updated projection" });

    let persistedDirectory = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const persistedSnapshot = JSON.parse(await readFile(writeSharedStateFile, "utf8"));
      persistedDirectory = JSON.parse(persistedSnapshot.values[DIRECTORY_STORAGE_KEY]);
      if (persistedDirectory.bomLists.some((board) => board.name === "Плата управления React")) break;
      await delay(120);
    }
    const createdBoard = persistedDirectory.bomLists.find((board) => board.name === "Плата маркировки QA");
    const editedBoard = persistedDirectory.bomLists.find((board) => board.id === "board-control");
    assert(createdBoard?.boardCode === "QA.469659.003" && createdBoard.importRows.length === 0 && createdBoard.status === "Черновик", `created Board contract mismatch: ${JSON.stringify(createdBoard)}`);
    assert(editedBoard?.boardCode === "АБВГ.469659.001-R" && editedBoard.resultItem === "Смонтированная плата управления React", "edited Board fields were not persisted");
    assert(editedBoard.projectId === "spec-board-control" && editedBoard.customMetadata === "preserve-me" && editedBoard.sourceFileName === "АБВГ.469659.001 Клюшка.xlsx" && editedBoard.importRows.length === 3, "Board edit changed hidden metadata or BOM/import rows");
    assert(persistedDirectory.specifications.some((specification) => specification.id === "spec-board-control" && specification.bomListA === "board-control" && specification.structureItems.some((item) => item.bomListId === "board-control")), `Board edit changed Specifications references: ${JSON.stringify(persistedDirectory.specifications)}`);
    assert(persistedDirectory.nomenclature.some((item) => item.id === "pcb-001" && item.sourceBomResultId === "board-control" && item.article === "АБВГ.469659.001-R" && item.name === "Смонтированная плата управления React"), "Board result did not synchronize to existing Nomenclature result");
    assert(persistedDirectory.nomenclature.some((item) => item.sourceBomResultId === createdBoard.id && item.article === "QA.469659.003"), "created Board result did not synchronize to Nomenclature");
    const planningAfterWrite = JSON.parse(JSON.parse(await readFile(writeSharedStateFile, "utf8")).values[STATE_STORAGE_KEY]);
    const planningProjection = (state) => ({ routes: state.routes || [], routeSteps: state.routeSteps || [], slots: state.slots || [] });
    assert(JSON.stringify(planningProjection(planningAfterWrite)) === JSON.stringify(planningProjection(planningBeforeWrite)), "Board metadata create/edit changed Planning routes/steps/slots");

    await client.send("Page.navigate", { url: `${writeOrigin}/?module=bomLists&qa-auth-bypass=1` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-bom-open="board-control"]')), { message: "legacy Boards did not return for BOM quantity read-back" });
    await evaluate(client, () => document.querySelector('[data-bom-open="board-control"]')?.click());
    await waitForCondition(client, () => document.querySelector('[data-bom-import-cell="board-control"][data-bom-row-index="0"][data-bom-column-index="6"]')?.value === "12" && document.querySelectorAll(".bom-import-table tbody tr").length === 3, { message: "legacy Boards did not read back React BOM quantity and row delete" });
    const legacyEditedBomValues = await evaluate(client, () => {
      const row = document.querySelector(".bom-import-table tbody tr");
      return row ? [...row.querySelectorAll("[data-bom-import-cell]")].map((input) => input.value) : [];
    });
    assert(JSON.stringify(legacyEditedBomValues) === JSON.stringify(["10", "Резистор 12 кОм React", "R1-R12", "RC0603-12K", "Yageo React", "0805", "12", "0.5% React", "QA-extra"]), `legacy Boards did not read all eight React field edits: ${JSON.stringify(legacyEditedBomValues)}`);
    assert(!await evaluate(client, () => [...document.querySelectorAll('[data-bom-column-index="3"]')].some((input) => input.value === "HDR-2")), "legacy Boards still exposed the deleted BOM row");
    await evaluate(client, () => document.querySelector('[data-bom-open="board-power"]')?.click());
    await waitForCondition(client, () => document.querySelector('[data-bom-import-cell="board-power"][data-bom-row-index="0"][data-bom-column-index="3"]')?.value === "CAP0603-1U", { message: "legacy Boards did not read back the Nomenclature-added BOM row" });
    const legacyAddedBomValues = await evaluate(client, () => [...document.querySelectorAll('.bom-import-table tbody tr:first-child [data-bom-import-cell]')].map((input) => input.value));
    assert(JSON.stringify(legacyAddedBomValues) === JSON.stringify(["1", "Конденсатор 1 мкФ", "", "CAP0603-1U", "Murata", "0603", "1", "Добавлено из номенклатуры", ""]), `legacy Boards row-add read-back mismatch: ${JSON.stringify(legacyAddedBomValues)}`);
    await client.send("Page.navigate", { url: `${writeOrigin}/?module=bomLists&qa-auth-bypass=1&react-boards=1&react-boards-write=1` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-boards-island][data-react-island-state="ready"] .lab-badge')), { message: "Boards write evaluation did not remount its React content after legacy read-back", timeoutMs: 15_000 });

    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="SidebarItem"]')].find((item) => item.textContent.includes("Плата управления React"))?.click());
    await waitForCondition(client, () => document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent === "Плата управления React", { message: "control Board did not become selected after row-add legacy read-back" });

    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent.includes("Редактировать плату"))?.click());
    await waitForCondition(client, () => document.querySelector('.react-nomenclature-editor input[name="name"]')?.value === "Плата управления React", { message: "Board editor did not reopen for delete" });
    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent.trim() === "Удалить")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('[role="alertdialog"]')), { message: "Board delete confirmation did not open" });
    const deleteConfirmation = await evaluate(client, () => ({
      title: document.querySelector('[role="alertdialog"] h3')?.textContent?.trim() || "",
      text: document.querySelector('[role="alertdialog"]')?.textContent?.replace(/\s+/g, " ").trim() || "",
    }));
    assert(deleteConfirmation.title === "Удалить плату и её BOM?", `Board delete title mismatch: ${JSON.stringify(deleteConfirmation)}`);
    assert(deleteConfirmation.text.includes("Связано с составами: 1") && deleteConfirmation.text.includes("Строк BOM: 3"), `Board delete usage must disclose linked Specifications and imported rows: ${JSON.stringify(deleteConfirmation)}`);
    const beforeDeleteCancel = await readFile(writeSharedStateFile, "utf8");
    await evaluate(client, () => [...document.querySelectorAll('[role="alertdialog"] [data-ui-component="ActionButton"]')].find((button) => button.textContent.trim() === "Не удалять")?.click());
    await waitForCondition(client, () => !document.querySelector('[role="alertdialog"]') && Boolean(document.querySelector('.react-nomenclature-editor')), { message: "Board delete cancel did not return to the editor" });
    await delay(200);
    assert(await readFile(writeSharedStateFile, "utf8") === beforeDeleteCancel, "Board delete cancel mutated the disposable state");

    await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent.trim() === "Удалить")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('[role="alertdialog"]')), { message: "Board delete confirmation did not reopen" });
    await evaluate(client, () => [...document.querySelectorAll('[role="alertdialog"] [data-ui-component="ActionButton"]')].find((button) => button.textContent.trim() === "Удалить")?.click());
    await waitForCondition(client, () => ![...document.querySelectorAll('[data-ui-component="SidebarItem"]')].some((item) => item.textContent.includes("Плата управления React")), { message: "Board delete did not remove the selected board projection", timeoutMs: 10_000 });

    let persistedAfterDelete = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const persistedSnapshot = JSON.parse(await readFile(writeSharedStateFile, "utf8"));
      persistedAfterDelete = JSON.parse(persistedSnapshot.values[DIRECTORY_STORAGE_KEY]);
      if (!persistedAfterDelete.bomLists.some((board) => board.id === "board-control")) break;
      await delay(120);
    }
    assert(!persistedAfterDelete.bomLists.some((board) => board.id === "board-control"), "Board delete did not persist the BOM removal");
    assert(persistedAfterDelete.bomLists.some((board) => board.id === createdBoard.id) && persistedAfterDelete.bomLists.some((board) => board.id === "board-power"), "Board delete changed unrelated boards");
    assert(persistedAfterDelete.bomLists.find((board) => board.id === "board-power")?.importRows?.[0]?.nomenclatureId === "rea-add", "Board delete changed the independently added BOM row");
    const specificationAfterDelete = persistedAfterDelete.specifications.find((specification) => specification.id === "spec-board-control");
    assert(specificationAfterDelete?.bomListA === "" && Number(specificationAfterDelete?.bomQtyA || 0) === 0, `Board delete did not clear direct Specifications references: ${JSON.stringify(specificationAfterDelete)}`);
    assert(specificationAfterDelete?.structureItems.every((item) => item.bomListId !== "board-control"), `Board delete did not clear structure references: ${JSON.stringify(specificationAfterDelete)}`);
    assert(persistedAfterDelete.nomenclature.some((item) => item.id === "pcb-001" && item.sourceBomResultId === "board-control"), "Board delete must not silently delete the independently addressable Nomenclature result");
    const planningAfterDelete = JSON.parse(JSON.parse(await readFile(writeSharedStateFile, "utf8")).values[STATE_STORAGE_KEY]);
    assert(JSON.stringify(planningProjection(planningAfterDelete)) === JSON.stringify(planningProjection(planningAfterWrite)), "Board delete changed Planning routes/steps/slots");

    await client.send("Page.navigate", { url: `${writeOrigin}/?module=bomLists&qa-auth-bypass=1` });
    await waitForCondition(client, () => document.querySelectorAll("[data-bom-open]").length === 2, { message: "legacy Boards did not read back two remaining boards after delete" });
    assert(!await evaluate(client, () => Boolean(document.querySelector('[data-bom-open="board-control"]'))), "legacy Boards still exposed the deleted board");
    assert(consoleProblems.length === 0, `browser console must stay clean after Boards write:\n${consoleProblems.join("\n")}`);
    console.log("Boards React production-shell functional QA: OK");
    console.log("- same payload: 9 legacy headers/4 rows = 9 React headers/4 rows");
    console.log("- server-enabled default without session request: legacy");
    console.log("- board selection, empty state and 16-component summary: pass");
    console.log(`- first React commit: ${initial.commitMs.toFixed(2)} ms (< 2000 ms local gate)`);
    console.log("- disabled writes and unchanged state file: pass");
    console.log(`- return to legacy Nomenclature with ${returned.legacyRows} normalized rows: pass`);
    console.log("- local RBAC-gated Nomenclature row add, all nine BOM cell edits, ID/table-bound row delete and board create/edit/delete, owner normalization, invalid rejection, legacy read-back, cancel safety, hidden-row/board preservation, reference cleanup, Nomenclature retention and unchanged Planning: pass");
  } catch (error) {
    if (chrome) {
      const browserState = await evaluate(chrome.client, () => ({
        url: location.href,
        reactTargets: document.querySelectorAll("[data-react-boards-island]").length,
        legacyBoards: document.querySelectorAll("[data-bom-open]").length,
        legacyRows: document.querySelectorAll(".bom-import-table tbody tr").length,
        reactRows: document.querySelectorAll(".bom-table tbody tr").length,
        commandError: document.querySelector(".react-nomenclature-command-error")?.textContent?.trim() || "",
        editorValues: Object.fromEntries([...document.querySelectorAll(".react-nomenclature-editor input")].map((input) => [input.name, input.value])),
        storedBoards: JSON.parse(localStorage.getItem("mes-planning-prototype-directories-v2") || "{}").bomLists?.map((board) => board.name) || [],
        visibleText: document.querySelector("main")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 800) || "",
      })).catch(() => null);
      if (browserState) console.error(`BROWSER_STATE ${JSON.stringify(browserState)}`);
    }
    if (previewOutput.trim()) console.error(previewOutput.trim());
    if (legacyPreviewOutput.trim()) console.error(legacyPreviewOutput.trim());
    if (writePreviewOutput.trim()) console.error(writePreviewOutput.trim());
    if (consoleProblems.length) console.error(`CONSOLE_PROBLEMS ${JSON.stringify(consoleProblems)}`);
    throw error;
  } finally {
    if (chrome) await cleanupChrome(chrome);
    await Promise.all([stopProcess(preview), stopProcess(legacyPreview), stopProcess(writePreview)]);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
