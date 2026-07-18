import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function assert(value, message) {
  if (!value) throw new Error(message);
}

const source = await readFile(fileURLToPath(new URL("../src/app.js", import.meta.url)), "utf8");
const start = source.indexOf("function hydrateShiftExecutionServerProjection() {");
const end = source.indexOf("function ensureShiftExecutionDomainApiModule()", start);
assert(start >= 0 && end > start, "shift execution hydration boundary must exist");
const hydration = source.slice(start, end);
const authorityCapture = hydration.indexOf("const wasAuthoritative = isShiftExecutionServerAuthoritative();");
const loadingTransition = hydration.indexOf('status: "loading",\n    commandsEnabled: false,');
const dispatchRefresh = hydration.indexOf("shiftExecutionDispatchReadModel.refresh(scope)");
const projectionMerge = hydration.indexOf("applyShiftExecutionDispatchProjection(projection);");
const coverageGuard = hydration.indexOf("if (coverageComplete && !wasAuthoritative) persistUiState();");
assert(authorityCapture >= 0 && authorityCapture < loadingTransition, "shift execution hydration must capture authority before entering loading state");
assert(loadingTransition >= 0, "shift execution hydration must disable command writes while the next scoped projection is loading");
assert(dispatchRefresh > loadingTransition, "shift execution hydration must request only the bounded dispatch projection");
assert(projectionMerge > dispatchRefresh, "shift execution hydration must merge the dispatch overlay before rendering");
assert(coverageGuard > projectionMerge, "partial dispatch coverage must never retire the compatibility snapshot");
assert((hydration.match(/const wasAuthoritative =/g) || []).length === 1, "shift execution hydration must have one stable authority-transition capture");

console.log("Shift execution hydration QA: OK");
