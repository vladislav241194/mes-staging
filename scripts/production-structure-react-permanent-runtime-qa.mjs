import assert from "node:assert/strict";

import {
  createStructureEmployeesReactIslandHost,
  createStructureEquipmentReactIslandHost,
  createStructureMigrationDiagnosticsReactIslandHost,
  createStructureOrgUnitsReactIslandHost,
  createStructurePositionsReactIslandHost,
  createStructureResponsibilityPoliciesReactIslandHost,
  createStructureWorkCentersReactIslandHost,
} from "../src/modules/production_structure_matrix/react_island_host.js";

class FakeElement {
  constructor() { this.children = []; this.dataset = {}; this.isConnected = true; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = String(value); }
}

const factories = [
  ["employees", createStructureEmployeesReactIslandHost],
  ["positions", createStructurePositionsReactIslandHost],
  ["orgUnits", createStructureOrgUnitsReactIslandHost],
  ["workCenters", createStructureWorkCentersReactIslandHost],
  ["equipment", createStructureEquipmentReactIslandHost],
  ["responsibilityPolicies", createStructureResponsibilityPoliciesReactIslandHost],
  ["migrationDiagnostics", createStructureMigrationDiagnosticsReactIslandHost],
];
const previousHTMLElement = globalThis.HTMLElement;
const previousDocument = globalThis.document;
const previousWindow = globalThis.window;
globalThis.HTMLElement = FakeElement;
globalThis.document = { createElement: () => new FakeElement() };
globalThis.window = { __MES_DEPLOY_VERSION__: "qa" };

try {
  for (const [registryId, factory] of factories) {
    let activation = { runtimeMode: "react", accessMode: "react", featureFlagEnabled: true, serverReadReady: false, serverReadFailure: "", policyId: "qa-structure-permanent" };
    const target = new FakeElement();
    const host = factory({
      getActivation: () => activation,
      getPayload: () => ({}),
      getTargetRoot: () => ({ querySelector: () => target }),
      reportError: () => {},
    });
    assert.deepEqual(host.prepareRender(), { activateReact: true, reason: "eligible" }, `${registryId}: permanent renderer must own the route before read readiness`);
    assert.match(host.renderTarget(), /data-react-island-runtime-mode="react"/);
    assert.match(host.renderTarget(), /data-react-island-state="loading"/);
    assert.equal(await host.mount(), false, `${registryId}: incomplete read must not mount`);
    activation = { ...activation, serverReadFailure: "read-unavailable" };
    assert.match(host.renderTarget(), /data-react-island-state="error"/);
    assert.equal(host.getFallbackReason(), "", `${registryId}: permanent loading/read error must not select legacy`);

    activation = { ...activation, serverReadReady: true, serverReadFailure: "" };
    host.prepareRender();
    assert.equal(await host.mount(), false, `${registryId}: missing QA bundle must fail closed`);
    await new Promise((resolve) => queueMicrotask(resolve));
    assert.equal(host.getFailureReason(), "mount-error", `${registryId}: permanent mount failure must latch`);
    assert.equal(host.getFallbackReason(), "", `${registryId}: permanent mount failure must not select legacy`);

    const evaluationHost = factory({
      getActivation: () => ({ runtimeMode: "evaluation", accessMode: "read-only-evaluation", featureFlagEnabled: true, serverReadReady: true }),
      getPayload: () => ({}),
      getTargetRoot: () => ({ querySelector: () => new FakeElement() }),
      reportError: () => {},
    });
    assert.equal(await evaluationHost.mount(), false);
    await new Promise((resolve) => queueMicrotask(resolve));
    assert.equal(evaluationHost.getFailureReason(), "mount-error", `${registryId}: evaluation failure must latch in React`);
    assert.equal(evaluationHost.getFallbackReason(), "", `${registryId}: evaluation failure must not select same-release legacy`);

    const disabledHost = factory({
      getActivation: () => ({ runtimeMode: "legacy", accessMode: "legacy", featureFlagEnabled: false, serverReadReady: false }),
      getPayload: () => ({}),
      getTargetRoot: () => null,
    });
    assert.deepEqual(disabledHost.prepareRender(), { activateReact: false, reason: "disabled" });
    assert.match(disabledHost.renderTarget(), /data-react-island-runtime-mode="disabled"/);
    assert.match(disabledHost.renderTarget(), /data-react-island-state="error"/);
    assert.match(disabledHost.renderTarget(), /runtime-policy-disabled/);
  }
  console.log("Production Structure permanent runtime QA passed: seven React-only fail-closed owners.");
} finally {
  if (previousHTMLElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = previousHTMLElement;
  if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
}
