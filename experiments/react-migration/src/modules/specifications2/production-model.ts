type UnknownRecord = Record<string, unknown>;

export interface Specifications2ProductionCoverage {
  contract: "postgres-specifications2-read-v1";
  supported: readonly string[];
  deferred: readonly string[];
}

export interface Specifications2ProductionModel {
  registry: UnknownRecord[];
  selectedEntry: UnknownRecord | null;
  serverStatus: "empty" | "unpublished" | "loading" | "error" | "missing" | "mismatch" | "ready";
  serverError: string;
  workOrderReady: boolean;
  readModelCoverage: Specifications2ProductionCoverage;
}

export const SPECIFICATIONS2_PRODUCTION_MODEL_SUPPORTED = [
  "Specifications 2.0 registry and current selection from the compatibility store",
  "immutable PostgreSQL revision read-back with source, revision and fingerprint checks",
  "published tree, route and operation summaries",
  "existing draft-row and route-draft read projections",
  "PostgreSQL-primary immutable revision publication",
  "PostgreSQL-primary work-order capability",
] as const;

export const SPECIFICATIONS2_PRODUCTION_MODEL_DEFERRED = [
  "XLSX import and import deletion",
  "PostgreSQL-owned draft-row edit, add, remove and reparent commands",
  "PostgreSQL-owned route metadata, operation and normalization editing",
  "server attachment binding, download and unbinding",
  "PostgreSQL-owned mutable draft collaboration",
] as const;

const asRecord = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value)
  ? value as UnknownRecord
  : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const number = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const timestamp = (value: unknown): number => {
  const parsed = new Date(text(value)).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const hasOwn = (value: UnknownRecord, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

function productionStore(input: UnknownRecord): UnknownRecord {
  const candidates = [input.specifications2Store, input.store, input.specifications2]
    .map(asRecord)
    .find((candidate) => Object.keys(candidate).length);
  return candidates || input;
}

function publicationState(entry: UnknownRecord, currentFingerprint: string): {
  id: "draft" | "changed" | "released";
  label: string;
  sidebarLabel: string;
} {
  const publication = asRecord(entry.publication);
  const revision = Math.max(0, number(publication.revision));
  if (!revision) return { id: "draft", label: "Черновик", sidebarLabel: "Черновик" };
  const publishedFingerprint = text(publication.fingerprint);
  const explicitState = text(entry.publicationState).toLowerCase();
  const changed = entry.draftChanged === true
    || explicitState === "changed"
    || Boolean(currentFingerprint && publishedFingerprint && currentFingerprint !== publishedFingerprint)
    || Boolean(timestamp(entry.editedAt) && timestamp(entry.editedAt) > timestamp(publication.releasedAt || publication.publishedAt));
  return changed
    ? { id: "changed", label: `Есть изменения после ревизии ${revision}`, sidebarLabel: `Изменена после рев. ${revision}` }
    : { id: "released", label: `Опубликована ревизия ${revision}`, sidebarLabel: `Ревизия ${revision}` };
}

function fingerprintFor(input: UnknownRecord, entry: UnknownRecord): string {
  const id = text(entry.id);
  const maps = [input.currentFingerprintByEntryId, input.fingerprintsByEntryId].map(asRecord);
  for (const map of maps) {
    const candidate = text(map[id]);
    if (candidate) return candidate;
  }
  return text(entry.currentFingerprint || entry.draftFingerprint);
}

function revisionStateFor(input: UnknownRecord, sourceEntryId: string): UnknownRecord {
  const direct = asRecord(input.publishedRevisionState || input.revisionState);
  if (Object.keys(direct).length) return direct;
  const states = asRecord(input.publishedRevisionStates || input.revisionsBySourceId);
  const state = asRecord(states[sourceEntryId]);
  if (Object.keys(state).length) return state;
  const item = asRecord(input.publishedRevision || input.serverRevision);
  return Object.keys(item).length ? { item } : {};
}

function normalizeDraftRows(entry: UnknownRecord): UnknownRecord[] {
  const source = asArray(entry.editorRows).length ? asArray(entry.editorRows) : asArray(entry.treeRows);
  const seen = new Set<string>();
  const rows = source.flatMap((raw, index): UnknownRecord[] => {
    const row = asRecord(raw);
    const id = text(row.id || row.selectionKey || row.nodeKey, `draft-row-${index + 1}`);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      parentId: text(row.parentId || row.parentKey),
      order: Number.isFinite(Number(row.order)) ? Number(row.order) : index,
      label: text(row.label || row.name, "Без названия"),
      designation: text(row.designation),
      type: text(row.type || row.kind, "Компонент"),
      quantity: String(row.quantity ?? ""),
      unitOfMeasure: text(row.unitOfMeasure || row.unit),
    }];
  });
  const ids = new Set(rows.map((row) => text(row.id)));
  return rows.map((row) => row.parentId && !ids.has(text(row.parentId)) ? { ...row, parentId: "" } : row);
}

function registryRow(entry: UnknownRecord, selectedId: string, currentFingerprint: string): UnknownRecord | null {
  const id = text(entry.id);
  if (!id) return null;
  const state = publicationState(entry, currentFingerprint);
  const publication = asRecord(entry.publication);
  return {
    id,
    title: text(entry.title || entry.fileName, "Спецификация XLSX"),
    importedAt: text(entry.importedAt),
    rowCount: Math.max(0, number(asRecord(entry.stats).rows) || asArray(entry.editorRows).length || asArray(entry.treeRows).length),
    errorCount: asArray(entry.errors).length,
    publicationRevision: Math.max(0, number(publication.revision)),
    publicationState: state.id,
    publicationLabel: state.sidebarLabel,
    selected: id === selectedId,
  };
}

function isRevisionFingerprintAccepted(serverFingerprint: string, publishedFingerprint: string): boolean {
  return Boolean(
    publishedFingerprint
    && (serverFingerprint === publishedFingerprint || /^sha256:[a-f0-9]{64}$/i.test(serverFingerprint)),
  );
}

function serverStatusFor(entry: UnknownRecord, state: UnknownRecord): Specifications2ProductionModel["serverStatus"] {
  const publication = asRecord(entry.publication);
  const revision = Math.max(0, number(publication.revision));
  if (!revision) return "unpublished";
  if (state.loading) return "loading";
  if (text(state.error)) return "error";
  const item = asRecord(state.item);
  if (!Object.keys(item).length) return "missing";
  const revisionMatches = number(item.revisionNo) === revision && text(item.sourceEntryId) === text(entry.id);
  const fingerprintMatches = isRevisionFingerprintAccepted(text(item.fingerprint), text(publication.fingerprint));
  return revisionMatches && fingerprintMatches ? "ready" : "mismatch";
}

function selectedEntryModel(entry: UnknownRecord, state: UnknownRecord, currentFingerprint: string): UnknownRecord {
  const publication = asRecord(entry.publication);
  const stateView = publicationState(entry, currentFingerprint);
  const serverItem = asRecord(state.item);
  return {
    id: text(entry.id),
    title: text(entry.title || entry.fileName, "Спецификация XLSX"),
    fileName: text(entry.fileName),
    importedAt: text(entry.importedAt),
    publicationState: stateView.id,
    publicationLabel: stateView.label,
    publicationRevision: Math.max(0, number(publication.revision)),
    publishedAt: text(publication.releasedAt || publication.publishedAt),
    draftRows: normalizeDraftRows(entry),
    routeDrafts: asArray(entry.routeDrafts),
    serverRevision: Object.keys(serverItem).length ? {
      id: text(serverItem.id),
      sourceEntryId: text(serverItem.sourceEntryId),
      specificationId: text(serverItem.specificationId),
      title: text(serverItem.title || entry.title, "Спецификация"),
      designation: text(serverItem.designation),
      revisionNo: Math.max(0, number(serverItem.revisionNo)),
      releasedAt: text(serverItem.releasedAt),
      sourceUpdatedAt: text(serverItem.sourceUpdatedAt),
      treeItems: asArray(serverItem.treeItems),
      routes: asArray(serverItem.routes),
    } : null,
  };
}

export function isSpecifications2ProductionInput(value: unknown): boolean {
  const input = asRecord(value);
  return [
    "specifications2Store", "store", "specifications2", "publishedRevisionState",
    "publishedRevisionStates", "publishedRevision", "currentFingerprintByEntryId",
  ].some((key) => hasOwn(input, key))
    || (hasOwn(input, "registry") && hasOwn(input, "selectedId"));
}

export function buildSpecifications2ProductionModel(value: unknown): Specifications2ProductionModel {
  const input = asRecord(value);
  const store = productionStore(input);
  const entries = asArray(store.registry).map(asRecord).filter((entry) => text(entry.id));
  const requestedSelectedId = text(store.selectedId || input.selectedId);
  const selectedId = entries.some((entry) => text(entry.id) === requestedSelectedId)
    ? requestedSelectedId
    : text(entries[0]?.id);
  const selected = entries.find((entry) => text(entry.id) === selectedId) || null;
  const fingerprints = new Map(entries.map((entry) => [text(entry.id), fingerprintFor(input, entry)]));
  const registry = entries.flatMap((entry): UnknownRecord[] => {
    const row = registryRow(entry, selectedId, fingerprints.get(text(entry.id)) || "");
    return row ? [row] : [];
  });
  const revisionState = selected ? revisionStateFor(input, selectedId) : {};
  const workOrderCapability = asRecord(input.workOrderCapability || asRecord(input.capabilities).workOrder);
  const workOrderReady = workOrderCapability.enabled === true && workOrderCapability.primaryPostgres === true;
  return {
    registry,
    selectedEntry: selected ? selectedEntryModel(selected, revisionState, fingerprints.get(selectedId) || "") : null,
    serverStatus: selected ? serverStatusFor(selected, revisionState) : "empty",
    serverError: text(revisionState.error),
    workOrderReady,
    readModelCoverage: {
      contract: "postgres-specifications2-read-v1",
      supported: SPECIFICATIONS2_PRODUCTION_MODEL_SUPPORTED,
      deferred: SPECIFICATIONS2_PRODUCTION_MODEL_DEFERRED,
    },
  };
}
