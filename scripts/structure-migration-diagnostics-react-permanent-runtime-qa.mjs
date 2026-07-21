import assert from "node:assert/strict";

import { createStructureMigrationDiagnosticsReactIslandHost } from "../src/modules/production_structure_matrix/react_island_host.js";

class FakeElement {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.isConnected = true;
    this.textContent = "";
  }

  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = String(value); }
}

const previousHTMLElement = globalThis.HTMLElement;
const previousDocument = globalThis.document;
globalThis.HTMLElement = FakeElement;
globalThis.document = { createElement: () => new FakeElement() };

try {
  const permanentTarget = new FakeElement();
  const permanentTelemetry = [];
  const permanentErrors = [];
  let permanentLegacyRenders = 0;
  const permanentHost = createStructureMigrationDiagnosticsReactIslandHost({
    getActivation: () => ({ runtimeMode: "react", accessMode: "react", featureFlagEnabled: true, serverReadReady: true, serverReadFailure: "", policyId: "qa-diagnostics-react" }),
    getPayload: () => ({}),
    getTargetRoot: () => ({ querySelector: () => permanentTarget }),
    requestLegacyRender: () => { permanentLegacyRenders += 1; },
    loadIsland: undefined,
    reportTelemetry: (event) => permanentTelemetry.push(event),
    reportError: (error) => permanentErrors.push(error.message),
  });
  // Override the module loader through the generic import boundary by using an
  // invalid base URL. The host must latch the failure without requesting the
  // live legacy renderer.
  const previousWindow = globalThis.window;
  globalThis.window = { __MES_DEPLOY_VERSION__: "qa" };
  assert.deepEqual(permanentHost.prepareRender(), { activateReact: true, reason: "eligible" });
  assert.equal(await permanentHost.mount(), false);
  assert.equal(permanentHost.getFailureReason(), "mount-error");
  assert.equal(permanentTarget.dataset.reactIslandState, "error");
  assert.equal(permanentLegacyRenders, 0, "permanent Diagnostics failure must never request a live legacy render");
  assert.equal(permanentErrors.length, 1);
  assert.equal(permanentTelemetry.filter((event) => event.state === "error" && event.stage === "mount").length, 1);
  assert.deepEqual(permanentHost.prepareRender(), { activateReact: true, reason: "mount-error" });
  assert.equal(await permanentHost.mount(), false);
  assert.equal(permanentErrors.length, 1, "latched permanent Diagnostics failure must not enter a remount loop");
  assert.equal(permanentTelemetry.filter((event) => event.state === "error").length, 1, "latched permanent failure telemetry must stay bounded");
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;

  const evaluationTarget = new FakeElement();
  const evaluationTelemetry = [];
  let evaluationLegacyRenders = 0;
  const evaluationHost = createStructureMigrationDiagnosticsReactIslandHost({
    getActivation: () => ({ runtimeMode: "evaluation", accessMode: "read-only-evaluation", featureFlagEnabled: true, serverReadReady: true, serverReadFailure: "", policyId: "qa-diagnostics-evaluation" }),
    getPayload: () => ({}),
    getTargetRoot: () => ({ querySelector: () => evaluationTarget }),
    requestLegacyRender: () => { evaluationLegacyRenders += 1; },
    reportTelemetry: (event) => evaluationTelemetry.push(event),
    reportError: () => {},
  });
  assert.equal(await evaluationHost.mount(), false);
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.equal(evaluationLegacyRenders, 1, "evaluation Diagnostics mount failure must retain legacy rollback");
  assert.equal(evaluationHost.getFallbackReason(), "mount-error");
  assert.equal(evaluationTelemetry.filter((event) => event.state === "legacy-fallback").length, 1);

  const shellTelemetry = [];
  let shellActivation = { runtimeMode: "react", accessMode: "react", featureFlagEnabled: true, serverReadReady: false, serverReadFailure: "", policyId: "qa-diagnostics-react" };
  const shellHost = createStructureMigrationDiagnosticsReactIslandHost({
    getActivation: () => shellActivation,
    getPayload: () => ({}),
    getTargetRoot: () => ({ querySelector: () => new FakeElement() }),
    requestLegacyRender: () => { throw new Error("permanent loading/error shell requested legacy"); },
    reportTelemetry: (event) => shellTelemetry.push(event),
  });
  assert.match(shellHost.renderTarget(), /data-react-island-state="loading"/);
  assert.match(shellHost.renderTarget(), /data-react-island-state="loading"/);
  assert.equal(await shellHost.mount(), false, "permanent loading shell must not mount against incomplete sources");
  assert.equal(shellTelemetry.filter((event) => event.state === "loading" && event.stage === "read").length, 1, "loading telemetry must stay bounded");
  shellActivation = { ...shellActivation, serverReadFailure: "read-unavailable" };
  assert.match(shellHost.renderTarget(), /data-react-island-state="error"/);
  assert.match(shellHost.renderTarget(), /data-react-island-state="error"/);
  assert.equal(shellTelemetry.filter((event) => event.state === "error" && event.stage === "read" && event.reason === "read-unavailable").length, 1, "read-error telemetry must stay bounded");

  console.log("Structure Migration Diagnostics permanent React runtime QA passed: fail-closed ownership, bounded telemetry, no remount loop and evaluation rollback.");
} finally {
  if (previousHTMLElement === undefined) delete globalThis.HTMLElement;
  else globalThis.HTMLElement = previousHTMLElement;
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}
