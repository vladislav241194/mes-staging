import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { validateSpecifications2Export } from "./domain-specifications2-import.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };
const payload = { schemaVersion: "009_specifications2_revision_read_model", documents: [{ id: "doc-1", source_entry_id: "entry-1", title: "Изделие", designation: "АБВГ.001.001" }], revisions: [{ id: "rev-1", specification_id: "doc-1", revision_no: 1, fingerprint: "sha256:test" }], revisionItems: [{ id: "item-1", specification_revision_id: "rev-1", source_row_id: "row-1", parent_source_row_id: "", name: "Изделие", quantity: 1, unit: "шт." }], routeDocuments: [{ id: "route-1", specification_revision_id: "rev-1", source_draft_id: "draft-1" }], routeOperations: [{ id: "op-1", route_document_id: "route-1", source_operation_id: "source-op-1", sequence_no: 1 }] };
const counts = validateSpecifications2Export(payload);
assert(counts.documents === 1 && counts.revisions === 1 && counts.operations === 1, "Validator must return a complete revision import plan");
let orphan = "";
try { validateSpecifications2Export({ ...payload, revisionItems: [{ ...payload.revisionItems[0], specification_revision_id: "missing" }] }); } catch (error) { orphan = String(error.message); }
assert(/unknown revision/.test(orphan), "Validator must reject orphan revision items");
let duplicateSequence = "";
try { validateSpecifications2Export({ ...payload, routeOperations: [...payload.routeOperations, { ...payload.routeOperations[0], id: "op-2", source_operation_id: "source-op-2" }] }); } catch (error) { duplicateSequence = String(error.message); }
assert(/duplicate operation sequence/.test(duplicateSequence), "Validator must reject duplicate route sequences");
const directory = await mkdtemp(join(tmpdir(), "mes-specifications2-import-qa-"));
try {
  const file = join(directory, "specifications2-export.json"); await writeFile(file, JSON.stringify(payload), "utf-8");
  const output = await new Promise((resolve, reject) => { const child = spawn(process.execPath, ["scripts/domain-specifications2-import.mjs", file], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }); let result = ""; child.stdout.on("data", (chunk) => result += chunk); child.stderr.on("data", (chunk) => result += chunk); child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve(result) : reject(new Error(result))); });
  assert(String(output).includes("DRY RUN"), "Default revision import must not mutate PostgreSQL");
} finally { await rm(directory, { recursive: true, force: true }); }
console.log("Specifications 2.0 import QA: OK");
