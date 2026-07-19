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
  chrome = await launchChrome("mes-timesheet-react-lab-qa-"); const { client } = chrome;
  client.socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" ")); });
  await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });
  const origin = `http://127.0.0.1:${port}`;
  await client.send("Page.navigate", { url: `${origin}/?scenario=timesheet&lifecycle_qa=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-island-scenario="timesheet"][data-react-island-revision="1"]')), { message: "Timesheet lab did not render" });
  const initial = await evaluate(client, () => ({
    employees: document.querySelectorAll("[data-timesheet-employee]").length,
    departments: document.querySelectorAll("[data-timesheet-department]").length,
    cells: document.querySelectorAll("[data-timesheet-cell]").length,
    headers: document.querySelectorAll(".timesheet-table thead th").length,
    metrics: Object.fromEntries([...document.querySelectorAll('[data-ui-component="MetricCard"]')].map((card) => [card.querySelector("span")?.textContent?.trim(), card.querySelector("strong")?.textContent?.trim()])),
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    tableOwnsOverflow: [...document.querySelectorAll('[data-ui-component="TableWrap"]')].some((wrap) => wrap.scrollWidth > wrap.clientWidth),
  }));
  assert(initial.employees === 3 && initial.departments === 2 && initial.cells === 21 && initial.headers === 12, "Timesheet fixture density must survive rendering");
  assert(initial.metrics["Сотрудников"] === "3" && initial.metrics["План часов"] === "120" && initial.metrics["Сверхурочно"] === "2", "Timesheet summary must match the model");
  assert(!initial.pageOverflow && initial.tableOwnsOverflow, "Timesheet matrix must own horizontal overflow");
  await evaluate(client, () => document.querySelector("[data-lifecycle-update]")?.click());
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-island-revision="2"]')), { message: "Timesheet update did not commit" });
  const overtime = await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="MetricCard"]')].find((card) => card.querySelector("span")?.textContent?.trim() === "Сверхурочно")?.querySelector("strong")?.textContent?.trim());
  assert(overtime === "3", "Timesheet payload update must refresh overtime without remount");
  await evaluate(client, () => document.querySelector("[data-timesheet-cell] button")?.click());
  await waitForCondition(client, () => Boolean(document.querySelector('[data-legacy-fallback="unsupported-scope"]')), { message: "Timesheet editor request did not return to legacy" });
  await client.send("Page.navigate", { url: `${origin}/?scenario=timesheet&react=0` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-legacy-fallback="disabled"]')), { message: "disabled Timesheet flag did not stay legacy" });
  assert(consoleProblems.length === 0, `browser console must stay clean:\n${consoleProblems.join("\n")}`);
  console.log("Timesheet React isolated browser QA: OK");
  console.log("- 3 employees, 2 departments, seven days and 21 cells: pass");
  console.log("- summary and payload revision 1 -> 2: pass");
  console.log("- editor fallback, table-owned overflow and clean console: pass");
} finally { if (chrome) await cleanupChrome(chrome); await stopServer(server); }
