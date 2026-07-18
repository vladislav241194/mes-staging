import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { MES_MODULE_FLOW_SEQUENCE } from "../src/mes_contracts.js";
import {
  MES_MODULE_NAVIGATION_GROUPS,
  MES_MODULE_NAVIGATION_REGISTRY,
  MES_MODULE_NAVIGATION_SCOPES,
  getMesModuleNavigationDefinitions,
  getMesModuleNavigationGroups,
} from "../src/module_registry.js";
import {
  MES_FEATURE_REGISTRY,
  MES_MODULE_FEATURE_REGISTRY,
} from "../src/feature_registry.js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

function fail(message) {
  failures.push(message);
}

async function fileExists(relativePath) {
  try {
    const item = await stat(join(projectRoot, relativePath));
    return item.isFile();
  } catch {
    return false;
  }
}

function assertArray(value, label, featureId) {
  if (!Array.isArray(value)) fail(`${featureId}: ${label} must be an array`);
}

const navigationIds = MES_MODULE_NAVIGATION_REGISTRY.map((moduleItem) => moduleItem.id);
const duplicateNavigationIds = navigationIds.filter((id, index) => navigationIds.indexOf(id) !== index);
const validNavigationScopes = new Set(Object.values(MES_MODULE_NAVIGATION_SCOPES));
const navigationGroupIds = new Set(MES_MODULE_NAVIGATION_GROUPS.map((group) => group.id));
if (duplicateNavigationIds.length) fail(`Duplicate navigation module ids: ${[...new Set(duplicateNavigationIds)].join(", ")}`);
MES_MODULE_FLOW_SEQUENCE.forEach((moduleId) => {
  if (!navigationIds.includes(moduleId)) fail(`Navigation registry is missing module: ${moduleId}`);
});
navigationIds.forEach((moduleId) => {
  if (!MES_MODULE_FLOW_SEQUENCE.includes(moduleId)) fail(`Navigation registry references unknown module: ${moduleId}`);
});
MES_MODULE_NAVIGATION_REGISTRY.forEach((moduleItem) => {
  if (!validNavigationScopes.has(moduleItem.scope)) fail(`${moduleItem.id}: invalid navigation scope ${moduleItem.scope}`);
  if (moduleItem.scope === MES_MODULE_NAVIGATION_SCOPES.USER && !navigationGroupIds.has(moduleItem.groupId)) {
    fail(`${moduleItem.id}: user module requires a known navigation group`);
  }
  if (moduleItem.scope !== MES_MODULE_NAVIGATION_SCOPES.USER && moduleItem.groupId) {
    fail(`${moduleItem.id}: ${moduleItem.scope} module must not be assigned to a user navigation group`);
  }
});
const contourAdminNavigation = MES_MODULE_NAVIGATION_REGISTRY.find((moduleItem) => moduleItem.id === "contourAdmin");
const authPrototypeNavigation = MES_MODULE_NAVIGATION_REGISTRY.find((moduleItem) => moduleItem.id === "authPrototype");
if (contourAdminNavigation?.scope !== MES_MODULE_NAVIGATION_SCOPES.ADMIN_ONLY) fail("contourAdmin must be admin-only in navigation registry");
if (authPrototypeNavigation?.scope !== MES_MODULE_NAVIGATION_SCOPES.STANDALONE) fail("authPrototype must be standalone in navigation registry");
const publicNavigationDefinitions = getMesModuleNavigationDefinitions({ adminHost: false });
const adminNavigationDefinitions = getMesModuleNavigationDefinitions({ adminHost: true });
if (publicNavigationDefinitions.some((moduleItem) => moduleItem.id === "contourAdmin")) fail("Public navigation definitions must exclude contourAdmin");
if (adminNavigationDefinitions.length !== 1 || adminNavigationDefinitions[0]?.id !== "contourAdmin") fail("Admin navigation definitions must contain only contourAdmin");
const publicNavigationGroups = getMesModuleNavigationGroups(publicNavigationDefinitions);
if (publicNavigationGroups.some((group) => group.modules.some((moduleItem) => moduleItem.id === "contourAdmin"))) {
  fail("Public navigation groups must exclude contourAdmin");
}

const ids = new Set();
for (const feature of MES_FEATURE_REGISTRY) {
  if (!feature?.id) {
    fail("Feature without id");
    continue;
  }
  if (ids.has(feature.id)) fail(`Duplicate feature id: ${feature.id}`);
  ids.add(feature.id);

  ["domains", "ui", "storage", "api", "files", "qa"].forEach((key) => {
    assertArray(feature[key], key, feature.id);
  });
  if (feature.externalFiles !== undefined) assertArray(feature.externalFiles, "externalFiles", feature.id);
  for (const externalFile of feature.externalFiles || []) {
    if (!feature.files?.includes(externalFile)) fail(`${feature.id}: external file must also be owned by files: ${externalFile}`);
  }

  for (const file of [...(feature.files || []), ...(feature.ui || []), ...(feature.qa || [])]) {
    if (file.startsWith("/api/")) continue;
    if (feature.externalFiles?.includes(file)) continue;
    if (!await fileExists(file)) fail(`${feature.id}: missing registry file ${file}`);
  }
}

const registryById = new Map(MES_FEATURE_REGISTRY.map((feature) => [feature.id, feature]));
["bootstrapSnapshot", "sharedState", "contourAdmin", "module:gantt"].forEach((id) => {
  if (!registryById.has(id)) fail(`Required feature is missing from registry: ${id}`);
});

const moduleFeatureByModuleId = new Map(MES_MODULE_FEATURE_REGISTRY.map((feature) => [feature.moduleId, feature]));
const missingModuleFeatures = MES_MODULE_FLOW_SEQUENCE.filter((moduleId) => !moduleFeatureByModuleId.has(moduleId));
const unknownModuleFeatures = MES_MODULE_FEATURE_REGISTRY
  .map((feature) => feature.moduleId)
  .filter((moduleId) => !MES_MODULE_FLOW_SEQUENCE.includes(moduleId));
if (missingModuleFeatures.length) {
  fail(`Feature registry is missing module ownership: ${missingModuleFeatures.join(", ")}`);
}
if (unknownModuleFeatures.length) {
  fail(`Feature registry references unknown module ownership: ${unknownModuleFeatures.join(", ")}`);
}
for (const moduleId of MES_MODULE_FLOW_SEQUENCE) {
  const feature = moduleFeatureByModuleId.get(moduleId);
  if (!feature) continue;
  if (feature.id !== `module:${moduleId}`) {
    fail(`${moduleId}: module feature id must be module:${moduleId}`);
  }
  if (!feature.flowContract || feature.flowContract !== moduleId) {
    fail(`${moduleId}: module feature must reference its flowContract`);
  }
  if (!feature.ui?.length) {
    fail(`${moduleId}: module feature must own at least one UI file`);
  }
  if (!feature.qa?.length) {
    fail(`${moduleId}: module feature must own at least one QA gate`);
  }
}

const bootstrapFeature = registryById.get("bootstrapSnapshot");
if (bootstrapFeature && !bootstrapFeature.files.includes("bootstrap-snapshot.json")) {
  fail("bootstrapSnapshot feature must own bootstrap-snapshot.json");
}
if (bootstrapFeature && !bootstrapFeature.externalFiles?.includes("bootstrap-snapshot.json")) {
  fail("bootstrapSnapshot must classify bootstrap-snapshot.json as a contour-owned external artifact");
}
if (bootstrapFeature?.status !== "external-compatibility-artifact") {
  fail("bootstrapSnapshot must not be classified as an active working-source seed");
}

const removedPresetFeature = registryById.get("workflowPresetUi");
if (!removedPresetFeature || removedPresetFeature.status !== "removed") {
  fail("workflowPresetUi must stay as an explicit removed/tombstone feature");
}

const sourceFiles = [
  "src/app.js",
  "src/module_registry.js",
  "server.js",
  "scripts/build.mjs",
  "scripts/deploy-contour.mjs",
  "scripts/run-with-local-server.mjs",
  "scripts/preview-dist.mjs",
  "package.json",
  "vercel.json",
];
const oldPresetHits = [];
for (const file of sourceFiles) {
  const source = await readFile(join(projectRoot, file), "utf8").catch(() => "");
  if (/workflow-preset|WORKFLOW_PRESET|workflowPreset|WorkflowPreset/.test(source)) {
    oldPresetHits.push(file);
  }
}
if (oldPresetHits.length) {
  fail(`Old workflow preset references must not return: ${oldPresetHits.join(", ")}`);
}

if (failures.length) {
  console.error(failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`OK: feature registry covers ${MES_FEATURE_REGISTRY.length} features, ${MES_MODULE_FEATURE_REGISTRY.length} modules, and blocks removed workflow preset drift.`);
