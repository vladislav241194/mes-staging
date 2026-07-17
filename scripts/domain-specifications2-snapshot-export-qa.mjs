import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { exportSpecifications2Entry, exportSpecifications2Snapshot } from "./domain-specifications2-export.mjs";
import { buildSpecifications2ReleaseFingerprint } from "../src/modules/specifications2/publication.js";

const assert = (value, message) => { if (!value) throw new Error(message); };
const entry = { id: "spec-A", title: "Изделие", updatedAt: "2026-07-17T09:00:00.000Z", publication: { revision: 2 }, treeRows: [{ id: "root", level: 0, label: "АБВГ.001.001 Изделие", quantity: 1, unit: "шт." }, { id: "child", parentId: "root", level: 1, label: "Деталь", quantity: 2, unit: "шт." }], routeDrafts: [{ id: "route-A", designation: "АБВГ.001.001", productLabel: "Изделие", operations: [{ id: "op-A", operationId: "SMT", name: "SMT-монтаж", workCenterId: "SMT", nextWorkCenterId: "AOI", laborNorm: { unitsPerHour: 60 }, productionFiles: { pnp: { name: "a.txt", inlineDataUrl: "data:text/plain;base64,Zm9v" } } }] }] };
const payload = exportSpecifications2Snapshot({ values: { "mes-specifications-2-registry-v1": JSON.stringify({ registry: [entry, { id: "draft" }] }) } });
assert(payload.documents.length === 1 && payload.revisions[0].revision_no === 2 && payload.revisions[0].fingerprint.startsWith("sha256:"), "Published revision must be exported with a compact immutable fingerprint");
assert(payload.revisionItems.length === 2 && payload.routeOperations.length === 1, "Structure and route operations must be exported");
const entryPayload = exportSpecifications2Entry(entry);
assert(JSON.stringify(entryPayload) === JSON.stringify({ ...payload, skippedDrafts: 0 }), "Single-entry export must use the same immutable revision contract without a shared-state envelope");
assert(payload.skippedDrafts === 1, "Unpublished drafts must not become immutable revisions");
assert(!JSON.stringify(payload).includes("data:text/plain"), "Inline attachment content must not enter a revision export");
const legacyEntry = {
  ...entry,
  id: "spec-legacy-v4",
  publication: { revision: 1 },
};
legacyEntry.publication.fingerprint = buildSpecifications2ReleaseFingerprint(legacyEntry, { adapterVersion: 4 });
const legacyPayload = exportSpecifications2Entry(legacyEntry);
assert(legacyPayload.revisions.length === 1, "A v4 browser release must remain exportable after the v5 metadata-only fingerprint rollout");
let invalid = false;
try { exportSpecifications2Snapshot({ values: { "mes-specifications-2-registry-v1": "not-json" } }); } catch { invalid = true; }
assert(invalid, "Invalid registry JSON must be rejected");
let changedAfterPublication = false;
try { exportSpecifications2Snapshot({ values: { "mes-specifications-2-registry-v1": JSON.stringify({ registry: [{ ...entry, publication: { revision: 2, fingerprint: "old-fingerprint" } }] }) } }); } catch (error) { changedAfterPublication = /changed after published revision/.test(String(error.message)); }
assert(changedAfterPublication, "An edited published revision must not be exported as historical truth");
const directory = await mkdtemp(join(tmpdir(), "mes-specifications2-export-qa-"));
try {
  const source = join(directory, "shared-state.json"); const out = join(directory, "export.json");
  await writeFile(source, JSON.stringify({ values: { "mes-specifications-2-registry-v1": JSON.stringify({ registry: [entry] }) } }), "utf-8");
  const result = await new Promise((resolve, reject) => { const child = spawn(process.execPath, ["scripts/domain-specifications2-snapshot-export.mjs", "--source", source, "--out", out], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }); let output = ""; child.stdout.on("data", (chunk) => output += chunk); child.stderr.on("data", (chunk) => output += chunk); child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve(output) : reject(new Error(output))); });
  assert(String(result).includes("revisions: 1"), "CLI must report exported revisions");
  assert(JSON.parse(await readFile(out, "utf-8")).schemaVersion === "009_specifications2_revision_read_model", "CLI must write the revision schema");
} finally { await rm(directory, { recursive: true, force: true }); }
console.log("Specifications 2.0 snapshot export QA: OK");
