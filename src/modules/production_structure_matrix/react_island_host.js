import { createReactIslandHost } from "../react_island_host.js";

const STRUCTURE_EMPLOYEES_REACT_TARGET = "[data-react-structure-employees-island]";
const STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION = "__MES_STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION__";
const STRUCTURE_POSITIONS_REACT_BUNDLE_VERSION = "__MES_STRUCTURE_POSITIONS_REACT_BUNDLE_VERSION__";
const STRUCTURE_ORG_UNITS_REACT_BUNDLE_VERSION = "__MES_STRUCTURE_ORG_UNITS_REACT_BUNDLE_VERSION__";
const STRUCTURE_WORK_CENTERS_REACT_BUNDLE_VERSION = "__MES_STRUCTURE_WORK_CENTERS_REACT_BUNDLE_VERSION__";
const STRUCTURE_EQUIPMENT_REACT_BUNDLE_VERSION = "__MES_STRUCTURE_EQUIPMENT_REACT_BUNDLE_VERSION__";
const STRUCTURE_RESPONSIBILITY_POLICIES_REACT_BUNDLE_VERSION = "__MES_STRUCTURE_RESPONSIBILITY_POLICIES_REACT_BUNDLE_VERSION__";
const STRUCTURE_MIGRATION_DIAGNOSTICS_REACT_BUNDLE_VERSION = "__MES_STRUCTURE_MIGRATION_DIAGNOSTICS_REACT_BUNDLE_VERSION__";

export function createStructureEmployeesReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  requestLegacyRender,
  executeCommand,
  reportError = (error) => console.error("[MES] Structure Employees React island failed", error),
} = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    requestLegacyRender,
    reportError,
    targetSelector: STRUCTURE_EMPLOYEES_REACT_TARGET,
    renderTarget: '<div class="mes-react-structure-employees-island" data-react-structure-employees-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (!activation.serverReadReady) return "server-read-pending";
      if (activation.accessMode !== "read-only-evaluation" && activation.accessMode !== "write-evaluation") {
        return "write-parity-incomplete";
      }
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/structure-employees.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION.startsWith("__MES_")
        ? deployVersion
        : STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => (
      loadedIsland.mountStructureEmployeesReactIsland(target, payload, {
        onError,
        onReady,
        onRequestLegacy,
        onCommand: (command) => executeCommand?.(command),
      })
    ),
  });
}

export function createStructurePositionsReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  requestLegacyRender,
  executeCommand,
  reportError = (error) => console.error("[MES] Structure Positions React island failed", error),
} = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    requestLegacyRender,
    reportError,
    targetSelector: "[data-react-structure-positions-island]",
    renderTarget: '<div class="mes-react-structure-positions-island" data-react-structure-positions-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (!activation.serverReadReady) return "server-read-pending";
      if (activation.accessMode !== "read-only-evaluation" && activation.accessMode !== "write-evaluation") return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/structure-positions.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = STRUCTURE_POSITIONS_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : STRUCTURE_POSITIONS_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => (
      loadedIsland.mountStructurePositionsReactIsland(target, payload, { onError, onReady, onRequestLegacy, onCommand: (command) => executeCommand?.(command) })
    ),
  });
}

export function createStructureOrgUnitsReactIslandHost({ getActivation, getPayload, getTargetRoot, requestLegacyRender, executeCommand, reportError = (error) => console.error("[MES] Structure Org Units React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError,
    targetSelector: "[data-react-structure-org-units-island]",
    renderTarget: '<div class="mes-react-structure-org-units-island" data-react-structure-org-units-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (!activation.serverReadReady) return "server-read-pending";
      if (!["read-only-evaluation", "write-evaluation"].includes(activation.accessMode)) return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/structure-org-units.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = STRUCTURE_ORG_UNITS_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : STRUCTURE_ORG_UNITS_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => loadedIsland.mountStructureOrgUnitsReactIsland(target, payload, { onError, onReady, onRequestLegacy, onCommand: (command) => executeCommand?.(command) }),
  });
}

export function createStructureWorkCentersReactIslandHost({ getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError = (error) => console.error("[MES] Structure Work Centers React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError,
    targetSelector: "[data-react-structure-work-centers-island]",
    renderTarget: '<div class="mes-react-structure-work-centers-island" data-react-structure-work-centers-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (!activation.serverReadReady) return "server-read-pending";
      if (activation.accessMode !== "read-only-evaluation") return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/structure-work-centers.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = STRUCTURE_WORK_CENTERS_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : STRUCTURE_WORK_CENTERS_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => loadedIsland.mountStructureWorkCentersReactIsland(target, payload, { onError, onReady, onRequestLegacy }),
  });
}

export function createStructureEquipmentReactIslandHost({ getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError = (error) => console.error("[MES] Structure Equipment React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError,
    targetSelector: "[data-react-structure-equipment-island]",
    renderTarget: '<div class="mes-react-structure-equipment-island" data-react-structure-equipment-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (!activation.serverReadReady) return "server-read-pending";
      if (activation.accessMode !== "read-only-evaluation") return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/structure-equipment.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = STRUCTURE_EQUIPMENT_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : STRUCTURE_EQUIPMENT_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion); return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => loadedIsland.mountStructureEquipmentReactIsland(target, payload, { onError, onReady, onRequestLegacy }),
  });
}

export function createStructureResponsibilityPoliciesReactIslandHost({ getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError = (error) => console.error("[MES] Structure Responsibility Policies React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError,
    targetSelector: "[data-react-structure-responsibility-policies-island]",
    renderTarget: '<div class="mes-react-structure-responsibility-policies-island" data-react-structure-responsibility-policies-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => !activation.featureFlagEnabled ? "disabled" : !activation.serverReadReady ? "server-read-pending" : activation.accessMode !== "read-only-evaluation" ? "write-parity-incomplete" : "",
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/structure-responsibility-policies.js", import.meta.url); const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = STRUCTURE_RESPONSIBILITY_POLICIES_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : STRUCTURE_RESPONSIBILITY_POLICIES_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion); return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => loadedIsland.mountStructureResponsibilityPoliciesReactIsland(target, payload, { onError, onReady, onRequestLegacy }),
  });
}

export function createStructureMigrationDiagnosticsReactIslandHost({ getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError = (error) => console.error("[MES] Structure Migration Diagnostics React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError,
    targetSelector: "[data-react-structure-migration-diagnostics-island]",
    renderTarget: '<div class="mes-react-structure-migration-diagnostics-island" data-react-structure-migration-diagnostics-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => !activation.featureFlagEnabled ? "disabled" : !activation.serverReadReady ? "server-read-pending" : activation.accessMode !== "read-only-evaluation" ? "write-parity-incomplete" : "",
    loadIsland: async () => { const islandUrl = new URL("./react-islands/structure-migration-diagnostics.js", import.meta.url); const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev"); const bundleVersion = STRUCTURE_MIGRATION_DIAGNOSTICS_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : STRUCTURE_MIGRATION_DIAGNOSTICS_REACT_BUNDLE_VERSION; islandUrl.searchParams.set("v", bundleVersion); return import(islandUrl.href); },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => loadedIsland.mountStructureMigrationDiagnosticsReactIsland(target, payload, { onError, onReady, onRequestLegacy }),
  });
}
