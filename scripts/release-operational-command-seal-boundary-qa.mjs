#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const activeCallsites = [
  "ops/auth/activate-pilot-nomenclature-command-owner.sh",
  "ops/postgres/activate-shift-execution-commands.sh",
  "ops/postgres/activate-specifications2-attachments.sh",
  "ops/postgres/activate-specifications2-publication.sh",
  "ops/postgres/activate-specifications2-work-orders.sh",
  "ops/postgres/activate-system-domains-command-surfaces.sh",
  "ops/postgres/deactivate-shift-execution-commands.sh",
  "ops/postgres/deactivate-specifications2-attachments.sh",
  "ops/postgres/deactivate-specifications2-publication.sh",
  "ops/postgres/deactivate-specifications2-work-orders.sh",
  "ops/postgres/recover-system-domains-primary-command-surfaces.sh",
  "ops/postgres/retire-system-domains-snapshot.sh",
  "ops/shared-state/activate-directory-cluster-commands.sh",
  "ops/shared-state/deactivate-directory-cluster-commands.sh",
];
const stagedOperatorCallsite = "ops/postgres/deactivate-system-domains-command-surfaces.sh";
const candidateCallsite = "ops/postgres/deactivate-staged-candidate-command-surfaces.sh";

function ordered(source, needles, label) {
  let previous = -1;
  for (const needle of needles) {
    const index = source.indexOf(needle, previous + 1);
    assert(index > previous, `${label}: missing or out-of-order trust boundary: ${needle}`);
    previous = index;
  }
}

function extractFunction(source, name, label) {
  const start = source.indexOf(`${name}() {`);
  const end = source.indexOf("\n}\n", start);
  assert(start >= 0 && end > start, `${label}: ${name} must remain statically extractable`);
  return source.slice(start, end + 2);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

const sources = new Map();
for (const relativePath of [...activeCallsites, stagedOperatorCallsite, candidateCallsite]) {
  sources.set(relativePath, await readFile(join(projectRoot, relativePath), "utf8"));
}

const stagedOperatorSource = sources.get(stagedOperatorCallsite);
assert.equal(stagedOperatorSource.match(/release-server-command-contract-verify\.mjs/g)?.length, 1,
  `${stagedOperatorCallsite}: expected one staged-operator command verifier call`);
ordered(stagedOperatorSource, [
  '"$root_seal_helper" bundle',
  '--release-id="$active_release_id" --app="$active_target"',
  '"$root_seal_helper" pointer',
  '"$root_seal_helper" artifact',
  "record?.releaseId !== id",
  '--release-id="$release_id" --app="$source_target"',
  "/usr/sbin/runuser -u mes-stage -- /usr/bin/env",
  '"${source_target}/scripts/release-server-command-contract-verify.mjs"',
], stagedOperatorCallsite);
for (const mode of ["bundle", "pointer", "artifact"]) {
  assert.match(stagedOperatorSource, new RegExp(`\\"\\$root_seal_helper\\" ${mode}[^\\n]*(?:\\\\\\n[^\\n]*)*\\|\\| return 1`),
    `${stagedOperatorCallsite}: ${mode} root seal must fail closed before staged code`);
}
assert.equal((stagedOperatorSource.match(/"\$root_seal_helper" release[^\n]*\|\| return 1/g) || []).length, 2,
  `${stagedOperatorCallsite}: both active and staged release roots must fail closed`);
const stagedOperatorVerificationFunction = extractFunction(
  stagedOperatorSource,
  "verify_active_release_contract",
  stagedOperatorCallsite,
);
assert(stagedOperatorVerificationFunction.includes("/usr/sbin/runuser -u mes-stage -- /usr/bin/env")
  && stagedOperatorVerificationFunction.includes("HOME=/nonexistent PATH=/usr/sbin:/usr/bin:/sbin:/bin")
  && stagedOperatorVerificationFunction.includes("--public-only"),
`${stagedOperatorCallsite}: staged verifier must execute unprivileged in public-only mode`);

for (const relativePath of activeCallsites) {
  const source = sources.get(relativePath);
  const verifierCount = source.match(/release-server-command-contract-verify\.mjs/g)?.length || 0;
  assert.equal(verifierCount, 1, `${relativePath}: expected one candidate-owned command verifier call`);
  ordered(source, [
    '"$root_seal_helper" bundle',
    '"$root_seal_helper" release',
    '"$root_seal_helper" pointer',
    '"$root_seal_helper" artifact',
    "record?.releaseId !== id",
    "/usr/sbin/runuser -u mes-stage -- /usr/bin/env",
    '"${active_target}/scripts/release-server-command-contract-verify.mjs"',
  ], relativePath);
  for (const mode of ["bundle", "release", "pointer", "artifact"]) {
    assert.match(source, new RegExp(`\\"\\$root_seal_helper\\" ${mode}[^\\n]*(?:\\\\\\n[^\\n]*)*\\|\\| return 1`),
      `${relativePath}: ${mode} root seal must fail closed before candidate code`);
  }
  const verificationFunction = extractFunction(source, "verify_active_release_contract", relativePath);
  assert(verificationFunction.includes("/usr/sbin/runuser -u mes-stage -- /usr/bin/env")
    && verificationFunction.includes("HOME=/nonexistent PATH=/usr/sbin:/usr/bin:/sbin:/bin")
    && verificationFunction.includes("--public-only"),
  `${relativePath}: candidate-owned verifier must execute unprivileged in public-only mode`);
}

const candidateSource = sources.get(candidateCallsite);
ordered(candidateSource, [
  '"$ROOT_SEAL_HELPER" bundle',
  '"$ROOT_SEAL_HELPER" release',
  '--release-id="$ACTIVE_RELEASE_ID"',
  '"$ROOT_SEAL_HELPER" pointer',
  '"$ROOT_SEAL_HELPER" artifact',
  "record?.releaseId !== id",
  '"$ROOT_SEAL_HELPER" release',
  '--release-id="$RELEASE_ID"',
  "/usr/sbin/runuser -u mes-stage -- /usr/bin/env",
  '"${CANDIDATE_APP_DIR}/scripts/release-server-command-contract-verify.mjs"',
], candidateCallsite);
assert.equal(candidateSource.match(/release-server-command-contract-verify\.mjs/g)?.length, 1,
  `${candidateCallsite}: expected one candidate-owned command verifier call`);
assert(candidateSource.includes("/usr/sbin/runuser -u mes-stage -- /usr/bin/env")
  && candidateSource.includes("HOME=/nonexistent PATH=/usr/sbin:/usr/bin:/sbin:/bin")
  && candidateSource.includes("--contract=all --public-only"),
`${candidateCallsite}: candidate verifier must execute as mes-stage in public-only mode`);

const root = await realpath(await mkdtemp(join(tmpdir(), "mes-operational-command-seal-boundary-")));
try {
  const bin = join(root, "bin");
  const releases = join(root, "releases");
  const releaseId = "v.qa-active";
  const releaseRoot = join(releases, releaseId);
  const app = join(releaseRoot, "app");
  const activePointer = join(root, "active-app");
  const logPath = join(root, "boundary.log");
  const rootSealHelper = join(root, "fixed-root-seal.mjs");
  const runuserShim = join(bin, "runuser");
  await mkdir(join(app, "scripts"), { recursive: true });
  await mkdir(bin, { recursive: true });
  await writeFile(join(releaseRoot, "release-manifest.json"), "{}\n");
  await writeFile(join(releases, "active-release.json"), `${JSON.stringify({ releaseId })}\n`);
  await symlink(app, activePointer);
  await writeFile(rootSealHelper, `
import { appendFileSync } from "node:fs";
const mode = process.argv[2] || "";
const release = process.argv.find((value) => value.startsWith("--release-id="))?.slice(13) || "";
const entry = "seal:" + mode + (release ? ":" + release : "");
appendFileSync(process.env.QA_BOUNDARY_LOG, entry + "\\n");
if (process.env.QA_FAIL_SEAL === mode + (release ? ":" + release : "")) process.exit(91);
`);
  await writeFile(join(app, "scripts", "release-server-command-contract-verify.mjs"), `
import { appendFileSync } from "node:fs";
appendFileSync(process.env.QA_BOUNDARY_LOG, "verifier\\n");
`);
  await writeFile(join(bin, "readlink"), `#!/bin/sh
if [ "\${1:-}" = "-f" ]; then shift; fi
exec "\${QA_NODE}" -e 'process.stdout.write(require("node:fs").realpathSync(process.argv[1]))' "$1"
`);
  await chmod(join(bin, "readlink"), 0o755);
  await writeFile(runuserShim, `#!/bin/sh
[ "\${1:-}" = "-u" ] && [ "\${2:-}" = "mes-stage" ] && [ "\${3:-}" = "--" ] || exit 93
printf 'runuser:%s\\n' "$2" >> "$QA_BOUNDARY_LOG"
shift 3
exec "$@"
`);
  await chmod(runuserShim, 0o755);

  const baseEnv = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH || ""}`,
    QA_NODE: process.execPath,
    QA_BOUNDARY_LOG: logPath,
  };
  const nodeCommand = shellQuote(process.execPath);
  for (const relativePath of activeCallsites) {
    await writeFile(logPath, "");
    const source = sources.get(relativePath);
    const verifyFunction = extractFunction(source, "verify_active_release_contract", relativePath)
      .replaceAll("/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs", rootSealHelper)
      .replaceAll("/usr/sbin/runuser", shellQuote(runuserShim))
      .replaceAll("/usr/bin/node", nodeCommand);
    const script = `set -euo pipefail
APP_DIR=${shellQuote(activePointer)}
ACTIVE_APP_DIR=${shellQuote(activePointer)}
RELEASES_DIR=${shellQuote(releases)}
COMPATIBILITY_MARKER=${shellQuote(join(releaseRoot, "release-manifest.json"))}
${verifyFunction}
verify_active_release_contract
`;
    const result = spawnSync("bash", ["-c", script], { encoding: "utf8", env: baseEnv });
    const boundaryLog = await readFile(logPath, "utf8");
    assert.equal(result.status, 0, `${relativePath}: dynamic trust-boundary proof failed: ${result.stderr}; log=${boundaryLog}`);
    assert.deepEqual(boundaryLog.trim().split("\n"), [
      "seal:bundle",
      `seal:release:${releaseId}`,
      "seal:pointer",
      "seal:artifact",
      "runuser:mes-stage",
      "verifier",
    ], `${relativePath}: fixed root seals must execute before candidate verifier`);
  }

  const operatorId = "v.qa-staged-operator";
  const operatorReleaseRoot = join(releases, operatorId);
  const operatorApp = join(operatorReleaseRoot, "app");
  await mkdir(join(operatorApp, "scripts"), { recursive: true });
  await writeFile(join(operatorReleaseRoot, "release-manifest.json"), "{}\n");
  await writeFile(join(operatorApp, "scripts", "release-server-command-contract-verify.mjs"), `
import { appendFileSync } from "node:fs";
appendFileSync(process.env.QA_BOUNDARY_LOG, "verifier\\n");
`);
  const stagedOperatorFunction = stagedOperatorVerificationFunction
    .replaceAll("/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs", rootSealHelper)
    .replaceAll("/usr/sbin/runuser", shellQuote(runuserShim))
    .replaceAll("/usr/bin/node", nodeCommand);
  const stagedOperatorScript = `set -euo pipefail
APP_DIR=${shellQuote(operatorApp)}
ACTIVE_APP_DIR=${shellQuote(activePointer)}
RELEASES_DIR=${shellQuote(releases)}
${stagedOperatorFunction}
verify_active_release_contract
`;
  await writeFile(logPath, "");
  let result = spawnSync("bash", ["-c", stagedOperatorScript], { encoding: "utf8", env: baseEnv });
  assert.equal(result.status, 0,
    `${stagedOperatorCallsite}: dynamic staged trust-boundary proof failed: ${result.stderr}`);
  assert.deepEqual((await readFile(logPath, "utf8")).trim().split("\n"), [
    "seal:bundle",
    `seal:release:${releaseId}`,
    "seal:pointer",
    "seal:artifact",
    `seal:release:${operatorId}`,
    "runuser:mes-stage",
    "verifier",
  ], `${stagedOperatorCallsite}: active and staged roots must be sealed before staged verifier`);

  await writeFile(logPath, "");
  result = spawnSync("bash", ["-c", stagedOperatorScript], {
    encoding: "utf8",
    env: { ...baseEnv, QA_FAIL_SEAL: `release:${operatorId}` },
  });
  assert.notEqual(result.status, 0, `${stagedOperatorCallsite}: staged seal failure must stop the operator script`);
  assert(!((await readFile(logPath, "utf8")).includes("verifier")),
    `${stagedOperatorCallsite}: staged verifier must not run after a root-seal failure`);

  const candidateId = "v.qa-candidate";
  const candidateReleaseRoot = join(releases, candidateId);
  const candidateApp = join(candidateReleaseRoot, "app");
  const expectedScript = join(candidateApp, candidateCallsite);
  await mkdir(join(candidateApp, "scripts"), { recursive: true });
  await mkdir(dirname(expectedScript), { recursive: true });
  await writeFile(join(candidateReleaseRoot, "release-manifest.json"), "{}\n");
  await writeFile(join(candidateApp, "scripts", "release-server-command-contract-verify.mjs"), `
import { appendFileSync } from "node:fs";
appendFileSync(process.env.QA_BOUNDARY_LOG, "verifier\\n");
`);
  await writeFile(expectedScript, "#!/bin/sh\n");
  const candidateBlockStart = candidateSource.indexOf("# This fixed helper is installed");
  const candidateBlockEnd = candidateSource.indexOf("\n\nif [[ ${MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD", candidateBlockStart);
  assert(candidateBlockStart >= 0 && candidateBlockEnd > candidateBlockStart,
    `${candidateCallsite}: fixed trust block must remain dynamically extractable`);
  const candidateBlock = candidateSource.slice(candidateBlockStart, candidateBlockEnd)
    .replaceAll("/usr/sbin/runuser", shellQuote(runuserShim))
    .replaceAll("/usr/bin/node", nodeCommand);
  const candidatePrelude = `set -euo pipefail
RELEASES_DIR=${shellQuote(releases)}
ACTIVE_APP_DIR=${shellQuote(activePointer)}
RELEASE_ID=${shellQuote(candidateId)}
CANDIDATE_RELEASE_DIR=${shellQuote(candidateReleaseRoot)}
CANDIDATE_APP_DIR=${shellQuote(candidateApp)}
MANIFEST=${shellQuote(join(candidateReleaseRoot, "release-manifest.json"))}
EXPECTED_SCRIPT=${shellQuote(expectedScript)}
ROOT_SEAL_HELPER=${shellQuote(rootSealHelper)}
SCRIPT_PATH=${shellQuote(expectedScript)}
ACTIVE_TARGET=${shellQuote(app)}
ACTIVE_RELEASE_DIR=${shellQuote(releaseRoot)}
ACTIVE_RELEASE_ID=${shellQuote(releaseId)}
`;
  await writeFile(logPath, "");
  result = spawnSync("bash", ["-c", `${candidatePrelude}${candidateBlock}\n`], {
    encoding: "utf8",
    env: baseEnv,
  });
  assert.equal(result.status, 0, `${candidateCallsite}: dynamic trust-boundary proof failed: ${result.stderr}`);
  assert.deepEqual((await readFile(logPath, "utf8")).trim().split("\n"), [
    "seal:bundle",
    `seal:release:${releaseId}`,
    "seal:pointer",
    "seal:artifact",
    `seal:release:${candidateId}`,
    "runuser:mes-stage",
    "verifier",
  ], `${candidateCallsite}: active and exact candidate seals must execute before candidate verifier`);

  await writeFile(logPath, "");
  result = spawnSync("bash", ["-c", `${candidatePrelude}${candidateBlock}\n`], {
    encoding: "utf8",
    env: { ...baseEnv, QA_FAIL_SEAL: `release:${candidateId}` },
  });
  assert.notEqual(result.status, 0, `${candidateCallsite}: candidate seal failure must stop the bridge`);
  assert(!((await readFile(logPath, "utf8")).includes("verifier")),
    `${candidateCallsite}: candidate verifier must not run after a root-seal failure`);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("Operational command root-seal boundary QA: OK");
