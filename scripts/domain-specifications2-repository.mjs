import { createHash } from "node:crypto";
import postgres from "postgres";
import { buildSpecifications2WorkOrderCommand } from "../src/domain/specifications2_work_order.js";
import { normalizePlannedQuantity } from "../src/domain/planning_quantity.js";
import {
  analyzeSpecifications2EditorRowsHierarchy,
  buildSpecifications2ReleaseFingerprint,
  getSpecifications2EffectiveRows,
  inspectSpecifications2Publication,
  specifications2ReleaseFingerprintAdapterVersion,
} from "../src/modules/specifications2/publication.js";
import {
  buildSpecifications2CompatibilityPayloadDigest,
  exportSpecifications2Entry,
} from "./domain-specifications2-export.mjs";
import { importSpecifications2ExportRows, lockSpecifications2SourceEntries, validateSpecifications2Export } from "./domain-specifications2-import.mjs";

// Revision reads happen on module selection and publication refresh. Reusing a
// small client pool avoids a TCP/TLS/PostgreSQL handshake for every one of
// those requests; explicit process shutdown remains available for tests and
// controlled service restarts.
const READ_CLIENTS_BY_URL = new Map();
export const SPECIFICATIONS2_COMPATIBILITY_LIMITS = Object.freeze({
  maxBytes: 512 * 1024,
  maxDepth: 24,
  maxNodes: 50_000,
  maxStringBytes: 64 * 1024,
});
export const SPECIFICATIONS2_SERVER_PUBLICATION_FINGERPRINT_ADAPTER_VERSION = 6;
export const SPECIFICATIONS2_GUARD_FUNCTION_BODY_SHA256 = Object.freeze({
  legacyRevisionIdentity: "d8a8833a1479b11c1fb6b735d4d71405e69ad5535ecc8ccf6e41689b131ebddd",
  workOrderRevisionIdentity: "a9de0121b85dcd9b0742aeba68f4b309c8075981bc2c518cf40019f01951c7a1",
  publicationOutboxV6: "6a08a7bb91b9eb269eef81e643871e7f06ac3b8114baf41907f740cc5b799231",
});
export const SPECIFICATIONS2_GUARD_TRIGGER_DEFINITIONS = Object.freeze({
  legacyRevisionIdentity: "create trigger specifications2_capture_legacy_revision_identity_trigger after insert on specifications2_revision_items for each row when (new.parent_source_row_id = '') execute function specifications2_capture_legacy_revision_identity()",
  workOrderRevisionIdentity: "create trigger specifications2_verify_work_order_revision_identity_trigger before insert on specifications2_work_order_sources for each row execute function specifications2_verify_work_order_revision_identity()",
  publicationOutboxV6: "create trigger specifications2_require_v6_publication_outbox_trigger before insert or update of payload, aggregate_type, command_type on domain_change_log for each row execute function specifications2_require_v6_publication_outbox()",
});
// Kept as a compatibility alias for the existing narrow QA entry point. The
// bound now applies to the complete normalized compatibility entry, not only
// to the release-fingerprint string.
export const SPECIFICATIONS2_COMPATIBILITY_FINGERPRINT_MAX_BYTES = SPECIFICATIONS2_COMPATIBILITY_LIMITS.maxBytes;

function getReadClient(databaseUrl) {
  const existing = READ_CLIENTS_BY_URL.get(databaseUrl);
  if (existing) return existing;
  const client = postgres(databaseUrl, { max: 3, idle_timeout: 10, connect_timeout: 5, prepare: false });
  READ_CLIENTS_BY_URL.set(databaseUrl, client);
  return client;
}

export async function closeSpecifications2ReadClients() {
  await Promise.all([...READ_CLIENTS_BY_URL.values()].map((client) => client.end({ timeout: 5 })));
  READ_CLIENTS_BY_URL.clear();
}

const number = (value = 0) => Number(value || 0);
const iso = (value) => value?.toISOString?.() || "";
export const SPECIFICATIONS2_WORK_ORDER_REQUEST_FINGERPRINT_VERSION = 1;
export const SPECIFICATIONS2_WORK_ORDER_AGGREGATE_IDENTITY_VERSION = 1;
const SPECIFICATIONS2_WORK_ORDER_MAX_QUANTITY = 99_999_999_999;

export function buildSpecifications2WorkOrderRequestFingerprint({
  revisionId,
  routeDocumentId,
  quantity,
  actorId,
} = {}) {
  const specificationRevisionId = String(revisionId || "").trim();
  const resolvedRouteDocumentId = String(routeDocumentId || "").trim();
  const actorScope = String(actorId || "").trim();
  const requestedQuantity = Number(quantity);
  if (!specificationRevisionId || !resolvedRouteDocumentId || !actorScope) {
    throw new Error("Revision, resolved route and authenticated actor are required for Work Order idempotency");
  }
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
    throw new Error("Work Order request quantity must be positive and finite");
  }
  const normalizedQuantity = normalizePlannedQuantity(requestedQuantity);
  if (!Number.isSafeInteger(normalizedQuantity) || normalizedQuantity > SPECIFICATIONS2_WORK_ORDER_MAX_QUANTITY) {
    throw new Error("Work Order request quantity cannot be stored exactly");
  }
  const canonicalRequest = JSON.stringify({
    schemaVersion: SPECIFICATIONS2_WORK_ORDER_REQUEST_FINGERPRINT_VERSION,
    command: "create_specifications2_work_order",
    specificationRevisionId,
    routeDocumentId: resolvedRouteDocumentId,
    persistedQuantity: normalizedQuantity.toFixed(3),
    actorScope,
  });
  return {
    requestFingerprint: `sha256:${createHash("sha256").update(canonicalRequest).digest("hex")}`,
    specificationRevisionId,
    routeDocumentId: resolvedRouteDocumentId,
    normalizedQuantity,
    actorScope,
    canonicalRequest,
  };
}

export function buildSpecifications2WorkOrderAggregateIdentity({ actorScope, idempotencyKey } = {}) {
  const normalizedActorScope = String(actorScope || "").trim();
  const normalizedIdempotencyKey = String(idempotencyKey || "").trim();
  if (!normalizedActorScope || !normalizedIdempotencyKey || normalizedIdempotencyKey.length > 160) {
    throw new Error("Authenticated actor scope and bounded Idempotency-Key are required for Work Order identity");
  }
  const canonicalIdentity = JSON.stringify({
    schemaVersion: SPECIFICATIONS2_WORK_ORDER_AGGREGATE_IDENTITY_VERSION,
    command: "create_specifications2_work_order",
    actorScope: normalizedActorScope,
    idempotencyKey: normalizedIdempotencyKey,
  });
  return {
    aggregateIdentity: `sha256:${createHash("sha256").update(canonicalIdentity).digest("hex")}`,
    actorScope: normalizedActorScope,
    idempotencyKey: normalizedIdempotencyKey,
    canonicalIdentity,
  };
}

export function decideSpecifications2WorkOrderRequest({ priorRequest = null, request = null } = {}) {
  if (!priorRequest) return { kind: "create" };
  const exact = String(priorRequest.request_fingerprint || "") === String(request?.requestFingerprint || "")
    && String(priorRequest.specification_revision_id || "") === String(request?.specificationRevisionId || "")
    && String(priorRequest.route_document_id || "") === String(request?.routeDocumentId || "")
    && Number(priorRequest.request_quantity) === Number(request?.normalizedQuantity)
    && String(priorRequest.request_actor_scope || "") === String(request?.actorScope || "");
  if (!exact) {
    return {
      kind: "idempotency-conflict",
      legacyUnverifiable: !priorRequest.request_fingerprint
        || priorRequest.request_quantity === null
        || priorRequest.request_quantity === undefined
        || !priorRequest.request_actor_scope,
    };
  }
  return { kind: "replay" };
}

const REVISION_IDENTITY_STATES = new Set(["authoritative", "legacy-derived", "legacy-unverified"]);

// A document row is mutable latest-state metadata. Never use it to reconstruct
// an older revision's name/designation: doing so lets publication N+1 silently
// rewrite revision N reads and work-order semantics. Historical migrations may
// recover immutable values from that revision's own root row, but uncertainty
// remains explicit instead of being filled from the current document.
export function resolveSpecifications2RevisionReadIdentity(row = {}) {
  const rawState = String(row.revision_identity_state || "").trim();
  const state = REVISION_IDENTITY_STATES.has(rawState) ? rawState : "legacy-unverified";
  const title = String(row.revision_title ?? "").trim();
  const designation = String(row.revision_designation ?? "").trim();
  return {
    title,
    designation,
    state,
    authoritative: state === "authoritative",
    verified: state !== "legacy-unverified" && Boolean(title || designation),
  };
}

export async function isSpecifications2RevisionIdentityReady(sql) {
  const [row] = await sql`
    SELECT
      (SELECT count(*)::int
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'specifications2_revisions'
         AND column_name = ANY(ARRAY['revision_title', 'revision_designation', 'revision_identity_state'])) AS identity_column_count,
      EXISTS (
        SELECT 1 FROM mes_schema_migrations
        WHERE version = '029_specifications2_revision_identity_backfill'
      ) AS revision_identity_backfill_applied
  `;
  return Number(row?.identity_column_count || 0) === 3
    && row?.revision_identity_backfill_applied === true;
}

export function resolveSpecifications2CommandSchemaReadiness(row = {}) {
  return Boolean(
    row?.documents_table
    && row?.revisions_table
    && row?.items_table
    && row?.routes_table
    && row?.operations_table
    && row?.publication_requests_table
    && row?.revision_identity_columns
    && row?.revision_identity_backfill_applied
    && row?.legacy_revision_identity_guard_applied
    && row?.guard_function_repair_applied
    && row?.work_order_request_columns
    && row?.work_order_request_contract_constraint
    && row?.work_order_legacy_route_idempotency_absent
    && row?.work_order_actor_idempotency_index
    && row?.legacy_revision_identity_function_exact
    && row?.work_order_revision_identity_function_exact
    && row?.publication_outbox_v6_function_exact
    && row?.legacy_revision_identity_trigger_exact
    && row?.work_order_revision_identity_trigger_exact
    && row?.publication_outbox_v6_trigger_exact
    && specifications2GuardTriggerDefinitionMatches(
      row?.legacy_revision_identity_trigger_definition,
      SPECIFICATIONS2_GUARD_TRIGGER_DEFINITIONS.legacyRevisionIdentity,
    )
    && specifications2GuardTriggerDefinitionMatches(
      row?.work_order_revision_identity_trigger_definition,
      SPECIFICATIONS2_GUARD_TRIGGER_DEFINITIONS.workOrderRevisionIdentity,
    )
    && specifications2GuardTriggerDefinitionMatches(
      row?.publication_outbox_v6_trigger_definition,
      SPECIFICATIONS2_GUARD_TRIGGER_DEFINITIONS.publicationOutboxV6,
    )
    && row?.work_order_request_fingerprint_trigger_exact
    && row?.outbox_table,
  );
}

export function normalizeSpecifications2GuardTriggerDefinition(definition) {
  return String(definition || "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase()
    .replace(/\bpublic\./gu, "")
    .replace(/::text\b/gu, "")
    .replace(/when \(\(([^()]*)\)\) execute function/gu, "when ($1) execute function");
}

export function specifications2GuardTriggerDefinitionMatches(actual, expected) {
  return normalizeSpecifications2GuardTriggerDefinition(actual)
    === normalizeSpecifications2GuardTriggerDefinition(expected);
}

// Migration markers alone are not sufficient: a damaged or manually disabled
// trigger or a no-op replacement function would leave the old marker in place
// while removing the rollback safety contract. Both Specifications 2.0 command
// surfaces therefore share this exact catalog check and fail closed unless
// migration 031, every exact tgfoid/pg_get_triggerdef binding and every function
// body digest are present. The fourth request-fingerprint guard remains an exact
// identity/timing/event binding owned by the additive part of migration 030.
export async function inspectSpecifications2CommandSchemaReadiness(sql) {
  const [row] = await sql`
    SELECT
      to_regclass('public.specifications2_documents') AS documents_table,
      to_regclass('public.specifications2_revisions') AS revisions_table,
      to_regclass('public.specifications2_revision_items') AS items_table,
      to_regclass('public.specifications2_route_documents') AS routes_table,
      to_regclass('public.specifications2_route_operations') AS operations_table,
      to_regclass('public.specifications2_publication_requests') AS publication_requests_table,
      (SELECT count(*) = 3
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'specifications2_revisions'
         AND column_name = ANY(ARRAY['revision_title', 'revision_designation', 'revision_identity_state'])) AS revision_identity_columns,
      EXISTS (
        SELECT 1 FROM mes_schema_migrations
        WHERE version = '029_specifications2_revision_identity_backfill'
      ) AS revision_identity_backfill_applied,
      EXISTS (
        SELECT 1 FROM mes_schema_migrations
        WHERE version = '030_specifications2_legacy_revision_identity_guard'
      ) AS legacy_revision_identity_guard_applied,
      EXISTS (
        SELECT 1 FROM mes_schema_migrations
        WHERE version = '031_specifications2_guard_function_repair'
      ) AS guard_function_repair_applied,
      (SELECT count(*) = 3
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'specifications2_work_order_sources'
         AND column_name = ANY(ARRAY['request_fingerprint', 'request_quantity', 'request_actor_scope'])) AS work_order_request_columns,
      EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.specifications2_work_order_sources'::regclass
          AND conname = 'specifications2_work_order_request_contract_check'
          AND convalidated
      ) AS work_order_request_contract_constraint,
      NOT EXISTS (
        SELECT 1
        FROM pg_index legacy_index
        WHERE legacy_index.indrelid = 'public.specifications2_work_order_sources'::regclass
          AND legacy_index.indisunique
          AND legacy_index.indnkeyatts = 3
          AND legacy_index.indexprs IS NULL
          AND legacy_index.indpred IS NULL
          AND pg_get_indexdef(legacy_index.indexrelid, 1, true) = 'specification_revision_id'
          AND pg_get_indexdef(legacy_index.indexrelid, 2, true) = 'route_document_id'
          AND pg_get_indexdef(legacy_index.indexrelid, 3, true) = 'idempotency_key'
      ) AS work_order_legacy_route_idempotency_absent,
      EXISTS (
        SELECT 1
        FROM pg_index index_definition
        JOIN pg_class index_relation ON index_relation.oid = index_definition.indexrelid
        WHERE index_definition.indrelid = 'public.specifications2_work_order_sources'::regclass
          AND index_relation.relname = 'specifications2_work_order_actor_idempotency_uidx'
          AND index_definition.indisunique
          AND index_definition.indisvalid
          AND index_definition.indisready
          AND index_definition.indnkeyatts = 2
          AND pg_get_indexdef(index_definition.indexrelid, 1, true) = 'request_actor_scope'
          AND pg_get_indexdef(index_definition.indexrelid, 2, true) = 'idempotency_key'
          AND pg_get_expr(index_definition.indpred, index_definition.indrelid, true) IN (
            'request_actor_scope IS NOT NULL',
            '(request_actor_scope IS NOT NULL)'
          )
      ) AS work_order_actor_idempotency_index,
      EXISTS (
        SELECT 1
        FROM pg_proc function_definition
        JOIN pg_namespace function_namespace ON function_namespace.oid = function_definition.pronamespace
        JOIN pg_language function_language ON function_language.oid = function_definition.prolang
        WHERE function_namespace.nspname = 'public'
          AND function_definition.proname = 'specifications2_capture_legacy_revision_identity'
          AND function_definition.pronargs = 0
          AND function_definition.prorettype = 'pg_catalog.trigger'::regtype
          AND function_language.lanname = 'plpgsql'
          AND function_definition.provolatile = 'v'
          AND NOT function_definition.prosecdef
          AND function_definition.proconfig = ARRAY['search_path=public, pg_temp']::text[]
          AND encode(sha256(convert_to(function_definition.prosrc, 'UTF8')), 'hex') = '${SPECIFICATIONS2_GUARD_FUNCTION_BODY_SHA256.legacyRevisionIdentity}'
      ) AS legacy_revision_identity_function_exact,
      EXISTS (
        SELECT 1
        FROM pg_proc function_definition
        JOIN pg_namespace function_namespace ON function_namespace.oid = function_definition.pronamespace
        JOIN pg_language function_language ON function_language.oid = function_definition.prolang
        WHERE function_namespace.nspname = 'public'
          AND function_definition.proname = 'specifications2_verify_work_order_revision_identity'
          AND function_definition.pronargs = 0
          AND function_definition.prorettype = 'pg_catalog.trigger'::regtype
          AND function_language.lanname = 'plpgsql'
          AND function_definition.provolatile = 'v'
          AND NOT function_definition.prosecdef
          AND function_definition.proconfig = ARRAY['search_path=public, pg_temp']::text[]
          AND encode(sha256(convert_to(function_definition.prosrc, 'UTF8')), 'hex') = '${SPECIFICATIONS2_GUARD_FUNCTION_BODY_SHA256.workOrderRevisionIdentity}'
      ) AS work_order_revision_identity_function_exact,
      EXISTS (
        SELECT 1
        FROM pg_proc function_definition
        JOIN pg_namespace function_namespace ON function_namespace.oid = function_definition.pronamespace
        JOIN pg_language function_language ON function_language.oid = function_definition.prolang
        WHERE function_namespace.nspname = 'public'
          AND function_definition.proname = 'specifications2_require_v6_publication_outbox'
          AND function_definition.pronargs = 0
          AND function_definition.prorettype = 'pg_catalog.trigger'::regtype
          AND function_language.lanname = 'plpgsql'
          AND function_definition.provolatile = 'v'
          AND NOT function_definition.prosecdef
          AND function_definition.proconfig = ARRAY['search_path=public, pg_temp']::text[]
          AND encode(sha256(convert_to(function_definition.prosrc, 'UTF8')), 'hex') = '${SPECIFICATIONS2_GUARD_FUNCTION_BODY_SHA256.publicationOutboxV6}'
      ) AS publication_outbox_v6_function_exact,
      EXISTS (
        SELECT 1 FROM pg_trigger trigger_definition
        WHERE trigger_definition.tgrelid = 'public.specifications2_revision_items'::regclass
          AND trigger_definition.tgname = 'specifications2_capture_legacy_revision_identity_trigger'
          AND NOT trigger_definition.tgisinternal
          AND trigger_definition.tgenabled IN ('O', 'A')
          AND trigger_definition.tgfoid = to_regprocedure('public.specifications2_capture_legacy_revision_identity()')
      ) AS legacy_revision_identity_trigger_exact,
      (SELECT pg_get_triggerdef(trigger_definition.oid, true)
       FROM pg_trigger trigger_definition
       WHERE trigger_definition.tgrelid = 'public.specifications2_revision_items'::regclass
         AND trigger_definition.tgname = 'specifications2_capture_legacy_revision_identity_trigger'
         AND NOT trigger_definition.tgisinternal) AS legacy_revision_identity_trigger_definition,
      EXISTS (
        SELECT 1 FROM pg_trigger trigger_definition
        WHERE trigger_definition.tgrelid = 'public.specifications2_work_order_sources'::regclass
          AND trigger_definition.tgname = 'specifications2_verify_work_order_revision_identity_trigger'
          AND NOT trigger_definition.tgisinternal
          AND trigger_definition.tgenabled IN ('O', 'A')
          AND trigger_definition.tgfoid = to_regprocedure('public.specifications2_verify_work_order_revision_identity()')
      ) AS work_order_revision_identity_trigger_exact,
      (SELECT pg_get_triggerdef(trigger_definition.oid, true)
       FROM pg_trigger trigger_definition
       WHERE trigger_definition.tgrelid = 'public.specifications2_work_order_sources'::regclass
         AND trigger_definition.tgname = 'specifications2_verify_work_order_revision_identity_trigger'
         AND NOT trigger_definition.tgisinternal) AS work_order_revision_identity_trigger_definition,
      EXISTS (
        SELECT 1 FROM pg_trigger trigger_definition
        WHERE trigger_definition.tgrelid = 'public.domain_change_log'::regclass
          AND trigger_definition.tgname = 'specifications2_require_v6_publication_outbox_trigger'
          AND NOT trigger_definition.tgisinternal
          AND trigger_definition.tgenabled IN ('O', 'A')
          AND trigger_definition.tgfoid = to_regprocedure('public.specifications2_require_v6_publication_outbox()')
      ) AS publication_outbox_v6_trigger_exact,
      (SELECT pg_get_triggerdef(trigger_definition.oid, true)
       FROM pg_trigger trigger_definition
       WHERE trigger_definition.tgrelid = 'public.domain_change_log'::regclass
         AND trigger_definition.tgname = 'specifications2_require_v6_publication_outbox_trigger'
         AND NOT trigger_definition.tgisinternal) AS publication_outbox_v6_trigger_definition,
      EXISTS (
        SELECT 1 FROM pg_trigger trigger_definition
        WHERE trigger_definition.tgrelid = 'public.specifications2_work_order_sources'::regclass
          AND trigger_definition.tgname = 'specifications2_verify_work_order_request_fingerprint_trigger'
          AND NOT trigger_definition.tgisinternal
          AND trigger_definition.tgenabled IN ('O', 'A')
          AND trigger_definition.tgfoid = to_regprocedure('public.specifications2_verify_work_order_request_fingerprint()')
          AND (trigger_definition.tgtype & 1) = 1
          AND (trigger_definition.tgtype & 2) = 2
          AND (trigger_definition.tgtype & 4) = 4
          AND (trigger_definition.tgtype & 16) = 16
          AND (trigger_definition.tgtype & 8) = 0
          AND trigger_definition.tgattr = ''::int2vector
          AND trigger_definition.tgqual IS NULL
      ) AS work_order_request_fingerprint_trigger_exact,
      to_regclass('public.domain_change_log') AS outbox_table
  `;
  const schemaReady = resolveSpecifications2CommandSchemaReadiness(row);
  return {
    schemaReady,
    error: schemaReady ? "" : "Specifications 2.0 command schema, exclusive actor-scoped Work Order idempotency, request fingerprint, or rollback guard triggers are missing or disabled",
  };
}

export function validateSpecifications2RawPublicationStructure(entry, limits = SPECIFICATIONS2_COMPATIBILITY_LIMITS) {
  const maxDepth = Math.max(1, Number(limits?.maxDepth) || 0);
  const maxNodes = Math.max(1, Number(limits?.maxNodes) || 0);
  const stack = [{ value: entry, depth: 0 }];
  const seen = new Set();
  let nodes = 0;
  let observedDepth = 0;
  while (stack.length) {
    const { value, depth } = stack.pop();
    nodes += 1;
    if (nodes > maxNodes) throw new Error("Specifications 2.0 publication payload exceeds the node-count limit");
    if (depth > maxDepth) throw new Error("Specifications 2.0 publication payload exceeds the depth limit");
    observedDepth = Math.max(observedDepth, depth);
    if (value === null || ["string", "boolean", "number"].includes(typeof value)) continue;
    if (!value || typeof value !== "object") throw new Error("Specifications 2.0 publication payload contains a non-JSON value");
    if (seen.has(value)) throw new Error("Specifications 2.0 publication payload contains a cyclic value");
    seen.add(value);
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) stack.push({ value: value[index], depth: depth + 1 });
      continue;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("Specifications 2.0 publication payload contains a non-JSON object");
    const values = Object.values(value);
    for (let index = values.length - 1; index >= 0; index -= 1) stack.push({ value: values[index], depth: depth + 1 });
  }
  const hierarchy = analyzeSpecifications2EditorRowsHierarchy(entry);
  if (hierarchy.emptyRowIndexes.length) throw new Error("Specifications 2.0 publication contains a row without an id");
  if (hierarchy.duplicateIds.length) throw new Error("Specifications 2.0 publication contains duplicate row ids");
  if (hierarchy.selfParentIds.length) throw new Error("Specifications 2.0 publication contains a self-parent row");
  if (hierarchy.missingParentLinks.length) throw new Error("Specifications 2.0 publication contains a row with an unknown parent");
  if (hierarchy.cycleIds.length) throw new Error("Specifications 2.0 publication contains a parent cycle");
  if (hierarchy.maxDepth > maxDepth) throw new Error("Specifications 2.0 publication parent hierarchy exceeds the depth limit");
  return { depth: observedDepth, nodes };
}

export function validateSpecifications2CompatibilityEntryBounds(entry, limits = SPECIFICATIONS2_COMPATIBILITY_LIMITS) {
  const maxBytes = Math.max(1, Number(limits?.maxBytes) || 0);
  const maxDepth = Math.max(1, Number(limits?.maxDepth) || 0);
  const maxNodes = Math.max(1, Number(limits?.maxNodes) || 0);
  const maxStringBytes = Math.max(1, Number(limits?.maxStringBytes) || 0);
  const stack = [{ value: entry, depth: 0 }];
  const seen = new Set();
  let nodes = 0;
  let observedDepth = 0;

  const inspectString = (value) => {
    const bytes = Buffer.byteLength(value, "utf8");
    if (bytes > maxStringBytes) {
      throw new Error("Specifications 2.0 compatibility entry contains an oversized string");
    }
  };

  while (stack.length) {
    const { value, depth } = stack.pop();
    nodes += 1;
    if (nodes > maxNodes) throw new Error("Specifications 2.0 compatibility entry exceeds the node-count limit");
    if (depth > maxDepth) throw new Error("Specifications 2.0 compatibility entry exceeds the depth limit");
    observedDepth = Math.max(observedDepth, depth);
    if (typeof value === "string") {
      inspectString(value);
      continue;
    }
    if (value === null || typeof value === "boolean") continue;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("Specifications 2.0 compatibility entry contains a non-finite number");
      continue;
    }
    if (!value || typeof value !== "object") {
      throw new Error("Specifications 2.0 compatibility entry contains a non-JSON value");
    }
    if (seen.has(value)) throw new Error("Specifications 2.0 compatibility entry contains a cyclic value");
    seen.add(value);
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) stack.push({ value: value[index], depth: depth + 1 });
      continue;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Specifications 2.0 compatibility entry contains a non-JSON object");
    }
    const entries = Object.entries(value);
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, child] = entries[index];
      inspectString(key);
      stack.push({ value: child, depth: depth + 1 });
    }
  }

  let serialized;
  try { serialized = JSON.stringify(entry); }
  catch { throw new Error("Specifications 2.0 compatibility entry cannot be serialized as JSON"); }
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > maxBytes) throw new Error("Specifications 2.0 compatibility entry exceeds the serialized-size limit");
  return { bytes, depth: observedDepth, nodes };
}

// A server publication may be retried after a browser reload. Keep the
// compatibility projection compact and transport-neutral in the PostgreSQL
// outbox; binary file data belongs to the separate attachment storage.
function withoutInlineAttachmentContent(entry = {}) {
  return {
    ...entry,
    routeDrafts: (Array.isArray(entry.routeDrafts) ? entry.routeDrafts : []).map((draft) => ({
      ...draft,
      operations: (Array.isArray(draft.operations) ? draft.operations : []).map((operation) => ({
        ...operation,
        productionFiles: Object.fromEntries(Object.entries(operation?.productionFiles || {}).map(([kind, raw]) => {
          if (!raw || typeof raw !== "object") return [kind, raw];
          const { inlineDataUrl, dataUrl, content, ...metadata } = raw;
          return [kind, metadata];
        })),
      })),
    })),
  };
}

function compatibilityTreeRows(entry = {}) {
  const rows = getSpecifications2EffectiveRows(entry);
  return rows.map((row = {}) => ({
    id: String(row.id || ""),
    selectionKey: String(row.selectionKey || ""),
    nodeKey: String(row.nodeKey || ""),
    parentId: String(row.parentId || ""),
    parentKey: String(row.parentKey || ""),
    level: Number(row.level || 0),
    label: String(row.label || ""),
    designation: String(row.designation || ""),
    type: String(row.type || ""),
    quantity: Number(row.quantity || 0),
    unit: String(row.unit || ""),
    unitOfMeasure: String(row.unitOfMeasure || ""),
    status: String(row.status || ""),
  }));
}

function compatibilityRouteDrafts(entry = {}) {
  return (Array.isArray(entry.routeDrafts) ? entry.routeDrafts : []).map((draft = {}) => ({
    id: String(draft.id || ""),
    productKey: String(draft.productKey || ""),
    designation: String(draft.designation || ""),
    productLabel: String(draft.productLabel || draft.title || ""),
    status: String(draft.status || "draft"),
    operations: (Array.isArray(draft.operations) ? draft.operations : []).map((operation = {}) => ({
      id: String(operation.id || ""),
      operationId: String(operation.operationId || ""),
      name: String(operation.name || operation.operationName || ""),
      workCenterId: String(operation.workCenterId || ""),
      nextWorkCenterId: String(operation.nextWorkCenterId || ""),
      nextOperationId: String(operation.nextOperationId || ""),
      changesProperty: operation.changesProperty !== false,
      inputState: String(operation.inputState || ""),
      outputState: String(operation.outputState || ""),
      instructionRequired: operation.instructionRequired === true,
      laborNorm: operation.laborNorm && typeof operation.laborNorm === "object" ? operation.laborNorm : {},
      productionFiles: withoutInlineAttachmentContent({ routeDrafts: [{ operations: [operation] }] }).routeDrafts[0].operations[0].productionFiles,
    })),
  }));
}

export function buildSpecifications2CompatibilityPublicationEntry(entry = {}, revision = {}) {
  const publication = entry?.publication && typeof entry.publication === "object" ? entry.publication : {};
  const releasedAt = String(publication.releasedAt || publication.publishedAt || new Date().toISOString());
  return {
    id: String(entry.id || ""),
    title: String(entry.title || ""),
    createdAt: String(entry.createdAt || ""),
    updatedAt: String(entry.updatedAt || ""),
    selectedRouteDraftId: String(entry.selectedRouteDraftId || ""),
    treeRows: compatibilityTreeRows(entry),
    routeDrafts: compatibilityRouteDrafts(entry),
    publication: {
      ...publication,
      revision: Math.max(1, Number(revision.revision_no || publication.revision || 1)),
      fingerprint: String(publication.fingerprint || buildSpecifications2ReleaseFingerprint(entry)),
      releasedAt,
      status: String(publication.status || "released"),
    },
  };
}

export function normalizeExpectedPreviousRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 0 ? revision : null;
}

function timestamp(value, fallback = new Date().toISOString()) {
  return String(value?.toISOString?.() || value || fallback);
}

// The browser may prepare a candidate revision for presentation, but it never
// owns the resulting number or timestamp. Rebuild that publication envelope
// from the editor content immediately before the server derives its immutable
// relational payload. This also rejects a forged/stale browser fingerprint.
export function buildAuthoritativePublicationEntry(entry = {}, { revisionNo, releasedAt } = {}) {
  const source = entry && typeof entry === "object" ? entry : {};
  const priorPublication = source.publication && typeof source.publication === "object" ? source.publication : {};
  // The v6 fingerprint builder canonicalizes nested route metadata
  // recursively. Enforce raw structural bounds iteratively before invoking it
  // so adversarial depth/width fails cleanly rather than exhausting the stack.
  validateSpecifications2RawPublicationStructure(source);
  const fingerprint = buildSpecifications2ReleaseFingerprint(source, {
    adapterVersion: SPECIFICATIONS2_SERVER_PUBLICATION_FINGERPRINT_ADAPTER_VERSION,
  });
  const clientFingerprint = String(priorPublication.fingerprint || "");
  if (clientFingerprint
    && specifications2ReleaseFingerprintAdapterVersion(clientFingerprint) !== SPECIFICATIONS2_SERVER_PUBLICATION_FINGERPRINT_ADAPTER_VERSION) {
    throw new Error("Specifications 2.0 revision content changed after its client publication was prepared: unsupported historical adapter");
  }
  if (clientFingerprint && clientFingerprint !== fingerprint) {
    throw new Error("Specifications 2.0 revision content changed after its client publication was prepared");
  }
  const authoritativeEntry = {
    ...source,
    publication: {
      ...priorPublication,
      revision: revisionNo,
      fingerprint,
      releasedAt,
      publishedAt: releasedAt,
      status: "released",
    },
  };
  validateSpecifications2CompatibilityEntryBounds(buildSpecifications2CompatibilityPublicationEntry(authoritativeEntry, {
    revision_no: revisionNo,
    fingerprint,
    released_at: releasedAt,
  }));
  return authoritativeEntry;
}

export function buildSpecifications2PublicationRequestFingerprint({ entry, expectedPreviousRevision, actorId = "" } = {}) {
  const expectedRevision = normalizeExpectedPreviousRevision(expectedPreviousRevision);
  if (expectedRevision === null) throw new Error("Expected previous revision is required");
  const sourceEntryId = String(entry?.id || "").trim();
  if (!sourceEntryId) throw new Error("Specifications 2.0 source entry id is required");
  return buildSpecifications2CompatibilityPayloadDigest({
    commandType: "publish_revision",
    sourceEntryId,
    expectedPreviousRevision: expectedRevision,
    actorId: String(actorId || ""),
    payload: entry,
  });
}

export function decideSpecifications2PublicationRequest({
  priorRequest = null,
  requestFingerprint = "",
  expectedPreviousRevision,
  latestRevision = null,
} = {}) {
  const expectedRevision = normalizeExpectedPreviousRevision(expectedPreviousRevision);
  if (expectedRevision === null) throw new Error("Expected previous revision is required");
  const latestRevisionNo = Math.max(0, Number(latestRevision?.revision_no || 0));
  if (!priorRequest) {
    return latestRevisionNo === expectedRevision
      ? { kind: "create", latestRevisionNo, revisionNo: latestRevisionNo + 1 }
      : { kind: "revision-conflict", latestRevisionNo };
  }
  if (String(priorRequest.request_fingerprint || "") !== String(requestFingerprint || "")) {
    return { kind: "idempotency-conflict", latestRevisionNo };
  }
  const resultingRevisionNo = Math.max(0, Number(priorRequest.resulting_revision_no || 0));
  const resultingRevisionId = String(priorRequest.resulting_revision_id || "");
  if (Number(priorRequest.expected_previous_revision) !== expectedRevision
    || resultingRevisionNo !== expectedRevision + 1
    || latestRevisionNo !== resultingRevisionNo
    || String(latestRevision?.id || "") !== resultingRevisionId) {
    return { kind: "superseded-conflict", latestRevisionNo, resultingRevisionNo };
  }
  return { kind: "replay", latestRevisionNo, revisionNo: resultingRevisionNo, revisionId: resultingRevisionId };
}

function useExistingSpecificationId(payload, specificationId) {
  if (!specificationId || payload?.documents?.[0]?.id === specificationId) return payload;
  return {
    ...payload,
    documents: payload.documents.map((document) => ({ ...document, id: specificationId })),
    revisions: payload.revisions.map((revision) => ({ ...revision, specification_id: specificationId })),
  };
}

// Read-only repository for published Specifications 2.0 revisions.  It is
// intentionally independent from the browser snapshot: callers either see a
// complete PostgreSQL projection or an explicit storage error.
export function createSpecifications2ReadRepository({
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
} = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Specifications 2.0 read storage");
  const sql = getReadClient(databaseUrl);
  const metadata = { storageMode: "postgres", storageBackend: "postgresql", configured: true };
  return {
    ...metadata,
    async summary() {
      const [row] = await sql`
        SELECT
          (SELECT count(*) FROM specifications2_documents)::int AS document_count,
          (SELECT count(*) FROM specifications2_revisions)::int AS revision_count,
          (SELECT count(*) FROM specifications2_revision_items)::int AS item_count,
          (SELECT count(*) FROM specifications2_route_documents)::int AS route_count,
          (SELECT count(*) FROM specifications2_route_operations)::int AS operation_count,
          (SELECT max(released_at) FROM specifications2_revisions) AS updated_at
      `;
      return { ...metadata, updatedAt: iso(row?.updated_at), summary: { documentCount: number(row?.document_count), revisionCount: number(row?.revision_count), itemCount: number(row?.item_count), routeCount: number(row?.route_count), operationCount: number(row?.operation_count) } };
    },
    async list({ limit = 100 } = {}) {
      const safeLimit = Math.max(1, Math.min(500, Math.trunc(number(limit) || 100)));
      const identityColumnsReady = await isSpecifications2RevisionIdentityReady(sql);
      const rows = identityColumnsReady ? await sql`
          SELECT r.id, r.revision_no, r.fingerprint, r.released_at, r.source_updated_at,
                 r.revision_title, r.revision_designation, r.revision_identity_state,
                 d.id AS specification_id, d.source_entry_id,
                 (SELECT count(*) FROM specifications2_revision_items i WHERE i.specification_revision_id = r.id)::int AS item_count,
                 (SELECT count(*) FROM specifications2_route_documents rd WHERE rd.specification_revision_id = r.id)::int AS route_count,
                 (SELECT count(*) FROM specifications2_route_operations ro JOIN specifications2_route_documents rd ON rd.id = ro.route_document_id WHERE rd.specification_revision_id = r.id)::int AS operation_count
          FROM specifications2_revisions r
          JOIN specifications2_documents d ON d.id = r.specification_id
          ORDER BY r.released_at DESC NULLS LAST, r.revision_no DESC, r.id
          LIMIT ${safeLimit}
        ` : await sql`
          SELECT r.id, r.revision_no, r.fingerprint, r.released_at, r.source_updated_at,
                 d.title AS revision_title, d.designation AS revision_designation,
                 'legacy-unverified'::text AS revision_identity_state,
                 d.id AS specification_id, d.source_entry_id,
                 (SELECT count(*) FROM specifications2_revision_items i WHERE i.specification_revision_id = r.id)::int AS item_count,
                 (SELECT count(*) FROM specifications2_route_documents rd WHERE rd.specification_revision_id = r.id)::int AS route_count,
                 (SELECT count(*) FROM specifications2_route_operations ro JOIN specifications2_route_documents rd ON rd.id = ro.route_document_id WHERE rd.specification_revision_id = r.id)::int AS operation_count
          FROM specifications2_revisions r
          JOIN specifications2_documents d ON d.id = r.specification_id
          ORDER BY r.released_at DESC NULLS LAST, r.revision_no DESC, r.id
          LIMIT ${safeLimit}
        `;
      return { ...metadata, items: rows.map((row) => {
        const identity = resolveSpecifications2RevisionReadIdentity(row);
        return { id: row.id, specificationId: row.specification_id, sourceEntryId: row.source_entry_id, title: identity.title, designation: identity.designation, revisionIdentityState: identity.state, revisionIdentityAuthoritative: identity.authoritative, revisionIdentityVerified: identity.verified, revisionNo: number(row.revision_no), fingerprint: row.fingerprint, releasedAt: iso(row.released_at), sourceUpdatedAt: iso(row.source_updated_at), itemCount: number(row.item_count), routeCount: number(row.route_count), operationCount: number(row.operation_count) };
      }) };
    },
    async get(revisionId) {
      const identityColumnsReady = await isSpecifications2RevisionIdentityReady(sql);
      const revisions = identityColumnsReady ? await sql`
          SELECT r.id, r.revision_no, r.fingerprint, r.released_at, r.source_updated_at,
                 r.revision_title, r.revision_designation, r.revision_identity_state,
                 d.id AS specification_id, d.source_entry_id
          FROM specifications2_revisions r JOIN specifications2_documents d ON d.id = r.specification_id
          WHERE r.id = ${revisionId}
        ` : await sql`
          SELECT r.id, r.revision_no, r.fingerprint, r.released_at, r.source_updated_at,
                 d.title AS revision_title, d.designation AS revision_designation,
                 'legacy-unverified'::text AS revision_identity_state,
                 d.id AS specification_id, d.source_entry_id
          FROM specifications2_revisions r JOIN specifications2_documents d ON d.id = r.specification_id
          WHERE r.id = ${revisionId}
        `;
      const revision = revisions[0];
      if (!revision) return { ...metadata, item: null };
      const identity = resolveSpecifications2RevisionReadIdentity(revision);
      const [items, routes] = await Promise.all([
        sql`SELECT source_row_id, parent_source_row_id, designation, name, item_kind, quantity, unit FROM specifications2_revision_items WHERE specification_revision_id = ${revisionId} ORDER BY source_row_id`,
        sql`SELECT id, source_draft_id, designation, product_label, status FROM specifications2_route_documents WHERE specification_revision_id = ${revisionId} ORDER BY source_draft_id`,
      ]);
      const routeIds = routes.map((route) => route.id);
      const operations = routeIds.length ? await sql`
        SELECT route_document_id, source_operation_id, sequence_no, operation_id, name, work_center_id, next_work_center_id, changes_property, input_state, output_state, labor_norm, attachments
        FROM specifications2_route_operations WHERE route_document_id = ANY(${routeIds}) ORDER BY route_document_id, sequence_no
      ` : [];
      const operationsByRoute = new Map();
      operations.forEach((operation) => { const group = operationsByRoute.get(operation.route_document_id) || []; group.push({ sourceOperationId: operation.source_operation_id, sequenceNo: number(operation.sequence_no), operationId: operation.operation_id, name: operation.name, workCenterId: operation.work_center_id, nextWorkCenterId: operation.next_work_center_id, changesProperty: operation.changes_property, inputState: operation.input_state, outputState: operation.output_state, laborNorm: operation.labor_norm || {}, attachments: operation.attachments || {} }); operationsByRoute.set(operation.route_document_id, group); });
      return { ...metadata, item: { id: revision.id, specificationId: revision.specification_id, sourceEntryId: revision.source_entry_id, title: identity.title, designation: identity.designation, revisionIdentityState: identity.state, revisionIdentityAuthoritative: identity.authoritative, revisionIdentityVerified: identity.verified, revisionNo: number(revision.revision_no), fingerprint: revision.fingerprint, releasedAt: iso(revision.released_at), sourceUpdatedAt: iso(revision.source_updated_at), treeItems: items.map((row) => ({ sourceRowId: row.source_row_id, parentSourceRowId: row.parent_source_row_id, designation: row.designation, name: row.name, kind: row.item_kind, quantity: number(row.quantity), unit: row.unit })), routes: routes.map((route) => ({ sourceDraftId: route.source_draft_id, designation: route.designation, productLabel: route.product_label, status: route.status, operations: operationsByRoute.get(route.id) || [] })) } };
    },
    async getLatestBySourceEntry(sourceEntryId) {
      const rows = await sql`
        SELECT r.id FROM specifications2_revisions r
        JOIN specifications2_documents d ON d.id = r.specification_id
        WHERE d.source_entry_id = ${sourceEntryId}
        ORDER BY r.revision_no DESC, r.released_at DESC NULLS LAST, r.id DESC LIMIT 1
      `;
      return rows[0]?.id ? this.get(rows[0].id) : { ...metadata, item: null };
    },
    // Read repositories borrow the process-level pool. Closing a request
    // facade must never tear down a client another concurrent request uses.
    async close() {},
  };
}

// Publication is intentionally separate from the read model and work-order
// command. It accepts one editor entry, derives the immutable relational
// revision server-side and binds each caller key to the exact command payload.
export function createSpecifications2PublishCommandRepository({
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
} = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Specifications 2.0 publication storage");
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5, prepare: false });
  const metadata = { storageMode: "postgres", storageBackend: "postgresql", configured: true };
  return {
    ...metadata,
    async commandReadiness() {
      try {
        return { ...metadata, ...await inspectSpecifications2CommandSchemaReadiness(sql) };
      } catch (error) {
        return { ...metadata, schemaReady: false, error: error?.message || "Specifications 2.0 publication schema is unavailable" };
      }
    },
    async publish({ entry, expectedPreviousRevision, idempotencyKey, actorId = "" }) {
      if (!idempotencyKey || String(idempotencyKey).length > 160) {
        return { ...metadata, created: false, item: null, error: "Idempotency key is required" };
      }
      const sourceEntryId = String(entry?.id || "").trim();
      if (!sourceEntryId) {
        return { ...metadata, created: false, item: null, error: "Specifications 2.0 source entry id is required" };
      }
      const expectedRevision = normalizeExpectedPreviousRevision(expectedPreviousRevision);
      if (expectedRevision === null) {
        return { ...metadata, created: false, item: null, error: "Expected previous revision is required" };
      }
      const clientRevision = entry?.publication?.revision;
      if (clientRevision !== undefined && clientRevision !== null && String(clientRevision).trim() !== "") {
        const normalizedClientRevision = normalizeExpectedPreviousRevision(clientRevision);
        if (normalizedClientRevision === null || normalizedClientRevision !== expectedRevision + 1) {
          return { ...metadata, created: false, item: null, error: "Client revision must be exactly one greater than its expected previous revision" };
        }
      }
      let candidateEntry;
      let candidatePayload;
      let requestFingerprint;
      try {
        validateSpecifications2RawPublicationStructure(entry);
        const inspection = inspectSpecifications2Publication(entry);
        if (!inspection.ready) throw new Error(inspection.issues[0] || "Specifications 2.0 entry is not ready to publish");
        // Revision number and release timestamp are overwritten inside the
        // transaction below. This first projection validates the exact
        // content/fingerprint and lets us validate server attachment ids
        // before opening a write transaction.
        candidateEntry = buildAuthoritativePublicationEntry(entry, {
          revisionNo: Math.max(1, expectedRevision + 1),
          releasedAt: timestamp(entry?.publication?.releasedAt || entry?.publication?.publishedAt),
        });
        candidatePayload = exportSpecifications2Entry(candidateEntry);
        validateSpecifications2Export(candidatePayload);
        requestFingerprint = buildSpecifications2PublicationRequestFingerprint({
          entry,
          expectedPreviousRevision: expectedRevision,
          actorId,
        });
      } catch (error) {
        return { ...metadata, created: false, item: null, error: error?.message || "Specifications 2.0 entry cannot be published" };
      }
      if (candidatePayload.documents.length !== 1 || candidatePayload.revisions.length !== 1
        || candidatePayload.documents[0]?.source_entry_id !== sourceEntryId) {
        return { ...metadata, created: false, item: null, error: "Publication command accepts exactly one immutable revision" };
      }
      const attachmentIds = [...new Set(candidatePayload.routeOperations.flatMap((operation) => Object.values(operation.attachments || {}))
        .filter((attachment) => attachment && typeof attachment === "object" && Object.keys(attachment).length > 0)
        .map((attachment) => String(attachment.serverAttachmentId || "").trim()))];
      if (attachmentIds.includes("")) {
        return { ...metadata, created: false, item: null, error: "Production attachment must be uploaded to server storage before publishing a revision" };
      }
      if (attachmentIds.length) {
        const found = await sql`SELECT id FROM specifications2_attachment_blobs WHERE id = ANY(${attachmentIds})`;
        if (found.length !== attachmentIds.length) return { ...metadata, created: false, item: null, error: "One or more production attachments are missing from server storage" };
      }
      let outcome = null;
      await sql.begin(async (tx) => {
        // A key is global to the publication command surface. Serialize it
        // before taking the per-source lock so two different sources cannot
        // race the request-ledger primary key and turn a semantic conflict
        // into an unhandled unique-constraint error.
        await tx`SELECT pg_advisory_xact_lock(hashtext(${`specifications2:publication-request:${String(idempotencyKey)}`}))`;
        // This advisory lock is keyed by the editor source, rather than by a
        // client-supplied revision id. Two browser tabs therefore cannot both
        // observe the same next revision and silently publish different
        // content as one immutable release. It must be acquired before any
        // request/document/revision row lock: otherwise an old-key replay can
        // hold the resulting revision while a new key holds this source lock.
        await lockSpecifications2SourceEntries(tx, [sourceEntryId]);
        const [priorRequest] = await tx`
          SELECT publication_request.request_fingerprint,
                 publication_request.source_entry_id,
                 publication_request.expected_previous_revision,
                 publication_request.resulting_revision_id,
                 revision.revision_no AS resulting_revision_no,
                 revision.fingerprint AS resulting_fingerprint,
                 revision.released_at AS resulting_released_at
          FROM specifications2_publication_requests publication_request
          JOIN specifications2_revisions revision ON revision.id = publication_request.resulting_revision_id
          WHERE publication_request.idempotency_key = ${String(idempotencyKey)}
          FOR UPDATE OF publication_request, revision
        `;
        const documents = await tx`
          SELECT id FROM specifications2_documents
          WHERE source_entry_id = ${sourceEntryId}
          FOR UPDATE
        `;
        const existingDocument = documents[0] || null;
        const specificationId = existingDocument?.id || candidatePayload.documents[0].id;
        const [latest] = await tx`
          SELECT id, revision_no
          FROM specifications2_revisions
          WHERE specification_id = ${specificationId}
          ORDER BY revision_no DESC
          LIMIT 1
          FOR UPDATE
        `;
        const decision = decideSpecifications2PublicationRequest({
          priorRequest,
          requestFingerprint,
          expectedPreviousRevision: expectedRevision,
          latestRevision: latest,
        });
        if (decision.kind === "idempotency-conflict") {
          outcome = {
            ...metadata,
            created: false,
            item: null,
            conflict: true,
            idempotencyConflict: true,
            currentRevision: decision.latestRevisionNo,
            error: "Idempotency key was already used for another Specifications 2.0 publication command",
          };
          return;
        }
        if (decision.kind === "revision-conflict") {
          outcome = {
            ...metadata,
            created: false,
            item: null,
            conflict: true,
            currentRevision: decision.latestRevisionNo,
            error: `Specifications 2.0 revision changed on the server (current ${decision.latestRevisionNo}, expected ${expectedRevision})`,
          };
          return;
        }
        if (decision.kind === "superseded-conflict") {
          outcome = {
            ...metadata,
            created: false,
            item: null,
            conflict: true,
            superseded: true,
            currentRevision: decision.latestRevisionNo,
            error: `Specifications 2.0 publication retry was superseded by revision ${decision.latestRevisionNo}`,
          };
          return;
        }
        let revision;
        let authoritativeEntry;
        let created = false;
        if (decision.kind === "replay") {
          revision = {
            id: priorRequest.resulting_revision_id,
            revision_no: Number(priorRequest.resulting_revision_no),
            fingerprint: priorRequest.resulting_fingerprint,
            released_at: priorRequest.resulting_released_at,
          };
          authoritativeEntry = buildAuthoritativePublicationEntry(entry, {
            revisionNo: revision.revision_no,
            releasedAt: timestamp(revision.released_at),
          });
        } else {
          const releasedAt = new Date().toISOString();
          const revisionNo = decision.revisionNo;
          authoritativeEntry = buildAuthoritativePublicationEntry(entry, { revisionNo, releasedAt });
          const authoritativePayload = useExistingSpecificationId(
            exportSpecifications2Entry(authoritativeEntry),
            existingDocument?.id || "",
          );
          validateSpecifications2Export(authoritativePayload);
          revision = authoritativePayload.revisions[0];
          await importSpecifications2ExportRows(tx, authoritativePayload);
          await tx`
            INSERT INTO specifications2_publication_requests
              (idempotency_key, request_fingerprint, source_entry_id, expected_previous_revision, resulting_revision_id, actor_id)
            VALUES
              (${String(idempotencyKey)}, ${requestFingerprint}, ${sourceEntryId}, ${expectedRevision}, ${revision.id}, ${String(actorId || "")})
          `;
          created = true;
        }
        const compatibilityEntry = buildSpecifications2CompatibilityPublicationEntry(authoritativeEntry, revision);
        const compatibilityPayloadDigest = buildSpecifications2CompatibilityPayloadDigest(compatibilityEntry);
        // The PostgreSQL revision and its recoverable compatibility delivery
        // commit together. A retry can restore a missing outbox row without
        // creating another immutable revision.
        await tx`
          INSERT INTO domain_change_log (aggregate_type, aggregate_id, aggregate_revision, command_type, payload, actor_id, snapshot_sync_state)
          VALUES ('specifications2_revision', ${revision.id}, ${revision.revision_no}, 'publish_revision', ${tx.json({
            idempotencyKey: String(idempotencyKey),
            sourceEntryId,
            fingerprint: revision.fingerprint,
            compatibilityPayloadDigest,
            compatibilityEntry,
          })}, ${String(actorId || "") || null}, 'pending')
          ON CONFLICT (aggregate_type, aggregate_id, aggregate_revision) DO NOTHING
        `;
        outcome = { created, revision, publication: compatibilityEntry.publication };
      });
      if (outcome?.conflict) return outcome;
      const read = createSpecifications2ReadRepository({ databaseUrl });
      try {
        const result = await read.get(outcome?.revision?.id || "");
        if (!result.item) return { ...metadata, created: false, item: null, error: "Published revision was not readable after save" };
        return {
          ...metadata,
          created: outcome.created,
          item: result.item,
          publication: outcome.publication,
          idempotencyKey: String(idempotencyKey),
          actorId: String(actorId || ""),
        };
      } finally { await read.close(); }
    },
    async close() { await sql.end({ timeout: 5 }); },
  };
}

// Command repository is intentionally separate from the read model.  It is
// enabled only after an explicit feature flag and a snapshot-outbox consumer
// are available, so merely deploying the schema cannot create pilot orders.
export function createSpecifications2WorkOrderCommandRepository({
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
} = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Specifications 2.0 command storage");
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5, prepare: false });
  const metadata = { storageMode: "postgres", storageBackend: "postgresql", configured: true };
  return {
    ...metadata,
    async commandReadiness() {
      try {
        return { ...metadata, ...await inspectSpecifications2CommandSchemaReadiness(sql) };
      } catch (error) {
        return { ...metadata, schemaReady: false, error: error?.message || "Specifications 2.0 work-order command schema is unavailable" };
      }
    },
    async create({ revisionId, routeSourceDraftId, quantity, idempotencyKey, actorId = "" }) {
      return sql.begin(async (tx) => {
        const commandReadiness = await inspectSpecifications2CommandSchemaReadiness(tx);
        if (!commandReadiness.schemaReady) {
          return { ...metadata, created: false, item: null, error: commandReadiness.error };
        }
        const identityColumnsReady = await isSpecifications2RevisionIdentityReady(tx);
        // Pilot may start the new application release before the root-owned
        // migration unit runs. Keep work-order creation available from the
        // immutable root item during that bounded window; never fall back to
        // mutable latest-document metadata on a write path.
        const revisions = identityColumnsReady ? await tx`
            SELECT r.id, r.revision_no, r.revision_title, r.revision_designation,
                   r.revision_identity_state, d.source_entry_id
            FROM specifications2_revisions r JOIN specifications2_documents d ON d.id = r.specification_id
            WHERE r.id = ${String(revisionId || "")} FOR SHARE OF r, d
          ` : await tx`
            SELECT r.id, r.revision_no, root.name AS revision_title,
                   root.designation AS revision_designation,
                   CASE
                     WHEN NULLIF(root.name, '') IS NOT NULL OR NULLIF(root.designation, '') IS NOT NULL
                       THEN 'legacy-derived'::text
                     ELSE 'legacy-unverified'::text
                   END AS revision_identity_state,
                   d.source_entry_id
            FROM specifications2_revisions r JOIN specifications2_documents d ON d.id = r.specification_id
            LEFT JOIN LATERAL (
              SELECT item.name, item.designation
              FROM specifications2_revision_items item
              WHERE item.specification_revision_id = r.id
                AND item.parent_source_row_id = ''
              ORDER BY item.source_row_id
              LIMIT 1
            ) root ON true
            WHERE r.id = ${String(revisionId || "")} FOR SHARE OF r, d
          `;
        const storedRevision = revisions[0];
        if (!storedRevision) return { ...metadata, created: false, item: null, error: "Published Specifications 2.0 revision was not found" };
        const identity = resolveSpecifications2RevisionReadIdentity(storedRevision);
        const revision = { ...storedRevision, title: identity.title, designation: identity.designation };
        const routes = await tx`
          SELECT id, designation, product_label
          FROM specifications2_route_documents
          WHERE specification_revision_id = ${revision.id} AND source_draft_id = ${String(routeSourceDraftId || "")}
          FOR SHARE
        `;
        const route = routes[0];
        if (!route) return { ...metadata, created: false, item: null, error: "Published route was not found in this revision" };
        const requestIdempotencyKey = String(idempotencyKey || "").trim();
        if (!requestIdempotencyKey || requestIdempotencyKey.length > 160) {
          return { ...metadata, created: false, item: null, error: "A bounded Work Order idempotency key is required" };
        }
        let request;
        try {
          request = buildSpecifications2WorkOrderRequestFingerprint({
            revisionId: revision.id,
            routeDocumentId: route.id,
            quantity,
            actorId,
          });
        } catch (error) {
          return { ...metadata, created: false, item: null, error: error?.message || "Work Order idempotency request is invalid" };
        }
        // The caller may retry after navigating to another revision or route.
        // Serialize the actor/key pair before reading any receipt so that such
        // a changed request becomes a semantic conflict instead of a second
        // production order. Different employees retain independent key spaces.
        await tx`SELECT pg_advisory_xact_lock(hashtext(${`specifications2:work-order-request:${JSON.stringify([request.actorScope, requestIdempotencyKey])}`}))`;
        const existing = await tx`
          SELECT wo.id, wo.number, wo.name, wo.designation, wo.unit, wo.quantity, wo.lifecycle_status, wo.planning_status,
                 wo.source_kind, wo.source_revision, wo.aggregate_revision, wo.updated_at,
                 source.specification_revision_id, source.route_document_id,
                 source.request_fingerprint, source.request_quantity, source.request_actor_scope
          FROM specifications2_work_order_sources source
          JOIN work_orders wo ON wo.id = source.work_order_id
          WHERE source.idempotency_key = ${requestIdempotencyKey}
            AND (source.request_actor_scope = ${request.actorScope}
              OR source.request_actor_scope IS NULL)
          ORDER BY (source.request_actor_scope IS NULL) DESC,
                   (source.request_actor_scope = ${request.actorScope}) DESC,
                   source.created_at,
                   source.work_order_id
          LIMIT 1
        `;
        if (existing[0]) {
          const row = existing[0];
          const decision = decideSpecifications2WorkOrderRequest({ priorRequest: row, request });
          if (decision.kind === "idempotency-conflict") {
            return {
              ...metadata,
              created: false,
              item: null,
              conflict: true,
              idempotencyConflict: true,
              legacyUnverifiable: decision.legacyUnverifiable === true,
              error: "Idempotency key was already used for a different or unverifiable Work Order request",
            };
          }
          return { ...metadata, created: false, item: { id: row.id, number: row.number, name: row.name, designation: row.designation, unit: row.unit, quantity: Number(row.quantity), lifecycleStatus: row.lifecycle_status, planningStatus: row.planning_status, source: row.source_kind, revision: Number(row.source_revision), concurrencyRevision: Number(row.aggregate_revision), updatedAt: iso(row.updated_at) } };
        }
        if (!identity.verified) {
          return { ...metadata, created: false, item: null, error: "Published Specifications 2.0 revision identity is not verified; publish a new revision before creating a work order" };
        }
        const operations = await tx`
          SELECT id, source_operation_id, sequence_no, operation_id, name, work_center_id, next_work_center_id, labor_norm
          FROM specifications2_route_operations
          WHERE route_document_id = ${route.id}
          ORDER BY sequence_no
          FOR SHARE
        `;
        let command;
        try {
          const aggregateIdentity = buildSpecifications2WorkOrderAggregateIdentity({
            actorScope: request.actorScope,
            idempotencyKey: requestIdempotencyKey,
          });
          command = buildSpecifications2WorkOrderCommand({
            revision,
            route,
            operations,
            quantity: request.normalizedQuantity,
            idempotencyKey: requestIdempotencyKey,
            aggregateIdentity: aggregateIdentity.aggregateIdentity,
          });
        }
        catch (error) { return { ...metadata, created: false, item: null, error: error?.message || "Published route cannot create a work order" }; }
        const order = command.workOrder;
        await tx`
          INSERT INTO work_orders (id, number, name, designation, unit, quantity, lifecycle_status, planning_status, source_kind, source_revision, aggregate_revision)
          VALUES (${order.id}, ${order.number}, ${order.name}, ${order.designation}, ${order.unit}, ${order.quantity}, ${order.lifecycleStatus}, ${order.planningStatus}, ${order.sourceKind}, ${order.sourceRevision}, ${order.aggregateRevision})
        `;
        for (const operation of command.operations) {
          await tx`
            INSERT INTO work_order_operations (id, work_order_id, operation_id, name, work_center_id, next_work_center_id, sequence_no, quantity_multiplier, execution_context, labor)
            VALUES (${operation.id}, ${order.id}, ${operation.operationId}, ${operation.name}, ${operation.workCenterId}, ${operation.nextWorkCenterId}, ${operation.sequenceNo}, ${operation.quantityMultiplier}, ${tx.json(operation.executionContext)}, ${tx.json(operation.labor)})
          `;
        }
        await tx`
          INSERT INTO specifications2_work_order_sources
            (work_order_id, specification_revision_id, route_document_id, idempotency_key,
             request_fingerprint, request_quantity, request_actor_scope)
          VALUES
            (${order.id}, ${revision.id}, ${route.id}, ${command.source.idempotencyKey},
             ${request.requestFingerprint}, ${request.normalizedQuantity}, ${request.actorScope})
        `;
        await tx`
          INSERT INTO domain_change_log (aggregate_type, aggregate_id, aggregate_revision, command_type, payload, actor_id, snapshot_sync_state)
          VALUES ('work_order', ${order.id}, 1, 'create_from_specifications2_revision', ${tx.json({ ...command.source, sourceEntryId: revision.source_entry_id, sourceRevision: order.sourceRevision, routeSourceDraftId, requestFingerprint: request.requestFingerprint, title: revision.title, designation: route.designation || revision.designation })}, ${request.actorScope}, 'pending')
        `;
        return { ...metadata, created: true, item: { ...order, revision: order.sourceRevision, concurrencyRevision: order.aggregateRevision, updatedAt: "" } };
      });
    },
    async close() { await sql.end({ timeout: 5 }); },
  };
}
