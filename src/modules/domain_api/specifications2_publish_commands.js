function makeIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return `specifications2-publish:${globalThis.crypto.randomUUID()}`;
  return `specifications2-publish:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function expectedPreviousRevisionFor(entry = {}, value) {
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }
  // The renderer sends a prepared candidate publication. Its visible
  // revision is one greater than the immutable server revision it was based
  // on. Keep this fallback for API callers that already pass that candidate.
  const candidateRevision = Number(entry?.publication?.revision || 1);
  return Number.isInteger(candidateRevision) && candidateRevision >= 1 ? candidateRevision - 1 : null;
}

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

export function createSpecifications2PublishCommands({
  fetchImpl = globalThis.fetch,
  url = "/api/v1/specifications2/revisions",
  capabilitiesUrl = "/api/v1/specifications2/capabilities",
  serverPrimaryPolicy = globalThis.MES_APP_CONFIG?.MES_SPECIFICATIONS2_SERVER_PUBLICATION_PRIMARY === true,
} = {}) {
  let capabilities = null;

  async function refreshCapability({ force = false } = {}) {
    if (capabilities && !force) return { ok: true, ...capabilities };
    try {
      const response = await fetchImpl(capabilitiesUrl, { credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || `Specifications 2.0 capability API returned ${response.status}`);
      capabilities = {
        enabled: payload?.capabilities?.revisionPublicationEnabled === true || payload?.revisionPublicationEnabled === true,
        // The boot-time policy is deliberately at least as strict as this
        // response. A temporary database outage must not trigger a browser-
        // only fallback during a server-primary rollout.
        serverPrimary: serverPrimaryPolicy === true
          || payload?.capabilities?.revisionPublicationServerPrimary === true
          || payload?.revisionPublicationServerPrimary === true,
        policyPrimary: serverPrimaryPolicy === true,
        error: "",
      };
      return { ok: true, ...capabilities };
    } catch (error) {
      // Never cache a transport error as a non-primary capability: a later
      // refresh may recover, but this attempt must still fail closed.
      const fallback = {
        enabled: false,
        serverPrimary: serverPrimaryPolicy === true || capabilities?.serverPrimary === true,
        policyPrimary: serverPrimaryPolicy === true,
        error: error?.message || "Specifications 2.0 capability API is unavailable",
      };
      return { ok: false, ...fallback };
    }
  }

  async function publishRevision({ entry, expectedPreviousRevision, idempotencyKey = makeIdempotencyKey() } = {}) {
    if (!entry?.id) return { ok: false, item: null, error: "Не выбрана спецификация для публикации" };
    const expectedRevision = expectedPreviousRevisionFor(entry, expectedPreviousRevision);
    if (expectedRevision === null) {
      return { ok: false, item: null, error: "Не определена предыдущая ревизия спецификации" };
    }
    try {
      const capability = await refreshCapability();
      if (!capability.ok || !capability.enabled) {
        return {
          ok: false,
          disabled: true,
          serverPrimary: capability.serverPrimary === true,
          item: null,
          error: capability.error || "Серверная публикация пока не включена",
        };
      }
      const response = await fetchImpl(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ entry: withoutInlineAttachmentContent(entry), expectedPreviousRevision: expectedRevision, idempotencyKey }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409) {
        if (payload?.conflict === true) return {
          ok: false,
          conflict: true,
          currentRevision: Number(payload?.currentRevision || 0),
          item: null,
          error: payload?.error || "Серверная ревизия изменилась; обновите спецификацию перед публикацией",
        };
        return {
          ok: false,
          disabled: true,
          serverPrimary: capability.serverPrimary === true,
          item: null,
          error: payload?.error || "Серверная публикация пока не включена",
        };
      }
      if (!response.ok || !payload?.ok || !payload?.item) return { ok: false, item: null, error: payload?.error || `Серверная публикация вернула ${response.status}` };
      return {
        ok: true,
        created: Boolean(payload.created),
        item: payload.item,
        publication: payload?.publication || null,
        snapshotSync: payload?.snapshotSync || null,
      };
    } catch (error) {
      return { ok: false, item: null, error: error?.message || "Серверная публикация временно недоступна" };
    }
  }
  return { refreshCapability, getCapability: () => ({ ...(capabilities || { enabled: false, serverPrimary: false, error: "" }) }), publishRevision };
}
