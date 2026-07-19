import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { cleanupChrome, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const distRoot = join(process.cwd(), "experiments", "react-migration", "dist");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const contentType = (path) => extname(path) === ".js" ? "text/javascript; charset=utf-8" : extname(path) === ".css" ? "text/css; charset=utf-8" : "text/html; charset=utf-8";
async function startServer(port) {
  const server = createServer(async (request, response) => {
    try { const pathname = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`).pathname; const relative = pathname === "/" ? "index.html" : normalize(pathname).replace(/^[/\\]+/, ""); if (relative.includes("..")) throw new Error("invalid path"); response.writeHead(200, { "Content-Type": contentType(relative), "Cache-Control": "no-store" }); response.end(await readFile(join(distRoot, relative))); }
    catch { response.writeHead(404).end("Not found"); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  return server;
}
const stopServer = (server) => new Promise((resolve) => server.close(resolve));

const port = await getFreePort(); const server = await startServer(port); let chrome = null; const consoleProblems = [];
try {
  chrome = await launchChrome("mes-shift-work-orders-react-lab-qa-"); const { client } = chrome;
  client.socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" ")); });
  await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });
  const origin = `http://127.0.0.1:${port}`;
  await client.send("Page.navigate", { url: `${origin}/?scenario=shift-work-orders&lifecycle_qa=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-island-scenario="shiftWorkOrders"][data-react-island-revision="1"]')), { message: "Shift Work Orders lab did not render" });
  const initial = await evaluate(client, () => ({ documents: document.querySelectorAll("[data-shift-work-order-package-row]").length, operations: document.querySelectorAll("[data-shift-work-order-operation-row]").length, assignments: document.querySelectorAll("[data-shift-work-order-row]").length, headers: document.querySelectorAll(".shift-work-orders-table thead th").length, metrics: document.querySelectorAll('[data-ui-component="MetricCard"]').length, selected: document.querySelector("[data-shift-work-order-row].is-active")?.getAttribute("data-shift-work-order-row"), pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
  assert(initial.documents === 2 && initial.operations === 3 && initial.assignments === 3 && initial.headers === 8, "Shift Work Orders tree density must survive rendering");
  assert(initial.metrics === 8 && initial.selected === "a-1" && !initial.pageOverflow, "Shift Work Orders detail/selection/overflow contract failed");
  await evaluate(client, () => document.querySelector(".shift-work-orders-issue-photo.has-photo")?.click());
  await waitForCondition(client, () => Boolean(document.querySelector("[data-react-shift-work-order-photo-viewer]") && document.querySelector('[data-react-island-scenario="shiftWorkOrders"]')), { message: "Shift Work Orders attachment viewer did not stay in React" });
  await evaluate(client, () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  await waitForCondition(client, () => !document.querySelector("[data-react-shift-work-order-photo-viewer]"), { message: "Shift Work Orders attachment viewer did not close" });
  await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.includes("Печать СЗН"))?.click());
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-shift-work-order-print-preview="shift"] .shift-work-order-print-sheet')), { message: "Shift Work Orders SZN print preview did not stay in React" });
  await evaluate(client, () => [...document.querySelectorAll('[data-react-shift-work-order-print-preview="shift"] [data-ui-component="ActionButton"]')].find((button) => button.textContent?.includes("Печать / PDF"))?.click());
  await waitForCondition(client, () => document.querySelector("#root")?.getAttribute("data-print-document-title") === "СЗН-1042-01", { message: "Shift Work Orders SZN print callback did not preserve the title" });
  await evaluate(client, () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  await waitForCondition(client, () => !document.querySelector("[data-react-shift-work-order-print-preview]"), { message: "Shift Work Orders SZN print preview did not close" });
  await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.includes("Пакет ЗН"))?.click());
  await waitForCondition(client, () => document.querySelectorAll('[data-react-shift-work-order-print-preview="package"] .work-order-print-operations-table tbody tr').length === 2 && document.querySelectorAll('[data-react-shift-work-order-print-preview="package"] .work-order-print-registry-table tbody tr').length === 2, { message: "Shift Work Orders package preview did not preserve owner rows" });
  await evaluate(client, () => [...document.querySelectorAll('[data-react-shift-work-order-print-preview="package"] [data-ui-component="ActionButton"]')].find((button) => button.textContent?.includes("Печать / PDF"))?.click());
  await waitForCondition(client, () => document.querySelector("#root")?.getAttribute("data-print-document-title") === "Контроллер КТ-7", { message: "Shift Work Orders package print callback did not preserve the title" });
  await evaluate(client, () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  await evaluate(client, () => document.querySelector('[data-shift-work-order-row="a-2"]')?.click());
  await waitForCondition(client, () => document.querySelector("[data-shift-work-order-row].is-active")?.getAttribute("data-shift-work-order-row") === "a-2", { message: "Shift Work Orders selection did not update" });
  await evaluate(client, () => document.querySelector('[data-shift-work-order-operation-row="op-mount"]')?.click());
  await waitForCondition(client, () => document.querySelectorAll("[data-shift-work-order-row]").length === 2, { message: "Shift Work Orders operation collapse failed" });
  await evaluate(client, () => document.querySelector("[data-lifecycle-update]")?.click());
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-island-revision="2"]')), { message: "Shift Work Orders update did not commit" });
  await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.includes("Мастерская"))?.click());
  await waitForCondition(client, () => Boolean(document.querySelector('[data-legacy-fallback="unsupported-scope"]')), { message: "Shift Work Orders Workshop action did not return to legacy" });
  await client.send("Page.navigate", { url: `${origin}/?scenario=shift-work-orders&react=0` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-legacy-fallback="disabled"]')), { message: "disabled Shift Work Orders flag did not stay legacy" });
  assert(consoleProblems.length === 0, `browser console must stay clean:\n${consoleProblems.join("\n")}`);
  console.log("Shift Work Orders React isolated browser QA: OK");
  console.log("- 2 work orders, 3 operations, 3 assignments, 8 columns and 8 detail metrics: pass");
  console.log("- attachment, SZN/package previews, host print callback, selection, collapse, revision 1 -> 2, Workshop fallback and clean console: pass");
} finally { if (chrome) await cleanupChrome(chrome); await stopServer(server); }
