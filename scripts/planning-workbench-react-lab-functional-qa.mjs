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
  chrome = await launchChrome("mes-planning-workbench-react-lab-qa-"); const { client } = chrome;
  client.socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" ")); });
  await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });
  const origin = `http://127.0.0.1:${port}`;
  await client.send("Page.navigate", { url: `${origin}/?scenario=planning-workbench&lifecycle_qa=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-island-scenario="planningWorkbench"][data-react-island-revision="1"]')), { message: "Planning Workbench lab did not render" });
  const initial = await evaluate(client, () => ({ queue: document.querySelectorAll('[data-ui-component="SidebarItem"]').length, metrics: document.querySelectorAll('[data-ui-component="MetricCard"]').length, rows: document.querySelectorAll("[data-planning-order-row]").length, headers: document.querySelectorAll(".planning-order-table thead th").length, gantt: [...document.querySelectorAll('[data-ui-component="MetricCard"]')].find((card) => card.querySelector("span")?.textContent?.trim() === "Гант")?.querySelector("strong")?.textContent?.trim(), pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
  assert(initial.queue === 3 && initial.metrics === 5 && initial.rows === 4 && initial.headers === 5, "Planning Workbench fixture density must survive rendering");
  assert(initial.gantt === "нет" && !initial.pageOverflow, "Planning readiness and page overflow contract must match the model");
  await evaluate(client, () => document.querySelector("[data-lifecycle-update]")?.click());
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-island-revision="2"]')), { message: "Planning Workbench update did not commit" });
  const gantt = await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="MetricCard"]')].find((card) => card.querySelector("span")?.textContent?.trim() === "Гант")?.querySelector("strong")?.textContent?.trim());
  assert(gantt === "4/4", "Planning Workbench payload update must refresh Gantt readiness");
  await evaluate(client, () => document.querySelector('[data-ui-component="SidebarItem"]:not(.is-active)')?.click());
  await waitForCondition(client, () => Boolean(document.querySelector('[data-legacy-fallback="unsupported-scope"]')), { message: "Planning route selection did not return to legacy" });
  await client.send("Page.navigate", { url: `${origin}/?scenario=planning-workbench&react=0` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-legacy-fallback="disabled"]')), { message: "disabled Planning Workbench flag did not stay legacy" });
  assert(consoleProblems.length === 0, `browser console must stay clean:\n${consoleProblems.join("\n")}`);
  console.log("Planning Workbench React isolated browser QA: OK");
  console.log("- 3 work orders, 5 readiness metrics, 4 structure rows and 5 columns: pass");
  console.log("- revision 1 -> 2, legacy route fallback, no page overflow and clean console: pass");
} finally { if (chrome) await cleanupChrome(chrome); await stopServer(server); }
