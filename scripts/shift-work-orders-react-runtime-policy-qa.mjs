import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";
import { withBundledTypeScriptClient } from "./typescript-client-qa-loader.mjs";

const {
  createShiftWorkOrdersReactIslandHost,
  isShiftWorkOrdersWorkshopTargetSelected,
  resolveShiftWorkOrdersWorkshopNavigation,
} = await withBundledTypeScriptClient(
  new URL("../src/modules/shift_work_orders/react_island_host.js", import.meta.url),
  async (module) => module,
  { prefix: "mes-shift-work-orders-host-qa-" },
);

async function loadTypedShiftWorkOrderJournalOwner() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-shift-work-orders-journal-owner-"));
  try {
    const output = join(temporaryRoot, "journal-owner.mjs");
    await build({
      entryPoints: [fileURLToPath(new URL("../src/modules/shift_work_orders/journal_owner.ts", import.meta.url))],
      outfile: output,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      logLevel: "silent",
    });
    const module = await import(`${pathToFileURL(output).href}?qa=${Date.now()}`);
    return {
      createShiftWorkOrderJournalOwner: module.createShiftWorkOrderJournalOwner,
      formatShiftWorkOrderPersonName: module.formatShiftWorkOrderPersonName,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

const {
  createShiftWorkOrderJournalOwner,
  formatShiftWorkOrderPersonName,
} = await loadTypedShiftWorkOrderJournalOwner();

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Missing source boundary: ${startMarker}`);
  return source.slice(start, end);
}
const disabled = getPublicRuntimeConfig({});
assert.equal(disabled.MES_REACT_SHIFT_WORK_ORDERS, false);
assert.equal(disabled.MES_REACT_SHIFT_WORK_ORDERS_READ_ONLY_EVALUATION, false);
const enabled = getPublicRuntimeConfig({ MES_REACT_SHIFT_WORK_ORDERS: "1", MES_REACT_SHIFT_WORK_ORDERS_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" });
assert.equal(enabled.MES_REACT_SHIFT_WORK_ORDERS, true);
assert.equal(enabled.MES_REACT_SHIFT_WORK_ORDERS_READ_ONLY_EVALUATION, true);
const script = renderRuntimeConfigScript({ MES_REACT_SHIFT_WORK_ORDERS: "1", MES_REACT_SHIFT_WORK_ORDERS_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" });
assert.match(script, /"MES_REACT_SHIFT_WORK_ORDERS":true/);
assert.match(script, /"MES_REACT_SHIFT_WORK_ORDERS_READ_ONLY_EVALUATION":true/);
assert.doesNotMatch(script, /must-not-leak/);
const makeHost = (accessMode, { featureFlagEnabled = true, serverReadReady = true, serverReadFailure = "", runtimeMode = "evaluation" } = {}) => createShiftWorkOrdersReactIslandHost({ getActivation: () => ({ featureFlagEnabled, serverReadReady, serverReadFailure, accessMode, runtimeMode, policyId: "qa" }), getPayload: () => ({}), getTargetRoot: () => null });
assert.deepEqual(makeHost("read-only-evaluation").prepareRender(), { activateReact: true, reason: "eligible" });
assert.deepEqual(makeHost("write-evaluation").prepareRender(), { activateReact: true, reason: "eligible" });
assert.deepEqual(makeHost("editor").prepareRender(), { activateReact: false, reason: "write-parity-incomplete" });
const permanentPending = makeHost("react", { serverReadReady: false, runtimeMode: "react" });
assert.deepEqual(permanentPending.prepareRender(), { activateReact: true, reason: "eligible" });
assert.match(permanentPending.renderTarget(), /data-react-island-runtime-mode="react"[^]*data-react-island-state="loading"/, "permanent route must stay inside a React loading shell");
const permanentFailure = makeHost("react", { serverReadReady: false, serverReadFailure: "read-unavailable", runtimeMode: "react" });
assert.deepEqual(permanentFailure.prepareRender(), { activateReact: true, reason: "eligible" });
assert.match(permanentFailure.renderTarget(), /data-react-island-state="error"[^]*read-unavailable/, "permanent read failure must fail closed inside React");
const disabledHost = makeHost("legacy", { featureFlagEnabled: false, runtimeMode: "legacy" });
assert.deepEqual(disabledHost.prepareRender(), { activateReact: false, reason: "disabled" });
assert.match(disabledHost.renderTarget(), /data-react-island-state="error"[^]*react-required/, "a disabled current runtime must fail closed instead of rendering legacy");
const releasePolicy = JSON.parse(await readFile("react-runtime-policy.json", "utf8"));
assert.equal(releasePolicy.surfaces.shiftWorkOrders, "react", "release policy must select permanent Shift Work Orders");
await assert.rejects(
  access("src/modules/shift_work_orders/render.js"),
  (error) => error?.code === "ENOENT",
  "the retired Shift Work Orders renderer must be physically absent",
);
const appSource = await readFile("src/app.js", "utf8");
const hostSource = await readFile("src/modules/shift_work_orders/react_island_host.js", "utf8");
const journalOwnerSource = await readFile("src/modules/shift_work_orders/journal_owner.ts", "utf8");
const scenarioSource = await readFile("experiments/react-migration/src/modules/shift-work-orders/ShiftWorkOrdersScenario.tsx", "utf8");
assert.match(appSource, /surfaceId: "shiftWorkOrders"/);
assert.match(appSource, /activation\.accessMode === "react" \|\| localQa\.writeEvaluation/);
assert.match(appSource, /productionModel: getShiftWorkOrdersProductionInput\(\)/);
const routeSource = section(appSource, "    shiftWorkOrders: {", "  };\n  const prototypeAdapters");
assert.match(routeSource, /shiftWorkOrdersReactIslandHost\.prepareRender\(\);\s*return shiftWorkOrdersReactIslandHost\.renderTarget\(\);/, "the current route must always render the React-owned shell");
assert.match(routeSource, /renderModals: \(\) => ""/);
assert.match(routeSource, /bind: \(\) => \{\}/);
assert.doesNotMatch(routeSource, /ensureShiftMasterBoardModule|ensureShiftWorkOrdersModule|renderShiftWorkOrdersPage|renderShiftWorkOrderPrintPreviewModal|bindShiftWorkOrdersEvents/, "the current route must expose no legacy renderer or overlay edge");
assert.doesNotMatch(appSource, /import\("\.\/modules\/shift_work_orders\/render\.js"\)/, "the current bundle must not load the retired Shift Work Orders renderer");
assert.doesNotMatch(appSource, /function ensureShiftWorkOrdersModule\(/, "the retired dynamic loader must be deleted");
assert.match(hostSource, /canFallbackToLegacy: \(\) => false/, "bundle and render failures must fail closed in the current release");
assert.doesNotMatch(hostSource, /requestLegacyRender/, "the current Shift Work Orders host must not expose a legacy callback");
assert.match(journalOwnerSource, /buildShiftWorkOrdersProductionModel/, "shared journal consumers must use the React production model");
assert.doesNotMatch(journalOwnerSource, /shift_work_orders\/render\.js/, "the shared journal owner must not import the retired renderer");
assert.match(scenarioSource, /title="Печать СЗН"/, "the React journal must expose a stable print overlay probe trigger");

let selectedRowId = "";
const journalOwner = createShiftWorkOrderJournalOwner({
  getProductionInput: () => ({
    shiftExecution: {
      items: [{ id: "assignment-1", sourceRowId: "row-1", workOrderId: "route-1", operationId: "step-1", assignedQuantity: 4, plannedQuantity: 4, status: "assigned", updatedAt: "2026-07-22T08:00:00.000Z" }],
      scope: { dateKey: "2026-07-22" },
    },
    planning: { routes: [{ id: "route-1", name: "Изделие" }], routeSteps: [{ id: "step-1", routeId: "route-1", operationName: "Монтаж" }] },
    presentation: { selectedRowId: "row-1" },
  }),
  onSelectedRow: (row) => { selectedRowId = row.id; },
});
const journal = journalOwner.getViewModel();
assert.equal(journal.rows.length, 1, "the shared owner must build journal rows without the legacy renderer");
assert.equal(journal.selectedRow?.id, "row-1");
assert.equal(selectedRowId, "row-1");
assert.equal(formatShiftWorkOrderPersonName("Иванов Иван Иванович"), "Иванов Иван");

class FakeElement {
  constructor() { this.dataset = {}; this.isConnected = true; this.children = []; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = String(value); }
}
const previousHTMLElement = globalThis.HTMLElement;
const previousDocument = globalThis.document;
globalThis.HTMLElement = FakeElement;
globalThis.document = { createElement: () => new FakeElement() };
try {
  const target = new FakeElement();
  let legacyRequests = 0;
  const failedBundleHost = createShiftWorkOrdersReactIslandHost({
    getActivation: () => ({ featureFlagEnabled: true, serverReadReady: true, serverReadFailure: "", accessMode: "react", runtimeMode: "react", policyId: "qa" }),
    getPayload: () => ({}),
    getTargetRoot: () => ({ querySelector: () => target }),
    requestLegacyRender: () => { legacyRequests += 1; },
    reportError: () => {},
  });
  failedBundleHost.prepareRender();
  assert.equal(await failedBundleHost.mount(), false, "a missing React bundle must fail closed");
  assert.equal(target.dataset.reactIslandState, "error");
  assert.equal(legacyRequests, 0, "a missing React bundle must never request legacy rendering");
} finally {
  if (previousHTMLElement === undefined) delete globalThis.HTMLElement;
  else globalThis.HTMLElement = previousHTMLElement;
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}
const sourceRow = { id: "journal-assignment", sourceRowId: "source-slot", shiftDateKey: "2026-07-19" };
const navigation = { type: "open-workshop", journalRowId: "journal-assignment", sourceRowId: "source-slot", shiftDateKey: "2026-07-19", intent: "inspect" };
assert.deepEqual(resolveShiftWorkOrdersWorkshopNavigation(navigation, { rows: [sourceRow], canOpenWorkshop: true }), { ok: true, row: sourceRow, intent: "inspect" });
assert.equal(resolveShiftWorkOrdersWorkshopNavigation({ ...navigation, sourceRowId: "stale-slot" }, { rows: [sourceRow], canOpenWorkshop: true }).ok, false, "stale source identity must fail closed");
assert.equal(resolveShiftWorkOrdersWorkshopNavigation({ ...navigation, shiftDateKey: "2026-07-20" }, { rows: [sourceRow], canOpenWorkshop: true }).ok, false, "stale source date must fail closed");
assert.deepEqual(resolveShiftWorkOrdersWorkshopNavigation(navigation, { rows: [sourceRow], canOpenWorkshop: false }), { ok: false, message: "Нет права открывать Мастерскую." });
const carryoverRow = { id: "carryover-1", sourceRowId: "source-slot", shiftDateKey: "2026-07-20" };
const carryoverDecision = resolveShiftWorkOrdersWorkshopNavigation(
  { ...navigation, journalRowId: carryoverRow.id, sourceRowId: carryoverRow.sourceRowId, shiftDateKey: carryoverRow.shiftDateKey },
  { rows: [carryoverRow], canOpenWorkshop: true },
);
assert.equal(carryoverDecision.ok, true);
assert.equal(isShiftWorkOrdersWorkshopTargetSelected(carryoverDecision, { selectedRow: carryoverRow, dateKey: carryoverRow.shiftDateKey }), true, "carryover navigation must select the carryover card rather than its source row");
console.log("Shift Work Orders React runtime policy QA passed.");
