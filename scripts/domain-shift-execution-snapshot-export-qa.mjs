import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { exportShiftExecutionFile } from "./domain-shift-execution-snapshot-export.mjs";

function assert(value, message) { if (!value) throw new Error(message); }

const directory = await mkdtemp(join(tmpdir(), "mes-shift-snapshot-export-qa-"));
const source = join(directory, "shared-state.json");
const output = join(directory, "shift-export.json");
const snapshot = { sharedUi: {
  shiftMasterBoardAssignments: { "row-1": { slotId: "slot-1", routeId: "wo-1", stepId: "op-1", workCenterId: "D1", plannedQuantity: 2, assignedQuantity: 2, unit: "шт.", status: "draft", createdAt: "2026-07-17T08:00:00.000Z", updatedAt: "2026-07-17T08:00:00.000Z" } },
  shiftMasterBoardFacts: {}, shiftMasterBoardCarryovers: {},
} };
try {
  await writeFile(source, JSON.stringify(snapshot), "utf-8");
  const direct = await exportShiftExecutionFile(source);
  assert(direct.shiftAssignments.length === 1 && direct.shiftAssignments[0].source_row_id === "row-1", "File export must preserve the source row");
  const outputText = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/domain-shift-execution-snapshot-export.mjs", "--source", source, "--out", output], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    let result = "";
    child.stdout.on("data", (chunk) => { result += chunk; });
    child.stderr.on("data", (chunk) => { result += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve(result) : reject(new Error(result)));
  });
  assert(String(outputText).includes("assignments: 1"), "CLI must report export counts");
  const written = JSON.parse(await readFile(output, "utf-8"));
  assert(written.schemaVersion === "008_shift_execution_read_model", "CLI must write the shift schema");
  const secondRun = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/domain-shift-execution-snapshot-export.mjs", "--source", source, "--out", output], { cwd: process.cwd(), stdio: ["ignore", "ignore", "pipe"] });
    let result = "";
    child.stderr.on("data", (chunk) => { result += chunk; });
    child.on("exit", (code) => resolve({ code, result }));
  });
  assert(secondRun.code !== 0 && /EEXIST/.test(secondRun.result), "CLI must not overwrite an existing export");
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log("Shift execution snapshot export QA: OK");
