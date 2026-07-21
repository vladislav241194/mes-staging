import { createHash } from "node:crypto";

export const SYSTEM_DOMAINS_COMMAND_MARKER_PATH = "ops/postgres/system-domains-server-command-compatibility.json";
export const SYSTEM_DOMAINS_COMMAND_SURFACES = Object.freeze([
  "production-structure",
  "timesheet",
  "access-control",
]);
export const SYSTEM_DOMAINS_COMMAND_REQUIRED_MIGRATIONS = Object.freeze([
  "011_system_domains_core",
  "012_system_domains_metadata_parity",
  "013_system_domains_command_idempotency",
  "023_system_domains_postgres_primary_authority",
  "026_system_responsibility_policy_lifecycle",
]);
export const SYSTEM_DOMAINS_INCOMPATIBLE_TARGET_FLAGS = Object.freeze([
  "MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS",
]);
export const SYSTEM_DOMAINS_INCOMPATIBLE_TARGET_VALUES = Object.freeze([
  "MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES",
]);

export function parseAndValidateSystemDomainsCommandMarker(source) {
  const marker = typeof source === "string" ? JSON.parse(source) : source;
  const exclusivity = marker?.controlledRootExclusivity;
  if (marker?.schemaVersion !== 1
    || marker?.contract !== "system-domains-server-commands"
    || marker?.commandSurfaceVersion !== 1
    || marker?.actorPolicyVersion !== 1
    || marker?.authorizationSnapshotVersion !== 1
    || marker?.authorityTransitionVersion !== 1
    || JSON.stringify(marker?.supportedSurfaces) !== JSON.stringify(SYSTEM_DOMAINS_COMMAND_SURFACES)
    || exclusivity?.required !== true
    || exclusivity?.lockName !== "mes-authority-rollout.lock"
    || JSON.stringify(exclusivity?.incompatibleTargetRequiresDisabledFlags) !== JSON.stringify(SYSTEM_DOMAINS_INCOMPATIBLE_TARGET_FLAGS)
    || JSON.stringify(exclusivity?.incompatibleTargetRequiresEmptyValues) !== JSON.stringify(SYSTEM_DOMAINS_INCOMPATIBLE_TARGET_VALUES)
    || JSON.stringify(marker?.requiredMigrations) !== JSON.stringify(SYSTEM_DOMAINS_COMMAND_REQUIRED_MIGRATIONS)) {
    throw new Error("System Domains server-command compatibility marker is invalid");
  }
  return marker;
}

export function buildSystemDomainsCommandManifestContract(markerSource) {
  const marker = parseAndValidateSystemDomainsCommandMarker(markerSource);
  return {
    schemaVersion: 1,
    path: SYSTEM_DOMAINS_COMMAND_MARKER_PATH,
    sha256: createHash("sha256").update(markerSource).digest("hex"),
    contract: marker.contract,
    supportedSurfaces: marker.supportedSurfaces,
    controlledRootExclusivity: marker.controlledRootExclusivity,
  };
}

export function validateSystemDomainsCandidateManifest(manifest, markerSource) {
  const expected = buildSystemDomainsCommandManifestContract(markerSource);
  if (manifest?.schemaVersion < 3
    || !Array.isArray(manifest?.runtimeIncludes)
    || !manifest.runtimeIncludes.includes("ops")
    || JSON.stringify(manifest?.systemDomainsCommandCompatibility) !== JSON.stringify(expected)) {
    throw new Error("Release manifest does not bind the versioned System Domains command compatibility marker");
  }
  return expected;
}
