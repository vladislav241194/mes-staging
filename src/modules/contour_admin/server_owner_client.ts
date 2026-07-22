type UnknownRecord = Record<string, unknown>;

interface ContourAdminServerActionOptions {
  confirmed?: boolean;
  fetchImpl?: typeof globalThis.fetch;
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

export async function executeContourAdminServerAction(
  actionId: unknown = "",
  { confirmed = false, fetchImpl = globalThis.fetch }: ContourAdminServerActionOptions = {},
) {
  const normalizedActionId = String(actionId || "").trim();
  if (!normalizedActionId || typeof fetchImpl !== "function") {
    return { ok: false, error: "Защищённый Ops API недоступен." };
  }

  try {
    const response = await fetchImpl("/api/contour-admin/action", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: normalizedActionId, confirm: confirmed ? normalizedActionId : "" }),
    });
    const payload = asRecord(await response.json().catch(() => ({ ok: false, error: "Не удалось прочитать ответ сервера" })));
    return response.ok && payload?.ok === true
      ? payload
      : { ...payload, ok: false, error: String(payload?.error || `Ops API ответил ${response.status}`) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Сетевая ошибка Ops API" };
  }
}
