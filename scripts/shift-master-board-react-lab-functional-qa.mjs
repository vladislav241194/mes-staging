import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { cleanupChrome, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const distRoot = join(process.cwd(), "experiments", "react-migration", "dist");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const contentType = (path) => extname(path) === ".js" ? "text/javascript; charset=utf-8" : extname(path) === ".css" ? "text/css; charset=utf-8" : "text/html; charset=utf-8";
async function startServer(port) { const server = createServer(async (request, response) => { try { const pathname = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`).pathname; const relative = pathname === "/" ? "index.html" : normalize(pathname).replace(/^[/\\]+/, ""); if (relative.includes("..")) throw new Error("invalid path"); response.writeHead(200, { "Content-Type": contentType(relative), "Cache-Control": "no-store" }); response.end(await readFile(join(distRoot, relative))); } catch { response.writeHead(404).end("Not found"); } }); await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); }); return server; }
const stopServer = (server) => new Promise((resolve) => server.close(resolve));

const port = await getFreePort(); const server = await startServer(port); let chrome = null; const consoleProblems = [];
try {
  chrome = await launchChrome("mes-shift-master-board-react-lab-qa-"); const { client } = chrome;
  client.socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" ")); });
  await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });
  const origin = `http://127.0.0.1:${port}`; await client.send("Page.navigate", { url: `${origin}/?scenario=shift-master-board&lifecycle_qa=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-island-scenario="shiftMasterBoard"][data-react-island-revision="1"]')), { message: "Shift Master Board lab did not render" });
  const initial = await evaluate(client, () => ({ lanes: document.querySelectorAll("[data-shift-master-board-lane]").length, cards: document.querySelectorAll("[data-shift-master-board-card]").length, selected: document.querySelector('[data-shift-master-board-card][aria-pressed="true"]')?.getAttribute("data-shift-master-board-card"), detail: document.querySelector("[data-shift-master-board-detail]")?.getAttribute("data-shift-master-board-detail"), metrics: document.querySelectorAll('[data-ui-component="MetricCard"]').length, actions: document.querySelectorAll('[data-ui-component="ActionButton"]').length, pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
  assert(initial.lanes === 4 && initial.cards === 4 && initial.selected === "assigned" && initial.detail === "assigned", "Shift Master Board lane/card/default selection parity failed");
  assert(initial.metrics === 7 && initial.actions === 3 && !initial.pageOverflow, "Shift Master Board metrics/actions/overflow contract failed");
  await evaluate(client, () => document.querySelector('[data-shift-master-board-card="fact"]')?.click()); await waitForCondition(client, () => document.querySelector("[data-shift-master-board-detail]")?.getAttribute("data-shift-master-board-detail") === "fact", { message: "Shift Master Board local card selection failed" });
  await evaluate(client, () => document.querySelector("[data-lifecycle-update]")?.click()); await waitForCondition(client, () => Boolean(document.querySelector('[data-react-island-revision="2"]')), { message: "Shift Master Board update did not commit" });
  await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="ActionButton"]')].find((button) => button.textContent?.includes("Распределить"))?.click()); await waitForCondition(client, () => Boolean(document.querySelector('[data-legacy-fallback="unsupported-scope"]')), { message: "Shift Master Board assignment action did not return to legacy" });
  await client.send("Page.navigate", { url: `${origin}/?scenario=shift-master-board&react=0` }); await waitForCondition(client, () => Boolean(document.querySelector('[data-legacy-fallback="disabled"]')), { message: "disabled Shift Master Board flag did not stay legacy" });
  assert(consoleProblems.length === 0, `browser console must stay clean:\n${consoleProblems.join("\n")}`);
  console.log("Shift Master Board React isolated browser QA: OK");
  console.log("- 4 lanes, 4 cards, 7 metrics, local selection and revision 1 -> 2: pass");
  console.log("- assignment fallback, disabled flag, no page overflow and clean console: pass");
} finally { if (chrome) await cleanupChrome(chrome); await stopServer(server); }
