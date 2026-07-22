type UnknownRecord = Record<string, unknown>;
type FetchLike = typeof globalThis.fetch;

export interface Specifications2PublishEntry extends UnknownRecord {
  id?: unknown;
  publication?: unknown;
  routeDrafts?: unknown;
}

export interface Specifications2PublishRevisionInput {
  entry?: Specifications2PublishEntry;
  expectedPreviousRevision?: unknown;
  idempotencyKey?: string;
}

export interface Specifications2PublishCommandsClient {
  refreshCapability(options?: { force?: boolean }): Promise<UnknownRecord>;
  getCapability(): UnknownRecord;
  publishRevision(input?: Specifications2PublishRevisionInput): Promise<UnknownRecord>;
}

export interface Specifications2PublishCommandsOptions {
  fetchImpl?: FetchLike;
  url?: string;
  capabilitiesUrl?: string;
  serverPrimaryPolicy?: boolean;
}

interface PublicationCapability {
  enabled: boolean;
  serverPrimary: boolean;
  policyPrimary: boolean;
  error: string;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function errorMessage(error: unknown, fallback: string): string {
  return String(record(error).message || fallback);
}

function defaultServerPrimaryPolicy(): boolean {
  const runtime = globalThis as typeof globalThis & { MES_APP_CONFIG?: unknown };
  return record(runtime.MES_APP_CONFIG).MES_SPECIFICATIONS2_SERVER_PUBLICATION_PRIMARY === true;
}

function makeIdempotencyKey(): string {
  if (globalThis.crypto?.randomUUID) return `specifications2-publish:${globalThis.crypto.randomUUID()}`;
  return `specifications2-publish:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function expectedPreviousRevisionFor(entry: Specifications2PublishEntry = {}, value?: unknown): number | null {
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }
  // The renderer sends a prepared candidate publication. Its visible
  // revision is one greater than the immutable server revision it was based
  // on. Keep this fallback for API callers that already pass that candidate.
  const candidateRevision = Number(record(entry.publication).revision || 1);
  return Number.isInteger(candidateRevision) && candidateRevision >= 1 ? candidateRevision - 1 : null;
}

function withoutInlineAttachmentContent(entry: Specifications2PublishEntry = {}): Specifications2PublishEntry {
  return {
    ...entry,
    routeDrafts: list(entry.routeDrafts).map((rawDraft) => {
      const draft = record(rawDraft);
      return {
        ...draft,
        operations: list(draft.operations).map((rawOperation) => {
          const operation = record(rawOperation);
          return {
            ...operation,
            productionFiles: Object.fromEntries(Object.entries(record(operation.productionFiles)).map(([kind, raw]) => {
              if (!raw || typeof raw !== "object") return [kind, raw];
              const { inlineDataUrl: _inlineDataUrl, dataUrl: _dataUrl, content: _content, ...metadata } = raw as UnknownRecord;
              return [kind, metadata];
            })),
          };
        }),
      };
    }),
  };
}

export function createSpecifications2PublishCommands({
  fetchImpl = globalThis.fetch,
  url = "/api/v1/specifications2/revisions",
  capabilitiesUrl = "/api/v1/specifications2/capabilities",
  serverPrimaryPolicy = defaultServerPrimaryPolicy(),
}: Specifications2PublishCommandsOptions = {}): Specifications2PublishCommandsClient {
  let capabilities: PublicationCapability | null = null;

  async function refreshCapability({ force = false }: { force?: boolean } = {}): Promise<UnknownRecord> {
    if (capabilities && !force) return { ok: true, ...capabilities };
    try {
      const response = await fetchImpl(capabilitiesUrl, { credentials: "same-origin" });
      const payload = record(await response.json().catch(() => ({})));
      if (!response.ok) throw new Error(String(payload.error || `Specifications 2.0 capability API returned ${response.status}`));
      const serverCapabilities = record(payload.capabilities);
      capabilities = {
        enabled: serverCapabilities.revisionPublicationEnabled === true || payload.revisionPublicationEnabled === true,
        // The boot-time policy is deliberately at least as strict as this
        // response. A temporary database outage must not trigger a browser-
        // only fallback during a server-primary rollout.
        serverPrimary: serverPrimaryPolicy === true
          || serverCapabilities.revisionPublicationServerPrimary === true
          || payload.revisionPublicationServerPrimary === true,
        policyPrimary: serverPrimaryPolicy === true,
        error: "",
      };
      return { ok: true, ...capabilities };
    } catch (error: unknown) {
      // Never cache a transport error as a non-primary capability: a later
      // refresh may recover, but this attempt must still fail closed.
      const fallback: PublicationCapability = {
        enabled: false,
        serverPrimary: serverPrimaryPolicy === true || capabilities?.serverPrimary === true,
        policyPrimary: serverPrimaryPolicy === true,
        error: errorMessage(error, "Specifications 2.0 capability API is unavailable"),
      };
      return { ok: false, ...fallback };
    }
  }

  async function publishRevision({
    entry = {},
    expectedPreviousRevision,
    idempotencyKey = makeIdempotencyKey(),
  }: Specifications2PublishRevisionInput = {}): Promise<UnknownRecord> {
    if (!entry.id) return { ok: false, item: null, error: "Не выбрана спецификация для публикации" };
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
      const payload = record(await response.json().catch(() => ({})));
      if (response.status === 409) {
        if (payload.conflict === true) return {
          ok: false,
          conflict: true,
          currentRevision: Number(payload.currentRevision || 0),
          item: null,
          error: payload.error || "Серверная ревизия изменилась; обновите спецификацию перед публикацией",
        };
        return {
          ok: false,
          disabled: true,
          serverPrimary: capability.serverPrimary === true,
          item: null,
          error: payload.error || "Серверная публикация пока не включена",
        };
      }
      if (!response.ok || !payload.ok || !payload.item) return { ok: false, item: null, error: payload.error || `Серверная публикация вернула ${response.status}` };
      return {
        ok: true,
        created: Boolean(payload.created),
        item: payload.item,
        publication: payload.publication || null,
        snapshotSync: payload.snapshotSync || null,
      };
    } catch (error: unknown) {
      return { ok: false, item: null, error: errorMessage(error, "Серверная публикация временно недоступна") };
    }
  }

  return {
    refreshCapability,
    getCapability: () => ({ ...(capabilities || { enabled: false, serverPrimary: false, error: "" }) }),
    publishRevision,
  };
}
