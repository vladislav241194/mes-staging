interface OperationDto {
  id?: unknown;
  name?: unknown;
  code?: unknown;
  workCenterId?: unknown;
  workCenterLabel?: unknown;
  unitsPerHour?: unknown;
  status?: unknown;
}

export interface OperationReadItem {
  id: string;
  name: string;
  code: string;
  workCenterId: string;
  workCenterLabel: string;
  unitsPerHour: number;
  statusLabel: string;
  statusTone: "success" | "neutral";
}

export interface OperationWorkCenter {
  id: string;
  label: string;
  code: string;
}

export interface OperationsModel {
  items: OperationReadItem[];
  workCenters: OperationWorkCenter[];
  canCreateEdit: boolean;
  canDelete: boolean;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

export function adaptOperations(payload: unknown): OperationReadItem[] {
  const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const rows = Array.isArray(payload) ? payload : root.operations;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((entry): OperationReadItem[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const dto = entry as OperationDto;
    const id = text(dto.id);
    const name = text(dto.name);
    if (!id || !name) return [];
    const rate = Number(dto.unitsPerHour);
    const statusLabel = text(dto.status) || "Активен";
    return [{
      id,
      name,
      code: text(dto.code) || "—",
      workCenterId: text(dto.workCenterId),
      workCenterLabel: text(dto.workCenterLabel) || text(dto.workCenterId) || "—",
      unitsPerHour: Number.isFinite(rate) && rate >= 0 ? rate : 0,
      statusLabel,
      statusTone: statusLabel.toLocaleLowerCase("ru-RU").includes("актив") ? "success" : "neutral",
    }];
  });
}

export function adaptOperationsModel(payload: unknown): OperationsModel {
  const root = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const capabilities = root.capabilities && typeof root.capabilities === "object"
    ? root.capabilities as Record<string, unknown>
    : {};
  const workCenters = Array.isArray(root.workCenters) ? root.workCenters : [];
  return {
    items: adaptOperations(payload),
    workCenters: workCenters.flatMap((entry): OperationWorkCenter[] => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const center = entry as Record<string, unknown>;
      const id = text(center.id);
      const label = text(center.label);
      return id && label ? [{ id, label, code: text(center.code) }] : [];
    }),
    canCreateEdit: capabilities.createEdit === true,
    canDelete: capabilities.delete === true,
  };
}
