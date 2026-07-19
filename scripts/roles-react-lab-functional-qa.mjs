import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

import { cleanupChrome, evaluate, getFreePort, launchChrome, waitForCondition } from "./browser-cdp-qa-utils.mjs";

const distRoot = join(process.cwd(), "experiments", "react-migration", "dist");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function contentType(path) {
  if (extname(path) === ".js") return "text/javascript; charset=utf-8";
  if (extname(path) === ".css") return "text/css; charset=utf-8";
  if (extname(path) === ".map") return "application/json; charset=utf-8";
  return "text/html; charset=utf-8";
}

async function startServer(port) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`).pathname;
      const relative = pathname === "/" ? "index.html" : normalize(pathname).replace(/^[/\\]+/, "");
      if (relative.includes("..")) throw new Error("invalid path");
      const source = await readFile(join(distRoot, relative));
      response.writeHead(200, { "Content-Type": contentType(relative), "Cache-Control": "no-store" });
      response.end(source);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

async function stopServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function main() {
  const port = await getFreePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = await startServer(port);
  let chrome = null;
  const consoleProblems = [];
  try {
    chrome = await launchChrome("mes-roles-react-lab-qa-");
    const { client } = chrome;
    client.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method !== "Runtime.consoleAPICalled") return;
      if (!["error", "warning", "assert"].includes(message.params?.type)) return;
      consoleProblems.push((message.params.args || []).map((arg) => arg.value || arg.description || "").join(" "));
    });
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await client.send("Page.navigate", { url: `${origin}/?scenario=roles&lifecycle_qa=1` });
    await waitForCondition(client, () => Boolean(
      document.querySelector('[data-react-island-scenario="roles"][data-react-island-revision="1"]')
      && document.querySelectorAll('[data-ui-component="SidebarItem"]').length === 3
    ), { message: "Roles React lab did not render the initial role registry" });

    const initial = await evaluate(client, () => {
      const metrics = Object.fromEntries([...document.querySelectorAll('[data-ui-component="MetricCard"]')].map((card) => [
        card.querySelector("span")?.textContent?.trim() || "",
        card.querySelector("strong")?.textContent?.trim() || "",
      ]));
      return {
        title: document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() || "",
        roles: document.querySelectorAll('[data-ui-component="SidebarItem"]').length,
        moduleRows: document.querySelectorAll(".roles-grant-table tbody tr").length,
        assignmentRows: document.querySelectorAll(".roles-assignment-table tbody tr").length,
        actionDisabled: document.querySelector('[data-ui-component="ActionButton"]')?.disabled === true,
        metrics,
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        tableOwnsOverflow: [...document.querySelectorAll('[data-ui-component="TableWrap"]')].some((wrap) => wrap.scrollWidth > wrap.clientWidth),
      };
    });
    assert(initial.title === "Администратор", "first canonical role must be selected");
    assert(initial.roles === 3 && initial.moduleRows === 4 && initial.assignmentRows === 1, "roles, module matrix and explicit assignment counts must match the fixture");
    assert(initial.actionDisabled, "grant write command must remain disabled");
    assert(initial.metrics["Доступных модулей"] === "4" && initial.metrics["Явных grants"] === "6" && initial.metrics["Назначений"] === "1", "administrator metrics must match the canonical grants");
    assert(!initial.pageOverflow && initial.tableOwnsOverflow, "wide grants table must own overflow without widening the page");

    await evaluate(client, () => document.querySelector("[data-lifecycle-update]")?.click());
    await waitForCondition(client, () => Boolean(document.querySelector('[data-react-island-revision="2"]')), { message: "Roles payload update did not commit revision 2" });
    const updatedDescription = await evaluate(client, () => [...document.querySelectorAll('[data-ui-component="DetailPanel"] dd')][1]?.textContent?.trim() || "");
    assert(updatedDescription === "Полная настройка и аудит системы", "payload update must refresh the selected role passport without remounting");

    await evaluate(client, () => {
      const button = [...document.querySelectorAll('[data-ui-component="SidebarItem"]')]
        .find((entry) => entry.querySelector(".filter-copy > span")?.textContent?.trim() === "Мастер производства");
      button?.focus();
    });
    await client.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await client.send("Input.dispatchKeyEvent", { type: "char", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await waitForCondition(client, () => document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() === "Мастер производства", { message: "keyboard role selection did not update the passport" });
    const master = await evaluate(client, () => ({
      selectedCount: document.querySelectorAll('[data-ui-component="SidebarItem"].is-active').length,
      assignedName: document.querySelector(".roles-assignment-table tbody td")?.textContent?.trim() || "",
      yesCount: [...document.querySelectorAll(".roles-grant-table tbody td .status--success")].filter((item) => item.textContent?.trim() === "да").length,
    }));
    assert(master.selectedCount === 1 && master.assignedName === "Иванов Сергей", "master role selection and explicit employee assignment must stay synchronized");
    assert(master.yesCount === 4, "master must expose the four effective allowed actions from the canonical fixture");

    await evaluate(client, () => {
      const button = [...document.querySelectorAll('[data-ui-component="SidebarItem"]')]
        .find((entry) => entry.querySelector(".filter-copy > span")?.textContent?.trim() === "Аудитор");
      button?.click();
    });
    await waitForCondition(client, () => document.querySelector('[data-ui-component="DetailPanel"] h2')?.textContent?.trim() === "Аудитор", { message: "auditor role selection did not update the passport" });
    const auditor = await evaluate(client, () => ({
      yesCount: [...document.querySelectorAll(".roles-grant-table tbody td .status--success")].filter((item) => item.textContent?.trim() === "да").length,
      status: [...document.querySelectorAll('[data-ui-component="DetailPanel"] dd')].at(-1)?.textContent?.trim() || "",
      assignedName: document.querySelector(".roles-assignment-table tbody td")?.textContent?.trim() || "",
    }));
    assert(auditor.yesCount === 4 && auditor.status === "read-only", "auditor must retain only view/print grants and read-only status");
    assert(auditor.assignedName === "Орлова Марина", "auditor assignment must resolve the canonical employee");

    await client.send("Page.navigate", { url: `${origin}/?scenario=roles&access=editor` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-legacy-fallback="write-parity-incomplete"]')), { message: "editor access did not stay in legacy" });
    await client.send("Page.navigate", { url: `${origin}/?scenario=roles&react=0` });
    await waitForCondition(client, () => Boolean(document.querySelector('[data-legacy-fallback="disabled"]')), { message: "disabled Roles flag did not stay in legacy" });
    assert(consoleProblems.length === 0, `browser console must stay clean:\n${consoleProblems.join("\n")}`);
    console.log("Roles React isolated browser QA: OK");
    console.log("- 3 roles, 4 modules, six-action grants matrix: pass");
    console.log("- payload revision 1 -> 2 without remount: pass");
    console.log("- mouse/keyboard selection and employee assignments: pass");
    console.log("- editor and disabled flag remain legacy: pass");
    console.log("- table-owned overflow and clean console: pass");
  } finally {
    if (chrome) await cleanupChrome(chrome);
    await stopServer(server);
  }
}

await main();
