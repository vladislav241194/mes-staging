import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = join(projectRoot, "reports", "domain-migration", "pilot-readiness-latest.json");
const host = String(process.env.MES_PILOT_SSH_HOST || "mes-line").trim();
const internalOrigin = String(process.env.MES_PILOT_INTERNAL_ORIGIN || "http://127.0.0.1:4175").trim();
const internalHost = String(process.env.MES_PILOT_INTERNAL_HOST || "mes-internal").trim();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runSsh(command) {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", ["-o", "BatchMode=yes", host, command], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`Pilot readiness probe failed (${code}): ${stderr.trim() || "ssh command failed"}`));
    });
  });
}

async function main() {
  assert(host, "MES_PILOT_SSH_HOST must not be empty");
  assert(/^https?:\/\/127\.0\.0\.1:\d+$/.test(internalOrigin), "MES_PILOT_INTERNAL_ORIGIN must be a loopback HTTP origin");
  assert(/^[a-z0-9.-]+$/i.test(internalHost), "MES_PILOT_INTERNAL_HOST contains unsupported characters");
  const endpoint = `${internalOrigin}/api/v1/domain-readiness`;
  const raw = await runSsh(`curl -fsS --max-time 8 -H 'Host: ${internalHost}' '${endpoint}'`);
  const payload = JSON.parse(raw);
  const readiness = payload?.readiness || {};
  const requiredDomains = ["workOrders", "systemDomains", "specifications2", "shiftExecution"];
  const failures = requiredDomains
    .filter((name) => readiness[name]?.ready !== true || readiness[name]?.sourceSynchronized === false)
    .map((name) => ({ domain: name, ready: readiness[name]?.ready, sourceSynchronized: readiness[name]?.sourceSynchronized, error: readiness[name]?.error || "" }));
  assert(payload?.ok === true && payload?.status === "ready", "Pilot domain readiness is not ready");
  assert(failures.length === 0, `Pilot has unready domain projections: ${failures.map((item) => item.domain).join(", ")}`);

  const result = {
    checkedAt: new Date().toISOString(),
    host,
    status: payload.status,
    domains: Object.fromEntries(requiredDomains.map((name) => [name, {
      storageBackend: readiness[name]?.storageBackend || "",
      revision: readiness[name]?.revision ?? null,
      migrationState: readiness[name]?.migrationState || "",
      summary: readiness[name]?.summary || null,
    }])),
    commands: readiness.commands || {},
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Pilot domain readiness: OK (${requiredDomains.join(", ")})`);
  console.log(`report: ${reportPath}`);
}

main().catch(async (error) => {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({ checkedAt: new Date().toISOString(), status: "fail", message: error.message }, null, 2)}\n`);
  console.error(`Pilot domain readiness: FAIL — ${error.message}`);
  process.exit(1);
});
