#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = join(projectRoot, "reports", "deploy-iteration-last-run.json");
const sshControlPath = join(process.env.HOME || "/tmp", ".ssh", "mes-codex-%C");
const sshOptions = [
  "-o", "ControlMaster=auto",
  "-o", "ControlPersist=60",
  "-o", `ControlPath=${sshControlPath}`,
];

const CONTOURS = {
  pilot: {
    id: "pilot",
    appPath: "/srv/mes/pilot/app",
    service: "mes-pilot",
    url: "https://pilot.mes-line.ru",
  },
  staging: {
    id: "staging",
    appPath: "/srv/mes/dev/app",
    service: "mes-dev",
    url: "https://staging.mes-line.ru",
  },
};

// `ops` contains inactive, root-only bootstrap artifacts. Shipping them with
// source makes a future controlled infrastructure bootstrap reproducible;
// deploy never executes anything from this directory.
// `db` is runtime input for controlled domain migrations, not build-only data.
// It must accompany the migration runner on server-mode deploys.
const SOURCE_DIRS = ["src", "styles", "scripts", "assets", "ops", "db"];
const SOURCE_FILES = [
  "app-version.json",
  "index.html",
  "styles.css",
  "favicon.svg",
  "server.js",
  "package.json",
  "package-lock.json",
  "bootstrap-snapshot.json",
  "mes-planning-prototype.png",
];

function parseArgs(argv) {
  const parsed = {
    _: [],
    build: true,
    dist: true,
    source: true,
    restart: false,
    dryRun: false,
    sourceDelete: false,
    module: "gantt",
    remote: "mes-line",
    mode: "static",
    expectStatus: "",
  };

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }

    const [key, rawValue] = arg.slice(2).split("=");
    const value = rawValue ?? true;

    if (key === "no-build") parsed.build = false;
    else if (key === "no-dist") parsed.dist = false;
    else if (key === "no-source") parsed.source = false;
    else if (key === "restart") parsed.restart = true;
    else if (key === "dry-run") parsed.dryRun = true;
    else if (key === "source-delete") parsed.sourceDelete = true;
    else if (key === "contour") parsed.contour = String(value);
    else if (key === "mode") parsed.mode = String(value);
    else if (key === "module") parsed.module = String(value);
    else if (key === "remote") parsed.remote = String(value);
    else if (key === "url") parsed.url = String(value);
    else if (key === "expect-status") parsed.expectStatus = String(value);
    else throw new Error(`Unknown option: --${key}`);
  }

  if (!parsed.contour && parsed._[0]) parsed.contour = parsed._[0];
  if (!parsed.contour) parsed.contour = "pilot";
  if (parsed.mode === "dist-only") parsed.source = false;
  if (parsed.mode === "source-only") parsed.dist = false;
  if (parsed.mode === "server") parsed.restart = true;

  return parsed;
}

function formatMs(ms) {
  if (!Number.isFinite(ms)) return "-";
  return `${(ms / 1000).toFixed(2)}s`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(label, command, args, options = {}) {
  const startedAt = performance.now();

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const durationMs = performance.now() - startedAt;
      const result = {
        label,
        command: [command, ...args].join(" "),
        code,
        durationMs,
        stdout,
        stderr,
      };

      if (code !== 0 && !options.allowFailure) {
        const error = new Error(`${label} failed with code ${code}`);
        error.result = result;
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyUrlWithRetry(url, { attempts = 6, delayMs = 600, expectStatus = "200" } = {}) {
  const expectedStatuses = new Set(
    String(expectStatus || "200")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0),
  );
  let lastResult = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await runCommand(
      `verify${attempt > 1 ? ` retry ${attempt}` : ""}`,
      "curl",
      ["-sSI", "-o", "/dev/null", "-w", "%{http_code}", url],
      { allowFailure: true },
    );
    const statusCode = Number(String(result.stdout || "").trim());
    lastResult = { ...result, attempts: attempt, statusCode };
    if (result.code === 0 && expectedStatuses.has(statusCode)) return lastResult;
    if (attempt < attempts) await sleep(delayMs * attempt);
  }

  const expected = Array.from(expectedStatuses).join(",");
  const actual = lastResult?.statusCode || `curl:${lastResult?.code ?? "unknown"}`;
  const error = new Error(`verify expected status ${expected}, got ${actual} after ${lastResult?.attempts || attempts} attempts`);
  error.result = lastResult;
  throw error;
}

function sshCommandArgs(remote, remoteCommand) {
  return [...sshOptions, remote, remoteCommand];
}

function rsyncSshTransport() {
  return ["ssh", ...sshOptions.map((option) => shellQuote(option))].join(" ");
}

function summarizeRsync(output = "") {
  const lines = output.split(/\r?\n/).filter(Boolean);
  const changed = lines.filter((line) => (
    /^[<>ch.*]/.test(line) ||
    line.startsWith("*deleting")
  ));
  const fileCountLine = lines.find((line) => /Number of files:/i.test(line));
  const filesTransferredLine = lines.find((line) => /Number of files transferred:/i.test(line));
  const transferredLine = lines.find((line) => /Number of regular files transferred/i.test(line));
  const bytesLine = lines.find((line) => /Total transferred file size/i.test(line));
  const sentLine = lines.find((line) => /^sent\s+/i.test(line));
  return {
    touchedItems: changed.length,
    fileCountLine: fileCountLine || "",
    filesTransferredLine: filesTransferredLine || transferredLine || "",
    transferredLine: transferredLine || "",
    bytesLine: bytesLine || "",
    sentLine: sentLine || "",
  };
}

async function rsyncPath(label, source, target, { deleteTarget = false, dryRun = false } = {}) {
  const args = [
    "-azc",
    "-e",
    rsyncSshTransport(),
    "--itemize-changes",
    "--stats",
  ];
  if (deleteTarget) args.push("--delete");
  if (dryRun) args.push("--dry-run");
  args.push(...(Array.isArray(source) ? source : [source]), target);

  const result = await runCommand(label, "rsync", args);
  return {
    ...result,
    rsync: summarizeRsync(`${result.stdout}\n${result.stderr}`),
  };
}

async function getGitToken() {
  const hash = await runCommand("git hash", "git", ["rev-parse", "--short", "HEAD"], { allowFailure: true });
  const dirty = await runCommand("git dirty", "git", ["status", "--short"], { allowFailure: true });
  const cleanHash = hash.code === 0 ? hash.stdout.trim() : "nogit";
  return `${cleanHash}${dirty.stdout.trim() ? "-dirty" : ""}`;
}

function makeCacheToken(contourId, gitToken) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `${contourId}-${stamp}-${gitToken}`.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function getVerifyBaseUrl(contour, moduleId) {
  return moduleId === "contourAdmin" ? "https://admin.mes-line.ru" : contour.url;
}

function getExpectedVerifyStatus(args) {
  if (args.expectStatus) return args.expectStatus;
  return args.module === "contourAdmin" ? "200,302,401" : "200,302";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const contour = CONTOURS[args.contour];
  if (!contour) {
    throw new Error(`Unknown contour "${args.contour}". Use: ${Object.keys(CONTOURS).join(", ")}`);
  }

  const runStartedAt = performance.now();
  const steps = [];
  const gitToken = await getGitToken();
  const cacheToken = makeCacheToken(contour.id, gitToken);
  const verifyBaseUrl = getVerifyBaseUrl(contour, args.module);
  const verifyUrl = args.url || `${verifyBaseUrl}/?module=${encodeURIComponent(args.module)}&__mes_cache_refresh=${encodeURIComponent(cacheToken)}`;
  const expectStatus = getExpectedVerifyStatus(args);

  console.log(`MES fast deploy`);
  console.log(`- contour: ${contour.id}`);
  console.log(`- mode: ${args.mode}${args.dryRun ? " dry-run" : ""}`);
  console.log(`- target: ${args.remote}:${contour.appPath}`);
  console.log(`- verify: ${verifyUrl}`);
  console.log(`- expect status: ${expectStatus}`);

  if (args.build) {
    steps.push(await runCommand("local build", "npm", ["run", "build"]));
  }

  steps.push(await runCommand(
    "remote mkdir",
    "ssh",
    sshCommandArgs(
      args.remote,
      [
        `mkdir -p ${shellQuote(contour.appPath)}`,
        `mkdir -p ${shellQuote(join(contour.appPath, "dist"))}`,
        ...SOURCE_DIRS.map((dir) => `mkdir -p ${shellQuote(join(contour.appPath, dir))}`),
      ].join(" && "),
    ),
  ));

  if (args.source) {
    if (args.sourceDelete) {
      for (const dir of SOURCE_DIRS) {
        if (!(await pathExists(join(projectRoot, dir)))) continue;
        steps.push(await rsyncPath(
          `source:${dir}`,
          `${dir}/`,
          `${args.remote}:${contour.appPath}/${dir}/`,
          { deleteTarget: true, dryRun: args.dryRun },
        ));
      }

      for (const file of SOURCE_FILES) {
        if (!(await pathExists(join(projectRoot, file)))) continue;
        steps.push(await rsyncPath(
          `source:${file}`,
          file,
          `${args.remote}:${contour.appPath}/${file}`,
          { dryRun: args.dryRun },
        ));
      }
    } else {
      const sourcePaths = [];
      for (const dir of SOURCE_DIRS) {
        if (await pathExists(join(projectRoot, dir))) sourcePaths.push(dir);
      }
      for (const file of SOURCE_FILES) {
        if (await pathExists(join(projectRoot, file))) sourcePaths.push(file);
      }
      if (sourcePaths.length) {
        steps.push(await rsyncPath(
          "source",
          sourcePaths,
          `${args.remote}:${contour.appPath}/`,
          { dryRun: args.dryRun },
        ));
      }
    }
  }

  if (args.dist) {
    steps.push(await rsyncPath(
      "dist",
      "dist/",
      `${args.remote}:${contour.appPath}/dist/`,
      { deleteTarget: true, dryRun: args.dryRun },
    ));
    if (!args.source) {
      steps.push(await rsyncPath(
        "dist:runtime-root",
        "dist/",
        `${args.remote}:${contour.appPath}/`,
        { dryRun: args.dryRun },
      ));
    }
  }

  if (args.restart && !args.dryRun) {
    steps.push(await runCommand(
      "remote dependencies/build/restart",
      "ssh",
      sshCommandArgs(
        args.remote,
        [
          `cd ${shellQuote(contour.appPath)}`,
          // Remote build uses esbuild from devDependencies. Use the complete
          // lockfile here; the production service itself serves prebuilt dist.
          // This keeps the restart path reproducible when build tooling changes.
          "npm ci",
          "npm run build",
          // The pilot sudo policy intentionally allows this exact binary only.
          `sudo -n /usr/bin/systemctl restart ${shellQuote(contour.service)}`,
        ].join(" && "),
      ),
    ));
  }

  if (!args.dryRun) {
    steps.push(await verifyUrlWithRetry(verifyUrl, { expectStatus }));
  }

  const totalMs = performance.now() - runStartedAt;
  const report = {
    createdAt: new Date().toISOString(),
    contour: contour.id,
    mode: args.mode,
    dryRun: args.dryRun,
    sourceDelete: args.sourceDelete,
    target: `${args.remote}:${contour.appPath}`,
    verifyUrl,
    totalMs,
    steps: steps.map((step) => ({
      label: step.label,
      code: step.code,
      durationMs: step.durationMs,
      rsync: step.rsync || null,
    })),
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log("");
  console.log("Fast deploy timings:");
  for (const step of steps) {
    const extra = step.rsync
      ? ` · ${step.rsync.filesTransferredLine || `touched ${step.rsync.touchedItems}`}; ${step.rsync.bytesLine || "bytes n/a"}`
      : "";
    console.log(`- ${step.label}: ${formatMs(step.durationMs)}${extra}`);
  }
  console.log(`- total: ${formatMs(totalMs)}`);
  console.log(`- report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error.message);
  if (error.result) {
    if (error.result.stdout) console.error(error.result.stdout.trim());
    if (error.result.stderr) console.error(error.result.stderr.trim());
  }
  process.exit(1);
});
