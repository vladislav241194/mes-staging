import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createShiftWorkOrderQaLegacyApi } from "../src/modules/app_interactions/shift_work_order_qa_legacy.js";

const assert = (value, message) => {
  if (!value) throw new Error(message);
};

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const appInteractionsPath = join(root, "src", "modules", "app_interactions", "render.js");
const helperPath = join(root, "src", "modules", "app_interactions", "shift_work_order_qa_legacy.js");
const [appInteractionsSource, helperSource] = await Promise.all([
  readFile(appInteractionsPath, "utf8"),
  readFile(helperPath, "utf8"),
]);

assert(
  !appInteractionsSource.includes('from "./shift_work_order_qa_legacy.js"'),
  "Shift Work Orders QA helper must not be a static interaction-shell import",
);
assert(
  appInteractionsSource.includes('import("./shift_work_order_qa_legacy.js")'),
  "Shift Work Orders QA helper must load through a dynamic import",
);
assert(
  appInteractionsSource.includes("function ensureShiftWorkOrderQaLegacyApi()")
    && appInteractionsSource.includes("if (shiftWorkOrderQaLegacyApi) return Promise.resolve(shiftWorkOrderQaLegacyApi);")
    && appInteractionsSource.includes("if (!shiftWorkOrderQaLegacyLoad)"),
  "Shift Work Orders QA helper must use a single-flight lazy loader",
);
assert(
  appInteractionsSource.includes("if (!isShiftWorkOrderQaRuntimeRequest()) return deniedResult;"),
  "Non-QA runtime calls must fail before loading the legacy helper",
);
assert(
  !appInteractionsSource.includes("QA распределение для журнала")
    && !appInteractionsSource.includes("saveShiftMasterBoardAssignment(row.id, {")
    && !appInteractionsSource.includes("ui.shiftWorkOrderIssueReports = normalizeShiftWorkOrderIssueReports(reportsByRow);"),
  "Shift Work Orders QA seed implementation must not remain in the static interaction shell",
);
assert(
  helperSource.includes("export function createShiftWorkOrderQaLegacyApi")
    && helperSource.includes("QA распределение для журнала")
    && helperSource.includes("saveShiftMasterBoardAssignment(row.id, {")
    && helperSource.includes("ui.shiftWorkOrderIssueReports = normalizeShiftWorkOrderIssueReports(reportsByRow);"),
  "Lazy helper must retain both Shift Work Orders QA seed implementations",
);

let deniedMutationCount = 0;
const deniedApi = createShiftWorkOrderQaLegacyApi({
  getUi: () => ({}),
  getShiftMasterBoardModel: () => ({ allRows: [{ id: "shift-row" }] }),
  normalizeShiftWorkOrderIssueReports: () => {
    deniedMutationCount += 1;
    return {};
  },
  saveShiftMasterBoardAssignment: () => {
    deniedMutationCount += 1;
    return null;
  },
});
assert(
  deniedApi.setShiftWorkOrderIssueReportsForTest({ row: [] }).applied === false
    && deniedApi.seedShiftWorkOrderJournalAssignmentForTest().seeded === false,
  "Lazy helper must deny both methods unless QA access is explicit",
);
assert(deniedMutationCount === 0, "Denied QA calls must not mutate runtime state");

const ui = { activeShiftMasterId: "master-active" };
let persistCount = 0;
let renderCount = 0;
let savedAssignment = null;
const authorizedApi = createShiftWorkOrderQaLegacyApi({
  getUi: () => ui,
  getShiftMasterBoardModel: () => ({
    allRows: [{
      id: "shift-row-1",
      plannedQuantity: 10,
      availableEmployees: [{ id: "employee-1" }],
    }],
  }),
  isQaRuntimeRequest: () => true,
  normalizeShiftMasterBoardQuantity: (value) => Number(value) || 0,
  normalizeShiftWorkOrderIssueReports: (reports) => ({ normalized: reports.normalized || [] }),
  persistUiState: () => { persistCount += 1; },
  renderPreservingModuleScroll: () => { renderCount += 1; },
  saveShiftMasterBoardAssignment: (rowId, assignment) => {
    savedAssignment = { rowId, assignment };
    return { assignedQuantity: assignment.executors[0].quantity };
  },
});

const issueReport = authorizedApi.setShiftWorkOrderIssueReportsForTest({ normalized: [{ id: "report-1" }] });
assert(issueReport.applied && issueReport.rowCount === 1, "Authorized issue-report QA seed must preserve its result contract");
assert(persistCount === 1 && renderCount === 1, "Issue-report QA seed must persist and rerender exactly once");

const assignmentReport = authorizedApi.seedShiftWorkOrderJournalAssignmentForTest();
assert(
  assignmentReport.seeded
    && assignmentReport.rowId === "shift-row-1"
    && assignmentReport.assignedQuantity === 5
    && assignmentReport.plannedQuantity === 10,
  "Authorized journal QA seed must preserve its assignment result contract",
);
assert(
  savedAssignment?.rowId === "shift-row-1"
    && savedAssignment.assignment.masterId === "master-active"
    && savedAssignment.assignment.executors[0].employeeId === "employee-1"
    && savedAssignment.assignment.executors[0].quantity === 5,
  "Authorized journal QA seed must preserve assignment payload semantics",
);
assert(renderCount === 2, "Journal QA seed must rerender after assignment");

// After a build, prove that the seed implementation is emitted outside the
// boot bundle. Keep the source-level contract runnable in a fresh clone too.
try {
  const bundledApp = await readFile(join(root, "dist", "src", "app.js"), "utf8");
  const chunkDir = join(root, "dist", "src", "chunks");
  const chunkEntries = (await readdir(chunkDir)).filter((entry) => entry.endsWith(".js"));
  const chunks = await Promise.all(chunkEntries.map(async (entry) => ({
    entry,
    source: await readFile(join(chunkDir, entry), "utf8"),
  })));
  const qaChunk = chunks.find(({ source }) => source.includes("QA распределение для журнала"));
  assert(qaChunk, "Build must emit a dedicated Shift Work Orders QA seed chunk");
  assert(!bundledApp.includes("QA распределение для журнала"), "Boot bundle must not inline Shift Work Orders QA seed logic");
  assert(
    bundledApp.includes(`./chunks/${qaChunk.entry}`),
    "Boot bundle must reach Shift Work Orders QA seed logic only through its dynamic chunk",
  );
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log("Shift Work Orders QA runtime lazy-load QA passed");
