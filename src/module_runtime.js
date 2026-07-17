import {
  MES_MODULE_RUNTIME_KINDS,
  MES_MODULE_RUNTIME_LIFECYCLES,
} from "./module_blueprint.js";

function assertRuntime(condition, message) {
  if (!condition) throw new Error(`MES module runtime: ${message}`);
}

export function createMesModuleRuntime({
  blueprints = [],
  adapters = {},
  renderAppShell,
  renderSharedModals = () => "",
  bindGlobalNavigation = () => {},
  bindSharedEvents = () => {},
} = {}) {
  assertRuntime(typeof renderAppShell === "function", "renderAppShell is required");
  const blueprintById = new Map(blueprints.map((blueprint) => [blueprint.id, blueprint]));
  const instanceById = new Map();
  const lazyContractByInstanceKey = new Map();

  blueprints
    .filter((blueprint) => blueprint.runtime.kind === MES_MODULE_RUNTIME_KINDS.STANDARD)
    .forEach((blueprint) => {
      const adapter = adapters[blueprint.id];
      assertRuntime(adapter, `missing adapter for ${blueprint.id}`);
      assertRuntime(typeof adapter.render === "function", `${blueprint.id} adapter requires render()`);
      const lifecycle = blueprint.runtime.lifecycle;
      const publicPorts = Array.isArray(adapter.publicPorts) ? adapter.publicPorts : [];
      assertRuntime(
        publicPorts.every((portName) => typeof portName === "string" && portName === portName.trim() && portName && publicPorts.indexOf(portName) === publicPorts.lastIndexOf(portName)),
        `${blueprint.id} publicPorts must contain unique non-empty names`,
      );
      if (lifecycle === MES_MODULE_RUNTIME_LIFECYCLES.FACTORY_LAZY) {
        assertRuntime(typeof adapter.initialize === "function", `${blueprint.id} factory-lazy adapter requires initialize()`);
        const instanceKey = blueprint.runtime.instanceKey;
        const existingContract = lazyContractByInstanceKey.get(instanceKey);
        if (existingContract) {
          assertRuntime(existingContract.initialize === adapter.initialize, `${blueprint.id} shares ${instanceKey} with an incompatible initializer`);
          assertRuntime(
            JSON.stringify(existingContract.publicPorts) === JSON.stringify(publicPorts),
            `${blueprint.id} shares ${instanceKey} with incompatible public ports`,
          );
        } else {
          lazyContractByInstanceKey.set(instanceKey, { initialize: adapter.initialize, publicPorts });
        }
      } else {
        assertRuntime(typeof adapter.initialize !== "function", `${blueprint.id} ${lifecycle} adapter cannot declare initialize()`);
        assertRuntime(publicPorts.length === 0, `${blueprint.id} ${lifecycle} adapter cannot declare public ports`);
      }
    });
  Object.keys(adapters).forEach((moduleId) => {
    assertRuntime(blueprintById.has(moduleId), `adapter references unknown blueprint ${moduleId}`);
  });

  function getInstance(moduleId) {
    const adapter = adapters[moduleId];
    const blueprint = blueprintById.get(moduleId);
    if (blueprint?.runtime.lifecycle !== MES_MODULE_RUNTIME_LIFECYCLES.FACTORY_LAZY) return null;
    const instanceKey = blueprint?.runtime.instanceKey || moduleId;
    if (!instanceById.has(instanceKey)) {
      const instance = adapter.initialize();
      assertRuntime(instance && typeof instance === "object", `${moduleId} initialize() must return an object`);
      (adapter.publicPorts || []).forEach((portName) => {
        assertRuntime(typeof instance[portName] === "function", `${moduleId} public port ${portName} is missing`);
      });
      instanceById.set(instanceKey, instance);
    }
    return instanceById.get(instanceKey);
  }

  function getPublicPort(moduleId, portName) {
    const instance = getInstance(moduleId);
    const port = instance?.[portName];
    assertRuntime(typeof port === "function", `${moduleId} public port ${portName} is unavailable`);
    return port;
  }

  function renderModule(moduleId) {
    const blueprint = blueprintById.get(String(moduleId || "").trim());
    assertRuntime(blueprint, `unknown module ${moduleId}`);
    if (blueprint.runtime.kind === MES_MODULE_RUNTIME_KINDS.SPECIAL) {
      return { handled: false, blueprint };
    }

    const adapter = adapters[blueprint.id];
    const instance = getInstance(blueprint.id);
    const moduleModals = adapter.renderModals?.(instance) || "";
    const sharedModals = adapter.includeSharedModals === false ? "" : renderSharedModals();
    const modals = adapter.modalPosition === "after-shared"
      ? `${sharedModals}${moduleModals}`
      : `${moduleModals}${sharedModals}`;

    renderAppShell({
      pageId: blueprint.id,
      className: blueprint.layout.shellClassName,
      body: adapter.render(instance),
      modals,
      blueprint,
    });
    bindGlobalNavigation();
    adapter.bind?.(instance);
    bindSharedEvents();
    adapter.afterRender?.(instance);
    return { handled: true, blueprint };
  }

  return Object.freeze({
    getPublicPort,
    renderModule,
    getInitializedInstanceKeys: () => [...instanceById.keys()],
    getAdapterIds: () => Object.keys(adapters),
  });
}
