import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const defaultUrl = new URL("/?module=authPrototype&qa=auth-functional", process.env.MES_QA_URL || "http://localhost:4174/").toString();
const authStorageKey = "mes-planning-prototype-auth-session-v1";
const uiStorageKey = "mes-planning-prototype-ui-v1";

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
    await stat(path);
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
    this.listeners = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.onMessage(event));
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || "CDP error"));
      else resolve(message.result);
      return;
    }
    if (message.method && this.listeners.has(message.method)) {
      this.listeners.get(message.method).forEach((listener) => listener(message.params || {}));
    }
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
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

async function evaluate(client, pageFunction, arg, timeoutMs = 45000) {
  const source = typeof pageFunction === "function" ? pageFunction.toString() : pageFunction;
  const expression = arg === undefined ? `(${source})()` : `(${source})(${JSON.stringify(arg)})`;
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, timeoutMs);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

async function launchChrome() {
  const chromePath = await findChrome();
  const port = await getFreePort();
  const profileDir = await mkdtemp(join(tmpdir(), "mes-auth-functional-"));
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForCondition(client, predicate, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await evaluate(client, predicate);
    if (result) return result;
    await delay(120);
  }
  throw new Error("Timed out waiting for auth UI condition.");
}

async function clickFirst(client, selector) {
  const ok = await evaluate(client, (cssSelector) => {
    const element = document.querySelector(cssSelector);
    if (!element) return false;
    element.click();
    return true;
  }, selector);
  assert(ok, `Element was not found for click: ${selector}`);
}

async function clickByText(client, selector, expectedText) {
  const ok = await evaluate(client, (payload) => {
    const normalizedExpected = String(payload.expectedText || "").trim().toLowerCase();
    const element = [...document.querySelectorAll(payload.selector)]
      .find((item) => item.textContent.trim().toLowerCase().includes(normalizedExpected));
    if (!element) return false;
    element.click();
    return true;
  }, { selector, expectedText });
  assert(ok, `Element was not found for click: ${selector} / ${expectedText}`);
}

async function clickCenterNative(client, selector, options = {}) {
  const rect = await evaluate(client, (cssSelector) => {
    const element = document.querySelector(cssSelector);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return {
      x: Math.round(box.left + box.width / 2),
      y: Math.round(box.top + box.height / 2),
      width: Math.round(box.width),
      height: Math.round(box.height),
    };
  }, selector);
  assert(rect && rect.width > 0 && rect.height > 0, `Element was not visible for native click: ${selector}`);
  const modifiers = options.shiftKey ? 8 : 0;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1, modifiers });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1, modifiers });
}

async function clickPinDigit(client, digit) {
  const ok = await evaluate(client, (targetDigit) => {
    const button = [...document.querySelectorAll("[data-auth-pin-digit]")]
      .find((item) => item.textContent.trim() === String(targetDigit));
    if (!button) return false;
    button.click();
    return true;
  }, digit);
  assert(ok, `PIN digit button was not found: ${digit}`);
}

async function resetAuthStorage(client) {
  await evaluate(client, ({ authKey, uiKey }) => {
    localStorage.removeItem(authKey);
    localStorage.removeItem(uiKey);
    sessionStorage.clear();
  }, { authKey: authStorageKey, uiKey: uiStorageKey });
}

async function completeAuthSelection(client) {
  await waitForCondition(client, () => Boolean(document.querySelector("[data-auth-department]")));
  await clickByText(client, "[data-auth-department]", "Административный отдел");
  await waitForCondition(client, () => Boolean(document.querySelector("[data-auth-unit], [data-auth-person]")));
  const needsUnit = await evaluate(client, () => Boolean(document.querySelector("[data-auth-unit]")));
  if (needsUnit) await clickFirst(client, "[data-auth-unit]");
  await waitForCondition(client, () => Boolean(document.querySelector("[data-auth-person]")));
  await verifyAuthMasterRoleMarker(client);
  await clickByText(client, "[data-auth-person]", "Алексеев Егор Максимович");
  return await waitForPinOrUnlocked(client);
}

async function waitForPinOrUnlocked(client) {
  return await waitForCondition(client, () => {
    const shell = document.querySelector("main.app-shell");
    const pageId = shell?.dataset?.layoutPage || "";
    const sessionRaw = localStorage.getItem("mes-planning-prototype-auth-session-v1");
    let session = null;
    try {
      session = sessionRaw ? JSON.parse(sessionRaw) : null;
    } catch {
      session = null;
    }
    if (document.querySelector("[data-auth-pin-digit]")) return { mode: "pin", pageId, sessionUnlocked: Boolean(session?.unlocked) };
    if (pageId !== "authPrototype" && session?.unlocked) return { mode: "unlocked", pageId, sessionUnlocked: true };
    return null;
  });
}

async function readAuthBackNavigation(client) {
  return await evaluate(client, () => {
    const step = document.querySelector("[data-auth-step]")?.getAttribute("data-auth-step") || "";
    const buttons = [...document.querySelectorAll(".auth-prototype-step-toolbar button")]
      .filter((button) => (
        button.hasAttribute("data-auth-back-departments")
        || button.hasAttribute("data-auth-back-units")
        || button.hasAttribute("data-auth-back-people")
      ))
      .map((button) => ({
        text: button.textContent.trim().replace(/\s+/g, " "),
        target: button.hasAttribute("data-auth-back-people")
          ? "people"
          : button.hasAttribute("data-auth-back-units")
            ? "units"
            : "departments",
      }));
    return { step, buttons };
  });
}

async function assertAuthSingleBack(client, expectedStep, expectedTarget) {
  const report = await readAuthBackNavigation(client);
  assert(report.step === expectedStep, `Auth back contract expected step "${expectedStep}", got "${report.step}".`);
  assert(report.buttons.length === 1, `Auth ${expectedStep} step must expose exactly one back button, got ${JSON.stringify(report.buttons)}.`);
  assert(report.buttons[0].target === expectedTarget, `Auth ${expectedStep} back must target "${expectedTarget}", got "${report.buttons[0].target}".`);
  assert(report.buttons[0].text === "Назад", `Auth ${expectedStep} back button must be labeled "Назад", got "${report.buttons[0].text}".`);
}

async function verifyAuthOneStepBackFlow(client) {
  await waitForCondition(client, () => Boolean(document.querySelector("[data-auth-department]")));
  await clickByText(client, "[data-auth-department]", "Отдел ручного монтажа");
  await waitForCondition(client, () => Boolean(document.querySelector("[data-auth-unit]")));
  await assertAuthSingleBack(client, "unit", "departments");

  await clickFirst(client, "[data-auth-unit]");
  await waitForCondition(client, () => Boolean(document.querySelector("[data-auth-person]")));
  await assertAuthSingleBack(client, "person", "units");

  await clickFirst(client, "[data-auth-person]");
  const terminalStep = await waitForPinOrUnlocked(client);
  if (terminalStep.mode === "unlocked") {
    assert(terminalStep.sessionUnlocked, "Temporary PIN bypass must unlock the auth session after person selection.");
    return;
  }
  await assertAuthSingleBack(client, "pin", "people");

  await clickFirst(client, "[data-auth-back-people]");
  await waitForCondition(client, () => document.querySelector("[data-auth-step]")?.getAttribute("data-auth-step") === "person");
  await assertAuthSingleBack(client, "person", "units");
}

async function verifyAuthHeaderContract(client) {
  await waitForCondition(client, () => Boolean(document.querySelector("[data-auth-department]")));
  const headerGeometry = await evaluate(client, () => {
    const header = document.querySelector("[data-visual-qa-target='auth-prototype-header']");
    if (!header) return null;
    const rect = header.getBoundingClientRect();
    return {
      target: header.getAttribute("data-visual-qa-target") || "",
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  assert(headerGeometry?.target === "auth-prototype-header", "Auth header must expose a stable inspection target.");
  assert(headerGeometry.x === 0 && headerGeometry.y === 0, "Auth header must start at the top-left edge of the standalone auth screen.");
  assert(headerGeometry.width === headerGeometry.viewportWidth, "Auth header must span the full auth viewport width.");

  const departmentIconTone = await evaluate(client, () => {
    const icon = document.querySelector(".auth-prototype-department-icon");
    if (!icon) return null;
    return getComputedStyle(icon).color;
  });
  assert(departmentIconTone === "rgb(16, 35, 60)", "Auth department icons must use the sidebar background blue tone, not bright primary blue.");
  return { headerGeometry, departmentIconTone };
}

async function submitPin(client, digits = []) {
  for (const digit of digits) {
    await clickPinDigit(client, digit);
    await delay(80);
  }
}

async function readPinKeyboard(client) {
  return evaluate(client, () => {
    const digits = [...document.querySelectorAll("[data-auth-pin-digit]")]
      .map((button) => button.textContent.trim())
      .filter(Boolean);
    const allButtonsText = [...document.querySelectorAll(".auth-prototype-keypad button")]
      .map((button) => button.textContent.trim())
      .join(" ");
    const firstDigitButton = document.querySelector("[data-auth-pin-digit]");
    const firstDigitStyle = firstDigitButton ? getComputedStyle(firstDigitButton) : null;
    const clearCell = document.querySelector(".auth-prototype-keypad-clear");
    const clearCellStyle = clearCell ? getComputedStyle(clearCell) : null;
    return {
      digits,
      uniqueDigits: new Set(digits).size,
      hasClearC: /\bC\b|С/.test(allButtonsText),
      hasBackspace: Boolean(document.querySelector("[data-auth-pin-backspace]")),
      digitRadius: Number.parseFloat(firstDigitStyle?.borderTopLeftRadius || "0") || 0,
      clearCell: clearCellStyle ? {
        visibility: clearCellStyle.visibility,
        borderTopWidth: clearCellStyle.borderTopWidth,
        backgroundColor: clearCellStyle.backgroundColor,
        pointerEvents: clearCellStyle.pointerEvents,
      } : null,
    };
  });
}

function assertPinKeyboardVisualContract(report, label) {
  assert(report.digitRadius <= 8, `${label}: PIN digit buttons must use the standard <=8px radius, got ${report.digitRadius}px.`);
  assert(report.clearCell?.visibility === "hidden", `${label}: lower-left PIN placeholder must be visually hidden.`);
  assert(report.clearCell?.borderTopWidth === "0px", `${label}: lower-left PIN placeholder must not have a visible border.`);
  assert(report.clearCell?.backgroundColor === "rgba(0, 0, 0, 0)", `${label}: lower-left PIN placeholder must be transparent, got ${report.clearCell?.backgroundColor}.`);
  assert(report.clearCell?.pointerEvents === "none", `${label}: lower-left PIN placeholder must not act like a control.`);
}

async function verifyAuthMasterRoleMarker(client) {
  const markerReport = await evaluate(client, () => {
    const masterButton = document.querySelector(".auth-prototype-people-grid [data-auth-person-kind='master']");
    if (!masterButton) return null;
    const marker = masterButton.querySelector(".auth-prototype-role-marker");
    const masterStyle = getComputedStyle(masterButton);
    const beforeStyle = getComputedStyle(masterButton, "::before");
    const markerStyle = marker ? getComputedStyle(marker) : null;
    return {
      hasMarker: Boolean(marker),
      markerText: marker?.textContent.trim() || "",
      backgroundColor: masterStyle.backgroundColor,
      boxShadow: masterStyle.boxShadow,
      beforeContent: beforeStyle.content,
      markerPosition: markerStyle?.position || "",
      markerBackground: markerStyle?.backgroundColor || "",
    };
  });
  assert(markerReport, "Auth person step must render a master tile for the administrative test route.");
  assert(markerReport.hasMarker && markerReport.markerText === "мастер", "Master auth tile must use a role marker instead of a tile-wide selected style.");
  assert(markerReport.backgroundColor === "rgb(255, 255, 255)", "Master auth tile background must stay neutral, not selected-blue.");
  assert(markerReport.boxShadow === "none", "Master auth tile must not use selected-state shadow.");
  assert(markerReport.beforeContent === "none", "Master auth tile must not render an extra vertical role stripe.");
  assert(markerReport.markerPosition === "absolute", "Master auth marker must not alter the tile layout flow.");
  return markerReport;
}

async function verifyPinPanelGeometry(client) {
  const geometry = await evaluate(client, () => {
    const panel = document.querySelector(".auth-prototype-pin-panel");
    if (!panel) return null;
    const rect = panel.getBoundingClientRect();
    const expectedWidth = Math.min(1320, document.documentElement.clientWidth - 44);
    return {
      width: Math.round(rect.width),
      expectedWidth: Math.round(expectedWidth),
    };
  });
  assert(geometry, "PIN step panel must be rendered.");
  assert(
    geometry.width === geometry.expectedWidth,
    `PIN step panel must match the auth step width contract (${geometry.width} !== ${geometry.expectedWidth}).`,
  );
  return geometry;
}

async function waitForUnlockedAuthReport(client) {
  return await waitForCondition(client, () => {
    const shell = document.querySelector("main.app-shell");
    const pageId = shell?.dataset?.layoutPage || "";
    const sessionRaw = localStorage.getItem("mes-planning-prototype-auth-session-v1");
    let session = null;
    try {
      session = sessionRaw ? JSON.parse(sessionRaw) : null;
    } catch {
      session = null;
    }
    if (pageId === "authPrototype") return null;
    const authSummaryText = document.querySelector("[data-visual-qa-target='app-auth-session-summary']")?.innerText || "";
    return {
      pageId,
      activeModule: window.__MES_ACTIVE_MODULE__ || "",
      hasMenu: Boolean(document.querySelector(".module-menu")),
      hasTopbar: Boolean(document.querySelector(".app-topbar")),
      hasLogout: Boolean(document.querySelector("[data-auth-logout]")),
      hasSidebarRoleCard: Boolean(document.querySelector(".access-role-card")),
      hasSidebarSessionCard: Boolean(document.querySelector(".access-session-card")),
      authSummaryText,
      sessionUnlocked: Boolean(session?.unlocked),
      sessionUserId: session?.userId || "",
      sessionRoleId: session?.roleId || "",
    };
  }, 10000);
}

function assertUnlockedAuthReport(report, contextLabel = "Auth") {
  assert(report.hasMenu, `${contextLabel}: standard module menu must be visible.`);
  assert(report.hasTopbar, `${contextLabel}: standard topbar must be visible.`);
  assert(report.hasLogout, `${contextLabel}: logout button must be visible in the topbar auth summary.`);
  assert(report.sessionUnlocked, `${contextLabel}: auth session must be persisted.`);
  assert(report.sessionUserId, `${contextLabel}: auth session must store selected person id.`);
  assert(report.sessionRoleId, `${contextLabel}: auth session must store interface role id.`);
  assert(!report.hasSidebarRoleCard, `${contextLabel}: sidebar role card must be removed after moving auth context to the topbar.`);
  assert(!report.hasSidebarSessionCard, `${contextLabel}: sidebar auth card must be removed after moving auth context to the topbar.`);
  assert(report.authSummaryText.includes("Алексеев Егор Максимович"), `${contextLabel}: topbar auth summary must show the selected employee name.`);
  assert(
    report.authSummaryText.split("\n").filter(Boolean).length >= 2
      && !/(?:Сеанс не выбран|отдел не выбран|сотрудник не выбран)/.test(report.authSummaryText)
      && !report.authSummaryText.includes("Директор производства"),
    `${contextLabel}: topbar auth summary must show selected employee name and department without the job title.`,
  );
  assert(report.authSummaryText.includes("Административный отдел"), `${contextLabel}: production director auth summary must show the virtual administrative department.`);
}

async function main() {
  const url = getArg("--url", defaultUrl);
  const chrome = await launchChrome();
  try {
    const { client } = chrome;
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.navigate", { url });
    await new Promise((resolve) => client.on("Page.loadEventFired", resolve));
    await resetAuthStorage(client);
    await client.send("Page.navigate", { url });
    await new Promise((resolve) => client.on("Page.loadEventFired", resolve));

    const headerContract = await verifyAuthHeaderContract(client);

    await verifyAuthOneStepBackFlow(client);
    await resetAuthStorage(client);
    await client.send("Page.navigate", { url });
    await new Promise((resolve) => client.on("Page.loadEventFired", resolve));

    const firstAuthResult = await completeAuthSelection(client);
    let pinPanelGeometry = null;
    let wrongKeyboard = null;
    let failedReport = null;
    let correctKeyboard = null;
    let report = null;

    if (firstAuthResult.mode === "pin") {
      pinPanelGeometry = await verifyPinPanelGeometry(client);
      wrongKeyboard = await readPinKeyboard(client);
      assert(wrongKeyboard.digits.length === 10 && wrongKeyboard.uniqueDigits === 10, "PIN keypad must render ten unique digit buttons.");
      assert(!wrongKeyboard.hasClearC, "PIN keypad must not render a C/С clear button.");
      assert(wrongKeyboard.hasBackspace, "PIN keypad must render a dedicated backspace button.");
      assertPinKeyboardVisualContract(wrongKeyboard, "Wrong PIN keyboard");
      await submitPin(client, [1, 1, 1, 1, 1]);
      await delay(700);
      failedReport = await evaluate(client, () => {
        const shell = document.querySelector("main.app-shell");
        const sessionRaw = localStorage.getItem("mes-planning-prototype-auth-session-v1");
        let session = null;
        try {
          session = sessionRaw ? JSON.parse(sessionRaw) : null;
        } catch {
          session = null;
        }
        return {
          pageId: shell?.dataset?.layoutPage || "",
          resultText: document.querySelector(".auth-prototype-pin-panel")?.innerText || "",
          sessionUnlocked: Boolean(session?.unlocked),
        };
      });
      assert(failedReport.pageId === "authPrototype", "Wrong PIN must keep the user on auth screen.");
      assert(!failedReport.sessionUnlocked, "Wrong PIN must not create an unlocked auth session.");

      await resetAuthStorage(client);
      await client.send("Page.navigate", { url });
      await new Promise((resolve) => client.on("Page.loadEventFired", resolve));

      await completeAuthSelection(client);
      correctKeyboard = await readPinKeyboard(client);
      assert(correctKeyboard.digits.length === 10 && correctKeyboard.uniqueDigits === 10, "PIN keypad must render ten unique digit buttons after reset.");
      assert(!correctKeyboard.hasClearC, "PIN keypad must not restore a C/С clear button after reset.");
      assert(correctKeyboard.hasBackspace, "PIN keypad must render a dedicated backspace button after reset.");
      assertPinKeyboardVisualContract(correctKeyboard, "Correct PIN keyboard");
      await submitPin(client, [5, 5, 5, 5, 5]);
    }

    report = await waitForUnlockedAuthReport(client);
    assertUnlockedAuthReport(report, firstAuthResult.mode === "pin" ? "After PIN auth" : "Temporary PIN bypass auth");

    const reloadPromise = new Promise((resolve) => client.on("Page.loadEventFired", resolve));
    await client.send("Page.reload");
    await reloadPromise;
    const persistedReport = await waitForCondition(client, () => {
      const shell = document.querySelector("main.app-shell");
      const pageId = shell?.dataset?.layoutPage || "";
      const sessionRaw = localStorage.getItem("mes-planning-prototype-auth-session-v1");
      let session = null;
      try {
        session = sessionRaw ? JSON.parse(sessionRaw) : null;
      } catch {
        session = null;
      }
      if (pageId === "authPrototype") return null;
      return {
        pageId,
        sessionUnlocked: Boolean(session?.unlocked),
        sessionUserId: session?.userId || "",
        hasSidebarRoleCard: Boolean(document.querySelector(".access-role-card")),
        authSummaryText: document.querySelector("[data-visual-qa-target='app-auth-session-summary']")?.innerText || "",
      };
    }, 10000);
    assert(persistedReport.sessionUnlocked, "Auth session must survive a same-day page reload.");
    assert(persistedReport.sessionUserId === report.sessionUserId, "Reloaded auth session must keep the selected user id.");
    assert(!persistedReport.hasSidebarRoleCard, "Reloaded interface must not restore the removed sidebar role card.");
    assert(persistedReport.authSummaryText.includes(report.sessionUserId) || persistedReport.authSummaryText.includes("Алексеев Егор Максимович"), "Reloaded topbar auth summary must stay bound to the authenticated user.");

    await clickFirst(client, "[data-auth-logout]");
    const logoutReport = await waitForCondition(client, () => {
      const shell = document.querySelector("main.app-shell");
      const sessionRaw = localStorage.getItem("mes-planning-prototype-auth-session-v1");
      let session = null;
      try {
        session = sessionRaw ? JSON.parse(sessionRaw) : null;
      } catch {
        session = null;
      }
      return {
        pageId: shell?.dataset?.layoutPage || "",
        sessionUnlocked: Boolean(session?.unlocked),
        hasAuthDepartments: Boolean(document.querySelector("[data-auth-department]")),
      };
    }, 10000);
    assert(logoutReport.pageId === "authPrototype", "Logout must return to authPrototype.");
    assert(!logoutReport.sessionUnlocked, "Logout must clear the unlocked auth session.");
    assert(logoutReport.hasAuthDepartments, "Logout must show the first auth step again.");

    console.log("Auth Functional QA OK");
    console.log(JSON.stringify({
      wrongPin: failedReport,
      wrongKeyboard,
      correctPin: report,
      correctKeyboard,
      headerContract,
      pinPanelGeometry,
      reload: persistedReport,
      logout: logoutReport,
    }, null, 2));
  } finally {
    await cleanupChrome(chrome);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
