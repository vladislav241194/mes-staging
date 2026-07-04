import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const defaultUrl = new URL("/?module=shiftMasterBoard&qa-auth-bypass=1&qa=shift-master-board-functional", process.env.MES_QA_URL || "http://localhost:4174/").toString();

function getArg(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pathExists(path) {
  try {
    await import("node:fs/promises").then((fs) => fs.stat(path));
    return true;
  } catch {
    return false;
  }
}

async function findChrome() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new Error("Chrome/Chromium executable was not found in /Applications.");
}

async function getFreePort() {
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForJson(url, options = {}, timeoutMs = 10000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return await response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await delay(120);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.onMessage(event));
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    if (!message.id || !this.pending.has(message.id)) return;
    const { resolve, reject } = this.pending.get(message.id);
    this.pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
    else resolve(message.result || {});
  }

  async send(method, params = {}, timeoutMs = 15000) {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, pageFunction, arg) {
  const source = typeof pageFunction === "function" ? pageFunction.toString() : pageFunction;
  const expression = arg === undefined ? `(${source})()` : `(${source})(${JSON.stringify(arg)})`;
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, 60000);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertSourceIsolation() {
  const source = await readFile("src/app.js", "utf8");
  const start = source.indexOf("function readShiftMasterBoardAssignmentPanel");
  const end = source.indexOf("function bindAuthPrototypeEvents", start);
  assert(start !== -1 && end !== -1 && end > start, "Shift board event chunk was not found in src/app.js.");
  const chunk = source.slice(start, end);
  const forbidden = [
    "planningState.slots =",
    "planningState.routes =",
    "planningState.routeSteps =",
    "dispatchFacts",
    "savePlanningState",
    "persistPlanningState",
    "saveSharedState",
    "updatePlanningSlot",
  ];
  const hits = forbidden.filter((pattern) => chunk.includes(pattern));
  assert(hits.length === 0, `Shift board event chunk writes outside prototype UI state: ${hits.join(", ")}`);
}

async function waitForApp(client) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12000) {
    const ok = await evaluate(client, () => document.querySelector("main.app-shell")?.dataset.layoutPage === "shiftMasterBoard");
    if (ok) return;
    await delay(120);
  }
  throw new Error("Shift Master Board app shell did not render.");
}

async function launchChrome() {
  const chromePath = await findChrome();
  const port = await getFreePort();
  const profileDir = await mkdtemp(join(tmpdir(), "mes-shift-master-board-qa-"));
  const child = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ], { stdio: "ignore" });
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const target = await waitForJson(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    return { child, client: new CdpClient(target.webSocketDebuggerUrl), profileDir };
  } catch (error) {
    child.kill("SIGTERM");
    await rm(profileDir, { recursive: true, force: true });
    throw error;
  }
}

async function cleanupChrome(chrome) {
  try {
    chrome.client.close();
  } catch {
    // Browser may already be closed.
  }
  if (chrome.child.exitCode === null && !chrome.child.killed) chrome.child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (chrome.child.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, 1200);
    chrome.child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await rm(chrome.profileDir, { recursive: true, force: true }).catch(() => {});
}

async function main() {
  await assertSourceIsolation();
  const url = getArg("--url", defaultUrl);
  const chrome = await launchChrome();
  try {
    const { client } = chrome;
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1710,
      height: 910,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send("Page.navigate", { url });
    await waitForApp(client);

    const bridgeTarget = await evaluate(client, async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const clickIfExists = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        element.click();
        return true;
      };
      clickIfExists("[data-shift-board-reset]");
      await wait(80);
      clickIfExists("[data-shift-board-focus=\"all\"]");
      await wait(80);

      const initialCards = [...document.querySelectorAll("[data-shift-board-card]")];
      for (const card of initialCards) {
        card.click();
        await wait(70);
        const panel = document.querySelector("[data-shift-board-assignment-panel]");
        const quantityInput = [...(panel?.querySelectorAll("[data-shift-board-available-quantity]") || [])][0] || null;
        const availableBefore = Number(panel?.getAttribute("data-shift-board-assignment-available-count") || 0);
        const cardId = card.getAttribute("data-shift-board-card") || "";
        const otherCardId = initialCards
          .map((candidate) => candidate.getAttribute("data-shift-board-card") || "")
          .find((candidateId) => candidateId && candidateId !== cardId) || "";
        const dateKey = cardId.includes("::") ? cardId.split("::").pop() : "";
        if (quantityInput?.dataset.shiftBoardAvailableEmployee && availableBefore > 0 && dateKey) {
          return {
            cardId,
            otherCardId,
            employeeId: quantityInput.dataset.shiftBoardAvailableEmployee,
            dateKey,
            availableBefore,
            optionCountBefore: panel?.querySelectorAll("[data-shift-board-available-quantity]").length || 0,
          };
        }
      }
      return null;
    });
    assert(bridgeTarget?.employeeId, "Could not find a shift board card with a timesheet-controlled available employee.");

    await evaluate(client, (target) => {
      const key = "mes-planning-prototype-ui-v1";
      sessionStorage.setItem("mes-planning-prototype-shared-disabled-until-v1", String(Date.now() + 5 * 60 * 1000));
      const current = JSON.parse(localStorage.getItem(key) || "{}");
      const assignments = current.shiftMasterBoardAssignments && typeof current.shiftMasterBoardAssignments === "object"
        ? current.shiftMasterBoardAssignments
        : {};
      const lanes = current.shiftMasterBoardLaneBySlot && typeof current.shiftMasterBoardLaneBySlot === "object"
        ? current.shiftMasterBoardLaneBySlot
        : {};
      localStorage.setItem(key, JSON.stringify({
        ...current,
        shiftMasterBoardSelectedSlotId: target.cardId,
        shiftMasterBoardAssignments: {
          ...assignments,
          [target.otherCardId || "qa-cross-load-hidden-row"]: {
            ...(assignments[target.otherCardId || "qa-cross-load-hidden-row"] || {}),
            masterId: "qa-cross-load-master",
            assignedQuantity: 120,
            plannedQuantity: 120,
            laborMinutesPerUnit: 1,
            unit: "шт.",
            status: "draft",
            executors: [
              {
                id: `qa-cross-load-${target.employeeId}`,
                employeeId: target.employeeId,
                quantity: 120,
                note: "QA cross-task load",
              },
            ],
            updatedAt: new Date().toISOString(),
          },
        },
        shiftMasterBoardLaneBySlot: {
          ...lanes,
          [target.otherCardId || "qa-cross-load-hidden-row"]: "assigned",
        },
      }));
    }, bridgeTarget);
    const crossLoadUrl = new URL(url);
    crossLoadUrl.searchParams.set("qa", "shift-master-board-cross-load");
    const crossLoadStoredRowId = bridgeTarget.otherCardId || "qa-cross-load-hidden-row";
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        (() => {
          if (location.origin !== ${JSON.stringify(crossLoadUrl.origin)}) return;
          if (new URL(location.href).searchParams.get("qa") !== "shift-master-board-cross-load") return;
          const key = "mes-planning-prototype-ui-v1";
          const target = ${JSON.stringify({ ...bridgeTarget, otherCardId: crossLoadStoredRowId })};
          sessionStorage.setItem("mes-planning-prototype-shared-disabled-until-v1", String(Date.now() + 5 * 60 * 1000));
          const current = JSON.parse(localStorage.getItem(key) || "{}");
          const assignments = current.shiftMasterBoardAssignments && typeof current.shiftMasterBoardAssignments === "object"
            ? current.shiftMasterBoardAssignments
            : {};
          const lanes = current.shiftMasterBoardLaneBySlot && typeof current.shiftMasterBoardLaneBySlot === "object"
            ? current.shiftMasterBoardLaneBySlot
            : {};
          localStorage.setItem(key, JSON.stringify({
            ...current,
            shiftMasterBoardSelectedSlotId: target.cardId,
            shiftMasterBoardAssignments: {
              ...assignments,
              [target.otherCardId]: {
                ...(assignments[target.otherCardId] || {}),
                masterId: "qa-cross-load-master",
                assignedQuantity: 120,
                plannedQuantity: 120,
                laborMinutesPerUnit: 1,
                unit: "шт.",
                status: "draft",
                executors: [
                  {
                    id: \`qa-cross-load-\${target.employeeId}\`,
                    employeeId: target.employeeId,
                    quantity: 120,
                    note: "QA cross-task load",
                  },
                ],
                updatedAt: new Date().toISOString(),
              },
            },
            shiftMasterBoardLaneBySlot: {
              ...lanes,
              [target.otherCardId]: "assigned",
            },
          }));
        })();
      `,
    });
    await client.send("Page.navigate", { url: crossLoadUrl.toString() });
    await waitForApp(client);
    const crossLoadResult = await evaluate(client, async (target) => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const clickIfExists = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        element.click();
        return true;
      };
      clickIfExists("[data-shift-board-focus=\"all\"]");
      await wait(80);
      const card = [...document.querySelectorAll("[data-shift-board-card]")]
        .find((element) => element.getAttribute("data-shift-board-card") === target.cardId);
      card?.click();
      await wait(100);
      const input = [...document.querySelectorAll("[data-shift-board-available-quantity]")]
        .find((candidate) => candidate.dataset.shiftBoardAvailableEmployee === target.employeeId);
      const personCard = input?.closest("[data-shift-board-available-person]");
      const storedUi = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
      return {
        cardFound: Boolean(card),
        employeeFound: Boolean(input),
        text: personCard?.innerText.trim().replace(/\s+/g, " ") || "",
        baseLoad: personCard?.style.getPropertyValue("--employee-base-load") || "",
        reserveLoad: personCard?.style.getPropertyValue("--employee-reserve-load") || "",
        storedAssignment: storedUi.shiftMasterBoardAssignments?.[target.otherCardId || "qa-cross-load-hidden-row"] || null,
        storedAssignmentKeys: Object.keys(storedUi.shiftMasterBoardAssignments || {}).slice(0, 8),
      };
    }, bridgeTarget);
    assert(crossLoadResult.cardFound, `Cross-task load target card disappeared: ${JSON.stringify(bridgeTarget)}`);
    assert(crossLoadResult.employeeFound, `Cross-task load employee is not visible in target card: ${JSON.stringify({ target: bridgeTarget, result: crossLoadResult })}`);
    assert(crossLoadResult.text.includes("другие") && !crossLoadResult.baseLoad.startsWith("0%"), `Cross-task load is not shown before current reservation: ${JSON.stringify(crossLoadResult)}`);

    const bridgeUrl = new URL(url);
    bridgeUrl.searchParams.set("qa", "shift-master-board-timesheet-bridge");
    await evaluate(client, (target) => {
      const key = "mes-planning-prototype-ui-v1";
      sessionStorage.setItem("mes-planning-prototype-shared-disabled-until-v1", String(Date.now() + 5 * 60 * 1000));
      const current = JSON.parse(localStorage.getItem(key) || "{}");
      const overrides = current.timesheetCellOverrides && typeof current.timesheetCellOverrides === "object"
        ? current.timesheetCellOverrides
        : {};
      localStorage.setItem(key, JSON.stringify({
        ...current,
        timesheetCellOverrides: {
          ...overrides,
          [`${target.employeeId}::${target.dateKey}`]: {
            value: "sick",
            start: "08:00",
            end: "17:00",
            overtime: 0,
            comment: "QA: проверка связи Табель -> Мастерская",
          },
        },
      }));
    }, bridgeTarget);
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        (() => {
          if (location.origin !== ${JSON.stringify(bridgeUrl.origin)}) return;
          const key = "mes-planning-prototype-ui-v1";
          sessionStorage.setItem("mes-planning-prototype-shared-disabled-until-v1", String(Date.now() + 5 * 60 * 1000));
          const current = JSON.parse(localStorage.getItem(key) || "{}");
          const overrides = current.timesheetCellOverrides && typeof current.timesheetCellOverrides === "object"
            ? current.timesheetCellOverrides
            : {};
          localStorage.setItem(key, JSON.stringify({
            ...current,
            timesheetCellOverrides: {
              ...overrides,
              [${JSON.stringify(`${bridgeTarget.employeeId}::${bridgeTarget.dateKey}`)}]: {
                value: "sick",
                start: "08:00",
                end: "17:00",
                overtime: 0,
                comment: "QA: проверка связи Табель -> Мастерская",
              },
            },
          }));
        })();
      `,
    });
    await client.send("Page.navigate", { url: bridgeUrl.toString() });
    await waitForApp(client);

    const bridgeResult = await evaluate(client, async (target) => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const clickIfExists = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        element.click();
        return true;
      };
      clickIfExists("[data-shift-board-focus=\"all\"]");
      await wait(80);
      const card = [...document.querySelectorAll("[data-shift-board-card]")]
        .find((element) => element.getAttribute("data-shift-board-card") === target.cardId);
      card?.click();
      await wait(100);
      const panel = document.querySelector("[data-shift-board-assignment-panel]");
      const targetInput = [...(panel?.querySelectorAll("[data-shift-board-available-quantity]") || [])]
        .find((input) => input.dataset.shiftBoardAvailableEmployee === target.employeeId)
        || null;
      const storedUi = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
      const storedOverride = storedUi.timesheetCellOverrides?.[`${target.employeeId}::${target.dateKey}`] || null;
      return {
        cardFound: Boolean(card),
        availableAfter: Number(panel?.getAttribute("data-shift-board-assignment-available-count") || 0),
        optionCountAfter: panel?.querySelectorAll("[data-shift-board-available-quantity]").length || 0,
        targetEmployeeVisible: Boolean(targetInput),
        targetEmployeeDisabled: false,
        targetEmployeeText: targetInput?.dataset.shiftBoardAvailableName || "",
        storedOverride,
        storedOverrideKeys: Object.keys(storedUi.timesheetCellOverrides || {}).slice(0, 8),
      };
    }, bridgeTarget);
    assert(bridgeResult.cardFound, `Timesheet bridge card disappeared after reload: ${bridgeTarget.cardId}`);
    assert(
      bridgeResult.availableAfter <= Math.max(0, bridgeTarget.availableBefore - 1),
      `Timesheet override did not reduce available employees: before ${bridgeTarget.availableBefore}, after ${bridgeResult.availableAfter}. Target option: ${bridgeResult.targetEmployeeText || "none"}. Stored override: ${JSON.stringify(bridgeResult.storedOverride)}. Stored keys: ${bridgeResult.storedOverrideKeys.join(", ") || "none"}`,
    );
    assert(
      !bridgeResult.targetEmployeeVisible || bridgeResult.targetEmployeeDisabled,
      `Unavailable timesheet employee is still selectable in shift board: ${bridgeResult.targetEmployeeText}`,
    );

    const result = await evaluate(client, async () => {
      const click = (selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing selector: ${selector}`);
        element.click();
      };
      const clickIfExists = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        element.click();
        return true;
      };
      const getMasterTaskCount = (button) => Number((button?.querySelector("em")?.innerText || "0").replace(/\D+/g, "")) || 0;
      const setValue = (selector, value) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing selector: ${selector}`);
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const readCoveragePlanQuantity = () => {
        const coverage = [...document.querySelectorAll(".shift-master-board-coverage article")]
          .find((element) => element.querySelector("span")?.innerText.trim() === "Покрытие плана");
        const raw = coverage?.querySelector("strong")?.innerText || "0 / 0";
        const values = raw.match(/\d[\d\s]*/g) || [];
        const plan = values.length > 1 ? values[1] : values[0] || "0";
        return Number(String(plan).replace(/\s+/g, "")) || 0;
      };
      const readRuntimeIsolation = () => {
        const keys = [
          "mes-planning-prototype-state-v2",
          "mes-planning-prototype-directories-v2",
          "mes-planning-prototype-complexity-calculator-v5",
          "mes-planning-prototype-supply-control-v1",
        ];
        return Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)]));
      };
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      click("[data-shift-board-reset]");
      await wait(80);
      const runtimeIsolationBefore = readRuntimeIsolation();
      const removedPanelSelectors = [
        ".shift-master-board-retro-panel",
        ".shift-master-board-hypothesis",
        ".shift-master-board-rhythm-panel",
        ".shift-master-board-control-panel",
        ".shift-master-board-bottom-stack",
        "[data-shift-board-gate]",
        "[data-shift-board-swimlane]",
        "[data-shift-board-focus]",
      ];
      const removedPanelsVisible = removedPanelSelectors
        .filter((selector) => Boolean(document.querySelector(selector)));
      let boardLaneStructureValid = false;
      let invalidDragTargetsBlocked = false;
      const laneIdsAtStart = [...document.querySelectorAll("[data-shift-board-lane]")]
        .map((lane) => lane.getAttribute("data-shift-board-lane") || "");
      const laneLabelsAtStart = [...document.querySelectorAll("[data-shift-board-lane] header strong")]
        .map((element) => element.innerText.trim());
      boardLaneStructureValid = laneIdsAtStart.join("|") === "intake|assigned|fact"
        && laneLabelsAtStart.join("|") === "План|В работе|Закрытие смены";
      if (typeof DataTransfer !== "undefined" && typeof DragEvent !== "undefined") {
        invalidDragTargetsBlocked = true;
        for (const targetLaneId of ["assigned", "fact"]) {
          const blockedCard = document.querySelector("[data-shift-board-card]");
          const targetLane = document.querySelector(`[data-shift-board-lane="${targetLaneId}"]`);
          if (!blockedCard || !targetLane) {
            invalidDragTargetsBlocked = false;
            break;
          }
          const countBefore = targetLane.querySelectorAll("[data-shift-board-card]").length;
          const dataTransfer = new DataTransfer();
          blockedCard.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
          targetLane.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
          targetLane.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
          await wait(120);
          const countAfter = document.querySelector(`[data-shift-board-lane="${targetLaneId}"]`)?.querySelectorAll("[data-shift-board-card]").length || 0;
          if (countAfter !== countBefore) invalidDragTargetsBlocked = false;
          click("[data-shift-board-reset]");
          await wait(80);
        }
      } else {
        boardLaneStructureValid = boardLaneStructureValid && [...document.querySelectorAll("[data-shift-board-card]")].every((card) => card.draggable);
        invalidDragTargetsBlocked = true;
      }
      const masterWithRows = [...document.querySelectorAll("[data-shift-board-master]")]
        .find((button) => getMasterTaskCount(button) > 0)
        || document.querySelector("[data-shift-board-master]");
      let masterSelectorKeepsBoardVisible = false;
      masterWithRows?.click();
      await wait(80);
      masterSelectorKeepsBoardVisible = Boolean(document.querySelector("[data-shift-board-lane]"));
      const kuzminaButton = [...document.querySelectorAll("[data-shift-board-master]")]
        .find((button) => /Кузьмина/.test(button.innerText) || /Кузьмина/.test(button.title || ""));
      let kuzminaTaskCount = -1;
      let kuzminaMatrixScopeCount = 0;
      let kuzminaAvailableCount = 0;
      let kuzminaEmployeeCardCount = 0;
      let kuzminaLoadbarText = "";
      let kuzminaFallbackTaskCount = 0;
      let kuzminaFallbackScopeCount = 0;
      let kuzminaFallbackAvailableCount = 0;
      let kuzminaFallbackEmployeeCardCount = 0;
      let kuzminaFallbackSavedQuantity = 0;
      let kuzminaFallbackLoadbarText = "";
      if (kuzminaButton) {
        kuzminaTaskCount = getMasterTaskCount(kuzminaButton);
        if (kuzminaTaskCount > 0) {
          kuzminaButton.click();
          await wait(120);
          const card = [...document.querySelectorAll("[data-shift-board-card]")][0];
          card?.click();
          await wait(80);
          const assignmentPanel = document.querySelector("[data-shift-board-assignment-panel]");
          kuzminaMatrixScopeCount = Number(assignmentPanel?.getAttribute("data-shift-board-assignment-scope-count") || 0);
          kuzminaAvailableCount = Number(assignmentPanel?.getAttribute("data-shift-board-assignment-available-count") || 0);
          kuzminaEmployeeCardCount = assignmentPanel?.querySelectorAll("[data-visual-qa-target=\"shift-master-board-available-person\"]").length || 0;
          kuzminaLoadbarText = assignmentPanel?.querySelector("[data-visual-qa-target=\"shift-master-board-available-loadbar\"]")?.innerText.trim().replace(/\s+/g, " ") || "";
          clickIfExists("[data-shift-board-focus=\"all\"]");
          await wait(80);
        }

        const dateField = document.querySelector("[data-shift-calendar-date]");
        if (dateField) {
          dateField.value = "2026-06-27";
          dateField.dispatchEvent(new Event("change", { bubbles: true }));
          await wait(180);
          const fallbackKuzminaButton = [...document.querySelectorAll("[data-shift-board-master]")]
            .find((button) => /Кузьмина/.test(button.innerText) || /Кузьмина/.test(button.title || ""));
          kuzminaFallbackTaskCount = fallbackKuzminaButton ? getMasterTaskCount(fallbackKuzminaButton) : 0;
          if (fallbackKuzminaButton && kuzminaFallbackTaskCount > 0) {
            fallbackKuzminaButton.click();
            await wait(160);
            const fallbackCard = [...document.querySelectorAll("[data-shift-board-card]")][0];
            fallbackCard?.click();
            await wait(100);
            const fallbackPanel = document.querySelector("[data-shift-board-assignment-panel]");
            const fallbackInput = fallbackPanel?.querySelector("[data-shift-board-available-quantity]");
            if (fallbackInput) {
              fallbackInput.value = "10";
              fallbackInput.dispatchEvent(new Event("input", { bubbles: true }));
              fallbackInput.dispatchEvent(new Event("change", { bubbles: true }));
              await wait(80);
            }
            const fallbackCardId = document.querySelector(".shift-master-board-card.is-active")?.getAttribute("data-shift-board-card") || "";
            const storedUi = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
            const fallbackAssignment = storedUi.shiftMasterBoardAssignments?.[fallbackCardId] || null;
            kuzminaFallbackScopeCount = Number(fallbackPanel?.getAttribute("data-shift-board-assignment-scope-count") || 0);
            kuzminaFallbackAvailableCount = Number(fallbackPanel?.getAttribute("data-shift-board-assignment-available-count") || 0);
            kuzminaFallbackEmployeeCardCount = fallbackPanel?.querySelectorAll("[data-visual-qa-target=\"shift-master-board-available-person\"]").length || 0;
            kuzminaFallbackSavedQuantity = Number((fallbackAssignment?.executors || [])[0]?.quantity || 0);
            kuzminaFallbackLoadbarText = fallbackPanel?.querySelector("[data-visual-qa-target=\"shift-master-board-available-loadbar\"]")?.innerText.trim().replace(/\s+/g, " ") || "";
            clickIfExists("[data-shift-board-focus=\"all\"]");
            await wait(80);
          }
        }
      }
      if (masterWithRows && getMasterTaskCount(masterWithRows) > 0) {
        masterWithRows.click();
        await wait(120);
        clickIfExists("[data-shift-board-focus=\"all\"]");
        await wait(80);
      }
      let firstEmployee = "";
      let selectedAvailableQuantityInput = null;
      let selectedAssignmentCardId = "";
      let otherTaskCardId = "";
      const cardsForAssignment = [...document.querySelectorAll("[data-shift-board-card]")];
      let fallbackAssignment = null;
      assignmentSearch:
      for (let index = 0; index < Math.min(80, cardsForAssignment.length); index += 1) {
        const card = cardsForAssignment[index];
        card.click();
        await wait(60);
        const panel = document.querySelector("[data-shift-board-assignment-panel]");
        const sourceCardId = card.getAttribute("data-shift-board-card") || "";
        const inputs = [...(panel?.querySelectorAll("[data-shift-board-available-quantity]") || [])];
        const firstInput = inputs[0] || null;
        if (firstInput?.dataset.shiftBoardAvailableEmployee && !fallbackAssignment) {
          fallbackAssignment = {
            cardId: sourceCardId,
            employeeId: firstInput.dataset.shiftBoardAvailableEmployee,
          };
        }
        for (const sourceInput of inputs) {
          const employeeId = sourceInput.dataset.shiftBoardAvailableEmployee || "";
          if (!employeeId) continue;
          for (const targetCard of cardsForAssignment) {
            const targetCardId = targetCard.getAttribute("data-shift-board-card") || "";
            if (!targetCardId || targetCardId === sourceCardId) continue;
            targetCard.click();
            await wait(45);
            const targetInput = [...document.querySelectorAll("[data-shift-board-available-quantity]")]
              .find((candidate) => candidate.dataset.shiftBoardAvailableEmployee === employeeId);
            if (!targetInput) continue;
            selectedAssignmentCardId = sourceCardId;
            firstEmployee = employeeId;
            otherTaskCardId = targetCardId;
            break assignmentSearch;
          }
          card.click();
          await wait(35);
        }
      }
      if (!selectedAssignmentCardId && fallbackAssignment) {
        selectedAssignmentCardId = fallbackAssignment.cardId;
        firstEmployee = fallbackAssignment.employeeId;
      }
      const selectedAssignmentCard = [...document.querySelectorAll("[data-shift-board-card]")]
        .find((card) => (card.getAttribute("data-shift-board-card") || "") === selectedAssignmentCardId);
      selectedAssignmentCard?.click();
      await wait(80);
      selectedAvailableQuantityInput = [...document.querySelectorAll("[data-shift-board-available-quantity]")]
        .find((candidate) => candidate.dataset.shiftBoardAvailableEmployee === firstEmployee)
        || [...document.querySelectorAll("[data-shift-board-available-quantity]")][0]
        || null;
      firstEmployee = selectedAvailableQuantityInput?.dataset.shiftBoardAvailableEmployee || firstEmployee;
      selectedAssignmentCardId = document.querySelector(".shift-master-board-card.is-active")?.getAttribute("data-shift-board-card") || selectedAssignmentCardId;
      if (!firstEmployee || !selectedAvailableQuantityInput) {
        throw new Error("No assignable shift board card with quantity-based available employee input was found.");
      }
      const selectedPlanBeforeAssignment = Math.max(1, readCoveragePlanQuantity());
      const qaAssignmentQuantity = Math.max(1, Math.min(700, selectedPlanBeforeAssignment > 1 ? selectedPlanBeforeAssignment - 1 : selectedPlanBeforeAssignment));
      selectedAvailableQuantityInput.value = String(qaAssignmentQuantity);
      selectedAvailableQuantityInput.dispatchEvent(new Event("input", { bubbles: true }));
      selectedAvailableQuantityInput.dispatchEvent(new Event("change", { bubbles: true }));
      const previewCard = selectedAvailableQuantityInput.closest("[data-shift-board-available-person]");
      const quantityPreviewText = previewCard?.innerText.trim().replace(/\s+/g, " ") || "";
      const quantityPreviewLoad = previewCard?.style.getPropertyValue("--employee-load") || "";
      const normalizeLocalQuantity = (value) => Math.max(0, Math.floor(Number(String(value ?? "").replace(",", ".")) || 0));
      const storedUiAfterInput = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
      const autoSavedAssignment = storedUiAfterInput.shiftMasterBoardAssignments?.[selectedAssignmentCardId] || null;
      const availableQuantityAutoSaved = autoSavedAssignment
        ? (autoSavedAssignment.executors || []).some((executor) => executor.employeeId === firstEmployee && normalizeLocalQuantity(executor.quantity) === qaAssignmentQuantity)
        : false;
      const directIssueCardId = selectedAssignmentCardId;
      click("[data-shift-board-print]");
      await wait(100);
      const storedUiAfterDirectIssue = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
      const directIssueAssignment = storedUiAfterDirectIssue.shiftMasterBoardAssignments?.[directIssueCardId] || null;
      const directIssueAssignmentSummary = directIssueAssignment ? {
        assignedQuantity: directIssueAssignment.assignedQuantity,
        executorCount: (directIssueAssignment.executors || []).length,
        executors: (directIssueAssignment.executors || []).map((executor) => ({
          employeeId: executor.employeeId,
          quantity: executor.quantity,
        })),
        sheetAssignedQuantity: directIssueAssignment.sheetContract?.assignedQuantity || null,
        transferAssignedQuantity: directIssueAssignment.transferContract?.assignedQuantity || directIssueAssignment.sheetContract?.transferContract?.assignedQuantity || null,
      } : null;
      const directIssueSavedUnsavedExecutor = directIssueAssignment
        ? (directIssueAssignment.executors || []).some((executor) => executor.employeeId === firstEmployee && normalizeLocalQuantity(executor.quantity) === qaAssignmentQuantity)
        : false;
      click(".shift-master-board-sheet-modal [data-close-modal]");
      await wait(80);
      click("[data-shift-board-save-assignment]");
      await wait(80);
      const activeAssignmentCardId = document.querySelector(".shift-master-board-card.is-active")?.getAttribute("data-shift-board-card") || "";
      const oldExecutorGridVisible = Boolean(document.querySelector("[data-shift-board-executor-row], .shift-master-board-executors"));
      const riskCardText = document.querySelector(".shift-master-board-card.is-active")?.innerText.trim().replace(/\s+/g, " ") || "";
      const storedUiAfterAssignment = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
      const activeStoredAssignment = storedUiAfterAssignment.shiftMasterBoardAssignments?.[activeAssignmentCardId] || null;
      const unauthorizedExecutorFiltered = Boolean(activeStoredAssignment) && !oldExecutorGridVisible;
      const storedAssignmentRisks = Object.values(storedUiAfterAssignment.shiftMasterBoardAssignments || {})
        .map((assignment) => assignment?.riskReason || "")
        .filter(Boolean);
      const availableLoadbarText = document.querySelector("[data-visual-qa-target=\"shift-master-board-available-loadbar\"]")?.innerText.trim().replace(/\s+/g, " ") || "";
      const availableLoadbarCards = document.querySelectorAll("[data-visual-qa-target=\"shift-master-board-available-person\"]").length;
      const availableQuantityInputVisible = Boolean(document.querySelector("[data-shift-board-available-quantity]"));
      const availableQuantityAssignmentSaved = activeStoredAssignment
        ? (activeStoredAssignment.executors || []).some((executor) => executor.employeeId === firstEmployee && normalizeLocalQuantity(executor.quantity) === qaAssignmentQuantity)
        : false;
      let otherTaskLoadText = "";
      let otherTaskBaseLoad = "";
      let otherTaskLoadChecked = false;
      for (const card of document.querySelectorAll("[data-shift-board-card]")) {
        const cardId = card.getAttribute("data-shift-board-card") || "";
        if (!cardId || cardId === activeAssignmentCardId) continue;
        if (otherTaskCardId && cardId !== otherTaskCardId) continue;
        card.click();
        await wait(70);
        const input = [...document.querySelectorAll("[data-shift-board-available-quantity]")]
          .find((candidate) => candidate.dataset.shiftBoardAvailableEmployee === firstEmployee);
        const personCard = input?.closest("[data-shift-board-available-person]");
        if (!personCard) continue;
        otherTaskLoadChecked = true;
        otherTaskLoadText = personCard.innerText.trim().replace(/\s+/g, " ");
        otherTaskBaseLoad = personCard.style.getPropertyValue("--employee-base-load") || "";
        break;
      }
      const activeCardForPrint = [...document.querySelectorAll("[data-shift-board-card]")]
        .find((card) => (card.getAttribute("data-shift-board-card") || "") === activeAssignmentCardId);
      activeCardForPrint?.click();
      await wait(80);
      click("[data-shift-board-print]");
      await wait(80);

      const modalOpened = Boolean(document.querySelector(".shift-master-board-sheet-modal"));
      const modalText = document.querySelector(".shift-master-board-sheet-modal")?.innerText.trim().replace(/\s+/g, " ") || "";
      const storedUiAfterPrint = JSON.parse(localStorage.getItem("mes-planning-prototype-ui-v1") || "{}");
      const issuedAssignment = storedUiAfterPrint.shiftMasterBoardAssignments?.[activeAssignmentCardId] || null;
      const sheetContract = issuedAssignment?.sheetContract || null;
      const transferContract = issuedAssignment?.transferContract || sheetContract?.transferContract || null;
      const modalOverflowBlocks = modalOpened ? [...document.querySelectorAll(".shift-master-board-sheet-modal, .shift-master-board-sheet section")].filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.display !== "none"
          && style.visibility !== "hidden"
          && rect.width > 0
          && rect.height > 0
          && element.scrollWidth - element.clientWidth > 2;
      }).map((element) => ({
        className: element.className,
        text: element.innerText?.trim().replace(/\s+/g, " ").slice(0, 120) || "",
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      })) : [];
      click(".shift-master-board-sheet-modal [data-close-modal]");
      await wait(80);

      const laneCounts = [...document.querySelectorAll("[data-shift-board-lane]")].map((lane) => ({
        id: lane.getAttribute("data-shift-board-lane"),
        cards: lane.querySelectorAll("[data-shift-board-card]").length,
        text: lane.querySelector("header")?.innerText.trim().replace(/\s+/g, " ") || "",
      }));
      const coverageText = document.querySelector(".shift-master-board-coverage")?.innerText.trim().replace(/\s+/g, " ") || "";
      const taskContext = document.querySelector("[data-visual-qa-target=\"shift-master-board-task-context\"]");
      const taskContextNextBlock = taskContext?.nextElementSibling || null;
      const taskContextGap = taskContext && taskContextNextBlock
        ? Number((taskContextNextBlock.getBoundingClientRect().top - taskContext.getBoundingClientRect().bottom).toFixed(2))
        : null;
      const taskContextText = document.querySelector("[data-visual-qa-target=\"shift-master-board-task-context\"]")?.innerText.trim().replace(/\s+/g, " ") || "";
      const inlineSummaryText = document.querySelector("[data-visual-qa-target=\"shift-master-board-inline-summary\"]")?.innerText.trim().replace(/\s+/g, " ") || "";
      const routeChainText = document.querySelector(".shift-master-board-route-chain")?.innerText.trim().replace(/\s+/g, " ") || "";
      const documentPanelText = document.querySelector("[data-visual-qa-target=\"shift-master-board-document-panel\"]")?.innerText.trim().replace(/\s+/g, " ") || "";
      const documentTransferCards = document.querySelectorAll("[data-visual-qa-target=\"shift-master-board-document-panel\"] [data-visual-qa-target=\"shift-master-board-transfer-card\"]").length;
      const factPanelVisible = Boolean(document.querySelector("[data-visual-qa-target=\"shift-master-board-fact-panel\"], [data-shift-board-fact-panel]"));
      const factSaveVisible = Boolean(document.querySelector("[data-shift-board-save-fact]"));
      const detailQaTargets = [...document.querySelectorAll(".shift-master-board-detail-panel [data-visual-qa-target]")]
        .map((element) => element.getAttribute("data-visual-qa-target") || "")
        .filter(Boolean);
      const carryoverPanelVisible = Boolean(document.querySelector(".shift-master-board-carryover, [data-visual-qa-target=\"shift-master-board-carryover-panel\"]"));
      const recommendationsPanelVisible = Boolean(document.querySelector(".shift-master-board-recommendations, [data-visual-qa-target=\"shift-master-board-recommendations-panel\"]"));
      const viewportOverflowX = Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth, document.body.scrollWidth - document.body.clientWidth);
      const tinyTargets = [...document.querySelectorAll("button, input, select, textarea, a")].filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && (rect.width < 24 || rect.height < 22);
      }).length;
      const overflowBlocks = [...document.querySelectorAll([
        ".shift-master-board-sidebar",
        ".shift-master-board-panel",
        ".shift-master-board-section",
        ".shift-master-board-task-context",
        ".shift-master-board-inline-summary",
        ".shift-master-board-summary-cell",
        ".shift-master-board-coverage",
        ".shift-master-board-coverage article",
        ".shift-master-board-route-chain",
        ".shift-master-board-available-loadbar",
        ".shift-master-board-available-person",
        ".shift-master-board-lane",
        ".shift-master-board-card",
      ].join(","))].filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.display !== "none"
          && style.visibility !== "hidden"
          && rect.width > 0
          && rect.height > 0
          && element.scrollWidth - element.clientWidth > 2;
      }).map((element) => ({
        className: element.className,
        text: element.innerText?.trim().replace(/\s+/g, " ").slice(0, 120) || "",
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }));
      const insetIssues = [...document.querySelectorAll([
        ".shift-master-board-panel .ui-panel-head",
        ".shift-master-board-section > header",
        ".shift-master-board-route-chain > header",
      ].join(","))].filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const firstText = element.querySelector("strong, h1, h2, span");
        if (!firstText || style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) return false;
        const textRect = firstText.getBoundingClientRect();
        return textRect.left - rect.left < 4 || textRect.top - rect.top < 4;
      }).map((element) => ({
        className: element.className,
        text: element.innerText?.trim().replace(/\s+/g, " ").slice(0, 120) || "",
      }));
      const runtimeIsolationAfter = readRuntimeIsolation();
      const runtimeChangedKeys = Object.keys(runtimeIsolationAfter).filter((key) => runtimeIsolationAfter[key] !== runtimeIsolationBefore[key]);

      return { laneCounts, removedPanelsVisible, boardLaneStructureValid, invalidDragTargetsBlocked, masterSelectorKeepsBoardVisible, kuzminaTaskCount, kuzminaMatrixScopeCount, kuzminaAvailableCount, kuzminaEmployeeCardCount, kuzminaLoadbarText, kuzminaFallbackTaskCount, kuzminaFallbackScopeCount, kuzminaFallbackAvailableCount, kuzminaFallbackEmployeeCardCount, kuzminaFallbackSavedQuantity, kuzminaFallbackLoadbarText, qaAssignmentQuantity, availableQuantityAutoSaved, directIssueSavedUnsavedExecutor, directIssueAssignmentSummary, unauthorizedExecutorFiltered, oldExecutorGridVisible, storedAssignmentRisks, coverageText, taskContextGap, taskContextText, inlineSummaryText, routeChainText, documentPanelText, documentTransferCards, factPanelVisible, factSaveVisible, detailQaTargets, carryoverPanelVisible, recommendationsPanelVisible, modalOpened, modalText, sheetContract, transferContract, modalOverflowBlocks, riskCardText, availableLoadbarText, availableLoadbarCards, availableQuantityInputVisible, availableQuantityAssignmentSaved, otherTaskLoadChecked, otherTaskLoadText, otherTaskBaseLoad, quantityPreviewText, quantityPreviewLoad, tinyTargets, viewportOverflowX, overflowBlocks, insetIssues, runtimeChangedKeys };
    });

    assert(result.modalOpened, "Shift board sheet modal did not open.");
    assert(result.modalText.includes("Передача"), `Shift sheet modal does not render transfer section: ${result.modalText}`);
    assert(result.sheetContract?.documentType === "shiftWorkOrderSheet", `Shift sheet contract was not saved on issue/print: ${JSON.stringify(result.sheetContract)}`);
    assert(result.sheetContract.status === "issued", `Shift sheet contract must be issued after print: ${JSON.stringify(result.sheetContract)}`);
    assert(result.transferContract?.sourceSlotId, `Shift transfer contract lost source slot link: ${JSON.stringify(result.transferContract)}`);
    assert(result.transferContract?.fromWorkCenterLabel && result.transferContract?.toWorkCenterLabel, `Shift transfer contract does not describe route of transfer: ${JSON.stringify(result.transferContract)}`);
    assert(result.directIssueSavedUnsavedExecutor, `Print/issue must persist unsaved quantity assignment before opening the shift sheet: ${JSON.stringify(result.directIssueAssignmentSummary)}`);
    assert(Number(result.transferContract.assignedQuantity || 0) === result.qaAssignmentQuantity, `Shift transfer contract has wrong assigned quantity: ${JSON.stringify({ transfer: result.transferContract, expected: result.qaAssignmentQuantity, directIssue: result.directIssueAssignmentSummary })}`);
    assert(result.modalOverflowBlocks.length === 0, `Shift board sheet modal has horizontal overflow: ${JSON.stringify(result.modalOverflowBlocks, null, 2)}`);
    assert(result.removedPanelsVisible.length === 0, `Removed shift board panels/controls are still visible: ${JSON.stringify(result.removedPanelsVisible)}`);
    assert(result.boardLaneStructureValid, `Shift board lanes must be План / В работе / Закрытие смены: ${JSON.stringify(result.laneCounts)}`);
    assert(result.invalidDragTargetsBlocked, "Drag/drop allowed moving a card to a guarded lane without required data.");
    assert(result.masterSelectorKeepsBoardVisible, "Selecting a master broke the shift board layout.");
    assert(result.kuzminaTaskCount >= 0, "Kuzmina master profile was not available in the shift board.");
    if (result.kuzminaTaskCount > 0) {
      assert(result.kuzminaMatrixScopeCount >= 10, `Kuzmina should receive expanded department branch employees from assignment matrix, got ${result.kuzminaMatrixScopeCount}.`);
      assert(result.kuzminaEmployeeCardCount > 0, `Kuzmina should keep employee cards for manual assignment even when timesheet availability is zero: ${JSON.stringify({ available: result.kuzminaAvailableCount, cards: result.kuzminaEmployeeCardCount, text: result.kuzminaLoadbarText })}`);
    }
    if (result.kuzminaFallbackTaskCount > 0) {
      assert(result.kuzminaFallbackScopeCount >= 10, `Kuzmina fallback date should keep expanded department scope: ${JSON.stringify(result)}`);
      assert(result.kuzminaFallbackAvailableCount === 0, `Kuzmina fallback date must exercise zero-timesheet availability, got ${result.kuzminaFallbackAvailableCount}.`);
      assert(result.kuzminaFallbackEmployeeCardCount >= 10, `Kuzmina fallback date must still render employee cards from matrix: ${JSON.stringify({ cards: result.kuzminaFallbackEmployeeCardCount, text: result.kuzminaFallbackLoadbarText })}`);
      assert(result.kuzminaFallbackSavedQuantity === 10, `Kuzmina fallback employee card input must save assignment quantity: ${JSON.stringify({ quantity: result.kuzminaFallbackSavedQuantity, text: result.kuzminaFallbackLoadbarText })}`);
    }
    assert(result.unauthorizedExecutorFiltered, "Shift board did not keep assignment limited to available employee cards.");
    assert(!result.oldExecutorGridVisible, "Shift board still renders duplicate executor table.");
    assert(result.riskCardText.includes("риск: ресурс"), `Manual risk flag is not visible on the card. Active card text: ${result.riskCardText}. Stored risks: ${result.storedAssignmentRisks.join(", ") || "none"}`);
    assert(result.availableLoadbarText.includes("Доступные исполнители"), `Available employee loadbar is missing: ${result.availableLoadbarText}`);
    assert(
      result.availableLoadbarText.includes("свободно")
        || (result.availableLoadbarText.includes("0 по Табелю") && result.availableLoadbarText.includes("ручной резерв")),
      `Available employee loadbar does not show free capacity or manual fallback: ${result.availableLoadbarText}`,
    );
    assert(
      !/\s\/\s0\s/.test(result.availableLoadbarText)
        || (result.availableLoadbarText.includes("0 по Табелю") && result.availableLoadbarText.includes("ручное распределение")),
      `Available employee loadbar still renders accidental zero capacity: ${result.availableLoadbarText}`,
    );
    assert(result.availableLoadbarCards > 0, "Available employee loadbar does not render employee cards.");
    assert(result.availableQuantityInputVisible, "Available employee loadbar does not render direct quantity input.");
    assert(result.availableQuantityAutoSaved, "Quantity input in available employee card must autosave assignment before explicit save/print.");
    assert(result.availableQuantityAssignmentSaved, "Quantity input in available employee card did not save assignment quantity.");
    assert(result.quantityPreviewText.includes("другие") && result.quantityPreviewText.includes("это задание"), `Quantity input did not show split reservation preview: ${result.quantityPreviewText}`);
    assert(/\d+%/.test(result.quantityPreviewLoad), `Quantity input did not update loadbar percentage: ${result.quantityPreviewLoad}`);
    if (result.otherTaskLoadChecked) {
      assert(result.otherTaskLoadText.includes("другие") && !result.otherTaskBaseLoad.startsWith("0%"), `Other task does not show existing employee load: ${JSON.stringify({ text: result.otherTaskLoadText, base: result.otherTaskBaseLoad })}`);
    }
    assert(result.coverageText.includes("Покрытие плана"), "Shift board coverage indicator is missing.");
    assert(result.coverageText.includes("Факт к распределению"), "Shift board fact coverage indicator is missing.");
    assert(result.taskContextText.includes("Маршрут передачи"), `Shift board task context does not contain route transfer context: ${result.taskContextText}`);
    assert(result.taskContextText.includes("Покрытие плана"), `Shift board task context does not contain coverage: ${result.taskContextText}`);
    assert(result.taskContextGap === null || result.taskContextGap >= 12, `Shift board task context is visually glued to the next block: ${result.taskContextGap}px.`);
    [
      "shift-master-board-task-context",
      "shift-master-board-summary-cell",
      "shift-master-board-coverage-card",
      "shift-master-board-route-chain-card",
      "shift-master-board-assignment-panel",
      "shift-master-board-available-person",
      "shift-master-board-available-quantity",
      "shift-master-board-document-card",
    ].forEach((targetName) => {
      assert(
        result.detailQaTargets.includes(targetName),
        `Shift board detail card is missing inner Visual QA target: ${targetName}. Existing: ${result.detailQaTargets.join(", ")}`,
      );
    });
    assert(!result.factPanelVisible, "Shift board still renders duplicate end-of-shift fact panel. Fact entry must be in Рабочий стол.");
    assert(!result.factSaveVisible, "Shift board still renders duplicate fact save action. Fact entry must be in Рабочий стол.");
    assert(result.documentPanelText.includes("Сменный лист"), `Shift board document panel is missing compact document row: ${result.documentPanelText}`);
    assert(!result.documentPanelText.includes("Собрать лист"), `Shift board still renders obsolete collect-sheet action: ${result.documentPanelText}`);
    assert(result.documentPanelText.includes("Печать"), `Shift board document print action is missing: ${result.documentPanelText}`);
    assert(result.documentTransferCards === 0, `Shift board document panel still duplicates transfer cards: ${result.documentTransferCards}`);
    assert(!result.carryoverPanelVisible, "Shift board still renders duplicate carryover panel.");
    assert(!result.recommendationsPanelVisible, "Shift board still renders duplicate recommendations panel.");
    assert(result.inlineSummaryText.includes("Покрытие плана"), `Shift board inline summary does not contain coverage: ${result.inlineSummaryText}`);
    assert(!/\bПлан\s+\d/.test(result.inlineSummaryText), `Shift board inline summary still contains duplicate plan metric: ${result.inlineSummaryText}`);
    assert(!/\bРаспределено\s+\d/.test(result.inlineSummaryText), `Shift board inline summary still contains duplicate assignment metric: ${result.inlineSummaryText}`);
    assert(!/\bФакт\s+\d/.test(result.inlineSummaryText), `Shift board inline summary still contains duplicate fact metric: ${result.inlineSummaryText}`);
    assert(!result.inlineSummaryText.includes("Состояние"), `Shift board inline summary still contains duplicate state cell: ${result.inlineSummaryText}`);
    assert(result.routeChainText.includes("Маршрут передачи"), "Shift board route transfer context is missing.");
    assert(result.runtimeChangedKeys.length === 0, `Shift board changed runtime data outside UI state: ${result.runtimeChangedKeys.join(", ")}`);
    assert(result.viewportOverflowX === 0, `Unexpected page horizontal overflow: ${result.viewportOverflowX}`);
    assert(result.tinyTargets === 0, `Unexpected tiny controls in shift board: ${result.tinyTargets}`);
    assert(result.overflowBlocks.length === 0, `Unexpected horizontal overflow blocks in shift board: ${JSON.stringify(result.overflowBlocks, null, 2)}`);
    assert(result.insetIssues.length === 0, `Text is too close to a shift board panel edge: ${JSON.stringify(result.insetIssues, null, 2)}`);

    console.log("Shift Master Board functional QA OK");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await cleanupChrome(chrome);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
