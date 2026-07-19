interface StatusDto {
  id?: unknown; group?: unknown; originModule?: unknown; changeModule?: unknown;
  usedIn?: unknown; contractView?: unknown; transitionView?: unknown;
  nextDocumentView?: unknown; registryKind?: unknown; name?: unknown;
  audit?: unknown; type?: unknown; code?: unknown; annotation?: unknown;
  impactView?: unknown;
  registryKindValue?: unknown; statusAuthority?: unknown;
}

export interface StatusReadItem {
  id: string; group: string; originModule: string; changeModule: string;
  usedIn: string; contractView: string; transitionView: string;
  nextDocumentView: string; registryKind: string; name: string;
  audit: string; type: string; code: string; annotation: string;
  impactView: string; impactTableView: string;
  registryKindValue: string; isUserManaged: boolean;
}

export interface StatusesModel { items: StatusReadItem[]; canCreateEditCustom: boolean; canDeleteCustom: boolean }

function text(value: unknown, fallback = "—") { return String(value ?? "").trim() || fallback; }

export function adaptStatuses(payload: unknown): StatusReadItem[] {
  const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const rows = Array.isArray(payload) ? payload : root.statuses;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((entry): StatusReadItem[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const dto = entry as StatusDto;
    const id = text(dto.id, "");
    const name = text(dto.name, "");
    if (!id || !name) return [];
    const impactView = text(dto.impactView);
    return [{
      id, name,
      group: text(dto.group), originModule: text(dto.originModule), changeModule: text(dto.changeModule),
      usedIn: text(dto.usedIn), contractView: text(dto.contractView), transitionView: text(dto.transitionView),
      nextDocumentView: text(dto.nextDocumentView), registryKind: text(dto.registryKind), audit: text(dto.audit),
      type: text(dto.type), code: text(dto.code), annotation: text(dto.annotation), impactView,
      registryKindValue: text(dto.registryKindValue, "status"),
      isUserManaged: text(dto.statusAuthority, "") === "user" && id.startsWith("custom-status-"),
      impactTableView: impactView
        .replace(/(Роль|Где применяется|Что меняет|Что блокирует|Удаление\/перенос): /g, "$1 ")
        .replace(/\s*\|\s*/g, " "),
    }];
  });
}

export function adaptStatusesModel(payload: unknown): StatusesModel {
  const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const capabilities = root.capabilities && typeof root.capabilities === "object" ? root.capabilities as Record<string, unknown> : {};
  return {
    items: adaptStatuses(payload),
    canCreateEditCustom: capabilities.createEditCustom === true,
    canDeleteCustom: capabilities.deleteCustom === true,
  };
}
