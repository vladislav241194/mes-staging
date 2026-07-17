import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const filePath = fileURLToPath(new URL("./deploy-contour.mjs", import.meta.url));
const source = await readFile(filePath, "utf-8");
assert(source.includes('"npm ci"'), "Server deploy must synchronize the locked dependency set before its remote build");
assert(!source.includes('"npm ci --omit=dev"'), "Remote build must retain its build-time dependencies");
assert(source.includes("remote dependencies/build/restart"), "Server deploy must record the full restart stage");
assert(source.includes("sudo -n /usr/bin/systemctl restart"), "Server deploy must use the sudo-authorized systemctl path");
assert(source.includes('"ops"'), "Server deploy must ship inactive infrastructure bootstrap artifacts");
assert(source.includes('"db"'), "Server deploy must ship domain migration SQL required by the runtime migrator");
assert(!/remote build\/restart[\s\S]{0,500}allowFailure/.test(source), "Server restart failures must not be ignored");
console.log("Server deploy contract QA: OK");
