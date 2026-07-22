import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { getSpecifications2WorkOrderCommandHttpStatus, handleDomainApiRequest, readRequestBody } from "./domain-api.mjs";
import { createWorkOrdersRepository } from "./domain-work-orders-repository.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(getSpecifications2WorkOrderCommandHttpStatus({ created: false, item: null, conflict: true, idempotencyConflict: true }) === 409,
  "a reused Work Order idempotency key with a different canonical request must map to HTTP 409");
assert(getSpecifications2WorkOrderCommandHttpStatus({ created: false, item: null, error: "invalid route" }) === 422,
  "a non-conflicting invalid Work Order command must remain HTTP 422");
assert(getSpecifications2WorkOrderCommandHttpStatus({ created: false, item: { id: "wo-replay" } }) === 200,
  "an exact Work Order replay must remain HTTP 200");

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

function getHeader(headers = {}, name = "") {
  const expectedName = String(name).toLowerCase();
  const matchingName = Object.keys(headers).find((headerName) => headerName.toLowerCase() === expectedName);
  return matchingName ? headers[matchingName] : undefined;
}

function assertBootstrapServerTiming(headers = {}, message) {
  const value = String(getHeader(headers, "Server-Timing") || "");
  const entries = value.split(/\s*,\s*/).filter(Boolean);
  assert(entries.length === 4, `${message} must expose four Server-Timing metrics`);
  assert(
    entries.every((entry) => /^(?:planning-safety|planning-parity|planning-bootstrap|total);dur=\d+(?:\.\d+)?$/.test(entry)),
    `${message} must expose only safe Server-Timing duration metrics`,
  );
  assert(
    entries.map((entry) => entry.split(";", 1)[0]).join(",") === "planning-safety,planning-parity,planning-bootstrap,total",
    `${message} must expose the planning timing metrics in a stable order`,
  );
}

const boundedBody = Readable.from([Buffer.from(JSON.stringify({ entry: { id: "small" } }))]);
boundedBody.headers = {};
const boundedPayload = await readRequestBody(boundedBody, { maxBytes: 128 });
assert(boundedPayload.entry?.id === "small", "bounded JSON reader must accept a publication request within its byte limit");
const oversizedBody = Readable.from([Buffer.alloc(129, 0x78)]);
oversizedBody.headers = {};
let oversizedError = null;
try { await readRequestBody(oversizedBody, { maxBytes: 128 }); }
catch (error) { oversizedError = error; }
assert(oversizedError?.code === "REQUEST_BODY_TOO_LARGE", "bounded JSON reader must reject a streaming body before buffering beyond its byte limit");
let preParsedOversizedError = null;
try { await readRequestBody({ body: { value: "x".repeat(129) }, headers: {} }, { maxBytes: 128 }); }
catch (error) { preParsedOversizedError = error; }
assert(preParsedOversizedError?.code === "REQUEST_BODY_TOO_LARGE", "bounded JSON reader must also reject an oversized body pre-parsed by an HTTP adapter");

async function request(filePath, pathname, method = "GET", body = null, headers = {}, env = undefined) {
  const res = makeResponse();
  const specifications2CommandHeaders = method === "POST" && /^\/api\/v1\/specifications2\/(?:revisions(?:\/[^/]+\/work-orders)?|attachments)$/u.test(pathname)
    ? { host: "mes.local", origin: "http://mes.local", "sec-fetch-site": "same-origin", "content-type": "application/json" }
    : {};
  const shiftExecutionCommandHeaders = ["POST", "PATCH"].includes(method)
    && /^\/api\/v1\/workshop\/shift-execution\/(?:assignments(?:\/[^/]+(?:\/facts)?)?|carryovers(?:\/[^/]+)?)$/u.test(pathname)
    ? { host: "mes.local", origin: "http://mes.local", "sec-fetch-site": "same-origin", "content-type": "application/json" }
    : {};
  const planningCommandHeaders = method === "PATCH"
    && /^\/api\/v1\/planning\/work-orders\/[^/]+(?:\/operations\/[^/]+\/slot)?$/u.test(pathname)
    ? { host: "mes.local", origin: "http://mes.local", "sec-fetch-site": "same-origin", "content-type": "application/json" }
    : {};
  const handled = await handleDomainApiRequest(
    { method, body, headers: { ...specifications2CommandHeaders, ...shiftExecutionCommandHeaders, ...planningCommandHeaders, ...headers } },
    res,
    new URL(`http://mes.local${pathname}`),
    {
      filePath,
      env,
      // This broad domain contract exercises snapshot/revision behavior. The
      // focused Planning authorization QA uses real signed-session and RBAC
      // resolvers; keep this fixture explicit instead of a live query bypass.
      planningAuthorizationResolver: async () => ({
        allowed: true,
        reason: "allowed",
        principal: { id: "employee:domain-api-qa", employeeId: "domain-api-qa", scope: "employee" },
        revision: 1,
      }),
    },
  );
  return { handled, statusCode: res.statusCode, headers: res.headers, body: res.body, json: JSON.parse(res.body || "{}") };
}

const dir = await mkdtemp(join(tmpdir(), "mes-domain-api-qa-"));
const filePath = join(dir, "state.json");
try {
  const planning = {
    routes: [{
      id: "route-1",
      name: "Маршрут изделия",
      designation: "АБВГ.001",
      planningQuantity: 12,
      planningStatus: "scheduled",
      lifecycleStatus: "released",
      revision: 4,
      unit: "шт.",
      workOrderSnapshot: { id: "WO-001", quantity: 12 },
      sourceSpecifications2EntryId: "specification-1",
      documentRevisionSnapshot: { specificationRevision: 4, routeRevision: 4, releaseFingerprint: "fixture", product: { name: "Изделие" }, largeDocumentPayload: "x".repeat(20_000) },
      planningLaborByStepId: { "step-1": { largeLaborPayload: "x".repeat(20_000) } },
    }],
    routeSteps: [{ id: "step-1", routeId: "route-1", operationId: "OP-1", operationName: "Монтаж", workCenterId: "D5", nextWorkCenterId: "D6", routeStepKind: "operation" }],
    slots: [{ id: "slot-1", routeId: "route-1", routeStepId: "step-1", plannedStart: "2026-07-17T08:00:00.000Z", plannedEnd: "2026-07-17T09:00:00.000Z", status: "planned", quantity: 12, locked: false, source: "manual" }],
  };
  await writeFile(filePath, JSON.stringify({
    version: 7,
    updatedAt: "2026-07-17T08:00:00.000Z",
    values: { "mes-planning-prototype-state-v2": JSON.stringify(planning) },
  }), "utf-8");

  const health = await request(filePath, "/api/v1/health");
  assert(health.handled && health.statusCode === 200 && health.json.revision === 7, "health endpoint must expose storage revision");
  assert(!Object.hasOwn(health.json, "planningProjectionFingerprint"), "health endpoint must not expose the internal planning parity fingerprint");
  const readiness = await request(filePath, "/api/v1/domain-readiness");
  assert(readiness.statusCode === 200 && readiness.json.status === "attention", "domain readiness must report a partial snapshot migration without hiding unavailable domains");
  assert(readiness.json.readiness?.workOrders?.ready === false && /DATABASE_URL/.test(readiness.json.readiness?.systemDomains?.error || ""), "domain readiness must expose the exact unavailable server domains");
  assert(readiness.json.readiness?.commands?.specifications2WorkOrderCreation?.enabled === false
    && readiness.json.readiness?.commands?.specifications2WorkOrderCreation?.schemaReady === false
    && readiness.json.readiness?.commands?.specifications2RevisionPublication?.enabled === false
    && readiness.json.readiness?.commands?.specifications2RevisionPublication?.schemaReady === false
    && readiness.json.readiness?.commands?.systemDomains?.enabled === false
    && readiness.json.readiness?.commands?.shiftExecutionAssignments?.enabled === false,
  "domain readiness must expose disabled command surfaces and their schema gate explicitly");
  assert(
    String(readiness.json.readiness?.commands?.specifications2WorkOrderCreation?.reason || "").length > 0
      && String(readiness.json.readiness?.commands?.specifications2AttachmentUpload?.reason || "").length > 0,
    "domain readiness must explain whether a command is blocked by storage or by a rollout flag",
  );
  const capabilities = await request(filePath, "/api/v1/specifications2/capabilities");
  assert(capabilities.statusCode === 200 && capabilities.json.capabilities?.workOrderCreationEnabled === false && capabilities.json.capabilities?.workOrderCreationSchemaReady === false && capabilities.json.capabilities?.revisionPublicationEnabled === false && capabilities.json.capabilities?.attachmentUploadEnabled === false && capabilities.json.capabilities?.workOrderPrimaryPostgres === false, "command capability endpoint must explicitly report that snapshot primary cannot create server orders, revisions or attachments");
  const primaryConfiguredCapabilities = await request(filePath, "/api/v1/specifications2/capabilities", "GET", null, {}, { MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS: "1" });
  assert(primaryConfiguredCapabilities.statusCode === 200
    && primaryConfiguredCapabilities.json.capabilities?.revisionPublicationPrimaryConfigured === true
    && primaryConfiguredCapabilities.json.capabilities?.revisionPublicationEnabled === false
    && primaryConfiguredCapabilities.json.capabilities?.revisionPublicationSchemaReady === false,
  "publication capability must distinguish configured server primary from unavailable PostgreSQL readiness");
  const disabledAttachmentCommand = await request(filePath, "/api/v1/specifications2/attachments", "POST", { fileName: "board.txt", contentBase64: "Zm9v" }, {}, {});
  assert(disabledAttachmentCommand.statusCode === 409 && /not enabled/.test(disabledAttachmentCommand.json.error || ""), "attachment command must remain disabled until the file-storage rollout is explicitly activated");
  const disabledAttachmentDownload = await request(filePath, "/api/v1/specifications2/attachments/spec2file-123", "GET", null, {}, {});
  assert(disabledAttachmentDownload.statusCode === 409 && /not enabled/.test(disabledAttachmentDownload.json.error || ""), "attachment download must remain disabled until the file-storage rollout is explicitly activated");
  const systemDomainsCapabilities = await request(filePath, "/api/v1/system-domains/capabilities");
  assert(systemDomainsCapabilities.statusCode === 200 && systemDomainsCapabilities.json.capabilities?.serverCommandsEnabled === false && systemDomainsCapabilities.json.capabilities?.primaryPostgres === false, "System Domains capabilities must explicitly keep command writes disabled on a snapshot primary");
  const disabledSystemDomainsCommand = await request(filePath, "/api/v1/system-domains", "PUT", { expectedRevision: 1, domains: {} }, {}, {});
  assert(disabledSystemDomainsCommand.statusCode === 409 && /not enabled/.test(disabledSystemDomainsCommand.json.error || ""), "System Domains command must remain disabled until the server/snapshot outbox is explicitly activated");

  const list = await request(filePath, "/api/v1/planning/work-orders");
  assert(list.statusCode === 200 && list.json.items?.length === 1, "work-order list must return one projected order");
  assert(!getHeader(list.headers, "Server-Timing"), "work-order list must not expose bootstrap timing");
  assert(list.json.items[0].operationCount === 1 && list.json.items[0].scheduledOperationCount === 1, "work-order list must contain operation and slot counts");
  assert(list.json.items[0].concurrencyRevision === 4, "snapshot adapter must expose a per-order concurrency revision instead of its global snapshot revision");
  assert(list.json.items[0].metadata?.sourceSpecifications2EntryId === "specification-1", "work-order list must expose the route identity metadata required by the server-side planning renderer");
  assert(!Object.hasOwn(list.json.items[0].metadata || {}, "documentRevisionSnapshot") && !Object.hasOwn(list.json.items[0].metadata || {}, "planningLaborByStepId"), "work-order list must not transfer full document and labour metadata before an order is selected");
  const unchangedList = await request(filePath, "/api/v1/planning/work-orders", "GET", null, { "if-none-match": list.headers.ETag });
  assert(unchangedList.statusCode === 304 && unchangedList.body === "", "unchanged list must support conditional GET");
  assert(!getHeader(unchangedList.headers, "Server-Timing"), "unchanged work-order list must not expose bootstrap timing");

  const workbenchBootstrap = await request(filePath, "/api/v1/planning/work-orders/bootstrap?active=WO-001");
  assert(workbenchBootstrap.statusCode === 200 && workbenchBootstrap.json.activeId === "route-1" && workbenchBootstrap.json.items?.length === 1, "workbench bootstrap must return one compact list and the canonical selected order");
  assert(workbenchBootstrap.json.item?.id === "route-1" && workbenchBootstrap.json.item?.operations?.[0]?.slot?.id === "slot-1", "workbench bootstrap must return the selected operation schedule in the same response");
  assert(!Object.hasOwn(workbenchBootstrap.json.item?.operations?.[0]?.slot || {}, "metadata"), "workbench bootstrap must keep the compact workbench slot contract");
  assertBootstrapServerTiming(workbenchBootstrap.headers, "workbench bootstrap");
  const unchangedWorkbenchBootstrap = await request(filePath, "/api/v1/planning/work-orders/bootstrap?active=WO-001", "GET", null, { "if-none-match": workbenchBootstrap.headers.ETag });
  assert(unchangedWorkbenchBootstrap.statusCode === 304 && unchangedWorkbenchBootstrap.body === "" && unchangedWorkbenchBootstrap.headers.ETag === workbenchBootstrap.headers.ETag, "unchanged workbench bootstrap must support one combined conditional GET without changing its ETag");
  assertBootstrapServerTiming(unchangedWorkbenchBootstrap.headers, "unchanged workbench bootstrap");
  const staleWorkbenchSelection = await request(filePath, "/api/v1/planning/work-orders/bootstrap?active=removed-route");
  assert(staleWorkbenchSelection.statusCode === 200 && staleWorkbenchSelection.json.activeId === "route-1" && staleWorkbenchSelection.json.item?.id === "route-1", "stale workbench selection must safely fall back to the first available order");
  assertBootstrapServerTiming(staleWorkbenchSelection.headers, "stale workbench bootstrap");

  const summary = await request(filePath, "/api/v1/planning/work-orders/summary");
  assert(summary.statusCode === 200 && summary.json.summary?.workOrderCount === 1, "work-order summary must return a compact aggregate");
  assert(summary.json.summary?.totalQuantity === 12 && summary.json.summary?.unscheduledOperationCount === 0, "work-order summary must preserve quantity and scheduling totals");
  const unchangedSummary = await request(filePath, "/api/v1/planning/work-orders/summary", "GET", null, { "if-none-match": summary.headers.ETag });
  assert(unchangedSummary.statusCode === 304 && unchangedSummary.body === "", "unchanged summary must support conditional GET");

  const runtimeProjection = await request(filePath, "/api/v1/planning/work-orders/projection");
  assert(runtimeProjection.statusCode === 200 && runtimeProjection.json.projection?.routes?.[0]?.id === "route-1", "planning runtime projection must reconstruct routes from the domain aggregate");
  assert(runtimeProjection.json.projection?.routeSteps?.[0]?.operationName === "Монтаж" && runtimeProjection.json.projection?.slots?.[0]?.routeStepId === "step-1", "planning runtime projection must reconstruct operation and slot links without the shared-state snapshot");
  const unchangedRuntimeProjection = await request(filePath, "/api/v1/planning/work-orders/projection", "GET", null, { "if-none-match": runtimeProjection.headers.ETag });
  assert(unchangedRuntimeProjection.statusCode === 304 && unchangedRuntimeProjection.body === "", "planning runtime projection must support conditional GET");

  const detail = await request(filePath, "/api/v1/planning/work-orders/WO-001");
  assert(detail.statusCode === 200 && detail.json.item?.operations?.[0]?.slot?.id === "slot-1", "work-order detail must join operations with their planning slots");
  assert(detail.json.item?.operations?.[0]?.slot?.quantity === 12 && detail.json.item?.operations?.[0]?.slot?.isLocked === false, "work-order detail must retain slot execution quantity and lock state");
  assert(detail.json.item?.operations?.[0]?.metadata?.routeStepKind === "operation" && detail.json.item?.operations?.[0]?.slot?.metadata?.source === "manual", "work-order detail must expose operation and slot metadata for a server-side planning renderer");
  assert(detail.json.item?.metadata?.documentRevisionSnapshot?.specificationRevision === 4 && !Object.hasOwn(detail.json.item?.metadata?.documentRevisionSnapshot || {}, "largeDocumentPayload"), "selected work-order detail must retain UI-relevant revision metadata without transferring the source document body");
  assert(detail.headers.ETag === '"4"', "work-order detail must expose its concurrency revision as ETag");
  const workbenchDetail = await request(filePath, "/api/v1/planning/work-orders/WO-001?view=workbench");
  assert(workbenchDetail.statusCode === 200 && workbenchDetail.json.item?.operations?.[0]?.slot?.id === "slot-1", "workbench detail must retain the slot identity and schedule fields");
  assert(!Object.hasOwn(workbenchDetail.json.item?.operations?.[0]?.slot || {}, "metadata"), "workbench detail must omit the full slot metadata already available from the Gantt projection");
  assert(workbenchDetail.json.item?.operations?.[0]?.metadata?.routeStepKind === "operation", "workbench detail must retain operation metadata needed to render the order tree");

  const parity = await request(filePath, "/api/v1/planning/work-orders/parity");
  assert(parity.statusCode === 200 && parity.json.parity?.matches === true, "snapshot storage must pass its own projection parity check");

  // The workshop projection deliberately has no snapshot fallback.  Returning
  // an explicit unavailable response prevents a partially migrated UI from
  // silently displaying stale local state as if it came from PostgreSQL.
  const unavailableShiftRead = await request(filePath, "/api/v1/workshop/shift-execution/summary", "GET", null, {}, {});
  assert(unavailableShiftRead.statusCode === 503 && /DATABASE_URL/.test(unavailableShiftRead.json.error || ""), "shift read endpoint must fail explicitly without PostgreSQL configuration");
  const unavailableShiftWrite = await request(filePath, "/api/v1/workshop/shift-execution", "PATCH", {}, {}, {});
  assert(unavailableShiftWrite.statusCode === 405, "shift read endpoint must reject write methods before opening storage");
  const shiftCapabilities = await request(filePath, "/api/v1/workshop/shift-execution/capabilities", "GET", null, {}, {});
  assert(shiftCapabilities.statusCode === 200 && shiftCapabilities.json.capabilities?.assignmentCreationEnabled === false && shiftCapabilities.json.capabilities?.primaryPostgres === false, "shift command capability must remain disabled on a snapshot primary");
  const disabledShiftCommand = await request(filePath, "/api/v1/workshop/shift-execution/assignments", "POST", { idempotencyKey: "shift-1" }, {}, {});
  assert(disabledShiftCommand.statusCode === 409 && /not enabled/.test(disabledShiftCommand.json.error || ""), "shift command must remain disabled until its snapshot bridge is explicitly activated");
  const unavailableSpecificationsRead = await request(filePath, "/api/v1/specifications2/revisions/summary", "GET", null, {}, {});
  assert(unavailableSpecificationsRead.statusCode === 503 && /DATABASE_URL/.test(unavailableSpecificationsRead.json.error || ""), "Specifications 2.0 read endpoint must fail explicitly without PostgreSQL configuration");
  const unavailableSpecificationsDetail = await request(filePath, "/api/v1/specifications2/revisions/revision-1", "GET", null, {}, {});
  assert(unavailableSpecificationsDetail.statusCode === 503 && /DATABASE_URL/.test(unavailableSpecificationsDetail.json.error || ""), "Specifications 2.0 revision detail must remain distinct from the summary route");
  const unavailableSpecificationsBySource = await request(filePath, "/api/v1/specifications2/revisions/by-source/source-entry-1", "GET", null, {}, {});
  assert(unavailableSpecificationsBySource.statusCode === 503 && /DATABASE_URL/.test(unavailableSpecificationsBySource.json.error || ""), "Specifications 2.0 source lookup must use the PostgreSQL read model");
  const disabledSpecificationsCommand = await request(filePath, "/api/v1/specifications2/revisions/revision-1/work-orders", "POST", { routeSourceDraftId: "route-1", quantity: 1, idempotencyKey: "request-1" }, {}, {});
  assert(disabledSpecificationsCommand.statusCode === 409 && /not enabled/.test(disabledSpecificationsCommand.json.error || ""), "Specifications 2.0 server command must be disabled until snapshot create sync is available");
  const disabledSpecificationsPublication = await request(filePath, "/api/v1/specifications2/revisions", "POST", { entry: { id: "specification-1" }, idempotencyKey: "publish-1" }, {}, {});
  assert(disabledSpecificationsPublication.statusCode === 409 && /not enabled/.test(disabledSpecificationsPublication.json.error || ""), "Specifications 2.0 publication command must remain disabled until PostgreSQL authority is explicitly enabled");
  const snapshotPrimarySpecificationsCommand = await request(filePath, "/api/v1/specifications2/revisions/revision-1/work-orders", "POST", { routeSourceDraftId: "route-1", quantity: 1, idempotencyKey: "request-1" }, {}, { MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS: "1" });
  assert(snapshotPrimarySpecificationsCommand.statusCode === 409 && /PostgreSQL as the primary/.test(snapshotPrimarySpecificationsCommand.json.error || ""), "Specifications 2.0 command must not run with snapshot as its primary authority");
  const unavailableSpecificationsWrite = await request(filePath, "/api/v1/specifications2/revisions", "PATCH", {}, {}, {});
  assert(unavailableSpecificationsWrite.statusCode === 405, "Specifications 2.0 read endpoint must reject writes before opening storage");

  const missing = await request(filePath, "/api/v1/planning/work-orders/missing");
  assert(missing.statusCode === 404, "unknown work order must return 404");

  const planningMutationEnv = { MES_ENABLE_PLANNING_SERVER_COMMANDS: "1" };
  const updated = await request(filePath, "/api/v1/planning/work-orders/WO-001", "PATCH", { quantity: 24 }, { "if-match": detail.headers.ETag }, planningMutationEnv);
  assert(updated.statusCode === 200 && updated.json.item?.quantity === 24 && updated.json.item?.concurrencyRevision === 5 && updated.json.revision === 8, "quantity command must update the work order and revision");
  assert(updated.headers.ETag === '"5"', "quantity command must return updated ETag");

  const snapshotRepository = createWorkOrdersRepository({ filePath });
  const mirrored = await snapshotRepository.applyServerQuantityProjection("route-1", {
    expectedRevision: 5,
    targetRevision: 6,
    quantity: 30,
    operations: [{ slot: { id: "slot-1", quantity: 30, plannedStart: "2026-07-17T08:00:00.000Z", plannedEnd: "2026-07-17T10:00:00.000Z" } }],
  });
  assert(mirrored.applied && mirrored.item?.quantity === 30 && mirrored.item?.concurrencyRevision === 6, "Server projection must atomically mirror quantity and slot calculation into snapshot storage");
  const mirroredAgain = await snapshotRepository.applyServerQuantityProjection("route-1", {
    expectedRevision: 5,
    targetRevision: 6,
    quantity: 30,
    operations: [{ slot: { id: "slot-1", quantity: 30, plannedStart: "2026-07-17T08:00:00.000Z", plannedEnd: "2026-07-17T10:00:00.000Z" } }],
  });
  assert(mirroredAgain.applied && !mirroredAgain.conflict, "Repeated outbox delivery must be idempotent");

  const scheduled = await request(filePath, "/api/v1/planning/work-orders/WO-001/operations/step-1/slot", "PATCH", {
    slotId: "slot-1",
    plannedStart: "2026-07-18T08:00:00.000Z",
    expectedRevision: 6,
  }, { "if-match": '"6"' }, planningMutationEnv);
  assert(scheduled.statusCode === 200 && scheduled.json.item?.concurrencyRevision === 7 && scheduled.json.slot?.id === "slot-1" && scheduled.json.compatibilityReceipt?.ready === true, "slot schedule command must update/read back the exact physical slot with an applied rollback receipt");
  const scheduledDetail = await request(filePath, "/api/v1/planning/work-orders/WO-001");
  assert(scheduledDetail.json.item?.operations?.[0]?.slot?.plannedStart === "2026-07-18T08:00:00.000Z", "slot schedule command must persist its new start");
  assert(scheduledDetail.json.item?.operations?.[0]?.slot?.plannedEnd === "2026-07-18T10:00:00.000Z", "snapshot schedule command must preserve slot duration");

  const stale = await request(filePath, "/api/v1/planning/work-orders/WO-001", "PATCH", { quantity: 30, expectedRevision: 4 }, {}, planningMutationEnv);
  assert(stale.statusCode === 409 && stale.json.conflict === true, "stale quantity command must be rejected");

  const contradictory = await request(filePath, "/api/v1/planning/work-orders/WO-001", "PATCH", { quantity: 30, expectedRevision: 5 }, { "if-match": '"4"' }, planningMutationEnv);
  assert(contradictory.statusCode === 400, "contradictory body and If-Match revisions must be rejected");

  console.log("Domain API QA: OK");
} finally {
  await rm(dir, { recursive: true, force: true });
}
