export const SHIFT_EXECUTION_OUTBOX_STORAGE_KEY = "mes-shift-execution-command-outbox-v1";

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function getStorage(storage) {
  return storage && typeof storage.getItem === "function" && typeof storage.setItem === "function" ? storage : null;
}

function normalizeWrite(write = {}) {
  const source = asRecord(write);
  const type = String(source.type || "").trim();
  const payload = asRecord(source.payload);
  const idempotencyKey = String(payload.idempotencyKey || "").trim();
  if (!type || !idempotencyKey) return null;
  return {
    type,
    assignmentId: String(source.assignmentId || "").trim(),
    payload,
    key: `${type}:${idempotencyKey}`,
  };
}

export function createShiftExecutionOutbox({
  storage = globalThis.localStorage,
  storageKey = SHIFT_EXECUTION_OUTBOX_STORAGE_KEY,
  now = () => new Date().toISOString(),
  maxEntries = 50,
} = {}) {
  const usableStorage = getStorage(storage);
  const read = () => {
    if (!usableStorage) return [];
    try {
      const parsed = JSON.parse(usableStorage.getItem(storageKey) || "[]");
      return Array.isArray(parsed) ? parsed.filter((entry) => normalizeWrite(entry?.write)) : [];
    } catch {
      return [];
    }
  };
  const write = (entries = []) => {
    if (!usableStorage) return false;
    try {
      usableStorage.setItem(storageKey, JSON.stringify(entries.slice(-Math.max(1, maxEntries))));
      return true;
    } catch {
      return false;
    }
  };
  return {
    getPending() { return read(); },
    enqueue(rawWrite, error = "") {
      const normalized = normalizeWrite(rawWrite);
      if (!normalized) return null;
      const entries = read();
      const previous = entries.find((entry) => entry.key === normalized.key);
      const entry = {
        key: normalized.key,
        write: { type: normalized.type, assignmentId: normalized.assignmentId, payload: normalized.payload },
        createdAt: previous?.createdAt || now(),
        updatedAt: now(),
        attempts: Number(previous?.attempts || 0) + 1,
        lastError: String(error || "").slice(0, 240),
      };
      write([...entries.filter((item) => item.key !== entry.key), entry]);
      return entry;
    },
    remove(key = "") {
      const entries = read();
      const next = entries.filter((entry) => entry.key !== key);
      if (next.length === entries.length) return false;
      write(next);
      return true;
    },
    async flush(execute) {
      if (typeof execute !== "function") return { attempted: 0, delivered: 0, conflicts: 0, pending: read().length };
      let attempted = 0;
      let delivered = 0;
      let conflicts = 0;
      for (const entry of read()) {
        attempted += 1;
        try {
          const result = await execute(entry.write);
          if (result?.conflict === true) {
            if (this.remove(entry.key)) conflicts += 1;
            continue;
          }
          if (!result?.ok) throw new Error(result?.error || "Shift execution command was not accepted");
          if (this.remove(entry.key)) delivered += 1;
        } catch (error) {
          this.enqueue(entry.write, error?.message || "Shift execution command delivery failed");
        }
      }
      return { attempted, delivered, conflicts, pending: read().length };
    },
  };
}
