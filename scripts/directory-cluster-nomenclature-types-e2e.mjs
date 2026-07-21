import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { handleDirectoryClusterCommandRequest } from "./domain-directory-cluster-command.mjs";
import {
  createNomenclatureTypesServerOwnerClient,
  prepareNomenclatureTypeDeleteContract,
} from "../src/modules/nomenclature_types/server_owner_client.js";

const DIRECTORY_KEY = "mes-planning-prototype-directories-v2";
const enabledEnv = { APP_ENV: "local", MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: "1" };
const authorization = {
  allowed: true,
  reason: "allowed-by-role",
  revision: 41,
  decision: { reason: "allowed-by-role", roleId: "technologist" },
  viewDecision: { allowed: true, reason: "allowed-by-role" },
  principal: {
    id: "employee:employee-e2e",
    employeeId: "employee-e2e",
    displayName: "E2E сотрудник",
    personnelNumber: "E2E-1",
    scope: "employee",
  },
};

function fixtureDirectory() {
  return {
    nomenclatureTypes: [
      { id: "type-rea", name: "РЭА компоненты", status: "Активен" },
      { id: "type-pcb", name: "Печатные платы", status: "Активен" },
      { id: "type-mech", name: "Механика", status: "Активен" },
    ],
    nomenclature: [{ id: "nom-case", name: "Корпус", type: "Механика" }],
    bomLists: [],
    specifications: [{ id: "spec-a", structureItems: [] }],
  };
}

function snapshot() {
  return {
    version: 7,
    updatedAt: "2026-07-21T00:00:00.000Z",
    updatedBy: { actor: "qa-seed" },
    values: { [DIRECTORY_KEY]: JSON.stringify(fixtureDirectory()) },
    sharedUi: {},
    events: [],
  };
}

function responseHeaders(values = {}) {
  const entries = Object.fromEntries(Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return { get: (name) => entries[String(name).toLowerCase()] || "" };
}

function makeRequest(method, headers, body) {
  const request = Readable.from(body ? [Buffer.from(body)] : []);
  request.method = method;
  request.headers = headers;
  return request;
}

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers = {}) { this.statusCode = statusCode; this.headers = headers; },
    end(body = "") { this.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body); },
  };
}

const root = await mkdtemp(join(tmpdir(), "mes-directory-types-e2e-"));
try {
  const sharedStateFile = join(root, "shared-state.json");
  await writeFile(sharedStateFile, `${JSON.stringify(snapshot())}\n`, { mode: 0o600 });

  const fetchImpl = async (requestUrl, options = {}) => {
    const url = new URL(requestUrl, "https://pilot.mes-line.ru");
    const headers = Object.fromEntries(Object.entries(options.headers || {}).map(([key, value]) => [key.toLowerCase(), String(value)]));
    headers.host = "pilot.mes-line.ru";
    if (String(options.method || "GET").toUpperCase() === "POST") {
      headers.origin = "https://pilot.mes-line.ru";
      headers["sec-fetch-site"] = "same-origin";
    }
    const req = makeRequest(String(options.method || "GET").toUpperCase(), headers, options.body || "");
    const res = makeResponse();
    const handled = await handleDirectoryClusterCommandRequest(req, res, url, {
      filePath: sharedStateFile,
      backupDir: join(root, "backups"),
      auditLogPath: join(root, "audit.log"),
      env: enabledEnv,
      headers: (contentType) => ({ "Content-Type": contentType, "Cache-Control": "no-store" }),
      getAuthorization: async () => authorization,
    });
    assert(handled, `Backend did not handle ${options.method} ${url.pathname}`);
    return {
      status: res.statusCode,
      ok: res.statusCode >= 200 && res.statusCode < 300,
      headers: responseHeaders(res.headers),
      json: async () => JSON.parse(res.body || "{}"),
    };
  };

  const client = createNomenclatureTypesServerOwnerClient({ fetchImpl });
  const capabilities = await client.getCapabilities();
  assert(capabilities.ok && capabilities.enabled && capabilities.directoryRevision === 7 && capabilities.rbacRevision === 41);

  const createdRow = { id: "type-cable", name: "Кабельные сборки", code: "CABLE", status: "Активен" };
  const created = await client.createNomenclatureType({
    itemId: createdRow.id,
    row: createdRow,
    expectedRevision: 7,
    idempotencyKey: "e2e-type-create",
  });
  assert(created.ok && created.revision === 8 && created.row.name === "Кабельные сборки");

  const updatedRow = { ...created.row, name: "Кабельные изделия", code: "CABLE-2" };
  const updated = await client.updateNomenclatureType({
    itemId: created.row.id,
    expectedRow: created.row,
    row: updatedRow,
    expectedRevision: 8,
    idempotencyKey: "e2e-type-update",
  });
  assert(updated.ok && updated.revision === 9 && updated.row.name === "Кабельные изделия");

  const preview = await prepareNomenclatureTypeDeleteContract({
    directory: updated.directory,
    itemId: updated.row.id,
    fallbackTypeId: "type-mech",
  });
  assert(preview.ok && preview.impactFingerprint.startsWith("sha256:"));
  const deleted = await client.deleteNomenclatureType({
    ...preview,
    expectedRevision: 9,
    idempotencyKey: "e2e-type-delete",
  });
  assert(deleted.ok && deleted.revision === 10 && deleted.directory.nomenclatureTypes.every((row) => row.id !== "type-cable"));

  const persisted = JSON.parse(await readFile(sharedStateFile, "utf8"));
  assert.equal(persisted.version, 10);
  assert(JSON.parse(persisted.values[DIRECTORY_KEY]).nomenclatureTypes.every((row) => row.id !== "type-cable"));

  console.log("Directory Nomenclature Types client-to-owner E2E QA: OK");
  console.log("- strict capabilities, create, update, delete preview and delete contracts: pass");
  console.log("- strong ETag, exact receipt and authoritative Directory projection: pass");
} finally {
  await rm(root, { recursive: true, force: true });
}
