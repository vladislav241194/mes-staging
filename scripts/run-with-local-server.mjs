import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultUrl = process.env.MES_QA_URL || "http://localhost:4174/";
const delimiterIndex = process.argv.indexOf("--");
const commandArgs = delimiterIndex >= 0 ? process.argv.slice(delimiterIndex + 1) : process.argv.slice(2);

if (!commandArgs.length) {
  console.error("Usage: node scripts/run-with-local-server.mjs -- <command> [args...]");
  process.exit(2);
}

const targetUrl = new URL(defaultUrl);
const targetOrigin = targetUrl.origin;
let spawnedServer = null;
let serverOutput = "";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServerReachable() {
  try {
    const response = await fetch(targetOrigin, { cache: "no-store" });
    return response.status < 500;
  } catch {
    return false;
  }
}

function normalizeBuiltModuleSource(source = "") {
  return String(source || "").replace(/\.js\?v=[a-f0-9]+/g, ".js");
}

function normalizeBuiltCssSource(source = "") {
  return String(source || "").replace(/\.css\?v=[a-f0-9]+/g, ".css");
}

async function collectCssFiles(relativeDir = "styles") {
  const absoluteDir = resolve(rootDir, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await collectCssFiles(relativePath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".css")) files.push(relativePath);
  }
  return files;
}

async function isServedAppCurrent() {
  if (!["localhost", "127.0.0.1", "::1"].includes(targetUrl.hostname)) return true;
  try {
    const cssFiles = await collectCssFiles();
    const checks = await Promise.all([
      isServedTextCurrent("/src/app.js", "src/app.js", "dist/src/app.js", normalizeBuiltModuleSource),
      isServedTextCurrent("/styles.css", "styles.css", "dist/styles.css", normalizeBuiltCssSource),
      isServedTextCurrent("/workflow-preset.json", "workflow-preset.json", "", (value) => value),
      ...cssFiles.map((file) => isServedTextCurrent(`/${file}`, file, `dist/${file}`, normalizeBuiltCssSource)),
    ]);
    return checks.every(Boolean);
  } catch {
    return true;
  }
}

async function isServedTextCurrent(urlPath, sourcePath, distPath, normalize = (value) => value) {
  const [servedSource, sourceFile, distFile] = await Promise.all([
    fetch(new URL(urlPath, targetOrigin), { cache: "no-store" }).then((response) => response.ok ? response.text() : ""),
    readFile(resolve(rootDir, sourcePath), "utf8").catch(() => ""),
    readFile(resolve(rootDir, distPath), "utf8").catch(() => ""),
  ]);
  if (!sourceFile) return true;
  if (distFile && normalize(distFile) !== normalize(sourceFile)) return false;
  return Boolean(servedSource) && (servedSource === sourceFile || servedSource === distFile);
}

async function waitForServer(timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerReachable()) return true;
    await delay(160);
  }
  return false;
}

function stopSpawnedServer() {
  if (spawnedServer && spawnedServer.exitCode === null && !spawnedServer.killed) {
    spawnedServer.kill("SIGTERM");
  }
}

process.on("exit", stopSpawnedServer);
process.on("SIGINT", () => {
  stopSpawnedServer();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stopSpawnedServer();
  process.exit(143);
});

if (!(await isServerReachable())) {
  spawnedServer = spawn(process.execPath, ["server.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      HOST: targetUrl.hostname || "localhost",
      PORT: targetUrl.port || (targetUrl.protocol === "https:" ? "443" : "80"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  spawnedServer.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  spawnedServer.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  if (!(await waitForServer())) {
    stopSpawnedServer();
    console.error(`Local MES server did not start at ${targetOrigin}.`);
    if (serverOutput.trim()) console.error(serverOutput.trim());
    process.exit(1);
  }
}

if (!(await isServedAppCurrent())) {
  console.error(`Local MES server at ${targetOrigin} serves stale frontend assets.`);
  console.error("Run node scripts/build.mjs when using preview-dist, or stop the stale server so this wrapper can start a fresh server.");
  stopSpawnedServer();
  process.exit(1);
}

const child = spawn(commandArgs[0], commandArgs.slice(1), {
  cwd: rootDir,
  env: {
    ...process.env,
    MES_QA_URL: targetUrl.toString(),
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  stopSpawnedServer();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
