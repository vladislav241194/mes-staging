import { createHash } from "node:crypto";

export const SPECIFICATIONS2_COMMAND_MARKER_PATH = "ops/postgres/specifications2-server-command-compatibility.json";
export const SPECIFICATIONS2_COMMAND_REQUIRED_MIGRATIONS = Object.freeze([
  "019_specifications2_attachment_blobs",
  "028_specifications2_publication_idempotency",
  "029_specifications2_revision_identity_backfill",
  "030_specifications2_legacy_revision_identity_guard",
  "031_specifications2_guard_function_repair",
]);
export const SPECIFICATIONS2_INCOMPATIBLE_TARGET_FLAGS = Object.freeze([
  "MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS",
  "MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS",
  "MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS",
]);

export function parseAndValidateSpecifications2CommandMarker(source) {
  const marker = typeof source === "string" ? JSON.parse(source) : source;
  const exclusivity = marker?.controlledRootExclusivity;
  if (marker?.schemaVersion !== 1
    || marker?.contract !== "specifications2-server-commands"
    || marker?.publicationFingerprintAdapterVersion !== 6
    || marker?.workOrderRevisionIdentityVersion !== 1
    || marker?.workOrderRequestFingerprintVersion !== 1
    || marker?.workOrderAggregateIdentityVersion !== 1
    || marker?.attachmentCommandVersion !== 1
    || marker?.authenticatedActorVersion !== 1
    || marker?.rbacAuthorizationVersion !== 1
    || marker?.requestSecurityVersion !== 1
    || marker?.outboxEnvelopeVersion !== 1
    || exclusivity?.required !== true
    || exclusivity?.lockName !== "mes-authority-rollout.lock"
    || JSON.stringify(exclusivity?.incompatibleTargetRequiresDisabledFlags) !== JSON.stringify(SPECIFICATIONS2_INCOMPATIBLE_TARGET_FLAGS)
    || JSON.stringify(marker?.requiredMigrations) !== JSON.stringify(SPECIFICATIONS2_COMMAND_REQUIRED_MIGRATIONS)) {
    throw new Error("Specifications 2.0 server-command compatibility marker is invalid");
  }
  return marker;
}

export function buildSpecifications2CommandManifestContract(markerSource) {
  const marker = parseAndValidateSpecifications2CommandMarker(markerSource);
  return {
    schemaVersion: 1,
    path: SPECIFICATIONS2_COMMAND_MARKER_PATH,
    sha256: createHash("sha256").update(markerSource).digest("hex"),
    contract: marker.contract,
    controlledRootExclusivity: marker.controlledRootExclusivity,
  };
}

export function validateSpecifications2CandidateManifest(manifest, markerSource) {
  const expected = buildSpecifications2CommandManifestContract(markerSource);
  if (manifest?.schemaVersion < 3
    || !Array.isArray(manifest?.runtimeIncludes)
    || !manifest.runtimeIncludes.includes("ops")
    || JSON.stringify(manifest?.specifications2CommandCompatibility) !== JSON.stringify(expected)) {
    throw new Error("Release manifest does not bind the versioned Specifications 2.0 command compatibility marker");
  }
  return expected;
}

export function decideSpecifications2StagePreflight({ activeCompatible, configuredOn, effectiveOn, environmentObserved }) {
  const activeState = configuredOn || effectiveOn ? "on" : environmentObserved ? "off" : "unknown";
  const requiresControlledRootDeactivation = activeCompatible !== true && activeState !== "off";
  return {
    stageAllowed: true,
    activationAllowed: !requiresControlledRootDeactivation,
    activeCompatible: activeCompatible === true,
    activeCommandState: activeState,
    requiresControlledRootDeactivation,
  };
}
