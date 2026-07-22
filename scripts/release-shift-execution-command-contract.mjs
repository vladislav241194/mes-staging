import { createHash } from "node:crypto";

export const SHIFT_EXECUTION_COMMAND_MARKER_PATH = "ops/postgres/shift-execution-server-command-compatibility.json";
export const SHIFT_EXECUTION_COMMAND_REQUIRED_MIGRATIONS = Object.freeze([
  "008_shift_execution_read_model",
  "014_shift_execution_command_idempotency",
  "015_shift_execution_assignment_revisions",
  "016_shift_execution_fact_idempotency",
  "017_shift_execution_carryover_idempotency",
  "022_shift_execution_carryover_lifecycle",
  "025_shift_execution_postgres_authority",
  "034_shift_execution_issue_reports",
]);
export const SHIFT_EXECUTION_INCOMPATIBLE_TARGET_FLAGS = Object.freeze([
  "MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS",
]);

export function parseAndValidateShiftExecutionCommandMarker(source) {
  const marker = typeof source === "string" ? JSON.parse(source) : source;
  const exclusivity = marker?.controlledRootExclusivity;
  if (marker?.schemaVersion !== 1
    || marker?.contract !== "shift-execution-server-commands"
    || marker?.commandSurfaceVersion !== 3
    || marker?.authenticatedActorVersion !== 2
    || marker?.revisionConcurrencyVersion !== 1
    || marker?.idempotencyReceiptVersion !== 1
    || marker?.authorityTransitionVersion !== 1
    || exclusivity?.required !== true
    || exclusivity?.lockName !== "mes-authority-rollout.lock"
    || JSON.stringify(exclusivity?.incompatibleTargetRequiresDisabledFlags) !== JSON.stringify(SHIFT_EXECUTION_INCOMPATIBLE_TARGET_FLAGS)
    || JSON.stringify(marker?.requiredMigrations) !== JSON.stringify(SHIFT_EXECUTION_COMMAND_REQUIRED_MIGRATIONS)) {
    throw new Error("Shift Execution server-command compatibility marker is invalid");
  }
  return marker;
}

export function buildShiftExecutionCommandManifestContract(markerSource) {
  const marker = parseAndValidateShiftExecutionCommandMarker(markerSource);
  return {
    schemaVersion: 1,
    path: SHIFT_EXECUTION_COMMAND_MARKER_PATH,
    sha256: createHash("sha256").update(markerSource).digest("hex"),
    contract: marker.contract,
    controlledRootExclusivity: marker.controlledRootExclusivity,
  };
}

export function validateShiftExecutionCandidateManifest(manifest, markerSource) {
  const expected = buildShiftExecutionCommandManifestContract(markerSource);
  if (manifest?.schemaVersion < 3
    || !Array.isArray(manifest?.runtimeIncludes)
    || !manifest.runtimeIncludes.includes("ops")
    || JSON.stringify(manifest?.shiftExecutionCommandCompatibility) !== JSON.stringify(expected)) {
    throw new Error("Release manifest does not bind the versioned Shift Execution command compatibility marker");
  }
  return expected;
}
