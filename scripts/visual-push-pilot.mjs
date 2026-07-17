#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultCssPath = join(projectRoot, "styles", "visual-overrides.live.css");
const reportPath = join(projectRoot, "reports", "visual-push-last-run.json");
const sshControlPath = join(process.env.HOME || "/tmp", ".ssh", "mes-codex-%C");
const sshOptions = [
  "-o", "ControlMaster=auto",
  "-o", "ControlPersist=60",
  "-o", `ControlPath=${sshControlPath}`,
];

function parseArgs(argv) {
  const parsed = {
    module: "shiftMasterBoard",
    file: defaultCssPath,
    remote: "mes-line",
    targetDirs: [
      "/srv/mes/pilot/app/styles",
      "/srv/mes/pilot/app/dist/styles",
    ],
    dryRun: false,
  };

  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=");
    const value = rawValue ?? true;
    if (key === "module") parsed.module = String(value);
    else if (key === "file") parsed.file = resolve(projectRoot, String(value));
    else if (key === "remote") parsed.remote = String(value);
    else if (key === "target-dir") parsed.targetDirs = [String(value)];
    else if (key === "dry-run") parsed.dryRun = true;
    else throw new Error(`Unknown option: --${key}`);
  }

  return parsed;
}

function shellQuote(value = "") {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function runCommand(label, command, args) {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: projectRoot });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({
        label,
        command,
        args,
        code,
        stdout,
        stderr,
        durationMs: performance.now() - startedAt,
      });
    });
  });
}

function summarizeRsync(output = "") {
  const lines = output.split(/\r?\n/).filter(Boolean);
  const fileLine = lines.find((line) => /Number of files transferred:/i.test(line)) || "";
  const bytesLine = lines.find((line) => /Total transferred file size:/i.test(line)) || "";
  const sentLine = lines.find((line) => /^sent\s+/i.test(line)) || "";
  return { fileLine, bytesLine, sentLine };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = performance.now();
  await stat(args.file);
  await mkdir(dirname(reportPath), { recursive: true });

  const steps = [];
  steps.push(await runCommand("remote mkdir", "ssh", [
    ...sshOptions,
    args.remote,
    `mkdir -p ${args.targetDirs.map(shellQuote).join(" ")}`,
  ]));
  if (steps.at(-1).code !== 0) throw new Error(steps.at(-1).stderr || "remote mkdir failed");

  for (const targetDir of args.targetDirs) {
    const rsyncArgs = [
      "-azc",
      "-e",
      ["ssh", ...sshOptions.map(shellQuote)].join(" "),
      "--itemize-changes",
      "--stats",
    ];
    if (args.dryRun) rsyncArgs.push("--dry-run");
    rsyncArgs.push(args.file, `${args.remote}:${targetDir}/visual-overrides.live.css`);
    steps.push(await runCommand(`rsync live visual CSS -> ${targetDir}`, "rsync", rsyncArgs));
    if (steps.at(-1).code !== 0) throw new Error(steps.at(-1).stderr || `rsync failed: ${targetDir}`);
  }

  const url = `https://pilot.mes-line.ru/?module=${encodeURIComponent(args.module)}&qa-auth-bypass=1`;
  const report = {
    status: "ok",
    mode: "visual-live-pilot",
    warning: "Pilot-only live visual override. No build, no version bump, no final publication.",
    module: args.module,
    file: args.file,
    targets: args.targetDirs.map((targetDir) => `${args.remote}:${targetDir}/visual-overrides.live.css`),
    url,
    dryRun: args.dryRun,
    totalMs: performance.now() - startedAt,
    steps: steps.map((step) => ({
      label: step.label,
      code: step.code,
      durationMs: step.durationMs,
      rsync: step.label.includes("rsync") ? summarizeRsync(`${step.stdout}\n${step.stderr}`) : null,
    })),
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log("MES visual live pilot");
  console.log(`- mode: ${report.mode}`);
  console.log(`- file: ${args.file}`);
  console.log(`- targets: ${report.targets.join(", ")}`);
  console.log(`- total: ${(report.totalMs / 1000).toFixed(2)}s`);
  console.log(`- url: ${url}`);
  console.log(`- report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
