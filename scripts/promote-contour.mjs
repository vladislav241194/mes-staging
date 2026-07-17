#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportsDir = join(projectRoot, "reports");
const lastReportPath = join(reportsDir, "promote-iteration-last-run.json");
const historyPath = join(reportsDir, "deploy-history.jsonl");
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
    releasesPath: "/srv/mes/pilot/releases",
    url: "https://pilot.mes-line.ru",
  },
  staging: {
    id: "staging",
    appPath: "/srv/mes/dev/app",
    releasesPath: "/srv/mes/dev/releases",
    url: "https://staging.mes-line.ru",
  },
};

function parseArgs(argv) {
  const parsed = {
    action: "promote",
    from: "pilot",
    to: "staging",
    remote: "mes-line",
    module: "gantt",
    dryRun: false,
  };

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      parsed.action = arg;
      continue;
    }

    const [key, rawValue] = arg.slice(2).split("=");
    const value = rawValue ?? true;
    if (key === "action") parsed.action = String(value);
    else if (key === "from") parsed.from = String(value);
    else if (key === "to") parsed.to = String(value);
    else if (key === "remote") parsed.remote = String(value);
    else if (key === "module") parsed.module = String(value);
    else if (key === "release-id") parsed.releaseId = String(value);
    else if (key === "dry-run") parsed.dryRun = true;
    else throw new Error(`Unknown option: --${key}`);
  }

  return parsed;
}

function formatMs(ms) {
  if (!Number.isFinite(ms)) return "-";
  return `${(ms / 1000).toFixed(2)}s`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function sshCommandArgs(remote, remoteCommand) {
  return [...sshOptions, remote, remoteCommand];
}

function isLocalRemote(remote) {
  return remote === "local" || remote === "localhost" || remote === ".";
}

function releaseId(prefix = "release") {
  return `${prefix}-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
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
      const result = { label, command: [command, ...args].join(" "), code, durationMs, stdout, stderr };
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

async function runSsh(label, remote, command, options = {}) {
  if (isLocalRemote(remote)) {
    return await runCommand(label, "bash", ["-lc", command], options);
  }
  return await runCommand(label, "ssh", sshCommandArgs(remote, command), options);
}

async function getRemoteText(label, remote, command, options = {}) {
  const result = await runSsh(label, remote, command, options);
  return { ...result, text: result.stdout.trim() };
}

function remoteDistSignature(contour) {
  const distPath = `${contour.appPath}/dist`;
  return [
    `cd ${shellQuote(distPath)}`,
    "find . -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}'",
  ].join(" && ");
}

function promoteCommand(source, target, backupPath, releaseManifestPath, manifestJson, dryRun) {
  const sourceDist = `${source.appPath}/dist/`;
  const targetDist = `${target.appPath}/dist/`;
  const dryRunFlag = dryRun ? " --dry-run" : "";
  return [
    `test -d ${shellQuote(source.appPath)}`,
    `test -d ${shellQuote(source.appPath + "/dist")}`,
    `test -d ${shellQuote(target.appPath)}`,
    `mkdir -p ${shellQuote(dirnameRemote(backupPath))} ${shellQuote(dirnameRemote(releaseManifestPath))}`,
    dryRun
      ? `rsync -a --delete --checksum --itemize-changes${dryRunFlag} ${shellQuote(targetDist)} ${shellQuote(backupPath + "/")}`
      : `rsync -a --delete --checksum ${shellQuote(targetDist)} ${shellQuote(backupPath + "/")}`,
    `rsync -a --delete --checksum --itemize-changes${dryRunFlag} ${shellQuote(sourceDist)} ${shellQuote(targetDist)}`,
    dryRun ? "true" : `cat > ${shellQuote(releaseManifestPath)} <<'MES_RELEASE_JSON'\n${manifestJson}\nMES_RELEASE_JSON`,
  ].join(" && ");
}

function rollbackCommand(target, backupPath, releaseManifestPath, manifestJson, dryRun) {
  const targetDist = `${target.appPath}/dist/`;
  const dryRunFlag = dryRun ? " --dry-run" : "";
  return [
    `test -d ${shellQuote(backupPath)}`,
    `test -d ${shellQuote(target.appPath)}`,
    `rsync -a --delete --checksum --itemize-changes${dryRunFlag} ${shellQuote(backupPath + "/")} ${shellQuote(targetDist)}`,
    dryRun ? "true" : `cat > ${shellQuote(releaseManifestPath)} <<'MES_RELEASE_JSON'\n${manifestJson}\nMES_RELEASE_JSON`,
  ].join(" && ");
}

function dirnameRemote(path) {
  const index = String(path).lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : ".";
}

async function readLastRemoteManifest(remote, contour) {
  const path = `${contour.releasesPath}/release-manifest.json`;
  const result = await getRemoteText(
    "read remote manifest",
    remote,
    `test -f ${shellQuote(path)} && cat ${shellQuote(path)} || true`,
    { allowFailure: true },
  );
  if (!result.text) return null;
  try {
    return JSON.parse(result.text);
  } catch {
    return null;
  }
}

async function writeReports(report) {
  await mkdir(reportsDir, { recursive: true });
  await writeFile(lastReportPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(historyPath, `${JSON.stringify(report)}\n`, { flag: "a" });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = performance.now();
  const source = CONTOURS[args.from];
  const target = CONTOURS[args.to];
  if (!target) throw new Error(`Unknown target contour "${args.to}"`);

  const steps = [];
  const id = args.releaseId || releaseId(args.action);
  const verifyUrl = `${target.url}/?module=${encodeURIComponent(args.module)}&__mes_cache_refresh=${encodeURIComponent(id)}`;
  const manifestPath = `${target.releasesPath}/release-manifest.json`;
  const backupPath = `${target.releasesPath}/dist-backups/${id}-pre`;
  const beforeTargetSignature = await getRemoteText("target signature before", args.remote, remoteDistSignature(target), { allowFailure: true });
  const sourceSignature = source
    ? await getRemoteText("source signature", args.remote, remoteDistSignature(source), { allowFailure: true })
    : null;

  console.log(`MES promotion`);
  console.log(`- action: ${args.action}${args.dryRun ? " dry-run" : ""}`);
  if (args.action === "promote") console.log(`- from: ${args.from}`);
  console.log(`- to: ${args.to}`);
  console.log(`- verify: ${verifyUrl}`);

  let command;
  let previousManifest = null;
  if (args.action === "promote") {
    if (!source) throw new Error(`Unknown source contour "${args.from}"`);
    const plannedManifest = {
      releaseId: id,
      action: "promote",
      from: source.id,
      to: target.id,
      createdAt: new Date().toISOString(),
      sourceDist: `${source.appPath}/dist`,
      targetDist: `${target.appPath}/dist`,
      rollbackDist: backupPath,
      sourceSignatureBefore: sourceSignature?.text || "",
      targetSignatureBefore: beforeTargetSignature.text || "",
      verifyUrl,
    };
    command = promoteCommand(source, target, backupPath, manifestPath, JSON.stringify(plannedManifest, null, 2), args.dryRun);
  } else if (args.action === "rollback") {
    previousManifest = await readLastRemoteManifest(args.remote, target);
    const rollbackDist = previousManifest?.rollbackDist;
    if (!rollbackDist) {
      throw new Error(`No rollbackDist found in ${manifestPath}`);
    }
    const plannedManifest = {
      releaseId: id,
      action: "rollback",
      to: target.id,
      createdAt: new Date().toISOString(),
      restoredFrom: rollbackDist,
      previousReleaseId: previousManifest.releaseId || "",
      targetSignatureBefore: beforeTargetSignature.text || "",
      verifyUrl,
    };
    command = rollbackCommand(target, rollbackDist, manifestPath, JSON.stringify(plannedManifest, null, 2), args.dryRun);
  } else {
    throw new Error(`Unknown action "${args.action}". Use promote or rollback.`);
  }

  steps.push(await runSsh(args.action, args.remote, command));

  const afterTargetSignature = await getRemoteText("target signature after", args.remote, remoteDistSignature(target), { allowFailure: true });
  if (!args.dryRun) {
    steps.push(await runCommand("verify", "curl", ["-fsSI", verifyUrl]));
  }

  const report = {
    createdAt: new Date().toISOString(),
    releaseId: id,
    action: args.action,
    dryRun: args.dryRun,
    from: args.from,
    to: args.to,
    verifyUrl,
    sourceSignatureBefore: sourceSignature?.text || "",
    targetSignatureBefore: beforeTargetSignature.text || "",
    targetSignatureAfter: afterTargetSignature.text || "",
    changed: beforeTargetSignature.text !== afterTargetSignature.text,
    totalMs: performance.now() - startedAt,
    steps: steps.map((step) => ({
      label: step.label,
      code: step.code,
      durationMs: step.durationMs,
    })),
  };

  await writeReports(report);

  console.log("");
  console.log("Promotion timings:");
  for (const step of steps) {
    console.log(`- ${step.label}: ${formatMs(step.durationMs)}`);
  }
  console.log(`- changed: ${report.changed ? "yes" : "no"}`);
  console.log(`- total: ${formatMs(report.totalMs)}`);
  console.log(`- report: ${lastReportPath}`);
}

main().catch((error) => {
  console.error(error.message);
  if (error.result) {
    if (error.result.stdout) console.error(error.result.stdout.trim());
    if (error.result.stderr) console.error(error.result.stderr.trim());
  }
  process.exit(1);
});
