import { createSpecifications2PublishCommands } from "../domain_api/specifications2_publish_commands.ts";

type UnknownRecord = Record<string, unknown>;

interface SpecificationPublication extends UnknownRecord {
  revision?: unknown;
  fingerprint?: unknown;
}

interface SpecificationEntry extends UnknownRecord {
  id: string;
  publication?: SpecificationPublication;
}

interface SpecificationsStore extends UnknownRecord {
  selectedId: string;
  registry: SpecificationEntry[];
}

interface WorkOrderCapability {
  enabled: boolean;
  primaryPostgres: boolean;
  error: string;
}

interface PublicationCapability {
  enabled: boolean;
  serverPrimary: boolean;
  error: string;
}

interface StoreWriteOptions {
  suppressSharedStatePush: true;
}

interface PublicationRequest {
  entry: SpecificationEntry & { publication: UnknownRecord };
  expectedPreviousRevision: number;
  idempotencyKey: string;
}

interface WorkOrderRequest {
  entryId: string;
  revisionId: string;
  routeSourceDraftId: string;
  quantity: number;
  idempotencyKey: string;
}

interface Specifications2PublishCommands {
  getCapability?: () => unknown;
  refreshCapability?: (options: { force: boolean }) => unknown | Promise<unknown>;
  publishRevision: (request: PublicationRequest) => unknown | Promise<unknown>;
}

export interface Specifications2ProductionOwnerOptions {
  getStore?: () => unknown;
  writeStore?: (store: SpecificationsStore, options: StoreWriteOptions) => unknown;
  getPublishedRevisionState?: (entryId: string) => unknown;
  hydratePublishedRevision?: (entry: SpecificationEntry) => unknown;
  getCurrentFingerprint?: (entry: SpecificationEntry) => unknown;
  preparePublication?: ((entry: SpecificationEntry, context: { now: string }) => unknown | Promise<unknown>) | null;
  forcePublishedRevisionRead?: ((entryId: string, options: { force: true }) => unknown | Promise<unknown>) | null;
  getWorkOrderCapability?: () => unknown;
  createWorkOrder?: (request: WorkOrderRequest) => unknown | Promise<unknown>;
  createIdempotencyKey?: () => unknown;
  publishCommands?: Specifications2PublishCommands | null;
  createPublicationIdempotencyKey?: () => string;
  now?: () => string;
}

interface PublicationRecoveryInput {
  created?: unknown;
  entryId?: string;
  message?: string;
  revision?: number;
}

export const SPECIFICATIONS2_PRODUCTION_DEFERRED_COMMANDS: readonly string[] = Object.freeze([
  "save-draft-row",
  "add-row",
  "remove-row",
  "reparent-row",
  "edit-route",
  "bind-attachment",
  "import-xlsx",
  "delete-import",
  "add-route-operation",
  "remove-route-operation",
  "edit-route-operation",
]);

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function errorMessage(error: unknown, fallback: string): string {
  return text(record(error).message) || fallback;
}

function hasEntryId(value: unknown): value is SpecificationEntry {
  return Boolean(text(record(value).id));
}

function normalizeStore(value: unknown): SpecificationsStore {
  const source = record(value);
  const registry = list(source.registry).filter(hasEntryId);
  const requestedId = text(source.selectedId);
  const selectedId = registry.some((entry) => text(entry.id) === requestedId)
    ? requestedId
    : text(registry[0]?.id);
  return { ...source, selectedId, registry };
}

function readCapability(value: unknown): WorkOrderCapability {
  const capability = record(value);
  return {
    enabled: capability.enabled === true,
    primaryPostgres: capability.primaryPostgres === true,
    error: text(capability.error),
  };
}

function readPublicationCapability(value: unknown): PublicationCapability {
  const capability = record(value);
  return {
    enabled: capability.enabled === true,
    serverPrimary: capability.serverPrimary === true,
    error: text(capability.error),
  };
}

function routeIds(revision: UnknownRecord): Set<string> {
  return new Set(list(revision.routes).map((route) => text(record(route).sourceDraftId)).filter(Boolean));
}

function revisionMatchesSelection(selected: SpecificationEntry, revision: UnknownRecord): boolean {
  const publication = record(selected.publication);
  const publicationRevision = Number(publication.revision);
  const serverFingerprint = text(revision.fingerprint);
  const publicationFingerprint = text(publication.fingerprint);
  return text(revision.sourceEntryId) === text(selected.id)
    && Number.isSafeInteger(publicationRevision)
    && publicationRevision > 0
    && Number(revision.revisionNo) === publicationRevision
    && Boolean(publicationFingerprint)
    && (serverFingerprint === publicationFingerprint || /^sha256:[a-f0-9]{64}$/i.test(serverFingerprint));
}

function publicationRecoveryResult({
  created = false,
  entryId = "",
  message = "",
  revision = 0,
}: PublicationRecoveryInput = {}) {
  return {
    ok: false,
    published: true,
    id: entryId,
    revision,
    created: created === true,
    recoveryPending: true,
    message: message || "Ревизия опубликована, но её подтверждение ещё не восстановлено.",
  };
}

export function createSpecifications2ProductionOwner(options: Specifications2ProductionOwnerOptions = {}) {
  const {
    getStore = () => ({ registry: [], selectedId: "" }),
    writeStore = () => false,
    getPublishedRevisionState = () => ({ item: null, loading: null, error: "" }),
    hydratePublishedRevision = () => {},
    getCurrentFingerprint = () => "",
    preparePublication = null,
    forcePublishedRevisionRead = null,
    getWorkOrderCapability = () => ({ enabled: false, primaryPostgres: false }),
    createWorkOrder = async () => ({ ok: false, error: "Specifications 2.0 work-order owner is unavailable" }),
    createIdempotencyKey = () => globalThis.crypto?.randomUUID?.() || `specifications2-work-order:${Date.now()}`,
    publishCommands = null,
    createPublicationIdempotencyKey = () => `specifications2-publish:${globalThis.crypto?.randomUUID?.() || `${Date.now()}:${Math.random().toString(16).slice(2)}`}`,
    now = () => new Date().toISOString(),
  } = options;
  const publicationOwner: Specifications2PublishCommands = publishCommands || createSpecifications2PublishCommands();

  const getContext = () => {
    const store = normalizeStore(getStore());
    const selected = store.registry.find((entry) => text(entry.id) === store.selectedId) || null;
    const revisionState = selected ? record(getPublishedRevisionState(selected.id)) : {};
    const capability = readCapability(getWorkOrderCapability());
    const publicationCapability = readPublicationCapability(publicationOwner.getCapability?.());
    return { store, selected, revisionState, capability, publicationCapability };
  };

  const getPayload = () => {
    const { store, selected, revisionState, capability, publicationCapability } = getContext();
    if (selected && record(selected.publication).revision) hydratePublishedRevision(selected);
    const fingerprints = Object.fromEntries(store.registry.map((entry) => [
      text(entry.id),
      text(getCurrentFingerprint(entry)),
    ]));
    return {
      productionModel: {
        specifications2Store: store,
        publishedRevisionState: revisionState,
        currentFingerprintByEntryId: fingerprints,
        workOrderCapability: capability,
      },
      capabilities: {
        draftEdit: false,
        publication: publicationCapability.enabled,
        rowStructure: false,
        routeEdit: false,
        attachmentBinding: false,
        workOrder: capability.enabled && capability.primaryPostgres,
      },
      deferredCommands: SPECIFICATIONS2_PRODUCTION_DEFERRED_COMMANDS,
    };
  };

  const selectEntry = (entryId: unknown = "") => {
    const { store } = getContext();
    const id = text(entryId);
    if (!id || !store.registry.some((entry) => text(entry.id) === id)) {
      return { ok: false, message: "Спецификация больше не входит в реестр." };
    }
    if (id === store.selectedId) return { ok: true, id, changed: false };
    // Selection belongs to the local React UI. It must never publish the
    // complete browser registry back into shared-state: that snapshot may be
    // older than the PostgreSQL-backed registry observed by another session.
    const written = writeStore({ ...store, selectedId: id }, { suppressSharedStatePush: true });
    if (written === false) return { ok: false, message: "Не удалось сохранить выбор спецификации." };
    return { ok: true, id, changed: true };
  };

  const publishDraft = async (payload: UnknownRecord) => {
    const { selected, publicationCapability } = getContext();
    const entryId = text(payload.entryId);
    const expectedPreviousRevision = Number(payload.expectedPreviousRevision);
    if (!publicationCapability.enabled) return { ok: false, message: publicationCapability.error || "Серверная публикация пока не включена." };
    if (!selected || selected.id !== entryId || text(payload.confirmEntryId) !== entryId) return { ok: false, message: "Подтверждение относится к другой спецификации." };
    if (!Number.isInteger(expectedPreviousRevision) || expectedPreviousRevision < 0 || Number(record(selected.publication).revision || 0) !== expectedPreviousRevision) {
      return { ok: false, message: "Ревизия черновика изменилась. Обновите экран." };
    }
    let currentFingerprint = "";
    try {
      currentFingerprint = text(getCurrentFingerprint(selected));
    } catch (_error: unknown) {
      return { ok: false, message: "Не удалось проверить текущий fingerprint черновика." };
    }
    const publishedFingerprint = text(record(selected.publication).fingerprint);
    if (publishedFingerprint && currentFingerprint && currentFingerprint === publishedFingerprint) {
      return { ok: false, unchanged: true, message: "Черновик не изменился после последней опубликованной ревизии." };
    }
    if (typeof preparePublication !== "function") {
      return { ok: false, message: "Каноническая подготовка публикации недоступна." };
    }
    let prepared: UnknownRecord;
    try {
      prepared = record(await Promise.resolve(preparePublication(selected, { now: now() })));
    } catch (error: unknown) {
      return { ok: false, message: errorMessage(error, "Не удалось подготовить каноническую публикацию.") };
    }
    const expectedNextRevision = expectedPreviousRevision + 1;
    const preparedPublication = record(prepared.publication);
    const preparedRevision = Number(preparedPublication.revision || 0);
    const preparedFingerprint = text(preparedPublication.fingerprint);
    if (!Number.isInteger(preparedRevision) || preparedRevision !== expectedNextRevision || !preparedFingerprint) {
      return { ok: false, message: "Каноническая публикация вернула неверную следующую ревизию или fingerprint." };
    }
    if (publishedFingerprint && preparedFingerprint === publishedFingerprint) {
      return { ok: false, unchanged: true, message: "Черновик не изменился после последней опубликованной ревизии." };
    }
    const requestEntry: SpecificationEntry & { publication: UnknownRecord } = {
      ...selected,
      publication: {
        ...record(selected.publication),
        ...preparedPublication,
        revision: expectedNextRevision,
        fingerprint: preparedFingerprint,
      },
    };
    let result: UnknownRecord;
    try {
      const publicationResult = await publicationOwner.publishRevision({ entry: requestEntry, expectedPreviousRevision, idempotencyKey: createPublicationIdempotencyKey() });
      result = record(publicationResult);
    } catch (error: unknown) {
      return { ok: false, message: errorMessage(error, "Серверная публикация временно недоступна.") };
    }
    if (!result.ok || !result.item) {
      return { ok: false, conflict: result.conflict === true, message: text(result.error) || "PostgreSQL не подтвердил публикацию." };
    }
    const resultItem = record(result.item);
    const resultPublication = record(result.publication);
    const revision = Number(resultPublication.revision || resultItem.revisionNo || 0);
    if (!Number.isInteger(revision) || revision !== expectedNextRevision) {
      return publicationRecoveryResult({
        created: result.created,
        entryId,
        revision: Number.isInteger(revision) ? revision : 0,
        message: "PostgreSQL подтвердил неожиданный номер ревизии; требуется восстановление read-back.",
      });
    }
    const acknowledgedPublicationFingerprint = text(resultPublication.fingerprint);
    if (acknowledgedPublicationFingerprint !== preparedFingerprint) {
      return publicationRecoveryResult({
        created: result.created,
        entryId,
        revision,
        message: "PostgreSQL подтвердил публикацию с другим каноническим fingerprint; требуется восстановление read-back.",
      });
    }
    const latestStore = normalizeStore(getStore());
    const latest = latestStore.registry.find((entry) => text(entry.id) === entryId);
    if (!latest) return publicationRecoveryResult({ created: result.created, entryId, revision, message: "Опубликованная спецификация исчезла из локального реестра; требуется восстановление." });
    const publication = {
      ...record(latest.publication),
      ...preparedPublication,
      ...resultPublication,
      revision,
      fingerprint: preparedFingerprint,
    };
    const updated: SpecificationEntry = { ...latest, publication };
    const nextStore: SpecificationsStore = {
      ...latestStore,
      registry: latestStore.registry.map((entry) => text(entry.id) === entryId ? updated : entry),
    };
    let written: unknown = false;
    try {
      written = writeStore(nextStore, { suppressSharedStatePush: true });
    } catch (_error: unknown) {
      written = false;
    }
    if (written === false) return publicationRecoveryResult({ created: result.created, entryId, revision, message: "Ревизия опубликована, но локальный ACK не сохранён; требуется восстановление." });
    if (typeof forcePublishedRevisionRead !== "function") {
      return publicationRecoveryResult({ created: result.created, entryId, revision, message: "Ревизия опубликована, но принудительный PostgreSQL read-back недоступен." });
    }
    try {
      await Promise.resolve(forcePublishedRevisionRead(entryId, { force: true }));
    } catch (_error: unknown) {
      return publicationRecoveryResult({ created: result.created, entryId, revision, message: "Ревизия опубликована, но принудительный PostgreSQL read-back завершился ошибкой." });
    }
    const readBackState = record(getPublishedRevisionState(entryId));
    const readBackRevision = record(readBackState.item);
    const expectedReadBackId = text(resultItem.id);
    const expectedReadBackSourceEntryId = text(resultItem.sourceEntryId) || entryId;
    const expectedReadBackFingerprint = text(resultItem.fingerprint);
    if (!expectedReadBackId
      || !expectedReadBackFingerprint
      || text(readBackRevision.id) !== expectedReadBackId
      || text(readBackRevision.sourceEntryId) !== expectedReadBackSourceEntryId
      || Number(readBackRevision.revisionNo || 0) !== revision
      || text(readBackRevision.fingerprint) !== expectedReadBackFingerprint) {
      return publicationRecoveryResult({ created: result.created, entryId, revision, message: "Ревизия опубликована, но PostgreSQL read-back не подтвердил её точные id, source, revision и digest fingerprint." });
    }
    const snapshotSync = record(result.snapshotSync);
    if (Number(snapshotSync.failed || 0) > 0 || Number(snapshotSync.conflicts || 0) > 0) {
      return publicationRecoveryResult({ created: result.created, entryId, revision, message: text(snapshotSync.error) || "Ревизия опубликована, но compatibility delivery ожидает восстановления." });
    }
    return { ok: true, id: entryId, revision, created: result.created === true, recoveryPending: false };
  };

  const execute = async (command: unknown = {}) => {
    const commandRecord = record(command);
    const type = text(commandRecord.type);
    const payload = record(commandRecord.payload);
    if (type === "select-entry") return selectEntry(payload.entryId);
    if (type === "publish-draft") return publishDraft(payload);
    if (SPECIFICATIONS2_PRODUCTION_DEFERRED_COMMANDS.includes(type)) {
      return { ok: false, deferred: true, message: "Команда отложена до подключения отдельного серверного владельца." };
    }
    if (type !== "create-work-order") return { ok: false, message: "Неизвестная команда Specifications 2.0." };

    const { selected, revisionState, capability } = getContext();
    const revision = record(revisionState.item);
    const entryId = text(payload.entryId);
    const revisionId = text(payload.revisionId);
    const confirmRevisionId = text(payload.confirmRevisionId);
    const routeSourceDraftId = text(payload.routeSourceDraftId);
    const quantity = Number(payload.quantity);
    if (!capability.enabled || !capability.primaryPostgres) {
      return { ok: false, message: capability.error || "PostgreSQL-владелец заказ-наряда недоступен." };
    }
    if (!selected || text(selected.id) !== entryId || text(revision.id) !== revisionId || confirmRevisionId !== revisionId || !revisionMatchesSelection(selected, revision)) {
      return { ok: false, message: "Подтверждение относится к другой опубликованной ревизии." };
    }
    if (!routeIds(revision).has(routeSourceDraftId)) return { ok: false, message: "Маршрут больше не входит в опубликованную ревизию." };
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9_999_999) return { ok: false, message: "Количество должно быть целым положительным числом." };
    const idempotencyKey = text(createIdempotencyKey());
    if (!idempotencyKey) return { ok: false, message: "Не удалось подготовить идентификатор команды." };
    try {
      const result = record(await Promise.resolve(createWorkOrder({ entryId, revisionId, routeSourceDraftId, quantity, idempotencyKey })));
      if (!result.ok) return { ok: false, message: text(result.error) || "PostgreSQL не подтвердил заказ-наряд." };
      const item = record(result.item);
      const workOrder = record(result.workOrder);
      return { ok: true, id: text(item.id || workOrder.id), created: result.created === true };
    } catch (error: unknown) {
      return { ok: false, message: errorMessage(error, "PostgreSQL не подтвердил заказ-наряд.") };
    }
  };

  const refreshCapabilities = async ({ force = false }: { force?: boolean } = {}) => {
    const refreshed = publicationOwner.refreshCapability?.({ force }) || publicationOwner.getCapability?.() || {};
    return readPublicationCapability(await Promise.resolve(refreshed));
  };

  return { getContext, getPayload, refreshCapabilities, selectEntry, execute };
}
