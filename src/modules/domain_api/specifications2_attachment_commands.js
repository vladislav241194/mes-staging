function makeAttachmentIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return `specifications2-attachment:${globalThis.crypto.randomUUID()}`;
  return `specifications2-attachment:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function base64FromDataUrl(value) {
  const match = String(value || "").match(/^data:[^;]+;base64,([A-Za-z0-9+/]*={0,2})$/);
  return match?.[1] || "";
}

export function createSpecifications2AttachmentCommands({
  fetchImpl = globalThis.fetch,
  url = "/api/v1/specifications2/attachments",
  capabilitiesUrl = "/api/v1/specifications2/capabilities",
} = {}) {
  let capabilities = null;
  async function getCapabilities() {
    if (capabilities) return capabilities;
    try {
      const response = await fetchImpl(capabilitiesUrl, { credentials: "same-origin" });
      capabilities = response.ok ? await response.json().catch(() => ({})) : {};
    } catch { capabilities = {}; }
    return capabilities;
  }
  async function upload({ fileName, mediaType, inlineDataUrl, idempotencyKey = makeAttachmentIdempotencyKey() } = {}) {
    const currentCapabilities = await getCapabilities();
    if (!currentCapabilities?.attachmentUploadEnabled) return { ok: false, disabled: true, item: null, error: "Серверное хранилище файлов пока не включено" };
    const contentBase64 = base64FromDataUrl(inlineDataUrl);
    if (!contentBase64) return { ok: false, item: null, error: "Не удалось подготовить содержимое файла для серверного хранилища" };
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ fileName, mediaType, contentBase64 }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409) return { ok: false, disabled: true, item: null, error: payload?.error || "Серверное хранилище файлов пока не включено" };
      if (!response.ok || !payload?.ok || !payload?.item) return { ok: false, item: null, error: payload?.error || `Серверное хранилище вернуло ${response.status}` };
      return { ok: true, created: Boolean(payload.created), item: payload.item };
    } catch (error) { return { ok: false, item: null, error: error?.message || "Серверное хранилище файлов временно недоступно" }; }
  }
  async function download({ id = "" } = {}) {
    const attachmentId = String(id || "").trim();
    if (!attachmentId) return { ok: false, blob: null, error: "Не указан идентификатор серверного файла" };
    const currentCapabilities = await getCapabilities();
    if (!currentCapabilities?.attachmentUploadEnabled) return { ok: false, disabled: true, blob: null, error: "Серверное хранилище файлов пока не включено" };
    try {
      const response = await fetchImpl(`${url}/${encodeURIComponent(attachmentId)}`, { credentials: "same-origin" });
      if (response.status === 409) {
        const payload = await response.json().catch(() => ({}));
        return { ok: false, disabled: true, blob: null, error: payload?.error || "Серверное хранилище файлов пока не включено" };
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        return { ok: false, blob: null, error: payload?.error || `Серверное хранилище вернуло ${response.status}` };
      }
      return { ok: true, blob: await response.blob() };
    } catch (error) { return { ok: false, blob: null, error: error?.message || "Серверное хранилище файлов временно недоступно" }; }
  }
  return { upload, download };
}
