import { createHash } from "node:crypto";

export const NOMENCLATURE_COMMAND_MARKER_PATH = "ops/auth/nomenclature-server-command-compatibility.json";
export const NOMENCLATURE_COMMAND_REQUIRED_MIGRATIONS = Object.freeze([
  "027_employee_auth_credentials",
]);
export const NOMENCLATURE_INCOMPATIBLE_TARGET_FLAGS = Object.freeze([
  "MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS",
]);

export function parseAndValidateNomenclatureCommandMarker(source) {
  const marker = typeof source === "string" ? JSON.parse(source) : source;
  const exclusivity = marker?.controlledRootExclusivity;
  if (marker?.schemaVersion !== 1
    || marker?.contract !== "nomenclature-server-commands"
    || marker?.authorityTransitionVersion !== 1
    || marker?.revisionConcurrencyVersion !== 1
    || marker?.idempotencyReceiptVersion !== 1
    || marker?.authenticatedRbacVersion !== 1
    || exclusivity?.required !== true
    || exclusivity?.lockName !== "mes-authority-rollout.lock"
    || JSON.stringify(exclusivity?.incompatibleTargetRequiresDisabledFlags) !== JSON.stringify(NOMENCLATURE_INCOMPATIBLE_TARGET_FLAGS)
    || JSON.stringify(marker?.requiredMigrations) !== JSON.stringify(NOMENCLATURE_COMMAND_REQUIRED_MIGRATIONS)) {
    throw new Error("Nomenclature server-command compatibility marker is invalid");
  }
  return marker;
}

export function buildNomenclatureCommandManifestContract(markerSource) {
  const marker = parseAndValidateNomenclatureCommandMarker(markerSource);
  return {
    schemaVersion: 1,
    path: NOMENCLATURE_COMMAND_MARKER_PATH,
    sha256: createHash("sha256").update(markerSource).digest("hex"),
    contract: marker.contract,
    controlledRootExclusivity: marker.controlledRootExclusivity,
  };
}

export function validateNomenclatureCandidateManifest(manifest, markerSource) {
  const expected = buildNomenclatureCommandManifestContract(markerSource);
  if (manifest?.schemaVersion < 3
    || !Array.isArray(manifest?.runtimeIncludes)
    || !manifest.runtimeIncludes.includes("ops")
    || JSON.stringify(manifest?.nomenclatureCommandCompatibility) !== JSON.stringify(expected)) {
    throw new Error("Release manifest does not bind the versioned Nomenclature command compatibility marker");
  }
  return expected;
}
