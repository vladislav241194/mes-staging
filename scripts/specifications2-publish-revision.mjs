import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { readSharedStateSnapshot } from "./shared-state-endpoint.mjs";
import { getSharedStateServerPaths } from "./shared-state-storage.mjs";
import { inspectSpecifications2Publication, publishSpecifications2Entry } from "../src/modules/specifications2/publication.js";

const projectRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const specificationsKey = "mes-specifications-2-registry-v1";
const directoryKey = "mes-planning-prototype-directories-v2";
const planningKey = "mes-planning-prototype-state-v2";

function args(argv) {
  const result = { apply: false, entryId: "", filePath: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--apply") result.apply = true;
    else if (value === "--entry") { result.entryId = String(argv[index + 1] || "").trim(); index += 1; }
    else if (value === "--file") { result.filePath = String(argv[index + 1] || "").trim(); index += 1; }
    else throw new Error(`Unsupported argument: ${value}`);
  }
  if (!result.entryId) throw new Error("Usage: npm run specifications2:publish-revision -- --entry <entry-id> [--file <shared-state.json>] [--apply]");
  return result;
}

function parseValue(snapshot, key, label) {
  try {
    const value = JSON.parse(snapshot.values?.[key] || "");
    if (!value || typeof value !== "object") throw new Error("not an object");
    return value;
  } catch { throw new Error(`Specifications 2.0 publication: ${label} is invalid in shared state`); }
}

export function prepareSpecifications2Publication(snapshot, entryId) {
  const registry = parseValue(snapshot, specificationsKey, "registry");
  const directoryState = parseValue(snapshot, directoryKey, "directory state");
  const planningState = parseValue(snapshot, planningKey, "planning state");
  const entries = Array.isArray(registry.registry) ? registry.registry : [];
  const index = entries.findIndex((entry) => String(entry?.id || "") === entryId);
  if (index < 0) throw new Error(`Specifications 2.0 publication: entry ${entryId} was not found`);
  const entry = entries[index];
  const inspection = inspectSpecifications2Publication(entry);
  if (!inspection.ready) throw new Error(`Specifications 2.0 publication: ${inspection.issues[0] || "entry is not ready"}`);
  const result = publishSpecifications2Entry(entry, { directoryState, planningState });
  const nextRegistry = {
    ...registry,
    registry: entries.map((candidate, candidateIndex) => candidateIndex === index ? {
      ...candidate,
      publication: result.publication,
      updatedAt: result.publication.releasedAt,
    } : candidate),
  };
  return { result, nextRegistry };
}

async function main() {
  const options = args(process.argv.slice(2));
  const paths = getSharedStateServerPaths({ projectRoot, fallbackFile: options.filePath || join(projectRoot, ".mes-shared-state.json") });
  if (options.filePath) paths.filePath = options.filePath;
  const current = await readSharedStateSnapshot({ filePath: paths.filePath });
  if (!current.configured) throw new Error("Specifications 2.0 publication: shared state is not configured");
  const prepared = prepareSpecifications2Publication(current.snapshot, options.entryId);
  const publication = prepared.result.publication;
  console.log(`Specifications 2.0 publication plan: ${options.entryId}`);
  console.log(`- current snapshot version: ${current.snapshot.version}`);
  console.log(`- next revision: ${publication.revision}`);
  console.log(`- specification: ${publication.specificationId}`);
  console.log(`- route documents: ${publication.routeIds.length}`);
  if (!options.apply) { console.log("DRY RUN: no shared-state changes made. Production publication uses the authenticated PostgreSQL command and durable outbox."); return; }
  throw new Error("Specifications 2.0 publication --apply is retired. Publish through the authenticated PostgreSQL command and durable outbox; the immutable legacy release remains the rollback path.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
