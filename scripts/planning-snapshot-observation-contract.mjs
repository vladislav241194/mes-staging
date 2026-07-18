// This contract is intentionally dependency-free.  Both the HTTP safety
// boundary and the PostgreSQL repository use it, so a reader cannot evolve a
// looser definition of an observed snapshot generation than the one used by
// the generic parity guard.
export function hasCurrentPlanningSnapshotObservationMarker(markerState = null, { contractVersion = 0 } = {}) {
  return Boolean(
    markerState
    && markerState.observationAvailable !== false
    && String(markerState.snapshotObservationState || "") === "observed"
    && Number(markerState.snapshotGeneration) > 0
    && Number(markerState.verifiedSnapshotGeneration) === Number(markerState.snapshotGeneration)
    && Number(markerState.verifiedPrimaryRevision) === Number(markerState.primaryRevision)
    && String(markerState.observedSnapshotFingerprint || "")
    && String(markerState.verifiedSnapshotFingerprint || "") === String(markerState.observedSnapshotFingerprint || "")
    && Number(markerState.verifiedContractVersion) === Number(contractVersion),
  );
}
