import { withBundledTypeScriptClient } from "./typescript-client-qa-loader.mjs";

const [
  {
    MES_MODULE_FLOW_CONTRACTS,
    MES_MODULE_FLOW_SEQUENCE,
  },
  {
    HARD_UI_RUNTIME_MODULE_IDS,
    LEGACY_UI_RUNTIME_MODULE_IDS,
    PARTIAL_UI_RUNTIME_CONTRACTS,
    PARTIAL_UI_RUNTIME_MODULE_IDS,
    SPECIAL_UI_RUNTIME_CONTRACTS,
    SPECIAL_UI_RUNTIME_MODULE_IDS,
    UI_RUNTIME_COVERAGE_NOTES,
    getUiRuntimeCoverageStatus,
  },
] = await Promise.all([
  withBundledTypeScriptClient(
    new URL("../src/mes_contracts.ts", import.meta.url),
    async (module) => module,
    { prefix: "mes-ui-runtime-coverage-flow-contracts-qa-" },
  ),
  withBundledTypeScriptClient(
    new URL("../src/ui_runtime_contracts.ts", import.meta.url),
    async (module) => module,
    { prefix: "mes-ui-runtime-coverage-contracts-qa-" },
  ),
]);

const groups = {
  hard: HARD_UI_RUNTIME_MODULE_IDS,
  special: SPECIAL_UI_RUNTIME_MODULE_IDS,
  partial: PARTIAL_UI_RUNTIME_MODULE_IDS,
  legacy: LEGACY_UI_RUNTIME_MODULE_IDS,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findDuplicates(values = []) {
  const seen = new Set();
  const duplicates = new Set();
  values.forEach((value) => {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return [...duplicates];
}

const allCoverageIds = Object.values(groups).flat();
const duplicates = findDuplicates(allCoverageIds);
assert(!duplicates.length, `UI runtime coverage has duplicate module ids: ${duplicates.join(", ")}`);

const missingFromCoverage = MES_MODULE_FLOW_SEQUENCE.filter((moduleId) => getUiRuntimeCoverageStatus(moduleId) === "unknown");
const unknownCoverageIds = allCoverageIds.filter((moduleId) => !MES_MODULE_FLOW_SEQUENCE.includes(moduleId));
const missingContracts = allCoverageIds.filter((moduleId) => !MES_MODULE_FLOW_CONTRACTS[moduleId]);
const missingSpecialRuntimeContracts = SPECIAL_UI_RUNTIME_MODULE_IDS.filter((moduleId) => !SPECIAL_UI_RUNTIME_CONTRACTS[moduleId]);
const unknownSpecialRuntimeContracts = Object.keys(SPECIAL_UI_RUNTIME_CONTRACTS).filter((moduleId) => !SPECIAL_UI_RUNTIME_MODULE_IDS.includes(moduleId));
const missingPartialRuntimeContracts = PARTIAL_UI_RUNTIME_MODULE_IDS.filter((moduleId) => {
  const contract = PARTIAL_UI_RUNTIME_CONTRACTS[moduleId];
  return !contract?.status || !contract?.reason || !contract?.nextMigration;
});
const unknownPartialRuntimeContracts = Object.keys(PARTIAL_UI_RUNTIME_CONTRACTS).filter((moduleId) => !PARTIAL_UI_RUNTIME_MODULE_IDS.includes(moduleId));

assert(!missingFromCoverage.length, `UI runtime coverage is missing modules: ${missingFromCoverage.join(", ")}`);
assert(!unknownCoverageIds.length, `UI runtime coverage references modules outside MES_MODULE_FLOW_SEQUENCE: ${unknownCoverageIds.join(", ")}`);
assert(!missingContracts.length, `UI runtime coverage references modules without MES_MODULE_FLOW_CONTRACTS: ${missingContracts.join(", ")}`);
assert(!missingSpecialRuntimeContracts.length, `Special UI runtime modules are missing runtime contracts: ${missingSpecialRuntimeContracts.join(", ")}`);
assert(!unknownSpecialRuntimeContracts.length, `Special UI runtime contracts reference non-special modules: ${unknownSpecialRuntimeContracts.join(", ")}`);
assert(!missingPartialRuntimeContracts.length, `Partial UI runtime modules require explicit contracts with status/reason/nextMigration: ${missingPartialRuntimeContracts.join(", ")}`);
assert(!unknownPartialRuntimeContracts.length, `Partial UI runtime contracts reference non-partial modules: ${unknownPartialRuntimeContracts.join(", ")}`);
assert(LEGACY_UI_RUNTIME_MODULE_IDS.length === 0, `Hard UI Runtime Coverage v2 expects no legacy modules after special runtime gates, got: ${LEGACY_UI_RUNTIME_MODULE_IDS.join(", ")}`);

Object.entries(UI_RUNTIME_COVERAGE_NOTES).forEach(([status, note]) => {
  assert(note && typeof note === "string", `UI runtime coverage note is missing for ${status}`);
});

console.log("MES UI Runtime Coverage QA");
Object.entries(groups).forEach(([status, ids]) => {
  console.log(`- ${status}: ${ids.length} (${ids.join(", ")})`);
});
console.log("OK: every MES module has an explicit UI runtime coverage status.");
