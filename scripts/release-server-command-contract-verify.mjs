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
  };
}

const args = parseArgs(process.argv.slice(2));
if (!/^[A-Za-z0-9._-]{1,96}$/.test(args.expectedReleaseId)) {
  throw new Error("Expected release id is unsafe");
}

const verification = spawnSync(process.execPath, [
  join(args.app, "scripts", "release-verify.mjs"),
  `--manifest=${args.manifest}`,
  `--app-root=${args.app}`,
  `--expected-release-id=${args.expectedReleaseId}`,
  "--json",
], { encoding: "utf8" });
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
})}\n`);
