import {
  SYSTEM_DOMAIN_REGISTRY_NAMES,
  normalizeSystemDomains,
} from "./service.js";

const MAX_CHANGED_FIELD_PATHS = 24;
const COMPATIBILITY_SNAPSHOT_METADATA_PATHS = new Set([
  "$.lastMutationRegistry",
  "$.migratedAt",
  "$.updatedAt",
]);

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function canonicalize(value, fieldName = "") {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => canonicalize(item));
    // Responsibility targets model a set. Their ordering must not produce a
    // false conflict between a snapshot and rows read back from PostgreSQL.
    return fieldName === "targetEmployeeIds"
      ? normalized.sort((left, right) => String(left).localeCompare(String(right), "en"))
      : normalized;
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key], key)]));
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function collectChangedFieldPaths(left, right, {
  path = "$",
  paths = [],
  limit = MAX_CHANGED_FIELD_PATHS,
} = {}) {
  if (Object.is(left, right) || paths.length >= limit) return paths;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      paths.push(`${path}.length`);
      return paths;
    }
    left.forEach((entry, index) => collectChangedFieldPaths(entry, right[index], {
      path: `${path}[${index}]`, paths, limit,
    }));
    return paths;
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") {
    paths.push(path);
    return paths;
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  keys.forEach((key) => collectChangedFieldPaths(left[key], right[key], {
    path: `${path}.${key}`, paths, limit,
  }));
  return paths;
}

function mapById(items = []) {
  return new Map(items.map((item) => [String(item?.id || "").trim(), item]).filter(([id]) => id));
}

function reconcileRegistry(snapshotItems = [], postgresItems = []) {
  const snapshot = mapById(snapshotItems);
  const postgres = mapById(postgresItems);
  const snapshotOnlyIds = [...snapshot.keys()].filter((id) => !postgres.has(id));
  const postgresOnlyIds = [...postgres.keys()].filter((id) => !snapshot.has(id));
  const changedFieldPaths = new Set();
  let changedEntities = 0;
  let changedFields = 0;
  for (const id of [...snapshot.keys()].filter((candidate) => postgres.has(candidate))) {
    const left = canonicalize(snapshot.get(id));
    const right = canonicalize(postgres.get(id));
    if (canonicalJson(left) === canonicalJson(right)) continue;
    changedEntities += 1;
    const paths = collectChangedFieldPaths(left, right);
    changedFields += paths.length;
    paths.forEach((path) => changedFieldPaths.add(path));
  }
  return {
    snapshotCount: snapshot.size,
    postgresCount: postgres.size,
    addedInPostgres: postgresOnlyIds.length,
    missingFromPostgres: snapshotOnlyIds.length,
    changedEntities,
    changedFields,
    changedFieldPaths: [...changedFieldPaths].sort().slice(0, MAX_CHANGED_FIELD_PATHS),
    matches: snapshotOnlyIds.length === 0 && postgresOnlyIds.length === 0 && changedEntities === 0,
  };
}

function reconcileMetadata(snapshotMetadata = {}, postgresMetadata = {}) {
  const left = canonicalize(asRecord(snapshotMetadata));
  const right = canonicalize(asRecord(postgresMetadata));
  const changedFieldPaths = canonicalJson(left) === canonicalJson(right)
    ? []
    : collectChangedFieldPaths(left, right);
  return {
    changedFields: changedFieldPaths.length,
    changedFieldPaths,
    hasUnallowlistedDifference: metadataHasUnallowlistedDifference(left, right),
    matches: changedFieldPaths.length === 0,
  };
}

function isCompatibilitySnapshotMetadataPathAllowed(path) {
  return COMPATIBILITY_SNAPSHOT_METADATA_PATHS.has(path)
    || /^\$\.lastMutationKeys(?:\.|\[|$)/.test(path);
}

function metadataHasUnallowlistedDifference(left, right, path = "$") {
  if (canonicalJson(left) === canonicalJson(right)) return false;
  if (isCompatibilitySnapshotMetadataPathAllowed(path)) return false;
  if (Array.isArray(left) || Array.isArray(right)
    || !left || !right || typeof left !== "object" || typeof right !== "object") return true;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .some((key) => metadataHasUnallowlistedDifference(left[key], right[key], `${path}.${key}`));
}

function inspectCompatibilitySnapshotPromotion({ registries, metadata, snapshotState, stable }) {
  const entries = Object.values(registries);
  const reasons = [];
  if (snapshotState !== "active") reasons.push(`snapshot-${snapshotState}`);
  if (!stable) reasons.push("source-not-stable");
  if (entries.some((entry) => entry.missingFromPostgres > 0)) reasons.push("snapshot-has-entities-missing-in-postgres");
  if (entries.some((entry) => entry.changedEntities > 0)) reasons.push("shared-entities-differ");
  if (metadata.hasUnallowlistedDifference) reasons.push("metadata-diff-not-allowlisted");
  return {
    eligible: reasons.length === 0,
    reasonCodes: reasons,
  };
}

// This report deliberately exposes only counts and schema paths. It is safe
// to surface in readiness diagnostics: no employee names, comments, source
// references, or changed values leave the primary stores.
export function reconcileSystemDomains({
  snapshotDomains,
  postgresDomains,
  snapshotVersion = 0,
  postgresRevision = 0,
  snapshotState = "active",
  stability = "unverified",
} = {}) {
  const snapshot = normalizeSystemDomains(snapshotDomains || {});
  const postgres = normalizeSystemDomains(postgresDomains || {});
  const registries = Object.fromEntries(SYSTEM_DOMAIN_REGISTRY_NAMES.map((name) => [
    name,
    reconcileRegistry(snapshot.registries[name], postgres.registries[name]),
  ]));
  const metadata = reconcileMetadata(snapshot.metadata, postgres.metadata);
  const summary = Object.values(registries).reduce((result, entry) => ({
    registriesCompared: result.registriesCompared + 1,
    addedInPostgres: result.addedInPostgres + entry.addedInPostgres,
    missingFromPostgres: result.missingFromPostgres + entry.missingFromPostgres,
    changedEntities: result.changedEntities + entry.changedEntities,
    changedFields: result.changedFields + entry.changedFields,
  }), {
    registriesCompared: 0,
    addedInPostgres: 0,
    missingFromPostgres: 0,
    changedEntities: 0,
    changedFields: 0,
  });
  summary.changedFields += metadata.changedFields;
  const stable = stability === "verified";
  const matches = snapshotState === "active"
    && stable
    && metadata.matches
    && Object.values(registries).every((entry) => entry.matches);
  const reasonCodes = [];
  if (snapshotState !== "active") reasonCodes.push(`snapshot-${snapshotState}`);
  if (!stable) reasonCodes.push(`source-${stability}`);
  if (!metadata.matches || Object.values(registries).some((entry) => !entry.matches)) reasonCodes.push("projection-diff");
  if (!reasonCodes.length) reasonCodes.push("manual-promotion-proof-required");
  const snapshotPromotion = inspectCompatibilitySnapshotPromotion({ registries, metadata, snapshotState, stable });
  return {
    contractVersion: 1,
    comparison: {
      snapshotState,
      snapshotVersion: Number(snapshotVersion || 0),
      postgresRevision: Number(postgresRevision || 0),
      comparable: snapshotState === "active",
      stability,
      stable,
    },
    matches,
    summary,
    registries,
    metadata,
    // These are eligibility signals only. No caller may use them to mutate
    // a store without an explicit, backed-up promotion command.
    promotion: {
      readEligible: matches,
      writeEligible: false,
      retirementEligible: false,
      reasonCodes,
      // A distinct, one-shot operation may write PostgreSQL's additive facts
      // to the compatibility snapshot. It is deliberately not command
      // authority: callers still need an explicit backup, version proof and
      // post-write parity check before making any write.
      snapshotPromotionEligible: snapshotPromotion.eligible,
      snapshotPromotionReasonCodes: snapshotPromotion.reasonCodes,
    },
  };
}
