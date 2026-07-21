interface NomenclatureTypeDto {
  [key: string]: unknown;
  id?: unknown;
  name?: unknown;
  code?: unknown;
  description?: unknown;
  status?: unknown;
}

export interface NomenclatureTypeReadItem {
  id: string;
  name: string;
  code: string;
  description: string;
  statusLabel: string;
  statusTone: "success" | "neutral";
  baseline: Record<string, unknown>;
}

export interface NomenclatureTypeDeleteUsage {
  nomenclatureCount: number;
  specificationRowsCount: number;
  fallbackType: string;
  fallbackTypeId: string;
  expectedRow: Record<string, unknown> | null;
  fallbackExpectedRow: Record<string, unknown> | null;
  impactFingerprint: string;
  serverContractReady: boolean;
}

export interface NomenclatureTypesModel {
  items: NomenclatureTypeReadItem[];
  canCreateEdit: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  serverCommandsEnabled: boolean;
  directoryRevision: number | null;
  deleteUsageById: Record<string, NomenclatureTypeDeleteUsage>;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isExactJsonValue(value: unknown, active = new Set<object>(), depth = 0): boolean {
  if (depth > 64) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || active.has(value)) return false;
  if (Object.getOwnPropertySymbols(value).length) return false;
  active.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) return false;
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)
          || !isExactJsonValue(value[index], active, depth + 1)) return false;
      }
      return true;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.values(value).every((entry) => isExactJsonValue(entry, active, depth + 1));
  } catch {
    return false;
  } finally {
    active.delete(value);
  }
}

function freezeJsonValue<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach((entry) => freezeJsonValue(entry));
    Object.freeze(value);
  }
  return value;
}

function cloneImmutableJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!record(value) || !isExactJsonValue(value)) return null;
  try {
    const clone = JSON.parse(JSON.stringify(value)) as unknown;
    const clonedRecord = record(clone);
    return clonedRecord ? freezeJsonValue(clonedRecord) : null;
  } catch {
    return null;
  }
}

function revision(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((entry, index) => sameJsonValue(entry, right[index]));
  }
  const leftRecord = record(left);
  const rightRecord = record(right);
  if (!leftRecord || !rightRecord) return false;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameJsonValue(leftRecord[key], rightRecord[key]));
}

function lookupText(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU")
    : "";
}

function exactCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function deriveDeleteImpactCounts(root: Record<string, unknown>, typeName: string): {
  nomenclatureCount: number;
  specificationRowsCount: number;
} | null {
  if (!Array.isArray(root.nomenclature) || !Array.isArray(root.specifications)) return null;
  const typeKey = lookupText(typeName);
  if (!typeKey) return null;
  let nomenclatureCount = 0;
  for (const value of root.nomenclature) {
    const row = record(value);
    if (!row) return null;
    if (lookupText(row.type) === typeKey) nomenclatureCount += 1;
  }
  let specificationRowsCount = 0;
  for (const value of root.specifications) {
    const specification = record(value);
    if (!specification) return null;
    if (specification.structureItems !== undefined && !Array.isArray(specification.structureItems)) return null;
    for (const structureValue of specification.structureItems || []) {
      const structureRow = record(structureValue);
      if (!structureRow) return null;
      if (lookupText(structureRow.nomenclatureType) === typeKey) specificationRowsCount += 1;
    }
  }
  return { nomenclatureCount, specificationRowsCount };
}

export function adaptNomenclatureTypes(payload: unknown): NomenclatureTypeReadItem[] {
  const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const rows = Array.isArray(payload) ? payload : root.nomenclatureTypes;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((entry): NomenclatureTypeReadItem[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const dto = entry as NomenclatureTypeDto;
    const id = text(dto.id);
    const name = text(dto.name);
    const baseline = cloneImmutableJsonRecord(dto);
    if (!id || !name || !baseline) return [];
    const statusLabel = text(dto.status) || "Активен";
    return [{
      id,
      name,
      code: text(dto.code) || "—",
      description: text(dto.description) || "—",
      statusLabel,
      statusTone: statusLabel.toLocaleLowerCase("ru-RU").includes("актив") ? "success" : "neutral",
      baseline,
    }];
  });
}

export function adaptNomenclatureTypesModel(payload: unknown): NomenclatureTypesModel {
  const root = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const capabilities = root.capabilities && typeof root.capabilities === "object"
    ? root.capabilities as Record<string, unknown>
    : {};
  const items = adaptNomenclatureTypes(payload);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const itemByName = new Map(items.map((item) => [lookupText(item.name), item]));
  const usageRoot = root.deleteUsageById && typeof root.deleteUsageById === "object" && !Array.isArray(root.deleteUsageById) ? root.deleteUsageById as Record<string, unknown> : {};
  const deleteUsageById = Object.fromEntries(items.map((item) => {
    const entry = usageRoot[item.id] && typeof usageRoot[item.id] === "object" && !Array.isArray(usageRoot[item.id]) ? usageRoot[item.id] as Record<string, unknown> : {};
    const fallbackType = text(entry.fallbackType);
    const explicitFallbackId = text(entry.fallbackTypeId);
    const fallbackItem = itemById.get(explicitFallbackId)
      || itemByName.get(lookupText(fallbackType))
      || null;
    const fallbackTypeId = explicitFallbackId || fallbackItem?.id || "";
    const suppliedExpectedRow = cloneImmutableJsonRecord(entry.expectedRow);
    const suppliedFallbackRow = cloneImmutableJsonRecord(entry.fallbackExpectedRow);
    const expectedRow = suppliedExpectedRow && text(suppliedExpectedRow.id) === item.id
      ? suppliedExpectedRow
      : null;
    const fallbackExpectedRow = suppliedFallbackRow && text(suppliedFallbackRow.id) === fallbackTypeId
      ? suppliedFallbackRow
      : null;
    const derivedCounts = deriveDeleteImpactCounts(root, item.name);
    const declaredNomenclatureCount = exactCount(entry.nomenclatureCount);
    const declaredSpecificationRowsCount = exactCount(entry.specificationRowsCount);
    const impactFingerprint = text(entry.impactFingerprint);
    const serverContractReady = Boolean(
      text(entry.itemId) === item.id
      && expectedRow
      && sameJsonValue(expectedRow, item.baseline)
      && fallbackTypeId
      && fallbackTypeId !== item.id
      && fallbackItem
      && fallbackExpectedRow
      && sameJsonValue(fallbackExpectedRow, fallbackItem.baseline)
      && lookupText(fallbackExpectedRow.name) === lookupText(fallbackItem.name)
      && derivedCounts
      && declaredNomenclatureCount === derivedCounts.nomenclatureCount
      && declaredSpecificationRowsCount === derivedCounts.specificationRowsCount
      && /^sha256:[a-f0-9]{64}$/.test(impactFingerprint)
    );
    return [item.id, {
      nomenclatureCount: derivedCounts?.nomenclatureCount || 0,
      specificationRowsCount: derivedCounts?.specificationRowsCount || 0,
      fallbackType: fallbackItem?.name || "",
      fallbackTypeId,
      expectedRow: serverContractReady ? expectedRow : item.baseline,
      fallbackExpectedRow: serverContractReady ? fallbackExpectedRow : fallbackItem?.baseline || null,
      impactFingerprint,
      serverContractReady,
    }];
  }));
  const serverCommandsEnabled = capabilities.serverCommandsEnabled === true;
  const directoryRevision = revision(root.directoryRevision ?? root.revision);
  const serverRevisionReady = directoryRevision !== null;
  const legacyCreateEdit = capabilities.createEdit === true;
  const legacyDelete = capabilities.delete === true;
  const serverCreate = capabilities.canCreateNomenclatureTypes === true;
  const serverEdit = capabilities.canEditNomenclatureTypes === true;
  const serverDelete = capabilities.canDeleteNomenclatureTypes === true;
  const canCreate = serverCommandsEnabled ? serverRevisionReady && serverCreate : legacyCreateEdit;
  const canEdit = serverCommandsEnabled ? serverRevisionReady && serverEdit : legacyCreateEdit;
  return {
    items,
    canCreateEdit: canCreate || canEdit,
    canCreate,
    canEdit,
    canDelete: serverCommandsEnabled ? serverRevisionReady && serverDelete : legacyDelete,
    serverCommandsEnabled,
    directoryRevision,
    deleteUsageById,
  };
}
