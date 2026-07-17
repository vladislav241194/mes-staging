import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkOrdersRepository } from "./domain-repositories.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dir = await mkdtemp(join(tmpdir(), "mes-domain-repositories-qa-"));
const filePath = join(dir, "state.json");
try {
  await writeFile(filePath, JSON.stringify({ version: 3, values: {} }), "utf-8");
  const snapshot = await createWorkOrdersRepository({ env: {}, filePath });
  const health = await snapshot.health();
  assert(health.storageMode === "snapshot-adapter" && health.revision === 3, "Snapshot mode must remain the default repository");

  let unsupported = "";
  try { await createWorkOrdersRepository({ env: { MES_DOMAIN_STORAGE: "unknown" }, filePath }); } catch (error) { unsupported = String(error.message); }
  assert(/Unsupported MES_DOMAIN_STORAGE/.test(unsupported), "Unknown storage mode must fail explicitly");

  let postgresConfig = "";
  try { await createWorkOrdersRepository({ env: { MES_DOMAIN_STORAGE: "postgres" }, filePath }); } catch (error) { postgresConfig = String(error.message); }
  assert(/DATABASE_URL/.test(postgresConfig), "PostgreSQL mode must require an explicit connection string");

  const factorySource = await readFile(new URL("./domain-repositories.mjs", import.meta.url), "utf-8");
  assert(!factorySource.includes('from "./domain-postgres-repository.mjs"'), "PostgreSQL driver must not be loaded in snapshot mode");
  console.log("Domain repository selection QA: OK");
} finally {
  await rm(dir, { recursive: true, force: true });
}
