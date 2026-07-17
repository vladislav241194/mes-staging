const MODULE_ID_PATTERN = /^[a-z][A-Za-z0-9]*$/;

export const MES_MODULE_NAVIGATION_SCOPES = Object.freeze({
  USER: "user",
  ADMIN_ONLY: "admin-only",
  STANDALONE: "standalone",
});

export const MES_MODULE_LAYOUT_PATTERNS = Object.freeze({
  SIDEBAR_WORKSPACE: "sidebar-workspace",
  REGISTRY_TABLE: "registry-table",
  TREE_EDITOR: "tree-editor",
  MATRIX: "matrix",
  BOARD: "board",
  CALENDAR: "calendar",
  DASHBOARD: "dashboard",
  DETAIL_WORKFLOW: "detail-workflow",
  FULL_WIDTH: "full-width",
  PROTECTED_CANVAS: "protected-canvas",
});

export const MES_MODULE_RUNTIME_KINDS = Object.freeze({
  STANDARD: "standard",
  SPECIAL: "special",
});

export const MES_MODULE_RUNTIME_CONTRACTS = Object.freeze({
  HARD: "hard-v1",
  GANTT: "gantt-v1",
});

export const MES_MODULE_RUNTIME_LIFECYCLES = Object.freeze({
  STANDARD_READY: "standard-ready",
  FACTORY_LAZY: "factory-lazy",
  BLUEPRINT_NATIVE: "blueprint-native",
  SPECIAL_RUNTIME: "special-runtime",
});

export const MES_MODULE_HEADER_MODES = Object.freeze({
  REQUIRED: "required",
  ABSENT: "absent",
  SPECIAL: "special",
});

export const MES_MODULE_SIDEBAR_MODES = Object.freeze({
  REQUIRED: "required",
  OPTIONAL: "optional",
  ABSENT: "absent",
});

const LAYOUT_PATTERN_VALUES = new Set(Object.values(MES_MODULE_LAYOUT_PATTERNS));
const NAVIGATION_SCOPE_VALUES = new Set(Object.values(MES_MODULE_NAVIGATION_SCOPES));
const RUNTIME_KIND_VALUES = new Set(Object.values(MES_MODULE_RUNTIME_KINDS));
const RUNTIME_CONTRACT_VALUES = new Set(Object.values(MES_MODULE_RUNTIME_CONTRACTS));
const RUNTIME_LIFECYCLE_VALUES = new Set(Object.values(MES_MODULE_RUNTIME_LIFECYCLES));
const HEADER_MODE_VALUES = new Set(Object.values(MES_MODULE_HEADER_MODES));
const SIDEBAR_MODE_VALUES = new Set(Object.values(MES_MODULE_SIDEBAR_MODES));

function freezeRecord(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeRecord));
  if (!value || typeof value !== "object") return value;
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, freezeRecord(child)]),
  ));
}

function assertBlueprint(condition, message) {
  if (!condition) throw new Error(`Invalid MES module blueprint: ${message}`);
}

function normalizeStringList(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

export function defineMesModuleBlueprint(input = {}) {
  const id = String(input.id || "").trim();
  const label = String(input.label || "").trim();
  const icon = String(input.icon || "").trim();
  const navigation = input.navigation && typeof input.navigation === "object" ? input.navigation : {};
  const layout = input.layout && typeof input.layout === "object" ? input.layout : {};
  const runtime = input.runtime && typeof input.runtime === "object" ? input.runtime : {};
  const qa = input.qa && typeof input.qa === "object" ? input.qa : {};
  const flow = input.flow && typeof input.flow === "object" ? input.flow : {};
  const access = input.access && typeof input.access === "object" ? input.access : {};
  const capabilities = input.capabilities && typeof input.capabilities === "object" ? input.capabilities : {};
  const ownership = input.ownership && typeof input.ownership === "object" ? input.ownership : {};
  const sourceFiles = normalizeStringList(input.sourceFiles || ownership.files);
  const defaultRoleActions = Object.fromEntries(Object.entries(access.defaultRoleActions || {}).map(([roleId, actions]) => [
    String(roleId || "").trim(),
    normalizeStringList(actions),
  ]).filter(([roleId]) => roleId));

  assertBlueprint(MODULE_ID_PATTERN.test(id), `id must match ${MODULE_ID_PATTERN}, got "${id}"`);
  assertBlueprint(Boolean(label), `${id}.label is required`);
  assertBlueprint(Boolean(icon), `${id}.icon is required`);
  assertBlueprint(NAVIGATION_SCOPE_VALUES.has(navigation.scope), `${id}.navigation.scope is unsupported`);
  assertBlueprint(Number.isFinite(navigation.order), `${id}.navigation.order must be a number`);
  if (navigation.scope === MES_MODULE_NAVIGATION_SCOPES.USER) {
    assertBlueprint(Boolean(navigation.groupId), `${id}.navigation.groupId is required for user modules`);
  } else {
    assertBlueprint(!navigation.groupId, `${id}.navigation.groupId must be empty outside the user sidebar`);
  }

  assertBlueprint(LAYOUT_PATTERN_VALUES.has(layout.pattern), `${id}.layout.pattern is unsupported`);
  assertBlueprint(HEADER_MODE_VALUES.has(layout.header), `${id}.layout.header is unsupported`);
  assertBlueprint(SIDEBAR_MODE_VALUES.has(layout.sidebar), `${id}.layout.sidebar is unsupported`);
  assertBlueprint(Boolean(layout.shellClassName), `${id}.layout.shellClassName is required`);
  assertBlueprint(Boolean(layout.ariaLabel), `${id}.layout.ariaLabel is required`);

  assertBlueprint(RUNTIME_KIND_VALUES.has(runtime.kind), `${id}.runtime.kind is unsupported`);
  assertBlueprint(RUNTIME_CONTRACT_VALUES.has(runtime.contract), `${id}.runtime.contract is unsupported`);
  const runtimeInstanceKey = String(runtime.instanceKey || id).trim();
  const runtimeLifecycle = String(runtime.lifecycle || (
    input.prototypeNative === true
      ? MES_MODULE_RUNTIME_LIFECYCLES.BLUEPRINT_NATIVE
      : MES_MODULE_RUNTIME_LIFECYCLES.STANDARD_READY
  )).trim();
  assertBlueprint(MODULE_ID_PATTERN.test(runtimeInstanceKey), `${id}.runtime.instanceKey must match ${MODULE_ID_PATTERN}`);
  assertBlueprint(RUNTIME_LIFECYCLE_VALUES.has(runtimeLifecycle), `${id}.runtime.lifecycle is unsupported`);
  if (runtime.kind === MES_MODULE_RUNTIME_KINDS.SPECIAL) {
    assertBlueprint(Boolean(runtime.component), `${id}.runtime.component is required for a special runtime`);
    assertBlueprint(Boolean(runtime.protection), `${id}.runtime.protection is required for a special runtime`);
    assertBlueprint(runtimeLifecycle === MES_MODULE_RUNTIME_LIFECYCLES.SPECIAL_RUNTIME, `${id}.runtime.lifecycle must be special-runtime`);
  } else {
    assertBlueprint(runtimeLifecycle !== MES_MODULE_RUNTIME_LIFECYCLES.SPECIAL_RUNTIME, `${id}.runtime.lifecycle cannot be special-runtime`);
  }
  if (input.prototypeNative === true) {
    assertBlueprint(runtimeLifecycle === MES_MODULE_RUNTIME_LIFECYCLES.BLUEPRINT_NATIVE, `${id}.runtime.lifecycle must be blueprint-native`);
  }
  if (runtimeLifecycle === MES_MODULE_RUNTIME_LIFECYCLES.BLUEPRINT_NATIVE) {
    assertBlueprint(input.prototypeNative === true, `${id}.prototypeNative must be true for blueprint-native lifecycle`);
  }

  assertBlueprint(Boolean(qa.visualWave), `${id}.qa.visualWave is required`);
  assertBlueprint(qa.parity && typeof qa.parity === "object", `${id}.qa.parity is required`);
  assertBlueprint(qa.regression && typeof qa.regression === "object", `${id}.qa.regression is required`);
  assertBlueprint(qa.smoke !== false, `${id}.qa.smoke cannot be disabled for a live blueprint`);
  assertBlueprint(Number.isFinite(flow.order), `${id}.flow.order must be a number`);
  assertBlueprint(sourceFiles.length > 0, `${id}.sourceFiles must own at least one runtime source`);
  if (navigation.scope === MES_MODULE_NAVIGATION_SCOPES.USER) {
    assertBlueprint(
      Object.keys(defaultRoleActions).length > 0 || access.nonAdminReachability === "documented-exception",
      `${id}.access.defaultRoleActions must make a user module reachable`,
    );
  }

  const flowContract = flow.contract && typeof flow.contract === "object"
    ? { ...flow.contract, id }
    : null;
  if (flowContract) {
    assertBlueprint(Boolean(flowContract.label), `${id}.flow.contract.label is required`);
    assertBlueprint(Boolean(flowContract.group), `${id}.flow.contract.group is required`);
    assertBlueprint(Boolean(flowContract.role), `${id}.flow.contract.role is required`);
    assertBlueprint(Array.isArray(flowContract.reads), `${id}.flow.contract.reads must be an array`);
    assertBlueprint(Array.isArray(flowContract.writes), `${id}.flow.contract.writes must be an array`);
    assertBlueprint(Boolean(flowContract.ganttImpact), `${id}.flow.contract.ganttImpact is required`);
    assertBlueprint(Boolean(flowContract.ganttVisualChange), `${id}.flow.contract.ganttVisualChange is required`);
    assertBlueprint(Boolean(flowContract.editPolicy), `${id}.flow.contract.editPolicy is required`);
  }

  return freezeRecord({
    id,
    label,
    icon,
    navigation: {
      groupId: navigation.groupId || null,
      order: navigation.order,
      scope: navigation.scope,
    },
    layout: {
      pattern: layout.pattern,
      header: layout.header,
      sidebar: layout.sidebar,
      shellClassName: String(layout.shellClassName || "").trim(),
      pageClassName: String(layout.pageClassName || "").trim(),
      sidebarClassName: String(layout.sidebarClassName || "").trim(),
      workspaceClassName: String(layout.workspaceClassName || "").trim(),
      contentClassName: String(layout.contentClassName || "").trim(),
      ariaLabel: String(layout.ariaLabel || label).trim(),
      visualContract: String(layout.visualContract || "").trim(),
      contractMode: String(layout.contractMode || "standard").trim(),
      density: String(layout.density || "").trim(),
    },
    runtime: {
      kind: runtime.kind,
      contract: runtime.contract,
      instanceKey: runtimeInstanceKey,
      lifecycle: runtimeLifecycle,
      chrome: String(runtime.chrome || "standard").trim(),
      component: String(runtime.component || "ModulePage").trim(),
      protection: String(runtime.protection || "").trim(),
      contractLabel: String(runtime.contractLabel || "").trim(),
    },
    qa: {
      smoke: true,
      visualWave: String(qa.visualWave).trim(),
      parity: {
        workspaceSurface: String(qa.parity?.workspaceSurface || "standard").trim() || "standard",
        ...qa.parity,
      },
      regression: { ...qa.regression },
      mobileLimitedReason: String(qa.mobileLimitedReason || "").trim(),
      overlayProbeSelector: String(qa.overlayProbeSelector || "").trim(),
      overlayProbeException: String(qa.overlayProbeException || "").trim(),
    },
    flow: {
      order: flow.order,
      contract: flowContract,
    },
    access: {
      defaultRoleActions,
      nonAdminReachability: String(access.nonAdminReachability || "").trim(),
    },
    capabilities: {
      table: capabilities.table === true,
      tree: capabilities.tree === true,
      actions: capabilities.actions === true,
      overlays: normalizeStringList(capabilities.overlays),
    },
    ownership: {
      files: sourceFiles,
      css: normalizeStringList(ownership.css),
      storage: normalizeStringList(ownership.storage),
      api: normalizeStringList(ownership.api),
      qa: normalizeStringList(ownership.qa),
    },
    sourceFiles,
    prototypeNative: input.prototypeNative === true,
  });
}

export function createMesModuleBlueprintRegistry(definitions = []) {
  const registry = (Array.isArray(definitions) ? definitions : []).map((definition) => (
    Object.isFrozen(definition) ? definition : defineMesModuleBlueprint(definition)
  ));
  const duplicateIds = registry
    .map((blueprint) => blueprint.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  assertBlueprint(!duplicateIds.length, `duplicate ids: ${[...new Set(duplicateIds)].join(", ")}`);
  return Object.freeze(registry);
}
