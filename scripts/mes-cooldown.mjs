#!/usr/bin/env node
import { execFile } from "node:child_process";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const portArg = getArgValue("--ports") || process.env.MES_COOLDOWN_PORTS || "4173,4174,4175,4292";
const ports = portArg
  .split(",")
  .map((port) => Number(String(port).trim()))
  .filter((port) => Number.isInteger(port) && port > 0);

const qaChromeProfilePattern = /--user-data-dir=(?:"([^"]+)"|'([^']+)'|([^ ]+))/;
const mesQaProfilePattern = new RegExp(`${escapeRegExp(sep)}mes-[a-z0-9-]*(?:qa|audit|functional|phase|coverage|consistency)[a-z0-9-]*-`, "i");

function getArgValue(name) {
  const prefix = `${name}=`;
  const arg = args.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolve) => {
    execFile(command, commandArgs, { timeout: options.timeoutMs || 5000 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
        error,
      });
    });
  });
}

function parseProcessLine(line) {
  const match = String(line || "").trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(.+)$/);
  if (!match) return null;
  return {
    pid: Number(match[1]),
    ppid: Number(match[2]),
    cpu: Number(match[3]),
    mem: Number(match[4]),
    command: match[5],
  };
}

async function getProcessInfo(pid) {
  const result = await run("ps", ["-p", String(pid), "-o", "pid=", "-o", "ppid=", "-o", "pcpu=", "-o", "pmem=", "-o", "command="]);
  if (!result.ok || !result.stdout.trim()) return null;
  return parseProcessLine(result.stdout);
}

async function getProcessCwd(pid) {
  const result = await run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { timeoutMs: 3000 });
  if (!result.ok) return "";
  const line = result.stdout.split("\n").find((item) => item.startsWith("n"));
  return line ? line.slice(1).trim() : "";
}

function isInsideProject(cwd) {
  if (!cwd) return false;
  const resolved = resolve(cwd);
  return resolved === projectRoot || resolved.startsWith(`${projectRoot}${sep}`);
}

function isMesNodeCommand(command) {
  return /\bnode\b/.test(command)
    && /(server\.js|scripts\/preview-dist\.mjs|scripts\/run-with-local-server\.mjs|preview-dist\.mjs|run-with-local-server\.mjs)/.test(command);
}

async function collectPortCandidates() {
  const candidates = [];
  const skipped = [];
  const seen = new Set();

  for (const port of ports) {
    const result = await run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { timeoutMs: 3000 });
    const pids = result.stdout
      .split(/\s+/)
      .map((value) => Number(value))
      .filter(Boolean);

    for (const pid of pids) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      const [info, cwd] = await Promise.all([getProcessInfo(pid), getProcessCwd(pid)]);
      if (!info) continue;
      const candidate = {
        ...info,
        cwd,
        reason: `local MES listener on port ${port}`,
      };
      if (isInsideProject(cwd) && isMesNodeCommand(info.command)) candidates.push(candidate);
      else skipped.push(candidate);
    }
  }

  return { candidates, skipped };
}

async function collectHeadlessQaCandidates() {
  const result = await run("ps", ["-axo", "pid=", "-o", "ppid=", "-o", "pcpu=", "-o", "pmem=", "-o", "command="], { timeoutMs: 5000 });
  if (!result.ok) return [];
  return result.stdout
    .split("\n")
    .map(parseProcessLine)
    .filter(Boolean)
    .filter((info) => info.pid !== process.pid)
    .filter((info) => /--remote-debugging-port=/.test(info.command))
    .map((info) => {
      const profile = info.command.match(qaChromeProfilePattern);
      return {
        ...info,
        qaProfile: profile ? profile[1] || profile[2] || profile[3] || "" : "",
        reason: "headless MES QA browser",
      };
    })
    .filter((info) => mesQaProfilePattern.test(info.qaProfile));
}

function uniqueCandidates(items) {
  const map = new Map();
  for (const item of items) map.set(item.pid, item);
  return [...map.values()].sort((a, b) => a.pid - b.pid);
}

async function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function terminate(candidate) {
  if (dryRun) return "dry-run";
  try {
    process.kill(candidate.pid, "SIGTERM");
  } catch (error) {
    return error?.code === "ESRCH" ? "already stopped" : `failed: ${error.message}`;
  }

  await new Promise((resolve) => setTimeout(resolve, 900));
  if (!await isAlive(candidate.pid)) return "stopped";

  try {
    process.kill(candidate.pid, "SIGKILL");
  } catch (error) {
    return error?.code === "ESRCH" ? "stopped" : `sigkill failed: ${error.message}`;
  }
  return "force-stopped";
}

function formatCommand(command) {
  return command.length > 132 ? `${command.slice(0, 129)}...` : command;
}

async function getTopCpuRows() {
  const result = await run("ps", ["-axo", "pid=", "-o", "pcpu=", "-o", "pmem=", "-o", "command="], { timeoutMs: 5000 });
  if (!result.ok) return [];
  return result.stdout
    .split("\n")
    .map((line) => {
      const match = String(line || "").trim().match(/^(\d+)\s+([\d.]+)\s+([\d.]+)\s+(.+)$/);
      return match ? {
        pid: Number(match[1]),
        cpu: Number(match[2]),
        mem: Number(match[3]),
        command: match[4],
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, 8);
}

async function main() {
  const [{ candidates: portCandidates, skipped }, headlessCandidates] = await Promise.all([
    collectPortCandidates(),
    collectHeadlessQaCandidates(),
  ]);
  const candidates = uniqueCandidates([...portCandidates, ...headlessCandidates]);

  console.log(`MES cooldown${dryRun ? " dry-run" : ""}`);
  console.log(`Project: ${projectRoot}`);
  console.log(`Ports: ${ports.join(", ")}`);

  if (!candidates.length) {
    console.log("OK: no local MES servers or headless MES QA browsers to stop.");
  } else {
    for (const candidate of candidates) {
      const status = await terminate(candidate);
      console.log(`${status}: pid=${candidate.pid} cpu=${candidate.cpu}% mem=${candidate.mem}% · ${candidate.reason}`);
      console.log(`  ${formatCommand(candidate.command)}`);
    }
  }

  if (skipped.length) {
    console.log("\nSkipped listeners outside this project:");
    for (const item of skipped) {
      console.log(`skip: pid=${item.pid} port-process cwd=${item.cwd || "-"} · ${formatCommand(item.command)}`);
    }
  }

  const topCpu = await getTopCpuRows();
  if (topCpu.length) {
    console.log("\nTop CPU after cooldown (not modified):");
    for (const row of topCpu) {
      console.log(`pid=${row.pid} cpu=${row.cpu}% mem=${row.mem}% · ${formatCommand(row.command)}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
