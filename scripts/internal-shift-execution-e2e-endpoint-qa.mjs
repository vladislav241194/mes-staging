#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  handleInternalShiftExecutionE2eRequest,
  INTERNAL_SHIFT_EXECUTION_E2E_ACTION,
  INTERNAL_SHIFT_EXECUTION_E2E_PATH,
} from "./internal-shift-execution-e2e-endpoint.mjs";
import { verifyShiftExecutionHttpE2e } from "../ops/postgres/verify-shift-execution-http-e2e.mjs";

const nowMs = Date.parse("2026-07-18T21:00:00.000Z");
const nonce = "a".repeat(64);
const stateDir = await mkdtemp(join(tmpdir(), "mes-shift-http-e2e-"));
const sharedStateFile = join(stateDir, "mes-pilot-shared-state-v1.json");
const triggerPath = join(stateDir, ".shift-execution-http-e2e.json");

function headers(contentType) {
  return { "Content-Type": contentType, "Cache-Control": "no-store" };
}

function request({ host = "mes-internal", remoteAddress = "127.0.0.1", method = "POST", body = { nonce } } = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  req.headers = { host };
  req.method = method;
  req.socket = { remoteAddress };
  return req;
}

function response() {
  return {
    statusCode: 0,
    responseHeaders: {},
    body: "",
    writeHead(statusCode, responseHeaders) {
      this.statusCode = statusCode;
      this.responseHeaders = responseHeaders;
    },
    end(body = "") { this.body = String(body); },
  };
}

function url() {
  return new URL(`http://mes-internal${INTERNAL_SHIFT_EXECUTION_E2E_PATH}`);
}

async function writeTrigger(triggerNonce = nonce) {
  await writeFile(triggerPath, `${JSON.stringify({
    version: 1,
    action: INTERNAL_SHIFT_EXECUTION_E2E_ACTION,
    nonce: triggerNonce,
    createdAt: new Date(nowMs - 1_000).toISOString(),
    expiresAt: new Date(nowMs + 60_000).toISOString(),
  })}\n`, { mode: 0o640 });
}

try {
  await writeFile(sharedStateFile, "{}\n", "utf8");
  await writeTrigger();

  const publicResponse = response();
  assert.equal(await handleInternalShiftExecutionE2eRequest(
    request({ host: "pilot.mes-line.ru" }), publicResponse, url(),
    { sharedStateFile, headers, now: () => nowMs, runVerification: async () => ({ ok: true }) },
  ), true);
  assert.equal(publicResponse.statusCode, 404, "Public hosts must not discover the internal QA endpoint");
  assert.match(await readFile(triggerPath, "utf8"), /verify-shift-execution-http-e2e/, "Rejected public requests must not consume the trigger");

  const remoteResponse = response();
  await handleInternalShiftExecutionE2eRequest(
    request({ remoteAddress: "10.0.0.2" }), remoteResponse, url(),
    { sharedStateFile, headers, now: () => nowMs, runVerification: async () => ({ ok: true }) },
  );
  assert.equal(remoteResponse.statusCode, 404, "Non-loopback callers must not discover the endpoint");

  const validResponse = response();
  let executions = 0;
  await handleInternalShiftExecutionE2eRequest(
    request(), validResponse, url(),
    {
      sharedStateFile,
      headers,
      now: () => nowMs,
      runVerification: async () => {
        executions += 1;
        return { ok: true, httpBoundary: true, steps: { assignmentCreated: 201, aggregateReadBack: 200 } };
      },
    },
  );
  assert.equal(validResponse.statusCode, 200, validResponse.body);
  assert.equal(executions, 1, "A valid trigger must execute exactly once");
  assert.deepEqual(JSON.parse(validResponse.body), {
    ok: true,
    httpBoundary: true,
    steps: { assignmentCreated: 201, aggregateReadBack: 200 },
    cleanup: "completed",
  });
  await assert.rejects(readFile(triggerPath, "utf8"), { code: "ENOENT" });

  const replayResponse = response();
  await handleInternalShiftExecutionE2eRequest(
    request(), replayResponse, url(),
    { sharedStateFile, headers, now: () => nowMs, runVerification: async () => { throw new Error("must not run"); } },
  );
  assert.equal(replayResponse.statusCode, 403, "A consumed trigger must not be replayable");

  await writeTrigger("b".repeat(64));
  const mismatchResponse = response();
  await handleInternalShiftExecutionE2eRequest(
    request(), mismatchResponse, url(),
    { sharedStateFile, headers, now: () => nowMs, runVerification: async () => { throw new Error("must not run"); } },
  );
  assert.equal(mismatchResponse.statusCode, 403, "A nonce mismatch must fail closed");
  await assert.rejects(readFile(triggerPath, "utf8"), { code: "ENOENT" });

  await assert.rejects(
    verifyShiftExecutionHttpE2e({ env: {}, allowEnvFileFallback: false }),
    /DATABASE_URL is missing/,
    "The embedded runner must never fall back to protected environment files",
  );

  console.log(JSON.stringify({ ok: true, loopbackOnly: true, oneShot: true, envFallbackDisabled: true }));
} finally {
  await rm(stateDir, { recursive: true, force: true });
}
