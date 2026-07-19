function asErrorMessage(error, fallback) {
  return error?.message || fallback;
}

function acknowledgedPublication(preparedPublication = {}, serverResult = {}) {
  const serverPublication = serverResult?.publication && typeof serverResult.publication === "object"
    ? serverResult.publication
    : {};
  const revisionNo = Number(serverPublication.revision || serverResult?.item?.revisionNo || preparedPublication.revision || 0);
  if (!Number.isInteger(revisionNo) || revisionNo < 1) return null;
  return {
    ...preparedPublication,
    ...serverPublication,
    // PostgreSQL returns a digest for the relational revision. The browser
    // keeps its own canonical source fingerprint so it can still show an
    // edited-after-publication draft without treating transport metadata as
    // release content.
    fingerprint: preparedPublication.fingerprint || serverPublication.fingerprint || "",
    revision: revisionNo,
    releasedAt: serverPublication.releasedAt || serverResult?.item?.releasedAt || preparedPublication.releasedAt,
  };
}

// Server-first is deliberately coordinated outside the renderer. It gives
// PostgreSQL the first durable write, records only its acknowledgement in the
// editor, and leaves the transitional compatibility projection to the server
// outbox. When the capability is off or unavailable the existing local-only
// workflow stays available; once it is on, a failed server command never
// creates a misleading local "published" state.
export async function publishSpecifications2EntryWithServerFirst({
  entry,
  getServerPublicationCapability = async () => ({ ok: false, enabled: false }),
  preparePublication = null,
  commitPublication = null,
  publishServerRevision = null,
  publishLegacyEntry = null,
  readCurrentEntry = () => entry,
  getFingerprint = () => "",
  serverPrimaryPolicy = false,
} = {}) {
  const publishLegacy = () => {
    if (typeof publishLegacyEntry !== "function") {
      return { ok: false, mode: "legacy", error: "Локальная публикация недоступна" };
    }
    try {
      // Capability discovery is asynchronous.  Publish the latest editor
      // object if it changed while the request was in flight instead of
      // overwriting a just-saved draft with the stale click-time object.
      const currentEntry = readCurrentEntry(entry.id) || entry;
      const publication = publishLegacyEntry(currentEntry);
      return { ok: true, mode: "legacy", publication, publishedEntry: { ...currentEntry, publication } };
    } catch (error) {
      return { ok: false, mode: "legacy", error: asErrorMessage(error, "Не удалось подготовить производственную ревизию") };
    }
  };

  if (!entry?.id) return { ok: false, mode: "legacy", error: "Не выбрана спецификация для публикации" };

  let capability;
  try {
    // A deployment may flip the primary writer while this tab stays open.
    // Publication is rare and consequential, so it is worth one fresh probe.
    capability = await getServerPublicationCapability({ force: true });
  } catch {
    capability = {
      ok: false,
      enabled: false,
      serverPrimary: serverPrimaryPolicy === true,
      policyPrimary: serverPrimaryPolicy === true,
    };
  }
  const primaryConfigured = serverPrimaryPolicy === true
    || capability?.serverPrimary === true
    || capability?.policyPrimary === true;
  // Once the rollout is configured server-primary, an unavailable capability
  // endpoint or a temporary database fault must not produce a local-only
  // revision that looks authoritative to the editor.
  if (primaryConfigured && (!capability?.ok || capability.enabled !== true || capability.serverPrimary !== true)) {
    return {
      ok: false,
      mode: "server-first",
      error: capability?.error || "Серверная публикация включена, но её доступность не подтверждена",
    };
  }
  const canServerPublish = capability?.ok
    && capability.enabled === true
    && capability.serverPrimary === true
    && typeof preparePublication === "function"
    && typeof publishServerRevision === "function";
  if (!canServerPublish) {
    if (primaryConfigured) {
      return { ok: false, mode: "server-first", error: "Серверная публикация включена, но клиент команды не готов" };
    }
    return publishLegacy();
  }

  let prepared;
  try {
    prepared = preparePublication(entry);
  } catch (error) {
    return { ok: false, mode: "server-first", error: asErrorMessage(error, "Не удалось подготовить серверную ревизию") };
  }
  if (!prepared?.entry?.id || !prepared?.publication?.revision) {
    return { ok: false, mode: "server-first", error: "Серверная ревизия подготовлена некорректно" };
  }
  const expectedPreviousRevision = Number(entry?.publication?.revision || 0);
  if (!Number.isInteger(expectedPreviousRevision) || expectedPreviousRevision < 0) {
    return { ok: false, mode: "server-first", error: "Текущая ревизия спецификации указана некорректно" };
  }

  let serverResult;
  try {
    serverResult = await publishServerRevision(prepared.entry, { expectedPreviousRevision });
  } catch (error) {
    return { ok: false, mode: "server-first", error: asErrorMessage(error, "Серверная публикация временно недоступна") };
  }
  if (!serverResult?.ok) {
    // A 409 after the primary check means the rollout changed or the server
    // is unhealthy. It is still unsafe to create a local revision.
    if (serverResult?.disabled && !primaryConfigured) return publishLegacy();
    return { ok: false, mode: "server-first", conflict: serverResult?.conflict === true, currentRevision: Number(serverResult?.currentRevision || 0), error: serverResult?.error || "Серверная публикация не выполнена" };
  }
  const publication = acknowledgedPublication(prepared.publication, serverResult);
  if (!publication) {
    return { ok: false, mode: "server-first", error: "Сервер не вернул номер опубликованной ревизии" };
  }

  const currentEntry = readCurrentEntry(prepared.entry.id);
  if (!currentEntry) {
    return {
      ok: true,
      mode: "server-first",
      serverResult,
      publication,
      mirrored: false,
      recoveryPending: Number(serverResult?.snapshotSync?.applied || 0) < 1,
      error: "Серверная ревизия сохранена, но локальный черновик был удалён до создания совместимой проекции",
    };
  }

  const candidateFingerprint = String(publication.fingerprint || getFingerprint(prepared.entry));
  const draftChanged = Boolean(candidateFingerprint && String(getFingerprint(currentEntry)) !== candidateFingerprint);
  const publishedEntry = {
    ...currentEntry,
    publication,
    updatedAt: draftChanged ? currentEntry.updatedAt : (prepared.entry.updatedAt || currentEntry.updatedAt),
  };

  // PostgreSQL owns the compatibility projection during the server-primary
  // rollout. Writing directory/planning state in this browser after a 201
  // races the durable outbox worker and can overwrite a newer projection from
  // another tab. Keep only the editor acknowledgement locally; the server
  // readback/outbox remains the source for downstream legacy state.
  if (primaryConfigured) {
    return {
      ok: true,
      mode: "server-first",
      serverResult,
      publication,
      mirrored: false,
      serverProjection: true,
      recoveryPending: Number(serverResult?.snapshotSync?.applied || 0) < 1,
      draftChanged,
      publishedEntry,
    };
  }

  let mirroredPublication;
  try {
    mirroredPublication = commitPublication({ ...prepared.entry, publication }, publication);
  } catch (error) {
    return {
      ok: false,
      mode: "server-first",
      serverSaved: true,
      serverResult,
      publication,
      recoveryPending: true,
      error: asErrorMessage(error, "Серверная ревизия сохранена, но совместимая проекция не создана"),
    };
  }
  return {
    ok: true,
    mode: "server-first",
    serverResult,
    publication: mirroredPublication,
    mirrored: true,
    draftChanged,
    publishedEntry: {
      ...currentEntry,
      publication: mirroredPublication,
      updatedAt: draftChanged ? currentEntry.updatedAt : (prepared.entry.updatedAt || currentEntry.updatedAt),
    },
  };
}
