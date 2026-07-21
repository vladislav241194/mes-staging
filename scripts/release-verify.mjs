#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { computeTreeSha } from "./release-tree-sha.mjs";
import { REACT_RUNTIME_POLICY_FILE, normalizeReactRuntimePolicy } from "./react-runtime-policy.mjs";

const CANONICAL_BOOTSTRAP_STAGED_PATHS = Object.freeze([
  "bootstrap-snapshot.json",
  "dist/bootstrap-snapshot.json",
]);
const CANONICAL_BOOTSTRAP_GENERATED_PATHS = Object.freeze([
  "dist/bootstrap-snapshot.json.gz",
  "dist/bootstrap-snapshot.json.br",
]);
const CANONICAL_BOOTSTRAP_OPERATIONAL_PATH = "/srv/mes/pilot/runtime/bootstrap-snapshot.json";
const CANONICAL_BOOTSTRAP_DESCRIPTOR_KEYS = Object.freeze([
  "generatedPaths", "id", "operationalPath", "sha256", "stagedPaths",
]);

function parseArgs(argv) {
  const args = {
    manifest: "",
    appRoot: process.cwd(),
    expectedReleaseId: "",
    json: false,
    publicOnly: false,
  };
  for (const arg of argv) {
    if (!arg.startsWith("--")) throw new Error(`Unknown positional argument: ${arg}`);
    const [key, rawValue] = arg.slice(2).split("=");
    const value = rawValue ?? true;
    if (key === "manifest") args.manifest = String(value);
    else if (key === "app-root") args.appRoot = String(value);
    else if (key === "expected-release-id") args.expectedReleaseId = String(value);
    else if (key === "json") args.json = true;
    else if (key === "public-only") args.publicOnly = true;
    else throw new Error(`Unknown option: --${key}`);
  }
  if (!args.manifest) throw new Error("--manifest is required");
  return args;
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

function isGitObjectId(value) {
  return /^[a-f0-9]{40,64}$/i.test(String(value || ""));
}

function isSafeRelativePath(value) {
  const normalized = String(value || "").replace(/\\/g, "/");
  return Boolean(normalized)
    && !isAbsolute(normalized)
    && !normalized.split("/").includes("..")
    && !normalized.startsWith("./");
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function resolveAppFile(appRoot, relativePath) {
  assert(isSafeRelativePath(relativePath), `Unsafe release artifact path: ${relativePath}`);
  const absolutePath = resolve(appRoot, relativePath);
  assert(!relative(appRoot, absolutePath).startsWith(".."), `Artifact escapes app root: ${relativePath}`);
  return absolutePath;
}

function assertCanonicalPublicCompatibilityDescriptor(manifest) {
  assert(manifest.schemaVersion === 3, "Public-only verification requires a schema-v3 release manifest");
  assert(Array.isArray(manifest.compatibilityArtifacts) && manifest.compatibilityArtifacts.length === 1,
    "Public-only verification requires exactly one compatibility artifact");
  const [bootstrap] = manifest.compatibilityArtifacts;
  assert(bootstrap && Object.keys(bootstrap).sort().join(",") === CANONICAL_BOOTSTRAP_DESCRIPTOR_KEYS.join(","),
    "Public-only verification requires the exact canonical bootstrap descriptor schema");
  assert(bootstrap.id === "bootstrap-snapshot", "Public-only verification requires the canonical bootstrap artifact");
  assert(bootstrap.operationalPath === CANONICAL_BOOTSTRAP_OPERATIONAL_PATH,
    "Public-only verification requires the canonical bootstrap operational path");
  assert(/^[a-f0-9]{64}$/i.test(String(bootstrap.sha256 || "")),
    "Public-only verification requires the canonical bootstrap digest");
  assert(Array.isArray(bootstrap.stagedPaths)
    && bootstrap.stagedPaths.length === CANONICAL_BOOTSTRAP_STAGED_PATHS.length
    && bootstrap.stagedPaths.every((path, index) => path === CANONICAL_BOOTSTRAP_STAGED_PATHS[index]),
  "Public-only verification requires the exact canonical bootstrap staged paths");
  assert(Array.isArray(bootstrap.generatedPaths)
    && bootstrap.generatedPaths.length === CANONICAL_BOOTSTRAP_GENERATED_PATHS.length,
  "Public-only verification requires exactly the canonical bootstrap sidecars");
  for (const [index, expectedPath] of CANONICAL_BOOTSTRAP_GENERATED_PATHS.entries()) {
    const generated = bootstrap.generatedPaths[index];
    assert(generated && Object.keys(generated).sort().join(",") === "path,sha256"
      && generated.path === expectedPath,
    `Public-only verification requires the exact canonical bootstrap sidecar ${expectedPath}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appRoot = resolve(args.appRoot);
  const manifestPath = resolve(args.manifest);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  assert([1, 2, 3].includes(manifest?.schemaVersion), "Unsupported release manifest schema");
  assert(typeof manifest.releaseId === "string" && manifest.releaseId, "Manifest release id is missing");
  assert(isGitObjectId(manifest.gitCommit), "Manifest Git commit is invalid");
  const appVersion = manifest.appVersion == null ? null : String(manifest.appVersion);
  if (manifest.schemaVersion === 3 || args.publicOnly || appVersion !== null) {
    assert(/^v\.\d\.\d{3}\.\d{2}$/.test(String(appVersion || "")), "Manifest application version is invalid");
  }
  if (args.expectedReleaseId) {
    assert(manifest.releaseId === args.expectedReleaseId, `Unexpected release id: ${manifest.releaseId}`);
  }
  assert(Array.isArray(manifest.runtimeIncludes) && manifest.runtimeIncludes.length, "Manifest runtime includes are missing");
  for (const include of manifest.runtimeIncludes) {
    assert(isSafeRelativePath(include), `Unsafe runtime include: ${include}`);
  }

  let gitProvenanceVerification = "legacy-unverified";
  if (manifest.schemaVersion >= 2) {
    const provenance = manifest.gitProvenance;
    assert(provenance?.schemaVersion === 1, "Manifest Git provenance schema is unsupported");
    assert(provenance.gitCommit === manifest.gitCommit, "Manifest Git provenance commit does not match release commit");
    assert(typeof provenance.branch === "string" && provenance.branch, "Manifest Git provenance branch is missing");
    assert(typeof provenance.remote === "string" && provenance.remote, "Manifest Git provenance remote is missing");
    assert(typeof provenance.upstreamRef === "string" && provenance.upstreamRef, "Manifest Git provenance upstream ref is missing");
    assert(/^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(provenance.upstreamBranchRef || ""), "Manifest Git provenance upstream branch is invalid");
    assert(isGitObjectId(provenance.upstreamCommit), "Manifest Git provenance upstream commit is invalid");
    assert(provenance.verification === "fresh-upstream-fetch", "Manifest Git provenance was not verified against a fresh upstream fetch");
    assert(typeof provenance.verifiedAt === "string" && provenance.verifiedAt, "Manifest Git provenance verification time is missing");
    gitProvenanceVerification = provenance.verification;
  }

  let runtimePolicyId = "implicit-legacy";
  let runtimePolicySha256 = null;
  let reactSurfaces = [];
  if (manifest.schemaVersion >= 3) {
    assert(typeof manifest.packageLockSha256 === "string" && /^[a-f0-9]{64}$/i.test(manifest.packageLockSha256), "Manifest package-lock digest is invalid");
    const actualPackageLockSha256 = await sha256(resolveAppFile(appRoot, "package-lock.json"));
    assert(actualPackageLockSha256 === manifest.packageLockSha256, "Release package-lock hash mismatch");

    const runtimePolicyArtifact = manifest.runtimePolicy;
    assert(runtimePolicyArtifact?.schemaVersion === 1, "Manifest React runtime policy schema is unsupported");
    assert(isSafeRelativePath(runtimePolicyArtifact.path), "Manifest React runtime policy path is unsafe");
    assert(runtimePolicyArtifact.path === REACT_RUNTIME_POLICY_FILE, "Manifest React runtime policy path is unsupported");
    assert(typeof runtimePolicyArtifact.policyId === "string" && runtimePolicyArtifact.policyId, "Manifest React runtime policy id is missing");
    assert(typeof runtimePolicyArtifact.sha256 === "string" && /^[a-f0-9]{64}$/i.test(runtimePolicyArtifact.sha256), "Manifest React runtime policy digest is invalid");
    const runtimePolicyPath = resolveAppFile(appRoot, runtimePolicyArtifact.path);
    const runtimePolicySource = await readFile(runtimePolicyPath, "utf8");
    const actualRuntimePolicySha256 = createHash("sha256").update(runtimePolicySource).digest("hex");
    assert(actualRuntimePolicySha256 === runtimePolicyArtifact.sha256, "Release React runtime policy hash mismatch");
    const runtimePolicy = normalizeReactRuntimePolicy(JSON.parse(runtimePolicySource), {
      sha256Digest: actualRuntimePolicySha256,
      source: runtimePolicyArtifact.path,
    });
    assert(runtimePolicy.policyId === runtimePolicyArtifact.policyId, "Release React runtime policy id does not match manifest");
    runtimePolicyId = runtimePolicy.policyId;
    runtimePolicySha256 = actualRuntimePolicySha256;
    reactSurfaces = Object.entries(runtimePolicy.surfaces)
      .filter(([, mode]) => mode === "react")
      .map(([id]) => id);
  }

  const compatibilityArtifacts = Array.isArray(manifest.compatibilityArtifacts)
    ? manifest.compatibilityArtifacts
    : [];
  if (args.publicOnly) assertCanonicalPublicCompatibilityDescriptor(manifest);
  const distExcludes = [];
  for (const artifact of compatibilityArtifacts) {
    assert(typeof artifact?.id === "string" && artifact.id, "Compatibility artifact id is missing");
    assert(typeof artifact?.sha256 === "string" && /^[a-f0-9]{64}$/i.test(artifact.sha256), `Compatibility artifact ${artifact.id} digest is invalid`);
    assert(Array.isArray(artifact.stagedPaths) && artifact.stagedPaths.length, `Compatibility artifact ${artifact.id} paths are missing`);
    for (const stagedPath of artifact.stagedPaths) {
      const artifactPath = resolveAppFile(appRoot, stagedPath);
      if (!args.publicOnly) {
        const actualDigest = await sha256(artifactPath);
        assert(actualDigest === artifact.sha256, `Compatibility artifact ${artifact.id} hash mismatch at ${stagedPath}`);
      }
      if (stagedPath.startsWith("dist/")) distExcludes.push(stagedPath);
    }
    const generatedPaths = Array.isArray(artifact.generatedPaths) ? artifact.generatedPaths : [];
    for (const generated of generatedPaths) {
      assert(typeof generated?.path === "string" && generated.path, `Compatibility artifact ${artifact.id} generated path is missing`);
      assert(typeof generated?.sha256 === "string" && /^[a-f0-9]{64}$/i.test(generated.sha256), `Compatibility artifact ${artifact.id} generated digest is invalid at ${generated.path}`);
      const artifactPath = resolveAppFile(appRoot, generated.path);
      if (!args.publicOnly) {
        const actualDigest = await sha256(artifactPath);
        assert(actualDigest === generated.sha256, `Compatibility artifact ${artifact.id} generated hash mismatch at ${generated.path}`);
      }
      if (generated.path.startsWith("dist/")) distExcludes.push(generated.path);
    }
  }

  const sourceTreeSha256 = await computeTreeSha({ root: appRoot, includes: manifest.runtimeIncludes });
  const distTreeSha256 = await computeTreeSha({ root: appRoot, includes: ["dist"], excludes: distExcludes });
  assert(sourceTreeSha256 === manifest.sourceTreeSha256, "Release source tree hash mismatch");
  assert(distTreeSha256 === manifest.distTreeSha256, "Release dist tree hash mismatch");

  const result = {
    releaseId: manifest.releaseId,
    appVersion,
    sourceTreeSha256,
    distTreeSha256,
    compatibilityArtifactCount: compatibilityArtifacts.length,
    compatibilityArtifactVerification: {
      schemaVersion: 1,
      mode: args.publicOnly ? "public-only" : "full",
      descriptorSchemaVerified: true,
      privateCompatibilityArtifactsVerified: !args.publicOnly,
    },
    privateCompatibilityArtifactsVerified: !args.publicOnly,
    gitProvenanceVerification,
    runtimePolicyId,
    runtimePolicySha256,
    reactSurfaces,
  };
  process.stdout.write(args.json ? `${JSON.stringify(result)}\n` : `${result.releaseId}\n`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
