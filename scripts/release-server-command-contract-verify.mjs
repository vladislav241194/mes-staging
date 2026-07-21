#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  NOMENCLATURE_COMMAND_MARKER_PATH,
  validateNomenclatureCandidateManifest,
} from "./release-nomenclature-command-contract.mjs";
import {
  SPECIFICATIONS2_COMMAND_MARKER_PATH,
  validateSpecifications2CandidateManifest,
} from "./release-specifications2-command-contract.mjs";
import {
  SYSTEM_DOMAINS_COMMAND_MARKER_PATH,
  validateSystemDomainsCandidateManifest,
} from "./release-system-domains-command-contract.mjs";
import {
  SHIFT_EXECUTION_COMMAND_MARKER_PATH,
  validateShiftExecutionCandidateManifest,
} from "./release-shift-execution-command-contract.mjs";
import {
  DIRECTORY_CLUSTER_COMMAND_MARKER_PATH,
  validateDirectoryClusterCandidateManifest,
} from "./release-directory-cluster-command-contract.mjs";

const FIXED_PUBLIC_RELEASE_VERIFIER = "/usr/local/libexec/mes/active-bundle/release-verify.mjs";

function parseArgs(argv) {
  const options = Object.fromEntries(argv.map((arg) => {
    if (!arg.startsWith("--")) throw new Error(`Unknown positional argument: ${arg}`);
    const [key, ...value] = arg.slice(2).split("=");
    return [key, value.join("=")];
  }));
  const contract = String(options.contract || "all");
  if (!options.app || !options.manifest || !options["expected-release-id"]) {
    throw new Error("--app, --manifest and --expected-release-id are required");
  }
  if (!["all", "nomenclature", "specifications2", "system-domains", "shift-execution", "directory-cluster"].includes(contract)) {
    throw new Error("--contract must be all, nomenclature, specifications2, system-domains, shift-execution or directory-cluster");
  }
  return {
    app: resolve(options.app),
    manifest: resolve(options.manifest),
    expectedReleaseId: String(options["expected-release-id"]),
    contract,
    publicOnly: Object.prototype.hasOwnProperty.call(options, "public-only"),
  };
}

const args = parseArgs(process.argv.slice(2));
if (!/^[A-Za-z0-9._-]{1,96}$/.test(args.expectedReleaseId)) {
  throw new Error("Expected release id is unsafe");
}

let publicVerifierPath = FIXED_PUBLIC_RELEASE_VERIFIER;
if (process.env.MES_RELEASE_PUBLIC_VERIFIER_QA_PATH) {
  if (args.app.startsWith("/srv/mes/") || args.manifest.startsWith("/srv/mes/")) {
    throw new Error("A fixed public verifier QA override is forbidden for MES release paths");
  }
  publicVerifierPath = resolve(process.env.MES_RELEASE_PUBLIC_VERIFIER_QA_PATH);
}
const releaseVerificationArgs = [
  publicVerifierPath,
  `--manifest=${args.manifest}`,
  `--app-root=${args.app}`,
  `--expected-release-id=${args.expectedReleaseId}`,
  "--json",
  "--public-only",
];
const verification = typeof process.getuid === "function" && process.getuid() === 0
  ? spawnSync("/usr/sbin/runuser", [
    "-u", "mes-stage", "--", "/usr/bin/env",
    "HOME=/nonexistent", "PATH=/usr/sbin:/usr/bin:/sbin:/bin",
    "/usr/bin/node", ...releaseVerificationArgs,
  ], { encoding: "utf8" })
  : spawnSync(process.execPath, releaseVerificationArgs, { encoding: "utf8" });
if (verification.status !== 0) {
  throw new Error(`Release artifact verification failed: ${String(verification.stderr || verification.stdout || "unknown error").trim()}`);
}

const manifest = JSON.parse(await readFile(args.manifest, "utf8"));
if (args.contract === "all" || args.contract === "specifications2") {
  validateSpecifications2CandidateManifest(
    manifest,
    await readFile(join(args.app, SPECIFICATIONS2_COMMAND_MARKER_PATH), "utf8"),
  );
}
if (args.contract === "all" || args.contract === "nomenclature") {
  validateNomenclatureCandidateManifest(
    manifest,
    await readFile(join(args.app, NOMENCLATURE_COMMAND_MARKER_PATH), "utf8"),
  );
}
if (args.contract === "all" || args.contract === "system-domains") {
  validateSystemDomainsCandidateManifest(
    manifest,
    await readFile(join(args.app, SYSTEM_DOMAINS_COMMAND_MARKER_PATH), "utf8"),
  );
}
if (args.contract === "all" || args.contract === "shift-execution") {
  validateShiftExecutionCandidateManifest(
    manifest,
    await readFile(join(args.app, SHIFT_EXECUTION_COMMAND_MARKER_PATH), "utf8"),
  );
}
if (args.contract === "all" || args.contract === "directory-cluster") {
  validateDirectoryClusterCandidateManifest(
    manifest,
    await readFile(join(args.app, DIRECTORY_CLUSTER_COMMAND_MARKER_PATH), "utf8"),
  );
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  releaseId: args.expectedReleaseId,
  contract: args.contract,
  manifestVerified: true,
  privateCompatibilityArtifactsVerified: false,
})}\n`);
