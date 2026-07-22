import { createSpecifications2PublishCommands } from "../domain_api/specifications2_publish_commands.js";

export const SPECIFICATIONS2_PRODUCTION_DEFERRED_COMMANDS = Object.freeze([
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

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeStore(value) {
  const source = record(value);
  const registry = list(source.registry).filter((entry) => text(entry?.id));
  const requestedId = text(source.selectedId);
  const selectedId = registry.some((entry) => text(entry.id) === requestedId)
    ? requestedId
    : text(registry[0]?.id);
  return { ...source, selectedId, registry };
}

function readCapability(value) {
  const capability = record(value);
  return {
    enabled: capability.enabled === true,
    primaryPostgres: capability.primaryPostgres === true,
    error: text(capability.error),
  };
}

function readPublicationCapability(value) {
  const capability = record(value);
  return {
    enabled: capability.enabled === true,
    serverPrimary: capability.serverPrimary === true,
    error: text(capability.error),
  };
}

function routeIds(revision) {
  return new Set(list(revision?.routes).map((route) => text(route?.sourceDraftId)).filter(Boolean));
}

function revisionMatchesSelection(selected, revision) {
  const publication = record(selected?.publication);
  const publicationRevision = Number(publication.revision);
  const serverFingerprint = text(revision?.fingerprint);
  const publicationFingerprint = text(publication.fingerprint);
  return text(revision?.sourceEntryId) === text(selected?.id)
    && Number.isSafeInteger(publicationRevision)
    && publicationRevision > 0
    && Number(revision?.revisionNo) === publicationRevision
    && Boolean(publicationFingerprint)
    && (serverFingerprint === publicationFingerprint || /^sha256:[a-f0-9]{64}$/i.test(serverFingerprint));
}

export function createSpecifications2ProductionOwner({
  getStore = () => ({ registry: [], selectedId: "" }),
  writeStore = () => false,
  getPublishedRevisionState = () => ({ item: null, loading: null, error: "" }),
  hydratePublishedRevision = () => {},
  getCurrentFingerprint = () => "",
  getWorkOrderCapability = () => ({ enabled: false, primaryPostgres: false }),
  createWorkOrder = async () => ({ ok: false, error: "Specifications 2.0 work-order owner is unavailable" }),
  createIdempotencyKey = () => globalThis.crypto?.randomUUID?.() || `specifications2-work-order:${Date.now()}`,
  publishCommands = null,
  createPublicationIdempotencyKey = () => `specifications2-publish:${globalThis.crypto?.randomUUID?.() || `${Date.now()}:${Math.random().toString(16).slice(2)}`}`,
  now = () => new Date().toISOString(),
} = {}) {
  const publicationOwner = publishCommands || createSpecifications2PublishCommands();

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
    if (selected?.publication?.revision) hydratePublishedRevision(selected);
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

  const selectEntry = (entryId = "") => {
    const { store } = getContext();
    const id = text(entryId);
    if (!id || !store.registry.some((entry) => text(entry.id) === id)) {
      return { ok: false, message: "Спецификация больше не входит в реестр." };
    }
    if (id === store.selectedId) return { ok: true, id, changed: false };
    const written = writeStore({ ...store, selectedId: id });
    if (written === false) return { ok: false, message: "Не удалось сохранить выбор спецификации." };
    return { ok: true, id, changed: true };
  };

  const publishDraft = async (payload) => {
    const { selected, publicationCapability } = getContext();
    const entryId = text(payload.entryId);
    const expectedPreviousRevision = Number(payload.expectedPreviousRevision);
    if (!publicationCapability.enabled) return { ok: false, message: publicationCapability.error || "Серверная публикация пока не включена." };
    if (!selected || selected.id !== entryId || text(payload.confirmEntryId) !== entryId) return { ok: false, message: "Подтверждение относится к другой спецификации." };
    if (!Number.isInteger(expectedPreviousRevision) || expectedPreviousRevision < 0 || Number(selected.publication?.revision || 0) !== expectedPreviousRevision) {
      return { ok: false, message: "Ревизия черновика изменилась. Обновите экран." };
    }
    let result;
    try {
      result = await publicationOwner.publishRevision({ entry: selected, expectedPreviousRevision, idempotencyKey: createPublicationIdempotencyKey() });
    } catch (error) {
      return { ok: false, message: error?.message || "Серверная публикация временно недоступна." };
    }
    if (!result?.ok || !result?.item) {
      return { ok: false, conflict: result?.conflict === true, message: result?.error || "PostgreSQL не подтвердил публикацию." };
    }
    const revision = Number(result.publication?.revision || result.item.revisionNo || 0);
    if (!Number.isInteger(revision) || revision !== expectedPreviousRevision + 1) return { ok: false, message: "Сервер вернул неожиданный номер ревизии." };
    const latestStore = normalizeStore(getStore());
    const latest = latestStore.registry.find((entry) => text(entry.id) === entryId);
    if (!latest) return { ok: true, id: entryId, revision, recoveryPending: true };
    const publication = { ...record(result.publication), revision };
    const updated = { ...latest, publication, updatedAt: text(publication.releasedAt || publication.publishedAt || now()) };
    const written = writeStore({ ...latestStore, selectedId: entryId, registry: latestStore.registry.map((entry) => text(entry.id) === entryId ? updated : entry) });
    if (written === false) return { ok: true, id: entryId, revision, recoveryPending: true };
    hydratePublishedRevision(updated);
    return { ok: true, id: entryId, revision, created: result.created === true, recoveryPending: Number(result.snapshotSync?.applied || 0) < 1 };
  };

  const execute = async (command = {}) => {
    const type = text(command.type);
    const payload = record(command.payload);
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
      const result = await createWorkOrder({ entryId, revisionId, routeSourceDraftId, quantity, idempotencyKey });
      if (!result?.ok) return { ok: false, message: result?.error || "PostgreSQL не подтвердил заказ-наряд." };
      return { ok: true, id: text(result.item?.id || result.workOrder?.id), created: result.created === true };
    } catch (error) {
      return { ok: false, message: error?.message || "PostgreSQL не подтвердил заказ-наряд." };
    }
  };

  const refreshCapabilities = async ({ force = false } = {}) => readPublicationCapability(
    await Promise.resolve(publicationOwner.refreshCapability?.({ force }) || publicationOwner.getCapability?.() || {}),
  );

  return { getContext, getPayload, refreshCapabilities, selectEntry, execute };
}
