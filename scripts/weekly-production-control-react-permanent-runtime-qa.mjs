import assert from "node:assert/strict";

import { createReactIslandHost } from "../src/modules/react_island_host.js";

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
  let permanentLoads = 0;
  let permanentLegacyRenders = 0;
  const permanentHost = createReactIslandHost({
    getActivation: () => ({ runtimeMode: "react" }),
    getPayload: () => ({}),
    getTargetRoot: () => ({ querySelector: () => permanentTarget }),
    getIneligibilityReason: () => "",
    targetSelector: "[data-react-test]",
    renderTarget: '<div data-react-test data-react-island-state="loading"></div>',
    loadIsland: async () => { permanentLoads += 1; throw new Error("bounded mount failure"); },
    mountIsland: () => null,
    requestLegacyRender: () => { permanentLegacyRenders += 1; },
    canFallbackToLegacy: (activation) => activation.runtimeMode !== "react",
    getTelemetryContext: (activation) => ({ surfaceId: "weeklyProductionControl", runtimeMode: activation.runtimeMode, policyId: "qa-weekly-react" }),
    reportTelemetry: (event) => permanentTelemetry.push(event),
    reportError: (error) => permanentErrors.push(error.message),
  });

  assert.deepEqual(permanentHost.prepareRender(), { activateReact: true, reason: "eligible" });
  assert.equal(await permanentHost.mount(), false);
  assert.equal(permanentHost.getFailureReason(), "mount-error");
  assert.equal(permanentTarget.dataset.reactIslandState, "error");
  assert.equal(permanentLegacyRenders, 0, "permanent React failure must never request a live legacy render");
  assert.deepEqual(permanentErrors, ["bounded mount failure"]);
  assert.equal(permanentTelemetry.filter((event) => event.state === "error").length, 1, "permanent failure telemetry must be emitted once");
  assert.deepEqual(permanentHost.prepareRender(), { activateReact: true, reason: "mount-error" });
  assert.equal(await permanentHost.mount(), false);
  assert.equal(permanentLoads, 1, "latched permanent failure must not enter a remount loop");
  assert.equal(permanentTelemetry.filter((event) => event.state === "error").length, 1, "latched failure must not duplicate telemetry");

  const evaluationTarget = new FakeElement();
  const evaluationTelemetry = [];
  let evaluationLegacyRenders = 0;
  const evaluationHost = createReactIslandHost({
    getActivation: () => ({ runtimeMode: "evaluation" }),
    getPayload: () => ({}),
    getTargetRoot: () => ({ querySelector: () => evaluationTarget }),
    getIneligibilityReason: () => "",
    targetSelector: "[data-react-test]",
    renderTarget: '<div data-react-test data-react-island-state="loading"></div>',
    loadIsland: async () => { throw new Error("evaluation mount failure"); },
    mountIsland: () => null,
    requestLegacyRender: () => { evaluationLegacyRenders += 1; },
    canFallbackToLegacy: (activation) => activation.runtimeMode !== "react",
    getTelemetryContext: (activation) => ({ surfaceId: "weeklyProductionControl", runtimeMode: activation.runtimeMode, policyId: "qa-weekly-evaluation" }),
    reportTelemetry: (event) => evaluationTelemetry.push(event),
    reportError: () => {},
  });

  assert.equal(await evaluationHost.mount(), false);
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.equal(evaluationLegacyRenders, 1, "evaluation mount failure must retain the existing legacy rollback");
  assert.equal(evaluationHost.getFallbackReason(), "mount-error");
  assert.equal(evaluationTelemetry.filter((event) => event.state === "legacy-fallback").length, 1);

  const shellTelemetry = [];
  let shellLoads = 0;
  let shellState = { state: "loading", stage: "read", reason: "server-read-pending" };
  const shellHost = createReactIslandHost({
    getActivation: () => ({ runtimeMode: "react" }),
    getPayload: () => ({}),
    getTargetRoot: () => ({ querySelector: () => new FakeElement() }),
    getIneligibilityReason: () => "",
    getShellState: () => shellState,
    targetSelector: "[data-react-test]",
    renderTarget: ({ shellState: state }) => `<div data-react-test data-react-island-state="${state?.state || "loading"}"></div>`,
    loadIsland: async () => { shellLoads += 1; return {}; },
    mountIsland: () => null,
    canFallbackToLegacy: () => false,
    getTelemetryContext: () => ({ surfaceId: "weeklyProductionControl", runtimeMode: "react", policyId: "qa-weekly-react" }),
    reportTelemetry: (event) => shellTelemetry.push(event),
  });

  assert.match(shellHost.renderTarget(), /data-react-island-state="loading"/);
  assert.match(shellHost.renderTarget(), /data-react-island-state="loading"/);
  assert.equal(await shellHost.mount(), false);
  assert.equal(shellLoads, 0, "permanent loading shell must not mount against an unready read model");
  assert.equal(shellTelemetry.filter((event) => event.state === "loading").length, 1, "repeated renders must not duplicate loading telemetry");
  shellState = { state: "error", stage: "read", reason: "compatibility-fallback" };
  assert.match(shellHost.renderTarget(), /data-react-island-state="error"/);
  assert.match(shellHost.renderTarget(), /data-react-island-state="error"/);
  assert.equal(shellTelemetry.filter((event) => event.state === "error").length, 1, "repeated renders must not duplicate read-error telemetry");

  console.log("Weekly permanent React runtime QA passed: route ownership, bounded telemetry, no remount loop and evaluation rollback.");
} finally {
  if (previousHTMLElement === undefined) delete globalThis.HTMLElement;
  else globalThis.HTMLElement = previousHTMLElement;
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}
