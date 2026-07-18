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
const authorityCapture = hydration.indexOf("const wasAuthoritative = shiftExecutionServerState.status === \"ready\" && shiftExecutionServerState.commandsEnabled === true;");
const loadingTransition = hydration.indexOf('shiftExecutionServerState = { ...shiftExecutionServerState, status: "loading", error: "" };');
const persistenceGuard = hydration.indexOf("if (!wasAuthoritative) persistUiState();");
assert(authorityCapture >= 0 && authorityCapture < loadingTransition, "shift execution hydration must capture authority before entering loading state");
assert(persistenceGuard > loadingTransition, "shift execution hydration must persist only after a completed authority transition");
assert((hydration.match(/const wasAuthoritative =/g) || []).length === 1, "shift execution hydration must have one stable authority-transition capture");

console.log("Shift execution hydration QA: OK");
