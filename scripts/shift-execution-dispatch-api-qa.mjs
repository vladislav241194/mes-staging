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

function createHarness({ failDispatch = false } = {}) {
  const dispatchCalls = [];
  let shiftFactoryCalls = 0;
  let closeCalls = 0;
  let workOrdersFactoryCalls = 0;
  const workOrdersRepositoryFactory = async () => {
    workOrdersFactoryCalls += 1;
    return { health: async () => ({ storageBackend: "snapshot", revision: 1 }) };
  };
  const shiftExecutionReadRepositoryFactory = () => {
    shiftFactoryCalls += 1;
    return {
      async listDispatch(query) {
        dispatchCalls.push(query);
        if (failDispatch) throw new Error("dispatch storage is unavailable");
        return {
          storageMode: "postgres",
          storageBackend: "postgresql",
          configured: true,
          coveredSourceRowIds: query.sourceRowIds,
          dateKey: query.dateKey,
          items: [{ id: "assignment-1", sourceRowId: query.sourceRowIds[0] }],
          carryovers: [],
        };
      },
      async close() { closeCalls += 1; },
    };
  };
  return {
    dispatchCalls,
    get shiftFactoryCalls() { return shiftFactoryCalls; },
    get closeCalls() { return closeCalls; },
    get workOrdersFactoryCalls() { return workOrdersFactoryCalls; },
    async request(pathname, { method = "GET", headers = {} } = {}) {
      const res = makeResponse();
      const handled = await handleDomainApiRequest({ method, headers }, res, new URL(`http://mes.local${pathname}`), {
        env: { DATABASE_URL: "postgres://dispatch-qa" },
        workOrdersRepositoryFactory,
        shiftExecutionReadRepositoryFactory,
      });
      return {
        handled,
        statusCode: res.statusCode,
        headers: res.headers,
        body: res.body,
        json: JSON.parse(res.body || "{}"),
      };
    },
  };
}

const path = "/api/v1/workshop/shift-execution/dispatch";
const harness = createHarness();
const first = await harness.request(`${path}?sourceRowId=slot-a%3A%3A2026-07-18&sourceRowId=slot-b%3A%3A2026-07-18&workCenterId=D1&workCenterId=D2&dateKey=2026-07-18`);
assert(first.handled && first.statusCode === 200, "dispatch must be handled by the additive GET endpoint");
assert(first.json.ok === true && first.json.apiVersion === "v1", "dispatch must retain the standard API envelope");
assert(first.json.dateKey === "2026-07-18" && first.json.coveredSourceRowIds?.length === 2, "dispatch must return the repository projection untouched");
assert(JSON.stringify(harness.dispatchCalls) === JSON.stringify([{
  sourceRowIds: ["slot-a::2026-07-18", "slot-b::2026-07-18"], workCenterIds: ["D1", "D2"], dateKey: "2026-07-18",
}]), "dispatch must call listDispatch once with bounded source-row/work-center scopes and dateKey");
assert(harness.shiftFactoryCalls === 1 && harness.closeCalls === 1, "dispatch must close its read repository after a completed request");
assert(harness.workOrdersFactoryCalls === 0, "dispatch must not initialize the unrelated work-order repository or its global health checks");
assert(/^"[A-Za-z0-9_-]{24}"$/.test(String(first.headers.ETag || "")), "dispatch must return a payload ETag");

const unchanged = await harness.request(`${path}?sourceRowId=slot-a%3A%3A2026-07-18&sourceRowId=slot-b%3A%3A2026-07-18&workCenterId=D1&workCenterId=D2&dateKey=2026-07-18`, {
  headers: { "if-none-match": first.headers.ETag },
});
assert(unchanged.statusCode === 304 && unchanged.body === "", "dispatch must honor the standard conditional GET contract");

const noRows = createHarness();
const noRowsResponse = await noRows.request(`${path}?workCenterId=D1&dateKey=2026-07-18`);
assert(noRowsResponse.statusCode === 400 && /sourceRowId/.test(noRowsResponse.json.error || ""), "dispatch must reject an empty source-row scope");
assert(noRows.shiftFactoryCalls === 0 && noRows.workOrdersFactoryCalls === 0, "invalid dispatch scope must fail before opening any domain storage");

const noWorkCenters = createHarness();
const noWorkCentersResponse = await noWorkCenters.request(`${path}?sourceRowId=row-1&dateKey=2026-07-18`);
assert(noWorkCentersResponse.statusCode === 400 && /workCenterId/.test(noWorkCentersResponse.json.error || ""), "dispatch must reject an unbounded carryover work-center scope");
assert(noWorkCenters.shiftFactoryCalls === 0 && noWorkCenters.workOrdersFactoryCalls === 0, "missing work-center scope must fail before opening storage");

const repeatedDate = createHarness();
const repeatedDateResponse = await repeatedDate.request(`${path}?sourceRowId=row-1&workCenterId=D1&dateKey=2026-07-18&dateKey=2026-07-19`);
assert(repeatedDateResponse.statusCode === 400 && /exactly once/.test(repeatedDateResponse.json.error || ""), "dispatch must require exactly one dateKey");

const invalidDate = createHarness();
const invalidDateResponse = await invalidDate.request(`${path}?sourceRowId=row-1&workCenterId=D1&dateKey=2026-02-29`);
assert(invalidDateResponse.statusCode === 400 && /calendar date/.test(invalidDateResponse.json.error || ""), "dispatch must reject non-calendar date keys");

const tooManyRows = createHarness();
const manyRows = Array.from({ length: 201 }, (_, index) => `sourceRowId=row-${index}`).join("&");
const tooManyRowsResponse = await tooManyRows.request(`${path}?${manyRows}&workCenterId=D1&dateKey=2026-07-18`);
assert(tooManyRowsResponse.statusCode === 400 && /one to 200/.test(tooManyRowsResponse.json.error || ""), "dispatch must bound its source-row scope to 200 values");

const tooManyWorkCenters = createHarness();
const manyWorkCenters = Array.from({ length: 101 }, (_, index) => `workCenterId=WC-${index}`).join("&");
const tooManyWorkCentersResponse = await tooManyWorkCenters.request(`${path}?sourceRowId=row-1&${manyWorkCenters}&dateKey=2026-07-18`);
assert(tooManyWorkCentersResponse.statusCode === 400 && /one to 100/.test(tooManyWorkCentersResponse.json.error || ""), "dispatch must bound its carryover work-center scope to 100 values");

const nonGet = createHarness();
const nonGetResponse = await nonGet.request(`${path}?sourceRowId=row-1&workCenterId=D1&dateKey=2026-07-18`, { method: "POST" });
assert(nonGetResponse.statusCode === 405, "dispatch must never be accepted as a shift-execution command");
assert(nonGet.shiftFactoryCalls === 0 && nonGet.workOrdersFactoryCalls === 0, "non-GET dispatch must be rejected before opening storage");

const unavailable = createHarness({ failDispatch: true });
const unavailableResponse = await unavailable.request(`${path}?sourceRowId=row-1&workCenterId=D1&dateKey=2026-07-18`);
assert(unavailableResponse.statusCode === 503 && /dispatch storage/.test(unavailableResponse.json.error || ""), "dispatch repository failures must return 503");
assert(unavailable.closeCalls === 1, "dispatch must close its read repository after an error");

console.log("Shift execution dispatch API QA: OK");
