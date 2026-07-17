export const BOOTSTRAP_SNAPSHOT_STORAGE_KEY = "mes-planning-prototype-bootstrap-snapshot-v1";
export const BOOTSTRAP_SNAPSHOT_FILE_URL = "./bootstrap-snapshot.json";
export const BOOTSTRAP_SNAPSHOT_VALUE_KEYS = [
  "mes-planning-prototype-state-v2",
  "mes-planning-prototype-ui-v1",
  "mes-planning-prototype-directories-v2",
  "mes-planning-prototype-directories-defaults-restored-v1",
  "mes-planning-prototype-directories-deleted-entities-v1",
  "mes-planning-prototype-work-center-operations-seeded-v2",
];

export function getBootstrapSnapshotCountsFromState(sourcePlanning = {}, sourceDirectory = {}) {
  return {
    specifications: Array.isArray(sourceDirectory?.specifications) ? sourceDirectory.specifications.length : 0,
    bomLists: Array.isArray(sourceDirectory?.bomLists) ? sourceDirectory.bomLists.length : 0,
    nomenclature: Array.isArray(sourceDirectory?.nomenclature) ? sourceDirectory.nomenclature.length : 0,
    routes: Array.isArray(sourcePlanning?.routes) ? sourcePlanning.routes.length : 0,
    routeSteps: Array.isArray(sourcePlanning?.routeSteps) ? sourcePlanning.routeSteps.length : 0,
    slots: Array.isArray(sourcePlanning?.slots) ? sourcePlanning.slots.length : 0,
  };
}

export function isMeaningfulBootstrapSnapshotCounts(counts = {}) {
  return Boolean(
    counts.specifications
    || counts.bomLists
    || counts.nomenclature
    || counts.routes
    || counts.routeSteps
    || counts.slots
  );
}

export function getBootstrapSnapshotTimestamp(snapshot = {}) {
  const time = Date.parse(snapshot?.updatedAt || snapshot?.savedAt || snapshot?.createdAt || "");
  return Number.isFinite(time) ? time : 0;
}

export function isUsableBootstrapSnapshot(snapshot, options = {}) {
  if (!snapshot?.values || typeof snapshot.values !== "object") return false;
  if (snapshot.source === "codex-localstorage-import") return false;
  const counts = isMeaningfulBootstrapSnapshotCounts(snapshot.counts)
    ? snapshot.counts
    : (typeof options.getCountsFromValues === "function" ? options.getCountsFromValues(snapshot.values) : {});
  return isMeaningfulBootstrapSnapshotCounts(counts);
}

export function shouldPreferBundledBootstrapSnapshot(bundledSnapshot, savedSnapshot, options = {}) {
  if (!isUsableBootstrapSnapshot(bundledSnapshot, options)) return false;
  if (!isUsableBootstrapSnapshot(savedSnapshot, options)) return true;
  return getBootstrapSnapshotTimestamp(bundledSnapshot) > getBootstrapSnapshotTimestamp(savedSnapshot);
}
