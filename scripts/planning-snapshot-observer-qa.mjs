import {
  beginPlanningSnapshotObservation,
  getPlanningSnapshotFingerprint,
  hasPlanningSnapshotChange,
  isPlanningSnapshotObservationEnabled,
  recordPlanningSnapshotObservation,
  resolvePlanningSnapshotObservationEnvironment,
} from "./planning-snapshot-observer.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

const CURRENT = {
  version: 14,
  values: {
    "mes-planning-prototype-state-v2": JSON.stringify({ routes: [{ id: "route-a", quantity: 10 }] }),
    "unrelated": "before",
  },
};

const NEXT = {
  version: 15,
  values: {
    "mes-planning-prototype-state-v2": JSON.stringify({ routes: [{ id: "route-a", quantity: 20 }] }),
    "unrelated": "after",
  },
};

const env = {
  MES_DOMAIN_STORAGE: "postgres",
  DATABASE_URL: "postgresql://qa:qa@127.0.0.1:5432/mes_qa",
};

assert(isPlanningSnapshotObservationEnabled(env), "PostgreSQL storage must enable the observation guard by default");
assert(!isPlanningSnapshotObservationEnabled({ ...env, MES_ENABLE_PLANNING_SNAPSHOT_OBSERVER: "off" }), "Explicit observer rollback flag must disable the guard");
assert(hasPlanningSnapshotChange(CURRENT, NEXT), "Planning value change must be detected before a managed snapshot write");
assert(!hasPlanningSnapshotChange(CURRENT, { ...CURRENT, sharedUi: { selected: "x" } }), "UI-only changes must not invalidate Planning observation");

const resolvedPilot = await resolvePlanningSnapshotObservationEnvironment({
  env: { APP_ENV: "pilot", MES_DOMAIN_STORAGE: "postgres", DATABASE_URL: "postgresql://pilot" },
  targetAppEnv: "pilot",
  targetSharedStateFile: "/srv/mes/pilot/shared-state/pilot.json",
});
assert(resolvedPilot.MES_DOMAIN_STORAGE === "postgres" && resolvedPilot.DATABASE_URL === "postgresql://pilot", "Pilot service environment must remain the preferred guarded connection");

const resolvedRootPilot = await resolvePlanningSnapshotObservationEnvironment({
  env: {},
  targetAppEnv: "pilot",
  targetSharedStateFile: "/srv/mes/pilot/shared-state/pilot.json",
  readEnvFile: async () => "DATABASE_URL='postgresql://root-pilot'\n",
});
assert(resolvedRootPilot.MES_DOMAIN_STORAGE === "postgres" && resolvedRootPilot.DATABASE_URL === "postgresql://root-pilot", "Standalone pilot writers must resolve the protected pilot domain environment when it is readable");

const stagingCannotLeakIntoPilot = await resolvePlanningSnapshotObservationEnvironment({
  env: { APP_ENV: "staging", MES_DOMAIN_STORAGE: "postgres", DATABASE_URL: "postgresql://staging" },
  targetAppEnv: "pilot",
  targetSharedStateFile: "/srv/mes/pilot/shared-state/pilot.json",
  readEnvFile: async () => { throw Object.assign(new Error("permission denied"), { code: "EACCES" }); },
});
assert(stagingCannotLeakIntoPilot.MES_DOMAIN_STORAGE === "postgres" && !stagingCannotLeakIntoPilot.DATABASE_URL, "Cross-contour writer must fail closed instead of using a staging database for a pilot marker");

const calls = [];
const repository = {
  async beginPlanningSnapshotObservation({ source }) {
    calls.push(["begin", source]);
    return { primaryRevision: 17, snapshotGeneration: 9 };
  },
  async recordPlanningSnapshotObservation(payload) {
    calls.push(["record", payload]);
    return true;
  },
};
const observation = await beginPlanningSnapshotObservation({
  env,
  current: CURRENT,
  next: NEXT,
  source: "qa-managed-write",
  repositoryFactory: ({ databaseUrl }) => {
    assert(databaseUrl === env.DATABASE_URL, "Observer must use the configured local PostgreSQL URL");
    return repository;
  },
});
assert(observation.ok && observation.enabled && observation.snapshotGeneration === 9, "Managed Planning write must create a pending durable generation first");
assert(observation.snapshotFingerprint === getPlanningSnapshotFingerprint(NEXT), "Observation must bind the next planning value fingerprint before the write");
assert(calls.length === 1 && calls[0][0] === "begin", "Observation record must not run before the snapshot write succeeds");

const recorded = await recordPlanningSnapshotObservation({
  observation,
  snapshot: NEXT,
  source: "qa-managed-write",
});
assert(recorded.attempted && recorded.recorded, "Managed Planning write must record only after the snapshot is committed");
assert(calls.length === 2 && calls[1][0] === "record", "Observation lifecycle must be begin then record");
assert(calls[1][1].snapshotGeneration === 9 && calls[1][1].snapshotVersion === 15, "Record must bind the new shared-state version to the exact generation");
assert(calls[1][1].snapshotFingerprint === getPlanningSnapshotFingerprint(NEXT), "Record must preserve the planned fingerprint from admission");

let noPlanningRepositoryCalls = 0;
const uiOnly = await beginPlanningSnapshotObservation({
  env,
  current: CURRENT,
  next: { ...CURRENT, sharedUi: { selected: "x" } },
  repositoryFactory: () => {
    noPlanningRepositoryCalls += 1;
    return repository;
  },
});
assert(uiOnly.ok && !uiOnly.enabled && !uiOnly.changed && noPlanningRepositoryCalls === 0, "Unrelated shared-state writes must not churn the Planning marker");

const schemaFallback = await beginPlanningSnapshotObservation({
  env,
  current: CURRENT,
  next: NEXT,
  repositoryFactory: () => ({
    async beginPlanningSnapshotObservation() {
      const error = new Error("column snapshot_generation does not exist");
      error.code = "42703";
      throw error;
    },
  }),
});
assert(schemaFallback.ok && schemaFallback.schemaUnavailable, "Pre-migration rolling deployment must retain the prior snapshot-health safety path");

const unavailable = await beginPlanningSnapshotObservation({
  env,
  current: CURRENT,
  next: NEXT,
  repositoryFactory: () => ({
    async beginPlanningSnapshotObservation() {
      const error = new Error("connection refused");
      error.code = "ECONNREFUSED";
      throw error;
    },
  }),
});
assert(!unavailable.ok && unavailable.enabled && !unavailable.schemaUnavailable, "A live observer failure must block a Planning-changing snapshot write before it commits");

const rejectedRecord = await recordPlanningSnapshotObservation({
  observation: { ...observation, repository: { async recordPlanningSnapshotObservation() { return false; } } },
  snapshot: NEXT,
});
assert(rejectedRecord.attempted && !rejectedRecord.recorded, "Post-write observation rejection must remain pending instead of faking a trusted generation");

console.log("Planning snapshot observer QA: OK");
