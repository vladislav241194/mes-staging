function makeIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return `specifications2-publish:${globalThis.crypto.randomUUID()}`;
  return `specifications2-publish:${Date.now()}:${Math.random().toString(16).slice(2)}`;
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
} = {}) {
  let capabilities = null;

  async function getCapabilities() {
    if (capabilities) return capabilities;
    try {
      const response = await fetchImpl(capabilitiesUrl, { credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      capabilities = response.ok ? payload : {};
    } catch {
      capabilities = {};
    }
    return capabilities;
  }

  async function publishRevision({ entry, idempotencyKey = makeIdempotencyKey() } = {}) {
    if (!entry?.id) return { ok: false, item: null, error: "Не выбрана спецификация для публикации" };
    try {
      const currentCapabilities = await getCapabilities();
      if (!currentCapabilities?.revisionPublicationEnabled) {
        return { ok: false, disabled: true, item: null, error: "Серверная публикация пока не включена" };
      }
      const response = await fetchImpl(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ entry: withoutInlineAttachmentContent(entry), idempotencyKey }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409) return { ok: false, disabled: true, item: null, error: payload?.error || "Серверная публикация пока не включена" };
      if (!response.ok || !payload?.ok || !payload?.item) return { ok: false, item: null, error: payload?.error || `Серверная публикация вернула ${response.status}` };
      return { ok: true, created: Boolean(payload.created), item: payload.item };
    } catch (error) {
      return { ok: false, item: null, error: error?.message || "Серверная публикация временно недоступна" };
    }
  }
  return { publishRevision };
}
