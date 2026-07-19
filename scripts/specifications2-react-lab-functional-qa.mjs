import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { cleanupChrome, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const distRoot = join(process.cwd(), "experiments", "react-migration", "dist");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const contentType = (path) => extname(path) === ".js" ? "text/javascript; charset=utf-8" : extname(path) === ".css" ? "text/css; charset=utf-8" : "text/html; charset=utf-8";
const port = await getFreePort();
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`).pathname;
    const relative = pathname === "/" ? "index.html" : normalize(pathname).replace(/^[/\\]+/, "");
    if (relative.includes("..")) throw new Error("invalid path");
    response.writeHead(200, { "Content-Type": contentType(relative), "Cache-Control": "no-store" });
    response.end(await readFile(join(distRoot, relative)));
  } catch { response.writeHead(404).end("Not found"); }
});
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
let chrome = null;
const consoleProblems = [];
try {
  chrome = await launchChrome("mes-specifications2-react-lab-qa-");
  const { client } = chrome;
  client.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(message.params?.type)) consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
  });
  await client.send("Page.enable"); await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 932, deviceScaleFactor: 1, mobile: false });
  const origin = `http://127.0.0.1:${port}`;
  await client.send("Page.navigate", { url: `${origin}/?scenario=specifications2&lifecycle_qa=1` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-island-scenario="specifications2"][data-react-island-revision="1"]')), { message: "Specifications 2.0 lab did not render" });
  const initial = await evaluate(client, () => ({ revision: document.querySelector("[data-specifications2-revision]")?.getAttribute("data-specifications2-revision"), rows: document.querySelectorAll("[data-specifications2-tree-row]").length, docs: document.querySelectorAll('[data-ui-component="SidebarItem"]').length, metrics: document.querySelectorAll('[data-ui-component="MetricCard"]').length, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
  assert(initial.revision === "revision-kt7-7" && initial.rows === 4 && initial.docs === 2 && initial.metrics === 4 && !initial.overflow, `Specifications 2.0 lab density failed: ${JSON.stringify(initial)}`);
  await evaluate(client, () => document.querySelector('[data-specifications2-tree-row="root"] button')?.click());
  await waitForCondition(client, () => document.querySelectorAll("[data-specifications2-tree-row]").length === 1, { message: "Specifications 2.0 tree collapse failed" });
  await evaluate(client, () => document.querySelector("[data-lifecycle-update]")?.click());
  await waitForCondition(client, () => Boolean(document.querySelector('[data-react-island-revision="2"]')) && document.querySelector("[data-specifications2-revision]")?.getAttribute("data-specifications2-revision") === "revision-kt7-8", { message: "Specifications 2.0 lifecycle update failed" });
  await evaluate(client, () => document.querySelector('[data-ui-component="ActionButton"]')?.click());
  await waitForCondition(client, () => Boolean(document.querySelector('[data-legacy-fallback="unsupported-scope"]')), { message: "Specifications 2.0 write action did not return to legacy" });
  await client.send("Page.navigate", { url: `${origin}/?scenario=specifications2&react=0` });
  await waitForCondition(client, () => Boolean(document.querySelector('[data-legacy-fallback="disabled"]')), { message: "disabled Specifications 2.0 flag did not stay legacy" });
  assert(consoleProblems.length === 0, `browser console must stay clean:\n${consoleProblems.join("\n")}`);
  console.log("Specifications 2.0 React isolated browser QA: OK");
  console.log("- PostgreSQL revision 7, 4 tree rows, collapse and revision 7 -> 8: pass");
  console.log("- write fallback, disabled flag, no page overflow and clean console: pass");
} finally {
  if (chrome) await cleanupChrome(chrome);
  await new Promise((resolve) => server.close(resolve));
}
