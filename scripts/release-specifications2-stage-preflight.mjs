import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  SPECIFICATIONS2_COMMAND_MARKER_PATH,
  decideSpecifications2StagePreflight,
  validateSpecifications2CandidateManifest,
} from "./release-specifications2-command-contract.mjs";

const FIXED_PUBLIC_RELEASE_VERIFIER = "/usr/local/libexec/mes/active-bundle/release-verify.mjs";

const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=")];
}));
if (!options["candidate-app"] || !options.manifest || !options["active-app"] || !options.service) {
  throw new Error("candidate app, manifest, active app and service are required");
}
const candidateApp = resolve(options["candidate-app"]);
const candidateManifestPath = resolve(options.manifest);
const activeApp = resolve(options["active-app"]);
const service = String(options.service || "");
const serviceUnit = service.endsWith(".service") ? service : `${service}.service`;

async function validateRelease(appPath, manifestPath, { verify = false } = {}) {
  const [manifestSource, markerSource] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(join(appPath, SPECIFICATIONS2_COMMAND_MARKER_PATH), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource);
  validateSpecifications2CandidateManifest(manifest, markerSource);
  if (verify) {
    let publicVerifierPath = FIXED_PUBLIC_RELEASE_VERIFIER;
    if (process.env.MES_RELEASE_PUBLIC_VERIFIER_QA_PATH) {
      if (appPath.startsWith("/srv/mes/") || manifestPath.startsWith("/srv/mes/")) {
        throw new Error("A fixed public verifier QA override is forbidden for MES release paths");
      }
      publicVerifierPath = resolve(process.env.MES_RELEASE_PUBLIC_VERIFIER_QA_PATH);
    }
    const verificationArgs = [
      publicVerifierPath,
      `--manifest=${manifestPath}`,
      `--app-root=${appPath}`,
      `--expected-release-id=${manifest.releaseId}`,
      "--json",
      "--public-only",
    ];
    const verification = typeof process.getuid === "function" && process.getuid() === 0
      ? spawnSync("/usr/sbin/runuser", [
        "-u", "mes-stage", "--", "/usr/bin/env",
        "HOME=/nonexistent", "PATH=/usr/sbin:/usr/bin:/sbin:/bin",
        "/usr/bin/node", ...verificationArgs,
      ], { encoding: "utf8" })
      : spawnSync(process.execPath, verificationArgs, { encoding: "utf8" });
    if (verification.status !== 0) throw new Error("Active release marker is not covered by a valid release manifest");
  }
  return true;
}

await validateRelease(candidateApp, candidateManifestPath);

let activeCompatible = false;
try {
  if ((await lstat(activeApp)).isSymbolicLink()) {
    const activeTarget = await realpath(activeApp);
    const activeReleasePath = dirname(activeTarget);
    activeCompatible = await validateRelease(activeTarget, join(activeReleasePath, "release-manifest.json"), { verify: true });
  }
} catch {
  activeCompatible = false;
}

const systemdRoot = process.env.MES_RELEASE_GUARD_SYSTEMD_ROOT || "/etc/systemd/system";
const procRoot = process.env.MES_RELEASE_GUARD_PROC_ROOT || "/proc";
const serviceDropinDir = join(systemdRoot, `${serviceUnit}.d`);
let configuredOn = false;
for (const name of ["50-specifications2-attachments.conf", "63-specifications2-work-orders.conf", "64-specifications2-publication.conf"]) {
  try { await lstat(join(serviceDropinDir, name)); configuredOn = true; } catch {}
}
let environmentObserved = false;
let effectiveOn = false;
const mainPidResult = spawnSync("systemctl", ["show", serviceUnit, "--property=MainPID", "--value"], { encoding: "utf8" });
const mainPid = String(mainPidResult.stdout || "").trim();
if (mainPidResult.status === 0 && /^[1-9][0-9]*$/.test(mainPid)) {
  try {
    const environment = await readFile(join(procRoot, mainPid, "environ"));
    environmentObserved = true;
    const values = environment.toString("utf8").split("\0");
    effectiveOn = values.some((value) => /^MES_ENABLE_SPECIFICATIONS2_(?:SERVER_(?:COMMANDS|PUBLISH_COMMANDS)|ATTACHMENT_COMMANDS)=1$/.test(value));
  } catch {}
}
const decision = decideSpecifications2StagePreflight({ activeCompatible, configuredOn, effectiveOn, environmentObserved });
if (decision.requiresControlledRootDeactivation) {
  console.error("WARN Specifications 2.0 command flags must be deactivated by the controlled root operator before candidate activation; staging remains non-mutating.");
}
console.log(JSON.stringify({ ok: true, candidateCompatible: true, ...decision }));
