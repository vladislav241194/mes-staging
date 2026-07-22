const STANDARD_PROFILE = Object.freeze({
  id: "standard",
  workspaceSteps: Object.freeze([
    Object.freeze({ command: "npm", args: Object.freeze(["run", "qa:stabilize"]) }),
  ]),
  verifyBuiltRuntimePolicy: false,
  localBuildDescription: "workspace QA plus immutable Git-object npm ci --ignore-scripts and two matching builds",
});

const ACCELERATED_PROFILE = Object.freeze({
  id: "accelerated",
  workspaceSteps: Object.freeze([
    Object.freeze({ command: "npm", args: Object.freeze(["run", "qa:syntax"]) }),
    Object.freeze({ command: "npm", args: Object.freeze(["run", "typecheck:react"]) }),
    Object.freeze({ command: "npm", args: Object.freeze(["run", "qa:react-cutover"]) }),
    Object.freeze({ command: "npm", args: Object.freeze(["run", "qa:react-runtime-policy"]) }),
    Object.freeze({ command: "git", args: Object.freeze(["diff", "--check"]) }),
  ]),
  verifyBuiltRuntimePolicy: true,
  localBuildDescription: "accelerated nonvisual workspace QA plus immutable Git-object npm ci --ignore-scripts, two matching builds and built runtime-policy verification",
});

const RELEASE_QA_PROFILES = Object.freeze({
  standard: STANDARD_PROFILE,
  accelerated: ACCELERATED_PROFILE,
});

export function resolveReleaseQaProfile(value = "standard") {
  const normalized = String(value || "standard").trim().toLowerCase();
  const profile = RELEASE_QA_PROFILES[normalized];
  if (!profile) {
    throw new Error(`Unknown release QA profile: ${value}. Expected one of: ${Object.keys(RELEASE_QA_PROFILES).join(", ")}`);
  }
  return profile;
}

export function listReleaseQaProfileIds() {
  return Object.keys(RELEASE_QA_PROFILES);
}
