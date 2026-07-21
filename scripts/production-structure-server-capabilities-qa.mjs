import assert from "node:assert/strict";

import {
  getProductionStructureElevationDecision,
  getProductionStructureWriteDecision,
  isSystemDomainsCapabilitiesResponseCurrent,
  projectSystemDomainsServerCommandState,
} from "../src/modules/production_structure_matrix/server_capabilities.js";

const employeeId = "employee-structure-admin";
const employeeActor = Object.freeze({
  id: `employee:${employeeId}`,
  employeeId,
  displayName: "Structure Admin",
  personnelNumber: "QA-001",
  scope: "employee",
});

function resultWith({
  productionStructureWriteEnabled = true,
  authorization = {},
  publicActorAuthorized = true,
  configured = true,
  configuredSurfaces = ["production-structure"],
  revision = 42,
  primary = true,
} = {}) {
  return {
    ok: true,
    // Deliberately false: Structure permission must not inherit the umbrella.
    enabled: false,
    capabilities: {
      serverCommandsConfigured: configured,
      configuredServerCommandSurfaces: configuredSurfaces,
      serverCommandsEnabled: false,
      serverCommandSurfaces: [],
      actorAuthorization: {
        policyConfigured: true,
        authorized: publicActorAuthorized,
        reason: publicActorAuthorized ? "" : "actor-not-authorized",
      },
      productionStructureWriteEnabled,
      productionStructureAuthorization: {
        authenticated: true,
        authorized: true,
        canEdit: true,
        actor: employeeActor,
        reason: "allowed",
        revision,
        infrastructureUnavailable: false,
        ...authorization,
      },
      // This is the real PostgreSQL-primary retired-snapshot shape. Raw
      // matches=false is expected and must not turn permanent writes off.
      consistency: {
        ok: true,
        matches: false,
        reason: "postgres_primary_snapshot_retired",
        revision,
        details: { authority: { mode: primary ? "postgres-primary" : "snapshot" } },
        reconciliation: { promotion: { readEligible: true } },
      },
    },
  };
}

function writeDecision(state, overrides = {}) {
  return getProductionStructureWriteDecision({
    state,
    currentRevision: 42,
    currentEmployeeId: employeeId,
    sessionActor: employeeActor,
    localCanEdit: true,
    ...overrides,
  });
}

const retiredPrimary = projectSystemDomainsServerCommandState(resultWith());
assert.equal(retiredPrimary.consistencyMatches, false);
assert.equal(retiredPrimary.consistencyRevision, 42);
assert.equal(retiredPrimary.enabled, false);
assert.deepEqual(writeDecision(retiredPrimary), { allowed: true, code: "ready" }, "dedicated Structure authority must work after snapshot retirement without the umbrella flag");
assert.equal(isSystemDomainsCapabilitiesResponseCurrent({ requestEpoch: 7, currentEpoch: 7, requestSessionIdentity: "loading|0||employee-1", currentSessionIdentity: "authenticated|1|employee:employee-1|employee-1" }), false, "a pre-login capability response must be discarded after successful PIN authentication");
assert.equal(isSystemDomainsCapabilitiesResponseCurrent({ requestEpoch: 8, currentEpoch: 8, requestSessionIdentity: "authenticated|1|employee:employee-1|employee-1", currentSessionIdentity: "authenticated|1|employee:employee-1|employee-1" }), true);

assert.equal(writeDecision(retiredPrimary, { currentRevision: 41 }).code, "authorization-revision-stale");
assert.equal(writeDecision(retiredPrimary, { currentEmployeeId: "another-employee" }).code, "employee-session-unconfirmed");
assert.equal(writeDecision(retiredPrimary, { sessionActor: { ...employeeActor, id: "employee:forged" } }).code, "employee-session-unconfirmed");
assert.equal(writeDecision(projectSystemDomainsServerCommandState(resultWith({ productionStructureWriteEnabled: false }))).code, "dedicated-command-disabled");
assert.equal(writeDecision(projectSystemDomainsServerCommandState(resultWith({ publicActorAuthorized: false }))).code, "public-perimeter-denied");
assert.equal(writeDecision(projectSystemDomainsServerCommandState(resultWith({ primary: false }))).code, "primary-unavailable");
assert.equal(writeDecision(projectSystemDomainsServerCommandState(resultWith({ configuredSurfaces: [] }))).code, "command-not-configured");

const deniedRbac = projectSystemDomainsServerCommandState(resultWith({
  productionStructureWriteEnabled: false,
  authorization: { authorized: false, canEdit: false, reason: "action-not-granted" },
}));
assert.equal(writeDecision(deniedRbac).code, "rbac-denied");
assert.equal(getProductionStructureElevationDecision({ state: deniedRbac, currentRevision: 42, currentEmployeeId: employeeId, sessionAuthenticated: true }).allowed, false, "authenticated RBAC denial must not offer PIN elevation");

for (const reason of ["employee-session-required", "employee-session-missing", "employee-session-expired", "revoked-session"]) {
  const unauthenticated = projectSystemDomainsServerCommandState(resultWith({
    productionStructureWriteEnabled: false,
    authorization: { authenticated: false, authorized: false, canEdit: false, actor: null, reason, revision: 0 },
  }));
  assert.deepEqual(
    getProductionStructureElevationDecision({ state: unauthenticated, currentRevision: 42, currentEmployeeId: employeeId, sessionAuthenticated: false }),
    { allowed: true, code: "employee-session-required" },
    `${reason}: real available auth infrastructure must offer PIN elevation`,
  );
}

for (const [reason, infrastructureUnavailable] of [
  ["employee-auth-not-configured", true],
  ["employee-session-tampered", false],
]) {
  const unavailable = projectSystemDomainsServerCommandState(resultWith({
    productionStructureWriteEnabled: false,
    authorization: { authenticated: false, authorized: false, canEdit: false, actor: null, reason, revision: 0, infrastructureUnavailable },
  }));
  assert.equal(
    getProductionStructureElevationDecision({ state: unavailable, currentRevision: 42, currentEmployeeId: employeeId, sessionAuthenticated: false }).allowed,
    false,
    `${reason}: unsafe or unavailable auth must not offer a PIN prompt`,
  );
}

assert.equal(getProductionStructureElevationDecision({ state: retiredPrimary, currentRevision: 41, currentEmployeeId: employeeId }).allowed, false, "elevation capability must belong to the current System Domains revision");

console.log("Production Structure server capabilities QA passed: dedicated retired-primary authority, exact employee actor/revision, safe PIN elevation, no umbrella permission.");
