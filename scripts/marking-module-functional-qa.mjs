import { writeFile } from "node:fs/promises";
import { cleanupChrome, delay, evaluate, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const origin = new URL(process.env.MES_QA_URL || "http://localhost:4174/").origin;
const desktopScreenshot = process.env.MES_MARKING_DESKTOP_SCREENSHOT || "/tmp/mes-marking-integrated-desktop.png";
const mobileScreenshot = process.env.MES_MARKING_MOBILE_SCREENSHOT || "/tmp/mes-marking-integrated-mobile.png";
let chrome = null;
const consoleProblems = [];

async function screenshot(client, path) {
  const result = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await writeFile(path, Buffer.from(result.data, "base64"));
}

async function clickAction(client, label) {
  const clicked = await evaluate(client, (expectedLabel) => {
    const button = [...document.querySelectorAll('button[data-ui-component="ActionButton"]')]
      .find((item) => item.textContent?.replace(/\s+/g, " ").trim() === expectedLabel);
    button?.click();
    return Boolean(button);
  }, label);
  assert(clicked, `Marking action not found: ${label}`);
}

try {
  chrome = await launchChrome("mes-marking-module-qa-");
  const { client } = chrome;
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) {
      consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    }
  });
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: `${origin}/?module=marking&qa-auth-bypass=1` });
  try {
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-marking-island][data-react-island-state="ready"]')), { message: "Integrated Marking React island did not become ready", timeoutMs: 20_000 });
  } catch (error) {
    const diagnostic = await evaluate(client, () => ({
      url: location.href,
      title: document.title,
      page: document.querySelector('[data-ui-component="AppShell"]')?.getAttribute("data-layout-page"),
      island: document.querySelector("[data-react-marking-island]")?.getAttribute("data-react-island-state"),
      app: document.querySelector("#app")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 1000),
    }));
    throw new Error(`${error.message}: ${JSON.stringify({ diagnostic, consoleProblems })}`);
  }

  const initial = await evaluate(client, () => ({
    shellCount: document.querySelectorAll('[data-ui-component="AppShell"]').length,
    page: document.querySelector('[data-ui-component="AppShell"]')?.getAttribute("data-layout-page"),
    topbar: Boolean(document.querySelector(".app-topbar")),
    desktopMenu: Boolean(document.querySelector('.module-tab[data-module="marking"].is-active')),
    mobileMenu: Boolean(document.querySelector('.mobile-module-tab[data-module="marking"].is-active')),
    title: document.querySelector(".marking-react h1")?.textContent?.trim(),
    demoBoundary: document.querySelector(".marking-demo-boundary")?.textContent?.replace(/\s+/g, " ").trim(),
    tasks: document.querySelectorAll("[data-marking-task]").length,
    kits: document.querySelectorAll(".marking-table tbody tr").length,
    standaloneShell: Boolean(document.querySelector(".marking-shell, .marking-sidebar, .marking-brand")),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  assert(initial.shellCount === 1 && initial.page === "marking" && initial.topbar, `Marking must use the existing MES shell: ${JSON.stringify(initial)}`);
  assert(initial.desktopMenu && initial.mobileMenu, `Marking navigation item is not active: ${JSON.stringify(initial)}`);
  assert(initial.title === "Маркировка" && initial.tasks === 2 && initial.kits === 12, `Marking initial MOCK state failed: ${JSON.stringify(initial)}`);
  assert(initial.demoBoundary?.includes("Нет API, БД и сохранения") && !initial.standaloneShell && !initial.overflow, `Marking integration boundary failed: ${JSON.stringify(initial)}`);

  await clickAction(client, "Добавить 5 комплектов");
  await waitForCondition(client, () => document.querySelectorAll(".marking-table tbody tr").length === 17, { message: "Marking add kits action failed" });
  await clickAction(client, "Печать · тестовый адаптер");
  await waitForCondition(client, () => [...document.querySelectorAll("button.marking-tabs button, .marking-tabs button")].some((item) => item.textContent?.includes("Партии печати · 1")), { message: "Marking print batch was not created" });
  await screenshot(client, desktopScreenshot);
  await clickAction(client, "Проверить код");
  await waitForCondition(client, () => Boolean(document.querySelector(".marking-search-modal")), { message: "Marking code search modal did not open" });

  await client.send("Page.navigate", { url: `${origin}/?module=marking&qa-auth-bypass=1&qa-reload=marking-memory-reset` });
  await waitForCondition(client, () => document.querySelectorAll(".marking-table tbody tr").length === 12, { message: "Marking memory-only state did not reset on reload", timeoutMs: 20_000 });

  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await client.send("Page.reload", { ignoreCache: true });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-marking-island][data-react-island-state="ready"]')), { message: "Mobile Marking island did not become ready", timeoutMs: 20_000 });
  await delay(350);
  const mobile = await evaluate(client, () => ({
    shellCount: document.querySelectorAll('[data-ui-component="AppShell"]').length,
    menu: Boolean(document.querySelector('.mobile-module-tab[data-module="marking"].is-active')),
    ready: document.querySelector("[data-react-marking-island]")?.getAttribute("data-react-island-state"),
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    tableScroll: (() => { const table = document.querySelector('.marking-table')?.closest('[data-ui-component="TableWrap"]'); return Boolean(table && table.scrollWidth > table.clientWidth); })(),
  }));
  assert(mobile.shellCount === 1 && mobile.menu && mobile.ready === "ready" && !mobile.pageOverflow && mobile.tableScroll, `Marking mobile integration failed: ${JSON.stringify(mobile)}`);
  await screenshot(client, mobileScreenshot);
  assert(consoleProblems.length === 0, `Marking browser console must stay clean:\n${consoleProblems.join("\n")}`);

  console.log("Integrated Marking module browser QA: OK");
  console.log(`- existing MES shell/menu/topbar, 2 MOCK tasks, actions and memory reset: pass`);
  console.log(`- desktop/mobile overflow contracts and clean console: pass`);
  console.log(`- screenshots: ${desktopScreenshot}, ${mobileScreenshot}`);
} finally {
  if (chrome) await cleanupChrome(chrome);
}
