import { createHash } from "node:crypto";

export const DIRECTORY_CLUSTER_COMMAND_MARKER_PATH = "ops/shared-state/directory-cluster-server-command-compatibility.json";
export const DIRECTORY_CLUSTER_COMMAND_SURFACES = Object.freeze(["nomenclature-types", "boards"]);
export const DIRECTORY_CLUSTER_INCOMPATIBLE_TARGET_FLAGS = Object.freeze([
  "MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS",
]);

export function parseAndValidateDirectoryClusterCommandMarker(source) {
  const marker = typeof source === "string" ? JSON.parse(source) : source;
  const exclusivity = marker?.controlledRootExclusivity;
  if (marker?.schemaVersion !== 1
    || marker?.contract !== "directory-cluster-server-commands"
    || marker?.commandSurfaceVersion !== 1
    || marker?.authenticatedActorVersion !== 1
    || marker?.authorizationSnapshotVersion !== 1
    || marker?.concurrencyVersion !== 1
    || marker?.idempotencyReceiptVersion !== 1
    || marker?.destructiveRecoveryVersion !== 1
    || JSON.stringify(marker?.supportedSurfaces) !== JSON.stringify(DIRECTORY_CLUSTER_COMMAND_SURFACES)
    || marker?.storageAuthority !== "shared-state-file"
    || exclusivity?.required !== true
    || exclusivity?.lockName !== "mes-authority-rollout.lock"
    || JSON.stringify(exclusivity?.incompatibleTargetRequiresDisabledFlags) !== JSON.stringify(DIRECTORY_CLUSTER_INCOMPATIBLE_TARGET_FLAGS)
    || JSON.stringify(marker?.requiredMigrations) !== JSON.stringify([])) {
    throw new Error("Directory Cluster server-command compatibility marker is invalid");
  }
  return marker;
}

export function buildDirectoryClusterCommandManifestContract(markerSource) {
  const marker = parseAndValidateDirectoryClusterCommandMarker(markerSource);
  return {
    schemaVersion: 1,
    path: DIRECTORY_CLUSTER_COMMAND_MARKER_PATH,
    sha256: createHash("sha256").update(markerSource).digest("hex"),
    contract: marker.contract,
    supportedSurfaces: marker.supportedSurfaces,
    storageAuthority: marker.storageAuthority,
    controlledRootExclusivity: marker.controlledRootExclusivity,
  };
}

export function validateDirectoryClusterCandidateManifest(manifest, markerSource) {
  const expected = buildDirectoryClusterCommandManifestContract(markerSource);
  if (manifest?.schemaVersion < 3
    || !Array.isArray(manifest?.runtimeIncludes)
    || !manifest.runtimeIncludes.includes("ops")
    || JSON.stringify(manifest?.directoryClusterCommandCompatibility) !== JSON.stringify(expected)) {
    throw new Error("Release manifest does not bind the versioned Directory Cluster command compatibility marker");
  }
  return expected;
}
