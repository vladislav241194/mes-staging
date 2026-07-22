import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

export const REACT_RUNTIME_POLICY_FILE = "react-runtime-policy.json";
export const REACT_RUNTIME_POLICY_MODES = Object.freeze(["legacy", "evaluation", "react"]);
export const REACT_RUNTIME_PERMANENT_CONSUMERS = Object.freeze([
  "nomenclature",
  "componentTypes",
  "operations",
  "nomenclatureTypes",
  "statuses",
  "boards",
  "structureEmployees",
  "structurePositions",
  "structureOrgUnits",
  "structureWorkCenters",
  "structureEquipment",
  "structureResponsibilityPolicies",
  "structureMigrationDiagnostics",
  "roles",
  "weeklyProductionControl",
  "timesheet",
  "shiftWorkOrders",
  "shiftMasterBoard",
  "authPicker",
  "planningWorkbench",
  "employeeDesktop",
  "contourAdmin",
  "gantt",
  "specifications2",
  "dispatch",
]);
export const REACT_RUNTIME_SURFACE_IDS = Object.freeze([
  "nomenclature",
  "componentTypes",
  "operations",
  "nomenclatureTypes",
  "statuses",
  "boards",
  "structureEmployees",
  "structurePositions",
  "structureOrgUnits",
  "structureWorkCenters",
  "structureEquipment",
  "structureResponsibilityPolicies",
  "structureMigrationDiagnostics",
  "roles",
  "weeklyProductionControl",
  "timesheet",
  "planningWorkbench",
  "shiftWorkOrders",
  "shiftMasterBoard",
  "employeeDesktop",
  "specifications2",
  "gantt",
  "authPicker",
  "contourAdmin",
  "dispatch",
]);

export const REACT_RUNTIME_EVALUATION_ENV = Object.freeze({
  nomenclature: Object.freeze({ feature: "MES_REACT_NOMENCLATURE", permissions: Object.freeze(["MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION", "MES_REACT_NOMENCLATURE_WRITE_EVALUATION"]) }),
  componentTypes: Object.freeze({ feature: "MES_REACT_DIRECTORY_COMPONENT_TYPES", permissions: Object.freeze(["MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION"]) }),
  operations: Object.freeze({ feature: "MES_REACT_DIRECTORY_OPERATIONS", permissions: Object.freeze(["MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION"]) }),
  nomenclatureTypes: Object.freeze({ feature: "MES_REACT_DIRECTORY_NOMENCLATURE_TYPES", permissions: Object.freeze(["MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION"]) }),
  statuses: Object.freeze({ feature: "MES_REACT_DIRECTORY_STATUSES", permissions: Object.freeze(["MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION"]) }),
  boards: Object.freeze({ feature: "MES_REACT_BOARDS", permissions: Object.freeze(["MES_REACT_BOARDS_READ_ONLY_EVALUATION"]) }),
  structureEmployees: Object.freeze({ feature: "MES_REACT_STRUCTURE_EMPLOYEES", permissions: Object.freeze(["MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION"]) }),
  structurePositions: Object.freeze({ feature: "MES_REACT_STRUCTURE_POSITIONS", permissions: Object.freeze(["MES_REACT_STRUCTURE_POSITIONS_READ_ONLY_EVALUATION"]) }),
  structureOrgUnits: Object.freeze({ feature: "MES_REACT_STRUCTURE_ORG_UNITS", permissions: Object.freeze(["MES_REACT_STRUCTURE_ORG_UNITS_READ_ONLY_EVALUATION"]) }),
  structureWorkCenters: Object.freeze({ feature: "MES_REACT_STRUCTURE_WORK_CENTERS", permissions: Object.freeze(["MES_REACT_STRUCTURE_WORK_CENTERS_READ_ONLY_EVALUATION"]) }),
  structureEquipment: Object.freeze({ feature: "MES_REACT_STRUCTURE_EQUIPMENT", permissions: Object.freeze(["MES_REACT_STRUCTURE_EQUIPMENT_READ_ONLY_EVALUATION"]) }),
  structureResponsibilityPolicies: Object.freeze({ feature: "MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES", permissions: Object.freeze(["MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES_READ_ONLY_EVALUATION"]) }),
  structureMigrationDiagnostics: Object.freeze({ feature: "MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS", permissions: Object.freeze(["MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS_READ_ONLY_EVALUATION"]) }),
  roles: Object.freeze({ feature: "MES_REACT_ROLES", permissions: Object.freeze(["MES_REACT_ROLES_READ_ONLY_EVALUATION"]) }),
  weeklyProductionControl: Object.freeze({ feature: "MES_REACT_WEEKLY_PRODUCTION_CONTROL", permissions: Object.freeze(["MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION"]) }),
  timesheet: Object.freeze({ feature: "MES_REACT_TIMESHEET", permissions: Object.freeze(["MES_REACT_TIMESHEET_READ_ONLY_EVALUATION"]) }),
  planningWorkbench: Object.freeze({ feature: "MES_REACT_PLANNING_WORKBENCH", permissions: Object.freeze(["MES_REACT_PLANNING_WORKBENCH_READ_ONLY_EVALUATION", "MES_REACT_PLANNING_WORKBENCH_WRITE_EVALUATION"]) }),
  shiftWorkOrders: Object.freeze({ feature: "MES_REACT_SHIFT_WORK_ORDERS", permissions: Object.freeze(["MES_REACT_SHIFT_WORK_ORDERS_READ_ONLY_EVALUATION"]) }),
  shiftMasterBoard: Object.freeze({ feature: "MES_REACT_SHIFT_MASTER_BOARD", permissions: Object.freeze(["MES_REACT_SHIFT_MASTER_BOARD_READ_ONLY_EVALUATION"]) }),
  employeeDesktop: Object.freeze({ feature: "MES_REACT_EMPLOYEE_DESKTOP", permissions: Object.freeze(["MES_REACT_EMPLOYEE_DESKTOP_READ_ONLY_EVALUATION"]) }),
  specifications2: Object.freeze({ feature: "MES_REACT_SPECIFICATIONS2", permissions: Object.freeze(["MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION"]) }),
  gantt: Object.freeze({ feature: "MES_REACT_GANTT", permissions: Object.freeze(["MES_REACT_GANTT_READ_ONLY_EVALUATION"]) }),
  authPicker: Object.freeze({ feature: "MES_REACT_AUTH_PICKER", permissions: Object.freeze(["MES_REACT_AUTH_PICKER_READ_ONLY_EVALUATION"]) }),
  contourAdmin: Object.freeze({ feature: "MES_REACT_CONTOUR_ADMIN", permissions: Object.freeze(["MES_REACT_CONTOUR_ADMIN_READ_ONLY_EVALUATION"]) }),
  dispatch: Object.freeze({ feature: "MES_REACT_DISPATCH", permissions: Object.freeze(["MES_REACT_DISPATCH_READ_ONLY_EVALUATION"]) }),
});

const PROTECTED_ENVS = new Set(["pilot", "staging", "user-testing", "production"]);

function normalizeEnvValue(value) {
  return String(value ?? "").trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function implicitLegacyPolicy() {
  return Object.freeze({
    schemaVersion: 1,
    policyId: "implicit-legacy",
    surfaces: Object.freeze(Object.fromEntries(REACT_RUNTIME_SURFACE_IDS.map((id) => [id, "legacy"]))),
    sha256: null,
    source: "implicit-legacy",
  });
}

export function normalizeReactRuntimePolicy(value, { sha256Digest = null, source = REACT_RUNTIME_POLICY_FILE } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("React runtime policy must be an object");
  if (value.schemaVersion !== 1) throw new Error("Unsupported React runtime policy schema");
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/i.test(String(value.policyId || ""))) throw new Error("React runtime policy id is invalid");
  if (!value.surfaces || typeof value.surfaces !== "object" || Array.isArray(value.surfaces)) throw new Error("React runtime policy surfaces are missing");
  const actualIds = Object.keys(value.surfaces).sort();
  const expectedIds = [...REACT_RUNTIME_SURFACE_IDS].sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) throw new Error("React runtime policy must declare every production surface exactly once");
  const surfaces = {};
  for (const id of REACT_RUNTIME_SURFACE_IDS) {
    const mode = String(value.surfaces[id] || "");
    if (!REACT_RUNTIME_POLICY_MODES.includes(mode)) throw new Error(`Unsupported React runtime mode for ${id}: ${mode || "<empty>"}`);
    if (mode === "react" && !REACT_RUNTIME_PERMANENT_CONSUMERS.includes(id)) {
      throw new Error(`React runtime surface is not wired for permanent mode: ${id}`);
    }
    surfaces[id] = mode;
  }
  return Object.freeze({
    schemaVersion: 1,
    policyId: String(value.policyId),
    surfaces: Object.freeze(surfaces),
    sha256: sha256Digest,
    source,
  });
}

export async function loadReactRuntimePolicy({ projectRoot = process.cwd(), env = process.env } = {}) {
  const appEnv = normalizeEnvValue(env.APP_ENV).toLowerCase() || "local";
  const override = normalizeEnvValue(env.MES_REACT_RUNTIME_POLICY_PATH);
  if (override && PROTECTED_ENVS.has(appEnv)) throw new Error("React runtime policy path override is forbidden in protected environments");
  const policyPath = override
    ? (isAbsolute(override) ? override : resolve(projectRoot, override))
    : join(projectRoot, REACT_RUNTIME_POLICY_FILE);
  let sourceText;
  try {
    sourceText = await readFile(policyPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT" && !override && !PROTECTED_ENVS.has(appEnv)) return implicitLegacyPolicy();
    if (error?.code === "ENOENT" && !override) {
      throw new Error(`React runtime policy is required in protected environment: ${appEnv}`);
    }
    throw error;
  }
  return normalizeReactRuntimePolicy(JSON.parse(sourceText), {
    sha256Digest: sha256(sourceText),
    source: override ? "local-override" : REACT_RUNTIME_POLICY_FILE,
  });
}

export function assertReactRuntimeEnvironment(env = process.env, policy = implicitLegacyPolicy()) {
  const knownEnvironmentNames = new Set(["MES_REACT_RUNTIME_POLICY_PATH"]);
  for (const contract of Object.values(REACT_RUNTIME_EVALUATION_ENV)) {
    knownEnvironmentNames.add(contract.feature);
    contract.permissions.forEach((name) => knownEnvironmentNames.add(name));
  }
  const unknownConfiguredNames = Object.keys(env)
    .filter((name) => name.startsWith("MES_REACT_") && normalizeEnvValue(env[name]) !== "" && !knownEnvironmentNames.has(name));
  if (unknownConfiguredNames.length) {
    throw new Error(`Unknown configured React runtime environment flag(s): ${unknownConfiguredNames.sort().join(", ")}`);
  }

  const invalidValues = [...knownEnvironmentNames]
    .filter((name) => name !== "MES_REACT_RUNTIME_POLICY_PATH")
    .filter((name) => {
      const value = normalizeEnvValue(env[name]);
      return value !== "" && value !== "1";
    });
  if (invalidValues.length) {
    throw new Error(`React runtime environment flags must use the exact value 1: ${invalidValues.sort().join(", ")}`);
  }

  const enabled = [];
  for (const id of REACT_RUNTIME_SURFACE_IDS) {
    const contract = REACT_RUNTIME_EVALUATION_ENV[id];
    const featureEnabled = normalizeEnvValue(env[contract.feature]) === "1";
    const enabledPermissions = contract.permissions.filter((name) => normalizeEnvValue(env[name]) === "1");
    if (!featureEnabled && enabledPermissions.length === 0) continue;
    if (policy.surfaces[id] !== "evaluation") {
      throw new Error(`React evaluation flags are forbidden for ${id} while runtime mode is ${policy.surfaces[id]}`);
    }
    if (!featureEnabled) throw new Error(`React evaluation permission is orphaned for ${id}`);
    if (enabledPermissions.length === 0) throw new Error(`React evaluation feature flag is orphaned for ${id}`);
    if (enabledPermissions.length > 1) throw new Error(`Exactly one React evaluation permission must be enabled for ${id}`);
    enabled.push(id);
  }
  if (enabled.length > 1) throw new Error(`Only one React evaluation surface may be enabled: ${enabled.join(", ")}`);
  return enabled;
}

export const assertSingleReactEvaluationPermission = assertReactRuntimeEnvironment;

export function getPublicReactRuntimePolicy(policy = implicitLegacyPolicy()) {
  return Object.freeze({
    schemaVersion: policy.schemaVersion,
    policyId: policy.policyId,
    sha256: policy.sha256,
    source: policy.source,
    surfaces: policy.surfaces,
  });
}

export function summarizeReactRuntimePolicy(policy = implicitLegacyPolicy(), { activeEvaluationSurfaces = [] } = {}) {
  return Object.freeze({
    policyId: policy.policyId,
    sha256: policy.sha256,
    activeEvaluationSurfaces: Object.freeze([...activeEvaluationSurfaces]),
    reactSurfaces: REACT_RUNTIME_SURFACE_IDS.filter((id) => policy.surfaces[id] === "react"),
    evaluationSurfaces: REACT_RUNTIME_SURFACE_IDS.filter((id) => policy.surfaces[id] === "evaluation"),
    legacySurfaces: REACT_RUNTIME_SURFACE_IDS.filter((id) => policy.surfaces[id] === "legacy"),
  });
}
