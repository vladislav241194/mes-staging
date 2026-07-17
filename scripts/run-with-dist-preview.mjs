import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const delimiterIndex = process.argv.indexOf("--");
const commandArgs = delimiterIndex >= 0 ? process.argv.slice(delimiterIndex + 1) : process.argv.slice(2);

if (!commandArgs.length) {
  console.error("Usage: node scripts/run-with-dist-preview.mjs -- <command> [args...]");
  process.exit(2);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

async function waitForPublicPreview(origin, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${origin}/?module=gantt&qa-auth-bypass=1`, { cache: "no-store" });
      const html = await response.text();
      if (response.ok && /MES Planning Module Prototype|id="app"/i.test(html) && !/MES Admin|Вход в админ-панель/i.test(html)) return;
    } catch {
      // The preview process is still starting.
    }
    await delay(120);
  }
  throw new Error(`Dist preview did not become ready at ${origin}`);
}

const port = await getFreePort();
const origin = `http://localhost:${port}`;
let output = "";
const preview = spawn(process.execPath, ["scripts/preview-dist.mjs"], {
  cwd: rootDir,
  env: {
    ...process.env,
    HOST: "localhost",
    PORT: String(port),
    MES_ADMIN_HOSTS: process.env.MES_ADMIN_HOSTS || "admin.mes-line.ru",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
preview.stdout.on("data", (chunk) => { output += chunk.toString(); });
preview.stderr.on("data", (chunk) => { output += chunk.toString(); });

function stopPreview() {
  if (preview.exitCode === null && !preview.killed) preview.kill("SIGTERM");
}

process.on("exit", stopPreview);
process.on("SIGINT", () => { stopPreview(); process.exit(130); });
process.on("SIGTERM", () => { stopPreview(); process.exit(143); });

try {
  await waitForPublicPreview(origin);
} catch (error) {
  stopPreview();
  console.error(error.message);
  if (output.trim()) console.error(output.trim());
  process.exit(1);
}

const child = spawn(commandArgs[0], commandArgs.slice(1), {
  cwd: rootDir,
  env: { ...process.env, MES_QA_URL: `${origin}/` },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  stopPreview();
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
