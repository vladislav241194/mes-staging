import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleDomainApiRequest } from "./domain-api.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = "") {
      this.body = String(body);
    },
  };
}

async function request(filePath, pathname, headers = {}) {
  const res = makeResponse();
  const handled = await handleDomainApiRequest(
    { method: "GET", headers },
    res,
    new URL(`http://mes.local${pathname}`),
    { filePath },
  );
  return {
    handled,
    statusCode: res.statusCode,
    headers: res.headers,
    body: res.body,
    json: JSON.parse(res.body || "{}"),
  };
}

const dir = await mkdtemp(join(tmpdir(), "mes-planning-period-api-qa-"));
const filePath = join(dir, "state.json");

try {
  const planning = {
    // Deliberately reverse the route and step input order. The API must
    // return the period slice in a deterministic schedule order instead.
    routes: [
      { id: "route-out", name: "Вне периода", planningQuantity: 2, workOrderSnapshot: { id: "WO-OUT", quantity: 2 } },
      {
        id: "route-alpha",
        name: "Альфа",
        planningQuantity: 5,
        workOrderSnapshot: { id: "WO-ALPHA", quantity: 5 },
        planningLaborByStepId: { "step-alpha-early": { diagnosticBlob: "period-labor-must-not-transfer".repeat(1000) } },
      },
      { id: "route-beta", name: "Бета", planningQuantity: 3, workOrderSnapshot: { id: "WO-BETA", quantity: 3 } },
    ],
    routeSteps: [
      { id: "step-alpha-late", routeId: "route-alpha", operationId: "OP-A2", operationName: "Поздняя операция", workCenterId: "D5", stepOrder: 2 },
      { id: "step-alpha-early", routeId: "route-alpha", operationId: "OP-A1", operationName: "Ранняя операция", workCenterId: "D5", stepOrder: 1 },
      { id: "step-beta-crossing", routeId: "route-beta", operationId: "OP-B1", operationName: "Переходящая операция", workCenterId: "D6", stepOrder: 1 },
      { id: "step-out-before", routeId: "route-out", operationId: "OP-O1", operationName: "До периода", workCenterId: "D7", stepOrder: 1 },
      { id: "step-out-after", routeId: "route-out", operationId: "OP-O2", operationName: "После периода", workCenterId: "D7", stepOrder: 2 },
    ],
    slots: [
      { id: "slot-alpha-late", routeId: "route-alpha", routeStepId: "step-alpha-late", plannedStart: "2026-07-19T08:00:00.000Z", plannedEnd: "2026-07-19T09:00:00.000Z", status: "planned", quantity: 5 },
      { id: "slot-alpha-early", routeId: "route-alpha", routeStepId: "step-alpha-early", plannedStart: "2026-07-17T08:00:00.000Z", plannedEnd: "2026-07-17T09:00:00.000Z", status: "planned", quantity: 5 },
      { id: "slot-beta-crossing", routeId: "route-beta", routeStepId: "step-beta-crossing", plannedStart: "2026-07-16T23:00:00.000Z", plannedEnd: "2026-07-17T01:00:00.000Z", status: "planned", quantity: 3 },
      // The period is half-open. A slot ending at from or starting at to is
      // outside it, matching the weekly-control overlap calculation.
      { id: "slot-out-before", routeId: "route-out", routeStepId: "step-out-before", plannedStart: "2026-07-16T20:00:00.000Z", plannedEnd: "2026-07-17T00:00:00.000Z", status: "planned", quantity: 2 },
      { id: "slot-out-after", routeId: "route-out", routeStepId: "step-out-after", plannedStart: "2026-07-24T00:00:00.000Z", plannedEnd: "2026-07-24T02:00:00.000Z", status: "planned", quantity: 2 },
    ],
  };
  await writeFile(filePath, JSON.stringify({
    version: 21,
    updatedAt: "2026-07-16T12:00:00.000Z",
    values: { "mes-planning-prototype-state-v2": JSON.stringify(planning) },
  }), "utf-8");

  const period = await request(filePath, "/api/v1/planning/period?from=2026-07-17&to=2026-07-24");
  assert(period.handled && period.statusCode === 200, "bounded planning period endpoint must return 200");
  assert(period.json.period?.from === "2026-07-17" && period.json.period?.to === "2026-07-24", "period response must preserve the requested half-open calendar range");
  assert(
    period.json.projection?.routes?.map((route) => route.id).join(",") === "route-beta,route-alpha",
    "period routes must include only overlapping work orders in stable schedule order",
  );
  assert(
    period.json.projection?.routeSteps?.map((step) => step.id).join(",") === "step-beta-crossing,step-alpha-early,step-alpha-late",
    "period route steps must exclude outside operations and sort matching operations by schedule",
  );
  assert(
    period.json.projection?.slots?.map((slot) => slot.id).join(",") === "slot-beta-crossing,slot-alpha-early,slot-alpha-late",
    "period slots must use exact half-open overlap semantics",
  );
  assert(!period.body.includes("period-labor-must-not-transfer"), "period projection must omit order-detail labour maps");
  assert(/^"[A-Za-z0-9_-]{24}"$/.test(String(period.headers.ETag || "")), "period response must emit a stable payload ETag");

  const unchanged = await request(filePath, "/api/v1/planning/period?from=2026-07-17&to=2026-07-24", { "if-none-match": period.headers.ETag });
  assert(unchanged.statusCode === 304 && unchanged.body === "", "unchanged planning period must support conditional GET");

  const missingBounds = await request(filePath, "/api/v1/planning/period?from=2026-07-17");
  assert(missingBounds.statusCode === 400 && /from and to/.test(missingBounds.json.error || ""), "period endpoint must require both bounds before opening storage");
  const invalidDate = await request(filePath, "/api/v1/planning/period?from=2026-02-30&to=2026-03-01");
  assert(invalidDate.statusCode === 400 && /ISO calendar dates/.test(invalidDate.json.error || ""), "period endpoint must reject invalid calendar dates");
  const reversed = await request(filePath, "/api/v1/planning/period?from=2026-07-24&to=2026-07-17");
  assert(reversed.statusCode === 400 && /after/.test(reversed.json.error || ""), "period endpoint must reject a reversed interval");
  const oversized = await request(filePath, "/api/v1/planning/period?from=2026-07-01&to=2026-08-02");
  assert(oversized.statusCode === 400 && /must not exceed/.test(oversized.json.error || ""), "period endpoint must cap the response period");

  console.log("Planning period API QA: OK");
} finally {
  await rm(dir, { recursive: true, force: true });
}
