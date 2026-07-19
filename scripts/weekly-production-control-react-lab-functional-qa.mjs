import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { cleanupChrome, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const distRoot = join(process.cwd(), "experiments", "react-migration", "dist");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const contentType = (path) => extname(path) === ".js" ? "text/javascript; charset=utf-8" : extname(path) === ".css" ? "text/css; charset=utf-8" : "text/html; charset=utf-8";

async function startServer(port) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`).pathname;
      const relative = pathname === "/" ? "index.html" : normalize(pathname).replace(/^[/\\]+/, "");
      if (relative.includes("..")) throw new Error("invalid path");
      response.writeHead(200, { "Content-Type": contentType(relative), "Cache-Control": "no-store" });
      response.end(await readFile(join(distRoot, relative)));
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  return server;
}

const stopServer = (server) => new Promise((resolve) => server.close(resolve));

const port = await getFreePort();
const server = await startServer(port);
let chrome = null;
const consoleProblems = [];
try {
  chrome = await launchChrome("mes-weekly-control-react-lab-qa-");
  const { client } = chrome;
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
  });
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });
  const origin = `http://127.0.0.1:${port}`;
  await client.send("Page.navigate", { url: `${origin}/?scenario=weekly-production-control&lifecycle_qa=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-island-scenario="weeklyProductionControl"][data-react-island-revision="1"]')), { message: "Weekly Production Control lab did not render" });
  const initial = await evaluate(client, () => ({
    title: document.querySelector("h1")?.textContent?.trim(),
    groups: document.querySelectorAll("[data-weekly-control-group]").length,
    dayCells: document.querySelectorAll("[data-weekly-control-day]").length,
    headers: [...document.querySelectorAll(".weekly-production-control-table thead th")].map((entry) => entry.textContent?.replace(/\s+/g, " ").trim()),
    metrics: Object.fromEntries([...document.querySelectorAll('[data-ui-component="MetricCard"]')].map((card) => [card.querySelector("span")?.textContent?.trim(), card.querySelector("strong")?.textContent?.trim()])),
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    tableOwnsOverflow: [...document.querySelectorAll('[data-ui-component="TableWrap"]')].some((wrap) => wrap.scrollWidth > wrap.clientWidth),
  }));
  assert(initial.title === "Контроль недели", "Weekly Control title must match legacy");
  assert(initial.groups === 2 && initial.dayCells === 14, "two groups must retain seven dense day cells each");
  assert(initial.headers.length === 11 && initial.headers[0] === "Участок / оборудование" && initial.headers.at(-1) === "Report", "weekly matrix columns must preserve legacy order");
  assert(initial.metrics["План"] === "600 шт." && initial.metrics["Факт"] === "594 шт." && initial.metrics["Отклонения >5%"] === "3", "weekly summary must preserve fixture totals");
  assert(!initial.pageOverflow && initial.tableOwnsOverflow, "dense weekly matrix must own horizontal overflow");
  const noteTargetCount = await evaluate(client, () => document.querySelectorAll("[data-weekly-production-note]").length);
  assert(noteTargetCount > 0, "Weekly fixture must expose at least one focusable deviation note");
  await evaluate(client, () => {
    const target = document.querySelector("[data-weekly-production-note]");
    target?.focus();
    target?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  });
  await waitForCondition(client, () => Boolean(document.querySelector("[data-weekly-react-note-popover]")), { message: "Weekly deviation note did not open on keyboard focus" });
  const note = await evaluate(client, () => {
    const popover = document.querySelector("[data-weekly-react-note-popover]");
    const rect = popover?.getBoundingClientRect();
    return {
      text: popover?.textContent?.replace(/\s+/g, " ").trim() || "",
      inViewport: Boolean(rect && rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight),
      focused: document.activeElement?.matches?.("[data-weekly-production-note]") === true,
    };
  });
  assert(note.text.includes("Отклонение") && note.text.includes("План:") && note.text.includes("Факт:") && note.text.includes("Причина проверяется"), `deviation note/report context is incomplete: ${note.text}`);
  assert(note.inViewport && note.focused, "keyboard note popover must stay inside the viewport and retain cell focus");
  await evaluate(client, () => {
    const target = document.querySelector("[data-weekly-production-note]");
    target?.blur();
    target?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  await waitForCondition(client, () => !document.querySelector("[data-weekly-react-note-popover]"), { message: "Weekly deviation note did not close on blur" });
  await evaluate(client, () => document.querySelector("[data-lifecycle-update]")?.click());
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-island-revision="2"]')), { message: "Weekly Control update did not commit revision 2" });
  const updatedFact = await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="MetricCard"]')].find((card) => card.querySelector("span")?.textContent?.trim() === "Факт")?.querySelector("strong")?.textContent?.trim());
  assert(updatedFact === "600 шт.", "payload update must refresh totals without remount");
  await client.send("Page.navigate", { url: `${origin}/?scenario=weekly-production-control&react=0` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-legacy-fallback="disabled"]')), { message: "disabled Weekly Control flag must stay legacy" });
  assert(consoleProblems.length === 0, `browser console must stay clean:\n${consoleProblems.join("\n")}`);
  console.log("Weekly Production Control React isolated browser QA: OK");
  console.log("- two resource groups, seven days and 14 plan/fact cells: pass");
  console.log("- summary and payload revision 1 -> 2: pass");
  console.log("- keyboard deviation-note/report context and viewport-safe popover: pass");
  console.log("- table-owned overflow, disabled fallback and clean console: pass");
} finally {
  if (chrome) await cleanupChrome(chrome);
  await stopServer(server);
}
