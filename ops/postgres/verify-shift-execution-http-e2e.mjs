#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import http from "node:http";
import postgres from "postgres";

const domainEnvPath = process.env.MES_DOMAIN_ENV_FILE || "/etc/mes/mes-pilot-domain.env";
const publicAuthEnvPath = process.env.MES_PUBLIC_AUTH_ENV_FILE || "/etc/mes/mes-pilot-public-auth.env";
const apiHost = process.env.MES_SHIFT_EXECUTION_E2E_HOST || "pilot.mes-line.ru";
const apiPort = Number(process.env.MES_SHIFT_EXECUTION_E2E_PORT || 4175);

function parseEnvironment(source = "") {
  return Object.fromEntries(String(source).split(/\r?\n/).map((line) => line.trim()).filter((line) => (
    line && !line.startsWith("#") && line.includes("=")
  )).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

function request({ method, path, token, payload = null, idempotencyKey = "" }) {
  const body = payload === null ? "" : JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: apiPort,
      path,
      method,
      headers: {
        host: apiHost,
        cookie: `mes_user_session=${token}`,
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
    }, (response) => {
      let raw = "";
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        try { resolve({ status: response.statusCode || 0, json: JSON.parse(raw || "{}") }); }
        catch { reject(new Error(`API returned non-JSON response (${response.statusCode || 0})`)); }
      });
    });
    req.once("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

const [domainEnv, publicAuthEnv] = await Promise.all([
  readFile(domainEnvPath, "utf8"),
  readFile(publicAuthEnvPath, "utf8"),
]);
const env = { ...parseEnvironment(domainEnv), ...parseEnvironment(publicAuthEnv) };
assert(env.DATABASE_URL, "DATABASE_URL is missing from the domain environment");
assert(env.MES_PUBLIC_AUTH_USERNAME && env.MES_PUBLIC_AUTH_SESSION_SECRET, "Public session configuration is incomplete");

const issuedAt = Math.floor(Date.now() / 1000);
const tokenPayload = Buffer.from(JSON.stringify({
  user: env.MES_PUBLIC_AUTH_USERNAME,
  scope: "public",
  iat: issuedAt,
  exp: issuedAt + 300,
})).toString("base64url");
const sessionToken = `${tokenPayload}.${createHmac("sha256", env.MES_PUBLIC_AUTH_SESSION_SECRET).update(tokenPayload).digest("base64url")}`;
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const sourceRowId = `qa-server-shift-${stamp}`;
const db = postgres(env.DATABASE_URL, { max: 1, prepare: false });
let assignmentId = "";

try {
  const [operation] = await db`SELECT id, work_order_id FROM work_order_operations ORDER BY id LIMIT 1`;
  assert(operation, "No work-order operation is available for isolated E2E verification");
  const createKey = `qa-create-${stamp}`;
  const created = await request({
    method: "POST",
    path: "/api/v1/workshop/shift-execution/assignments",
    token: sessionToken,
    idempotencyKey: createKey,
    payload: {
      idempotencyKey: createKey,
      workOrderId: operation.work_order_id,
      operationId: operation.id,
      sourceRowId,
      sourceSlotId: `qa-slot-${stamp}`,
      workCenterId: "qa-work-center",
      plannedQuantity: 3,
      assignedQuantity: 3,
      unit: "шт.",
      masterId: "qa-master",
      status: "issued",
      issuedAt: new Date().toISOString(),
      executors: [],
    },
  });
  assert(created.status === 201 && created.json?.ok && created.json?.item?.id, `Assignment create failed (${created.status}): ${created.json?.error || "unexpected response"}`);
  assignmentId = created.json.item.id;

  const factKey = `qa-fact-${stamp}`;
  const fact = await request({
    method: "POST",
    path: `/api/v1/workshop/shift-execution/assignments/${encodeURIComponent(assignmentId)}/facts`,
    token: sessionToken,
    idempotencyKey: factKey,
    payload: { idempotencyKey: factKey, actualQuantity: 2, defectQuantity: 0, laborMinutes: 5, executorCount: 1, reportedAt: new Date().toISOString() },
  });
  assert(fact.status === 201 && fact.json?.ok, `Fact command failed (${fact.status}): ${fact.json?.error || "unexpected response"}`);

  const carryoverKey = `qa-carryover-${stamp}`;
  const carryover = await request({
    method: "POST",
    path: "/api/v1/workshop/shift-execution/carryovers",
    token: sessionToken,
    idempotencyKey: carryoverKey,
    payload: {
      idempotencyKey: carryoverKey,
      sourceAssignmentId: assignmentId,
      sourceSlotId: `qa-slot-${stamp}`,
      workOrderId: operation.work_order_id,
      operationId: operation.id,
      workCenterId: "qa-work-center",
      dateKey: "2026-07-18",
      remainingQuantity: 1,
      reason: "isolated E2E",
    },
  });
  assert(carryover.status === 201 && carryover.json?.ok, `Carryover command failed (${carryover.status}): ${carryover.json?.error || "unexpected response"}`);

  const aggregate = await request({ method: "GET", path: "/api/v1/workshop/shift-execution?limit=10", token: sessionToken });
  const item = (aggregate.json?.items || []).find((entry) => entry.sourceRowId === sourceRowId);
  assert(aggregate.status === 200 && item && item.status === "issued" && item.facts?.length === 1 && item.carryovers?.length === 1, "Aggregate read did not contain the created assignment, fact and carryover");
  console.log(JSON.stringify({ ok: true, httpBoundary: true, create: created.status, fact: fact.status, carryover: carryover.status, aggregate: aggregate.status }));
} finally {
  if (assignmentId) {
    await db`DELETE FROM shift_execution_fact_requests WHERE shift_fact_id IN (SELECT id FROM shift_facts WHERE shift_assignment_id = ${assignmentId})`;
    await db`DELETE FROM shift_facts WHERE shift_assignment_id = ${assignmentId}`;
    await db`DELETE FROM shift_execution_carryover_requests WHERE shift_carryover_id IN (SELECT id FROM shift_carryovers WHERE source_assignment_id = ${assignmentId})`;
    await db`DELETE FROM shift_carryovers WHERE source_assignment_id = ${assignmentId}`;
    await db`DELETE FROM shift_execution_mutation_requests WHERE shift_assignment_id = ${assignmentId}`;
    await db`DELETE FROM shift_execution_command_requests WHERE shift_assignment_id = ${assignmentId}`;
    await db`DELETE FROM shift_assignment_executors WHERE shift_assignment_id = ${assignmentId}`;
    await db`DELETE FROM shift_assignments WHERE id = ${assignmentId}`;
  }
  await db.end({ timeout: 5 });
}
